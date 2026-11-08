import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@/lib/types";
import { buildTimeline, dayLabel, eventProjectId, isRoutineStatus, lastCredentialErasure } from "./timeline";

/** Lot B3 : chronologie « Activité » (évènements réels + changements d'état des projets). */

let seq = 0;
const ev = (over: Partial<AgentEvent> & { project_id?: string }): AgentEvent & { project_id?: string } => ({
  id: `ev${++seq}`,
  seq,
  ts: "2026-11-07T10:00:00.000Z",
  source: "platform",
  type: "migration",
  title: "Évènement",
  ...over,
});

describe("eventProjectId", () => {
  const investigations = [{ id: "INV_1", project_id: "MIG_aaaaaaaa" }, { id: "INV_2" }];
  it("champ du serveur, puis donnée du journal, puis investigation", () => {
    expect(eventProjectId(ev({ project_id: "MIG_bbbbbbbb", data: { project_id: "MIG_cccccccc" } }), investigations)).toBe("MIG_bbbbbbbb");
    expect(eventProjectId(ev({ data: { project_id: "MIG_cccccccc" } }), investigations)).toBe("MIG_cccccccc");
    expect(eventProjectId(ev({ type: "observation", investigation_id: "INV_1" }), investigations)).toBe("MIG_aaaaaaaa");
    expect(eventProjectId(ev({ type: "observation", investigation_id: "INV_2" }), investigations)).toBeNull();
    expect(eventProjectId(ev({ type: "log" }), investigations)).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("ne garde que les projets visibles, fusionne et trie du plus récent au plus ancien", () => {
    const t = buildTimeline({
      events: [
        ev({ ts: "2026-11-07T10:00:00.000Z", title: "Fichier importé : clients.csv", data: { project_id: "MIG_aaaaaaaa" } }),
        ev({ ts: "2026-11-07T11:00:00.000Z", title: "Projet d'un autre compte", data: { project_id: "MIG_zzzzzzzz" } }),
        ev({ ts: "2026-11-07T09:00:00.000Z", type: "action", source: "explorer", title: "Écran Clients ouvert", investigation_id: "INV_1" }),
        ev({ ts: "2026-11-07T08:00:00.000Z", type: "log", title: "Atelier : sans projet" }),
      ],
      investigations: [{ id: "INV_1", project_id: "MIG_aaaaaaaa" }],
      projects: [{ id: "MIG_aaaaaaaa", history: [{ status: "CREATED", label: "Créé", at: "2026-11-07T07:00:00.000Z", reason: "Projet créé" }] }],
    });
    expect(t.map((x) => [x.title, x.category, x.origin])).toEqual([
      ["Fichier importé : clients.csv", "projet", "REBORN Studio"],
      ["Écran Clients ouvert", "agents", "Agent d'exploration"],
      ["État : Créé", "projet", "État du projet"],
    ]);
  });

  it("un changement d'état qui répète un évènement du même projet n'est pas dupliqué", () => {
    const t = buildTimeline({
      events: [ev({ ts: "2026-11-07T10:00:02.000Z", title: "Migration RUN_1 : écarts à examiner avant mise en service", data: { project_id: "MIG_aaaaaaaa" } })],
      investigations: [],
      projects: [
        {
          id: "MIG_aaaaaaaa",
          history: [
            { status: "NEEDS_HUMAN_REVIEW", label: "Validation humaine requise", at: "2026-11-07T10:00:00.000Z", reason: "Migration RUN_1 : écarts à examiner avant mise en service" },
            { status: "FAILED", label: "Échec — intervention requise", at: "2026-11-07T12:00:00.000Z", reason: "Mise en service interrompue : port occupé" },
          ],
        },
      ],
    });
    expect(t.map((x) => x.title)).toEqual(["État : Échec — intervention requise", "Migration RUN_1 : écarts à examiner avant mise en service"]);
    expect(t[0].tone).toBe("bad");
  });

  it("la création n'est pas racontée deux fois (évènement du journal + état « Créé »)", () => {
    const t = buildTimeline({
      events: [ev({ ts: "2026-11-07T10:00:00.400Z", source: "user", title: "Projet de migration « Garage » créé", data: { project_id: "MIG_aaaaaaaa" } })],
      investigations: [],
      projects: [{ id: "MIG_aaaaaaaa", history: [{ status: "CREATED", label: "Créé", at: "2026-11-07T10:00:00.000Z", reason: "Projet créé" }] }],
    });
    expect(t.map((x) => x.title)).toEqual(["Projet de migration « Garage » créé"]);
  });
});

describe("dayLabel", () => {
  it("aujourd'hui, hier, puis la date", () => {
    const now = new Date(2026, 10, 7, 15, 0, 0);
    expect(dayLabel(new Date(2026, 10, 7, 9, 0, 0).toISOString(), now)).toBe("Aujourd'hui");
    expect(dayLabel(new Date(2026, 10, 6, 23, 0, 0).toISOString(), now)).toBe("Hier");
    expect(dayLabel(new Date(2026, 10, 3, 12, 0, 0).toISOString(), now)).toBe("mardi 3 novembre");
  });
});

describe("Activité lisible (V18)", () => {
  const history = [
    { status: "EXTRACTING" as const, label: "Données en cours de récupération", at: "2026-11-07T10:00:01.000Z", reason: "Données reçues : clients.csv (1198 ligne(s))" },
    { status: "EXTRACTING" as const, label: "Données en cours de récupération", at: "2026-11-07T10:00:02.000Z", reason: "Données reçues : devis.csv (1800 ligne(s))" },
    { status: "EXTRACTING" as const, label: "Données en cours de récupération", at: "2026-11-07T10:00:03.000Z", reason: "Données reçues : documents.zip (0 ligne(s))" },
    { status: "MIGRATING" as const, label: "Migration en cours", at: "2026-11-07T11:00:00.000Z", reason: "Migration RUN_001 lancée" },
    { status: "FAILED" as const, label: "Échec — intervention requise", at: "2026-11-07T12:00:00.000Z", reason: "Mise en service interrompue : port occupé" },
  ];

  it("réceptions consécutives regroupées en une ligne, avec le total réel des lignes (archive sans « 0 ligne »)", () => {
    const t = buildTimeline({ events: [], investigations: [], projects: [{ id: "MIG_aaaaaaaa", history }] });
    const received = t.filter((x) => x.received);
    expect(received).toHaveLength(1);
    expect(received[0].title).toBe("Données reçues : 3 fichiers");
    expect(received[0].detail).toBe("2\u00a0998 lignes au total · clients.csv, devis.csv, documents.zip");
    expect(isRoutineStatus(received[0])).toBe(false);
  });

  it("un seul fichier : son nom ; une archive : sans nombre de lignes inventé", () => {
    const t = buildTimeline({ events: [], investigations: [], projects: [{ id: "MIG_aaaaaaaa", history: [history[2]] }] });
    expect(t.map((x) => [x.title, x.detail])).toEqual([["Données reçues : documents.zip", undefined]]);
  });

  it("changements d'état de routine masquables ; échec toujours visible", () => {
    const t = buildTimeline({ events: [], investigations: [], projects: [{ id: "MIG_aaaaaaaa", history }] });
    expect(t.filter(isRoutineStatus).map((x) => x.title)).toEqual(["État : Migration en cours"]);
    expect(t.find((x) => x.title === "État : Échec — intervention requise") && isRoutineStatus(t.find((x) => x.title === "État : Échec — intervention requise")!)).toBe(false);
  });
});

describe("lastCredentialErasure (PR-10)", () => {
  it("dernier effacement du projet, avec sa raison, lu dans le journal (jamais celui d'un autre projet)", () => {
    const events = [
      ev({ ts: "2026-11-08T02:08:00.000Z", title: "Identifiants de l'ancien logiciel effacés : extraction terminée", project_id: "MIG_aaaaaaaa" }),
      ev({ ts: "2026-11-08T03:00:00.000Z", title: "Identifiants effacés : échéance de 24 h atteinte", project_id: "MIG_bbbbbbbb" }),
      ev({ ts: "2026-11-08T03:10:00.000Z", title: "Migration RUN_001 terminée", project_id: "MIG_aaaaaaaa" }),
    ];
    expect(lastCredentialErasure(events, "MIG_aaaaaaaa")).toEqual({ at: "2026-11-08T02:08:00.000Z", reason: "extraction terminée" });
    expect(lastCredentialErasure(events, "MIG_bbbbbbbb")).toEqual({ at: "2026-11-08T03:00:00.000Z", reason: "échéance de 24 h atteinte" });
    expect(lastCredentialErasure(events, "MIG_cccccccc")).toBeNull();
    expect(lastCredentialErasure(undefined, "MIG_aaaaaaaa")).toBeNull();
  });
});

