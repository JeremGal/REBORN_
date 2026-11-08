#!/usr/bin/env node
/**
 * Logiciel métier livré par REBORN — serveur autonome.
 *
 * Fonctionne seul : Node ≥ 22.13, aucune dépendance, aucune connexion à REBORN Studio ni au
 * logiciel historique. Tout ce qui est propre au métier est décrit dans app.json (entités,
 * champs, relations, règles, tableaux de bord) ; les données sont dans data/app.db (SQLite).
 *
 *   node server.mjs                     → http://127.0.0.1:5050
 *   PORT=5051 HOST=0.0.0.0 node server.mjs
 *   PUBLIC_URL=https://logiciel.exemple.fr node server.mjs   (adresse publique : liens d'invitation, cookie Secure)
 *   node server.mjs invite <e-mail> [admin|editor|viewer]   (accès de secours : lien écrit dans .secrets/lien-activation.txt)
 *
 * Sécurité : sessions HttpOnly/SameSite=Strict revalidées à chaque requête (rôle, compte désactivé,
 * mot de passe changé), mots de passe scrypt choisis par chaque personne (12 caractères minimum),
 * accès par invitation à usage unique (seule l'empreinte du jeton est conservée), rôles (admin,
 * editor, viewer), contrôle d'origine sur les écritures, journal d'audit, sauvegardes cohérentes.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { compile, evaluate } from "./lib/engine/expr.mjs";
import { evaluateBinding, outputFields } from "./lib/engine/bindings.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
const PORT = Number(process.env.PORT ?? SPEC.app.port ?? 5050);
const HOST = process.env.HOST ?? "127.0.0.1";
// Lancé par REBORN Studio derrière un tunnel https : toutes les connexions arrivent de 127.0.0.1. Avec TRUST_PROXY=1,
// l'adresse du visiteur est la DERNIÈRE de X-Forwarded-For (ajoutée par le tunnel ; une valeur envoyée par le
// visiteur reste devant et n'est pas lue). Sans TRUST_PROXY, ou pour une connexion qui ne vient pas de cette machine : adresse de la connexion.
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const DB_PATH = path.join(ROOT, "data", "app.db");
const FILES = path.join(ROOT, "files");
const BACKUPS = path.join(ROOT, "backups");
const PUBLIC = path.join(ROOT, "public");
/** Modèles métier versionnés déposés par REBORN Studio (ou par l'administrateur) : rules/v<N>.json. */
const RULES_DIR = path.join(ROOT, "rules");
/** Fichier de processus : permet d'arrêter ce logiciel sans dépendre du processus qui l'a lancé. */
const PID_FILE = path.join(ROOT, "run", "server.pid");
const ENTITIES = new Map(SPEC.entities.map((e) => [e.name, e]));
/**
 * Vues d'ensemble déclarées par la spécification (planning : une ligne par ressource, une colonne par jour).
 * Validées une fois au démarrage : les noms de champs viennent de la spécification et doivent désigner des
 * champs de l'entité, du bon type (dates, référence) ; une vue incohérente est ignorée (message au démarrage).
 */
