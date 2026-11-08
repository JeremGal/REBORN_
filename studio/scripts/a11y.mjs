#!/usr/bin/env node
/**
 * Accessibilité et qualité visuelle MESURÉES (lot C3) — WCAG 2.2 AA VISÉE, jamais déclarée.
 *
 * Pile ISOLÉE : build du Studio dans un dossier à part (REBORN_DIST_DIR, défaut .next-c3), Studio,
 * ancien logiciel de test (Relatio 2004) et logiciel livré dans un dossier temporaire, sur des ports
 * libres. Aucune donnée réelle, aucun serveur en service touché (3000, 3100, 4000, 4001, 4100, 5050).
 *
 * Parcours : compte client créé par l'inscription (interface), projet créé par l'assistant
 * « Nouvelle migration », étapes 1 à 8 faites dans l'interface jusqu'au logiciel livré, accès au
 * logiciel livré activé par lien. Puis, sur chaque page principale (Studio et logiciel livré) :
 *   - axe-core (devDependency du Studio, injecté par CDP) à 1440 et 390 px ;
 *   - clavier : Tab / Maj+Tab (ordre, focus visible MESURÉ : style calculé + pixels avant/après),
 *     focus non masqué, lien d'évitement, aucun piège hors dialogue ;
 *   - reflow à 320 px, zoom 200 % (fenêtre 1440 × 900 zoomée = 720 × 450 px CSS, densité 2) ;
 *   - prefers-reduced-motion ; cibles tactiles à 390 px ; noms accessibles des boutons-icônes.
 * Scénarios : Entrée/Espace, dialogues (focus initial, piège, Échap, retour du focus), erreurs de
 * formulaire reliées (aria-invalid + aria-describedby).
 *
 * Sortie (A11Y_OUT, défaut e2e-shots/a11y, ignoré par git) : a11y-report.json, a11y-report.md
 * (tableau par page) et captures. Aucun secret n'est affiché ni écrit : mots de passe et jetons
 * de test sont générés ici, jamais imprimés, et masqués dans le rapport.
 *
 *   npm run a11y                         construit .next-c3 s'il manque (puis le supprime), audite
 *   node scripts/a11y.mjs --garder-build garde le build pour une exécution suivante
 *   node scripts/a11y.mjs --reconstruire force un nouveau build
 *   A11Y_PAGES=accueil,connexion         audit complet de ces pages seulement (le parcours est toujours fait)
 *   A11Y_RAPIDE=1                        sans mesure par pixels du focus
 *   A11Y_PARCOURS=0 / A11Y_FRAMES=1      mise au point du script : sans parcours de projet / journal des images
 *
 * Code de sortie : 0 si aucune violation axe sérieuse ou critique et aucun contrôle bloquant en échec.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = path.join(ROOT, "platform");
const ARGS = new Set(process.argv.slice(2));
if (ARGS.has("--aide") || ARGS.has("--help")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*?/, "").replace(/^ \* ?/gm, ""));
  process.exit(0);
}
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.resolve(process.env.A11Y_OUT ?? path.join(ROOT, "e2e-shots", "a11y"));
const SHOTS = path.join(OUT, "captures");
const DIST = process.env.REBORN_DIST_DIR || ".next-c3";
const ONLY = (process.env.A11Y_PAGES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const PIXELS = !process.env.A11Y_RAPIDE;
const AXE_PATH = path.join(PLATFORM, "node_modules", "axe-core", "axe.min.js");
const RESERVED = new Set([3000, 3100, 4000, 4001, 4100, 5050]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!/^\.next-[A-Za-z0-9_-]+$/.test(DIST)) {
  console.error(`REBORN_DIST_DIR=${DIST} refusé : seul un dossier isolé .next-xxx est accepté (.next sert au Studio en service).`);
  process.exit(2);
}
if (!fs.existsSync(AXE_PATH)) {
  console.error("axe-core absent : cd platform && npm install (devDependency axe-core).");
  process.exit(2);
}
const AXE_SRC = fs.readFileSync(AXE_PATH, "utf8");
const AXE_VERSION = JSON.parse(fs.readFileSync(path.join(PLATFORM, "node_modules", "axe-core", "package.json"), "utf8")).version;
fs.mkdirSync(SHOTS, { recursive: true });

/* ======================================================================== */
/* Build isolé                                                                */
/* ======================================================================== */
const distPath = path.join(PLATFORM, DIST);
let builtHere = false;
if (ARGS.has("--reconstruire")) fs.rmSync(distPath, { recursive: true, force: true });
if (!fs.existsSync(path.join(distPath, "BUILD_ID"))) {
  // `next build` réécrit tsconfig.json et next-env.d.ts : restaurés à l'identique ensuite.
  const keep = ["tsconfig.json", "next-env.d.ts"].filter((f) => fs.existsSync(path.join(PLATFORM, f))).map((f) => [f, fs.readFileSync(path.join(PLATFORM, f))]);
  console.log(`Construction isolée du Studio (${DIST})…`);
  const r = spawnSync(process.execPath, [path.join(PLATFORM, "node_modules/next/dist/bin/next"), "build"], { cwd: PLATFORM, env: { ...process.env, REBORN_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit" });
  for (const [f, buf] of keep) if (!fs.readFileSync(path.join(PLATFORM, f)).equals(buf)) fs.writeFileSync(path.join(PLATFORM, f), buf);
  builtHere = true;
  if (r.status !== 0) {
    fs.rmSync(distPath, { recursive: true, force: true });
    console.error("Échec du build isolé.");
    process.exit(1);
  }
}

/* ======================================================================== */
/* Pile isolée : Studio, Relatio de test, Chrome                              */
/* ======================================================================== */
async function freePort() {
  for (;;) {
    const p = await new Promise((res) => {
      const s = net.createServer().listen(0, "127.0.0.1", () => {
        const port = s.address().port;
        s.close(() => res(port));
      });
    });
    if (!RESERVED.has(p)) return p;
  }
}
async function up(url, ms = 60000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).status < 500) return true;
    } catch {}
  }
  return false;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-a11y-"));
const [studioPort, crmPort, relPort, cdpPort] = [await freePort(), await freePort(), await freePort(), await freePort()];
const BASE = `http://127.0.0.1:${studioPort}`;
const REL = `http://127.0.0.1:${relPort}`;
const CRM = `http://127.0.0.1:${crmPort}`;
const DATA = path.join(tmp, "studio");
const env = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  REBORN_DATA_DIR: DATA,
  REBORN_APPS_DIR: path.join(tmp, "apps"),
  CRM_PORT: String(crmPort),
  REBORN_DIST_DIR: DIST,
  REBORN_AUTH_SECRET: randomBytes(32).toString("base64url"),
  REBORN_EGRESS_ALLOW: `127.0.0.1:${relPort}`, // sortie réseau vers le seul ancien logiciel de test
};
const logFd = fs.openSync(path.join(tmp, "serveurs.log"), "a");
const relatio = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { PATH: env.PATH, LEGACY_CRM_PORT: String(relPort), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: path.join(tmp, "relatio") }, detached: true, stdio: ["ignore", logFd, logFd] });
const studio = spawn(process.execPath, [path.join(PLATFORM, "node_modules/next/dist/bin/next"), "start", "-p", String(studioPort), "-H", "127.0.0.1"], { cwd: PLATFORM, env, detached: true, stdio: ["ignore", logFd, logFd] });
const profile = path.join(tmp, "chrome");
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--lang=fr-FR", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });

/* ======================================================================== */
/* Secrets de test : jamais affichés, masqués partout                        */
/* ======================================================================== */
const SECRETS = new Set();
const secret = (s) => (s && SECRETS.add(String(s)), s);
function redact(s) {
  let t = String(s ?? "");
  for (const x of SECRETS) if (x.length >= 6) t = t.split(x).join("•••");
  return t
    .replace(/(#\/activation\/)[A-Za-z0-9_-]{12,}/g, "$1•••")
    .replace(/(token=)[A-Za-z0-9_.-]{12,}/g, "$1•••")
    .replace(/(session_token=)[^;\s"]+/g, "$1•••");
}
const log = (...a) => console.log(redact(a.join(" ")));

/* ======================================================================== */
/* CDP                                                                        */
/* ======================================================================== */
let ws;
let seq = 0;
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
let where = "démarrage";
async function connect() {
  for (let i = 0; i < 150; i++) {
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
          } else if (msg.method === "Runtime.exceptionThrown") exceptions.push({ page: where, text: redact(String(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text).slice(0, 300)) });
          else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push({ page: where, text: redact(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)) });
          else if (msg.method === "Page.javascriptDialogOpening") {
            consoleErrors.push({ page: where, text: `boîte de dialogue native inattendue : ${msg.params.type}` });
            send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
          }
        };
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome injoignable");
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} : pas de réponse`));
    }, 90000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`CDP ${method} : ${msg.error.message}`));
      else resolve(msg.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`.slice(0, 400));
  return r.result?.value;
}
/** Appelle une méthode des outils installés dans la page (installés à la demande). */
const inPage = (method, ...args) => evaluate(`(${installHelpers.toString()})().${method}(...${JSON.stringify(args)})`);
async function waitFor(expr, timeout = 20000) {
  for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(150)) {
    try {
      if (await evaluate(`(async () => { try { return !!(await (${expr})); } catch { return false } })()`)) return true;
    } catch {}
  }
  return false;
}
const norm = (s) => JSON.stringify(String(s).replace(/\s+/g, " "));
const hasText = (s, timeout = 20000) => waitFor(`document.body.textContent.replace(/\\s+/g, " ").includes(${norm(s)})`, timeout);

/* --- Fenêtres --------------------------------------------------------------- */
const VIEW = {
  desktop: { label: "1440", width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { label: "390", width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
  reflow: { label: "320", width: 320, height: 640, deviceScaleFactor: 1, mobile: true },
  zoom: { label: "200 %", width: 720, height: 450, deviceScaleFactor: 2, mobile: false },
};
let view = VIEW.desktop;
async function setView(v) {
  view = v;
  await send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor, mobile: v.mobile });
  await send("Emulation.setTouchEmulationEnabled", { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 1 });
}
async function reducedMotion(on) {
  await send("Emulation.setEmulatedMedia", { features: on ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [] });
}
/** Page stable : document chargé, plus de squelette ni de zone occupée, texte inchangé 600 ms. */
async function settle(timeout = 8000) {
  await waitFor("document.readyState === 'complete'", 20000);
  let last = -1;
  let stable = 0;
  for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(200)) {
    const s = await evaluate(`(() => { const busy = [...document.querySelectorAll(".ds-skeleton, .boot, [aria-busy=true]")].filter((e) => e.getClientRects().length).length; return { len: document.body.innerText.length, busy }; })()`).catch(() => null);
    if (!s) continue;
    if (s.len === last && !s.busy) {
      if (++stable >= 3) return true;
    } else stable = 0;
    last = s.len;
  }
  return false;
}
async function goto(url, ready) {
  // Chargement complet à chaque fois (une adresse qui ne diffère que par #… ne recharge pas la page).
  await send("Page.navigate", { url: "about:blank" });
  await sleep(50);
  await send("Page.navigate", { url: url.startsWith("http") ? url : BASE + url });
  await sleep(150);
  await waitFor("document.readyState === 'complete'", 30000);
  if (ready) await waitFor(ready, 20000);
  await ensureFrames(`chargement de ${url.startsWith("http") ? "(logiciel livré)" : url}`);
  await settle();
}

