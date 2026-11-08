import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors";
import { addEvent, scrubProjectState, type NewEvent } from "../store";
import { PROJECT_ID } from "./context";

/**
 * Identifiants de l'ancien logiciel confiés par le propriétaire (SPEC §5, cartographie r3.md §6).
 *
 * - Plafond de 24 h depuis le dépôt (refus au-delà). Expiration FERMÉE : une date illisible vaut
 *   « expiré ». Les fichiers de l'ancien format voient leur échéance ramenée à création + 24 h.
 * - Format v2 avec effacement cryptographique : une clé aléatoire (32 octets) PAR identifiant, rangée
 *   dans REBORN_KEYS_DIR (défaut <Studio>/.keys, 0700, ignoré par git, à exclure des sauvegardes ;
 *   voir keysDir() pour REBORN_DATA_DIR), enveloppée par la clé
 *   maîtresse <données>/vault.key. Chiffrement AES-256-GCM, données associées authentifiées
 *   « reborn/cred/v2|<projet>|<id>|<échéance> » : un fichier recopié dans un autre projet, ou dont
 *   l'échéance a été modifiée, est indéchiffrable. À l'effacement, la clé de l'identifiant est
 *   supprimée EN PREMIER : toute copie du fichier chiffré (sauvegarde de .data) devient illisible.
 * - vault.key n'est jamais régénérée en silence : absente alors que des chiffrés existent → erreur
 *   explicite (aucun nouvel identifiant accepté tant que l'opérateur n'a pas tranché).
 * - Jetons de remise à l'exécuteur : enregistrés par mission dans <projet>/missions.json (empreinte
 *   seulement), 15 min, usage unique, liés à la mission ET à l'exécuteur, révoqués au remplacement
 *   ou à l'effacement des identifiants, à la pause et à la fin de la mission.
 * - Balayage (sweepCredentials) : identifiants expirés ou illisibles, jetons expirés, clés orphelines,
 *   sur le disque (pas l'index : les orphelins sont aussi trouvés), même si personne ne revient.
 * - Horloge injectable (setClock) pour les tests.
 * - Jamais de valeur dans les évènements, journaux, réponses (hors remise au service habilité),
 *   project.json ou rapports : seul un indice masqué unique (maskUsername) est publié.
 *
 * Limites (déclarées) : la clé maîtresse est sur la même machine que les données ; sur un disque à
 * copie sur écriture (APFS, SSD), la suppression d'un fichier n'efface pas physiquement ses blocs :
 * l'effacement cryptographique protège les COPIES du chiffré, pas un accès brut au disque.
 */

export const CREDENTIALS_FORMAT_VERSION = 2;
export const MAX_TTL_HOURS = 24;
export const MIN_TTL_HOURS = 0.25;
export const REDEEM_TOKEN_TTL_MS = 15 * 60_000;
/** Une clé sans identifiant qui la référence n'est supprimée qu'après ce délai (écriture en cours). */
const ORPHAN_GRACE_MS = 2 * 60_000;
/**
 * Empreinte d'un jeton de remise échu (expiré, consommé ou révoqué) conservée une heure après son échéance,
 * à l'émission comme au balayage (lot C4) : le jeton est inutilisable dès son échéance, l'empreinte seule
 * (aucune valeur) garde le motif exact d'un refus (« expiré », « déjà utilisé », « révoqué ») pour l'exécuteur,
 * même si le balayage minute (handler(), instrumentation.ts) est passé entre-temps.
 */
const TOKEN_RECORD_GRACE_MS = 3600_000;

const FILE = "credentials.enc.json";
const LEGACY_REDEEM = "credentials.redeem.json";
const MISSIONS = "missions.json";
const CRED_ID = /^CRD_[0-9a-f]{16}$/;

/* ------------------------------------------------------------------ */
/* Horloge                                                              */
/* ------------------------------------------------------------------ */

export interface Clock {
  now(): number;
}
const SYSTEM_CLOCK: Clock = { now: () => Date.now() };
const gc = globalThis as unknown as { __rebornClock?: Clock };

/** Horloge des identifiants, jetons et missions (tests : +24 h, +15 min…). Renvoie la restauration. */
export function setClock(c: Clock | (() => number) | null): () => void {
  const prev = gc.__rebornClock;
  gc.__rebornClock = c === null ? undefined : typeof c === "function" ? { now: c } : c;
  return () => {
    gc.__rebornClock = prev;
  };
}
export const clockNow = () => (gc.__rebornClock ?? SYSTEM_CLOCK).now();
const iso = (ms: number) => new Date(ms).toISOString();

/* ------------------------------------------------------------------ */
/* Chemins                                                              */
/* ------------------------------------------------------------------ */

export const credentialsDataDir = () => process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data");
const migrationDir = () => path.join(/* turbopackIgnore: true */ credentialsDataDir(), "migration");
const masterKeyFile = () => path.join(/* turbopackIgnore: true */ credentialsDataDir(), "vault.key");

const within = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
function realOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Dossier des clés par identifiant (jamais dans .data/migration ; à exclure des sauvegardes) :
 * REBORN_KEYS_DIR ; sinon <Studio>/.keys ; avec REBORN_DATA_DIR seul, dossier voisin « <données>.keys »
 * (hors du dossier de données sauvegardé), sauf pour un dossier de données TEMPORAIRE (sous le dossier
 * temporaire du système : tests, piles isolées) où les clés vont dans <données>/.keys et disparaissent avec lui.
 */
