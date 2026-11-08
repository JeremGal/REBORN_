#!/usr/bin/env node
/**
 * Démonstration RÉELLE sur la cible du hackathon (HotelDruid, https://www.hotelrm.pro).
 *
 * Lance un Studio de production isolé (dossier temporaire, ports libres, secrets aléatoires), crée un
 * compte client par l'API d'inscription réelle, crée le projet de migration avec l'adresse de l'ancien
 * logiciel (ouvert sans connexion) et clique « Analyser mon logiciel » (sans identifiants, confirmé).
 * La mission reste en file jusqu'à ce qu'un exécuteur la prenne : studio/clients/h_executor.py, qui lance
 * le véritable agent H Company de Mouss. Rien n'est simulé ici.
 *
 * Les secrets de la pile (jetons de service, mot de passe du compte client) sont écrits dans un fichier
 * en 0600 HORS du dépôt (REBORN_DEMO_STATE, par défaut ../../secrets/demo-hotel.json), jamais affichés.
 *
 *   REBORN_NO_REBUILD=1 node scripts/demo-hotel.mjs      (Ctrl+C arrête la pile)
 */
import fs from "node:fs";
import path from "node:path";
import { createStack, distDir, ensureBuild, legalVersions, signUp, studioClient, up, ROOT } from "./acceptance/stack.mjs";

const LEGACY_URL = process.env.REBORN_DEMO_LEGACY_URL || "https://www.hotelrm.pro";
const STATE = process.env.REBORN_DEMO_STATE || path.resolve(ROOT, "..", "..", "secrets", "demo-hotel.json");

const dist = distDir();
ensureBuild(dist);
const stack = createStack("demo-hotel");
const studio = await stack.startStudio({ dist });
await up(`${studio.url}/api/health`, 60000);
const base = studio.url;
const { call } = studioClient(base);
const V = legalVersions();

const client = await signUp(base, { firstName: "Démo", lastName: "Hôtel", company: "Hôtel RM (démonstration REBORN)" });
if (!client.cookie) throw new Error("Inscription refusée");
const as = { cookie: client.cookie };

const created = await call(as, "POST", "/api/projects", {
  company: "Hôtel RM (démonstration REBORN)",
  software: "HotelDruid",
  legacy_url: LEGACY_URL,
  software_type: "Gestion hôtelière",
  authorized: true,
  authorization_version: V.authorization,
});
const projectId = created.body?.project?.id;
if (created.status !== 201 || !projectId) throw new Error(`Création du projet refusée : HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);

const analysis = await call(as, "POST", `/api/projects/${projectId}/analysis`, { without_credentials: true, authorization_version: V.authorization });

fs.mkdirSync(path.dirname(STATE), { recursive: true, mode: 0o700 });
fs.writeFileSync(
  STATE,
  JSON.stringify(
    {
      studio_url: base,
      project_id: projectId,
      explorer_token: stack.tokens.explorer,
      analyst_token: stack.tokens.analyst,
      client_email: client.email,
      client_password: client.password,
      stack_dir: stack.tmp,
      started_at: new Date().toISOString(),
    },
    null,
    1,
  ),
  { mode: 0o600 },
);

console.log(`Studio : ${base}`);
console.log(`Projet : ${projectId} (ancien logiciel : ${LEGACY_URL})`);
console.log(`« Analyser mon logiciel » : HTTP ${analysis.status} · ${analysis.body?.state} · ${analysis.body?.message ?? ""}`);
console.log(`Secrets de la pile (jetons, compte client) : ${STATE} (0600, jamais affichés)`);
console.log("Pile prête. Ctrl+C pour l'arrêter.");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log("Arrêt de la pile…");
  try {
    await stack.stop();
    if (process.env.REBORN_KEEP_TMP !== "1") stack.cleanup();
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
