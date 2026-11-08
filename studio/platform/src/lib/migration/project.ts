import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "../errors";
import { addEvent } from "../store";
import { AUTHORIZATION_DECLARATION } from "../legal";
import { scopedPrincipal, type Principal } from "../auth/principal";
import { detectFormat, FormatError, parseSource, type ArchiveEntry, type ParsedSource, type SourceFormat } from "./formats";
import { profileTables, type SourceProfile } from "./profile";
import { checkMapping, effectiveMapping, MigrationMappingSchema, proposeMapping, reviewItems, type Decision, type MappingIssue, type MigrationMapping } from "./mapping";
import { runMigration, type RunResult, type SourceTableInput } from "./run";
import { verifyMigration, type VerificationReport } from "./verify";
import { ExtractionPlanSchema, runHttpExtraction, type ExtractionOutcome } from "./connectors";
import { redactText, registerCopyScrubber, releaseCredentials, revokeRedeemTokens } from "./credentials";
import { canonical, sha256 } from "./transforms";
import { BusinessModelSchema, checkBusinessModel, type ModelIssue } from "./business-model";
import type { RulePackage } from "../engine/bindings";
import type { RuleModel } from "../types";
import type { HistoryCheck } from "./rules-history";
import { PROJECT_ID, projectScope } from "./context";

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

export interface BusinessModelMeta {
  version: number;
  received_at: string;
  /** analyst (Alan) · fixture (jeu de test au format d'Alan) · investigation (règles du Studio) · user. */
  source: "analyst" | "fixture" | "investigation" | "user";
  by: string;
  sha256: string;
  /** proposed : reçu, à valider · validated : installable dans le logiciel livré · rejected. */
  status: "proposed" | "validated" | "rejected";
  decided_at?: string;
  decided_by?: string;
  comment?: string;
  modules: string[];
  bindings: { id: string; entity: string; scope: string; module: string }[];
  issues: ModelIssue[];
  /** Vérification du modèle sur les documents historiques migrés (dernière exécution). */
  history_check?: HistoryCheck | null;
  published?: { app_id: string; at: string; by: string }[];
}

/**
 * États d'un projet. Ils ne changent qu'à la suite d'une opération réellement effectuée
 * (connexion testée ou rapportée par l'agent, données reçues, migration exécutée et vérifiée…).
 */
export const PROJECT_STATUSES = [
  "CREATED",
  "CONNECTION_PENDING",
  "CONNECTED",
  "DISCOVERING",
  "EXTRACTING",
  "MAPPING",
  "RECONSTRUCTING",
  "MIGRATING",
  "VALIDATING",
  "READY_FOR_REVIEW",
  "PUBLISHED",
  "PAUSED",
  "FAILED",
  "NEEDS_HUMAN_REVIEW",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface MigrationProject {
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  source_system?: string;
  /** Entreprise propriétaire, ancien logiciel (URL, type), informations complémentaires. */
  company?: string;
  legacy_url?: string;
  software_type?: string;
  notes?: string;
  /**
   * Confirmation du propriétaire : il est autorisé à faire analyser et migrer ces données.
   * `by` = identité authentifiée (« Prénom Nom »), `version` = version de la déclaration acceptée
   * (absente pour les projets créés avant les comptes).
   */
  authorization?: { by: string; at: string; statement: string; version?: string };
  connection?: { status: "pending" | "connected" | "failed" | "mfa_required" | "human_needed"; detail?: string; at: string; by: string };
  status?: ProjectStatus;
  status_history?: { status: ProjectStatus; at: string; reason: string }[];
  paused_from?: ProjectStatus | null;
  /** Logiciel livré de ce projet : identifiant et port (attribués à la première mise en service). */
  app?: { id: string; port: number };
  sources: SourceMeta[];
  extraction?: Omit<ExtractionOutcome, "files">;
  mappings: MappingVersion[];
  decisions: Record<string, Decision>;
  runs: RunMeta[];
  acknowledgements: Record<string, { at: string; by: string; comment?: string }>;
  deployments: Deployment[];
  business_models?: BusinessModelMeta[];
}

export const migrationRoot = () => path.join(process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data"), "migration");

/**
 * Plusieurs projets isolés : chacun a son dossier (project.json, sources/, runs/, business-model/).
 * Index : <migration>/projects.json. Le projet unique des versions précédentes reste à sa place
 * (dossier racine) et devient le premier projet de l'index : aucune donnée n'est déplacée.
 */
interface ProjectIndex {
  /** Projet de repli des requêtes sans projet : opérateur et appels internes uniquement (pages historiques). */
  current: string | null;
  /** owner_id : compte propriétaire (absent pour les projets créés avant les comptes : visibles de l'opérateur seulement). */
  projects: { id: string; dir: string; owner_id?: string }[];
}
const g = globalThis as unknown as { __rebornMigration?: { index: ProjectIndex | null; indexStamp?: string | null; root: string; projects: Map<string, MigrationProject>; draft: MigrationProject | null; parsed: Map<string, ParsedSource> } };
const mem = () => {
  const m = (g.__rebornMigration ??= { index: null, indexStamp: null, root: "", projects: new Map(), draft: null, parsed: new Map() });
  if (m.root !== migrationRoot()) Object.assign(m, { index: null, indexStamp: null, root: migrationRoot(), projects: new Map(), draft: null });
  return m;
};
const indexFile = () => path.join(migrationRoot(), "projects.json");
function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}
/** Empreinte du fichier d'index : la CLI de l'opérateur (npm run account) peut le modifier pendant que le Studio tourne. */
function indexStamp(): string | null {
  try {
    const s = fs.statSync(indexFile());
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return null;
  }
}
function readIndex(): ProjectIndex {
  const m = mem();
  const stamp = indexStamp();
  if (m.index && m.indexStamp === stamp) return m.index;
  try {
    m.index = JSON.parse(fs.readFileSync(indexFile(), "utf8")) as ProjectIndex;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // Index présent mais illisible : il n'est JAMAIS remplacé par l'ancien projet unique (les autres
      // projets disparaîtraient). On garde la version en mémoire, sinon on s'arrête sans rien modifier.
      if (m.index) return m.index;
      throw new ApiError(500, "Index des projets illisible (migration/projects.json) : aucune donnée n'a été modifiée, intervention de l'opérateur requise");
    }
    try {
      const legacy = JSON.parse(fs.readFileSync(path.join(migrationRoot(), "project.json"), "utf8")) as MigrationProject;
      m.index = { current: legacy.id, projects: [{ id: legacy.id, dir: "" }] };
      writeAtomic(indexFile(), m.index);
    } catch {
      m.index = { current: null, projects: [] };
    }
  }
  m.indexStamp = indexStamp();
  return m.index!;
}
function writeIndex(idx: ProjectIndex) {
  writeAtomic(indexFile(), idx);
  const m = mem();
  m.index = idx;
  m.indexStamp = indexStamp();
}

