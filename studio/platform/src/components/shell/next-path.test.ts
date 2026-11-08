import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, loginPath, safeNextPath, withNext } from "./next-path";

/** Lot B3 : adresse de retour après connexion (?suite=), sans redirection ouverte. */
describe("safeNextPath", () => {
  it("garde un chemin interne (avec requête et ancre)", () => {
    expect(safeNextPath("/projets")).toBe("/projets");
    expect(safeNextPath("/projets/MIG_0123abcd/validation?vue=ecarts#c2")).toBe("/projets/MIG_0123abcd/validation?vue=ecarts#c2");
    expect(safeNextPath("/projets/nouveau")).toBe("/projets/nouveau");
  });

  it("refuse toute adresse qui sortirait du Studio", () => {
    const attacks = [
      "https://site.example/",
      "http:/site.example",
      "//site.example",
      "///site.example",
      "/\\site.example",
      "\\\\site.example",
      "/.//site.example",
      "/./../..//site.example",
      "/%09/site.example".replace("%09", "\t"),
      " /projets",
      "/projets\n",
      "javascript:alert(1)",
      "data:text/html,x",
      "projets",
      "",
      "/".padEnd(600, "a"),
    ];
    for (const a of attacks) expect(safeNextPath(a), JSON.stringify(a)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("refuse les valeurs qui ne sont pas des chaînes", () => {
    for (const v of [null, undefined, 42, ["/projets"], { a: 1 }]) expect(safeNextPath(v)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("refuse l'API et les pages d'entrée (boucle)", () => {
    for (const p of ["/api/me", "/api", "/_next/static/x.js", "/connexion", "/connexion?suite=/espace", "/inscription", "/reinitialisation"]) {
      expect(safeNextPath(p), p).toBe(DEFAULT_AFTER_LOGIN);
    }
    // … mais pas un chemin qui commence seulement par les mêmes lettres
    expect(safeNextPath("/apiculture")).toBe("/apiculture");
  });

  it("normalise les segments . et .. sans quitter l'origine", () => {
    expect(safeNextPath("/projets/../espace")).toBe("/espace");
    expect(safeNextPath("/a/%2F%2Fsite.example")).toBe("/a/%2F%2Fsite.example");
  });

  it("utilise le repli fourni", () => {
    expect(safeNextPath("//x", "/projets")).toBe("/projets");
  });
});

describe("loginPath / withNext", () => {
  it("n'ajoute ?suite= que pour une page autre que l'espace", () => {
    expect(loginPath("/espace")).toBe("/connexion");
    expect(loginPath(null)).toBe("/connexion");
    expect(loginPath("/projets/nouveau")).toBe("/connexion?suite=%2Fprojets%2Fnouveau");
    expect(loginPath("//site.example")).toBe("/connexion");
  });

  it("ajoute une raison connue seulement", () => {
    expect(loginPath("/activite", "expiree")).toBe("/connexion?suite=%2Factivite&raison=expiree");
    expect(loginPath(undefined, "deconnexion")).toBe("/connexion?raison=deconnexion");
    expect(loginPath(undefined, "autre" as never)).toBe("/connexion");
  });

  it("conserve le retour prévu entre inscription et connexion", () => {
    expect(withNext("/inscription", "/projets/nouveau")).toBe("/inscription?suite=%2Fprojets%2Fnouveau");
    expect(withNext("/connexion", "https://site.example")).toBe("/connexion");
  });
});
