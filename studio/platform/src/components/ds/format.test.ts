import { describe, expect, it } from "vitest";
import { agreePlurals, formatBytes, formatDateTime, formatDay, formatInt, formatNumber, formatPercent, readableSpaces } from "./format";

/*
 * Formats d'affichage partagés (PR-19, V12, V16). Intl fr-FR sépare les milliers par U+202F, presque invisible
 * en Instrument Sans (« 21065 ») : le Studio affiche U+00A0. Les valeurs ne changent jamais.
 */

const NNBSP = String.fromCharCode(0x202f);
const NBSP = String.fromCharCode(0xa0);

describe("formatInt / formatNumber", () => {
  it("milliers séparés par une espace insécable lisible, jamais l'espace fine", () => {
    expect(formatInt(21675)).toBe(`21${NBSP}675`);
    expect(formatInt(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatInt(12)).toBe("12");
    expect(formatInt(21675)).not.toContain(NNBSP);
    expect(formatNumber(12409608, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(`12${NBSP}409${NBSP}608,00`);
    expect(readableSpaces(`21${NNBSP}065`)).toBe(`21${NBSP}065`);
  });

  it("valeur non finie : « — » (rien d'inventé)", () => {
    expect(formatInt(Number.NaN)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("pourcentages et tailles gardent leurs règles (99,96 % reste 99,96 %)", () => {
    expect(formatPercent(0.9996)).toBe("99,96 %");
    expect(formatPercent(2999 / 3000)).toBe("99,97 %");
    expect(formatBytes(1536)).toBe("1,5 Ko");
    expect(formatBytes(1024 * 1024 * 2048)).not.toContain(NNBSP);
  });
});

describe("formatDateTime / formatDay (V16)", () => {
  it("un seul format de date dans le Studio : « 8 nov. 2026, 02:09 »", () => {
    const iso = new Date(2026, 10, 8, 2, 9).toISOString();
    expect(formatDay(iso)).toBe("8 nov. 2026");
    expect(formatDateTime(iso)).toBe("8 nov. 2026, 02:09");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("pas une date")).toBe("—");
  });
});

describe("agreePlurals (V13)", () => {
  it("accorde chaque « (s) » avec le nombre qui le précède ; 0 et 1 au singulier", () => {
    expect(agreePlurals("2 ligne(s) de clients non migrée(s)")).toBe("2 lignes de clients non migrées");
    expect(agreePlurals("8 pièce(s) jointe(s) référencée(s) mais non récupérée(s)")).toBe("8 pièces jointes référencées mais non récupérées");
    expect(agreePlurals("1796 enregistrement(s) historique(s) : 1772 identique(s), 24 avec un écart d'arrondi, 0 différent(s), 0 non calculable(s)")).toBe(
      "1796 enregistrements historiques : 1772 identiques, 24 avec un écart d'arrondi, 0 différent, 0 non calculable",
    );
    expect(agreePlurals("Données reçues : documents.zip (0 ligne(s))")).toBe("Données reçues : documents.zip (0 ligne)");
    expect(agreePlurals("Correspondances v1 : 6 point(s) à valider")).toBe("Correspondances v1 : 6 points à valider");
    expect(agreePlurals(`21${NBSP}065 enregistrement(s) importé(s)`)).toBe(`21${NBSP}065 enregistrements importés`);
  });

  it("sans nombre devant ou sans « (s) » : texte inchangé", () => {
    expect(agreePlurals("Point(s) à valider")).toBe("Point(s) à valider");
    expect(agreePlurals("Aucun écart")).toBe("Aucun écart");
  });
});

