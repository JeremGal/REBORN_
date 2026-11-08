/**
 * « ANALYSER MON LOGICIEL » (SPEC §6, lot B2) — test réel F : vrais handlers, vrais comptes, vraie base
 * auth.db (connexion partagée), horloge injectée. L'exécuteur de Mouss n'existe pas encore : il est
 * remplacé par des DOUBLURES D'EXÉCUTEUR étiquetées « jeu de test » (jeton explorer + X-Reborn-Executor),
 * et, en fin de fichier, par la doublure Python clients/examples/mouss_connexion.py (client 1.2) qui se
 * connecte RÉELLEMENT au logiciel de test Relatio 2004. Rien n'est simulé côté Studio.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { asService, asUser, cleanupAuthEnv, makeOperator, ORIGIN, setupAuthEnv, signUp, type TestEnv, type TestUser } from "@/test/auth";
import { ConnectionMissionSchema, connectionMissionExample } from "@/lib/migration/project-contracts";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";
import { z } from "zod";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const ROOT = path.resolve(import.meta.dirname, "../..");
const ROUTES = [
  "projects",
  "projects/[id]",
  "projects/[id]/credentials",
  "projects/[id]/credentials/redeem",
  "projects/[id]/connection",
  "projects/[id]/mission",
  "projects/[id]/analysis",
  "executor/heartbeat",
  "executor/missions/claim",
  "executor/missions/[mission_id]/complete",
];
const mods: Record<string, Record<string, Handler>> = {};
const UNAVAILABLE = "Agent d'analyse non disponible pour le moment.";
/**
 * Schéma PUBLIÉ du contrat (contracts/connection_mission.schema.json, celui que lira l'exécuteur de Mouss),
 * relu tel quel depuis le fichier : contrôle indépendant du schéma zod interne du Studio (lot C1).
 */
const publishedMission = () => z.fromJSONSchema(JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "connection_mission.schema.json"), "utf8")));

let env: TestEnv;
let keysDir = "";
let owner: TestUser;
let other: TestUser;
let offset = 0; // horloge injectée, toujours croissante dans ce fichier
let restoreClock: () => void = () => {};
const created: string[] = [];
let lib: {
  cred: typeof import("@/lib/migration/credentials");
  analysis: typeof import("@/lib/migration/analysis");
  project: typeof import("@/lib/migration/project");
  store: typeof import("@/lib/store");
};

