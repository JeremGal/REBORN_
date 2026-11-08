/**
 * Projets de migration : isolation, états liés à de vraies opérations, identifiants protégés,
 * remise à l'agent par jeton à usage unique, aucune connexion simulée. Routes API réelles,
 * appelées par de vrais comptes clients (session) et par l'agent (jeton de service).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asService, asUser, cleanupAuthEnv, setupAuthEnv, signUp, type TestUser } from "@/test/auth";
import { setEgressOverrides } from "@/lib/migration/egress";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const mods: Record<string, Record<string, Handler>> = {};
const ORIGIN = "http://127.0.0.1:3000";
/** Propriétaire des projets du fichier, et un autre client (aucun accès à ces projets). */
let owner: TestUser;
let other: TestUser;

/** Par défaut, appel du propriétaire (navigateur connecté) ; `as` : autre identité (agent, autre client). */
async function call(route: string, method: string, opts: { id?: string; query?: string; body?: unknown; as?: Record<string, string> } = {}) {
  const url = `${ORIGIN}/api/${route.replace("[id]", opts.id ?? "")}${opts.query ?? ""}`;
  const req = new Request(url, { method, headers: { "content-type": "application/json", ...(opts.as ?? asUser(owner.cookie)) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const params: Record<string, string> = opts.id ? { id: opts.id } : {};
  const res = await mods[route][method](req, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}
const explorer = () => asService("explorer");

let keysDir = "";
let restoreEgress: () => void = () => {};
beforeAll(async () => {
  setupAuthEnv("reborn-projects-");
  // Clés des identifiants dans un dossier temporaire (jamais <Studio>/.keys) ; liste blanche réseau de test :
  // seul 127.0.0.1:9 (port fermé) est joignable, pour constater un VRAI échec de connexion.
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-projects-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  restoreEgress = setEgressOverrides({ allow: ["127.0.0.1:9"] });
  for (const r of ["projects", "projects/[id]", "projects/[id]/select", "projects/[id]/credentials", "projects/[id]/credentials/redeem", "projects/[id]/connection", "projects/[id]/connection/test", "projects/[id]/mission", "projects/[id]/analysis", "migration/sources", "migration/project", "migration/mapping"]) {
    mods[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, Handler>;
  }
  owner = await signUp({ firstName: "Jerem", lastName: "Propriétaire" });
  other = await signUp({ firstName: "Autre", lastName: "Client" });
});
afterAll(async () => {
  restoreEgress();
  await cleanupAuthEnv();
  fs.rmSync(keysDir, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
const newProject = async (company: string, extra: Record<string, unknown> = {}) =>
  call("projects", "POST", { body: { company, software: `${company} ERP`, authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version, ...extra } });

describe("Projets de migration", () => {
  it("exige la confirmation d'autorisation du propriétaire", async () => {
    const r = await call("projects", "POST", { body: { company: "Sans accord", authorized_by: "X" } });
    expect(r.status).toBe(400);
  });

  it("isole les projets : les données de l'un n'apparaissent jamais dans l'autre", async () => {
    const a = (await newProject("Alpha")).body.project;
    const b = (await newProject("Beta")).body.project;
    expect(a.id).not.toBe(b.id);
    const upload = await call("migration/sources", "POST", { query: `?project=${a.id}`, body: { name: "clients.csv", content_base64: csv([["id", "nom"], ["1", "Client A1"], ["2", "Client A2"]]) } });
    expect(upload.status).toBe(200);
    expect((await call("migration/sources", "GET", { query: `?project=${a.id}` })).body).toHaveLength(1);
    expect((await call("migration/sources", "GET", { query: `?project=${b.id}` })).body).toHaveLength(0);
    // Aucun projet implicite pour un client : sans ?project=, refus explicite (plus de « projet courant » partagé)
    const implicit = await call("migration/sources", "GET");
    expect(implicit.status).toBe(400);
    expect(implicit.body.error).toMatch(/^Projet requis/);
    const list = (await call("projects", "GET")).body.projects as { id: string; data: { sources: number } }[];
    expect(list.find((p) => p.id === a.id)?.data.sources).toBe(1);
    expect(list.find((p) => p.id === b.id)?.data.sources).toBe(0);
    expect((await call("migration/sources", "GET", { query: "?project=MIG_ffffffff" })).status).toBe(404);
    expect((await call("migration/sources", "GET", { query: "?project=../../etc" })).status).toBe(400);
    // Un autre client ne voit ni ne lit ces projets
    expect((await call("projects", "GET", { as: asUser(other.cookie) })).body.projects).toEqual([]);
    expect((await call("migration/sources", "GET", { query: `?project=${a.id}`, as: asUser(other.cookie) })).status).toBe(404);
  });

  it("fait évoluer l'état selon les opérations réellement effectuées", async () => {
    const p = (await newProject("Gamma", { legacy_url: "http://127.0.0.1:9/" })).body.project;
    expect(p.status).toBe("CONNECTION_PENDING");
    expect(p.progress.done).toBe(0);
    await call("migration/sources", "POST", { query: `?project=${p.id}`, body: { name: "clients.csv", content_base64: csv([["id", "nom", "categorie"], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `Client ${i + 1}`, ["A", "B"][i % 2]])]) } });
    let s = (await call("projects/[id]", "GET", { id: p.id })).body;
    expect(s.project.status).toBe("EXTRACTING");
    expect(s.project.progress.steps.find((x: { id: string }) => x.id === "extraction").done).toBe(true);
    await call("migration/mapping", "POST", { query: `?project=${p.id}&propose=auto` });
    s = (await call("projects/[id]", "GET", { id: p.id })).body;
    expect(s.project.status).toBe("NEEDS_HUMAN_REVIEW");
    expect(s.project.anomalies.pending_decisions).toBeGreaterThan(0);
    expect(s.details.status_history.map((h: { status: string }) => h.status)).toEqual(["CONNECTION_PENDING", "EXTRACTING", "NEEDS_HUMAN_REVIEW"]);
    // Pause : toute écriture est refusée PAR LE SERVEUR, l'état ne bouge pas ; reprise : l'état précédent est restauré
    expect((await call("projects/[id]", "PATCH", { id: p.id, body: { action: "pause" } })).body.project.status).toBe("PAUSED");
    const blocked = await call("migration/sources", "POST", { query: `?project=${p.id}`, body: { name: "autre.csv", content_base64: csv([["id"], ["1"]]) } });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/pause/);
    expect((await call("migration/mapping", "POST", { query: `?project=${p.id}&propose=auto` })).status).toBe(409);
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "connected", by: "Explorer" }, as: explorer() });
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("PAUSED");
    expect((await call("projects/[id]", "PATCH", { id: p.id, body: { action: "resume" } })).body.project.status).toBe("NEEDS_HUMAN_REVIEW");
  });
});

describe("Identifiants de l'ancien logiciel et mission de l'agent", () => {
  it("chiffre les identifiants, ne les renvoie jamais, les remet une seule fois à l'agent", async () => {
    const p = (await newProject("Delta", { legacy_url: "http://127.0.0.1:9/", credentials: { username: "migration", password: "S3cret-Mot-De-Passe" } })).body.project;
    const dir = path.join(process.env.REBORN_DATA_DIR!, "migration", "projects", p.id);
    const raw = fs.readFileSync(path.join(dir, "credentials.enc.json"), "utf8");
    expect(raw).not.toContain("S3cret-Mot-De-Passe");
    expect(raw).not.toContain("migration");
    expect(fs.statSync(path.join(dir, "credentials.enc.json")).mode & 0o777).toBe(0o600);
    const detail = await call("projects/[id]", "GET", { id: p.id });
    expect(JSON.stringify(detail.body)).not.toContain("S3cret-Mot-De-Passe");
    expect(detail.body.details.credentials).toMatchObject({ stored: true, username_hint: "m••••••n" });
    // Mission consultée par le propriétaire : sans jeton ; aucune mission remise tant que le propriétaire n'a pas demandé l'analyse
    expect((await call("projects/[id]/mission", "GET", { id: p.id })).body.credential.token).toBeUndefined();
    expect((await call("projects/[id]/mission", "POST", { id: p.id, as: explorer() })).status).toBe(409);
    expect((await call("projects/[id]/analysis", "POST", { id: p.id, body: {} })).status).toBe(202);
    // Mission prise par l'exécuteur (compatibilité 1.0 : take_mission) : jeton à usage unique, jamais le mot de passe
    const mission = (await call("projects/[id]/mission", "POST", { id: p.id, as: explorer() })).body;
    expect(JSON.stringify(mission)).not.toContain("S3cret-Mot-De-Passe");
    expect(mission.credential.token).toMatch(/^[\w-]{20,}$/);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: "faux-jeton-faux-jeton-faux" }, as: explorer() })).status).toBe(403);
    // Un autre client ne peut ni voir la mission ni échanger le jeton ; un compte (même propriétaire) n'échange jamais un jeton
    expect((await call("projects/[id]/mission", "GET", { id: p.id, as: asUser(other.cookie) })).status).toBe(404);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token }, as: asUser(other.cookie) })).status).toBe(403);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token } })).status).toBe(403);
    const ok = await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token }, as: explorer() });
    expect(ok.body).toMatchObject({ username: "migration", password: "S3cret-Mot-De-Passe" });
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token }, as: explorer() })).status).toBe(403);
    expect((await call("projects/[id]/credentials", "DELETE", { id: p.id })).status).toBe(200);
    expect((await call("projects/[id]/credentials", "GET", { id: p.id })).body).toEqual({ stored: false });
  });

  it("ne simule jamais une connexion : sans connecteur, l'état attend l'agent ; un échec réel est signalé", async () => {
    const p = (await newProject("Epsilon", { software: "Relatio 2004", legacy_url: "http://127.0.0.1:9/", credentials: { username: "u", password: "p" } })).body.project;
    const none = await call("projects/[id]/connection/test", "POST", { id: p.id, body: {} });
    expect(none.status).toBe(409);
    expect(none.body.error).toMatch(/agent/);
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("CONNECTION_PENDING");
    // Le plan de test (Relatio) ne s'applique pas à un autre logiciel : refus, aucun identifiant envoyé
    const other = (await newProject("Zeta", { software: "Sage 100", legacy_url: "http://127.0.0.1:9/", credentials: { username: "u", password: "p" } })).body.project;
    const refused = await call("projects/[id]/connection/test", "POST", { id: other.id, body: { plan: "test" } });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Relatio/);
    // Connexion réelle tentée vers un port fermé : échec constaté, pas inventé
    const fail = await call("projects/[id]/connection/test", "POST", { id: p.id, body: { plan: "test" } });
    expect(fail.status).toBe(502);
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("FAILED");
    // Rapport de l'agent : refusé tant qu'il n'est pas titulaire d'une mission de ce projet (aucune connexion déclarable sans mission)
    expect((await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "connected", by: "Explorer" }, as: explorer() })).status).toBe(403);
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("FAILED");
    // Analyse demandée par le propriétaire, prise par l'exécuteur : double authentification → intervention humaine ; puis connecté
    expect((await call("projects/[id]/analysis", "POST", { id: p.id, body: {} })).status).toBe(202);
    const taken = await call("projects/[id]/mission", "POST", { id: p.id, as: explorer() });
    expect(taken.status).toBe(200);
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "mfa_required", detail: "Code SMS demandé", by: "Explorer", mission_id: taken.body.mission_id }, as: explorer() });
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("NEEDS_HUMAN_REVIEW");
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "connected", by: "Explorer" }, as: explorer() });
    const after = (await call("projects/[id]", "GET", { id: p.id })).body;
    expect(after.project.status).toBe("CONNECTED");
    // `by` du corps ignoré : identité authentifiée du service
    expect(after.details.connection).toMatchObject({ status: "connected", by: "Exécuteur de l'agent (service)" });
  });
});

