import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { compareAll, compareOne, diffModels } from "./compare";
import { resolveApp, type ResolvedApp } from "./appschema";
import { formatMoney } from "./engine/describe";
import type { AgentEvent, AppSchema, Investigation, Issue, Observation, RebornState, RuleModel, StoredRuleModel, StoredSchema } from "./types";

/**
 * Store en mémoire (process Node unique) + persistance JSON dans .data/.
 * Toutes les écritures passent par ce module, qui diffuse chaque mutation
 * aux clients connectés en SSE (/api/stream). Les entrées sont validées en amont
 * par lib/service.ts.
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
  return g.__reborn;
}

function reportCorrupt() {
  if (!corruptBackup) return;
  const file = corruptBackup;
  corruptBackup = null;
  addEvent({ source: "platform", type: "error", title: "État précédent illisible : démarrage sur un état vide", detail: `Copie conservée : ${file}` });
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
      console.error("[reborn] persistance impossible", e);
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

export function currentModel(): StoredRuleModel | null {
  return store().state.models.at(-1) ?? null;
}

export function modelByVersion(v: number | null | undefined): StoredRuleModel | null {
  if (v === null || v === undefined) return currentModel();
  return store().state.models.find((m) => m.version === v) ?? null;
}

export function currentSchema(): StoredSchema | null {
  return store().state.schemas.at(-1) ?? null;
}

/** Description complète de l'application reconstruite (schéma × modèle courants). */
export function currentApp(model: StoredRuleModel | null = currentModel()): ResolvedApp {
  const s = store().state;
  return resolveApp(model, currentSchema(), s.observations);
}

export function activeInvestigation(): Investigation | null {
  const s = store().state;
  return s.investigations.find((i) => i.id === s.active_investigation_id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Évènements                                                           */
/* ------------------------------------------------------------------ */

export type NewEvent = Omit<AgentEvent, "id" | "ts" | "seq"> & { ts?: string };

export function addEvent(e: NewEvent): AgentEvent {
  const s = store().state;
  const event: AgentEvent = {
    ...e,
    id: randomUUID(),
    seq: ++s.event_seq,
    ts: e.ts ?? new Date().toISOString(),
    investigation_id: e.investigation_id ?? s.active_investigation_id ?? undefined,
    screenshot_url: saveScreenshot(e.screenshot_url),
  };
  s.events.push(event);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  touch(event);
  if (event.type === "experiment_request" && s.investigations.find((i) => i.id === event.investigation_id)?.mode === "live") {
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
  for (const i of s.investigations) if (i.status === "running") i.status = "completed";
  // L'identifiant n'est jamais réutilisé, même après une remise à zéro : un agent resté
  // sur une ancienne investigation reçoit une 422 au lieu d'écrire dans la nouvelle.
  s.investigation_seq = (s.investigation_seq ?? s.investigations.length) + 1;
  const inv: Investigation = {
    id: `INV_${String(s.investigation_seq).padStart(3, "0")}`,
    number: s.investigations.length + 1,
    ...p,
    status: "running",
    created_at: new Date().toISOString(),
    model_version_at_start: currentModel()?.version,
  };
  s.investigations.push(inv);
  s.active_investigation_id = inv.id;
  const kindLabel = inv.kind === "blind_challenge" ? "Blind Challenge" : inv.kind === "verification" ? "Vérification" : "Investigation";
  addEvent({
    source: "user",
    type: "investigation_started",
    title: `${kindLabel} #${inv.number} lancé${inv.kind === "blind_challenge" ? "" : "e"} sur ${inv.application}`,
    detail: inv.objective,
    investigation_id: inv.id,
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
  });
}

/* ------------------------------------------------------------------ */
/* Observations (Explorer)                                              */
/* ------------------------------------------------------------------ */

export function addObservations(list: Observation[], source: AgentEvent["source"] = "explorer", opts: { external?: boolean } = {}): Observation[] {
  const s = store().state;
  // Cohérence des identifiants : une investigation référencée doit exister
  for (const o of list) {
    if (o.investigation_id && !s.investigations.some((i) => i.id === o.investigation_id)) {
      throw new StoreError(422, `investigation_id inconnu : ${o.investigation_id}. Créez-la via POST /api/investigations ou omettez le champ.`);
    }
  }
  let active = activeInvestigation();
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
    });
  }

  const model = currentModel();
  const fields = model ? currentApp(model).fields : null;
  const saved: Observation[] = [];

  for (const o of list) {
    const obs: Observation = {
      ...o,
      investigation_id: o.investigation_id ?? active?.id,
      received_at: new Date().toISOString(),
      screenshot_url: saveScreenshot(o.screenshot_url),
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
      screenshot_url: obs.screenshot_url,
      data: { experiment_id: obs.experiment_id, request_id: obs.request_id },
    });

    // Détection de dérive en direct
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
          data: { experiment_id: obs.experiment_id, delta: row.delta, model_version: model.version },
        });
      }
    }
  }
  return saved;
}

