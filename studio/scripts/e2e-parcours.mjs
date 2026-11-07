#!/usr/bin/env node
/**
 * Test 7 — parcours utilisateur complet dans un VRAI navigateur (Chrome headless via DevTools).
 * Studio et ancien logiciel (Relatio 2004) tournent dans des dossiers temporaires, sur des ports
 * libres : aucune donnée réelle n'est touchée. Chaque étape est faite en cliquant dans l'interface.
 *
 *   node scripts/e2e-parcours.mjs          (Studio construit : npm run build ; captures dans ./e2e-shots/parcours)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = path.join(ROOT, "platform");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = path.resolve(process.env.SHOTS_DIR ?? path.join(ROOT, "e2e-shots", "parcours"));
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
};
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
async function up(url, ms = 60000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).status < 500) return true;
    } catch {}
  }
  return false;
}

if (!fs.existsSync(path.join(PLATFORM, ".next", "BUILD_ID"))) {
  console.log("Construction du Studio…");
  if (spawnSync("npm", ["--prefix", PLATFORM, "run", "build"], { stdio: "inherit" }).status) process.exit(1);
}

/* --- Serveurs isolés ------------------------------------------------------ */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-parcours-"));
const [studioPort, crmPort, relPort, cdpPort] = [await freePort(), await freePort(), await freePort(), await freePort()];
const BASE = `http://127.0.0.1:${studioPort}`;
const REL = `http://127.0.0.1:${relPort}`;
const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "production", REBORN_DATA_DIR: path.join(tmp, "studio"), REBORN_APPS_DIR: path.join(tmp, "apps"), CRM_PORT: String(crmPort) };
const log = fs.openSync(path.join(tmp, "serveurs.log"), "a");
const relatio = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { PATH: env.PATH, LEGACY_CRM_PORT: String(relPort), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: path.join(tmp, "relatio") }, detached: true, stdio: ["ignore", log, log] });
const studio = spawn(process.execPath, [path.join(PLATFORM, "node_modules/next/dist/bin/next"), "start", "-p", String(studioPort), "-H", "127.0.0.1"], { cwd: PLATFORM, env, detached: true, stdio: ["ignore", log, log] });