const IDENT = /^[a-z][a-z0-9_]{0,59}$/;
const VIEWS = new Map();
for (const v of Array.isArray(SPEC.views) ? SPEC.views : []) {
  const e = ENTITIES.get(v?.entity);
  const f = (n) => (typeof n === "string" && IDENT.test(n) ? (e?.fields.find((x) => x.name === n) ?? null) : null);
  const r = f(v?.resource);
  const why =
    v?.kind !== "planning" ? "type de vue inconnu (planning attendu)"
    : !IDENT.test(String(v.name ?? "")) || VIEWS.has(v.name) ? "nom absent, invalide ou déjà utilisé"
    : !e ? `entité inconnue ${v.entity}`
    : f(v.start)?.type !== "date" || f(v.end)?.type !== "date" || v.start === v.end ? "start et end doivent désigner deux champs date"
    : r?.type !== "reference" || !ENTITIES.has(r.references) ? "resource doit désigner une référence"
    : v.title != null && !f(v.title) ? `champ titre inconnu ${v.title}`
    : v.status != null && !f(v.status) ? `champ statut inconnu ${v.status}`
    : null;
  if (why) console.error(`[app] vue ${v?.name ?? "?"} ignorée : ${why}`);
  else VIEWS.set(v.name, { entity: e.name, kind: "planning", name: v.name, label: String(v.label || e.label).slice(0, 80), start: v.start, end: v.end, resource: v.resource, title: v.title ?? null, status: v.status ?? null });
}
/** Vue dont `name` est l'entité des éléments (la première) : sert aux titres « ressource · du … au … ». */
const viewOf = (name) => [...VIEWS.values()].find((v) => v.entity === name) ?? null;
const ROLES = { admin: 3, editor: 2, viewer: 1 };
const ROLE_FR = { admin: "Administration", editor: "Saisie", viewer: "Lecture" };
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
/** Secrets locaux (jamais servis) : compte de secours de l'opérateur, invitations déposées, liens. */
const SECRETS = path.join(ROOT, ".secrets");
const INVITES_DIR = path.join(SECRETS, "invites");
/** Empreintes des invitations utilisées ou révoquées, hors de la base : une restauration ne les rouvre pas. */
const CLOSED_FILE = path.join(SECRETS, "invitations-closes.txt");
/** Lien créé par « node server.mjs invite » : écrit ici (0600), jamais affiché, supprimé à l'activation. */
const CLI_LINK = path.join(SECRETS, "lien-activation.txt");
/** Logo facultatif de l'entreprise (app.branding.logo ou app.logo = nom d'un fichier de ce dossier, ou image data:). */
const BRANDING_DIR = path.join(ROOT, "branding");
const PUBLIC_URL = /^https?:\/\/[^\s/?#]+/i.test(process.env.PUBLIC_URL ?? "") ? String(process.env.PUBLIC_URL).replace(/\/+$/, "") : "";
const PUBLIC_BASE = PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const SECURE_COOKIE = PUBLIC_BASE.startsWith("https://");
/**
 * Cookie de session propre à ce logiciel : les cookies ne distinguent pas les ports, deux logiciels
 * livrés sur la même machine ne doivent ni s'écraser ni se lire leurs sessions.
 */
const COOKIE = `app_${createHash("sha256").update(`${SPEC.app.id}|${PORT}`).digest("hex").slice(0, 10)}_sid`;
const COOKIE_RE = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{48})(?:;|$)`);
const SESSION_MS = 8 * 3600e3;
const PASSWORD_MIN = 12;
const INVITE_DEFAULT_HOURS = 72;
const INVITE_MAX_MS = 7 * 24 * 3600e3;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(FILES, { recursive: true });
fs.mkdirSync(BACKUPS, { recursive: true });

/* ------------------------------------------------------------------ */
/* Base de données                                                      */
/* ------------------------------------------------------------------ */
let db;
function openDb() {
  const fresh = !fs.existsSync(DB_PATH);
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
  if (fresh) for (const s of SPEC.ddl) db.exec(s);
  ensureSchema();
  bootstrapAdmin();
  importInvites();
  rulesStamp = null;
  syncRules();
}

/**
 * Évolution du schéma sans perte : colonnes système et champs ajoutés par la spécification ou
 * par un modèle métier sont ajoutés (ALTER TABLE … ADD COLUMN, valeurs vides pour l'historique).
 * Aucune colonne ni donnée existante n'est modifiée ou supprimée.
 */
const SQL_TYPE = { integer: "INTEGER", money: "INTEGER", reference: "INTEGER", boolean: "INTEGER", decimal: "REAL", percent: "REAL" };
function ensureSchema() {
  db.exec(`CREATE TABLE IF NOT EXISTS "_rules" ("version" INTEGER PRIMARY KEY, "sha256" TEXT NOT NULL, "source" TEXT, "published_at" TEXT, "published_by" TEXT, "imported_at" TEXT NOT NULL, "package" TEXT NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS "_meta" ("key" TEXT PRIMARY KEY, "value" TEXT)`);
  // Comptes : les bases existantes reçoivent les colonnes d'accès (e-mail, révocation des sessions)
  db.exec(`CREATE TABLE IF NOT EXISTS "_users" ("id" INTEGER PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "password_hash" TEXT NOT NULL, "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'editor', 'viewer')), "created_at" TEXT NOT NULL, "disabled" INTEGER NOT NULL DEFAULT 0)`);
  const userCols = new Set(db.prepare(`PRAGMA table_info("_users")`).all().map((c) => c.name));
  for (const [name, def] of [["email", "TEXT"], ["session_epoch", "INTEGER NOT NULL DEFAULT 0"], ["password_changed_at", "TEXT"], ["last_login_at", "TEXT"]]) if (!userCols.has(name)) db.exec(`ALTER TABLE "_users" ADD COLUMN ${q(name)} ${def}`);
  // Invitations : empreinte SHA-256 du jeton seulement, usage unique, expiration
  db.exec(`CREATE TABLE IF NOT EXISTS "_invites" ("id" INTEGER PRIMARY KEY, "token_sha256" TEXT NOT NULL UNIQUE, "email" TEXT NOT NULL, "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'editor', 'viewer')), "created_by" TEXT, "created_at" TEXT NOT NULL, "expires_at" TEXT NOT NULL, "consumed_at" TEXT, "revoked_at" TEXT, "source" TEXT)`);
  db.exec(`CREATE INDEX IF NOT EXISTS "_invites_email" ON "_invites" ("email")`);
  for (const e of SPEC.entities) {
    const cols = new Set(db.prepare(`PRAGMA table_info(${q(e.name)})`).all().map((c) => c.name));
    if (!cols.size) continue;
    const wanted = [...fieldsOf(e).map((f) => [f.name, SQL_TYPE[f.type] ?? "TEXT"]), ["_rules_version", "INTEGER"], ["_updated_at", "TEXT"]];
    for (const [name, type] of wanted) if (!cols.has(name)) db.exec(`ALTER TABLE ${q(e.name)} ADD COLUMN ${q(name)} ${type}`);
  }
}

function bootstrapAdmin() {
  const n = db.prepare(`SELECT COUNT(*) AS n FROM "_users"`).get().n;
  if (n) return;
  const secret = path.join(ROOT, ".secrets", "admin.json");
  if (!fs.existsSync(secret)) {
    console.error("[app] aucun utilisateur et .secrets/admin.json absent : créez un compte administrateur (voir README.md)");
    return;
  }
  const { username, password } = JSON.parse(fs.readFileSync(secret, "utf8"));
  db.prepare(`INSERT INTO "_users" ("username", "password_hash", "role", "created_at") VALUES (?, ?, 'admin', ?)`).run(username, hashPassword(password), now());
  audit("système", "user_created", null, null, null, { username, role: "admin" });
}

const now = () => new Date().toISOString();
function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split("$");
  if (!salt || !hash) return false;
  const a = scryptSync(String(pw), salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function audit(user, action, entity, id, before, after, justification = null) {
  db.prepare(`INSERT INTO "_audit" ("ts", "user", "action", "entity", "record_id", "before", "after", "justification") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(now(), user, action, entity, id, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, justification);
}
/** Empreinte de comparaison calculée même pour un identifiant inconnu (temps de réponse identique). */
let dummyHash = null;
const fakeHash = () => (dummyHash ??= hashPassword(randomBytes(18).toString("base64url")));
function passwordProblem(pw, ident) {
  if (pw.length < PASSWORD_MIN) return `Mot de passe trop court : ${PASSWORD_MIN} caractères minimum.`;
  if (pw.length > 200) return "Mot de passe trop long : 200 caractères maximum.";
  if (ident && pw.trim().toLowerCase() === String(ident).trim().toLowerCase()) return "Le mot de passe ne doit pas reprendre votre identifiant.";
  if (/^(.)\1+$/u.test(pw)) return "Le mot de passe ne doit pas répéter un seul caractère.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Accès par invitation (usage unique)                                  */
/* ------------------------------------------------------------------ */
// Une invitation ouvre l'accès d'une adresse e-mail avec un rôle ; la personne choisit SON mot de
// passe à l'activation. Seule l'empreinte SHA-256 du jeton est conservée ; le lien n'est montré
// qu'une fois, à qui invite. REBORN Studio (ou « node server.mjs invite ») dépose des fichiers
// { v:1, token_sha256, email, role, created_by, created_at, expires_at } dans .secrets/invites/ :
// ils sont importés au démarrage, avant une activation et avant l'affichage des invitations.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const normEmail = (v) => String(v ?? "").trim().toLowerCase();
const validEmail = (v) => v.length <= 254 && EMAIL_RE.test(v);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function secretDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {}
}
function closedHashes() {
  try {
    return new Set(fs.readFileSync(CLOSED_FILE, "utf8").split(/\r?\n/).filter((l) => /^[a-f0-9]{64}$/.test(l)));
  } catch {
    return new Set();
  }
}
function closeHashes(list) {
  if (!list.length) return;
  secretDir(SECRETS);
  fs.appendFileSync(CLOSED_FILE, list.map((h) => `${h}\n`).join(""), { mode: 0o600 });
}
/** Le lien de secours écrit par la ligne de commande disparaît dès qu'il ne sert plus. */
function forgetCliLink(sha) {
  try {
    const m = /#\/activation\/([A-Za-z0-9_-]{43})/.exec(fs.readFileSync(CLI_LINK, "utf8"));
    if (m && sha256(m[1]) === sha) fs.rmSync(CLI_LINK, { force: true });
  } catch {}
}
function inviteState(r, closed) {
  if (r.consumed_at) return "consumed";
  if (r.revoked_at || closed.has(r.token_sha256)) return "revoked";
  if (!(Date.parse(r.expires_at) > Date.now())) return "expired";
  return "pending";
}
function inviteView(r, closed = closedHashes()) {
  const account = db.prepare(`SELECT "id", "disabled" FROM "_users" WHERE "username" = ? OR "email" = ?`).get(r.email, r.email);
  return { id: r.id, email: r.email, role: r.role, created_by: r.created_by, created_at: r.created_at, expires_at: r.expires_at, consumed_at: r.consumed_at, revoked_at: r.revoked_at, source: r.source ?? null, state: inviteState(r, closed), existing_account: !!account };
}
/** La plus récente invitation ouverte d'une adresse remplace les autres (révoquées). Renvoie les empreintes closes. */
function supersede(email, keepId, createdAt) {
  const open = db.prepare(`SELECT "id", "token_sha256", "created_at" FROM "_invites" WHERE "email" = ? AND "id" != ? AND "consumed_at" IS NULL AND "revoked_at" IS NULL`).all(email, keepId);
  const t = now();
  const closed = [];
  const revoke = (id, sha) => {
    db.prepare(`UPDATE "_invites" SET "revoked_at" = ? WHERE "id" = ?`).run(t, id);
    closed.push(sha);
  };
  if (open.some((r) => r.created_at > createdAt)) revoke(keepId, db.prepare(`SELECT "token_sha256" FROM "_invites" WHERE "id" = ?`).get(keepId).token_sha256);
  for (const r of open.filter((x) => x.created_at <= createdAt)) revoke(r.id, r.token_sha256);
  return closed;
}
function inviteFileProblem(inv) {
  if (!inv || typeof inv !== "object" || inv.v !== 1) return "format inconnu (v:1 attendu)";
  if (!/^[a-f0-9]{64}$/.test(String(inv.token_sha256 ?? ""))) return "empreinte du jeton invalide";
  if (!Object.hasOwn(ROLES, String(inv.role))) return "rôle inconnu";
  if (!validEmail(normEmail(inv.email))) return "adresse e-mail invalide";
  const created = Date.parse(inv.created_at);
  const expires = Date.parse(inv.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires)) return "dates illisibles";
  if (created > Date.now() + 5 * 60e3) return "date de création dans le futur";
  if (expires <= Date.now()) return "invitation expirée";
  if (expires - created > INVITE_MAX_MS || expires - Date.now() > INVITE_MAX_MS) return "validité supérieure à 7 jours";
  return null;
}
/**
 * Importe les invitations déposées (fichiers *.json ; les *.tmp en cours d'écriture sont ignorés).
 * Un fichier reste en place tant que son invitation est ouverte : si la base est remplacée (remise
 * en service, retour arrière, restauration), l'invitation est réimportée. Il est supprimé dès qu'elle
 * est utilisée, révoquée ou remplacée (empreinte notée dans .secrets/invitations-closes.txt) ou expirée.
 */
function importInvites() {
  let names;
  try {
    names = fs.readdirSync(INVITES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  const closedBefore = closedHashes();
  const items = [];
  for (const name of names) {
    const file = path.join(INVITES_DIR, name);
    let inv = null;
    let why;
    try {
      inv = JSON.parse(fs.readFileSync(file, "utf8"));
      why = inviteFileProblem(inv);
    } catch {
      why = "fichier illisible";
    }
    if (why) {
      console.error(`[app] invitation ${name} ignorée : ${why}`);
      fs.rmSync(file, { force: true });
      continue;
    }
    if (closedBefore.has(inv.token_sha256)) {
      fs.rmSync(file, { force: true });
      continue;
    }
    items.push({ file, inv });
  }
  items.sort((a, b) => Date.parse(a.inv.created_at) - Date.parse(b.inv.created_at));
  let n = 0;
  for (const { file, inv } of items) {
    const email = normEmail(inv.email);
    const by = String(inv.created_by ?? "REBORN Studio").slice(0, 200) || "REBORN Studio";
    const created = new Date(Date.parse(inv.created_at)).toISOString();
    const expires = new Date(Date.parse(inv.expires_at)).toISOString();
    let closed = [];
    db.exec("BEGIN IMMEDIATE");
    try {
      const info = db.prepare(`INSERT OR IGNORE INTO "_invites" ("token_sha256", "email", "role", "created_by", "created_at", "expires_at", "source") VALUES (?, ?, ?, ?, ?, ?, ?)`).run(inv.token_sha256, email, inv.role, by, created, expires, String(inv.source ?? "studio").slice(0, 20));
      if (info.changes) {
        closed = supersede(email, Number(info.lastInsertRowid), created);
        audit(by, "invite_imported", null, null, null, { email, role: inv.role, expires_at: expires });
        n++;
      }
      db.exec("COMMIT");
    } catch (x) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      console.error(`[app] invitation non importée : ${x.message}`);
      continue;
    }
    closeHashes(closed);
    if (closed.includes(inv.token_sha256)) fs.rmSync(file, { force: true });
  }
  return n;
}
/** Invitation créée dans ce logiciel (administration) : le jeton n'est renvoyé qu'une fois. */
function createInvite({ email, role, hours, by, source }) {
  const token = randomBytes(32).toString("base64url");
  const created = now();
  const expires = new Date(Date.now() + hours * 3600e3).toISOString();
  let id;
  let closed = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    id = Number(db.prepare(`INSERT INTO "_invites" ("token_sha256", "email", "role", "created_by", "created_at", "expires_at", "source") VALUES (?, ?, ?, ?, ?, ?, ?)`).run(sha256(token), email, role, by, created, expires, source).lastInsertRowid);
    closed = supersede(email, id, created);
    audit(by, "invite_created", null, null, null, { email, role, expires_at: expires });
    db.exec("COMMIT");
  } catch (x) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw x;
  }
  closeHashes(closed);
  return { token, invitation: inviteView(db.prepare(`SELECT * FROM "_invites" WHERE "id" = ?`).get(id)) };
}
const userView = (u) => ({ id: u.id, username: u.username, email: u.email ?? (u.username.includes("@") ? u.username : null), role: u.role, created_at: u.created_at, disabled: u.disabled, last_login_at: u.last_login_at ?? null, password_changed_at: u.password_changed_at ?? null });

/** Accès de secours sans le Studio : « node server.mjs invite <e-mail> [rôle] ». Le lien n'est jamais affiché. */
function cliInvite(args) {
  const email = normEmail(args[0]);
  const role = String(args[1] ?? "admin");
  if (!validEmail(email) || !Object.hasOwn(ROLES, role)) {
    console.error("Usage : node server.mjs invite <adresse e-mail> [admin|editor|viewer]   (rôle par défaut : admin)");
    return 2;
  }
  const token = randomBytes(32).toString("base64url");
  const created = new Date();
  const expires = new Date(created.getTime() + INVITE_DEFAULT_HOURS * 3600e3);
  secretDir(SECRETS);
  secretDir(INVITES_DIR);
  const name = `commande-${created.toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}.json`;
  const tmp = path.join(INVITES_DIR, `${name}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, token_sha256: sha256(token), email, role, created_by: "Accès de secours (ligne de commande)", created_at: created.toISOString(), expires_at: expires.toISOString(), source: "commande" }), { mode: 0o600 });
  fs.renameSync(tmp, path.join(INVITES_DIR, name));
  fs.rmSync(CLI_LINK, { force: true });
  fs.writeFileSync(CLI_LINK, `# Lien d'activation à usage unique pour ${email} (rôle : ${ROLE_FR[role]}), valable jusqu'au ${expires.toISOString()}\n${PUBLIC_BASE}/#/activation/${token}\n`, { mode: 0o600 });
  console.log(`Invitation créée pour ${email} (rôle : ${ROLE_FR[role]}), valable ${INVITE_DEFAULT_HOURS} heures.`);
  console.log(`Le lien d'activation est dans ${path.relative(process.cwd(), CLI_LINK) || CLI_LINK} (lisible par vous seul) : transmettez-le à la personne par un canal sûr. Il ne sert qu'une fois et n'est pas affiché ici.`);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Modèle métier versionné (règles exécutées par le moteur REBORN)      */
/* ------------------------------------------------------------------ */
// Un paquet = { version, modules: { nom: modèle de règles }, bindings: [liaisons] } (voir
// lib/engine/bindings.mjs). Chaque version est immuable ; un document enregistre la version
// avec laquelle il a été calculé et la garde (les documents historiques ne sont jamais recalculés).
let rulesStamp = null;
const packages = new Map();
const derived = new Map();

function readRuleFiles() {
  try {
    return fs.readdirSync(RULES_DIR).filter((f) => /^v\d+\.json$/.test(f) || f === "active.json");
  } catch {
    return [];
  }
}
function checkPackage(pkg) {
  if (!pkg || typeof pkg !== "object") throw new Error("paquet de règles invalide");
  if (!Number.isInteger(pkg.version) || pkg.version < 1) throw new Error("version entière ≥ 1 attendue");
  if (!pkg.modules || typeof pkg.modules !== "object") throw new Error("modules attendus");
  if (!Array.isArray(pkg.bindings)) throw new Error("bindings attendu (liste)");
  for (const b of pkg.bindings) {
    const e = ENTITIES.get(b.entity);
    if (!e) throw new Error(`liaison ${b.id} : entité inconnue ${b.entity}`);
    if (!pkg.modules[b.module]) throw new Error(`liaison ${b.id} : module absent ${b.module}`);
    if (!["line", "document"].includes(b.scope)) throw new Error(`liaison ${b.id} : portée line ou document attendue`);
    const names = new Set([...e.fields.map((f) => f.name), ...(b.fields ?? []).map((f) => f.name)]);
    for (const f of b.fields ?? []) if (!/^[a-z][a-z0-9_]{0,59}$/.test(f.name) || !["money", "decimal", "percent", "integer", "text"].includes(f.type)) throw new Error(`liaison ${b.id} : champ ajouté invalide ${f.name}`);
    for (const f of Object.values(b.outputs ?? {})) if (!names.has(f)) throw new Error(`liaison ${b.id} : champ de sortie inconnu ${f}`);
    for (const m of [b.document, b.lines].filter(Boolean)) if (!ENTITIES.get(m.entity)) throw new Error(`liaison ${b.id} : entité inconnue ${m.entity}`);
  }
}
/** Enregistre une version (fichier rules/v<N>.json ou API). Une version publiée ne change plus. */
function importPackage(pkg, by, opts = {}) {
  checkPackage(pkg);
  const text = JSON.stringify(pkg);
  const sha = createHash("sha256").update(text).digest("hex");
  const prev = db.prepare(`SELECT "sha256" FROM "_rules" WHERE "version" = ?`).get(pkg.version);
  if (prev) {
    if (prev.sha256 !== sha) throw new HttpError(409, `La version ${pkg.version} du modèle métier existe déjà avec un contenu différent : publiez une nouvelle version`);
    return false;
  }
  db.prepare(`INSERT INTO "_rules" ("version", "sha256", "source", "published_at", "published_by", "imported_at", "package") VALUES (?, ?, ?, ?, ?, ?, ?)`).run(pkg.version, sha, pkg.source ?? null, pkg.published_at ?? now(), pkg.published_by ?? by, now(), text);
  const cur = Number(db.prepare(`SELECT "value" FROM "_meta" WHERE "key" = 'rules_active_version'`).get()?.value ?? 0);
  if (opts.activate !== false && pkg.version > cur) db.prepare(`INSERT INTO "_meta" ("key", "value") VALUES ('rules_active_version', ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`).run(String(pkg.version));
  audit(by, "rules_published", null, null, null, { version: pkg.version, sha256: sha, source: pkg.source ?? null });
  return true;
}
/** Relit rules/ si le dossier a changé : les versions publiées par le Studio sont prises en compte à chaud. */
function syncRules() {
  const files = readRuleFiles();
  const stamp = files.map((f) => `${f}:${fs.statSync(path.join(RULES_DIR, f)).mtimeMs}`).sort().join("|");
  if (stamp === rulesStamp) return;
  for (const f of files.filter((x) => x !== "active.json").sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(RULES_DIR, f), "utf8"));
      if (pkg.version !== Number(f.slice(1, -5))) throw new Error(`le fichier ${f} contient la version ${pkg.version}`);
      importPackage(pkg, "publication");
    } catch (x) {
      console.error(`[app] modèle métier ${f} ignoré : ${x.message}`);
    }
  }
  if (files.includes("active.json")) {
    try {
      const v = Number(JSON.parse(fs.readFileSync(path.join(RULES_DIR, "active.json"), "utf8")).version);
      if (db.prepare(`SELECT 1 FROM "_rules" WHERE "version" = ?`).get(v)) db.prepare(`INSERT INTO "_meta" ("key", "value") VALUES ('rules_active_version', ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`).run(String(v));
    } catch (x) {
      console.error(`[app] rules/active.json ignoré : ${x.message}`);
    }
  }
  packages.clear();
  derived.clear();
  for (const r of db.prepare(`SELECT "version", "package" FROM "_rules" ORDER BY "version"`).all()) {
    const pkg = JSON.parse(r.package);
    packages.set(r.version, pkg);
    for (const b of pkg.bindings ?? []) {
      const list = derived.get(b.entity) ?? [];
      for (const f of b.fields ?? []) if (!list.some((x) => x.name === f.name)) list.push({ name: f.name, label: f.label ?? f.name, type: f.type, required: false, unique: false, accounting: false, derived: true });
      derived.set(b.entity, list);
    }
  }
  rulesStamp = stamp;
  ensureSchema();
}
function activeVersion() {
  const v = db.prepare(`SELECT "value" FROM "_meta" WHERE "key" = 'rules_active_version'`).get()?.value;
  return v ? Number(v) : null;
}
/** Champs d'une entité : ceux de la spécification + ceux ajoutés par le modèle métier (calculés). */
function fieldsOf(e) {
  const extra = (derived.get(e.name) ?? []).filter((d) => !e.fields.some((f) => f.name === d.name));
  return extra.length ? [...e.fields, ...extra] : e.fields;
}
const bindingIn = (version, entity, scope) => (packages.get(version)?.bindings ?? []).find((b) => b.entity === entity && b.scope === scope && b.status !== "proposed") ?? null;
const boundAnywhere = (entity, scope) => [...packages.values()].some((p) => (p.bindings ?? []).some((b) => b.entity === entity && (!scope || b.scope === scope) && b.status !== "proposed"));
function outputsOf(e) {
  const out = new Set();
  for (const p of packages.values()) for (const n of outputFields(p, e.name)) out.add(n);
  return out;
}
/** Accès aux valeurs d'un enregistrement et de ses références (pour les entrées du modèle). */
function accessFor(e, row) {
  return {
    get(pathStr) {
      let ent = e;
      let cur = row;
      const parts = String(pathStr).split(".");
      for (let i = 0; i < parts.length; i++) {
        const f = fieldsOf(ent).find((x) => x.name === parts[i]);
        if (!f || !cur) return { value: undefined, type: null };
        const v = cur[parts[i]];
        if (i === parts.length - 1) return { value: v, type: f.type };
        if (f.type !== "reference" || v === null || v === undefined) return { value: undefined, type: null };
        ent = ENTITIES.get(f.references);
        cur = ent ? db.prepare(`SELECT * FROM ${q(ent.name)} WHERE "id" = ?`).get(v) : null;
      }
      return { value: undefined, type: null };
    },
    sum(entity, via, field) {
      const ce = ENTITIES.get(entity);
      const f = ce && fieldsOf(ce).find((x) => x.name === field);
      if (!f || row.id === undefined) return { value: 0, type: f?.type ?? null };
      return { value: db.prepare(`SELECT COALESCE(SUM(${q(field)}), 0) AS v FROM ${q(entity)} WHERE ${q(via)} = ?`).get(row.id).v, type: f.type };
    },
  };
}
function priceWith(e, row, version, b) {
  const r = evaluateBinding(packages.get(version) ?? null, b, accessFor(e, row), (field) => fieldsOf(e).find((f) => f.name === field)?.type ?? null);
  if (r.status !== "ok") throw new HttpError(422, r.message, { version, module: b.module, status: r.status, errors: r.result?.errors ?? [] });
  return { values: r.values, result: r.result };
}
/** Ligne d'un document soumis au modèle : version du document (épinglée) ou version active. */
function lineContext(e, row) {
  const any = [...packages.values()].flatMap((p) => p.bindings ?? []).find((b) => b.entity === e.name && b.scope === "line" && b.status !== "proposed");
  if (!any) return null;
  const parentEnt = any.document ? ENTITIES.get(any.document.entity) : null;
  const parentId = any.document ? row[any.document.via] : null;
  const parent = parentEnt && parentId !== null && parentId !== undefined ? db.prepare(`SELECT * FROM ${q(parentEnt.name)} WHERE "id" = ?`).get(parentId) : null;
  const version = parent?._rules_version ?? activeVersion();
  const lb = version ? bindingIn(version, e.name, "line") : null;
  if (!lb) return null;
  return { b: lb, version, parentEnt: lb.document ? ENTITIES.get(lb.document.entity) : null, parentId: lb.document ? row[lb.document.via] : null };
}
/** Champs lus directement sur l'enregistrement par une liaison (entrées de calcul). */
function directInputs(e) {
  const out = new Set();
  for (const p of packages.values())
    for (const b of p.bindings ?? [])
      if (b.entity === e.name)
        for (const src of Object.values(b.inputs ?? {})) for (const s of typeof src === "string" ? [src] : Array.isArray(src) ? src : src?.date_number ? [src.date_number] : []) if (!String(s).includes(".")) out.add(s);
  return out;
}
function rulesInfo(full = false) {
  const active = activeVersion();
  const pkg = active ? packages.get(active) : null;
  const versions = db.prepare(`SELECT "version", "sha256", "source", "published_at", "published_by", "imported_at" FROM "_rules" ORDER BY "version"`).all();
  return {
    active_version: active,
    versions: versions.map((v) => ({ ...v, modules: Object.keys(packages.get(v.version)?.modules ?? {}), notes: packages.get(v.version)?.notes ?? null })),
    bindings: (pkg?.bindings ?? []).map((b) => ({ id: b.id, entity: b.entity, scope: b.scope, module: b.module, outputs: b.outputs, document: b.document ?? null, lines: b.lines ?? null })),
    ...(full && pkg
      ? {
          modules: Object.fromEntries(
            Object.entries(pkg.modules).map(([k, mdl]) => [k, { inputs: mdl.inputs ?? [], rules: (mdl.rules ?? []).map((r) => ({ id: r.id, type: r.type, description: r.description ?? null, validation_status: r.validation_status ?? null, confidence: r.confidence ?? null })) }]),
          ),
        }
      : {}),
  };
}
/** Recalcul explicite d'un document créé ici avec la version active (tracé) ; jamais pour l'historique. */
function reprice(e, id, sess) {
  syncRules();
  const doc = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id);
  if (!doc) throw new HttpError(404, "Enregistrement introuvable");
  if (doc._migrated) throw new HttpError(409, "Document historique : ses montants d'origine ne sont jamais recalculés");
  const v = activeVersion();
  if (!v || !bindingIn(v, e.name, "document")) throw new HttpError(409, "Calcul non disponible : le modèle métier actif ne calcule pas ce document");
  const lb = (packages.get(v).bindings ?? []).find((b) => b.scope === "line" && b.document?.entity === e.name && b.status !== "proposed");
  db.exec("BEGIN");
  try {
    if (lb) {
      const le = ENTITIES.get(lb.entity);
      for (const lineRow of db.prepare(`SELECT * FROM ${q(le.name)} WHERE ${q(lb.document.via)} = ?`).all(id)) {
        const { values } = priceWith(le, lineRow, v, lb);
        const keys = Object.keys(values);
        db.prepare(`UPDATE ${q(le.name)} SET ${[...keys.map((k) => `${q(k)} = ?`), `"_rules_version" = ?`, `"_updated_at" = ?`].join(", ")} WHERE "id" = ?`).run(...keys.map((k) => values[k]), v, now(), lineRow.id);
      }
    }
    db.prepare(`UPDATE ${q(e.name)} SET "_rules_version" = ? WHERE "id" = ?`).run(v, id);
    repriceDocument(e, id, v);
    audit(sess.user, "reprice", e.name, id, { _rules_version: doc._rules_version ?? null }, { _rules_version: v });
    db.exec("COMMIT");
  } catch (x) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw x;
  }
  return db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id);
}
/** Recalcule un document (non migré) à partir de ses lignes et de ses propres champs. */
function repriceDocument(pe, pid, version = null) {
  const p = db.prepare(`SELECT * FROM ${q(pe.name)} WHERE "id" = ?`).get(pid);
  if (!p || p._migrated) return null;
  const v = version ?? p._rules_version ?? activeVersion();
  const b = bindingIn(v, pe.name, "document");
  if (!b) return null;
  const { values } = priceWith(pe, p, v, b);
  const changed = Object.keys(values).filter((k) => values[k] !== p[k]);
  if (changed.length || p._rules_version !== v) {
    db.prepare(`UPDATE ${q(pe.name)} SET ${[...changed.map((k) => `${q(k)} = ?`), `"_rules_version" = ?`, `"_updated_at" = ?`].join(", ")} WHERE "id" = ?`).run(...changed.map((k) => values[k]), v, now(), pid);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                             */
/* ------------------------------------------------------------------ */
const sessions = new Map();
const failures = new Map();
/**
 * Session de la requête, revalidée à chaque appel : un compte désactivé, un mot de passe changé
 * (session_epoch) ou un compte disparu (restauration) ferme la session immédiatement ; un
 * changement de rôle s'applique dès la requête suivante.
 */
function sessionOf(req) {
  const m = COOKIE_RE.exec(req.headers.cookie ?? "");
  const s = m ? sessions.get(m[1]) : null;
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(s.sid);
    return null;
  }
  const u = db.prepare(`SELECT "id", "username", "role", "disabled", "session_epoch" FROM "_users" WHERE "id" = ?`).get(s.uid);
  if (!u || u.username !== s.user || u.disabled || Number(u.session_epoch ?? 0) !== s.epoch || !Object.hasOwn(ROLES, u.role)) {
    sessions.delete(s.sid);
    return null;
  }
  s.role = u.role;
  s.expires = Date.now() + SESSION_MS;
  return s;
}
const sessionCookie = (sid, maxAge = SESSION_MS / 1000) => `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SECURE_COOKIE ? "; Secure" : ""}`;
/** Ouvre une session pour un compte (connexion, activation, changement de mot de passe). */
function openSession(res, u, status, body) {
  for (const [k, v] of sessions) if (v.expires < Date.now()) sessions.delete(k);
  const sid = randomBytes(24).toString("hex");
  sessions.set(sid, { sid, uid: u.id, user: u.username, role: u.role, epoch: Number(u.session_epoch ?? 0), expires: Date.now() + SESSION_MS });
  db.prepare(`UPDATE "_users" SET "last_login_at" = ? WHERE "id" = ?`).run(now(), u.id);
  return send(res, status, body, undefined, { "set-cookie": sessionCookie(sid) });
}
/**
 * Limiteur de tentatives (connexion, activation, mot de passe actuel) : `max` échecs (8 par défaut) → 5 minutes de blocage.
 * Appelé APRÈS la lecture du corps de la requête : contrôle, vérification et comptage se font alors d'un seul tenant
 * (code synchrone), si bien que des essais envoyés en même temps ne passent pas tous avant le premier échec compté.
 */
function assertNotLimited(key) {
  const f = failures.get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, "Trop de tentatives : réessayez dans quelques minutes.");
}
function countFailure(key, max = 8) {
  // Mémoire bornée : au-delà de 10 000 clés (adresses ou identifiants inventés), seules les clés bloquées sont gardées
  if (failures.size > 10_000) for (const [k, v] of failures) if (!(v.until > Date.now())) failures.delete(k);
  const f = failures.get(key) ?? { n: 0, until: 0 };
  f.n++;
  if (f.n >= max) Object.assign(f, { n: 0, until: Date.now() + 5 * 60e3 });
  failures.set(key, f);
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...SECURITY_HEADERS, ...extra });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function readJson(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Requête trop volumineuse"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new HttpError(400, "JSON invalide"));
      }
    });
  });
}
function requireRole(sess, role) {
  if (!sess) throw new HttpError(401, "Connexion requise");
  if (ROLES[sess.role] < ROLES[role]) throw new HttpError(403, "Droits insuffisants");
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers["sec-fetch-site"] ? ["same-origin", "none"].includes(req.headers["sec-fetch-site"]) : true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Entités                                                              */
/* ------------------------------------------------------------------ */
function entityOf(name) {
  const e = ENTITIES.get(name);
  if (!e) throw new HttpError(404, `Entité inconnue : ${name}`);
  return e;
}
/* Titres affichés --------------------------------------------------------- */
const blank = (v) => v === null || v === undefined || v === "";
const NUMERIC_LIKE = /^[\s#\d.,:/_-]+$/;
const frDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? "");
};
const rangeText = (s, e) => (s && e && e !== s ? `du ${frDate(s)} au ${frDate(e)}` : s ? `le ${frDate(s)}` : "");
/** Listes à deux valeurs oui / non sans libellé (S/N, O/N, Y/N, 1/0…) : « Oui » / « Non » (même règle que l'interface). */
const YES_NO = [["s", "n"], ["o", "n"], ["y", "n"], ["j", "n"], ["1", "0"], ["oui", "non"], ["si", "no"], ["sì", "no"], ["yes", "no"], ["true", "false"], ["vrai", "faux"]];
function yesNo(f) {
  const opts = f?.type === "enum" ? (f.options ?? []) : [];
  if (opts.length !== 2 || opts.some((o) => o.label)) return null;
  const vals = opts.map((o) => String(o.value));
  for (const [y, n] of YES_NO) {
    const yes = vals.find((v) => v.trim().toLowerCase() === y);
    const no = vals.find((v) => v.trim().toLowerCase() === n);
    if (yes !== undefined && no !== undefined) return { yes, no };
  }
  return null;
}
/** Valeur d'un champ en texte (titres) : dates à la française, libellés des listes. Les références sont résolues à part. */
function textOf(f, v) {
  if (blank(v)) return "";
  if (f?.type === "date") return frDate(v);
  if (f?.type === "boolean") return Number(v) ? "Oui" : "Non";
  if (f?.type === "enum") {
    const o = f.options?.find((x) => x.value === String(v));
    if (o?.label) return o.label;
    const yn = yesNo(f);
    if (yn && String(v) === yn.yes) return "Oui";
    if (yn && String(v) === yn.no) return "Non";
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? frDate(v) : String(v);
}
/**
 * Titres affichés des enregistrements `ids` de l'entité `e`, comme dans l'interface : champ titre ; s'il est
 * vide ou n'est qu'un numéro et que l'entité est dessinée dans un planning, « titre lié · ressource · du … au … » ;
 * sinon la clé de l'ancien logiciel ; en dernier recours « #id ». Un seul niveau de références (aucune boucle).
 */
function displayTitles(e, ids, depth = 0) {
  const out = new Map();
  const list = [...new Set(ids.filter((x) => !blank(x)))];
  if (!e || !list.length) return out;
  const field = (n) => (n ? (e.fields.find((x) => x.name === n) ?? null) : null);
  const tf = field(e.title_field);
  const v = depth === 0 ? viewOf(e.name) : null;
  const cols = [`"id"`, `"_source_key" AS "_k"`, `${tf ? q(tf.name) : "NULL"} AS "_t"`];
  if (v) cols.push(`${q(v.start)} AS "_s"`, `${q(v.end)} AS "_e"`, `${q(v.resource)} AS "_r"`, `${v.title ? q(v.title) : "NULL"} AS "_w"`);
  const rows = [];
  for (let i = 0; i < list.length; i += 500) {
    const part = list.slice(i, i + 500);
    rows.push(...db.prepare(`SELECT ${cols.join(", ")} FROM ${q(e.name)} WHERE "id" IN (${part.map(() => "?").join(",")})`).all(...part));
  }
  const linked = (f, values) => (f?.type === "reference" && depth < 1 ? displayTitles(ENTITIES.get(f.references), values, depth + 1) : null);
  const text = (f, refs, raw) => (blank(raw) ? "" : refs ? (refs.get(raw) ?? `#${raw}`) : textOf(f, raw));
  const tRefs = linked(tf, rows.map((r) => r._t));
  const wf = v ? field(v.title) : null;
  const wRefs = v ? linked(wf, rows.map((r) => r._w)) : null;
  const rRefs = v ? linked(field(v.resource), rows.map((r) => r._r)) : null;
  for (const r of rows) {
    const t = text(tf, tRefs, r._t);
    if (v && !blank(r._s) && (!t || NUMERIC_LIKE.test(t))) out.set(r.id, [text(wf, wRefs, r._w), text(null, rRefs, r._r), rangeText(r._s, r._e)].filter(Boolean).join(" · "));
    else out.set(r.id, t || (blank(r._k) ? `#${r.id}` : String(r._k)));
  }
  return out;
}

function refTitles(e, rows) {
  const out = rows.map(() => ({}));
  for (const f of e.fields.filter((x) => x.type === "reference")) {
    const target = ENTITIES.get(f.references);
    if (!target) continue;
    const found = displayTitles(target, rows.map((r) => r[f.name]));
    rows.forEach((r, i) => {
      if (!blank(r[f.name])) out[i][f.name] = found.get(r[f.name]) ?? `#${r[f.name]}`;
    });
  }
  return out;
}

/** Recherche textuelle d'une entité (champs de recherche et titre ; clé d'origine exacte). */
function searchClause(e, term) {
  const cols = [...new Set([...(e.search_fields ?? []), e.title_field].filter((c) => c && e.fields.some((f) => f.name === c)))];
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  if (!cols.length) return { sql: `"_source_key" = ?`, args: [term] };
  return { sql: `(${cols.map((c) => `${q(c)} LIKE ? ESCAPE '\\'`).join(" OR ")} OR "_source_key" = ?)`, args: [...cols.map(() => like), term] };
}
const RANGE_TYPES = new Set(["date", "money", "integer", "decimal", "percent"]);

function list(e, params) {
  const per = Math.min(200, Math.max(1, Number(params.get("per") ?? 25) || 25));
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const where = [];
  const args = [];
  const search = (params.get("q") ?? "").trim();
  if (search) {
    const s = searchClause(e, search);
    where.push(s.sql);
    args.push(...s.args);
  }
  for (const f of e.fields) {
    const v = params.get(f.name);
    if (v !== null && v !== "") {
      where.push(`${q(f.name)} = ?`);
      args.push(["reference", "integer", "money", "boolean"].includes(f.type) ? Number(v) : v);
    }
  }
  // Plages : <champ>.from / <champ>.to (dates AAAA-MM-JJ, montants en centimes, nombres)
  for (const f of fieldsOf(e).filter((x) => RANGE_TYPES.has(x.type))) {
    for (const [suffix, op] of [
      [".from", ">="],
      [".to", "<="],
    ]) {
      const v = params.get(f.name + suffix);
      if (v === null || v === "") continue;
      const val = f.type === "date" ? (ISO.test(v) ? v : null) : Number.isFinite(Number(v)) ? Number(v) : null;
      if (val === null) throw new HttpError(400, `${f.label} : valeur de filtre invalide`);
      where.push(`${q(f.name)} ${op} ?`);
      args.push(val);
    }
  }
  if (params.get("_migrated") === "1" || params.get("_migrated") === "0") {
    where.push(`"_migrated" = ?`);
    args.push(Number(params.get("_migrated")));
  }
  const dir = params.get("dir") === "desc" ? "DESC" : "ASC";
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)} ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM ${q(e.name)} ${w} ORDER BY ${orderExpr(e, params.get("sort"))} ${dir}, "id" ${dir} LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const refs = refTitles(e, rows);
  return { rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })), total, page, per };
}