/**
 * Projet de la requête (?project=…, [id]) ou, sans portée, projet de repli `current`.
 * Le repli n'existe que pour l'opérateur et pour les appels internes sans principal (chaîne de
 * migration testée en bibliothèque) : un client ou un service doit toujours désigner son projet.
 */
export function currentProjectId(): string | null {
  const scoped = projectScope.getStore();
  if (scoped) {
    if (!readIndex().projects.some((p) => p.id === scoped)) throw new ApiError(404, "Projet introuvable");
    return scoped;
  }
  const who = scopedPrincipal();
  if (who && !(who.kind === "user" && who.role === "operator")) throw new ApiError(400, "Projet requis : précisez ?project=MIG_… (ou l'en-tête x-reborn-project)");
  const current = readIndex().current;
  // Repli de l'opérateur : jamais sur le projet d'un client (rattaché par `npm run account -- assign`) —
  // l'opérateur ne voit que ses projets et ceux sans propriétaire (SPEC §1.3, §3) ; il doit le désigner.
  if (who && current && !fallbackAllowed(who, current)) throw new ApiError(400, "Projet requis : le projet courant appartient à un client ; précisez ?project=MIG_… (ou l'en-tête x-reborn-project)");
  return current;
}

/** Projet de repli utilisable par cet opérateur : le sien, ou un projet sans propriétaire. */
function fallbackAllowed(who: Principal, id: string): boolean {
  const owner = ownerOf(id);
  return owner === undefined || owner === null || (who.kind === "user" && owner === who.userId);
}
export function projectRoot(id: string | null = currentProjectId()): string {
  if (id !== null && !PROJECT_ID.test(id)) throw new ApiError(400, "Identifiant de projet invalide");
  const entry = readIndex().projects.find((p) => p.id === id);
  return entry ? path.join(migrationRoot(), entry.dir) : path.join(migrationRoot(), "projects", id ?? "_");
}

/** Propriétaire d'un projet : identifiant du compte, null si aucun, undefined si le projet est inconnu. */
export function ownerOf(id: string): string | null | undefined {
  const entry = readIndex().projects.find((p) => p.id === id);
  return entry ? (entry.owner_id ?? null) : undefined;
}
export const projectExists = (id: string) => readIndex().projects.some((p) => p.id === id);
/** Projets dont le compte est propriétaire (index en mémoire, relu si la CLI l'a modifié) : vue client de l'état global. */
export const ownedProjectIds = (userId: string): ReadonlySet<string> => new Set(readIndex().projects.filter((p) => p.owner_id === userId).map((p) => p.id));

/** Visibilité d'un projet : client → les siens ; opérateur → les siens + sans propriétaire ; service → tous. */
export function canSeeProject(who: Principal | undefined, owner: string | null | undefined): boolean {
  if (owner === undefined) return false;
  if (!who) return true; // appel interne
  if (who.kind === "service") return true;
  if (who.kind === "user") return owner === who.userId || (who.role === "operator" && owner === null);
  return false;
}
const projectFile = (id?: string | null) => path.join(projectRoot(id), "project.json");
export const runDir = (id: string) => path.join(projectRoot(), "runs", id);

function emptyProject(name = "Migration"): MigrationProject {
  return { id: `MIG_${randomUUID().replace(/-/g, "").slice(0, 8)}`, name, created_at: new Date().toISOString(), sources: [], mappings: [], decisions: {}, runs: [], acknowledgements: {}, deployments: [], status: "CREATED", status_history: [] };
}

