import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "../http";
import { addEvent } from "../store";
import { detectFormat, FormatError, parseSource, type ArchiveEntry, type ParsedSource, type SourceFormat } from "./formats";
import { profileTables, type SourceProfile } from "./profile";
import { checkMapping, effectiveMapping, MigrationMappingSchema, proposeMapping, reviewItems, type Decision, type MappingIssue, type MigrationMapping } from "./mapping";
import { runMigration, type RunResult, type SourceTableInput } from "./run";
import { verifyMigration, type VerificationReport } from "./verify";
import { ExtractionPlanSchema, runHttpExtraction, type ExtractionOutcome } from "./connectors";
import { canonical, sha256 } from "./transforms";

/**
 * Projet de migration : coffre des fichiers extraits (empreintes), structure analysée,
 * versions des correspondances, décisions humaines, exécutions et rapports de vérification.
 * Stockage : <REBORN_DATA_DIR>/migration/ (project.json, sources/, runs/).
 */

export interface SourceMeta {
  id: string;
  name: string;
  format: SourceFormat;
  size: number;
  sha256: string;
  vault: string;
  received_at: string;
  origin: { kind: "upload" | "http_export" | "api"; mechanism?: string; url?: string; by?: string };
  tables: { name: string; rows: number; columns: number }[];
  archive_entries?: number;
  encoding?: string;
  warnings: string[];
}

export interface MappingVersion {
  version: number;
  origin: "auto" | "analyst" | "user" | "fixture";
  received_at: string;
  sha256: string;
  mapping: MigrationMapping;
  issues: MappingIssue[];
}

export interface RunMeta {
  id: string;
  at: string;
  by: string;
  mapping_version: number;
  status: RunResult["status"];
  error?: string;
  verification: VerificationReport["status"] | null;
  summary: { imported: number; rejected: number; source_rows: number; attachments: number; duration_ms: number };
}

export interface Deployment {
  id: string;
  at: string;
  by: string;
  run_id: string;
  app_dir: string;
  backup: string | null;
  status: "active" | "replaced" | "rolled_back";
}

export interface MigrationProject {
  id: string;
  name: string;
  created_at: string;
  source_system?: string;
  sources: SourceMeta[];
  extraction?: Omit<ExtractionOutcome, "files">;
  mappings: MappingVersion[];
  decisions: Record<string, Decision>;
  runs: RunMeta[];
  acknowledgements: Record<string, { at: string; by: string; comment?: string }>;
  deployments: Deployment[];
}