/* --- Clavier, souris, saisie -------------------------------------------- */
const KEYS = {
  Tab: { code: "Tab", vk: 9 },
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  Backspace: { code: "Backspace", vk: 8 },
};
async function press(name, { shift = false, wait = 60 } = {}) {
  const k = KEYS[name];
  const key = k.key ?? name;
  const modifiers = shift ? 8 : 0;
  await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers });
  if (wait) await sleep(wait);
}
/** Saisie réelle : focus, sélection, insertion de texte (évènements natifs, compatibles React). */
async function typeInto(selector, value) {
  const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: "center" }); el.focus(); el.select?.(); return true; })()`);
  if (!ok) throw new Error(`champ introuvable : ${selector}`);
  if (value === "") await press("Backspace", { wait: 0 });
  else await send("Input.insertText", { text: value });
  await sleep(40);
}
/** Clique (activation JS) le premier élément visible et actif dont le texte contient `txt`. */
const click = (txt, tags = "button, a, label, [role=radio], [role=tab]", scope = "document") =>
  evaluate(`(() => { const t = ${norm(txt)}; const root = ${scope === "document" ? "document" : `document.querySelector(${JSON.stringify(scope)})`}; if (!root) return false;
    const el = [...root.querySelectorAll(${JSON.stringify(tags)})].find((x) => x.textContent.replace(/\\s+/g, " ").includes(t) && !x.disabled && x.getAttribute("aria-disabled") !== "true" && x.getClientRects().length);
    if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
async function clickWhen(txt, timeout = 20000, tags, scope) {
  for (const t0 = Date.now(); Date.now() - t0 < timeout; await sleep(250)) if (await click(txt, tags, scope)) return true;
  return false;
}
const clickSel = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`);
/** Donne le focus (comme après une tabulation : le dernier évènement est clavier) au premier élément correspondant. */
const focusText = (txt, tags = "button, a", scope = "document") =>
  evaluate(`(() => { const t = ${norm(txt)}; const root = ${scope === "document" ? "document" : `document.querySelector(${JSON.stringify(scope)})`}; if (!root) return false;
    const el = [...root.querySelectorAll(${JSON.stringify(tags)})].find((x) => x.textContent.replace(/\\s+/g, " ").includes(t) && !x.disabled && x.getClientRects().length);
    if (!el) return false; el.scrollIntoView({ block: "center" }); el.focus(); return document.activeElement === el; })()`);
const focusSel = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: "center" }); el.focus(); return document.activeElement === el; })()`);
const api = (method, url, body) =>
  evaluate(`fetch(${JSON.stringify(url)}, { method: ${JSON.stringify(method)}, headers: { "content-type": "application/json" }, ${body === undefined ? "" : `body: ${JSON.stringify(JSON.stringify(body))},`} cache: "no-store" }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);

/* --- Captures et pixels ---------------------------------------------------- */
async function shot(name, full = false) {
  try {
    let params = { format: "png" };
    if (full) {
      const m = await send("Page.getLayoutMetrics");
      const h = Math.min(Math.ceil(m.cssContentSize?.height ?? view.height), 5000);
      params = { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: view.width, height: h, scale: 1 } };
    }
    const r = await send("Page.captureScreenshot", params);
    if (r?.data) fs.writeFileSync(path.join(SHOTS, `${name.replace(/[^a-z0-9-]+/gi, "-")}.png`), Buffer.from(r.data, "base64"));
  } catch {}
}
/** Décodeur PNG minimal (8 bits, RGB/RGBA, non entrelacé : format des captures de Chrome). */
function decodePng(buf) {
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const t = buf.toString("ascii", p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (t === "IHDR") {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      type = d[9];
    } else if (t === "IDAT") idat.push(d);
    else if (t === "IEND") break;
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 3);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = line[x * bpp + k];
    prev = line;
  }
  return { w, h, data: out };
}
async function clipShot(clip) {
  const r = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  return decodePng(Buffer.from(r.data, "base64"));
}
/**
 * Focus visible mesuré : même zone (élément + 8 px) capturée avec et sans le focus ; nombre de pixels
 * qui changent nettement (écart > 40 sur un canal), dont ceux hors de la boîte de l'élément (anneau).
 * Visible si la zone modifiée équivaut au moins à un trait de 1 px sur tout le périmètre.
 */
async function focusPixels(f) {
  const pad = 8;
  const m = await evaluate("({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })");
  const x = Math.max(0, f.x - pad);
  const y = Math.max(0, f.y - pad);
  const width = Math.max(2, Math.min(f.w + 2 * pad, m.w - x, 1600));
  const height = Math.max(2, Math.min(f.h + 2 * pad, m.h - y, 1200));
  const clip = { x, y, width, height };
  const on = await clipShot(clip);
  await inPage("blurActive");
  await sleep(40);
  const off = await clipShot(clip);
  await inPage("refocus", f.id);
  await sleep(20);
  if (on.w !== off.w || on.h !== off.h) return { changed: 0, ring: 0, perimeter: 0, ok: false, note: "zone modifiée entre deux captures" };
  let changed = 0;
  let ring = 0;
  const ix0 = f.x - x;
  const iy0 = f.y - y;
  for (let yy = 0; yy < on.h; yy++)
    for (let xx = 0; xx < on.w; xx++) {
      const i = (yy * on.w + xx) * 3;
      if (Math.max(Math.abs(on.data[i] - off.data[i]), Math.abs(on.data[i + 1] - off.data[i + 1]), Math.abs(on.data[i + 2] - off.data[i + 2])) > 40) {
        changed++;
        if (xx < ix0 || yy < iy0 || xx >= ix0 + f.w || yy >= iy0 + f.h) ring++;
      }
    }
  // Un anneau de 2 px entièrement visible change ≈ 2 × le périmètre ; on exige au moins la moitié
  // d'un trait de 1 px (ratio ≥ 0,5) et on signale un anneau partiellement coupé sous 1.
  const perimeter = 2 * (Math.min(f.w, width) + Math.min(f.h, height));
  const ratio = perimeter ? Math.round((changed / perimeter) * 100) / 100 : 0;
  return { changed, ring, perimeter, ratio, ok: ratio >= 0.5, partial: ratio < 1 };
}

/* ======================================================================== */
/* Outils installés dans la page (une fonction autonome, sérialisée)          */
/* ======================================================================== */
function installHelpers() {
  if (window.__a11y) return window.__a11y;
  const reg = new Map();
  let counter = 0;
  const idOf = (el) => {
    if (!el.__a11yId) {
      el.__a11yId = ++counter;
      reg.set(el.__a11yId, new WeakRef(el));
    }
    return el.__a11yId;
  };
  const get = (id) => reg.get(id)?.deref() ?? null;
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const alpha = (c) => {
    if (!c || c === "transparent") return 0;
    let m = c.match(/^rgba?\(([^)]*)\)/);
    if (m) {
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      if (parts.length < 4) return 1;
      return parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    }
    m = c.match(/\/\s*([\d.]+%?)\s*\)$/);
    if (m) return m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    return 1;
  };
  const shadowVisible = (s) => {
    if (!s || s === "none") return false;
    const parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
    return parts.some((p) => {
      if (/inset/.test(p) && !/[1-9]\d*(\.\d+)?px\s*(rgb|#|color)/.test(p)) return false;
      const color = (p.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i) || [])[0];
      if (color && alpha(color) <= 0.1) return false;
      const nums = (p.replace(/(rgba?\([^)]*\)|color\([^)]*\))/gi, "").match(/-?[\d.]+px/g) || []).map(parseFloat);
      const spread = nums[3] ?? 0;
      return spread >= 1 || (nums[2] ?? 0) >= 2;
    });
  };
  const visible = (el) => {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    // checkVisibility : écarte aussi le contenu non rendu (<details> fermé, content-visibility)
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible") return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (Number(getComputedStyle(e).opacity) === 0) return false;
      if (e.inert) return false;
    }
    return true;
  };
  const srOnly = (el) => {
    for (let e = el, i = 0; e && e.nodeType === 1 && i < 5; e = e.parentElement, i++) {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width <= 1 && r.height <= 1 && cs.overflow !== "visible") return true;
      if (cs.clip === "rect(0px, 0px, 0px, 0px)" || /inset\(50%\)/.test(cs.clipPath)) return true;
    }
    return false;
  };
  const landmarkOf = (el) => {
    const l = el.closest("dialog[open], [role=dialog], nav, main, header, footer, aside, [role=navigation], [role=main], [role=banner], [role=contentinfo], [role=search]");
    if (!l) return "page";
    const lab = l.getAttribute("aria-label");
    return l.tagName.toLowerCase() + (lab ? `[${lab}]` : l.id ? `#${l.id}` : "");
  };
  const visibleText = (el) => {
    let t = "";
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) t += c.textContent;
        else if (c.nodeType === 1 && !srOnly(c) && getComputedStyle(c).display !== "none" && c.getAttribute("aria-hidden") !== "true") walk(c);
        else if (c.nodeType === 1 && c.getAttribute("aria-hidden") === "true" && !srOnly(c)) walk(c);
      }
    };
    walk(el);
    return clean(t);
  };
  const nameOf = (el) => {
    const lab = el.getAttribute("aria-label");
    if (lab) return clean(lab);
    const lb = el.getAttribute("aria-labelledby");
    if (lb) return clean(lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? "").join(" "));
    if (el.labels?.length) return clean([...el.labels].map((l) => l.textContent).join(" "));
    const t = clean(el.textContent);
    if (t) return t;
    const img = el.querySelector?.("img[alt]");
    return clean(el.getAttribute("title") || img?.alt || el.getAttribute("placeholder") || (el.type === "submit" ? el.value : "") || "");
  };
  const desc = (el) => {
    const r = el.getBoundingClientRect();
    const name = nameOf(el).slice(0, 70);
    return {
      id: idOf(el),
      tag: el.tagName.toLowerCase(),
      sel: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : "") + (el.getAttribute("type") && el.tagName !== "BUTTON" ? `[type=${el.getAttribute("type")}]` : ""),
      name,
      x: Math.round(r.left + scrollX),
      y: Math.round(r.top + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
      landmark: landmarkOf(el),
    };
  };
  const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable="true"]';

  function focusInfo() {
    const a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) return null;
    // Champ natif visuellement masqué (ex. <input type=file> sous un bouton stylé) : l'indicateur est
    // porté par son libellé visible ; c'est cette zone qui est mesurée.
    const own = a.getBoundingClientRect();
    const label = (own.width * own.height < 100 || srOnly(a)) && [...(a.labels ?? [])].find((l) => visible(l) && !srOnly(l));
    const vis = label || a;
    const cs = getComputedStyle(vis);
    const ow = parseFloat(cs.outlineWidth) || 0;
    const outlineOk = cs.outlineStyle !== "none" && ow >= 1 && alpha(cs.outlineColor) > 0.1;
    const shadowOk = shadowVisible(cs.boxShadow);
    const r = vis.getBoundingClientRect();
    // Focus non masqué (WCAG 2.4.11) : centre et coins de l'élément, élément réellement au premier plan ?
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ];
    let inside = 0;
    let hit = 0;
    let cover = null;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      inside++;
      const e = document.elementFromPoint(x, y);
      if (e && (e === vis || vis.contains(e) || e === a || a.contains(e) || [...(a.labels ?? [])].some((l) => l.contains(e)))) hit++;
      else if (e && !cover) cover = e.tagName.toLowerCase() + (e.id ? `#${e.id}` : e.className && typeof e.className === "string" ? `.${e.className.split(" ")[0]}` : "");
    }
    const obscured = inside === 0 ? "hors écran" : hit === 0 ? "masqué" : hit < inside ? "partiel" : "non";
    const d = desc(a);
    if (label) Object.assign(d, { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), via: "libellé" });
    return {
      ...d,
      outline: outlineOk ? `${cs.outlineStyle} ${cs.outlineWidth}` : "aucun",
      outlineOk,
      shadowOk,
      inDialog: !!a.closest("dialog[open]"),
      tabindex: a.tabIndex,
      visible: visible(vis),
      obscured,
      cover,
      // Champ date/heure : Tab parcourt d'abord ses segments (jour, mois, année) sans changer d'élément.
      multiSegment: a.tagName === "INPUT" && ["date", "time", "datetime-local", "month", "week"].includes(a.type),
    };
  }
  /** Éléments tabulables visibles jamais atteints par le parcours au clavier. */
  function unreached(ids) {
    const seen = new Set(ids);
    return [...document.querySelectorAll(FOCUSABLE)]
      .filter((el) => el.tabIndex >= 0 && !el.disabled && visible(el) && !seen.has(el.__a11yId) && !el.closest("[inert]") && !(el.closest("dialog") && !el.closest("dialog[open]")))
      // Groupe de boutons radio : un seul arrêt (le bouton coché), les autres se choisissent aux flèches.
      .filter((el) => !(el.type === "radio" && !el.checked && el.name && document.querySelector(`input[type=radio][name="${CSS.escape(el.name)}"]:checked`)))
      .slice(0, 8)
      .map((el) => desc(el).name || desc(el).sel);
  }
  function blurActive() {
    document.activeElement?.blur?.();
    return true;
  }
  function refocus(id) {
    const el = get(id);
    if (el) el.focus({ preventScroll: true });
    return document.activeElement === el;
  }
  function tabbableCount() {
    return [...document.querySelectorAll(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && !el.disabled && visible(el)).length;
  }
  function positiveTabindex() {
    return [...document.querySelectorAll("[tabindex]")].filter((el) => el.tabIndex > 0).map(desc);
  }
  function isInlineLink(el) {
    if (el.tagName !== "A") return false;
    const cs = getComputedStyle(el);
    if (!cs.display.startsWith("inline") || cs.display === "inline-flex" || cs.display === "inline-block") return false;
    const p = el.parentElement;
    if (!p) return false;
    const txt = clean([...p.childNodes].filter((n) => n !== el).map((n) => n.textContent).join(""));
    return txt.length > 2;
  }
  /** Cibles tactiles : boîte de l'élément (et de son libellé pour une case ou un bouton radio). */
  function targets() {
    const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"])';
    const small = [];
    let total = 0;
    for (const el of document.querySelectorAll(sel)) {
      if (el.disabled || !visible(el) || srOnly(el) || el.closest("dialog:not([open])")) continue;
      if (el.matches(".ds-skip, .skip, [id=skip]")) continue;
      total++;
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      if (el.matches("input[type=checkbox], input[type=radio]")) {
        for (const l of el.labels ?? []) {
          const lr = l.getBoundingClientRect();
          w = Math.max(w, lr.width);
          h = Math.max(h, lr.height);
        }
      }
      if (w >= 43.5 && h >= 43.5) continue;
      small.push({ ...desc(el), w: Math.round(w), h: Math.round(h), inline: isInlineLink(el), below24: w < 24 || h < 24 });
    }
    return { total, small };
  }
  /** Défilement horizontal de page et éléments qui dépassent sans conteneur défilant. */
  function overflow() {
    const vw = document.documentElement.clientWidth;
    const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const hiddenX = ["hidden", "clip"].includes(getComputedStyle(document.documentElement).overflowX) || ["hidden", "clip"].includes(getComputedStyle(document.body).overflowX);
    const offenders = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (offenders.length >= 40) break;
      if (!visible(el) || srOnly(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 && r.left >= -1) continue;
      if (getComputedStyle(el).position === "fixed") continue;
      let contained = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (getComputedStyle(p).overflowX !== "visible") {
          contained = true;
          break;
        }
      if (!contained && !offenders.some((o) => o.el.contains(el))) {
        // Diagnostic : ancêtres qui pourraient couper le dépassement sans propriété overflow
        const chain = [];
        for (let p = el.parentElement; p && p !== document.documentElement && chain.length < 4; p = p.parentElement) {
          const s = getComputedStyle(p);
          const bits = [s.contain !== "none" ? `contain:${s.contain}` : "", s.contentVisibility !== "visible" ? `content-visibility:${s.contentVisibility}` : "", s.clipPath !== "none" ? "clip-path" : "", s.transform !== "none" ? "transform" : ""].filter(Boolean);
          if (bits.length) chain.push(`${p.tagName.toLowerCase()}(${bits.join(",")})`);
        }
        offenders.push({ el, d: { ...desc(el), right: Math.round(r.right), clipChain: chain } });
      }
    }
    // Fenêtre de mise en page (clientWidth) et non innerWidth : en mode mobile, le navigateur dézoome
    // une page trop large et innerWidth grandit avec elle, ce qui masquerait le débordement.
    return { scroll: sw - vw, hiddenX, offenders: offenders.slice(0, 8).map((o) => o.d) };
  }
  /** Contenu coupé : conteneur qui masque son débordement alors que son texte dépasse. */
  function clipped() {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (out.length >= 30) break;
      if (!visible(el) || srOnly(el)) continue;
      const cs = getComputedStyle(el);
      const cx = cs.overflowX === "hidden" || cs.overflowX === "clip";
      const cy = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (!cx && !cy) continue;
      const overX = cx && el.scrollWidth > el.clientWidth + 2;
      const overY = cy && el.scrollHeight > el.clientHeight + 2;
      if (!overX && !overY) continue;
      const text = clean(el.innerText);
      if (!text) continue;
      const ellipsis = cs.textOverflow === "ellipsis" || (cs.webkitLineClamp && cs.webkitLineClamp !== "none");
      out.push({ ...desc(el), overX, overY, ellipsis: !!ellipsis, text: text.slice(0, 60) });
    }
    return out;
  }
  /** Mouvement : animations en cours et transitions > 10 ms (calculées), défilement doux. */
  function motion() {
    const running = document
      .getAnimations()
      .filter((a) => a.playState === "running" || a.playState === "pending")
      .map((a) => {
        const t = a.effect?.getComputedTiming?.() ?? {};
        return { name: a.animationName || a.transitionProperty || a.constructor.name, duration: Math.round(Number(t.duration) || 0), iterations: t.iterations === Infinity ? "infini" : t.iterations, target: a.effect?.target ? desc(a.effect.target).sel + (a.effect.pseudoElement ?? "") : null };
      })
      .filter((a) => a.duration > 10 || a.iterations === "infini");
    let long = 0;
    const sample = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const td = Math.max(...cs.transitionDuration.split(",").map((s) => parseFloat(s) * (s.trim().endsWith("ms") ? 1 : 1000)));
      const ad = cs.animationName !== "none" ? Math.max(...cs.animationDuration.split(",").map((s) => parseFloat(s) * (s.trim().endsWith("ms") ? 1 : 1000))) : 0;
      if (td > 10 || ad > 10) {
        long++;
        if (sample.length < 5) sample.push(`${desc(el).sel} (${Math.round(Math.max(td, ad))} ms)`);
      }
    }
    return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, running, long, sample, smooth: getComputedStyle(document.documentElement).scrollBehavior === "smooth" };
  }
  /** Boutons et liens : sans texte visible (icône seule) → nom accessible ; avec texte → nom qui le contient (2.5.3). */
  function iconButtons() {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
      if (!visible(el) || srOnly(el)) continue;
      const vt = visibleText(el);
      const al = clean(el.getAttribute("aria-label"));
      if (vt) {
        const n = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
        if (al && !n(al).includes(n(vt))) out.push({ ...desc(el), kind: "nom différent du texte visible", visibleText: vt.slice(0, 50), ok: false });
        continue;
      }
      const name = nameOf(el);
      out.push({ ...desc(el), kind: "icône seule", ok: !!name });
    }
    return out;
  }
  /** Erreurs de formulaire : champs invalides reliés à un message, messages visibles rattachés à un champ. */
  function formErrors(scopeSel) {
    const scope = (scopeSel && document.querySelector(scopeSel)) || document;
    const invalid = [...scope.querySelectorAll('[aria-invalid="true"]')].map((el) => {
      const ids = clean(el.getAttribute("aria-describedby")).split(" ").filter(Boolean);
      const texts = ids.map((i) => document.getElementById(i));
      const text = texts.filter(Boolean).map((t) => clean(t.textContent)).filter(Boolean).join(" | ");
      return { ...desc(el), field: el.getAttribute("name") || el.id, describedby: ids, missing: ids.filter((_, k) => !texts[k]), text: text.slice(0, 140), linked: !!text };
    });
    const messages = [...scope.querySelectorAll(".ds-error, .field-error:not([hidden]), [data-field-error]")].filter((e) => visible(e) && clean(e.textContent));
    const unlinked = messages
      .filter((m) => {
        const ids = [m.id, ...[...m.querySelectorAll("[id]")].map((x) => x.id)].filter(Boolean);
        let p = m;
        while (p && !p.id && p !== scope) p = p.parentElement;
        if (p?.id) ids.push(p.id);
        return !ids.some((id) => document.querySelector(`[aria-describedby~="${CSS.escape(id)}"]`));
      })
      .map((m) => clean(m.textContent).slice(0, 100));
    const alerts = [...scope.querySelectorAll('[role=alert], [aria-live="assertive"], [aria-live="polite"], [role=status]')].map((e) => clean(e.textContent)).filter(Boolean).map((t) => t.slice(0, 140));
    const a = document.activeElement;
    return { invalid, unlinked, alerts, active: a && a !== document.body ? { ...desc(a), invalid: a.getAttribute("aria-invalid") === "true", alert: !!a.closest('[role=alert]') } : null };
  }
  function dialogState() {
    const d = [...document.querySelectorAll("dialog[open]")].at(-1) ?? document.querySelector("[role=dialog]:not([hidden]), .drawer-open .side");
    const a = document.activeElement;
    return { open: !!d, modal: !!d?.matches?.(":modal"), name: d ? clean(d.getAttribute("aria-label") || (d.getAttribute("aria-labelledby") && document.getElementById(d.getAttribute("aria-labelledby"))?.textContent) || "") : "", active: a && a !== document.body ? desc(a) : null, inside: !!(d && a && d.contains(a)), body: !a || a === document.body };
  }
  window.__a11y = { get, desc, focusInfo, unreached, blurActive, refocus, tabbableCount, positiveTabindex, targets, overflow, clipped, motion, iconButtons, formErrors, dialogState };
  return window.__a11y;
}

