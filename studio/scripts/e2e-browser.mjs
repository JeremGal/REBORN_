#!/usr/bin/env node
/**
 * Parcours critiques dans un vrai navigateur (Chrome headless piloté via le
 * protocole DevTools, sans dépendance). Pré-requis : `npm run dev` lancé.
 *
 *   node scripts/e2e-browser.mjs            (captures dans ./e2e-shots)
 *   REBORN_URL=… CHROME_PATH=… SHOTS_DIR=… node scripts/e2e-browser.mjs
 *
 * ATTENTION : remet la plateforme à zéro (scénarios de démonstration).
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
  await send("Page.navigate", { url: BASE + url });
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

/* --- Parcours ------------------------------------------------------------- */
try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");

  // A — Configurateur de devis
  await api("/api/scenarios", { scenario: "quote", step: "baseline" });
  await goto("/app");
  check("A · /app génère le configurateur", await hasText("Configurer un devis"));
  check("A · valeur initiale calculée (A × 1, standard)", await hasText("145,00"));
  await clickLabel("Premium");
  await typeInto('input[name="quantity"]', "10");
  check("A · saisie → règles exécutées (810 €)", await hasText("810,00"));
  await typeInto('input[name="quantity"]', "0");
  check("A · exception métier reproduite", (await hasText("Demande refusée")) && (await hasText("QUANTITE INVALIDE")));
  await typeInto('input[name="quantity"]', "2,5");
  check("A · validation des entrées (entier attendu)", await hasText("nombre entier attendu"));
  await typeInto('input[name="quantity"]', "10");
  await hasText("810,00");
  check("A · tableau calculé présent", await hasText("Grille par quantité"));
  await shot("A-app-devis");

  // B — Calculateur logistique : autre logiciel, mêmes composants
  await api("/api/scenarios", { scenario: "logistics", step: "baseline" });
  await goto("/app");
  check("B · /app régénérée pour un autre métier", await hasText("Calcul des frais de transport"));
  check("B · case à cocher générée", await waitFor("document.querySelector('input[type=checkbox][name=express]')"));
  check("B · champ non pris en charge signalé", (await hasText("Non reconstruit")) && (await hasText("Date d'enlèvement")));
  check("B · sorties multiples (délai)", await hasText("Délai estimé"));
  await clickLabel("Livraison express");
  await typeInto('input[name="weight_kg"]', "10");
  // FR, 10 kg, express : (6,5 + 8,5) × 1,5 = 22,5 €
  check("B · calcul express (22,50 €)", await hasText("22,50"));
  await typeInto('input[name="reference"]', "cmd 1");
  check("B · motif de texte validé", await hasText("format invalide"));
  await typeInto('input[name="reference"]', "CMD-1");
  await shot("B-app-logistique");

  // C — Mise à jour du modèle pendant l'utilisation
  await api("/api/scenarios", { scenario: "logistics", step: "change" });
  check("C · nouveau champ apparu sans rechargement", await hasText("Valeur déclarée"));
  await api("/api/scenarios", { scenario: "logistics", step: "update" });
  check("C · bannière de mise à jour", await hasText("Application mise à jour"));
  check("C · versions affichées", await hasText("règles v2"));
  // Même saisie (FR, 10 kg, express) : 15 × 1,65 = 24,75 → arrondi au dixième supérieur 24,80 €
  check("C · nouveau comportement appliqué (24,80 €)", await hasText("24,80"));
  await shot("C-app-mise-a-jour");

  // Stabilité après actualisation
  await send("Page.reload");
  await waitFor("document.readyState === 'complete'");
  check("Actualisation · état restitué", (await hasText("règles v2")) && (await hasText("Valeur déclarée")));

  // Responsive
  await goto("/app", { width: 390, height: 844, mobile: true });
  await hasText("Calcul des frais de transport");
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  check("Mobile · aucune barre de défilement horizontale", overflow <= 0, `débordement ${overflow}px`);
  await shot("D-app-mobile");

  // Dashboard
  for (const [url, needle, name] of [
    ["/atelier", "Équivalence comportementale", "E-dashboard"],
    ["/investigation", "Exploration du logiciel historique", "E-investigation"],
    ["/regles", "Modèle métier v2", "E-regles"],
    ["/reconstruction", "Chaîne de reconstruction", "E-reconstruction"],
    ["/comparaison", "Limites de la vérification", "E-comparaison"],
  ]) {
    await goto(url);
    const ok = url === "/reconstruction" ? await waitFor("document.querySelector('[aria-label=\"Chaîne de reconstruction\"]')") : await hasText(needle);
    check(`Dashboard · ${url}`, ok);
    await sleep(300);
    await shot(name);
  }
  check("Aucune exception JavaScript", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));
} catch (e) {
  check("Exécution", false, e.message);
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies · captures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}
