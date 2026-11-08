/**
 * Lecture paginée des données sources (GET /api/migration/sources/rows) : vraie route, vrais
 * comptes (sessions Better Auth), fichiers déposés par la vraie route d'import. Vérifie que le
 * navigateur ne reçoit jamais qu'une page (100 lignes au plus), que recherche, filtres et tri se
 * font côté serveur, que la route est en lecture seule et cloisonnée par projet.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, callRoute, cleanupAuthEnv, setupAuthEnv, signUp, type RouteHandler, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
let projects: Mod;
let sources: Mod;
let rowsRoute: Mod;
let owner: TestUser;
let other: TestUser;
let pid: string;

const N = 250;
const VILLES = ["Lyon", "Paris", "Lille", ""];
const LONG = `Note longue ${"x".repeat(480)} fin`;
/** Montant en français (virgule décimale, espace des milliers) ; vide toutes les 10 lignes. */
const montant = (i: number) => (i % 10 === 0 ? "" : `${Math.floor(((i * 37) % 1000) * 12.5).toLocaleString("fr-FR").replace(/ /g, " ")},${String(i % 100).padStart(2, "0")}`);
/** Date JJ/MM/AAAA répartie sur plusieurs années (l'ordre du texte n'est pas l'ordre chronologique). */
const date = (i: number) => `${String((i % 28) + 1).padStart(2, "0")}/${String((i % 12) + 1).padStart(2, "0")}/${2000 + (i % 25)}`;
const nom = (i: number) => (i === 7 ? "Éléonore Dupré" : i === 8 ? "ELEONORE MARTIN" : `Client ${String(i).padStart(3, "0")}`);

function clientsCsv(): string {
  const lines = ["ID;NOM;VILLE;MONTANT;DATE_CREATION;NOTE"];
  for (let i = 1; i <= N; i++) lines.push([String(i), nom(i), VILLES[i % 4], montant(i), date(i), i === 3 ? LONG : ""].join(";"));
  return Buffer.from(lines.join("\n"), "utf8").toString("base64");
}

const read = (query: string, headers: Record<string, string> = asUser(owner.cookie)) => callRoute(rowsRoute, "GET", `/api/migration/sources/rows?${query}`, { headers });
const P = () => `project=${pid}`;
const parseFr = (s: string) => Number(s.replace(/[\s  ]/g, "").replace(",", "."));
const chrono = (s: string) => {
  const [d, m, y] = s.split("/").map(Number);
  return y * 10000 + m * 100 + d;
};

beforeAll(async () => {
  setupAuthEnv("reborn-rows-");
  projects = (await import("@/app/api/projects/route")) as unknown as Mod;
  sources = (await import("@/app/api/migration/sources/route")) as unknown as Mod;
  rowsRoute = (await import("@/app/api/migration/sources/rows/route")) as unknown as Mod;
  owner = await signUp({ firstName: "Lina", lastName: "Propriétaire" });
  other = await signUp({ firstName: "Omar", lastName: "Autre" });
  const p = await callRoute(projects, "POST", "/api/projects", { body: { company: "Lecture paginée", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version }, headers: asUser(owner.cookie) });
  expect(p.status).toBe(201);
  pid = p.body.project.id;
  const up = await callRoute(sources, "POST", `/api/migration/sources?project=${pid}`, { body: { name: "clients.csv", content_base64: clientsCsv() }, headers: asUser(owner.cookie) });
  expect(up.status).toBe(200);
  const multi = Buffer.from(JSON.stringify({ articles: [{ ref: "A1", prix: 10 }, { ref: "A2", prix: 2.5 }], familles: [{ code: "F1" }] }), "utf8").toString("base64");
  expect((await callRoute(sources, "POST", `/api/migration/sources?project=${pid}`, { body: { name: "catalogue.json", content_base64: multi }, headers: asUser(owner.cookie) })).status).toBe(200);
});
afterAll(() => cleanupAuthEnv());