/** Projets enregistrés avant la gestion des états : état reconstitué à partir de ce qui a réellement été fait. */
function inferStatus(p: MigrationProject): ProjectStatus {
  const lastRun = p.runs.at(-1);
  if (p.deployments.some((d) => d.status === "active")) return "PUBLISHED";
  if (lastRun) {
    if (lastRun.status === "failed" || lastRun.verification === "blocked") return "FAILED";
    if (lastRun.verification === "review" && !p.acknowledgements[lastRun.id]) return "NEEDS_HUMAN_REVIEW";
    return "READY_FOR_REVIEW";
  }
  if (p.mappings.length) return "MAPPING";
  if (p.sources.length) return "EXTRACTING";
  return p.legacy_url ? "CONNECTION_PENDING" : "CREATED";
}
function normalize(p: MigrationProject): MigrationProject {
  p.business_models ??= [];
  p.status_history ??= [];
  if (!p.status) {
    p.status = inferStatus(p);
    p.status_history.push({ status: p.status, at: new Date().toISOString(), reason: "État reconstitué à partir des opérations déjà effectuées" });
  }
  return p;
}

export function loadProject(id: string): MigrationProject | null {
  const m = mem();
  const cached = m.projects.get(id);
  if (cached) return cached;
  try {
    const p = normalize(JSON.parse(fs.readFileSync(projectFile(id), "utf8")) as MigrationProject);
    m.projects.set(id, p);
    return p;
  } catch {
    return null;
  }
}

export function getProject(): MigrationProject {
  const id = currentProjectId();
  const p = id ? loadProject(id) : null;
  if (p) return p;
  // Aucun projet : projet vide en mémoire, enregistré à la première écriture
  const m = mem();
  m.draft ??= emptyProject();
  return m.draft;
}

function save(p: MigrationProject) {
  const idx = readIndex();
  if (!idx.projects.some((x) => x.id === p.id)) {
    writeIndex({ current: projectScope.getStore() ? (idx.current ?? p.id) : p.id, projects: [...idx.projects, { id: p.id, dir: path.join("projects", p.id) }] });
  }
  p.updated_at = new Date().toISOString();
  writeAtomic(projectFile(p.id), p);
  mem().projects.set(p.id, p);
  if (mem().draft?.id === p.id) mem().draft = null;
}

/** Aucune opération d'écriture sur un projet en pause (contrôle côté serveur). */
export function assertActive(p: MigrationProject = getProject()) {
  if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant toute opération");
}

/** Change l'état du projet (à enregistrer par l'appelant) ; l'historique garde la raison. */
export function setStatus(p: MigrationProject, status: ProjectStatus, reason: string, opts: { resume?: boolean } = {}) {
  if (p.status === "PAUSED" && status !== "PAUSED") {
    if (!opts.resume) return;
    p.paused_from = null;
  }
  if (p.status === status && p.status_history?.at(-1)?.reason === reason) return;
  p.status = status;
  p.status_history = [...(p.status_history ?? []), { status, at: new Date().toISOString(), reason }].slice(-200);
  credentialsFollowStatus(p, status);
}

/** États à partir desquels les identifiants de l'ancien logiciel ne servent plus (SPEC §5, lot B2). */
const CREDENTIALS_RELEASE_STATUSES: ReadonlySet<ProjectStatus> = new Set(["MAPPING", "RECONSTRUCTING", "MIGRATING", "VALIDATING", "READY_FOR_REVIEW", "PUBLISHED"]);

/**
 * Identifiants liés à l'état du projet (lot B2) : pause → jetons de remise révoqués ; étape des
 * correspondances atteinte (ou dépassée) ou mise en service → identifiants effacés (tracé, sans valeur).
 * Les données déjà extraites ne sont jamais touchées. Une erreur ici n'empêche jamais le changement d'état.
 */
function credentialsFollowStatus(p: MigrationProject, status: ProjectStatus) {
  if (!PROJECT_ID.test(p.id)) return;
  try {
    const dir = projectRoot(p.id);
    if (status === "PAUSED") revokeRedeemTokens(dir, "projet mis en pause");
    else if (CREDENTIALS_RELEASE_STATUSES.has(status) || (p.mappings?.length ?? 0) > 0) {
      releaseCredentials(dir, status === "PUBLISHED" ? "logiciel mis en service" : "projet passé à l'étape des correspondances", p.id);
    }
  } catch (e) {
    console.error("[reborn] identifiants (changement d'état du projet) :", (e as Error).message);
  }
}

/**
 * Effacement des identifiants confiés (credentials.ts) : toute copie restée dans project.json — détail du dernier
 * rapport de connexion, raisons de l'historique des états, messages et libellés de l'extraction, notes — est
 * masquée tant que leurs valeurs sont connues en mémoire. Les données métier (sources, correspondances,
 * exécutions) et les références (empreintes, fichiers) ne sont jamais touchées.
 */
registerCopyScrubber("project.json", (id, redact) => {
  const p = loadProject(id);
  if (!p) return;
  let changed = false;
  const fix = (v: string): string => {
    const r = redact(v);
    if (r !== v) changed = true;
    return r;
  };
  if (typeof p.connection?.detail === "string") p.connection.detail = fix(p.connection.detail);
  for (const h of p.status_history ?? []) if (typeof h.reason === "string") h.reason = fix(h.reason);
  if (typeof p.notes === "string") p.notes = fix(p.notes);
  const x = p.extraction;
  if (x) {
    if (typeof x.account === "string") x.account = fix(x.account);
    for (const r of x.results ?? []) {
      if (typeof r.message === "string") r.message = fix(r.message);
      if (typeof r.label === "string") r.label = fix(r.label);
    }
    for (const n of x.not_extractable ?? []) {
      if (typeof n.label === "string") n.label = fix(n.label);
      if (typeof n.reason === "string") n.reason = fix(n.reason);
    }
  }
  if (changed) save(p);
});

