// Ouvre les accès protégés sans jamais afficher les jetons.
//
//   npm run maintenance  → console de maintenance de Quotix 98 (Blind Challenge) dans le navigateur
//   npm run connect      → dashboard REBORN authentifié (mode réseau)
//   npm run token        → copie le jeton d'API dans le presse-papiers (à transmettre à Mouss et Alan)
//
// Ne pas ouvrir la console de maintenance dans le navigateur piloté par l'agent explorateur.
import { spawnSync } from "node:child_process";
import { ensureSecret, TOKENS } from "./secrets.mjs";

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
  const token = process.env.REBORN_API_TOKEN || ensureSecret(TOKENS.api);
  openUrl(`${base}/connexion#token=${encodeURIComponent(token)}`);
  console.log("[reborn] Dashboard ouvert : la page /connexion lit le jeton dans le fragment de l'URL (jamais envoyé au serveur).");
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
  const token = process.env.REBORN_API_TOKEN || ensureSecret(TOKENS.api);
  if (copy(token)) console.log("[reborn] Jeton d'API copié dans le presse-papiers (non affiché). Transmettez-le en message privé : export REBORN_TOKEN=…");
  else console.log("[reborn] Presse-papiers indisponible : le jeton se trouve dans .secrets/tokens.json (clé reborn_api_token).");
} else {
  console.log("Usage : node scripts/open.mjs maintenance | connect | token");
  process.exit(1);
}
