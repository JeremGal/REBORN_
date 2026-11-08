/**
 * Accès au logiciel livré par invitation (conception A, phase 1), sans simulation : un vrai logiciel
 * livré (runtime générique) est démarré dans un dossier temporaire ; l'invitation est déposée par la
 * fonction du Studio, activée par HTTP avec un mot de passe choisi, puis utilisée pour se connecter.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SYSTEM_DDL } from "./model";

const RUNTIME = path.resolve(import.meta.dirname, "../../../runtime");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-access-"));
const APP_ID = "registre-test";
const dir = path.join(tmp, "generated", APP_ID);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const mode = (p: string) => fs.statSync(p).mode & 0o777;
/** Mots de passe fictifs générés pour le test (jamais réutilisés ailleurs). */
const LEGACY = { username: "migration", password: `Ancien-${randomBytes(6).toString("hex")}` };
const ALICE_PW = `phrase de passe ${randomBytes(4).toString("hex")}`;
const ALICE_PW2 = `nouvelle phrase ${randomBytes(4).toString("hex")}`;
const ADMIN_PW = randomBytes(12).toString("base64url");

let port = 0;
let url = "";
let child: ChildProcess | null = null;
let logs = "";
let access: typeof import("./app-access");
let aliceToken = "";
let aliceCookie = "";
let adminCookie = "";
const seen: string[] = [];

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
/** Environnement réduit, comme startApp() du Studio : aucune variable du test n'atteint le logiciel livré. */
const envOf = (extra: Record<string, string>) => ({ PATH: process.env.PATH ?? "", ...extra }) as unknown as NodeJS.ProcessEnv;
async function start() {
  const proc = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: dir, env: envOf({ PORT: String(port), HOST: "127.0.0.1" }), stdio: ["ignore", "pipe", "pipe"] });
  child = proc;
  proc.stdout.on("data", (b) => (logs += String(b)));
  proc.stderr.on("data", (b) => (logs += String(b)));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`logiciel injoignable :\n${logs}`);
}
async function call(method: string, p: string, body?: unknown, cookie = "") {
  const r = await fetch(url + p, { method, headers: { "content-type": "application/json", origin: url, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  seen.push(text);
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, body: json as Record<string, unknown> & Record<string, unknown>[], cookie: r.headers.getSetCookie()[0]?.split(";")[0] ?? "", setCookie: r.headers.getSetCookie() };
}
const tokenOf = (link: string) => /#\/activation\/([A-Za-z0-9_-]{43})$/.exec(link)![1];
const login = (username: string, password: string) => call("POST", "/api/auth/login", { username, password });
function appDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path.join(dir, "data", "app.db"));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  process.env.REBORN_DATA_DIR = path.join(tmp, "studio");
  process.env.REBORN_APPS_DIR = path.join(tmp, "generated");
  port = await freePort();
  url = `http://127.0.0.1:${port}`;
  copyDir(RUNTIME, dir);
  const spec = {
    spec_version: "1.1",
    app: { id: APP_ID, name: "Registre de test", tagline: "Logiciel de test", currency: "EUR", locale: "fr-FR", generated_at: new Date().toISOString(), generator: "test", migration_run: "RUN_TEST", port, branding: { name: "Atelier Test", primary_color: "#2d6a4f", logo_text: "AT" } },
    entities: [{ name: "fiches", label: "Fiches", label_singular: "Fiche", title_field: "nom", fields: [{ name: "nom", label: "Nom", type: "text", required: true, unique: false, accounting: false }], list_fields: ["nom"], search_fields: ["nom"], children: [], computed: [], aggregates: [] }],
    navigation: [{ entity: "fiches" }],
    dashboard: { cards: [{ label: "Fiches", entity: "fiches", kind: "count" }], breakdowns: [] },
    // Schéma système du Studio (table _users d'origine, sans les colonnes d'accès) : le runtime doit les ajouter
    ddl: [`CREATE TABLE "fiches" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "nom" TEXT NOT NULL, "_source_key" TEXT UNIQUE, "_migrated" INTEGER NOT NULL DEFAULT 0, "_run_id" TEXT, "_created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), "_updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`, ...SYSTEM_DDL],
  };
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(spec));
  fs.mkdirSync(path.join(dir, ".secrets"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, ".secrets", "admin.json"), JSON.stringify({ username: "admin", password: ADMIN_PW }), { mode: 0o600 });
  access = await import("./app-access");
}, 30000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child!.once("exit", r));
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Accès au logiciel livré par invitation", () => {
  it("dépose l'invitation sans le jeton (0700/0600, écriture atomique), logiciel arrêté", () => {
    const out = access.issueAppInvite(APP_ID, { email: "  Alice.Martin@Example.FR ", role: "editor", by: "Jeanne Durand (REBORN Studio)" });
    expect(out.link).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/#/activation/[A-Za-z0-9_-]{43}$`));
    const hours = (Date.parse(out.expires_at) - Date.now()) / 3600e3;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThanOrEqual(72);
    aliceToken = tokenOf(out.link);
    const inv = path.join(dir, ".secrets", "invites");
    expect(mode(path.join(dir, ".secrets"))).toBe(0o700);
    expect(mode(inv)).toBe(0o700);
    const files = fs.readdirSync(inv);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
    expect(mode(path.join(inv, files[0]))).toBe(0o600);
    const raw = fs.readFileSync(path.join(inv, files[0]), "utf8");
    expect(raw).not.toContain(aliceToken);
    const rec = JSON.parse(raw);
    expect(Object.keys(rec).sort()).toEqual(["created_at", "created_by", "email", "expires_at", "role", "token_sha256", "v"]);
    expect(rec).toMatchObject({ v: 1, email: "alice.martin@example.fr", role: "editor", token_sha256: sha(aliceToken), expires_at: out.expires_at });
    // Contrôles de l'appelant : jamais plus de 7 jours, rôle et adresse valides, logiciel existant
    expect(() => access.issueAppInvite(APP_ID, { email: "x@example.fr", role: "editor", by: "t", ttlHours: 169 })).toThrow(/Validité/);
    expect(() => access.issueAppInvite(APP_ID, { email: "pas-une-adresse", role: "editor", by: "t" })).toThrow(/e-mail/);
    expect(() => access.issueAppInvite(APP_ID, { email: "x@example.fr", role: "root" as "admin", by: "t" })).toThrow(/Rôle/);
    expect(() => access.issueAppInvite("inconnu", { email: "x@example.fr", role: "editor", by: "t" })).toThrow(/non généré/);
    expect(() => access.issueAppInvite("../evasion", { email: "x@example.fr", role: "editor", by: "t" })).toThrow(/invalide/);
    expect(fs.readdirSync(inv)).toHaveLength(1);
  });

  it("importe l'invitation au démarrage et ajoute les colonnes d'accès à une base existante", async () => {
    await start();
    // Le fichier reste tant que l'invitation est ouverte (réimport possible si la base est remplacée)
    expect(fs.readdirSync(path.join(dir, ".secrets", "invites")).filter((f) => f.endsWith(".json"))).toHaveLength(1);
    const cols = appDb((db) => (db.prepare(`PRAGMA table_info("_users")`).all() as { name: string }[]).map((c) => c.name));
    expect(cols).toEqual(expect.arrayContaining(["email", "session_epoch", "password_changed_at"]));
    const row = appDb((db) => db.prepare(`SELECT * FROM "_invites"`).get() as Record<string, unknown>);
    expect(row).toMatchObject({ email: "alice.martin@example.fr", role: "editor", token_sha256: sha(aliceToken), consumed_at: null, revoked_at: null });
    expect(JSON.stringify(row)).not.toContain(aliceToken);
  });

  it("l'ancien mot de passe d'un autre système ne donne aucun accès", async () => {
    expect((await login(LEGACY.username, LEGACY.password)).status).toBe(401);
    expect((await login("alice.martin@example.fr", LEGACY.password)).status).toBe(401);
    // Avant activation, l'adresse invitée n'a aucun mot de passe : rien ne permet d'entrer
    expect((await login("alice.martin@example.fr", ALICE_PW)).status).toBe(401);
    expect((await call("GET", "/api/e/fiches")).status).toBe(401);
  });

  it("active l'accès avec un mot de passe choisi, puis permet de se connecter", async () => {
    const info = await call("POST", "/api/auth/invitation", { token: aliceToken });
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ email: "alice.martin@example.fr", role: "editor", existing_account: false, password_min: 12 });
    const short = await call("POST", "/api/auth/activate", { token: aliceToken, password: "court-11car" });
    expect(short.status).toBe(400);
    expect(short.body.details).toEqual({ field: "password" });
    const act = await call("POST", "/api/auth/activate", { token: aliceToken, password: ALICE_PW });
    expect(act.status).toBe(200);
    expect(act.body).toMatchObject({ ok: true, user: "alice.martin@example.fr", role: "editor" });
    // Cookie propre à ce logiciel (pas de collision entre logiciels livrés sur la même machine)
    expect(act.setCookie).toHaveLength(1);
    expect(act.setCookie[0]).toMatch(/^app_[a-f0-9]{10}_sid=[a-f0-9]{48}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/);
    const me = await call("GET", "/api/auth/me", undefined, act.cookie);
    expect(me.body).toMatchObject({ user: "alice.martin@example.fr", role: "editor", email: "alice.martin@example.fr" });
    expect((await call("POST", "/api/e/fiches", { nom: "Première fiche" }, act.cookie)).status).toBe(201);
    const ok = await login("ALICE.Martin@example.fr", ALICE_PW);
    expect(ok.status).toBe(200);
    aliceCookie = ok.cookie;
    expect((await login("alice.martin@example.fr", LEGACY.password)).status).toBe(401);
    const stored = appDb((db) => db.prepare(`SELECT "password_hash" FROM "_users" WHERE "username" = ?`).get("alice.martin@example.fr") as { password_hash: string });
    expect(stored.password_hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
    expect(stored.password_hash).not.toContain(ALICE_PW);
  });

  it("refuse un jeton déjà utilisé", async () => {
    const again = await call("POST", "/api/auth/activate", { token: aliceToken, password: "un autre mot de passe" });
    expect(again.status).toBe(410);
    expect(again.cookie).toBe("");
    expect((await call("POST", "/api/auth/invitation", { token: aliceToken })).status).toBe(410);
    expect((await login("alice.martin@example.fr", "un autre mot de passe")).status).toBe(401);
    expect((await login("alice.martin@example.fr", ALICE_PW)).status).toBe(200);
    // Même sans le registre des empreintes (fichier perdu), l'usage unique tient par la base (transaction)
    const ledger = path.join(dir, ".secrets", "invitations-closes.txt");
    const saved = fs.readFileSync(ledger, "utf8");
    fs.rmSync(ledger);
    expect((await call("POST", "/api/auth/activate", { token: aliceToken, password: "un autre mot de passe" })).status).toBe(410);
    fs.writeFileSync(ledger, saved, { mode: 0o600 });
  });

  it("refuse un jeton expiré (à l'usage) et ignore une invitation déposée déjà expirée", async () => {
    const admin = await login("admin", ADMIN_PW);
    expect(admin.status).toBe(200);
    adminCookie = admin.cookie;
    const bob = tokenOf(access.issueAppInvite(APP_ID, { email: "bob@example.fr", role: "viewer", by: "Studio", ttlHours: 1 }).link);
    // Import par l'écran d'administration (le logiciel tourne : il relit le dossier des invitations)
    const pending = (await call("GET", "/api/admin/invitations", undefined, adminCookie)).body as unknown as { email: string; state: string }[];
    expect(pending.find((i) => i.email === "bob@example.fr")?.state).toBe("pending");
    appDb((db) => db.prepare(`UPDATE "_invites" SET "expires_at" = ? WHERE "email" = ?`).run(new Date(Date.now() - 1000).toISOString(), "bob@example.fr"));
    expect((await call("POST", "/api/auth/activate", { token: bob, password: "mot de passe de bob" })).status).toBe(410);
    expect((await login("bob@example.fr", "mot de passe de bob")).status).toBe(401);
    // Fichier déposé avec une échéance passée (ou supérieure à 7 jours) : ignoré et supprimé
    const old = randomBytes(32).toString("base64url");
    const now = Date.now();
    fs.writeFileSync(path.join(dir, ".secrets", "invites", "perime.json"), JSON.stringify({ v: 1, token_sha256: sha(old), email: "carl@example.fr", role: "admin", created_by: "test", created_at: new Date(now - 80 * 3600e3).toISOString(), expires_at: new Date(now - 8 * 3600e3).toISOString() }));
    const far = randomBytes(32).toString("base64url");
    fs.writeFileSync(path.join(dir, ".secrets", "invites", "trop-long.json"), JSON.stringify({ v: 1, token_sha256: sha(far), email: "carl@example.fr", role: "admin", created_by: "test", created_at: new Date(now).toISOString(), expires_at: new Date(now + 8 * 24 * 3600e3).toISOString() }));
    fs.writeFileSync(path.join(dir, ".secrets", "invites", "en-cours.json.tmp"), "{");
    expect((await call("POST", "/api/auth/activate", { token: old, password: "mot de passe de carl" })).status).toBe(410);
    expect((await call("POST", "/api/auth/activate", { token: far, password: "mot de passe de carl" })).status).toBe(410);
    // Restent : l'invitation de bob (encore valable d'après son fichier) et le fichier en cours d'écriture ;
    // celle d'alice (utilisée) et les fichiers refusés ont été supprimés
    const left = fs.readdirSync(path.join(dir, ".secrets", "invites")).sort();
    expect(left).toHaveLength(2);
    expect(left).toContain("en-cours.json.tmp");
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".secrets", "invites", left.find((f) => f.endsWith(".json"))!), "utf8")).email).toBe("bob@example.fr");
    fs.rmSync(path.join(dir, ".secrets", "invites", "en-cours.json.tmp"));
    expect(appDb((db) => db.prepare(`SELECT COUNT(*) AS n FROM "_invites" WHERE "email" = 'carl@example.fr'`).get() as { n: number }).n).toBe(0);
  });

  it("révoque immédiatement les sessions d'un compte désactivé et protège le dernier administrateur", async () => {
    const users = (await call("GET", "/api/admin/users", undefined, adminCookie)).body as unknown as { id: number; username: string; me: boolean }[];
    const alice = users.find((u) => u.username === "alice.martin@example.fr")!;
    const admin = users.find((u) => u.me)!;
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).status).toBe(200);
    expect((await call("PUT", `/api/admin/users/${alice.id}`, { disabled: true }, adminCookie)).status).toBe(200);
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).status).toBe(401);
    expect((await login("alice.martin@example.fr", ALICE_PW)).status).toBe(401);
    expect((await call("PUT", `/api/admin/users/${alice.id}`, { disabled: false }, adminCookie)).status).toBe(200);
    // Une session fermée par la désactivation ne revient pas avec la réactivation
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).status).toBe(401);
    const back = await login("alice.martin@example.fr", ALICE_PW);
    expect(back.status).toBe(200);
    aliceCookie = back.cookie;
    // Changement de rôle : appliqué dès la requête suivante, sans reconnexion
    expect((await call("PUT", `/api/admin/users/${alice.id}`, { role: "viewer" }, adminCookie)).status).toBe(200);
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).body).toMatchObject({ role: "viewer" });
    expect((await call("POST", "/api/e/fiches", { nom: "Refusée" }, aliceCookie)).status).toBe(403);
    expect((await call("PUT", `/api/admin/users/${alice.id}`, { role: "editor" }, adminCookie)).status).toBe(200);
    // Compte désactivé hors de l'écran (autre outil, restauration) : la session tombe aussi à la requête suivante
    appDb((db) => db.prepare(`UPDATE "_users" SET "disabled" = 1 WHERE "id" = ?`).run(alice.id));
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).status).toBe(401);
    appDb((db) => db.prepare(`UPDATE "_users" SET "disabled" = 0 WHERE "id" = ?`).run(alice.id));
    aliceCookie = (await login("alice.martin@example.fr", ALICE_PW)).cookie;
    // Jamais sans administrateur actif ; jamais sa propre désactivation
    expect((await call("PUT", `/api/admin/users/${admin.id}`, { role: "editor" }, adminCookie)).status).toBe(409);
    expect((await call("PUT", `/api/admin/users/${admin.id}`, { disabled: true }, adminCookie)).status).toBe(409);
    expect((await call("GET", "/api/admin/users", undefined, aliceCookie)).status).toBe(403);
  });

  it("« Mon mot de passe » : 12 caractères minimum, autres sessions fermées, session courante rouverte", async () => {
    const other = (await login("alice.martin@example.fr", ALICE_PW)).cookie;
    expect((await call("POST", "/api/auth/password", { current: "faux mot de passe", next: ALICE_PW2 }, aliceCookie)).body).toMatchObject({ details: { field: "current" } });
    const short = await call("POST", "/api/auth/password", { current: ALICE_PW, next: "trop-court1" }, aliceCookie);
    expect(short.status).toBe(400);
    expect(short.body.details).toEqual({ field: "next" });
    const ok = await call("POST", "/api/auth/password", { current: ALICE_PW, next: ALICE_PW2 }, aliceCookie);
    expect(ok.status).toBe(200);
    expect(ok.cookie).toMatch(/^app_[a-f0-9]{10}_sid=[a-f0-9]{48}$/);
    expect(ok.cookie).not.toBe(aliceCookie);
    expect((await call("GET", "/api/auth/me", undefined, other)).status).toBe(401);
    expect((await call("GET", "/api/auth/me", undefined, aliceCookie)).status).toBe(401);
    expect((await call("GET", "/api/auth/me", undefined, ok.cookie)).status).toBe(200);
    expect((await login("alice.martin@example.fr", ALICE_PW)).status).toBe(401);
    expect((await login("alice.martin@example.fr", ALICE_PW2)).status).toBe(200);
  });

  it("administration : invitation créée dans le logiciel (lien montré une fois), puis révoquée", async () => {
    const created = await call("POST", "/api/admin/invitations", { email: "Dora@Example.fr", role: "viewer", hours: 24 }, adminCookie);
    expect(created.status).toBe(201);
    const token = /^\/#\/activation\/([A-Za-z0-9_-]{43})$/.exec(String(created.body.path))![1];
    const list = (await call("GET", "/api/admin/invitations", undefined, adminCookie)).body as unknown as { id: number; email: string; state: string }[];
    expect(JSON.stringify(list)).not.toContain(token);
    const dora = list.find((i) => i.email === "dora@example.fr")!;
    expect(dora.state).toBe("pending");
    expect((await call("POST", `/api/admin/invitations/${dora.id}/revoke`, undefined, adminCookie)).status).toBe(200);
    expect((await call("POST", "/api/auth/activate", { token, password: "mot de passe de dora" })).status).toBe(410);
    // Une nouvelle invitation pour la même adresse remplace la précédente encore ouverte
    const t1 = /([A-Za-z0-9_-]{43})$/.exec(String((await call("POST", "/api/admin/invitations", { email: "dora@example.fr", role: "viewer" }, adminCookie)).body.path))![1];
    const t2 = /([A-Za-z0-9_-]{43})$/.exec(String((await call("POST", "/api/admin/invitations", { email: "dora@example.fr", role: "viewer" }, adminCookie)).body.path))![1];
    expect((await call("POST", "/api/auth/activate", { token: t1, password: "mot de passe de dora" })).status).toBe(410);
    expect((await call("POST", "/api/auth/activate", { token: t2, password: "mot de passe de dora" })).status).toBe(200);
    // Écritures d'une autre origine refusées, y compris l'activation
    const csrf = await fetch(`${url}/api/admin/invitations`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", cookie: adminCookie }, body: JSON.stringify({ email: "x@example.fr", role: "admin" }) });
    expect(csrf.status).toBe(403);
  });

  it("accès de secours : « node server.mjs invite » écrit le lien dans .secrets (0600) sans l'afficher", async () => {
    const out = spawnSync(process.execPath, ["--no-warnings", "server.mjs", "invite", "erin@example.fr", "viewer"], { cwd: dir, env: envOf({ PORT: String(port) }), encoding: "utf8" });
    expect(out.status).toBe(0);
    const file = path.join(dir, ".secrets", "lien-activation.txt");
    expect(mode(file)).toBe(0o600);
    const token = /#\/activation\/([A-Za-z0-9_-]{43})/.exec(fs.readFileSync(file, "utf8"))![1];
    expect(fs.readFileSync(file, "utf8")).toContain(`http://127.0.0.1:${port}/#/activation/${token}`);
    expect(out.stdout + out.stderr).not.toContain(token);
    expect(out.stdout).toContain("lien-activation.txt");
    expect(spawnSync(process.execPath, ["--no-warnings", "server.mjs", "invite", "pas-une-adresse"], { cwd: dir, env: envOf({}), encoding: "utf8" }).status).toBe(2);
    const act = await call("POST", "/api/auth/activate", { token, password: "mot de passe d'erin" });
    expect(act.status).toBe(200);
    expect(act.body).toMatchObject({ role: "viewer" });
    expect(fs.existsSync(file)).toBe(false);
  });

  it("remplacement de la base : une invitation utilisée ne rouvre pas, une invitation ouverte est conservée", async () => {
    const before = await call("POST", "/api/admin/backups", undefined, adminCookie);
    expect(before.status).toBe(200);
    const fred = tokenOf(access.issueAppInvite(APP_ID, { email: "fred@example.fr", role: "editor", by: "Studio" }).link);
    const gina = tokenOf(access.issueAppInvite(APP_ID, { email: "gina@example.fr", role: "viewer", by: "Studio" }).link);
    expect((await call("GET", "/api/admin/invitations", undefined, adminCookie)).status).toBe(200);
    const withOpen = await call("POST", "/api/admin/backups", undefined, adminCookie);
    expect((await call("POST", "/api/auth/activate", { token: fred, password: "mot de passe de fred" })).status).toBe(200);
    // Cette sauvegarde contient l'invitation de fred encore ouverte, mais son empreinte est notée hors de la base
    expect((await call("POST", `/api/admin/backups/${withOpen.body.name}/restore`, undefined, adminCookie)).status).toBe(200);
    expect(appDb((db) => db.prepare(`SELECT "consumed_at" FROM "_invites" WHERE "email" = 'fred@example.fr'`).get() as { consumed_at: string | null }).consumed_at).toBeNull();
    expect((await call("POST", "/api/auth/activate", { token: fred, password: "un autre mot de passe" })).status).toBe(410);
    expect(mode(path.join(dir, ".secrets", "invitations-closes.txt"))).toBe(0o600);
    expect(fs.readFileSync(path.join(dir, ".secrets", "invitations-closes.txt"), "utf8")).toContain(sha(fred));
    // Base antérieure aux deux invitations : celle de gina, encore ouverte, est réimportée depuis son fichier
    expect((await call("POST", `/api/admin/backups/${before.body.name}/restore`, undefined, adminCookie)).status).toBe(200);
    expect((await call("POST", "/api/auth/activate", { token: fred, password: "un autre mot de passe" })).status).toBe(410);
    expect((await call("POST", "/api/auth/activate", { token: gina, password: "mot de passe de gina" })).status).toBe(200);
    expect(fs.readdirSync(path.join(dir, ".secrets", "invites")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, ".secrets", "invites", f), "utf8")).email)).not.toContain("fred@example.fr");
  });

  it("aucun jeton ni mot de passe dans les réponses, le journal d'audit, les journaux du processus ou la base", async () => {
    const audit = await call("GET", "/api/admin/audit?limit=500", undefined, adminCookie);
    expect((audit.body as unknown as { action: string }[]).map((a) => a.action)).toEqual(expect.arrayContaining(["invite_imported", "invite_created", "invite_revoked", "user_activated", "user_updated", "password_changed"]));
    const db = fs.readFileSync(path.join(dir, "data", "app.db"));
    for (const secret of [aliceToken, ALICE_PW, ALICE_PW2, ADMIN_PW, LEGACY.password]) {
      expect(JSON.stringify(audit.body)).not.toContain(secret);
      expect(logs).not.toContain(secret);
      expect(db.includes(Buffer.from(secret))).toBe(false);
    }
    for (const body of seen) for (const secret of [ALICE_PW, ALICE_PW2, ADMIN_PW, LEGACY.password]) expect(body).not.toContain(secret);
  });

  // En dernier : le blocage dure 5 minutes pour cette adresse
  it("limite les essais de jetons au hasard (8 jetons inconnus → blocage temporaire)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await call("POST", "/api/auth/activate", { token: randomBytes(32).toString("base64url"), password: "peu importe ici" })).status);
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(410));
    expect(statuses[8]).toBe(429);
    const valid = tokenOf(access.issueAppInvite(APP_ID, { email: "hugo@example.fr", role: "viewer", by: "Studio" }).link);
    expect((await call("POST", "/api/auth/activate", { token: valid, password: "mot de passe de hugo" })).status).toBe(429);
  });
});