export function keysDir(): string {
  const explicit = process.env.REBORN_KEYS_DIR?.trim();
  if (explicit) return path.resolve(/* turbopackIgnore: true */ explicit);
  const data = process.env.REBORN_DATA_DIR?.trim();
  if (!data) return path.join(/* turbopackIgnore: true */ process.cwd(), ".keys");
  const abs = path.resolve(/* turbopackIgnore: true */ data);
  const tmp = path.resolve(/* turbopackIgnore: true */ os.tmpdir());
  const temporary = within(abs, tmp) || within(realOrSelf(abs), realOrSelf(tmp));
  return temporary ? path.join(/* turbopackIgnore: true */ abs, ".keys") : `${abs}.keys`;
}
const keyFile = (id: string) => {
  if (!CRED_ID.test(id)) throw new Error("identifiant de clé invalide");
  return path.join(/* turbopackIgnore: true */ keysDir(), `${id}.key`);
};
/** Indice (non secret) du dossier de données propriétaire d'une clé : seules NOS clés orphelines sont supprimées. */
const ownerHint = () => createHash("sha256").update(path.resolve(/* turbopackIgnore: true */ credentialsDataDir())).digest("hex").slice(0, 16);

interface Target {
  dir: string;
  projectId: string | null;
}

function indexEntries(): { id: string; dir: string }[] {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ migrationDir(), "projects.json"), "utf8")) as { projects?: unknown };
    return Array.isArray(idx.projects) ? (idx.projects as { id?: unknown; dir?: unknown }[]).filter((p) => typeof p.id === "string" && PROJECT_ID.test(p.id) && typeof p.dir === "string").map((p) => ({ id: p.id as string, dir: p.dir as string })) : [];
  } catch {
    return [];
  }
}

/** Projet d'un dossier : index des projets, sinon nom du dossier, sinon project.json (projet historique à la racine). */
function projectIdOfDir(dir: string): string | null {
  const root = migrationDir();
  const abs = path.resolve(/* turbopackIgnore: true */ dir);
  const hit = indexEntries().find((e) => path.resolve(/* turbopackIgnore: true */ root, e.dir) === abs);
  if (hit) return hit.id;
  const base = path.basename(abs);
  if (PROJECT_ID.test(base)) return base;
  try {
    const id = (JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ abs, "project.json"), "utf8")) as { id?: unknown }).id;
    return typeof id === "string" && PROJECT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Référence : identifiant de projet (MIG_…) ou dossier du projet (compatibilité : projectRoot(id)). */
function resolveTarget(ref: string, projectId?: string | null): Target {
  if (PROJECT_ID.test(ref)) {
    const e = indexEntries().find((x) => x.id === ref);
    return { dir: e ? path.join(/* turbopackIgnore: true */ migrationDir(), e.dir) : path.join(/* turbopackIgnore: true */ migrationDir(), "projects", ref), projectId: ref };
  }
  return { dir: ref, projectId: projectId ?? projectIdOfDir(ref) };
}

/* ------------------------------------------------------------------ */
/* Masque unique                                                        */
/* ------------------------------------------------------------------ */

/** Seul indice publié d'un identifiant (premier et dernier caractère) : aucun autre masque n'est publié. */
export const maskUsername = (u: string) => (u.length <= 2 ? "•".repeat(u.length) : `${u[0]}${"•".repeat(Math.min(6, u.length - 2))}${u.at(-1)}`);

/**
 * Formes sous lesquelles un secret peut se retrouver dans un texte reçu d'un agent : brut ; encodé pour une
 * adresse (encodeURIComponent, encodeURI, majuscules ou minuscules) ou un formulaire (URLSearchParams) ;
 * échappé en JSON (y compris \uXXXX) ou en HTML ; hexadécimal ; base64 et base64url aux trois alignements
 * (seule la partie qui ne dépend que des octets du secret, par groupes entiers de 3 octets). Les formes
 * dérivées de moins de 8 caractères sont ignorées (trop courtes pour être distinctives), de même qu'une forme
 * hexadécimale de moins de 12 caractères ou faite seulement de chiffres (elle pourrait masquer un numéro ou un
 * montant : « test » donnerait 74657374).
 */