/* ======================================================================== */
/* Rapport                                                                    */
/* ======================================================================== */
const report = {
  generated_at: new Date().toISOString(),
  tool: { axe_core: AXE_VERSION, chrome: null, dist: DIST },
  method: {
    axe: "axe-core injecté par CDP, règles WCAG 2.0/2.1/2.2 A et AA + bonnes pratiques (hors expérimentales), target-size et label-content-name-mismatch activées",
    focus: "Tab réel (Input.dispatchKeyEvent). Focus visible = contour (outline ≥ 1 px, opaque) ou ombre portée calculés, ET mesure par pixels : même zone capturée avec et sans focus, ≥ 1 px de changement sur le périmètre. Transitions neutralisées (prefers-reduced-motion) pendant la mesure pour comparer des états stables.",
    zoom: "zoom navigateur 200 % d'une fenêtre 1440 × 900 = fenêtre CSS 720 × 450, densité 2",
    reflow: "fenêtre 320 × 640 (mobile) : défilement horizontal de page et éléments débordant hors d'un conteneur défilant",
    targets: "à 390 px : boîte de chaque élément interactif (avec son libellé pour une case ou un bouton radio) ; exceptions < 44 px rapportées, < 24 px signalées",
    browser: "Chrome sans pilote cesse parfois de produire des images après la fermeture d'une fenêtre modale (requestAnimationFrame non servi, transitions figées) : la production est vérifiée avant chaque analyse et relancée (Page.bringToFront) ; une transition encore en cours après 3 s est menée à son terme avant la mesure des contrastes. Non reproduit hors de ce script (sondes isolées : même séquence clavier sur la même page, images produites normalement) ; cause exacte non établie.",
  },
  pages: [],
  scenarios: [],
  journey: [],
  exceptions,
  console_errors: consoleErrors,
};
const results = report.journey;
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: redact(detail) });
  log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
}
function scenario(name, ok, detail = {}) {
  report.scenarios.push(JSON.parse(redact(JSON.stringify({ name, ok: !!ok, ...detail }))));
  log(`${ok ? "✓" : "✗"} [scénario] ${name}${detail.note ? ` — ${detail.note}` : ""}`);
  return !!ok;
}
function saveReport() {
  fs.writeFileSync(path.join(OUT, "a11y-report.json"), redact(JSON.stringify(report, null, 1)));
}

/* ======================================================================== */
/* Mesures                                                                    */
/* ======================================================================== */
const AXE_OPTIONS = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
  rules: { "target-size": { enabled: true }, "label-content-name-mismatch": { enabled: true } },
  resultTypes: ["violations", "incomplete"],
};
/**
 * axe sur la page entière, en haut de page (une barre collante ne recouvre alors aucun champ) et sans
 * transition en cours. Une violation de contraste est confirmée par une seconde analyse 1,5 s plus tard :
 * un bouton momentanément désactivé pendant une actualisation (exempté, WCAG 1.4.3) n'est pas compté,
 * il est rapporté comme « transitoire ».
 */
