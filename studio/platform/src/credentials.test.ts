/**
 * Identifiants de l'ancien logiciel (SPEC §5, lot B2) — tests réels C, D, E, exfiltration :
 * vrais handlers des routes, vrais comptes (Better Auth), vrai logiciel de test Relatio 2004 lancé sur un
 * port libre (jeu de test), vrai coffre sur disque, horloge injectée. Aucun secret affiché.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import util from "node:util";
import { spawn, type ChildProcess } from "node:child_process";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { asService, asUser, cleanupAuthEnv, makeOperator, ORIGIN, setupAuthEnv, signUp, type TestEnv, type TestUser } from "@/test/auth";
import { setEgressOverrides } from "@/lib/migration/egress";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const ROOT = path.resolve(import.meta.dirname, "../..");
const ROUTES = [
  "projects",
  "projects/[id]",
  "projects/[id]/credentials",
  "projects/[id]/credentials/redeem",
  "projects/[id]/connection",
  "projects/[id]/connection/test",
  "projects/[id]/mission",
  "projects/[id]/analysis",
  "migration/extract",
  "migration/sources",
  "migration/mapping",
  "migration/decisions",
  "migration/runs",
  "executor/heartbeat",
  "executor/missions/claim",
  "executor/missions/[mission_id]/complete",
];
const mods: Record<string, Record<string, Handler>> = {};

let env: TestEnv;
let keysDir = "";
let owner: TestUser;
let operator: TestUser;
let relatio: ChildProcess | undefined;
let relatioDir = "";
let relatioUrl = "";
let relPassword = "";
let evil: { port: number; hits: string[]; close: () => Promise<void> };
let restoreEgress: () => void = () => {};

/** Toutes les réponses du fichier (statut + corps), sauf la remise légitime au service, gardée à part. */
const responses: string[] = [];
const legitimateRedeems: string[] = [];
const consoleLines: string[] = [];
const spies: { mockRestore: () => void }[] = [];

let lib: {
  cred: typeof import("@/lib/migration/credentials");
  analysis: typeof import("@/lib/migration/analysis");
  project: typeof import("@/lib/migration/project");
  store: typeof import("@/lib/store");
  context: typeof import("@/lib/migration/context");
};

async function call(route: string, method: string, opts: { id?: string; params?: Record<string, string>; query?: string; body?: unknown; as?: Record<string, string> } = {}) {
  const url = `${ORIGIN}/api/${route.replace("[id]", opts.id ?? "").replace("[mission_id]", opts.params?.mission_id ?? "")}${opts.query ?? ""}`;
  const req = new Request(url, { method, headers: { "content-type": "application/json", ...(opts.as ?? asUser(owner.cookie)) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await mods[route][method](req, { params: Promise.resolve({ ...(opts.id ? { id: opts.id } : {}), ...opts.params }) });
  const text = await res.text();
  const entry = `${method} /api/${route} → ${res.status} ${text}`;
  if (route === "projects/[id]/credentials/redeem" && res.status === 200) legitimateRedeems.push(entry);
  else responses.push(entry);
  let body: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body, text };
}

const executor = (instance = "jeu-de-test-B2") => ({ ...asService("explorer"), "x-reborn-executor": instance });
const heartbeat = (instance = "jeu-de-test-B2", active: string[] = []) =>
  call("executor/heartbeat", "POST", { as: executor(instance), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 2, active_missions: active } });

async function newProject(body: Record<string, unknown>) {
  const r = await call("projects", "POST", { body: { company: "Ateliers Morel SA", software: "Relatio 2004", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version, ...body } });
  expect(r.status, r.text).toBe(201);
  return r.body.project.id as string;
}
const projectDir = (id: string) => path.join(env.dataDir, "migration", "projects", id);
const credFile = (id: string) => path.join(projectDir(id), "credentials.enc.json");
const credId = (id: string) => (JSON.parse(fs.readFileSync(credFile(id), "utf8")) as { id: string }).id;
const keyFile = (cid: string) => path.join(keysDir, `${cid}.key`);

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}
/** Le secret, en clair, en base64 ou en hexadécimal, n'apparaît dans aucun octet de ces fichiers. */
function filesContaining(secret: string, dirs: string[]): string[] {
  const forms = [Buffer.from(secret, "utf8"), Buffer.from(Buffer.from(secret).toString("base64")), Buffer.from(Buffer.from(secret).toString("hex"))];
  return dirs.flatMap(walk).filter((f) => {
    const data = fs.readFileSync(f);
    return forms.some((x) => data.includes(x));
  });
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

beforeAll(async () => {
  // Console capturée pour tout le fichier (message + pile des erreurs, comme les journaux du Studio)
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    spies.push(
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === "string" ? a : util.inspect(a, { depth: 6 }))).join(" "));
      }),
    );
  }
  env = setupAuthEnv("reborn-cred-");
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-cred-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  for (const r of ROUTES) mods[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, Handler>;
  lib = {
    cred: await import("@/lib/migration/credentials"),
    analysis: await import("@/lib/migration/analysis"),
    project: await import("@/lib/migration/project"),
    store: await import("@/lib/store"),
    context: await import("@/lib/migration/context"),
  };
  // Logiciel de test Relatio 2004 (jeu de test), sur un port libre, avec ses propres comptes aléatoires
  const port = await freePort();
  relatioUrl = `http://127.0.0.1:${port}`;
  relatioDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-cred-relatio-"));
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
  // Cible « malveillante » locale, AUTORISÉE par la liste blanche : seule la règle d'exfiltration l'écarte
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.end("capturé");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  evil = { port: (server.address() as net.AddressInfo).port, hits, close: () => new Promise<void>((r) => server.close(() => r())) };
  restoreEgress = setEgressOverrides({ allow: [`127.0.0.1:${port}`, `127.0.0.1:${evil.port}`, "127.0.0.1:9"] });
  owner = await signUp({ firstName: "Claire", lastName: "Morel", company: "Ateliers Morel SA" });
  operator = await signUp({ firstName: "Équipe", lastName: "REBORN" });
  await makeOperator(operator.email);
}, 60000);