export const migrationRoot = () => path.join(process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data"), "migration");
const projectFile = () => path.join(migrationRoot(), "project.json");
export const runDir = (id: string) => path.join(migrationRoot(), "runs", id);

const g = globalThis as unknown as { __rebornMigration?: { project: MigrationProject | null; parsed: Map<string, ParsedSource> } };
const mem = () => (g.__rebornMigration ??= { project: null, parsed: new Map() });

function emptyProject(name = "Migration"): MigrationProject {
  return { id: `MIG_${randomUUID().slice(0, 8)}`, name, created_at: new Date().toISOString(), sources: [], mappings: [], decisions: {}, runs: [], acknowledgements: {}, deployments: [] };
}

export function getProject(): MigrationProject {
  const m = mem();
  if (!m.project) {
    try {
      m.project = JSON.parse(fs.readFileSync(projectFile(), "utf8")) as MigrationProject;
    } catch {
      m.project = emptyProject();
    }
  }
  return m.project;
}

function save(p: MigrationProject) {
  fs.mkdirSync(migrationRoot(), { recursive: true });
  const tmp = `${projectFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p, null, 1));
  fs.renameSync(tmp, projectFile());
  mem().project = p;
}

function log(title: string, detail?: string, source: "platform" | "user" | "analyst" | "explorer" = "platform", data?: unknown) {
  addEvent({ source, type: "migration", title, detail, data });
}

/** Nouveau projet : les fichiers et exécutions précédents sont conservés sur disque, non référencés. */
export function newProject(name: string, sourceSystem?: string): MigrationProject {
  const p = { ...emptyProject(name || "Migration"), source_system: sourceSystem };
  save(p);
  mem().parsed.clear();
  log(`Projet de migration « ${p.name} » créé`, sourceSystem ? `Logiciel source : ${sourceSystem}` : undefined, "user");
  return p;
}

/* ------------------------------------------------------------------ */
/* Sources                                                              */
/* ------------------------------------------------------------------ */

export function addSource(name: string, data: Buffer, origin: SourceMeta["origin"]): SourceMeta {
  if (!/^[\w .()-]{1,120}$/.test(name)) throw new ApiError(400, `Nom de fichier refusé : ${name}`);
  const format = detectFormat(name, data);
  let parsed: ParsedSource;
  try {
    parsed = parseSource(name, data, format);
  } catch (e) {
    if (e instanceof FormatError) throw new ApiError(422, `${name} : ${e.message}`);
    throw e;
  }
  const digest = sha256(data);
  const vault = path.join(migrationRoot(), "sources", `${digest}.${format}`);
  fs.mkdirSync(path.dirname(vault), { recursive: true });
  if (!fs.existsSync(vault)) fs.writeFileSync(vault, data, { mode: 0o600 });
  mem().parsed.set(digest, parsed);
  const meta: SourceMeta = {
    id: digest.slice(0, 12),
    name,
    format,
    size: data.length,
    sha256: digest,
    vault: path.relative(migrationRoot(), vault),
    received_at: new Date().toISOString(),
    origin,
    tables: parsed.tables.map((t) => ({ name: parsed.tables.length === 1 ? name.replace(/\.[^.]+$/, "") : t.name, rows: t.rows.length, columns: t.columns.length })),
    archive_entries: parsed.archive?.length,
    encoding: parsed.encoding,
    warnings: parsed.warnings,
  };
  const p = getProject();
  p.sources = [...p.sources.filter((s) => s.name !== name), meta];
  save(p);
  return meta;
}

export function removeSource(id: string) {
  const p = getProject();
  p.sources = p.sources.filter((s) => s.id !== id);
  save(p);
}

function parsedOf(s: SourceMeta, fresh = false): ParsedSource {
  const cached = !fresh && mem().parsed.get(s.sha256);
  if (cached) return cached;
  const data = fs.readFileSync(path.join(migrationRoot(), s.vault));
  const parsed = parseSource(s.name, data, s.format);
  if (!fresh) mem().parsed.set(s.sha256, parsed);
  return parsed;
}

/** Tables et archives lues depuis le coffre (`fresh` : relecture complète, sans cache). */
export function loadSources(fresh = false): { tables: Map<string, SourceTableInput>; archives: Map<string, ArchiveEntry[]> } {
  const tables = new Map<string, SourceTableInput>();
  const archives = new Map<string, ArchiveEntry[]>();
  for (const s of getProject().sources) {
    const parsed = parsedOf(s, fresh);
    if (parsed.archive) archives.set(s.name, parsed.archive);
    parsed.tables.forEach((t, i) => {
      let name = s.tables[i]?.name ?? t.name;
      while (tables.has(name)) name += "_2";
      tables.set(name, { ...t, name, file: s.name, file_sha256: s.sha256 });
    });
  }
  return { tables, archives };
}

export function profile(): SourceProfile {
  const { tables } = loadSources();
  const prof = profileTables([...tables.values()].map((t) => ({ ...t, source_file: t.file })));
  return prof;
}

/* ------------------------------------------------------------------ */
/* Extraction autorisée                                                 */
/* ------------------------------------------------------------------ */

export async function extract(rawPlan: unknown, creds: { base_url?: string; username?: string; password?: string }, by = "opérateur"): Promise<Omit<ExtractionOutcome, "files">> {
  const parsed = ExtractionPlanSchema.safeParse(rawPlan);
  if (!parsed.success) throw new ApiError(400, "Plan d'extraction non conforme au contrat", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const plan = parsed.data;
  let outcome: ExtractionOutcome;
  try {
    outcome = await runHttpExtraction(plan, { baseUrl: creds.base_url, username: creds.username, password: creds.password });
  } catch (e) {
    log(`Extraction refusée par ${plan.system}`, (e as Error).message, "platform");
    throw new ApiError(502, (e as Error).message);
  }
  for (const f of outcome.files) {
    try {
      addSource(f.name, f.data, { kind: "http_export", mechanism: f.mechanism, url: f.url, by });
    } catch (e) {
      const r = outcome.results.find((x) => x.id === f.mechanism);
      if (r) Object.assign(r, { status: "error", message: (e as Error).message });
    }
  }
  const { files: _files, ...summary } = outcome;
  const p = getProject();
  p.extraction = summary;
  p.source_system ??= plan.system;
  save(p);
  const ok = outcome.results.filter((r) => r.status === "ok").length;
  const refused = outcome.results.filter((r) => r.status === "forbidden" || r.status === "unauthorized");
  log(
    `Extraction depuis ${plan.system} : ${ok}/${outcome.results.length} export(s) récupéré(s)`,
    `${refused.length ? `Refusés au compte fourni : ${refused.map((r) => r.label ?? r.id).join(", ")}. ` : ""}Compte ${outcome.account} (mot de passe non conservé).`,
    "platform",
  );
  return summary;
}

/* ------------------------------------------------------------------ */
/* Correspondances                                                      */
/* ------------------------------------------------------------------ */

export function currentMapping(): MappingVersion | null {
  return getProject().mappings.at(-1) ?? null;
}

export function setMapping(raw: unknown, origin: MappingVersion["origin"]): MappingVersion {
  const parsed = MigrationMappingSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Correspondances non conformes au contrat", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const mapping = parsed.data;
  const { archives } = loadSources();
  const issues = checkMapping(mapping, profile(), [...archives.keys()]);
  const p = getProject();
  const v: MappingVersion = { version: (p.mappings.at(-1)?.version ?? 0) + 1, origin, received_at: new Date().toISOString(), sha256: sha256(canonical(mapping)), mapping, issues };
  // Les décisions déjà prises restent valables pour les éléments inchangés
  const items = new Set(reviewItems(mapping).map((i) => i.key));
  p.decisions = Object.fromEntries(Object.entries(p.decisions).filter(([k]) => items.has(k)));
  p.mappings.push(v);
  save(p);
  const errors = issues.filter((i) => i.level === "error").length;
  log(
    `Correspondances v${v.version} reçues (${origin === "analyst" ? "Analyste" : origin === "auto" ? "proposition automatique" : origin === "fixture" ? "jeu de test" : "opérateur"}) — ${mapping.entities.length} entité(s)`,
    `${reviewItems(mapping).length} point(s) à valider${errors ? ` · ${errors} erreur(s) bloquante(s)` : ""}`,
    origin === "analyst" ? "analyst" : "platform",
  );
  return v;
}

export function proposeAutomatic(): MappingVersion {
  const prof = profile();
  if (!prof.tables.length) throw new ApiError(409, "Aucune source : extrayez ou importez des données d'abord");
  const p = getProject();
  return setMapping(proposeMapping(prof, { source_system: p.source_system, target: { id: "nouveau-logiciel", name: `${p.source_system ?? "Logiciel"} — nouvelle version` } }), "auto");
}

export function decide(key: string, decision: Decision["decision"], by: string, comment?: string) {
  const m = currentMapping();
  if (!m) throw new ApiError(409, "Aucune correspondance à valider");
  const item = reviewItems(m.mapping).find((i) => i.key === key);
  if (!item) throw new ApiError(404, `Point de validation inconnu : ${key}`);
  const p = getProject();
  p.decisions[key] = { decision, at: new Date().toISOString(), by, comment };
  save(p);
  log(`${decision === "accepted" ? "Correspondance validée" : "Correspondance exclue"} : ${item.label}`, comment, "user");
}

export function planStatus() {
  const m = currentMapping();
  const p = getProject();
  if (!m) return { mapping: null, items: [], pending: 0, errors: [], can_run: false, blockers: ["Aucune correspondance reçue"] };
  const items = reviewItems(m.mapping).map((i) => ({ ...i, decision: p.decisions[i.key] ?? null }));
  const pending = items.filter((i) => !i.decision).length;
  const errors = m.issues.filter((i) => i.level === "error");
  const blockers = [...(pending ? [`${pending} correspondance(s) incertaine(s) à valider ou exclure`] : []), ...errors.map((e) => `${e.path} : ${e.message}`)];
  return { mapping: m, items, pending, errors, can_run: !blockers.length && p.sources.length > 0, blockers };
}

/* ------------------------------------------------------------------ */
/* Exécution + vérification                                             */
/* ------------------------------------------------------------------ */

export function unmappedTables(mapping: MigrationMapping): { name: string; rows: number }[] {
  const { tables } = loadSources();
  const used = new Set([...mapping.entities.map((e) => e.source.table), ...(mapping.attachments ?? []).map((a) => a.source.table), ...(mapping.excluded_sources ?? []).map((x) => x.table)]);
  return [...tables.values()].filter((t) => !used.has(t.name)).map((t) => ({ name: t.name, rows: t.rows.length }));
}

export function startRun(by = "opérateur"): { run: RunMeta; report: VerificationReport | null } {
  const status = planStatus();
  if (!status.can_run || !status.mapping) throw new ApiError(409, `Migration impossible : ${status.blockers.join(" · ")}`, status.blockers);
  const p = getProject();
  const mv = status.mapping;
  const mapping = effectiveMapping(mv.mapping, p.decisions);
  const id = `RUN_${String(p.runs.length + 1).padStart(3, "0")}`;
  const dir = runDir(id);
  const t0 = Date.now();
  const { tables, archives } = loadSources();
  const result = runMigration({ runId: id, mapping, tables, archives, outDir: dir, sourceSystem: p.source_system });
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(result, null, 1));
  let report: VerificationReport | null = null;
  if (result.status === "completed") report = verify(id, result, mapping);
  const meta: RunMeta = {
    id,
    at: result.started_at,
    by,
    mapping_version: mv.version,
    status: result.status,
    error: result.error,
    verification: report?.status ?? null,
    summary: {
      imported: result.entities.reduce((n, e) => n + e.imported, 0),
      rejected: result.entities.reduce((n, e) => n + e.rejected, 0),
      source_rows: result.entities.reduce((n, e) => n + e.source_rows, 0),
      attachments: result.attachments.stored,
      duration_ms: Date.now() - t0,
    },
  };
  p.runs.push(meta);
  save(p);
  log(
    result.status === "completed" ? `Migration ${id} : ${meta.summary.imported} enregistrement(s) importé(s), ${meta.summary.rejected} rejeté(s)` : `Migration ${id} interrompue`,
    result.status === "completed" ? `Vérification : ${statusLabel(report!.status)} · ${report!.checks.filter((c) => c.status === "pass").length}/${report!.checks.length} contrôle(s) réussis` : result.error,
    "platform",
    { run_id: id },
  );
  return { run: meta, report };
}

export const statusLabel = (s: VerificationReport["status"]) => (s === "validated" ? "migration validée" : s === "review" ? "validation humaine requise" : "intervention requise");

function verify(id: string, result: RunResult, mapping: MigrationMapping, modified?: Map<string, Set<number>>, dbPath?: string, filesDir?: string): VerificationReport {
  const p = getProject();
  const fresh = loadSources(true);
  const refused = (p.extraction?.results ?? []).filter((r) => r.status !== "ok").map((r) => ({ id: r.id, label: r.label, url: r.url, reason: r.status === "forbidden" ? `accès refusé au compte fourni (HTTP ${r.http})` : r.message ?? r.status }));
  const notExtractable = (p.extraction?.not_extractable ?? []).map((n) => ({ id: n.label, label: n.label, reason: n.reason }));
  const excludedItems = Object.entries(p.decisions)
    .filter(([, d]) => d.decision === "excluded")
    .map(([key, d]) => ({ key, label: reviewItems(currentMapping()!.mapping).find((i) => i.key === key)?.label ?? key, comment: d.comment }));
  const report = verifyMigration({
    mapping,
    tables: fresh.tables,
    archives: fresh.archives,
    run: result,
    dbPath: dbPath ?? result.db_path,
    filesDir: filesDir ?? result.files_dir,
    sources: p.sources.map((s) => ({ name: s.name, sha256: s.sha256, vault_path: path.join(migrationRoot(), s.vault), tables: s.tables })),
    manifest: p.extraction?.manifest ?? null,
    inaccessible: [...refused, ...notExtractable],
    excluded: excludedItems,
    unmappedTables: unmappedTables(mapping),
    modifiedAfterMigration: modified,
  });
  fs.writeFileSync(path.join(runDir(id), dbPath ? "reconciliation.json" : "report.json"), JSON.stringify(report, null, 1));
  return report;
}

/** Réconciliation après mise en service : la base en production est relue et recomparée à la source. */
export function reconcileDeployed(runId: string, dbPath: string, filesDir: string, modified: Map<string, Set<number>>): VerificationReport {
  const { result, mapping } = runArtifacts(runId);
  const report = verify(runId, result, mapping, modified, dbPath, filesDir);
  log(`Réconciliation du logiciel en service (${runId}) : ${statusLabel(report.status)}`, `${report.checks.filter((c) => c.status === "pass").length}/${report.checks.length} contrôle(s) réussis`);
  return report;
}

export function runArtifacts(id: string): { result: RunResult; report: VerificationReport | null; reconciliation: VerificationReport | null; mapping: MigrationMapping; meta: RunMeta } {
  const p = getProject();
  const meta = p.runs.find((r) => r.id === id);
  if (!meta) throw new ApiError(404, `Exécution inconnue : ${id}`);
  const read = <T,>(f: string): T | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(runDir(id), f), "utf8")) as T;
    } catch {
      return null;
    }
  };
  const mv = p.mappings.find((m) => m.version === meta.mapping_version);
  if (!mv) throw new ApiError(404, `Correspondances v${meta.mapping_version} introuvables`);
  return { result: read<RunResult>("run.json")!, report: read<VerificationReport>("report.json"), reconciliation: read<VerificationReport>("reconciliation.json"), mapping: effectiveMapping(mv.mapping, p.decisions), meta };
}

export function acknowledge(runId: string, by: string, comment?: string) {
  const { report } = runArtifacts(runId);
  if (!report) throw new ApiError(409, "Aucun rapport de vérification");
  if (report.status === "blocked") throw new ApiError(409, "Des contrôles bloquants ont échoué : une intervention est nécessaire avant toute mise en service");
  const p = getProject();
  p.acknowledgements[runId] = { at: new Date().toISOString(), by, comment };
  save(p);
  log(`Écarts de ${runId} acceptés par ${by}`, comment ?? `${report.gaps.length} écart(s) documenté(s) dans le rapport`, "user");
}

export function recordDeployment(d: Deployment) {
  const p = getProject();
  for (const x of p.deployments) if (x.status === "active") x.status = "replaced";
  p.deployments.push(d);
  save(p);
}

export function markRolledBack(id: string) {
  const p = getProject();
  const d = p.deployments.find((x) => x.id === id);
  if (d) d.status = "rolled_back";
  const prev = [...p.deployments].reverse().find((x) => x.id !== id && x.status === "replaced");
  if (prev) prev.status = "active";
  save(p);
}

export function migrationLog(title: string, detail?: string) {
  log(title, detail);
}

/** Résumé léger, diffusé avec l'état du Studio (navigation, tableau de bord). */
export interface MigrationSummary {
  name: string;
  source_system: string | null;
  sources: number;
  rows: number;
  mapping_version: number | null;
  pending: number;
  last_run: { id: string; status: RunMeta["status"]; verification: RunMeta["verification"]; imported: number; rejected: number } | null;
  deployed: { run_id: string; at: string } | null;
}

export function migrationSummary(): MigrationSummary {
  const p = getProject();
  const r = p.runs.at(-1);
  const d = [...p.deployments].reverse().find((x) => x.status === "active");
  const plan = planStatus();
  return {
    name: p.name,
    source_system: p.source_system ?? null,
    sources: p.sources.length,
    rows: p.sources.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows, 0), 0),
    mapping_version: plan.mapping?.version ?? null,
    pending: plan.pending,
    last_run: r ? { id: r.id, status: r.status, verification: r.verification, imported: r.summary.imported, rejected: r.summary.rejected } : null,
    deployed: d ? { run_id: d.run_id, at: d.at } : null,
  };
}
