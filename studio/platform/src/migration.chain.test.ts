/**
 * Chaîne complète de migration, sans simulation :
 *   Relatio 2004 (vrai serveur, vraie base SQLite) → extraction HTTP autorisée (compte « migration »)
 *   → analyse → correspondances (jeu de l'Analyste) → validation humaine → migration → vérification
 *   → génération et mise en service du nouveau CRM → lecture des enregistrements par SON API.
 * La vérité de référence est lue directement dans la base de Relatio, indépendamment de REBORN.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(import.meta.dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-mig-"));
const LEGACY_DATA = path.join(tmp, "relatio");
let legacy: ChildProcess;
let legacyUrl = "";
let crmUrl = "";
let creds: { migration: { password: string }; admin: { password: string } };
let project: typeof import("@/lib/migration/project");
let generate: typeof import("@/lib/migration/generate");
let fixtures: typeof import("@/lib/migration/fixtures");
let legacyDb: DatabaseSync;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`${url} injoignable`);
}

let cookie = "";
async function crm(method: string, p: string, body?: unknown) {
  const r = await fetch(crmUrl + p, { method, headers: { "content-type": "application/json", cookie, origin: crmUrl }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
}

beforeAll(async () => {
  process.env.REBORN_DATA_DIR = path.join(tmp, "reborn");
  process.env.REBORN_APPS_DIR = path.join(tmp, "generated");
  process.env.CRM_PORT = String(await freePort());
  crmUrl = `http://127.0.0.1:${process.env.CRM_PORT}`;
  const port = await freePort();
  legacyUrl = `http://127.0.0.1:${port}`;
  legacy = spawn(process.execPath, ["--no-warnings", path.join(ROOT, "legacy-crm/server.mjs")], { env: { ...process.env, LEGACY_CRM_PORT: String(port), LEGACY_CRM_DATA: LEGACY_DATA }, stdio: "ignore" });
  await waitFor(`${legacyUrl}/login`);
  creds = JSON.parse(fs.readFileSync(path.join(LEGACY_DATA, ".credentials.json"), "utf8"));
  legacyDb = new DatabaseSync(path.join(LEGACY_DATA, "relatio.db"), { readOnly: true });
  project = await import("@/lib/migration/project");
  generate = await import("@/lib/migration/generate");
  fixtures = await import("@/lib/migration/fixtures");
}, 30000);

afterAll(async () => {
  await generate?.stopApp("morel-crm");
  legacy?.kill();
  legacyDb?.close();
});

const one = <T,>(sql: string, ...a: (string | number)[]) => legacyDb.prepare(sql).get(...a) as T;

describe("Migration Relatio 2004 → nouveau CRM", () => {
  it("refuse l'extraction sans identifiants valides", async () => {
    await expect(project.extract(fixtures.CRM_FIXTURES.extraction_plan, { base_url: legacyUrl, username: "migration", password: "mauvais" })).rejects.toThrow(/Connexion refusée/);
  });

  it("extrait uniquement ce que le compte autorise et consigne les refus", async () => {
    project.newProject("Migration Relatio → Morel CRM", "Relatio 2004");
    const out = await project.extract(fixtures.CRM_FIXTURES.extraction_plan, { base_url: legacyUrl, username: "migration", password: creds.migration.password });
    const byStatus = (s: string) => out.results.filter((r) => r.status === s).map((r) => r.id);
    expect(byStatus("ok")).toHaveLength(11);
    expect(byStatus("forbidden").sort()).toEqual(["commissions", "sauvegarde"]);
    expect(out.account).not.toContain("migration");
    expect(JSON.stringify(project.getProject())).not.toContain(creds.migration.password);
    // CSV en Windows-1252 détecté, Excel et JSON lus
    const p = project.getProject();
    expect(p.sources.find((s) => s.name === "clients.csv")?.encoding).toBe("windows-1252");
    expect(p.sources.find((s) => s.name === "articles.xlsx")?.tables[0].rows).toBe(one<{ n: number }>("SELECT COUNT(*) n FROM T_ARTICLE").n);
    // Archive = documents référencés moins les 8 fichiers perdus sur l'ancien serveur
    expect(p.sources.find((s) => s.name === "documents.zip")?.archive_entries).toBe(one<{ n: number }>("SELECT COUNT(*) n FROM T_DOCUMENT").n - 8);
  });

  it("analyse la structure : types, clés et relations", () => {
    const prof = project.profile();
    const clients = prof.tables.find((t) => t.name === "clients")!;
    expect(clients.primary_key).toBe("ID_CLI");
    expect(clients.columns.find((c) => c.name === "DATE_CREA")).toMatchObject({ type: "date", format: "DD/MM/YYYY" });
    const factures = prof.tables.find((t) => t.name === "factures")!;
    expect(factures.columns.find((c) => c.name === "TOTAL_TTC")).toMatchObject({ type: "money", format: "comma" });
    const rel = prof.relations.find((r) => r.table === "factures" && r.column === "ID_CLI")!;
    expect(rel.references).toEqual({ table: "clients", column: "ID_CLI" });
    expect(rel.orphans).toBe(2);
    const act = prof.tables.find((t) => t.name === "activites")!.columns.find((c) => c.name === "DATE_ACT")!;
    expect(act.anomalies.count).toBe(5);
  });

  it("exige la validation des correspondances incertaines avant l'import", () => {
    const v = project.setMapping(fixtures.CRM_FIXTURES.mapping, "analyst");
    expect(v.issues.filter((i) => i.level === "error")).toEqual([]);
    const st = project.planStatus();
    expect(st.items.map((i) => i.key).sort()).toEqual(["attachment:0", "field:articles.tva", "field:clients.categorie", "field:clients.etat", "field:devis_lignes.article", "field:factures.client"]);
    expect(st.can_run).toBe(false);
    expect(() => project.startRun("test")).toThrow(/à valider/);
    for (const i of st.items) project.decide(i.key, "accepted", "Jerem");
    expect(project.planStatus().can_run).toBe(true);
  });

  let runId = "";
  it("migre réellement les enregistrements et retrouve exactement la source", () => {
    const { run, report } = project.startRun("Jerem");
    runId = run.id;
    expect(run.status).toBe("completed");
    expect(report).not.toBeNull();
    const r = report!;
    // Aucun contrôle bloquant en échec ; des écarts documentés → validation humaine requise
    expect(r.checks.filter((c) => c.blocking && c.status === "fail")).toEqual([]);
    expect(r.status).toBe("review");
    const ent = (n: string) => r.entities.find((e) => e.entity === n)!;
    // Vérité de référence : base de Relatio lue directement
    expect(ent("clients")).toMatchObject({ source_rows: 1200, target_rows: 1198, rejected: 2, mismatched: 0 });
    expect(ent("clients").exact).toBe(1198);
    const namelessQuotes = one<{ n: number }>("SELECT COUNT(*) n FROM T_DEVIS WHERE ID_CLI IN (377, 913)").n;
    expect(ent("devis")).toMatchObject({ rejected: namelessQuotes, mismatched: 0 });
    expect(ent("factures")).toMatchObject({ source_rows: one<{ n: number }>("SELECT COUNT(*) n FROM T_FACTURE").n, rejected: 0, mismatched: 0 });
    expect(ent("paiements").rejected).toBe(0);
    expect(ent("activites")).toMatchObject({ source_rows: 4000, target_rows: 4000 });
    // Montants comptables : identiques au centime à la base d'origine
    const ttc = Math.round(one<{ s: number }>("SELECT SUM(ROUND(TOTAL_TTC * 100)) s FROM T_FACTURE").s);
    expect(ent("factures").totals.find((t) => t.field === "total_ttc")).toMatchObject({ source_cents: ttc, target_cents: ttc, rejected_cents: 0 });
    const paid = Math.round(one<{ s: number }>("SELECT SUM(ROUND(MONTANT * 100)) s FROM T_PAIEMENT").s);
    expect(ent("paiements").totals[0]).toMatchObject({ source_cents: paid, target_cents: paid });
    // Écarts signalés (jamais corrigés silencieusement)
    const gaps = (k: string) => r.gaps.filter((g) => g.kind === k);
    expect(gaps("unlinked").find((g) => g.entity === "factures")?.count).toBe(2);
    expect(gaps("conversion").find((g) => g.entity === "activites")?.count).toBe(5);
    // 8 fichiers perdus sur l'ancien serveur + documents de devis rejetés (client sans raison sociale)
    const docsOfRejected = one<{ n: number }>("SELECT COUNT(*) n FROM T_DOCUMENT WHERE TYPE_LIEN = 'DEV' AND ID_LIEN IN (SELECT ID_DEV FROM T_DEVIS WHERE ID_CLI IN (377, 913))").n;
    expect(gaps("attachment")[0].count).toBe(8 + docsOfRejected);
    expect(r.checks.find((c) => c.id === "pieces_jointes.couverture")?.details?.filter((d) => String(d).includes("absent de l'archive"))).toHaveLength(8);
    expect(gaps("inaccessible").map((g) => g.source).sort()).toEqual(["Commissions commerciales (CSV)", "Sauvegarde complète (SQL)"]);
    expect(gaps("historical").some((g) => g.entity === "factures" && g.count === 12)).toBe(true);
    // Doublons injectés dans Relatio : 6 SIRET + 6 e-mails clients + 3 e-mails prospects — signalés, non fusionnés
    const dups = project.runArtifacts(run.id).result.duplicates;
    expect(dups.filter((d) => d.entity === "clients" && d.rule === "même SIRET")).toHaveLength(6);
    expect(dups.filter((d) => d.entity === "clients" && d.rule === "même e-mail")).toHaveLength(6);
    expect(dups.filter((d) => d.entity === "prospects")).toHaveLength(3);
    expect(dups.every((d) => d.records.length === 2)).toBe(true);
    expect(r.checks.find((c) => c.id === "pieces_jointes.empreintes")?.status).toBe("pass");
    expect(r.checks.find((c) => c.id === "sources.manifeste")?.status).toBe("pass");
  });

  it("détecte toute altération de la base de destination (contrôles réels, pas des scores)", async () => {
    const { verifyMigration } = await import("@/lib/migration/verify");
    const { result, mapping } = project.runArtifacts(runId);
    const copy = path.join(tmp, "altered.db");
    fs.copyFileSync(result.db_path, copy);
    const db = new DatabaseSync(copy);
    db.exec(`UPDATE "factures" SET "total_ttc" = "total_ttc" + 1 WHERE "id" = 10`);
    db.exec(`PRAGMA foreign_keys = OFF; DELETE FROM "clients" WHERE "id" = 5`);
    db.close();
    const fresh = project.loadSources(true);
    const p = project.getProject();
    const rep = verifyMigration({
      mapping,
      tables: fresh.tables,
      archives: fresh.archives,
      run: result,
      dbPath: copy,
      filesDir: result.files_dir,
      sources: p.sources.map((s) => ({ name: s.name, sha256: s.sha256, vault_path: path.join(project.migrationRoot(), s.vault), tables: s.tables })),
    });
    expect(rep.status).toBe("blocked");
    const failed = rep.checks.filter((c) => c.status === "fail").map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["volumes.clients", "enregistrements.clients", "enregistrements.factures", "montants.factures.total_ttc"]));
  });

  it("refuse la mise en service tant que les écarts ne sont pas acceptés, puis génère un CRM autonome", async () => {
    await expect(generate.deploy(runId, "Jerem")).rejects.toThrow(/acceptés/);
    project.acknowledge(runId, "Jerem", "Écarts examinés : clients sans raison sociale à ressaisir, pièces perdues confirmées");
    const out = await generate.deploy(runId, "Jerem");
    expect(out.url).toBe(crmUrl);
    const dir = path.join(process.env.REBORN_APPS_DIR!, "morel-crm");
    for (const f of ["server.mjs", "app.json", "package.json", "README.md", "data/app.db", "public/app.js", "lib/expr.mjs"]) expect(fs.existsSync(path.join(dir, f))).toBe(true);
    // Le logiciel livré ne dépend d'aucun fichier de REBORN
    const server = fs.readFileSync(path.join(dir, "server.mjs"), "utf8");
    expect(server).not.toMatch(/platform\/|legacy-crm|\.\.\/src/);
  });

  it("le nouveau CRM sert exactement les enregistrements migrés, avec leurs relations", async () => {
    expect((await crm("GET", "/api/e/clients")).status).toBe(401);
    const admin = JSON.parse(fs.readFileSync(path.join(process.env.REBORN_APPS_DIR!, "morel-crm/.secrets/admin.json"), "utf8"));
    expect((await crm("POST", "/api/auth/login", { username: "admin", password: "mauvais" })).status).toBe(401);
    expect((await crm("POST", "/api/auth/login", { username: admin.username, password: admin.password })).status).toBe(200);

    const list = await crm("GET", "/api/e/clients?q=C00012");
    expect(list.body.total).toBe(1);
    const src = one<Record<string, string>>("SELECT * FROM T_CLIENT WHERE CODE_CLI = 'C00012'");
    const c = list.body.rows[0];
    expect(c).toMatchObject({ code: "C00012", raison_sociale: src.RAISON_SOC, siret: src.SIRET, ville: src.VILLE, email: src.EMAIL, _source_key: "12", _migrated: 1 });
    const d = (await crm("GET", `/api/e/clients/${c.id}`)).body;
    expect(d.lineage).toMatchObject({ source_system: "Relatio 2004", source_table: "clients", source_key: "12" });
    expect(d.lineage.source_row.REMARQUES).toBe(src.REMARQUES);
    // Devis et factures rattachés au bon client
    const legacyInv = (legacyDb.prepare("SELECT NUM_FAC, TOTAL_TTC FROM T_FACTURE WHERE ID_CLI = 12 ORDER BY ID_FAC").all() as { NUM_FAC: string; TOTAL_TTC: number }[]).map((x) => [x.NUM_FAC, Math.round(x.TOTAL_TTC * 100)]);
    const crmInv = d.children["factures.client"].rows.map((x: { numero: string; total_ttc: number }) => [x.numero, x.total_ttc]).sort();
    expect(crmInv).toEqual(legacyInv.sort());
    expect(d.children["devis.client"].total).toBe(one<{ n: number }>("SELECT COUNT(*) n FROM T_DEVIS WHERE ID_CLI = 12").n);

    // Volumes servis par le nouveau logiciel = volumes migrés
    for (const [e, t] of [["factures", "T_FACTURE"], ["paiements", "T_PAIEMENT"], ["articles", "T_ARTICLE"], ["prospects", "T_PROSPECT"]]) {
      expect((await crm("GET", `/api/e/${e}?per=1`)).body.total).toBe(one<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`).n);
    }
    // Pièce jointe : octets identiques au fichier de l'ancien serveur
    const inv = (await crm("GET", "/api/e/factures?per=200")).body.rows;
    const withFile = (legacyDb.prepare("SELECT d.CHEMIN, f.NUM_FAC FROM T_DOCUMENT d JOIN T_FACTURE f ON f.ID_FAC = d.ID_LIEN WHERE d.TYPE_LIEN = 'FAC' ORDER BY d.ID_DOC").all() as { CHEMIN: string; NUM_FAC: string }[]).find((x) => fs.existsSync(path.join(LEGACY_DATA, "files", x.CHEMIN)) && inv.some((i: { numero: string }) => i.numero === x.NUM_FAC))!;
    const invId = inv.find((i: { numero: string }) => i.numero === withFile.NUM_FAC).id;
    const files = (await crm("GET", `/api/e/factures/${invId}`)).body.files;
    const dl = await fetch(`${crmUrl}/api/files/${files[0].id}`, { headers: { cookie } });
    expect(Buffer.from(await dl.arrayBuffer()).equals(fs.readFileSync(path.join(LEGACY_DATA, "files", withFile.CHEMIN)))).toBe(true);
  });

  it("permet de créer et modifier de vrais enregistrements, sans altérer l'historique comptable", async () => {
    const created = await crm("POST", "/api/e/clients", { code: "C09001", raison_sociale: "Nouvelle Société Test", categorie: "premium", email: "contact@nouvelle.fr" });
    expect(created.status).toBe(201);
    expect(created.body._migrated).toBe(0);
    expect((await crm("POST", "/api/e/clients", { code: "C09001", raison_sociale: "Doublon" })).status).toBe(409);
    expect((await crm("POST", "/api/e/clients", { code: "C09002" })).status).toBe(400);
    const edit = await crm("PUT", "/api/e/clients/1", { ville: "Lyon", _justification: "Déménagement" });
    expect(edit.status).toBe(200);
    // Facture migrée : montants verrouillés, lignes non modifiables
    const f = (await crm("GET", "/api/e/factures?per=1")).body.rows[0];
    expect((await crm("PUT", `/api/e/factures/${f.id}`, { total_ttc: f.total_ttc + 100 })).status).toBe(409);
    expect((await crm("DELETE", `/api/e/factures/${f.id}`)).status).toBe(409);
    expect((await crm("POST", "/api/e/factures_lignes", { facture: f.id, quantite: 1, prix_unitaire: 100 })).status).toBe(409);
    // Nouveau devis : règles reproduites (HT = somme des lignes, TVA 20 %, TTC = HT + TVA)
    const q = await crm("POST", "/api/e/devis", { numero: "D2026-00001", client: created.body.id, date: "2026-11-07", statut: "brouillon" });
    expect(q.status).toBe(201);
    await crm("POST", "/api/e/devis_lignes", { devis: q.body.id, article: 1, quantite: 3, prix_unitaire: 12550, remise_pct: 0 });
    await crm("POST", "/api/e/devis_lignes", { devis: q.body.id, article: 2, quantite: 2, prix_unitaire: 1000, remise_pct: 10 });
    const qd = (await crm("GET", `/api/e/devis/${q.body.id}`)).body.record;
    expect(qd).toMatchObject({ total_ht: 37650 + 1800, total_tva: Math.round((39450 * 20) / 100), total_ttc: 39450 + 7890 });
    const audit = (await crm("GET", "/api/admin/audit")).body as { action: string; justification: string | null }[];
    expect(audit.some((a) => a.action === "update" && a.justification === "Déménagement")).toBe(true);
    // Écriture depuis une autre origine refusée
    const csrf = await fetch(`${crmUrl}/api/e/clients/1`, { method: "PUT", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(csrf.status).toBe(403);
  });

  it("réconcilie le logiciel en service avec la source, en isolant les modifications des utilisateurs", () => {
    const rep = generate.reconcile();
    expect(rep.checks.filter((c) => c.blocking && c.status === "fail")).toEqual([]);
    expect(rep.checks.find((c) => c.id === "enregistrements.clients")?.metrics).toMatchObject({ modified_after_migration: 1, mismatched: 0 });
  });

  it("protège les saisies et permet le retour arrière", async () => {
    const p = project.getProject();
    await expect(generate.deploy(runId, "Jerem")).rejects.toThrow(/modification/);
    await generate.deploy(runId, "Jerem", { force: true });
    expect((await crm("POST", "/api/auth/login", { username: "admin", password: JSON.parse(fs.readFileSync(path.join(process.env.REBORN_APPS_DIR!, "morel-crm/.secrets/admin.json"), "utf8")).password })).status).toBe(200);
    expect((await crm("GET", "/api/e/clients?q=C09001")).body.total).toBe(0);
    const last = project.getProject().deployments.at(-1)!;
    expect(last.backup).toBeTruthy();
    await generate.rollback(last.id, "Jerem");
    expect((await crm("POST", "/api/auth/login", { username: "admin", password: JSON.parse(fs.readFileSync(path.join(process.env.REBORN_APPS_DIR!, "morel-crm/.secrets/admin.json"), "utf8")).password })).status).toBe(200);
    expect((await crm("GET", "/api/e/clients?q=C09001")).body.total).toBe(1);
    expect(p.deployments.length).toBeGreaterThan(0);
  });
});