afterAll(async () => {
  restoreEgress();
  relatio?.kill();
  await evil?.close();
  for (const s of spies) s.mockRestore();
  await cleanupAuthEnv();
  for (const d of [keysDir, relatioDir]) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

describe("C — identifiants chiffrés au repos, jamais exposés", () => {
  it("parcours complet (création, analyse, prise par l'exécuteur, remise, connexion réelle, extraction) : le mot de passe n'apparaît nulle part", async () => {
    const pid = await newProject({ legacy_url: relatioUrl, credentials: { username: "migration", password: relPassword } });
    // Format v2 : chiffré, clé propre à l'identifiant dans le dossier des clés (0700 / 0600), hors de .data
    const rec = JSON.parse(fs.readFileSync(credFile(pid), "utf8"));
    expect(rec).toMatchObject({ v: 2, project_id: pid, username_hint: "m••••••n" });
    expect(Object.keys(rec).sort()).toEqual(["created_at", "data", "expires_at", "id", "iv", "project_id", "tag", "username_hint", "v"]);
    expect(fs.statSync(credFile(pid)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(keyFile(rec.id)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(keysDir).mode & 0o777).toBe(0o700);
    expect(keyFile(rec.id).startsWith(env.dataDir)).toBe(false);

    expect((await call("projects/[id]", "GET", { id: pid })).body.details.credentials).toMatchObject({ stored: true, username_hint: "m••••••n" });
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toMatchObject({ stored: true });
    expect((await call("projects/[id]/mission", "GET", { id: pid })).status).toBe(200);
    const asked = await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    expect(asked.status).toBe(202);
    expect(asked.body.message).toBe("Agent d'analyse non disponible pour le moment.");
    // Test réel du connecteur HTTP (plan de test Relatio) : connexion constatée, jamais simulée
    const tested = await call("projects/[id]/connection/test", "POST", { id: pid, body: { plan: "test" } });
    expect(tested.status, tested.text).toBe(200);
    expect(tested.body.detail).toMatch(/Session ouverte sur http:\/\/127\.0\.0\.1:\d+ avec le compte m••••••n/);
    // Exécuteur (doublure de test) : battement, prise, remise unique, rapport, fin
    expect((await heartbeat()).status).toBe(200);
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.agent_available).toBe(true);
    const mission = await call("executor/missions/claim", "POST", { as: executor() });
    expect(mission.status).toBe(200);
    expect(mission.body.project_id).toBe(pid);
    const redeemed = await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: executor(), body: { token: mission.body.credential.token } });
    expect(redeemed.body).toMatchObject({ ok: true, username: "migration", password: relPassword });
    expect((await call("projects/[id]/connection", "POST", { id: pid, as: executor(), body: { status: "connected", detail: `Connecté (mot de passe ${relPassword} saisi par CDP)`, mission_id: mission.body.mission_id } })).status).toBe(200);
    // Le texte libre de l'agent est débarrassé du mot de passe
    expect((await call("projects/[id]", "GET", { id: pid })).body.details.connection.detail).toBe("Connecté (mot de passe ••• saisi par CDP)");
    // Extraction avec les identifiants confiés (propriétaire, plan de test) : fin réussie → identifiants effacés
    const extracted = await call("migration/extract", "POST", { query: `?project=${pid}`, body: { plan: "test" } });
    expect(extracted.status, extracted.text).toBe(200);
    expect(extracted.body.extraction.results.filter((r: { status: string }) => r.status === "ok").length).toBe(11);
    expect(extracted.body.extraction.account).toBe("m••••••n");
    expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
    expect(fs.existsSync(credFile(pid))).toBe(false);
    expect(fs.existsSync(keyFile(rec.id))).toBe(false);
    const done = await call("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: mission.body.mission_id }, as: executor(), body: { outcome: "completed", disposal: { local_artifacts_purged: true } } });
    expect(done.status, done.text).toBe(200);

    // Balayages : fichiers (données + base des comptes + clés), réponses, évènements, console
    lib.store.flushPersist();
    expect(filesContaining(relPassword, [env.dataDir, keysDir])).toEqual([]);
    expect(fs.existsSync(path.join(env.dataDir, "auth.db"))).toBe(true);
    expect(legitimateRedeems).toHaveLength(1);
    expect(legitimateRedeems[0]).toContain(relPassword); // témoin : le balayage sait trouver le mot de passe
    expect(responses.filter((r) => r.includes(relPassword))).toEqual([]);
    expect(JSON.stringify(lib.store.getState().events)).not.toContain(relPassword);
    expect(consoleLines.filter((l) => l.includes(relPassword))).toEqual([]);
  }, 60000);
});

describe("D — 24 h au plus, expiration fermée, balayage effectif", () => {
  it("à +24 h + 1 s, sans que personne ne revienne : balayage du fichier ET de la clé, identifiants inutilisables, jeton refusé", async () => {
    const pid = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "compte.migration", password: "Mdp-Ancien-Logiciel-D-1" } });
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
    await heartbeat("jeu-de-test-D");
    const mission = await call("projects/[id]/mission", "POST", { id: pid, as: executor("jeu-de-test-D") });
    expect(mission.status).toBe(200);
    const token = mission.body.credential.token as string;
    const cid = credId(pid);
    expect(lib.cred.readCredentials(pid)).toEqual({ username: "compte.migration", password: "Mdp-Ancien-Logiciel-D-1" });
    const t0 = Date.now();
    const restore = lib.cred.setClock(() => t0 + 24 * 3600_000 + 1000);
    try {
      // Aucun accès préalable : seul le balayage (démarrage / minuterie de instrumentation.ts) agit
      const report = await lib.analysis.sweepAll();
      expect(report.credentials).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(credFile(pid))).toBe(false);
      expect(fs.existsSync(keyFile(cid))).toBe(false);
      expect(lib.cred.readCredentials(pid)).toBeNull();
      expect(lib.cred.redeemToken(pid, token, { executor_id: lib.analysis.executorIdentity({ kind: "service", service: "explorer", tokenId: "REBORN_EXPLORER_TOKEN" }, new Request(ORIGIN, { headers: { "x-reborn-executor": "jeu-de-test-D" } })).id }).ok).toBe(false);
      expect((await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: executor("jeu-de-test-D"), body: { token } })).status).toBe(403);
      expect((await call("projects/[id]/credentials", "GET", { id: pid })).body).toEqual({ stored: false });
      expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("expired");
      const ev = lib.store.getState().events.find((e) => e.title === "Identifiants effacés : échéance de 24 h atteinte" && (e.data as { project_id?: string })?.project_id === pid);
      expect(ev).toBeDefined();
      expect(JSON.stringify(ev)).not.toContain("Mdp-Ancien-Logiciel-D-1");
    } finally {
      restore();
    }
  });

  it("une date illisible vaut « expiré » (lecture et balayage) ; l'ancien format est ramené à dépôt + 24 h", async () => {
    const a = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "u-a", password: "Mdp-Illisible-A" } });
    const b = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "u-b", password: "Mdp-Illisible-B" } });
    const edit = (id: string, patch: Record<string, string>) => fs.writeFileSync(credFile(id), JSON.stringify({ ...JSON.parse(fs.readFileSync(credFile(id), "utf8")), ...patch }));
    const ka = credId(a);
    edit(a, { expires_at: "bientôt" });
    expect(lib.cred.credentialStatus(a)).toEqual({ stored: false });
    expect(fs.existsSync(credFile(a))).toBe(false);
    expect(fs.existsSync(keyFile(ka))).toBe(false);
    const kb = credId(b);
    edit(b, { created_at: "?" });
    lib.cred.sweepCredentials();
    expect(fs.existsSync(credFile(b))).toBe(false);
    expect(fs.existsSync(keyFile(kb))).toBe(false);
    // Ancien format (v1, chiffré directement par vault.key) : échéance ramenée à la création + 24 h
    const vault = Buffer.from(fs.readFileSync(path.join(env.dataDir, "vault.key"), "utf8").trim(), "base64");
    const v1 = (username: string, password: string, createdMs: number, expiresMs: number) => {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", vault, iv);
      const data = Buffer.concat([c.update(JSON.stringify({ username, password }), "utf8"), c.final()]);
      return JSON.stringify({ username_hint: "x••x", created_at: new Date(createdMs).toISOString(), expires_at: new Date(expiresMs).toISOString(), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
    };
    const old = await newProject({ legacy_url: "http://127.0.0.1:9/" });
    const recent = await newProject({ legacy_url: "http://127.0.0.1:9/" });
    fs.writeFileSync(credFile(old), v1("u", "Mdp-V1-Ancien", Date.now() - 25 * 3600_000, Date.now() + 100 * 3600_000), { mode: 0o600 });
    const created = Date.now() - 3600_000;
    fs.writeFileSync(credFile(recent), v1("u", "Mdp-V1-Recent", created, Date.now() + 100 * 3600_000), { mode: 0o600 });
    expect(lib.cred.credentialStatus(old)).toEqual({ stored: false });
    expect(fs.existsSync(credFile(old))).toBe(false);
    expect(lib.cred.readCredentials(recent)).toEqual({ username: "u", password: "Mdp-V1-Recent" });
    expect(lib.cred.credentialStatus(recent).expires_at).toBe(new Date(created + 24 * 3600_000).toISOString());
  });

  it("une durée de plus de 24 h est refusée (API de création, dépôt, bibliothèque)", async () => {
    for (const ttl of [24.5, 25, 72, 168]) {
      const r = await call("projects", "POST", { body: { company: "Trop long", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials: { username: "u", password: "p-long", ttl_hours: ttl }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
      expect(r.status, String(ttl)).toBe(400);
    }
    const pid = await newProject({ legacy_url: "http://127.0.0.1:9/" });
    const r = await call("projects/[id]/credentials", "POST", { id: pid, body: { username: "u", password: "Mdp-TTL", ttl_hours: 25 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Durée de conservation : 24 h au maximum");
    expect(() => lib.cred.storeCredentials(pid, "u", "Mdp-TTL", 24.01)).toThrow(/24 h au maximum/);
    const ok = await call("projects/[id]/credentials", "POST", { id: pid, body: { username: "u", password: "Mdp-TTL", ttl_hours: 24 } });
    expect(ok.status).toBe(200);
    expect(Date.parse(ok.body.expires_at) - Date.parse(ok.body.created_at)).toBe(24 * 3600_000);
  });

  it("remplacer les identifiants révoque le jeton de remise en cours (correction du défaut de l'ancien code)", async () => {
    const pid = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "u1", password: "Mdp-Remplace-1" } });
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
    await heartbeat("jeu-de-test-R");
    const m = await call("executor/missions/claim", "POST", { as: executor("jeu-de-test-R") });
    expect(m.body.project_id).toBe(pid);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(1);
    expect((await call("projects/[id]/credentials", "POST", { id: pid, body: { username: "u2", password: "Mdp-Remplace-2" } })).status).toBe(200);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    // La mission repart en file : l'ancien jeton ne remet rien, une nouvelle prise remet les nouveaux identifiants
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: executor("jeu-de-test-R"), body: { token: m.body.credential.token } })).status).toBe(403);
    const again = await call("executor/missions/claim", "POST", { as: executor("jeu-de-test-R") });
    expect(again.body.mission_id).toBe(m.body.mission_id);
    const r = await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: executor("jeu-de-test-R"), body: { token: again.body.credential.token } });
    expect(r.body).toMatchObject({ username: "u2", password: "Mdp-Remplace-2" });
  });

  it("vault.key n'est jamais régénérée en silence : absente alors que des chiffrés existent → erreur explicite", async () => {
    const x = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "ux", password: "Mdp-Coffre-X" } });
    const y = await newProject({ legacy_url: "http://127.0.0.1:9/" });
    const vaultFile = path.join(env.dataDir, "vault.key");
    const saved = fs.readFileSync(vaultFile);
    fs.rmSync(vaultFile);
    try {
      expect(() => lib.cred.storeCredentials(y, "uy", "Mdp-Coffre-Y")).toThrow(/vault\.key est absente alors que des identifiants chiffrés existent/);
      expect(() => lib.cred.readCredentials(x)).toThrow(/vault\.key est absente/);
      expect(lib.cred.credentialStatus(x)).toEqual({ stored: false });
      expect(fs.existsSync(vaultFile)).toBe(false);
      expect(fs.existsSync(credFile(x))).toBe(true); // conservé : l'opérateur peut restaurer la clé
    } finally {
      fs.writeFileSync(vaultFile, saved, { mode: 0o600 });
    }
    expect(lib.cred.readCredentials(x)).toEqual({ username: "ux", password: "Mdp-Coffre-X" });
  });

  it("un chiffré recopié dans un autre projet est indéchiffrable ; l'original reste lisible", async () => {
    const a = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "ua", password: "Mdp-Copie-A" } });
    const b = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "ub", password: "Mdp-Copie-B" } });
    fs.copyFileSync(credFile(a), credFile(b));
    expect(lib.cred.readCredentials(b)).toBeNull();
    expect(fs.existsSync(credFile(b))).toBe(false);
    expect(lib.cred.readCredentials(a)).toEqual({ username: "ua", password: "Mdp-Copie-A" });
    // Même refus à la consultation de l'état, et un nouveau dépôt dans B ne fait jamais perdre sa clé à A
    fs.copyFileSync(credFile(a), credFile(b));
    expect(lib.cred.credentialStatus(b)).toEqual({ stored: false });
    fs.copyFileSync(credFile(a), credFile(b));
    lib.cred.storeCredentials(b, "ub2", "Mdp-Copie-B2");
    expect(lib.cred.readCredentials(b)).toEqual({ username: "ub2", password: "Mdp-Copie-B2" });
    expect(lib.cred.readCredentials(a)).toEqual({ username: "ua", password: "Mdp-Copie-A" });
    // Échéance modifiée à la main (données associées authentifiées) : indéchiffrable
    const r = JSON.parse(fs.readFileSync(credFile(a), "utf8"));
    fs.writeFileSync(credFile(a), JSON.stringify({ ...r, expires_at: new Date(Date.parse(r.expires_at) - 60_000).toISOString() }));
    expect(lib.cred.readCredentials(a)).toBeNull();
  });

  it("dossier des clés : jamais dans les données sauvegardées (sauf dossier temporaire de test, supprimé avec elles)", () => {
    const saved = { keys: process.env.REBORN_KEYS_DIR, data: process.env.REBORN_DATA_DIR };
    try {
      expect(lib.cred.keysDir()).toBe(keysDir);
      delete process.env.REBORN_KEYS_DIR;
      expect(lib.cred.keysDir()).toBe(path.join(env.dataDir, ".keys")); // données temporaires (sous os.tmpdir())
      process.env.REBORN_DATA_DIR = "/srv/reborn/donnees";
      expect(lib.cred.keysDir()).toBe("/srv/reborn/donnees.keys"); // dossier voisin, hors des sauvegardes de données
      delete process.env.REBORN_DATA_DIR;
      expect(lib.cred.keysDir()).toBe(path.join(process.cwd(), ".keys")); // <Studio>/.keys (ignoré par git)
    } finally {
      process.env.REBORN_KEYS_DIR = saved.keys;
      process.env.REBORN_DATA_DIR = saved.data;
    }
  });

  it("balayage : seules NOS clés orphelines sont supprimées", async () => {
    const z = await newProject({ legacy_url: "http://127.0.0.1:9/", credentials: { username: "uz", password: "Mdp-Orpheline" } });
    const kz = credId(z);
    fs.rmSync(credFile(z)); // chiffré perdu (arrêt brutal) : la clé devient orpheline
    const foreign = path.join(keysDir, `CRD_${randomBytes(8).toString("hex")}.key`);
    fs.writeFileSync(foreign, JSON.stringify({ v: 2, id: "x", owner: "autre-dossier", iv: "", tag: "", data: "" }), { mode: 0o600 });
    lib.cred.sweepCredentials(Date.now()); // trop récente : conservée (écriture en cours possible)
    expect(fs.existsSync(keyFile(kz))).toBe(true);
    const report = lib.cred.sweepCredentials(Date.now() + 3 * 60_000);
    expect(report.keys).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(keyFile(kz))).toBe(false);
    expect(fs.existsSync(foreign)).toBe(true);
    fs.rmSync(foreign);
  });
});