async function runAxe() {
  await ensureFrames("analyse axe");
  await evaluate("window.scrollTo(0, 0); true");
  const first = await axeOnce();
  if (first.violations.some((v) => v.id === "color-contrast")) {
    await sleep(1500);
    const second = await axeOnce();
    const persists = (v) => second.violations.some((w) => w.id === v.id && w.targets.some((t) => v.targets.some((u) => u.target === t.target)));
    first.transient = first.violations.filter((v) => v.id === "color-contrast" && !persists(v));
    first.violations = first.violations.filter((v) => v.id !== "color-contrast" || persists(v));
    for (const v of first.transient) log(`    (contraste transitoire, non confirmé par la seconde analyse : ${v.targets.map((t) => t.target).join(" | ")})`);
    // Diagnostic des contrastes confirmés : état réel de l'élément échantillonné pendant 2 s
    for (const v of first.violations.filter((x) => x.id === "color-contrast")) {
      for (const t of v.targets.slice(0, 3)) {
        t.states = await evaluate(`(async () => { const seen = new Map(); for (let i = 0; i < 14; i++) { const el = document.querySelector(${JSON.stringify(t.target)}); if (el) { const cs = getComputedStyle(el);
          const k = JSON.stringify({ disabled: !!el.disabled, matchesDisabled: el.matches(":disabled"), ariaDisabled: el.getAttribute("aria-disabled"), busy: el.getAttribute("aria-busy"), color: cs.color, background: cs.backgroundColor, text: el.textContent.trim().slice(0, 40), anims: el.getAnimations().map((a) => a.playState + ":" + (a.transitionProperty || a.animationName)).join(",") }); seen.set(k, (seen.get(k) ?? 0) + 1); }
          await new Promise((r) => setTimeout(r, 150)); } return [...seen].map(([k, n]) => ({ ...JSON.parse(k), samples: n })); })()`).catch(() => null);
        log(`    diagnostic ${t.target} : ${JSON.stringify(t.states)}`);
      }
    }
  }
  return first;
}
async function axeOnce() {
  // Couleurs lues à l'état final : aucune transition en cours (sinon un bouton qui vient d'être
  // réactivé est mesuré avec les couleurs de l'état désactivé). Une transition encore « en cours »
  // après 3 s (horloge d'animation du navigateur sans pilote figée) est menée à son terme.
  if (!(await waitFor("document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations !== Infinity).length === 0", 3000))) {
    const n = await evaluate("(() => { let n = 0; for (const a of document.getAnimations()) { const t = a.effect?.getComputedTiming?.(); if (a.playState === 'running' && t && t.iterations !== Infinity) { a.finish(); n++; } } return n; })()").catch(() => 0);
    if (n) log(`    (${n} transition(s) encore en cours après 3 s : menée(s) à leur terme avant la mesure)`);
  }
  if (!(await evaluate("typeof window.axe !== 'undefined'"))) await evaluate(AXE_SRC + ";true");
  return evaluate(`axe.run(document, ${JSON.stringify(AXE_OPTIONS)}).then((r) => ({
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, wcag: v.tags.filter((t) => /^wcag\\d/.test(t)), nodes: v.nodes.length,
      targets: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), summary: (n.failureSummary || "").split("\\n").slice(1, 3).join(" ").trim().slice(0, 220) })) })),
    incomplete: r.incomplete.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length,
      reasons: [...new Set(v.nodes.flatMap((n) => [...n.any, ...n.all, ...n.none].map((c) => c.message)).filter(Boolean))].slice(0, 3).map((m) => m.slice(0, 160)),
      targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) })),
    passes: r.passes.length, inapplicable: r.inapplicable.length }))`);
}
const countImpacts = (v) => ({ critical: v.filter((x) => x.impact === "critical").length, serious: v.filter((x) => x.impact === "serious").length, moderate: v.filter((x) => x.impact === "moderate").length, minor: v.filter((x) => x.impact === "minor").length });

/**
 * Parcours au clavier depuis le haut de la page : Tab jusqu'à la fin (interface du navigateur) ou au
 * retour sur le premier élément, puis Maj+Tab sur le même trajet, puis le lien d'évitement.
 */
async function keyboardWalk({ pixels, max = 120, wrap = false }) {
  await reducedMotion(true); // états stables pour la mesure (transitions neutralisées)
  const initial = await inPage("focusInfo");
  const total = await inPage("tabbableCount");
  const positive = await inPage("positiveTabindex");
  const seq = [];
  let ended = "limite atteinte";
  let trap = null;
  let loop = null;
  let nulls = 0;
  let wrapAt = -1;
  let segments = 0;
  for (let i = 0; i < max; i++) {
    await press("Tab", { wait: 40 });
    const f = await inPage("focusInfo");
    if (!f) {
      if (seq.length) {
        // Interface du navigateur. Si la page avait placé le focus plus bas (focus initial), on fait le
        // tour complet : la tabulation suivante reprend en haut de la page.
        if ((initial || wrap) && wrapAt < 0) {
          wrapAt = seq.length;
          continue;
        }
        ended = "fin (interface du navigateur)";
        break;
      }
      if (++nulls > 3) {
        ended = "aucun élément atteint";
        break;
      }
      continue;
    }
    if (seq.length && f.id === seq[0].id) {
      ended = "retour au premier élément";
      break;
    }
    if (seq.length && f.id === seq.at(-1).id) {
      // Champ date ou heure : Tab parcourt d'abord ses segments (jour, mois, année).
      if (f.multiSegment && ++segments <= 4) continue;
      trap = f;
      ended = "piège : le focus ne bouge plus";
      break;
    }
    segments = 0;
    if (seq.some((s) => s.id === f.id)) {
      loop = f;
      ended = "boucle : le focus revient sur un élément déjà parcouru";
      break;
    }
    const styled = f.outlineOk || f.shadowOk;
    if (PIXELS && (pixels || !styled) && f.visible && f.w > 0 && f.h > 0) {
      try {
        f.px = await focusPixels(f);
      } catch (e) {
        f.px = { error: e.message.slice(0, 120) };
      }
    }
    // Sans contour ni ombre calculés, il faut un changement net (≥ 1 px sur tout le périmètre : fond, bordure…).
    f.focusVisible = f.px && !f.px.error ? f.px.ok && (styled || f.px.ratio >= 1) : styled;
    f.ringClipped = !!(f.focusVisible && f.outlineOk && f.px && !f.px.error && f.px.partial);
    seq.push(f);
  }
  // Maj+Tab : le même trajet à rebours
  const k = Math.min(seq.length, 15);
  const back = [];
  for (let i = 0; i < k + 2 && back.length < k; i++) {
    await press("Tab", { shift: true, wait: 40 });
    const f = await inPage("focusInfo");
    if (f && !back.some((b) => b.id === f.id)) back.push(f);
  }
  const currentIsLast = ended === "limite atteinte";
  const expected = seq.slice(0, currentIsLast ? -1 : undefined).reverse().slice(0, k);
  const cmp = back.slice(0, expected.length);
  const reverseOk = expected.length === 0 || cmp.every((b, i) => b.id === expected[i]?.id);
  // Ordre visuel : remontée vers le haut ET la gauche dans un même repère (à examiner)
  const reversals = [];
  for (let i = 1; i < seq.length; i++) {
    if (i === wrapAt) continue; // retour en haut de page après l'interface du navigateur
    const a = seq[i - 1];
    const b = seq[i];
    if (a.landmark === b.landmark && b.y < a.y - 40 && b.x < a.x - 40 && !a.inDialog && !b.inDialog) reversals.push(`${a.name || a.sel} → ${b.name || b.sel}`);
  }
  const missed = ended === "limite atteinte" || trap || loop ? [] : await inPage("unreached", seq.map((f) => f.id));
  // Lien d'évitement : premier arrêt, visible au focus, Entrée → contenu principal
  let skip = { first: false };
  // Premier arrêt du document : celui qui suit l'interface du navigateur (ou le premier du parcours si
  // l'interface du navigateur a été atteinte en dernier).
  const firstInDoc = wrapAt >= 0 && wrapAt < seq.length ? seq[wrapAt] : seq[0];
  if (firstInDoc) {
    const s = firstInDoc;
    // Aucun bloc répété avant le contenu principal (premier arrêt déjà dans <main>) : lien sans objet (WCAG 2.4.1).
    skip = { first: /aller au contenu/i.test(s.name), name: s.name, visible: s.visible && s.obscured === "non", focusVisible: s.focusVisible, notNeeded: !/aller au contenu/i.test(s.name) && /^main/.test(s.landmark) };
    if (skip.first) {
      await inPage("refocus", s.id);
      await press("Enter", { wait: 250 });
      const after = await evaluate(`(() => { const a = document.activeElement; const m = document.querySelector("main"); return { inMain: !!(m && a && (a === m || m.contains(a))), id: a?.id || a?.tagName }; })()`);
      await press("Tab", { wait: 60 });
      const next = await evaluate(`(() => { const a = document.activeElement; const m = document.querySelector("main"); return !!(m && a && m.contains(a) && a !== m); })()`);
      skip.target = after.id;
      skip.works = after.inMain && next;
    }
  }
  await reducedMotion(false);
  const noFocus = seq.filter((f) => !f.focusVisible);
  const obscured = seq.filter((f) => f.obscured === "masqué");
  return {
    initial: initial ? `${initial.name || initial.sel}` : null,
    tabbable: total,
    reached: seq.length,
    ended,
    trap: trap ? trap.name || trap.sel : null,
    loop: loop ? loop.name || loop.sel : null,
    positiveTabindex: positive.map((p) => p.name || p.sel),
    focusVisible: seq.length - noFocus.length,
    noFocusVisible: noFocus.map((f) => ({ el: f.name || f.sel, sel: f.sel, outline: f.outline, shadow: f.shadowOk, px: f.px })),
    ringClipped: seq.filter((f) => f.ringClipped).map((f) => ({ el: (f.name || f.sel).slice(0, 60), sel: f.sel, ratio: f.px.ratio })),
    obscured: obscured.map((f) => `${f.name || f.sel} (sous ${f.cover})`),
    partial: seq.filter((f) => f.obscured === "partiel").length,
    reverseOk,
    reverseChecked: expected.length,
    reversals,
    wrapped: wrapAt >= 0,
    unreached: missed,
    skip,
    order: seq.map((f) => (f.name || f.sel).slice(0, 40)),
  };
}

/**
 * Audit complet d'une page : 1440 px (clavier + mesure du focus, axe, boutons-icônes), 390 px
 * (clavier, axe, cibles tactiles), 320 px (reflow), zoom 200 %, mouvement réduit.
 */
async function auditPage(def) {
  const { key, label, group, url, ready, noReload = false, before } = def;
  if (ONLY.length && !ONLY.includes(key)) return null;
  const entry = { key, label, group, url: typeof url === "string" ? redact(url) : "(dynamique)", widths: {} };
  report.pages.push(entry);
  const load = async () => {
    if (noReload) {
      await sleep(400);
      await settle(4000);
    } else await goto(typeof url === "function" ? url() : url, ready);
    if (before) await before();
  };
  try {
    for (const v of [VIEW.desktop, VIEW.mobile]) {
      where = `${label} (${v.label})`;
      await setView(v);
      await load();
      await dbgFrames(`${label} ${v.label} chargée`);
      const w = {};
      // Page non rechargée : point de départ inconnu, on fait le tour complet.
      w.keyboard = await keyboardWalk({ pixels: v === VIEW.desktop, wrap: noReload });
      await dbgFrames(`${label} ${v.label} après clavier`);
      await inPage("blurActive");
      w.axe = await runAxe();
      if (v === VIEW.desktop) {
        // Contenu replié (<details>) : axe ne teste pas ce qui est masqué ; seconde analyse, tout déplié.
        const opened = await evaluate(`(() => { const d = [...document.querySelectorAll("details:not([open])")].filter((x) => x.getClientRects().length); d.forEach((x) => (x.open = true)); return d.length; })()`);
        if (opened) {
          await sleep(400);
          w.axeExpanded = { opened, ...(await runAxe()) };
          for (const x of w.axeExpanded.violations) log(`    axe (déplié) ${x.impact} ${x.id} ×${x.nodes} : ${x.targets.map((t) => `${t.target} (${t.summary})`).join(" | ").slice(0, 400)}`);
        }
      }
      w.icons = await inPage("iconButtons");
      if (v === VIEW.mobile) {
        w.targets = await inPage("targets");
        w.overflow = await inPage("overflow");
      }
      await dbgFrames(`${label} ${v.label} après axe`);
      await shot(`${key}-${v.label}`, !noReload);
      await dbgFrames(`${label} ${v.label} après capture`);
      entry.widths[v.label] = w;
      const c = countImpacts(w.axe.violations);
      log(`  ${label} ${v.label} px : axe ${c.critical} crit. · ${c.serious} sér. · ${c.moderate} mod. · ${c.minor} min. — incomplets ${w.axe.incomplete.map((i) => `${i.id}×${i.nodes}`).join(", ") || "0"} — Tab ${w.keyboard.reached}/${w.keyboard.tabbable} (${w.keyboard.ended}), focus visible ${w.keyboard.focusVisible}/${w.keyboard.reached}${w.keyboard.obscured.length ? `, masqué ${w.keyboard.obscured.length}` : ""}`);
      for (const x of w.axe.violations) log(`    axe ${x.impact} ${x.id} ×${x.nodes} : ${x.targets.map((t) => `${t.target} (${t.summary})`).join(" | ").slice(0, 400)}`);
      for (const x of w.keyboard.noFocusVisible.slice(0, 5)) log(`    focus non visible : ${x.el} [${x.sel}] contour ${x.outline}${x.px ? `, pixels ${x.px.changed}/${x.px.perimeter}` : ""}`);
      saveReport();
    }
    // Reflow 320, zoom 200 %, mouvement réduit
    for (const [k, v] of [
      ["reflow320", VIEW.reflow],
      ["zoom200", VIEW.zoom],
    ]) {
      where = `${label} (${v.label})`;
      await setView(v);
      await load();
      entry[k] = { overflow: await inPage("overflow"), clipped: await inPage("clipped") };
      await dbgFrames(`${label} ${v.label}`);
      if (k === "zoom200") await shot(`${key}-zoom200`);
      if (k === "reflow320") await shot(`${key}-320`);
    }
    where = `${label} (mouvement réduit)`;
    await setView(VIEW.desktop);
    await reducedMotion(true);
    await load();
    entry.reducedMotion = await inPage("motion");
    await reducedMotion(false);
    await dbgFrames(`${label} mouvement réduit`);
    log(`  ${label} : 320 px défilement ${entry.reflow320.overflow.scroll} px${entry.reflow320.overflow.offenders.length ? ` (${entry.reflow320.overflow.offenders.length} élément(s) hors cadre)` : ""} · 200 % défilement ${entry.zoom200.overflow.scroll} px, coupé ${entry.zoom200.clipped.filter((c) => !c.ellipsis).length} · mouvement réduit : ${entry.reducedMotion.running.length} animation(s), ${entry.reducedMotion.long} transition(s) > 10 ms`);
  } catch (e) {
    entry.error = redact(e.message);
    log(`  ✗ ${label} : audit interrompu — ${e.message}`);
  } finally {
    await reducedMotion(false).catch(() => {});
    await setView(VIEW.desktop).catch(() => {});
    saveReport();
  }
  return entry;
}
/** axe seul (état intermédiaire du parcours). */
async function axeState(key, label) {
  where = label;
  const a = await runAxe();
  const c = countImpacts(a.violations);
  report.pages.push({ key, label, group: "état", url: "(état du parcours)", widths: { [view.label]: { axe: a } } });
  log(`  [état] ${label} ${view.label} px : axe ${c.critical} crit. · ${c.serious} sér. · ${c.moderate} mod. · ${c.minor} min.`);
  for (const x of a.violations) log(`    axe ${x.impact} ${x.id} ×${x.nodes} : ${x.targets.map((t) => `${t.target} (${t.summary})`).join(" | ").slice(0, 400)}`);
  saveReport();
  return a;
}

