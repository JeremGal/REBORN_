/**
 * Vue d'ensemble de l'équipe REBORN (GET /api/operations) : opérateur 200, client 403, agents 403, anonyme 401 ;
 * agents connectés, file des missions, projets (étape, état, enregistrements migrés, logiciel livré) — et AUCUNE
 * donnée sensible dans la réponse : ni donnée métier, ni adresse ou identifiant d'ancien logiciel, ni demandeur,
 * ni jeton. Vraies routes, vrais comptes, dossiers temporaires ; exécuteur = doublure « jeu de test » ; données inventées.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asService, asUser, callRoute, cleanupAuthEnv, makeOperator, setupAuthEnv, signUp, type Json, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const ROUTES = ["projects", "projects/[id]/analysis", "projects/[id]/credentials", "executor/heartbeat", "executor/missions/claim", "migration/sources", "migration/mapping", "migration/decisions/bulk", "migration/runs", "operations"] as const;
const R = {} as Record<(typeof ROUTES)[number], Mod>;
let env: TestEnv;
let keysDir = "";
let A: TestUser, B: TestUser, OP: TestUser;
let pA = "", pB = "";
let mission: Json = null;
let imported = 0;
let hint = "";

const SECRET_PASSWORD = "Mdp-Secret-Ops-42-jeu-de-test";
const SECRET_LOGIN = "compte.secret.ops";
const SECRET_PATH = "chemin-secret-ops";
const SECRET_VALUE = "VALEUR_SECRETE_OPS";
const SECRET_FILE = "export-secret-ops.csv";

const call = (route: (typeof ROUTES)[number], method: string, o: { id?: string; query?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}${o.query ?? ""}`, { params: o.id ? { id: o.id } : {}, headers: o.headers ?? {}, body: o.body });
const b64 = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
const ex = () => ({ ...asService("explorer"), "x-reborn-executor": "poste-ops-test" });

beforeAll(async () => {
  env = setupAuthEnv("reborn-operations-");
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-operations-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  A = await signUp({ firstName: "Prenomsecretops", lastName: "Nomsecretops", company: "Entreprise Fictive A (jeu de test)" });
  B = await signUp({ firstName: "Bertille", lastName: "Fictive", company: "Entreprise Fictive B (jeu de test)" });
  OP = await signUp({ firstName: "Équipe", lastName: "Opérations" });
  await makeOperator(OP.email);

  // Client A : identifiants confiés, adresse de l'ancien logiciel, export déposé, analyse demandée puis prise
  const created = await call("projects", "POST", {
    headers: asUser(A.cookie),
    body: {
      company: "Entreprise Fictive A (jeu de test)",
      software: "ERP fictif A",
      authorized: true,
      authorization_version: AUTHORIZATION_DECLARATION.version,
      legacy_url: `http://127.0.0.1:4999/${SECRET_PATH}/`,
      credentials: { username: SECRET_LOGIN, password: SECRET_PASSWORD },
      credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version,
    },
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  pA = created.body.project.id;
  hint = (await call("projects/[id]/credentials", "GET", { id: pA, headers: asUser(A.cookie) })).body.username_hint;
  expect(hint).toBeTruthy();
  const up = await call("migration/sources", "POST", { query: `?project=${pA}`, headers: asUser(A.cookie), body: { name: SECRET_FILE, content_base64: b64([["id", "nom", "categorie"], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `${SECRET_VALUE}_${i + 1}`, ["A", "B"][i % 2]])]) } });
  expect(up.status, JSON.stringify(up.body)).toBe(200);
  expect((await call("projects/[id]/analysis", "POST", { id: pA, headers: asUser(A.cookie), body: {} })).status).toBe(202);
  expect((await call("executor/heartbeat", "POST", { headers: ex(), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: [], label: "doublure d'exécuteur — jeu de test" } })).status).toBe(200);
  const claimed = await call("executor/missions/claim", "POST", { headers: ex() });
  expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
  mission = claimed.body;
  expect(mission.project_id).toBe(pA);
  expect(mission.credential.token).toBeTruthy();

  // Client B : données déposées, points acceptés en bloc, migration réellement exécutée
  const cb = await call("projects", "POST", { headers: asUser(B.cookie), body: { company: "Entreprise Fictive B (jeu de test)", software: "CRM fictif B", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
  pB = cb.body.project.id;
  const rows = [["id", "nom", "categorie"], ...Array.from({ length: 30 }, (_, i) => [String(i + 1), `Client fictif ${i + 1}`, ["A", "B"][i % 2]])];
  expect((await call("migration/sources", "POST", { query: `?project=${pB}`, headers: asUser(B.cookie), body: { name: "clients.csv", content_base64: b64(rows) } })).status).toBe(200);
  const m = (await call("migration/mapping", "GET", { query: `?project=${pB}`, headers: asUser(B.cookie) })).body;
  const bulk = await call("migration/decisions/bulk", "POST", { query: `?project=${pB}`, headers: asUser(B.cookie), body: { version: m.current.version, keys: m.status.items.map((i: { key: string }) => i.key) } });
  expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
  const run = await call("migration/runs", "POST", { query: `?project=${pB}`, headers: asUser(B.cookie), body: {} });
  expect(run.status, JSON.stringify(run.body)).toBe(200);
  imported = run.body.run.summary.imported;
  expect(imported).toBe(30);
}, 60000);

afterAll(async () => {
  await cleanupAuthEnv();
  fs.rmSync(keysDir, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

describe("GET /api/operations : vue d'ensemble de l'équipe", () => {
  it("opérateur 200 ; client 403 ; agents 403 ; anonyme 401", async () => {
    expect((await call("operations", "GET", { headers: asUser(OP.cookie) })).status).toBe(200);
    expect((await call("operations", "GET", { headers: asUser(A.cookie) })).status).toBe(403);
    expect((await call("operations", "GET", { headers: asUser(B.cookie) })).status).toBe(403);
    expect((await call("operations", "GET", { headers: asService("explorer") })).status).toBe(403);
    expect((await call("operations", "GET", { headers: asService("analyst") })).status).toBe(403);
    expect((await call("operations", "GET", { headers: {} })).status).toBe(401);
    expect((R.operations.GET as unknown as { reborn: unknown }).reborn).toEqual({ access: ["operator"], write: false, project: "none" });
  });

  it("agents connectés, file des missions et projets : ce dont l'équipe a besoin pour suivre", async () => {
    const o = (await call("operations", "GET", { headers: asUser(OP.cookie) })).body as Json;
    expect(o.ok).toBe(true);
    // Agent : identifiant, nom d'instance, dernier battement, réseaux, mission en cours
    const agent = o.agents.list.find((x: Json) => x.name === "poste-ops-test");
    expect(agent).toMatchObject({ id: mission.executor.id, online: true, networks: ["public", "private"], login: "cdp", label: "doublure d'exécuteur — jeu de test", last_seen_at: expect.any(String) });
    expect(agent.missions).toEqual([{ id: mission.mission_id, project_id: pA, company: "Entreprise Fictive A (jeu de test)", status: "claimed" }]);
    expect(o.agents.online).toBeGreaterThanOrEqual(1);
    // File : projet, entreprise, état, créée, prise par
    const entry = o.missions.list.find((x: Json) => x.id === mission.mission_id);
    expect(entry).toMatchObject({ project_id: pA, company: "Entreprise Fictive A (jeu de test)", software: "ERP fictif A", status: "claimed", executor_name: "poste-ops-test", attempts: 1, with_credentials: true, requested_at: expect.any(String), claimed_at: expect.any(String) });
    expect(o.missions.running).toBeGreaterThanOrEqual(1);
    // Projets : entreprise, logiciel, étape du parcours, état, enregistrements migrés, logiciel livré
    const a = o.projects.list.find((x: Json) => x.id === pA);
    const b = o.projects.list.find((x: Json) => x.id === pB);
    expect(a).toMatchObject({ company: "Entreprise Fictive A (jeu de test)", software: "ERP fictif A", records_migrated: 0, delivered: false, analysis: "claimed", steps_total: 7 });
    expect(a.step).toMatchObject({ slug: "correspondances", state: "attention" });
    expect(a.step.text).toMatch(/à valider par le client$/);
    expect(b).toMatchObject({ company: "Entreprise Fictive B (jeu de test)", software: "CRM fictif B", records_migrated: imported, delivered: false, analysis: null });
    expect(b.steps_done).toBeGreaterThanOrEqual(3);
    expect(["next", "attention"]).toContain(b.step.state);
    expect(o.projects.total).toBeGreaterThanOrEqual(2);
  });

  it("aucune donnée sensible : ni donnée métier, ni adresse ou identifiant d'ancien logiciel, ni personne, ni jeton", async () => {
    const res = await call("operations", "GET", { headers: asUser(OP.cookie) });
    const dump = JSON.stringify(res.body);
    const forbidden = [
      SECRET_PASSWORD,
      SECRET_LOGIN,
      hint,
      SECRET_PATH,
      SECRET_VALUE,
      SECRET_FILE,
      A.email,
      B.email,
      "Prenomsecretops",
      "Nomsecretops",
      "Bertille",
      mission.credential.token,
      env.tokens.explorer,
      env.tokens.analyst,
      env.tokens.all,
      process.env.REBORN_AUTH_SECRET!,
      "REBORN_EXPLORER_TOKEN",
    ];
    for (const s of forbidden) expect(dump.includes(s), `réponse contenant « ${s} »`).toBe(false);
    for (const key of ["legacy_url", "requested_by", "requested_by_id", "outcome_detail", "username_hint", "token_id", "target_sha256", "consent_id", "status_reason", "credential", "notes"]) {
      expect(dump.includes(`"${key}"`), `clé « ${key} » présente`).toBe(false);
    }
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
