import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ApiError } from "../http";
import { effectiveMapping, type EntityMap, type MigrationMapping } from "./mapping";
import { buildDdl } from "./model";
import { assertActive, getProject, loadProject, unmappedTables, markRolledBack, migrationLog, projectIds, reconcileDeployed, recordBusinessModel, recordDeployment, runArtifacts, runDir, statusLabel, transition, validatedBusinessModels, type Deployment } from "./project";
import { checkBusinessModel, type BusinessModel } from "./business-model";
import { enrichSpec } from "./application-spec";
import type { VerificationReport } from "./verify";
import type { RulePackage } from "../engine/bindings";

/**
 * Générateur du logiciel livré : spécification (app.json) déduite des correspondances
 * validées + runtime générique autonome (platform/runtime) + base migrée.
 * Résultat : generated/<id>/, lançable seul avec `node server.mjs`, sans REBORN Studio.
 */

/** 1.1 : classification (protection de l'historique), line_of, modèle métier versionné (rules/). */
export const SPEC_VERSION = "1.1";
// Dossiers lus à l'exécution (gabarit du runtime, logiciels générés) : exclus du traçage du build
export const appsRoot = () => process.env.REBORN_APPS_DIR ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "generated");
const runtimeDir = () => path.join(/* turbopackIgnore: true */ process.cwd(), "runtime");
export const appPort = () => Number(process.env.CRM_PORT ?? 5050);

export interface AppSpec {
  spec_version: string;
  app: { id: string; name: string; tagline: string; currency: string; locale: string; generated_at: string; generator: string; source_system?: string; migration_run: string; port: number; company?: string };
  entities: {
    name: string;
    label: string;
    label_singular: string;
    title_field: string | null;
    fields: { name: string; label: string; type: string; required: boolean; unique: boolean; options?: { value: string; label?: string }[]; references?: string; accounting: boolean }[];
    list_fields: string[];
    search_fields: string[];
    children: { entity: string; via: string; label: string }[];
    computed: { field: string; expr: string }[];
    aggregates: { field: string; children: string; via: string; expr: string }[];
    classification?: EntityMap["classification"];
    line_of?: EntityMap["line_of"];
  }[];
  navigation: { entity: string }[];
  dashboard: { cards: { label: string; entity: string; kind: "count" | "sum"; field?: string }[]; breakdowns: { label: string; entity: string; field: string }[] };
  ddl: string[];
}

