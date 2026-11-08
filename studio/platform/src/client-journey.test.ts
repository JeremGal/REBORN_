/**
 * Test G (SPEC §12) — parcours de migration d'un client, sous SA session (cookie Better Auth + Origin du
 * Studio), uniquement par les vraies routes de l'API et avec le moteur existant (profil, correspondances,
 * migration, vérification indépendante) :
 *   dépôt d'exports réellement produits par un logiciel en service → profil → correspondances
 *   → décisions humaines → migration → vérification → acceptation des écarts ;
 * puis un second client, sur le même Studio, qui ne voit ni ne modifie rien de ce parcours ;
 * et la suite : mise en service du logiciel reconstruit (identifiants confiés effacés, SPEC §5) et accès du
 * client à SON logiciel livré par lien d'activation, avec un mot de passe qu'il choisit (SPEC §9, test H).
 *
 * Les exports sont téléchargés en HTTP, avec son compte « migration », sur le logiciel de test
 * Relatio 2004 (JEU DE TEST : données synthétiques du dépôt) lancé sur un port libre, comme un client
 * les obtient de son ancien logiciel (écran Exports). La vérité de référence est lue directement dans la
 * base SQLite de Relatio, indépendamment de REBORN. Aucun serveur en service n'est touché.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { asUser, callRoute, cleanupAuthEnv, setupAuthEnv, signUp, type Json, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const ROOT = path.resolve(import.meta.dirname, "../..");
const ROUTES = [
  "projects", "projects/[id]/credentials", "state", "events", "revision",
  "migration", "migration/sources", "migration/sources/rows", "migration/profile", "migration/mapping", "migration/decisions",
  "migration/runs", "migration/runs/[id]", "migration/runs/[id]/rejects", "migration/runs/[id]/acknowledge",
  "migration/deploy", "migration/app", "migration/app/access",
];
const EXPORTS = ["clients.csv", "factures.csv"] as const;

const R: Record<string, Mod> = {};
let env: TestEnv;
let client: TestUser;
let intruder: TestUser;
let pid = "";
let relatio: ChildProcess | undefined;
let relatioDir = "";
let relatioUrl = "";
let truth: DatabaseSync;
let legacyPassword = "";
const exported: Record<string, Buffer> = {};
let manifest: { file: string; rows: number; sha256: string }[] = [];

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

/** Appel d'une route du Studio ; `[id]` = exécution (routes runs/[id]). */
function api(route: string, method: string, o: { query?: string; id?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}${o.query ?? ""}`, { params: o.id ? { id: o.id } : {}, body: o.body, headers: o.headers });
}
const q = () => `?project=${pid}`;
const as = (u: TestUser) => asUser(u.cookie);
const one = <T,>(sql: string) => truth.prepare(sql).get() as T;
const projectFile = () => path.join(env.dataDir, "migration", "projects", pid, "project.json");

beforeAll(async () => {
  env = setupAuthEnv("reborn-journey-");
  // Logiciels livrés : jamais generated/ ni le CRM en service (aucune mise en service dans ce parcours, par prudence)
  process.env.REBORN_APPS_DIR = path.join(env.dataDir, "apps");
  process.env.CRM_PORT = String(await freePort());
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;

  // Logiciel de test Relatio 2004 (jeu de test), avec ses propres comptes aléatoires, sur un port libre
  const port = await freePort();
  relatioUrl = `http://127.0.0.1:${port}`;
  relatioDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-journey-relatio-"));
  relatio = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { PATH: process.env.PATH ?? "", LEGACY_CRM_PORT: String(port), LEGACY_CRM_HOST: "127.0.0.1", LEGACY_CRM_DATA: relatioDir, NODE_ENV: "test" }, stdio: "ignore" });
  for (let i = 0; i < 150; i++) {
    try {
      await fetch(`${relatioUrl}/login`, { redirect: "manual" });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  // Exports téléchargés comme le ferait le client : connexion avec le compte « migration », écran Exports
  legacyPassword = (JSON.parse(fs.readFileSync(path.join(relatioDir, ".credentials.json"), "utf8")) as { migration: { password: string } }).migration.password;
  const login = await fetch(`${relatioUrl}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ utilisateur: "migration", motdepasse: legacyPassword }).toString() });
  expect(login.status).toBe(302);
  const session = (login.headers.get("set-cookie") ?? "").split(";")[0];
  expect(session).toMatch(/^RELATIOSESSID=/);
  for (const f of EXPORTS) {
    const r = await fetch(`${relatioUrl}/exports/${f}`, { headers: { cookie: session } });
    expect(r.status, f).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=windows-1252");
    exported[f] = Buffer.from(await r.arrayBuffer());
  }
  manifest = ((await (await fetch(`${relatioUrl}/exports/manifest.json`, { headers: { cookie: session } })).json()) as { exports: typeof manifest }).exports;
  truth = new DatabaseSync(path.join(relatioDir, "relatio.db"), { readOnly: true });

  client = await signUp({ firstName: "Inès", lastName: "Morel", company: "Ateliers Morel SA" });
  intruder = await signUp({ firstName: "Hugo", lastName: "Renard", company: "Renard Transports" });
}, 60000);

afterAll(async () => {
  // Logiciel livré (processus détaché) arrêté avant la suppression de son dossier
  const apps = process.env.REBORN_APPS_DIR;
  if (apps && fs.existsSync(apps)) {
    const { stopApp } = await import("@/lib/migration/generate");
    for (const id of fs.readdirSync(apps)) await stopApp(id);
  }
  truth?.close();
  if (relatio && relatio.exitCode === null) {
    const exited = new Promise((r) => relatio!.once("exit", r));
    relatio.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }
  await cleanupAuthEnv();
  fs.rmSync(relatioDir, { recursive: true, force: true });
});

describe("Test G — parcours de migration d'un client, sous sa session, par les routes", () => {
  let runId = "";
  let clientsInSource = 0;
  let invoicesInSource = 0;
  let orphanInvoices = 0;

  it("dépôt des exports réels : empreinte et volumes identiques au manifeste du logiciel source, auteur = le compte connecté", async () => {
    const created = await api("projects", "POST", { headers: as(client), body: { company: "Ateliers Morel SA", software: "Relatio 2004", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    pid = created.body.project.id;
    clientsInSource = one<{ n: number }>("SELECT COUNT(*) AS n FROM T_CLIENT").n;
    invoicesInSource = one<{ n: number }>("SELECT COUNT(*) AS n FROM T_FACTURE").n;
    orphanInvoices = one<{ n: number }>("SELECT COUNT(*) AS n FROM T_FACTURE WHERE ID_CLI NOT IN (SELECT ID_CLI FROM T_CLIENT)").n;
    expect(clientsInSource).toBeGreaterThan(100);
    expect(orphanInvoices).toBeGreaterThan(0); // le logiciel source contient de vraies incohérences à signaler

    for (const f of EXPORTS) {
      const up = await api("migration/sources", "POST", { query: q(), headers: as(client), body: { name: f, content_base64: exported[f].toString("base64"), mechanism: "export CSV de l'écran Exports", by: "Usurpateur" } });
      expect(up.status, JSON.stringify(up.body)).toBe(200);
      const m = manifest.find((x) => x.file === f)!;
      expect(up.body.source).toMatchObject({ name: f, format: "csv", sha256: m.sha256, size: exported[f].length, origin: { kind: "api", by: "Inès Morel" } });
      expect(up.body.source.tables).toEqual([{ name: f.replace(".csv", ""), rows: m.rows, columns: expect.any(Number) }]);
    }
    // Fichier clients (raisons sociales accentuées) : encodage d'époque Windows-1252 reconnu, accents relus intacts
    expect((await api("migration/sources", "GET", { query: q(), headers: as(client) })).body.find((s: { name: string }) => s.name === "clients.csv").encoding).toBe("windows-1252");
    expect(manifest.find((x) => x.file === "clients.csv")!.rows).toBe(clientsInSource);
    expect(manifest.find((x) => x.file === "factures.csv")!.rows).toBe(invoicesInSource);
    const list = await api("migration/sources", "GET", { query: q(), headers: as(client) });
    expect(list.body.map((s: { name: string }) => s.name).sort()).toEqual([...EXPORTS]);
    expect((await api("projects", "GET", { headers: as(client) })).body.projects.find((p: { id: string }) => p.id === pid)).toMatchObject({ status: "EXTRACTING", data: { sources: 2 } });
    // Lecture des lignes déposées (filtre côté serveur) : une raison sociale accentuée relue à l'identique de la base source
    const accented = (truth.prepare("SELECT ID_CLI, RAISON_SOC FROM T_CLIENT ORDER BY ID_CLI").all() as { ID_CLI: number; RAISON_SOC: string | null }[]).find((r) => /[^\x00-\x7f]/.test(r.RAISON_SOC ?? ""));
    expect(accented, "aucune raison sociale accentuée dans le jeu de test").toBeDefined();
    const rows = await api("migration/sources/rows", "GET", { query: `${q()}&table=clients&col=ID_CLI&op=equals&value=${accented!.ID_CLI}&per=5`, headers: as(client) });
    expect(rows.status, JSON.stringify(rows.body)).toBe(200);
    expect(JSON.stringify(rows.body)).toContain(JSON.stringify(accented!.RAISON_SOC).slice(1, -1));
  });

  it("profil : types, clés et relation factures → clients, avec les références orphelines comptées dans la base source", async () => {
    const prof = await api("migration/profile", "GET", { query: q(), headers: as(client) });
    expect(prof.status).toBe(200);
    const table = (n: string) => prof.body.tables.find((t: { name: string }) => t.name === n);
    expect(table("clients")).toMatchObject({ rows: clientsInSource, primary_key: "ID_CLI" });
    expect(table("factures")).toMatchObject({ rows: invoicesInSource, primary_key: "ID_FAC" });
    expect(table("factures").columns.find((c: { name: string }) => c.name === "TOTAL_TTC")).toMatchObject({ type: "money", format: "comma" });
    const rel = prof.body.relations.find((r: { table: string; column: string }) => r.table === "factures" && r.column === "ID_CLI");
    expect(rel).toMatchObject({ references: { table: "clients", column: "ID_CLI" }, orphans: orphanInvoices });
  });

  it("correspondances proposées par le moteur : la migration est refusée tant que les points incertains ne sont pas tranchés par le client", async () => {
    const m = await api("migration/mapping", "POST", { query: `${q()}&propose=auto`, headers: as(client) });
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect(m.body.review.pending).toBeGreaterThan(0);
    expect(m.body.review.can_run).toBe(false);
    const keys = m.body.review.items.map((i: { key: string }) => i.key) as string[];
    expect(keys).toContain("field:factures.id_cli"); // lien incertain : références introuvables dans la source
    const refused = await api("migration/runs", "POST", { query: q(), headers: as(client), body: {} });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/^Migration impossible : \d+ correspondance\(s\) incertaine\(s\) à valider ou exclure/);
    expect((await api("migration/runs", "GET", { query: q(), headers: as(client) })).body).toEqual([]);
  });

  it("décisions humaines : chaque point est validé au nom du compte connecté (jamais du champ « by »)", async () => {
    const plan = (await api("migration/mapping", "GET", { query: q(), headers: as(client) })).body;
    const pending = (plan.status.items as { key: string; decision: unknown }[]).filter((i) => !i.decision);
    expect(pending.length).toBeGreaterThan(0);
    for (const item of pending) {
      const d = await api("migration/decisions", "POST", { query: q(), headers: as(client), body: { key: item.key, decision: "accepted", comment: "Vérifié avec l'export d'origine", by: "Usurpateur" } });
      expect(d.status, `${item.key} ${JSON.stringify(d.body)}`).toBe(200);
    }
    const after = (await api("migration/mapping", "GET", { query: q(), headers: as(client) })).body.status;
    expect(after).toMatchObject({ pending: 0, can_run: true, blockers: [] });
    expect(after.items.every((i: { decision: { by: string; decision: string } }) => i.decision.by === "Inès Morel" && i.decision.decision === "accepted")).toBe(true);
    expect(fs.readFileSync(projectFile(), "utf8")).not.toContain("Usurpateur");
  });

  it("migration et vérification indépendante : volumes et montants identiques à la base source, écarts signalés (jamais corrigés en silence)", async () => {
    const run = await api("migration/runs", "POST", { query: q(), headers: as(client), body: { by: "Usurpateur" } });
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    runId = run.body.run.id;
    expect(runId).toBe("RUN_001");
    expect(run.body.run).toMatchObject({ status: "completed", by: "Inès Morel", mapping_version: 1, verification: "review" });
    expect(run.body.run.summary).toMatchObject({ source_rows: clientsInSource + invoicesInSource, imported: clientsInSource + invoicesInSource, rejected: 0 });
    expect(run.body.report).toMatchObject({ status: "review", failed: 0 });

    const det = await api("migration/runs/[id]", "GET", { id: runId, query: q(), headers: as(client) });
    expect(det.status).toBe(200);
    const report = det.body.report;
    expect(report.status).toBe("review");
    expect(report.checks.filter((c: { blocking: boolean; status: string }) => c.blocking && c.status !== "pass")).toEqual([]);
    const ent = (n: string) => report.entities.find((e: { entity: string }) => e.entity === n);
    expect(ent("clients")).toMatchObject({ source_rows: clientsInSource, target_rows: clientsInSource, rejected: 0, mismatched: 0, exact: clientsInSource });
    expect(ent("factures")).toMatchObject({ source_rows: invoicesInSource, target_rows: invoicesInSource, rejected: 0, mismatched: 0 });
    // Montants comptables au centime près, recalculés depuis la base de Relatio
    for (const [field, column] of [["total_ht", "TOTAL_HT"], ["total_tva", "TOTAL_TVA"], ["total_ttc", "TOTAL_TTC"]]) {
      const cents = Math.round(one<{ s: number }>(`SELECT SUM(ROUND(${column} * 100)) AS s FROM T_FACTURE`).s);
      expect(ent("factures").totals.find((t: { field: string }) => t.field === field), field).toMatchObject({ source_cents: cents, target_cents: cents, rejected_cents: 0 });
    }
    // Factures dont le client est introuvable : migrées SANS lien et signalées, au nombre exact de la base source
    expect(report.gaps.find((g: { kind: string; entity: string }) => g.kind === "unlinked" && g.entity === "factures")).toMatchObject({ count: orphanInvoices });
    expect(report.checks.find((c: { id: string }) => c.id === "relations.rattachements")).toMatchObject({ status: "warn", blocking: false });
    expect(report.checks.find((c: { id: string }) => c.id === "sources.empreintes")).toMatchObject({ status: "pass" });

    // Base migrée relue directement (lecture seule) : mêmes enregistrements que la source
    const target = new DatabaseSync(path.join(env.dataDir, "migration", "projects", pid, "runs", runId, "target.db"), { readOnly: true });
    try {
      const src = one<{ CODE_CLI: string; RAISON_SOC: string; VILLE: string }>("SELECT CODE_CLI, RAISON_SOC, VILLE FROM T_CLIENT WHERE ID_CLI = 12");
      expect(target.prepare(`SELECT code_cli, raison_soc, ville FROM "clients" WHERE _source_key = '12'`).get()).toEqual({ code_cli: src.CODE_CLI, raison_soc: src.RAISON_SOC, ville: src.VILLE });
      expect((target.prepare(`SELECT COUNT(*) AS n FROM "factures"`).get() as { n: number }).n).toBe(invoicesInSource);
      expect(Number((target.prepare(`SELECT SUM(total_ttc) AS s FROM "factures"`).get() as { s: number }).s)).toBe(Math.round(one<{ s: number }>("SELECT SUM(ROUND(TOTAL_TTC * 100)) AS s FROM T_FACTURE").s));
      expect((target.prepare(`SELECT COUNT(*) AS n FROM "factures" WHERE id_cli IS NULL`).get() as { n: number }).n).toBe(orphanInvoices);
    } finally {
      target.close();
    }
    // Rapport d'écarts téléchargeable : chaque facture sans client, avec sa ligne source
    const rej = await callRoute(R["migration/runs/[id]/rejects"], "GET", `/api/migration/runs/${runId}/rejects${q()}`, { params: { id: runId }, headers: as(client) });
    expect(rej.status).toBe(200);
    expect(rej.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect((rej.body as string).split("\r\n").filter((l) => l.startsWith("sans_lien;factures"))).toHaveLength(orphanInvoices);
  });

  it("acceptation des écarts par le client : tracée à son nom, le projet est prêt pour la mise en service", async () => {
    const before = (await api("projects", "GET", { headers: as(client) })).body.projects.find((p: { id: string }) => p.id === pid);
    expect(before.status).toBe("NEEDS_HUMAN_REVIEW");
    const ack = await api("migration/runs/[id]/acknowledge", "POST", { id: runId, query: q(), headers: as(client), body: { comment: "Factures sans client connues : à rattacher dans le nouveau logiciel", by: "Usurpateur" } });
    expect(ack.status, JSON.stringify(ack.body)).toBe(200);
    const det = await api("migration/runs/[id]", "GET", { id: runId, query: q(), headers: as(client) });
    expect(det.body.acknowledged).toMatchObject({ by: "Inès Morel", comment: "Factures sans client connues : à rattacher dans le nouveau logiciel" });
    const after = (await api("projects", "GET", { headers: as(client) })).body.projects.find((p: { id: string }) => p.id === pid);
    expect(after.status).toBe("READY_FOR_REVIEW");
    const overview = await api("migration", "GET", { query: q(), headers: as(client) });
    expect(overview.body.acknowledgements[runId]).toMatchObject({ by: "Inès Morel" });
    expect(overview.body.runs.map((r: { id: string }) => r.id)).toEqual([runId]);
    // Journal du client : chaque étape, rattachée à SON projet
    const st = (await api("state", "GET", { headers: as(client) })).body;
    const titles = (st.events as { title: string; project_id?: string }[]).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining([`Migration ${runId} : ${clientsInSource + invoicesInSource} enregistrement(s) importé(s), 0 rejeté(s)`, `Écarts de ${runId} acceptés par Inès Morel`]));
    expect((st.events as { project_id?: string }[]).every((e) => e.project_id === pid)).toBe(true);
    expect(JSON.stringify(st)).not.toContain("Usurpateur");
  });

  it("un second client ne voit rien de ce parcours et ne peut rien y modifier, par aucune route ni désignation", async () => {
    const before = fs.readFileSync(projectFile(), "utf8");
    const markers = [pid, "Ateliers Morel SA", "Inès Morel", client.email, one<{ RAISON_SOC: string }>("SELECT RAISON_SOC FROM T_CLIENT WHERE ID_CLI = 12").RAISON_SOC, manifest[0].sha256];
    const none = (body: Json, label: string) => {
      const dump = typeof body === "string" ? body : JSON.stringify(body);
      for (const m of markers) expect(dump.includes(m), `${label} contient « ${m} »`).toBe(false);
    };
    expect((await api("projects", "GET", { headers: as(intruder) })).body.projects).toEqual([]);
    const reads: [string, { id?: string; query?: string }][] = [
      ["migration", {}], ["migration/sources", {}], ["migration/sources/rows", { query: "&table=clients" }], ["migration/profile", {}], ["migration/mapping", {}],
      ["migration/runs", {}], ["migration/runs/[id]", { id: "RUN_001" }], ["migration/runs/[id]/rejects", { id: "RUN_001" }],
    ];
    for (const [route, o] of reads) {
      for (const via of [{ query: `${q()}${o.query ?? ""}` }, { query: o.query ? `?${o.query.slice(1)}` : "", headers: { "x-reborn-project": pid } }]) {
        const r = await api(route, "GET", { id: o.id, query: via.query, headers: { ...as(intruder), ...via.headers } });
        expect(r, `GET ${route} ${JSON.stringify(via)}`).toMatchObject({ status: 404, body: { ok: false, error: "Projet introuvable" } });
      }
    }
    const writes: [string, { id?: string; body: unknown }][] = [
      ["migration/sources", { body: { name: "intrus.csv", content_base64: Buffer.from("id;nom\n1;x\n").toString("base64") } }],
      ["migration/mapping", { body: {} }],
      ["migration/decisions", { body: { key: "field:factures.id_cli", decision: "excluded" } }],
      ["migration/runs", { body: {} }],
      ["migration/runs/[id]/acknowledge", { id: "RUN_001", body: { comment: "intrusion" } }],
    ];
    for (const [route, o] of writes) {
      const query = route === "migration/mapping" ? `${q()}&propose=auto` : q();
      const r = await api(route, "POST", { id: o.id, query, headers: as(intruder), body: o.body });
      expect(r, `POST ${route}`).toMatchObject({ status: 404, body: { ok: false, error: "Projet introuvable" } });
    }
    expect(fs.readFileSync(projectFile(), "utf8")).toBe(before);
    // Vues globales du second client : rien du premier (état, évènements, révision propre)
    for (const route of ["state", "events", "revision"]) {
      const r = await api(route, "GET", { headers: as(intruder) });
      expect(r.status, route).toBe(200);
      none(r.body, `/api/${route} du second client`);
    }
    expect((await api("state", "GET", { headers: as(intruder) })).body.events).toEqual([]);
    expect((await api("revision", "GET", { headers: as(intruder) })).body).toEqual({ revision: 0, event_seq: 0 });
    // … et le premier client retrouve son parcours intact
    expect((await api("migration/runs/[id]", "GET", { id: "RUN_001", query: q(), headers: as(client) })).body.acknowledged).toMatchObject({ by: "Inès Morel" });
  });
});

describe("Test G (suite) — mise en service du logiciel reconstruit et accès du client (SPEC §5, §9, test H)", () => {
  let appUrl = "";
  const CHOSEN = `phrase de passe choisie ${Date.now().toString(36)}`;
  const credFile = () => path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json");
  async function app(method: string, p: string, body?: unknown, cookie = "") {
    const r = await fetch(appUrl + p, { method, headers: { "content-type": "application/json", origin: appUrl, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Json, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
  }

  it("mise en service sous la session du client : logiciel autonome démarré, identifiants confiés effacés, état sans détail technique", async () => {
    // Identifiants confiés après coup (ex. nouvelle extraction envisagée) : la mise en service doit les effacer
    const dep0 = await api("projects/[id]/credentials", "POST", { id: pid, headers: as(client), body: { username: "compte.livraison", password: "Mdp-Avant-Mise-En-Service" } });
    expect(dep0.status, JSON.stringify(dep0.body)).toBe(200);
    const keyFile = path.join(env.dataDir, ".keys", `${(JSON.parse(fs.readFileSync(credFile(), "utf8")) as { id: string }).id}.key`);
    expect(fs.existsSync(keyFile)).toBe(true);
    // Un autre client ne met rien en service
    expect((await api("migration/deploy", "POST", { query: q(), headers: as(intruder), body: { run_id: "RUN_001" } })).status).toBe(404);
    const dep = await api("migration/deploy", "POST", { query: q(), headers: as(client), body: { run_id: "RUN_001", by: "Usurpateur" } });
    expect(dep.status, JSON.stringify(dep.body)).toBe(200);
    expect(dep.body.deployment).toMatchObject({ by: "Inès Morel", run_id: "RUN_001", status: "active" });
    appUrl = dep.body.url;
    expect(appUrl).toBe(`http://127.0.0.1:${process.env.CRM_PORT}`);
    // SPEC §5 « mise en service » : effacement anticipé (clé puis chiffré), tracé sans valeur
    expect((await api("projects/[id]/credentials", "GET", { id: pid, headers: as(client) })).body).toEqual({ stored: false });
    expect(fs.existsSync(keyFile)).toBe(false);
    expect(fs.existsSync(credFile())).toBe(false);
    const st = (await api("state", "GET", { headers: as(client) })).body;
    expect(JSON.stringify(st)).not.toContain("Mdp-Avant-Mise-En-Service");
    expect((st.events as { title: string }[]).some((e) => e.title.startsWith("Identifiants de l'ancien logiciel effacés"))).toBe(true);
    // État du logiciel livré vu du client : en service, ni processus, ni fichier d'identifiants, ni commande
    const view = await api("migration/app", "GET", { query: q(), headers: as(client) });
    expect(view.body).toMatchObject({ running: true, pid: null, credentials_file: null, start_command: null });
    expect((await api("migration/app", "GET", { query: q(), headers: as(intruder) })).status).toBe(404);
    expect((await api("projects", "GET", { headers: as(client) })).body.projects.find((p: { id: string }) => p.id === pid).status).toBe("PUBLISHED");
  }, 30000);

  it("accès au logiciel livré : lien au seul propriétaire, mot de passe choisi, données migrées servies ; les mots de passe du Studio et de l'ancien logiciel n'y servent à rien", async () => {
    expect((await api("migration/app/access", "POST", { query: q(), headers: as(intruder), body: {} })).status).toBe(404);
    const acc = await api("migration/app/access", "POST", { query: q(), headers: as(client), body: {} });
    expect(acc.status, JSON.stringify(acc.body)).toBe(201);
    expect(acc.body).toMatchObject({ ok: true, email: client.email, role: "admin" });
    const token = /#\/activation\/([A-Za-z0-9_-]{43})$/.exec(acc.body.link as string)![1];
    expect(new URL(acc.body.link as string).origin).toBe(appUrl);
    expect(JSON.stringify((await api("state", "GET", { headers: as(client) })).body)).not.toContain(token); // jamais journalisé
    expect((await app("POST", "/api/auth/invitation", { token })).body).toMatchObject({ email: client.email, role: "admin", existing_account: false });
    // Avant activation, puis après : ni le mot de passe du Studio, ni celui du compte « migration » de l'ancien logiciel
    expect((await app("POST", "/api/auth/login", { username: client.email, password: client.password })).status).toBe(401);
    expect((await app("POST", "/api/auth/activate", { token, password: CHOSEN })).body).toMatchObject({ ok: true, user: client.email, role: "admin" });
    const login = await app("POST", "/api/auth/login", { username: client.email, password: CHOSEN });
    expect(login.status).toBe(200);
    for (const [username, password] of [[client.email, client.password], ["migration", legacyPassword], [client.email, legacyPassword]]) {
      expect((await app("POST", "/api/auth/login", { username, password })).status, username).toBe(401);
    }
    expect((await app("POST", "/api/auth/activate", { token, password: "une autre phrase de passe" })).status).toBe(410); // usage unique
    // Le logiciel livré sert les données migrées depuis les exports du client
    const clients = await app("GET", "/api/e/clients?per=1", undefined, login.cookie);
    expect(clients.status).toBe(200);
    expect(clients.body.total).toBe(one<{ n: number }>("SELECT COUNT(*) AS n FROM T_CLIENT").n);
    expect((await app("GET", "/api/e/factures?per=1", undefined, login.cookie)).body.total).toBe(one<{ n: number }>("SELECT COUNT(*) AS n FROM T_FACTURE").n);
    const src = one<{ CODE_CLI: string; RAISON_SOC: string }>("SELECT CODE_CLI, RAISON_SOC FROM T_CLIENT WHERE ID_CLI = 12");
    const found = await app("GET", `/api/e/clients?q=${encodeURIComponent(src.CODE_CLI)}`, undefined, login.cookie);
    expect(found.body.rows.map((r: { raison_soc: string }) => r.raison_soc)).toContain(src.RAISON_SOC);
  }, 30000);
});