/**
 * Journal de migration du projet de la requête (lot B1) : `project_id` fixé par le serveur, au premier
 * niveau (et dans data, pour les lecteurs existants) ; jamais rattaché à une investigation. Sans projet
 * résolu (appel interne sans projet) : évènement de l'équipe seulement (project_id null).
 */
function log(title: string, detail?: string, source: "platform" | "user" | "analyst" | "explorer" = "platform", data?: unknown) {
  let project_id: string | undefined;
  try {
    const id = projectScope.getStore() ?? getProject().id;
    project_id = projectExists(id) ? id : undefined;
  } catch {}
  addEvent({ source, type: "migration", title, detail, project_id: project_id ?? null, data: data && typeof data === "object" ? { ...(data as object), project_id } : data === undefined ? { project_id } : { value: data, project_id } });
}

export interface ProjectInput {
  company: string;
  software?: string;
  legacy_url?: string;
  software_type?: string;
  notes?: string;
  /** La déclaration d'autorisation (lib/legal.ts) a été acceptée : enregistrée avec l'identité authentifiée. */
  authorized?: boolean;
  /** Compatibilité (appels internes sans compte) : ignoré dès qu'un propriétaire authentifié est fourni. */
  authorized_by?: string;
}
/** Texte exact de la déclaration d'autorisation (versionnée : AUTHORIZATION_DECLARATION de lib/legal.ts). */
export const AUTHORIZATION_STATEMENT = AUTHORIZATION_DECLARATION.text;

/** Compte propriétaire d'un nouveau projet : identifiant et nom affiché (« Prénom Nom »). */
export interface ProjectOwner {
  id: string;
  name: string;
}

