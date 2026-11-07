#!/usr/bin/env node
/**
 * Parcours de migration complet dans un vrai navigateur (Chrome headless via DevTools) :
 * REBORN Studio (extraction → correspondances → migration → vérification → mise en service)
 * puis le nouveau CRM livré (connexion, données migrées, création d'enregistrements).
 * Pré-requis : `npm run dev` lancé. ATTENTION : crée un nouveau projet de migration et
 * remet en service le CRM généré (une sauvegarde de sa base est faite).
 *
 *   node scripts/e2e-migration.mjs          (captures dans ./e2e-shots)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.REBORN_URL ?? "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = path.resolve(process.env.SHOTS_DIR ?? "e2e-shots");
const PORT = 9300 + Math.floor(Math.random() * 500);
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function api(p, body) {
  const r = await fetch(BASE + p, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

/* --- Chrome + CDP -------------------------------------------------------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-e2e-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let ws;
let seq = 0;
const pending = new Map();
const exceptions = [];

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
          } else if (msg.method === "Page.javascriptDialogOpening") {
            // Dialogues (confirmation, motif) : acceptés automatiquement avec un texte de test
            send("Page.handleJavaScriptDialog", { accept: true, promptText: "Test e2e" });
          } else if (msg.method === "Runtime.exceptionThrown") {
            exceptions.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
          }
        };
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome injoignable");
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
let lastEvalError = null;
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.error || r.result?.exceptionDetails) lastEvalError = JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 300);
  return r.result?.result?.value;
};
const text = () => evaluate("document.body.innerText");
async function waitFor(pred, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(`(() => { try { return !!(${pred}); } catch { return false } })()`)) return true;
    await sleep(150);
  }
  return false;
}
// textContent (et non innerText) : insensible au text-transform CSS
const hasText = async (s) => {
  const ok = await waitFor(`document.body.textContent.includes(${JSON.stringify(s)})`);
  if (!ok && process.env.E2E_DEBUG) console.log("   debug:", lastEvalError, (await evaluate("document.body.innerText.slice(0, 200)")) ?? "");
  return ok;
};
async function goto(url, viewport = { width: 1440, height: 1000, mobile: false }) {
  await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
  await send("Page.navigate", { url: url.startsWith("http") ? url : BASE + url });
  await waitFor("document.readyState === 'complete'");
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
/** Saisie compatible React (setter natif + évènement input). */
const typeInto = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const clickLabel = (txt) => evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().includes(${JSON.stringify(txt)})); if (!l) return false; l.click(); return true; })()`);


const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CRM = process.env.CRM_URL ?? "http://127.0.0.1:5050";
const clickText = (tag, txt) => evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(tag)})].find(x => x.textContent.trim().includes(${JSON.stringify(txt)}) && !x.disabled); if (!b) return false; b.click(); return true; })()`);

/** Le test crée une fiche dans le logiciel livré : il la retire à la fin pour ne laisser aucune donnée fictive. */
const TEST_CODE = "C09500";
async function removeTestRecords() {
  try {
    const { password } = JSON.parse(fs.readFileSync(path.join(ROOT, "generated/morel-crm/.secrets/admin.json"), "utf8"));
    const h = { "content-type": "application/json", origin: CRM };
    const login = await fetch(`${CRM}/api/auth/login`, { method: "POST", headers: h, body: JSON.stringify({ username: "admin", password }) });
    if (!login.ok) return;
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const list = await (await fetch(`${CRM}/api/e/clients?q=${TEST_CODE}`, { headers: { cookie } })).json();
    for (const r of (list.rows ?? []).filter((x) => x.code === TEST_CODE && !x._migrated))
      await fetch(`${CRM}/api/e/clients/${r.id}`, { method: "DELETE", headers: { ...h, cookie } });
    await fetch(`${CRM}/api/auth/logout`, { method: "POST", headers: { ...h, cookie } });
  } catch {}
}

