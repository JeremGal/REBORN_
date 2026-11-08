/**
 * Règles d'affichage pures des écrans d'un projet (lot C4, demandes des lots B1, B2 et B4a), sans React :
 * testées sans navigateur (src/hardening.test.ts).
 */

/**
 * État du processus du logiciel livré tel que GET /api/migration/app le rapporte. Le numéro de processus
 * (pid) n'est servi qu'à l'équipe REBORN (lot B1) : l'état se lit sur `managed` (fichier run/server.pid
 * retrouvé et processus vivant), jamais sur la présence du pid — sinon un client verrait à tort
 * « Processus lancé hors du Studio » dès que son logiciel tourne.
 */
export type AppProcessState = "managed" | "external" | "unresponsive" | "stopped";

export function appProcessState(app: { running: boolean; managed: boolean }): AppProcessState {
  if (app.running) return app.managed ? "managed" : "external";
  return app.managed ? "unresponsive" : "stopped";
}

/**
 * Capture affichable dans le navigateur du client : uniquement une capture servie par le Studio
 * (/api/shots/<nom>, contrôle d'accès et cache privé côté serveur). Jamais une image externe (http…) :
 * son chargement révélerait au site tiers l'adresse et la navigation du client.
 */
export function safeShotUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return /^\/api\/shots\/[A-Za-z0-9._-]{1,120}$/.test(url) && !url.includes("..") ? url : null;
}

/**
 * Journal de migration d'un projet : évènements « migration » portant SON identifiant de projet (au premier
 * niveau, ou dans data pour les plus anciens), les plus récents en tête. Aucun repli par date : un évènement
 * sans identifiant (atelier, ancien journal global) n'appartient à aucun projet (lot B1).
 */
export function projectJournal<E extends { type: string; data?: unknown }>(events: readonly E[], projectId: string, limit: number): E[] {
  const out: E[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < limit; i--) {
    const e = events[i];
    const pid = (e as { project_id?: unknown }).project_id ?? (e.data as { project_id?: unknown } | undefined)?.project_id;
    if (e.type === "migration" && pid === projectId) out.push(e);
  }
  return out;
}

/**
 * Aperçu de la mission (GET /api/projects/[id]/mission) : sans demande d'analyse, le Studio renvoie
 * mission_id null et une note (lot B2) — l'écran le dit au lieu d'afficher un identifiant absent.
 */
export function missionPreviewLine(
  m: { mission_id?: string | null; status?: string | null; note?: string | null },
  statusLabel: (status: string) => string = (s) => s,
): { kind: "preview" | "mission"; text: string } {
  if (!m.mission_id) return { kind: "preview", text: m.note?.trim() || "Aperçu : aucune analyse demandée pour ce projet. La mission sera créée par « Analyser mon logiciel »." };
  return { kind: "mission", text: `Mission ${m.mission_id}${m.status ? ` · ${statusLabel(m.status)}` : ""}` };
}
