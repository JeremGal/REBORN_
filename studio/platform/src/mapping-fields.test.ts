/**
 * Correction d'un champ des correspondances (POST /api/migration/mapping/fields) par le propriétaire,
 * sous une vraie session client : nouvelle version « user », identifiant du nouveau logiciel et noms
 * internes inchangés, aucune version cassée, aperçu sur les vraies valeurs, isolation entre comptes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, callRoute, cleanupAuthEnv, ORIGIN, setupAuthEnv, signUp, type Json, type RouteHandler, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const mods: Record<string, Mod> = {};
let owner: TestUser;
let other: TestUser;
let pid = "";

const route = (name: string) => mods[name];
const q = (extra = "") => `?project=${pid}${extra}`;
/** Appel du propriétaire (navigateur connecté) par défaut. */
const asOwner = () => asUser(owner.cookie);
const fields = (body: unknown, headers: Record<string, string> = asOwner()) => callRoute(route("fields"), "POST", `/api/migration/mapping/fields${q()}`, { body, headers });
const mapping = async () => (await callRoute(route("mapping"), "GET", `/api/migration/mapping${q()}`, { headers: asOwner() })).body as Json;
const fieldOf = (m: Json, entity: string, name: string) => m.current.mapping.entities.find((e: Json) => e.name === entity).fields.find((f: Json) => f.name === name);
const b64 = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");

const MAPPING = {
  contract_version: "1.0",
  source_system: "Logiciel de test",
  target: { id: "app-test-champs", name: "Logiciel de test — champs" },
  review_threshold: 0.9,
  entities: [
    {
      name: "clients",
      label: "Clients",
      source: { table: "clients", key: "id" },
      title_field: "nom",
      fields: [
        { name: "nom", label: "Nom", source: "nom", type: "text", required: true, transforms: ["trim"] },
        {
          name: "categorie",
          label: "Catégorie",
          source: "categorie",
          type: "enum",
          transforms: ["trim", { map: { STD: "standard", PRE: "premium" } }],
          options: [
            { value: "standard", label: "Standard" },
            { value: "premium", label: "Premium" },
          ],
          confidence: 0.7,
          note: "Codes déduits de la fiche client",
        },
        { name: "cree_le", label: "Créé le", source: "cree_le", type: "text", confidence: 0.8 },
        { name: "solde", label: "Solde", source: "solde", type: "money", transforms: [{ money: "comma" }] },
        { name: "email", label: "E-mail", source: "email", type: "email", transforms: ["trim", "lower"] },
        { name: "commentaire", label: "Commentaire", source: "commentaire", type: "text" },
      ],
      checks: [{ id: "solde_positif", expr: "solde >= 0", severity: "warning" }],
      ui: { list_fields: ["nom", "email"], search_fields: ["nom", "email"] },
    },
    {
      name: "factures",
      label: "Factures",
      source: { table: "factures", key: "id" },
      title_field: "numero",
      classification: { kind: "financial", confidence: 0.95 },
      fields: [
        { name: "numero", label: "Numéro", source: "numero", type: "text", required: true, accounting: true },
        { name: "client", label: "Client", source: "client", type: "reference", references: "clients" },
        { name: "date", label: "Date", source: "date", type: "date", transforms: [{ date: "DD/MM/YYYY" }], accounting: true },
        { name: "total", label: "Total", source: "total", type: "money", transforms: [{ money: "comma" }], accounting: true },
      ],
    },
  ],
};

