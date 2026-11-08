import { ApiError, parseWith } from "./http";
import { AppSchemaSchema, EventPayload, InvestigationCreateSchema, ObservationPayload, RuleModelSchema } from "./schemas";
import { validateModel, validateSchema } from "./engine/validate";
import { resolveApp } from "./appschema";
import { compareAll } from "./compare";
import {
  activeInvestigation,
  activeInvestigationFor,
  addEvent,
  addObservations,
  addRuleModel,
  addSchema,
  attribution,
  createInvestigation,
  currentModel,
  currentSchema,
  currentScope,
  getState,
  investigationById,
  observationsOf,
} from "./store";
import { getProject, ownedProjectIds, projectExists } from "./migration/project";
import type { appStatus } from "./migration/generate";
import { currentPrincipal, displayName, isOperator, type Principal } from "./auth/principal";
import { visibilityFor, type Visibility } from "./visibility";
import type { AgentEvent, AppSchema, Investigation, Issue, Observation, RuleModel } from "./types";

/**
 * Couche de service : tout ce qui entre dans la plateforme passe ici
 * (routes HTTP, chargeur de scénarios, tests). Validation de forme (Zod)
 * puis validation sémantique, puis écriture dans le store.
 *
 * Isolation (lot B1) : le projet d'un envoi est celui de la requête (?project=, contrôlé par handler()),
 * sinon celui de l'investigation citée. Une investigation d'un autre projet que celui de la requête est
 * refusée (422) ; un `project_id` du corps qui ne correspond pas au projet retenu aussi (422) : il n'est
 * jamais pris tel quel.
 */

export const OBSERVATION_STATUSES = ["success", "error", "failed"] as const;

/* ------------------------------------------------------------------ */
/* Identité et visibilité de l'appelant                                 */
/* ------------------------------------------------------------------ */

/** Ce que l'appelant de la requête en cours peut voir de l'état global (principal et projet déjà contrôlés par handler()). */
export function callerVisibility(): Visibility {
  return visibilityFor(currentPrincipal(), currentScope(), ownedProjectIds);
}

/** Nom de l'auteur d'une décision : identité authentifiée (« Prénom Nom », ou le service), jamais le corps. */
export const actorName = (): string => displayName(currentPrincipal());

type AppStatus = Awaited<ReturnType<typeof appStatus>>;

/** État du logiciel livré tel qu'un appelant peut le voir : ni processus, ni fichier d'identifiants, ni commande hors de l'équipe. */
export function appStatusView(st: AppStatus, who: Principal = currentPrincipal()): AppStatus {
  return isOperator(who) ? st : { ...st, pid: null, credentials_file: null, start_command: null };
}

/**
 * Jeux de test au format de l'Analyste (?fixture=crm : Relatio 2004) : jamais pour un agent ; pour un
 * propriétaire, seulement sur un projet de ce logiciel (même garde que le plan d'extraction de test).
 */
export function assertFixtureAllowed(who: Principal = currentPrincipal()) {
  if (who.kind !== "user") throw new ApiError(403, "Jeu de test réservé au propriétaire du projet et à l'équipe REBORN");
  if (isOperator(who)) return;
  const software = getProject().source_system;
  if (software && !/relatio/i.test(software)) {
    throw new ApiError(409, `Le jeu de test décrit le logiciel de test Relatio 2004 : il ne s'applique pas à « ${software} ».`);
  }
}

/* ------------------------------------------------------------------ */
/* Observations, évènements, schémas, règles                            */
/* ------------------------------------------------------------------ */

/** Empreinte du contenu d'une observation (pour reconnaître un renvoi à l'identique). */
const fingerprint = (o: Observation) => JSON.stringify([o.inputs, o.observed_output ?? {}, o.status ?? "success", o.error ?? null]);

const hasClaim = (raw: unknown): raw is { project_id: unknown } => !!raw && typeof raw === "object" && "project_id" in raw && (raw as { project_id?: unknown }).project_id !== undefined;

/** Un project_id envoyé dans le corps doit désigner exactement le projet retenu par REBORN (sinon 422). */
function checkClaim(raw: unknown, resolved: string | null, what: string) {
  if (!hasClaim(raw)) return;
  if (raw.project_id !== resolved) {
    throw new ApiError(422, `${what} : project_id ne correspond pas au projet de la requête. Le projet est fixé par REBORN : désignez-le par ?project= (ou par l'investigation).`);
  }
}