/** Recherche dans tous les modules (ceux de la navigation d'abord) : quelques résultats par module. */
function searchAll(term, per) {
  if (!term) return { q: term, groups: [] };
  const nav = SPEC.navigation.map((n) => n.entity);
  const order = [...nav, ...SPEC.entities.map((e) => e.name).filter((n) => !nav.includes(n))];
  const groups = [];
  for (const name of order) {
    const e = ENTITIES.get(name);
    if (!e || !(e.search_fields?.length || e.title_field)) continue;
    const s = searchClause(e, term);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)} WHERE ${s.sql}`).get(...s.args).n;
    if (!total) continue;
    const rows = db.prepare(`SELECT * FROM ${q(e.name)} WHERE ${s.sql} ORDER BY "id" DESC LIMIT ?`).all(...s.args, per);
    const refs = refTitles(e, rows);
    groups.push({ entity: e.name, total, rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })) });
  }
  return { q: term, groups };
}

/**
 * Expression de tri d'une liste : un champ de l'entité, ou « <référence>.<champ> » = un champ de la fiche liée
 * (ex. la date de début du séjour d'une ligne qui n'a pas de date). Noms vérifiés dans la spécification ; à
 * défaut, l'ordre de création.
 */
function orderExpr(e, sort) {
  if (typeof sort === "string" && fieldsOf(e).some((f) => f.name === sort)) return q(sort);
  const m = /^([a-z][a-z0-9_]{0,59})\.([a-z][a-z0-9_]{0,59})$/.exec(String(sort ?? ""));
  const rf = m && e.fields.find((f) => f.name === m[1] && f.type === "reference");
  const te = rf && ENTITIES.get(rf.references);
  // Table liée renommée dans la sous-requête : la référence désigne toujours l'enregistrement de la liste
  if (te && fieldsOf(te).some((f) => f.name === m[2])) return `(SELECT "_lie".${q(m[2])} FROM ${q(te.name)} AS "_lie" WHERE "_lie"."id" = ${q(e.name)}.${q(m[1])})`;
  return `"id"`;
}
/**
 * Tri « le plus récent d'abord » des enregistrements liés à une fiche : début du planning de l'entité, sinon
 * première date de ses colonnes de liste, sinon sa première date (jamais un champ technique), sinon la date de
 * début de la fiche liée dessinée dans un planning ; à défaut, l'ordre de création. Le même tri sert aux pages
 * suivantes (GET /api/e/<entité>?<via>=<id>&sort=…&dir=desc).
 */
function recentField(ce) {
  const v = viewOf(ce.name);
  if (v) return v.start;
  const tech = new Set(ce.technical_fields ?? []);
  const dates = ce.fields.filter((f) => f.type === "date" && !tech.has(f.name));
  const own = (dates.find((f) => (ce.list_fields ?? []).includes(f.name)) ?? dates[0])?.name;
  if (own) return own;
  for (const f of ce.fields.filter((x) => x.type === "reference" && !tech.has(x.name))) {
    const tv = viewOf(f.references);
    if (tv) return `${f.name}.${tv.start}`;
  }
  return null;
}

function detail(e, id) {
  const row = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id);
  if (!row) throw new HttpError(404, "Enregistrement introuvable");
  const children = {};
  for (const c of e.children) {
    const ce = ENTITIES.get(c.entity);
    // Relation portée par un champ technique (clé recomposée de l'ancien logiciel) : pas un enregistrement lié à montrer
    if (!ce || !ce.fields.some((f) => f.name === c.via) || (ce.technical_fields ?? []).includes(c.via)) continue;
    const sort = recentField(ce);
    const rows = db.prepare(`SELECT * FROM ${q(c.entity)} WHERE ${q(c.via)} = ? ORDER BY ${orderExpr(ce, sort)} DESC, "id" DESC LIMIT 100`).all(id);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(c.entity)} WHERE ${q(c.via)} = ?`).get(id).n;
    const refs = refTitles(ce, rows);
    children[`${c.entity}.${c.via}`] = { total, sort: { field: sort ?? "id", dir: "desc" }, rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })) };
  }
  const lineage = db.prepare(`SELECT "source_system", "source_table", "source_key", "source_file", "source_file_sha256", "source_row", "source_row_hash", "transforms", "run_id", "migrated_at" FROM "_lineage" WHERE "entity" = ? AND "record_id" = ?`).get(e.name, id);
  const files = db.prepare(`SELECT "id", "filename", "mime", "size", "sha256", "_migrated", "created_at", "created_by", "source_path" FROM "_files" WHERE "entity" = ? AND "record_id" = ? ORDER BY "id"`).all(e.name, id);
  const history = db.prepare(`SELECT "ts", "user", "action", "before", "after", "justification" FROM "_audit" WHERE "entity" = ? AND "record_id" = ? ORDER BY "id" DESC LIMIT 50`).all(e.name, id);
  return { record: { ...row, _refs: refTitles(e, [row])[0] }, children, lineage: lineage ? { ...lineage, source_row: JSON.parse(lineage.source_row), transforms: JSON.parse(lineage.transforms ?? "{}") } : null, files, history };
}

