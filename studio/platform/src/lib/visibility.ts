import type { AgentEvent, Investigation, Observation, RebornState, StoredRuleModel, StoredSchema } from "./types";

/**
 * Isolation des clients dans l'état global de l'atelier (lot B1, SPEC §4, auth-map/r0.md §6).
 * Fonctions PURES (aucune lecture de fichier ni de requête) : testées directement.
 *
 * Le projet d'un élément est fixé par le SERVEUR à l'écriture (lib/store.ts) :
 * - évènement : `project_id` au premier niveau (portée de la requête, sinon projet de son investigation) ;
 * - observation : `project_id` hérité de son investigation ;
 * - modèle de règles, schéma d'écran : `project_id` de la portée (ou de l'investigation) de publication.
 * Données historiques (avant ce rattachement) : journal de migration par `data.project_id` (posé par le
 * serveur : le type « migration » est refusé depuis l'API), le reste par le projet de l'investigation.
 * Ce qui reste sans projet (atelier, anciens évènements) n'est visible que de l'équipe et des agents.
 */

/** Rattachement à un projet fixé par le serveur ; absent : atelier, ou donnée historique. */
export type WithProject = { project_id?: string };
export type ScopedEvent = AgentEvent & WithProject;
export type ScopedObservation = Observation & WithProject;
export type ScopedModel = StoredRuleModel & WithProject & { investigation_id?: string };
export type ScopedSchema = StoredSchema & WithProject & { investigation_id?: string };

/**
 * Ce que voit l'appelant : tout (équipe REBORN et agents internes, sans projet désigné), ou un ensemble de
 * projets (client : ceux dont il est propriétaire ; n'importe quel appelant : le seul projet désigné).
 */
export type Visibility = { readonly all: true } | { readonly all: false; readonly projects: ReadonlySet<string> };
export const SEE_ALL: Visibility = Object.freeze({ all: true as const });
export const onlyProjects = (projects: Iterable<string>): Visibility => ({ all: false, projects: new Set(projects) });

/** Identité minimale nécessaire au calcul de la visibilité (structure de lib/auth/principal.ts). */
export type Viewer = { kind: "anonymous" } | { kind: "service" } | { kind: "user"; userId: string; role: "client" | "operator" };

/**
 * Visibilité d'un appelant. `designated` : projet désigné par la requête (?project=, en-tête), dont
 * handler() a DÉJÀ vérifié l'accès (404 sinon) : la vue se limite alors à ce projet, pour tout le monde.
 * `owned` : projets dont un compte est propriétaire (injecté : la fonction reste pure).
 */
export function visibilityFor(v: Viewer, designated: string | null, owned: (userId: string) => ReadonlySet<string>): Visibility {
  if (designated) return onlyProjects([designated]);
  if (v.kind === "service" || (v.kind === "user" && v.role === "operator")) return SEE_ALL;
  if (v.kind === "user") return onlyProjects(owned(v.userId));
  return onlyProjects([]);
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Projet d'une investigation (null : atelier, ou investigation inconnue). */
export function investigationProject(s: Pick<RebornState, "investigations">, id: string | null | undefined): string | null {
  if (!id) return null;
  return str(s.investigations.find((i) => i.id === id)?.project_id);
}

/** Projet d'un évènement (null : atelier ou évènement historique sans projet résolu). */
export function eventProject(s: Pick<RebornState, "investigations">, e: AgentEvent): string | null {
  const top = str((e as ScopedEvent).project_id);
  if (top) return top;
  if (e.type === "migration") {
    // Journal historique : projet posé par le serveur dans data (jamais l'investigation active d'alors,
    // à laquelle ces évènements étaient rattachés d'office, souvent celle d'un autre projet).
    const d = e.data;
    return d && typeof d === "object" ? str((d as { project_id?: unknown }).project_id) : null;
  }
  return investigationProject(s, e.investigation_id);
}

/** Projet d'une observation : celui fixé à l'écriture, sinon celui de son investigation. */
export function observationProject(s: Pick<RebornState, "investigations">, o: Observation): string | null {
  return str((o as ScopedObservation).project_id) ?? investigationProject(s, o.investigation_id);
}

const visibleProject = (v: Visibility, p: string | null | undefined): boolean => v.all || (!!p && v.projects.has(p));

/** L'appelant peut-il voir cet évènement ? */
export function canSee(v: Visibility, s: Pick<RebornState, "investigations">, e: AgentEvent): boolean {
  return v.all || visibleProject(v, eventProject(s, e));
}

/** L'appelant peut-il voir cette investigation ? (sans projet : équipe et agents seulement) */
export function canSeeInvestigation(v: Visibility, i: Pick<Investigation, "project_id">): boolean {
  return v.all || visibleProject(v, i.project_id);
}

/** L'appelant peut-il voir cette observation ? */
export function canSeeObservation(v: Visibility, s: Pick<RebornState, "investigations">, o: Observation): boolean {
  return v.all || visibleProject(v, observationProject(s, o));
}

/**
 * Révision vue par l'appelant : compteur global pour une vue complète ; sinon numéro du dernier
 * évènement de ses projets (`lastSeq` : table tenue par le store à chaque écriture, O(projets)).
 * L'activité des autres projets ne la fait jamais bouger.
 */
export function viewRevision(v: Visibility, s: Pick<RebornState, "revision">, lastSeq: ReadonlyMap<string, number>): number {
  if (v.all) return s.revision;
  let max = 0;
  for (const p of v.projects) max = Math.max(max, lastSeq.get(p) ?? 0);
  return max;
}

/**
 * État vu par l'appelant, même forme que l'état complet (les pages fonctionnent sans changement) :
 * investigations, évènements, observations, modèles et schémas de SES projets uniquement. Les éléments
 * sans projet (atelier, historique) et ceux des autres projets n'y figurent jamais. Pas de compteur
 * global : révision et numéro d'évènement sont ceux de ses projets, numéro d'investigation masqué.
 * Vue complète (`SEE_ALL`) : l'état tel quel.
 */
export function viewState(v: Visibility, s: RebornState, lastSeq: ReadonlyMap<string, number> = new Map()): RebornState {
  if (v.all) return s;
  const investigations = s.investigations.filter((i) => canSeeInvestigation(v, i));
  const events = s.events.filter((e) => canSee(v, s, e));
  const observations = s.observations.filter((o) => canSeeObservation(v, s, o));
  const models = s.models.filter((m) => visibleProject(v, (m as ScopedModel).project_id));
  const schemas = s.schemas.filter((x) => visibleProject(v, (x as ScopedSchema).project_id));
  // Investigation « active » de la vue : la plus récente en cours parmi ses projets (jamais celle d'un autre)
  const running = investigations.filter((i) => i.status === "running");
  const active = running.find((i) => i.id === s.active_investigation_id) ?? running.at(-1) ?? null;
  const revision = Math.max(viewRevision(v, s, lastSeq), events.at(-1)?.seq ?? 0);
  return { investigations, active_investigation_id: active?.id ?? null, events, event_seq: revision, investigation_seq: 0, observations, models, schemas, revision };
}