/** Investigation citée par un envoi : elle doit exister et appartenir au projet de la requête (422 sinon). */
function citedInvestigation(id: string | undefined, what = "investigation_id"): Investigation | null {
  if (!id) return null;
  const inv = investigationById(id);
  if (!inv) throw new ApiError(422, `${what} inconnu : ${id}`);
  const scope = currentScope();
  if (scope && (inv.project_id ?? null) !== scope) throw new ApiError(422, `${what} ${id} : investigation d'un autre projet que celui de la requête (?project=).`);
  return inv;
}

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
  const scope = currentScope();
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
    // L'observation hérite du projet de son investigation, sinon de la requête
    const inv = citedInvestigation(o.investigation_id);
    checkClaim(o, inv ? (inv.project_id ?? null) : scope, o.experiment_id);
  }
  const s = getState();
  const target = (o: Observation) => o.investigation_id ?? activeInvestigationFor(scope)?.id ?? undefined;
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
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: AgentEvent[] = [];
  if (opts.external) {
    for (const e of list) {
      if ((RESERVED_EVENT_TYPES as readonly string[]).includes(e.type)) {
        throw new ApiError(422, `Type d'évènement « ${e.type} » réservé à la plateforme. Utilisez /api/observations, /api/rules ou /api/schema, ou un type parmi : action, form_discovered, hypothesis, experiment_request, log, error.`);
      }
      if (e.source === "platform") throw new ApiError(422, "source « platform » réservée à REBORN (explorer, analyst ou user)");
    }
  }
  // Tout l'envoi est vérifié avant la première écriture (rattachement compris)
  list.forEach((e, k) => {
    citedInvestigation(e.investigation_id);
    checkClaim(items[k], attribution({ investigation_id: e.investigation_id, type: e.type }).project_id ?? null, `Évènement « ${e.title.slice(0, 60)} »`);
  });
  for (const e of list) {
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
  const target = investigation_id ?? inv;
  const cited = citedInvestigation(target);
  checkClaim(schema, cited ? (cited.project_id ?? null) : currentScope(), "Schéma d'interface");
  const { project_id: _claimed, ...body } = clean as AppSchema & { project_id?: unknown };
  const stored = addSchema(body, source, target);
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

/**
 * Analyste → REBORN : modèle de règles de la portée (projet de la requête, sinon atelier), comparé aux
 * observations de cette portée seulement.
 */
export function publishRules(raw: unknown, opts: { source?: string; dryRun?: boolean } = {}): PublishResult {
  const model = parseWith(RuleModelSchema, raw) as RuleModel;
  checkClaim(model, currentScope(), "Modèle de règles");
  const project = currentScope();
  const app = resolveApp(model, currentSchema(project), observationsOf(project));
  const issues = validateModel(model, { fields: app.fields });
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) throw new ApiError(422, `Modèle refusé : ${errors.length} erreur${errors.length > 1 ? "s" : ""} de validation`, issues);
  const warnings = issues.filter((i) => i.level !== "error");

  const stored = opts.dryRun ? null : addRuleModel(model, opts.source ?? "analyst", warnings);
  const scope = activeInvestigationFor(project)?.id ?? "all";
  const report = compareAll(stored ?? model, observationsOf(project), scope, { fields: app.fields });
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

/**
 * Demande d'investigation : projet désigné par le corps (project_id) et/ou par la requête (?project=,
 * déjà contrôlé par handler()) — identiques s'ils sont deux (400 sinon) ; le projet doit exister (404).
 */
export function investigationInput(raw: unknown): Parameters<typeof createInvestigation>[0] {
  const p = parseWith(InvestigationCreateSchema, raw);
  const scope = currentScope();
  if (p.project_id && scope && p.project_id !== scope) throw new ApiError(400, "Projet désigné deux fois de façon différente (project_id du corps et ?project=)");
  const project = p.project_id ?? scope ?? undefined;
  if (project && !projectExists(project)) throw new ApiError(404, "Projet introuvable");
  const { project_id: _p, ...rest } = p;
  return { ...rest, ...(project ? { project_id: project } : {}) };
}

export function launchInvestigation(raw: unknown): Investigation {
  return createInvestigation(investigationInput(raw));
}

/** Application reconstruite courante de la portée (projet de la requête, sinon atelier), telle que la verra /app. */
export function currentAppDescription() {
  return resolveApp(currentModel(), currentSchema(), observationsOf());
}

export { activeInvestigation };