export function buildAppSpec(m: MigrationMapping, opts: { runId: string; sourceSystem?: string; port?: number; company?: string }): AppSpec {
  const childOf = new Set(m.entities.flatMap((e) => (e.aggregates ?? []).map((a) => a.children)));
  const entities = m.entities.map((e) => {
    const title = e.title_field ?? e.fields.find((f) => f.type === "text")?.name ?? null;
    const listDefault = [title, ...e.fields.filter((f) => f.name !== title && ["enum", "date", "money", "reference", "text", "email"].includes(f.type)).map((f) => f.name)].filter(Boolean).slice(0, 6) as string[];
    return {
      name: e.name,
      label: e.label ?? e.name,
      label_singular: e.label_singular ?? e.label ?? e.name,
      title_field: title,
      fields: e.fields.map((f) => ({ name: f.name, label: f.label ?? f.name, type: f.type, required: !!f.required, unique: !!f.unique, options: f.options, references: f.references, accounting: !!f.accounting })),
      list_fields: e.ui?.list_fields ?? listDefault,
      search_fields: e.ui?.search_fields ?? e.fields.filter((f) => ["text", "email", "phone"].includes(f.type)).slice(0, 4).map((f) => f.name),
      children: m.entities.flatMap((o) => o.fields.filter((f) => f.type === "reference" && f.references === e.name).map((f) => ({ entity: o.name, via: f.name, label: o.label ?? o.name }))),
      computed: e.computed ?? [],
      aggregates: (e.aggregates ?? []).map((a) => ({ field: a.field, children: a.children, via: a.via, expr: a.expr })),
      ...(e.classification ? { classification: e.classification } : {}),
      ...(e.line_of ? { line_of: e.line_of } : {}),
    };
  });
  const nav = m.entities.filter((e) => e.ui?.nav ?? !childOf.has(e.name));
  type Card = AppSpec["dashboard"]["cards"][number];
  const cards: Card[] = nav.flatMap((e: EntityMap): Card[] =>
    e.ui?.indicators?.map((i) => ({ label: i.label, entity: e.name, kind: i.kind, field: i.field })) ?? [{ label: e.label ?? e.name, entity: e.name, kind: "count" }],
  );
  const breakdowns = nav
    .map((e) => ({ e, field: e.ui?.breakdown ?? e.fields.find((f) => f.type === "enum")?.name }))
    .filter((x): x is { e: EntityMap; field: string } => !!x.field)
    .slice(0, 4)
    .map(({ e, field }) => ({ label: `${e.label ?? e.name} · ${e.fields.find((f) => f.name === field)?.label ?? field}`, entity: e.name, field }));
  return {
    spec_version: SPEC_VERSION,
    app: {
      id: m.target.id,
      name: m.target.name,
      tagline: opts.sourceSystem ? `Reconstruit depuis ${opts.sourceSystem}` : "Logiciel métier",
      currency: "EUR",
      locale: "fr-FR",
      generated_at: new Date().toISOString(),
      generator: "REBORN Studio — Application Reconstruction Engine",
      source_system: opts.sourceSystem,
      migration_run: opts.runId,
      port: opts.port ?? appPort(),
      ...(opts.company ? { company: opts.company } : {}),
    },
    entities,
    navigation: nav.map((e) => ({ entity: e.name })),
    dashboard: { cards, breakdowns },
    ddl: buildDdl(m),
  };
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function writeApp(spec: AppSpec, dir: string, rules: RulePackage[] = []) {
  copyDir(runtimeDir(), dir);
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(spec, null, 1));
  for (const pkg of rules) writeRulePackage(dir, pkg);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: spec.app.id, private: true, type: "module", description: spec.app.name, engines: { node: ">=22.13" }, scripts: { start: "node --no-warnings server.mjs" } }, null, 2) + "\n");
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `# ${spec.app.name}

Logiciel métier généré par REBORN Studio le ${new Date(spec.app.generated_at).toLocaleString("fr-FR")}${spec.app.source_system ? ` à partir des données de **${spec.app.source_system}**` : ""} (migration ${spec.app.migration_run}).

Il fonctionne seul : Node 22.13 ou plus récent, aucune dépendance, aucune connexion à REBORN ni à l'ancien logiciel.

\`\`\`bash
npm start                 # http://127.0.0.1:${spec.app.port}
PORT=8080 HOST=0.0.0.0 npm start
\`\`\`

| Élément | Emplacement |
|---|---|
| Base de données (SQLite) | \`data/app.db\` |
| Pièces jointes (nommées par empreinte SHA-256) | \`files/\` |
| Sauvegardes | \`backups/\` (avant chaque mise en service et à la demande) |
| Description du logiciel (entités, champs, relations, règles, tableaux de bord) | \`app.json\` |
| Compte administrateur initial | \`.secrets/admin.json\` (à protéger ; changer le mot de passe après la première connexion) |

Entités : ${spec.entities.map((e) => `${e.label} (${e.fields.length} champs)`).join(", ")}.

Chaque enregistrement migré conserve son origine (table et clé de l'ancien logiciel, empreinte de la ligne, transformations) dans la table \`_lineage\`. Les montants comptables historiques sont en lecture seule. Toute modification est tracée dans \`_audit\`.
`,
  );
}

/* ------------------------------------------------------------------ */
/* Processus du logiciel livré                                          */
/* ------------------------------------------------------------------ */

// Le logiciel livré est un processus INDÉPENDANT : lancé détaché (son propre groupe de processus),
// il survit à l'arrêt du Studio (Ctrl+C compris). Il est retrouvé par son fichier run/server.pid,
// quel que soit le processus qui l'a lancé (Studio, npm run crm, npm start dans son dossier).

interface Health {
  ok: boolean;
  app?: string;
  rules_version?: number | null;
  pid?: number;
}
async function health(port: number): Promise<Health | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    return r.ok ? ((await r.json()) as Health) : null;
  } catch {
    return null;
  }
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
function pidOf(appId: string): { pid: number; port: number } | null {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(appsRoot(), appId, "run", "server.pid"), "utf8")) as { pid: number; port: number; app: string };
    return p.app === appId && alive(p.pid) ? { pid: p.pid, port: p.port } : null;
  } catch {
    return null;
  }
}