async function call(route: string, method: string, opts: { id?: string; params?: Record<string, string>; body?: unknown; as?: Record<string, string> } = {}) {
  const url = `${ORIGIN}/api/${route.replace("[id]", opts.id ?? "").replace("[mission_id]", opts.params?.mission_id ?? "")}`;
  const req = new Request(url, { method, headers: { "content-type": "application/json", ...(opts.as ?? asUser(owner.cookie)) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await mods[route][method](req, { params: Promise.resolve({ ...(opts.id ? { id: opts.id } : {}), ...opts.params }) });
  const text = await res.text();
  let body: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body, text };
}

/** Doublure d'exécuteur (jeu de test) : jeton explorer + nom d'instance. */
const ex = (instance: string) => ({ ...asService("explorer"), "x-reborn-executor": instance });
const beat = (instance: string, o: { networks?: string[]; login?: string; active?: string[]; version?: string; max?: number } = {}) =>
  call("executor/heartbeat", "POST", { as: ex(instance), body: { version: o.version ?? "1.1", networks: o.networks ?? ["public", "private"], login: o.login ?? "cdp", max_concurrent: o.max ?? 1, active_missions: o.active ?? [] } });
const claim = (instance: string) => call("executor/missions/claim", "POST", { as: ex(instance) });
const advance = (ms: number) => {
  offset += ms;
};

async function newProject(body: Record<string, unknown> = {}) {
  const r = await call("projects", "POST", { body: { company: "Garage Martin", software: "ERP Garage", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version, legacy_url: "http://127.0.0.1:4999/", credentials: { username: "compte.f", password: "Mdp-Analyse-F" }, ...body } });
  expect(r.status, r.text).toBe(201);
  created.push(r.body.project.id);
  return r.body.project.id as string;
}

beforeAll(async () => {
  env = setupAuthEnv("reborn-analysis-");
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-analysis-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  for (const r of ROUTES) mods[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, Handler>;
  lib = { cred: await import("@/lib/migration/credentials"), analysis: await import("@/lib/migration/analysis"), project: await import("@/lib/migration/project"), store: await import("@/lib/store") };
  restoreClock = lib.cred.setClock(() => Date.now() + offset);
  owner = await signUp({ firstName: "Lina", lastName: "Martin", company: "Garage Martin" });
  other = await signUp({ firstName: "Paul", lastName: "Durand" });
}, 30000);

// Chaque test laisse la file vide (les prises suivantes ne doivent pas trouver une mission d'un autre test)
afterEach(async () => {
  for (const id of created.splice(0)) await call("projects/[id]/analysis", "DELETE", { id });
  advance(61_000); // les doublures du test précédent ne sont plus « disponibles »
});

afterAll(async () => {
  restoreClock();
  await cleanupAuthEnv();
  fs.rmSync(keysDir, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

describe("F — analyse : file, doublure d'exécuteur (jeu de test), remise unique, rapport, fin de mission", () => {
  it("sans exécuteur : 202 et le message exact ; la demande reste en file, rien n'est simulé", async () => {
    const pid = await newProject();
    const r = await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ ok: true, state: "queued", agent_available: false, executor_available: false, message: UNAVAILABLE, requested_by: "Lina Martin" });
    expect(r.body.mission).toMatchObject({ status: "queued", with_credentials: true, requires_network: "private", attempts: 0 });
    const g = await call("projects/[id]/analysis", "GET", { id: pid });
    expect(g.body).toMatchObject({ state: "queued", agent_available: false, message: UNAVAILABLE });
    expect(JSON.stringify(g.body)).not.toMatch(/c•|compte\.f|Mdp-Analyse/); // jamais d'indice d'identifiant
    const p = (await call("projects/[id]", "GET", { id: pid })).body.project;
    expect(p.status).toBe("CONNECTION_PENDING");
    // Une seule demande active : un second clic renouvelle la même demande
    const again = await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    expect(again.body.mission.id).toBe(r.body.mission.id);
    // Propriétaire seulement
    expect((await call("projects/[id]/analysis", "GET", { id: pid, as: asUser(other.cookie) })).status).toBe(404);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, as: {} })).status).toBe(401);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, as: asService("explorer") })).status).toBe(403);
  });

  it("battement → prise atomique (deux exécuteurs : une seule prise) → mission 1.1 conforme → remise unique → rapport du titulaire → fin → identifiants effacés", async () => {
    const pid = await newProject();
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
    const hb = await beat("doublure-A");
    expect(hb.status).toBe(200);
    expect(hb.body).toMatchObject({ ok: true, renew_within_s: 20, lease_s: 120 });
    expect(Date.parse(hb.body.server_time)).toBeGreaterThan(0);
    await beat("doublure-B");
    const g = await call("projects/[id]/analysis", "GET", { id: pid });
    expect(g.body.agent_available).toBe(true);
    expect(g.body.message).toBeUndefined();

    // Prise concurrente : une seule réussit
    const [a, b] = await Promise.all([claim("doublure-A"), claim("doublure-B")]);
    expect([a.status, b.status].sort()).toEqual([200, 204]);
    const [win, lose] = a.status === 200 ? (["doublure-A", "doublure-B"] as const) : (["doublure-B", "doublure-A"] as const);
    const m = (a.status === 200 ? a : b).body;
    expect((a.status === 200 ? b : a).text).toBe("");

    // Contrat connection_mission 1.1 : schéma publié, champs 1.0 conservés, ajouts 1.1
    const parsed = ConnectionMissionSchema.safeParse(m);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const published = publishedMission().safeParse(m);
    expect(published.success, JSON.stringify(published.error?.issues)).toBe(true);
    expect(publishedMission().safeParse({ ...m, limits: { ...m.limits, read_only: false } }).success).toBe(false); // témoin : le schéma publié contraint réellement
    for (const k of ["contract", "contract_version", "mission_id", "project_id", "target", "authorization", "objectives", "constraints", "credential", "report"]) expect(m, k).toHaveProperty(k);
    for (const k of ["connection_status", "investigation", "events", "screens", "observations", "exports", "heartbeat", "complete"]) expect(m.report, k).toHaveProperty(k);
    expect(m).toMatchObject({ contract: "connection_mission", contract_version: "1.1", project_id: pid, status: "claimed", requires_network: "private", limits: { read_only: true, login_screenshots: false } });
    expect(m.mission_id).toMatch(/^MIS_[a-f0-9]{10}$/);
    expect(m.executor.id).toMatch(/^EXE_[a-f0-9]{12}$/);
    expect(m.consent).toEqual({ privacy_notice_version: "1.0", authorization_version: AUTHORIZATION_DECLARATION.version, accepted_at: expect.any(String) });
    expect(m.credential).toMatchObject({ username_hint: "c••••••f", redeem_url: `/api/projects/${pid}/credentials/redeem`, handling: "remplir hors du modèle : coffre H fill_secret_at ou CDP ; jamais dans la consigne" });
    expect(m.credential.token).toMatch(/^[\w-]{30,}$/);
    expect(m.credential.expires_at).toBe(m.credential.token_expires_at); // sens 1.0 conservé (déprécié)
    expect(Date.parse(m.credential.token_expires_at) - (Date.now() + offset)).toBeLessThanOrEqual(15 * 60_000);
    expect(m.expires_at).toBe(m.credential.credentials_expires_at); // mission échue au plus tôt avec les identifiants
    expect(JSON.stringify(m)).not.toContain("Mdp-Analyse-F");
    const inv = lib.store.getState().investigations.find((i) => i.id === m.investigation_id);
    expect(inv).toMatchObject({ project_id: pid, mode: "live", status: "running" });

    // Remise : refusée à l'autre exécuteur (jeton non consommé), une seule fois au titulaire
    const token = m.credential.token as string;
    const redeem = (instance: string, t = token) => call("projects/[id]/credentials/redeem", "POST", { id: pid, as: ex(instance), body: { token: t } });
    expect((await redeem(lose)).status).toBe(403);
    expect((await call("projects/[id]/connection", "POST", { id: pid, as: ex(lose), body: { status: "connected" } })).status).toBe(403);
    // Sous le contrôle du prêt, le jeton lui-même est lié à l'exécuteur et à la mission (refus sans consommation)
    expect(lib.cred.redeemToken(pid, token, { executor_id: "EXE_000000000000" })).toEqual({ ok: false, reason: "executor" });
    expect(lib.cred.redeemToken(pid, token, { executor_id: m.executor.id, mission_id: "MIS_0000000000" })).toEqual({ ok: false, reason: "mission" });
    const ok = await redeem(win);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, username: "compte.f", password: "Mdp-Analyse-F" });
    const second = await redeem(win);
    expect(second.status).toBe(403);
    expect(second.body.reason).toBe("used");

    // Prêt expiré (aucun battement pendant 121 s) : mission remise en file, nouvelle prise, nouveau jeton
    advance(121_000);
    await beat(win, { active: [m.mission_id] });
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("queued");
    const m2 = (await claim(win)).body;
    expect(m2).toMatchObject({ mission_id: m.mission_id, status: "claimed" });
    expect(m2.credential.token).not.toBe(token);
    // Jeton à +15 min (prêt entretenu par les battements) : refusé
    for (let i = 0; i < 15; i++) {
      advance(60_000);
      expect((await beat(win, { active: [m.mission_id] })).body.leases).toHaveLength(1);
    }
    advance(1_000);
    const late = await redeem(win, m2.credential.token);
    expect(late.status).toBe(403);
    expect(late.body).not.toHaveProperty("password");
    // « expired » tant que le jeton échu est encore enregistré ; « invalid » dès que le balayage (démarrage,
    // minuterie, et au plus une fois par minute depuis handler() : SPEC §5) l'a supprimé — refus dans les deux cas.
    expect(["expired", "invalid"]).toContain(late.body.reason);
    // Branche « expired » sans aucun balayage intermédiaire : jeton présenté 15 min + 1 s après son émission
    const fresh = lib.cred.issueRedeemToken(pid, { mission_id: m.mission_id, executor_id: m.executor.id });
    const restoreLater = lib.cred.setClock(() => Date.now() + offset + 15 * 60_000 + 1_000);
    try {
      expect(lib.cred.redeemToken(pid, fresh.token, { executor_id: m.executor.id, mission_id: m.mission_id })).toEqual({ ok: false, reason: "expired" });
    } finally {
      restoreLater();
    }

    // Rapport « connected » du titulaire : le projet passe à « Connecté »
    const rep = await call("projects/[id]/connection", "POST", { id: pid, as: ex(win), body: { status: "connected", detail: "Page d'accueil authentifiée", mission_id: m.mission_id, by: "Usurpateur" } });
    expect(rep.status, rep.text).toBe(200);
    expect(rep.body.project.status).toBe("CONNECTED");
    expect(rep.body.mission.status).toBe("connected");
    const detail = (await call("projects/[id]", "GET", { id: pid })).body.details;
    expect(detail.connection).toMatchObject({ status: "connected", by: "Exécuteur de l'agent (service)" });

    // Fin de mission par un autre exécuteur : refusée ; par le titulaire : identifiants effacés
    const cid = (JSON.parse(fs.readFileSync(path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json"), "utf8")) as { id: string }).id;
    expect((await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m.mission_id }, as: ex(lose), body: { outcome: "completed" } })).status).toBe(403);
    const done = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m.mission_id }, as: ex(win), body: { outcome: "completed", detail: "Connexion vérifiée", disposal: { h_vault_item_deleted: true, local_artifacts_purged: true } } });
    expect(done.status, done.text).toBe(200);
    expect(done.body.mission.status).toBe("completed");
    expect(done.body.credentials.erased).toBe(true);
    expect(fs.existsSync(path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json"))).toBe(false);
    expect(fs.existsSync(path.join(keysDir, `${cid}.key`))).toBe(false);
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
    expect(lib.store.getState().investigations.find((i) => i.id === m.investigation_id)?.status).toBe("completed");
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("completed");
    expect((await redeem(win, m2.credential.token)).status).toBe(403);
    // Journal du projet : chaque étape tracée, aucune valeur
    const titles = lib.store.getState().events.filter((e) => (e.data as { project_id?: string })?.project_id === pid).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining(["Analyse prise en charge par l'agent d'analyse", "Identifiants remis à l'exécuteur titulaire de la mission (jeton à usage unique)", "Connexion à l'ancien logiciel : réussie", "Analyse terminée par l'agent"]));
    expect(JSON.stringify(lib.store.getState().events)).not.toContain("Mdp-Analyse-F");
  }, 30000);

  it("prêt expiré 3 fois : « failed », jamais de « completed » implicite", async () => {
    const pid = await newProject();
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    for (let i = 1; i <= 3; i++) {
      await beat("doublure-C");
      const m = await claim("doublure-C");
      expect(m.status, `prise ${i}`).toBe(200);
      advance(121_000);
    }
    await beat("doublure-C");
    const g = (await call("projects/[id]/analysis", "GET", { id: pid })).body;
    expect(g.state).toBe("failed");
    expect(g.mission.attempts).toBe(3);
    expect(g.mission.outcome_detail).toMatch(/3 fois/);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect((await claim("doublure-C")).status).toBe(204);
  });

  it("disponibilité : réseau joignable, saisie hors du modèle, battement de moins de 60 s ; sinon la mission attend", async () => {
    const priv = await newProject();
    await call("projects/[id]/analysis", "POST", { id: priv, body: {} });
    // Exécuteur hébergé (Internet seulement) : la mission en réseau privé n'est ni disponible ni prise
    await beat("navigateur-heberge", { networks: ["public"], login: "h_vault" });
    expect((await call("projects/[id]/analysis", "GET", { id: priv })).body).toMatchObject({ agent_available: false, message: UNAVAILABLE });
    expect((await claim("navigateur-heberge")).status).toBe(204);
    // Exécuteur sans saisie hors du modèle : jamais de mission avec identifiants
    await beat("sans-saisie", { login: "none" });
    expect((await call("projects/[id]/analysis", "GET", { id: priv })).body.agent_available).toBe(false);
    expect((await claim("sans-saisie")).status).toBe(204);
    // … mais une mission explicitement sans identifiants lui est remise, sans jeton
    const bare = await newProject({ credentials: undefined });
    expect((await call("projects/[id]/analysis", "POST", { id: bare, body: {} })).status).toBe(409);
    expect((await call("projects/[id]/analysis", "POST", { id: bare, body: { without_credentials: true } })).body.agent_available).toBe(true);
    const m = await claim("sans-saisie");
    expect(m.body).toMatchObject({ project_id: bare, credential: null });
    // Battement trop ancien : non disponible, prise refusée
    advance(61_000);
    expect((await call("projects/[id]/analysis", "GET", { id: priv })).body.agent_available).toBe(false);
    expect((await claim("sans-saisie")).status).toBe(409);
    // Version de contrat incompatible
    await beat("ancien", { version: "2.0" });
    expect((await claim("ancien")).status).toBe(409);
  });

  it("conditions de la demande : adresse valide, identifiants ou refus explicite, autorisation à la version courante, pas de pause", async () => {
    const noUrl = await newProject({ legacy_url: undefined });
    expect((await call("projects/[id]/analysis", "POST", { id: noUrl, body: {} })).body.error).toMatch(/Adresse de l'ancien logiciel manquante/);
    const pid = await newProject();
    lib.project.updateProject(pid, (p) => {
      p.authorization = { ...p.authorization!, version: "0.9" };
    });
    const stale = await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatch(/Autorisation d'accès requise/);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: { authorization_version: "0.9" } })).status).toBe(409);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: { authorization_version: AUTHORIZATION_DECLARATION.version } })).status).toBe(202);
    expect(lib.project.loadProject(pid)?.authorization?.version).toBe(AUTHORIZATION_DECLARATION.version);
    const consents = (await import("@/lib/auth/consents")).listConsents(owner.userId, pid);
    expect((await consents).filter((c) => c.kind === "source_authorization")).toHaveLength(2);
    // Pause : aucune prise, aucune remise
    expect((await call("projects/[id]", "PATCH", { id: pid, body: { action: "pause" } })).status).toBe(200);
    await beat("doublure-P");
    expect((await claim("doublure-P")).status).toBe(204);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(409);
    expect((await call("projects/[id]", "PATCH", { id: pid, body: { action: "resume" } })).status).toBe(200);
    const taken = await claim("doublure-P");
    expect(taken.body.project_id).toBe(pid);
    // Pause pendant la mission : jeton de remise révoqué, remise refusée
    expect(lib.cred.activeRedeemTokens(pid)).toBe(1);
    expect((await call("projects/[id]", "PATCH", { id: pid, body: { action: "pause" } })).status).toBe(200);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: ex("doublure-P"), body: { token: taken.body.credential.token } })).status).toBe(409);
    expect((await call("projects/[id]/connection", "POST", { id: pid, as: ex("doublure-P"), body: { status: "connected" } })).status).toBe(409);
  });

  it("annulation par le propriétaire : jetons révoqués, effacement des identifiants sur demande", async () => {
    const pid = await newProject();
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    await beat("doublure-D");
    const m = (await claim("doublure-D")).body;
    expect(lib.cred.activeRedeemTokens(pid)).toBe(1);
    const del = await call("projects/[id]/analysis", "DELETE", { id: pid, body: { erase_credentials: true } });
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ state: "cancelled", credentials: { erased: true } });
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: ex("doublure-D"), body: { token: m.credential.token } })).status).toBe(403);
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
  });

  it("adresse de l'ancien logiciel modifiée après la prise : mission annulée, l'agent ne poursuit jamais sur une autre cible", async () => {
    const pid = await newProject();
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    await beat("doublure-U");
    const m = (await claim("doublure-U")).body;
    expect(m.project_id).toBe(pid);
    const moved = await call("projects/[id]", "PATCH", { id: pid, body: { legacy_url: "http://127.0.0.1:4998/" } });
    expect(moved.status).toBe(200);
    // SPEC §3 / §5 : changer l'adresse révoque et efface les identifiants confiés, et annule l'analyse en cours
    expect(moved.body.credentials).toEqual({ stored: false });
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("cancelled");
    // L'agent qui poursuit est arrêté explicitement (409 « arrêtez-vous »), sans jamais recevoir d'identifiant
    const rep = await call("projects/[id]/connection", "POST", { id: pid, as: ex("doublure-U"), body: { status: "connected", mission_id: m.mission_id } });
    expect(rep.status).toBe(409);
    expect(rep.body.error).toMatch(/adresse de l'ancien logiciel a changé/);
    expect((await call("projects/[id]", "GET", { id: pid })).body.project.status).not.toBe("CONNECTED");
    const late = await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: ex("doublure-U"), body: { token: m.credential.token } });
    // Lot C4 : même consigne d'arrêt explicite que le rapport de connexion (409), au lieu d'un refus générique
    expect(late).toMatchObject({ status: 409, body: { ok: false, error: expect.stringMatching(/adresse de l'ancien logiciel a changé/) } });
    expect(late.text).not.toContain("Mdp-Analyse-F");
  });

  it("compatibilité 1.0 : take_mission (POST …/mission) prend la mission en file du projet, 409 sinon ; l'équipe ne reçoit jamais de jeton", async () => {
    const pid = await newProject();
    expect((await call("projects/[id]/mission", "POST", { id: pid, as: asService("explorer") })).status).toBe(409);
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    const op = await signUp();
    await makeOperator(op.email);
    const byOp = await call("projects/[id]/mission", "POST", { id: pid, as: asUser(op.cookie) });
    expect(byOp.status).toBe(409);
    expect(byOp.text).not.toMatch(/"token"/);
    const taken = await call("projects/[id]/mission", "POST", { id: pid, as: asService("explorer") }); // exécuteur 1.0 : sans battement ni en-tête
    expect(taken.status).toBe(200);
    expect(taken.body).toMatchObject({ contract: "connection_mission", project_id: pid, credential: { redeem_url: `/api/projects/${pid}/credentials/redeem` } });
    expect(publishedMission().safeParse(taken.body).success).toBe(true); // même contrat 1.1 publié pour la compatibilité 1.0
    const ok = await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: asService("explorer"), body: { token: taken.body.credential.token } });
    expect(ok.body).toMatchObject({ username: "compte.f" });
    // Aperçu GET : jamais de jeton
    const view = await call("projects/[id]/mission", "GET", { id: pid });
    expect(view.status).toBe(200);
    expect(view.body.credential).not.toHaveProperty("token");
    // Routes de l'exécuteur : ni navigateur, ni autre service
    for (const h of [asUser(owner.cookie), asUser(op.cookie), asService("analyst")]) expect((await call("executor/missions/claim", "POST", { as: h })).status).toBe(403);
    expect((await call("executor/heartbeat", "POST", { as: {}, body: {} })).status).toBe(401);
  });

  it("non-régression ISO-1 : rejouer la fin d'une mission terminée n'efface ni les identifiants confiés à nouveau, ni le jeton de la mission d'un autre exécuteur", async () => {
    const pid = await newProject();
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    await beat("ancien-titulaire");
    const m1 = (await claim("ancien-titulaire")).body;
    expect(m1.project_id).toBe(pid);
    const end = { outcome: "completed", detail: "Connexion vérifiée", disposal: { local_artifacts_purged: true } };
    const done = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m1.mission_id }, as: ex("ancien-titulaire"), body: end });
    expect(done.body.credentials.erased).toBe(true);
    const frozen = (await lib.analysis.getMission(m1.mission_id))!;

    // Le propriétaire confie de nouveaux identifiants : un rejeu de l'ancienne fin n'y touche pas (dépôt postérieur à la fin)
    advance(1_000);
    expect((await call("projects/[id]/credentials", "POST", { id: pid, body: { username: "compte.f2", password: "Mdp-Nouveau-F2" } })).status).toBe(200);
    const replay1 = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m1.mission_id }, as: ex("ancien-titulaire"), body: { ...end, outcome: "failed", detail: "rejeu" } });
    expect(replay1.status).toBe(200);
    expect(replay1.body.credentials).toEqual({ erased: false, revoked_at: null });
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toMatchObject({ stored: true, username_hint: "c••••••2" });

    // Nouvelle demande prise par un AUTRE exécuteur : le rejeu ne révoque ni son jeton, ni ses identifiants, ni sa mission
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    await beat("titulaire-legitime");
    const m2 = (await claim("titulaire-legitime")).body;
    expect(m2.mission_id).not.toBe(m1.mission_id);
    const replay2 = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m1.mission_id }, as: ex("ancien-titulaire"), body: end });
    expect(replay2.status).toBe(200);
    expect(replay2.body.credentials.erased).toBe(false);
    expect(replay2.body.mission.status).toBe("completed");
    // État figé : rien de la mission terminée n'a été réécrit (détail, effacement déclaré, date de mise à jour)
    expect(await lib.analysis.getMission(m1.mission_id)).toEqual(frozen);
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body.stored).toBe(true);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(1);
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body).toMatchObject({ state: "claimed", mission: { id: m2.mission_id } });
    const ok = await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: ex("titulaire-legitime"), body: { token: m2.credential.token } });
    expect(ok.body).toEqual({ ok: true, username: "compte.f2", password: "Mdp-Nouveau-F2" });
    // L'ancien titulaire ne peut toujours rien pour la mission en cours
    expect((await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m2.mission_id }, as: ex("ancien-titulaire"), body: end })).status).toBe(403);
  });

  it("fin déclarée après un rapport « failed » du titulaire : identifiants de cette mission effacés, effacement côté agent consigné une fois", async () => {
    const pid = await newProject();
    await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    await beat("doublure-echec");
    const m = (await claim("doublure-echec")).body;
    const rep = await call("projects/[id]/connection", "POST", { id: pid, as: ex("doublure-echec"), body: { status: "failed", detail: "Connexion refusée", mission_id: m.mission_id } });
    expect(rep.body.mission.status).toBe("failed");
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body.stored).toBe(true);
    const done = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m.mission_id }, as: ex("doublure-echec"), body: { outcome: "failed", disposal: { local_artifacts_purged: true } } });
    expect(done.status).toBe(200);
    expect(done.body.credentials.erased).toBe(true);
    expect(done.body.mission).toMatchObject({ status: "failed", outcome_detail: "connexion échouée : Connexion refusée" });
    expect((await lib.analysis.getMission(m.mission_id))!.disposal_json).toBe(JSON.stringify({ local_artifacts_purged: true }));
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
  });

  it("l'exemple de format publié respecte le contrat connection_mission 1.1", () => {
    expect(ConnectionMissionSchema.safeParse(connectionMissionExample()).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Doublure Python (client 1.2) contre un vrai Relatio — jeu de test     */
/* ------------------------------------------------------------------ */

const python = spawnSync("python3", ["--version"]).status === 0;

describe.skipIf(!python)("F — doublure Python de l'exécuteur (clients/examples/mouss_connexion.py, jeu de test) contre le vrai logiciel de test Relatio", () => {
  let relatio: ChildProcess | undefined;
  let relatioDir = "";
  let relatioUrl = "";
  let relPassword = "";
  let server: http.Server | undefined;
  let adapterUrl = "";
  const seen: string[] = [];

  const ADAPTER: [RegExp, string, string[]][] = [
    [/^\/api\/executor\/heartbeat$/, "executor/heartbeat", []],
    [/^\/api\/executor\/missions\/claim$/, "executor/missions/claim", []],
    [/^\/api\/executor\/missions\/([^/]+)\/complete$/, "executor/missions/[mission_id]/complete", ["mission_id"]],
    [/^\/api\/projects\/([^/]+)\/credentials\/redeem$/, "projects/[id]/credentials/redeem", ["id"]],
    [/^\/api\/projects\/([^/]+)\/connection$/, "projects/[id]/connection", ["id"]],
    [/^\/api\/projects\/([^/]+)\/mission$/, "projects/[id]/mission", ["id"]],
  ];

  beforeAll(async () => {
    const free = () => new Promise<number>((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); }); // prettier-ignore
    const port = await free();
    relatioUrl = `http://127.0.0.1:${port}`;
    relatioDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-analysis-relatio-"));
    relatio = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { PATH: process.env.PATH ?? "", LEGACY_CRM_PORT: String(port), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: relatioDir, NODE_ENV: "test" }, stdio: "ignore" });
    for (let i = 0; i < 150; i++) {
      try {
        await fetch(`${relatioUrl}/login`, { redirect: "manual" });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    relPassword = (JSON.parse(fs.readFileSync(path.join(relatioDir, ".credentials.json"), "utf8")) as { migration: { password: string } }).migration.password;
    // Pile isolée en mémoire : les routes RÉELLES du Studio servies en HTTP sur un port aléatoire
    server = http.createServer(async (req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      const hit = ADAPTER.find(([re]) => re.test(u.pathname));
      if (!hit || !req.method) {
        res.writeHead(404).end();
        return;
      }
      const m = hit[0].exec(u.pathname)!;
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: req.method === "GET" ? undefined : Buffer.concat(chunks) });
      const response = await mods[hit[1]][req.method](request, { params: Promise.resolve(Object.fromEntries(hit[2].map((k, i) => [k, decodeURIComponent(m[i + 1])]))) });
      const body = Buffer.from(await response.arrayBuffer());
      if (hit[1] !== "projects/[id]/credentials/redeem") seen.push(body.toString("utf8"));
      res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" }).end(body);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    adapterUrl = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  }, 60000);

  afterAll(async () => {
    relatio?.kill();
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    fs.rmSync(relatioDir, { recursive: true, force: true });
  });

  const runDouble = (extra: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn("python3", ["-I", path.join(ROOT, "clients/examples/mouss_connexion.py")], {
        env: { PATH: process.env.PATH ?? "", REBORN_URL: adapterUrl, REBORN_TOKEN: env.tokens.explorer, REBORN_EXECUTOR_ID: "doublure-python", REBORN_TEST_STACK: "1", NODE_ENV: "test", ...extra },
      });
      let out = "";
      p.stdout.on("data", (d: Buffer) => (out += d.toString()));
      p.stderr.on("data", (d: Buffer) => (out += d.toString()));
      p.on("close", (code: number | null) => resolve({ code, out }));
    });

  it("refuse de démarrer hors d'une pile isolée (port 3000, sans REBORN_TEST_STACK)", async () => {
    expect((await runDouble({ REBORN_URL: "http://127.0.0.1:3000" })).code).toBe(2);
    expect((await runDouble({ REBORN_TEST_STACK: "" })).code).toBe(2);
  });

  it("battement → prise → remise → connexion RÉELLE à Relatio → rapport « connected » → fin : identifiants effacés", async () => {
    const pid = await newProject({ software: "Relatio 2004", legacy_url: relatioUrl, credentials: { username: "migration", password: relPassword } });
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
    const r = await runDouble();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/mission MIS_[a-f0-9]{10} prise/);
    expect(r.out).toMatch(/mission close : completed/);
    expect(r.out).not.toContain(relPassword);
    const p = (await call("projects/[id]", "GET", { id: pid })).body;
    expect(p.project.status).toBe("CONNECTED");
    expect(p.details.connection).toMatchObject({ status: "connected", detail: "Page authentifiée du logiciel de test affichée (jeu de test)" });
    expect(p.details.credentials).toEqual({ stored: false });
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("completed");
    expect(seen.join("\n")).not.toContain(relPassword);
    // Un logiciel que la doublure ne connaît pas : « human_needed », jamais « connected »
    const unknown = await newProject({ software: "ERP inconnu", credentials: { username: "u", password: "Mdp-Inconnu" } });
    await call("projects/[id]/analysis", "POST", { id: unknown, body: {} });
    const r2 = await runDouble();
    expect(r2.code, r2.out).toBe(4);
    const p2 = (await call("projects/[id]", "GET", { id: unknown })).body;
    expect(p2.project.status).toBe("NEEDS_HUMAN_REVIEW");
    expect(p2.details.connection.status).toBe("human_needed");
    expect((await call("projects/[id]/analysis", "GET", { id: unknown })).body.state).toBe("failed");
  }, 60000);
});
