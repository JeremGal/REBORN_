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
import { compile, evaluate } from "./lib/expr.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
const PORT = Number(process.env.PORT ?? SPEC.app.port ?? 5050);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = path.join(ROOT, "data", "app.db");
const FILES = path.join(ROOT, "files");
const BACKUPS = path.join(ROOT, "backups");
const PUBLIC = path.join(ROOT, "public");
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
  bootstrapAdmin();
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

/** Un document comptable historique (champ comptable + migré) n'est jamais modifié ni complété. */
function lockedParent(e, body) {
  for (const f of e.fields.filter((x) => x.type === "reference")) {
    const parent = ENTITIES.get(f.references);
    const id = body[f.name];
    if (!parent || id === null || id === undefined) continue;
    if (!parent.fields.some((x) => x.accounting)) continue;
    if (!(parent.aggregates ?? []).some((a) => a.children === e.name && a.via === f.name)) continue;
    const p = db.prepare(`SELECT "_migrated" FROM ${q(parent.name)} WHERE "id" = ?`).get(id);
    if (p?._migrated) throw new HttpError(409, `${parent.label_singular ?? parent.name} historique migré : document comptable non modifiable (émettre un nouveau document pour toute correction)`);
  }
}

function write(e, body, sess, id = null) {
  const unknown = Object.keys(body).filter((k) => !e.fields.some((f) => f.name === k) && k !== "_justification");
  if (unknown.length) throw new HttpError(400, `Champs inconnus : ${unknown.join(", ")}`);
  const before = id ? db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(id) : null;
  if (id && !before) throw new HttpError(404, "Enregistrement introuvable");
  const values = {};
  for (const f of e.fields) {
    const v = coerce(f, body[f.name]);
    if (v !== undefined) values[f.name] = v;
  }
  if (before?._migrated) {
    const locked = e.fields.filter((f) => f.accounting && f.name in values && values[f.name] !== before[f.name]);
    if (locked.length) throw new HttpError(409, `Donnée comptable historique non modifiable : ${locked.map((f) => f.label).join(", ")}`);
  }
  const row = { ...(before ?? {}), ...values };
  if (!before?._migrated) computeFields(e, row);
  const missing = e.fields.filter((f) => f.required && (row[f.name] === null || row[f.name] === undefined || row[f.name] === ""));
  if (missing.length) throw new HttpError(400, `Champs obligatoires : ${missing.map((f) => f.label).join(", ")}`);
  lockedParent(e, row);
  if (before) lockedParent(e, before);
  const cols = e.fields.filter((f) => row[f.name] !== undefined && (!before || row[f.name] !== before[f.name]));
  try {
    db.exec("BEGIN");
    let newId = id;
    if (before) {
      if (cols.length) db.prepare(`UPDATE ${q(e.name)} SET ${cols.map((f) => `${q(f.name)} = ?`).join(", ")}, "_updated_at" = ? WHERE "id" = ?`).run(...cols.map((f) => row[f.name]), now(), id);
    } else {
      const info = db.prepare(`INSERT INTO ${q(e.name)} (${cols.map((f) => q(f.name)).join(", ")}${cols.length ? ", " : ""}"_migrated") VALUES (${cols.map(() => "?").join(", ")}${cols.length ? ", " : ""}0)`).run(...cols.map((f) => row[f.name]));
      newId = Number(info.lastInsertRowid);
    }
    const after = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`).get(newId);
    if (!before || cols.length) audit(sess.user, before ? "update" : "create", e.name, newId, before ? pick(before, cols) : null, pick(after, before ? cols : e.fields), body._justification ?? null);
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
  if (before._migrated && e.fields.some((f) => f.accounting)) throw new HttpError(409, "Document comptable historique : suppression interdite");
  lockedParent(e, before);
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
    audit(sess.user, "delete", e.name, id, pick(before, e.fields), null);
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
  const cols = ["id", ...e.fields.map((f) => f.name), "_source_key", "_migrated"];
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
  if (p === "/api/health") return send(res, 200, { ok: true, app: SPEC.app.id, name: SPEC.app.name, spec_version: SPEC.spec_version });

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
    const { ddl, ...spec } = SPEC;
    return send(res, 200, { ...spec, user: { name: sess.user, role: sess.role } });
  }
  if (p === "/api/dashboard") return send(res, 200, dashboard());

  let m = /^\/api\/e\/([a-z][a-z0-9_]*)(?:\/(\d+))?(?:\/(files))?$/.exec(p);
  if (m) {
    const e = entityOf(m[1]);
    const id = m[2] ? Number(m[2]) : null;
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
server.listen(PORT, HOST, () => console.log(`[app] ${SPEC.app.name} en service sur http://${HOST}:${PORT}`));
const shutdown = () => {
  server.close();
  try {
    db.close();
  } catch {}
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
