import { ApiError, parseWith } from "./http";
import { AppSchemaSchema, EventPayload, InvestigationCreateSchema, ObservationPayload, RuleModelSchema } from "./schemas";
import { validateModel, validateSchema } from "./engine/validate";
import { resolveApp } from "./appschema";
import { compareAll } from "./compare";
import {
  activeInvestigation,
  addEvent,
  addObservations,
  addRuleModel,
  addSchema,
  createInvestigation,
  currentModel,
  currentSchema,
  getState,
} from "./store";
import type { AgentEvent, AppSchema, Investigation, Issue, Observation, RuleModel } from "./types";

/**
 * Couche de service : tout ce qui entre dans la plateforme passe ici
 * (routes HTTP, chargeur de scénarios, tests). Validation de forme (Zod)
 * puis validation sémantique, puis écriture dans le store.
 */

export const OBSERVATION_STATUSES = ["success", "error", "failed"] as const;

/** Empreinte du contenu d'une observation (pour reconnaître un renvoi à l'identique). */
const fingerprint = (o: Observation) => JSON.stringify([o.inputs, o.observed_output ?? {}, o.status ?? "success", o.error ?? null]);

/**
 * Explorer → REBORN. Un renvoi strictement identique (même investigation, même
 * experiment_id, même contenu) est ignoré et compté dans `duplicates` : un client
 * peut réessayer après une coupure réseau sans fausser la comparaison.
 * `external` : envoi reçu par l'API HTTP (voir addObservations).
 */
export function ingestObservationBatch(
  raw: unknown,
  source: AgentEvent["source"] = "explorer",
  opts: { external?: boolean } = {},
): { saved: Observation[]; duplicates: string[] } {
  const list = parseWith(ObservationPayload, raw) as Observation[];
  const ids = new Set<string>();
  for (const o of list) {
    const key = `${o.investigation_id ?? ""}/${o.experiment_id}`;
    if (ids.has(key)) throw new ApiError(422, `experiment_id dupliqué dans l'envoi : ${o.experiment_id}`);
    ids.add(key);
    o.status = String(o.status).trim().toLowerCase();
    if (!(OBSERVATION_STATUSES as readonly string[]).includes(o.status)) {
      throw new ApiError(422, `${o.experiment_id} : status « ${o.status} » inconnu (success, error ou failed)`);
    }
    if (o.status === "success" && !Object.keys(o.observed_output).length) {
      throw new ApiError(422, `${o.experiment_id} : observed_output vide pour une expérience réussie`);
    }
  }
  const s = getState();
  const target = (o: Observation) => o.investigation_id ?? s.active_investigation_id ?? undefined;
  const existing = new Map(s.observations.map((o) => [`${o.investigation_id ?? ""}/${o.experiment_id}`, fingerprint(o)]));
  const fresh: Observation[] = [];
  const duplicates: string[] = [];
  for (const o of list) {
    if (existing.get(`${target(o) ?? ""}/${o.experiment_id}`) === fingerprint(o)) duplicates.push(o.experiment_id);
    else fresh.push(o);
  }
  return { saved: fresh.length ? addObservations(fresh, source, opts) : [], duplicates };
}

export function ingestObservations(raw: unknown, source: AgentEvent["source"] = "explorer"): Observation[] {
  return ingestObservationBatch(raw, source).saved;
}

/** Types d'évènements produits uniquement par la plateforme : refusés depuis l'API. */
export const RESERVED_EVENT_TYPES = ["investigation_started", "investigation_completed", "observation", "rules_updated", "schema_updated", "validation", "drift", "migration"] as const;

export function ingestEvents(raw: unknown, opts: { external?: boolean } = {}): AgentEvent[] {
  const list = parseWith(EventPayload, raw);
  const out: AgentEvent[] = [];
  if (opts.external) {
    for (const e of list) {
      if ((RESERVED_EVENT_TYPES as readonly string[]).includes(e.type)) {
        throw new ApiError(422, `Type d'évènement « ${e.type} » réservé à la plateforme. Utilisez /api/observations, /api/rules ou /api/schema, ou un type parmi : action, form_discovered, hypothesis, experiment_request, log, error.`);
      }
      if (e.source === "platform") throw new ApiError(422, "source « platform » réservée à REBORN (explorer, analyst ou user)");
    }
  }
  for (const e of list) {
    if (e.investigation_id && !getState().investigations.some((i) => i.id === e.investigation_id)) {
      throw new ApiError(422, `investigation_id inconnu : ${e.investigation_id}`);
    }
    // Rétrocompatibilité : un écran découvert crée une nouvelle version du schéma
    if (e.type === "form_discovered") {
      const data = (e.data ?? {}) as Record<string, unknown>;
      publishSchema({ ...data, fields: data.fields }, e.source === "analyst" ? "analyst" : "explorer", e.investigation_id);
    }
    out.push(addEvent(e));
  }
  return out;
}

export function publishSchema(raw: unknown, source = "explorer", investigation_id?: string) {
  const schema = parseWith(AppSchemaSchema, raw) as AppSchema & { investigation_id?: string };
  const issues = validateSchema(schema);
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new ApiError(422, "Schéma d'interface invalide", errors);
  const { investigation_id: inv, ...clean } = schema;
  const stored = addSchema(clean, source, investigation_id ?? inv);
  return { stored, issues };
}

export interface PublishResult {
  ok: true;
  dry_run: boolean;
  version: number | null;
  issues: Issue[];
  diff?: unknown;
  validation: {
    investigation_id: string;
    scored: number;
    matched: number;
    mismatched: number;
    equivalence: number | null;
    construction: { total: number; matched: number };
    independent: { total: number; matched: number };
    mismatches: { experiment_id: string; inputs: unknown; observed: unknown; computed: unknown; delta?: number; reason?: string }[];
    limitations: string[];
  };
}

export function publishRules(raw: unknown, opts: { source?: string; dryRun?: boolean } = {}): PublishResult {
  const model = parseWith(RuleModelSchema, raw) as RuleModel;
  const app = resolveApp(model, currentSchema(), getState().observations);
  const issues = validateModel(model, { fields: app.fields });
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new ApiError(422, `Modèle refusé : ${errors.length} erreur${errors.length > 1 ? "s" : ""} de validation`, issues);
  const warnings = issues.filter((i) => i.level !== "error");

  const stored = opts.dryRun ? null : addRuleModel(model, opts.source ?? "analyst", warnings);
  const s = getState();
  const scope = s.active_investigation_id ?? "all";
  const report = compareAll(stored ?? model, s.observations, scope, { fields: app.fields });
  return {
    ok: true,
    dry_run: !!opts.dryRun,
    version: stored?.version ?? null,
    issues: warnings,
    diff: stored?.diff,
    validation: {
      investigation_id: scope,
      scored: report.scored,
      matched: report.matched,
      mismatched: report.mismatched,
      equivalence: report.equivalence,
      construction: { total: report.construction_total, matched: report.construction_matched },
      independent: { total: report.independent_total, matched: report.independent_matched },
      mismatches: report.rows
        .filter((r) => r.status === "mismatch")
        .map((r) => ({ experiment_id: r.experiment_id, inputs: r.inputs, observed: r.observed, computed: r.computed.total_price, delta: r.delta, reason: r.reason })),
      limitations: report.limitations,
    },
  };
}

export function launchInvestigation(raw: unknown): Investigation {
  return createInvestigation(parseWith(InvestigationCreateSchema, raw));
}

/** Application reconstruite courante, telle que la verra /app. */
export function currentAppDescription() {
  return resolveApp(currentModel(), currentSchema(), getState().observations);
}

export { activeInvestigation };
