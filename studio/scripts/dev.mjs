// Lance le logiciel historique Quotix 98 (:4000, maintenance :4001 locale) et la plateforme REBORN (:3000).
//
//   npm run dev        → tout écoute sur 127.0.0.1 uniquement (démo sur un seul poste)
//   npm run dev:lan    → plateforme + Quotix accessibles sur le réseau local (REBORN_LAN=1) ;
//                        l'accès au Studio passe par les comptes REBORN et les jetons des agents
//   npm run start      → build de production puis serveur de production (démo finale, plus stable)
//   npm run start:lan  → idem, accessible sur le réseau local
//
// Comptes : inscription sur /inscription, connexion sur /connexion ; npm run account -- … (opérateur).
// Les secrets ne sont jamais affichés : npm run token -- explorer|analyst (copie un jeton d'agent),
// npm run maintenance (console Quotix).
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ensureSecret, readSecret, ROOT, TOKENS } from "./secrets.mjs";

const lan = process.argv.includes("--lan");
const prod = process.argv.includes("--prod");
const host = lan ? "0.0.0.0" : "127.0.0.1";
// Secrets du Studio : transmis au seul processus du Studio, jamais aux anciens logiciels de test.
const STUDIO_SECRETS = ["REBORN_AUTH_SECRET", "REBORN_EXPLORER_TOKEN", "REBORN_ANALYST_TOKEN", "REBORN_API_TOKEN"];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !STUDIO_SECRETS.includes(k)));
const studioSecrets = Object.fromEntries(STUDIO_SECRETS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));

env.LEGACY_ADMIN_TOKEN ||= ensureSecret(TOKENS.admin);
// Comptes et agents : clés ajoutées à .secrets/tokens.json si absentes, jamais régénérées.
studioSecrets.REBORN_AUTH_SECRET ||= ensureSecret(TOKENS.auth);
studioSecrets.REBORN_EXPLORER_TOKEN ||= ensureSecret(TOKENS.explorer);
studioSecrets.REBORN_ANALYST_TOKEN ||= ensureSecret(TOKENS.analyst);
// Ancien jeton unique (service « all ») : transmis seulement s'il existe déjà.
const legacyApiToken = readSecret(TOKENS.api);
if (legacyApiToken) studioSecrets.REBORN_API_TOKEN ||= legacyApiToken;
// Sorties réseau autorisées vers les logiciels de test locaux (Relatio :4100, Quotix :4000), jamais 3000, 4001 ni 5050.
env.REBORN_EGRESS_ALLOW ||= "127.0.0.1:4100,[::1]:4100,127.0.0.1:4000,[::1]:4000";

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

if (lan) {
  env.REBORN_LAN = "1";
  // Next (dev) n'accepte ses ressources que pour les origines connues : on déclare les IP du poste
  env.REBORN_DEV_ORIGINS = ["127.0.0.1", ...lanIps].join(",");
} else {
  // Poste local : seules les adresses de bouclage sont servies (protection contre le rebinding DNS).
  delete env.REBORN_LAN;
}

const platformDir = path.join(ROOT, "platform");
if (prod) {
  console.log("[reborn] Build de production…");
  const b = spawnSync("npm", ["--prefix", platformDir, "run", "build"], { stdio: "inherit", env });
  if (b.status) process.exit(b.status);
}

console.log(`\n[reborn] ${prod ? "Production" : "Développement"} · ${lan ? "réseau local" : "poste local uniquement (127.0.0.1)"}`);
console.log("[reborn]   REBORN Studio            : http://127.0.0.1:3000   (compte requis)");
console.log("[reborn]   Comptes                  : connexion http://127.0.0.1:3000/connexion · création http://127.0.0.1:3000/inscription");
console.log("[reborn]   Équipe (opérateur)       : npm run account -- list | operator <email> | reset-link <email>");
console.log("[reborn]   Application reconstruite : http://127.0.0.1:3000/app");
console.log("[reborn]   Quotix 98 (exploré)      : http://127.0.0.1:4000");
console.log("[reborn]   Relatio 2004 (CRM source): http://127.0.0.1:4100   (compte « migration » : npm run crm-source:password)");
console.log("[reborn]   Nouveau CRM (livré)      : http://127.0.0.1:5050   (après mise en service · npm run crm:password)");
console.log("[reborn]   Console de maintenance   : npm run maintenance   (127.0.0.1:4001, jeton requis)");
console.log("[reborn]   Jetons des agents        : npm run token -- explorer | analyst   (copiés, jamais affichés)");
if (lan) {
  for (const ip of lanIps) console.log(`[reborn]   Pour l'équipe            : http://${ip}:3000/connexion   (agents : REBORN_URL=http://${ip}:3000 · Quotix : http://${ip}:4000)`);
}
console.log("");

const procs = [
  spawn(process.execPath, [path.join(ROOT, "legacy-app/server.mjs")], { stdio: "inherit", env: { ...env, LEGACY_HOST: host } }),
  spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { stdio: "inherit", env: { ...env, LEGACY_CRM_HOST: host } }),
  spawn("npm", ["--prefix", platformDir, "run", prod ? "start" : "dev", "--", "-H", host], { stdio: "inherit", env: { ...env, ...studioSecrets } }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) =>
  p.on("exit", (code) => {
    if (code) {
      console.error(`[reborn] un processus s'est arrêté (code ${code})`);
      stop();
    }
  }),
);
