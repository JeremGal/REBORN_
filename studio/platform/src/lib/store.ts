import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { compareAll, compareOne, diffModels } from "./compare";
import { resolveApp, type ResolvedApp } from "./appschema";
import { formatMoney } from "./engine/describe";
import { PROJECT_ID, projectScope } from "./migration/context";
import { eventProject, observationProject, type ScopedEvent, type ScopedModel, type ScopedObservation, type ScopedSchema } from "./visibility";
import type { AgentEvent, AppSchema, Investigation, Issue, Observation, RebornState, RuleModel, StoredRuleModel, StoredSchema } from "./types";

/**
 * Store en mémoire (process Node unique) + persistance JSON dans .data/.
 * Toutes les écritures passent par ce module, qui diffuse chaque mutation
 * aux clients connectés en SSE (/api/stream). Les entrées sont validées en amont
 * par lib/service.ts.
 *
 * Isolation des clients (lot B1) : chaque écriture est rattachée à un projet PAR LE SERVEUR, jamais
 * d'après le corps reçu — portée de la requête (projectScope, posée par handler() après contrôle
 * d'accès), sinon projet de l'investigation. Le journal de migration n'est jamais rattaché à une
 * investigation. Chaque projet a sa propre investigation en cours (clôture par projet) ; l'investigation
 * active « globale » (`active_investigation_id`) est celle de l'atelier, sans projet. Les modèles de
 * règles et schémas d'écran d'un projet ne servent qu'à ce projet (dérive, validation, application).
 */

const MAX_EVENTS = 5000;
const dataDir = () => process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data");
const stateFile = () => path.join(dataDir(), "state.json");
const shotsDir = () => path.join(dataDir(), "shots");

export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Store {
  state: RebornState;
  emitter: EventEmitter;
  saveTimer?: NodeJS.Timeout;
  /** Une écriture est en attente (délai de regroupement). */
  pending?: boolean;
  /** Numéro du dernier évènement de chaque projet (révision par projet, O(1) à l'écriture). Non persisté. */
  lastSeq?: Map<string, number>;
}

const g = globalThis as unknown as { __reborn?: Store };

function emptyState(): RebornState {
  return { investigations: [], active_investigation_id: null, events: [], event_seq: 0, investigation_seq: 0, observations: [], models: [], schemas: [], revision: 0 };
}

