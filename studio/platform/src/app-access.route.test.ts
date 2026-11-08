/**
 * « Créer mon accès au logiciel » (POST /api/migration/app/access), sous une vraie session client :
 * lien d'activation à usage unique obtenu par le propriétaire seulement, jamais conservé ni journalisé
 * par le Studio, puis activé dans un VRAI logiciel livré (runtime générique démarré dans un dossier
 * temporaire) avec un mot de passe choisi ; ni le mot de passe du Studio ni celui de l'ancien logiciel
 * n'y donnent accès.
 *
 * Mise en place : la mise en service elle-même (génération à partir d'une migration) est couverte par
 * la chaîne réelle (migration.chain.test.ts) ; ici, le dossier du logiciel livré est préparé à partir
 * du runtime du dépôt et la mise en service est enregistrée dans le projet de test (recordDeployment).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { asService, asUser, callRoute, cleanupAuthEnv, ORIGIN, setupAuthEnv, signUp, type RouteHandler, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const RUNTIME = path.resolve(import.meta.dirname, "../runtime");
const APP_ID = "acces-test";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const LEGACY = { username: "migration", password: `Ancien-${randomBytes(6).toString("hex")}` };
const CHOSEN = `ma phrase de passe ${randomBytes(4).toString("hex")}`;

const mods: Record<string, Mod> = {};
let owner: TestUser;
let other: TestUser;
let pid = "";
let appsDir = "";
let appDir = "";
let port = 0;
let appUrl = "";
let child: ChildProcess | null = null;
let appLogs = "";
let link = "";
let token = "";
const studioOutput: string[] = [];

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(src, e.name), path.join(dest, e.name));
    else fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
  }
}
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const access = (headers: Record<string, string>) => callRoute(mods.access, "POST", `/api/migration/app/access?project=${pid}`, { body: {}, headers });
const tokenOf = (l: string) => /#\/activation\/([A-Za-z0-9_-]{43})$/.exec(l)![1];

async function app(method: string, p: string, body?: unknown) {
  const r = await fetch(appUrl + p, { method, headers: { "content-type": "application/json", origin: appUrl }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
async function startApp() {
  const proc = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: appDir, env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1" } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  child = proc;
  proc.stdout.on("data", (b) => (appLogs += String(b)));
  proc.stderr.on("data", (b) => (appLogs += String(b)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${appUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`logiciel livré injoignable :\n${appLogs}`);
}

beforeAll(async () => {
  const env = setupAuthEnv("reborn-app-access-");
  appsDir = path.join(env.dataDir, "generated");
  process.env.REBORN_APPS_DIR = appsDir;
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      studioOutput.push(args.map(String).join(" "));
    });
  }
  mods.projects = (await import("@/app/api/projects/route")) as unknown as Mod;
  mods.access = (await import("@/app/api/migration/app/access/route")) as unknown as Mod;
  owner = await signUp({ firstName: "Camille", lastName: "Martin" });
  other = await signUp({ firstName: "Autre", lastName: "Client" });
  const created = await callRoute(mods.projects, "POST", "/api/projects", {
    body: { company: "Atelier Martin", software: "Ancien logiciel", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: LEGACY.username, password: LEGACY.password }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version },
    headers: asUser(owner.cookie),
  });
  expect(created.status).toBe(201);
  pid = created.body.project.id;
}, 30000);

afterAll(async () => {
  vi.restoreAllMocks();
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child!.once("exit", r));
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  await cleanupAuthEnv();
});

describe("Accès du propriétaire au logiciel livré", () => {
  it("refuse tant qu'aucun logiciel n'est en service", async () => {
    const r = await access(asUser(owner.cookie));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Aucun logiciel livré en service/);
  });

  it("crée un lien d'activation à usage unique pour l'adresse du compte (renvoyé une seule fois, sans cache)", async () => {
    // Dossier du logiciel livré (runtime du dépôt) et mise en service enregistrée dans le projet de test
    port = await freePort();
    appUrl = `http://127.0.0.1:${port}`;
    appDir = path.join(appsDir, APP_ID);
    copyDir(RUNTIME, appDir);
    const { SYSTEM_DDL } = await import("@/lib/migration/model");
    const spec = {
      spec_version: "1.1",
      app: { id: APP_ID, name: "Logiciel de l'Atelier", tagline: "Test d'accès", currency: "EUR", locale: "fr-FR", generated_at: new Date().toISOString(), generator: "test", migration_run: "RUN_001", port },
      entities: [{ name: "fiches", label: "Fiches", label_singular: "Fiche", title_field: "nom", fields: [{ name: "nom", label: "Nom", type: "text", required: true, unique: false, accounting: false }], list_fields: ["nom"], search_fields: ["nom"], children: [], computed: [], aggregates: [] }],
      navigation: [{ entity: "fiches" }],
      dashboard: { cards: [{ label: "Fiches", entity: "fiches", kind: "count" }], breakdowns: [] },
      ddl: [`CREATE TABLE "fiches" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "nom" TEXT NOT NULL, "_source_key" TEXT UNIQUE, "_migrated" INTEGER NOT NULL DEFAULT 0, "_run_id" TEXT, "_created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), "_updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`, ...SYSTEM_DDL],
    };
    fs.writeFileSync(path.join(appDir, "app.json"), JSON.stringify(spec));
    fs.mkdirSync(path.join(appDir, ".secrets"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(appDir, ".secrets", "admin.json"), JSON.stringify({ username: "admin", password: randomBytes(12).toString("base64url") }), { mode: 0o600 });
    const { projectScope } = await import("@/lib/migration/context");
    const { recordDeployment } = await import("@/lib/migration/project");
    projectScope.run(pid, () => recordDeployment({ id: "DEP_test0001", at: new Date().toISOString(), by: "Camille Martin", run_id: "RUN_001", app_dir: `generated/${APP_ID}`, backup: null, status: "active" }, { id: APP_ID, port }));

    const r = await access(asUser(owner.cookie));
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.body).toMatchObject({ ok: true, email: owner.email, role: "admin", app_id: APP_ID });
    link = r.body.link;
    expect(link).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/#/activation/[A-Za-z0-9_-]{43}$`));
    token = tokenOf(link);
    const hours = (Date.parse(r.body.expires_at) - Date.now()) / 3600e3;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);
    const invites = path.join(appDir, ".secrets", "invites");
    const files = fs.readdirSync(invites).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);
    expect(fs.statSync(path.join(invites, files[0])).mode & 0o777).toBe(0o600);
    const rec = JSON.parse(fs.readFileSync(path.join(invites, files[0]), "utf8"));
    expect(rec).toMatchObject({ v: 1, token_sha256: sha(token), email: owner.email, role: "admin", created_by: "Camille Martin (REBORN Studio)" });
  });

  it("le lien n'est ni conservé ni journalisé par le Studio (fichiers, évènements, sorties)", async () => {
    for (const f of filesUnder(process.env.REBORN_DATA_DIR!)) {
      const content = fs.readFileSync(f);
      expect(content.includes(token), path.relative(process.env.REBORN_DATA_DIR!, f)).toBe(false);
    }
    // Tous les évènements du Studio (sans filtre de visibilité) : le fait est tracé, jamais le lien
    const { getState } = await import("@/lib/store");
    const dump = JSON.stringify(getState().events);
    expect(dump).not.toContain(token);
    expect(dump).toContain("Accès au logiciel livré préparé pour Camille Martin");
    expect(studioOutput.join("\n")).not.toContain(token);
  });

  it("réservé au propriétaire : autre client 404, anonyme 401, agents 403, sans Origin 403", async () => {
    const before = fs.readdirSync(path.join(appDir, ".secrets", "invites")).length;
    expect((await access(asUser(other.cookie))).status).toBe(404);
    expect((await access({ origin: ORIGIN })).status).toBe(401);
    for (const s of ["explorer", "analyst", "all"] as const) expect((await access(asService(s))).status).toBe(403);
    expect((await access({ cookie: owner.cookie })).status).toBe(403);
    expect((await callRoute(mods.access, "POST", "/api/migration/app/access", { body: {}, headers: asUser(owner.cookie) })).status).toBe(400);
    expect(fs.readdirSync(path.join(appDir, ".secrets", "invites")).length).toBe(before);
  });

  it("dans le logiciel livré : activation avec un mot de passe choisi, puis connexion ; les autres mots de passe n'y servent à rien", async () => {
    await startApp();
    const info = await app("POST", "/api/auth/invitation", { token });
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ email: owner.email, role: "admin", existing_account: false });
    // Avant activation : ni le mot de passe du Studio, ni celui de l'ancien logiciel
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: owner.password })).status).toBe(401);
    const act = await app("POST", "/api/auth/activate", { token, password: CHOSEN });
    expect(act.status).toBe(200);
    expect(act.body).toMatchObject({ ok: true, user: owner.email, role: "admin" });
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: CHOSEN })).status).toBe(200);
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: owner.password })).status).toBe(401);
    expect((await app("POST", "/api/auth/login", { username: LEGACY.username, password: LEGACY.password })).status).toBe(401);
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: LEGACY.password })).status).toBe(401);
    // Usage unique
    expect((await app("POST", "/api/auth/activate", { token, password: "une autre phrase de passe" })).status).toBe(410);
    expect(appLogs).not.toContain(token);
    expect(appLogs).not.toContain(CHOSEN);
  });

  it("un nouveau lien permet de choisir un nouveau mot de passe ; l'ancien lien reste inutilisable", async () => {
    const r = await access(asUser(owner.cookie));
    expect(r.status).toBe(201);
    const next = tokenOf(r.body.link);
    expect(next).not.toBe(token);
    expect((await app("POST", "/api/auth/invitation", { token })).status).toBe(410);
    const info = await app("POST", "/api/auth/invitation", { token: next });
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ email: owner.email, existing_account: true });
    const renewed = `nouvelle phrase ${randomBytes(4).toString("hex")}`;
    expect((await app("POST", "/api/auth/activate", { token: next, password: renewed })).status).toBe(200);
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: renewed })).status).toBe(200);
    expect((await app("POST", "/api/auth/login", { username: owner.email, password: CHOSEN })).status).toBe(401);
  });
});
