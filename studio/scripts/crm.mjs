// Lance le logiciel livré (generated/<id>/) SEUL, sans REBORN Studio ni le logiciel historique.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "./secrets.mjs";

const dir = path.join(ROOT, "generated");
const apps = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "server.mjs"))) : [];
const app = process.argv[2] ?? apps[0];
if (!app || !apps.includes(app)) {
  console.log(`[reborn] Aucun logiciel généré${app ? ` nommé ${app}` : ""}. Disponibles : ${apps.join(", ") || "aucun"}`);
  process.exit(1);
}
console.log(`[reborn] ${app} : lancement autonome depuis generated/${app} (Ctrl+C pour arrêter)`);
const child = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: path.join(dir, app), stdio: "inherit", env: { PATH: process.env.PATH, PORT: process.env.CRM_PORT ?? "5050", HOST: process.env.HOST ?? "127.0.0.1" } });
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