/** Charge l'état persisté, avec migration des anciens formats. */
function load(): RebornState {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as RebornState & { form?: AppSchema["fields"] | null };
    const s: RebornState = { ...emptyState(), ...raw };
    if (!s.schemas?.length && raw.form?.length) {
      s.schemas = [{ fields: raw.form, version: 1, received_at: new Date().toISOString(), source: "explorer" }];
    }
    delete (s as { form?: unknown }).form;
    dropUnsafeShots(s);
    let seq = 0;
    for (const e of s.events) e.seq = e.seq ?? ++seq;
    s.event_seq = Math.max(s.event_seq ?? 0, ...s.events.map((e) => e.seq), 0);
    s.investigation_seq = Math.max(s.investigation_seq ?? 0, ...s.investigations.map((i) => Number(/\d+$/.exec(i.id)?.[0] ?? 0)), 0);
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    // Fichier illisible : on le met de côté au lieu de l'écraser à la prochaine écriture
    const backup = `${stateFile()}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(stateFile(), backup);
    } catch {}
    console.error(`[reborn] état persistant illisible, sauvegardé dans ${backup} — démarrage sur un état vide`);
    corruptBackup = backup;
    return emptyState();
  }
}

let corruptBackup: string | null = null;

/** Dernier évènement de chaque projet (reconstruit au chargement : les évènements historiques comptent aussi). */
function indexProjectSeqs(st: RebornState): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of st.events) {
    const p = eventProject(st, e);
    if (p) m.set(p, Math.max(m.get(p) ?? 0, e.seq));
  }
  return m;
}

function store(): Store {
  if (!g.__reborn) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    g.__reborn = { state: load(), emitter };
    // Arrêt du serveur (Ctrl+C) pendant le délai d'écriture : on écrit tout de suite
    process.once("exit", () => {
      if (g.__reborn?.pending) {
        try {
          writeNow();
        } catch {}
      }
    });
    reportCorrupt();
  }
  // Rechargement à chaud : un store créé par une version précédente du module n'a pas encore la table
  g.__reborn.lastSeq ??= indexProjectSeqs(g.__reborn.state);
  return g.__reborn;
}

function reportCorrupt() {
  if (!corruptBackup) return;
  const file = corruptBackup;
  corruptBackup = null;
  // Diagnostic de l'équipe : jamais rattaché au projet de la requête qui a déclenché le chargement
  addEvent({ source: "platform", type: "error", title: "État précédent illisible : démarrage sur un état vide", detail: `Copie conservée : ${file}`, project_id: null });
}

function writeNow() {
  const s = store();
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${stateFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s.state));
  fs.renameSync(tmp, stateFile());
  s.pending = false;
}

function persist() {
  const s = store();
  clearTimeout(s.saveTimer);
  s.pending = true;
  s.saveTimer = setTimeout(() => {
    try {
      writeNow();
    } catch (e) {
      console.error("[reborn] persistance impossible :", (e as Error)?.message ?? String(e), (e as Error)?.stack ?? "");
    }
  }, 200);
}

/** Écrit immédiatement l'état sur disque (arrêt propre, tests). */
export function flushPersist() {
  const s = store();
  clearTimeout(s.saveTimer);
  writeNow();
}

/** Simule un redémarrage du serveur : l'état est relu depuis le disque. */
export function reloadFromDisk() {
  const s = store();
  clearTimeout(s.saveTimer);
  s.pending = false;
  s.state = load();
  s.lastSeq = indexProjectSeqs(s.state);
  reportCorrupt();
}

function touch(event?: AgentEvent) {
  const s = store();
  s.state.revision++;
  persist();
  s.emitter.emit("change", { revision: s.state.revision, event });
}

export function getState(): RebornState {
  return store().state;
}

export function subscribe(fn: (msg: { revision: number; event?: AgentEvent }) => void): () => void {
  const { emitter } = store();
  emitter.on("change", fn);
  return () => emitter.off("change", fn);
}

/** Numéro du dernier évènement de chaque projet (révision vue par un client : lib/visibility.ts). */
export function projectRevisions(): ReadonlyMap<string, number> {
  return store().lastSeq!;
}

/* ------------------------------------------------------------------ */
/* Portée : projet de la requête, ou atelier (null)                     */
/* ------------------------------------------------------------------ */

/** Projet de la requête en cours (posé par handler() après contrôle d'accès), null pour l'atelier. */
export const currentScope = (): string | null => projectScope.getStore() ?? null;

const projectOf = (x: { project_id?: string }) => x.project_id ?? null;

/** Modèles de règles d'un projet (null : ceux de l'atelier), dans l'ordre des versions. */
export function modelsOf(project: string | null = currentScope()): StoredRuleModel[] {
  return store().state.models.filter((m) => projectOf(m as ScopedModel) === project);
}

/** Schémas d'écran d'un projet (null : ceux de l'atelier), dans l'ordre des versions. */
export function schemasOf(project: string | null = currentScope()): StoredSchema[] {
  return store().state.schemas.filter((x) => projectOf(x as ScopedSchema) === project);
}

/** Observations d'un projet (null : celles de l'atelier). */
export function observationsOf(project: string | null = currentScope()): Observation[] {
  const st = store().state;
  return st.observations.filter((o) => observationProject(st, o) === project);
}

export function investigationById(id: string): Investigation | null {
  return store().state.investigations.find((i) => i.id === id) ?? null;
}

/**
 * Investigation à laquelle se rattache implicitement un envoi sans investigation_id :
 * - atelier (null) : l'investigation active de l'atelier (jamais celle d'un projet) ;
 * - projet : sa plus récente investigation en cours (jamais celle d'un autre projet).
 */
export function activeInvestigationFor(project: string | null): Investigation | null {
  const st = store().state;
  if (!project) {
    const a = st.investigations.find((i) => i.id === st.active_investigation_id);
    return a && !a.project_id ? a : null;
  }
  for (let k = st.investigations.length - 1; k >= 0; k--) {
    const i = st.investigations[k];
    if (i.project_id === project && i.status === "running") return i;
  }
  return null;
}

/** Modèle courant de la portée (projet de la requête, ou atelier). */
export function currentModel(project: string | null = currentScope()): StoredRuleModel | null {
  return modelsOf(project).at(-1) ?? null;
}

export function modelByVersion(v: number | null | undefined, project: string | null = currentScope()): StoredRuleModel | null {
  if (v === null || v === undefined) return currentModel(project);
  return modelsOf(project).find((m) => m.version === v) ?? null;
}

/** Schéma d'écran courant de la portée (projet de la requête, ou atelier). */
export function currentSchema(project: string | null = currentScope()): StoredSchema | null {
  return schemasOf(project).at(-1) ?? null;
}

/** Description complète de l'application reconstruite (schéma × modèle courants de la portée). */
export function currentApp(model: StoredRuleModel | null = currentModel(), project: string | null = currentScope()): ResolvedApp {
  return resolveApp(model, currentSchema(project), observationsOf(project));
}

/** Investigation active de l'atelier (diagnostic de l'équipe, scénarios, explorateur de répétition). */
export function activeInvestigation(): Investigation | null {
  return activeInvestigationFor(null);
}

/* ------------------------------------------------------------------ */
/* Évènements                                                           */
/* ------------------------------------------------------------------ */

export type NewEvent = Omit<AgentEvent, "id" | "ts" | "seq"> & {
  ts?: string;
  /**
   * Projet fixé par le serveur (appels internes : journal de migration, cycle de vie d'une investigation).
   * null : explicitement hors projet (diagnostic de l'équipe), sans rattachement implicite.
   * Absent : projet de l'investigation, sinon portée de la requête.
   */
  project_id?: string | null;
};

/**
 * Rattachement d'un évènement (sans l'écrire) : investigation (explicite, sinon l'investigation en cours
 * de la portée — jamais pour le journal de migration ni un évènement explicitement hors projet) et projet.
 */
export function attribution(e: Pick<NewEvent, "investigation_id" | "type" | "project_id">): { investigation_id?: string; project_id?: string } {
  const st = store().state;
  const scope = currentScope();
  let investigation_id = e.investigation_id;
  if (!investigation_id && e.project_id === undefined && e.type !== "migration") investigation_id = activeInvestigationFor(scope)?.id;
  const inv = investigation_id ? st.investigations.find((i) => i.id === investigation_id) : undefined;
  const project = e.project_id === null ? null : (e.project_id ?? (inv ? projectOf(inv) : scope));
  return { investigation_id, ...(project ? { project_id: project } : {}) };
}

export function addEvent(e: NewEvent): AgentEvent {
  const s = store();
  const st = s.state;
  const { project_id: _fixed, ...rest } = e;
  const at = attribution(e);
  const event: ScopedEvent = {
    ...rest,
    id: randomUUID(),
    seq: ++st.event_seq,
    ts: e.ts ?? new Date().toISOString(),
    investigation_id: at.investigation_id,
    screenshot_url: saveScreenshot(e.screenshot_url, at.project_id ?? null),
    ...(at.project_id ? { project_id: at.project_id } : {}),
  };
  if (!event.investigation_id) delete event.investigation_id;
  st.events.push(event);
  if (st.events.length > MAX_EVENTS) st.events.splice(0, st.events.length - MAX_EVENTS);
  if (event.project_id) s.lastSeq!.set(event.project_id, event.seq);
  touch(event);
  if (event.type === "experiment_request" && st.investigations.find((i) => i.id === event.investigation_id)?.mode === "live") {
    void forwardToExplorer({ kind: "experiment_request", event });
  }
  return event;
}

/* ------------------------------------------------------------------ */
/* Investigations                                                       */
/* ------------------------------------------------------------------ */

export function createInvestigation(p: {
  application: string;
  module: string;
  target_url?: string;
  objective?: string;
  mode: Investigation["mode"];
  kind: Investigation["kind"];
  project_id?: string;
}): Investigation {
  const s = store().state;
  const project = p.project_id ?? null;
  // Clôture PAR PROJET (avec évènement) : ouvrir une investigation ne termine jamais celle d'un autre
  // projet ni celle de l'atelier.
  for (const i of s.investigations) if (i.status === "running" && projectOf(i) === project) completeInvestigation(i.id);
  // L'identifiant n'est jamais réutilisé, même après une remise à zéro : un agent resté
  // sur une ancienne investigation reçoit une 422 au lieu d'écrire dans la nouvelle.
  s.investigation_seq = (s.investigation_seq ?? s.investigations.length) + 1;
  const { project_id: _p, ...rest } = p;
  const inv: Investigation = {
    id: `INV_${String(s.investigation_seq).padStart(3, "0")}`,
    // Numérotation propre à chaque projet (et à l'atelier) : rien sur l'activité des autres
    number: s.investigations.filter((i) => projectOf(i) === project).length + 1,
    ...rest,
    ...(project ? { project_id: project } : {}),
    status: "running",
    created_at: new Date().toISOString(),
    model_version_at_start: currentModel(project)?.version,
  };
  s.investigations.push(inv);
  // L'investigation active globale est celle de l'atelier : une investigation de projet ne la remplace pas
  if (!project) s.active_investigation_id = inv.id;
  const kindLabel = inv.kind === "blind_challenge" ? "Blind Challenge" : inv.kind === "verification" ? "Vérification" : "Investigation";
  addEvent({
    source: "user",
    type: "investigation_started",
    title: `${kindLabel} #${inv.number} lancé${inv.kind === "blind_challenge" ? "" : "e"} sur ${inv.application}`,
    detail: inv.objective,
    investigation_id: inv.id,
    project_id: project,
    data: inv,
  });
  if (inv.mode === "live") void forwardToExplorer({ kind: "investigation", investigation: inv });
  return inv;
}