export function secretVariants(secret: string): string[] {
  const out = new Set<string>();
  const add = (v: string, min = 8) => {
    if (v && v.length >= min) out.add(v);
  };
  const addHex = (v: string) => {
    if (v.length >= 12 && /[a-f]/i.test(v)) out.add(v);
  };
  add(secret, 3);
  const lowerEscapes = (v: string) => v.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());
  for (const enc of [encodeURIComponent(secret), encodeURI(secret), new URLSearchParams({ x: secret }).toString().slice(2)]) {
    add(enc);
    add(lowerEscapes(enc));
  }
  const json = JSON.stringify(secret).slice(1, -1);
  add(json);
  add(json.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`));
  const html = secret.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  add(html.replace(/'/g, "&#39;"));
  add(html.replace(/'/g, "&#x27;"));
  const bytes = Buffer.from(secret, "utf8");
  addHex(bytes.toString("hex"));
  addHex(bytes.toString("hex").toUpperCase());
  // Secret placé à l'octet 0, 1 ou 2 d'un groupe base64 : premier octet entièrement codé par le secret = 0, 2 ou 1.
  for (const start of [0, 2, 1]) {
    const whole = Math.floor((bytes.length - start) / 3) * 3;
    if (whole <= 0) continue;
    const core = bytes.subarray(start, start + whole);
    add(core.toString("base64"));
    add(core.toString("base64url"));
  }
  return [...out];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Motif unique qui reconnaît toutes les formes de ces secrets (les plus longues d'abord), ou null s'il n'y en a aucune. */
export function secretPattern(secrets: readonly (string | undefined)[]): RegExp | null {
  const all = new Set<string>();
  for (const s of secrets) if (typeof s === "string" && s.length >= 3) for (const v of secretVariants(s)) all.add(v);
  if (!all.size) return null;
  return new RegExp([...all].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "g");
}

/** Texte libre débarrassé d'un motif de secrets (secretPattern) et de toute adresse avec identifiants (//u:p@). */
export function redactWith(text: string, pattern: RegExp | null): string {
  const out = text.replace(/(\/\/)[^/\s@]*:[^/\s@]*@/g, "$1•••@");
  return pattern ? out.replace(pattern, "•••") : out;
}

/** Remplace dans un texte libre (rapport d'un agent, refus d'un logiciel) toute occurrence d'un secret, sous toutes ses formes (secretVariants). */
export function redactText(text: string, secrets: readonly (string | undefined)[]): string {
  return redactWith(text, secretPattern(secrets));
}

/* ------------------------------------------------------------------ */
/* Clé maîtresse et clés par identifiant                                */
/* ------------------------------------------------------------------ */

const vaultUnavailable = (why: string) => new ApiError(503, `Coffre des identifiants indisponible : ${why}. Rien n'a été régénéré ; intervention de l'opérateur requise.`);

function encryptedCredentialsExist(): boolean {
  return projectDirsOnDisk().some((d) => fs.existsSync(path.join(/* turbopackIgnore: true */ d, FILE)));
}

function readMasterKey(): Buffer | null {
  let raw: string;
  try {
    raw = fs.readFileSync(masterKeyFile(), "utf8").trim();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw vaultUnavailable("la clé maîtresse vault.key est invalide (32 octets attendus)");
  return k;
}

function masterKey(create: boolean): Buffer {
  const existing = readMasterKey();
  if (existing) return existing;
  if (!create) throw vaultUnavailable("la clé maîtresse vault.key est absente");
  if (encryptedCredentialsExist()) {
    throw vaultUnavailable("la clé maîtresse vault.key est absente alors que des identifiants chiffrés existent (ils sont illisibles : restaurez la clé, ou supprimez ces identifiants avant d'en confier de nouveaux)");
  }
  fs.mkdirSync(credentialsDataDir(), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(masterKeyFile(), randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const k = readMasterKey();
  if (!k) throw vaultUnavailable("la clé maîtresse vault.key n'a pas pu être créée");
  return k;
}

interface WrappedKey {
  v: 2;
  id: string;
  owner: string;
  iv: string;
  tag: string;
  data: string;
}

const b64 = (b: Buffer) => b.toString("base64");
const keyAad = (id: string) => Buffer.from(`reborn/key/v2|${id}`, "utf8");

function ensureKeysDir() {
  const d = keysDir();
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(d, 0o700);
  } catch {}
}

function writeWrappedKey(id: string, dek: Buffer, master: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", master, iv);
  c.setAAD(keyAad(id));
  const data = Buffer.concat([c.update(dek), c.final()]);
  const w: WrappedKey = { v: 2, id, owner: ownerHint(), iv: b64(iv), tag: b64(c.getAuthTag()), data: b64(data) };
  ensureKeysDir();
  fs.writeFileSync(keyFile(id), JSON.stringify(w), { mode: 0o600, flag: "wx" });
}

function gcmDecrypt(key: Buffer, ivB64: string, tagB64: string, dataB64: string, aad: Buffer): Buffer {
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  // Longueurs imposées : un étiquette d'authentification tronquée affaiblirait GCM.
  if (iv.length !== 12 || tag.length !== 16) throw new Error("format chiffré invalide");
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(Buffer.from(dataB64, "base64")), d.final()]);
}

/** Clé de l'identifiant (déchiffrée en mémoire), ou null si elle est absente ou n'est pas la nôtre. */
function unwrapKey(id: string, master: Buffer): Buffer | null {
  let w: WrappedKey;
  try {
    w = JSON.parse(fs.readFileSync(keyFile(id), "utf8")) as WrappedKey;
  } catch {
    return null;
  }
  try {
    const dek = gcmDecrypt(master, w.iv, w.tag, w.data, keyAad(id));
    return dek.length === 32 ? dek : null;
  } catch {
    return null;
  }
}

function deleteKeyFile(id: string): boolean {
  try {
    fs.rmSync(keyFile(id));
    return true;
  } catch {
    return false;
  }
}

const keyFileExists = (id: string) => CRED_ID.test(id) && fs.existsSync(keyFile(id));

/* ------------------------------------------------------------------ */
/* Enregistrements                                                      */
/* ------------------------------------------------------------------ */

interface RecordV2 {
  v: 2;
  id: string;
  project_id: string;
  username_hint: string;
  created_at: string;
  expires_at: string;
  iv: string;
  tag: string;
  data: string;
}
/** Ancien format (sans version, chiffré directement par vault.key, sans données associées). */
interface RecordV1 {
  username_hint: string;
  created_at: string;
  expires_at: string;
  iv: string;
  tag: string;
  data: string;
}
type StoredRecord = RecordV2 | RecordV1;
const isV2 = (r: StoredRecord): r is RecordV2 => (r as RecordV2).v === 2;

function readRecord(dir: string): { rec: StoredRecord | null; corrupt: boolean } {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, FILE), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT" || (e as NodeJS.ErrnoException).code === "ENOTDIR") return { rec: null, corrupt: false };
    throw e;
  }
  try {
    const r = JSON.parse(raw) as Partial<RecordV2>;
    const strs = ["username_hint", "created_at", "expires_at", "iv", "tag", "data"] as const;
    if (r && typeof r === "object" && strs.every((k) => typeof r[k] === "string")) {
      if (r.v === undefined) return { rec: r as RecordV1, corrupt: false };
      if (r.v === 2 && typeof r.id === "string" && CRED_ID.test(r.id) && typeof r.project_id === "string") return { rec: r as RecordV2, corrupt: false };
    }
  } catch {}
  return { rec: null, corrupt: true };
}

/** Échéance effective (ms) : min(échéance enregistrée, dépôt + 24 h) ; null si une date est illisible. */
function effectiveExpiry(r: StoredRecord): number | null {
  const exp = Date.parse(r.expires_at);
  const created = Date.parse(r.created_at);
  if (!Number.isFinite(exp) || !Number.isFinite(created)) return null;
  return Math.min(exp, created + MAX_TTL_HOURS * 3600_000);
}
/** Expiration fermée : date illisible = expiré. */
const isExpired = (r: StoredRecord, now: number) => {
  const e = effectiveExpiry(r);
  return e === null || !(e > now);
};

function rmIfExists(f: string): boolean {
  try {
    fs.rmSync(f);
    return true;
  } catch {
    return false;
  }
}

/**
 * Effacement des fichiers d'un identifiant : clé d'abord (effacement cryptographique), puis le chiffré.
 * La clé n'est supprimée que si le chiffré appartient bien à ce projet (un chiffré recopié depuis un autre
 * projet ne doit jamais faire perdre sa clé à ce dernier).
 */
function eraseFiles(dir: string, projectId: string | null): boolean {
  let erased = false;
  let rec: StoredRecord | null = null;
  try {
    rec = readRecord(dir).rec;
  } catch {}
  // Tant que les valeurs sont encore déchiffrables (avant de supprimer la clé) : toute copie restée dans les
  // données du projet (journal, observations, schémas, project.json, missions) est masquée.
  if (rec && projectId) {
    const values = decryptForScrub(rec, projectId);
    if (values) scrubCopies(projectId, [values.password, values.username]);
  }
  if (rec && isV2(rec) && (!projectId || rec.project_id === projectId)) erased = deleteKeyFile(rec.id) || erased;
  erased = rmIfExists(path.join(/* turbopackIgnore: true */ dir, FILE)) || erased;
  rmIfExists(path.join(/* turbopackIgnore: true */ dir, LEGACY_REDEEM));
  return erased;
}

/**
 * Valeurs d'un identifiant encore déchiffrable, échéance ignorée : UNIQUEMENT pour masquer leurs copies juste
 * avant l'effacement (jamais renvoyées, jamais journalisées). Null si elles ne sont plus lisibles.
 */
function decryptForScrub(rec: StoredRecord, projectId: string): { username: string; password: string } | null {
  let master: Buffer | null = null;
  try {
    master = readMasterKey();
  } catch {
    return null;
  }
  if (!master) return null;
  let plain: Buffer | null = null;
  try {
    if (isV2(rec)) {
      if (rec.project_id !== projectId) return null;
      const dek = unwrapKey(rec.id, master);
      if (!dek) return null;
      try {
        plain = gcmDecrypt(dek, rec.iv, rec.tag, rec.data, Buffer.from(`reborn/cred/v2|${projectId}|${rec.id}|${rec.expires_at}`, "utf8"));
      } finally {
        dek.fill(0);
      }
    } else {
      plain = gcmDecrypt(master, rec.iv, rec.tag, rec.data, Buffer.alloc(0));
    }
    const v = JSON.parse(plain.toString("utf8")) as { username?: unknown; password?: unknown };
    return typeof v.username === "string" && typeof v.password === "string" ? { username: v.username, password: v.password } : null;
  } catch {
    return null;
  } finally {
    plain?.fill(0);
  }
}

/**
 * Masquage des copies d'un identifiant dans les données d'un projet, à son effacement (SPEC §5 : jamais dans
 * un journal ; 24 h au plus). Chaque module qui conserve du texte reçu d'un agent enregistre ici sa fonction
 * (project.json : lib/migration/project.ts ; missions : lib/migration/analysis.ts) ; le journal, les
 * observations et les schémas d'écran sont masqués par le store. `redact` ne connaît les valeurs qu'en mémoire.
 */
export type CopyScrubber = (projectId: string, redact: (text: string) => string) => void | Promise<void>;
const gsc = globalThis as unknown as { __rebornCopyScrubbers?: Map<string, CopyScrubber>; __rebornScrubbing?: Set<Promise<void>> };

export function registerCopyScrubber(name: string, fn: CopyScrubber): void {
  (gsc.__rebornCopyScrubbers ??= new Map()).set(name, fn);
}

/** Masquages encore en cours (écritures en base asynchrones) : pour les tests. */
export async function copyScrubsSettled(): Promise<void> {
  while (gsc.__rebornScrubbing?.size) await Promise.all([...gsc.__rebornScrubbing]);
}

function scrubCopies(projectId: string, secrets: string[]) {
  const pattern = secretPattern(secrets);
  if (!pattern) return;
  const redact = (t: string) => redactWith(t, pattern);
  const run = (name: string, fn: () => void | Promise<void>) => {
    try {
      const out = fn();
      if (out && typeof (out as Promise<void>).then === "function") {
        const pending = (gsc.__rebornScrubbing ??= new Set());
        const p: Promise<void> = (out as Promise<void>)
          .catch((e) => console.error(`[reborn] masquage des copies (${name}) :`, (e as Error)?.message ?? String(e)))
          .finally(() => pending.delete(p));
        pending.add(p);
      }
    } catch (e) {
      console.error(`[reborn] masquage des copies (${name}) :`, (e as Error)?.message ?? String(e));
    }
  };
  run("journal", () => {
    scrubProjectState(projectId, redact);
  });
  for (const [name, fn] of gsc.__rebornCopyScrubbers ?? []) run(name, () => fn(projectId, redact));
}

/** Évènement du journal du projet, sans aucune valeur secrète. */
function trace(projectId: string | null, title: string, detail?: string) {
  if (!projectId) return;
  try {
    addEvent({ source: "platform", type: "migration", title, detail, project_id: projectId, data: { project_id: projectId } } as NewEvent);
  } catch (e) {
    console.error("[reborn] identifiants : évènement non enregistré :", (e as Error).message);
  }
}

/** Identifiants devenus inutilisables (expirés, illisibles, clé absente) : tout est effacé et tracé. */
function dropUnusable(t: Target, why: "expired" | "corrupt" | "key") {
  revokeTokensIn(t.dir, why === "expired" ? "identifiants expirés" : "identifiants illisibles");
  if (!eraseFiles(t.dir, t.projectId)) return;
  trace(
    t.projectId,
    why === "expired" ? "Identifiants effacés : échéance de 24 h atteinte" : "Identifiants effacés : fichier chiffré illisible",
    "Effacement automatique. Les données déjà récupérées sont conservées.",
  );
}

/* ------------------------------------------------------------------ */
/* API                                                                  */
/* ------------------------------------------------------------------ */

export interface CredentialStatus {
  stored: boolean;
  username_hint?: string;
  created_at?: string;
  expires_at?: string;
}

/** État des identifiants (jamais leur valeur). Expirés ou illisibles : effacés, { stored: false }. */
export function credentialStatus(ref: string, projectId?: string | null): CredentialStatus {
  const t = resolveTarget(ref, projectId);
  const { rec, corrupt } = readRecord(t.dir);
  if (corrupt) {
    dropUnusable(t, "corrupt");
    return { stored: false };
  }
  if (!rec) return { stored: false };
  if (isV2(rec) && (!t.projectId || rec.project_id !== t.projectId)) {
    // Chiffré d'un autre projet recopié ici : inutilisable, retiré (la clé de l'autre projet est conservée).
    rmIfExists(path.join(/* turbopackIgnore: true */ t.dir, FILE));
    return { stored: false };
  }
  if (isExpired(rec, clockNow())) {
    dropUnusable(t, "expired");
    return { stored: false };
  }
  if (isV2(rec) && !keyFileExists(rec.id)) {
    dropUnusable(t, "key");
    return { stored: false };
  }
  // Clé maîtresse absente : inutilisables (fermé), mais conservés pour que l'opérateur puisse la restaurer.
  if (!fs.existsSync(masterKeyFile())) return { stored: false };
  return { stored: true, username_hint: rec.username_hint, created_at: rec.created_at, expires_at: iso(effectiveExpiry(rec)!) };
}

/**
 * Confie les identifiants au projet : chiffrés (format v2), 24 h au plus, jamais renvoyés.
 * Remplace les précédents : ancienne clé supprimée et TOUS les jetons de remise en cours révoqués.
 */
export function storeCredentials(ref: string, username: string, password: string, ttlHours: number = MAX_TTL_HOURS, opts: { projectId?: string } = {}): { id: string; username_hint: string; created_at: string; expires_at: string } {
  if (typeof ttlHours !== "number" || !Number.isFinite(ttlHours) || ttlHours < MIN_TTL_HOURS || ttlHours > MAX_TTL_HOURS) {
    throw new ApiError(400, `Durée de conservation des identifiants refusée : entre 15 minutes et ${MAX_TTL_HOURS} h au maximum`);
  }
  if (typeof username !== "string" || !username || username.length > 200 || typeof password !== "string" || !password || password.length > 500) {
    throw new ApiError(400, "Identifiant et mot de passe requis");
  }
  const t = resolveTarget(ref, opts.projectId);
  if (!t.projectId) throw new ApiError(404, "Projet introuvable");
  const master = masterKey(true);
  revokeTokensIn(t.dir, "identifiants remplacés");
  eraseFiles(t.dir, t.projectId);

  const id = `CRD_${randomBytes(8).toString("hex")}`;
  const now = clockNow();
  const created_at = iso(now);
  const expires_at = iso(now + ttlHours * 3600_000);
  const dek = randomBytes(32);
  const plain = Buffer.from(JSON.stringify({ username, password }), "utf8");
  try {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", dek, iv);
    c.setAAD(Buffer.from(`reborn/cred/v2|${t.projectId}|${id}|${expires_at}`, "utf8"));
    const data = Buffer.concat([c.update(plain), c.final()]);
    const rec: RecordV2 = { v: 2, id, project_id: t.projectId, username_hint: maskUsername(username), created_at, expires_at, iv: b64(iv), tag: b64(c.getAuthTag()), data: b64(data) };
    // Clé d'abord (un chiffré sans clé serait inutilisable), puis le chiffré, écrit de façon atomique.
    writeWrappedKey(id, dek, master);
    fs.mkdirSync(t.dir, { recursive: true });
    const f = path.join(/* turbopackIgnore: true */ t.dir, FILE);
    const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600 });
    fs.renameSync(tmp, f);
    return { id, username_hint: rec.username_hint, created_at, expires_at };
  } catch (e) {
    deleteKeyFile(id);
    throw e;
  } finally {
    dek.fill(0);
    plain.fill(0);
  }
}

/**
 * Usage interne uniquement (connecteur HTTP, remise à l'exécuteur, masquage) : jamais renvoyé tel
 * quel par l'API. Expirés, illisibles ou déplacés dans un autre projet : effacés, null.
 */
export function readCredentials(ref: string, projectId?: string | null): { username: string; password: string } | null {
  const t = resolveTarget(ref, projectId);
  const { rec, corrupt } = readRecord(t.dir);
  if (corrupt) {
    dropUnusable(t, "corrupt");
    return null;
  }
  if (!rec) return null;
  if (isExpired(rec, clockNow())) {
    dropUnusable(t, "expired");
    return null;
  }
  // Chiffré d'un AUTRE projet recopié ici : refusé et retiré de ce dossier, sans toucher à la clé (elle est
  // celle de l'autre projet, qui reste lisible).
  if (isV2(rec) && (!t.projectId || rec.project_id !== t.projectId)) {
    rmIfExists(path.join(/* turbopackIgnore: true */ t.dir, FILE));
    trace(t.projectId, "Identifiants effacés : fichier chiffré illisible", "Fichier chiffré d'un autre projet : refusé.");
    return null;
  }
  const master = masterKey(false);
  let plain: Buffer | null = null;
  try {
    if (isV2(rec)) {
      const dek = unwrapKey(rec.id, master);
      if (!dek) throw new Error("clé absente");
      try {
        plain = gcmDecrypt(dek, rec.iv, rec.tag, rec.data, Buffer.from(`reborn/cred/v2|${t.projectId}|${rec.id}|${rec.expires_at}`, "utf8"));
      } finally {
        dek.fill(0);
      }
    } else {
      plain = gcmDecrypt(master, rec.iv, rec.tag, rec.data, Buffer.alloc(0));
    }
    const v = JSON.parse(plain.toString("utf8")) as { username?: unknown; password?: unknown };
    if (typeof v.username !== "string" || typeof v.password !== "string") throw new Error("contenu invalide");
    return { username: v.username, password: v.password };
  } catch {
    dropUnusable(t, "key");
    return null;
  } finally {
    plain?.fill(0);
  }
}

/** Effacement immédiat (bas niveau, sans évènement) : jetons révoqués, clé supprimée en premier, puis le chiffré. */
export function forgetCredentials(ref: string, reason = "identifiants effacés", projectId?: string | null): { erased: boolean; revoked_at: string } {
  const t = resolveTarget(ref, projectId);
  const revoked_at = iso(clockNow());
  revokeTokensIn(t.dir, reason);
  return { erased: eraseFiles(t.dir, t.projectId), revoked_at };
}

/**
 * Effacement anticipé (SPEC §5) : extraction réussie, fin de mission, étape des correspondances
 * atteinte, changement d'adresse, mise en service, demande du client. Tracé sans valeur.
 * Les données métier déjà extraites (sources, correspondances, exécutions) ne sont jamais touchées.
 */
export function releaseCredentials(ref: string, reason: string, projectId?: string | null): { erased: boolean; revoked_at: string } {
  const t = resolveTarget(ref, projectId);
  const out = forgetCredentials(t.dir, reason, t.projectId);
  if (out.erased) trace(t.projectId, `Identifiants de l'ancien logiciel effacés : ${reason}`, "Les données déjà récupérées sont conservées.");
  return out;
}