/* Validation d'une écriture ------------------------------------------- */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
function coerce(f, v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  switch (f.type) {
    case "integer":
    case "money":
    case "reference": {
      const n = typeof v === "number" ? v : /^-?\d+$/.test(String(v).trim()) ? Number(v) : NaN;
      if (!Number.isSafeInteger(n)) throw new HttpError(400, `${f.label} : ${f.type === "money" ? "montant en centimes entiers attendu" : "nombre entier attendu"}`);
      if (f.type === "reference") {
        const t = ENTITIES.get(f.references);
        if (!db.prepare(`SELECT 1 FROM ${q(t.name)} WHERE "id" = ?`).get(n)) throw new HttpError(400, `${f.label} : ${t.label_singular ?? t.name} #${n} introuvable`);
      }
      return n;
    }
    case "decimal":
    case "percent": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) throw new HttpError(400, `${f.label} : nombre attendu`);
      return n;
    }
    case "boolean":
      if (v === true || v === 1 || v === "1" || v === "true") return 1;
      if (v === false || v === 0 || v === "0" || v === "false") return 0;
      throw new HttpError(400, `${f.label} : oui/non attendu`);
    case "date": {
      const m = ISO.exec(String(v));
      const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!m || d.getUTCDate() !== +m[3] || d.getUTCMonth() !== +m[2] - 1) throw new HttpError(400, `${f.label} : date AAAA-MM-JJ attendue`);
      return String(v);
    }
    case "enum":
      if (f.options?.length && !f.options.some((o) => o.value === String(v))) throw new HttpError(400, `${f.label} : valeur non autorisée`);
      return String(v);
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) throw new HttpError(400, `${f.label} : adresse e-mail invalide`);
      return String(v).trim();
    default: {
      const s = String(v);
      if (s.length > 5000) throw new HttpError(400, `${f.label} : texte trop long`);
      return s;
    }
  }
}

