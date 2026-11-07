// Jetons locaux de REBORN : générés une fois, stockés dans .secrets/tokens.json (droits 600,
// ignoré par Git) et JAMAIS affichés dans le terminal ni dans les journaux.
//
//   node scripts/secrets.mjs rotate   → régénère tous les jetons (à faire si l'un d'eux a fuité)
//   node scripts/secrets.mjs status   → indique quels jetons existent (sans leur valeur)
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SECRETS_FILE = path.join(ROOT, ".secrets", "tokens.json");

/** Noms des jetons gérés. */
export const TOKENS = {
  api: "reborn_api_token", // écritures sur l'API REBORN en mode réseau (Mouss, Alan, dashboard)
  admin: "quotix_admin_token", // console de maintenance de Quotix 98 (Blind Challenge)
};

export function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function write(secrets) {
  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(SECRETS_FILE, 0o600);
}

/** Valeur du jeton `name`, créée si absente. */
export function ensureSecret(name) {
  const s = readSecrets();
  if (typeof s[name] !== "string" || s[name].length < 24) {
    s[name] = randomBytes(24).toString("base64url");
    write(s);
  }
  return s[name];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? "status";
  if (cmd === "rotate") {
    write(Object.fromEntries(Object.values(TOKENS).map((n) => [n, randomBytes(24).toString("base64url")])));
    console.log("[reborn] Jetons régénérés (non affichés). Relancez npm run dev et transmettez le nouveau jeton d'API à l'équipe (npm run token).");
  } else {
    const s = readSecrets();
    for (const n of Object.values(TOKENS)) console.log(`${n.padEnd(20)} ${typeof s[n] === "string" ? "présent" : "absent"}`);
    console.log(`Fichier : ${path.relative(ROOT, SECRETS_FILE)} (non versionné)`);
  }
}