/** Texte libre débarrassé des identifiants confiés au projet (et de toute URL avec identifiants). */
export function redactCredentials(text: string | undefined, ref: string, projectId?: string | null): string | undefined {
  if (text === undefined) return undefined;
  let creds: { username: string; password: string } | null = null;
  try {
    creds = readCredentials(ref, projectId);
  } catch {}
  return redactText(text, creds ? [creds.password, creds.username] : []);
}

/* ------------------------------------------------------------------ */
/* Jetons de remise (missions.json du projet)                           */
/* ------------------------------------------------------------------ */

interface TokenRecord {
  mission_id: string;
  executor_id?: string;
  token_hash: string;
  issued_at: string;
  expires_at: string;
  redeemed_at?: string;
  revoked_at?: string;
  reason?: string;
}
interface MissionsFile {
  v: 1;
  tokens: TokenRecord[];
}

const tokenHash = (t: string) => createHash("sha256").update(t, "utf8").digest("base64url");
const missionsFile = (dir: string) => path.join(/* turbopackIgnore: true */ dir, MISSIONS);

function readTokens(dir: string): TokenRecord[] {
  try {
    const m = JSON.parse(fs.readFileSync(missionsFile(dir), "utf8")) as Partial<MissionsFile>;
    return Array.isArray(m.tokens) ? m.tokens.filter((t) => t && typeof t.token_hash === "string" && typeof t.mission_id === "string") : [];
  } catch {
    return [];
  }
}

