// « Identifiant et mot de passe » du logiciel livré : invitation créée puis activée aussitôt dans le logiciel
// (faux logiciel livré local, jeu de test), mot de passe lisible de 12 caractères au moins, renvoyé une fois.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: http.Server;
let port = 0;
let tmp = "";
const received: { token?: string; password?: string; origin?: string }[] = [];
const saved = process.env.REBORN_APPS_DIR;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, app: "hotel-test-app" }));
      }
      if (req.method === "POST" && req.url === "/api/auth/activate") {
        const b = JSON.parse(body || "{}");
        received.push({ token: b.token, password: b.password, origin: String(req.headers.origin ?? "") });
        const ok = typeof b.token === "string" && b.token.length > 20 && typeof b.password === "string" && b.password.length >= 12;
        res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
        return res.end(JSON.stringify(ok ? { ok: true } : { error: "refus (jeu de test)" }));
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as { port: number }).port;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-creds-"));
  fs.mkdirSync(path.join(tmp, "hotel-test-app"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "hotel-test-app", "app.json"), JSON.stringify({ app: { id: "hotel-test-app", port } }));
  process.env.REBORN_APPS_DIR = tmp;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(tmp, { recursive: true, force: true });
  if (saved === undefined) delete process.env.REBORN_APPS_DIR;
  else process.env.REBORN_APPS_DIR = saved;
});

describe("identifiant et mot de passe du logiciel livré", () => {
  it("génère un mot de passe lisible, active le compte dans le logiciel livré et renvoie les identifiants", async () => {
    const { issueAppCredentials } = await import("@/lib/migration/app-access");
    const out = await issueAppCredentials("hotel-test-app", { email: "Client.Test@Exemple.test", by: "Test (jeu de test)" });
    expect(out.login).toBe("client.test@exemple.test");
    expect(out.password).toMatch(/^Rbn-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(out.url).toBe(`http://127.0.0.1:${port}`);
    expect(received.at(-1)?.password).toBe(out.password);
    expect(received.at(-1)?.origin).toBe(`http://127.0.0.1:${port}`);
    const invites = fs.readdirSync(path.join(tmp, "hotel-test-app")).join(" ");
    expect(invites).toMatch(/invit|\.reborn|access|secrets/i);
  });

  it("deux générations donnent deux mots de passe différents", async () => {
    const { issueAppCredentials } = await import("@/lib/migration/app-access");
    const a = await issueAppCredentials("hotel-test-app", { email: "client.test@exemple.test", by: "Test" });
    const b = await issueAppCredentials("hotel-test-app", { email: "client.test@exemple.test", by: "Test" });
    expect(a.password).not.toBe(b.password);
  });

  it("logiciel arrêté : refus explicite (409), sans invitation écrite (le lien valable du propriétaire n'est pas révoqué)", async () => {
    const { issueAppCredentials } = await import("@/lib/migration/app-access");
    fs.mkdirSync(path.join(tmp, "arrete-app"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "arrete-app", "app.json"), JSON.stringify({ app: { id: "arrete-app", port: 1 } }));
    await expect(issueAppCredentials("arrete-app", { email: "client.test@exemple.test", by: "Test" })).rejects.toMatchObject({ status: 409 });
    expect(fs.existsSync(path.join(tmp, "arrete-app", ".secrets", "invites"))).toBe(false);
  });

  it("activation refusée après le contrôle de santé : 502, et l'invitation écrite est retirée", async () => {
    const refus = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, app: "refus-app" }));
      }
      req.resume();
      req.on("end", () => {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Trop de tentatives (jeu de test)" }));
      });
    });
    await new Promise<void>((r) => refus.listen(0, "127.0.0.1", r));
    try {
      fs.mkdirSync(path.join(tmp, "refus-app"), { recursive: true });
      fs.writeFileSync(path.join(tmp, "refus-app", "app.json"), JSON.stringify({ app: { id: "refus-app", port: (refus.address() as { port: number }).port } }));
      const { issueAppCredentials } = await import("@/lib/migration/app-access");
      await expect(issueAppCredentials("refus-app", { email: "client.test@exemple.test", by: "Test" })).rejects.toMatchObject({ status: 502 });
      const dir = path.join(tmp, "refus-app", ".secrets", "invites");
      expect(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : []).toEqual([]);
    } finally {
      await new Promise<void>((r) => refus.close(() => r()));
    }
  });

  it("un autre logiciel répond sur ce port : refus (409), sans invitation écrite", async () => {
    const { issueAppCredentials } = await import("@/lib/migration/app-access");
    fs.mkdirSync(path.join(tmp, "autre-app"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "autre-app", "app.json"), JSON.stringify({ app: { id: "autre-app", port } }));
    await expect(issueAppCredentials("autre-app", { email: "client.test@exemple.test", by: "Test" })).rejects.toMatchObject({ status: 409 });
    expect(fs.existsSync(path.join(tmp, "autre-app", ".secrets", "invites"))).toBe(false);
  });
});