function computeFields(e, row) {
  // Une entité calculée par le modèle métier n'utilise plus les formules de la spécification
  if (boundAnywhere(e.name)) return;
  for (const c of e.computed ?? []) {
    const ast = compile(c.expr);
    if (ast.vars.some((k) => row[k] === null || row[k] === undefined)) continue;
    const v = evaluate(c.expr, Object.fromEntries(ast.vars.map((k) => [k, row[k]])));
    const f = e.fields.find((x) => x.name === c.field);
    row[c.field] = f && (f.type === "money" || f.type === "integer") ? Math.round(Number(v)) : v;
  }
}

/** Agrégats (ex. total = somme des lignes) : recalculés UNIQUEMENT pour les enregistrements créés dans ce logiciel. */
function refreshAggregates(childEntity, parentRefs) {
  for (const parent of SPEC.entities) {
    if (boundAnywhere(parent.name, "document")) continue;
    for (const a of parent.aggregates ?? []) {
      if (a.children !== childEntity.name) continue;
      const id = parentRefs[a.via];
      if (id === null || id === undefined) continue;
      const p = db.prepare(`SELECT * FROM ${q(parent.name)} WHERE "id" = ?`).get(id);
      if (!p || p._migrated) continue;
      const ast = compile(a.expr);
      let sum = 0;
      for (const r of db.prepare(`SELECT * FROM ${q(childEntity.name)} WHERE ${q(a.via)} = ?`).all(id)) sum += Number(evaluate(a.expr, Object.fromEntries(ast.vars.map((k) => [k, r[k]]))) ?? 0);
      const next = { ...p, [a.field]: Math.round(sum) };
      computeFields(parent, next);
      const changed = parent.fields.filter((f) => next[f.name] !== p[f.name]);
      if (!changed.length) continue;
      db.prepare(`UPDATE ${q(parent.name)} SET ${changed.map((f) => `${q(f.name)} = ?`).join(", ")}, "_updated_at" = ? WHERE "id" = ?`).run(...changed.map((f) => next[f.name]), now(), id);
    }
  }
}

/**
 * Les lignes d'un document historique protégé (comptable, ou calculé par le modèle métier) ne
 * peuvent être ni ajoutées, ni modifiées, ni supprimées : le document garde ses montants d'origine.
 */
function isLineOf(e, parent, via) {
  if ((parent.aggregates ?? []).some((a) => a.children === e.name && a.via === via)) return true;
  if (e.line_of?.entity === parent.name && e.line_of?.via === via) return true;
  return [...packages.values()].some((p) => (p.bindings ?? []).some((b) => b.entity === e.name && b.scope === "line" && b.document?.entity === parent.name && b.document?.via === via));
}
function lockedParent(e, body) {
  for (const f of fieldsOf(e).filter((x) => x.type === "reference")) {
    const parent = ENTITIES.get(f.references);
    const id = body[f.name];
    if (!parent || id === null || id === undefined) continue;
    if (!isLineOf(e, parent, f.name)) continue;
    if (!parent.fields.some((x) => x.accounting) && !boundAnywhere(parent.name, "document")) continue;
    const p = db.prepare(`SELECT "_migrated" FROM ${q(parent.name)} WHERE "id" = ?`).get(id);
    if (p?._migrated) throw new HttpError(409, `${parent.label_singular ?? parent.name} historique migré : ses lignes ne sont pas modifiables (ses montants d'origine sont conservés ; émettez un nouveau document pour toute correction)`);
  }
}