function writeTokens(dir: string, tokens: TokenRecord[]) {
  const f = missionsFile(dir);
  if (!tokens.length) {
    rmIfExists(f);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, tokens } satisfies MissionsFile), { mode: 0o600 });
  fs.renameSync(tmp, f);
}

const tokenActive = (t: TokenRecord, now: number) => !t.redeemed_at && !t.revoked_at && Date.parse(t.expires_at) > now;

function revokeTokensIn(dir: string, reason: string, filter: { mission_id?: string } = {}): number {
  const tokens = readTokens(dir);
  const now = clockNow();
  let n = 0;
  for (const t of tokens) {
    if (filter.mission_id && t.mission_id !== filter.mission_id) continue;
    if (!tokenActive(t, now)) continue;
    t.revoked_at = iso(now);
    t.reason = reason;
    n++;
  }
  if (n) writeTokens(dir, tokens);
  return n;
}

/** Révoque les jetons de remise en cours (tous, ou ceux d'une mission). */
export function revokeRedeemTokens(ref: string, reason: string, filter: { mission_id?: string } = {}): number {
  return revokeTokensIn(resolveTarget(ref).dir, reason, filter);
}

/** Jetons de remise encore utilisables (diagnostic et tests). */
export function activeRedeemTokens(ref: string): number {
  const now = clockNow();
  return readTokens(resolveTarget(ref).dir).filter((t) => tokenActive(t, now)).length;
}