describe("E — suppression demandée par le client", () => {
  it("révocation + effacement (clé puis chiffré) ; sources, correspondances et exécutions intactes", async () => {
    const pid = await newProject({ legacy_url: "http://127.0.0.1:9/", software: "ERP maison" });
    const csv = Buffer.from(["id;nom;ville", ...Array.from({ length: 12 }, (_, i) => `${i + 1};Client ${i + 1};${["Lyon", "Nantes", "Lille"][i % 3]}`)].join("\n")).toString("base64");
    expect((await call("migration/sources", "POST", { query: `?project=${pid}`, body: { name: "clients.csv", content_base64: csv } })).status).toBe(200);
    expect((await call("migration/mapping", "POST", { query: `?project=${pid}&propose=auto` })).status).toBe(200);
    lib.context.projectScope.run(pid, () => {
      for (const i of lib.project.planStatus().items) if (!i.decision) lib.project.decide(i.key, "accepted", "Test E");
    });
    const run = await call("migration/runs", "POST", { query: `?project=${pid}`, body: {} });
    expect(run.status, run.text).toBe(200);
    // Identifiants confiés APRÈS coup, puis analyse prise par l'exécuteur (jeton émis)
    expect((await call("projects/[id]/credentials", "POST", { id: pid, body: { username: "compte.e", password: "Mdp-Suppression-E" } })).status).toBe(200);
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
    await heartbeat("jeu-de-test-E");
    const m = await call("projects/[id]/mission", "POST", { id: pid, as: executor("jeu-de-test-E") });
    expect(m.status).toBe(200);
    const cid = credId(pid);
    const before = JSON.parse(fs.readFileSync(path.join(projectDir(pid), "project.json"), "utf8"));
    const digest = (dir: string) => walk(dir).map((f) => `${path.relative(dir, f)}:${createHash("sha256").update(fs.readFileSync(f)).digest("hex")}`).sort();
    const sourcesBefore = digest(path.join(projectDir(pid), "sources"));
    const runsBefore = digest(path.join(projectDir(pid), "runs"));

    // Ordre réel des suppressions sur le disque (SPEC §5 : la clé de l'identifiant d'abord, puis le chiffré)
    const rm = vi.spyOn(fs, "rmSync");
    let removed: string[];
    try {
      const del = await call("projects/[id]/credentials", "DELETE", { id: pid });
      expect(del.status).toBe(200);
      expect(del.body).toMatchObject({ ok: true, stored: false, erased: true });
      expect(Date.parse(del.body.revoked_at)).toBeGreaterThan(0);
      removed = rm.mock.calls.map((c) => String(c[0]));
    } finally {
      rm.mockRestore();
    }
    const keyAt = removed.indexOf(keyFile(cid));
    const encAt = removed.indexOf(credFile(pid));
    expect(keyAt, "clé de l'identifiant supprimée").toBeGreaterThanOrEqual(0);
    expect(encAt, "chiffré supprimé").toBeGreaterThan(keyAt);
    expect(fs.existsSync(keyFile(cid))).toBe(false);
    expect(fs.existsSync(credFile(pid))).toBe(false);
    expect(lib.cred.activeRedeemTokens(pid)).toBe(0);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: pid, as: executor("jeu-de-test-E"), body: { token: m.body.credential.token } })).status).toBe(403);
    expect((await call("projects/[id]/analysis", "GET", { id: pid })).body.state).toBe("cancelled");
    // Données métier intactes
    const after = JSON.parse(fs.readFileSync(path.join(projectDir(pid), "project.json"), "utf8"));
    for (const k of ["sources", "mappings", "decisions", "runs", "extraction"]) expect(after[k], k).toEqual(before[k]);
    expect(after.runs).toHaveLength(1);
    expect(after.sources).toHaveLength(1);
    expect(digest(path.join(projectDir(pid), "sources"))).toEqual(sourcesBefore);
    expect(digest(path.join(projectDir(pid), "runs"))).toEqual(runsBefore);
    expect(sourcesBefore.length).toBeGreaterThan(0);
    expect(runsBefore.length).toBeGreaterThan(0);
    expect(lib.store.getState().events.some((e) => e.title.startsWith("Identifiants de l'ancien logiciel effacés : suppression demandée par Claire Morel") && (e.data as { project_id?: string })?.project_id === pid)).toBe(true);
    // Un autre client ne peut ni lire ni supprimer
    const other = await signUp();
    expect((await call("projects/[id]/credentials", "DELETE", { id: pid, as: asUser(other.cookie) })).status).toBe(404);
  });

  it("l'étape des correspondances efface les identifiants (effacement anticipé, données conservées)", async () => {
    const pid = await newProject({ legacy_url: "http://127.0.0.1:9/", software: "ERP maison", credentials: { username: "compte.m", password: "Mdp-Etape-M" } });
    const csv = Buffer.from("id;nom\n1;A\n2;B\n").toString("base64");
    await call("migration/sources", "POST", { query: `?project=${pid}`, body: { name: "clients.csv", content_base64: csv } });
    expect(lib.cred.credentialStatus(pid).stored).toBe(true);
    await call("migration/mapping", "POST", { query: `?project=${pid}&propose=auto` });
    expect(lib.cred.credentialStatus(pid)).toEqual({ stored: false });
    expect((await call("migration/sources", "GET", { query: `?project=${pid}` })).body).toHaveLength(1);
  });
});

