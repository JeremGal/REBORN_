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
 *
 * Sécurité : sessions HttpOnly/SameSite=Strict, mots de passe scrypt, rôles (admin, editor,
 * viewer), contrôle d'origine sur les écritures, journal d'audit, sauvegardes cohérentes.
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
const DB_PATH = path.join(ROOT, "data", "app.db");
const FILES = path.join(ROOT, "files");
const BACKUPS = path.join(ROOT, "backups");
const PUBLIC = path.join(ROOT, "public");
/** Modèles métier versionnés déposés par REBORN Studio (ou par l'administrateur) : rules/v<N>.json. */
const RULES_DIR = path.join(ROOT, "rules");
/** Fichier de processus : permet d'arrêter ce logiciel sans dépendre du processus qui l'a lancé. */
const PID_FILE = path.join(ROOT, "run", "server.pid");
const ENTITIES = new Map(SPEC.entities.map((e) => [e.name, e]));
const ROLES = { admin: 3, editor: 2, viewer: 1 };
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

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
function sessionOf(req) {
  const m = /(?:^|;\s*)app_sid=([a-f0-9]{48})/.exec(req.headers.cookie ?? "");
  const s = m && sessions.get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  s.expires = Date.now() + 8 * 3600e3;
  return s;
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
const titleOf = (e, row) => (row ? String(row[e.title_field] ?? `#${row.id}`) : null);

function refTitles(e, rows) {
  const out = rows.map(() => ({}));
  for (const f of e.fields.filter((x) => x.type === "reference")) {
    const target = ENTITIES.get(f.references);
    const ids = [...new Set(rows.map((r) => r[f.name]).filter((v) => v !== null))];
    if (!ids.length || !target) continue;
    const found = new Map(db.prepare(`SELECT "id", ${q(target.title_field ?? "id")} AS t FROM ${q(target.name)} WHERE "id" IN (${ids.map(() => "?").join(",")})`).all(...ids).map((r) => [r.id, r.t]));
    rows.forEach((r, i) => {
      if (r[f.name] !== null) out[i][f.name] = found.get(r[f.name]) ?? `#${r[f.name]}`;
    });
  }
  return out;
}

function list(e, params) {
  const per = Math.min(200, Math.max(1, Number(params.get("per") ?? 25)));
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const where = [];
  const args = [];
  const search = (params.get("q") ?? "").trim();
  if (search) {
    const cols = e.search_fields.length ? e.search_fields : [e.title_field].filter(Boolean);
    where.push(`(${cols.map((c) => `${q(c)} LIKE ?`).join(" OR ")} OR "_source_key" = ?)`);
    args.push(...cols.map(() => `%${search}%`), search);
  }
  for (const f of e.fields) {
    const v = params.get(f.name);
    if (v !== null && v !== "") {
      where.push(`${q(f.name)} = ?`);
      args.push(["reference", "integer", "money", "boolean"].includes(f.type) ? Number(v) : v);
    }
  }
  if (params.get("_migrated") === "1" || params.get("_migrated") === "0") {
    where.push(`"_migrated" = ?`);
    args.push(Number(params.get("_migrated")));
  }
  const sortField = e.fields.some((f) => f.name === params.get("sort")) ? params.get("sort") : "id";
  const dir = params.get("dir") === "desc" ? "DESC" : "ASC";
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)} ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM ${q(e.name)} ${w} ORDER BY ${q(sortField)} ${dir}, "id" ${dir} LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const refs = refTitles(e, rows);
  return { rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })), total, page, per };
}

