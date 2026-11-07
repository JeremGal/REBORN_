import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ApiError } from "../http";
import type { EntityMap, MigrationMapping } from "./mapping";
import { buildDdl } from "./model";
import { getProject, markRolledBack, migrationLog, reconcileDeployed, recordDeployment, runArtifacts, runDir, statusLabel, type Deployment } from "./project";
import type { VerificationReport } from "./verify";

/**
 * Générateur du logiciel livré : spécification (app.json) déduite des correspondances
 * validées + runtime générique autonome (platform/runtime) + base migrée.
 * Résultat : generated/<id>/, lançable seul avec `node server.mjs`, sans REBORN Studio.
 */

export const SPEC_VERSION = "1.0";
// Dossiers lus à l'exécution (gabarit du runtime, logiciels générés) : exclus du traçage du build
export const appsRoot = () => process.env.REBORN_APPS_DIR ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "generated");
const runtimeDir = () => path.join(/* turbopackIgnore: true */ process.cwd(), "runtime");
export const appPort = () => Number(process.env.CRM_PORT ?? 5050);

export interface AppSpec {
  spec_version: string;
  app: { id: string; name: string; tagline: string; currency: string; locale: string; generated_at: string; generator: string; source_system?: string; migration_run: string; port: number };
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
  }[];
  navigation: { entity: string }[];
  dashboard: { cards: { label: string; entity: string; kind: "count" | "sum"; field?: string }[]; breakdowns: { label: string; entity: string; field: string }[] };
  ddl: string[];
}

export function buildAppSpec(m: MigrationMapping, opts: { runId: string; sourceSystem?: string; port?: number }): AppSpec {
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

export function writeApp(spec: AppSpec, dir: string) {
  copyDir(runtimeDir(), dir);
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(spec, null, 1));
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

const procs = ((globalThis as unknown as { __rebornApps?: Map<string, ChildProcess> }).__rebornApps ??= new Map());

async function health(port: number): Promise<{ ok: boolean; app?: string } | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    return r.ok ? ((await r.json()) as { ok: boolean; app?: string }) : null;
  } catch {
    return null;
  }
}

export async function startApp(appId: string): Promise<void> {
  const dir = path.join(appsRoot(), appId);
  if (!fs.existsSync(path.join(dir, "server.mjs"))) throw new ApiError(404, "Logiciel non généré");
  const port = appPort();
  const running = await health(port);
  if (running) {
    if (running.app === appId) return;
    throw new ApiError(409, `Le port ${port} est déjà utilisé par une autre application`);
  }
  const log = fs.openSync(path.join(dir, "app.log"), "a");
  const env = { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1" } as unknown as NodeJS.ProcessEnv;
  const child: ChildProcess = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: dir, env, stdio: ["ignore", log, log] });
  procs.set(appId, child);
  child.on("exit", () => procs.get(appId) === child && procs.delete(appId));
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if ((await health(port))?.app === appId) return;
    if (child.exitCode !== null) break;
  }
  throw new ApiError(500, `Le logiciel ne démarre pas (voir ${path.relative(path.resolve(process.cwd(), ".."), path.join(dir, "app.log"))})`);
}

export async function stopApp(appId: string): Promise<boolean> {
  const child = procs.get(appId);
  if (!child) return false;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(resolve, 3000);
  });
  procs.delete(appId);
  return true;
}

export async function appStatus() {
  const p = getProject();
  const active = [...p.deployments].reverse().find((d) => d.status === "active") ?? null;
  const id = active ? path.basename(active.app_dir) : null;
  const h = await health(appPort());
  return {
    deployment: active,
    app_id: id,
    url: `http://127.0.0.1:${appPort()}`,
    running: !!h && h.app === id,
    managed: id ? procs.has(id) : false,
    port_used_by_other: !!h && h.app !== id,
    credentials_file: id ? path.join("generated", id, ".secrets", "admin.json") : null,
  };
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
  const { report, mapping, meta } = runArtifacts(runId);
  const p = getProject();
  if (!report) throw new ApiError(409, "Exécution sans rapport de vérification");
  if (report.status === "blocked") throw new ApiError(409, `Mise en service refusée : ${statusLabel(report.status)} (contrôles bloquants en échec)`);
  if (report.status === "review" && !p.acknowledgements[runId]) throw new ApiError(409, "Mise en service refusée : les écarts du rapport doivent d'abord être examinés et acceptés par un responsable");
  const appId = mapping.target.id;
  const dir = path.join(appsRoot(), appId);
  const dbPath = path.join(dir, "data", "app.db");
  const activity = userActivity(dbPath);
  if (activity && !opts.force) {
    throw new ApiError(409, `Le logiciel en service contient ${activity} modification(s) faite(s) par ses utilisateurs : une nouvelle mise en service remplacerait la base. Confirmez explicitement (une sauvegarde sera faite).`);
  }
  const wasManaged = await stopApp(appId);
  const h = await health(appPort());
  if (h?.app === appId) throw new ApiError(409, `Le logiciel tourne hors de REBORN Studio : arrêtez-le (npm run crm) avant la mise en service`);

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
  writeApp(buildAppSpec(mapping, { runId, sourceSystem: p.source_system }), dir);
  const deployment: Deployment = { id: `DEP_${randomUUID().slice(0, 8)}`, at: new Date().toISOString(), by, run_id: runId, app_dir: path.relative(path.resolve(process.cwd(), ".."), dir), backup: backup ? path.basename(backup) : null, status: "active" };
  recordDeployment(deployment);
  await startApp(appId);
  migrationLog(`Nouveau logiciel « ${mapping.target.name} » mis en service (${runId})`, `${meta.summary.imported} enregistrement(s) migré(s) · ${backup ? "base précédente sauvegardée" : "première mise en service"}${wasManaged ? " · redémarré" : ""}`);
  return { deployment, url: `http://127.0.0.1:${appPort()}`, report };
}

export async function rollback(deploymentId: string, by: string) {
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
