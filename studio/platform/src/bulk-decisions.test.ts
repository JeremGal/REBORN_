/**
 * Correspondances : proposition automatique dès l'arrivée des données, et validation en bloc par le propriétaire
 * (POST /api/migration/decisions/bulk). Vraies routes, vrais comptes (Better Auth en mémoire), dossier de données
 * et dossier de clés temporaires. Toutes les données sont INVENTÉES (jeu de test) : aucun client réel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asService, asUser, callRoute, cleanupAuthEnv, makeOperator, ORIGIN, setupAuthEnv, signUp, type Json, type RouteHandler, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const ROUTES = ["projects", "projects/[id]", "projects/[id]/credentials", "migration/sources", "migration/mapping", "migration/decisions", "migration/decisions/bulk"] as const;
const R = {} as Record<(typeof ROUTES)[number], Mod>;
let keysDir = "";
let owner: TestUser, other: TestUser, op: TestUser;
let store: typeof import("@/lib/store");

const b64 = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
/** Jeu de test : 20 clients fictifs, catégorie à deux codes (proposition incertaine). */
const CLIENTS = [["id", "nom", "categorie"], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `Client fictif ${i + 1} (jeu de test)`, ["A", "B"][i % 2]])];
/** Jeu de test : devis fictifs avec numéro et montant → document commercial, protection de l'historique à confirmer. */
const DEVIS = [["id", "numero", "client", "date", "montant"], ...Array.from({ length: 20 }, (_, i) => [String(i + 1), `D${String(i + 1).padStart(3, "0")}`, String((i % 20) + 1), `${String((i % 27) + 1).padStart(2, "0")}/03/2024`, `${(i + 1) * 10},50`])];
const PRODUITS = [["id", "libelle"], ...Array.from({ length: 5 }, (_, i) => [String(i + 1), `Produit fictif ${i + 1}`])];

