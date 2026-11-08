/**
 * Isolation des clients (lot B1) — SPEC §12 « test B » et inventaire de TOUTES les routes de l'API.
 *
 * Vraies routes, vrais comptes (Better Auth en mémoire, dossier de données temporaire), vrais jetons de
 * service. Deux clients A et B ont chacun leur projet, avec des données de migration (source, correspondances,
 * décisions, exécution) et une découverte (investigation de l'exécuteur, observation avec capture, action,
 * schéma, règles de l'Analyste) ; l'atelier a aussi ses données (sans projet).
 * Aucun serveur en service n'est touché : logiciels livrés dans un dossier temporaire, port libre.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { asService, asUser, authRequest, callRoute, cleanupAuthEnv, makeOperator, ORIGIN, setupAuthEnv, signIn, signUp, type Json, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { canSee, eventProject, observationProject, onlyProjects, SEE_ALL, viewRevision, viewState, visibilityFor } from "@/lib/visibility";
import type { AgentEvent, Investigation, Observation, RebornState } from "@/lib/types";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const API = path.join(import.meta.dirname, "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const ACCESS = ["public", "user", "owner", "operator", "explorer", "analyst"];
/**
 * Seules routes publiques (sans aucune donnée) : comptes Better Auth, diagnostic réduit, schémas des contrats,
 * ancienne session (410), et la suppression sur demande traitée en ligne de commande (admin/erase : clé de
 * l'opérateur exigée, sans elle 401 — vérifié par review-server.test.ts, SEC-06).
 */
const PUBLIC = ["auth/[...all]", "health", "contracts", "migration/contracts", "session", "admin/erase"];
/** Routes de ce lot (annotation complète exigée : access, project, write). */
const B1_ROUTES = [
  "app", "compare", "compute", "contracts", "events", "health", "investigations", "observations", "reset", "revision", "rules", "scenarios", "schema", "shots/[id]", "state", "stream",
  "migration", "migration/app", "migration/app/rules", "migration/business-model", "migration/business-model/check", "migration/business-model/decision", "migration/contracts",
  "migration/decisions", "migration/deploy", "migration/mapping", "migration/profile", "migration/reconcile", "migration/rollback", "migration/runs", "migration/runs/[id]",
  "migration/runs/[id]/acknowledge", "migration/runs/[id]/rejects", "migration/sources", "migration/spec",
];

function routeFiles(dir = API): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? routeFiles(path.join(dir, d.name)) : d.name === "route.ts" ? [path.join(dir, d.name)] : []))
    .sort();
}
const keyOf = (file: string) => path.relative(API, path.dirname(file)).split(path.sep).join("/");
type Annotation = { access: string[] | null; write: boolean; project: string | null };
const annotation = (f: unknown) => (f as { reborn?: Annotation }).reborn;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

const R: Record<string, Mod> = {};
let env: TestEnv;
let store: typeof import("@/lib/store");
let projectScope: typeof import("@/lib/migration/context").projectScope;
let A: TestUser, B: TestUser, OP: TestUser;

interface World {
  user: TestUser;
  tag: string;
  company: string;
  pid: string;
  inv: string;
  shots: string[];
}
let WA: World, WB: World;
let pOp = "";
let invAtelier = "";

/** URL d'une route : chaque segment dynamique est remplacé par sa valeur (`[id]` → id, `[...all]` → get-session). */
const fill = (route: string, params: Record<string, string>) => route.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_m, dots: string | undefined, name: string) => params[name] ?? (dots ? "get-session" : "x"));

interface CallOpts {
  id?: string;
  params?: Record<string, string>;
  query?: string;
  headers?: Record<string, string>;
  body?: unknown;
}
async function api(route: string, method: string, o: CallOpts = {}) {
  const mod = R[route];
  if (!mod?.[method]) throw new Error(`${method} /api/${route} : méthode absente`);
  const params = o.params ?? (o.id ? { id: o.id } : {});
  return callRoute(mod, method, `/api/${fill(route, params)}${o.query ?? ""}`, { params, headers: o.headers, body: o.body });
}
const owner = (w: World) => asUser(w.user.cookie);
const q = (w: World) => `?project=${w.pid}`;

/** Flux SSE : lecture message par message (event + data), fermeture explicite. */
async function openStream(headers: Record<string, string>, query = "") {
  const ctrl = new AbortController();
  const res = await R["stream"].GET(new Request(`${ORIGIN}/api/stream${query}`, { headers, signal: ctrl.signal }), { params: Promise.resolve({}) });
  if (!res.headers.get("content-type")?.startsWith("text/event-stream")) {
    const text = await res.text();
    return { status: res.status, text, next: async () => null, close: async () => {} };
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const next = async (ms = 1500): Promise<{ event: string; data: Json } | "closed" | null> => {
    const deadline = Date.now() + ms;
    for (;;) {
      const sep = buf.indexOf("\n\n");
      if (sep >= 0) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const event = /^event: (.*)$/m.exec(raw)?.[1] ?? "";
        const data = /^data: (.*)$/m.exec(raw)?.[1];
        return { event, data: data ? JSON.parse(data) : null };
      }
      const left = deadline - Date.now();
      if (left <= 0) return null;
      const r = await Promise.race([reader.read(), sleep(left).then(() => "timeout" as const)]);
      if (r === "timeout") return null;
      if (r.done) return "closed";
      buf += dec.decode(r.value, { stream: true });
    }
  };
  return {
    status: res.status,
    text: "",
    next,
    close: async () => {
      ctrl.abort();
      await reader.cancel().catch(() => {});
    },
  };
}