beforeAll(async () => {
  setupAuthEnv("reborn-fields-");
  process.env.REBORN_APPS_DIR = `${process.env.REBORN_DATA_DIR}/apps`;
  mods.projects = (await import("@/app/api/projects/route")) as unknown as Mod;
  mods.project = (await import("@/app/api/projects/[id]/route")) as unknown as Mod;
  mods.sources = (await import("@/app/api/migration/sources/route")) as unknown as Mod;
  mods.mapping = (await import("@/app/api/migration/mapping/route")) as unknown as Mod;
  mods.decisions = (await import("@/app/api/migration/decisions/route")) as unknown as Mod;
  mods.fields = (await import("@/app/api/migration/mapping/fields/route")) as unknown as Mod;
  owner = await signUp({ firstName: "Camille", lastName: "Propriétaire" });
  other = await signUp({ firstName: "Autre", lastName: "Client" });
  const created = await callRoute(mods.projects, "POST", "/api/projects", { body: { company: "Champs SARL", software: "Logiciel de test", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version }, headers: asOwner() });
  expect(created.status).toBe(201);
  pid = created.body.project.id;
  const clients = [
    ["id", "nom", "categorie", "cree_le", "solde", "email", "commentaire"],
    ["1", " Alpha SARL ", "STD", "03/04/2020", "12,50", " A@X.FR ", "ok"],
    ["2", "Beta", "PRE", "15/05/2021", "100,00", "b@y.fr", ""],
    ["3", "Gamma", "STD", "31/12/2019", "7", "c@z.fr", "note"],
  ];
  const factures = [
    ["id", "numero", "client", "date", "total"],
    ["1", "F001", "1", "03/04/2020", "12,50"],
    ["2", "F002", "2", "15/05/2021", "100,00"],
  ];
  for (const [name, rows] of [["clients.csv", clients], ["factures.csv", factures]] as const) {
    const r = await callRoute(mods.sources, "POST", `/api/migration/sources${q()}`, { body: { name, content_base64: b64(rows as unknown as string[][]) }, headers: asOwner() });
    expect(r.status).toBe(200);
  }
  // Publication des correspondances par l'Analyste (jeton de service), comme en production
  const pub = await callRoute(mods.mapping, "POST", `/api/migration/mapping${q()}`, { body: MAPPING, headers: asService("analyst") });
  expect(pub.status).toBe(200);
  expect(pub.body.version).toBe(1);
});
afterAll(() => cleanupAuthEnv());