export async function startApp(appId: string): Promise<void> {
  const dir = path.join(appsRoot(), appId);
  if (!fs.existsSync(path.join(dir, "server.mjs"))) throw new ApiError(404, "Logiciel non généré");
  const port = portOf(appId);
  const running = await health(port);
  if (running) {
    if (running.app === appId) return;
    throw new ApiError(409, `Le port ${port} est déjà utilisé par une autre application`);
  }
  const log = fs.openSync(path.join(dir, "app.log"), "a");
  const env = { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1" } as unknown as NodeJS.ProcessEnv;
  const child: ChildProcess = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: dir, env, stdio: ["ignore", log, log], detached: true });
  child.unref();
  fs.closeSync(log);
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if ((await health(port))?.app === appId) return;
    if (child.exitCode !== null) break;
  }
  throw new ApiError(500, `Le logiciel ne démarre pas (voir ${path.relative(path.resolve(process.cwd(), ".."), path.join(dir, "app.log"))})`);
}

/** Arrête le logiciel livré, qu'il ait été lancé par le Studio ou à la main. */
export async function stopApp(appId: string): Promise<boolean> {
  const p = pidOf(appId);
  if (!p) return false;
  const h = await health(p.port);
  if (h && h.app !== appId) return false;
  try {
    process.kill(p.pid, "SIGTERM");
  } catch {
    return false;
  }
  for (let i = 0; i < 40 && alive(p.pid); i++) await new Promise((r) => setTimeout(r, 100));
  return true;
}

export async function appStatus() {
  const p = getProject();
  const active = [...p.deployments].reverse().find((d) => d.status === "active") ?? null;
  const id = active ? path.basename(active.app_dir) : null;
  const port = id ? portOf(id) : appPort();
  const h = await health(port);
  const proc = id ? pidOf(id) : null;
  return {
    deployment: active,
    app_id: id,
    port,
    url: `http://127.0.0.1:${port}`,
    running: !!h && h.app === id,
    /** Processus retrouvé par son fichier PID : le Studio peut l'arrêter, mais n'en est pas le parent. */
    managed: !!proc,
    pid: proc?.pid ?? null,
    rules_version: h && h.app === id ? (h.rules_version ?? null) : null,
    port_used_by_other: !!h && h.app !== id,
    credentials_file: id ? path.join("generated", id, ".secrets", "admin.json") : null,
    start_command: id ? `npm run crm   (ou : cd generated/${id} && npm start)` : null,
  };
}

/* ------------------------------------------------------------------ */
/* Modèle métier versionné du logiciel livré                           */
/* ------------------------------------------------------------------ */

