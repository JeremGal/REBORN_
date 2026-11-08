/**
 * Interface du logiciel livré : formulaires simples, champs techniques, fiches reliées, listes lisibles,
 * planning et « Aujourd'hui » — pilotés par la spécification, jamais propres à un métier.
 *
 * Jeu de test INVENTÉ (aucune donnée réelle) : 2 chambres, 3 personnes, 4 séjours dont un à cheval sur deux
 * mois et deux qui changent le jour même (départ et arrivée le 15/03/2026 dans la même chambre).
 *   1. Contrat : ui.form_fields, ui.technical_fields et ui.views validés (zod), contrôlés (checkMapping) et
 *      transmis à l'ApplicationSpec (buildAppSpec / enrichSpec) ; vue incohérente non construite et signalée.
 *   2. Runtime réel (server.mjs démarré dans un dossier temporaire) : GET /api/views/<nom> (session, période
 *      validée, aucune injection), « Aujourd'hui » (/api/dashboard?today=…), titres des références, enregistrements
 *      liés triés par date la plus récente, recherche par le titre.
 *   3. Rendu (fonctions de runtime/public/ui-core.js utilisées par app.js) : listes (références titrées, dates
 *      françaises, euros, Oui / Non), formulaires (essentiels d'abord, techniques absents), disposition du planning.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { checkMapping, MigrationMappingSchema, type MigrationMapping } from "./lib/migration/mapping";
import { profileTables } from "./lib/migration/profile";
import { ApplicationSpecSchema, enrichSpec } from "./lib/migration/application-spec";

const RUNTIME = path.resolve(import.meta.dirname, "../runtime");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-ui-"));
process.env.REBORN_DATA_DIR = path.join(tmp, "studio");
process.env.REBORN_APPS_DIR = path.join(tmp, "generated");
const APP_DIR = path.join(tmp, "generated", "hotel-essai");
const ADMIN = { username: "admin", password: randomBytes(12).toString("base64url") };
const TODAY = "2026-03-15";

/** Fonctions de runtime/public/ui-core.js (module du navigateur, JavaScript sans types) utilisées ici. */
type Rec = Record<string, any>;
interface Seg {
  item: Rec;
  col: number;
  span: number;
  before: boolean;
  after: boolean;
}
interface UiCore {
  fieldGroups(e: Rec): { essential: Rec[]; more: Rec[]; technical: Rec[]; declared: boolean };
  listColumns(e: Rec, names?: string[], opts?: Rec): Rec[];
  relatedColumns(e: Rec, via: string, views?: Rec[], max?: number): Rec[];
  formatOf(f: Rec, v: unknown, ref?: string, currency?: string): string;
  plainOf(f: Rec, v: unknown, ref?: string, currency?: string): string;
  optionLabel(f: Rec, v: unknown): unknown;
  titleOf(e: Rec, row: Rec, views?: Rec[], currency?: string): string;
  headingOf(e: Rec, row: Rec, currency?: string): string;
  planningLayout(data: Rec, from: string, to: string, today?: string | null): { days: Rec[]; rows: { resource: Rec | null; lanes: Seg[][] }[]; used: number; capacity: number; count: number };
  todayLinks(v: Rec, day: string): Record<"arrivals" | "departures" | "current" | "planning", string>;
  monthOf(ym: string): Rec | null;
  shiftMonth(ym: string, n: number): string;
  addDays(iso: string, n: number): string;
  daysBetween(a: string, b: string): number;
  dayLabel(iso: string): string;
}
// Chargé par son chemin, comme les autres fichiers du runtime (même code que le navigateur)
let ui: UiCore;