export function completeInvestigation(id: string, status: "completed" | "failed" = "completed") {
  const s = store().state;
  const inv = s.investigations.find((i) => i.id === id);
  if (!inv) throw new StoreError(404, `Investigation inconnue : ${id}`);
  if (inv.status !== "running") return;
  inv.status = status;
  inv.completed_at = new Date().toISOString();
  const n = s.observations.filter((o) => o.investigation_id === id).length;
  addEvent({
    source: "platform",
    type: "investigation_completed",
    title: `Investigation #${inv.number} ${status === "failed" ? "en échec" : "terminée"} — ${n} expérience${n > 1 ? "s" : ""}`,
    investigation_id: id,
    project_id: projectOf(inv),
  });
}

/* ------------------------------------------------------------------ */
/* Observations (Explorer)                                              */
/* ------------------------------------------------------------------ */

export function addObservations(list: Observation[], source: AgentEvent["source"] = "explorer", opts: { external?: boolean } = {}): Observation[] {
  const s = store().state;
  const scope = currentScope();
  // Cohérence des identifiants : une investigation référencée doit exister, et appartenir au projet de la requête
  for (const o of list) {
    if (!o.investigation_id) continue;
    const inv = s.investigations.find((i) => i.id === o.investigation_id);
    if (!inv) throw new StoreError(422, `investigation_id inconnu : ${o.investigation_id}. Créez-la via POST /api/investigations ou omettez le champ.`);
    if (scope && projectOf(inv) !== scope) throw new StoreError(422, `investigation_id ${o.investigation_id} : investigation d'un autre projet que celui de la requête (?project=).`);
  }
  let active = activeInvestigationFor(scope);
  // Envoi externe sans investigation_id pendant une investigation locale (scénario, explorateur
  // de répétition) : on refuse plutôt que de mélanger des données d'agent aux données de référence.
  if (opts.external && active && active.mode !== "live" && list.some((o) => !o.investigation_id)) {
    throw new StoreError(
      409,
      `L'investigation active (${active.id}) est en mode local (${active.mode}). Lancez une investigation « agents réels » (POST /api/investigations, mode "live") ou précisez investigation_id.`,
    );
  }
  if (!active && list.some((o) => !o.investigation_id)) {
    const first = list[0];
    active = createInvestigation({
      application: first.application ?? "Logiciel historique",
      module: first.module ?? "Module",
      mode: "live",
      kind: "initial",
      objective: "Créée automatiquement à la réception d'observations sans investigation active.",
      ...(scope ? { project_id: scope } : {}),
    });
  }

  // Chaque observation hérite du projet de son investigation ; la dérive est mesurée avec le modèle de
  // CE projet (jamais celui d'un autre client ni de l'atelier). Applications résolues avant l'envoi.
  const targets = list.map((o) => (o.investigation_id ? s.investigations.find((i) => i.id === o.investigation_id)! : active!));
  const models = new Map<string | null, { model: StoredRuleModel | null; fields: ResolvedApp["fields"] | null }>();
  for (const inv of targets) {
    const project = projectOf(inv);
    if (models.has(project)) continue;
    const model = currentModel(project);
    models.set(project, { model, fields: model ? currentApp(model, project).fields : null });
  }
  const saved: Observation[] = [];

  list.forEach((o, k) => {
    const inv = targets[k];
    const project = projectOf(inv);
    const { project_id: _claimed, ...clean } = o as ScopedObservation;
    const obs: ScopedObservation = {
      ...clean,
      investigation_id: inv.id,
      received_at: new Date().toISOString(),
      screenshot_url: saveScreenshot(o.screenshot_url, project),
      ...(project ? { project_id: project } : {}),
    };
    s.observations.push(obs);
    saved.push(obs);

    const inputsTxt = Object.values(obs.inputs).join(" · ");
    const out = obs.observed_output?.total_price ?? Object.values(obs.observed_output ?? {})[0];
    addEvent({
      source,
      type: "observation",
      title: `${obs.experiment_id} · ${inputsTxt} → ${obs.status === "error" ? obs.error ?? "refus affiché" : typeof out === "number" ? formatMoney(out) : String(out ?? "—")}`,
      detail: obs.status === "failed" ? `Expérience non aboutie${obs.error ? ` : ${obs.error}` : ""}` : undefined,
      investigation_id: obs.investigation_id,
      project_id: project,
      screenshot_url: obs.screenshot_url,
      data: { experiment_id: obs.experiment_id, request_id: obs.request_id },
    });

    // Détection de dérive en direct
    const { model, fields } = models.get(project)!;
    if (model && obs.status !== "failed") {
      const row = compareOne(model, obs, { fields });
      if (row.status === "mismatch") {
        addEvent({
          source: "platform",
          type: "drift",
          title: row.exception
            ? `Écart sur ${obs.experiment_id} : l'original refuse, la reconstruction accepte`
            : row.mismatched_fields.includes("status")
              ? `Écart sur ${obs.experiment_id} : la reconstruction refuse un cas accepté`
              : `Écart sur ${obs.experiment_id} : historique ${fmt(row.observed.total_price)} · reconstruit ${fmt(row.computed.total_price)}`,
          detail: `Le modèle v${model.version} ne reproduit pas ce comportement${row.delta !== undefined ? ` (Δ ${row.delta})` : ""}. Réinvestigation nécessaire.`,
          investigation_id: obs.investigation_id,
          project_id: project,
          data: { experiment_id: obs.experiment_id, delta: row.delta, model_version: model.version },
        });
      }
    }
  });
  return saved;
}

