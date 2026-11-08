import { getState } from "../store";
import { clockNow } from "./credentials";
import { listExecutors, listMissions, type ExecutorOverview, type MissionOverview } from "./analysis";
import { projectIds, projectSummary, type ProjectStatus, type ProjectSummary } from "./project";
import type { MissionStatus } from "./project-contracts";
// Fonctions PURES du parcours (aucun React) : la même règle que la barre latérale et « Mes projets » du client.
import { journey, plural, REQUIRED_STEPS, requiredDone, statusLabel, type StepSlug } from "../../components/shell/journey";

/**
 * Vue d'ensemble de l'équipe REBORN (GET /api/operations, rôle opérateur seulement) : agents d'analyse connectés,
 * file des missions, avancement de chaque projet. MÉTADONNÉES SEULEMENT, assemblées champ par champ (jamais un objet
 * recopié en entier) : aucune donnée métier d'un client (fichiers, tables, valeurs), aucune adresse ni aucun
 * identifiant d'ancien logiciel, aucun demandeur, aucun détail libre d'un agent, aucun jeton ni empreinte.
 * Tous les projets y figurent (l'équipe suit la file) ; leurs pages restent fermées à l'équipe (404).
 */

export interface ProjectStep {
  slug: StepSlug;
  label: string;
  /** done : parcours terminé (logiciel livré) · next : prochaine étape · attention : intervention nécessaire. */
  state: "done" | "next" | "attention";
  text: string;
}

export interface ProjectOverview {
  id: string;
  company: string | null;
  software: string | null;
  status: ProjectStatus;
  status_label: string;
  step: ProjectStep;
  steps_done: number;
  steps_total: number;
  records_migrated: number;
  records_rejected: number;
  pending_decisions: number;
  delivered: boolean;
  /** État de la dernière demande d'analyse du projet (null : aucune). */
  analysis: MissionStatus | null;
  created_at: string;
  updated_at: string | null;
}

export interface AgentOverview extends ExecutorOverview {
  /** Missions que l'exécuteur tient (prise en cours ou intervention attendue). */
  missions: { id: string; project_id: string; company: string | null; status: MissionStatus }[];
}

export interface QueueEntry extends MissionOverview {
  company: string | null;
  software: string | null;
  /** Nom d'instance de l'exécuteur qui l'a prise (null : personne). */
  executor_name: string | null;
}

export interface OperationsOverview {
  ok: true;
  generated_at: string;
  agents: { online: number; total: number; list: AgentOverview[] };
  missions: { queued: number; running: number; needs_human: number; list: QueueEntry[] };
  projects: { total: number; delivered: number; attention: number; list: ProjectOverview[] };
}

const HELD: ReadonlySet<MissionStatus> = new Set(["claimed", "connecting", "connected", "exploring", "needs_human"]);
const RUNNING: ReadonlySet<MissionStatus> = new Set(["claimed", "connecting", "connected", "exploring"]);

/** Étape du parcours d'un projet, calculée comme pour son propriétaire (journey), sans aucun motif libre. */
function stepOf(s: ProjectSummary, investigations: number): { step: ProjectStep; done: number } {
  const steps = journey({ ...s, current: false }, investigations);
  const done = requiredDone(steps);
  if (s.app) return { step: { slug: "livraison", label: "Livraison", state: "done", text: "Logiciel livré" }, done };
  const att = steps.find((x) => x.state === "attention");
  if (att) {
    const text = att.slug === "correspondances" && s.anomalies.pending_decisions > 0 ? `${plural(s.anomalies.pending_decisions, "point à valider", "points à valider")} par le client` : s.status === "FAILED" ? "Échec : intervention requise" : "Intervention nécessaire";
    return { step: { slug: att.slug, label: att.label, state: "attention", text }, done };
  }
  const next = steps.find((x) => x.state === "next");
  if (next) return { step: { slug: next.slug, label: next.label, state: "next", text: "Prochaine étape" }, done };
  return { step: { slug: "livraison", label: "Livraison", state: "done", text: "Parcours terminé" }, done };
}

export async function operationsOverview(): Promise<OperationsOverview> {
  const [executors, missions] = await Promise.all([listExecutors(), listMissions(200)]);
  const st = getState();
  const summaries = new Map<string, ProjectSummary>();
  for (const id of projectIds()) {
    const s = projectSummary(id);
    if (s) summaries.set(id, s);
  }
  const companyOf = (pid: string) => {
    const s = summaries.get(pid);
    return s ? (s.company ?? s.name) : null;
  };
  const lastMission = new Map<string, MissionStatus>();
  for (const m of [...missions].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) lastMission.set(m.project_id, m.status);
  const names = new Map(executors.map((e) => [e.id, e.name]));

  const projects: ProjectOverview[] = [...summaries.values()]
    .map((s) => {
      const { step, done } = stepOf(s, st.investigations.filter((i) => i.project_id === s.id).length);
      return {
        id: s.id,
        company: s.company ?? s.name,
        software: s.software,
        status: s.status,
        status_label: statusLabel(s),
        step,
        steps_done: done,
        steps_total: REQUIRED_STEPS,
        records_migrated: s.data.imported,
        records_rejected: s.data.rejected,
        pending_decisions: s.anomalies.pending_decisions,
        delivered: !!s.app,
        analysis: lastMission.get(s.id) ?? null,
        created_at: s.created_at,
        updated_at: s.updated_at,
      };
    })
    .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));

  const agents: AgentOverview[] = executors.map((e) => ({
    ...e,
    missions: missions.filter((m) => m.executor_id === e.id && HELD.has(m.status)).map((m) => ({ id: m.id, project_id: m.project_id, company: companyOf(m.project_id), status: m.status })),
  }));

  return {
    ok: true,
    generated_at: new Date(clockNow()).toISOString(),
    agents: { online: agents.filter((a) => a.online).length, total: agents.length, list: agents },
    missions: {
      queued: missions.filter((m) => m.status === "queued").length,
      running: missions.filter((m) => RUNNING.has(m.status)).length,
      needs_human: missions.filter((m) => m.status === "needs_human").length,
      list: missions.map((m) => ({ ...m, company: companyOf(m.project_id), software: summaries.get(m.project_id)?.software ?? null, executor_name: m.executor_id ? (names.get(m.executor_id) ?? null) : null })),
    },
    projects: { total: projects.length, delivered: projects.filter((p) => p.delivered).length, attention: projects.filter((p) => p.step.state === "attention").length, list: projects },
  };
}
