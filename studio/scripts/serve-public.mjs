#!/usr/bin/env node
/**
 * REBORN en ligne depuis ce poste : Studio de production, agent H permanent et logiciels livrés, publiés
 * par des tunnels https ngrok (une adresse pour le Studio, une par logiciel livré, créée dès sa mise en service).
 *
 *   node scripts/serve-public.mjs           (Ctrl+C arrête tout ; le poste doit rester allumé)
 *
 * - Données PERSISTANTES : platform/.data (comptes, projets, sources, migrations ; logiciels livrés dans
 *   platform/.data/apps ; journaux dans platform/.data/logs), ignorées par git.
 * - Secrets lus HORS du dépôt : REBORN_ENV_FILE (par défaut ../../secrets/vercel-env.txt : clé de session,
 *   jetons des agents, comptes de départ) et ../.env (clé H Company, donnée au SEUL exécuteur). Rien n'est affiché.
 * - L'exécuteur (studio/clients/h_executor.py, mode permanent) prend chaque mission dès qu'un client clique
 *   « Analyser mon logiciel » ; il est relancé s'il s'arrête.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ROOT, PLATFORM, ensureBuild, up, sleep } from "./acceptance/stack.mjs";

const REPO = path.resolve(ROOT, "..");
const ENV_FILE = process.env.REBORN_ENV_FILE || path.resolve(REPO, "..", "secrets", "vercel-env.txt");
const H_ENV = path.join(REPO, ".env");
const PORT = Number(process.env.PORT || 3100);
// Dossier du build servi ; REBORN_PUBLIC_DIST permet de construire à côté puis de basculer sans couper le Studio en service.
const DIST = process.env.REBORN_PUBLIC_DIST || ".next-public";
const DATA = path.resolve(process.env.REBORN_DATA_DIR || path.join(PLATFORM, ".data"));
const APPS = path.join(DATA, "apps");
const LOGS = path.join(DATA, "logs");
const URLS_FILE = path.join(DATA, "public-app-urls.json");
const NEXT_BIN = path.join(PLATFORM, "node_modules/next/dist/bin/next");
const NGROK_API = "http://127.0.0.1:4040/api/tunnels";
const STUDIO_KEYS = ["REBORN_AUTH_SECRET", "REBORN_EXPLORER_TOKEN", "REBORN_ANALYST_TOKEN", "REBORN_SEED_ADMIN_EMAIL", "REBORN_SEED_ADMIN_PASSWORD", "REBORN_SEED_USER_EMAIL", "REBORN_SEED_USER_PASSWORD", "REBORN_AUTH_MIN_PASSWORD", "REBORN_TRUST_PROXY"];

const readEnvFile = (f) =>
  Object.fromEntries(
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
const secrets = readEnvFile(ENV_FILE);
for (const k of ["REBORN_AUTH_SECRET", "REBORN_EXPLORER_TOKEN"]) if (!secrets[k]) throw new Error(`${k} manquant dans ${ENV_FILE}`);
const hKey = process.env.HAI_API_KEY || (fs.existsSync(H_ENV) ? readEnvFile(H_ENV).HAI_API_KEY : "");

fs.mkdirSync(LOGS, { recursive: true, mode: 0o700 });
fs.mkdirSync(APPS, { recursive: true, mode: 0o700 });
const procs = [];
const logFd = (name) => fs.openSync(path.join(LOGS, `${name}.log`), "a", 0o600);
const start = (name, cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { detached: true, stdio: ["ignore", logFd(name), logFd(name)], ...opts });
  procs.push(p);
  return p;
};

/* 0. Port du Studio libre, sinon arrêt (jamais de tunnel vers un autre serveur déjà présent sur ce port). */
const portBusy = await new Promise((resolve) => {
  const srv = net.createServer().once("error", () => resolve(true)).once("listening", () => srv.close(() => resolve(false)));
  srv.listen(PORT, "127.0.0.1");
});
if (portBusy) {
  console.error(`Le port ${PORT} est déjà utilisé par un autre programme : choisissez-en un autre (PORT=…). Rien n'a été publié.`);
  process.exit(2);
}