/** Données d'un client : projet, migration (source → correspondances → décisions → exécution), découverte. */
async function makeWorld(user: TestUser, tag: string, company: string, factor: number): Promise<World> {
  const who = asUser(user.cookie);
  const created = await api("projects", "POST", { headers: who, body: { company, software: `${company} Gestion`, authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/" } });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const pid = created.body.project.id as string;
  const w: World = { user, tag, company, pid, inv: "", shots: [] };
  const src = await api("migration/sources", "POST", {
    query: q(w),
    headers: who,
    // Colonne « categorie » à deux valeurs : la proposition automatique la laisse incertaine (décision humaine requise)
    body: { name: "clients.csv", content_base64: csv([["id", "nom", "categorie"], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `${tag}_SECRET_CLIENT_${i + 1}`, ["A", "B"][i % 2]])]), by: "Usurpateur" },
  });
  expect(src.status, JSON.stringify(src.body)).toBe(200);
  expect((await api("migration/mapping", "POST", { query: `${q(w)}&propose=auto`, headers: who })).status).toBe(200);
  const plan = (await api("migration/mapping", "GET", { query: q(w), headers: who })).body;
  expect(plan.status.items.filter((i: { decision: unknown }) => !i.decision).length, "points à valider").toBeGreaterThan(0);
  for (const item of plan.status.items as { key: string; decision: unknown }[]) {
    if (item.decision) continue;
    const d = await api("migration/decisions", "POST", { query: q(w), headers: who, body: { key: item.key, decision: "accepted", by: "Usurpateur" } });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
  }
  const run = await api("migration/runs", "POST", { query: q(w), headers: who, body: { by: "Usurpateur" } });
  expect(run.status, JSON.stringify(run.body)).toBe(200);
  // Découverte (SPEC §6, lot C4) : « Analyser mon logiciel » par le propriétaire, puis l'exécuteur (jeton explorer,
  // doublure de test) prend la mission ; il tient alors le prêt du projet et écrit dans l'investigation créée par
  // le Studio pour la mission, avec ?project=
  const asked = await api("projects/[id]/analysis", "POST", { id: pid, headers: who, body: { without_credentials: true } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(202);
  expect((await api("executor/heartbeat", "POST", { headers: asService("explorer"), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 4, active_missions: [] } })).status).toBe(200);
  const mission = await api("executor/missions/claim", "POST", { headers: asService("explorer") });
  expect(mission.status, JSON.stringify(mission.body)).toBe(200);
  expect(mission.body.project_id).toBe(pid);
  w.inv = mission.body.investigation_id;
  const obs = await api("observations", "POST", { query: q(w), headers: asService("explorer"), body: [{ experiment_id: `EXP_${tag}_1`, inputs: { quantite: 2 }, observed_output: { total_price: 2 * factor }, screenshot_url: PNG }] });
  expect(obs.status, JSON.stringify(obs.body)).toBe(200);
  expect(obs.body.investigation_id).toBe(w.inv);
  const act = await api("events", "POST", { query: q(w), headers: asService("explorer"), body: { source: "explorer", type: "action", title: `Écran ${tag} ouvert`, screenshot_url: PNG } });
  expect(act.status, JSON.stringify(act.body)).toBe(200);
  expect((await api("schema", "POST", { query: q(w), headers: asService("explorer"), body: { title: `Devis ${tag}`, fields: [{ name: "quantite", label: "Quantité", type: "number" }] } })).status).toBe(200);
  const rules = await api("rules", "POST", { query: q(w), headers: asService("analyst"), body: { module: `Devis ${tag}`, rules: [{ id: `R_${tag}`, action: { base_total: `quantite * ${factor}` } }] } });
  expect(rules.status, JSON.stringify(rules.body)).toBe(200);
  expect(rules.body.validation).toMatchObject({ investigation_id: w.inv, scored: 1, matched: 1 });
  const st = store.getState();
  for (const o of st.observations) if (o.experiment_id === `EXP_${tag}_1` && o.screenshot_url) w.shots.push(o.screenshot_url.replace("/api/shots/", ""));
  for (const e of st.events) if (e.title === `Écran ${tag} ouvert` && e.screenshot_url) w.shots.push(e.screenshot_url.replace("/api/shots/", ""));
  expect(w.shots).toHaveLength(2);
  return w;
}

/** Chaînes qui n'appartiennent qu'au client (contenu), plus ses identifiants (`ids`). */
const contentMarkers = (w: World) => [w.company, w.user.email, w.user.userId, `EXP_${w.tag}_1`, `${w.tag}_SECRET`, `Écran ${w.tag} ouvert`, `R_${w.tag}`, `Devis ${w.tag}`, ...w.shots];
const allMarkers = (w: World) => [...contentMarkers(w), w.pid, w.inv];
function expectNoneOf(body: unknown, markers: string[], label: string) {
  const dump = typeof body === "string" ? body : JSON.stringify(body);
  for (const m of markers) expect(dump.includes(m), `${label} contient « ${m} »`).toBe(false);
}

beforeAll(async () => {
  env = setupAuthEnv("reborn-isolation-");
  delete process.env.EXPLORER_WEBHOOK_URL;
  // Logiciels livrés : dossier temporaire et port libre (jamais generated/ ni le CRM en service sur 5050)
  process.env.REBORN_APPS_DIR = path.join(env.dataDir, "apps");
  fs.mkdirSync(process.env.REBORN_APPS_DIR, { recursive: true });
  process.env.CRM_PORT = String(await freePort());
  for (const f of routeFiles()) R[keyOf(f)] = (await import(/* @vite-ignore */ f)) as Mod;
  store = await import("@/lib/store");
  projectScope = (await import("@/lib/migration/context")).projectScope;
  A = await signUp({ firstName: "Alice", lastName: "Alpha", company: "Atelier Alpha" });
  B = await signUp({ firstName: "Bruno", lastName: "Bravo", company: "Boulangerie Bravo" });
  OP = await signUp({ firstName: "Équipe", lastName: "Reborn" });
  await makeOperator(OP.email);
  // Atelier (sans projet) : investigation locale de l'équipe et une observation avec capture
  const at = await api("investigations", "POST", { headers: asUser(OP.cookie), body: { application: "ATELIER_DEMO", module: "Devis", mode: "replay" } });
  expect(at.status, JSON.stringify(at.body)).toBe(200);
  invAtelier = at.body.investigation.id;
  const ao = await api("observations", "POST", { headers: asService("explorer"), body: [{ experiment_id: "EXP_ATELIER_1", investigation_id: invAtelier, inputs: { quantite: 1 }, observed_output: { total_price: 7 }, screenshot_url: PNG }] });
  expect(ao.status, JSON.stringify(ao.body)).toBe(200);
  WA = await makeWorld(A, "ALPHA", "Atelier Alpha", 21);
  WB = await makeWorld(B, "BRAVO", "Boulangerie Bravo", 33);
  // Projet de l'équipe (création historique, projet de repli de ses pages)
  const po = await api("migration/project", "POST", { headers: asUser(OP.cookie), body: { name: "Projet interne Équipe" } });
  expect(po.status).toBe(200);
  pOp = po.body.project.id;
}, 60000);

afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => cleanupAuthEnv());

/* ------------------------------------------------------------------ */
/* Fonctions pures                                                      */
/* ------------------------------------------------------------------ */

describe("lib/visibility.ts : fonctions pures", () => {
  const PA = "MIG_aaaaaaaa";
  const PB = "MIG_bbbbbbbb";
  const inv = (id: string, project_id?: string, status: Investigation["status"] = "running"): Investigation => ({ id, number: 1, kind: "initial", application: "x", module: "y", mode: "live", status, created_at: "t", ...(project_id ? { project_id } : {}) });
  const ev = (seq: number, over: Partial<AgentEvent> & { project_id?: string } = {}): AgentEvent => ({ id: `e${seq}`, seq, ts: "t", source: "explorer", type: "action", title: `évènement ${seq}`, ...over });
  const obs = (id: string, over: Partial<Observation> & { project_id?: string } = {}): Observation => ({ experiment_id: id, inputs: {}, observed_output: {}, status: "success", ...over });
  const state = (): RebornState => ({
    investigations: [inv("INV_001", PA, "completed"), inv("INV_002", PB), inv("INV_003"), inv("INV_004", PA)],
    active_investigation_id: "INV_003",
    events: [
      ev(1, { investigation_id: "INV_001" }), // A, par son investigation
      ev(2, { type: "migration", data: { project_id: PB }, investigation_id: "INV_001" }), // journal historique de B rangé à tort dans l'investigation de A
      ev(3, { project_id: PA, type: "migration" }),
      ev(4, { investigation_id: "INV_003" }), // atelier
      ev(5, { data: { project_id: PA } }), // data.project_id hors journal : jamais cru
      ev(6, { type: "migration", data: {} }), // journal historique sans projet
      ev(7, { project_id: PB, investigation_id: "INV_002" }),
    ],
    event_seq: 7,
    investigation_seq: 4,
    observations: [obs("O_A", { investigation_id: "INV_001" }), obs("O_B", { investigation_id: "INV_002", project_id: PB }), obs("O_AT", { investigation_id: "INV_003" })],
    models: [
      { module: "m", rules: [], version: 1, received_at: "t" },
      { module: "m", rules: [], version: 2, received_at: "t", project_id: PA } as RebornState["models"][number],
      { module: "m", rules: [], version: 3, received_at: "t", project_id: PB } as RebornState["models"][number],
    ],
    schemas: [{ fields: [], version: 1, received_at: "t", source: "explorer", project_id: PA } as RebornState["schemas"][number], { fields: [], version: 2, received_at: "t", source: "explorer" }],
    revision: 99,
  });

  it("eventProject : projet du premier niveau, puis journal (data.project_id), puis investigation ; data.project_id ignoré hors journal", () => {
    const s = state();
    expect(s.events.map((e) => eventProject(s, e))).toEqual([PA, PB, PA, null, null, null, PB]);
    expect(observationProject(s, s.observations[0])).toBe(PA);
    expect(observationProject(s, s.observations[1])).toBe(PB);
    expect(observationProject(s, s.observations[2])).toBeNull();
  });

  it("visibilityFor : client → ses projets ; équipe et agents → tout ; projet désigné → ce seul projet ; anonyme → rien", () => {
    const owned = (id: string) => new Set(id === "u-a" ? [PA] : []);
    expect(visibilityFor({ kind: "user", userId: "u-a", role: "client" }, null, owned)).toEqual({ all: false, projects: new Set([PA]) });
    expect(visibilityFor({ kind: "user", userId: "u-op", role: "operator" }, null, owned)).toBe(SEE_ALL);
    expect(visibilityFor({ kind: "service" }, null, owned)).toBe(SEE_ALL);
    expect(visibilityFor({ kind: "service" }, PB, owned)).toEqual({ all: false, projects: new Set([PB]) });
    expect(visibilityFor({ kind: "anonymous" }, null, owned)).toEqual({ all: false, projects: new Set() });
  });

  it("canSee / viewState : même forme, uniquement les éléments des projets visibles ; rien de l'atelier ni de l'historique sans projet", () => {
    const s = state();
    const va = onlyProjects([PA]);
    expect(s.events.filter((e) => canSee(va, s, e)).map((e) => e.seq)).toEqual([1, 3]);
    const view = viewState(va, s, new Map([[PA, 3], [PB, 7]]));
    expect(Object.keys(view).sort()).toEqual(Object.keys(s).sort());
    expect(view.investigations.map((i) => i.id)).toEqual(["INV_001", "INV_004"]);
    expect(view.events.map((e) => e.seq)).toEqual([1, 3]);
    expect(view.observations.map((o) => o.experiment_id)).toEqual(["O_A"]);
    expect(view.models.map((m) => m.version)).toEqual([2]);
    expect(view.schemas.map((x) => x.version)).toEqual([1]);
    // Investigation active : la sienne en cours (jamais celle de l'atelier) ; compteurs propres à ses projets
    expect(view).toMatchObject({ active_investigation_id: "INV_004", revision: 3, event_seq: 3, investigation_seq: 0 });
    expect(viewState(SEE_ALL, s)).toBe(s);
    expect(viewState(onlyProjects([]), s)).toMatchObject({ investigations: [], events: [], observations: [], models: [], schemas: [], active_investigation_id: null, revision: 0 });
  });

  it("viewRevision : dernier évènement de ses projets (l'activité des autres n'y apparaît pas) ; compteur global pour une vue complète", () => {
    const seqs = new Map([[PA, 3], [PB, 7]]);
    expect(viewRevision(onlyProjects([PA]), { revision: 99 }, seqs)).toBe(3);
    expect(viewRevision(onlyProjects([PA, PB]), { revision: 99 }, seqs)).toBe(7);
    expect(viewRevision(onlyProjects(["MIG_cccccccc"]), { revision: 99 }, seqs)).toBe(0);
    expect(viewRevision(SEE_ALL, { revision: 99 }, seqs)).toBe(99);
  });
});

/* ------------------------------------------------------------------ */
/* Test B                                                               */
/* ------------------------------------------------------------------ */

describe("Test B — deux clients : aucune lecture ni écriture croisée", () => {
  it("attribution à l'écriture : projet fixé par le serveur, journal hors investigation, observations héritant de l'investigation, captures rangées par projet", () => {
    const st = store.getState();
    for (const w of [WA, WB]) {
      const journal = st.events.filter((e) => e.type === "migration" && (e as { project_id?: string }).project_id === w.pid);
      expect(journal.length).toBeGreaterThanOrEqual(3); // création, correspondances, (décisions), migration
      // Le journal n'est jamais rattaché à l'investigation en cours (celle du projet, de l'atelier ou d'un autre)
      expect(journal.every((e) => e.investigation_id === undefined)).toBe(true);
      const disco = st.events.filter((e) => e.investigation_id === w.inv);
      expect(disco.map((e) => e.type)).toEqual(expect.arrayContaining(["investigation_started", "observation", "action", "schema_updated", "rules_updated", "validation"]));
      expect(disco.every((e) => (e as { project_id?: string }).project_id === w.pid)).toBe(true);
      const o = st.observations.find((x) => x.experiment_id === `EXP_${w.tag}_1`)!;
      expect(o).toMatchObject({ investigation_id: w.inv, project_id: w.pid });
      expect(st.models.find((m) => m.module === `Devis ${w.tag}`)).toMatchObject({ project_id: w.pid, investigation_id: w.inv });
      expect(st.schemas.find((x) => x.title === `Devis ${w.tag}`)).toMatchObject({ project_id: w.pid, investigation_id: w.inv });
      for (const shot of w.shots) expect(fs.existsSync(path.join(env.dataDir, "shots", w.pid, shot)), shot).toBe(true);
    }
    // Les investigations de projet ne deviennent jamais l'investigation active de l'atelier
    expect(st.active_investigation_id).toBe(invAtelier);
    expect(st.investigations.find((i) => i.id === invAtelier)?.status).toBe("running");
    expect(fs.readdirSync(path.join(env.dataDir, "shots", "_atelier"))).toHaveLength(1);
    // Pendant l'investigation en cours de A : un évènement du journal émis dans la portée de A (sans projet
    // explicite, comme les routes /api/projects/[id]/…) n'est jamais rattaché à l'investigation
    const scoped = projectScope.run(WA.pid, () => store.addEvent({ source: "platform", type: "migration", title: "Journal émis dans la portée de A" }));
    expect(scoped.investigation_id).toBeUndefined();
    expect((scoped as { project_id?: string }).project_id).toBe(WA.pid);
    // Auteur = identité authentifiée, jamais le champ « by » du corps
    const pa = JSON.parse(fs.readFileSync(path.join(env.dataDir, "migration", "projects", WA.pid, "project.json"), "utf8"));
    expect(pa.sources[0].origin.by).toBe("Alice Alpha");
    expect(pa.runs[0].by).toBe("Alice Alpha");
    const decisions = Object.values(pa.decisions as Record<string, { by: string }>);
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions.every((d) => d.by === "Alice Alpha")).toBe(true);
    expect(JSON.stringify(pa)).not.toContain("Usurpateur");
  });

  it("/api/state : chaque client voit SA découverte et SON journal, rien de l'autre ni de l'atelier, sans résumé « migration »", async () => {
    for (const [me, other] of [[WA, WB], [WB, WA]] as const) {
      const r = await api("state", "GET", { headers: owner(me) });
      expect(r.status).toBe(200);
      expect(r.body).not.toHaveProperty("migration");
      expect(r.body.investigations.map((i: Investigation) => i.id)).toEqual([me.inv]);
      expect(r.body.active_investigation_id).toBe(me.inv);
      expect(r.body.observations.map((o: Observation) => o.experiment_id)).toEqual([`EXP_${me.tag}_1`]);
      expect(r.body.models.map((m: { module: string }) => m.module)).toEqual([`Devis ${me.tag}`]);
      expect(r.body.schemas.map((x: { title: string }) => x.title)).toEqual([`Devis ${me.tag}`]);
      expect(r.body.events.length).toBeGreaterThan(5);
      expect(r.body.events.every((e: { project_id?: string }) => e.project_id === me.pid)).toBe(true);
      expect(r.body.investigation_seq).toBe(0);
      expectNoneOf(r.body, [...allMarkers(other), invAtelier, "ATELIER_DEMO", "EXP_ATELIER_1"], `état de ${me.tag}`);
      // ?project= : le sien → même vue ; celui de l'autre → 404 ; divergence → 400
      expect((await api("state", "GET", { headers: owner(me), query: q(me) })).body.events).toEqual(r.body.events);
      expect((await api("state", "GET", { headers: owner(me), query: q(other) })).status).toBe(404);
      expect((await api("state", "GET", { headers: { ...owner(me), "x-reborn-project": other.pid } })).status).toBe(404);
      expect((await api("state", "GET", { headers: { ...owner(me), "x-reborn-project": other.pid }, query: q(me) })).status).toBe(400);
    }
    // Équipe : état complet ; agents : complet, ou un seul projet avec ?project=
    const full = (await api("state", "GET", { headers: asUser(OP.cookie) })).body;
    expect(full.investigations.map((i: Investigation) => i.id)).toEqual(expect.arrayContaining([WA.inv, WB.inv, invAtelier]));
    expect(full).toHaveProperty("migration");
    const svc = (await api("state", "GET", { headers: asService("analyst"), query: q(WA) })).body;
    expect(svc.investigations.map((i: Investigation) => i.id)).toEqual([WA.inv]);
    expectNoneOf(svc, allMarkers(WB), "état de l'Analyste limité au projet A");
    expect((await api("state", "GET")).status).toBe(401);
  });

  it("/api/revision : par projet pour un client ; l'activité de l'autre ne la fait pas bouger", async () => {
    const rev = async (w: World) => (await api("revision", "GET", { headers: owner(w) })).body;
    const a0 = await rev(WA);
    const b0 = await rev(WB);
    expect(a0.revision).toBe(a0.event_seq);
    const lastA = store.getState().events.filter((e) => (e as { project_id?: string }).project_id === WA.pid).at(-1)!.seq;
    expect(a0.revision).toBe(lastA);
    expect(b0.revision).toBe(store.getState().events.filter((e) => (e as { project_id?: string }).project_id === WB.pid).at(-1)!.seq);
    expect(b0.revision).not.toBe(a0.revision);
    // Activité de A seulement
    expect((await api("events", "POST", { query: q(WA), headers: asService("explorer"), body: { type: "log", title: "Activité de A" } })).status).toBe(200);
    expect(await rev(WB)).toEqual(b0);
    expect((await rev(WA)).revision).toBeGreaterThan(a0.revision);
    // Activité de l'atelier : aucun client ne la voit
    const a1 = await rev(WA);
    expect((await api("events", "POST", { headers: asService("explorer"), body: { type: "log", title: "Activité de l'atelier" } })).status).toBe(200);
    expect(await rev(WA)).toEqual(a1);
    expect(await rev(WB)).toEqual(b0);
    // Équipe et agents : compteurs globaux
    expect((await api("revision", "GET", { headers: asService("explorer") })).body.revision).toBe(store.getState().revision);
    expect((await api("revision", "GET", { headers: owner(WB), query: q(WA) })).status).toBe(404);
    expect((await api("revision", "GET")).status).toBe(401);
  });

  it("/api/events, /api/observations, /api/investigations : filtrés ; investigation d'un autre compte → 404, comme une inconnue", async () => {
    for (const [me, other] of [[WA, WB], [WB, WA]] as const) {
      const ev = await api("events", "GET", { headers: owner(me) });
      expect(ev.status).toBe(200);
      expect(ev.body.length).toBeGreaterThan(5);
      expectNoneOf(ev.body, [...allMarkers(other), invAtelier], `évènements de ${me.tag}`);
      expect((await api("events", "GET", { headers: owner(me), query: `?investigation_id=${me.inv}` })).body.length).toBeGreaterThan(3);
      expect((await api("events", "GET", { headers: owner(me), query: `?investigation_id=${other.inv}` })).status).toBe(404);
      expect((await api("events", "GET", { headers: owner(me), query: `?investigation_id=${invAtelier}` })).status).toBe(404);
      expect((await api("events", "GET", { headers: owner(me), query: "?investigation_id=INV_999" })).status).toBe(404);
      expect((await api("events", "GET", { headers: owner(me), query: q(other) })).status).toBe(404);
      const ob = await api("observations", "GET", { headers: owner(me) });
      expect(ob.body.map((o: Observation) => o.experiment_id)).toEqual([`EXP_${me.tag}_1`]);
      expect((await api("observations", "GET", { headers: owner(me), query: `?investigation_id=${other.inv}` })).status).toBe(404);
      expect((await api("observations", "GET", { headers: { ...owner(me), "x-reborn-project": other.pid } })).status).toBe(404);
      const inv = await api("investigations", "GET", { headers: owner(me) });
      expect(inv.body.map((i: Investigation) => i.id)).toEqual([me.inv]);
      expect((await api("investigations", "GET", { headers: owner(me), query: "?active=1" })).body?.id).toBe(me.inv);
      expect((await api("investigations", "GET", { headers: owner(me), query: "?active=1&mode=replay" })).body).toBeNull();
      expect((await api("investigations", "GET", { headers: owner(me), query: q(other) })).status).toBe(404);
    }
    // Agents sans projet : tout ; l'investigation active « globale » reste celle de l'atelier
    expect((await api("investigations", "GET", { headers: asService("explorer"), query: "?active=1" })).body.id).toBe(invAtelier);
    expect((await api("investigations", "GET", { headers: asService("explorer"), query: `?active=1&mode=live&project=${WA.pid}` })).body.id).toBe(WA.inv);
    for (const r of ["events", "observations", "investigations"]) expect((await api(r, "GET")).status, r).toBe(401);
  });

  it("investigations : création interdite au client ; agent en mode live seulement ; replay et simulation réservés à l'équipe ; clôture par projet, avec évènement", async () => {
    for (const body of [{ mode: "live", project_id: WB.pid }, { mode: "live" }, { mode: "replay" }]) {
      expect((await api("investigations", "POST", { headers: owner(WB), body, query: q(WB) })).status, JSON.stringify(body)).toBe(403);
    }
    expect((await api("investigations", "POST", { headers: asService("explorer"), body: { mode: "replay", project_id: WA.pid } })).status).toBe(403);
    expect((await api("investigations", "POST", { headers: asService("explorer"), body: { mode: "simulation", target_url: "http://127.0.0.1:9/" } })).status).toBe(403);
    expect((await api("investigations", "POST", { headers: asService("analyst"), body: { mode: "live" } })).status).toBe(403);
    expect((await api("investigations", "POST", { headers: asUser(OP.cookie), body: { mode: "simulation", project_id: WA.pid } })).status).toBe(400);
    // Projet désigné : existant, cohérent entre le corps et ?project=
    expect((await api("investigations", "POST", { headers: asService("explorer"), body: { mode: "live", project_id: "MIG_00000000" } })).status).toBe(404);
    expect((await api("investigations", "POST", { headers: asService("explorer"), body: { mode: "live", project_id: WA.pid }, query: q(WB) })).status).toBe(400);
    // Nouvelle investigation de A : seule celle de A est clôturée (évènement), B et l'atelier continuent
    const seq = store.getState().event_seq;
    const next = await api("investigations", "POST", { headers: asService("explorer"), body: { application: "Atelier Alpha Gestion", module: "Factures", mode: "live" }, query: q(WA) });
    expect(next.status).toBe(200);
    expect(next.body.investigation).toMatchObject({ project_id: WA.pid, number: 2 });
    const st = store.getState();
    expect(st.investigations.find((i) => i.id === WA.inv)?.status).toBe("completed");
    expect(st.investigations.find((i) => i.id === WB.inv)?.status).toBe("running");
    expect(st.investigations.find((i) => i.id === invAtelier)?.status).toBe("running");
    expect(st.active_investigation_id).toBe(invAtelier);
    const closed = st.events.filter((e) => e.seq > seq && e.type === "investigation_completed");
    expect(closed.map((e) => e.investigation_id)).toEqual([WA.inv]);
    expect((closed[0] as { project_id?: string }).project_id).toBe(WA.pid);
    // Clôture (PATCH) : propriétaire de l'investigation seulement ; autre compte → 404 ; projet divergent → 422
    const nextId = next.body.investigation.id as string;
    expect((await api("investigations", "PATCH", { headers: owner(WB), body: { id: nextId, status: "failed" } })).status).toBe(404);
    expect((await api("investigations", "PATCH", { headers: owner(WB), body: { id: invAtelier } })).status).toBe(404);
    expect((await api("investigations", "PATCH", { headers: asUser(OP.cookie), body: { id: nextId } })).status).toBe(404); // projet d'un client : pas celui de l'équipe
    expect((await api("investigations", "PATCH", { headers: asService("explorer"), body: { id: nextId }, query: q(WB) })).status).toBe(422);
    expect(store.getState().investigations.find((i) => i.id === nextId)?.status).toBe("running");
    expect((await api("investigations", "PATCH", { headers: owner(WA), body: { id: nextId } })).status).toBe(200);
    expect(store.getState().investigations.find((i) => i.id === nextId)?.status).toBe("completed");
    expect((await api("investigations", "PATCH", { body: { id: WB.inv } })).status).toBe(401);
  });

  it("rejet 422 : investigation d'un autre projet que celui de la requête, ou project_id du corps qui ne correspond pas", async () => {
    const before = store.getState().event_seq;
    const ex = asService("explorer");
    expect((await api("observations", "POST", { query: q(WB), headers: ex, body: { experiment_id: "EXP_INTRUS", investigation_id: WA.inv, inputs: { quantite: 1 }, observed_output: { total_price: 1 } } })).status).toBe(422);
    expect((await api("observations", "POST", { query: q(WB), headers: ex, body: { experiment_id: "EXP_INTRUS", investigation_id: invAtelier, inputs: { quantite: 1 }, observed_output: { total_price: 1 } } })).status).toBe(422);
    expect((await api("observations", "POST", { query: q(WB), headers: ex, body: { experiment_id: "EXP_INTRUS", project_id: WA.pid, inputs: { quantite: 1 }, observed_output: { total_price: 1 } } })).status).toBe(422);
    expect((await api("observations", "POST", { headers: ex, body: { experiment_id: "EXP_INTRUS", investigation_id: invAtelier, project_id: WA.pid, inputs: { quantite: 1 }, observed_output: { total_price: 1 } } })).status).toBe(422);
    expect((await api("events", "POST", { query: q(WB), headers: ex, body: { type: "log", title: "intrus", investigation_id: WA.inv } })).status).toBe(422);
    expect((await api("events", "POST", { query: q(WB), headers: ex, body: [{ type: "log", title: "ok" }, { type: "log", title: "intrus", project_id: WA.pid }] })).status).toBe(422);
    expect((await api("schema", "POST", { query: q(WB), headers: ex, body: { fields: [{ name: "x", type: "number" }], investigation_id: WA.inv } })).status).toBe(422);
    expect((await api("schema", "POST", { query: q(WB), headers: ex, body: { fields: [{ name: "x", type: "number" }], project_id: WA.pid } })).status).toBe(422);
    expect((await api("rules", "POST", { query: q(WB), headers: asService("analyst"), body: { project_id: WA.pid, rules: [] } })).status).toBe(422);
    // Rien n'a été écrit (un envoi refusé n'écrit rien, même partiellement)
    expect(store.getState().event_seq).toBe(before);
    expect(store.getState().observations.some((o) => o.experiment_id === "EXP_INTRUS")).toBe(false);
    // project_id cohérent : accepté (le serveur le fixe de toute façon)
    expect((await api("events", "POST", { query: q(WB), headers: ex, body: { type: "log", title: "cohérent", project_id: WB.pid } })).status).toBe(200);
    // Projet sans investigation en cours : l'envoi reste rattaché au projet de la requête (jamais à l'atelier).
    // L'exécuteur sans mission sur ce projet est refusé (SPEC §6, lot C4 : titulaire du prêt) ; l'Analyste, sans
    // mission, y dépose son hypothèse.
    const empty = (await api("projects", "POST", { headers: owner(WA), body: { company: "Atelier Alpha — sans découverte", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } })).body.project.id as string;
    const seqBefore = store.getState().event_seq;
    expect((await api("events", "POST", { query: `?project=${empty}`, headers: ex, body: { type: "log", title: "Exécuteur sans mission" } })).status).toBe(403);
    expect(store.getState().event_seq).toBe(seqBefore);
    const lone = await api("events", "POST", { query: `?project=${empty}`, headers: asService("analyst"), body: { source: "analyst", type: "hypothesis", title: "Envoi sans investigation en cours" } });
    expect(lone.status, JSON.stringify(lone.body)).toBe(200);
    const saved = store.getState().events.find((e) => e.id === lone.body.ids[0])!;
    expect(saved).toMatchObject({ project_id: empty });
    expect(saved.investigation_id).toBeUndefined();
    expect(JSON.stringify((await api("events", "GET", { headers: owner(WA), query: `?project=${empty}` })).body)).toContain("Envoi sans investigation en cours");
    expect(JSON.stringify((await api("events", "GET", { headers: owner(WB) })).body)).not.toContain("Envoi sans investigation en cours");
  });

  it("/api/stream : premier message et flux filtrés par abonné ; identité revérifiée à chaque ping", async () => {
    expect((await openStream({})).status).toBe(401);
    expect((await openStream(owner(WB), q(WA))).status).toBe(404);
    // Dernière activité du Studio : celle de A (la révision globale n'est donc pas celle de B)
    await api("events", "POST", { query: q(WA), headers: asService("explorer"), body: { type: "log", title: "Activité récente de A" } });
    const revB = (await api("revision", "GET", { headers: owner(WB) })).body.revision;
    expect(revB).not.toBe(store.getState().revision);
    const sb = await openStream(owner(WB));
    try {
      expect(sb.status).toBe(200);
      expect(await sb.next()).toEqual({ event: "hello", data: { revision: revB } });
      // Activité de A (puis de l'atelier) : rien n'est envoyé à B ; activité de B : reçue, avec SA révision
      await api("events", "POST", { query: q(WA), headers: asService("explorer"), body: { type: "log", title: `Écran ${WA.tag} ouvert (bis)` } });
      await api("events", "POST", { headers: asService("explorer"), body: { type: "log", title: "Atelier : rien pour les clients" } });
      await api("events", "POST", { query: q(WB), headers: asService("explorer"), body: { type: "log", title: "Pour B seulement" } });
      const m = await sb.next();
      expect(m).toMatchObject({ event: "change", data: { event: { title: "Pour B seulement", project_id: WB.pid } } });
      expect((m as { data: Json }).data.revision).toBe((await api("revision", "GET", { headers: owner(WB) })).body.revision);
      expect(await sb.next(300)).toBeNull();
    } finally {
      await sb.close();
    }
    // Équipe : flux complet
    const so = await openStream(asUser(OP.cookie));
    try {
      expect(await so.next()).toEqual({ event: "hello", data: { revision: store.getState().revision } });
      await api("events", "POST", { query: q(WA), headers: asService("explorer"), body: { type: "log", title: "Vu par l'équipe" } });
      expect(await so.next()).toMatchObject({ event: "change", data: { event: { title: "Vu par l'équipe" } } });
    } finally {
      await so.close();
    }
    // Connexions simultanées limitées par compte (les autres comptes ne sont pas gênés)
    const many = [];
    for (let i = 0; i < 8; i++) many.push(await openStream(owner(WA)));
    expect(many.every((s) => s.status === 200)).toBe(true);
    expect((await openStream(owner(WA))).status).toBe(429);
    const other = await openStream(owner(WB));
    expect(other.status).toBe(200);
    await other.close();
    for (const s of many) await s.close();
    const again = await openStream(owner(WA));
    expect(again.status).toBe(200);
    await again.close();
    // Session révoquée pendant la connexion : le flux se ferme au ping suivant ; une session valide reste ouverte
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const second = await signIn(WB.user.email, WB.user.password);
    expect(second.status).toBe(200);
    const revoked = await openStream(asUser(second.cookie));
    const alive = await openStream(owner(WB));
    try {
      expect(await revoked.next()).toMatchObject({ event: "hello" });
      expect(await alive.next()).toMatchObject({ event: "hello" });
      expect((await authRequest("/sign-out", { body: {}, headers: { cookie: second.cookie } })).status).toBe(200);
      await vi.advanceTimersByTimeAsync(15000);
      expect(await revoked.next(3000)).toBe("closed");
      expect(await alive.next(3000)).toMatchObject({ event: "ping" });
    } finally {
      await revoked.close();
      await alive.close();
    }
  });

  it("/api/shots : capture servie à son seul propriétaire (rangée par projet), jamais en cache partagé", async () => {
    const get = (shot: string, headers: Record<string, string> = {}, query = "") => api("shots/[id]", "GET", { params: { id: shot }, headers, query });
    for (const [me, other] of [[WA, WB], [WB, WA]] as const) {
      for (const shot of me.shots) {
        const r = await get(shot, owner(me));
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toBe("image/png");
        expect(r.headers.get("cache-control")).toBe("private, no-store");
        expect((await get(shot, owner(me), q(me))).status).toBe(200);
        expect((await get(shot, owner(other))).status).toBe(404);
        expect((await get(shot, owner(other), q(me))).status).toBe(404);
        expect((await get(shot, owner(other), q(other))).status).toBe(404);
        expect((await get(shot)).status).toBe(401);
        expect((await get(shot, asUser(OP.cookie))).status).toBe(404); // projet d'un client : pas celui de l'équipe
        expect((await get(shot, asService("explorer"))).status).toBe(200);
      }
    }
    const atelier = fs.readdirSync(path.join(env.dataDir, "shots", "_atelier"))[0];
    expect((await get(atelier, asUser(OP.cookie))).status).toBe(200);
    expect((await get(atelier, owner(WA))).status).toBe(404);
    expect((await get("../state.json", asUser(OP.cookie))).status).toBe(404);
  });

  it("routes d'un projet : 404 croisé par [id], ?project= et x-reborn-project ; divergence 400 ; sans projet 400 ; project_id du corps sans effet", async () => {
    const reads: [string, string, CallOpts?][] = [
      ["migration", "GET"], ["migration/app", "GET"], ["migration/business-model", "GET"], ["migration/mapping", "GET"], ["migration/profile", "GET"], ["migration/runs", "GET"],
      ["migration/runs/[id]", "GET", { id: "RUN_001" }], ["migration/runs/[id]/rejects", "GET", { id: "RUN_001" }], ["migration/sources", "GET"], ["migration/spec", "GET"],
    ];
    for (const [route, method, extra] of reads) {
      const ok = await api(route, method, { ...extra, query: q(WA), headers: owner(WA) });
      expect(ok.status, `${method} ${route} (propriétaire)`).toBe(200);
      for (const via of [{ query: q(WA) }, { headers: { "x-reborn-project": WA.pid } }]) {
        const r = await api(route, method, { ...extra, ...via, headers: { ...owner(WB), ...via.headers } });
        expect(r, `${method} ${route} ${JSON.stringify(via)}`).toMatchObject({ status: 404, body: { ok: false, error: "Projet introuvable" } });
      }
      expect((await api(route, method, { ...extra, query: q(WB), headers: { ...owner(WB), "x-reborn-project": WA.pid } })).status, `${route} divergence`).toBe(400);
      expect((await api(route, method, { ...extra, headers: owner(WB) })).status, `${route} sans projet`).toBe(400);
      expect((await api(route, method, { ...extra, query: q(WA) })).status, `${route} anonyme`).toBe(401);
    }
    // [id] des routes /api/projects/<id>
    for (const route of ["projects/[id]"]) {
      expect((await api(route, "GET", { id: WA.pid, headers: owner(WB) })).status).toBe(404);
      expect((await api(route, "GET", { id: WA.pid, headers: owner(WB), query: q(WB) })).status).toBe(400);
      expect((await api(route, "PATCH", { id: WA.pid, headers: owner(WB), body: { company: "Piraté" } })).status).toBe(404);
    }
    // project_id du corps : jamais une désignation (la source va dans le projet de la requête, A est intact)
    const beforeA = fs.readFileSync(path.join(env.dataDir, "migration", "projects", WA.pid, "project.json"), "utf8");
    const up = await api("migration/sources", "POST", { query: q(WB), headers: owner(WB), body: { project_id: WA.pid, name: "intrus.csv", content_base64: csv([["id"], ["1"]]) } });
    expect(up.status).toBe(200);
    expect(fs.readFileSync(path.join(env.dataDir, "migration", "projects", WA.pid, "project.json"), "utf8")).toBe(beforeA);
    expect((await api("migration/sources", "GET", { query: q(WB), headers: owner(WB) })).body.map((s: { name: string }) => s.name)).toContain("intrus.csv");
    // Écritures croisées : refusées sans effet
    for (const [route, body] of [["migration/decisions", { key: "x", decision: "accepted" }], ["migration/runs", {}], ["migration/deploy", { run_id: "RUN_001" }], ["migration/rollback", { deployment_id: "D1" }], ["migration/app", { action: "stop" }], ["migration/business-model/decision", { version: 1, decision: "validated" }]] as const) {
      expect((await api(route, "POST", { query: q(WA), headers: owner(WB), body })).status, route).toBe(404);
    }
    expect((await api("migration/sources", "DELETE", { query: `${q(WA)}&id=x`, headers: owner(WB) })).status).toBe(404);
    expect(fs.readFileSync(path.join(env.dataDir, "migration", "projects", WA.pid, "project.json"), "utf8")).toBe(beforeA);
  });

  it("atelier, remise à zéro et scénarios : jamais un client ; remise à zéro limitée aux données sans projet ; historique sans projet visible de l'équipe seule", async () => {
    const atelier: [string, string][] = [["rules", "GET"], ["rules", "POST"], ["schema", "GET"], ["schema", "POST"], ["compute", "POST"], ["compare", "GET"], ["app", "GET"], ["scenarios", "GET"], ["scenarios", "POST"], ["reset", "POST"]];
    const before = store.getState().revision;
    for (const [route, method] of atelier) {
      const body = method === "GET" ? undefined : { scenario: "quote", step: "baseline", fields: [{ name: "x", type: "number" }], rules: [], inputs: { x: 1 } };
      for (const via of [{}, { query: q(WA) }]) expect((await api(route, method, { ...via, headers: owner(WA), body })).status, `${method} ${route} ${JSON.stringify(via)}`).toBe(403);
      expect((await api(route, method, { body })).status, `${method} ${route} anonyme`).toBe(401);
    }
    for (const kind of ["explorer", "analyst", "all"] as const) {
      expect((await api("reset", "POST", { headers: asService(kind) })).status, kind).toBe(403);
      expect((await api("scenarios", "POST", { headers: asService(kind), body: { scenario: "quote", step: "baseline" } })).status, kind).toBe(403);
    }
    expect(store.getState().revision).toBe(before);
    // Ancien évènement du journal sans projet résolu : équipe seulement, jamais supprimé
    const legacy = store.addEvent({ source: "platform", type: "migration", title: "Journal historique sans projet", project_id: null });
    expect((legacy as { project_id?: string }).project_id).toBeUndefined();
    for (const w of [WA, WB]) expectNoneOf((await api("state", "GET", { headers: owner(w) })).body, ["Journal historique sans projet"], `état de ${w.tag}`);
    expect(JSON.stringify((await api("state", "GET", { headers: asUser(OP.cookie) })).body)).toContain("Journal historique sans projet");
    // Remise à zéro par l'équipe : l'atelier seulement
    const snap = (w: World) => {
      const st = store.getState();
      return {
        inv: st.investigations.filter((i) => i.project_id === w.pid).length,
        events: st.events.filter((e) => (e as { project_id?: string }).project_id === w.pid).length,
        obs: st.observations.filter((o) => (o as { project_id?: string }).project_id === w.pid).length,
        models: st.models.filter((m) => (m as { project_id?: string }).project_id === w.pid).length,
        schemas: st.schemas.filter((x) => (x as { project_id?: string }).project_id === w.pid).length,
      };
    };
    const [sa, sb] = [snap(WA), snap(WB)];
    expect((await api("reset", "POST", { headers: asUser(OP.cookie) })).status).toBe(200);
    expect(snap(WA)).toEqual(sa);
    expect(snap(WB)).toEqual(sb);
    const st = store.getState();
    expect(st.investigations.some((i) => i.id === invAtelier)).toBe(false);
    expect(st.observations.some((o) => o.experiment_id === "EXP_ATELIER_1")).toBe(false);
    expect(st.active_investigation_id).toBeNull();
    expect(st.events.some((e) => e.title === "Journal historique sans projet")).toBe(true);
    expect(fs.existsSync(path.join(env.dataDir, "shots", "_atelier"))).toBe(false);
    for (const w of [WA, WB]) for (const shot of w.shots) expect((await api("shots/[id]", "GET", { params: { id: shot }, headers: owner(w) })).status).toBe(200);
  });

  it("décisions signées par l'identité authentifiée ; ?fixture= et ?source=user réservés ; upgrade : équipe ; logiciel livré sans pid ni fichier d'identifiants pour le client", async () => {
    const A_ = owner(WA);
    // ?source=user : équipe seulement ; correspondances et modèle métier « de l'Analyste » : jamais publiés par un client
    expect((await api("migration/mapping", "POST", { query: `${q(WA)}&source=user`, headers: A_, body: {} })).status).toBe(403);
    expect((await api("migration/mapping", "POST", { query: `${q(WA)}&source=user`, headers: asService("analyst"), body: {} })).status).toBe(403);
    expect((await api("migration/business-model", "POST", { query: `${q(WA)}&source=user`, headers: asService("analyst"), body: {} })).status).toBe(403);
    expect((await api("migration/mapping", "POST", { query: q(WA), headers: A_, body: {} })).status).toBe(403);
    expect((await api("migration/business-model", "POST", { query: `${q(WA)}&source=user`, headers: A_, body: {} })).status).toBe(403);
    expect((await api("migration/business-model", "POST", { query: q(WA), headers: A_, body: {} })).status).toBe(403);
    expect((await api("migration/business-model", "POST", { query: `${q(WA)}&from=investigation`, headers: A_, body: {} })).status).toBe(403);
    expect((await api("rules", "POST", { query: `${q(WA)}&source=user`, headers: asService("analyst"), body: { rules: [] } })).status).toBe(403);
    // ?fixture=crm (jeu de test Relatio) : jamais un agent ; propriétaire seulement sur un projet Relatio
    expect((await api("migration/mapping", "POST", { query: `${q(WA)}&fixture=crm`, headers: asService("analyst") })).status).toBe(403);
    expect((await api("migration/business-model", "POST", { query: `${q(WA)}&fixture=crm`, headers: asService("analyst") })).status).toBe(403);
    const notRelatio = await api("migration/mapping", "POST", { query: `${q(WA)}&fixture=crm`, headers: A_ });
    expect(notRelatio.status).toBe(409);
    expect(notRelatio.body.error).toMatch(/Relatio 2004/);
    expect((await api("migration/mapping", "POST", { query: `${q(WA)}&fixture=autre`, headers: A_ })).status).toBe(400);
    const relatio = (await api("projects", "POST", { headers: A_, body: { company: "Atelier Alpha (test Relatio)", software: "Relatio 2004", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } })).body.project.id as string;
    expect((await api("migration/business-model", "POST", { query: `?project=${relatio}&fixture=crm`, headers: A_ })).status).toBe(200);
    // Analyste : publication réelle acceptée, signée par le service
    const bm = await api("migration/business-model", "POST", { query: `?project=${relatio}&by=Usurpateur`, headers: asService("analyst"), body: (await import("@/lib/migration/fixtures")).CRM_FIXTURES.business_model });
    expect(bm.status, JSON.stringify(bm.body)).toBe(200);
    const versions = (await api("migration/business-model", "GET", { query: `?project=${relatio}`, headers: A_ })).body.versions as { source: string; by: string }[];
    expect(versions.map((v) => [v.source, v.by])).toEqual([["fixture", "Alice Alpha"], ["analyst", "Analyste (service)"]]);
    // Décision : signée par le propriétaire, jamais par le champ « by »
    expect((await api("migration/business-model/decision", "POST", { query: `?project=${relatio}`, headers: A_, body: { version: 1, decision: "rejected", by: "Usurpateur" } })).status).toBe(200);
    const decided = (await api("migration/business-model", "GET", { query: `?project=${relatio}`, headers: A_ })).body.versions[0];
    expect(decided).toMatchObject({ status: "rejected", decided_by: "Alice Alpha" });
    // upgrade : équipe seulement (un client reçoit 403 avant toute opération)
    expect((await api("migration/app", "POST", { query: q(WA), headers: A_, body: { action: "upgrade" } })).status).toBe(403);
    expect((await api("migration/app", "POST", { query: q(WA), headers: A_, body: { action: "start" } })).status).toBe(409); // aucun logiciel mis en service
    // Logiciel livré enregistré (sans processus) : le client ne reçoit ni pid, ni fichier d'identifiants, ni commande
    const project = await import("@/lib/migration/project");
    const record =(pid: string, id: string) =>
      projectScope.run(pid, () => project.recordDeployment({ id: `D_${id}`, at: new Date().toISOString(), by: "test", run_id: "RUN_001", app_dir: path.join(process.env.REBORN_APPS_DIR!, id), backup: null, status: "active" }, { id, port: Number(process.env.CRM_PORT) }));
    record(WA.pid, "alpha-app");
    record(pOp, "equipe-app");
    const forClient = (await api("migration/app", "GET", { query: q(WA), headers: A_ })).body;
    expect(forClient).toMatchObject({ app_id: "alpha-app", pid: null, credentials_file: null, start_command: null });
    expect((await api("migration", "GET", { query: q(WA), headers: A_ })).body.app).toMatchObject({ app_id: "alpha-app", pid: null, credentials_file: null, start_command: null });
    const forTeam = (await api("migration/app", "GET", { query: `?project=${pOp}`, headers: asUser(OP.cookie) })).body;
    expect(forTeam.app_id).toBe("equipe-app");
    expect(forTeam.credentials_file).toMatch(/equipe-app/);
    expect(forTeam.start_command).toMatch(/equipe-app/);
    expect((await api("migration/app", "GET", { query: q(WA), headers: owner(WB) })).status).toBe(404);
  });

  it("mise en service : jamais sur le logiciel livré d'un autre projet (même sans marqueur .reborn-project)", async () => {
    const B_ = owner(WB);
    // Correspondances de B (envoi de l'Analyste) visant le logiciel livré de A, puis exécution
    const current = (await api("migration/mapping", "GET", { query: q(WB), headers: B_ })).body.current.mapping;
    const pub = await api("migration/mapping", "POST", { query: q(WB), headers: asService("analyst"), body: { ...current, target: { ...current.target, id: "alpha-app" } } });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    for (const item of pub.body.review.items as { key: string; decision: unknown }[]) if (!item.decision) await api("migration/decisions", "POST", { query: q(WB), headers: B_, body: { key: item.key, decision: "accepted" } });
    const run = await api("migration/runs", "POST", { query: q(WB), headers: B_ });
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    // Garde-fou si la protection manquait : le dossier visé est un fichier, la génération échouerait sans démarrer de processus
    fs.writeFileSync(path.join(process.env.REBORN_APPS_DIR!, "alpha-app"), "dossier du logiciel livré de A (test)");
    const r = await api("migration/deploy", "POST", { query: q(WB), headers: B_, body: { run_id: run.body.run.id } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/déjà réservé à un autre logiciel livré/);
    // Message pour le client (PR-01) : l'action à mener, sans jargon ni mention d'un autre projet
    expect(r.body.error).toMatch(/Correspondance des champs/);
    expect(r.body.error).not.toMatch(/target\.id|autre projet/);
    expect(JSON.parse(fs.readFileSync(path.join(env.dataDir, "migration", "projects", WB.pid, "project.json"), "utf8")).deployments).toEqual([]);
  });

  it("/api/health : anonyme réduit à { ok, service, contract_version, auth }", async () => {
    const r = await api("health", "GET");
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["auth", "contract_version", "ok", "service"]);
    expect(r.body.auth).toEqual({ authenticated: false });
    expect(Object.keys((await api("health", "GET", { headers: owner(WA) })).body).sort()).toEqual(["auth", "contract_version", "ok", "service"]);
    expect((await api("health", "GET", { headers: asUser(OP.cookie) })).body).toHaveProperty("counts");
  });
});