function fmt(v: unknown) {
  return typeof v === "number" ? formatMoney(v) : String(v ?? "—");
}

/* ------------------------------------------------------------------ */
/* Modèle de règles (Analyste)                                          */
/* ------------------------------------------------------------------ */

export function addRuleModel(model: RuleModel, source = "analyst", issues: Issue[] = []): StoredRuleModel {
  const s = store().state;
  const prev = currentModel();
  const stored: StoredRuleModel = {
    ...model,
    version: (prev?.version ?? 0) + 1,
    received_at: new Date().toISOString(),
    source,
    diff: diffModels(prev, model),
    issues,
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
    data: { version: stored.version, diff: stored.diff },
  });

  const scope = s.active_investigation_id ?? "all";
  const report = compareAll(stored, s.observations, scope, { fields: currentApp(stored).fields });
  if (report.scored) {
    const pct = Math.round((report.equivalence ?? 0) * 1000) / 10;
    addEvent({
      source: "platform",
      type: "validation",
      title: `Reconstruction v${stored.version} : ${report.matched}/${report.scored} sorties identiques (${pct} %)`,
      detail: `Construction ${report.construction_matched}/${report.construction_total} · validation indépendante ${report.independent_matched}/${report.independent_total}`,
      data: { version: stored.version, equivalence: report.equivalence, investigation_id: scope },
    });
  }
  return stored;
}

/* ------------------------------------------------------------------ */
/* Schéma d'interface (Explorer ou description fournie)                 */
/* ------------------------------------------------------------------ */

export function addSchema(schema: AppSchema, source = "explorer", investigation_id?: string): StoredSchema {
  const s = store().state;
  const prev = currentSchema();
  const stored: StoredSchema = { ...schema, version: (prev?.version ?? 0) + 1, received_at: new Date().toISOString(), source };
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
    investigation_id,
    data: { version: stored.version, added, removed },
  });
  return stored;
}

/* ------------------------------------------------------------------ */
/* Divers                                                               */
/* ------------------------------------------------------------------ */

export function resetState() {
  const s = store();
  // Le compteur de révision reste croissant : les clients détectent toujours le changement
  // event_seq et investigation_seq aussi : un client qui interroge ?after_seq=N ne manque
  // aucun évènement après la remise à zéro, et aucun identifiant d'investigation n'est réutilisé.
  s.state = { ...emptyState(), revision: s.state.revision, event_seq: s.state.event_seq, investigation_seq: s.state.investigation_seq };
  try {
    fs.rmSync(shotsDir(), { recursive: true, force: true });
  } catch {}
  touch();
}

export function shotPath(id: string): string | null {
  if (!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/.test(id)) return null;
  const p = path.join(shotsDir(), id);
  return fs.existsSync(p) ? p : null;
}

function saveScreenshot(url: string | undefined): string | undefined {
  if (!url || !url.startsWith("data:image/")) return url;
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(url);
  if (!m) return undefined;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 8 * 1024 * 1024) return undefined;
  const name = `${randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  fs.mkdirSync(shotsDir(), { recursive: true });
  fs.writeFileSync(path.join(shotsDir(), name), buf);
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
    addEvent({ source: "platform", type: "error", title: "Explorer injoignable", detail: `${url} : ${(e as Error).message}` });
  }
}
