/**
 * « Analyser mon logiciel » : avancement RÉEL de la mission vu par le client (GET /api/projects/[id]/analysis →
 * progress), calculé uniquement à partir des évènements reçus — prise, connexion, écrans découverts, export récupéré,
 * fin. Message exact « Agent d'analyse non disponible pour le moment. » tant qu'aucun exécuteur n'est connecté.
 * L'exécuteur est une DOUBLURE étiquetée « jeu de test » (jeton explorer + X-Reborn-Executor) : aucun appel à H ni à
 * un logiciel réel ; toutes les données sont inventées.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, callRoute, cleanupAuthEnv, setupAuthEnv, signUp, type Json, type RouteHandler, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const ROUTES = ["projects", "projects/[id]/analysis", "projects/[id]/connection", "executor/heartbeat", "executor/missions/claim", "executor/missions/[mission_id]/complete", "events", "migration/sources", "migration/mapping"] as const;
const R = {} as Record<(typeof ROUTES)[number], Mod>;
const UNAVAILABLE = "Agent d'analyse non disponible pour le moment.";
let owner: TestUser, other: TestUser;
let cred: typeof import("@/lib/migration/credentials");
let offset = 0;
let restoreClock: () => void = () => {};

const ex = (instance: string) => ({ ...asService("explorer"), "x-reborn-executor": instance });
const call = (route: (typeof ROUTES)[number], method: string, o: { id?: string; mission?: string; query?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "").replace("[mission_id]", o.mission ?? "")}${o.query ?? ""}`, {
    params: { ...(o.id ? { id: o.id } : {}), ...(o.mission ? { mission_id: o.mission } : {}) },
    headers: o.headers ?? asUser(owner.cookie),
    body: o.body,
  });
const beat = (instance: string, active: string[] = []) => call("executor/heartbeat", "POST", { headers: ex(instance), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: active, label: "doublure d'exécuteur — jeu de test" } });
const analysis = async (pid: string, headers?: Record<string, string>) => (await call("projects/[id]/analysis", "GET", { id: pid, headers })).body as Json;
const step = (a: Json, id: string) => (a.progress?.steps as Json[] | undefined)?.find((s) => s.id === id);

async function newProject(company: string): Promise<string> {
  const r = await call("projects", "POST", { body: { company, software: "Logiciel hôtelier (jeu de test)", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:4999/" } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.project.id as string;
}

beforeAll(async () => {
  setupAuthEnv("reborn-progress-");
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  cred = await import("@/lib/migration/credentials");
  restoreClock = cred.setClock(() => Date.now() + offset);
  owner = await signUp({ firstName: "Nora", lastName: "Fictive", company: "Hôtel Fictif (jeu de test)" });
  other = await signUp({ firstName: "Marc", lastName: "Autre" });
}, 30000);

afterAll(async () => {
  restoreClock();
  await cleanupAuthEnv();
});

describe("Avancement réel de la mission, vu par le client", () => {
  it("sans exécuteur : message exact, aucune progression ; puis prise, connexion, écrans, export et fin, chacun à partir de ce qui a été reçu", async () => {
    const pid = await newProject("Hôtel Fictif (jeu de test)");
    const asked = await call("projects/[id]/analysis", "POST", { id: pid, body: { without_credentials: true } });
    expect(asked.status).toBe(202);
    expect(asked.body).toMatchObject({ state: "queued", agent_available: false, message: UNAVAILABLE, progress: null });
    const waiting = await analysis(pid);
    expect(waiting).toMatchObject({ state: "queued", message: UNAVAILABLE, progress: null });

    // L'exécuteur se signale et prend la mission : plus de message d'indisponibilité, la prise est inscrite
    expect((await beat("doublure-progression")).status).toBe(200);
    const claim = await call("executor/missions/claim", "POST", { headers: ex("doublure-progression") });
    expect(claim.status).toBe(200);
    const mid = claim.body.mission_id as string;
    const inv = claim.body.investigation_id as string;
    let a = await analysis(pid);
    expect(a.message).toBeUndefined();
    expect(a.state).toBe("claimed");
    expect(step(a, "claimed")).toMatchObject({ state: "done", at: expect.any(String) });
    for (const id of ["connection", "screens", "export", "end"]) expect(step(a, id)?.state, id).toBe("waiting");
    expect(a.progress).toMatchObject({ screens: 0, exports: 0 });

    // Rapports de connexion du titulaire : en cours, puis réussie
    expect((await call("projects/[id]/connection", "POST", { id: pid, headers: ex("doublure-progression"), body: { status: "pending", detail: "Ouverture du logiciel (jeu de test)", mission_id: mid } })).status).toBe(200);
    expect(step(await analysis(pid), "connection")).toMatchObject({ state: "current", label: "Connexion à votre logiciel en cours" });
    expect((await call("projects/[id]/connection", "POST", { id: pid, headers: ex("doublure-progression"), body: { status: "connected", detail: "Page d'accueil affichée (jeu de test)", mission_id: mid } })).status).toBe(200);
    a = await analysis(pid);
    expect(step(a, "connection")).toMatchObject({ state: "done", label: "Connexion à votre logiciel réussie", detail: "Page d'accueil affichée (jeu de test)" });

    // Carte de l'application envoyée comme le fait l'exécuteur H (une page par évènement, data.page + data.mission_id)
    const pages = ["Accueil", "Nouvelle réservation", "Sauvegarde"];
    const sent = await call("events", "POST", {
      query: `?project=${pid}`,
      headers: ex("doublure-progression"),
      body: [
        { source: "explorer", type: "log", title: "Carte de l'application : 3 écran(s)", investigation_id: inv, data: { pages: 3, mission_id: mid } },
        ...pages.map((p) => ({ source: "explorer", type: "log", title: `Écran « ${p} » repéré`, investigation_id: inv, data: { page: p, mission_id: mid } })),
      ],
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    a = await analysis(pid);
    expect(step(a, "screens")).toMatchObject({ state: "done", label: "3 écrans découverts", detail: "Accueil · Nouvelle réservation · Sauvegarde" });
    expect(a.progress.screens).toBe(3);

    // Export déposé par l'exécuteur titulaire : inscrit à SA mission ; correspondances proposées d'office
    const csv = Buffer.from(["id;chambre;arrivee", "1;101;01/03/2024", "2;102;02/03/2024"].join("\n"), "utf8").toString("base64");
    const dep = await call("migration/sources", "POST", { query: `?project=${pid}`, headers: ex("doublure-progression"), body: { name: "reservations.csv", content_base64: csv, mechanism: "export de test" } });
    expect(dep.status, JSON.stringify(dep.body)).toBe(200);
    expect(dep.body.mapping).toMatchObject({ action: "proposed", version: 1 });
    a = await analysis(pid);
    expect(step(a, "export")).toMatchObject({ state: "done", label: "1 export récupéré par l'agent", detail: "reservations.csv (2 lignes)" });
    expect((await call("migration/mapping", "GET", { query: `?project=${pid}` })).body.current).toMatchObject({ version: 1, origin: "auto", on_arrival: true });

    // Fin déclarée par le titulaire (jamais supposée)
    expect(step(a, "end")?.state).toBe("waiting");
    const done = await call("executor/missions/[mission_id]/complete", "POST", { mission: mid, headers: ex("doublure-progression"), body: { outcome: "completed", detail: "Carte : 4 évènement(s) (jeu de test)" } });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    a = await analysis(pid);
    expect(a.state).toBe("completed");
    expect(step(a, "end")).toMatchObject({ state: "done", label: "Analyse terminée", at: expect.any(String), detail: "Carte : 4 évènement(s) (jeu de test)" });
    expect(a.progress.steps.map((s: Json) => s.id)).toEqual(["claimed", "connection", "screens", "export", "end"]);
    expect(a.progress.last_report_at).toEqual(expect.any(String));

    // Un autre client ne voit rien de cette mission (même réponse qu'un projet inexistant)
    expect((await call("projects/[id]/analysis", "GET", { id: pid, headers: asUser(other.cookie) })).status).toBe(404);
  });

  it("prise interrompue (prêt expiré) et agent hors ligne : demande remise en file, signalée, et message exact de nouveau", async () => {
    offset += 61_000; // les doublures du test précédent ne sont plus « disponibles »
    const pid = await newProject("Gîte Fictif (jeu de test)");
    expect((await call("projects/[id]/analysis", "POST", { id: pid, body: { without_credentials: true } })).status).toBe(202);
    await beat("doublure-interrompue");
    const claim = await call("executor/missions/claim", "POST", { headers: ex("doublure-interrompue") });
    expect(claim.status).toBe(200);
    expect(claim.body.project_id).toBe(pid);
    offset += 121_000; // ni battement ni rapport : prêt expiré, exécuteur hors ligne
    const a = await analysis(pid);
    expect(a.state).toBe("queued");
    expect(a.message).toBe(UNAVAILABLE);
    expect(step(a, "claimed")).toMatchObject({ state: "attention", label: "Prise en charge interrompue", detail: "Demande remise en file d'attente (prise 1 sur 3)" });
    for (const id of ["connection", "screens", "export"]) expect(step(a, id)?.state, id).toBe("waiting");
    // La file reste vide pour le test suivant
    expect((await call("projects/[id]/analysis", "DELETE", { id: pid })).status).toBe(200);
  });

  it("un exécuteur ne peut pas gonfler l'avancement d'une mission d'un autre projet en citant son identifiant", async () => {
    offset += 61_000;
    const victim = await newProject("Hôtel Victime (jeu de test)");
    expect((await call("projects/[id]/analysis", "POST", { id: victim, body: { without_credentials: true } })).status).toBe(202);
    await beat("doublure-v");
    const mv = (await call("executor/missions/claim", "POST", { headers: ex("doublure-v") })).body;
    expect(mv.project_id).toBe(victim);
    const intruder = await newProject("Hôtel Intrus (jeu de test)");
    expect((await call("projects/[id]/analysis", "POST", { id: intruder, body: { without_credentials: true } })).status).toBe(202);
    await beat("doublure-i");
    const mi = (await call("executor/missions/claim", "POST", { headers: ex("doublure-i") })).body;
    expect(mi.project_id).toBe(intruder);
    // Écrans envoyés dans le projet de l'intrus (dont il tient le prêt), en citant la mission de la victime
    const forged = await call("events", "POST", { query: `?project=${intruder}`, headers: ex("doublure-i"), body: [{ source: "explorer", type: "log", title: "Écran « Faux » repéré", investigation_id: mi.investigation_id, data: { page: "Faux", mission_id: mv.mission_id } }] });
    expect(forged.status, JSON.stringify(forged.body)).toBe(200);
    expect(step(await analysis(victim), "screens")).toMatchObject({ state: "waiting", label: "Écrans découverts" });
    expect((await analysis(victim)).progress.screens).toBe(0);
    for (const p of [victim, intruder]) await call("projects/[id]/analysis", "DELETE", { id: p });
  });
});
