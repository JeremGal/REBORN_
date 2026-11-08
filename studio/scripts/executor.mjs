// Lance l'exécuteur de l'agent H (Mouss) en MODE PERMANENT : il prend chaque mission « Analyser mon
// logiciel » dès qu'elle arrive dans la file du Studio, lance le véritable agent H, récupère les données
// par le mécanisme d'export officiel du logiciel et dépose au projet. Ctrl+C l'arrête proprement.
//
//   npm run executor                     → exécuteur permanent (REBORN_URL, jeton explorer, clé H depuis l'environnement)
//   npm run executor -- --max-missions 3 → borne le nombre de missions (démos) ; tout argument est transmis
//
// Environnement :
//   REBORN_URL     adresse du Studio (défaut http://127.0.0.1:3000)
//   REBORN_TOKEN   jeton EXPLORER du Studio ; à défaut REBORN_EXPLORER_TOKEN, sinon lu dans .secrets (jamais affiché)
//   HAI_API_KEY    clé H Company, lue par l'explorateur (ou h-explorer_v2/.env) ; jamais affichée
// Aucun secret n'est écrit dans le terminal.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ROOT, readSecret, TOKENS } from "./secrets.mjs";

const CLIENTS = path.join(ROOT, "clients");
const REPO = path.resolve(ROOT, "..");
const HEXP_REQ = path.join(REPO, "h-explorer_v2", "requirements.txt");

// 1. Interpréteur Python : .venv local de l'exécuteur s'il existe, sinon python3 du PATH.
function resolvePython() {
  const venvPosix = path.join(CLIENTS, ".venv", "bin", "python");
  const venvWin = path.join(CLIENTS, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPosix)) return venvPosix;
  if (fs.existsSync(venvWin)) return venvWin;
  return process.platform === "win32" ? "python" : "python3";
}
const python = resolvePython();

// 2. Vérifier que le SDK H (hai_agents) est importable : sinon, message clair et arrêt (l'exploration réelle en a besoin).
const check = spawnSync(python, ["-c", "import hai_agents"], { stdio: "ignore" });
if (check.status !== 0) {
  console.error(`[exécuteur] Le SDK H Company (hai_agents) n'est pas disponible pour « ${python} ».`);
  console.error(`[exécuteur] Installez-le, puis relancez :`);
  console.error(`[exécuteur]   python3 -m venv ${path.relative(process.cwd(), path.join(CLIENTS, ".venv"))}`);
  console.error(`[exécuteur]   ${path.join(path.relative(process.cwd(), path.join(CLIENTS, ".venv")), "bin", "pip")} install -r ${path.relative(process.cwd(), HEXP_REQ)}`);
  console.error(`[exécuteur] (ou, sans environnement dédié : pip install -r ${path.relative(process.cwd(), HEXP_REQ)})`);
  process.exit(1);
}

// 3. Jeton explorer : REBORN_TOKEN, sinon REBORN_EXPLORER_TOKEN, sinon le jeton explorer des secrets locaux. Jamais affiché.
const token = process.env.REBORN_TOKEN || process.env.REBORN_EXPLORER_TOKEN || readSecret(TOKENS.explorer);
if (!token) {
  console.error("[exécuteur] Jeton explorer manquant. Donnez-le par l'environnement :");
  console.error("[exécuteur]   export REBORN_TOKEN=$(… )   (le copier sans l'afficher : npm run token -- explorer)");
  process.exit(2);
}

const env = { ...process.env };
env.REBORN_URL = process.env.REBORN_URL || "http://127.0.0.1:3000";
env.REBORN_TOKEN = token; // transmis au seul processus Python, jamais journalisé
env.REBORN_EXECUTOR_ID = process.env.REBORN_EXECUTOR_ID || `poste-${process.pid}`;

const forwarded = process.argv.slice(2);
const args = ["h_executor.py", "--loop", ...forwarded];

console.log(`[exécuteur] Studio : ${env.REBORN_URL}`);
console.log(`[exécuteur] Interpréteur : ${python}`);
console.log(`[exécuteur] Clé H : ${process.env.HAI_API_KEY ? "présente dans l'environnement" : "lue par l'explorateur dans h-explorer_v2/.env"} (jamais affichée).`);
console.log("[exécuteur] Mode permanent. Ctrl+C pour arrêter.\n");

const child = spawn(python, args, { cwd: CLIENTS, stdio: "inherit", env });
const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
