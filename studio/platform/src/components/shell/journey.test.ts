import { describe, expect, it } from "vitest";
import type { ProjectDetails, ProjectSummary } from "@/components/project/ProjectProvider";
import { actionItems, blockedStep, categoryOf, deliveredUrl, journey, nextAction, openPoints, parseAnalysis, plural, REQUIRED_STEPS, requiredDone, statusLabel, STEPS } from "./journey";

/** Lot B3 : parcours et points à traiter, calculés uniquement à partir des réponses de l'API. */

function summary(over: Partial<ProjectSummary> = {}, steps: Partial<Record<string, boolean>> = {}): ProjectSummary {
  const ids = ["connection", "extraction", "mapping", "migration", "rules", "delivery"];
  return {
    id: "MIG_0123abcd",
    name: "Garage Martin",
    company: "Garage Martin",
    software: "Relatio 2004",
    legacy_url: "http://crm.exemple.test:4100/login",
    status: "CREATED",
    status_label: "Créé",
    status_reason: "Projet créé",
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-02T10:00:00.000Z",
    current: false,
    progress: { done: 0, total: 6, steps: ids.map((id) => ({ id, label: id, done: !!steps[id] })) },
    data: { sources: 0, source_rows: 0, imported: 0, rejected: 0 },
    anomalies: { pending_decisions: 0, gaps: 0, failed_checks: 0 },
    business_model: null,
    app: null,
    ...over,
  };
}

const details = (over: Partial<ProjectDetails> = {}): ProjectDetails => ({
  notes: null,
  software_type: null,
  authorization: null,
  connection: null,
  credentials: { stored: false },
  status_history: [],
  ...over,
});

const states = (s: ProjectSummary, inv = 0, d?: ProjectDetails) => journey(s, inv, d).map((x) => x.state);