function write(e, body, sess, id = null) {
  syncRules();
  const fields = fieldsOf(e);
  const unknown = Object.keys(body).filter((k) => !fields.some((f) => f.name === k) && k !== "_justification");
  if (unknown.length) throw new HttpError(400, `Champs inconnus : ${unknown.join(", ")}`);
  const before = id ? db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id) : null;
  if (id && !before) throw new HttpError(404, "Enregistrement introuvable");
  const values = {};
  for (const f of fields) {
    const v = coerce(f, body[f.name]);
    if (v !== undefined) values[f.name] = v;
  }
  // Champs calculés par le modèle métier : jamais saisis à la main (contrôle côté serveur)
  const byRules = outputsOf(e);
  const manual = fields.filter((f) => byRules.has(f.name) && f.name in values && values[f.name] !== null && values[f.name] !== (before?.[f.name] ?? null));
  if (manual.length) throw new HttpError(400, `${manual.map((f) => f.label).join(", ")} : calculé par le modèle métier, non modifiable à la main`);
  for (const n of byRules) delete values[n];
  if (before?._migrated) {
    const locked = fields.filter((f) => f.accounting && f.name in values && values[f.name] !== before[f.name]);
    const inputs = directInputs(e);
    const frozen = fields.filter((f) => !f.accounting && inputs.has(f.name) && f.name in values && values[f.name] !== before[f.name]);
    if (locked.length || frozen.length) {
      audit(sess.user, "update_refused", e.name, id, null, { fields: [...locked, ...frozen].map((f) => f.name), attempted: pick(values, [...locked, ...frozen]) }, body._justification ?? "Donnée historique protégée");
      if (locked.length) throw new HttpError(409, `Donnée comptable historique non modifiable : ${locked.map((f) => f.label).join(", ")}`);
      throw new HttpError(409, `Document historique : ${frozen.map((f) => f.label).join(", ")} non modifiable (ses montants d'origine sont conservés ; créez un nouveau document)`);
    }
  }
  const row = { ...(before ?? {}), ...values };
  // Protection de l'historique AVANT tout calcul : la réponse dit pourquoi l'opération est refusée
  lockedParent(e, row);
  if (before) lockedParent(e, before);
  let line = null;
  let selfVersion = null;
  if (!before?._migrated) {
    line = lineContext(e, row);
    if (line) {
      Object.assign(row, priceWith(e, row, line.version, line.b).values);
      row._rules_version = line.version;
    } else if (boundAnywhere(e.name, "document")) selfVersion = before?._rules_version ?? activeVersion();
    else computeFields(e, row);
  }
  const missing = fields.filter((f) => f.required && !byRules.has(f.name) && (row[f.name] === null || row[f.name] === undefined || row[f.name] === ""));
  if (missing.length) throw new HttpError(400, `Champs obligatoires : ${missing.map((f) => f.label).join(", ")}`);
  const cols = fields.filter((f) => row[f.name] !== undefined && (!before || row[f.name] !== before[f.name]));
  const sys = row._rules_version !== undefined && row._rules_version !== (before?._rules_version ?? undefined) ? [["_rules_version", row._rules_version]] : [];
  try {
    db.exec("BEGIN");
    let newId = id;
    if (before) {
      const sets = [...cols.map((f) => `${q(f.name)} = ?`), ...sys.map(([k]) => `${q(k)} = ?`)];
      if (sets.length) db.prepare(`UPDATE ${q(e.name)} SET ${sets.join(", ")}, "_updated_at" = ? WHERE "id" = ?`).run(...cols.map((f) => row[f.name]), ...sys.map(([, v]) => v), now(), id);
    } else {
      const names = [...cols.map((f) => q(f.name)), ...sys.map(([k]) => q(k)), `"_migrated"`];
      const info = db.prepare(`INSERT INTO ${q(e.name)} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...cols.map((f) => row[f.name]), ...sys.map(([, v]) => v), 0);
      newId = Number(info.lastInsertRowid);
    }
    if (selfVersion) repriceDocument(e, newId, selfVersion);
    if (line?.parentEnt && line.parentId !== null && line.parentId !== undefined) repriceDocument(line.parentEnt, line.parentId, line.version);
    const oldParent = line?.b.document && before ? before[line.b.document.via] : null;
    if (oldParent !== null && oldParent !== undefined && oldParent !== row[line.b.document.via]) repriceDocument(line.parentEnt, oldParent);
    const after = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(newId);
    const changed = before ? fields.filter((f) => after[f.name] !== before[f.name]) : fields;
    if (!before || changed.length) audit(sess.user, before ? "update" : "create", e.name, newId, before ? pick(before, changed) : null, { ...pick(after, before ? changed : fields), ...(after._rules_version ? { _rules_version: after._rules_version } : {}) }, body._justification ?? null);
    refreshAggregates(e, after);
    if (before) refreshAggregates(e, before);
    db.exec("COMMIT");
    return after;
  } catch (x) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    if (/UNIQUE constraint/.test(x.message)) throw new HttpError(409, `Valeur déjà utilisée (${x.message.split(":").pop().trim()})`);
    if (/CHECK constraint|FOREIGN KEY/.test(x.message)) throw new HttpError(400, `Refus de la base : ${x.message}`);
    throw x;
  }
}
const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f.name ?? f, row[f.name ?? f]]));

function remove(e, id, sess) {
  const before = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id);
  if (!before) throw new HttpError(404, "Enregistrement introuvable");
  syncRules();
  if (before._migrated && (e.fields.some((f) => f.accounting) || boundAnywhere(e.name, "document"))) {
    audit(sess.user, "delete_refused", e.name, id, null, null, "Document historique protégé");
    throw new HttpError(409, "Document historique : suppression interdite (ses données d'origine sont conservées)");
  }
  lockedParent(e, before);
  const line = before._migrated ? null : lineContext(e, before);
  for (const other of SPEC.entities) {
    for (const f of other.fields.filter((x) => x.type === "reference" && x.references === e.name)) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${q(other.name)} WHERE ${q(f.name)} = ?`).get(id).n;
      if (n) throw new HttpError(409, `Suppression impossible : ${n} ${other.label ?? other.name} lié(s)`);
    }
  }
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM "_files" WHERE "entity" = ? AND "record_id" = ?`).run(e.name, id);
    db.prepare(`DELETE FROM ${q(e.name)} WHERE "id" = ?`).run(id);
    audit(sess.user, "delete", e.name, id, pick(before, fieldsOf(e)), null);
    if (line?.parentEnt && line.parentId !== null && line.parentId !== undefined) repriceDocument(line.parentEnt, line.parentId);
    refreshAggregates(e, before);
    db.exec("COMMIT");
  } catch (x) {
    db.exec("ROLLBACK");
    throw x;
  }
}

/* Vues d'ensemble : planning ------------------------------------------------ */
// Un élément occupe les jours de son début (inclus) à sa fin (exclue) ; sans fin, ou si la fin précède le
// début, il occupe son seul jour de début. Les dates sont du texte AAAA-MM-JJ (contrôle du schéma) : la
// comparaison de textes suit l'ordre des dates.
const PLANNING_MAX_DAYS = 92;
const PLANNING_MAX_ITEMS = 3000;
const PLANNING_MAX_RESOURCES = 500;
const validDay = (s) => {
  const m = ISO.exec(String(s ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? String(s) : null;
};
const plusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Condition SQL « l'élément occupe au moins un jour de [?1, ?2] » ; paramètres : (fin de période, début, début). */
const overlaps = (v) => `${q(v.start)} IS NOT NULL AND ${q(v.start)} <= ? AND (CASE WHEN ${q(v.end)} IS NULL OR ${q(v.end)} <= ${q(v.start)} THEN ${q(v.start)} >= ? ELSE ${q(v.end)} > ? END)`;
/** Textes affichés d'un champ pour une liste de valeurs (titres liés pour une référence). */
function textsOf(e, fieldName, values) {
  const f = fieldName ? e.fields.find((x) => x.name === fieldName) : null;
  const refs = f?.type === "reference" ? displayTitles(ENTITIES.get(f.references), values) : null;
  return (v) => (blank(v) ? null : refs ? (refs.get(v) ?? `#${v}`) : textOf(f, v));
}
function planning(v, from, to) {
  const e = ENTITIES.get(v.entity);
  const re = ENTITIES.get(e.fields.find((f) => f.name === v.resource).references);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(re.name)}`).get().n;
  const ids = db.prepare(`SELECT "id" FROM ${q(re.name)} ORDER BY "id" LIMIT ?`).all(PLANNING_MAX_RESOURCES).map((r) => r.id);
  const titles = displayTitles(re, ids);
  const coll = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
  const resources = ids.map((id) => ({ id, title: titles.get(id) ?? `#${id}` })).sort((a, b) => coll.compare(a.title, b.title) || a.id - b.id);
  const cols = [`"id"`, `${q(v.start)} AS "start"`, `${q(v.end)} AS "end"`, `${q(v.resource)} AS "resource"`, `${v.title ? q(v.title) : "NULL"} AS "title"`, `${v.status ? q(v.status) : "NULL"} AS "status"`];
  const rows = db.prepare(`SELECT ${cols.join(", ")} FROM ${q(e.name)} WHERE ${overlaps(v)} ORDER BY ${q(v.start)}, "id" LIMIT ?`).all(to, from, from, PLANNING_MAX_ITEMS + 1);
  const kept = rows.slice(0, PLANNING_MAX_ITEMS);
  const title = v.title ? textsOf(e, v.title, kept.map((r) => r.title)) : (() => {
    const own = displayTitles(e, kept.map((r) => r.id));
    return (_, r) => own.get(r.id) ?? null;
  })();
  // Ressource hors de la liste (au-delà de la limite) : son titre accompagne l'élément
  const known = new Set(ids);
  const others = displayTitles(re, kept.map((r) => r.resource).filter((x) => !blank(x) && !known.has(x)));
  return {
    view: v,
    from,
    to,
    resources,
    resources_total: total,
    items: kept.map((r) => ({ id: r.id, start: r.start, end: r.end, resource: r.resource, title: title(r.title, r), status: r.status, ...(others.has(r.resource) ? { resource_title: others.get(r.resource) } : {}) })),
    truncated: { items: rows.length > PLANNING_MAX_ITEMS, resources: total > ids.length },
  };
}
/** « Aujourd'hui » pour chaque planning : arrivées, départs, en cours, ressources occupées sur le total. */
function todayBoards(day) {
  return [...VIEWS.values()].map((v) => {
    const e = ENTITIES.get(v.entity);
    const re = ENTITIES.get(e.fields.find((f) => f.name === v.resource).references);
    const s = q(v.start);
    const en = q(v.end);
    const r = q(v.resource);
    const occupies = `${s} <= ? AND (CASE WHEN ${en} IS NULL OR ${en} <= ${s} THEN ${s} = ? ELSE ${en} > ? END)`;
    const count = (where, ...args) => db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)} WHERE ${where}`).get(...args).n;
    const pick = (where, ...args) => db.prepare(`SELECT "id", ${r} AS "resource", ${v.title ? q(v.title) : "NULL"} AS "title" FROM ${q(e.name)} WHERE ${where} ORDER BY "id" LIMIT 12`).all(...args);
    const arriving = pick(`${s} = ?`, day);
    const leaving = pick(`${en} = ? AND ${en} > ${s}`, day);
    const all = [...arriving, ...leaving];
    const rt = displayTitles(re, all.map((x) => x.resource));
    const tt = v.title ? textsOf(e, v.title, all.map((x) => x.title)) : () => null;
    const item = (x) => ({ id: x.id, title: tt(x.title), resource: blank(x.resource) ? null : (rt.get(x.resource) ?? `#${x.resource}`) });
    return {
      view: v.name,
      entity: e.name,
      day,
      arrivals: { total: count(`${s} = ?`, day), items: arriving.map(item) },
      departures: { total: count(`${en} = ? AND ${en} > ${s}`, day), items: leaving.map(item) },
      current: count(occupies, day, day, day),
      current_titles: v.title ? db.prepare(`SELECT COUNT(DISTINCT ${q(v.title)}) AS n FROM ${q(e.name)} WHERE ${q(v.title)} IS NOT NULL AND ${occupies}`).get(day, day, day).n : null,
      occupied: db.prepare(`SELECT COUNT(DISTINCT ${r}) AS n FROM ${q(e.name)} WHERE ${r} IS NOT NULL AND ${occupies}`).get(day, day, day).n,
      resources: db.prepare(`SELECT COUNT(*) AS n FROM ${q(re.name)}`).get().n,
    };
  });
}

/* Tableau de bord ------------------------------------------------------- */
function dashboard(todayParam = null) {
  const cards = SPEC.dashboard.cards.map((c) => {
    const e = ENTITIES.get(c.entity);
    if (c.kind === "sum") return { ...c, value: db.prepare(`SELECT COALESCE(SUM(${q(c.field)}), 0) AS v FROM ${q(e.name)}`).get().v };
    return { ...c, value: db.prepare(`SELECT COUNT(*) AS v FROM ${q(e.name)}`).get().v, migrated: db.prepare(`SELECT COUNT(*) AS v FROM ${q(e.name)} WHERE "_migrated" = 1`).get().v };
  });
  const breakdowns = SPEC.dashboard.breakdowns.map((b) => ({ ...b, values: db.prepare(`SELECT ${q(b.field)} AS value, COUNT(*) AS n FROM ${q(b.entity)} GROUP BY 1 ORDER BY 2 DESC`).all() }));
  const recent = db
    .prepare(`SELECT "ts", "user", "action", "entity", "record_id" FROM "_audit" WHERE "entity" IS NOT NULL ORDER BY "id" DESC LIMIT 8`)
    .all()
    .map((r) => {
      const e = ENTITIES.get(r.entity);
      // Enregistrement supprimé depuis : pas de titre (l'interface affiche « Libellé #id »)
      const exists = e && r.record_id !== null && db.prepare(`SELECT 1 FROM ${q(e.name)} WHERE "id" = ?`).get(r.record_id);
      return { ...r, title: exists ? (displayTitles(e, [r.record_id]).get(r.record_id) ?? null) : null };
    });
  const meta = Object.fromEntries(db.prepare(`SELECT "key", "value" FROM "_meta"`).all().map((r) => [r.key, r.value]));
  // Derniers enregistrements de chaque module de la navigation (les plus récents d'abord)
  const latest = SPEC.navigation
    .map((n) => ENTITIES.get(n.entity))
    .filter(Boolean)
    .map((e) => {
      const rows = db.prepare(`SELECT * FROM ${q(e.name)} ORDER BY "id" DESC LIMIT 5`).all();
      const refs = refTitles(e, rows);
      return { entity: e.name, total: db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)}`).get().n, rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })) };
    });
  // Activité réelle des 30 derniers jours (journal d'audit)
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const counts = Object.fromEntries(db.prepare(`SELECT "action", COUNT(*) AS n FROM "_audit" WHERE "ts" >= ? AND "action" IN ('create', 'update', 'delete', 'file_added') GROUP BY 1`).all(since).map((r) => [r.action, r.n]));
  const people = db.prepare(`SELECT COUNT(DISTINCT "user") AS n FROM "_audit" WHERE "ts" >= ? AND "action" IN ('create', 'update', 'delete', 'file_added')`).get(since).n;
  // « Aujourd'hui » (plannings) : jour de l'appareil de la personne s'il est fourni et valide, sinon celui du serveur
  const day = validDay(todayParam) ?? localDay();
  const today = VIEWS.size ? { day, boards: todayBoards(day) } : null;
  return { cards, breakdowns, recent, latest, today, activity: { since, ...counts, people }, migration: meta.migration_run ? { run: meta.migration_run, source_system: meta.source_system, migrated_at: meta.migrated_at } : null };
}

/* Sauvegardes ----------------------------------------------------------- */
function backup(sess, label = "manuelle") {
  const name = `${now().replace(/[:.]/g, "-")}-${label.replace(/[^\w-]/g, "")}.db`;
  db.exec(`VACUUM INTO '${path.join(BACKUPS, name).replace(/'/g, "''")}'`);
  audit(sess.user, "backup", null, null, null, { name });
  return { name, size: fs.statSync(path.join(BACKUPS, name)).size };
}
function restore(sess, name) {
  if (!/^[\w-]+\.db$/.test(name) || !fs.existsSync(path.join(BACKUPS, name))) throw new HttpError(404, "Sauvegarde introuvable");
  const safety = backup(sess, "avant-restauration");
  db.close();
  fs.copyFileSync(path.join(BACKUPS, name), DB_PATH);
  openDb();
  audit(sess.user, "restore", null, null, { safety: safety.name }, { name });
}

/* CSV (réversibilité : export des données) ------------------------------ */
function csv(e) {
  const cols = ["id", ...fieldsOf(e).map((f) => f.name), "_source_key", "_migrated", "_rules_version"];
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = db.prepare(`SELECT ${cols.map(q).join(", ")} FROM ${q(e.name)} ORDER BY "id"`).all();
  return "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n") + "\r\n";
}