export const newProjectId = () => `MIG_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

/**
 * Nouveau projet isolé. Propriétaire = compte authentifié (ou aucun pour les appels internes).
 * Ne change PAS le projet de repli (index.current) : chaque requête désigne son projet.
 * L'autorisation est enregistrée avec l'identité authentifiée et la version de la déclaration.
 */
export function createProject(i: ProjectInput, owner: ProjectOwner | null = null, opts: { id?: string } = {}): MigrationProject {
  const p = emptyProject(i.company);
  if (opts.id) {
    if (!PROJECT_ID.test(opts.id) || projectExists(opts.id)) throw new ApiError(409, "Identifiant de projet indisponible");
    p.id = opts.id;
  }
  const by = owner ? owner.name : i.authorized_by?.trim();
  const authorized = owner ? i.authorized === true : i.authorized === true || !!by;
  Object.assign(p, {
    company: i.company,
    source_system: i.software,
    legacy_url: i.legacy_url,
    software_type: i.software_type,
    notes: i.notes,
    authorization: authorized && by ? { by, at: new Date().toISOString(), statement: AUTHORIZATION_DECLARATION.text, version: AUTHORIZATION_DECLARATION.version } : undefined,
    status_history: [],
  });
  setStatus(p, i.legacy_url ? "CONNECTION_PENDING" : "CREATED", i.legacy_url ? "Projet créé : connexion à l'ancien logiciel à établir" : "Projet créé");
  const idx = readIndex();
  writeIndex({ current: idx.current, projects: [...idx.projects, { id: p.id, dir: path.join("projects", p.id), ...(owner ? { owner_id: owner.id } : {}) }] });
  save(p);
  projectScope.run(p.id, () => log(`Projet de migration « ${p.name} » créé`, i.software ? `Logiciel source : ${i.software}` : undefined, "user"));
  return p;
}

/**
 * Compatibilité (POST /api/migration/project, réservé à l'opérateur ; chaîne de migration testée en
 * bibliothèque) : crée un projet isolé et en fait le projet de repli des pages historiques.
 */
export function newProject(name: string, sourceSystem?: string, owner: ProjectOwner | null = null): MigrationProject {
  const p = createProject({ company: name || "Migration", software: sourceSystem }, owner);
  selectProject(p.id);
  return p;
}

export function selectProject(id: string) {
  const idx = readIndex();
  if (!idx.projects.some((p) => p.id === id)) throw new ApiError(404, `Projet inconnu : ${id}`);
  writeIndex({ ...idx, current: id });
}

export function projectIds(): string[] {
  return readIndex().projects.map((p) => p.id);
}

/**
 * Suppression demandée (npm run account -- delete-project, lib/migration/erase.ts) : retire le projet de l'index
 * (et du projet de repli) et du cache en mémoire. Ne supprime aucun fichier : renvoie le dossier du projet
 * (relatif au dossier de migration, "" pour le projet historique à la racine), ou null s'il est inconnu.
 */
export function removeProjectEntry(id: string): { dir: string; owner_id?: string } | null {
  const idx = readIndex();
  const entry = idx.projects.find((p) => p.id === id);
  if (!entry) return null;
  writeIndex({ current: idx.current === id ? null : idx.current, projects: idx.projects.filter((p) => p.id !== id) });
  const m = mem();
  m.projects.delete(id);
  if (m.draft?.id === id) m.draft = null;
  return { dir: entry.dir, ...(entry.owner_id ? { owner_id: entry.owner_id } : {}) };
}

/** Projets dont ce compte est propriétaire (index relu si la ligne de commande l'a modifié). */
export const projectsOwnedBy = (userId: string): string[] => readIndex().projects.filter((p) => p.owner_id === userId).map((p) => p.id);

/** Met à jour un projet désigné (sans changer le projet courant). */
export function updateProject(id: string, fn: (p: MigrationProject) => void): MigrationProject {
  const p = loadProject(id);
  if (!p) throw new ApiError(404, `Projet inconnu : ${id}`);
  fn(p);
  save(p);
  return p;
}

/* ------------------------------------------------------------------ */
/* Sources                                                              */
/* ------------------------------------------------------------------ */

export function addSource(name: string, data: Buffer, origin: SourceMeta["origin"]): SourceMeta {
  assertActive();
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
  const vault = path.join(projectRoot(), "sources", `${digest}.${format}`);
  fs.mkdirSync(path.dirname(vault), { recursive: true });
  if (!fs.existsSync(vault)) fs.writeFileSync(vault, data, { mode: 0o600 });
  mem().parsed.set(digest, parsed);
  const meta: SourceMeta = {
    id: digest.slice(0, 12),
    name,
    format,
    size: data.length,
    sha256: digest,
    vault: path.relative(projectRoot(), vault),
    received_at: new Date().toISOString(),
    origin,
    tables: parsed.tables.map((t) => ({ name: parsed.tables.length === 1 ? name.replace(/\.[^.]+$/, "") : t.name, rows: t.rows.length, columns: t.columns.length })),
    archive_entries: parsed.archive?.length,
    encoding: parsed.encoding,
    warnings: parsed.warnings,
  };
  const p = getProject();
  p.sources = [...p.sources.filter((s) => s.name !== name), meta];
  setStatus(p, "EXTRACTING", `Données reçues : ${name} (${meta.tables.reduce((n, t) => n + t.rows, 0)} ligne(s))`);
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
  const data = fs.readFileSync(path.join(projectRoot(), s.vault));
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
  assertActive();
  const parsed = ExtractionPlanSchema.safeParse(rawPlan);
  if (!parsed.success) throw new ApiError(400, "Plan d'extraction non conforme au contrat", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const plan = parsed.data;
  let outcome: ExtractionOutcome;
  const before = getProject();
  setStatus(before, "EXTRACTING", `Extraction depuis ${plan.system} en cours`);
  save(before);
  try {
    outcome = await runHttpExtraction(plan, { baseUrl: creds.base_url, username: creds.username, password: creds.password });
  } catch (e) {
    // Messages du connecteur déjà sans secret ni URL complète ; masquage par prudence (lot B2).
    const msg = redactText((e as Error).message, [creds.password, creds.username]);
    log(`Extraction refusée par ${plan.system}`, msg, "platform");
    const p = getProject();
    setStatus(p, "FAILED", `Extraction refusée par ${plan.system} : ${msg}`);
    save(p);
    throw new ApiError(502, msg);
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
  const ok = outcome.results.filter((r) => r.status === "ok").length;
  p.connection = { status: "connected", detail: `Connexion par le connecteur HTTP de REBORN (compte ${outcome.account})`, at: new Date().toISOString(), by: "REBORN" };
  setStatus(p, "EXTRACTING", `Extraction terminée : ${ok}/${outcome.results.length} export(s) récupéré(s)`);
  save(p);
  const refused = outcome.results.filter((r) => r.status === "forbidden" || r.status === "unauthorized");
  log(
    `Extraction depuis ${plan.system} : ${ok}/${outcome.results.length} export(s) récupéré(s)`,
    `${refused.length ? `Refusés au compte fourni : ${refused.map((r) => r.label ?? r.id).join(", ")}. ` : ""}Compte ${outcome.account} (mot de passe non conservé).`,
    "platform",
  );
  // Fin réussie d'une extraction : les identifiants confiés ne servent plus (SPEC §5, lot B2).
  releaseCredentials(projectRoot(p.id), "extraction terminée", p.id);
  return summary;
}

/* ------------------------------------------------------------------ */
/* Correspondances                                                      */
/* ------------------------------------------------------------------ */

export function currentMapping(): MappingVersion | null {
  return getProject().mappings.at(-1) ?? null;
}

export function setMapping(raw: unknown, origin: MappingVersion["origin"]): MappingVersion {
  assertActive();
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
  const total = reviewItems(mapping).length;
  const pending = reviewItems(mapping).filter((i) => !p.decisions[i.key]).length;
  setStatus(p, pending ? "NEEDS_HUMAN_REVIEW" : "MAPPING", pending ? pendingReason(v.version, pending) : `Correspondances v${v.version} prêtes`);
  save(p);
  const errors = issues.filter((i) => i.level === "error").length;
  const decided = total - pending;
  log(
    // Origine « user » : correction manuelle (propriétaire ou équipe, lot B4b) — jamais présentée comme venant de l'équipe.
    `Correspondances v${v.version} reçues (${origin === "analyst" ? "Analyste" : origin === "auto" ? "proposition automatique" : origin === "fixture" ? "jeu de test" : "correction manuelle"}) — ${mapping.entities.length} entité(s)`,
    // Total à examiner ET déjà tranchés (décisions reprises de la version précédente) : jamais un total présenté comme un reste.
    `${total} point(s) à examiner${decided ? ` (dont ${decided} déjà tranché${decided > 1 ? "s" : ""})` : ""}${errors ? ` · ${errors} erreur(s) bloquante(s)` : ""}`,
    origin === "analyst" ? "analyst" : "platform",
  );
  return v;
}

/** Identité du nouveau logiciel propre au projet : `<entreprise>-<4 derniers caractères du projet>`, « <entreprise> — nouveau logiciel ». */
export function projectAppIdentity(p: MigrationProject): { id: string; name: string } {
  const base = (p.company ?? p.source_system ?? "logiciel")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "app-$1")
    .slice(0, 28) || "logiciel";
  return { id: `${/^[a-z]/.test(base) ? base : `app-${base}`}-${p.id.slice(-4)}`, name: `${p.company ?? p.source_system ?? "Logiciel"} — nouveau logiciel` };
}

/**
 * Logiciel visé quand le jeu de test au format de l'Analyste est appliqué (?fixture=crm) : celui déjà livré
 * pour CE projet (même identifiant, même nom : mise à jour sans perte de données), sinon l'identité propre au
 * projet (projectAppIdentity, comme la proposition automatique). Jamais l'identifiant écrit dans le fichier du
 * jeu de test (« morel-crm ») : il désignerait pour tous les clients le logiciel livré du premier d'entre eux.
 */
export function fixtureAppTarget(p: MigrationProject = getProject()): { id: string; name: string } {
  const delivered = deliveredApp(p);
  if (!delivered) return projectAppIdentity(p);
  const previous = [...p.mappings].reverse().find((m) => m.mapping.target.id === delivered.id)?.mapping.target;
  return { id: delivered.id, name: previous?.name ?? projectAppIdentity(p).name };
}

export function proposeAutomatic(): MappingVersion {
  const prof = profile();
  if (!prof.tables.length) throw new ApiError(409, "Aucune source : extrayez ou importez des données d'abord");
  const p = getProject();
  return setMapping(proposeMapping(prof, { source_system: p.source_system, target: projectAppIdentity(p) }), "auto");
}

/** Raison de l'état « validation humaine requise » des correspondances : nombre RÉEL de points encore à trancher. */
const pendingReason = (version: number, pending: number) => `Correspondances v${version} : ${pending} point(s) à valider`;

export function decide(key: string, decision: Decision["decision"], by: string, comment?: string) {
  assertActive();
  const m = currentMapping();
  if (!m) throw new ApiError(409, "Aucune correspondance à valider");
  const item = reviewItems(m.mapping).find((i) => i.key === key);
  if (!item) throw new ApiError(404, `Point de validation inconnu : ${key}`);
  const p = getProject();
  p.decisions[key] = { decision, at: new Date().toISOString(), by, comment };
  const pending = reviewItems(m.mapping).filter((i) => !p.decisions[i.key]).length;
  if (!pending) setStatus(p, "MAPPING", "Toutes les correspondances incertaines ont été tranchées : migration possible");
  else {
    // L'état ne change pas (des points restent à trancher) : sa raison est tenue à jour, sans nouvelle entrée
    // d'historique, pour que la barre latérale et le suivi affichent le reste réel et non le total de départ.
    const last = p.status_history?.at(-1);
    if (p.status === "NEEDS_HUMAN_REVIEW" && last?.status === "NEEDS_HUMAN_REVIEW" && new RegExp(`^Correspondances v${m.version} : \\d+ point\\(s\\) à valider$`).test(last.reason)) {
      last.reason = pendingReason(m.version, pending);
    }
  }
  save(p);
  const verb = item.kind === "accounting" ? (decision === "accepted" ? "Protection de l'historique confirmée" : "Protection de l'historique retirée") : decision === "accepted" ? "Correspondance validée" : "Correspondance exclue";
  log(`${verb} : ${item.label}`, comment, "user");
}

/* ------------------------------------------------------------------ */
/* Modèle métier (règles exécutables) — versions immuables              */
/* ------------------------------------------------------------------ */

const bmFile = (version: number) => path.join(projectRoot(), "business-model", `v${version}.json`);

/** Reçoit une version du modèle métier (contrat business_model) : elle est « à valider ». */
export function publishBusinessModel(raw: unknown, source: BusinessModelMeta["source"], by = "Analyste"): BusinessModelMeta {
  assertActive();
  const parsed = BusinessModelSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "Modèle métier non conforme au contrat", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const bm = parsed.data;
  const p = getProject();
  const m = currentMapping();
  const issues = checkBusinessModel(bm, m ? effectiveMapping(m.mapping, p.decisions) : null);
  const version = (p.business_models?.at(-1)?.version ?? 0) + 1;
  const pkg: RulePackage = {
    contract_version: bm.contract_version,
    version,
    modules: bm.modules as Record<string, RuleModel>,
    bindings: bm.bindings,
    source,
    published_at: new Date().toISOString(),
    published_by: by,
    notes: bm.notes,
  };
  fs.mkdirSync(path.dirname(bmFile(version)), { recursive: true });
  fs.writeFileSync(bmFile(version), JSON.stringify(pkg, null, 1));
  const meta: BusinessModelMeta = {
    version,
    received_at: pkg.published_at!,
    source,
    by,
    sha256: sha256(canonical(pkg)),
    status: "proposed",
    modules: Object.keys(bm.modules),
    bindings: bm.bindings.map((b) => ({ id: b.id, entity: b.entity, scope: b.scope, module: b.module })),
    issues,
  };
  p.business_models = [...(p.business_models ?? []), meta];
  save(p);
  const errors = issues.filter((i) => i.level === "error").length;
  log(
    `Modèle métier v${version} reçu (${source === "analyst" ? "Analyste" : source === "fixture" ? "jeu de test au format de l'Analyste" : source === "investigation" ? "règles de l'investigation" : "opérateur"})`,
    `${meta.modules.length} module(s) de règles · ${meta.bindings.length} liaison(s) · à valider${errors ? ` · ${errors} erreur(s) bloquante(s)` : ""}`,
    source === "analyst" ? "analyst" : "platform",
  );
  return meta;
}

export function businessModelPackage(version: number): RulePackage {
  try {
    return JSON.parse(fs.readFileSync(bmFile(version), "utf8")) as RulePackage;
  } catch {
    throw new ApiError(404, `Modèle métier v${version} introuvable`);
  }
}

/** Décision humaine : seule une version validée (sans erreur bloquante) est installée dans le logiciel livré. */
export function decideBusinessModel(version: number, decision: "validated" | "rejected", by: string, comment?: string): BusinessModelMeta {
  assertActive();
  const p = getProject();
  const meta = p.business_models?.find((x) => x.version === version);
  if (!meta) throw new ApiError(404, `Modèle métier v${version} inconnu`);
  if (decision === "validated" && meta.issues.some((i) => i.level === "error")) throw new ApiError(409, `Le modèle métier v${version} contient des erreurs bloquantes : corrigez-le et publiez une nouvelle version`);
  Object.assign(meta, { status: decision, decided_at: new Date().toISOString(), decided_by: by, comment });
  save(p);
  log(`Modèle métier v${version} ${decision === "validated" ? "validé" : "refusé"} par ${by}`, comment, "user");
  return meta;
}

export function validatedBusinessModels(): RulePackage[] {
  return (getProject().business_models ?? []).filter((m) => m.status === "validated").map((m) => businessModelPackage(m.version));
}

export function recordBusinessModel(version: number, patch: Partial<Pick<BusinessModelMeta, "history_check">> & { published?: { app_id: string; at: string; by: string } }) {
  const p = getProject();
  const meta = p.business_models?.find((x) => x.version === version);
  if (!meta) return;
  if (patch.history_check !== undefined) meta.history_check = patch.history_check;
  if (patch.published) meta.published = [...(meta.published ?? []), patch.published];
  save(p);
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
  assertActive();
  const status = planStatus();
  if (!status.can_run || !status.mapping) throw new ApiError(409, `Migration impossible : ${status.blockers.join(" · ")}`, status.blockers);
  const p = getProject();
  const mv = status.mapping;
  const mapping = effectiveMapping(mv.mapping, p.decisions);
  const id = `RUN_${String(p.runs.length + 1).padStart(3, "0")}`;
  const dir = runDir(id);
  const t0 = Date.now();
  setStatus(p, "MIGRATING", `Migration ${id} lancée par ${by}`);
  save(p);
  const { tables, archives } = loadSources();
  const result = runMigration({ runId: id, mapping, tables, archives, outDir: dir, sourceSystem: p.source_system });
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(result, null, 1));
  let report: VerificationReport | null = null;
  if (result.status === "completed") {
    setStatus(p, "VALIDATING", `Migration ${id} terminée : vérification indépendante en cours`);
    save(p);
    report = verify(id, result, mapping);
  }
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
  if (result.status !== "completed") setStatus(p, "FAILED", `Migration ${id} interrompue : ${result.error ?? "erreur"} (aucune donnée partielle conservée ; relancez après correction)`);
  else if (report!.status === "blocked") setStatus(p, "FAILED", `Migration ${id} : contrôles bloquants en échec`);
  else if (report!.status === "review") setStatus(p, "NEEDS_HUMAN_REVIEW", `Migration ${id} : écarts à examiner avant mise en service`);
  else setStatus(p, "READY_FOR_REVIEW", `Migration ${id} vérifiée : prête pour la mise en service`);
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
    sources: p.sources.map((s) => ({ name: s.name, sha256: s.sha256, vault_path: path.join(projectRoot(), s.vault), tables: s.tables })),
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
  assertActive();
  const { report } = runArtifacts(runId);
  if (!report) throw new ApiError(409, "Aucun rapport de vérification");
  if (report.status === "blocked") throw new ApiError(409, "Des contrôles bloquants ont échoué : une intervention est nécessaire avant toute mise en service");
  const p = getProject();
  p.acknowledgements[runId] = { at: new Date().toISOString(), by, comment };
  if (p.runs.at(-1)?.id === runId) setStatus(p, "READY_FOR_REVIEW", `Écarts de ${runId} examinés et acceptés par ${by}`);
  save(p);
  log(`Écarts de ${runId} acceptés par ${by}`, comment ?? `${report.gaps.length} écart(s) documenté(s) dans le rapport`, "user");
}

export function recordDeployment(d: Deployment, app?: { id: string; port: number }) {
  const p = getProject();
  for (const x of p.deployments) if (x.status === "active") x.status = "replaced";
  p.deployments.push(d);
  if (app) p.app = app;
  save(p);
}

// Dossiers lus à l'exécution (logiciels générés) : exclus du traçage du build
export const appsRoot = () => process.env.REBORN_APPS_DIR ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "generated");

/**
 * Logiciel livré du projet : celui enregistré à la mise en service, sinon celui de la dernière
 * mise en service active, lu dans sa spécification (projets livrés avant l'enregistrement de `app`).
 */
export function deliveredApp(p: MigrationProject): { id: string; port: number } | null {
  if (p.app) return p.app;
  const active = [...p.deployments].reverse().find((d) => d.status === "active");
  if (!active) return null;
  const id = path.basename(active.app_dir);
  try {
    const port = Number(JSON.parse(fs.readFileSync(path.join(appsRoot(), id, "app.json"), "utf8")).app.port);
    return port ? { id, port } : null;
  } catch {
    return null;
  }
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

/**
 * Résumé du projet de la requête ou du projet de repli. Sans projet désigné, le repli n'existe que
 * pour l'opérateur et les appels internes : null pour un client ou un service (rien à résumer).
 */
export function migrationSummary(): MigrationSummary | null {
  if (!projectScope.getStore()) {
    const who = scopedPrincipal();
    if (who && !(who.kind === "user" && who.role === "operator")) return null;
    // Projet courant rattaché à un client : jamais résumé pour l'équipe (voir currentProjectId)
    const current = readIndex().current;
    if (who && current && !fallbackAllowed(who, current)) return null;
  }
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

/** Transition d'état du projet courant (opérations du générateur, rapports des agents). */
export function transition(status: ProjectStatus, reason: string) {
  const p = getProject();
  setStatus(p, status, reason);
  save(p);
}

/* ------------------------------------------------------------------ */
/* Résumés des projets (tableau de bord)                                */
/* ------------------------------------------------------------------ */

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  CREATED: "Créé",
  CONNECTION_PENDING: "Connexion en attente",
  CONNECTED: "Connecté",
  DISCOVERING: "Découverte en cours",
  EXTRACTING: "Données en cours de récupération",
  MAPPING: "Correspondances",
  RECONSTRUCTING: "Reconstruction",
  MIGRATING: "Migration en cours",
  VALIDATING: "Vérification en cours",
  READY_FOR_REVIEW: "Prêt pour la mise en service",
  PUBLISHED: "Logiciel livré",
  PAUSED: "En pause",
  FAILED: "Échec — intervention requise",
  NEEDS_HUMAN_REVIEW: "Validation humaine requise",
};

export interface ProjectSummary {
  id: string;
  name: string;
  company: string | null;
  software: string | null;
  legacy_url: string | null;
  status: ProjectStatus;
  status_label: string;
  status_reason: string | null;
  created_at: string;
  updated_at: string | null;
  /** Avancement mesuré sur les étapes réellement accomplies (pas un minuteur). */
  progress: { done: number; total: number; steps: { id: string; label: string; done: boolean }[] };
  data: { sources: number; source_rows: number; imported: number; rejected: number };
  anomalies: { pending_decisions: number; gaps: number; failed_checks: number };
  business_model: { version: number; status: string } | null;
  app: { id: string; port: number; deployed_at: string; run_id: string } | null;
}

/** Résumé calculé à partir de ce qui a réellement été fait dans le projet. */
export function projectSummary(id: string): ProjectSummary | null {
  const p = loadProject(id);
  if (!p) return null;
  const lastRun = p.runs.at(-1);
  const mv = p.mappings.at(-1);
  const pending = mv ? reviewItems(mv.mapping).filter((i) => !p.decisions[i.key]).length : 0;
  const mappingErrors = mv ? mv.issues.filter((i) => i.level === "error").length : 0;
  const active = [...p.deployments].reverse().find((d) => d.status === "active") ?? null;
  const app = deliveredApp(p);
  const bm = [...(p.business_models ?? [])].reverse().find((m) => m.status === "validated") ?? p.business_models?.at(-1) ?? null;
  let gaps = 0;
  let failed = 0;
  if (lastRun?.status === "completed") {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(projectRoot(id), "runs", lastRun.id, "report.json"), "utf8")) as VerificationReport;
      gaps = report.gaps.length;
      failed = report.checks.filter((c) => c.status === "fail").length;
    } catch {}
  }
  const migrated = !!lastRun && lastRun.status === "completed" && (lastRun.verification === "validated" || (lastRun.verification === "review" && !!p.acknowledgements[lastRun.id]));
  const steps = [
    { id: "connection", label: "Connexion à l'ancien logiciel", done: p.connection?.status === "connected" || p.sources.length > 0 },
    { id: "extraction", label: "Données récupérées", done: p.sources.length > 0 },
    { id: "mapping", label: "Correspondances validées", done: !!mv && pending === 0 && mappingErrors === 0 },
    { id: "migration", label: "Migration vérifiée", done: migrated },
    { id: "rules", label: "Modèle métier validé", done: (p.business_models ?? []).some((m) => m.status === "validated") },
    { id: "delivery", label: "Nouveau logiciel livré", done: !!active },
  ];
  const status = p.status ?? inferStatus(p);
  return {
    id: p.id,
    name: p.name,
    company: p.company ?? null,
    software: p.source_system ?? null,
    legacy_url: p.legacy_url ?? null,
    status,
    status_label: STATUS_LABEL[status],
    status_reason: p.status_history?.at(-1)?.reason ?? null,
    created_at: p.created_at,
    updated_at: p.updated_at ?? null,
    progress: { done: steps.filter((s) => s.done).length, total: steps.length, steps },
    data: {
      sources: p.sources.length,
      source_rows: p.sources.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows, 0), 0),
      imported: lastRun?.summary.imported ?? 0,
      rejected: lastRun?.summary.rejected ?? 0,
    },
    anomalies: { pending_decisions: pending, gaps, failed_checks: failed },
    business_model: bm ? { version: bm.version, status: bm.status } : null,
    app: active && app ? { id: app.id, port: app.port, deployed_at: active.at, run_id: active.run_id } : null,
  };
}

/** Projets visibles par le principal (SPEC §3) ; sans principal (appel interne) : tous. */
export function listProjects(who: Principal | undefined = scopedPrincipal()): ProjectSummary[] {
  return readIndex()
    .projects.filter((e) => canSeeProject(who, e.owner_id ?? null))
    .map((e) => projectSummary(e.id))
    .filter((x): x is ProjectSummary => !!x)
    .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
}