/* --- Chrome + CDP ---------------------------------------------------------- */
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-parcours-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let ws;
let seq = 0;
const pending = new Map();
const exceptions = [];
async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
        ws.onmessage = (m) => {
          const msg = JSON.parse(m.data);
          if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
          } else if (msg.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true, promptText: "Test parcours" });
          else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
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
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
async function waitFor(pred, timeout = 20000) {
  // Attend aussi les promesses (fetch…) : une promesse en attente n'est jamais prise pour « vrai »
  for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(150)) if (await evaluate(`(async () => { try { return !!(await (${pred})); } catch { return false } })()`)) return true;
  return false;
}
const norm = (s) => JSON.stringify(s.replace(/\s+/g, " "));
const hasText = (s, timeout) => waitFor(`document.body.textContent.replace(/\\s+/g, " ").includes(${norm(s)})`, timeout);
async function goto(url, viewport = { width: 1440, height: 1000, mobile: false }) {
  await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile });
  await send("Page.navigate", { url: url.startsWith("http") ? url : BASE + url });
  await waitFor("document.readyState === 'complete'");
  await sleep(400);
}
/** Clique le premier élément (bouton, lien, libellé) visible et actif dont le texte contient `txt`. */
const click = (txt, tags = "button, a, label, [role=radio]") =>
  evaluate(`(() => {
    const t = ${norm(txt)};
    const el = [...document.querySelectorAll(${JSON.stringify(tags)})].find((x) => x.textContent.replace(/\\s+/g, " ").includes(t) && !x.disabled && x.offsetParent !== null);
    if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
async function clickWhen(txt, timeout = 20000, tags) {
  for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(200)) if (await click(txt, tags)) return true;
  return false;
}
/** Saisie compatible React : setter natif + évènement input/change. */
const fill = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, el.type === "checkbox" ? "checked" : "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  if (r.result?.data) fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
const overflow = () => evaluate("document.documentElement.scrollWidth - window.innerWidth");

try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  check("Studio et ancien logiciel de test démarrés (dossiers temporaires)", (await up(`${BASE}/api/health`)) && (await up(`${REL}/login`)));
  const relPassword = JSON.parse(fs.readFileSync(path.join(tmp, "relatio", ".credentials.json"), "utf8")).migration.password;

  /* 1. Tableau de bord + création du projet ---------------------------------- */
  await goto("/");
  check("Tableau de bord des projets", await hasText("Projets de migration"));
  await shot("01-tableau-de-bord-vide");
  check("Bouton Nouveau projet", await clickWhen("Nouveau projet", 5000, "a"));
  await hasText("Nouvelle migration");
  const inputs = await evaluate(`[...document.querySelectorAll("form input, form select, form textarea")].map((x) => x.type)`);
  await evaluate(`(() => { const f = [...document.querySelectorAll("form input:not([type=checkbox]):not([type=password])")]; return f.length; })()`);
  const setNth = async (i, v) => evaluate(`(() => { const el = [...document.querySelectorAll("form input:not([type=checkbox]):not([type=password])")][${i}];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  // Ordre du formulaire : entreprise, logiciel, URL, identifiant, nom de la personne qui confirme
  await setNth(0, "Morel Équipements");
  await setNth(1, "Relatio 2004");
  await setNth(2, REL);
  await setNth(3, "migration");
  await fill("form input[type=password]", relPassword);
  await evaluate(`document.querySelector("form input[type=checkbox]").click()`);
  await setNth(4, "Test parcours");
  await shot("02-nouveau-projet");
  check("Formulaire rempli et soumis (autorisation confirmée)", (await clickWhen("Créer le projet", 5000, "button")) && (await waitFor("location.pathname.includes('/connexion')", 20000)), `${inputs?.length ?? 0} champs`);
  const projectUrl = await evaluate("location.pathname");
  const pid = projectUrl.split("/")[2];
  check("Le mot de passe n'apparaît nulle part dans la page", !(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(relPassword)})`)));

  /* 2. Connexion ----------------------------------------------------------------- */
  check("Connexion en attente affichée (aucune connexion simulée)", await hasText("En attente de l'agent Computer Use"));
  await shot("03-connexion-en-attente");
  await clickWhen("Logiciel de test Relatio 2004", 5000);
  check("Test réel du connecteur HTTP", (await clickWhen("Tester la connexion", 10000, "button")) && (await hasText("Connecté", 20000)));
  await shot("04-connexion-reussie");

  /* 3. Découverte ---------------------------------------------------------------- */
  await goto(`/projets/${pid}/decouverte`);
  check("Découverte : attente explicite de l'agent", await hasText("En attente"));
  await shot("05-decouverte");

  /* 4. Données ------------------------------------------------------------------- */
  await goto(`/projets/${pid}/extraction`);
  check("Extraction avec le plan de test (étiqueté)", (await clickWhen("Extraire avec le plan de test", 10000, "button")) && (await hasText("clients", 60000)));
  check("Exports refusés au compte consignés", await hasText("refus", 20000));
  await shot("06-donnees");

  /* 5. Correspondances ----------------------------------------------------------- */
  await goto(`/projets/${pid}/correspondances`);
  check("Jeu de test de l'Analyste reçu", (await clickWhen("Jeu de test au format de l'Analyste — Relatio", 10000, "button")) && (await hasText("T_CLIENT", 30000)));
  let accepted = 0;
  for (let i = 0; i < 30; i++) {
    const ok = (await click("Garder la protection", "button")) || (await click("Accepter", "button"));
    if (!ok) break;
    accepted++;
    await sleep(500);
  }
  check("Points incertains validés un par un", accepted > 0, `${accepted} décision(s)`);
  await shot("07-correspondances");

  /* 6. Migration ----------------------------------------------------------------- */
  await goto(`/projets/${pid}/migration`);
  check("Migration lancée depuis l'interface", (await clickWhen("Lancer la migration", 15000, "button")) && (await hasText("RUN_001", 90000)));
  check("Résultat par entité et rejets motivés", await hasText("rejet", 20000));
  await shot("08-migration");

  /* 7. Validation ---------------------------------------------------------------- */
  await goto(`/projets/${pid}/validation`);
  check("Rapport de vérification indépendante", await hasText("Vérification", 20000));
  if (await waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Accepter les écarts documentés"))`, 8000)) {
    await fill("textarea[name=comment]", "Écarts examinés (test du parcours)");
    check("Écarts documentés acceptés avec un commentaire", (await clickWhen("Accepter les écarts documentés", 5000, "button")) && (await hasText("Écarts acceptés", 20000)));
  }
  await shot("09-validation");

  /* 8. Reconstruction ------------------------------------------------------------ */
  await goto(`/projets/${pid}/reconstruction`);
  check("Spécification du nouveau logiciel affichée (provenance, non reconstruit)", await hasText("non reconstruit", 20000));
  check("Modèle métier reçu (jeu de test étiqueté)", (await clickWhen("Recevoir le jeu de test Relatio", 10000, "button")) && (await hasText("v1", 20000)));
  check("Modèle rejoué sur l'historique", (await clickWhen("Rejouer sur l'historique", 10000, "button")) && (await hasText("identique", 60000)));
  await evaluate(`(() => { const t = [...document.querySelectorAll("textarea")].at(-1); if (t) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Rejoué sur l'historique"); t.dispatchEvent(new Event("input", { bubbles: true })); } return true; })()`);
  check("Version validée par un responsable", (await clickWhen("Valider cette version", 10000, "button")) && (await hasText("validée", 20000)));
  await shot("10-reconstruction");
  check("Génération et mise en service", (await clickWhen("Générer et mettre en service", 15000, "button")) && (await waitFor(`fetch("/api/migration/app?project=${pid}").then((r) => r.json()).then((a) => a.running)`, 90000)));

  /* 9. Livraison ----------------------------------------------------------------- */
  await goto(`/projets/${pid}/livraison`);
  check("Livraison : logiciel en service, lien réel", (await hasText("En service", 20000)) && (await hasText(`127.0.0.1:${crmPort}`, 5000)) && (await hasText("Logiciel livré", 5000)));
  check("Aucun mot de passe affiché (commande de copie indiquée)", (await hasText("crm:password")) && !(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(JSON.parse(fs.readFileSync(path.join(tmp, "apps", "morel-crm", ".secrets", "admin.json"), "utf8")).password)})`)));
  await shot("11-livraison");

  /* 10. Nouveau CRM : devis à lignes calculé par le modèle -------------------------- */
  const CRM = `http://127.0.0.1:${crmPort}`;
  const adminPw = JSON.parse(fs.readFileSync(path.join(tmp, "apps", "morel-crm", ".secrets", "admin.json"), "utf8")).password;
  await goto(CRM);
  await waitFor("document.querySelector('input[type=password]')");
  await fill("input[name=username], input[type=text]", "admin");
  await fill("input[type=password]", adminPw);
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("Connexion au nouveau CRM", await hasText("Tableau de bord", 20000));
  await shot("12-crm-tableau-de-bord");
  await goto(`${CRM}/#/e/devis/new`);
  await waitFor("document.querySelector('form [name=numero]')");
  const firstClient = await evaluate(`fetch("/api/e/clients?per=1").then((r) => r.json()).then((d) => d.rows[0].id)`);
  await fill("form [name=numero]", "D2026-P0001");
  const clientField = await evaluate(`document.querySelector("form [name=client]")?.tagName`);
  await fill("form [name=client]", String(firstClient));
  await fill("form [name=date]", "2026-11-07");
  await fill("form [name=remise_pct]", "5");
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("Devis créé depuis l'interface", await waitFor("/#\\/e\\/devis\\/\\d+/.test(location.hash)", 20000), `champ client : ${clientField}`);
  const article = await evaluate(`fetch("/api/e/articles?per=3").then((r) => r.json()).then((d) => d.rows.map((x) => x.id))`);
  for (const [i, art] of (article ?? []).entries()) {
    await waitFor("document.querySelector('#line-form')");
    await fill("#line-form [name=article]", String(art));
    await fill("#line-form [name=quantite]", String(i + 2));
    await fill("#line-form [name=remise_pct]", "0");
    await sleep(600);
    await evaluate(`document.querySelector("#line-form").requestSubmit()`);
    await sleep(1200);
  }
  const devisId = await evaluate("location.hash.match(/devis\\/(\\d+)/)[1]");
  const devis = await evaluate(`fetch("/api/e/devis/${devisId}").then((r) => r.json())`);
  const lines = devis?.children?.["devis_lignes.devis"]?.total ?? 0;
  check("3 lignes ajoutées dans l'interface, montants calculés par le serveur", lines === 3 && devis.record.total_ht > 0 && devis.record._rules_version === 1, `${lines} lignes · total HT ${(devis?.record?.total_ht ?? 0) / 100} € · TTC ${(devis?.record?.total_ttc ?? 0) / 100} € · modèle v${devis?.record?._rules_version}`);
  check("Totaux affichés comme calculés par le serveur", await hasText("calculés et enregistrés par le serveur", 10000));
  await shot("13-crm-devis-calcule");
  const hist = await evaluate(`fetch("/api/e/factures?_migrated=1&per=1").then((r) => r.json()).then((d) => d.rows[0].id)`);
  await goto(`${CRM}/#/e/factures/${hist}`);
  check("Facture historique : protection affichée", await hasText("Historique protégé", 15000));
  await shot("14-crm-facture-protegee");

  /* 11. Responsive ---------------------------------------------------------------- */
  for (const [url, name] of [["/", "dashboard"], [`/projets/${pid}/correspondances`, "correspondances"], [`/projets/${pid}/livraison`, "livraison"]]) {
    await goto(url, { width: 390, height: 844, mobile: true });
    await sleep(800);
    const o = await overflow();
    check(`Mobile 390 px sans débordement : ${name}`, o <= 0, `${o}px`);
    await shot(`15-mobile-${name}`);
  }
  check("Aucune exception JavaScript", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));
} catch (e) {
  check("Exécution du parcours", false, e.message);
} finally {
  ws?.close();
  chrome.kill();
  for (const p of [studio, relatio]) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  try {
    const pidFile = path.join(tmp, "apps", "morel-crm", "run", "server.pid");
    if (fs.existsSync(pidFile)) process.kill(JSON.parse(fs.readFileSync(pidFile, "utf8")).pid, "SIGTERM");
  } catch {}
  await new Promise((r) => {
    chrome.once("exit", r);
    setTimeout(r, 3000);
  });
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies · captures : ${path.relative(process.cwd(), SHOTS)} · dossier de test : ${tmp}`);
  process.exit(failed ? 1 : 0);
}
