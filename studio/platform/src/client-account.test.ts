/**
 * Test A (SPEC §12) — compte client de bout en bout, par les vraies routes (handler Better Auth et routes
 * du Studio, base SQLite réelle dans un dossier temporaire) :
 *   inscription → connexion → déconnexion → reconnexion → projets retrouvés,
 * y compris après un redémarrage du Studio : caches mémoire vidés et connexion à auth.db fermée, tout est
 * relu depuis le disque (auth.db, projects.json, project.json, state.json), comme un nouveau processus.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, authRequest, callRoute, cleanupAuthEnv, setupAuthEnv, signIn, signUp, type RouteHandler } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const R: Record<string, Mod> = {};
const ROUTES = ["me", "projects", "projects/[id]", "migration/sources", "state"];

function api(route: string, method: string, o: { id?: string; query?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}${o.query ?? ""}`, { params: o.id ? { id: o.id } : {}, body: o.body, headers: o.headers });
}
const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");

/**
 * Redémarrage du Studio dans le même processus de test : écritures différées faites, connexion à auth.db
 * fermée, et tous les singletons globaux (comptes, état, projets, missions, flux) oubliés — la suite
 * relit tout depuis le disque.
 */
async function restartStudio() {
  (await import("@/lib/store")).flushPersist();
  const g = globalThis as unknown as Record<string, { ready?: Promise<{ db: { close(): void } }> } | undefined>;
  const auth = g.__rebornAuth;
  if (auth?.ready) (await auth.ready).db.close();
  for (const k of ["__rebornAuth", "__reborn", "__rebornMigration", "__rebornAnalysisDbs", "__rebornStreams", "__rebornAuthLimits", "__rebornLastSweep"]) delete g[k];
}

beforeAll(async () => {
  setupAuthEnv("reborn-account-");
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
});
afterAll(() => cleanupAuthEnv());

describe("Test A — inscription → connexion → déconnexion → reconnexion → projets retrouvés", () => {
  it("le client retrouve ses projets (et leurs données) à chaque reconnexion, même après un redémarrage du Studio ; une session fermée ne rouvre rien", async () => {
    // 1. Inscription réelle (consentements aux versions courantes) : le compte est connecté d'emblée
    const u = await signUp({ firstName: "Nora", lastName: "Lefèvre", company: "Menuiserie Lefèvre" });
    const me = await api("me", "GET", { headers: asUser(u.cookie) });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ id: u.userId, email: u.email, firstName: "Nora", lastName: "Lefèvre", company: "Menuiserie Lefèvre", role: "client" });

    // 2. Ses projets, avec de vraies données : un projet avec un fichier déposé, un second vide
    const p1 = await api("projects", "POST", { headers: asUser(u.cookie), body: { company: "Menuiserie Lefèvre", software: "Gestion Atelier 2003", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    expect(p1.status, JSON.stringify(p1.body)).toBe(201);
    const p2 = await api("projects", "POST", { headers: asUser(u.cookie), body: { company: "Menuiserie Lefèvre — dépôt de Nantes", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    expect(p2.status).toBe(201);
    const ids = [p1.body.project.id, p2.body.project.id].sort();
    const up = await api("migration/sources", "POST", { query: `?project=${p1.body.project.id}`, headers: asUser(u.cookie), body: { name: "clients.csv", content_base64: csv([["id", "nom"], ["1", "Ébénisterie Martin"], ["2", "Scierie du Lac"]]) } });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const snapshot = async (cookie: string) => {
      const list = await api("projects", "GET", { headers: asUser(cookie) });
      expect(list.status).toBe(200);
      const projects = list.body.projects as { id: string; company: string; data: { sources: number } }[];
      const sources = await api("migration/sources", "GET", { query: `?project=${p1.body.project.id}`, headers: asUser(cookie) });
      expect(sources.status).toBe(200);
      return { ids: projects.map((p) => p.id).sort(), companies: projects.map((p) => p.company).sort(), sources: (sources.body as { name: string; sha256: string }[]).map((s) => [s.name, s.sha256]) };
    };
    const initial = await snapshot(u.cookie);
    expect(initial.ids).toEqual(ids);
    expect(initial.companies).toEqual(["Menuiserie Lefèvre", "Menuiserie Lefèvre — dépôt de Nantes"]);
    expect(initial.sources).toEqual([["clients.csv", up.body.source.sha256]]);

    // 3. Déconnexion : le cookie de session est effacé et ne vaut plus rien, sur aucune route
    const out = await authRequest("/sign-out", { body: {}, headers: { cookie: u.cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().some((c) => /^reborn\.session_token=;.*Max-Age=0/.test(c))).toBe(true);
    for (const [route, o] of [["me", {}], ["projects", {}], ["projects/[id]", { id: p1.body.project.id }], ["migration/sources", { query: `?project=${p1.body.project.id}` }]] as const) {
      expect(await api(route, "GET", { ...o, headers: asUser(u.cookie) }), route).toMatchObject({ status: 401, body: { ok: false, error: "Connexion requise" } });
    }

    // 4. Reconnexion : un mauvais mot de passe ne donne rien ; le bon ouvre une NOUVELLE session
    expect(await signIn(u.email, "pas-le-bon-mot-de-passe")).toMatchObject({ status: 401, cookie: "" });
    const again = await signIn(u.email, u.password);
    expect(again.status).toBe(200);
    expect(again.cookie).toMatch(/^reborn\.session_token=/);
    expect(again.cookie).not.toBe(u.cookie);
    expect(await snapshot(again.cookie)).toEqual(initial);

    // 5. Redémarrage du Studio : tout est relu depuis le disque ; la session ouverte reste valable, la session fermée reste fermée
    const g = globalThis as unknown as Record<string, unknown>;
    const before = { auth: g.__rebornAuth, store: g.__reborn, projects: g.__rebornMigration };
    expect(before.auth && before.store && before.projects).toBeTruthy();
    await restartStudio();
    expect(await snapshot(again.cookie)).toEqual(initial);
    // Nouvelles instances (rien n'a été servi depuis la mémoire d'avant le redémarrage)
    expect(g.__rebornAuth).toBeDefined();
    expect(g.__rebornAuth).not.toBe(before.auth);
    expect(g.__rebornMigration).not.toBe(before.projects);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(401);
    expect((await api("projects/[id]", "GET", { id: p1.body.project.id, headers: asUser(again.cookie) })).body.project).toMatchObject({ id: p1.body.project.id, company: "Menuiserie Lefèvre" });
    // Journal de ses projets conservé (state.json relu)
    const titles = ((await api("state", "GET", { headers: asUser(again.cookie) })).body.events as { title: string }[]).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining(["Projet de migration « Menuiserie Lefèvre » créé"]));

    // 6. Nouvelle déconnexion puis reconnexion après le redémarrage (adresse saisie en majuscules) : mêmes projets
    expect((await authRequest("/sign-out", { body: {}, headers: { cookie: again.cookie } })).status).toBe(200);
    expect((await api("projects", "GET", { headers: asUser(again.cookie) })).status).toBe(401);
    const third = await signIn(u.email.toUpperCase(), u.password);
    expect(third.status).toBe(200);
    expect(await snapshot(third.cookie)).toEqual(initial);

    // 7. Un autre compte ne retrouve rien de ces projets
    const other = await signUp({ firstName: "Paul", lastName: "Durand" });
    expect((await api("projects", "GET", { headers: asUser(other.cookie) })).body.projects).toEqual([]);
    for (const id of ids) expect((await api("projects/[id]", "GET", { id, headers: asUser(other.cookie) })).status).toBe(404);
  });
});