function fmt(v: unknown) {
  return typeof v === "number" ? formatMoney(v) : String(v ?? "—");
}

/* ------------------------------------------------------------------ */
/* Modèle de règles (Analyste)                                          */
/* ------------------------------------------------------------------ */

/** Investigation et projet d'une publication (modèle, schéma) faite dans la portée de la requête. */
function publicationTarget(investigation_id?: string): { inv: Investigation | null; project: string | null } {
  const scope = currentScope();
  const inv = investigation_id ? investigationById(investigation_id) : activeInvestigationFor(scope);
  return { inv, project: inv ? projectOf(inv) : scope };
}

export function addRuleModel(model: RuleModel, source = "analyst", issues: Issue[] = []): StoredRuleModel {
  const s = store().state;
  const { inv, project } = publicationTarget();
  const prev = currentModel(project);
  // Contrat tolérant (.loose()) : un project_id / investigation_id du corps n'est jamais repris
  const { project_id: _p, investigation_id: _i, ...clean } = model as RuleModel & { project_id?: unknown; investigation_id?: unknown };
  const stored: ScopedModel = {
    ...clean,
    // Numéro de version unique dans le Studio (les évènements le citent) ; comparaison avec la version précédente DU projet
    version: (s.models.at(-1)?.version ?? 0) + 1,
    received_at: new Date().toISOString(),
    source,
    diff: diffModels(prev, model),
    issues,
    ...(project ? { project_id: project } : {}),
    ...(inv ? { investigation_id: inv.id } : {}),
  };
  s.models.push(stored);

  const changed = stored.diff ?? [];
  const summary = prev
    ? changed.length
      ? `${changed.length} changement${changed.length > 1 ? "s" : ""} : ${changed.map((d) => `${d.rule_id} ${d.kind === "changed" ? "modifiée" : d.kind === "added" ? "ajoutée" : "retirée"}`).join(", ")}`
      : "aucun changement de comportement"
    : `${model.rules.length} règles`;
  addEvent({
    source: source === "analyst" || source === "fixture" ? "analyst" : "user",
    type: "rules_updated",
    title: `Modèle métier v${stored.version} reçu — ${summary}${source === "fixture" ? " · scénario de référence" : ""}`,
    detail: issues.length ? `${issues.length} avertissement${issues.length > 1 ? "s" : ""} de validation` : undefined,
    investigation_id: inv?.id,
    project_id: project,
    data: { version: stored.version, diff: stored.diff },
  });

  // Validation sur les observations de CE projet (ou de l'atelier), jamais sur celles des autres
  const scopeId = inv?.id ?? "all";
  const report = compareAll(stored, observationsOf(project), scopeId, { fields: currentApp(stored, project).fields });
  if (report.scored) {
    const pct = Math.round((report.equivalence ?? 0) * 1000) / 10;
    addEvent({
      source: "platform",
      type: "validation",
      title: `Reconstruction v${stored.version} : ${report.matched}/${report.scored} sorties identiques (${pct} %)`,
      detail: `Construction ${report.construction_matched}/${report.construction_total} · validation indépendante ${report.independent_matched}/${report.independent_total}`,
      investigation_id: inv?.id,
      project_id: project,
      data: { version: stored.version, equivalence: report.equivalence, investigation_id: scopeId },
    });
  }
  return stored;
}

