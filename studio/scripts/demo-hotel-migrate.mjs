#!/usr/bin/env node
/**
 * Démonstration RÉELLE, suite : données de HotelDruid → Studio → nouveau logiciel.
 * Sur la pile lancée par scripts/demo-hotel.mjs (état dans ../../secrets/demo-hotel.json, 0600) :
 * dépôt par le propriétaire de la base SQLite produite par scripts/tagged-dump-to-sqlite.mjs à partir de la
 * sauvegarde téléchargée par le mécanisme d'export officiel du logiciel, profil, correspondances proposées,
 * points à valider ACCEPTÉS par l'équipe pour la démonstration (journalisés comme tels), migration,
 * vérification indépendante, mise en service et lien d'activation du propriétaire (écrit dans l'état, jamais
 * affiché). Aucune donnée injectée dans la destination : tout vient de la migration.
 *
 *   node scripts/demo-hotel-migrate.mjs <base.db>
 */
import fs from "node:fs";
import path from "node:path";
import { signIn, studioClient, ROOT } from "./acceptance/stack.mjs";

const dbFile = process.argv[2];
if (!dbFile) {
  console.error("usage : demo-hotel-migrate.mjs <base.db>");
  process.exit(2);
}
const STATE = process.env.REBORN_DEMO_STATE || path.resolve(ROOT, "..", "..", "secrets", "demo-hotel.json");
const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
const base = st.studio_url;
const { call } = studioClient(base);
const login = await signIn(base, st.client_email, st.client_password);
if (login.status !== 200 || !login.cookie) throw new Error(`Connexion du client refusée (HTTP ${login.status})`);
const as = { cookie: login.cookie };
const qp = (p) => `${p}${p.includes("?") ? "&" : "?"}project=${st.project_id}`;
const step = (label, ok, detail = "") => console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);

const src = await call(as, "POST", qp("/api/migration/sources"), { name: "hotel-sauvegarde.db", content_base64: fs.readFileSync(dbFile).toString("base64"), mechanism: "Sauvegarde officielle du logiciel (crea_backup), convertie en SQLite par l'adaptateur d'extraction" });
step("Base déposée par le propriétaire du projet", src.status === 200, `${src.body.source?.tables?.length ?? 0} tables · HTTP ${src.status}${src.status !== 200 ? ` ${JSON.stringify(src.body).slice(0, 200)}` : ""}`);
if (src.status !== 200) process.exit(1);

const prof = (await call(as, "GET", qp("/api/migration/profile"))).body;
step("Tables, types et relations analysés", !!prof.tables?.length, `${prof.tables?.length ?? 0} tables, ${prof.relations?.length ?? 0} relations détectées`);

const prop = await call(as, "POST", qp("/api/migration/mapping?propose=auto"));
const items = prop.body.review?.items ?? [];
step("Correspondances proposées", prop.status === 200, `${prop.body.mapping?.entities?.length ?? prop.body.current?.mapping?.entities?.length ?? "?"} entités · ${items.length} point(s) à valider${prop.status !== 200 ? ` · ${JSON.stringify(prop.body).slice(0, 300)}` : ""}`);
if (prop.status !== 200) process.exit(1);

let accepted = 0;
for (const i of items) if ((await call(as, "POST", qp("/api/migration/decisions"), { key: i.key, decision: "accepted", comment: "Accepté par l'équipe REBORN pour la démonstration du 08/11" })).status === 200) accepted++;
step("Points à valider décidés (acceptés par l'équipe pour la démonstration)", accepted === items.length, `${accepted}/${items.length}`);

const run = await call(as, "POST", qp("/api/migration/runs"), {});
const s = run.body.run?.summary;
step("Migration exécutée", run.status === 200, s ? `${s.imported} importés, ${s.rejected} rejetés${s.flagged !== undefined ? `, ${s.flagged} signalés` : ""}` : `HTTP ${run.status} ${JSON.stringify(run.body).slice(0, 300)}`);
if (run.status !== 200) process.exit(1);
const rep = run.body.report;
step("Vérification indépendante", !!rep, rep ? `statut ${rep.status}, ${rep.checks} contrôles, ${rep.failed} en échec` : "");
if (rep?.status === "review") {
  const ack = await call(as, "POST", qp(`/api/migration/runs/${run.body.run.id}/acknowledge`), { comment: "Écarts examinés par l'équipe pour la démonstration (signalés, non corrigés)" });
  step("Écarts documentés acceptés", ack.status === 200, `HTTP ${ack.status}`);
}

const dep = await call(as, "POST", qp("/api/migration/deploy"), { run_id: run.body.run.id });
step("Nouveau logiciel généré et mis en service", dep.status === 200, dep.body.url ?? `HTTP ${dep.status} ${JSON.stringify(dep.body).slice(0, 300)}`);
if (dep.status === 200) {
  const access = await call(as, "POST", qp("/api/migration/app/access"));
  step("Lien d'activation du propriétaire créé", access.status === 201, "écrit dans l'état de la pile, jamais affiché");
  st.app_url = dep.body.url;
  st.activation_link = access.body.link ?? null;
  st.run_id = run.body.run.id;
  fs.writeFileSync(STATE, JSON.stringify(st, null, 1), { mode: 0o600 });
}