export function writeRulePackage(dir: string, pkg: RulePackage) {
  const file = path.join(dir, "rules", `v${pkg.version}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const prev = fs.readFileSync(file, "utf8");
    if (prev !== JSON.stringify(pkg, null, 1)) throw new ApiError(409, `La version ${pkg.version} du modèle métier est déjà publiée avec un contenu différent`);
    return;
  }
  fs.writeFileSync(file, JSON.stringify(pkg, null, 1));
}

/**
 * Publie une version du modèle métier dans le logiciel livré (rules/v<N>.json). Le logiciel la
 * prend en compte à chaud : les nouveaux documents l'utilisent, les documents existants gardent
 * la version avec laquelle ils ont été calculés, l'historique migré n'est jamais recalculé.
 */
export async function publishRulesToApp(appId: string, pkg: RulePackage): Promise<{ file: string; running: boolean; active_version: number | null }> {
  const dir = path.join(appsRoot(), appId);
  if (!fs.existsSync(path.join(dir, "server.mjs"))) throw new ApiError(404, "Logiciel non généré");
  const active = [...getProject().deployments].reverse().find((d) => d.status === "active");
  if (active) {
    const errors = checkBusinessModel({ contract_version: pkg.contract_version ?? "1.0", modules: pkg.modules, bindings: pkg.bindings } as BusinessModel, runArtifacts(active.run_id).mapping).filter((i) => i.level === "error");
    if (errors.length) throw new ApiError(409, `Modèle métier v${pkg.version} incompatible avec le logiciel en service : ${errors.map((e) => e.message).slice(0, 3).join(" · ")}`, errors);
  }
  writeRulePackage(dir, pkg);
  const port = portOf(appId);
  let h = await health(port);
  if (h?.app !== appId) return { file: path.join("rules", `v${pkg.version}.json`), running: false, active_version: null };
  for (let i = 0; i < 20 && h?.rules_version !== pkg.version; i++) {
    await new Promise((r) => setTimeout(r, 100));
    h = await health(port);
  }
  return { file: path.join("rules", `v${pkg.version}.json`), running: true, active_version: h?.rules_version ?? null };
}

/* ------------------------------------------------------------------ */
/* Mise en service, retour arrière, réconciliation                     */
/* ------------------------------------------------------------------ */

function userActivity(dbPath: string): number {
  if (!fs.existsSync(dbPath)) return 0;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return Number((db.prepare(`SELECT COUNT(*) AS n FROM "_audit" WHERE "action" IN ('create', 'update', 'delete', 'file_added')`).get() as { n: number }).n);
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

export async function deploy(runId: string, by: string, opts: { force?: boolean } = {}): Promise<{ deployment: Deployment; url: string; report: VerificationReport }> {
  assertActive();
  const { report, mapping, meta } = runArtifacts(runId);
  const p = getProject();
  if (!report) throw new ApiError(409, "Exécution sans rapport de vérification");
  if (report.status === "blocked") throw new ApiError(409, `Mise en service refusée : ${statusLabel(report.status)} (contrôles bloquants en échec)`);
  if (report.status === "review" && !p.acknowledgements[runId]) throw new ApiError(409, "Mise en service refusée : les écarts du rapport doivent d'abord être examinés et acceptés par un responsable");
  const appId = mapping.target.id;
  const dir = path.join(appsRoot(), appId);
  const owner = path.join(dir, ".reborn-project");
  if (fs.existsSync(owner) && fs.readFileSync(owner, "utf8").trim() !== p.id) {
    throw new ApiError(409, `Le logiciel « ${appId} » appartient à un autre projet : changez l'identifiant du nouveau logiciel (correspondances → target.id)`);
  }
  const dbPath = path.join(dir, "data", "app.db");
  const activity = userActivity(dbPath);
  if (activity && !opts.force) {
    throw new ApiError(409, `Le logiciel en service contient ${activity} modification(s) faite(s) par ses utilisateurs : une nouvelle mise en service remplacerait la base. Confirmez explicitement (une sauvegarde sera faite).`);
  }
  const port = p.app?.id === appId ? p.app.port : await allocatePort(p.id);
  const wasManaged = await stopApp(appId);
  const h = await health(port);
  if (h?.app === appId) throw new ApiError(409, `Le logiciel en service ne s'est pas arrêté (processus sans fichier PID, lancé par une version antérieure) : arrêtez-le à la main avant la mise en service`);
  transition("RECONSTRUCTING", `Génération du nouveau logiciel « ${mapping.target.name} » à partir de ${runId}`);
  try {
    return await generateAndStart();
  } catch (e) {
    transition("FAILED", `Mise en service interrompue : ${(e as Error).message} (base précédente sauvegardée ; relancez la mise en service ou revenez en arrière)`);
    throw e;
  }
  async function generateAndStart() {
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
  let backup: string | null = null;
  if (fs.existsSync(dbPath)) {
    backup = path.join(dir, "backups", `${new Date().toISOString().replace(/[:.]/g, "-")}-avant-mise-en-service.db`);
    fs.copyFileSync(dbPath, backup);
  }
  for (const ext of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${dbPath}${ext}`, { force: true });
  fs.copyFileSync(path.join(runDir(runId), "target.db"), dbPath);
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  for (const f of fs.readdirSync(path.join(runDir(runId), "files"))) fs.copyFileSync(path.join(runDir(runId), "files", f), path.join(dir, "files", f));
  const secret = path.join(dir, ".secrets", "admin.json");
  if (!fs.existsSync(secret)) {
    fs.mkdirSync(path.dirname(secret), { recursive: true, mode: 0o700 });
    fs.writeFileSync(secret, JSON.stringify({ username: "admin", password: randomBytes(12).toString("base64url"), note: "Mot de passe initial : à changer après la première connexion." }, null, 2), { mode: 0o600 });
  }
  const rules = installableRules(mapping);
  writeApp(specFor(mapping, runId, meta.mapping_version, port, rules), dir, rules);
  fs.writeFileSync(owner, p.id);
  for (const pkg of rules) recordBusinessModel(pkg.version, { published: { app_id: appId, at: new Date().toISOString(), by } });
  const deployment: Deployment = { id: `DEP_${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), by, run_id: runId, app_dir: path.relative(path.resolve(process.cwd(), ".."), dir), backup: backup ? path.basename(backup) : null, status: "active" };
  recordDeployment(deployment, { id: appId, port });
  await startApp(appId);
  migrationLog(`Nouveau logiciel « ${mapping.target.name} » mis en service (${runId})`, `${meta.summary.imported} enregistrement(s) migré(s) · ${backup ? "base précédente sauvegardée" : "première mise en service"}${wasManaged ? " · redémarré" : ""}`);
  transition("PUBLISHED", `Nouveau logiciel « ${mapping.target.name} » en service sur le port ${port} (${runId}${rules.length ? `, modèle métier v${rules.at(-1)!.version}` : ", sans modèle métier"})`);
  return { deployment, url: `http://127.0.0.1:${port}`, report: report! };
  }
}