/* --- Scénarios ---------------------------------------------------------- */
/**
 * Dialogue : ouverture au clavier depuis son déclencheur, focus initial dedans, 20 Tab et 6 Maj+Tab
 * sans jamais atteindre la page derrière, Échap ferme, focus rendu au déclencheur.
 */
async function dialogScenario(name, { focus, openKey = "Enter", expectFocus, closeKey = "Escape" }) {
  await dbgFrames(`${name.slice(0, 30)} : avant`);
  const focused = await focus();
  if (!focused) return scenario(name, false, { note: "déclencheur introuvable" });
  const trigger = await inPage("focusInfo");
  await press(openKey, { wait: 450 });
  const opened = await inPage("dialogState");
  const initialOk = opened.open && opened.inside && (!expectFocus || new RegExp(expectFocus, "i").test(opened.active?.name ?? ""));
  const escapes = [];
  let inside = 0;
  for (let i = 0; i < 20; i++) {
    await press("Tab", { wait: 40 });
    const s = await inPage("dialogState");
    if (s.inside) inside++;
    else if (!s.body) escapes.push(s.active?.name || s.active?.sel);
  }
  for (let i = 0; i < 6; i++) {
    await press("Tab", { shift: true, wait: 40 });
    const s = await inPage("dialogState");
    if (s.inside) inside++;
    else if (!s.body) escapes.push(s.active?.name || s.active?.sel);
  }
  if (!(await inPage("dialogState")).inside) await inPage("refocus", trigger.id).catch(() => {});
  for (let i = 0; i < 4 && !(await inPage("dialogState")).inside; i++) await press("Tab", { wait: 40 });
  await dbgFrames(`${name.slice(0, 30)} : ouvert`);
  await press(closeKey, { wait: 450 });
  await dbgFrames(`${name.slice(0, 30)} : fermé`);
  await ensureFrames(name);
  const closed = await inPage("dialogState");
  const back = await inPage("focusInfo");
  const returned = !closed.open && back?.id === trigger.id;
  return scenario(name, opened.open && initialOk && escapes.length === 0 && returned, {
    trigger: trigger.name || trigger.sel,
    open_key: openKey,
    opened: opened.open,
    modal: opened.modal,
    initial_focus: opened.active?.name || opened.active?.sel || null,
    initial_ok: initialOk,
    tabs_inside: `${inside}/26`,
    escapes: [...new Set(escapes)].slice(0, 5),
    closed: !closed.open,
    focus_returned: returned,
    note: `ouvert ${opened.open} · focus initial « ${opened.active?.name ?? "?"} » · ${inside}/26 Tab dedans · sorties ${escapes.length} · Échap ferme ${!closed.open} · retour ${returned}`,
  });
}
/** Erreurs reliées : chaque champ invalide a un message (aria-describedby), chaque message est rattaché, focus utile. */
/** Le navigateur produit-il encore des images (requestAnimationFrame servi en moins d'1 s) ? */
/**
 * Chrome sans pilote peut cesser de produire des images après la fermeture d'une fenêtre modale :
 * requestAnimationFrame n'est plus servi et les transitions CSS restent figées. Non reproduit hors de
 * ce script (même séquence sur la même page dans une sonde isolée), mais cela fausserait les mesures
 * suivantes : on relance la production d'images et on le note dans le rapport.
 */
async function ensureFrames(context) {
  if ((await frameCheck()) >= 0) return true;
  const tries = [
    ["Page.bringToFront", () => send("Page.bringToFront")],
    ["Emulation.setFocusEmulationEnabled", () => send("Emulation.setFocusEmulationEnabled", { enabled: true })],
    ["Emulation.setDeviceMetricsOverride", () => setView(view)],
  ];
  for (const [label, fn] of tries) {
    await fn().catch(() => {});
    await sleep(100);
    if ((await frameCheck()) >= 0) {
      report.frame_recoveries = [...(report.frame_recoveries ?? []), `${context} → ${label}`];
      log(`    (production d'images du navigateur relancée après « ${context} » : ${label})`);
      return true;
    }
  }
  report.frame_recoveries = [...(report.frame_recoveries ?? []), `${context} → échec`];
  log(`    (production d'images du navigateur arrêtée après « ${context} » : aucune relance n'a fonctionné)`);
  return false;
}
const dbgFrames = async (label) => {
  if (process.env.A11Y_FRAMES) log(`    [images] ${label} : ${await frameCheck()} ms`);
};
const frameCheck = () => evaluate("new Promise((r) => { const t0 = performance.now(); const to = setTimeout(() => r(-1), 1000); requestAnimationFrame(() => { clearTimeout(to); r(Math.round(performance.now() - t0)); }); })").catch(() => -2);
async function formErrorScenario(name, { submit, scope, expectFields = 1 }) {
  await ensureFrames(name);
  const frameBefore = await frameCheck();
  // Journal des déplacements du focus pendant la soumission (diagnostic)
  await evaluate(`(() => { window.__focusLog = []; const t0 = performance.now(); window.__focusLogger ??= (e) => window.__focusLog.push((e.target.getAttribute?.("aria-label") || e.target.labels?.[0]?.textContent || e.target.textContent || e.target.tagName).trim().slice(0, 40) + " @" + Math.round(performance.now() - t0) + " ms"); document.addEventListener("focusin", window.__focusLogger); return true; })()`);
  await submit();
  await sleep(500);
  const focusLog = await evaluate("(() => { document.removeEventListener('focusin', window.__focusLogger); return window.__focusLog; })()").catch(() => []);
  const r = await inPage("formErrors", scope);
  const linked = r.invalid.filter((f) => f.linked).length;
  const focusOk = !!r.active && (r.active.invalid || r.active.alert || /erreur|corriger|incomplet|vérifi/i.test(r.active.name));
  const ok = r.invalid.length >= expectFields && linked === r.invalid.length && r.unlinked.length === 0 && focusOk;
  return scenario(name, ok, {
    invalid: r.invalid.map((f) => ({ field: f.field, linked: f.linked, message: f.text, missing_ids: f.missing })),
    unlinked_messages: r.unlinked,
    alerts: r.alerts.slice(0, 3),
    focus: r.active?.name || r.active?.sel || null,
    focus_log: focusLog,
    frame_ms_before: frameBefore,
    note: `${r.invalid.length} champ(s) aria-invalid, ${linked} relié(s) par aria-describedby, ${r.unlinked.length} message(s) non rattaché(s), focus sur « ${r.active?.name ?? "—"} »`,
  });
}

/* ======================================================================== */
/* Exécution                                                                  */
/* ======================================================================== */
let crmPid = null;
/** Processus des logiciels livrés de la pile isolée (run/server.pid de chaque dossier de <tmp>/apps). */
function deliveredPids(tmp) {
  const apps = path.join(tmp, "apps");
  let ids = [];
  try {
    ids = fs.readdirSync(apps);
  } catch {}
  return ids
    .map((id) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(apps, id, "run", "server.pid"), "utf8")).pid;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