/* Identité de l'entreprise (écran de connexion compris) ------------------- */
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
/** Logo facultatif : app.branding.logo (ou app.logo) = image data:… ou nom d'un fichier du dossier branding/. */
function logoSource() {
  const v = SPEC.app.branding?.logo ?? SPEC.app.logo ?? null;
  if (typeof v !== "string" || !v) return null;
  if (v.length <= 400000 && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(v)) return { url: v };
  if (/^[\w-]{1,80}\.(png|jpe?g|webp|svg)$/i.test(v)) {
    const file = path.join(BRANDING_DIR, v);
    if (fs.existsSync(file) && fs.statSync(file).size <= 2 * 1024 * 1024) return { url: "/api/branding/logo", file };
  }
  return null;
}
function branding() {
  const b = SPEC.app.branding ?? {};
  return {
    name: String(b.name || SPEC.app.company || SPEC.app.name),
    app_name: SPEC.app.name,
    company: SPEC.app.company ?? null,
    tagline: SPEC.app.tagline ?? "",
    primary_color: typeof b.primary_color === "string" && /^#[0-9a-f]{6}$/i.test(b.primary_color) ? b.primary_color : null,
    logo_text: String(b.logo_text ?? "").slice(0, 4),
    logo_url: logoSource()?.url ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Routage                                                              */
/* ------------------------------------------------------------------ */
const STATIC = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".png": "image/png" };

function clientAddress(req) {
  const peer = req.socket.remoteAddress ?? "";
  if (!TRUST_PROXY || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer)) return peer;
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return fwd || peer;
}

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const ip = clientAddress(req);
  if (!p.startsWith("/api/")) {
    const file = path.join(PUBLIC, p === "/" ? "index.html" : path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 200, fs.readFileSync(path.join(PUBLIC, "index.html")), STATIC[".html"]);
    const ext = path.extname(file);
    return send(res, 200, fs.readFileSync(file), STATIC[ext] ?? "application/octet-stream", ext === ".woff2" ? { "cache-control": "public, max-age=604800" } : {});
  }
  if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "Origine refusée");
  if (p === "/api/health") {
    syncRules();
    return send(res, 200, { ok: true, app: SPEC.app.id, name: SPEC.app.name, spec_version: SPEC.spec_version, rules_version: activeVersion(), pid: process.pid });
  }
  // Identité de l'entreprise : nécessaire avant la connexion (aucune donnée métier)
  if (p === "/api/branding" && req.method === "GET") return send(res, 200, branding());
  if (p === "/api/branding/logo" && req.method === "GET") {
    const src = logoSource();
    if (!src?.file) throw new HttpError(404, "Aucun logo");
    // Une image SVG ouverte directement ne doit rien exécuter dans ce logiciel
    return send(res, 200, fs.readFileSync(src.file), IMAGE_TYPES[path.extname(src.file).toLowerCase()] ?? "application/octet-stream", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "cache-control": "private, max-age=3600" });
  }

  if (p === "/api/auth/login" && req.method === "POST") {
    const { username, password } = await readJson(req, 10000);
    const ident = String(username ?? "").trim();
    const key = ident.includes("@") ? ident.toLowerCase() : ident;
    const u = (key && (db.prepare(`SELECT * FROM "_users" WHERE "username" = ?`).get(key) ?? (key.includes("@") ? db.prepare(`SELECT * FROM "_users" WHERE "email" = ?`).get(key) : null))) || null;
    // Deux compteurs : par visiteur (8 échecs) et par compte visé (30 échecs, quelle que soit l'adresse annoncée :
    // borne les essais même si un programme connecté directement choisit son adresse). Identifiant inconnu : compté de la même façon.
    const account = `account:${u ? u.id : key}`;
    assertNotLimited(`login:${ip}`);
    assertNotLimited(account);
    // scrypt est calculé même pour un identifiant inconnu : la réponse ne révèle pas quels comptes existent
    const ok = checkPassword(String(password ?? ""), u?.password_hash ?? fakeHash());
    if (!u || u.disabled || !ok) {
      countFailure(`login:${ip}`);
      countFailure(account, 30);
      throw new HttpError(401, "Identifiant ou mot de passe incorrect");
    }
    failures.delete(`login:${ip}`);
    failures.delete(account);
    audit(u.username, "login", null, null, null, null);
    return openSession(res, u, 200, { ok: true, user: u.username, role: u.role });
  }
  // Écran d'activation : à qui s'adresse le lien (sans rien consommer). Même limiteur que l'activation.
  if (p === "/api/auth/invitation" && req.method === "POST") {
    const body = await readJson(req, 2000);
    assertNotLimited(`activate:${ip}`);
    importInvites();
    const token = String(body.token ?? "");
    const inv = TOKEN_RE.test(token) ? db.prepare(`SELECT * FROM "_invites" WHERE "token_sha256" = ?`).get(sha256(token)) : null;
    if (!inv || inviteState(inv, closedHashes()) !== "pending") {
      // Seul un jeton inconnu compte comme tentative (essais au hasard) ; la réponse est la même dans tous les cas
      if (!inv) countFailure(`activate:${ip}`);
      throw new HttpError(410, "Ce lien d'activation n'est plus valable : il a expiré, a déjà servi ou a été révoqué. Demandez un nouveau lien à la personne qui vous a invité.");
    }
    const view = inviteView(inv);
    return send(res, 200, { email: view.email, role: view.role, expires_at: view.expires_at, existing_account: view.existing_account, password_min: PASSWORD_MIN });
  }
  if (p === "/api/auth/activate" && req.method === "POST") {
    const body = await readJson(req, 10000);
    assertNotLimited(`activate:${ip}`);
    importInvites();
    const token = String(body.token ?? "");
    const sha = TOKEN_RE.test(token) ? sha256(token) : null;
    const inv = sha ? db.prepare(`SELECT * FROM "_invites" WHERE "token_sha256" = ?`).get(sha) : null;
    if (!inv || inviteState(inv, closedHashes()) !== "pending") {
      if (!inv) countFailure(`activate:${ip}`);
      throw new HttpError(410, "Ce lien d'activation n'est plus valable : il a expiré, a déjà servi ou a été révoqué. Demandez un nouveau lien à la personne qui vous a invité.");
    }
    const password = String(body.password ?? "");
    const problem = passwordProblem(password, inv.email);
    if (problem) throw new HttpError(400, problem, { field: "password" });
    const hash = hashPassword(password);
    let account;
    db.exec("BEGIN IMMEDIATE");
    try {
      // Usage unique : seule la première activation passe (l'invitation est marquée dans la même transaction)
      if (db.prepare(`UPDATE "_invites" SET "consumed_at" = ? WHERE "id" = ? AND "consumed_at" IS NULL AND "revoked_at" IS NULL`).run(now(), inv.id).changes !== 1) throw new HttpError(410, "Ce lien d'activation a déjà servi.");
      const existing = db.prepare(`SELECT * FROM "_users" WHERE "username" = ? OR "email" = ?`).get(inv.email, inv.email);
      if (existing) {
        // Compte existant : nouveau mot de passe choisi, réactivé, anciennes sessions fermées, rôle inchangé
        db.prepare(`UPDATE "_users" SET "password_hash" = ?, "disabled" = 0, "session_epoch" = "session_epoch" + 1, "password_changed_at" = ?, "email" = COALESCE("email", ?) WHERE "id" = ?`).run(hash, now(), inv.email, existing.id);
        audit(existing.username, "password_reset", null, null, null, { invited_by: inv.created_by, reactivated: !!existing.disabled });
        account = existing.id;
      } else {
        account = Number(db.prepare(`INSERT INTO "_users" ("username", "email", "password_hash", "role", "created_at", "password_changed_at") VALUES (?, ?, ?, ?, ?, ?)`).run(inv.email, inv.email, hash, inv.role, now(), now()).lastInsertRowid);
        audit(inv.email, "user_activated", null, null, null, { role: inv.role, invited_by: inv.created_by });
      }
      db.exec("COMMIT");
    } catch (x) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw x;
    }
    closeHashes([sha]);
    forgetCliLink(sha);
    failures.delete(`activate:${ip}`);
    const u = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(account);
    return openSession(res, u, 200, { ok: true, user: u.username, role: u.role });
  }
  const sess = sessionOf(req);
  if (p === "/api/auth/logout" && req.method === "POST") {
    if (sess) sessions.delete(sess.sid);
    return send(res, 200, { ok: true }, undefined, { "set-cookie": sessionCookie("", 0) });
  }
  requireRole(sess, "viewer");
  let m;
  if (p === "/api/auth/me") {
    const u = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(sess.uid);
    return send(res, 200, { user: sess.user, role: sess.role, email: userView(u).email, created_at: u.created_at, password_changed_at: u.password_changed_at ?? null, last_login_at: u.last_login_at ?? null });
  }
  if (p === "/api/auth/password" && req.method === "POST") {
    const { current, next } = await readJson(req, 10000);
    assertNotLimited(`password:${sess.uid}`);
    const u = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(sess.uid);
    if (!checkPassword(String(current ?? ""), u.password_hash)) {
      countFailure(`password:${sess.uid}`);
      throw new HttpError(400, "Mot de passe actuel incorrect", { field: "current" });
    }
    const pw = String(next ?? "");
    const problem = passwordProblem(pw, u.username) ?? (checkPassword(pw, u.password_hash) ? "Le nouveau mot de passe doit être différent de l'actuel." : null);
    if (problem) throw new HttpError(400, problem, { field: "next" });
    // Toutes les sessions de ce compte sont fermées (session_epoch + 1) ; celle-ci est rouverte
    db.prepare(`UPDATE "_users" SET "password_hash" = ?, "session_epoch" = "session_epoch" + 1, "password_changed_at" = ? WHERE "id" = ?`).run(hashPassword(pw), now(), u.id);
    audit(sess.user, "password_changed", null, null, null, null);
    failures.delete(`password:${sess.uid}`);
    sessions.delete(sess.sid);
    return openSession(res, db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(u.id), 200, { ok: true, other_sessions_closed: true });
  }
  if (p === "/api/meta") {
    syncRules();
    const { ddl, ...spec } = SPEC;
    const entities = spec.entities.map((e) => {
      const outs = outputsOf(e);
      return { ...e, fields: fieldsOf(e).map((f) => (outs.has(f.name) ? { ...f, computed_by_rules: true } : f)), rules: { line: boundAnywhere(e.name, "line"), document: boundAnywhere(e.name, "document") } };
    });
    const counts = Object.fromEntries(SPEC.navigation.filter((n) => ENTITIES.has(n.entity)).map((n) => [n.entity, db.prepare(`SELECT COUNT(*) AS n FROM ${q(n.entity)}`).get().n]));
    const me = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(sess.uid);
    // Seules les vues valides (contrôlées au démarrage) sont proposées à l'interface
    return send(res, 200, { ...spec, entities, views: [...VIEWS.values()], rules: rulesInfo(), branding: branding(), counts, user: { name: sess.user, role: sess.role, email: userView(me).email } });
  }
  m = /^\/api\/views\/([a-z][a-z0-9_]{0,59})$/.exec(p);
  if (m) {
    if (req.method !== "GET") throw new HttpError(405, "Méthode non autorisée");
    const v = VIEWS.get(m[1]);
    if (!v) throw new HttpError(404, "Vue inconnue");
    const first = new Date();
    const from = url.searchParams.has("from") ? validDay(url.searchParams.get("from")) : localDay(new Date(first.getFullYear(), first.getMonth(), 1));
    const to = url.searchParams.has("to") ? validDay(url.searchParams.get("to")) : localDay(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    if (!from || !to) throw new HttpError(400, "Période invalide : dates AAAA-MM-JJ attendues (from, to)");
    if (to < from) throw new HttpError(400, "Période invalide : la fin précède le début");
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >= PLANNING_MAX_DAYS * 86400e3) throw new HttpError(400, `Période trop longue : ${PLANNING_MAX_DAYS} jours au plus`);
    return send(res, 200, planning(v, from, to));
  }
  if (p === "/api/search" && req.method === "GET") {
    const per = Math.min(20, Math.max(1, Number(url.searchParams.get("per") ?? 5) || 5));
    return send(res, 200, searchAll((url.searchParams.get("q") ?? "").trim().slice(0, 120), per));
  }
  if (p === "/api/rules" && req.method === "GET") {
    syncRules();
    return send(res, 200, rulesInfo(true));
  }
  if (p === "/api/rules/preview" && req.method === "POST") {
    requireRole(sess, "editor");
    syncRules();
    const body = await readJson(req, 100000);
    const e = entityOf(String(body.entity ?? ""));
    const base = body.id ? db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(Number(body.id)) : null;
    const row = { ...(base ?? {}) };
    for (const f of fieldsOf(e)) {
      const v = coerce(f, body.values?.[f.name]);
      if (v !== undefined && !outputsOf(e).has(f.name)) row[f.name] = v;
    }
    if (base?._migrated) return send(res, 200, { status: "historical", message: "Enregistrement historique : ses montants d'origine sont conservés" });
    const ctx = lineContext(e, row);
    if (!ctx) return send(res, 200, { status: "none", message: activeVersion() ? "Aucun calcul défini pour cette saisie" : "Calcul non disponible : aucun modèle métier publié" });
    const r = evaluateBinding(packages.get(ctx.version) ?? null, ctx.b, accessFor(e, row), (field) => fieldsOf(e).find((f) => f.name === field)?.type ?? null);
    return send(res, 200, { status: r.status, version: ctx.version, module: ctx.b.module, values: r.values, message: r.message, steps: (r.result?.trace ?? []).filter((t) => t.applied).map((t) => ({ label: t.label, rule_id: t.rule_id, delta: t.delta ?? null, after: t.after ?? null })) });
  }
  if (p === "/api/dashboard") return send(res, 200, dashboard(url.searchParams.get("today")));

  m = /^\/api\/e\/([a-z][a-z0-9_]*)(?:\/(\d+))?(?:\/(files|reprice))?$/.exec(p);
  if (m) {
    const e = entityOf(m[1]);
    const id = m[2] ? Number(m[2]) : null;
    if (m[3] === "reprice") {
      requireRole(sess, "editor");
      if (req.method !== "POST" || id === null) throw new HttpError(405, "Méthode non autorisée");
      return send(res, 200, reprice(e, id, sess));
    }
    if (m[3]) {
      requireRole(sess, "editor");
      const body = await readJson(req);
      const data = Buffer.from(String(body.content_base64 ?? ""), "base64");
      const name = String(body.filename ?? "").replace(/[\\/]/g, "_").slice(0, 200);
      if (!name || !data.length) throw new HttpError(400, "Fichier vide");
      if (data.length > 10 * 1024 * 1024) throw new HttpError(413, "10 Mo maximum");
      if (!db.prepare(`SELECT 1 FROM ${q(e.name)} WHERE "id" = ?`).get(id)) throw new HttpError(404, "Enregistrement introuvable");
      const digest = createHash("sha256").update(data).digest("hex");
      fs.writeFileSync(path.join(FILES, digest), data);
      const info = db.prepare(`INSERT INTO "_files" ("entity", "record_id", "filename", "mime", "size", "sha256", "storage", "_migrated", "created_at", "created_by") VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(e.name, id, name, String(body.mime ?? "application/octet-stream"), data.length, digest, digest, now(), sess.user);
      audit(sess.user, "file_added", e.name, id, null, { filename: name, sha256: digest });
      return send(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
    }
    if (req.method === "GET") return send(res, 200, id === null ? list(e, url.searchParams) : detail(e, id));
    requireRole(sess, "editor");
    if (req.method === "POST" && id === null) return send(res, 201, write(e, await readJson(req), sess));
    if (req.method === "PUT" && id !== null) return send(res, 200, write(e, await readJson(req), sess, id));
    if (req.method === "DELETE" && id !== null) {
      remove(e, id, sess);
      return send(res, 200, { ok: true });
    }
    throw new HttpError(405, "Méthode non autorisée");
  }
  m = /^\/api\/files\/(\d+)$/.exec(p);
  if (m) {
    const f = db.prepare(`SELECT * FROM "_files" WHERE "id" = ?`).get(Number(m[1]));
    const file = f && path.join(FILES, f.storage);
    if (!f || !fs.existsSync(file)) throw new HttpError(404, "Fichier introuvable");
    return send(res, 200, fs.readFileSync(file), f.mime ?? "application/octet-stream", { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}` });
  }
  m = /^\/api\/export\/([a-z][a-z0-9_]*)\.csv$/.exec(p);
  if (m) return send(res, 200, csv(entityOf(m[1])), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${m[1]}.csv"` });

  if (p.startsWith("/api/admin/")) {
    requireRole(sess, "admin");
    if (p === "/api/admin/audit") return send(res, 200, db.prepare(`SELECT * FROM "_audit" ORDER BY "id" DESC LIMIT ?`).all(Math.min(500, Number(url.searchParams.get("limit") ?? 100))));
    if (p === "/api/admin/backups" && req.method === "GET") return send(res, 200, fs.readdirSync(BACKUPS).filter((f) => f.endsWith(".db")).sort().reverse().map((f) => ({ name: f, size: fs.statSync(path.join(BACKUPS, f)).size })));
    if (p === "/api/admin/backups" && req.method === "POST") return send(res, 200, backup(sess));
    m = /^\/api\/admin\/backups\/([\w-]+\.db)\/restore$/.exec(p);
    if (m && req.method === "POST") {
      restore(sess, m[1]);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/admin/rules" && req.method === "POST") {
      const body = await readJson(req, 2 * 1024 * 1024);
      const pkg = body.package ?? body;
      try {
        checkPackage(pkg);
      } catch (x) {
        throw new HttpError(400, `Modèle métier refusé : ${x.message}`);
      }
      const created = importPackage(pkg, sess.user);
      fs.mkdirSync(RULES_DIR, { recursive: true });
      const file = path.join(RULES_DIR, `v${pkg.version}.json`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(pkg, null, 1));
      rulesStamp = null;
      syncRules();
      return send(res, created ? 201 : 200, { ok: true, version: pkg.version, created, active_version: activeVersion() });
    }
    if (p === "/api/admin/rules/active" && req.method === "POST") {
      const { version } = await readJson(req, 1000);
      if (!db.prepare(`SELECT 1 FROM "_rules" WHERE "version" = ?`).get(Number(version))) throw new HttpError(404, `Version ${version} du modèle métier inconnue`);
      fs.mkdirSync(RULES_DIR, { recursive: true });
      fs.writeFileSync(path.join(RULES_DIR, "active.json"), JSON.stringify({ version: Number(version), by: sess.user, at: now() }));
      db.prepare(`INSERT INTO "_meta" ("key", "value") VALUES ('rules_active_version', ?) ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`).run(String(Number(version)));
      audit(sess.user, "rules_activated", null, null, null, { version: Number(version) });
      rulesStamp = null;
      syncRules();
      return send(res, 200, { ok: true, active_version: activeVersion() });
    }
    if (p === "/api/admin/users" && req.method === "GET") return send(res, 200, db.prepare(`SELECT * FROM "_users" ORDER BY "id"`).all().map((u) => ({ ...userView(u), me: u.id === sess.uid })));
    // Compatibilité : création directe avec un mot de passe choisi par l'administrateur (l'écran passe par les invitations)
    if (p === "/api/admin/users" && req.method === "POST") {
      const { username, password, role } = await readJson(req, 10000);
      if (!/^[\w.-]{3,40}$/.test(String(username ?? ""))) throw new HttpError(400, "Identifiant : 3 à 40 caractères (lettres, chiffres, . _ -)");
      const problem = passwordProblem(String(password ?? ""), username);
      if (problem) throw new HttpError(400, problem);
      if (!Object.hasOwn(ROLES, String(role))) throw new HttpError(400, "Rôle : admin, editor ou viewer");
      try {
        db.prepare(`INSERT INTO "_users" ("username", "password_hash", "role", "created_at", "password_changed_at") VALUES (?, ?, ?, ?, ?)`).run(username, hashPassword(String(password)), role, now(), now());
      } catch {
        throw new HttpError(409, "Identifiant déjà utilisé");
      }
      audit(sess.user, "user_created", null, null, null, { username, role });
      return send(res, 201, { ok: true });
    }
    m = /^\/api\/admin\/users\/(\d+)$/.exec(p);
    if (m && req.method === "PUT") {
      const body = await readJson(req, 2000);
      const u = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(Number(m[1]));
      if (!u) throw new HttpError(404, "Compte introuvable");
      const role = body.role === undefined ? u.role : String(body.role);
      const disabled = body.disabled === undefined ? u.disabled : body.disabled ? 1 : 0;
      if (!Object.hasOwn(ROLES, role)) throw new HttpError(400, "Rôle : admin, editor ou viewer", { field: "role" });
      if (u.id === sess.uid && disabled) throw new HttpError(409, "Vous ne pouvez pas désactiver votre propre compte.");
      if (role !== u.role || disabled !== u.disabled) {
        db.exec("BEGIN IMMEDIATE");
        try {
          // Désactivation : toutes les sessions du compte sont fermées immédiatement
          db.prepare(`UPDATE "_users" SET "role" = ?, "disabled" = ?, "session_epoch" = "session_epoch" + ? WHERE "id" = ?`).run(role, disabled, disabled && !u.disabled ? 1 : 0, u.id);
          if (!db.prepare(`SELECT COUNT(*) AS n FROM "_users" WHERE "role" = 'admin' AND "disabled" = 0`).get().n) throw new HttpError(409, "Il doit toujours rester au moins un administrateur actif : désignez-en un autre avant ce changement.");
          audit(sess.user, "user_updated", null, null, { username: u.username, role: u.role, disabled: !!u.disabled }, { username: u.username, role, disabled: !!disabled });
          db.exec("COMMIT");
        } catch (x) {
          try {
            db.exec("ROLLBACK");
          } catch {}
          throw x;
        }
      }
      const after = db.prepare(`SELECT * FROM "_users" WHERE "id" = ?`).get(u.id);
      return send(res, 200, { ok: true, user: { ...userView(after), me: after.id === sess.uid } });
    }
    if (p === "/api/admin/invitations" && req.method === "GET") {
      importInvites();
      const closed = closedHashes();
      return send(res, 200, db.prepare(`SELECT * FROM "_invites" ORDER BY "id" DESC LIMIT 100`).all().map((r) => inviteView(r, closed)));
    }
    if (p === "/api/admin/invitations" && req.method === "POST") {
      const body = await readJson(req, 2000);
      const email = normEmail(body.email);
      if (!validEmail(email)) throw new HttpError(400, "Adresse e-mail invalide", { field: "email" });
      const role = String(body.role ?? "");
      if (!Object.hasOwn(ROLES, role)) throw new HttpError(400, "Choisissez un rôle", { field: "role" });
      const hours = body.hours === undefined ? INVITE_DEFAULT_HOURS : Number(body.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > INVITE_MAX_MS / 3600e3) throw new HttpError(400, "Validité : de 1 heure à 7 jours", { field: "hours" });
      importInvites();
      const out = createInvite({ email, role, hours, by: sess.user, source: "admin" });
      // Le lien n'est renvoyé qu'ici, une seule fois (jamais journalisé)
      return send(res, 201, { ok: true, invitation: out.invitation, path: `/#/activation/${out.token}` });
    }
    m = /^\/api\/admin\/invitations\/(\d+)\/revoke$/.exec(p);
    if (m && req.method === "POST") {
      importInvites();
      const r = db.prepare(`SELECT * FROM "_invites" WHERE "id" = ?`).get(Number(m[1]));
      if (!r) throw new HttpError(404, "Invitation introuvable");
      if (r.consumed_at) throw new HttpError(409, "Invitation déjà utilisée : pour retirer l'accès, désactivez le compte.");
      if (!r.revoked_at) {
        db.prepare(`UPDATE "_invites" SET "revoked_at" = ? WHERE "id" = ? AND "revoked_at" IS NULL AND "consumed_at" IS NULL`).run(now(), r.id);
        audit(sess.user, "invite_revoked", null, null, null, { email: r.email });
      }
      closeHashes([r.token_sha256]);
      forgetCliLink(r.token_sha256);
      return send(res, 200, { ok: true, invitation: inviteView(db.prepare(`SELECT * FROM "_invites" WHERE "id" = ?`).get(r.id)) });
    }
  }
  throw new HttpError(404, "Route inconnue");
}

// Accès de secours en ligne de commande : dépose une invitation sans démarrer le serveur ni ouvrir la base
if (process.argv[2] === "invite") process.exit(cliInvite(process.argv.slice(3)));

openDb();
const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message, details: e.details });
    console.error("[app] erreur", e);
    send(res, 500, { ok: false, error: "Erreur interne" });
  });
});
// Aucune ligne d'en-tête écartée (Node n'en garde que 1000 par défaut) : une requête remplie de lignes inutiles ne peut pas
// faire disparaître l'adresse ajoutée en dernier par le tunnel. La taille totale reste bornée (16 Kio).
server.maxHeadersCount = 0;
server.listen(PORT, HOST, () => {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, JSON.stringify({ pid: process.pid, port: PORT, host: HOST, app: SPEC.app.id, started_at: now() }));
  console.log(`[app] ${SPEC.app.name} en service sur http://${HOST}:${PORT} (processus ${process.pid})`);
});
const shutdown = () => {
  server.close();
  try {
    db.close();
  } catch {}
  try {
    if (JSON.parse(fs.readFileSync(PID_FILE, "utf8")).pid === process.pid) fs.rmSync(PID_FILE, { force: true });
  } catch {}
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
