/**
 * Test D (SPEC §12), balayage RÉEL des identifiants échus : non pas un appel direct de la fonction de
 * balayage, mais les deux déclencheurs du Studio en service (SPEC §5) —
 *   1. la minuterie démarrée par src/instrumentation.ts (register(), une fois par processus Next) :
 *      au démarrage puis toutes les 60 s, sans qu'aucune requête n'arrive ;
 *   2. handler() (src/lib/http.ts) : au plus une fois par minute, depuis n'importe quelle route.
 * Horloge injectée à +24 h + 1 s ; vrais comptes, vraies routes, vrai coffre sur disque (dossier temporaire).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asService, asUser, callRoute, cleanupAuthEnv, setupAuthEnv, signUp, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const R: Record<string, Mod> = {};
const ROUTES = ["me", "projects", "projects/[id]/credentials", "projects/[id]/credentials/redeem", "projects/[id]/analysis", "executor/heartbeat", "executor/missions/claim"];
const SECRET = "Mdp-Balayage-Reel-24h";
const g = globalThis as unknown as { __rebornSweeper?: NodeJS.Timeout; __rebornSweeping?: Promise<unknown> | null };

let env: TestEnv;
let keysDir = "";
let owner: TestUser;
let restoreClock: () => void = () => {};
let lib: { cred: typeof import("@/lib/migration/credentials"); store: typeof import("@/lib/store") };

function api(route: string, method: string, o: { id?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}`, { params: o.id ? { id: o.id } : {}, body: o.body, headers: o.headers ?? asUser(owner.cookie) });
}
const executor = () => ({ ...asService("explorer"), "x-reborn-executor": "doublure-balayage" }); // doublure d'exécuteur (jeu de test)
const credFile = (pid: string) => path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json");
const keyOf = (pid: string) => path.join(keysDir, `${(JSON.parse(fs.readFileSync(credFile(pid), "utf8")) as { id: string }).id}.key`);

/** Projet du propriétaire avec identifiants confiés, analyse demandée et prise par la doublure : jeton de remise émis. */
async function projectWithToken(company: string) {
  const p = await api("projects", "POST", { body: { company, software: "ERP maison", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: "compte.balayage", password: SECRET }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
  expect(p.status, JSON.stringify(p.body)).toBe(201);
  const pid = p.body.project.id as string;
  expect((await api("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
  expect((await api("executor/heartbeat", "POST", { headers: executor(), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 5, active_missions: [] } })).status).toBe(200);
  const m = await api("executor/missions/claim", "POST", { headers: executor() });
  expect(m.status, JSON.stringify(m.body)).toBe(200);
  expect(m.body.project_id).toBe(pid);
  expect(lib.cred.activeRedeemTokens(pid)).toBe(1);
  return { pid, key: keyOf(pid), token: m.body.credential.token as string };
}

beforeAll(async () => {
  env = setupAuthEnv("reborn-sweeper-");
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-sweeper-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  lib = { cred: await import("@/lib/migration/credentials"), store: await import("@/lib/store") };
  owner = await signUp({ firstName: "Lucie", lastName: "Garnier", company: "Garnier Bois" });
}, 30000);

afterAll(async () => {
  restoreClock();
  if (g.__rebornSweeper) clearInterval(g.__rebornSweeper);
  delete g.__rebornSweeper;
  await g.__rebornSweeping;
  delete process.env.NEXT_RUNTIME;
  await cleanupAuthEnv();
  fs.rmSync(keysDir, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

describe("Test D — balayage réel des identifiants échus (24 h), même si personne ne revient", () => {
  it("démarrage du Studio (instrumentation.ts) : à +24 h + 1 s, la minuterie efface le chiffré, sa clé et le jeton, sans aucune requête", async () => {
    const t0 = Date.now();
    const { pid, key, token } = await projectWithToken("Garnier Bois");
    expect(fs.existsSync(credFile(pid))).toBe(true);
    expect(fs.existsSync(key)).toBe(true);
    restoreClock = lib.cred.setClock(() => t0 + 24 * 3600_000 + 1000);
    // register() comme le serveur Next au démarrage (runtime Node.js) : minuterie unique, qui ne retient pas le processus
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("@/instrumentation");
    await register();
    expect(g.__rebornSweeper).toBeDefined();
    expect(g.__rebornSweeper!.hasRef()).toBe(false);
    await register(); // second appel (rechargement à chaud) : aucune seconde minuterie
    await vi.waitFor(() => expect(fs.existsSync(credFile(pid))).toBe(false), { timeout: 5000, interval: 20 });
    await g.__rebornSweeping;
    expect(fs.existsSync(key)).toBe(false);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect(lib.cred.redeemToken(pid, token).ok).toBe(false);
    // Jeton refusé à l'exécuteur lui-même ; état visible du propriétaire : rien de stocké, analyse expirée
    expect((await api("projects/[id]/credentials/redeem", "POST", { id: pid, headers: executor(), body: { token } })).status).toBe(403);
    expect((await api("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
    expect((await api("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("expired");
    // Effacement tracé dans le journal du projet, sans aucune valeur
    const ev = lib.store.getState().events.filter((e) => (e as { project_id?: string }).project_id === pid && e.title === "Identifiants effacés : échéance de 24 h atteinte");
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(lib.store.getState().events)).not.toContain(SECRET);
  });

  it("au plus une fois par minute depuis handler() : une requête quelconque (GET /api/me) déclenche le balayage des identifiants échus", async () => {
    // SPEC §5 « et au plus une fois par minute depuis handler() » : demandé au lot A1 par B2, repris par le lot C4
    // (src/lib/http.ts). Si ce test échoue, c'est ce défaut applicatif — pas le test — qui est en cause.
    restoreClock();
    const t1 = Date.now();
    const { pid, key } = await projectWithToken("Garnier Bois — scierie");
    restoreClock = lib.cred.setClock(() => t1 + 48 * 3600_000); // > 24 h après le dépôt, > 1 min après le dernier balayage
    expect(fs.existsSync(credFile(pid))).toBe(true);
    const me = await api("me", "GET"); // route sans rapport avec les identifiants (elle n'appelle pas le balayage elle-même)
    expect(me.status).toBe(200);
    await vi.waitFor(() => expect(fs.existsSync(credFile(pid))).toBe(false), { timeout: 3000, interval: 20 });
    expect(fs.existsSync(key)).toBe(false);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
  });
});
