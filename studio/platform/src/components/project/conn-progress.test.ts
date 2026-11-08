import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AGENT_UNAVAILABLE, MissionProgressList, normalizeAnalysis } from "./ConnAnalysis";

/*
 * Avancement réel de l'analyse côté client (étapes Connexion et Découverte) : lecture prudente de la réponse de
 * GET /api/projects/[id]/analysis et affichage du déroulé. Un état inconnu n'est jamais présenté comme fait ;
 * chaque étape porte son état en toutes lettres (jamais la couleur seule). Données inventées (jeu de test).
 */

const MISSION = { id: "MIS_0123456789", status: "connected", created_at: "2026-11-08T10:00:00.000Z", expires_at: "2026-11-09T10:00:00.000Z" };

describe("normalizeAnalysis : progression", () => {
  it("garde le message exact sans exécuteur et n'invente aucune progression avant la prise", () => {
    const s = normalizeAnalysis({ state: "queued", agent_available: false, message: AGENT_UNAVAILABLE, mission: { ...MISSION, status: "queued" }, progress: null });
    expect(s.message).toBe("Agent d'analyse non disponible pour le moment.");
    expect(s.executor_available).toBe(false);
    expect(s.progress).toBeNull();
    // Sans mission, une progression envoyée par erreur est ignorée
    expect(normalizeAnalysis({ mission: null, progress: { steps: [{ id: "claimed", label: "x", state: "done" }] } }).progress).toBeNull();
  });

  it("lit les étapes ; un état inconnu devient « en attente », jamais « fait »", () => {
    const s = normalizeAnalysis({
      agent_available: true,
      mission: MISSION,
      progress: {
        steps: [
          { id: "claimed", label: "Prise en charge par l'agent d'analyse", state: "done", at: "2026-11-08T10:01:00.000Z", detail: null },
          { id: "connection", label: "Connexion à votre logiciel réussie", state: "done", at: "2026-11-08T10:02:00.000Z", detail: "Page d'accueil affichée" },
          { id: "screens", label: "3 écrans découverts", state: "termine-peut-etre", at: null, detail: "Accueil · Réservations · Sauvegarde" },
          { label: 42 },
        ],
        screens: 3,
        exports: "beaucoup",
        last_report_at: "2026-11-08T10:03:00.000Z",
      },
    });
    expect(s.progress?.steps.map((x) => [x.id, x.state])).toEqual([
      ["claimed", "done"],
      ["connection", "done"],
      ["screens", "waiting"],
    ]);
    expect(s.progress).toMatchObject({ screens: 3, exports: 0, last_report_at: "2026-11-08T10:03:00.000Z" });
  });
});

describe("MissionProgressList", () => {
  it("liste ordonnée étiquetée, état en toutes lettres, date du fait reçu, détail", () => {
    const html = renderToStaticMarkup(
      createElement(MissionProgressList, {
        progress: {
          screens: 12,
          exports: 0,
          last_report_at: null,
          steps: [
            { id: "claimed", label: "Prise en charge par l'agent d'analyse", state: "done", at: "2026-11-08T10:01:00.000Z", detail: null },
            { id: "connection", label: "Connexion à votre logiciel en cours", state: "current", at: "2026-11-08T10:02:00.000Z", detail: null },
            { id: "screens", label: "12 écrans découverts", state: "done", at: "2026-11-08T10:05:00.000Z", detail: "Accueil · Planning" },
            { id: "export", label: "Export des données", state: "waiting", at: null, detail: "Aucun export déposé pour l'instant" },
            { id: "end", label: "Analyse en échec", state: "failed", at: "2026-11-08T10:09:00.000Z", detail: "connexion échouée" },
          ],
        },
      }),
    );
    expect(html).toMatch(/^<ol aria-label="Déroulé réel de l&#x27;analyse, dans l&#x27;ordre"/);
    expect(html.match(/<li /g)).toHaveLength(5);
    for (const t of ["Fait", "En cours", "En attente", "Échec", "12 écrans découverts", "Accueil · Planning", "Aucun export déposé pour l&#x27;instant"]) expect(html, t).toContain(t);
    expect(html).toMatch(/<time [^>]*2026-11-08T10:05:00\.000Z/);
    // Étape sans fait reçu : aucune date affichée
    expect(html.match(/<time /g)).toHaveLength(4);
  });
});