/* ------------------------------------------------------------------ */
/* Schéma d'interface (Explorer ou description fournie)                 */
/* ------------------------------------------------------------------ */

export function addSchema(schema: AppSchema, source = "explorer", investigation_id?: string): StoredSchema {
  const s = store().state;
  const { inv, project } = publicationTarget(investigation_id);
  const prev = currentSchema(project);
  const { project_id: _p, investigation_id: _i, ...clean } = schema as AppSchema & { project_id?: unknown; investigation_id?: unknown };
  const stored: ScopedSchema = {
    ...clean,
    version: (s.schemas.at(-1)?.version ?? 0) + 1,
    received_at: new Date().toISOString(),
    source,
    ...(project ? { project_id: project } : {}),
    ...(inv ? { investigation_id: inv.id } : {}),
  };
  s.schemas.push(stored);
  const before = new Set(prev?.fields.map((f) => f.name) ?? []);
  const after = new Set(schema.fields.map((f) => f.name));
  const added = [...after].filter((n) => !before.has(n));
  const removed = [...before].filter((n) => !after.has(n));
  const delta = prev ? [added.length && `+ ${added.join(", ")}`, removed.length && `− ${removed.join(", ")}`].filter(Boolean).join(" · ") : "";
  addEvent({
    source: source === "explorer" || source === "fixture" ? "explorer" : source === "analyst" ? "analyst" : "user",
    type: "schema_updated",
    title: `Schéma d'interface v${stored.version} — ${schema.fields.length} champ${schema.fields.length > 1 ? "s" : ""}${delta ? ` (${delta})` : ""}`,
    investigation_id: inv?.id,
    project_id: project,
    data: { version: stored.version, added, removed },
  });
  return stored;
}

