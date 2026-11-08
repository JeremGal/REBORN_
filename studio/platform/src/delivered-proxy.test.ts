/**
 * Logiciel livré derrière son tunnel https (scripts/serve-public.mjs) : toutes les connexions arrivent de 127.0.0.1.
 * Lancé par le Studio avec TRUST_PROXY=1, son limiteur de tentatives compte par visiteur (DERNIÈRE adresse de
 * X-Forwarded-For, celle qu'ajoute le tunnel) : un visiteur qui se trompe 8 fois ne bloque que lui, et une adresse
 * qu'il ajoute devant ne lui sert à rien. Sans TRUST_PROXY, l'en-tête est ignoré. (Vrai runtime, dossier temporaire.)
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

const RUNTIME = path.resolve(import.meta.dirname, "../runtime");
const ADMIN = { username: "admin", password: `Essai-${randomBytes(6).toString("hex")}` };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-proxy-"));
const children: ChildProcess[] = [];

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

async function startDeliveredApp(id: string, extraEnv: Record<string, string>): Promise<string> {
  const { SYSTEM_DDL } = await import("@/lib/migration/model");
  const dir = path.join(tmp, id);
  copyDir(RUNTIME, dir);
  const port = await freePort();
  const spec = {
    spec_version: "1.1",
    app: { id, name: "Logiciel d'essai", tagline: "Essai du limiteur", currency: "EUR", locale: "fr-FR", generated_at: new Date().toISOString(), generator: "test", migration_run: "RUN_001", port },
    entities: [{ name: "fiches", label: "Fiches", label_singular: "Fiche", title_field: "nom", fields: [{ name: "nom", label: "Nom", type: "text", required: true, unique: false, accounting: false }], list_fields: ["nom"], search_fields: ["nom"], children: [], computed: [], aggregates: [] }],
    navigation: [{ entity: "fiches" }],
    dashboard: { cards: [{ label: "Fiches", entity: "fiches", kind: "count" }], breakdowns: [] },
    ddl: [`CREATE TABLE "fiches" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "nom" TEXT NOT NULL, "_source_key" TEXT UNIQUE, "_migrated" INTEGER NOT NULL DEFAULT 0, "_run_id" TEXT, "_created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), "_updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`, ...SYSTEM_DDL],
  };
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(spec));
  fs.mkdirSync(path.join(dir, ".secrets"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, ".secrets", "admin.json"), JSON.stringify(ADMIN), { mode: 0o600 });
  const child = spawn(process.execPath, ["--no-warnings", "server.mjs"], { cwd: dir, env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1", ...extraEnv } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let logs = "";
  child.stdout!.on("data", (b) => (logs += String(b)));
  child.stderr!.on("data", (b) => (logs += String(b)));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return url;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`logiciel d'essai injoignable :\n${logs}`);
}

/** Requête de connexion écrite à la main (lignes d'en-tête libres) ; `finish` envoie le corps plus tard. */
function rawLogin(port: number, extraHeaderLines: string[], password: string) {
  const body = JSON.stringify({ username: ADMIN.username, password });
  const s = net.connect(port, "127.0.0.1");
  let data = "";
  const done = new Promise<number>((resolve, reject) => {
    s.on("data", (b) => (data += String(b)));
    s.on("end", () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
    s.on("error", reject);
  });
  const head = ["POST /api/auth/login HTTP/1.1", `Host: 127.0.0.1:${port}`, `Origin: http://127.0.0.1:${port}`, "Content-Type: application/json", `Content-Length: ${Buffer.byteLength(body)}`, "Connection: close", ...extraHeaderLines, "", ""].join("\r\n");
  s.write(head);
  return { done, finish: () => s.end(body) };
}
const portOf = (url: string) => Number(new URL(url).port);

const login = async (url: string, password: string, xff?: string) =>
  (await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: url, ...(xff ? { "x-forwarded-for": xff } : {}) }, body: JSON.stringify({ username: ADMIN.username, password }) })).status;

afterAll(async () => {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    const exited = new Promise((r) => c.once("exit", r));
    c.kill("SIGTERM");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("limiteur de connexion du logiciel livré derrière un tunnel", () => {
  it("TRUST_PROXY=1 : 8 échecs d'un visiteur ne bloquent que lui ; une adresse ajoutée devant ne contourne rien", async () => {
    const url = await startDeliveredApp("proxy-oui", { TRUST_PROXY: "1" });
    for (let i = 0; i < 8; i++) expect(await login(url, "mauvais mot de passe", "198.51.100.7")).toBe(401);
    expect(await login(url, ADMIN.password, "198.51.100.7")).toBe(429);
    expect(await login(url, ADMIN.password, "203.0.113.50, 198.51.100.7")).toBe(429);
    // Un autre visiteur, et le Studio lui-même (connexion locale sans en-tête), entrent normalement
    expect(await login(url, ADMIN.password, "198.51.100.8")).toBe(200);
    expect(await login(url, ADMIN.password)).toBe(200);
  }, 30000);

  it("1000 lignes d'en-tête de remplissage : l'adresse ajoutée en dernier par le tunnel compte toujours", async () => {
    const url = await startDeliveredApp("proxy-remplissage", { TRUST_PROXY: "1" });
    const filler = Array.from({ length: 1000 }, () => "A: b");
    for (let i = 0; i < 8; i++) {
      const r = rawLogin(portOf(url), [`X-Forwarded-For: 203.0.113.${i + 1}`, ...filler, "X-Forwarded-For: 198.51.100.44"], "mauvais mot de passe");
      r.finish();
      expect(await r.done).toBe(401);
    }
    expect(await login(url, ADMIN.password, "198.51.100.44")).toBe(429);
  }, 30000);

  it("essais envoyés en même temps : 8 au plus sont vérifiés, les suivants sont bloqués", async () => {
    const url = await startDeliveredApp("proxy-simultane", { TRUST_PROXY: "1" });
    const reqs = Array.from({ length: 12 }, () => rawLogin(portOf(url), ["X-Forwarded-For: 198.51.100.33"], "mauvais mot de passe"));
    await new Promise((r) => setTimeout(r, 300)); // en-têtes reçus et requêtes ouvertes côté logiciel avant les corps
    for (const r of reqs) r.finish();
    const statuses = await Promise.all(reqs.map((r) => r.done));
    expect(statuses.every((s) => s === 401 || s === 429)).toBe(true);
    expect(statuses.filter((s) => s === 401).length).toBe(8);
  }, 30000);

  it("compte visé : 30 échecs, chacun sous une adresse différente, le bloquent quand même", async () => {
    const url = await startDeliveredApp("proxy-compte", { TRUST_PROXY: "1" });
    for (let i = 0; i < 30; i++) expect(await login(url, "mauvais mot de passe", `198.51.100.${i + 1}`)).toBe(401);
    expect(await login(url, ADMIN.password, "198.51.100.250")).toBe(429);
  }, 60000);

  it("sans TRUST_PROXY : l'en-tête est ignoré, l'adresse de la connexion compte", async () => {
    const url = await startDeliveredApp("proxy-non", {});
    for (let i = 0; i < 8; i++) expect(await login(url, "mauvais mot de passe", `198.51.100.${i + 1}`)).toBe(401);
    expect(await login(url, ADMIN.password, "198.51.100.200")).toBe(429);
  }, 30000);
});
