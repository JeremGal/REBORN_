import type { AgentEvent, Investigation } from "@/lib/types";
import type { ProjectStatus } from "@/components/project/ProjectProvider";
import { agreePlurals, formatInt } from "@/components/ds/format";

/*
 * Chronologie « Activité » : évènements réels du Studio (journal, filtré par le serveur selon le
 * compte) et changements d'état enregistrés dans chaque projet (status_history). Fonctions pures.
 */

/** Projet d'un évènement : champ du serveur, sinon donnée du journal, sinon investigation rattachée. */
export function eventProjectId(e: AgentEvent & { project_id?: string }, investigations: Pick<Investigation, "id" | "project_id">[]): string | null {
  if (typeof e.project_id === "string" && e.project_id) return e.project_id;
  const data = e.data as { project_id?: unknown } | undefined;
  if (data && typeof data === "object" && typeof data.project_id === "string" && data.project_id) return data.project_id;
  if (!e.investigation_id) return null;
  return investigations.find((i) => i.id === e.investigation_id)?.project_id ?? null;
}

export type TimelineCategory = "projet" | "agents";

export interface TimelineEntry {
  id: string;
  at: string;
  projectId: string;
  category: TimelineCategory;
  /** Qui est à l'origine de l'évènement, en clair. */
  origin: string;
  title: string;
  detail?: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  /** Changement d'état du projet (libellé de l'état). */
  status?: string;
  /** Code de l'état, pour un changement d'état. */
  statusCode?: ProjectStatus;
  /** Réception de données (fichiers importés ou exports récupérés), regroupée par série consécutive. */
  received?: { files: string[]; rows: number };
}

/**
 * Changement d'état « de routine » (en cours, connecté…) : masqué par défaut dans l'Activité, car il double
 * presque toujours un évènement métier. Un échec, une intervention demandée ou une livraison restent visibles.
 */
export const isRoutineStatus = (t: TimelineEntry) => t.statusCode !== undefined && t.tone === "neutral" && t.statusCode !== "PAUSED";

/** « Données reçues : clients.csv (1 198 ligne(s)) », raison posée par le Studio à chaque réception de fichier. */
const RECEIVED = /^Données reçues : (.+?) \((\d+) ligne\(s\)\)$/;

const ORIGIN: Record<AgentEvent["source"], string> = {
  explorer: "Agent d'exploration",
  analyst: "Agent d'analyse",
  platform: "REBORN Studio",
  user: "Action manuelle",
};

const AGENT_TYPES = new Set<AgentEvent["type"]>(["action", "observation", "form_discovered", "hypothesis", "experiment_request", "rules_updated", "schema_updated", "drift", "investigation_started", "investigation_completed"]);

function toneOfEvent(e: AgentEvent): TimelineEntry["tone"] {
  if (e.type === "error") return "bad";
  if (e.type === "drift") return "warn";
  if (e.type === "validation" || e.type === "investigation_completed") return "ok";
  return "neutral";
}

const STATUS_TONE: Partial<Record<ProjectStatus, TimelineEntry["tone"]>> = {
  FAILED: "bad",
  NEEDS_HUMAN_REVIEW: "warn",
  CONNECTION_PENDING: "neutral",
  CONNECTED: "ok",
  READY_FOR_REVIEW: "ok",
  PUBLISHED: "ok",
};

export interface StatusChange {
  status: ProjectStatus;
  label: string;
  at: string;
  reason: string;
}

/**
 * Fusionne évènements et changements d'état des projets visibles, du plus récent au plus ancien.
 * Un changement d'état qui répète mot pour mot un évènement du même projet (± 5 s) n'est pas dupliqué.
 */