/* Jeu de test inventé ------------------------------------------------------- */
const RAW = [
  { name: "rooms", columns: ["room_id", "numero", "etage", "capacite"], rows: [["1", "101", "1", "2"], ["2", "102", "1", "3"]] },
  {
    name: "guests",
    columns: ["guest_id", "nom", "prenom", "telephone", "email", "ville", "commentaire", "poste", "cle", "annee"],
    rows: [
      ["1", "Durand", "Alice", "0102030405", "alice.durand@exemple.test", "Lyon", "", "poste-1", "2026:1", "2026"],
      ["2", "Martin", "Bruno", "0102030406", "bruno.martin@exemple.test", "Nantes", "Client fidèle", "poste-1", "2026:2", "2026"],
      ["3", "Lefèvre", "Chloé", "0102030407", "chloe.lefevre@exemple.test", "Lille", "", "poste-2", "2026:3", "2026"],
    ],
  },
  {
    name: "bookings",
    columns: ["booking_id", "numero", "guest_id", "room_id", "arrivee", "depart", "nuits", "personnes", "montant", "confirmee", "cle", "annee", "jour_debut"],
    rows: [
      ["1", "11", "1", "1", "2026-03-12", "2026-03-15", "3", "2", "330.00", "S", "2026:11", "2026", "71"],
      ["2", "12", "2", "2", "2026-03-28", "2026-04-03", "6", "1", "720.50", "S", "2026:12", "2026", "87"],
      ["3", "13", "3", "1", "2026-03-15", "2026-03-17", "2", "1", "190.00", "N", "2026:13", "2026", "74"],
      ["4", "14", "1", "2", "2026-04-10", "2026-04-12", "2", "2", "240.00", "S", "2026:14", "2026", "100"],
    ],
  },
  { name: "stay_guests", columns: ["sg_id", "booking_id", "guest_id", "lien"], rows: [["1", "1", "1", "Titulaire"], ["2", "1", "3", "Accompagnant"], ["3", "2", "2", "Titulaire"], ["4", "3", "3", "Titulaire"]] },
  { name: "charges", columns: ["charge_id", "booking_id", "libelle", "montant"], rows: [["1", "1", "Petit-déjeuner", "12.50"], ["2", "1", "Taxe de séjour", "3.30"], ["3", "2", "Parking", "15.00"]] },
];

const PLANNING = { kind: "planning", name: "planning", label: "Planning des chambres", start: "arrivee", end: "depart", resource: "chambre", title: "client", status: "confirmee" } as const;

function mapping(extraViews: unknown[] = []): MigrationMapping {
  return MigrationMappingSchema.parse({
    contract_version: "1.0",
    source_system: "Logiciel d'essai",
    target: { id: "hotel-essai", name: "Hôtel d'essai" },
    entities: [
      {
        name: "reservations",
        label: "Réservations",
        label_singular: "Réservation",
        source: { table: "bookings", key: "booking_id" },
        title_field: "numero",
        fields: [
          { name: "numero", label: "N° de réservation", source: "numero", type: "integer" },
          { name: "client", label: "Client", source: "guest_id", type: "reference", references: "clients" },
          { name: "chambre", label: "Chambre", source: "room_id", type: "reference", references: "chambres" },
          { name: "arrivee", label: "Arrivée", source: "arrivee", type: "date" },
          { name: "depart", label: "Départ", source: "depart", type: "date" },
          { name: "nuits", label: "Nuits", source: "nuits", type: "integer" },
          { name: "personnes", label: "Personnes", source: "personnes", type: "integer" },
          { name: "montant", label: "Montant du séjour", source: "montant", type: "money", transforms: [{ money: "dot" }] },
          { name: "confirmee", label: "Confirmée", source: "confirmee", type: "enum", options: [{ value: "S" }, { value: "N" }] },
          { name: "cle", label: "Référence d'origine", source: "cle", type: "text" },
          { name: "annee", label: "Année", source: "annee", type: "integer" },
          { name: "jour_debut", label: "Jour d'arrivée (n°)", source: "jour_debut", type: "integer" },
        ],
        ui: {
          list_fields: ["client", "chambre", "arrivee", "depart", "nuits", "montant", "confirmee", "cle"],
          search_fields: ["numero"],
          form_fields: ["client", "chambre", "arrivee", "depart", "personnes", "montant", "confirmee"],
          technical_fields: ["cle", "annee", "jour_debut"],
          views: [PLANNING, ...extraViews],
        },
      },
      {
        name: "clients",
        label: "Clients",
        label_singular: "Client",
        source: { table: "guests", key: "guest_id" },
        title_field: "nom",
        fields: [
          { name: "nom", label: "Nom", source: "nom", type: "text", required: true },
          { name: "prenom", label: "Prénom", source: "prenom", type: "text" },
          { name: "telephone", label: "Téléphone", source: "telephone", type: "phone" },
          { name: "email", label: "E-mail", source: "email", type: "email" },
          { name: "ville", label: "Ville", source: "ville", type: "text" },
          { name: "commentaire", label: "Commentaire", source: "commentaire", type: "text" },
          { name: "poste", label: "Poste de saisie", source: "poste", type: "text" },
          { name: "cle", label: "Référence d'origine", source: "cle", type: "text" },
          { name: "annee", label: "Année", source: "annee", type: "integer" },
        ],
        ui: { list_fields: ["nom", "prenom", "telephone", "ville", "poste"], form_fields: ["prenom", "telephone", "email"], technical_fields: ["poste", "cle", "annee"] },
      },
      {
        name: "chambres",
        label: "Chambres",
        label_singular: "Chambre",
        source: { table: "rooms", key: "room_id" },
        title_field: "numero",
        fields: [
          { name: "numero", label: "N° de chambre", source: "numero", type: "text" },
          { name: "etage", label: "Étage", source: "etage", type: "integer" },
          { name: "capacite", label: "Capacité", source: "capacite", type: "integer" },
        ],
      },
      {
        name: "occupants",
        label: "Occupants",
        label_singular: "Occupant",
        source: { table: "stay_guests", key: "sg_id" },
        title_field: "lien",
        fields: [
          { name: "reservation", label: "Réservation", source: "booking_id", type: "reference", references: "reservations" },
          { name: "client", label: "Client", source: "guest_id", type: "reference", references: "clients" },
          { name: "lien", label: "Lien", source: "lien", type: "text" },
        ],
        ui: { nav: false, list_fields: ["reservation", "client", "lien"] },
      },
      {
        name: "frais",
        label: "Frais de séjour",
        label_singular: "Frais",
        source: { table: "charges", key: "charge_id" },
        title_field: "libelle",
        fields: [
          { name: "reservation", label: "Réservation", source: "booking_id", type: "reference", references: "reservations" },
          { name: "libelle", label: "Libellé", source: "libelle", type: "text" },
          { name: "montant", label: "Montant", source: "montant", type: "money", transforms: [{ money: "dot" }] },
          // Lien technique (clé recomposée) : jamais un panneau d'enregistrements liés sur la réservation
          { name: "lien_technique", label: "Lien technique", source: "booking_id", type: "reference", references: "reservations" },
        ],
        ui: { nav: false, list_fields: ["reservation", "libelle", "montant"], technical_fields: ["lien_technique"] },
      },
    ],
  });
}