describe("Lecture paginée des données sources", () => {
  it("renvoie une page de 25 lignes par défaut, jamais la table entière", async () => {
    const r = await read(`${P()}&table=clients`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ table: "clients", file: "clients.csv", total: N, matched: N, page: 1, per: 25, pages: 10, sort: null, filter: null, q: null });
    expect(r.body.columns).toEqual(["ID", "NOM", "VILLE", "MONTANT", "DATE_CREATION", "NOTE"]);
    expect(r.body.rows).toHaveLength(25);
    expect(r.body.rows.map((x: { n: number }) => x.n)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    // Valeurs telles que lues dans le fichier (aucune conversion)
    expect(r.body.rows[6].values).toEqual(["7", "Éléonore Dupré", VILLES[7 % 4], montant(7), date(7), ""]);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("borne per à 100 lignes : 100 accepté, 0, 101 ou un texte refusés (400)", async () => {
    const r = await read(`${P()}&table=clients&per=100&page=3`);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(50);
    expect(r.body.rows[0].n).toBe(201);
    expect(r.body.pages).toBe(3);
    for (const bad of ["per=101", "per=0", "per=abc", "page=0", "page=-2", "per=2.5"]) {
      const x = await read(`${P()}&table=clients&${bad}`);
      expect(x.status, bad).toBe(400);
      expect(x.body.error).toBe("Paramètres de lecture invalides");
    }
    // Paramètre inconnu : refusé plutôt qu'ignoré
    expect((await read(`${P()}&table=clients&limit=1000`)).status).toBe(400);
  });

  it("ramène une page au-delà de la fin à la dernière page", async () => {
    const r = await read(`${P()}&table=clients&page=999`);
    expect(r.status).toBe(200);
    expect(r.body.page).toBe(10);
    expect(r.body.rows.map((x: { n: number }) => x.n)).toEqual(Array.from({ length: 25 }, (_, i) => 226 + i));
  });

  it("cherche dans toutes les colonnes, sans tenir compte de la casse ni des accents", async () => {
    const r = await read(`${P()}&table=clients&q=${encodeURIComponent("eleonore")}`);
    expect(r.status).toBe(200);
    expect(r.body.matched).toBe(2);
    expect(r.body.rows.map((x: { n: number }) => x.n)).toEqual([7, 8]);
    expect(r.body.q).toBe("eleonore");
    const city = await read(`${P()}&table=clients&q=PARIS`);
    expect(city.body.matched).toBe(Array.from({ length: N }, (_, i) => i + 1).filter((i) => VILLES[i % 4] === "Paris").length);
    expect((await read(`${P()}&table=clients&q=introuvable-zz`)).body).toMatchObject({ matched: 0, pages: 1, page: 1, rows: [] });
  });

  it("filtre une colonne : vide, renseignée, égale à, contient", async () => {
    const empty = await read(`${P()}&table=clients&col=VILLE&op=empty`);
    expect(empty.body.matched).toBe(Math.floor(N / 4));
    expect(empty.body.rows.every((x: { values: unknown[] }) => x.values[2] === "")).toBe(true);
    const filled = await read(`${P()}&table=clients&col=VILLE&op=filled&per=100`);
    expect(filled.body.matched).toBe(N - Math.floor(N / 4));
    const eq = await read(`${P()}&table=clients&col=VILLE&op=equals&value=lyon`);
    expect(eq.body.matched).toBe(Array.from({ length: N }, (_, i) => i + 1).filter((i) => VILLES[i % 4] === "Lyon").length);
    expect(eq.body.filter).toEqual({ column: "VILLE", op: "equals", value: "lyon" });
    const contains = await read(`${P()}&table=clients&col=NOM&op=contains&value=${encodeURIComponent("dupre")}`);
    expect(contains.body.rows.map((x: { n: number }) => x.n)).toEqual([7]);
    // Combinaison recherche + filtre (ligne 7 : ville vide ; ligne 8 : Lyon)
    const both = await read(`${P()}&table=clients&col=VILLE&op=equals&value=Lyon&q=eleonore`);
    expect(both.body.rows.map((x: { n: number }) => x.n)).toEqual([8]);
    const bothEmpty = await read(`${P()}&table=clients&col=VILLE&op=empty&q=eleonore`);
    expect(bothEmpty.body.rows.map((x: { n: number }) => x.n)).toEqual([7]);
    // Filtres incomplets ou colonne inconnue
    expect((await read(`${P()}&table=clients&col=VILLE`)).status).toBe(400);
    expect((await read(`${P()}&table=clients&op=empty`)).status).toBe(400);
    expect((await read(`${P()}&table=clients&col=VILLE&op=equals`)).status).toBe(400);
    expect((await read(`${P()}&table=clients&col=PAS_LA&op=empty`)).status).toBe(400);
    expect((await read(`${P()}&table=clients&col=VILLE&op=supprimer`)).status).toBe(400);
  });

  it("trie côté serveur : montants à virgule, dates JJ/MM/AAAA, valeurs vides en dernier", async () => {
    const all = async (q: string) => {
      const out: { n: number; values: string[] }[] = [];
      for (let page = 1; page <= 3; page++) out.push(...(await read(`${P()}&table=clients&per=100&page=${page}&${q}`)).body.rows);
      return out;
    };
    const asc = await all("sort=MONTANT&dir=asc");
    expect(asc).toHaveLength(N);
    const filledAsc = asc.filter((x) => x.values[3] !== "");
    const nums = filledAsc.map((x) => parseFr(x.values[3]));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(asc.slice(-Math.floor(N / 10)).every((x) => x.values[3] === "")).toBe(true);
    const desc = await all("sort=MONTANT&dir=desc");
    const numsDesc = desc.filter((x) => x.values[3] !== "").map((x) => parseFr(x.values[3]));
    expect(numsDesc).toEqual([...numsDesc].sort((a, b) => b - a));
    expect(desc.slice(-Math.floor(N / 10)).every((x) => x.values[3] === "")).toBe(true);
    // Dates : ordre chronologique (et non alphabétique), égalités dans l'ordre d'origine
    const dates = await all("sort=DATE_CREATION");
    const keys = dates.map((x) => chrono(x.values[4]));
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    for (let i = 1; i < dates.length; i++) if (keys[i] === keys[i - 1]) expect(dates[i].n).toBeGreaterThan(dates[i - 1].n);
    // Texte : ordre français, chiffres dans l'ordre numérique
    const first = (await read(`${P()}&table=clients&sort=NOM&per=3`)).body.rows.map((x: { values: string[] }) => x.values[1]);
    expect(first).toEqual(["Client 001", "Client 002", "Client 003"]);
    expect((await read(`${P()}&table=clients&sort=NOM&dir=bas`)).status).toBe(400);
    expect((await read(`${P()}&table=clients&sort=INCONNUE`)).status).toBe(400);
  });

  it("tronque une valeur longue dans la page (signalée) et la donne entière à l'inspection", async () => {
    const page = await read(`${P()}&table=clients&per=5`);
    const third = page.body.rows[2];
    expect(third.n).toBe(3);
    expect(third.truncated).toEqual([5]);
    expect(third.values[5]).toHaveLength(300);
    expect(page.body.rows[0].truncated).toBeUndefined();
    const one = await read(`${P()}&table=clients&row=3`);
    expect(one.status).toBe(200);
    expect(one.body.row).toEqual({ n: 3, values: ["3", "Client 003", VILLES[3 % 4], montant(3), date(3), LONG] });
    expect(one.body.rows).toBeUndefined();
    expect((await read(`${P()}&table=clients&row=${N + 1}`)).status).toBe(404);
    expect((await read(`${P()}&table=clients&row=0`)).status).toBe(400);
  });

  it("lit les tables d'un fichier qui en contient plusieurs ; table inconnue → 404", async () => {
    const a = await read(`${P()}&table=articles`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ file: "catalogue.json", total: 2, columns: ["ref", "prix"] });
    expect(a.body.rows.map((x: { values: unknown[] }) => x.values)).toEqual([["A1", 10], ["A2", 2.5]]);
    const sorted = await read(`${P()}&table=articles&sort=prix`);
    expect(sorted.body.rows.map((x: { values: unknown[] }) => x.values[0])).toEqual(["A2", "A1"]);
    expect((await read(`${P()}&table=familles`)).body.total).toBe(1);
    const missing = await read(`${P()}&table=inexistante`);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Table introuvable dans les sources du projet");
    expect((await read(`${P()}`)).status).toBe(400);
  });

  it("est cloisonnée : anonyme 401, autre client 404, sans projet 400, Analyste autorisé, Explorer refusé", async () => {
    expect((await read(`${P()}&table=clients`, {})).status).toBe(401);
    const cross = await read(`${P()}&table=clients`, asUser(other.cookie));
    expect(cross.status).toBe(404);
    expect(cross.body.error).toBe("Projet introuvable");
    // Même réponse qu'un projet inexistant : pas d'énumération
    expect((await read(`project=MIG_ffffffff&table=clients`)).body).toEqual(cross.body);
    expect((await read(`table=clients`)).status).toBe(400);
    expect((await read(`project=../../etc&table=clients`)).status).toBe(400);
    const analyst = await read(`${P()}&table=clients&per=2`, asService("analyst"));
    expect(analyst.status).toBe(200);
    expect(analyst.body.rows).toHaveLength(2);
    expect((await read(`${P()}&table=clients`, asService("explorer"))).status).toBe(403);
    // Le projet désigné deux fois de façon différente est refusé
    expect((await callRoute(rowsRoute, "GET", `/api/migration/sources/rows?${P()}&table=clients`, { headers: { ...asUser(owner.cookie), "x-reborn-project": "MIG_00000000" } })).status).toBe(400);
  });

  it("est en lecture seule : seule la méthode GET existe et les sources ne changent pas", async () => {
    expect(Object.keys(rowsRoute).filter((k) => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k))).toEqual(["GET"]);
    const before = (await callRoute(sources, "GET", `/api/migration/sources?project=${pid}`, { headers: asUser(owner.cookie) })).body;
    await read(`${P()}&table=clients&sort=NOM&dir=desc&q=client&col=VILLE&op=filled`);
    await read(`${P()}&table=clients&row=1`);
    const after = (await callRoute(sources, "GET", `/api/migration/sources?project=${pid}`, { headers: asUser(owner.cookie) })).body;
    expect(after).toEqual(before);
  });
});