function detail(e, id) {
  const row = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id);
  if (!row) throw new HttpError(404, "Enregistrement introuvable");
  const children = {};
  for (const c of e.children) {
    const ce = ENTITIES.get(c.entity);
    const rows = db.prepare(`SELECT * FROM ${q(c.entity)} WHERE ${q(c.via)} = ? ORDER BY "id" DESC LIMIT 100`).all(id);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ${q(c.entity)} WHERE ${q(c.via)} = ?`).get(id).n;
    const refs = refTitles(ce, rows);
    children[`${c.entity}.${c.via}`] = { total, rows: rows.map((r, i) => ({ ...r, _refs: refs[i] })) };
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

/* Tableau de bord ------------------------------------------------------- */
function dashboard() {
  const cards = SPEC.dashboard.cards.map((c) => {
    const e = ENTITIES.get(c.entity);
    if (c.kind === "sum") return { ...c, value: db.prepare(`SELECT COALESCE(SUM(${q(c.field)}), 0) AS v FROM ${q(e.name)}`).get().v };
    return { ...c, value: db.prepare(`SELECT COUNT(*) AS v FROM ${q(e.name)}`).get().v, migrated: db.prepare(`SELECT COUNT(*) AS v FROM ${q(e.name)} WHERE "_migrated" = 1`).get().v };
  });
  const breakdowns = SPEC.dashboard.breakdowns.map((b) => ({ ...b, values: db.prepare(`SELECT ${q(b.field)} AS value, COUNT(*) AS n FROM ${q(b.entity)} GROUP BY 1 ORDER BY 2 DESC`).all() }));
  const recent = db.prepare(`SELECT "ts", "user", "action", "entity", "record_id" FROM "_audit" WHERE "entity" IS NOT NULL ORDER BY "id" DESC LIMIT 8`).all();
  const meta = Object.fromEntries(db.prepare(`SELECT "key", "value" FROM "_meta"`).all().map((r) => [r.key, r.value]));
  return { cards, breakdowns, recent, migration: meta.migration_run ? { run: meta.migration_run, source_system: meta.source_system, migrated_at: meta.migrated_at } : null };
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

/* ------------------------------------------------------------------ */
/* Routage                                                              */
/* ------------------------------------------------------------------ */
const STATIC = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const p = url.pathname;
  const ip = req.socket.remoteAddress ?? "";
  if (!p.startsWith("/api/")) {
    const file = path.join(PUBLIC, p === "/" ? "index.html" : path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 200, fs.readFileSync(path.join(PUBLIC, "index.html")), STATIC[".html"]);
    return send(res, 200, fs.readFileSync(file), STATIC[path.extname(file)] ?? "application/octet-stream");
  }
  if (req.method !== "GET" && !sameOrigin(req)) throw new HttpError(403, "Origine refusée");
  if (p === "/api/health") {
    syncRules();
    return send(res, 200, { ok: true, app: SPEC.app.id, name: SPEC.app.name, spec_version: SPEC.spec_version, rules_version: activeVersion(), pid: process.pid });
  }

  if (p === "/api/auth/login" && req.method === "POST") {
    const f = failures.get(ip) ?? { n: 0, until: 0 };
    if (f.until > Date.now()) throw new HttpError(429, "Trop de tentatives : réessayez dans quelques minutes");
    const { username, password } = await readJson(req, 10000);
    const u = db.prepare(`SELECT * FROM "_users" WHERE "username" = ? AND "disabled" = 0`).get(String(username ?? ""));
    if (!u || !checkPassword(password, u.password_hash)) {
      f.n++;
      if (f.n >= 8) Object.assign(f, { n: 0, until: Date.now() + 5 * 60e3 });
      failures.set(ip, f);
      throw new HttpError(401, "Identifiant ou mot de passe incorrect");
    }
    failures.delete(ip);
    const sid = randomBytes(24).toString("hex");
    sessions.set(sid, { user: u.username, role: u.role, expires: Date.now() + 8 * 3600e3 });
    audit(u.username, "login", null, null, null, null);
    return send(res, 200, { ok: true, user: u.username, role: u.role }, undefined, { "set-cookie": `app_sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800` });
  }
  const sess = sessionOf(req);
  if (p === "/api/auth/logout" && req.method === "POST") {
    for (const [k, v] of sessions) if (v === sess) sessions.delete(k);
    return send(res, 200, { ok: true }, undefined, { "set-cookie": "app_sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
  }
  requireRole(sess, "viewer");
  if (p === "/api/auth/me") return send(res, 200, { user: sess.user, role: sess.role });
  if (p === "/api/auth/password" && req.method === "POST") {
    const { current, next } = await readJson(req, 10000);
    const u = db.prepare(`SELECT * FROM "_users" WHERE "username" = ?`).get(sess.user);
    if (!checkPassword(current, u.password_hash)) throw new HttpError(400, "Mot de passe actuel incorrect");
    if (String(next ?? "").length < 10) throw new HttpError(400, "10 caractères minimum");
    db.prepare(`UPDATE "_users" SET "password_hash" = ? WHERE "id" = ?`).run(hashPassword(next), u.id);
    audit(sess.user, "password_changed", null, null, null, null);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/meta") {
    syncRules();
    const { ddl, ...spec } = SPEC;
    const entities = spec.entities.map((e) => {
      const outs = outputsOf(e);
      return { ...e, fields: fieldsOf(e).map((f) => (outs.has(f.name) ? { ...f, computed_by_rules: true } : f)), rules: { line: boundAnywhere(e.name, "line"), document: boundAnywhere(e.name, "document") } };
    });
    return send(res, 200, { ...spec, entities, rules: rulesInfo(), user: { name: sess.user, role: sess.role } });
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
  if (p === "/api/dashboard") return send(res, 200, dashboard());

  let m = /^\/api\/e\/([a-z][a-z0-9_]*)(?:\/(\d+))?(?:\/(files|reprice))?$/.exec(p);
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
    if (p === "/api/admin/users" && req.method === "GET") return send(res, 200, db.prepare(`SELECT "id", "username", "role", "created_at", "disabled" FROM "_users" ORDER BY "id"`).all());
    if (p === "/api/admin/users" && req.method === "POST") {
      const { username, password, role } = await readJson(req, 10000);
      if (!/^[\w.-]{3,40}$/.test(String(username ?? ""))) throw new HttpError(400, "Identifiant : 3 à 40 caractères (lettres, chiffres, . _ -)");
      if (String(password ?? "").length < 10) throw new HttpError(400, "Mot de passe : 10 caractères minimum");
      if (!ROLES[role]) throw new HttpError(400, "Rôle : admin, editor ou viewer");
      try {
        db.prepare(`INSERT INTO "_users" ("username", "password_hash", "role", "created_at") VALUES (?, ?, ?, ?)`).run(username, hashPassword(password), role, now());
      } catch {
        throw new HttpError(409, "Identifiant déjà utilisé");
      }
      audit(sess.user, "user_created", null, null, null, { username, role });
      return send(res, 201, { ok: true });
    }
  }
  throw new HttpError(404, "Route inconnue");
}

openDb();
const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message, details: e.details });
    console.error("[app] erreur", e);
    send(res, 500, { ok: false, error: "Erreur interne" });
  });
});
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