/* Logiciel livré réel dans un dossier temporaire ----------------------------- */
let port = 0;
let url = "";
let child: ChildProcess | null = null;
let logs = "";
let cookie = "";
let spec: Record<string, any>;
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
async function call(method: string, p: string, body?: unknown, withCookie = true) {
  const r = await fetch(url + p, { method, headers: { "content-type": "application/json", origin: url, ...(withCookie && cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, body: json, setCookie: r.headers.getSetCookie() };
}
/** Données migrées inventées : insérées comme le ferait la migration (_migrated = 1, clé d'origine conservée). */
function seed(db: DatabaseSync) {
  const ins = (table: string, cols: string[], rows: unknown[][], keys: string[]) => {
    const st = db.prepare(`INSERT INTO "${table}" (${[...cols, "_source_key", "_migrated"].map((c) => `"${c}"`).join(", ")}) VALUES (${[...cols, "", ""].map(() => "?").join(", ")})`);
    rows.forEach((r, i) => st.run(...(r as (string | number | null)[]), keys[i], 1));
  };
  ins("chambres", ["numero", "etage", "capacite"], [["101", 1, 2], ["102", 1, 3]], ["1", "2"]);
  ins(
    "clients",
    ["nom", "prenom", "telephone", "email", "ville", "commentaire", "poste", "cle", "annee"],
    [
      ["Durand", "Alice", "0102030405", "alice.durand@exemple.test", "Lyon", null, "poste-1", "2026:1", 2026],
      ["Martin", "Bruno", "0102030406", "bruno.martin@exemple.test", "Nantes", "Client fidèle", "poste-1", "2026:2", 2026],
      ["Lefèvre", "Chloé", "0102030407", "chloe.lefevre@exemple.test", "Lille", null, "poste-2", "2026:3", 2026],
    ],
    ["1", "2", "3"],
  );
  ins(
    "reservations",
    ["numero", "client", "chambre", "arrivee", "depart", "nuits", "personnes", "montant", "confirmee", "cle", "annee", "jour_debut"],
    [
      [11, 1, 1, "2026-03-12", "2026-03-15", 3, 2, 33000, "S", "2026:11", 2026, 71],
      [12, 2, 2, "2026-03-28", "2026-04-03", 6, 1, 72050, "S", "2026:12", 2026, 87],
      [13, 3, 1, "2026-03-15", "2026-03-17", 2, 1, 19000, "N", "2026:13", 2026, 74],
      [14, 1, 2, "2026-04-10", "2026-04-12", 2, 2, 24000, "S", "2026:14", 2026, 100],
    ],
    ["1", "2", "3", "4"],
  );
  ins("occupants", ["reservation", "client", "lien"], [[1, 1, "Titulaire"], [1, 3, "Accompagnant"], [2, 2, "Titulaire"], [3, 3, "Titulaire"]], ["1", "2", "3", "4"]);
  ins("frais", ["reservation", "libelle", "montant"], [[1, "Petit-déjeuner", 1250], [1, "Taxe de séjour", 330], [2, "Parking", 1500]], ["1", "2", "3"]);
}

beforeAll(async () => {
  ui = (await import(path.join(RUNTIME, "public/ui-core.js"))) as UiCore;
  const { buildAppSpec, writeApp } = await import("./lib/migration/generate");
  port = await freePort();
  url = `http://127.0.0.1:${port}`;
  const m = mapping();
  spec = enrichSpec(buildAppSpec(m, { runId: "RUN_ESSAI", sourceSystem: "Logiciel d'essai", port, company: "Hôtel d'essai" }), m, {
    decisions: {},
    mapping: { version: 1, origin: "fixture" },
    runId: "RUN_ESSAI",
    rules: [],
    pendingModels: [],
    unmapped: [],
  });
  writeApp(spec as never, APP_DIR);
  fs.mkdirSync(path.join(APP_DIR, "data"), { recursive: true });
  const db = new DatabaseSync(path.join(APP_DIR, "data", "app.db"));
  try {
    for (const s of spec.ddl as string[]) db.exec(s);
    seed(db);
  } finally {
    db.close();
  }
  fs.mkdirSync(path.join(APP_DIR, ".secrets"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(APP_DIR, ".secrets", "admin.json"), JSON.stringify(ADMIN), { mode: 0o600 });
  child = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: APP_DIR, env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1" } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout!.on("data", (b) => (logs += String(b)));
  child.stderr!.on("data", (b) => (logs += String(b)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const login = await call("POST", "/api/auth/login", ADMIN);
  expect(login.status, logs).toBe(200);
  cookie = login.setCookie[0]!.split(";")[0]!;
}, 30000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child!.once("exit", r));
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* 1. Contrat ----------------------------------------------------------------- */
describe("Contrat : formulaires simples, champs techniques et vues", () => {
  it("les correspondances acceptent ui.form_fields, ui.technical_fields et ui.views ; une vue mal formée est refusée", () => {
    expect(() => mapping()).not.toThrow();
    const base = structuredClone(mapping()) as MigrationMapping;
    const withView = (v: unknown) => ({ ...base, entities: base.entities.map((e, i) => (i ? e : { ...e, ui: { ...e.ui, views: [v] } })) });
    expect(MigrationMappingSchema.safeParse(withView({ ...PLANNING, kind: "agenda" })).success).toBe(false);
    expect(MigrationMappingSchema.safeParse(withView({ ...PLANNING, name: "Planning des chambres" })).success).toBe(false);
    expect(MigrationMappingSchema.safeParse(withView({ ...PLANNING, start: 'arrivee"; DROP TABLE x; --' })).success).toBe(false);
    expect(MigrationMappingSchema.safeParse(withView({ ...PLANNING, couleur: "rouge" })).success).toBe(false);
    const { status: _status, ...noStatus } = PLANNING;
    expect(MigrationMappingSchema.safeParse(withView(noStatus)).success).toBe(true);
  });

  it("checkMapping signale (sans bloquer) les noms inconnus et les vues incohérentes", () => {
    const m = mapping([{ kind: "planning", name: "planning_faux", label: "Faux planning", start: "nuits", end: "depart", resource: "montant", title: "inconnu" }]);
    m.entities[1]!.ui!.form_fields = ["prenom", "inexistant", "poste"];
    const issues = checkMapping(m, profileTables(RAW));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const text = issues.map((i) => `${i.path} ${i.message}`).join("\n");
    expect(text).toMatch(/ui\.form_fields champ inconnu : inexistant/);
    expect(text).toMatch(/poste est aussi déclaré technique/);
    expect(text).toMatch(/planning_faux.*start : nuits n'est pas une date/);
    expect(text).toMatch(/resource : montant n'est pas une référence/);
    expect(text).toMatch(/title : champ inconnu inconnu/);
  });

  it("buildAppSpec / enrichSpec transmettent les clés ; la vue incohérente n'est pas construite et le dit", async () => {
    const { buildAppSpec } = await import("./lib/migration/generate");
    const m = mapping([{ kind: "planning", name: "planning_faux", label: "Faux planning", start: "nuits", end: "depart", resource: "chambre", title: "client" }]);
    const s = enrichSpec(buildAppSpec(m, { runId: "RUN_X" }), m, { decisions: {}, mapping: { version: 1, origin: "fixture" }, runId: "RUN_X", rules: [], pendingModels: [], unmapped: [] });
    expect(ApplicationSpecSchema.safeParse(s).success).toBe(true);
    const res = s.entities.find((e) => e.name === "reservations")!;
    expect(res.form_fields).toEqual(["client", "chambre", "arrivee", "depart", "personnes", "montant", "confirmee"]);
    expect(res.technical_fields).toEqual(["cle", "annee", "jour_debut"]);
    // Un champ technique n'est jamais une colonne, même demandé
    expect(res.list_fields).not.toContain("cle");
    expect(s.entities.find((e) => e.name === "clients")!.list_fields).toEqual(["nom", "prenom", "telephone", "ville"]);
    expect(s.views).toEqual([{ entity: "reservations", ...PLANNING }]);
    // Relations inverses montrées sur la fiche : jamais celles portées par un champ technique
    expect(res.children.map((c) => `${c.entity}.${c.via}`)).toEqual(["occupants.reservation", "frais.reservation"]);
    expect(s.not_rebuilt?.find((x) => x.kind === "view")).toMatchObject({ name: "reservations.planning_faux", reason: expect.stringMatching(/start : nuits n'est pas une date/) });
    expect(s.screens?.find((x) => x.kind === "planning")).toMatchObject({ id: "view.planning", entity: "reservations", fields: ["arrivee", "depart", "chambre", "client", "confirmee"] });
    expect(s.screens?.find((x) => x.id === "reservations.form")?.fields?.slice(0, 7)).toEqual(res.form_fields);
    expect(s.screens?.find((x) => x.id === "reservations.form")?.fields).not.toContain("cle");
    // Sans clés ui : comportement inchangé (tous les champs, aucune vue)
    const plain = MigrationMappingSchema.parse({ ...m, entities: m.entities.map(({ ui: _ui, ...e }) => e) });
    const s0 = buildAppSpec(plain, { runId: "RUN_0" });
    expect(s0.views).toEqual([]);
    expect(s0.entities.every((e) => e.form_fields.length === 0 && e.technical_fields.length === 0)).toBe(true);
  });

  it("le logiciel livré porte la spécification complète (app.json conforme au contrat)", () => {
    const appJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, "app.json"), "utf8"));
    expect(ApplicationSpecSchema.safeParse(appJson).success).toBe(true);
    expect(appJson.views).toEqual([{ entity: "reservations", ...PLANNING }]);
    expect(fs.existsSync(path.join(APP_DIR, "public", "ui-core.js"))).toBe(true);
  });
});

/* 2. Runtime réel -------------------------------------------------------------- */
describe("Logiciel livré : API du planning, d'« Aujourd'hui » et des fiches reliées", () => {
  it("/api/meta expose la vue validée, les champs essentiels et techniques", async () => {
    const meta = (await call("GET", "/api/meta")).body;
    expect(meta.views).toEqual([{ entity: "reservations", ...PLANNING }]);
    const res = meta.entities.find((e: { name: string }) => e.name === "reservations");
    expect(res.form_fields[0]).toBe("client");
    expect(res.technical_fields).toEqual(["cle", "annee", "jour_debut"]);
  });

  it("GET /api/views/planning : ressources triées, séjours du mois (y compris à cheval), titres liés", async () => {
    const mar = await call("GET", "/api/views/planning?from=2026-03-01&to=2026-03-31");
    expect(mar.status).toBe(200);
    expect(mar.body.resources.map((r: { title: string }) => r.title)).toEqual(["101", "102"]);
    expect(mar.body.items.map((x: { title: string; start: string; end: string; status: string }) => [x.title, x.start, x.end, x.status])).toEqual([
      ["Durand", "2026-03-12", "2026-03-15", "S"],
      ["Lefèvre", "2026-03-15", "2026-03-17", "N"],
      ["Martin", "2026-03-28", "2026-04-03", "S"],
    ]);
    const apr = await call("GET", "/api/views/planning?from=2026-04-01&to=2026-04-30");
    expect(apr.body.items.map((x: { title: string }) => x.title)).toEqual(["Martin", "Durand"]);
    // Fin exclue : un séjour terminé le 15 n'occupe pas le 15
    const day15 = await call("GET", "/api/views/planning?from=2026-03-15&to=2026-03-15");
    expect(day15.body.items.map((x: { title: string }) => x.title)).toEqual(["Lefèvre"]);
  });

  it("GET /api/views : session requise, période contrôlée, aucune injection par le nom ou les paramètres", async () => {
    expect((await call("GET", "/api/views/planning?from=2026-03-01&to=2026-03-31", undefined, false)).status).toBe(401);
    expect((await call("GET", "/api/views/planning?from=2026-02-30&to=2026-03-31")).status).toBe(400);
    expect((await call("GET", "/api/views/planning?from=2026-03-31&to=2026-03-01")).status).toBe(400);
    expect((await call("GET", "/api/views/planning?from=2026-01-01&to=2026-12-31")).status).toBe(400);
    expect((await call("GET", "/api/views/planning?from=2026-03-01'%20OR%201=1--&to=2026-03-31")).status).toBe(400);
    expect((await call("GET", "/api/views/inconnue")).status).toBe(404);
    expect((await call("GET", `/api/views/${encodeURIComponent('planning" --')}`)).status).toBe(404);
    expect((await call("POST", "/api/views/planning", {})).status).toBe(405);
    expect((await call("GET", "/api/views/planning")).status).toBe(200);
  });

  it("« Aujourd'hui » : arrivées et départs du jour, en cours, chambres occupées sur le total", async () => {
    const d = (await call("GET", `/api/dashboard?today=${TODAY}`)).body;
    expect(d.today.day).toBe(TODAY);
    const b = d.today.boards[0];
    expect(b).toMatchObject({ view: "planning", entity: "reservations", current: 1, current_titles: 1, occupied: 1, resources: 2 });
    expect(b.arrivals).toMatchObject({ total: 1, items: [{ title: "Lefèvre", resource: "101" }] });
    expect(b.departures).toMatchObject({ total: 1, items: [{ title: "Durand", resource: "101" }] });
    // Les liens des cartes mènent à des listes que le serveur sait filtrer : mêmes comptes
    const links = ui.todayLinks({ entity: "reservations", ...PLANNING }, TODAY);
    const count = async (href: string) => (await call("GET", `/api/e/${href.slice(4).replace("?", "?per=50&")}`)).body.total;
    expect(await count(links.arrivals)).toBe(1);
    expect(await count(links.departures)).toBe(1);
    expect(await count(links.current)).toBe(1);
    // Jour sans mouvement ; paramètre invalide : jour du serveur
    expect((await call("GET", "/api/dashboard?today=2026-03-20")).body.today.boards[0]).toMatchObject({ current: 0, arrivals: { total: 0 }, departures: { total: 0 }, occupied: 0 });
    expect((await call("GET", "/api/dashboard?today=n'importe")).status).toBe(200);
  });

  it("listes : références avec le titre de la fiche liée ; une réservation liée se lit « personne · chambre · période »", async () => {
    const list = (await call("GET", "/api/e/reservations?sort=arrivee&per=10")).body;
    expect(list.rows.map((r: { _refs: Record<string, string> }) => [r._refs.client, r._refs.chambre])).toEqual([
      ["Durand", "101"],
      ["Lefèvre", "101"],
      ["Martin", "102"],
      ["Durand", "102"],
    ]);
    const frais = (await call("GET", "/api/e/frais?sort=libelle&per=10")).body.rows;
    expect(frais.find((r: { libelle: string }) => r.libelle === "Parking")._refs.reservation).toBe("Martin · 102 · du 28/03/2026 au 03/04/2026");
    // Recherche par le titre de la fiche (la chambre n'a pas de champ de recherche déclaré)
    expect((await call("GET", "/api/e/chambres?q=102")).body.rows.map((r: { numero: string }) => r.numero)).toEqual(["102"]);
    expect((await call("GET", "/api/e/clients?q=lef")).body.total).toBe(1);
  });

  it("fiches reliées : séjours d'une personne et d'une chambre, du plus récent au plus ancien ; occupants et frais d'une réservation", async () => {
    const durand = (await call("GET", "/api/e/clients/1")).body;
    expect(durand.children["reservations.client"]).toMatchObject({ total: 2, sort: { field: "arrivee", dir: "desc" } });
    expect(durand.children["reservations.client"].rows.map((r: { arrivee: string; _refs: Record<string, string> }) => [r.arrivee, r._refs.chambre])).toEqual([
      ["2026-04-10", "102"],
      ["2026-03-12", "101"],
    ]);
    const room101 = (await call("GET", "/api/e/chambres/1")).body;
    expect(room101.children["reservations.chambre"].rows.map((r: { _refs: Record<string, string> }) => r._refs.client)).toEqual(["Lefèvre", "Durand"]);
    const resa = (await call("GET", "/api/e/reservations/1")).body;
    expect(resa.record._refs).toMatchObject({ client: "Durand", chambre: "101" });
    expect(resa.children["occupants.reservation"].total).toBe(2);
    expect(Object.keys(resa.children).sort()).toEqual(["frais.reservation", "occupants.reservation"]);
    expect(resa.children["frais.reservation"].rows.map((r: { libelle: string }) => r.libelle).sort()).toEqual(["Petit-déjeuner", "Taxe de séjour"]);
    // Pages suivantes : même tri par la liste filtrée
    const page2 = (await call("GET", "/api/e/reservations?client=1&sort=arrivee&dir=desc&per=1&page=2")).body;
    expect(page2.rows.map((r: { arrivee: string }) => r.arrivee)).toEqual(["2026-03-12"]);
    // Sans date propre (occupants) : tri par la date de début du séjour lié, plus récent d'abord
    const lefevre = (await call("GET", "/api/e/clients/3")).body.children["occupants.client"];
    expect(lefevre).toMatchObject({ total: 2, sort: { field: "reservation.arrivee", dir: "desc" } });
    expect(lefevre.rows.map((r: { reservation: number }) => r.reservation)).toEqual([3, 1]);
    const next = (await call("GET", "/api/e/occupants?client=3&sort=reservation.arrivee&dir=desc&per=1&page=2")).body;
    expect(next.rows.map((r: { reservation: number }) => r.reservation)).toEqual([1]);
    // Tri par un champ lié inconnu ou mal formé : ordre de création, jamais d'erreur ni d'injection
    for (const bad of ["client.inexistant", "reservation.arrivee);DROP TABLE x;--", "lien.nom"]) expect((await call("GET", `/api/e/occupants?sort=${encodeURIComponent(bad)}`)).status).toBe(200);
  });
});

/* 3. Rendu de l'interface (fonctions de ui-core.js utilisées par app.js) ---------------- */
describe("Interface : formulaires simples, listes lisibles, planning", () => {
  const meta = () => call("GET", "/api/meta").then((r) => r.body);

  it("formulaire : champs essentiels d'abord et dans l'ordre, les autres repliés, les techniques absents", async () => {
    const m = await meta();
    const res = m.entities.find((e: { name: string }) => e.name === "reservations");
    const g = ui.fieldGroups(res);
    expect(g.declared).toBe(true);
    expect(g.essential.map((f) => f.name)).toEqual(["client", "chambre", "arrivee", "depart", "personnes", "montant", "confirmee"]);
    expect(g.more.map((f) => f.name)).toEqual(["numero", "nuits"]);
    expect(g.technical.map((f) => f.name)).toEqual(["cle", "annee", "jour_debut"]);
    for (const n of ["cle", "annee", "jour_debut"]) expect([...g.essential, ...g.more].map((f) => f.name)).not.toContain(n);
    // Un champ obligatoire absent de form_fields n'est jamais caché
    const cl = ui.fieldGroups(m.entities.find((e: { name: string }) => e.name === "clients"));
    expect(cl.essential.map((f) => f.name)).toEqual(["prenom", "telephone", "email", "nom"]);
    expect(cl.more.map((f) => f.name)).toEqual(["ville", "commentaire"]);
    // Sans form_fields : tous les champs non techniques, comme avant
    const ch = ui.fieldGroups(m.entities.find((e: { name: string }) => e.name === "chambres"));
    expect([ch.declared, ch.more.length, ch.essential.map((f) => f.name)]).toEqual([false, 0, ["numero", "etage", "capacite"]]);
  });

  it("listes : colonnes sans champ technique ; références titrées, dates françaises, euros, Oui / Non", async () => {
    const m = await meta();
    const res = m.entities.find((e: { name: string }) => e.name === "reservations");
    const cols = ui.listColumns(res);
    expect(cols.map((f) => f.name)).toEqual(["client", "chambre", "arrivee", "depart", "nuits", "montant", "confirmee"]);
    const rows = (await call("GET", "/api/e/reservations?sort=arrivee&per=10")).body.rows;
    const html = rows.map((r: Record<string, unknown> & { _refs: Record<string, string> }) => cols.map((f) => ui.formatOf(f, r[f.name], r._refs?.[f.name])));
    expect(html[0][0]).toBe('<a href="#/e/clients/1">Durand</a>');
    expect(html[0][1]).toBe('<a href="#/e/chambres/1">101</a>');
    expect(html[0][2]).toBe('<span class="num">12/03/2026</span>');
    expect(html[0][5]).toMatch(/^<span class="num">330,00\s€<\/span>$/u);
    expect(html[0][6]).toBe("Oui");
    expect(html[1][6]).toBe("Non");
    // Une date conservée en texte s'affiche aussi à la française ; un libellé déclaré l'emporte sur Oui / Non
    expect(ui.plainOf({ type: "text" }, "2026-03-12")).toBe("12/03/2026");
    // Entiers (numéros, années, codes) sans séparateur de milliers
    expect(ui.plainOf({ type: "integer" }, 2024)).toBe("2024");
    expect(ui.optionLabel({ type: "enum", options: [{ value: "S", label: "Confirmée" }, { value: "N", label: "En attente" }] }, "S")).toBe("Confirmée");
    expect(ui.optionLabel({ type: "enum", options: [{ value: "S" }, { value: "N" }, { value: "X" }] }, "S")).toBe("S");
    // Titres : numéro seul précédé du nom de l'entité ; clé d'origine si le titre manque
    const room = m.entities.find((e: { name: string }) => e.name === "chambres");
    expect(ui.headingOf(room, { id: 1, numero: "101" })).toBe("Chambre 101");
    expect(ui.titleOf(room, { id: 3, numero: null, _source_key: "103" })).toBe("103");
    expect(ui.titleOf(res, rows[0], m.views)).toBe("Durand · 101 · du 12/03/2026 au 15/03/2026");
    expect(ui.headingOf(res, rows[0])).toBe("Réservation 11");
    // Fiche d'une personne : séjours avec chambre, arrivée, départ, nuits (jamais la personne elle-même)
    expect(ui.relatedColumns(res, "client", m.views).map((f) => f.name)).toEqual(["arrivee", "depart", "chambre", "nuits", "montant", "confirmee"]);
    expect(ui.relatedColumns(res, "chambre", m.views).map((f) => f.name)).toEqual(["arrivee", "depart", "client", "nuits", "montant", "confirmee"]);
    // Le lien de ligne porte une donnée de l'enregistrement lié, pas le nom d'une autre fiche
    const occ = m.entities.find((e: { name: string }) => e.name === "occupants");
    expect(ui.relatedColumns(occ, "client", m.views).map((f) => f.name)).toEqual(["lien", "reservation"]);
  });

  it("planning : barres par chambre, séjour coupé aux bords du mois, jour courant repéré, aucun chevauchement masqué", async () => {
    const mar = (await call("GET", "/api/views/planning?from=2026-03-01&to=2026-03-31")).body;
    const lay = ui.planningLayout(mar, "2026-03-01", "2026-03-31", TODAY);
    expect(lay.days).toHaveLength(31);
    expect(lay.days.filter((d) => d.today).map((d) => d.iso)).toEqual([TODAY]);
    expect(lay.days[0]).toMatchObject({ iso: "2026-03-01", dow: 0, weekend: true });
    const [r101, r102] = lay.rows;
    expect(r101.resource?.title).toBe("101");
    // Départ et arrivée le même jour dans la même chambre : une seule ligne (fin exclue)
    expect(r101.lanes).toHaveLength(1);
    expect(r101.lanes[0].map((s) => [s.item.title, s.col, s.span, s.before, s.after])).toEqual([
      ["Durand", 11, 3, false, false],
      ["Lefèvre", 14, 2, false, false],
    ]);
    expect(r102.lanes[0].map((s) => [s.item.title, s.col, s.span, s.after])).toEqual([["Martin", 27, 4, true]]);
    expect(lay.used).toBe(9);
    const apr = ui.planningLayout((await call("GET", "/api/views/planning?from=2026-04-01&to=2026-04-30")).body, "2026-04-01", "2026-04-30");
    expect(apr.rows[1].lanes[0].map((s) => [s.item.title, s.col, s.span, s.before])).toEqual([
      ["Martin", 0, 2, true],
      ["Durand", 9, 2, false],
    ]);
    // Deux éléments qui se chevauchent sur une même ressource : deux lignes, rien n'est caché
    const clash = ui.planningLayout({ resources: [{ id: 1, title: "101" }], items: [{ id: 1, start: "2026-03-02", end: "2026-03-05", resource: 1 }, { id: 2, start: "2026-03-04", end: "2026-03-06", resource: 1 }, { id: 3, start: "2026-03-08", end: null, resource: null }] }, "2026-03-01", "2026-03-31");
    expect(clash.rows[0].lanes).toHaveLength(2);
    expect(clash.rows[1]).toMatchObject({ resource: null });
    expect(clash.rows[1].lanes[0][0]).toMatchObject({ col: 7, span: 1 });
  });

  it("calendrier : mois, navigation et jours sans décalage d'heure d'été", () => {
    expect(ui.monthOf("2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", days: 28, label: "février 2026" });
    expect(ui.monthOf("2024-02")?.days).toBe(29);
    expect(ui.monthOf("2026-13")).toBeNull();
    expect(ui.shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(ui.shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(ui.addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(ui.daysBetween("2026-03-28", "2026-04-03")).toBe(6);
    expect(ui.dayLabel("2026-03-15")).toBe("dimanche 15 mars 2026");
  });
});