/* 1. Agent ngrok (réutilisé s'il tourne déjà : mêmes adresses publiques) et tunnel du Studio, connu AVANT son démarrage. */
let reused = false;
try {
  reused = (await fetch(NGROK_API)).ok;
} catch {}
if (!reused) {
  fs.writeFileSync(URLS_FILE, "{}\n", { mode: 0o600 }); // nouvelle session ngrok : anciennes adresses caduques
  // Agent ngrok hors du groupe des processus arrêtés par Ctrl+C : il garde les adresses entre deux relances.
  spawn("ngrok", ["start", "--none", "--log=stdout", "--log-level=info"], { detached: true, stdio: ["ignore", logFd("ngrok"), logFd("ngrok")], env: process.env }).unref();
} else if (!fs.existsSync(URLS_FILE)) fs.writeFileSync(URLS_FILE, "{}\n", { mode: 0o600 });
let ready = reused;
for (let i = 0; i < 40 && !ready; i++) {
  try {
    ready = (await fetch(NGROK_API)).ok;
  } catch {}
  if (!ready) await sleep(500);
}
if (!ready) throw new Error(`agent ngrok injoignable (voir ${path.join(LOGS, "ngrok.log")})`);
// Un appel bloqué à l'agent ngrok ne fige pas la publication des autres logiciels ; la création d'un tunnel (connexion de
// l'agent à ngrok, surtout juste après son lancement) a droit à 30 s, les lectures et suppressions à 5 s.
const API_TIMEOUT = (ms = 5000) => AbortSignal.timeout(ms);
async function tunnel(name, port) {
  const list = await (await fetch(NGROK_API, { signal: API_TIMEOUT() })).json();
  const found = list.tunnels?.find((t) => t.name === name);
  // Un tunnel du même nom vers un AUTRE port est fermé : jamais d'adresse publique vers un service inattendu.
  if (found && new URL(found.config?.addr?.includes("://") ? found.config.addr : `http://${found.config?.addr}`).port === String(port)) return found.public_url;
  if (found) await fetch(`${NGROK_API}/${encodeURIComponent(name)}`, { method: "DELETE", signal: API_TIMEOUT() });
  const r = await fetch(NGROK_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, addr: String(port), proto: "http" }), signal: API_TIMEOUT(30_000) });
  const j = await r.json();
  if (!j.public_url) throw new Error(`tunnel ${name} refusé : ${JSON.stringify(j).slice(0, 200)}`);
  return j.public_url;
}
const STUDIO_URL = await tunnel("studio", PORT);

