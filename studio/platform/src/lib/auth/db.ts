import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { consentStatement, type ConsentKind } from "../legal";

/**
 * Base des comptes : <REBORN_DATA_DIR ?? cwd/.data>/auth.db (node:sqlite).
 *
 * UNE SEULE connexion DatabaseSync par processus, partagée par Better Auth et par les tables
 * de REBORN (consents, auth_lockout) : deux connexions concurrentes sur le même fichier font
 * échouer des inscriptions (« database is locked », constaté dans l'essai réel).
 *
 * Piège de la connexion partagée : Better Auth ouvre de vraies transactions (inscription), avec
 * des attentes à l'intérieur (hachage du mot de passe). Une écriture SQL brute faite pendant ce
 * temps rejoindrait SA transaction et serait perdue en cas d'annulation. Les écritures de REBORN
 * passent donc par outsideTransaction(), qui attend qu'aucune transaction ne soit ouverte puis
 * écrit de façon synchrone (aucune autre tâche ne peut s'intercaler). Seule exception :
 * insertConsentRows() appelé DANS la transaction d'inscription, pour que compte et consentements
 * soient enregistrés ensemble ou pas du tout.
 *
 * Mode de journal par défaut (DELETE) : le WAL ferait échouer immédiatement une écriture du Studio
 * pendant qu'un autre processus (npm run account) écrit. busy_timeout couvre ces courtes attentes.
 */

export const authDataDir = () => process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data");
export const authDbFile = (dir = authDataDir()) => path.join(/* turbopackIgnore: true */ dir, "auth.db");

export function openAuthDb(dir: string): DatabaseSync {
  fs.mkdirSync(dir, { recursive: true });
  const file = authDbFile(dir);
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
  return db;
}

/** Tables propres à REBORN (créées après les migrations de Better Auth, idempotent). */
export function createRebornTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('terms_acceptance', 'privacy_acknowledgement', 'source_authorization', 'credentials_notice')),
      document TEXT NOT NULL,
      version TEXT NOT NULL,
      statement_sha256 TEXT NOT NULL,
      accepted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS consents_user_idx ON consents (user_id, accepted_at);
    CREATE INDEX IF NOT EXISTS consents_project_idx ON consents (project_id);
    CREATE TABLE IF NOT EXISTS auth_lockout (
      email_sha256 TEXT PRIMARY KEY,
      failures INTEGER NOT NULL,
      window_start INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );
  `);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exécute fn (synchrone) quand aucune transaction n'est ouverte sur la connexion partagée. */
export async function outsideTransaction<T>(db: DatabaseSync, fn: () => T, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (db.isTransaction) {
    if (Date.now() > deadline) throw new Error("Base des comptes occupée : réessayez dans un instant");
    await sleep(2);
  }
  return fn();
}

/* ------------------------------------------------------------------ */
/* Consentements                                                        */
/* ------------------------------------------------------------------ */

export interface ConsentRow {
  id: string;
  user_id: string;
  project_id: string | null;
  kind: ConsentKind;
  document: string;
  version: string;
  statement_sha256: string;
  accepted_at: string;
}

export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Lignes de consentement à la version courante des documents (texte exact haché). */
export function consentRows(userId: string, projectId: string | null, kinds: ConsentKind[], at = new Date()): ConsentRow[] {
  return kinds.map((kind) => {
    const s = consentStatement(kind);
    return { id: randomUUID(), user_id: userId, project_id: projectId, kind, document: s.document, version: s.version, statement_sha256: sha256Hex(s.text), accepted_at: at.toISOString() };
  });
}

/**
 * Insertion synchrone. Hors d'une transaction ouverte, les lignes sont écrites ensemble
 * (BEGIN … COMMIT sans attente intermédiaire) ; dans la transaction d'inscription, elles en font partie.
 */
export function insertConsentRows(db: DatabaseSync, rows: ConsentRow[]) {
  if (!rows.length) return;
  const stmt = db.prepare("INSERT INTO consents (id, user_id, project_id, kind, document, version, statement_sha256, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const own = !db.isTransaction;
  if (own) db.exec("BEGIN");
  try {
    for (const r of rows) stmt.run(r.id, r.user_id, r.project_id, r.kind, r.document, r.version, r.statement_sha256, r.accepted_at);
    if (own) db.exec("COMMIT");
  } catch (e) {
    if (own) db.exec("ROLLBACK");
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Verrouillage par compte : 8 échecs en 15 min → 15 min de blocage     */
/* ------------------------------------------------------------------ */

export const LOCKOUT = Object.freeze({ maxFailures: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });

/** L'adresse n'est pas stockée en clair (aucune donnée personnelle pour les adresses inconnues). */
export const lockoutKey = (email: unknown) => sha256Hex(String(email ?? "").trim().toLowerCase());

interface LockRow {
  failures: number;
  window_start: number;
  locked_until: number;
}

/** Fin du blocage (ms) si le compte est verrouillé, sinon null. Lecture seule, synchrone. */
export function lockedUntil(db: DatabaseSync, email: unknown, now = Date.now()): number | null {
  const row = db.prepare("SELECT locked_until FROM auth_lockout WHERE email_sha256 = ?").get(lockoutKey(email)) as { locked_until: number } | undefined;
  return row && row.locked_until > now ? row.locked_until : null;
}

/** Échec d'authentification (mot de passe ou adresse incorrects). À appeler via outsideTransaction. Vrai si le compte vient d'être verrouillé. */
export function recordLoginFailure(db: DatabaseSync, email: unknown, now = Date.now()): boolean {
  const key = lockoutKey(email);
  const row = db.prepare("SELECT failures, window_start, locked_until FROM auth_lockout WHERE email_sha256 = ?").get(key) as LockRow | undefined;
  const fresh = !row || now - row.window_start > LOCKOUT.windowMs;
  let failures = fresh ? 1 : row.failures + 1;
  let windowStart = fresh ? now : row.window_start;
  let locked = row?.locked_until ?? 0;
  const lockNow = failures >= LOCKOUT.maxFailures;
  if (lockNow) {
    locked = now + LOCKOUT.lockMs;
    failures = 0;
    windowStart = now;
  }
  db.prepare(
    `INSERT INTO auth_lockout (email_sha256, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(email_sha256) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until`,
  ).run(key, failures, windowStart, locked);
  // Ménage : compteurs et verrous périmés
  db.prepare("DELETE FROM auth_lockout WHERE locked_until < ? AND window_start < ?").run(now, now - LOCKOUT.windowMs);
  return lockNow;
}

/** Connexion réussie (ou mot de passe réinitialisé) : compteur remis à zéro. */
export function clearLoginFailures(db: DatabaseSync, email: unknown) {
  db.prepare("DELETE FROM auth_lockout WHERE email_sha256 = ?").run(lockoutKey(email));
}