/* ------------------------------------------------------------------ */
/* Inventaire : toutes les routes, toutes les méthodes                  */
/* ------------------------------------------------------------------ */

describe("Inventaire de toutes les routes de l'API (refus par défaut)", () => {
  const exported = () =>
    Object.entries(R).flatMap(([route, mod]) => METHODS.filter((m) => typeof mod[m] === "function").map((m) => ({ route, method: m, fn: mod[m] })));
  /** Paramètres de chemin : projet de A pour /api/projects/[id], exécution RUN_001 de A, capture de A. */
  const paramsFor = (route: string): Record<string, string> =>
    route.startsWith("projects/[id]") ? { id: WA.pid } : route.startsWith("migration/runs/[id]") ? { id: "RUN_001" } : route === "shots/[id]" ? { id: WA.shots[0] } : route.startsWith("auth/") ? { all: "get-session" } : { id: "x" };
  /** Corps « tout-terrain » qui désigne les données de A par tous les champs connus. */
  const probe = () => ({
    project_id: WA.pid, id: WA.inv, investigation_id: WA.inv, run_id: "RUN_001", version: 1, key: "field:clients.nom", decision: "excluded", deployment_id: "D_alpha-app",
    action: "stop", status: "failed", token: "jeton-invalide-pour-le-test", name: "intrus.csv", content_base64: csv([["id"], ["1"]]), scenario: "quote", step: "baseline",
    inputs: { quantite: 1 }, comment: "intrusion", by: "Usurpateur", fields: [{ name: "quantite", type: "number" }], rules: [], company: undefined,
  });
  const modeOf = (route: string, a: Annotation | undefined) => a?.project ?? (route.startsWith("projects/[id]") ? "param" : "query");

  it("chaque méthode exportée de chaque route.ts porte un contrôle d'accès explicite (handler()), et les routes de ce lot leur projet et leur écriture", () => {
    const all = exported();
    expect(all.length).toBeGreaterThan(70);
    for (const { route, method, fn } of all) {
      const a = annotation(fn);
      expect(a, `${method} ${route} : aucune annotation (fonction hors handler())`).toBeDefined();
      expect(Array.isArray(a!.access) && a!.access.length > 0, `${method} ${route} : access manquant`).toBe(true);
      for (const x of a!.access!) expect(ACCESS, `${method} ${route} : accès inconnu ${x}`).toContain(x);
      if (a!.access!.includes("public")) expect(PUBLIC, `${method} ${route} : route publique hors liste blanche`).toContain(route);
      if (B1_ROUTES.includes(route)) {
        expect(["query", "param", "none"], `${method} ${route} : project`).toContain(a!.project);
        if (method !== "GET" && !(route === "compute" && method === "POST")) expect(a!.write, `${method} ${route} : write`).toBe(true);
      }
    }
    for (const route of B1_ROUTES) expect(R[route], route).toBeDefined();
    // Les anciennes fonctions brutes passent par handler() et ne sont jamais publiques
    for (const route of ["stream", "shots/[id]"]) expect(annotation(R[route].GET)!.access).not.toContain("public");
  });

  it("sans identité : aucune méthode ne répond 2xx, hors liste blanche publique (comptes, diagnostic réduit, contrats)", async () => {
    for (const { route, method } of exported()) {
      const params = paramsFor(route);
      const res = route === "stream" ? await openStream({}, q(WA)) : await api(route, method, { params, query: q(WA), body: method === "GET" || method === "HEAD" ? undefined : probe() });
      if (route === "stream" && "close" in res) await res.close();
      const label = `${method} /api/${route}`;
      if (PUBLIC.includes(route)) {
        if (route === "health") expect(Object.keys((res as { body: Json }).body).sort(), label).toEqual(["auth", "contract_version", "ok", "service"]);
        if (route === "session") expect(res.status, label).toBe(410);
        continue;
      }
      expect(res.status, label).toBe(401);
    }
  });

  it("session d'un client : aucune réponse ne contient de donnée d'un autre compte, quel que soit le moyen de désigner son projet ; ses données restent intactes", async () => {
    const projectFile = path.join(env.dataDir, "migration", "projects", WA.pid, "project.json");
    const snapshot = () => {
      const st = store.getState();
      const mine = <T,>(list: T[]) => list.filter((x) => (x as { project_id?: string }).project_id === WA.pid);
      return JSON.stringify({ file: fs.readFileSync(projectFile, "utf8"), inv: st.investigations.filter((i) => i.project_id === WA.pid), obs: mine(st.observations), models: mine(st.models), schemas: mine(st.schemas), shots: WA.shots.map((s) => fs.existsSync(path.join(env.dataDir, "shots", WA.pid, s))) });
    };
    const before = snapshot();
    const content = contentMarkers(WA);
    const ids = allMarkers(WA);
    let checked = 0;
    for (const { route, method } of exported()) {
      const mode = modeOf(route, annotation(R[route][method]));
      const params = paramsFor(route);
      const body = method === "GET" || method === "HEAD" ? undefined : probe();
      const variants: { name: string; query?: string; headers?: Record<string, string> }[] = [
        { name: "?project= de A", query: q(WA) },
        { name: "x-reborn-project de A", headers: { "x-reborn-project": WA.pid } },
        { name: "sans désignation" },
        { name: "divergence", query: q(WB), headers: { "x-reborn-project": WA.pid } },
      ];
      for (const v of variants) {
        const headers = { ...owner(WB), ...v.headers };
        const label = `${method} /api/${route} (${v.name})`;
        let status: number;
        let resBody: unknown;
        if (route === "stream") {
          const s = await openStream(headers, v.query ?? "");
          status = s.status;
          resBody = s.status === 200 ? await s.next() : s.text;
          await s.close();
        } else {
          const r = await api(route, method, { params, query: v.query, headers, body });
          status = r.status;
          resBody = r.body;
        }
        checked++;
        const success = status >= 200 && status < 300;
        // Le projet de A n'est jamais servi ni modifié pour B ; une désignation contradictoire est refusée
        if (v.name !== "sans désignation" && mode !== "none" && !route.startsWith("auth/")) expect(success, `${label} : ${status}`).toBe(false);
        if (v.name === "divergence" && mode !== "none" && !route.startsWith("auth/") && status !== 403) expect(status, label).toBe(400);
        expectNoneOf(resBody, success ? ids : content, label);
      }
    }
    expect(checked).toBeGreaterThan(280);
    expect(snapshot()).toBe(before);
  }, 120000);
});