/**
 * Jeton à usage unique (15 min, jamais au-delà de l'échéance des identifiants) permettant à
 * l'exécuteur titulaire de la mission d'obtenir les identifiants. Seule l'empreinte est enregistrée.
 */
export function issueRedeemToken(ref: string, opts: { mission_id: string; executor_id?: string }, projectId?: string | null): { token: string; issued_at: string; expires_at: string; mission_id: string } {
  const t = resolveTarget(ref, projectId);
  const status = credentialStatus(t.dir, t.projectId);
  if (!status.stored || !status.expires_at) throw new ApiError(409, "Aucun identifiant confié à ce projet (ou identifiants expirés)");
  const now = clockNow();
  const tokens = readTokens(t.dir).filter((x) => Date.parse(x.expires_at) > now - TOKEN_RECORD_GRACE_MS);
  for (const x of tokens) {
    if (x.mission_id === opts.mission_id && tokenActive(x, now)) Object.assign(x, { revoked_at: iso(now), reason: "jeton remplacé" });
  }
  const token = randomBytes(24).toString("base64url");
  const expires = Math.min(now + REDEEM_TOKEN_TTL_MS, Date.parse(status.expires_at));
  const rec: TokenRecord = { mission_id: opts.mission_id, ...(opts.executor_id ? { executor_id: opts.executor_id } : {}), token_hash: tokenHash(token), issued_at: iso(now), expires_at: iso(expires) };
  writeTokens(t.dir, [...tokens, rec]);
  return { token, issued_at: rec.issued_at, expires_at: rec.expires_at, mission_id: opts.mission_id };
}