/* 2. Studio de production (build dédié), données persistantes. */
ensureBuild(DIST);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const studioEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  REBORN_DIST_DIR: DIST,
  REBORN_DATA_DIR: DATA,
  REBORN_APPS_DIR: APPS,
  REBORN_PUBLIC_URL: STUDIO_URL,
  REBORN_APP_PUBLIC_URLS_FILE: URLS_FILE,
  CRM_PORT: process.env.CRM_PORT || "4310",
  ...pick(secrets, STUDIO_KEYS),
};
const studio = start("studio", process.execPath, [NEXT_BIN, "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: PLATFORM, env: studioEnv });
let studioExited = null;
studio.on("exit", (code) => (studioExited = code));
await up(`http://127.0.0.1:${PORT}/api/health`, 90000);
if (studioExited !== null) {
  console.error(`Le Studio s'est arrêté au démarrage (code ${studioExited}) : voir ${path.join(LOGS, "studio.log")}. Tunnel fermé.`);
  await fetch(`${NGROK_API}/studio`, { method: "DELETE" }).catch(() => {});
  process.exit(1);
}

/* 3. Exécuteur H permanent (relancé s'il s'arrête). */
const venvPy = path.join(ROOT, "clients", ".venv", "bin", "python");
const py = fs.existsSync(venvPy) ? venvPy : "python3";
const executorEnv = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  REBORN_URL: `http://127.0.0.1:${PORT}`,
  REBORN_TOKEN: secrets.REBORN_EXPLORER_TOKEN,
  REBORN_EXECUTOR_ID: "executeur-h-poste",
  HAI_API_KEY: hKey ?? "",
  PYTHONUNBUFFERED: "1",
};
// Mode permanent (--loop) s'il existe ; sinon une mission par lancement, relancé aussitôt.
const help = spawnSync(py, [path.join(ROOT, "clients", "h_executor.py"), "--help"], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
const loopArgs = /--loop/.test(`${help.stdout}${help.stderr}`) ? ["--loop"] : ["--wait", "86400"];
let stopping = false;
function runExecutor() {
  if (stopping) return;
  const p = start("executeur", py, [path.join(ROOT, "clients", "h_executor.py"), ...loopArgs], { cwd: ROOT, env: executorEnv });
  p.on("exit", (code) => {
    if (stopping) return;
    console.log(`Exécuteur arrêté (code ${code}) : relance dans ${loopArgs[0] === "--loop" ? 10 : 2} s`);
    setTimeout(runExecutor, loopArgs[0] === "--loop" ? 10_000 : 2_000);
  });
}
runExecutor();

/* 4. Logiciels livrés : un tunnel https dès qu'un logiciel tourne (fichier run/server.pid). L'adresse de chaque logiciel en
   marche est revérifiée auprès de l'agent ngrok à chaque passage (une adresse d'une session ngrok précédente est remplacée),
   chaque seconde, pour que le Studio, qui attend ce tunnel avant de répondre, réponde vite. */
let watching = false;
async function watchApps() {
  if (watching) return;
  watching = true;
  try {
    let urls = {};
    try {
      urls = JSON.parse(fs.readFileSync(URLS_FILE, "utf8")) ?? {};
    } catch (e) {
      console.warn(`Fichier des adresses illisible (${e instanceof Error ? e.message : e}) : il est reconstruit.`);
    }
    let changed = false;
    for (const id of fs.readdirSync(APPS)) {
      let pid;
      try {
        pid = JSON.parse(fs.readFileSync(path.join(APPS, id, "run", "server.pid"), "utf8"));
      } catch {
        continue;
      }
      const key = String(pid?.port ?? "");
      if (!/^\d+$/.test(key)) continue;
      try {
        const url = await tunnel(`app-${key}`, key);
        if (urls[key] !== url) {
          urls[key] = url;
          changed = true;
          console.log(`Logiciel livré « ${id} » publié : ${url}`);
        }
      } catch (e) {
        console.warn(`Tunnel du logiciel livré « ${id} » impossible : ${e instanceof Error ? e.message : e}`);
      }
    }
    if (changed) {
      // Écriture atomique : le Studio, qui lit ce fichier à tout moment, ne voit jamais un fichier vide ou à moitié écrit
      fs.writeFileSync(`${URLS_FILE}.tmp`, JSON.stringify(urls, null, 1), { mode: 0o600 });
      fs.renameSync(`${URLS_FILE}.tmp`, URLS_FILE);
    }
  } finally {
    watching = false;
  }
}
watchApps().catch(() => {});
setInterval(() => watchApps().catch(() => {}), 1000);

console.log(`REBORN en ligne : ${STUDIO_URL}`);
console.log(`Agent H : ${hKey ? "clé présente (jamais affichée)" : "CLÉ H ABSENTE — les analyses échoueront proprement"} · journaux : ${LOGS}`);
console.log("Ctrl+C pour tout arrêter.");

const stop = () => {
  if (stopping) return;
  stopping = true;
  console.log("Arrêt…");
  for (const p of procs) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(0), 1500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