/* ------------------------------------------------------------------ */
/* Divers                                                               */
/* ------------------------------------------------------------------ */

/** Clés d'identifiants et de références : jamais réécrites par un masquage (elles relient les données entre elles). */
const REFERENCE_KEYS = new Set(["id", "seq", "ts", "investigation_id", "project_id", "request_id", "experiment_id", "mission_id", "screenshot_url", "received_at", "version", "sha256"]);

/** Copie de `v` dont chaque texte est passé par `redact` (références conservées) ; `changed` signale un masquage. */
function redactDeep(v: unknown, redact: (s: string) => string, changed: { any: boolean }, depth = 0): unknown {
  if (typeof v === "string") {
    const r = redact(v);
    if (r !== v) changed.any = true;
    return r;
  }
  if (depth > 32 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, redact, changed, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = REFERENCE_KEYS.has(k) ? x : redactDeep(x, redact, changed, depth + 1);
  return out;
}

/**
 * Masque, dans les données d'UN projet (évènements, observations, schémas d'écran, investigations), toute copie
 * d'un secret reconnue par `redact` : appelé à l'effacement des identifiants confiés (lib/migration/credentials.ts),
 * tant que leurs valeurs sont encore connues en mémoire. Les références (identifiants, empreintes) sont conservées.
 * Renvoie le nombre d'éléments modifiés ; un masquage effectif est enregistré et diffusé comme toute mutation.
 */
export function scrubProjectState(projectId: string, redact: (s: string) => string): number {
  const st = store().state;
  let n = 0;
  const apply = <T extends object>(item: T): T => {
    const changed = { any: false };
    const next = redactDeep(item, redact, changed) as T;
    if (!changed.any) return item;
    n++;
    return next;
  };
  st.events = st.events.map((e) => (eventProject(st, e) === projectId ? apply(e) : e));
  st.observations = st.observations.map((o) => (observationProject(st, o) === projectId ? apply(o) : o));
  st.schemas = st.schemas.map((x) => ((x as ScopedSchema).project_id === projectId ? apply(x) : x));
  st.investigations = st.investigations.map((i) => (i.project_id === projectId ? apply(i) : i));
  if (n) touch();
  return n;
}

/**
 * Suppression d'un projet demandée (lib/migration/erase.ts) : ses évènements (journal de migration compris),
 * observations, modèles de règles, schémas d'écran et investigations sont retirés de l'état, ainsi que le
 * dossier de ses captures. Les compteurs restent croissants (aucun identifiant n'est réutilisé).
 */
export function purgeProjectState(projectId: string): { events: number; observations: number; models: number; schemas: number; investigations: number } {
  const s = store();
  const st = s.state;
  const mine = (x: { project_id?: string }) => x.project_id === projectId;
  const events = st.events.filter((e) => eventProject(st, e) === projectId || (e.data as { project_id?: unknown } | undefined)?.project_id === projectId);
  const observations = st.observations.filter((o) => observationProject(st, o) === projectId);
  const out = {
    events: events.length,
    observations: observations.length,
    models: st.models.filter((m) => mine(m as ScopedModel)).length,
    schemas: st.schemas.filter((x) => mine(x as ScopedSchema)).length,
    investigations: st.investigations.filter((i) => i.project_id === projectId).length,
  };
  const dropEvents = new Set(events);
  const dropObs = new Set(observations);
  s.state = {
    ...st,
    events: st.events.filter((e) => !dropEvents.has(e)),
    observations: st.observations.filter((o) => !dropObs.has(o)),
    models: st.models.filter((m) => !mine(m as ScopedModel)),
    schemas: st.schemas.filter((x) => !mine(x as ScopedSchema)),
    investigations: st.investigations.filter((i) => i.project_id !== projectId),
  };
  s.lastSeq?.delete(projectId);
  if (PROJECT_ID.test(projectId)) {
    try {
      fs.rmSync(path.join(shotsDir(), projectId), { recursive: true, force: true });
    } catch {}
  }
  touch();
  return out;
}

/**
 * Remise à zéro de l'ATELIER (données sans projet) : investigations de l'atelier, leurs évènements et
 * observations, modèles et schémas de l'atelier, captures rangées dans shots/_atelier. Rien d'un projet
 * n'est touché, ni le journal de migration (y compris ses évènements historiques sans projet résolu),
 * ni les captures antérieures au rangement par projet.
 */
export function resetState() {
  const s = store();
  const st = s.state;
  const keep = (e: AgentEvent) => e.type === "migration" || eventProject(st, e) !== null;
  // Les compteurs restent croissants : les clients détectent toujours le changement, un client qui
  // interroge ?after_seq=N ne manque aucun évènement et aucun identifiant d'investigation n'est réutilisé.
  s.state = {
    ...emptyState(),
    investigations: st.investigations.filter((i) => !!i.project_id),
    events: st.events.filter(keep),
    observations: st.observations.filter((o) => observationProject(st, o) !== null),
    models: st.models.filter((m) => !!(m as ScopedModel).project_id),
    schemas: st.schemas.filter((x) => !!(x as ScopedSchema).project_id),
    revision: st.revision,
    event_seq: st.event_seq,
    investigation_seq: st.investigation_seq,
  };
  try {
    fs.rmSync(path.join(shotsDir(), ATELIER_SHOTS), { recursive: true, force: true });
  } catch {}
  touch();
}

/* ------------------------------------------------------------------ */
/* Captures d'écran : rangées par projet                               */
/* ------------------------------------------------------------------ */

/** Dossier des captures de l'atelier (sans projet). */
export const ATELIER_SHOTS = "_atelier";
/** Dossier d'une capture : identifiant de projet, ATELIER_SHOTS, ou null (ancien emplacement, avant le rangement par projet). */
export type ShotFolder = string | null;
const SHOT_NAME = /^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/;

/**
 * Fichier d'une capture (`<uuid>.<ext>`), cherché uniquement dans les dossiers que l'appelant peut lire
 * (`allowed`) : shots/<projet>/, shots/_atelier/ ou l'ancien emplacement shots/. Null sinon.
 */
export function shotPath(id: string, allowed: (folder: ShotFolder) => boolean = () => true): string | null {
  if (!SHOT_NAME.test(id)) return null;
  const folders: ShotFolder[] = [null, ATELIER_SHOTS];
  try {
    for (const d of fs.readdirSync(shotsDir())) if (PROJECT_ID.test(d)) folders.push(d);
  } catch {}
  for (const f of folders) {
    if (!allowed(f)) continue;
    const p = f === null ? path.join(shotsDir(), id) : path.join(shotsDir(), f, id);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {}
  }
  return null;
}

/** Adresse d'une capture conservée par le Studio (servie par /api/shots/[id], qui contrôle l'accès). */
const STORED_SHOT = /^\/api\/shots\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/;
const INLINE_SHOT = /^data:image\/(png|jpe?g|webp);base64,/;

/**
 * Adresse de capture qu'il est sûr de conserver telle quelle : une capture déjà rangée par le Studio
 * (/api/shots/<uuid>.<ext>). Toute autre adresse (javascript:, http(s) vers un site tiers, chemin relatif…)
 * est écartée : elle serait rendue en lien et en image dans l'atelier et dans l'espace du client.
 */
export function storedShotUrl(url: unknown): string | undefined {
  return typeof url === "string" && STORED_SHOT.test(url) ? url : undefined;
}

/** États enregistrés avant ce contrôle : une adresse de capture non sûre n'est jamais relue (ni servie). */
function dropUnsafeShots(s: RebornState) {
  for (const x of [...s.events, ...s.observations] as { screenshot_url?: unknown }[]) {
    if (x.screenshot_url !== undefined && !(typeof x.screenshot_url === "string" && (STORED_SHOT.test(x.screenshot_url) || INLINE_SHOT.test(x.screenshot_url)))) delete x.screenshot_url;
  }
}

/**
 * Capture reçue d'un agent : data URL d'image (PNG, JPEG, WebP ; 8 Mo au plus) rangée dans le dossier du
 * projet et remplacée par /api/shots/<uuid>.<ext> ; adresse d'une capture déjà rangée : conservée ; toute
 * autre valeur : écartée (undefined).
 */
function saveScreenshot(url: string | undefined, project: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith("data:image/")) return storedShotUrl(url);
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(url);
  if (!m) return undefined;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 8 * 1024 * 1024) return undefined;
  const name = `${randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  const dir = path.join(shotsDir(), project && PROJECT_ID.test(project) ? project : ATELIER_SHOTS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  // L'adresse ne change pas de forme : /api/shots/<uuid>.<ext> (la route vérifie le dossier du projet)
  return `/api/shots/${name}`;
}

/**
 * Intégration « push » vers l'orchestrateur de l'Explorer (optionnelle) :
 * si EXPLORER_WEBHOOK_URL est défini, les investigations et les demandes
 * d'expérience lui sont transmises.
 */
async function forwardToExplorer(payload: unknown) {
  const url = process.env.EXPLORER_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    // Diagnostic de l'équipe (adresse de configuration) : jamais rattaché au projet d'un client
    addEvent({ source: "platform", type: "error", title: "Explorer injoignable", detail: `${url} : ${(e as Error).message}`, project_id: null });
  }
}