const tag = randomBytes(3).toString("hex");
const account = { firstName: "Camille", lastName: "Morel", company: "Morel Équipements (jeu de test)", email: `camille.a11y.${tag}@exemple.test`, password: secret(`Phrase-de-test-${randomBytes(9).toString("base64url")}`) };
let pid = null;
let activationLink = null;
try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  report.tool.chrome = (await send("Browser.getVersion").catch(() => ({})))?.product ?? null;
  check(`Pile isolée démarrée (Studio ${DIST}, Relatio de test, dossiers temporaires, ports libres)`, (await up(`${BASE}/api/health`)) && (await up(`${REL}/login`)));
  const relPassword = secret(JSON.parse(fs.readFileSync(path.join(tmp, "relatio", ".credentials.json"), "utf8")).migration.password);

  /* ---------------- 1. Pages publiques (sans compte) ---------------- */
  log("\n— Pages publiques —");
  await auditPage({ key: "accueil", label: "Accueil", group: "site", url: "/", ready: "document.querySelector('h1')" });
  await auditPage({ key: "connexion", label: "Connexion", group: "auth", url: "/connexion", ready: "document.querySelector('input[name=email]')" });
  await auditPage({ key: "inscription", label: "Inscription", group: "auth", url: "/inscription", ready: "document.querySelector('input[name=firstName]')" });
  await auditPage({ key: "reinitialisation", label: "Réinitialisation (sans lien)", group: "auth", url: "/reinitialisation", ready: "document.querySelector('main h1')" });
  await auditPage({ key: "legal-conditions", label: "Conditions d'utilisation", group: "site", url: "/legal/conditions", ready: "document.querySelector('h1')" });
  await auditPage({ key: "legal-confidentialite", label: "Politique de confidentialité", group: "site", url: "/legal/confidentialite", ready: "document.querySelector('h1')" });

  // Entrée sur un lien, Espace / Entrée sur un bouton à bascule, erreurs de la connexion
  await setView(VIEW.desktop);
  await goto("/", "document.querySelector('h1')");
  where = "Accueil : Entrée sur un lien";
  const linkFocused = await focusText("Accéder à mes projets", "a");
  await press("Enter", { wait: 300 });
  scenario("Entrée active un lien (accueil → « Accéder à mes projets »)", linkFocused && (await waitFor("location.pathname === '/connexion'", 10000)), { note: await evaluate("location.pathname") });
  await goto("/connexion", "document.querySelector('input[name=email]')");
  where = "Connexion : bouton à bascule";
  await typeInto("input[name=password]", "abc-def");
  const tf = await focusSel("button[aria-controls][aria-pressed]");
  await press("Space", { wait: 200 });
  const afterSpace = await evaluate(`({ pressed: document.querySelector("button[aria-controls][aria-pressed]")?.getAttribute("aria-pressed"), type: document.querySelector("input[name=password]")?.type })`);
  await focusSel("button[aria-controls][aria-pressed]");
  await press("Enter", { wait: 200 });
  const afterEnter = await evaluate(`({ pressed: document.querySelector("button[aria-controls][aria-pressed]")?.getAttribute("aria-pressed"), type: document.querySelector("input[name=password]")?.type })`);
  scenario("Espace puis Entrée sur « Afficher le mot de passe » (aria-pressed, type du champ)", tf && afterSpace.pressed === "true" && afterSpace.type === "text" && afterEnter.pressed === "false" && afterEnter.type === "password", { note: `Espace → ${JSON.stringify(afterSpace)} ; Entrée → ${JSON.stringify(afterEnter)}` });
  await goto("/connexion", "document.querySelector('input[name=email]')");
  where = "Connexion : erreurs";
  await formErrorScenario("Connexion vide : erreurs reliées aux champs, focus utile", {
    submit: async () => {
      await focusText("Se connecter", "button");
      await press("Enter");
    },
    scope: "main",
  });
  await goto("/connexion", "document.querySelector('input[name=email]')");
  await typeInto("input[name=email]", `inconnu.${tag}@exemple.test`);
  await typeInto("input[name=password]", `mauvais-${randomBytes(4).toString("hex")}`);
  await press("Enter");
  await hasText("incorrect", 10000);
  const wrong = await inPage("formErrors", "main");
  scenario("Identifiants refusés : message annoncé (alerte) et focus sur le mot de passe", wrong.alerts.some((a) => /incorrect/i.test(a)) && wrong.active?.sel?.includes("password"), { alerts: wrong.alerts, focus: wrong.active?.sel, invalid: wrong.invalid.map((f) => ({ field: f.field, linked: f.linked })), note: `alertes : ${wrong.alerts.join(" | ").slice(0, 120)} ; focus ${wrong.active?.sel}` });

  /* ---------------- 2. Inscription réelle dans l'interface ---------------- */
  log("\n— Inscription —");
  await goto("/inscription", "document.querySelector('input[name=firstName]')");
  where = "Inscription : erreurs";
  await formErrorScenario("Inscription vide : erreurs reliées aux champs, focus sur le premier", {
    submit: async () => {
      await focusText("Créer mon compte", "button");
      await press("Enter");
    },
    scope: "main",
    expectFields: 6,
  });
  await focusSel("input[name=terms]");
  await press("Space", { wait: 150 });
  const termsChecked = await evaluate(`document.querySelector("input[name=terms]").checked`);
  scenario("Espace coche une case (conditions d'utilisation)", termsChecked === true, { note: `cochée : ${termsChecked}` });
  await typeInto("input[name=firstName]", account.firstName);
  await typeInto("input[name=lastName]", account.lastName);
  await typeInto("input[name=company]", account.company);
  await typeInto("input[name=email]", account.email);
  await typeInto("input[name=password]", account.password);
  await typeInto("input[name=confirm]", account.password);
  if (!(await evaluate(`document.querySelector("input[name=privacy]").checked`))) await clickSel("input[name=privacy]");
  if (!(await evaluate(`document.querySelector("input[name=terms]").checked`))) await clickSel("input[name=terms]");
  await clickWhen("Créer mon compte", 5000, "button");
  check("Compte client créé par le formulaire d'inscription (session ouverte)", await waitFor("location.pathname === '/espace' || location.pathname === '/projets/nouveau'", 20000), await evaluate("location.pathname"));
  const me = await api("GET", "/api/me");
  check("Compte client (rôle client, 2 consentements)", me.status === 200 && me.body?.user?.role === "client" && me.body?.consents?.length === 2, `HTTP ${me.status}`);

  /* ---------------- 3. Espace vide, projets vides (axe seul) ---------------- */
  await goto("/espace", "document.querySelector('main h1')");
  await axeState("espace-vide", "Vue d'ensemble (aucun projet)");
  await goto("/projets", "document.querySelector('main h1')");
  await axeState("projets-vide", "Mes projets (aucun projet)");

  /* ---------------- 4. Nouvelle migration : assistant dans l'interface ---------------- */
  log("\n— Nouvelle migration (assistant) —");
  await auditPage({ key: "nouveau", label: "Nouvelle migration (étape 1)", group: "plateforme", url: "/projets/nouveau", ready: "document.querySelector('[name=company]')" });
  await setView(VIEW.desktop);
  await goto("/projets/nouveau", "document.querySelector('[name=company]')");
  where = "Nouvelle migration : erreurs";
  await formErrorScenario("Assistant, étape 1 vide : erreur reliée au champ, focus sur le champ", {
    submit: async () => {
      await focusText("Continuer", "button");
      await press("Enter");
    },
    scope: "main",
  });
  await typeInto("[name=company]", "Morel Équipements (jeu de test)");
  await typeInto("[name=software]", "Relatio 2004");
  await typeInto("[name=legacy_url]", REL);
  await focusText("Continuer", "button");
  await press("Enter", { wait: 600 });
  check("Assistant : étape 2 « Accès »", await waitFor("!!document.querySelector('[name=legacy_username]')", 8000));
  // Boutons radio : flèches (comportement natif du groupe)
  const radios = await evaluate(`[...document.querySelectorAll("input[type=radio][name=access_mode]")].map((r) => ({ v: r.value, c: r.checked }))`);
  if (radios?.length > 1) {
    await focusSel("input[type=radio][name=access_mode]:checked");
    await press("ArrowDown", { wait: 200 });
    const moved = await evaluate(`document.querySelector("input[type=radio][name=access_mode]:checked")?.value`);
    await press("ArrowUp", { wait: 200 });
    const backTo = await evaluate(`document.querySelector("input[type=radio][name=access_mode]:checked")?.value`);
    scenario("Flèches dans un groupe de boutons radio (mode d'accès)", moved !== radios.find((r) => r.c)?.v && backTo === radios.find((r) => r.c)?.v, { note: `${radios.find((r) => r.c)?.v} → ${moved} → ${backTo}` });
  }
  await axeState("nouveau-etape2", "Nouvelle migration (étape 2, 1440)");
  await typeInto("[name=legacy_username]", "migration");
  await typeInto("[name=legacy_password]", relPassword);
  await focusText("Continuer", "button");
  await press("Enter", { wait: 600 });
  check("Assistant : étape 3 « Confidentialité et autorisation »", await waitFor("!!document.querySelector('[name=authorization]')", 8000));
  await focusText("Analyser mon logiciel", "button");
  await press("Enter", { wait: 600 });
  const e3 = await inPage("formErrors", "main");
  scenario("Assistant, étape 3 sans autorisation : erreur reliée à la case, focus dessus", e3.invalid.length >= 1 && e3.invalid.every((f) => f.linked) && e3.active?.invalid, { invalid: e3.invalid.map((f) => ({ field: f.field, linked: f.linked, message: f.text })), focus: e3.active?.sel, note: `${e3.invalid.length} invalide(s), focus ${e3.active?.sel}` });
  await axeState("nouveau-etape3", "Nouvelle migration (étape 3, erreurs affichées, 1440)");
  await focusSel("[name=authorization]");
  await press("Space", { wait: 150 });
  await focusSel("[name=credentials_notice]");
  await press("Space", { wait: 150 });
  await focusText("Analyser mon logiciel", "button");
  await press("Enter");
  check("Projet créé par l'assistant (« Analyser mon logiciel »)", await hasText("Projet créé", 20000));
  check("Message exact sans agent : « Agent d'analyse non disponible pour le moment. »", await hasText("Agent d'analyse non disponible pour le moment.", 10000));
  pid = await evaluate(`(() => { const a = [...document.querySelectorAll("a")].find((x) => /\\/projets\\/MIG_[a-f0-9]+\\//.test(x.getAttribute("href") || "")); return a ? a.getAttribute("href").split("/")[2] : null; })()`);
  check("Identifiant du projet lu dans les liens du résultat", /^MIG_[a-f0-9]{8}$/.test(pid ?? ""), pid ?? "");
  await axeState("nouveau-resultat", "Nouvelle migration (résultat, 1440)");
  check("Le mot de passe de l'ancien logiciel n'apparaît pas dans la page", !(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(relPassword)})`)));

  /* ---------------- 5. Étapes 1 à 8 dans l'interface ---------------- */
  const P = (s) => `/projets/${pid}/${s}`;
  // A11Y_PARCOURS=0 (mise au point du script uniquement) : ni parcours, ni étapes, ni logiciel livré.
  const FULL = process.env.A11Y_PARCOURS !== "0";
  if (FULL) {
  log("\n— Parcours du projet —");
  await goto(P("connexion"), "document.querySelector('main h1')");
  await axeState("etape-connexion-initial", "Étape Connexion (identifiants déposés)");
  await dialogScenario("Dialogue « Supprimer mes identifiants maintenant » : focus, piège, Échap, retour (annulé)", { focus: () => focusText("Supprimer mes identifiants maintenant", "button"), expectFocus: "Annuler" });
  check("Identifiants toujours déposés après Échap (rien supprimé)", await hasText("Supprimer mes identifiants maintenant", 5000));
  await clickWhen("Logiciel de test Relatio 2004", 8000);
  check("Test réel du connecteur sur le logiciel de test → « Connecté »", (await clickWhen("Tester la connexion", 10000, "button")) && (await hasText("Connecté — jeu de test Relatio 2004", 30000)));
  await goto(P("extraction"), "document.querySelector('main h1')");
  await axeState("etape-donnees-initial", "Étape Données (avant extraction)");
  check("Extraction avec le plan de test (étiquetée)", (await clickWhen("Extraire avec le plan de test", 10000, "button")) && (await hasText("Extraction terminée", 90000)));
  await waitFor(`!!document.querySelector("table caption")`, 20000);
  await dialogScenario("Tiroir « Inspecter la ligne » : focus, piège, Échap, retour", { focus: () => focusText("Inspecter", "button") });
  await goto(P("decouverte"), "document.querySelector('main h1')");
  check("Découverte : « Exploration indisponible — agent non connecté. »", await hasText("Exploration indisponible — agent non connecté.", 15000));
  await goto(P("correspondances"), "document.querySelector('main h1')");
  await axeState("etape-correspondances-initial", "Étape Correspondances (avant réception)");
  check("Correspondances : jeu de test de l'Analyste reçu", (await clickWhen("Jeu de test au format de l'Analyste — Relatio", 15000, "button")) && (await hasText("T_CLIENT", 30000)));
  await settle();
  await evaluate(`document.querySelector("#entite-clients > button")?.click()`);
  await sleep(400);
  await dialogScenario("Fenêtre « Corriger » un champ : focus, piège, Échap, retour", {
    focus: () => evaluate(`(() => { const b = [...document.querySelectorAll("main button")].find((x) => x.textContent.trim().startsWith("Corriger") && x.getClientRects().length); if (!b) return false; b.scrollIntoView({ block: "center" }); b.focus(); return document.activeElement === b; })()`),
  });
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    // Boutons de chaque point de la liste « À vérifier » (jamais « Accepter toutes les propositions restantes », en tête de section)
    const ok = (await click("Garder la protection", "#a-verifier li button")) || (await click("Accepter", "#a-verifier li button"));
    if (!ok) break;
    accepted++;
    await sleep(450);
  }
  check("Propositions incertaines acceptées une par une", accepted > 0 && (await hasText("Passer à la migration", 15000)), `${accepted} décision(s)`);
  await goto(P("migration"), "document.querySelector('main h1')");
  await axeState("etape-migration-initial", "Étape Migration (avant exécution)");
  check("Migration lancée depuis l'interface", (await clickWhen("Lancer la migration", 15000, "button")) && (await hasText("RUN_001", 120000)));
  await goto(P("validation"), "document.querySelector('main h1')");
  check("Rapport de vérification indépendante", await hasText("Vérification", 20000));
  if (await waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("Accepter les écarts documentés"))`, 10000)) {
    await axeState("etape-validation-initial", "Étape Validation (décision à prendre)");
    await typeInto("textarea[name=comment]", "Écarts examinés (audit d'accessibilité, jeu de test)");
    check("Écarts documentés acceptés avec un commentaire", (await clickWhen("Accepter les écarts documentés", 5000, "button")) && (await hasText("Écarts acceptés", 20000)));
  }
  await goto(P("reconstruction"), "document.querySelector('main h1')");
  await axeState("etape-reconstruction-initial", "Étape Reconstruction (avant modèle métier)");
  check("Modèle métier reçu (jeu de test étiqueté)", (await clickWhen("Recevoir le jeu de test Relatio", 15000, "button")) && (await hasText("v1", 20000)));
  check("Modèle rejoué sur l'historique", (await clickWhen("Rejouer sur l'historique", 15000, "button")) && (await hasText("identique", 90000)));
  await evaluate(`(() => { const t = [...document.querySelectorAll("textarea")].at(-1); if (t) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Rejoué sur l'historique (audit d'accessibilité)"); t.dispatchEvent(new Event("input", { bubbles: true })); } return true; })()`);
  check("Version du modèle validée", (await clickWhen("Valider cette version", 10000, "button")) && (await hasText("validée", 20000)));
  check("Génération et mise en service du logiciel livré", (await clickWhen("Générer et mettre en service", 15000, "button")) && (await waitFor(`fetch("/api/migration/app?project=${pid}").then((r) => r.json()).then((a) => a.running)`, 120000)));
  // Identifiant du logiciel livré propre au projet (jeu de test compris) : relu dans le dossier des logiciels livrés
  crmPid = deliveredPids(tmp)[0] ?? null;
  await goto(P("livraison"), "document.querySelector('main h1')");
  check("Livraison : logiciel en service", await hasText("En service", 20000));
  await axeState("etape-livraison-initial", "Étape Livraison (avant création de l'accès)");
  await focusText("Créer mon accès au logiciel", "button");
  await press("Enter", { wait: 300 });
  const shown = await waitFor(`[...document.querySelectorAll("code")].some((c) => c.textContent.includes("#/activation/"))`, 20000);
  activationLink = secret(await evaluate(`[...document.querySelectorAll("code")].map((c) => c.textContent).find((t) => t.includes("#/activation/")) ?? null`));
  if (activationLink) secret(activationLink.split("/").at(-1));
  check("Lien d'activation obtenu au clavier (Entrée sur « Créer mon accès au logiciel »)", shown && /#\/activation\/[A-Za-z0-9_-]{20,}$/.test(activationLink ?? ""));
  }

  /* ---------------- 6. Pages de la plateforme (avec données) et 8 étapes ---------------- */
  log("\n— Plateforme (compte client, projet livré) —");
  const mask = async () => evaluate(`[...document.querySelectorAll("code")].forEach((c) => { if (c.textContent.includes("#/activation/")) c.textContent = c.textContent.replace(/(#\\/activation\\/).+$/, "$1•••"); }); true`);
  await auditPage({ key: "espace", label: "Vue d'ensemble", group: "plateforme", url: "/espace", ready: "document.querySelector('main h1')" });
  await auditPage({ key: "projets", label: "Mes projets", group: "plateforme", url: "/projets", ready: "document.querySelector('main h2')" });
  await auditPage({ key: "activite", label: "Activité", group: "plateforme", url: "/activite", ready: "document.querySelector('main h1')" });
  await auditPage({ key: "parametres", label: "Paramètres", group: "plateforme", url: "/parametres", ready: "document.body.innerText.includes('Cette session')" });
  for (const [s, label] of [
    ["connexion", "Étape 1 · Connexion"],
    ["decouverte", "Étape 2 · Découverte"],
    ["extraction", "Étape 3 · Données"],
    ["correspondances", "Étape 4 · Correspondances"],
    ["migration", "Étape 5 · Migration"],
    ["validation", "Étape 6 · Validation"],
    ["reconstruction", "Étape 7 · Reconstruction"],
    ["livraison", "Étape 8 · Livraison"],
  ])
    if (FULL) await auditPage({ key: `etape-${s}`, label, group: "projet", url: () => P(s), ready: "document.querySelector('main h1')", before: s === "livraison" ? mask : undefined });

  // Dialogues de la plateforme
  await setView(VIEW.desktop);
  await goto("/parametres", "document.body.innerText.includes('Cette session')");
  await dialogScenario("Confirmation « Se déconnecter de tous les appareils » : focus sur Annuler, piège, Échap, retour", { focus: () => focusText("Se déconnecter de tous les appareils", "button"), expectFocus: "Annuler" });
  check("Session toujours ouverte après Échap (rien confirmé)", (await api("GET", "/api/me")).status === 200);
  where = "Paramètres : erreurs";
  const pwForm = await evaluate(`(() => { const f = [...document.querySelectorAll("form")].find((x) => x.querySelectorAll("input[type=password]").length >= 2); if (!f) return false; f.setAttribute("data-a11y-form", "1"); return true; })()`);
  if (pwForm) {
    await formErrorScenario("Paramètres, changement de mot de passe vide : erreurs reliées, focus utile", {
      submit: async () => {
        await evaluate(`(() => { const b = document.querySelector("[data-a11y-form] button[type=submit]"); b?.focus(); return !!b; })()`);
        await press("Enter");
      },
      scope: "[data-a11y-form]",
    });
  }
  await setView(VIEW.mobile);
  await goto("/espace", "document.querySelector('main h1')");
  await dialogScenario("Tiroir de navigation mobile (390 px) : ouvert par Espace sur « Menu », piège, Échap, retour", { focus: () => focusText("Menu", "header button"), openKey: "Space" });
  await reducedMotion(true);
  await goto("/espace", "document.querySelector('main h1')");
  await clickWhen("Menu", 5000, "header button");
  await sleep(300);
  const drawerMotion = await inPage("motion");
  scenario("Mouvement réduit : ouverture du tiroir sans animation (> 10 ms)", drawerMotion.running.length === 0, { running: drawerMotion.running, note: `${drawerMotion.running.length} animation(s) en cours` });
  await press("Escape");
  await ensureFrames("fermeture du tiroir (mouvement réduit)");
  await reducedMotion(false);
  await goto(P("correspondances"), "document.querySelector('main h1')");
  if (await focusText("Parcours", "button")) {
    await dialogScenario("Tiroir « Parcours » du projet (390 px) : piège, Échap, retour", { focus: () => focusText("Parcours", "button") });
  }
  await setView(VIEW.desktop);

  /* ---------------- 7. Réinitialisation avec un lien (pile isolée) ---------------- */
  log("\n— Réinitialisation avec lien —");
  const cli = spawnSync(process.execPath, ["--no-warnings", path.join(ROOT, "scripts/account.mjs"), "reset-link", account.email], { env: { PATH: env.PATH, HOME: env.HOME, REBORN_DATA_DIR: DATA, REBORN_URL: BASE }, encoding: "utf8" });
  const resetLink = (cli.stdout ?? "").split("\n").find((l) => l.includes("/reinitialisation#"))?.trim() ?? null;
  if (resetLink) {
    secret(resetLink);
    secret(resetLink.split("token=")[1]);
  }
  check("Lien de réinitialisation obtenu par la ligne de commande (pile isolée, jamais affiché)", cli.status === 0 && !!resetLink, `code ${cli.status}`);
  if (resetLink) {
    await send("Network.clearBrowserCookies"); // la page est publique : session du Studio fermée (audits du Studio terminés)
    await setView(VIEW.desktop);
    await goto(`${BASE}/reinitialisation#${resetLink.split("#")[1]}`, "document.querySelector('input[name=password]')");
    await auditPage({ key: "reinitialisation-lien", label: "Réinitialisation (lien valable)", group: "auth", url: "(lien à usage unique)", noReload: true });
    where = "Réinitialisation : erreurs";
    await typeInto("input[name=password]", "court");
    await typeInto("input[name=confirm]", "different");
    await formErrorScenario("Réinitialisation : mot de passe trop court et confirmation différente, erreurs reliées", {
      submit: async () => {
        await focusText("mot de passe", "button[type=submit]");
        await press("Enter");
      },
      scope: "main",
    });
  }

  /* ---------------- 8. Logiciel livré ---------------- */
  log("\n— Logiciel livré —");
  if (activationLink) {
    await setView(VIEW.desktop);
    await goto(activationLink, "document.querySelector('#activate')");
    check("Écran d'activation du logiciel livré", await hasText("Activer votre accès", 15000));
    await auditPage({ key: "crm-activation", label: "Logiciel livré · Activation", group: "crm", url: "(lien d'activation)", noReload: true });
    where = "Logiciel livré : erreurs d'activation";
    await typeInto("#ac-pw", "court");
    await formErrorScenario("Activation : mot de passe trop court et confirmation vide, erreurs reliées (récapitulatif)", {
      submit: async () => {
        await focusSel("#activate button[type=submit]");
        await press("Enter");
      },
      scope: "#activate",
      expectFields: 2,
    });
    const chosen = secret(`ma phrase de passe choisie ${randomBytes(4).toString("hex")}`);
    await typeInto("#ac-pw", chosen);
    await typeInto("#ac-pw2", chosen);
    await focusSel("#activate button[type=submit]");
    await press("Enter");
    check("Accès activé avec un mot de passe choisi : tableau de bord du logiciel livré", await hasText("Tableau de bord", 20000));
    const firstClient = await evaluate(`fetch("/api/e/clients?per=1").then((r) => r.json()).then((d) => d.rows?.[0]?.id ?? null)`);
    const C = (h) => `${CRM}/${h}`;
    await auditPage({ key: "crm-tableau", label: "Logiciel livré · Tableau de bord", group: "crm", url: C("#/"), ready: "document.querySelector('#page-title')" });
    await auditPage({ key: "crm-liste", label: "Logiciel livré · Liste (clients)", group: "crm", url: C("#/e/clients"), ready: "document.querySelector('table')" });
    if (firstClient) await auditPage({ key: "crm-fiche", label: "Logiciel livré · Fiche client", group: "crm", url: C(`#/e/clients/${firstClient}`), ready: "document.querySelector('#page-title')" });
    await auditPage({ key: "crm-formulaire", label: "Logiciel livré · Formulaire (nouveau devis)", group: "crm", url: C("#/e/devis/new"), ready: "document.querySelector('form [name=numero]')" });
    // Erreurs du formulaire, puis devis réel avec lignes (éditeur de lignes)
    await setView(VIEW.desktop);
    await goto(C("#/e/devis/new"), "document.querySelector('form [name=numero]')");
    where = "Logiciel livré : erreurs du formulaire";
    await formErrorScenario("Formulaire du logiciel livré vide : erreurs reliées (récapitulatif, focus)", {
      submit: async () => {
        await evaluate(`(() => { const b = document.querySelector("form [type=submit]"); b?.focus(); return !!b; })()`);
        await press("Enter");
      },
      scope: "form",
    });
    await goto(C("#/e/devis/new"), "document.querySelector('form [name=numero]')");
    const fillCrm = (sel, v) =>
      evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await fillCrm("form [name=numero]", `D2026-A11Y-${tag}`);
    await fillCrm("form [name=client]", String(firstClient));
    await fillCrm("form [name=date]", "2026-11-08");
    await evaluate(`document.querySelector("form").requestSubmit()`);
    check("Devis créé dans le logiciel livré (jeu de test)", await waitFor("/#\\/e\\/devis\\/\\d+/.test(location.hash)", 20000));
    const devisId = await evaluate("location.hash.match(/devis\\/(\\d+)/)?.[1] ?? null");
    const articles = await evaluate(`fetch("/api/e/articles?per=2").then((r) => r.json()).then((d) => (d.rows ?? []).map((x) => x.id))`);
    for (const [i, art] of (articles ?? []).entries()) {
      await waitFor("document.querySelector('#line-form')", 10000);
      await fillCrm("#line-form [name=article]", String(art));
      await fillCrm("#line-form [name=quantite]", String(i + 2));
      await sleep(500);
      await evaluate(`document.querySelector("#line-form").requestSubmit()`);
      await sleep(1200);
    }
    if (devisId) {
      await auditPage({ key: "crm-lignes", label: "Logiciel livré · Devis et éditeur de lignes", group: "crm", url: C(`#/e/devis/${devisId}`), ready: "document.querySelector('#line-form')" });
      await setView(VIEW.desktop);
      await goto(C(`#/e/devis/${devisId}`), "document.querySelector('#line-form')");
      if (await evaluate("!!document.querySelector('#del')"))
        await dialogScenario("Logiciel livré : confirmation « Supprimer » (focus sur Annuler, piège, Échap, retour ; annulé)", { focus: () => focusSel("#del"), expectFocus: "Annuler" });
      check("Devis toujours présent après Échap", (await evaluate(`fetch("/api/e/devis/${devisId}").then((r) => r.status)`)) === 200);
      await goto(C("#/e/clients"), "document.querySelector('table')");
      const rowLink = await focusSel("table a.row-link");
      await press("Enter", { wait: 600 });
      scenario("Entrée sur un lien de ligne du tableau ouvre la fiche (logiciel livré)", rowLink && (await waitFor("/#\\/e\\/clients\\/\\d+/.test(location.hash)", 8000)), { note: await evaluate("location.hash") });
    }
    await setView(VIEW.mobile);
    await goto(C("#/"), "document.querySelector('#page-title')");
    await dialogScenario("Logiciel livré : tiroir de navigation mobile (390 px), Échap, retour", { focus: () => focusSel("#menu") });
    await setView(VIEW.desktop);
    await goto(C("#/"), "document.querySelector('#page-title')");
    await clickSel("#logout");
    check("Déconnexion du logiciel livré : écran de connexion", await waitFor("!!document.querySelector('#login')", 10000));
    await auditPage({ key: "crm-connexion", label: "Logiciel livré · Connexion", group: "crm", url: C("#/"), ready: "document.querySelector('#login')" });
    await setView(VIEW.desktop);
    await goto(C("#/"), "document.querySelector('#login')");
    where = "Logiciel livré : erreurs de connexion";
    await formErrorScenario("Connexion au logiciel livré vide : erreurs reliées, focus sur le premier champ", {
      submit: async () => {
        await focusSel("#login button[type=submit]");
        await press("Enter");
      },
      scope: "#login",
    });
  }
  check("Aucune exception JavaScript dans les pages", exceptions.length === 0, exceptions.slice(0, 3).map((e) => `${e.page} : ${e.text}`).join(" | "));
} catch (e) {
  check("Exécution de l'audit", false, e.stack ?? e.message);
} finally {
  /* ---------------- Bilan ---------------- */
  const pages = report.pages.filter((p) => p.group !== "état");
  const states = report.pages.filter((p) => p.group === "état");
  const allAxe = report.pages.flatMap((p) => Object.values(p.widths ?? {}).flatMap((w) => [w.axe, w.axeExpanded]).filter(Boolean));
  const blocking = allAxe.flatMap((a) => a.violations.filter((v) => v.impact === "serious" || v.impact === "critical"));
  const kbFails = pages.flatMap((p) =>
    Object.entries(p.widths ?? {}).flatMap(([w, x]) => {
      const k = x.keyboard;
      if (!k) return [];
      const f = [];
      if (k.trap || k.loop) f.push(`${p.label} ${w} : ${k.ended}`);
      if (k.noFocusVisible.length) f.push(`${p.label} ${w} : ${k.noFocusVisible.length} élément(s) sans focus visible`);
      if (k.obscured.length) f.push(`${p.label} ${w} : ${k.obscured.length} élément(s) masqué(s) au focus`);
      if (k.positiveTabindex.length) f.push(`${p.label} ${w} : tabindex positif`);
      if (!k.reverseOk) f.push(`${p.label} ${w} : Maj+Tab ne refait pas le trajet`);
      if (k.skip.first && !k.skip.works) f.push(`${p.label} ${w} : lien d'évitement inopérant`);
      if (k.reached && !k.skip.first && !k.skip.notNeeded) f.push(`${p.label} ${w} : pas de lien d'évitement au premier arrêt (${k.skip.name ?? "?"})`);
      return f;
    }),
  );
  // Reflow : défilement horizontal de page, ou débordement masqué par html/body (contenu inaccessible).
  const layoutFails = pages.flatMap((p) => [
    ...(p.reflow320 && (p.reflow320.overflow.scroll > 0 || (p.reflow320.overflow.hiddenX && p.reflow320.overflow.offenders.length)) ? [`${p.label} : 320 px, défilement ${p.reflow320.overflow.scroll} px, ${p.reflow320.overflow.offenders.length} élément(s) hors cadre`] : []),
    ...(p.zoom200 && (p.zoom200.overflow.scroll > 0 || p.zoom200.clipped.some((c) => !c.ellipsis)) ? [`${p.label} : 200 %, défilement ${p.zoom200.overflow.scroll} px, ${p.zoom200.clipped.filter((c) => !c.ellipsis).length} contenu(s) coupé(s)`] : []),
    ...(p.reducedMotion && (p.reducedMotion.running.length || p.reducedMotion.long || p.reducedMotion.smooth) ? [`${p.label} : mouvement réduit non respecté (${p.reducedMotion.running.length} animation(s), ${p.reducedMotion.long} transition(s))`] : []),
    ...(p.widths?.["390"]?.overflow?.scroll > 0 ? [`${p.label} : 390 px, défilement ${p.widths["390"].overflow.scroll} px`] : []),
    ...Object.entries(p.widths ?? {}).flatMap(([w, x]) => (x.icons ?? []).filter((i) => !i.ok).map((i) => `${p.label} ${w} : ${i.kind} sans nom correct (${i.sel})`)),
  ]);
  // À examiner (non bloquant) : anneau de focus partiellement coupé, éléments tabulables jamais atteints,
  // éléments qui dépassent à 320 px sans provoquer de défilement.
  const toReview = pages.flatMap((p) => [
    ...Object.entries(p.widths ?? {}).flatMap(([w, x]) => [
      ...(x.keyboard?.ringClipped ?? []).map((r) => `${p.label} ${w} : anneau de focus partiellement coupé (${r.el}, ${r.ratio} × périmètre)`),
      ...((x.keyboard?.unreached ?? []).length ? [`${p.label} ${w} : tabulable(s) jamais atteint(s) — ${x.keyboard.unreached.join(" ; ")}`] : []),
    ]),
    ...(p.reflow320 && p.reflow320.overflow.scroll <= 0 && p.reflow320.overflow.offenders.length ? [`${p.label} : 320 px, élément(s) au-delà du bord sans défilement — ${p.reflow320.overflow.offenders.map((o) => `${o.name || o.sel} (bord droit ${o.right} px${o.clipChain?.length ? `, ${o.clipChain.join(" ")}` : ""})`).join(" ; ")}`] : []),
  ]);
  const scenarioFails = report.scenarios.filter((s) => !s.ok).map((s) => s.name);
  const journeyFails = results.filter((r) => !r.ok).map((r) => r.name);
  const targets24 = pages.flatMap((p) => (p.widths?.["390"]?.targets?.small ?? []).filter((t) => t.below24 && !t.inline).map((t) => `${p.label} : ${t.name || t.sel} (${t.w}×${t.h})`));
  report.summary = {
    pages_audited: pages.length,
    intermediate_states: states.length,
    axe_runs: allAxe.length,
    axe_serious_critical: blocking.length,
    axe_moderate_minor: allAxe.reduce((n, a) => n + a.violations.filter((v) => v.impact === "moderate" || v.impact === "minor").length, 0),
    axe_incomplete_rules: [...new Set(allAxe.flatMap((a) => a.incomplete.map((i) => i.id)))],
    keyboard_failures: kbFails,
    layout_failures: layoutFails,
    to_review: toReview,
    axe_transient: allAxe.flatMap((a) => (a.transient ?? []).map((v) => `${v.id} : ${v.targets.map((t) => t.target).join(" | ")}`)),
    scenarios: `${report.scenarios.length - scenarioFails.length}/${report.scenarios.length}`,
    scenario_failures: scenarioFails,
    journey: `${results.length - journeyFails.length}/${results.length}`,
    journey_failures: journeyFails,
    targets_below_24: targets24,
    targets_below_44: pages.reduce((n, p) => n + (p.widths?.["390"]?.targets?.small?.length ?? 0), 0),
    exceptions: exceptions.length,
    console_errors: consoleErrors.length,
    frame_recoveries: (report.frame_recoveries ?? []).length,
  };
  saveReport();
  // Tableau par page (Markdown)
  const cell = (a) => {
    if (!a) return "—";
    const c = countImpacts(a.violations);
    return `${c.critical}/${c.serious}/${c.moderate}/${c.minor}`;
  };
  const kb = (k) => (k ? `${k.reached}/${k.tabbable} · ${k.focusVisible}/${k.reached} vis.${k.obscured.length ? ` · ${k.obscured.length} masqué` : ""}${k.trap || k.loop ? " · PIÈGE" : ""}${k.reverseOk ? "" : " · Maj+Tab ✗"}` : "—");
  const rows = pages.map((p) => {
    const d = p.widths?.["1440"];
    const m = p.widths?.["390"];
    const inc = [...new Set([...(d?.axe?.incomplete ?? []), ...(m?.axe?.incomplete ?? [])].map((i) => i.id))].join(", ") || "—";
    const sk = d?.keyboard?.skip;
    const t = m?.targets;
    return `| ${p.label} | ${cell(d?.axe)}${d?.axeExpanded ? ` (déplié ×${d.axeExpanded.opened} : ${cell(d.axeExpanded)})` : ""} | ${cell(m?.axe)} | ${inc} | ${kb(d?.keyboard)} | ${kb(m?.keyboard)} | ${sk ? (sk.first ? (sk.works ? "oui" : "inopérant") : sk.notNeeded ? "sans objet (contenu en premier)" : "non (1er arrêt : " + (sk.name || "?").slice(0, 25) + ")") : "—"} | ${t ? `${t.small.length} (< 24 : ${t.small.filter((x) => x.below24 && !x.inline).length}, en ligne : ${t.small.filter((x) => x.inline).length})` : "—"} | ${p.reflow320 ? `${p.reflow320.overflow.scroll} px${p.reflow320.overflow.offenders.length ? ` · ${p.reflow320.overflow.offenders.length} hors cadre` : ""}` : "—"} | ${p.zoom200 ? `${p.zoom200.overflow.scroll} px · ${p.zoom200.clipped.filter((c) => !c.ellipsis).length} coupé(s)${p.zoom200.clipped.some((c) => c.ellipsis) ? ` · ${p.zoom200.clipped.filter((c) => c.ellipsis).length} tronqué(s) « … »` : ""}` : "—"} | ${p.reducedMotion ? `${p.reducedMotion.running.length} anim. · ${p.reducedMotion.long} trans.` : "—"} | ${p.error ? "ERREUR" : ""} |`;
  });
  const md = [
    `# Audit d'accessibilité mesuré — REBORN (pile isolée)`,
    ``,
    `Généré le ${report.generated_at} · axe-core ${AXE_VERSION} · ${report.tool.chrome ?? "Chrome"} · build ${DIST}. WCAG 2.2 AA **visée** : ce tableau décrit ce qui a été mesuré, ce n'est pas une déclaration de conformité.`,
    ``,
    `axe : critique/sérieux/modéré/mineur. Tab : éléments atteints / tabulables · focus visible mesuré (style calculé + pixels). Cibles : éléments < 44 px à 390 px.`,
    ``,
    `| Page | axe 1440 | axe 390 | axe « incomplete » | Tab 1440 | Tab 390 | Lien d'évitement | Cibles < 44 px (390) | 320 px | Zoom 200 % | Mouvement réduit | |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `## États intermédiaires (axe seul)`,
    ...states.map((s) => `- ${s.label} : ${Object.entries(s.widths).map(([w, x]) => `${w} px ${cell(x.axe)}`).join(", ")}`),
    ``,
    `## Scénarios (${report.summary.scenarios})`,
    ...report.scenarios.map((s) => `- ${s.ok ? "✓" : "✗"} ${s.name}${s.note ? ` — ${s.note}` : ""}`),
    ``,
    `## Parcours (${report.summary.journey})`,
    ...results.map((r) => `- ${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
    ``,
    `## Bilan`,
    `- Violations axe sérieuses ou critiques : ${blocking.length}`,
    `- Clavier : ${kbFails.length ? kbFails.join(" ; ") : "aucun défaut mesuré"}`,
    `- Mise en page, mouvement, boutons-icônes : ${layoutFails.length ? layoutFails.join(" ; ") : "aucun défaut mesuré"}`,
    `- Cibles < 24 px hors liens dans le texte (390 px) : ${targets24.length ? targets24.join(" ; ") : "aucune"}`,
    `- À examiner (non bloquant) : ${toReview.length ? toReview.join(" ; ") : "rien"}`,
    `- Exceptions JavaScript : ${exceptions.length} · erreurs de console : ${consoleErrors.length}`,
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "a11y-report.md"), redact(md));
  log(`\n${redact(rows.length ? ["| Page | axe 1440 | axe 390 | incomplete | Tab 1440 | Tab 390 | évitement | cibles < 44 | 320 | 200 % | mouvement | |", ...rows].join("\n") : "")}`);
  log(`\nBilan : ${pages.length} pages auditées (+ ${states.length} états), ${allAxe.length} analyses axe, ${blocking.length} violation(s) sérieuse(s)/critique(s) ; clavier ${kbFails.length} défaut(s) ; mise en page ${layoutFails.length} ; scénarios ${report.summary.scenarios} ; parcours ${report.summary.journey}.`);
  log(`Rapport : ${path.join(OUT, "a11y-report.json")} · ${path.join(OUT, "a11y-report.md")}`);
  // Arrêt et nettoyage : tout ce qui a été lancé ici, dossiers temporaires et build créé ici
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  for (const p of [studio, relatio]) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  for (const p of new Set([crmPid, ...deliveredPids(tmp)].filter(Boolean))) {
    try {
      process.kill(p, "SIGTERM");
    } catch {}
  }
  await new Promise((r) => {
    chrome.once("exit", r);
    setTimeout(r, 3000);
  });
  await sleep(500);
  try {
    if (process.env.A11Y_GARDER_LOG) fs.copyFileSync(path.join(tmp, "serveurs.log"), path.join(OUT, "serveurs.log"));
  } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
  if (builtHere && !ARGS.has("--garder-build")) fs.rmSync(distPath, { recursive: true, force: true });
  const failed = blocking.length + kbFails.length + layoutFails.length + scenarioFails.length + journeyFails.length;
  process.exit(failed ? 1 : 0);
}