try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  const legacyPw = JSON.parse(fs.readFileSync(path.join(ROOT, "legacy-crm/data/.credentials.json"), "utf8")).migration.password;

  await api("/api/migration/project", { name: "Migration e2e Relatio → Morel CRM" });
  await goto("/migration");
  check("Studio · page de migration chargée", await hasText("Data Migration Engine"));
  check("Studio · état initial vide", await hasText("Aucune extraction"));

  // 1. Extraction autorisée, mot de passe saisi dans le formulaire
  await typeInto('input[name="password"]', legacyPw);
  await clickText("button", "Extraire");
  check("Extraction · exports autorisés récupérés", await hasText("Fichier clients (CSV)"));
  check("Extraction · exports refusés consignés", await waitFor(`document.body.textContent.includes("Accès refusé : droit « direction » requis")`, 20000));
  check("Extraction · CSV Windows-1252 détecté", await hasText("windows-1252"));
  check("Structure · tables et relations affichées", await hasText("relations détectées"));
  check("Sécurité · mot de passe absent de la page", !(await evaluate(`document.body.innerHTML.includes(${JSON.stringify(legacyPw)})`)));

  // 2. Correspondances (jeu au format de l'Analyste) et validation humaine
  await clickText("button", "Jeu de test (format Alan)");
  check("Correspondances · points incertains à valider", await hasText("6 en attente"));
  check("Migration · bloquée tant que non validé", await hasText("correspondance(s) incertaine(s) à valider"));
  for (let i = 0; i < 8; i++) {
    if (!(await clickText("button", "Valider"))) break;
    await sleep(600);
  }
  check("Correspondances · toutes validées", await hasText("toutes traitées"));

  // 3. Migration réelle + vérification
  await clickText("button", "Lancer la migration");
  check("Migration · exécutée et vérifiée", await waitFor(`document.body.textContent.includes("Validation humaine requise")`, 40000));
  check("Vérification · registre de réconciliation", await hasText("Lignes sources"));
  check("Vérification · rejets signalés avec motif", await hasText("ligne(s) de clients non migrée(s)"));
  check("Vérification · pièces perdues signalées", await hasText("pièce(s) jointe(s) référencée(s) mais non récupérée(s)"));
  check("Vérification · avertissement de portée affiché", await hasText("ne prouvent pas l'absence de données"));
  await shot("migration-1-verification");

  // 4. Acceptation des écarts puis mise en service
  await typeInto('input[placeholder^="Commentaire"]', "Écarts examinés en e2e");
  await clickText("button", "Accepter les écarts");
  check("Validation humaine · écarts acceptés", await hasText("Écarts acceptés par Jerem"));
  await clickText("button", "mettre en service");
  check("Mise en service · nouveau CRM démarré", await waitFor(`document.body.textContent.includes("En service")`, 40000));
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await shot("migration-2-mise-en-service");

  // 5. Nouveau CRM : autonome, données migrées, saisie réelle
  const admin = JSON.parse(fs.readFileSync(path.join(ROOT, "generated/morel-crm/.secrets/admin.json"), "utf8"));
  await goto(CRM);
  check("CRM · écran de connexion", await hasText("Accès réservé aux utilisateurs autorisés"));
  await typeInto('input[name="username"]', admin.username);
  await typeInto('input[name="password"]', admin.password);
  await clickText("button", "Se connecter");
  check("CRM · tableau de bord après connexion", await hasText("Tableau de bord"));
  check("CRM · origine des données affichée", await hasText("Données historiques migrées depuis"));
  check("CRM · 1 198 clients migrés", await waitFor(`document.body.textContent.replace(/\\s/g, " ").includes("1 198")`));
  await shot("crm-1-tableau-de-bord");
  await goto(`${CRM}/#/e/clients?q=C00012`);
  check("CRM · recherche d'un client migré", await hasText("C00012"));
  await clickText("a", "C00012");
  check("CRM · fiche client avec origine", await hasText("Origine de la donnée"));
  check("CRM · factures liées au client", await hasText("Factures ("));
  await shot("crm-2-fiche-client");
  await goto(`${CRM}/#/e/factures`);
  await waitFor(`document.querySelectorAll("tbody tr.link").length > 0`);
  await evaluate(`document.querySelector("tbody tr.link a").click()`);
  check("CRM · facture historique verrouillée", await hasText("Document comptable historique"));
  await shot("crm-3-facture");
  await goto(`${CRM}/#/e/clients/new`);
  await typeInto('input[name="code"]', TEST_CODE);
  await typeInto('input[name="raison_sociale"]', "Société créée en e2e");
  await clickText("button", "Créer");
  check("CRM · création d'un vrai enregistrement", await hasText("créé dans ce logiciel"));
  await goto(`${CRM}/#/e/clients`, { width: 390, height: 844, mobile: true });
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  check("CRM · mobile sans débordement horizontal", overflow <= 0, `${overflow}px`);
  await shot("crm-4-mobile");
  check("Aucune exception JavaScript", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));
} catch (e) {
  check("Exécution du parcours", false, e.message);
} finally {
  await removeTestRecords();
  ws?.close();
  chrome.kill();
  // Chrome écrit encore dans son profil pendant l'arrêt : on attend sa sortie avant de nettoyer
  await new Promise((r) => {
    chrome.once("exit", r);
    setTimeout(r, 3000);
  });
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies · captures : ${path.relative(process.cwd(), SHOTS)}`);
  process.exit(failed ? 1 : 0);
}
