import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FinancialSection, checkLabel, plainText, stateCounts, verdictOf } from "./RunVerification";
import { mappingIndex, type Check, type Report } from "./RunCommon";

/*
 * Non-régression des constats PR-02, PR-07 et V01 (revues finales) : un seul décompte des contrôles entre les
 * étapes Migration et Validation, et des totaux financiers qui ne disent jamais « aucun » écart à côté d'un
 * montant resté dans des lignes rejetées.
 */

const check = (over: Partial<Check> & Pick<Check, "id" | "status">): Check => ({ group: "volumes", label: over.id, blocking: false, summary: "", ...over }) as Check;

function report(checks: Check[], over: Partial<Report> = {}): Report {
  return {
    run_id: "RUN_001",
    verified_at: "2026-11-08T02:10:00.000Z",
    target: "app.db",
    status: "review",
    statement: "Contrôles calculés sur les données réellement relues : fichiers extraits du logiciel source (réanalysés) et base de destination (requêtes SQL).",
    checks,
    entities: [],
    gaps: [],
    database: { sha256: "0".repeat(64), bytes: 1, integrity: "ok" },
    ...over,
  } as Report;
}

/** 41 contrôles du rapport réel de RUN_001 : 32 réussis, 8 « warn », 1 « info ». */
const RUN_001 = [
  ...Array.from({ length: 32 }, (_, i) => check({ id: `ok.${i}`, status: "pass", metrics: { source: 10, compared: 10 } })),
  ...Array.from({ length: 8 }, (_, i) => check({ id: `warn.${i}`, status: "warn" })),
  check({ id: "regles.factures.total", group: "regles", status: "info", summary: "12 enregistrement(s) non conforme(s)" }),
];
const gaps = Array.from({ length: 11 }, (_, i) => ({ kind: "rejected", message: `écart ${i}`, count: 1 }));

describe("Décompte des contrôles (PR-07, V01)", () => {
  it("les quatre statuts s'additionnent au nombre de contrôles ; l'« info » est compté avec écart, comme à la Validation", () => {
    const c = stateCounts(report(RUN_001, { gaps }), 3);
    expect(c).toMatchObject({ validated: 32, gap: 9, unverified: 0, intervention: 0, total: 41 });
    expect(c.validated + c.gap + c.unverified + c.intervention).toBe(c.total);
    // les 3 éléments non vérifiés hors contrôles sont comptés à part, jamais ajoutés aux 41
    expect(c.others).toBe(3);
  });

  it("verdict : écarts documentés et contrôles avec écart nommés distinctement", () => {
    const v = verdictOf(report(RUN_001, { gaps }), null, 0);
    expect(v.title).toBe("À examiner avant la mise en service : 11 écarts documentés ; 9 contrôles signalent un écart.");
  });
});

describe("Vocabulaire client (PR-12, V07)", () => {
  it("libellés des contrôles sans méthode technique ; le libellé d'origine reste celui du moteur", () => {
    expect(checkLabel({ id: "relations.integrite", label: "Intégrité référentielle (clés étrangères)" })).toBe("Liens entre fiches intacts");
    expect(checkLabel({ id: "pieces_jointes.empreintes", label: "Pièces jointes copiées à l'identique (SHA-256)" })).toBe("Pièces jointes identiques à l'original");
    expect(checkLabel({ id: "volumes.clients", label: "Clients : lignes sources = importées + rejetées" })).toBe("Clients : lignes sources = importées + rejetées");
    expect(plainText("non extrait — accès refusé au compte fourni (HTTP 403)")).toBe("non extrait — accès refusé au compte fourni");
  });
});

describe("Totaux financiers (PR-02, V01 §4, V19)", () => {
  const montant = (rejected: number) =>
    report([check({ id: "montants.devis.total_ht", group: "montants", status: rejected ? "warn" : "pass", metrics: { source_cents: 1240960800, target_cents: 1240960800, rejected_cents: rejected } })], {
      entities: [{ entity: "devis", label: "Devis", source_table: "devis", source_rows: 1800, target_rows: 1796, rejected: 4, exact: 1796, mismatched: 0, totals: [{ field: "total_ht", accounting: false, source_cents: 1240960800, target_cents: 1240960800, rejected_cents: rejected }] }],
    } as Partial<Report>);
  const html = (r: Report) => renderToStaticMarkup(createElement(FinancialSection, { report: r, index: mappingIndex(null, r.entities) }));

  it("montant rejeté : jamais « aucune » différence, montant rejeté affiché (table et présentation mobile), colonne « lignes migrées » nommée", () => {
    const out = html(montant(1146870));
    expect(out).not.toMatch(/aucune?</);
    expect(out).toContain("lignes migrées");
    expect(out).toContain("Lignes rejetées");
    // le montant rejeté figure dans les deux présentations (colonnes et fiches empilées, sans colonne masquée)
    expect(out.split("11\u00a0468,70 €").length - 1).toBe(2);
    expect(out).not.toContain("hidden lg:table-cell");
    expect(out).toContain("ÉCART DÉTECTÉ");
  });

  it("aucun montant rejeté et aucune différence : « aucune »", () => {
    const out = html(montant(0));
    expect(out).toContain("aucune");
    expect(out).toContain("VALIDÉ");
  });
});