export type RedeemRefusal = "invalid" | "expired" | "used" | "revoked" | "executor" | "mission" | "no_credentials";
export type RedeemOutcome = { ok: true; credentials: { username: string; password: string }; mission_id: string } | { ok: false; reason: RedeemRefusal };

/**
 * Échange d'un jeton contre les identifiants : une seule fois, avant l'échéance, par l'exécuteur
 * auquel il a été remis (un refus pour mauvais exécuteur ou mauvaise mission ne consomme pas le jeton).
 */
export function redeemToken(ref: string, token: string, opts: { executor_id?: string; mission_id?: string } = {}, projectId?: string | null): RedeemOutcome {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, reason: "invalid" };
  const t = resolveTarget(ref, projectId);
  const tokens = readTokens(t.dir);
  const presented = Buffer.from(tokenHash(token), "utf8");
  let hit: TokenRecord | undefined;
  for (const x of tokens) {
    const stored = Buffer.from(x.token_hash, "utf8");
    if (stored.length === presented.length && timingSafeEqual(stored, presented) && !hit) hit = x;
  }
  if (!hit) return { ok: false, reason: "invalid" };
  const now = clockNow();
  if (hit.revoked_at) return { ok: false, reason: "revoked" };
  if (hit.redeemed_at) return { ok: false, reason: "used" };
  if (!(Date.parse(hit.expires_at) > now)) return { ok: false, reason: "expired" };
  if (hit.executor_id && hit.executor_id !== opts.executor_id) return { ok: false, reason: "executor" };
  if (opts.mission_id && opts.mission_id !== hit.mission_id) return { ok: false, reason: "mission" };
  const missionId = hit.mission_id;
  const hash = hit.token_hash;
  const creds = readCredentials(t.dir, t.projectId);
  // Usage unique : le jeton est consommé avant de renvoyer quoi que ce soit (relu : la lecture des
  // identifiants peut avoir révoqué d'autres jetons entre-temps).
  const fresh = readTokens(t.dir);
  const rec = fresh.find((x) => x.token_hash === hash);
  if (rec) {
    rec.redeemed_at = iso(now);
    if (!creds) Object.assign(rec, { revoked_at: rec.revoked_at ?? iso(now), reason: rec.reason ?? "identifiants absents" });
    writeTokens(t.dir, fresh);
  }
  if (!creds || !rec) return { ok: false, reason: "no_credentials" };
  return { ok: true, credentials: creds, mission_id: missionId };
}

