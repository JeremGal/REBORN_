// Ouvre les accès protégés sans jamais afficher les jetons.
//
//   npm run maintenance                → console de maintenance de Quotix 98 (Blind Challenge) dans le navigateur
//   npm run connect                    → page de connexion des comptes REBORN (/connexion)
//   npm run token -- explorer|analyst  → copie le jeton de l'agent demandé dans le presse-papiers
//   npm run token -- api               → ancien jeton unique (s'il existe encore)
//
// Ne pas ouvrir la console de maintenance dans le navigateur piloté par l'agent explorateur.
import { spawnSync } from "node:child_process";
import { ensureSecret, readSecret, TOKENS } from "./secrets.mjs";

const cmd = process.argv[2];
const base = (process.env.REBORN_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const adminPort = process.env.LEGACY_ADMIN_PORT ?? "4001";

function openUrl(url) {
  const [bin, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const r = spawnSync(bin, args, { stdio: "ignore" });
  if (r.status !== 0) {
    console.error("[reborn] impossible d'ouvrir le navigateur automatiquement.");
    process.exit(1);
  }
}

function copy(text) {
  const tools = process.platform === "darwin" ? [["pbcopy", []]] : process.platform === "win32" ? [["clip", []]] : [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]];
  for (const [bin, args] of tools) {
    const r = spawnSync(bin, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
    if (r.status === 0) return true;
  }
  return false;
}

if (cmd === "maintenance") {
  const token = process.env.LEGACY_ADMIN_TOKEN || ensureSecret(TOKENS.admin);
  openUrl(`http://127.0.0.1:${adminPort}/?token=${encodeURIComponent(token)}`);
  console.log(`[reborn] Console de maintenance ouverte (http://127.0.0.1:${adminPort}, session par cookie).`);
} else if (cmd === "connect") {
  openUrl(`${base}/connexion`);
  console.log("[reborn] Page de connexion ouverte : connectez-vous avec votre compte REBORN (aucun jeton dans le navigateur).");
} else if (cmd === "crm-password" || cmd === "crm-source-password") {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { ROOT } = await import("./secrets.mjs");
  let file;
  let pick;
  if (cmd === "crm-password") {
    const dir = path.join(ROOT, "generated");
    const apps = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, ".secrets", "admin.json"))) : [];
    if (!apps.length) {
      console.log("[reborn] Aucun logiciel généré : mettez d'abord une migration en service (REBORN Studio → Migrer).");
      process.exit(1);
    }
    file = path.join(dir, apps[0], ".secrets", "admin.json");
    pick = (j) => j.password;
  } else {
    file = path.join(ROOT, "legacy-crm", "data", ".credentials.json");
    pick = (j) => j.migration.password;
  }
  if (!fs.existsSync(file)) {
    console.log(`[reborn] Fichier absent : ${path.relative(ROOT, file)} (lancez npm run dev une première fois)`);
    process.exit(1);
  }
  const secret = pick(JSON.parse(fs.readFileSync(file, "utf8")));
  if (copy(secret)) console.log(`[reborn] Mot de passe ${cmd === "crm-password" ? "du compte « admin » du nouveau CRM" : "du compte « migration » de Relatio 2004"} copié dans le presse-papiers (non affiché).`);
  else console.log(`[reborn] Presse-papiers indisponible : voir ${path.relative(ROOT, file)}`);
} else if (cmd === "token") {
  const kinds = {
    explorer: { key: TOKENS.explorer, env: "REBORN_EXPLORER_TOKEN", who: "de l'exécuteur de l'agent (Mouss)" },
    analyst: { key: TOKENS.analyst, env: "REBORN_ANALYST_TOKEN", who: "de l'Analyste (Alan)" },
    api: { key: TOKENS.api, env: "REBORN_API_TOKEN", who: "unique (ancien, explorer + analyst)" },
  };
  const kind = kinds[process.argv[3] ?? ""];
  if (!kind) {
    console.log("Usage : npm run token -- explorer | analyst   (ou api pour l'ancien jeton unique, s'il existe)");
    process.exit(1);
  }
  // Jetons des agents : créés s'ils manquent (jamais régénérés). L'ancien jeton unique n'est jamais créé.
  const token = process.env[kind.env] || (kind.key === TOKENS.api ? readSecret(kind.key) : ensureSecret(kind.key));
  if (!token) {
    console.log("[reborn] Aucun ancien jeton unique : utilisez npm run token -- explorer ou npm run token -- analyst.");
    process.exit(1);
  }
  if (copy(token)) console.log(`[reborn] Jeton ${kind.who} copié dans le presse-papiers (non affiché). Transmettez-le en message privé : export REBORN_TOKEN=…`);
  else console.log(`[reborn] Presse-papiers indisponible : le jeton se trouve dans .secrets/tokens.json (clé ${kind.key}).`);
} else {
  console.log("Usage : node scripts/open.mjs maintenance | connect | token <explorer|analyst|api>");
  process.exit(1);
}
