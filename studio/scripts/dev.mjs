// Lance le logiciel historique Quotix 98 (:4000, maintenance :4001 locale) et la plateforme REBORN (:3000).
//
//   npm run dev        → tout écoute sur 127.0.0.1 uniquement (démo sur un seul poste)
//   npm run dev:lan    → plateforme + Quotix accessibles sur le réseau local ; écritures protégées
//                        par le jeton d'API (stocké dans .secrets/tokens.json, jamais affiché)
//   npm run start      → build de production puis serveur de production (démo finale, plus stable)
//   npm run start:lan  → idem, accessible sur le réseau local
//
// Les jetons ne sont jamais affichés : npm run token (copie le jeton d'API),
// npm run connect (ouvre le dashboard authentifié), npm run maintenance (console Quotix).
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ensureSecret, ROOT, TOKENS } from "./secrets.mjs";

const lan = process.argv.includes("--lan");
const prod = process.argv.includes("--prod");
const host = lan ? "0.0.0.0" : "127.0.0.1";
const env = { ...process.env };

env.LEGACY_ADMIN_TOKEN ||= ensureSecret(TOKENS.admin);

const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

if (lan) {
  env.REBORN_API_TOKEN ||= ensureSecret(TOKENS.api);
  // Next (dev) n'accepte ses ressources que pour les origines connues : on déclare les IP du poste
  env.REBORN_DEV_ORIGINS = ["127.0.0.1", ...lanIps].join(",");
}

const platformDir = path.join(ROOT, "platform");
if (prod) {
  console.log("[reborn] Build de production…");
  const b = spawnSync("npm", ["--prefix", platformDir, "run", "build"], { stdio: "inherit", env });
  if (b.status) process.exit(b.status);
}

console.log(`\n[reborn] ${prod ? "Production" : "Développement"} · ${lan ? "réseau local" : "poste local uniquement (127.0.0.1)"}`);
console.log("[reborn]   Dashboard REBORN        : http://127.0.0.1:3000");
console.log("[reborn]   Application reconstruite : http://127.0.0.1:3000/app");
console.log("[reborn]   Quotix 98 (exploré)      : http://127.0.0.1:4000");
console.log("[reborn]   Relatio 2004 (CRM source): http://127.0.0.1:4100   (compte « migration » : npm run crm-source:password)");
console.log("[reborn]   Nouveau CRM (livré)      : http://127.0.0.1:5050   (après mise en service · npm run crm:password)");
console.log("[reborn]   Console de maintenance   : npm run maintenance   (127.0.0.1:4001, jeton requis)");
if (lan) {
  for (const ip of lanIps) console.log(`[reborn]   Pour l'équipe            : REBORN_URL=http://${ip}:3000   (Quotix : http://${ip}:4000)`);
  console.log("[reborn]   Jeton d'API              : npm run token (copié dans le presse-papiers, jamais affiché)");
  console.log("[reborn]   Ce navigateur            : npm run connect");
}
console.log("");

const procs = [
  spawn(process.execPath, [path.join(ROOT, "legacy-app/server.mjs")], { stdio: "inherit", env: { ...env, LEGACY_HOST: host } }),
  spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { stdio: "inherit", env: { ...env, LEGACY_CRM_HOST: host } }),
  spawn("npm", ["--prefix", platformDir, "run", prod ? "start" : "dev", "--", "-H", host], { stdio: "inherit", env }),
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