describe("Exfiltration impossible", () => {
  it("base_url ou identifiant du corps refusés avec les identifiants confiés ; seule l'adresse déclarée sert", async () => {
    const pid = await newProject({ legacy_url: relatioUrl, credentials: { username: "migration", password: relPassword } });
    const evilUrl = `http://127.0.0.1:${evil.port}`;
    const q = `?project=${pid}`;
    const r1 = await call("migration/extract", "POST", { query: q, body: { plan: "test", base_url: evilUrl } });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/^base_url refusé/);
    expect((await call("migration/extract", "POST", { query: q, body: { plan: "test", username: "admin" } })).status).toBe(400);
    const plan = { ...(await import("@/lib/migration/fixtures")).CRM_FIXTURES.extraction_plan, base_url: evilUrl };
    expect((await call("migration/extract", "POST", { query: q, body: { plan } })).status).toBe(403); // plan libre : pas pour un client
    expect((await call("migration/extract", "POST", { query: q, body: { plan }, as: executor("jeu-de-test-X") })).status).toBe(403); // exécuteur sans mission
    // Équipe REBORN avec un plan qui vise une autre adresse : l'adresse DÉCLARÉE est imposée
    const op = await call("migration/extract", "POST", { query: q, body: { plan }, as: asUser(operator.cookie) });
    expect(op.status, op.text).toBe(200);
    expect(op.body.extraction.base_url).toBe(relatioUrl);
    expect(evil.hits).toEqual([]);
  });

  it("une URL avec identifiants est refusée sans être recopiée ; si elle se trouve déjà dans un projet, aucune connexion n'est tentée", async () => {
    const leaky = `http://alice:S3cret-Fuite@127.0.0.1:${evil.port}/`;
    const r = await call("projects", "POST", { body: { company: "Fuite", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: leaky } });
    expect(r.status).toBe(400);
    expect(r.text).not.toMatch(/alice|S3cret/);
    const pid = await newProject({ legacy_url: relatioUrl, credentials: { username: "migration", password: relPassword } });
    lib.project.updateProject(pid, (p) => {
      p.legacy_url = leaky; // écrite par un autre chemin que les routes de ce lot
    });
    const t = await call("projects/[id]/connection/test", "POST", { id: pid, body: { plan: "test" } });
    expect(t.status).toBe(409);
    expect(t.text).not.toMatch(/alice|S3cret/);
    const a = await call("projects/[id]/analysis", "POST", { id: pid, body: {} });
    expect(a.status).toBe(409);
    expect(a.text).not.toMatch(/alice|S3cret/);
    const x = await call("migration/extract", "POST", { query: `?project=${pid}`, body: { plan: "test" } });
    expect(x.status).toBe(409);
    expect(x.text).not.toMatch(/alice|S3cret/);
    expect(evil.hits).toEqual([]);
  });
});

