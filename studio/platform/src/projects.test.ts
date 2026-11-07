/**
 * Projets de migration : isolation, états liés à de vraies opérations, identifiants protégés,
 * remise à l'agent par jeton à usage unique, aucune connexion simulée. Routes API réelles.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const mods: Record<string, Record<string, Handler>> = {};
const ORIGIN = "http://127.0.0.1:3000";

async function call(route: string, method: string, opts: { id?: string; query?: string; body?: unknown } = {}) {
  const url = `${ORIGIN}/api/${route.replace("[id]", opts.id ?? "")}${opts.query ?? ""}`;
  const req = new Request(url, { method, headers: { "content-type": "application/json", origin: ORIGIN }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const params: Record<string, string> = opts.id ? { id: opts.id } : {};
  const res = await mods[route][method](req, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  process.env.REBORN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-projects-"));
  delete process.env.REBORN_API_TOKEN;
  for (const r of ["projects", "projects/[id]", "projects/[id]/select", "projects/[id]/credentials", "projects/[id]/credentials/redeem", "projects/[id]/connection", "projects/[id]/connection/test", "projects/[id]/mission", "migration/sources", "migration/project", "migration/mapping"]) {
    mods[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, Handler>;
  }
});

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
const newProject = async (company: string, extra: Record<string, unknown> = {}) =>
  call("projects", "POST", { body: { company, software: `${company} ERP`, authorized: true, authorized_by: "Jerem", ...extra } });

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
    // Le projet courant (le dernier créé) n'est pas concerné par l'envoi adressé à Alpha
    expect((await call("migration/sources", "GET")).body).toHaveLength(0);
    const list = (await call("projects", "GET")).body.projects as { id: string; data: { sources: number } }[];
    expect(list.find((p) => p.id === a.id)?.data.sources).toBe(1);
    expect(list.find((p) => p.id === b.id)?.data.sources).toBe(0);
    expect((await call("migration/sources", "GET", { query: "?project=MIG_ffffffff" })).status).toBe(404);
    expect((await call("migration/sources", "GET", { query: "?project=../../etc" })).status).toBe(400);
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
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "connected", by: "Explorer" } });
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
    // Mission consultée : sans jeton ; mission transmise : jeton à usage unique, jamais le mot de passe
    expect((await call("projects/[id]/mission", "GET", { id: p.id })).body.credential.token).toBeUndefined();
    const mission = (await call("projects/[id]/mission", "POST", { id: p.id })).body;
    expect(JSON.stringify(mission)).not.toContain("S3cret-Mot-De-Passe");
    expect(mission.credential.token).toMatch(/^[\w-]{20,}$/);
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: "faux-jeton-faux-jeton-faux" } })).status).toBe(403);
    const ok = await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token } });
    expect(ok.body).toMatchObject({ username: "migration", password: "S3cret-Mot-De-Passe" });
    expect((await call("projects/[id]/credentials/redeem", "POST", { id: p.id, body: { token: mission.credential.token } })).status).toBe(403);
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
    // Rapport de l'agent : double authentification → intervention humaine ; puis connecté
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "mfa_required", detail: "Code SMS demandé", by: "Explorer" } });
    expect((await call("projects/[id]", "GET", { id: p.id })).body.project.status).toBe("NEEDS_HUMAN_REVIEW");
    await call("projects/[id]/connection", "POST", { id: p.id, body: { status: "connected", by: "Explorer" } });
    const after = (await call("projects/[id]", "GET", { id: p.id })).body;
    expect(after.project.status).toBe("CONNECTED");
    expect(after.details.connection).toMatchObject({ status: "connected", by: "Explorer" });
  });
});
