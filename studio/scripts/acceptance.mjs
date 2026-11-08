#!/usr/bin/env node
/**
 * Tests d'acceptation de bout en bout — API et processus RÉELS sur une pile ISOLÉE : Studio de
 * production (build dédié), ancien logiciel de test Relatio 2004, logiciels livrés, dans un dossier
 * temporaire et sur des ports libres, avec des secrets aléatoires. Aucune donnée injectée dans la base de
 * destination : tout ce que contient le nouveau logiciel vient de la migration ou de ses utilisateurs.
 *
 *   0. Comptes              : inscription réelle (consentements), refus sans consentement, déconnexion et
 *                             reconnexion, rôle opérateur donné par scripts/account.mjs (jamais par l'API).
 *   1. Migration réelle     : client A — ancien CRM SQLite synthétique → projet → analyse → correspondances
 *                             validées → migration → contrôle des volumes, relations, montants ; modèle métier
 *                             reçu de l'Analyste (jeton analyst) → rejoué → validé → mise en service ;
 *                             accès au logiciel livré par lien d'activation (mot de passe choisi).
 *   2. Reconstruction       : client créé, produit modifié, devis à 3 lignes calculé par le modèle v1.
 *   3. Versions des règles  : v2 publiée à chaud ; nouveau devis en v2, devis précédents inchangés.
 *   5. Sécurité comptable   : modification / suppression d'une facture historique refusées, valeur conservée.
 *   6. Généricité + agents  : client B — Relatio 2004 par extraction HTTP réelle ; « Analyser mon logiciel »
 *                             sans exécuteur (message exact) ; doublure d'exécuteur étiquetée « jeu de test »
 *                             (battement → prise → remise unique → connexion réelle → rapport → fin →
 *                             identifiants effacés), puis doublure Python de Mouss et exemple Python d'Alan
 *                             avec les jetons de service de la pile (REBORN_TOKEN, REBORN_PROJECT).
 *   7. Isolation            : appels directs du client B sur chaque route du projet de A (404), désignations
 *                             contradictoires (400), anonyme (401), atelier refusé aux clients (403), données
 *                             de A identiques ; aucun secret dans les réponses, les fichiers ni le journal.
 *   4. Indépendance         : Ctrl+C sur le Studio (tout son groupe de processus) ; les logiciels livrés
 *                             continuent ; redémarrage du CRM seul ; données et accès retrouvés.
 *
 *   npm run acceptance                         (construit le Studio dans platform/.next-test si nécessaire)
 *   REBORN_DIST_DIR=.next-xxx npm run acceptance   ·   REBORN_KEEP_TMP=1 : garder le dossier de test
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { makeLegacyCrm, COUNTS } from "./acceptance/legacy-crm.mjs";
import {
  ROOT,
  alive,
  checker,
  contractSchema,
  createStack,
  distDir,
  down,
  ensureBuild,
  filesContaining,
  legalVersions,
  makeOperator,
  relatioLogin,
  schemaProblems,
  secret,
  signIn,
  signUp,
  studioClient,
  up,
} from "./acceptance/stack.mjs";

const AGENT_UNAVAILABLE = "Agent d'analyse non disponible pour le moment.";
const { check, results, failed } = checker();
const dist = distDir();
ensureBuild(dist);

const stack = createStack("acceptation");
const relatio = await stack.startRelatio();
const studio = await stack.startStudio({ dist, egress: [`127.0.0.1:${relatio.port}`] });
const S = studio.url;
const R = relatio.url;
const C = `http://127.0.0.1:${studio.crmPort}`;
const { call, journal } = studioClient(S);
const V = legalVersions();
const ANON = {};
const ANALYST = { bearer: stack.tokens.analyst };
const executor = (id) => ({ bearer: stack.tokens.explorer, executor: id });
// Valeurs secrètes de l'essai, à ne retrouver nulle part (réponses, fichiers, journaux), sauf à l'endroit
// unique où elles sont remises : mot de passe de l'ancien logiciel → remise à l'exécuteur titulaire ;
// jeton de remise → prise de mission par l'exécuteur ; lien d'activation → son propriétaire, une fois.
const secretsSeen = [];
const deliveredOnlyBy = new Map();

/** Client d'un logiciel livré (cookie de session propre à ce logiciel). */
function crmClient(base) {
  const c = {
    cookie: "",
    async call(method, p, body) {
      const r = await fetch(base + p, { method, headers: { "content-type": "application/json", origin: base, ...(c.cookie ? { cookie: c.cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = r.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .filter((x) => !x.endsWith("="));
      if (set.length) c.cookie = set.join("; ");
      const t = await r.text();
      let j;
      try {
        j = JSON.parse(t);
      } catch {
        j = t;
      }
      return { status: r.status, body: j };
    },
  };
  return c;
}

/** Activation d'un accès au logiciel livré à partir du lien (jeton dans le fragment #) avec un mot de passe choisi. */
async function activate(link, password) {
  const u = new URL(link);
  const token = decodeURIComponent(u.hash.replace(/^#\/activation\//, ""));
  const c = crmClient(u.origin);
  const invitation = await c.call("POST", "/api/auth/invitation", { token });
  const activation = await c.call("POST", "/api/auth/activate", { token, password });
  return { c, token, invitation, activation };
}

const pidOfApp = (appId) => JSON.parse(fs.readFileSync(path.join(stack.appsDir, appId, "run", "server.pid"), "utf8")).pid;
let crmPid = null;
let crm2Pid = null;

try {
  /* ---------------- TEST 0 — Comptes ------------------------------------------ */
  console.log("TEST 0 — Comptes");
  if (!check("Studio démarré (processus réel, dossier temporaire, secrets aléatoires)", await up(`${S}/api/health`, 60000, (r) => r.ok))) throw new Error("Studio indisponible");
  check("Ancien logiciel de test Relatio 2004 démarré (base SQLite générée)", await up(`${R}/login`, 60000, (r) => r.ok));
  const health = await call(ANON, "GET", "/api/health");
  check("Santé publique réduite, sans secret ni compteur", health.status === 200 && Object.keys(health.body).every((k) => ["ok", "service", "contract_version", "auth"].includes(k)), Object.keys(health.body).join(", "));
  check("Sans compte, l'API est refusée (401)", (await call(ANON, "GET", "/api/projects")).status === 401 && (await call(ANON, "GET", "/api/state")).status === 401);
  const noConsent = await fetch(`${S}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: S }, body: JSON.stringify({ email: "sans.consentement@exemple.test", password: `Test-${secret(12)}`, firstName: "Sans", lastName: "Consentement", company: "Test" }) });
  const noConsentBody = await noConsent.json().catch(() => ({}));
  check("Inscription refusée sans les deux consentements", noConsent.status === 400 && noConsentBody.code === "CONSENT_REQUIRED", `${noConsent.status} ${noConsentBody.code ?? ""}`);
  const A = await signUp(S, { firstName: "Claire", lastName: "Essai", company: "Entreprise de test A" });
  const B = await signUp(S, { firstName: "Bruno", lastName: "Essai", company: "Morel Équipements (jeu de test)" });
  const OP = await signUp(S, { firstName: "Équipe", lastName: "REBORN", company: "REBORN (test)" });
  secretsSeen.push(A.password, B.password, OP.password, stack.tokens.explorer, stack.tokens.analyst, stack.authSecret);
  const meA = await call({ cookie: A.cookie }, "GET", "/api/me");
  const kinds = (meA.body.consents ?? []).map((c) => c.kind);
  check("Compte client créé par inscription : rôle client, deux consentements enregistrés", meA.status === 200 && meA.body.user?.role === "client" && kinds.includes("terms_acceptance") && kinds.includes("privacy_acknowledgement"), kinds.join(", "));
  check("Le rôle ne se change pas par l'API (PATCH /api/me refusé)", (await call({ cookie: A.cookie }, "PATCH", "/api/me", { role: "operator" })).status === 400);
  const op = makeOperator(stack, OP.email);
  const meOp = await call({ cookie: OP.cookie }, "GET", "/api/me");
  check("Opérateur désigné par scripts/account.mjs sur la base temporaire (effet immédiat)", op.ok && meOp.body.user?.role === "operator", op.ok ? "npm run account -- operator <email>" : op.out.slice(0, 200));
  const list = spawnSync(process.execPath, ["--no-warnings", path.join(ROOT, "scripts/account.mjs"), "list"], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", REBORN_DATA_DIR: stack.dataDir }, encoding: "utf8" });
  check("npm run account -- list : comptes listés sans aucun secret", list.status === 0 && list.stdout.includes(A.email) && !secretsSeen.some((s) => list.stdout.includes(s)));
  await fetch(`${S}/api/auth/sign-out`, { method: "POST", headers: { "content-type": "application/json", origin: S, cookie: A.cookie }, body: "{}" });
  check("Déconnexion : l'ancienne session ne donne plus accès", (await call({ cookie: A.cookie }, "GET", "/api/me")).status === 401);
  check("Mauvais mot de passe refusé", (await signIn(S, A.email, `Faux-${secret(8)}`)).status === 401);
  const back = await signIn(S, A.email, A.password);
  A.cookie = back.cookie;
  check("Reconnexion avec le mot de passe du compte", back.status === 200 && (await call({ cookie: A.cookie }, "GET", "/api/me")).status === 200);
  const asA = { cookie: A.cookie };
  const asB = { cookie: B.cookie };
  const asOP = { cookie: OP.cookie };

  /* ---------------- TEST 1 — Migration réelle (client A) ----------------------- */
  console.log("\nTEST 1 — Migration réelle (client A)");
  const legacyFile = path.join(stack.tmp, "ancien-crm.db");
  const legacy = makeLegacyCrm(legacyFile);
  check("Ancien CRM : vraie base SQLite (données synthétiques)", legacy.customers === COUNTS.customers && legacy.invoices === COUNTS.invoices, JSON.stringify(legacy));
  const created = await call(asA, "POST", "/api/projects", { company: "Entreprise de test A", software: "CRM synthétique (SQLite)", authorized: true, authorization_version: V.authorization });
  const pA = created.body.project?.id;
  check("Projet créé par le client, autorisation d'accès enregistrée à son nom", created.status === 201 && /^MIG_[a-f0-9]{8}$/.test(pA ?? ""), pA);
  const qa = (p) => `${p}${p.includes("?") ? "&" : "?"}project=${pA}`;
  const src = await call(asA, "POST", qa("/api/migration/sources"), { name: "ancien-crm.db", content_base64: fs.readFileSync(legacyFile).toString("base64") });
  check("Base importée par le mécanisme autorisé (dépôt de fichier)", src.status === 200 && src.body.source?.tables?.length === 6, `${src.body.source?.tables?.length ?? 0} tables`);
  const prof = (await call(asA, "GET", qa("/api/migration/profile"))).body;
  check("Tables, types et relations analysés", prof.relations?.length === 5, `${prof.relations?.length} relations détectées`);
  const prop = await call(asA, "POST", qa("/api/migration/mapping?propose=auto"));
  const items = prop.body.review?.items ?? [];
  check("Correspondances proposées, points incertains signalés", prop.status === 200 && items.length > 0, `${items.length} point(s) à valider dont ${items.filter((i) => i.kind === "accounting").length} de protection comptable`);
  check("Migration bloquée tant que les points ne sont pas validés", (await call(asA, "POST", qa("/api/migration/runs"), {})).status === 409);
  for (const i of items) await call(asA, "POST", qa("/api/migration/decisions"), { key: i.key, decision: "accepted" });
  const run = await call(asA, "POST", qa("/api/migration/runs"), {});
  const runId = run.body.run?.id;
  const expectedRows = legacy.customers + legacy.leads + legacy.products + legacy.quotes + legacy.quote_lines + legacy.invoices;
  check("Migration exécutée", run.status === 200 && run.body.run.summary.imported === expectedRows && run.body.run.summary.rejected === 0, `${run.body.run?.summary?.imported}/${expectedRows} enregistrements, ${run.body.run?.summary?.rejected} rejet(s)`);
  check("Vérification indépendante sans contrôle bloquant", ["validated", "review"].includes(run.body.report?.status), `statut ${run.body.report?.status}, ${run.body.report?.checks} contrôles, ${run.body.report?.failed} en échec`);
  if (run.body.report?.status === "review") await call(asA, "POST", qa(`/api/migration/runs/${runId}/acknowledge`), { comment: "Écarts examinés (acceptation)" });

  const bm = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/acceptance/business-model.json"), "utf8"));
  check("Un client ne publie pas un modèle présenté comme venant de l'Analyste (403)", (await call(asA, "POST", qa("/api/migration/business-model"), bm)).status === 403);
  const pub = await call(ANALYST, "POST", qa("/api/migration/business-model"), bm);
  check("Modèle métier reçu de l'Analyste (jeton analyst ; jeu de test au format business_model) — à valider", pub.status === 200 && pub.body.status === "proposed" && !pub.body.issues.some((i) => i.level === "error"), `v${pub.body.version}`);
  const hist = await call(asA, "POST", qa("/api/migration/business-model/check"), { version: pub.body.version });
  const qb = hist.body.check?.bindings?.find((b) => b.id === "quotes");
  check("Modèle rejoué sur les devis historiques", qb && qb.identical === legacy.quotes, `${qb?.identical}/${qb?.checked} identiques au centime, ${qb?.rounding} arrondi(s), ${qb?.different} écart(s)`);
  check("Version validée par le responsable du projet", (await call(asA, "POST", qa("/api/migration/business-model/decision"), { version: pub.body.version, decision: "validated", comment: "Rejoué sur l'historique" })).status === 200);
  const dep = await call(asA, "POST", qa("/api/migration/deploy"), { run_id: runId });
  check("Nouveau logiciel généré et mis en service", dep.status === 200 && dep.body.url === C, dep.body.url ?? JSON.stringify(dep.body).slice(0, 200));
  const appId = dep.body.deployment?.app_dir ? path.basename(dep.body.deployment.app_dir) : "nouveau-logiciel";

  // Accès au logiciel livré : lien d'activation à usage unique, mot de passe choisi par la personne
  const strangerLink = await call(asB, "POST", qa("/api/migration/app/access"));
  const access = await call(asA, "POST", qa("/api/migration/app/access"));
  check("« Créer mon accès au logiciel » : lien d'activation pour le propriétaire seulement (autre client : 404)", access.status === 201 && /#\/activation\//.test(access.body.link ?? "") && strangerLink.status === 404, `autre client : ${strangerLink.status}`);
  const crmPwA = `Logiciel-A-${secret(10)}`;
  const actA = await activate(access.body.link, crmPwA);
  secretsSeen.push(crmPwA, actA.token);
  deliveredOnlyBy.set(actA.token, "/api/migration/app/access");
  check("Activation dans le logiciel livré avec un mot de passe choisi (compte de la personne, rôle administrateur)", actA.invitation.status === 200 && actA.invitation.body.email === A.email && actA.activation.status === 200 && actA.activation.body.role === "admin");
  check("Lien d'activation à usage unique (2e utilisation : 410)", (await crmClient(C).call("POST", "/api/auth/activate", { token: actA.token, password: `Autre-${secret(10)}` })).status === 410);
  check("Le mot de passe du compte REBORN n'ouvre pas le logiciel livré", (await crmClient(C).call("POST", "/api/auth/login", { username: A.email, password: A.password })).status === 401);
  const crm = crmClient(C);
  check("Connexion au nouveau logiciel avec le mot de passe choisi", (await crm.call("POST", "/api/auth/login", { username: A.email, password: crmPwA })).status === 200);
  const count = async (e) => (await crm.call("GET", `/api/e/${e}?per=1`)).body.total;
  const volumes = Object.fromEntries(await Promise.all(["customers", "leads", "products", "quotes", "quote_lines", "invoices"].map(async (e) => [e, await count(e)])));
  check("Données réellement présentes dans la nouvelle base", Object.entries(volumes).every(([k, v]) => v === legacy[k]), JSON.stringify(volumes));
  const ldb = new DatabaseSync(legacyFile, { readOnly: true });
  const q7 = ldb.prepare("SELECT q.quote_number, c.company FROM quotes q JOIN customers c ON c.customer_id = q.customer_id WHERE q.quote_id = 7").get();
  const nq7 = (await crm.call("GET", `/api/e/quotes?q=${q7.quote_number}`)).body.rows[0];
  const cust7 = (await crm.call("GET", `/api/e/customers/${nq7.customer_id}`)).body.record;
  const lines7 = (await crm.call("GET", `/api/e/quotes/${nq7.id}`)).body.children?.["quote_lines.quote_id"]?.total;
  check("Relations conservées", cust7.company === q7.company && lines7 === ldb.prepare("SELECT COUNT(*) AS n FROM quote_lines WHERE quote_id = 7").get().n, `${q7.quote_number} → ${cust7.company}, ${lines7} lignes`);
  const csv = (await crm.call("GET", "/api/export/invoices.csv")).body;
  const header = csv.replace(/^﻿/, "").split("\r\n")[0].split(";");
  const col = header.indexOf("amount_incl_tax");
  const sumCents = csv.split("\r\n").slice(1).filter(Boolean).reduce((s, l) => s + Number(l.split(";")[col]), 0);
  check("Montants identiques au centime", sumCents === Math.round(legacy.invoice_total_incl_tax * 100), `${sumCents / 100} € TTC facturés (source : ${legacy.invoice_total_incl_tax} €)`);

  /* ---------------- TEST 2 — Reconstruction fonctionnelle --------------------- */
  console.log("\nTEST 2 — Reconstruction fonctionnelle");
  const nc = await crm.call("POST", "/api/e/customers", { company: "Client créé après migration", email: "nouveau@client.fr", city: "Lyon", segment: "SMB" });
  check("Créer un client", nc.status === 201 && nc.body._migrated === 0);
  const p5 = (await crm.call("GET", "/api/e/products?q=SKU-0005")).body.rows[0];
  const up5 = await crm.call("PUT", `/api/e/products/${p5.id}`, { label: "Produit 5 (modifié)", unit_price: 19990 });
  check("Modifier un produit", up5.status === 200 && up5.body.unit_price === 19990);
  const q1 = await crm.call("POST", "/api/e/quotes", { quote_number: "Q-NEW-001", customer_id: nc.body.id, quote_date: "2026-11-07", status: "draft" });
  check("Créer un devis (calcul par le modèle v1)", q1.status === 201 && q1.body._rules_version === 1);
  const prods = await Promise.all(["SKU-0005", "SKU-0007", "SKU-0009"].map(async (s) => (await crm.call("GET", `/api/e/products?q=${s}`)).body.rows[0]));
  let expected = 0;
  let lineOk = true;
  for (const [i, p] of prods.entries()) {
    const l = await crm.call("POST", "/api/e/quote_lines", { quote_id: q1.body.id, product_id: p.id, quantity: i + 2 });
    expected += (i + 2) * p.unit_price;
    lineOk &&= l.status === 201 && l.body.line_total === (i + 2) * p.unit_price && l.body.unit_price === p.unit_price;
  }
  check("Ajouter 3 lignes : prix et montants calculés côté serveur", lineOk);
  const q1d = (await crm.call("GET", `/api/e/quotes/${q1.body.id}`)).body;
  check("Total du devis calculé à partir du modèle de règles", q1d.record.total_excl_tax === expected && q1d.children["quote_lines.quote_id"].total === 3, `${expected / 100} € HT`);
  check("Montant calculé non modifiable à la main", (await crm.call("PUT", `/api/e/quotes/${q1.body.id}`, { total_excl_tax: 1 })).status === 400);

  /* ---------------- TEST 3 — Nouvelle version des règles ---------------------- */
  console.log("\nTEST 3 — Modification des règles");
  const before = Number(ldb.prepare("SELECT ROUND(SUM(total_excl_tax) * 100) AS v FROM quotes").get().v);
  const v2 = structuredClone(bm);
  v2.modules["quote.document"].rules.push({ id: "QD-02", type: "customer_discount", stage: "discount", description: "Remise 10 % clients grands comptes (modification de test)", condition: { segment: "ENT" }, action: { discount_percent: 10 } });
  const p2 = await call(ANALYST, "POST", qa("/api/migration/business-model"), v2);
  await call(asA, "POST", qa("/api/migration/business-model/decision"), { version: p2.body.version, decision: "validated", comment: "Nouvelle politique tarifaire" });
  const pr = await call(asA, "POST", qa("/api/migration/app/rules"), { version: p2.body.version });
  check("Version v2 publiée dans le logiciel livré, prise en compte à chaud", pr.status === 200 && pr.body.active_version === p2.body.version, `version active : v${pr.body.active_version}`);
  const ent = (await crm.call("GET", "/api/e/customers?segment=ENT&per=1")).body.rows[0];
  const q2 = await crm.call("POST", "/api/e/quotes", { quote_number: "Q-NEW-002", customer_id: ent.id, quote_date: "2026-11-07", status: "draft" });
  for (const [i, p] of prods.entries()) await crm.call("POST", "/api/e/quote_lines", { quote_id: q2.body.id, product_id: p.id, quantity: i + 2 });
  const q2d = (await crm.call("GET", `/api/e/quotes/${q2.body.id}`)).body.record;
  check("Nouveau devis calculé avec la v2", q2d._rules_version === 2 && q2d.total_excl_tax === Math.round((expected * 90) / 100), `${q2d.total_excl_tax / 100} € HT (remise 10 %)`);
  const q1after = (await crm.call("GET", `/api/e/quotes/${q1.body.id}`)).body.record;
  check("Devis précédent inchangé (v1)", q1after.total_excl_tax === expected && q1after._rules_version === 1);
  const histNow = (await crm.call("GET", "/api/export/quotes.csv")).body;
  const hh = histNow.replace(/^﻿/, "").split("\r\n");
  const hc = hh[0].split(";");
  const histSum = hh
    .slice(1)
    .filter(Boolean)
    .filter((l) => l.split(";")[hc.indexOf("_migrated")] === "1")
    .reduce((s, l) => s + Number(l.split(";")[hc.indexOf("total_excl_tax")]), 0);
  check("Montants historiques inchangés", histSum === before, `${histSum / 100} € HT pour les ${legacy.quotes} devis historiques`);

  /* ---------------- TEST 5 — Sécurité comptable ------------------------------- */
  console.log("\nTEST 5 — Sécurité comptable");
  const inv = (await crm.call("GET", "/api/e/invoices?_migrated=1&per=1")).body.rows[0];
  const put = await crm.call("PUT", `/api/e/invoices/${inv.id}`, { amount_incl_tax: 1 });
  check("Modification du montant d'une facture historique refusée", put.status === 409, put.body.error);
  check("Suppression d'une facture historique refusée", (await crm.call("DELETE", `/api/e/invoices/${inv.id}`)).status === 409);
  const invAfter = (await crm.call("GET", `/api/e/invoices/${inv.id}`)).body.record;
  check("La base conserve la valeur originale", invAfter.amount_incl_tax === inv.amount_incl_tax, `${inv.amount_incl_tax / 100} €`);
  const hq = (await crm.call("GET", "/api/e/quotes?_migrated=1&per=1")).body.rows[0];
  check("Lignes d'un devis historique non modifiables", (await crm.call("POST", "/api/e/quote_lines", { quote_id: hq.id, product_id: p5.id, quantity: 1 })).status === 409);
  const audit = (await crm.call("GET", "/api/admin/audit?limit=200")).body;
  check("Tentatives refusées tracées dans le journal", Array.isArray(audit) && audit.some((a) => a.action === "update_refused") && audit.some((a) => a.action === "delete_refused"));

  /* ---------------- TEST 6 — Généricité (Relatio 2004) et agents --------------- */
  console.log("\nTEST 6 — Généricité (Relatio 2004, client B) : analyse, doublures d'exécuteur, exemples Python");
  const relPassword = stack.relatioPassword();
  secretsSeen.push(relPassword);
  deliveredOnlyBy.set(relPassword, "/credentials/redeem");
  const relProject = await call(asB, "POST", "/api/projects", {
    company: "Morel Équipements",
    software: "Relatio 2004",
    legacy_url: R,
    software_type: "CRM",
    authorized: true,
    authorization_version: V.authorization,
    credentials: { username: "migration", password: relPassword },
    credentials_notice_version: V.credentials,
  });
  const pB = relProject.body.project?.id;
  check("Second projet (client B) : identifiants chiffrés, jamais renvoyés", relProject.status === 201 && !!pB && !JSON.stringify(relProject.body).includes(relPassword), pB);
  const qb_ = (p) => `${p}${p.includes("?") ? "&" : "?"}project=${pB}`;
  const ct = await call(asB, "POST", `/api/projects/${pB}/connection/test`, { plan: "test" });
  check("Connexion réelle à l'ancien logiciel testée (connecteur HTTP, plan de test)", ct.status === 200 && ct.body.connection === "connected", ct.body.detail ?? ct.body.error);

  // « Analyser mon logiciel » sans exécuteur : demande en file, message exact, rien de simulé
  const an = await call(asB, "POST", `/api/projects/${pB}/analysis`, {});
  check("« Analyser mon logiciel » sans exécuteur : demande en file, message exact", an.status === 202 && an.body.state === "queued" && an.body.agent_available === false && an.body.message === AGENT_UNAVAILABLE, `${an.status} · ${an.body.state} · « ${an.body.message} »`);
  const anGet = await call(asB, "GET", `/api/projects/${pB}/analysis`);
  check("État de la demande relu : toujours en file, aucun agent présenté comme connecté", anGet.body.state === "queued" && anGet.body.agent_available === false && anGet.body.message === AGENT_UNAVAILABLE && (await call(asB, "GET", `/api/projects/${pB}`)).body.details?.connection?.by?.includes("connecteur HTTP"));

  // Doublure d'exécuteur ÉTIQUETÉE « jeu de test » (aucun agent) : battement → prise → remise unique → connexion réelle → rapport → fin
  const EX = executor("doublure-acceptation");
  check("Doublure d'exécuteur (jeu de test) : prise refusée sans battement de cœur (409)", (await call(EX, "POST", "/api/executor/missions/claim")).status === 409);
  const hb = await call(EX, "POST", "/api/executor/heartbeat", { version: "1.1", networks: ["private"], login: "cdp", max_concurrent: 1, active_missions: [], label: "doublure d'exécuteur — jeu de test (acceptation)" });
  check("Battement de cœur accepté (renouvellement sous 20 s)", hb.status === 200 && hb.body.renew_within_s === 20, `exécuteur ${hb.body.executor_id ?? "?"}`);
  check("La demande voit désormais un agent disponible", (await call(asB, "GET", `/api/projects/${pB}/analysis`)).body.agent_available === true);
  const claim = await call(EX, "POST", "/api/executor/missions/claim");
  const m = claim.body ?? {};
  const problems = claim.status === 200 ? schemaProblems(contractSchema("connection_mission"), m) : ["pas de mission"];
  check(
    "Prise de mission conforme au schéma connection_mission 1.1 (lecture seule, saisie hors du modèle)",
    claim.status === 200 && problems.length === 0 && m.contract_version === "1.1" && m.project_id === pB && m.requires_network === "private" && m.limits?.read_only === true && m.limits?.login_screenshots === false && /jamais dans la consigne/.test(m.credential?.handling ?? "") && !!m.credential?.token,
    claim.status === 200 ? `${m.mission_id} · ${problems.length} écart(s) au schéma${problems.length ? ` : ${problems.slice(0, 3).join(" ; ")}` : ""}` : `HTTP ${claim.status}`,
  );
  const token = m.credential?.token ?? "";
  secretsSeen.push(token);
  deliveredOnlyBy.set(token, "/api/executor/missions/claim");
  const ownerView = JSON.stringify((await call(asB, "GET", `/api/projects/${pB}/analysis`)).body) + JSON.stringify((await call(asB, "GET", `/api/projects/${pB}`)).body);
  check("Le jeton de remise n'est jamais visible du client", !!token && !ownerView.includes(token));
  const redeemPath = `/api/projects/${pB}/credentials/redeem`;
  const otherExec = await call(executor("autre-executeur"), "POST", redeemPath, { token, mission_id: m.mission_id });
  const fromBrowser = await call(EX, "POST", redeemPath, { token, mission_id: m.mission_id }, { origin: S });
  const fromOwner = await call(asB, "POST", redeemPath, { token, mission_id: m.mission_id });
  const red = await call(EX, "POST", redeemPath, { token, mission_id: m.mission_id });
  check("Remise des identifiants au seul titulaire, hors navigateur (autre exécuteur, navigateur, propriétaire : 403)", otherExec.status === 403 && fromBrowser.status === 403 && fromOwner.status === 403 && red.status === 200 && red.body.username === "migration" && red.body.password === relPassword, `${otherExec.status}/${fromBrowser.status}/${fromOwner.status} puis ${red.status}`);
  const red2 = await call(EX, "POST", redeemPath, { token, mission_id: m.mission_id });
  check("Jeton de remise à usage unique (2e échange refusé)", red2.status === 403, `${red2.status} ${red2.body?.reason ?? ""}`);
  const really = red.status === 200 ? await relatioLogin(R, red.body.username, red.body.password) : false;
  check("Connexion RÉELLE de la doublure au logiciel de test (page authentifiée constatée)", really);
  if (red.body && typeof red.body === "object") red.body.password = undefined; // jamais conservé
  const rep = await call(EX, "POST", `/api/projects/${pB}/connection`, { status: really ? "connected" : "failed", detail: "Page authentifiée du logiciel de test affichée (doublure d'exécuteur, jeu de test)", mission_id: m.mission_id });
  const conn = (await call(asB, "GET", `/api/projects/${pB}`)).body.details?.connection;
  check("Rapport de connexion du titulaire enregistré", rep.status === 200 && conn?.status === "connected", conn?.by);
  const done = await call(EX, "POST", `/api/executor/missions/${m.mission_id}/complete`, { outcome: really ? "completed" : "failed", detail: "Doublure d'exécuteur (jeu de test) : connexion seule, aucune exploration", disposal: { local_artifacts_purged: true } });
  const credAfter = (await call(asB, "GET", `/api/projects/${pB}/credentials`)).body;
  const encFile = fs.existsSync(path.join(stack.dataDir, "migration", "projects", pB, "credentials.enc.json"));
  const keyFiles = fs.existsSync(stack.keysDir) ? fs.readdirSync(stack.keysDir).filter((f) => f.endsWith(".key")).length : 0;
  check("Fin de mission : identifiants effacés côté Studio (fichier chiffré et clé supprimés)", done.status === 200 && !!done.body.credentials?.revoked_at && credAfter.stored === false && !encFile && keyFiles === 0, `mission ${done.body.mission?.status ?? done.status} · chiffré ${encFile ? "présent" : "absent"} · ${keyFiles} clé(s)`);
  check("État final de la demande vu par le client : terminée", (await call(asB, "GET", `/api/projects/${pB}/analysis`)).body.state === "completed");

  // Doublure Python de l'exécuteur de Mouss (clients/examples/mouss_connexion.py, jeu de test) avec le jeton explorer de la pile
  const deposit = () => call(asB, "POST", `/api/projects/${pB}/credentials`, { username: "migration", password: relPassword, credentials_notice_version: V.credentials });
  const dep2 = await deposit();
  const an2 = await call(asB, "POST", `/api/projects/${pB}/analysis`, {});
  const pyEnv = { PATH: process.env.PATH ?? "", REBORN_URL: S, REBORN_TEST_STACK: "1", PYTHONDONTWRITEBYTECODE: "1" };
  const pyMouss = spawnSync("python3", ["-I", "-B", path.join(ROOT, "clients/examples/mouss_connexion.py")], { env: { ...pyEnv, REBORN_TOKEN: stack.tokens.explorer, REBORN_PROJECT: pB, REBORN_EXECUTOR_ID: "doublure-python" }, encoding: "utf8", timeout: 60000 });
  const pyOut = `${pyMouss.stdout}${pyMouss.stderr}`;
  check(
    "Doublure Python de Mouss (jeu de test, client Python) : battement → prise → remise → connexion réelle → rapport → fin",
    dep2.status === 200 && an2.status === 202 && pyMouss.status === 0 && /mission close : completed/.test(pyMouss.stdout) && /identifiants effacés côté Studio : oui/.test(pyMouss.stdout),
    pyMouss.status === 0 ? pyMouss.stdout.trim().split("\n").at(-1) : `code ${pyMouss.status} : ${pyMouss.stderr.slice(0, 300)}`,
  );
  check("Sortie de la doublure Python sans aucun secret", !secretsSeen.some((s) => s && pyOut.includes(s)));

  // Extraction par le connecteur du Studio avec des identifiants confiés à nouveau (effacés ensuite)
  const dep3 = await deposit();
  const ex = await call(asB, "POST", qb_("/api/migration/extract"), { plan: "test" });
  const exr = ex.body.extraction?.results ?? [];
  check("Exports récupérés par le connecteur HTTP avec les identifiants du projet", dep3.status === 200 && ex.status === 200 && exr.filter((r) => r.status === "ok").length >= 8, `${exr.filter((r) => r.status === "ok").length} récupérés, ${exr.filter((r) => r.status === "forbidden" || r.status === "unauthorized").length} refusés au compte (consignés)`);
  check("Identifiants effacés après l'extraction réussie", (await call(asB, "GET", `/api/projects/${pB}/credentials`)).body.stored === false);
  const pyAlan = spawnSync("python3", ["-I", "-B", path.join(ROOT, "clients/examples/alan_modele_metier.py")], { env: { ...pyEnv, REBORN_TOKEN: stack.tokens.analyst, REBORN_PROJECT: pB }, encoding: "utf8", timeout: 60000 });
  check("Exemple d'Alan (jeton analyst, REBORN_PROJECT) : correspondances + modèle métier reçus sans erreur", pyAlan.status === 0 && /Modèle métier v1 reçu — statut proposed, 0 erreur/.test(pyAlan.stdout), pyAlan.status ? pyAlan.stderr.slice(0, 300) : pyAlan.stdout.trim().split("\n").slice(0, 2).join(" · "));
  // Client Python 1.3 : avec REBORN_PROJECT, le modèle de règles de l'Analyste va dans le projet, jamais dans l'atelier
  const PY_RULES = [
    "import json, sys",
    "sys.path.insert(0, sys.argv[1])",
    "from reborn_client import Reborn",
    "rb = Reborn()",
    "r = rb.publish_rules(json.load(open(sys.argv[2], encoding='utf-8')))",
    "print(json.dumps({'version': r.get('version'), 'current': rb.rules().get('version')}))",
  ].join("\n");
  const pyRules = spawnSync("python3", ["-I", "-B", "-c", PY_RULES, path.join(ROOT, "clients"), path.join(ROOT, "contracts/rules.example.json")], { env: { ...pyEnv, REBORN_TOKEN: stack.tokens.analyst, REBORN_PROJECT: pB }, encoding: "utf8", timeout: 60000 });
  let pyR = {};
  try {
    pyR = JSON.parse(pyRules.stdout.trim().split("\n").at(-1));
  } catch {}
  const modelsOfB = ((await call(asB, "GET", "/api/state")).body.models ?? []).filter((x) => x.project_id === pB && x.version === pyR.version);
  const modelsOfA = ((await call(asA, "GET", "/api/state")).body.models ?? []).filter((x) => x.version === pyR.version);
  const atelierRules = await call(asOP, "GET", "/api/rules");
  check(
    "Client Python 1.3 (REBORN_PROJECT) : règles de l'Analyste rangées dans le projet, visibles de son seul propriétaire, absentes de l'atelier",
    pyRules.status === 0 && !!pyR.version && pyR.current === pyR.version && modelsOfB.length === 1 && modelsOfA.length === 0 && atelierRules.status === 404,
    pyRules.status === 0 ? `modèle v${pyR.version} · atelier : HTTP ${atelierRules.status}` : pyRules.stderr.slice(0, 300),
  );
  const plan2 = (await call(asB, "GET", qb_("/api/migration/mapping"))).body.status;
  for (const i of plan2.items.filter((x) => !x.decision)) await call(asB, "POST", qb_("/api/migration/decisions"), { key: i.key, decision: "accepted" });
  const r2 = await call(asB, "POST", qb_("/api/migration/runs"), {});
  check("Seconde structure migrée par le même moteur, sans code spécifique", r2.status === 200 && r2.body.run.summary.imported > 20000, `${r2.body.run?.summary?.imported} enregistrements, ${r2.body.run?.summary?.rejected} rejetés avec motif`);
  if (r2.body.report?.status === "review") await call(asB, "POST", qb_(`/api/migration/runs/${r2.body.run.id}/acknowledge`), { comment: "Écarts documentés examinés (acceptation)" });
  const relCheck = await call(asB, "POST", qb_("/api/migration/business-model/check"), { version: 1 });
  const dv = relCheck.body.check?.bindings?.find((b) => b.id === "devis");
  check("Modèle métier Relatio rejoué sur les devis historiques", dv && dv.different === 0 && dv.not_computable === 0, dv ? `${dv.identical}/${dv.checked} identiques au centime, ${dv.rounding} écart(s) d'arrondi ≤ 2 centimes` : JSON.stringify(relCheck.body).slice(0, 200));
  await call(asB, "POST", qb_("/api/migration/business-model/decision"), { version: 1, decision: "validated", comment: "Rejoué sur l'historique" });
  const d2 = await call(asB, "POST", qb_("/api/migration/deploy"), { run_id: r2.body.run.id });
  const C2 = d2.body.url;
  check("Deux logiciels livrés en même temps, sur deux ports distincts", d2.status === 200 && C2 !== C && (await up(`${C2}/api/health`, 30000, (r) => r.ok)) && (await up(`${C}/api/health`, 30000, (r) => r.ok)), `${C} et ${C2}`);
  const app2 = path.basename(d2.body.deployment.app_dir);
  crm2Pid = pidOfApp(app2);
  const accessB = await call(asB, "POST", qb_("/api/migration/app/access"));
  const crmPwB = `Logiciel-B-${secret(10)}`;
  const actB = accessB.status === 201 ? await activate(accessB.body.link, crmPwB) : null;
  secretsSeen.push(crmPwB, actB?.token);
  if (actB?.token) deliveredOnlyBy.set(actB.token, "/api/migration/app/access");
  check("Accès au second logiciel activé par son propriétaire, mot de passe choisi", actB?.activation.status === 200);
  check("L'ancien mot de passe (Relatio) ne sert à rien dans le logiciel livré", (await crmClient(C2).call("POST", "/api/auth/login", { username: "migration", password: relPassword })).status === 401);

  /* ---------------- TEST 7 — Isolation entre deux comptes (appels directs) ----- */
  console.log("\nTEST 7 — Isolation entre deux comptes (appels directs)");
  const snapshotA = async () => JSON.stringify([(await call(asA, "GET", qa("/api/migration/sources"))).body, (await call(asA, "GET", qa("/api/migration/runs"))).body, (await call(asA, "GET", qa("/api/migration/mapping"))).body.current?.version]);
  const beforeA = await snapshotA();
  const attempts = [
    ["GET", `/api/projects/${pA}`],
    ["PATCH", `/api/projects/${pA}`, { notes: "écriture croisée" }],
    ["GET", `/api/migration?project=${pA}`],
    ["GET", "/api/migration", undefined, { "x-reborn-project": pA }],
    ["GET", `/api/migration/sources?project=${pA}`],
    ["POST", `/api/migration/sources?project=${pA}`, { name: "intrusion.csv", content_base64: Buffer.from("a;b\n1;2\n").toString("base64") }],
    ["GET", `/api/migration/profile?project=${pA}`],
    ["POST", `/api/migration/decisions?project=${pA}`, { key: "x", decision: "accepted" }],
    ["POST", `/api/migration/runs?project=${pA}`, {}],
    ["GET", `/api/migration/runs/${runId}?project=${pA}`],
    ["GET", `/api/migration/sources/rows?project=${pA}&source=x&table=x`],
    ["POST", `/api/migration/deploy?project=${pA}`, { run_id: runId }],
    ["GET", `/api/migration/app?project=${pA}`],
    ["POST", `/api/migration/app/access?project=${pA}`],
    ["POST", `/api/migration/app/rules?project=${pA}`, { version: 1 }],
    ["GET", `/api/migration/business-model?project=${pA}`],
    ["GET", `/api/projects/${pA}/analysis`],
    ["POST", `/api/projects/${pA}/analysis`, {}],
    ["GET", `/api/projects/${pA}/credentials`],
    ["DELETE", `/api/projects/${pA}/credentials`],
    ["GET", `/api/state?project=${pA}`],
    ["GET", `/api/revision?project=${pA}`],
    ["GET", `/api/events?project=${pA}`],
    ["GET", `/api/observations?project=${pA}`],
    ["GET", `/api/investigations?project=${pA}`],
  ];
  const leaks = [];
  for (const [method, p, body, headers] of attempts) {
    const r = await call(asB, method, p, body, headers);
    if (r.status !== 404) leaks.push(`${method} ${p.split("?")[0]} → ${r.status}`);
  }
  check(`Client B sur le projet de A : ${attempts.length} appels directs, tous « Projet introuvable » (404)`, leaks.length === 0, leaks.slice(0, 4).join(" · "));
  check("Désignations contradictoires du projet refusées (400)", (await call(asB, "GET", `/api/projects/${pB}?project=${pA}`)).status === 400 && (await call(asB, "GET", `/api/migration?project=${pB}`, undefined, { "x-reborn-project": pA })).status === 400);
  const stateB = JSON.stringify((await call(asB, "GET", "/api/state")).body);
  const eventsB = (await call(asB, "GET", "/api/events")).body;
  const listB = (await call(asB, "GET", "/api/projects")).body.projects ?? [];
  check("Vue de B (projets, état, évènements) sans aucune trace du projet de A", listB.length === 1 && listB[0].id === pB && !stateB.includes(pA) && !stateB.includes("Entreprise de test A") && Array.isArray(eventsB) && !JSON.stringify(eventsB).includes(pA), `${listB.length} projet(s) listé(s)`);
  check("Données du projet de A identiques après les tentatives de B", (await snapshotA()) === beforeA);
  check("Sans compte : 401 sur le projet de A", (await call(ANON, "GET", `/api/migration?project=${pA}`)).status === 401 && (await call(ANON, "GET", `/api/projects/${pA}`)).status === 401);
  check("Atelier de l'équipe refusé aux clients (403)", (await call(asA, "POST", "/api/scenarios", { scenario: "quote", step: "baseline" })).status === 403 && (await call(asA, "POST", "/api/reset", {})).status === 403 && (await call(asA, "GET", "/api/rules")).status === 403);
  check("Atelier ouvert à l'opérateur", (await call(asOP, "GET", "/api/scenarios")).status === 200);
  check("L'opérateur n'ouvre pas le projet d'un client (404)", (await call(asOP, "GET", `/api/projects/${pA}`)).status === 404 && ((await call(asOP, "GET", "/api/projects")).body.projects ?? []).length === 0);
  check("Écriture par cookie sans en-tête Origin refusée (CSRF, 403)", (await call({ cookie: A.cookie, origin: false }, "POST", "/api/projects", { company: "CSRF", authorized: true })).status === 403);
  check("Jeton de l'Analyste : mise en service refusée (403)", (await call(ANALYST, "POST", qa("/api/migration/deploy"), { run_id: runId })).status === 403);
  const listA = (await call(asA, "GET", "/api/projects")).body.projects ?? [];
  check(
    "Projets isolés : chacun ses données, son état, son logiciel",
    listA.length === 1 && listA[0].id === pA && listA[0].status === "PUBLISHED" && listA[0].data?.imported === expectedRows && listB[0].status === "PUBLISHED" && listB[0].data?.imported > 20000,
    [...listA, ...listB].map((x) => `${x.company} : ${x.status_label}`).join(" · "),
  );

  // Secrets : jamais dans une réponse (sauf la remise à l'exécuteur), un fichier du Studio ni son journal
  const leaked = journal.filter((j) => secretsSeen.some((s) => s && j.text.includes(s) && !(deliveredOnlyBy.has(s) && j.path.includes(deliveredOnlyBy.get(s)))));
  const deliveries = journal.filter((j) => [...deliveredOnlyBy].some(([s, where]) => j.path.includes(where) && j.text.includes(s))).length;
  check(`Aucun secret dans les ${journal.length} réponses du Studio, hors ${deliveries} remise(s) unique(s) prévue(s) (exécuteur titulaire, lien d'activation du propriétaire)`, leaked.length === 0, leaked.slice(0, 3).map((j) => j.path.split("?")[0]).join(" · "));
  const inFiles = filesContaining(stack.dataDir, secretsSeen).concat(filesContaining(stack.keysDir, secretsSeen));
  const studioLog = fs.readFileSync(path.join(stack.tmp, "studio.log"));
  const inLog = secretsSeen.filter((s) => s && studioLog.includes(Buffer.from(s)));
  check("Aucun mot de passe, jeton ni lien d'activation dans les fichiers du Studio ni dans son journal", inFiles.length === 0 && inLog.length === 0, `${inFiles.length} fichier(s), ${inLog.length} dans le journal${inFiles.length ? ` : ${inFiles.slice(0, 3).map((h) => h.file).join(" · ")}` : ""}`);
  const inApps = filesContaining(stack.appsDir, [relPassword, A.password, B.password, crmPwA, crmPwB, actA.token, actB?.token]);
  check("Logiciels livrés : ni mot de passe en clair, ni jeton d'activation (empreintes seulement)", inApps.length === 0, inApps.slice(0, 3).map((h) => h.file).join(" · "));

  /* ---------------- TEST 4 — Indépendance ------------------------------------- */
  console.log("\nTEST 4 — Indépendance");
  crmPid = pidOfApp(appId);
  process.kill(-studio.proc.pid, "SIGINT");
  check("REBORN Studio arrêté (Ctrl+C sur tout son groupe de processus)", await down(`${S}/api/health`));
  check("Les deux logiciels livrés restent opérationnels", (await crm.call("GET", "/api/health")).status === 200 && alive(crmPid) && alive(crm2Pid));
  try {
    process.kill(-relatio.proc.pid, "SIGTERM");
  } catch {}
  check("Ancien logiciel (Relatio) arrêté lui aussi", await down(`${R}/login`));
  const lead = await crm.call("POST", "/api/e/leads", { company: "Prospect saisi sans le Studio" });
  check("Écriture sans le Studio ni l'ancien logiciel", lead.status === 201);
  process.kill(crmPid, "SIGTERM");
  check("CRM arrêté", await down(`${C}/api/health`));
  const crmLog = fs.openSync(path.join(stack.tmp, "crm-seul.log"), "a");
  const solo = stack.track(spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: path.join(stack.appsDir, appId), env: { PATH: process.env.PATH ?? "", PORT: String(studio.crmPort), HOST: "127.0.0.1" }, detached: true, stdio: ["ignore", crmLog, crmLog] }));
  solo.unref();
  crmPid = solo.pid;
  check("CRM redémarré seul (node server.mjs)", await up(`${C}/api/health`, 30000, (r) => r.ok));
  const again = crmClient(C);
  const relog = await again.call("POST", "/api/auth/login", { username: A.email, password: crmPwA });
  const found = {
    client: (await again.call("GET", "/api/e/customers?q=Client créé après migration")).body.total,
    lead: (await again.call("GET", "/api/e/leads?q=Prospect saisi sans le Studio")).body.total,
    quote: (await again.call("GET", `/api/e/quotes/${q1.body.id}`)).body.record,
    rules: (await again.call("GET", "/api/rules")).body.active_version,
  };
  check("Accès et données retrouvés après redémarrage", relog.status === 200 && found.client === 1 && found.lead === 1 && found.quote?.total_excl_tax === expected && found.quote?._rules_version === 1 && found.rules === p2.body.version);
} catch (e) {
  check("Exécution du scénario", false, e.message);
} finally {
  await stack.stop();
  for (const pid of [crmPid, crm2Pid]) if (pid && alive(pid)) process.kill(pid, "SIGTERM");
  const n = failed();
  if (n) console.log(`\nDernières lignes du journal du Studio :\n${stack.tail("studio", 25)}`);
  stack.cleanup();
  console.log(`\n${results.length - n}/${results.length} vérifications réussies${n ? " · relancer avec REBORN_KEEP_TMP=1 pour garder le dossier de test" : ""}`);
  process.exit(n ? 1 : 0);
}
