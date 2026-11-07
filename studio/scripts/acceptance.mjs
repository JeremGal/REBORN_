#!/usr/bin/env node
/**
 * Tests d'acceptation de bout en bout — API et processus RÉELS, aucune donnée injectée dans la base
 * de destination : tout ce que contient le nouveau logiciel vient de la migration ou de ses utilisateurs.
 *
 *   1. Migration réelle      : ancien CRM SQLite synthétique → projet vide → analyse → correspondances
 *                              proposées et validées → migration → contrôle des volumes, relations, montants.
 *   2. Reconstruction        : CRM généré ; client créé, produit modifié, devis à 3 lignes calculé par le modèle.
 *   3. Versions des règles   : v2 publiée à chaud ; nouveau devis en v2, devis précédents inchangés.
 *   4. Indépendance          : Ctrl+C sur le Studio (tout son groupe de processus) ; le CRM continue ;
 *                              redémarrage du CRM seul ; données retrouvées.
 *   5. Sécurité comptable    : modification / suppression d'une facture historique refusées, valeur conservée.
 *
 * Studio et logiciel livré tournent dans un dossier temporaire, sur des ports libres.
 *   node scripts/acceptance.mjs            (construit le Studio si nécessaire)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { makeLegacyCrm, COUNTS } from "./acceptance/legacy-crm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = path.join(ROOT, "platform");
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
async function up(url, ms = 30000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return true;
    } catch {}
  }
  return false;
}
async function down(url, ms = 10000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
    } catch {
      return true;
    }
  }
  return false;
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

if (!fs.existsSync(path.join(PLATFORM, ".next", "BUILD_ID"))) {
  console.log("Construction du Studio (next build)…");
  if (spawnSync("npm", ["--prefix", PLATFORM, "run", "build"], { stdio: "inherit" }).status) process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-acceptation-"));
const studioPort = await freePort();
const crmPort = await freePort();
const S = `http://127.0.0.1:${studioPort}`;
const C = `http://127.0.0.1:${crmPort}`;
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", REBORN_DATA_DIR: path.join(tmp, "studio"), REBORN_APPS_DIR: path.join(tmp, "apps"), CRM_PORT: String(crmPort) };
const studioLog = fs.openSync(path.join(tmp, "studio.log"), "a");
// Groupe de processus propre : process.kill(-pid, "SIGINT") reproduit un Ctrl+C dans le terminal du Studio
const studio = spawn(process.execPath, [path.join(PLATFORM, "node_modules/next/dist/bin/next"), "start", "-p", String(studioPort), "-H", "127.0.0.1"], { cwd: PLATFORM, env, detached: true, stdio: ["ignore", studioLog, studioLog] });
let crmPid = null;
let crm2Pid = null;
let relatio = null;

async function api(method, p, body) {
  const r = await fetch(S + p, { method, headers: { "content-type": "application/json", origin: S }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  return { status: r.status, body: j };
}
let cookie = "";
async function crm(method, p, body) {
  const r = await fetch(C + p, { method, headers: { "content-type": "application/json", origin: C, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = t;
  }
  return { status: r.status, body: j };
}
const login = async (appId) => crm("POST", "/api/auth/login", { username: "admin", password: JSON.parse(fs.readFileSync(path.join(tmp, "apps", appId, ".secrets", "admin.json"), "utf8")).password });

try {
  if (!check("Studio démarré (processus réel, dossier temporaire)", await up(`${S}/api/health`))) throw new Error("Studio indisponible");

  /* ---------------- TEST 1 — Migration réelle -------------------------------- */
  console.log("\nTEST 1 — Migration réelle");
  const legacyFile = path.join(tmp, "ancien-crm.db");
  const legacy = makeLegacyCrm(legacyFile);
  check("Ancien CRM : vraie base SQLite", legacy.customers === COUNTS.customers && legacy.invoices === COUNTS.invoices, JSON.stringify(legacy));
  check("Projet REBORN vide créé", (await api("POST", "/api/migration/project", { name: "Acceptation", source_system: "CRM synthétique (SQLite)" })).status === 200);
  const src = await api("POST", "/api/migration/sources", { name: "ancien-crm.db", content_base64: fs.readFileSync(legacyFile).toString("base64") });
  check("Base importée par le mécanisme autorisé (dépôt de fichier)", src.status === 200 && src.body.source.tables.length === 6, `${src.body.source?.tables?.length ?? 0} tables`);
  const prof = (await api("GET", "/api/migration/profile")).body;
  check("Tables, types et relations analysés", prof.relations?.length === 5, `${prof.relations?.length} relations détectées`);
  const prop = await api("POST", "/api/migration/mapping?propose=auto");
  const items = prop.body.review?.items ?? [];
  check("Correspondances proposées, points incertains signalés", prop.status === 200 && items.length > 0, `${items.length} point(s) à valider dont ${items.filter((i) => i.kind === "accounting").length} de protection comptable`);
  check("Migration bloquée tant que les points ne sont pas validés", (await api("POST", "/api/migration/runs", {})).status === 409);
  for (const i of items) await api("POST", "/api/migration/decisions", { key: i.key, decision: "accepted", by: "acceptation" });
  const run = await api("POST", "/api/migration/runs", { by: "acceptation" });
  const runId = run.body.run?.id;
  const expectedRows = legacy.customers + legacy.leads + legacy.products + legacy.quotes + legacy.quote_lines + legacy.invoices;
  check("Migration exécutée", run.status === 200 && run.body.run.summary.imported === expectedRows && run.body.run.summary.rejected === 0, `${run.body.run?.summary?.imported}/${expectedRows} enregistrements, ${run.body.run?.summary?.rejected} rejet(s)`);
  check("Vérification indépendante sans contrôle bloquant", ["validated", "review"].includes(run.body.report?.status), `statut ${run.body.report?.status}, ${run.body.report?.checks} contrôles, ${run.body.report?.failed} en échec`);
  if (run.body.report?.status === "review") await api("POST", `/api/migration/runs/${runId}/acknowledge`, { comment: "Écarts examinés (acceptation)", by: "acceptation" });

  const bm = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/acceptance/business-model.json"), "utf8"));
  const pub = await api("POST", "/api/migration/business-model", bm);
  check("Modèle métier reçu (contrat business_model) — à valider", pub.status === 200 && pub.body.status === "proposed" && !pub.body.issues.some((i) => i.level === "error"), `v${pub.body.version}`);
  const hist = await api("POST", "/api/migration/business-model/check", { version: pub.body.version });
  const qb = hist.body.check?.bindings?.find((b) => b.id === "quotes");
  check("Modèle rejoué sur les devis historiques", qb && qb.identical === legacy.quotes, `${qb?.identical}/${qb?.checked} identiques au centime, ${qb?.rounding} arrondi(s), ${qb?.different} écart(s)`);
  check("Version validée par un responsable", (await api("POST", "/api/migration/business-model/decision", { version: pub.body.version, decision: "validated", comment: "Rejoué sur l'historique" })).status === 200);
  const dep = await api("POST", "/api/migration/deploy", { run_id: runId, by: "acceptation" });
  check("Nouveau logiciel généré et mis en service", dep.status === 200 && dep.body.url === C, dep.body.url ?? JSON.stringify(dep.body).slice(0, 200));
  const appId = dep.body.deployment?.app_dir ? path.basename(dep.body.deployment.app_dir) : "nouveau-logiciel";
  check("Connexion au nouveau logiciel (compte propre, pas le mot de passe de l'ancien)", (await login(appId)).status === 200);
  const count = async (e) => (await crm("GET", `/api/e/${e}?per=1`)).body.total;
  const volumes = Object.fromEntries(await Promise.all(["customers", "leads", "products", "quotes", "quote_lines", "invoices"].map(async (e) => [e, await count(e)])));
  check("Données réellement présentes dans la nouvelle base", Object.entries(volumes).every(([k, v]) => v === legacy[k]), JSON.stringify(volumes));
  const ldb = new DatabaseSync(legacyFile, { readOnly: true });
  const q7 = ldb.prepare("SELECT q.quote_number, c.company FROM quotes q JOIN customers c ON c.customer_id = q.customer_id WHERE q.quote_id = 7").get();
  const nq7 = (await crm("GET", `/api/e/quotes?q=${q7.quote_number}`)).body.rows[0];
  const cust7 = (await crm("GET", `/api/e/customers/${nq7.customer_id}`)).body.record;
  const lines7 = (await crm("GET", `/api/e/quotes/${nq7.id}`)).body.children?.["quote_lines.quote_id"]?.total;
  check("Relations conservées", cust7.company === q7.company && lines7 === ldb.prepare("SELECT COUNT(*) AS n FROM quote_lines WHERE quote_id = 7").get().n, `${q7.quote_number} → ${cust7.company}, ${lines7} lignes`);
  const csv = await (await fetch(`${C}/api/export/invoices.csv`, { headers: { cookie } })).text();
  const header = csv.replace(/^﻿/, "").split("\r\n")[0].split(";");
  const col = header.indexOf("amount_incl_tax");
  const sumCents = csv.split("\r\n").slice(1).filter(Boolean).reduce((s, l) => s + Number(l.split(";")[col]), 0);
  check("Montants identiques au centime", sumCents === Math.round(legacy.invoice_total_incl_tax * 100), `${sumCents / 100} € TTC facturés (source : ${legacy.invoice_total_incl_tax} €)`);

  /* ---------------- TEST 2 — Reconstruction fonctionnelle --------------------- */
  console.log("\nTEST 2 — Reconstruction fonctionnelle");
  const nc = await crm("POST", "/api/e/customers", { company: "Client créé après migration", email: "nouveau@client.fr", city: "Lyon", segment: "SMB" });
  check("Créer un client", nc.status === 201 && nc.body._migrated === 0);
  const p5 = (await crm("GET", "/api/e/products?q=SKU-0005")).body.rows[0];
  const up5 = await crm("PUT", `/api/e/products/${p5.id}`, { label: "Produit 5 (modifié)", unit_price: 19990 });
  check("Modifier un produit", up5.status === 200 && up5.body.unit_price === 19990);
  const q1 = await crm("POST", "/api/e/quotes", { quote_number: "Q-NEW-001", customer_id: nc.body.id, quote_date: "2026-11-07", status: "draft" });
  check("Créer un devis (calcul par le modèle v1)", q1.status === 201 && q1.body._rules_version === 1);
  const prods = await Promise.all(["SKU-0005", "SKU-0007", "SKU-0009"].map(async (s) => (await crm("GET", `/api/e/products?q=${s}`)).body.rows[0]));
  let expected = 0;
  let lineOk = true;
  for (const [i, p] of prods.entries()) {
    const l = await crm("POST", "/api/e/quote_lines", { quote_id: q1.body.id, product_id: p.id, quantity: i + 2 });
    expected += (i + 2) * p.unit_price;
    lineOk &&= l.status === 201 && l.body.line_total === (i + 2) * p.unit_price && l.body.unit_price === p.unit_price;
  }
  check("Ajouter 3 lignes : prix et montants calculés côté serveur", lineOk);
  const q1d = (await crm("GET", `/api/e/quotes/${q1.body.id}`)).body;
  check("Total du devis calculé à partir du modèle de règles", q1d.record.total_excl_tax === expected && q1d.children["quote_lines.quote_id"].total === 3, `${expected / 100} € HT`);
  check("Montant calculé non modifiable à la main", (await crm("PUT", `/api/e/quotes/${q1.body.id}`, { total_excl_tax: 1 })).status === 400);

  /* ---------------- TEST 3 — Nouvelle version des règles ---------------------- */
  console.log("\nTEST 3 — Modification des règles");
  const before = Number(ldb.prepare("SELECT ROUND(SUM(total_excl_tax) * 100) AS v FROM quotes").get().v);
  const v2 = structuredClone(bm);
  v2.modules["quote.document"].rules.push({ id: "QD-02", type: "customer_discount", stage: "discount", description: "Remise 10 % clients grands comptes (modification de test)", condition: { segment: "ENT" }, action: { discount_percent: 10 } });
  const p2 = await api("POST", "/api/migration/business-model", v2);
  await api("POST", "/api/migration/business-model/decision", { version: p2.body.version, decision: "validated", comment: "Nouvelle politique tarifaire" });
  const pr = await api("POST", "/api/migration/app/rules", { version: p2.body.version });
  check("Version v2 publiée dans le logiciel livré, prise en compte à chaud", pr.status === 200 && pr.body.active_version === p2.body.version, `version active : v${pr.body.active_version}`);
  const ent = (await crm("GET", "/api/e/customers?segment=ENT&per=1")).body.rows[0];
  const q2 = await crm("POST", "/api/e/quotes", { quote_number: "Q-NEW-002", customer_id: ent.id, quote_date: "2026-11-07", status: "draft" });
  for (const [i, p] of prods.entries()) await crm("POST", "/api/e/quote_lines", { quote_id: q2.body.id, product_id: p.id, quantity: i + 2 });
  const q2d = (await crm("GET", `/api/e/quotes/${q2.body.id}`)).body.record;
  check("Nouveau devis calculé avec la v2", q2d._rules_version === 2 && q2d.total_excl_tax === Math.round((expected * 90) / 100), `${q2d.total_excl_tax / 100} € HT (remise 10 %)`);
  const q1after = (await crm("GET", `/api/e/quotes/${q1.body.id}`)).body.record;
  check("Devis précédent inchangé (v1)", q1after.total_excl_tax === expected && q1after._rules_version === 1);
  const histNow = (await crm("GET", "/api/export/quotes.csv")).body;
  const hh = histNow.replace(/^﻿/, "").split("\r\n");
  const hc = hh[0].split(";");
  const histSum = hh.slice(1).filter(Boolean).filter((l) => l.split(";")[hc.indexOf("_migrated")] === "1").reduce((s, l) => s + Number(l.split(";")[hc.indexOf("total_excl_tax")]), 0);
  check("Montants historiques inchangés", histSum === before, `${histSum / 100} € HT pour les ${legacy.quotes} devis historiques`);

  /* ---------------- TEST 5 — Sécurité comptable ------------------------------- */
  console.log("\nTEST 5 — Sécurité comptable");
  const inv = (await crm("GET", "/api/e/invoices?_migrated=1&per=1")).body.rows[0];
  const put = await crm("PUT", `/api/e/invoices/${inv.id}`, { amount_incl_tax: 1 });
  check("Modification du montant d'une facture historique refusée", put.status === 409, put.body.error);
  check("Suppression d'une facture historique refusée", (await crm("DELETE", `/api/e/invoices/${inv.id}`)).status === 409);
  const invAfter = (await crm("GET", `/api/e/invoices/${inv.id}`)).body.record;
  check("La base conserve la valeur originale", invAfter.amount_incl_tax === inv.amount_incl_tax, `${inv.amount_incl_tax / 100} €`);
  const hq = (await crm("GET", "/api/e/quotes?_migrated=1&per=1")).body.rows[0];
  check("Lignes d'un devis historique non modifiables", (await crm("POST", "/api/e/quote_lines", { quote_id: hq.id, product_id: p5.id, quantity: 1 })).status === 409);
  const audit = (await crm("GET", "/api/admin/audit?limit=200")).body;
  check("Tentatives refusées tracées dans le journal", audit.some((a) => a.action === "update_refused") && audit.some((a) => a.action === "delete_refused"));

  /* ---------------- TEST 8 — Intégration Python (Mouss) ----------------------- */
  console.log("\nTEST 8 — Intégration Python (exemple de Mouss)");
  const pyMouss = spawnSync("python3", ["-I", path.join(ROOT, "clients/examples/mouss_connexion.py")], { env: { PATH: env.PATH, REBORN_URL: S }, encoding: "utf8" });
  check("Exemple de Mouss exécuté : mission, connexion rapportée, investigation rattachée, export déposé", pyMouss.status === 0 && /Export déposé/.test(pyMouss.stdout), pyMouss.status ? pyMouss.stderr.slice(0, 300) : pyMouss.stdout.trim().split("\n").at(-1));

  /* ---------------- TEST 6 — Généricité : seconde structure (Relatio 2004) ----- */
  console.log("\nTEST 6 — Généricité (Relatio 2004, extraction HTTP réelle) + exemple d'Alan");
  const relPort = await freePort();
  const R = `http://127.0.0.1:${relPort}`;
  const relLog = fs.openSync(path.join(tmp, "relatio.log"), "a");
  relatio = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { PATH: env.PATH, LEGACY_CRM_PORT: String(relPort), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: path.join(tmp, "relatio") }, detached: true, stdio: ["ignore", relLog, relLog] });
  check("Ancien CRM Relatio 2004 démarré (base SQLite générée)", await up(`${R}/login`, 60000));
  const relPassword = JSON.parse(fs.readFileSync(path.join(tmp, "relatio", ".credentials.json"), "utf8")).migration.password;
  const relProject = await api("POST", "/api/projects", { company: "Morel Équipements", software: "Relatio 2004", legacy_url: R, software_type: "CRM", authorized: true, authorized_by: "acceptation", credentials: { username: "migration", password: relPassword } });
  check("Second projet créé, identifiants chiffrés et jamais renvoyés", relProject.status === 201 && !JSON.stringify(relProject.body).includes(relPassword));
  const pid = relProject.body.project.id;
  const ct = await api("POST", `/api/projects/${pid}/connection/test`, { plan: "test" });
  check("Connexion réelle à l'ancien logiciel testée", ct.status === 200 && ct.body.connection === "connected", ct.body.detail ?? ct.body.error);
  const ex = await api("POST", `/api/migration/extract?project=${pid}`, { plan: "test" });
  const exr = ex.body.extraction?.results ?? [];
  check("Exports récupérés par le connecteur HTTP avec les identifiants du projet", ex.status === 200 && exr.filter((r) => r.status === "ok").length >= 8, `${exr.filter((r) => r.status === "ok").length} récupérés, ${exr.filter((r) => r.status === "forbidden" || r.status === "unauthorized").length} refusés au compte (consignés)`);
  const pyAlan = spawnSync("python3", ["-I", path.join(ROOT, "clients/examples/alan_modele_metier.py")], { env: { PATH: env.PATH, REBORN_URL: S, REBORN_PROJECT: pid }, encoding: "utf8" });
  check("Exemple d'Alan exécuté : correspondances + modèle métier reçus sans erreur", pyAlan.status === 0 && /Modèle métier v1 reçu — statut proposed, 0 erreur/.test(pyAlan.stdout), pyAlan.status ? pyAlan.stderr.slice(0, 300) : pyAlan.stdout.trim().split("\n").slice(0, 2).join(" · "));
  const plan2 = (await api("GET", `/api/migration/mapping?project=${pid}`)).body.status;
  for (const i of plan2.items.filter((x) => !x.decision)) await api("POST", `/api/migration/decisions?project=${pid}`, { key: i.key, decision: "accepted", by: "acceptation" });
  const r2 = await api("POST", `/api/migration/runs?project=${pid}`, { by: "acceptation" });
  check("Seconde structure migrée par le même moteur, sans code spécifique", r2.status === 200 && r2.body.run.summary.imported > 20000, `${r2.body.run?.summary?.imported} enregistrements, ${r2.body.run?.summary?.rejected} rejetés avec motif`);
  if (r2.body.report?.status === "review") await api("POST", `/api/migration/runs/${r2.body.run.id}/acknowledge?project=${pid}`, { comment: "Écarts documentés examinés (acceptation)", by: "acceptation" });
  const relCheck = await api("POST", `/api/migration/business-model/check?project=${pid}`, { version: 1 });
  const dv = relCheck.body.check?.bindings?.find((b) => b.id === "devis");
  check("Modèle métier Relatio rejoué sur les devis historiques", dv && dv.different === 0 && dv.not_computable === 0, dv ? `${dv.identical}/${dv.checked} identiques au centime, ${dv.rounding} écart(s) d'arrondi ≤ 2 centimes` : JSON.stringify(relCheck.body).slice(0, 200));
  await api("POST", `/api/migration/business-model/decision?project=${pid}`, { version: 1, decision: "validated", comment: "Rejoué sur l'historique" });
  const d2 = await api("POST", `/api/migration/deploy?project=${pid}`, { run_id: r2.body.run.id, by: "acceptation" });
  const C2 = d2.body.url;
  check("Deux logiciels livrés en même temps, sur deux ports distincts", d2.status === 200 && C2 !== C && (await up(`${C2}/api/health`)) && (await up(`${C}/api/health`)), `${C} et ${C2}`);
  crm2Pid = JSON.parse(fs.readFileSync(path.join(tmp, "apps", path.basename(d2.body.deployment.app_dir), "run", "server.pid"), "utf8")).pid;
  const projects = (await api("GET", "/api/projects")).body.projects;
  const synth = projects.find((x) => x.app?.id === appId);
  const morel = projects.find((x) => x.id === pid);
  check("Projets isolés : chacun ses données, son état, son logiciel", projects.length === 3 && synth?.status === "PUBLISHED" && morel?.status === "PUBLISHED" && synth.data.imported === expectedRows && morel.data.imported > 20000, projects.map((x) => `${x.company} : ${x.status_label}`).join(" · "));

  /* ---------------- TEST 4 — Indépendance ------------------------------------- */
  console.log("\nTEST 4 — Indépendance");
  crmPid = JSON.parse(fs.readFileSync(path.join(tmp, "apps", appId, "run", "server.pid"), "utf8")).pid;
  process.kill(-studio.pid, "SIGINT");
  check("REBORN Studio arrêté (Ctrl+C sur tout son groupe de processus)", await down(`${S}/api/health`));
  check("Les deux logiciels livrés restent opérationnels", (await crm("GET", "/api/health")).status === 200 && alive(crmPid) && alive(crm2Pid));
  try {
    process.kill(-relatio.pid, "SIGTERM");
  } catch {}
  check("Ancien logiciel (Relatio) arrêté lui aussi", await down(`${R}/login`));
  const lead = await crm("POST", "/api/e/leads", { company: "Prospect saisi sans le Studio" });
  check("Écriture sans le Studio ni l'ancien logiciel", lead.status === 201);
  process.kill(crmPid, "SIGTERM");
  check("CRM arrêté", await down(`${C}/api/health`));
  const crmLog = fs.openSync(path.join(tmp, "crm-seul.log"), "a");
  const solo = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: path.join(tmp, "apps", appId), env: { PATH: env.PATH, PORT: String(crmPort), HOST: "127.0.0.1" }, detached: true, stdio: ["ignore", crmLog, crmLog] });
  solo.unref();
  crmPid = solo.pid;
  check("CRM redémarré seul (node server.mjs)", await up(`${C}/api/health`));
  cookie = "";
  await login(appId);
  const again = {
    client: (await crm("GET", "/api/e/customers?q=Client créé après migration")).body.total,
    lead: (await crm("GET", "/api/e/leads?q=Prospect saisi sans le Studio")).body.total,
    quote: (await crm("GET", `/api/e/quotes/${q1.body.id}`)).body.record,
    rules: (await crm("GET", "/api/rules")).body.active_version,
  };
  check("Données retrouvées après redémarrage", again.client === 1 && again.lead === 1 && again.quote.total_excl_tax === expected && again.quote._rules_version === 1 && again.rules === p2.body.version);
} catch (e) {
  check("Exécution du scénario", false, e.message);
} finally {
  for (const pid of [crmPid, crm2Pid]) if (pid && alive(pid)) process.kill(pid, "SIGTERM");
  try {
    if (relatio) process.kill(-relatio.pid, "SIGTERM");
  } catch {}
  try {
    process.kill(-studio.pid, "SIGTERM");
  } catch {}
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies · dossier de test : ${tmp}`);
  process.exit(failed ? 1 : 0);
}
