#!/usr/bin/env node
/**
 * Relatio 2004 — CRM historique de test pour REBORN (logiciel SOURCE de la migration).
 *
 * Véritable base SQLite persistante (data/relatio.db, créée par seed.mjs), interface HTML
 * d'époque et mécanismes d'export soumis à des droits. REBORN n'a aucun accès privilégié :
 * il utilise le compte que le propriétaire lui confie et les exports que ce compte autorise.
 *
 *   node legacy-crm/server.mjs           → http://127.0.0.1:4100
 *   LEGACY_CRM_PORT=4200 LEGACY_CRM_DATA=/tmp/relatio node legacy-crm/server.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, seedDatabase } from "./seed.mjs";
import { EXPORTS, buildExport, contentType, sha256 } from "./lib/exports.mjs";

const PORT = Number(process.env.LEGACY_CRM_PORT ?? 4100);
const HOST = process.env.LEGACY_CRM_HOST ?? "127.0.0.1";
const dir = DATA_DIR();
if (!fs.existsSync(path.join(dir, "relatio.db"))) seedDatabase(dir);
const db = new DatabaseSync(path.join(dir, "relatio.db"));

const sessions = new Map(); // id → { login, rights:Set, expires }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const eur = (n) => (n === null || n === undefined ? "" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const LABEL = {
  CAT_CLI: { STD: "Standard", PRE: "Premium", PAR: "Partenaire" },
  ETAT: { AC: "Actif", SU: "Suspendu", RA: "Radié" },
  STATUT: { BR: "Brouillon", EN: "Envoyé", AC: "Accepté", RE: "Refusé", EX: "Expiré" },
  STATUT_PAI: { NP: "Non payée", PP: "Partiellement payée", PA: "Payée" },
};

const CSS = `body{margin:0;background:#d4d0c8;font:12px Tahoma,Verdana,sans-serif;color:#000}
.top{background:linear-gradient(#0a246a,#3a6ea5);color:#fff;padding:6px 10px;font-weight:bold;display:flex;justify-content:space-between}
.menu{background:#ece9d8;border-bottom:1px solid #808080;padding:4px 6px}.menu a{color:#000;text-decoration:none;padding:2px 8px;border:1px solid transparent}.menu a:hover{border-color:#808080 #fff #fff #808080;background:#fff}
.page{padding:10px}table{border-collapse:collapse;background:#fff;width:100%}th{background:#ece9d8;text-align:left;border:1px solid #808080;padding:3px 5px}td{border:1px solid #c0c0c0;padding:2px 5px;vertical-align:top}
h1{font-size:14px;margin:4px 0 8px}fieldset{border:1px solid #808080;background:#f4f3ee;margin:0 0 10px}.nav a{margin-right:6px}.lock{color:#a00}
input,button{font:inherit}.box{background:#fff;border:2px inset #fff;padding:8px;width:320px;margin:60px auto}.err{color:#a00}.num{text-align:right;white-space:nowrap}`;

function layout(sess, title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Relatio 2004 - ${esc(title)}</title><style>${CSS}</style></head><body>
<div class="top"><span>Relatio 2004 — Gestion commerciale · Ateliers Morel SA</span><span>${sess ? `Utilisateur : ${esc(sess.login)}` : ""}</span></div>
${sess ? `<div class="menu"><a href="/">Accueil</a><a href="/clients">Clients</a><a href="/prospects">Prospects</a><a href="/articles">Articles</a><a href="/devis">Devis</a><a href="/factures">Factures</a><a href="/exports">Exports</a><a href="/logout">Déconnexion</a></div>` : ""}
<div class="page">${body}</div></body></html>`;
}

function send(res, status, body, type = "text/html; charset=utf-8", extra = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 1e5) req.destroy();
    });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(b))));
  });
}

function session(req) {
  const m = /(?:^|;\s*)RELATIOSESSID=([a-f0-9]+)/.exec(req.headers.cookie ?? "");
  const s = m && sessions.get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return s;
}

function login(name, password) {
  const u = db.prepare("SELECT * FROM T_UTILISATEUR WHERE LOGIN = ?").get(String(name ?? ""));
  if (!u) return null;
  const a = scryptSync(String(password ?? ""), u.SEL, 32);
  const b = Buffer.from(u.HASH, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? { login: u.LOGIN, rights: new Set(u.DROITS.split(",")) } : null;
}

function list(sess, title, sql, countSql, cols, url, page, linkCol) {
  const per = 50;
  const total = db.prepare(countSql).get().n;
  const rows = db.prepare(`${sql} LIMIT ${per} OFFSET ${(page - 1) * per}`).all();
  const pages = Math.max(1, Math.ceil(total / per));
  const nav = `<p class="nav">${total} fiches · page ${page}/${pages} ${page > 1 ? `<a href="${url}?page=${page - 1}">◄ Précédente</a>` : ""}${page < pages ? `<a href="${url}?page=${page + 1}">Suivante ►</a>` : ""}</p>`;
  const body = `<h1>${esc(title)}</h1>${nav}<table><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr>${rows
    .map((r) => `<tr>${cols.map(([k, , f]) => `<td${f === eur ? ' class="num"' : ""}>${k === linkCol?.[0] ? `<a href="${linkCol[1]}/${r[linkCol[2]]}">${esc(r[k])}</a>` : esc(f ? f(r[k]) : r[k])}</td>`).join("")}</tr>`)
    .join("")}</table>${nav}`;
  return layout(sess, title, body);
}

function fiche(sess, title, row, fields) {
  return `<h1>${esc(title)}</h1><fieldset><table>${fields.map(([k, l, f]) => `<tr><th style="width:200px">${esc(l)}</th><td>${esc(f ? f(row[k]) : row[k])}</td></tr>`).join("")}</table></fieldset>`;
}

const routes = {
  "/": (sess) => {
    const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    return layout(sess, "Accueil", `<h1>Tableau de bord</h1><table style="width:auto">${[["Clients", "T_CLIENT"], ["Prospects", "T_PROSPECT"], ["Articles", "T_ARTICLE"], ["Devis", "T_DEVIS"], ["Factures", "T_FACTURE"], ["Règlements", "T_PAIEMENT"], ["Documents", "T_DOCUMENT"]].map(([l, t]) => `<tr><th>${l}</th><td class="num">${n(t)}</td></tr>`).join("")}</table>`);
  },
  "/clients": (sess, page) => list(sess, "Fichier clients", "SELECT * FROM T_CLIENT ORDER BY ID_CLI", "SELECT COUNT(*) n FROM T_CLIENT", [["CODE_CLI", "Code"], ["RAISON_SOC", "Raison sociale"], ["VILLE", "Ville"], ["CAT_CLI", "Catégorie", (v) => LABEL.CAT_CLI[v] ?? v], ["ETAT", "État", (v) => LABEL.ETAT[v] ?? v]], "/clients", page, ["CODE_CLI", "/clients", "ID_CLI"]),
  "/prospects": (sess, page) => list(sess, "Prospects", "SELECT * FROM T_PROSPECT ORDER BY ID_PROS", "SELECT COUNT(*) n FROM T_PROSPECT", [["ID_PROS", "N°"], ["SOCIETE", "Société"], ["CONTACT_NOM", "Nom"], ["CONTACT_PRENOM", "Prénom"], ["STADE", "Stade"], ["DATE_CONTACT", "Contact"]], "/prospects", page),
  "/articles": (sess, page) => list(sess, "Catalogue articles", "SELECT * FROM T_ARTICLE ORDER BY ID_ART", "SELECT COUNT(*) n FROM T_ARTICLE", [["REF_ART", "Référence"], ["LIBELLE", "Désignation"], ["FAMILLE", "Famille"], ["PRIX_HT", "Prix HT", eur], ["STOCK", "Stock"], ["ACTIF", "Actif"]], "/articles", page),
  "/devis": (sess, page) => list(sess, "Devis", "SELECT d.*, c.RAISON_SOC FROM T_DEVIS d LEFT JOIN T_CLIENT c ON c.ID_CLI = d.ID_CLI ORDER BY ID_DEV", "SELECT COUNT(*) n FROM T_DEVIS", [["NUM_DEV", "Numéro"], ["DATE_DEV", "Date"], ["RAISON_SOC", "Client"], ["STATUT", "Statut", (v) => LABEL.STATUT[v] ?? v], ["TOTAL_TTC", "Total TTC", eur]], "/devis", page, ["NUM_DEV", "/devis", "ID_DEV"]),
  "/factures": (sess, page) => list(sess, "Factures", "SELECT f.*, c.RAISON_SOC FROM T_FACTURE f LEFT JOIN T_CLIENT c ON c.ID_CLI = f.ID_CLI ORDER BY ID_FAC", "SELECT COUNT(*) n FROM T_FACTURE", [["NUM_FAC", "Numéro"], ["DATE_FAC", "Date"], ["RAISON_SOC", "Client"], ["TOTAL_TTC", "Total TTC", eur], ["STATUT_PAI", "Règlement", (v) => LABEL.STATUT_PAI[v] ?? v]], "/factures", page, ["NUM_FAC", "/factures", "ID_FAC"]),
};

function detail(sess, kind, id) {
  if (kind === "clients") {
    const c = db.prepare("SELECT * FROM T_CLIENT WHERE ID_CLI = ?").get(id);
    if (!c) return null;
    const dev = db.prepare("SELECT * FROM T_DEVIS WHERE ID_CLI = ? ORDER BY ID_DEV").all(id);
    const fac = db.prepare("SELECT * FROM T_FACTURE WHERE ID_CLI = ? ORDER BY ID_FAC").all(id);
    return layout(sess, c.CODE_CLI,
      fiche(sess, `Client ${c.CODE_CLI}`, c, [["CODE_CLI", "Code"], ["RAISON_SOC", "Raison sociale"], ["SIRET", "SIRET"], ["ADR1", "Adresse"], ["CP", "Code postal"], ["VILLE", "Ville"], ["PAYS", "Pays"], ["TEL", "Téléphone"], ["EMAIL", "E-mail"], ["CAT_CLI", "Catégorie", (v) => LABEL.CAT_CLI[v] ?? v], ["ETAT", "État", (v) => LABEL.ETAT[v] ?? v], ["DATE_CREA", "Créé le"], ["COMMERCIAL", "Commercial"], ["REMARQUES", "Remarques"]]) +
      `<h1>Devis (${dev.length})</h1><table><tr><th>Numéro</th><th>Date</th><th>Statut</th><th>Total TTC</th></tr>${dev.map((d) => `<tr><td><a href="/devis/${d.ID_DEV}">${esc(d.NUM_DEV)}</a></td><td>${esc(d.DATE_DEV)}</td><td>${esc(LABEL.STATUT[d.STATUT])}</td><td class="num">${eur(d.TOTAL_TTC)}</td></tr>`).join("")}</table>` +
      `<h1>Factures (${fac.length})</h1><table><tr><th>Numéro</th><th>Date</th><th>Total TTC</th><th>Règlement</th></tr>${fac.map((f) => `<tr><td><a href="/factures/${f.ID_FAC}">${esc(f.NUM_FAC)}</a></td><td>${esc(f.DATE_FAC)}</td><td class="num">${eur(f.TOTAL_TTC)}</td><td>${esc(LABEL.STATUT_PAI[f.STATUT_PAI])}</td></tr>`).join("")}</table>` + docs("CLI", id));
  }
  if (kind === "devis" || kind === "factures") {
    const isDev = kind === "devis";
    const h = db.prepare(isDev ? "SELECT d.*, c.RAISON_SOC FROM T_DEVIS d LEFT JOIN T_CLIENT c USING(ID_CLI) WHERE ID_DEV = ?" : "SELECT f.*, c.RAISON_SOC FROM T_FACTURE f LEFT JOIN T_CLIENT c USING(ID_CLI) WHERE ID_FAC = ?").get(id);
    if (!h) return null;
    const lines = db.prepare(isDev ? "SELECT l.*, a.REF_ART, a.LIBELLE FROM T_DEVIS_LIGNE l LEFT JOIN T_ARTICLE a USING(ID_ART) WHERE ID_DEV = ? ORDER BY ID_LIG" : "SELECT l.*, a.REF_ART, a.LIBELLE FROM T_FACTURE_LIGNE l LEFT JOIN T_ARTICLE a USING(ID_ART) WHERE ID_FAC = ? ORDER BY ID_LIG").all(id);
    const num = isDev ? h.NUM_DEV : h.NUM_FAC;
    return layout(sess, num,
      fiche(sess, `${isDev ? "Devis" : "Facture"} ${num}`, h, isDev ? [["NUM_DEV", "Numéro"], ["DATE_DEV", "Date"], ["RAISON_SOC", "Client"], ["STATUT", "Statut", (v) => LABEL.STATUT[v]], ["REMISE_PCT", "Remise globale %"], ["TOTAL_HT", "Total HT", eur], ["TOTAL_TVA", "TVA", eur], ["TOTAL_TTC", "Total TTC", eur]] : [["NUM_FAC", "Numéro"], ["DATE_FAC", "Date"], ["DATE_ECH", "Échéance"], ["RAISON_SOC", "Client"], ["TAUX_TVA", "Taux TVA %"], ["TOTAL_HT", "Total HT", eur], ["TOTAL_TVA", "TVA", eur], ["TOTAL_TTC", "Total TTC", eur], ["STATUT_PAI", "Règlement", (v) => LABEL.STATUT_PAI[v]]]) +
      `<h1>Lignes</h1><table><tr><th>Référence</th><th>Désignation</th><th>Qté</th><th>PU HT</th></tr>${lines.map((l) => `<tr><td>${esc(l.REF_ART ?? `(article ${l.ID_ART} supprimé)`)}</td><td>${esc(l.LIBELLE)}</td><td class="num">${l.QTE}</td><td class="num">${eur(l.PU_HT)}</td></tr>`).join("")}</table>` + docs(isDev ? "DEV" : "FAC", id));
  }
  return null;
}

function docs(type, id) {
  const d = db.prepare("SELECT * FROM T_DOCUMENT WHERE TYPE_LIEN = ? AND ID_LIEN = ?").all(type, id);
  return d.length ? `<h1>Documents</h1><ul>${d.map((x) => `<li><a href="/documents/${x.ID_DOC}">${esc(x.NOM_FICHIER)}</a></li>`).join("")}</ul>` : "";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/login") {
      if (req.method === "POST") {
        const f = await readBody(req);
        const u = login(f.utilisateur, f.motdepasse);
        if (!u) return send(res, 401, layout(null, "Connexion", `<div class="box"><p class="err">Identifiant ou mot de passe incorrect.</p><a href="/login">Réessayer</a></div>`));
        const sid = randomBytes(24).toString("hex");
        sessions.set(sid, { ...u, expires: Date.now() + 4 * 3600e3 });
        return send(res, 302, "", "text/plain", { location: "/", "set-cookie": `RELATIOSESSID=${sid}; Path=/; HttpOnly; SameSite=Lax` });
      }
      return send(res, 200, layout(null, "Connexion", `<form class="box" method="POST" action="/login"><h1>Connexion</h1><p><label>Utilisateur<br><input name="utilisateur" autocomplete="username"></label></p><p><label>Mot de passe<br><input name="motdepasse" type="password" autocomplete="current-password"></label></p><button>Valider</button></form>`));
    }
    const sess = session(req);
    if (!sess) {
      if (url.pathname.startsWith("/exports/") || url.pathname.startsWith("/documents/")) return send(res, 401, "Session requise", "text/plain; charset=utf-8");
      return send(res, 302, "", "text/plain", { location: "/login" });
    }
    if (url.pathname === "/logout") {
      for (const [k, v] of sessions) if (v === sess) sessions.delete(k);
      return send(res, 302, "", "text/plain", { location: "/login" });
    }
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    if (routes[url.pathname]) return send(res, 200, routes[url.pathname](sess, page));
    const m = /^\/(clients|devis|factures)\/(\d+)$/.exec(url.pathname);
    if (m) {
      const html = detail(sess, m[1], Number(m[2]));
      return html ? send(res, 200, html) : send(res, 404, layout(sess, "Introuvable", "<p>Fiche introuvable.</p>"));
    }
    const doc = /^\/documents\/(\d+)$/.exec(url.pathname);
    if (doc) {
      const d = db.prepare("SELECT * FROM T_DOCUMENT WHERE ID_DOC = ?").get(Number(doc[1]));
      const p = d && path.join(dir, "files", d.CHEMIN);
      if (!p || !fs.existsSync(p)) return send(res, 404, "Fichier introuvable sur le serveur", "text/plain; charset=utf-8");
      return send(res, 200, fs.readFileSync(p), "application/pdf");
    }
    if (url.pathname === "/exports") {
      return send(res, 200, layout(sess, "Exports", `<h1>Exports de données</h1><p>Les exports disponibles dépendent des droits du compte connecté (${esc([...sess.rights].join(", "))}).</p><table><tr><th>Export</th><th>Fichier</th><th>Format</th><th>Droit requis</th></tr>${EXPORTS.map((e) => `<tr><td>${esc(e.label)}</td><td>${sess.rights.has(e.right) ? `<a href="/exports/${e.file}">${e.file}</a>` : `<span class="lock">${e.file} (accès refusé)</span>`}</td><td>${e.format.toUpperCase()}</td><td>${e.right}</td></tr>`).join("")}<tr><td>Manifeste (contrôle d'intégrité)</td><td><a href="/exports/manifest.json">manifest.json</a></td><td>JSON</td><td>export</td></tr></table>`));
    }
    if (url.pathname === "/exports/manifest.json") {
      if (!sess.rights.has("export")) return send(res, 403, "Droit « export » requis", "text/plain; charset=utf-8");
      const exports = EXPORTS.filter((e) => sess.rights.has(e.right)).map((e) => {
        const out = buildExport(db, dir, e);
        return { file: e.file, format: e.format, table: e.table, rows: out.rows, bytes: out.bytes.length, sha256: sha256(out.bytes) };
      });
      return send(res, 200, JSON.stringify({ system: "Relatio 2004", version: "4.2.7", exports }, null, 1), "application/json; charset=utf-8");
    }
    const exp = EXPORTS.find((e) => url.pathname === `/exports/${e.file}`);
    if (exp) {
      if (!sess.rights.has(exp.right)) return send(res, 403, `Accès refusé : droit « ${exp.right} » requis`, "text/plain; charset=utf-8");
      const out = buildExport(db, dir, exp);
      return send(res, 200, out.bytes, contentType(exp), { "content-disposition": `attachment; filename="${exp.file}"` });
    }
    send(res, 404, layout(sess, "Introuvable", "<p>Page introuvable.</p>"));
  } catch (e) {
    console.error(e);
    send(res, 500, "ERREUR SYSTEME", "text/plain");
  }
});

server.listen(PORT, HOST, () => console.log(`[relatio] Relatio 2004 (CRM source) en écoute sur http://${HOST}:${PORT}`));