describe("Correction d'un champ des correspondances", () => {
  it("corrige le nom affiché : nouvelle version « user », target.id et autres champs inchangés, décisions conservées", async () => {
    const d = await callRoute(mods.decisions, "POST", `/api/migration/decisions${q()}`, { body: { key: "field:clients.categorie", decision: "accepted" }, headers: asOwner() });
    expect(d.status).toBe(200);
    const before = await mapping();
    const r = await fields({ version: before.current.version, entity: "clients", field: "commentaire", op: "update", changes: { label: "Remarques internes" } });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(before.current.version + 1);
    const after = await mapping();
    expect(after.current.origin).toBe("user");
    expect(after.current.mapping.target).toEqual(MAPPING.target);
    const f = fieldOf(after, "clients", "commentaire");
    expect(f.label).toBe("Remarques internes");
    expect(f.name).toBe("commentaire");
    expect(f.source).toBe("commentaire");
    expect(f.note).toMatch(/^Corrigé le \d{2}\/\d{2}\/\d{4} par Camille Propriétaire : nom affiché « Commentaire » → « Remarques internes »\.$/);
    // Rien d'autre ne bouge
    const strip = (m: Json) => JSON.stringify({ ...m, entities: m.entities.map((e: Json) => ({ ...e, fields: e.fields.filter((x: Json) => x.name !== "commentaire") })) });
    expect(strip(after.current.mapping)).toBe(strip(before.current.mapping));
    // La décision prise sur un autre champ reste acquise
    expect(after.status.items.find((i: Json) => i.key === "field:clients.categorie").decision.decision).toBe("accepted");
  });

  it("corriger une proposition incertaine la confirme, au nom du compte connecté (jamais un « by » fourni)", async () => {
    const cur = (await mapping()).current.version;
    const injected = await fields({ version: cur, entity: "clients", field: "cree_le", op: "update", changes: { type: "date", transforms: [{ date: "DD/MM/YYYY" }] }, by: "Quelqu'un d'autre" });
    expect(injected.status).toBe(400);
    const r = await fields({ version: cur, entity: "clients", field: "cree_le", op: "update", changes: { type: "date", transforms: [{ date: "DD/MM/YYYY" }] }, comment: "Format vérifié sur trois fiches" });
    expect(r.status).toBe(200);
    const m = await mapping();
    const f = fieldOf(m, "clients", "cree_le");
    expect(f.type).toBe("date");
    expect(f.transforms).toEqual([{ date: "DD/MM/YYYY" }]);
    expect(f.confidence).toBe(0.8); // l'incertitude d'origine reste visible
    const item = m.status.items.find((i: Json) => i.key === "field:clients.cree_le");
    expect(item.decision).toMatchObject({ decision: "accepted", by: "Camille Propriétaire", comment: "Format vérifié sur trois fiches" });
  });

  it("aperçu (dry_run) calculé sur toutes les valeurs réelles, sans créer de version", async () => {
    const m = await mapping();
    const r = await fields({ version: m.current.version, entity: "clients", field: "cree_le", op: "update", changes: { transforms: [{ date: "MM/DD/YYYY" }] }, dry_run: true });
    expect(r.status).toBe(200);
    expect(r.body.dry_run).toBe(true);
    expect(r.body.current).toMatchObject({ column: "cree_le", total: 3, converted: 3, failed: 0 });
    expect(r.body.current.examples.map((x: Json) => x.stored)).toEqual(["2020-04-03", "2021-05-15", "2019-12-31"]);
    // Lu à l'américaine, 15/05 et 31/12 sont des dates impossibles : refusées, jamais approchées
    expect(r.body.candidate).toMatchObject({ total: 3, converted: 1, failed: 2 });
    expect(r.body.changed).toBe(3);
    expect((await mapping()).current.version).toBe(m.current.version);
  });

  it("refuse une correction faite sur une version qui n'est plus en vigueur (rien n'est écrasé)", async () => {
    const cur = (await mapping()).current.version;
    const r = await fields({ version: cur - 1, entity: "clients", field: "nom", op: "update", changes: { label: "Raison sociale" } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/version \d+ est en vigueur/);
    expect((await mapping()).current.version).toBe(cur);
  });

  it("historique protégé et relations : seul le nom affiché se corrige", async () => {
    const cur = (await mapping()).current.version;
    expect((await fields({ version: cur, entity: "factures", field: "total", op: "update", changes: { transforms: [{ money: "dot" }] } })).status).toBe(409);
    expect((await fields({ version: cur, entity: "factures", field: "date", op: "update", changes: { type: "text" } })).status).toBe(409);
    expect((await fields({ version: cur, entity: "factures", field: "client", op: "update", changes: { source: "numero" } })).status).toBe(409);
    expect((await mapping()).current.version).toBe(cur);
    const ok = await fields({ version: cur, entity: "factures", field: "total", op: "update", changes: { label: "Total TTC" } });
    expect(ok.status).toBe(200);
    const f = fieldOf(await mapping(), "factures", "total");
    expect(f).toMatchObject({ label: "Total TTC", type: "money", accounting: true, transforms: [{ money: "comma" }] });
  });

  it("refuse sans rien créer : colonne inexistante, type d'un champ contrôlé, nom interne ou cible modifiés", async () => {
    const cur = (await mapping()).current.version;
    const missing = await fields({ version: cur, entity: "clients", field: "email", op: "update", changes: { source: "COLONNE_ABSENTE" } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/colonne source introuvable/);
    const ruled = await fields({ version: cur, entity: "clients", field: "solde", op: "update", changes: { type: "decimal" } });
    expect(ruled.status).toBe(409);
    expect(ruled.body.error).toMatch(/solde_positif/);
    expect((await fields({ version: cur, entity: "clients", field: "email", op: "update", changes: { name: "courriel" } })).status).toBe(400);
    expect((await fields({ version: cur, entity: "clients", field: "email", op: "update", changes: { label: "Courriel" }, target: { id: "autre-logiciel", name: "Autre" } })).status).toBe(400);
    expect((await fields({ version: cur, entity: "clients", field: "email", op: "update", changes: {} })).status).toBe(400);
    expect((await mapping()).current.version).toBe(cur);
  });

  it("retire un champ sûr puis le reprend à l'identique ; refuse le titre, un champ contrôlé ou une proposition à valider", async () => {
    let m = await mapping();
    const original = fieldOf(m, "clients", "email");
    expect((await fields({ version: m.current.version, entity: "clients", field: "nom", op: "exclude" })).status).toBe(409);
    expect((await fields({ version: m.current.version, entity: "clients", field: "solde", op: "exclude" })).status).toBe(409);
    expect((await fields({ version: m.current.version, entity: "clients", field: "categorie", op: "exclude" })).status).toBe(409);
    // Historique protégé : jamais retiré par une correction
    const prot = await fields({ version: m.current.version, entity: "factures", field: "total", op: "exclude", dry_run: true });
    expect(prot.status).toBe(409);
    expect(prot.body.error).toMatch(/historique protégé/);
    const dry =await fields({ version: m.current.version, entity: "clients", field: "email", op: "exclude", dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.body.consequences.join(" ")).toMatch(/colonnes de la liste/);
    const out = await fields({ version: m.current.version, entity: "clients", field: "email", op: "exclude" });
    expect(out.status).toBe(200);
    m = await mapping();
    const clients = m.current.mapping.entities.find((e: Json) => e.name === "clients");
    expect(clients.fields.some((f: Json) => f.name === "email")).toBe(false);
    expect(clients.ui).toEqual({ list_fields: ["nom"], search_fields: ["nom"] });
    const removed = await callRoute(mods.fields, "GET", `/api/migration/mapping/fields${q()}`, { headers: asOwner() });
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toEqual([expect.objectContaining({ entity: "clients", field: "email", source: "email" })]);
    const back = await fields({ version: m.current.version, entity: "clients", field: "email", op: "restore" });
    expect(back.status).toBe(200);
    m = await mapping();
    const names = m.current.mapping.entities.find((e: Json) => e.name === "clients").fields.map((f: Json) => f.name);
    expect(names).toEqual(["nom", "categorie", "cree_le", "solde", "email", "commentaire"]);
    expect(fieldOf(m, "clients", "email")).toEqual(original);
    // Toutes les versions désignent le même logiciel
    expect(m.current.mapping.target.id).toBe(MAPPING.target.id);
  });

  it("réservé au propriétaire : autre client 404, anonyme 401, agent 403, sans Origin 403, sans projet 400", async () => {
    const cur = (await mapping()).current.version;
    const body = { version: cur, entity: "clients", field: "nom", op: "update", changes: { label: "Intrus" } };
    expect((await fields(body, asUser(other.cookie))).status).toBe(404);
    expect((await fields(body, { origin: ORIGIN })).status).toBe(401);
    expect((await fields(body, asService("analyst"))).status).toBe(403);
    expect((await fields(body, { cookie: owner.cookie })).status).toBe(403);
    expect((await callRoute(mods.fields, "POST", "/api/migration/mapping/fields", { body, headers: asOwner() })).status).toBe(400);
    expect((await callRoute(mods.fields, "GET", `/api/migration/mapping/fields${q()}`, { headers: asUser(other.cookie) })).status).toBe(404);
    expect(fieldOf(await mapping(), "clients", "nom").label).toBe("Nom");
  });

  it("aucune correction sur un projet en pause (l'aperçu reste possible)", async () => {
    const paused = await callRoute(mods.project, "PATCH", `/api/projects/${pid}`, { params: { id: pid }, body: { action: "pause" }, headers: asOwner() });
    expect(paused.status).toBe(200);
    const cur = (await mapping()).current.version;
    const r = await fields({ version: cur, entity: "clients", field: "nom", op: "update", changes: { label: "Raison sociale" } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/pause/);
    expect((await fields({ version: cur, entity: "clients", field: "nom", op: "update", changes: { label: "Raison sociale" }, dry_run: true })).status).toBe(200);
    await callRoute(mods.project, "PATCH", `/api/projects/${pid}`, { params: { id: pid }, body: { action: "resume" }, headers: asOwner() });
    expect((await mapping()).current.version).toBe(cur);
  });
});