const api = (route: (typeof ROUTES)[number], method: string, o: { id?: string; query?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}${o.query ?? ""}`, { params: o.id ? { id: o.id } : {}, headers: o.headers ?? asUser(owner.cookie), body: o.body });
const q = (pid: string, extra = "") => `?project=${pid}${extra}`;
const deposit = (pid: string, name: string, rows: string[][], headers?: Record<string, string>) => api("migration/sources", "POST", { query: q(pid), headers, body: { name, content_base64: b64(rows) } });
const mapping = async (pid: string) => (await api("migration/mapping", "GET", { query: q(pid) })).body as Json;
const projectEvents = (pid: string) => store.getState().events.filter((e) => (e as { project_id?: string }).project_id === pid);

async function newProject(withCredentials = false): Promise<string> {
  const r = await api("projects", "POST", {
    body: {
      company: "Atelier Fictif (jeu de test)",
      software: "Logiciel de test",
      authorized: true,
      authorization_version: AUTHORIZATION_DECLARATION.version,
      legacy_url: "http://127.0.0.1:4999/",
      ...(withCredentials ? { credentials: { username: "compte.jeu.de.test", password: "Mdp-Jeu-De-Test-Bulk-1" }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } : {}),
    },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.project.id as string;
}

beforeAll(async () => {
  setupAuthEnv("reborn-bulk-");
  keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-bulk-keys-"));
  process.env.REBORN_KEYS_DIR = keysDir;
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  store = await import("@/lib/store");
  owner = await signUp({ firstName: "Lina", lastName: "Fictive", company: "Atelier Fictif (jeu de test)" });
  other = await signUp({ firstName: "Paul", lastName: "Autre" });
  op = await signUp({ firstName: "Équipe", lastName: "Reborn" });
  await makeOperator(op.email);
}, 30000);

afterAll(async () => {
  await cleanupAuthEnv();
  fs.rmSync(keysDir, { recursive: true, force: true });
  delete process.env.REBORN_KEYS_DIR;
});

describe("Proposition automatique dès l'arrivée des données", () => {
  it("premier dépôt : correspondances v1 proposées d'office, évènement de suivi ; état du projet et identifiants confiés inchangés", async () => {
    const pid = await newProject(true);
    const up = await deposit(pid, "clients.csv", CLIENTS);
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.mapping).toMatchObject({ action: "proposed", version: 1 });
    expect(up.body.mapping.pending).toBeGreaterThan(0);
    const m = await mapping(pid);
    expect(m.current).toMatchObject({ version: 1, origin: "auto", on_arrival: true });
    expect(m.status.pending).toBe(up.body.mapping.pending);
    // Rien n'a été demandé ni validé : l'état reste « données reçues », les identifiants ne sont pas effacés
    const p = (await api("projects/[id]", "GET", { id: pid })).body;
    expect(p.project.status).toBe("EXTRACTING");
    expect(p.project.anomalies.pending_decisions).toBe(up.body.mapping.pending);
    expect((await api("projects/[id]/credentials", "GET", { id: pid })).body.stored).toBe(true);
    const ev = projectEvents(pid).find((e) => e.title.startsWith("Correspondances v1 proposées automatiquement à la réception de « clients.csv »"));
    expect(ev, projectEvents(pid).map((e) => e.title).join(" | ")).toBeDefined();
    expect(ev!.detail).toMatch(/point\(s\) à vérifier/);
  });

  it("proposition encore intacte : le dépôt suivant la complète (nouvelle version) ; identique : rien de créé ; après une décision : jamais remplacée", async () => {
    const pid = await newProject();
    expect((await deposit(pid, "clients.csv", CLIENTS)).body.mapping.version).toBe(1);
    const second = await deposit(pid, "devis.csv", DEVIS);
    expect(second.body.mapping).toMatchObject({ action: "refreshed", version: 2 });
    const m2 = await mapping(pid);
    expect(m2.current.mapping.entities.map((e: { source: { table: string } }) => e.source.table).sort()).toEqual(["clients", "devis"]);
    expect(m2.status.items.some((i: { key: string }) => i.key === "accounting:devis")).toBe(true);
    expect(projectEvents(pid).some((e) => e.title.startsWith("Correspondances v2 proposées automatiquement pour inclure « devis.csv »"))).toBe(true);
    // Même fichier redéposé : proposition identique, aucune version de plus
    expect((await deposit(pid, "devis.csv", DEVIS)).body.mapping).toEqual({ action: "unchanged", version: 2 });
    // Une décision prise : la version n'est plus « intacte », un nouveau dépôt ne la remplace jamais
    const key = m2.status.items.find((i: { kind: string }) => i.kind === "field").key;
    expect((await api("migration/decisions", "POST", { query: q(pid), body: { key, decision: "accepted" } })).status).toBe(200);
    const third = await deposit(pid, "produits.csv", PRODUITS);
    expect(third.status).toBe(200);
    expect(third.body.mapping).toEqual({ action: "kept", version: 2, uncovered: ["produits"] });
    const after = await mapping(pid);
    expect(after.current.version).toBe(2);
    expect(after.status.items.find((i: { key: string }) => i.key === key).decision).toMatchObject({ decision: "accepted", by: "Lina Fictive" });
    expect(projectEvents(pid).some((e) => e.title === "Données reçues (« produits.csv ») : correspondances v2 conservées" && /produits/.test(e.detail ?? ""))).toBe(true);
  });

  it("correspondances de l'Analyste : jamais écrasées par un dépôt ultérieur", async () => {
    const pid = await newProject();
    await deposit(pid, "clients.csv", CLIENTS);
    const auto = (await mapping(pid)).current.mapping;
    const pub = await api("migration/mapping", "POST", { query: q(pid), headers: asService("analyst"), body: { ...auto, notes: "Envoi de l'Analyste (jeu de test)" } });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect(pub.body.version).toBe(2);
    const later = await deposit(pid, "devis.csv", DEVIS);
    expect(later.body.mapping).toMatchObject({ action: "kept", version: 2 });
    expect((await mapping(pid)).current).toMatchObject({ version: 2, origin: "analyst" });
  });

  it("aucune table exploitable (aucun identifiant de ligne) : pas de version, évènement explicite, le dépôt reste réussi", async () => {
    const pid = await newProject();
    const up = await deposit(pid, "notes.csv", [["texte"], ["note A"], ["note A"]]);
    expect(up.status).toBe(200);
    expect(up.body.mapping.action).toBe("skipped");
    expect((await mapping(pid)).current).toBeNull();
    expect(projectEvents(pid).some((e) => e.title === "Proposition automatique impossible pour « notes.csv »")).toBe(true);
  });
});

describe("Validation en bloc des propositions restantes (propriétaire seulement)", () => {
  let pid = "";
  let version = 0;
  let pending: { key: string; kind: string }[] = [];
  const bulk = (body: unknown, headers: Record<string, string> = asUser(owner.cookie), project = pid) => api("migration/decisions/bulk", "POST", { query: q(project), headers, body });

  beforeAll(async () => {
    pid = await newProject(true);
    await deposit(pid, "clients.csv", CLIENTS);
    await deposit(pid, "devis.csv", DEVIS);
    const m = await mapping(pid);
    version = m.current.version;
    pending = m.status.items.filter((i: { decision: unknown }) => !i.decision);
    expect(pending.some((i) => i.kind === "accounting")).toBe(true);
    expect(pending.filter((i) => i.kind !== "accounting").length).toBeGreaterThan(1);
  });

  it("isolation et contrôle d'accès : anonyme 401, agent 403, autre client 404, équipe sur le projet d'un client 404, origine étrangère 403", async () => {
    const body = { version, keys: pending.map((i) => i.key) };
    expect((await bulk(body, {})).status).toBe(401);
    expect((await bulk(body, asService("explorer"))).status).toBe(403);
    expect((await bulk(body, asService("analyst"))).status).toBe(403);
    expect((await bulk(body, asUser(other.cookie))).status).toBe(404);
    expect((await bulk(body, asUser(op.cookie))).status).toBe(404);
    expect((await bulk(body, { cookie: owner.cookie, origin: "https://evil.example" })).status).toBe(403);
    expect((await bulk(body, { cookie: owner.cookie })).status).toBe(403); // ni Origin ni sec-fetch-site : refus (CSRF)
    expect((await bulk(body, { ...asUser(owner.cookie), "x-reborn-project": "MIG_00000000" })).status).toBe(400);
    // Rien n'a été enregistré
    expect((await mapping(pid)).status.items.filter((i: { decision: unknown }) => i.decision)).toEqual([]);
  });

  it("refus sans rien enregistrer : version qui a changé (409), point inconnu (404), liste vide (400)", async () => {
    const keys = pending.map((i) => i.key);
    const stale = await bulk({ version: version + 1, keys });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatch(/Les correspondances ont changé/);
    expect((await bulk({ version, keys: [...keys, "field:inconnue.colonne"] })).status).toBe(404);
    expect((await bulk({ version, keys: [] })).status).toBe(400);
    expect((await mapping(pid)).status.pending).toBe(pending.length);
  });

  it("accepte exactement les points confirmés (protections comptables exclues), au nom du compte connecté, avec UN évènement « N points acceptés en bloc par <nom> »", async () => {
    const chosen = pending.filter((i) => i.kind !== "accounting").map((i) => i.key);
    const before = projectEvents(pid).length;
    const r = await bulk({ version, keys: chosen, by: "Usurpateur" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ ok: true, version, accepted: chosen.length, skipped: 0, accounting: 0 });
    expect(r.body.review.pending).toBe(pending.length - chosen.length);
    expect(r.body.review.can_run).toBe(false); // la protection comptable reste à trancher
    const items = (await mapping(pid)).status.items as { key: string; kind: string; decision: { by: string; decision: string; comment: string } | null }[];
    for (const i of items) {
      if (i.kind === "accounting") expect(i.decision, i.key).toBeNull();
      else expect(i.decision, i.key).toMatchObject({ decision: "accepted", by: "Lina Fictive", comment: "Acceptée en bloc avec les autres propositions restantes" });
    }
    const added = projectEvents(pid).slice(before);
    expect(added.map((e) => e.title)).toEqual([`${chosen.length} points acceptés en bloc par Lina Fictive`]);
    expect(added[0].source).toBe("user");
    expect(JSON.stringify(store.getState().events)).not.toContain("Usurpateur");
    // Des points restent : identifiants toujours confiés (l'étape des correspondances n'est pas terminée)
    expect((await api("projects/[id]/credentials", "GET", { id: pid })).body.stored).toBe(true);
  });

  it("dernier point (protection gardée) : migration possible, état « Correspondances » comme après une décision unitaire ; un point déjà tranché n'est jamais réécrit", async () => {
    const acc = pending.filter((i) => i.kind === "accounting").map((i) => i.key);
    const r = await bulk({ version, keys: acc, comment: "Protection vérifiée (jeu de test)" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ accepted: acc.length, accounting: acc.length });
    expect(r.body.review).toMatchObject({ pending: 0, can_run: true, blockers: [] });
    const p = (await api("projects/[id]", "GET", { id: pid })).body;
    expect(p.project.status).toBe("MAPPING");
    expect(p.details.status_history.at(-1).reason).toBe("Toutes les correspondances incertaines ont été tranchées : migration possible");
    // Étape des correspondances terminée : les identifiants confiés ne servent plus (comme après une décision unitaire)
    expect((await api("projects/[id]/credentials", "GET", { id: pid })).body.stored).toBe(false);
    expect(projectEvents(pid).at(-1)?.title).toBe("1 point accepté en bloc par Lina Fictive");
    // Renvoyer la même liste : rien n'est réécrit, aucun évènement
    const n = projectEvents(pid).length;
    const again = await bulk({ version, keys: pending.map((i) => i.key) });
    expect(again.body).toMatchObject({ accepted: 0, skipped: pending.length });
    expect(projectEvents(pid).length).toBe(n);
    const kept = (await mapping(pid)).status.items.find((i: { key: string }) => i.key === acc[0]).decision;
    expect(kept.comment).toBe("Protection vérifiée (jeu de test)");
  });

  it("projet en pause : refus (409), comme toute décision", async () => {
    const pid2 = await newProject();
    await deposit(pid2, "clients.csv", CLIENTS);
    const m = await mapping(pid2);
    expect((await api("projects/[id]", "PATCH", { id: pid2, body: { action: "pause" } })).status).toBe(200);
    const r = await bulk({ version: m.current.version, keys: m.status.items.map((i: { key: string }) => i.key) }, asUser(owner.cookie), pid2);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/pause/);
  });

  it("annotation d'accès de la route : propriétaire, écriture, projet désigné par ?project=", () => {
    expect((R["migration/decisions/bulk"].POST as unknown as { reborn: unknown }).reborn).toEqual({ access: ["owner"], write: true, project: "query" });
    expect(ORIGIN).toMatch(/^http:\/\/127\.0\.0\.1/);
  });
});