describe("Logiciel livré d'un projet", () => {
  it("est retrouvé par sa dernière mise en service si le projet ne l'a pas enregistré (projets livrés avant la V1.0)", async () => {
    const { deliveredApp } = await import("@/lib/migration/project");
    const apps = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-apps-"));
    const previous = process.env.REBORN_APPS_DIR;
    process.env.REBORN_APPS_DIR = apps;
    try {
      fs.mkdirSync(path.join(apps, "ancien-crm"));
      fs.writeFileSync(path.join(apps, "ancien-crm", "app.json"), JSON.stringify({ app: { id: "ancien-crm", port: 5077 } }));
      const deployment = { id: "D1", at: "2026-11-07T00:00:00Z", by: "test", run_id: "RUN_001", app_dir: "generated/ancien-crm", backup: null, status: "active" as const };
      const project = { deployments: [deployment] } as unknown as Parameters<typeof deliveredApp>[0];
      expect(deliveredApp(project)).toEqual({ id: "ancien-crm", port: 5077 });
      // Le logiciel enregistré sur le projet reste prioritaire
      expect(deliveredApp({ ...project, app: { id: "nouveau-crm", port: 5099 } })).toEqual({ id: "nouveau-crm", port: 5099 });
      // Sans mise en service active, aucun logiciel livré n'est inventé
      expect(deliveredApp({ ...project, deployments: [{ ...deployment, status: "rolled_back" }] })).toBeNull();
      expect(deliveredApp({ ...project, deployments: [{ ...deployment, app_dir: "generated/introuvable" }] })).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.REBORN_APPS_DIR;
      else process.env.REBORN_APPS_DIR = previous;
      fs.rmSync(apps, { recursive: true, force: true }); // dossier temporaire du test (lot C1 : il restait à chaque exécution)
    }
  });
});