/*
 * Bilan du fichier entier (lot C1) : le test C ci-dessus balaie le premier parcours ; ici, TOUS les mots de
 * passe confiés dans ce fichier sont recherchés dans TOUTES les réponses reçues (hors remise légitime au
 * service), tous les évènements, toute la console capturée et tous les fichiers des données et des clés.
 */
describe("C — bilan de tout le fichier : aucun mot de passe confié n'apparaît nulle part", () => {
  const CONFIDED = ["Mdp-Ancien-Logiciel-D-1", "Mdp-Coffre-X", "Mdp-Coffre-Y", "Mdp-Copie-A", "Mdp-Copie-B", "Mdp-Copie-B2", "Mdp-Etape-M", "Mdp-Illisible-A", "Mdp-Illisible-B", "Mdp-Orpheline", "Mdp-Remplace-1", "Mdp-Remplace-2", "Mdp-Suppression-E", "Mdp-TTL", "Mdp-V1-Ancien", "Mdp-V1-Recent", "p-long"];

  it("réponses, évènements, console et fichiers (données, base des comptes, clés) : aucun des mots de passe des tests ci-dessus", () => {
    lib.store.flushPersist();
    const all = [relPassword, ...CONFIDED];
    expect(responses.length).toBeGreaterThan(50); // témoin : le fichier a bien produit de nombreuses réponses
    expect(legitimateRedeems.length).toBeGreaterThanOrEqual(2); // témoin : les remises légitimes au service sont écartées, pas perdues
    const events = JSON.stringify(lib.store.getState().events);
    for (const s of [...all, "S3cret-Fuite"]) {
      expect(responses.filter((r) => r.includes(s)), `réponse contenant ${s.slice(0, 4)}…`).toEqual([]);
      expect(events.includes(s), `évènement contenant ${s.slice(0, 4)}…`).toBe(false);
      expect(consoleLines.filter((l) => l.includes(s)), `console contenant ${s.slice(0, 4)}…`).toEqual([]);
    }
    // « S3cret-Fuite » est volontairement écrit en clair dans un project.json par le test d'exfiltration : exclu
    // ici, et sert de témoin (le balayage des fichiers sait le trouver).
    expect(filesContaining("S3cret-Fuite", [env.dataDir]).map((f) => path.basename(f))).toContain("project.json");
    for (const s of all) expect(filesContaining(s, [env.dataDir, keysDir]), `fichier contenant ${s.slice(0, 4)}…`).toEqual([]);
    expect(fs.existsSync(path.join(env.dataDir, "auth.db"))).toBe(true);
  });
});