/* ------------------------------------------------------------------ */
/* Balayage                                                             */
/* ------------------------------------------------------------------ */

/** Dossiers de projet présents sur le disque (projet historique à la racine + projects/*), index ignoré. */
function projectDirsOnDisk(): string[] {
  const root = migrationDir();
  const out = [root];
  try {
    for (const d of fs.readdirSync(path.join(/* turbopackIgnore: true */ root, "projects"), { withFileTypes: true })) if (d.isDirectory()) out.push(path.join(/* turbopackIgnore: true */ root, "projects", d.name));
  } catch {}
  return out;
}

export interface SweepReport {
  credentials: number;
  tokens: number;
  keys: number;
}

/**
 * Supprime les identifiants expirés ou illisibles (clé d'abord), les jetons expirés et les clés
 * orphelines de CE dossier de données. Appelé au démarrage puis chaque minute (instrumentation.ts),
 * et au plus une fois par minute depuis les routes. N'écrit jamais de valeur.
 */
export function sweepCredentials(now: number = clockNow()): SweepReport {
  const report: SweepReport = { credentials: 0, tokens: 0, keys: 0 };
  const referenced = new Set<string>();
  for (const dir of projectDirsOnDisk()) {
    try {
      const { rec, corrupt } = readRecord(dir);
      const dirProject = projectIdOfDir(dir);
      if (rec && isV2(rec) && dirProject && rec.project_id !== dirProject) {
        // Chiffré d'un autre projet recopié ici : retiré, la clé (celle de l'autre projet) est conservée.
        if (rmIfExists(path.join(/* turbopackIgnore: true */ dir, FILE))) report.credentials++;
        continue;
      }
      const expired = !!rec && isExpired(rec, now);
      const keyMissing = !!rec && !expired && isV2(rec) && !keyFileExists(rec.id);
      if (corrupt || expired || keyMissing) {
        const projectId = rec && isV2(rec) && PROJECT_ID.test(rec.project_id) ? rec.project_id : dirProject;
        revokeTokensIn(dir, expired ? "identifiants expirés" : "identifiants illisibles");
        if (eraseFiles(dir, dirProject)) {
          report.credentials++;
          trace(projectId, expired ? "Identifiants effacés : échéance de 24 h atteinte" : "Identifiants effacés : fichier chiffré illisible", "Effacement automatique. Les données déjà récupérées sont conservées.");
        }
      } else if (rec && isV2(rec)) referenced.add(rec.id);
      // Jetons échus (expirés, consommés ou révoqués) : inutilisables dès l'échéance, empreinte supprimée une heure après
      const tokens = readTokens(dir);
      const keep = tokens.filter((x) => Date.parse(x.expires_at) > now - TOKEN_RECORD_GRACE_MS);
      if (keep.length !== tokens.length) {
        report.tokens += tokens.length - keep.length;
        writeTokens(dir, keep);
      }
      // Ancien fichier de jeton (format 1.0) : jamais relu par ce code, supprimé
      if (rmIfExists(path.join(/* turbopackIgnore: true */ dir, LEGACY_REDEEM))) report.tokens++;
    } catch (e) {
      console.error("[reborn] balayage des identifiants :", (e as Error).message);
    }
  }
  // Clés orphelines : seulement les nôtres (indice du dossier de données ET déchiffrables par notre clé maîtresse)
  let master: Buffer | null = null;
  try {
    master = readMasterKey();
  } catch {}
  let names: string[] = [];
  try {
    names = fs.readdirSync(keysDir());
  } catch {}
  for (const name of names) {
    const m = /^(CRD_[0-9a-f]{16})\.key$/.exec(name);
    if (!m || referenced.has(m[1]) || !master) continue;
    try {
      const f = keyFile(m[1]);
      if (now - fs.statSync(f).mtimeMs <= ORPHAN_GRACE_MS) continue;
      const w = JSON.parse(fs.readFileSync(f, "utf8")) as Partial<WrappedKey>;
      if (w.owner !== ownerHint()) continue;
      const dek = unwrapKey(m[1], master);
      if (!dek) continue;
      dek.fill(0);
      if (deleteKeyFile(m[1])) report.keys++;
    } catch {}
  }
  return report;
}
