// Secrets locaux de REBORN : générés une fois, stockés dans .secrets/tokens.json (droits 600,
// ignoré par Git) et JAMAIS affichés dans le terminal ni dans les journaux.
//
//   node scripts/secrets.mjs status        → indique quels secrets existent (sans leur valeur)
//   node scripts/secrets.mjs rotate <clé>  → régénère UNE clé, explicitement (à faire si elle a fuité)
//
// Une clé absente est ajoutée au premier besoin (ensureSecret) ; une clé existante n'est JAMAIS
// régénérée automatiquement (pas de rotation silencieuse).
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SECRETS_FILE = path.join(ROOT, ".secrets", "tokens.json");

/** Noms des secrets gérés. */
export const TOKENS = {
  api: "reborn_api_token", // ancien jeton unique (service « all » : explorer + analyst), conservé s'il existe, jamais créé
  admin: "quotix_admin_token", // console de maintenance de Quotix 98 (Blind Challenge)
  explorer: "explorer_token", // REBORN_EXPLORER_TOKEN : exécuteur de l'agent de Mouss
  analyst: "analyst_token", // REBORN_ANALYST_TOKEN : Analyste d'Alan
  auth: "auth_secret", // REBORN_AUTH_SECRET : signature des sessions des comptes REBORN
};

/** Taille (octets aléatoires) des secrets créés ; base64url. */
const BYTES = { [TOKENS.auth]: 32 };

/** Conséquence d'une rotation, affichée à l'opérateur. */
const ROTATION_NOTE = {
  [TOKENS.api]: "transmettez le nouveau jeton aux intégrations qui l'utilisent encore (npm run token -- api)",
  [TOKENS.admin]: "relancez npm run dev ; l'ancienne session de la console de maintenance est fermée",
  [TOKENS.explorer]: "relancez npm run dev et transmettez le nouveau jeton à l'exécuteur (npm run token -- explorer)",
  [TOKENS.analyst]: "relancez npm run dev et transmettez le nouveau jeton à l'Analyste (npm run token -- analyst)",
  [TOKENS.auth]: "relancez npm run dev ; TOUTES les sessions des comptes sont fermées (chacun se reconnecte)",
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
  const tmp = `${SECRETS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(secrets, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, SECRETS_FILE);
}

/** Valeur existante du secret `name`, ou undefined (rien n'est créé). */
export function readSecret(name) {
  const v = readSecrets()[name];
  return typeof v === "string" && v ? v : undefined;
}

/** Valeur du secret `name`, créée si (et seulement si) elle est absente. */
export function ensureSecret(name, bytes = BYTES[name] ?? 24) {
  const s = readSecrets();
  if (typeof s[name] === "string" && s[name]) {
    if (s[name].length < 24) console.warn(`[reborn] secret « ${name} » court (moins de 24 caractères) : conservé tel quel ; npm run secrets -- rotate ${name} pour le remplacer.`);
    return s[name];
  }
  s[name] = randomBytes(bytes).toString("base64url");
  write(s);
  return s[name];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? "status";
  if (cmd === "rotate") {
    const name = process.argv[3];
    if (!name || !Object.values(TOKENS).includes(name)) {
      console.log(`Usage : npm run secrets -- rotate <clé>   (clés : ${Object.values(TOKENS).join(", ")})`);
      process.exit(1);
    }
    const s = readSecrets();
    s[name] = randomBytes(BYTES[name] ?? 24).toString("base64url");
    write(s);
    console.log(`[reborn] « ${name} » régénéré (valeur non affichée) : ${ROTATION_NOTE[name]}.`);
  } else if (cmd === "status") {
    const s = readSecrets();
    for (const n of Object.values(TOKENS)) console.log(`${n.padEnd(20)} ${typeof s[n] === "string" && s[n] ? "présent" : "absent"}`);
    console.log(`Fichier : ${path.relative(ROOT, SECRETS_FILE)} (non versionné, droits 600)`);
  } else {
    console.log("Usage : npm run secrets [-- status | rotate <clé>]");
    process.exit(1);
  }
}