describe("journey", () => {
  it("projet neuf : la connexion est la prochaine étape, la Découverte facultative, le reste à venir", () => {
    expect(states(summary())).toEqual(["next", "optional", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("la Découverte (agent) n'est jamais imposée comme prochaine étape", () => {
    const s = summary({ data: { sources: 2, source_rows: 120, imported: 0, rejected: 0 } }, { connection: true, extraction: true });
    expect(states(s)).toEqual(["done", "optional", "done", "next", "upcoming", "upcoming", "upcoming", "upcoming"]);
    // avec une exploration réelle, elle est faite
    expect(states(s, 1)[1]).toBe("done");
  });

  it("points à valider : intervention sur les correspondances, pas de « prochaine » au-delà", () => {
    const s = summary({ status: "NEEDS_HUMAN_REVIEW", status_label: "Validation humaine requise", status_reason: "Correspondances v2 : 3 point(s) à valider", data: { sources: 1, source_rows: 10, imported: 0, rejected: 0 }, anomalies: { pending_decisions: 3, gaps: 0, failed_checks: 0 } }, { connection: true, extraction: true });
    const j = journey(s, 0);
    expect(j.map((x) => x.state)).toEqual(["done", "optional", "done", "attention", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(j[3].reason).toBe("3 points à valider");
    expect(nextAction(s, j)).toEqual({ slug: "correspondances", label: "Valider 3 points" });
  });

  it("contrôles en échec : intervention sur la validation, avec l'échec expliqué", () => {
    const s = summary({ status: "FAILED", status_label: "Échec — intervention requise", status_reason: "Migration RUN_1 : contrôles bloquants en échec", data: { sources: 1, source_rows: 10, imported: 10, rejected: 0 }, anomalies: { pending_decisions: 0, gaps: 0, failed_checks: 2 } }, { connection: true, extraction: true, mapping: true });
    expect(blockedStep(s)).toBe("validation");
    const j = journey(s, 0);
    expect(j[5]).toMatchObject({ slug: "validation", state: "attention", reason: "2 contrôles en échec" });
    expect(nextAction(s, j)).toEqual({ slug: "validation", label: "Voir l'échec" });
    expect(categoryOf(s, j)).toBe("attention");
  });

  it("migration interrompue → étape Migration ; mise en service interrompue → Livraison ; connexion → Connexion", () => {
    expect(blockedStep(summary({ status: "FAILED", status_reason: "Migration RUN_2 interrompue : disque plein" }))).toBe("migration");
    expect(blockedStep(summary({ status: "FAILED", status_reason: "Mise en service interrompue : port occupé" }))).toBe("livraison");
    expect(blockedStep(summary({ status: "NEEDS_HUMAN_REVIEW", status_reason: "Double authentification demandée — code SMS" }))).toBe("connexion");
    expect(blockedStep(summary({ status: "CONNECTED" }))).toBeNull();
  });

  it("écarts acceptés : plus d'intervention ; écarts non acceptés : à examiner", () => {
    const base = { data: { sources: 1, source_rows: 10, imported: 10, rejected: 0 }, anomalies: { pending_decisions: 0, gaps: 2, failed_checks: 0 } };
    expect(journey(summary(base, { connection: true, extraction: true, mapping: true }), 0)[5].state).toBe("attention");
    expect(journey(summary(base, { connection: true, extraction: true, mapping: true, migration: true }), 0)[5].state).toBe("done");
  });

  it("logiciel livré : toutes les étapes faites sauf la Découverte, action « Ouvrir la livraison »", () => {
    const s = summary(
      { status: "PUBLISHED", data: { sources: 1, source_rows: 10, imported: 10, rejected: 0 }, app: { id: "garage-crm", port: 5051, deployed_at: "2026-11-03T10:00:00.000Z", run_id: "RUN_1" } },
      { connection: true, extraction: true, mapping: true, migration: true, rules: true, delivery: true },
    );
    const j = journey(s, 0);
    expect(j.filter((x) => x.state === "done")).toHaveLength(STEPS.length - 1);
    // V04 : la Découverte facultative n'est pas comptée, un projet livré est à 7 sur 7 (et non « 7 sur 8 »)
    expect(j[1].state).toBe("optional");
    expect(requiredDone(j)).toBe(REQUIRED_STEPS);
    expect(nextAction(s, j)).toEqual({ slug: "livraison", label: "Ouvrir la livraison" });
    expect(categoryOf(s, j)).toBe("delivered");
  });

  it("V04 : modèle métier validé sans mise en service → Reconstruction pas encore faite, c'est la prochaine étape", () => {
    const s = summary({ status: "READY_FOR_REVIEW", data: { sources: 1, source_rows: 10, imported: 10, rejected: 0 } }, { connection: true, extraction: true, mapping: true, migration: true, rules: true });
    const j = journey(s, 0);
    expect(j[6]).toMatchObject({ slug: "reconstruction", state: "next" });
    expect(j[7]).toMatchObject({ slug: "livraison", state: "upcoming" });
    expect(nextAction(s, j)).toEqual({ slug: "reconstruction", label: "Reconstruire le logiciel" });
  });

  it("sans résumé : tout est à venir", () => {
    expect(journey(null, 0).every((x) => x.state === "upcoming")).toBe(true);
  });
});

describe("actionItems", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");

  it("rien à signaler pour un projet sain", () => {
    expect(actionItems([{ summary: summary(), details: details(), analysis: null, investigations: 0 }], now)).toEqual([]);
  });

  it("un seul point par étape (le plus précis), triés par gravité", () => {
    const failed = summary({ id: "MIG_aaaaaaaa", status: "FAILED", status_label: "Échec", status_reason: "Migration RUN_1 : contrôles bloquants en échec", data: { sources: 1, source_rows: 1, imported: 1, rejected: 0 }, anomalies: { pending_decisions: 0, gaps: 0, failed_checks: 3 } });
    const review = summary({ id: "MIG_bbbbbbbb", company: "Morel", status: "NEEDS_HUMAN_REVIEW", status_label: "Validation humaine requise", status_reason: "Correspondances v1 : 2 point(s) à valider", anomalies: { pending_decisions: 2, gaps: 0, failed_checks: 0 } });
    const items = actionItems(
      [
        { summary: review, details: details(), analysis: null, investigations: 0 },
        { summary: failed, details: details(), analysis: null, investigations: 0 },
      ],
      now,
    );
    expect(items.map((i) => [i.projectId, i.kind, i.tone, i.slug])).toEqual([
      ["MIG_aaaaaaaa", "checks", "bad", "validation"],
      ["MIG_bbbbbbbb", "decisions", "warn", "correspondances"],
    ]);
    expect(items[0].title).toBe("3 contrôles en échec");
  });

  it("analyse en attente d'agent et identifiants qui expirent", () => {
    const s = summary();
    const items = actionItems(
      [
        {
          summary: s,
          details: details({ credentials: { stored: true, username_hint: "m…n", expires_at: "2026-11-07T13:30:00.000Z" } }),
          analysis: parseAnalysis({ state: "queued", agent_available: false, message: "Agent d'analyse non disponible pour le moment." }),
          investigations: 0,
        },
      ],
      now,
    );
    expect(items.map((i) => i.kind).sort()).toEqual(["analysis", "credentials"]);
    const cred = items.find((i) => i.kind === "credentials")!;
    expect(cred.title).toBe("Accès à l'ancien logiciel : effacement automatique dans 1 h 30");
    expect(cred.tone).toBe("warn");
  });

  it("parseAnalysis : formats tolérés, sinon rien", () => {
    expect(parseAnalysis({ request: { state: "queued", requested_at: "x" }, agent_available: true })).toEqual({ state: "queued", agentAvailable: true, message: null, requestedAt: "x" });
    expect(parseAnalysis({ ok: false, error: "Projet introuvable" })).toBeNull();
    expect(parseAnalysis("<html>")).toBeNull();
  });
});

describe("deliveredUrl", () => {
  it("même hôte que le Studio, port du logiciel livré", () => {
    expect(deliveredUrl(5050, { protocol: "http:", hostname: "127.0.0.1" })).toBe("http://127.0.0.1:5050/");
    expect(deliveredUrl(5050, { protocol: "http:", hostname: "localhost" })).toBe("http://127.0.0.1:5050/");
    expect(deliveredUrl(5050, { protocol: "http:", hostname: "192.168.1.20" })).toBe("http://192.168.1.20:5050/");
    expect(deliveredUrl(5050, { protocol: "http:", hostname: "[::1]" })).toBe("http://[::1]:5050/");
  });
});

describe("statusLabel et points ouverts (V04, V16, PR-05, PR-17)", () => {
  it("EXTRACTING avec des données reçues : « Données reçues », pas « en cours de récupération »", () => {
    const base = { status: "EXTRACTING" as const, status_label: "Données en cours de récupération" };
    expect(statusLabel(summary({ ...base, data: { sources: 11, source_rows: 21675, imported: 0, rejected: 0 } }))).toBe("Données reçues");
    // aucune donnée encore : libellé du serveur conservé
    expect(statusLabel(summary(base))).toBe("Données en cours de récupération");
    expect(statusLabel(summary({ status: "MAPPING", status_label: "Correspondances" }))).toBe("Correspondances prêtes");
    expect(statusLabel(summary({ status: "MAPPING", status_label: "Correspondances", anomalies: { pending_decisions: 2, gaps: 0, failed_checks: 0 } }))).toBe("Correspondances");
    expect(statusLabel(summary({ status: "PUBLISHED", status_label: "Logiciel livré" }))).toBe("Logiciel livré");
  });

  it("écarts acceptés : « Aucun (11 écarts acceptés) », sans alerte ; non acceptés : à examiner", () => {
    const base = { data: { sources: 1, source_rows: 10, imported: 10, rejected: 0 }, anomalies: { pending_decisions: 0, gaps: 11, failed_checks: 0 } };
    expect(openPoints(summary(base, { migration: true }))).toEqual({ text: "Aucun (11 écarts acceptés)", tone: "ok" });
    expect(openPoints(summary(base))).toEqual({ text: "11 écarts à examiner", tone: "warn" });
  });

  it("PR-19 : séparateur de milliers lisible (espace insécable U+00A0, jamais l'espace fine U+202F)", () => {
    const t = plural(21675, "ligne", "lignes");
    expect(t).toBe("21\u00a0675 lignes");
    expect(t).not.toContain("\u202f");
  });
});