/** Modèle métier installable : versions validées ET cohérentes avec les correspondances appliquées. */
function installableRules(mapping: MigrationMapping, quiet = false): RulePackage[] {
  const rules: RulePackage[] = [];
  for (const pkg of validatedBusinessModels()) {
    const errors = checkBusinessModel({ contract_version: pkg.contract_version ?? "1.0", modules: pkg.modules, bindings: pkg.bindings } as BusinessModel, mapping).filter((i) => i.level === "error");
    if (errors.length && !quiet) migrationLog(`Modèle métier v${pkg.version} non installé`, `Incohérent avec les correspondances appliquées : ${errors.map((e) => e.message).slice(0, 3).join(" · ")}`);
    if (!errors.length) rules.push(pkg);
  }
  return rules;
}

/** Aperçu de l'ApplicationSpec qui serait générée maintenant (rien n'est écrit ni démarré). */
export function previewSpec(): AppSpec {
  const p = getProject();
  const mv = p.mappings.at(-1);
  if (!mv) throw new ApiError(409, "Aucune correspondance : la structure du nouveau logiciel n'est pas encore définie");
  const mapping = effectiveMapping(mv.mapping, p.decisions);
  return specFor(mapping, p.runs.at(-1)?.id ?? "aperçu (aucune migration)", mv.version, p.app?.port ?? appPort(), installableRules(mapping, true));
}

/** ApplicationSpec du logiciel livré (provenance, écrans, actions, règles, éléments non reconstruits). */
function specFor(mapping: MigrationMapping, runId: string, mappingVersion: number, port: number, rules: RulePackage[]): AppSpec {
  const p = getProject();
  const mv = p.mappings.find((x) => x.version === mappingVersion);
  return enrichSpec(buildAppSpec(mapping, { runId, sourceSystem: p.source_system, port, company: p.company }), mapping, {
    decisions: p.decisions,
    mapping: { version: mappingVersion, origin: mv?.origin ?? "auto" },
    runId,
    rules: rules.map((r) => ({ ...r, history_check: (p.business_models ?? []).find((b) => b.version === r.version)?.history_check?.statement ?? null })),
    pendingModels: (p.business_models ?? []).filter((b) => b.status !== "validated").map((b) => ({ version: b.version, status: b.status })),
    unmapped: unmappedTables(mapping),
    refused: (p.extraction?.results ?? []).filter((r) => r.status !== "ok").map((r) => ({ name: r.label ?? r.id, status: r.status, message: r.message })),
  }) as unknown as AppSpec;
}

/**
 * Nouvelle version du logiciel livré (moteur générique, spécification, modèle métier validé) SANS
 * toucher à ses données : base, fichiers joints, sauvegardes et comptes sont conservés. La base
 * est sauvegardée avant ; le schéma n'évolue que par ajout de colonnes (aucune suppression).
 */
