import type { ProjectDetails, ProjectStatus, ProjectSummary } from "@/components/project/ProjectProvider";
import { agreePlurals, formatInt } from "@/components/ds/format";

/*
 * Parcours d'un projet et points à traiter, calculés UNIQUEMENT à partir de ce que renvoie l'API
 * (/api/projects, /api/projects/[id]) : aucun score, aucune estimation. Fonctions pures, sans React :
 * barre latérale, vue d'ensemble, liste des projets et tests unitaires s'en servent.
 * ProjectShell.tsx réexporte STEPS, StepSlug, STATUS_TONE, stepDone et hostOf (noms historiques).
 */

/**
 * Étapes du parcours, dans l'ordre des dépendances réelles : on ne peut pas vérifier une
 * migration qui n'a pas eu lieu, ni livrer un logiciel sans base migrée et vérifiée.
 */
export const STEPS = [
  { slug: "connexion", label: "Connexion", hint: "Accès autorisé à l'ancien logiciel" },
  { slug: "decouverte", label: "Découverte", hint: "Écrans, fonctions, règles observés" },
  { slug: "extraction", label: "Données", hint: "Exports et fichiers récupérés" },
  { slug: "correspondances", label: "Correspondances", hint: "Ancien schéma → nouveau" },
  { slug: "migration", label: "Migration", hint: "Nouvelle base construite" },
  { slug: "validation", label: "Validation", hint: "Contrôles sur les vraies données" },
  { slug: "reconstruction", label: "Reconstruction", hint: "Logiciel et règles métier" },
  { slug: "livraison", label: "Livraison", hint: "Logiciel autonome en service" },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"];

export const STATUS_TONE: Record<ProjectStatus, "ok" | "warn" | "bad" | "run" | "idle"> = {
  CREATED: "idle",
  CONNECTION_PENDING: "warn",
  CONNECTED: "ok",
  DISCOVERING: "run",
  EXTRACTING: "run",
  MAPPING: "run",
  RECONSTRUCTING: "run",
  MIGRATING: "run",
  VALIDATING: "run",
  READY_FOR_REVIEW: "ok",
  PUBLISHED: "ok",
  PAUSED: "idle",
  FAILED: "bad",
  NEEDS_HUMAN_REVIEW: "warn",
};

const serverStep = (s: ProjectSummary, id: string) => s.progress.steps.find((x) => x.id === id)?.done ?? false;

/** Une étape est « faite » uniquement sur la base de faits renvoyés par l'API (pas d'estimation). */
export function stepDone(slug: StepSlug, s: ProjectSummary, investigations: number): boolean {
  switch (slug) {
    case "connexion":
      return serverStep(s, "connection");
    case "decouverte":
      return investigations > 0;
    case "extraction":
      return serverStep(s, "extraction");
    case "correspondances":
      return serverStep(s, "mapping");
    case "migration":
      return s.data.imported > 0;
    case "validation":
      return serverStep(s, "migration");
    case "reconstruction":
      // L'étape se termine par la génération et la mise en service ; un modèle métier validé n'en est qu'une partie.
      return !!s.app;
    case "livraison":
      return serverStep(s, "delivery");
  }
}

/** Hôte d'une adresse (« crm.exemple.fr:8080 »), sans chemin ni identifiants. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Étape du projet affichée, d'après l'adresse (/projets/MIG_…/<étape>). */
export function currentStep(pathname: string, projectId: string): StepSlug | null {
  const prefix = `/projets/${projectId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const slug = pathname.slice(prefix.length).split("/")[0];
  return STEPS.some((s) => s.slug === slug) ? (slug as StepSlug) : null;
}

/** Compteur au format français, séparateur de milliers lisible (formatInt du design system). */
export const fmtNumber = (n: number) => formatInt(n);
export const plural = (n: number, one: string, many: string) => `${fmtNumber(n)} ${n > 1 ? many : one}`;

/* ------------------------------------------------------------------ */
/* Parcours : fait / prochaine / attention / à venir                     */
/* ------------------------------------------------------------------ */

/** `optional` : la Découverte (agent d'exploration) tant qu'aucune exploration n'a eu lieu — jamais un préalable. */
export type JourneyState = "done" | "next" | "attention" | "upcoming" | "optional";
export const JOURNEY_LABEL: Record<JourneyState, string> = {
  done: "Fait",
  next: "Prochaine étape",
  attention: "Intervention nécessaire",
  upcoming: "À venir",
  optional: "Facultative",
};

/** Étapes requises (toutes sauf la Découverte, facultative) : c'est sur elles que l'avancement est compté. */
export const REQUIRED_STEPS = 7;
export const requiredDone = (steps: JourneyStep[]) => steps.filter((s) => s.slug !== "decouverte" && s.state === "done").length;

/**
 * Libellé de l'état affiché au client. Le serveur garde EXTRACTING après une extraction terminée ou un import
 * (« Données en cours de récupération ») : dès que des données sont reçues, on affiche « Données reçues », comme
 * l'étape Données marquée « Fait ». Les autres états gardent le libellé du serveur.
 */
export function statusLabel(s: Pick<ProjectSummary, "status" | "status_label" | "data" | "anomalies">): string {
  if (s.status === "EXTRACTING" && s.data.sources > 0) return "Données reçues";
  if (s.status === "MAPPING" && s.anomalies.pending_decisions === 0) return "Correspondances prêtes";
  if (s.status === "RECONSTRUCTING") return "Reconstruction en cours";
  return s.status_label;
}

export interface JourneyStep {
  slug: StepSlug;
  label: string;
  hint: string;
  state: JourneyState;
  /** Ce qui demande une intervention (texte court, issu des données du projet). */
  reason?: string;
}

/** Étape concernée par un état « échec » ou « intervention » (d'après la raison enregistrée par le serveur). */
export function blockedStep(s: ProjectSummary): StepSlug | null {
  if (s.status !== "FAILED" && s.status !== "NEEDS_HUMAN_REVIEW") return null;
  const r = s.status_reason ?? "";
  if (/^Mise en service/i.test(r)) return "livraison";
  if (/^Migration\b.*interrompue/i.test(r)) return "migration";
  if (/^Migration\b/i.test(r)) return "validation";
  if (/^Correspondances\b/i.test(r)) return "correspondances";
  if (/^Extraction\b/i.test(r)) return "extraction";
  if (/^(Connexion|Double authentification|Intervention humaine)/i.test(r)) return "connexion";
  return s.data.imported ? "validation" : s.data.sources ? "migration" : "connexion";
}

const CONNECTION_TROUBLE: Record<string, string> = {
  failed: "Connexion échouée",
  mfa_required: "Double authentification demandée",
  human_needed: "Intervention humaine demandée",
};

/** Le serveur considère la migration acceptée (vérification validée, ou écarts acceptés). */
export const migrationAccepted = (s: ProjectSummary) => serverStep(s, "migration");

/**
 * Parcours des 8 étapes. « Prochaine » = première étape non faite après la dernière faite ;
 * la Découverte (agent d'exploration) n'est jamais un préalable : elle n'est pas proposée comme
 * prochaine étape, elle est « facultative » tant qu'aucune exploration n'a eu lieu (non comptée).
 */
export function journey(s: ProjectSummary | null, investigations: number, details?: ProjectDetails | null): JourneyStep[] {
  if (!s) return STEPS.map((st) => ({ slug: st.slug, label: st.label, hint: st.hint, state: "upcoming" as const }));
  const done = STEPS.map((st) => stepDone(st.slug, s, investigations));
  const attention = new Map<StepSlug, string>();
  const blocked = blockedStep(s);
  if (blocked) attention.set(blocked, agreePlurals(s.status_reason ?? s.status_label));
  const conn = details?.connection?.status;
  if (conn && CONNECTION_TROUBLE[conn] && !attention.has("connexion") && !s.data.sources) attention.set("connexion", details?.connection?.detail || CONNECTION_TROUBLE[conn]);
  const a = s.anomalies;
  if (a.pending_decisions > 0) attention.set("correspondances", plural(a.pending_decisions, "point à valider", "points à valider"));
  if (a.failed_checks > 0) attention.set("validation", plural(a.failed_checks, "contrôle en échec", "contrôles en échec"));
  else if (a.gaps > 0 && s.data.imported > 0 && !migrationAccepted(s)) attention.set("validation", plural(a.gaps, "écart à examiner", "écarts à examiner"));

  let lastDone = -1;
  done.forEach((d, i) => {
    if (d && STEPS[i].slug !== "decouverte") lastDone = i;
  });
  const nextIndex = STEPS.findIndex((st, i) => i > lastDone && !done[i] && st.slug !== "decouverte" && !attention.has(st.slug));
  const firstAttention = STEPS.findIndex((st) => attention.has(st.slug));
  return STEPS.map((st, i) => {
    const reason = attention.get(st.slug);
    let state: JourneyState = "upcoming";
    if (reason) state = "attention";
    else if (done[i]) state = "done";
    else if (st.slug === "decouverte") state = "optional";
    // Une intervention en amont passe avant : pas de « prochaine étape » au-delà d'un point bloquant
    else if (i === nextIndex && (firstAttention < 0 || firstAttention > i)) state = "next";
    return { slug: st.slug, label: st.label, hint: st.hint, state, ...(reason ? { reason } : {}) };
  });
}

export const doneCount = (steps: JourneyStep[]) => steps.filter((s) => s.state === "done").length;

const NEXT_LABEL: Record<StepSlug, string> = {
  connexion: "Donner accès à l'ancien logiciel",
  decouverte: "Voir la découverte",
  extraction: "Importer les données",
  correspondances: "Préparer les correspondances",
  migration: "Lancer la migration",
  validation: "Examiner la vérification",
  reconstruction: "Reconstruire le logiciel",
  livraison: "Mettre en service",
};

/** Action utile suivante (lien vers l'étape concernée), déduite du parcours réel. */
export function nextAction(s: ProjectSummary, steps: JourneyStep[]): { slug: StepSlug; label: string } {
  const att = steps.find((x) => x.state === "attention");
  if (att) {
    if (att.slug === "correspondances" && s.anomalies.pending_decisions > 0) return { slug: att.slug, label: `Valider ${plural(s.anomalies.pending_decisions, "point", "points")}` };
    if (s.status === "FAILED") return { slug: att.slug, label: "Voir l'échec" };
    return { slug: att.slug, label: "Intervenir" };
  }
  if (s.app) return { slug: "livraison", label: "Ouvrir la livraison" };
  const next = steps.find((x) => x.state === "next");
  if (!next) return { slug: "livraison", label: "Voir la livraison" };
  return { slug: next.slug, label: NEXT_LABEL[next.slug] };
}

/** Points ouverts du projet, en clair. Les écarts déjà acceptés sont signalés sans alerte. */
export function openPoints(s: ProjectSummary): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const a = s.anomalies;
  if (a.failed_checks) return { text: plural(a.failed_checks, "contrôle en échec", "contrôles en échec"), tone: "bad" };
  if (a.pending_decisions) return { text: plural(a.pending_decisions, "point à valider", "points à valider"), tone: "warn" };
  if (a.gaps && !migrationAccepted(s)) return { text: plural(a.gaps, "écart à examiner", "écarts à examiner"), tone: "warn" };
  // Écarts déjà acceptés (la vérification passe en « review » dès qu'un écart est documenté) : plus rien d'ouvert
  if (a.gaps) return { text: `Aucun (${plural(a.gaps, "écart accepté", "écarts acceptés")})`, tone: "ok" };
  return { text: "Aucun", tone: "ok" };
}

/* ------------------------------------------------------------------ */
/* Catégories (filtres de « Mes projets », vue d'ensemble)              */
/* ------------------------------------------------------------------ */

export type ProjectCategory = "attention" | "active" | "delivered" | "paused";

export const isDelivered = (s: ProjectSummary) => !!s.app || s.status === "PUBLISHED";

/** Catégorie principale d'un projet (une seule) : livré, en pause, demande une action, ou en cours. */
export function categoryOf(s: ProjectSummary, steps: JourneyStep[]): ProjectCategory {
  if (s.status === "PAUSED") return "paused";
  if (s.status === "FAILED" || s.status === "NEEDS_HUMAN_REVIEW" || steps.some((x) => x.state === "attention")) return "attention";
  if (isDelivered(s)) return "delivered";
  return "active";
}

/* ------------------------------------------------------------------ */
/* Ce qui demande une action (vue d'ensemble)                           */
/* ------------------------------------------------------------------ */

/** Demande d'analyse (POST /api/projects/[id]/analysis, lot B2) : lecture tolérante du format. */
export interface AnalysisInfo {
  state: string | null;
  agentAvailable: boolean | null;
  message: string | null;
  requestedAt: string | null;
}

export function parseAnalysis(raw: unknown): AnalysisInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const nested = [d.request, d.analysis].find((x) => x && typeof x === "object") as Record<string, unknown> | undefined;
  const src = nested ?? d;
  const state = typeof src.state === "string" ? src.state : typeof d.state === "string" ? d.state : null;
  const agent = d.agent && typeof d.agent === "object" ? (d.agent as Record<string, unknown>) : null;
  const agentAvailable = typeof d.agent_available === "boolean" ? d.agent_available : typeof agent?.available === "boolean" ? (agent.available as boolean) : null;
  const message = typeof d.message === "string" ? d.message : null;
  const requestedAt = typeof src.requested_at === "string" ? src.requested_at : null;
  if (state === null && agentAvailable === null) return null;
  return { state, agentAvailable, message, requestedAt };
}

export type ActionTone = "bad" | "warn" | "info";
export type ActionKind = "status" | "checks" | "decisions" | "gaps" | "connection" | "analysis" | "credentials" | "pause";

export interface ActionItem {
  key: string;
  kind: ActionKind;
  projectId: string;
  projectName: string;
  tone: ActionTone;
  title: string;
  detail?: string;
  slug: StepSlug;
  actionLabel: string;
  /** Pour le tri : plus récent d'abord à gravité égale. */
  at: string;
}

export interface ProjectEntry {
  summary: ProjectSummary;
  details: ProjectDetails | null;
  analysis: AnalysisInfo | null;
  investigations: number;
}

const TONE_RANK: Record<ActionTone, number> = { bad: 0, warn: 1, info: 2 };

function remaining(ms: number): string {
  if (ms <= 0) return "imminent";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `dans ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, "0")}` : `dans ${h} h`;
}

export const projectName = (s: Pick<ProjectSummary, "company" | "name">) => s.company ?? s.name;

/** Points d'une même étape d'un projet : un seul affiché (le plus grave ; à égalité, le plus précis). */
const STEP_KINDS: ReadonlySet<ActionKind> = new Set(["status", "checks", "decisions", "gaps", "connection"]);

/**
 * Points qui demandent une action, tous projets confondus, triés par gravité puis du plus récent
 * au plus ancien. `now` est injectable (tests).
 */
export function actionItems(entries: ProjectEntry[], now: number = Date.now()): ActionItem[] {
  const items: ActionItem[] = [];
  for (const { summary: s, details, analysis, investigations } of entries) {
    const name = projectName(s);
    const at = s.updated_at ?? s.created_at;
    const steps = journey(s, investigations, details);
    const push = (it: Omit<ActionItem, "key" | "projectId" | "projectName" | "at">) => items.push({ ...it, key: `${s.id}:${it.kind}:${it.slug}`, projectId: s.id, projectName: name, at });

    if (s.status === "FAILED") {
      push({ kind: "status", tone: "bad", title: "Échec : intervention requise", detail: s.status_reason ?? undefined, slug: blockedStep(s) ?? "connexion", actionLabel: "Voir l'échec" });
    } else if (s.status === "NEEDS_HUMAN_REVIEW") {
      push({ kind: "status", tone: "warn", title: s.status_label, detail: s.status_reason ?? undefined, slug: blockedStep(s) ?? "connexion", actionLabel: "Intervenir" });
    }
    const a = s.anomalies;
    if (a.failed_checks > 0) {
      push({ kind: "checks", tone: "bad", title: plural(a.failed_checks, "contrôle en échec", "contrôles en échec"), detail: "La vérification bloque la mise en service tant que ces contrôles échouent.", slug: "validation", actionLabel: "Voir les contrôles" });
    }
    if (a.pending_decisions > 0) {
      push({ kind: "decisions", tone: "warn", title: plural(a.pending_decisions, "point à valider", "points à valider"), detail: "Correspondance des champs : votre décision est attendue avant la migration.", slug: "correspondances", actionLabel: "Valider" });
    }
    if (a.gaps > 0 && s.data.imported > 0 && !migrationAccepted(s) && a.failed_checks === 0) {
      push({ kind: "gaps", tone: "warn", title: plural(a.gaps, "écart à examiner", "écarts à examiner"), detail: "Écarts relevés par la vérification des données : à accepter ou à corriger.", slug: "validation", actionLabel: "Examiner" });
    }
    const conn = details?.connection;
    if (conn && CONNECTION_TROUBLE[conn.status] && !s.data.sources) {
      push({ kind: "connection", tone: conn.status === "failed" ? "bad" : "warn", title: CONNECTION_TROUBLE[conn.status], detail: conn.detail, slug: "connexion", actionLabel: "Intervenir" });
    }
    if (analysis?.state === "queued" && analysis.agentAvailable === false) {
      push({
        kind: "analysis",
        tone: "info",
        title: "Analyse en attente : agent d'analyse non disponible pour le moment",
        detail: "La demande reste en file et démarrera quand l'agent sera disponible. Vous pouvez importer des fichiers en attendant.",
        slug: "connexion",
        actionLabel: "Voir la demande",
      });
    }
    const cred = details?.credentials;
    if (cred?.stored && cred.expires_at) {
      const left = new Date(cred.expires_at).getTime() - now;
      if (Number.isFinite(left)) {
        push({
          kind: "credentials",
          tone: left < 2 * 3600_000 ? "warn" : "info",
          title: `Accès à l'ancien logiciel : effacement automatique ${remaining(left)}`,
          detail: `${cred.username_hint ? `Compte ${cred.username_hint}. ` : ""}Vous pouvez l'effacer dès maintenant ; un nouvel accès devra être confié pour une nouvelle analyse.`,
          slug: "connexion",
          actionLabel: "Gérer l'accès",
        });
      }
    }
    if (s.status === "PAUSED") {
      push({ kind: "pause", tone: "info", title: "Projet en pause", detail: s.status_reason ?? "Les opérations sont bloquées jusqu'à la reprise.", slug: steps.find((x) => x.state === "next")?.slug ?? "connexion", actionLabel: "Ouvrir le projet" });
    }
  }
  const kept = new Map<string, ActionItem>();
  for (const it of items) {
    const group = STEP_KINDS.has(it.kind) ? `${it.projectId}:etape:${it.slug}` : it.key;
    const cur = kept.get(group);
    const better = !cur || TONE_RANK[it.tone] < TONE_RANK[cur.tone] || (TONE_RANK[it.tone] === TONE_RANK[cur.tone] && cur.kind === "status" && it.kind !== "status");
    if (better) kept.set(group, it);
  }
  return [...kept.values()].sort((x, y) => TONE_RANK[x.tone] - TONE_RANK[y.tone] || y.at.localeCompare(x.at));
}