export function buildTimeline(input: {
  events: (AgentEvent & { project_id?: string })[];
  investigations: Pick<Investigation, "id" | "project_id">[];
  projects: { id: string; history: StatusChange[] }[];
}): TimelineEntry[] {
  const visible = new Set(input.projects.map((p) => p.id));
  const out: TimelineEntry[] = [];
  const texts = new Map<string, number[]>(); // projet|texte → horodatages
  for (const e of input.events) {
    const pid = eventProjectId(e, input.investigations);
    if (!pid || !visible.has(pid)) continue;
    out.push({
      id: `e:${e.id}`,
      at: e.ts,
      projectId: pid,
      category: AGENT_TYPES.has(e.type) || e.source === "explorer" || e.source === "analyst" ? "agents" : "projet",
      origin: ORIGIN[e.source] ?? "REBORN Studio",
      title: agreePlurals(e.title),
      detail: e.detail ? agreePlurals(e.detail) : e.detail,
      tone: toneOfEvent(e),
    });
    for (const t of [e.title, e.detail]) {
      if (!t) continue;
      const k = `${pid}|${t.trim()}`;
      texts.set(k, [...(texts.get(k) ?? []), Date.parse(e.ts)]);
    }
  }
  const eventTimes = new Map<string, number[]>();
  for (const e of out) eventTimes.set(e.projectId, [...(eventTimes.get(e.projectId) ?? []), Date.parse(e.at)]);
  for (const p of input.projects) {
    p.history.forEach((h, i) => {
      const at = Date.parse(h.at);
      const echo = texts.get(`${p.id}|${h.reason.trim()}`)?.some((t) => Math.abs(t - at) <= 5000);
      // La création est déjà racontée par l'évènement du journal (« Projet … créé ») : pas de doublon.
      const creation = h.status === "CREATED" && (eventTimes.get(p.id) ?? []).some((t) => Math.abs(t - at) <= 5000);
      if (echo || creation) return;
      const got = RECEIVED.exec(h.reason.trim());
      if (got) {
        // Une réception de fichier est un fait du projet, pas un changement d'état : regroupée plus bas
        out.push({ id: `r:${p.id}:${i}:${h.at}`, at: h.at, projectId: p.id, category: "projet", origin: "Données du projet", title: "Données reçues", tone: "neutral", received: { files: [got[1]], rows: Number(got[2]) } });
        return;
      }
      out.push({
        id: `s:${p.id}:${i}:${h.at}`,
        at: h.at,
        projectId: p.id,
        category: "projet",
        origin: "État du projet",
        title: `État : ${h.label}`,
        detail: h.reason ? agreePlurals(h.reason) : undefined,
        tone: STATUS_TONE[h.status] ?? "neutral",
        status: h.label,
        statusCode: h.status,
      });
    });
  }
  return groupReceived(out.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)));
}

/**
 * Réceptions consécutives d'un même projet (une extraction dépose 11 fichiers d'un coup) : une seule ligne,
 * « 11 fichiers reçus · 21 675 lignes », au lieu de 11 lignes identiques. Liste triée du plus récent au plus ancien.
 */
function groupReceived(list: TimelineEntry[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const t of list) {
    const last = out.at(-1);
    if (t.received && last?.received && last.projectId === t.projectId) {
      last.received = { files: [...last.received.files, ...t.received.files], rows: last.received.rows + t.received.rows };
      continue;
    }
    out.push(t.received ? { ...t, received: { ...t.received } } : t);
  }
  for (const t of out) {
    if (!t.received) continue;
    const { files, rows } = t.received;
    const n = files.length;
    t.title = n > 1 ? `Données reçues : ${formatInt(n)} fichiers` : `Données reçues : ${files[0]}`;
    const lines = rows ? `${formatInt(rows)} ${rows > 1 ? "lignes" : "ligne"}` : null;
    // Ordre de réception (le plus ancien d'abord) ; une archive de pièces jointes n'a pas de lignes : rien n'est dit à tort
    t.detail = n > 1 ? [lines ? `${lines} au total` : null, [...files].reverse().join(", ")].filter(Boolean).join(" · ") : (lines ?? undefined);
  }
  return out;
}

/** Titre des évènements d'effacement tracés par le Studio (lib/migration/credentials.ts), sans aucune valeur. */
const ERASED = /^Identifiants (?:de l.ancien logiciel )?effacés\s*:\s*(.+)$/i;

/**
 * Dernier effacement des identifiants d'un projet, lu dans le journal réel du Studio (évènement « Identifiants
 * … effacés : <raison> ») : date et raison (fin de l'extraction, échéance de 24 h, demande du client…).
 * null si le journal n'en contient aucun. Fonction pure (testée).
 */
export function lastCredentialErasure(events: readonly AgentEvent[] | undefined, projectId: string, investigations: Pick<Investigation, "id" | "project_id">[] = []): { at: string; reason: string } | null {
  if (!events) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const m = ERASED.exec(e.title ?? "");
    if (m && eventProjectId(e, investigations) === projectId) return { at: e.ts, reason: m[1].trim().replace(/\.$/, "") };
  }
  return null;
}

/** Clé de regroupement par jour (date locale) et libellé lisible : « Aujourd'hui », « Hier », « lundi 3 novembre ». */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return "Aujourd'hui";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y.toISOString())) return "Hier";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