export async function upgradeApp(by: string): Promise<{ app_id: string; backup: string; rules_versions: number[]; url: string }> {
  assertActive();
  const p = getProject();
  const active = [...p.deployments].reverse().find((d) => d.status === "active");
  if (!active) throw new ApiError(409, "Aucun logiciel en service dans ce projet");
  const appId = path.basename(active.app_dir);
  const dir = path.join(appsRoot(), appId);
  const { mapping, meta } = runArtifacts(active.run_id);
  const port = portOf(appId);
  await stopApp(appId);
  if ((await health(port))?.app === appId) throw new ApiError(409, "Le logiciel tourne sans fichier PID (lancé par une version antérieure) : arrêtez-le (Ctrl+C dans son terminal) puis relancez la mise à jour");
  const dbPath = path.join(dir, "data", "app.db");
  fs.mkdirSync(path.join(dir, "backups"), { recursive: true });
  const backup = path.join(dir, "backups", `${new Date().toISOString().replace(/[:.]/g, "-")}-avant-mise-a-jour.db`);
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }
  }
  const rules = installableRules(mapping);
  writeApp(specFor(mapping, active.run_id, meta.mapping_version, port, rules), dir, rules);
  await startApp(appId);
  migrationLog(`Logiciel « ${mapping.target.name} » mis à jour (moteur et spécification)`, `Données conservées · sauvegarde ${path.basename(backup)}${rules.length ? ` · modèle métier v${rules.map((r) => r.version).join(", v")}` : ""} · par ${by}`);
  return { app_id: appId, backup: path.basename(backup), rules_versions: rules.map((r) => r.version), url: `http://127.0.0.1:${port}` };
}

/** Port libre pour un nouveau logiciel livré : à partir de CRM_PORT (5050), hors ports des autres projets. */
async function allocatePort(projectId: string): Promise<number> {
  const used = new Set<number>();
  for (const id of projectIds()) {
    if (id === projectId) continue;
    const port = loadProject(id)?.app?.port;
    if (port) used.add(port);
  }
  for (let port = appPort(); port < appPort() + 200; port++) {
    if (used.has(port)) continue;
    if (!(await health(port))) return port;
  }
  throw new ApiError(503, "Aucun port libre pour le nouveau logiciel");
}

/** Port d'un logiciel livré : celui de sa spécification (app.json), sinon CRM_PORT. */
export function portOf(appId: string): number {
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(appsRoot(), appId, "app.json"), "utf8")).app.port) || appPort();
  } catch {
    return appPort();
  }
}

export async function rollback(deploymentId: string, by: string) {
  assertActive();
  const p = getProject();
  const d = p.deployments.find((x) => x.id === deploymentId);
  if (!d) throw new ApiError(404, "Mise en service inconnue");
  if (!d.backup) throw new ApiError(409, "Première mise en service : aucune base antérieure à restaurer");
  const appId = path.basename(d.app_dir);
  const dir = path.join(appsRoot(), appId);
  const backup = path.join(dir, "backups", d.backup);
  if (!fs.existsSync(backup)) throw new ApiError(404, `Sauvegarde introuvable : ${d.backup}`);
  await stopApp(appId);
  const dbPath = path.join(dir, "data", "app.db");
  fs.copyFileSync(dbPath, path.join(dir, "backups", `${new Date().toISOString().replace(/[:.]/g, "-")}-avant-retour-arriere.db`));
  for (const ext of ["-wal", "-shm", "-journal"]) fs.rmSync(`${dbPath}${ext}`, { force: true });
  fs.copyFileSync(backup, dbPath);
  markRolledBack(deploymentId);
  await startApp(appId);
  migrationLog(`Retour arrière : base antérieure à ${d.run_id} restaurée`, `Par ${by} · sauvegarde ${d.backup}`);
}

export function reconcile(): VerificationReport {
  const p = getProject();
  const active = [...p.deployments].reverse().find((d) => d.status === "active");
  if (!active) throw new ApiError(409, "Aucun logiciel en service");
  const dir = path.join(appsRoot(), path.basename(active.app_dir));
  const dbPath = path.join(dir, "data", "app.db");
  const modified = new Map<string, Set<number>>();
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    for (const r of db.prepare(`SELECT DISTINCT "entity", "record_id" FROM "_audit" WHERE "action" IN ('update', 'delete') AND "entity" IS NOT NULL`).all() as { entity: string; record_id: number }[]) {
      if (!modified.has(r.entity)) modified.set(r.entity, new Set());
      modified.get(r.entity)!.add(Number(r.record_id));
    }
  } finally {
    db.close();
  }
  return reconcileDeployed(active.run_id, dbPath, path.join(dir, "files"), modified);
}
