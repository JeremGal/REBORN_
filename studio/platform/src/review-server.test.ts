/**
 * Non-régression des constats de la revue finale indépendante (domaine serveur) : un bloc par constat,
 * vrais handlers appelés en mémoire, base auth.db réelle dans un dossier temporaire, secrets aléatoires.
 * (ISO-1 : analysis.test.ts, à côté des autres tests de mission.)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { asOperatorCli, asService, asUser, authRequest, callRoute, cleanupAuthEnv, cookieFrom, makeOperator, setupAuthEnv, signIn, signUp, type RouteHandler, type TestEnv } from "@/test/auth";
import { AUTHORIZATION_DECLARATION } from "@/lib/legal";

let env: TestEnv;
const R: Record<string, Record<string, RouteHandler>> = {};
const ROUTES = [
  "me", "projects", "projects/[id]", "migration/sources", "auth/[...all]", "events", "observations", "migration/mapping", "migration/decisions",
  "state", "schema", "projects/[id]/analysis", "projects/[id]/connection", "projects/[id]/credentials", "executor/heartbeat", "executor/missions/claim", "executor/missions/[mission_id]/complete",
  "admin/erase", "me/consents",
];
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeAll(async () => {
  env = setupAuthEnv("reborn-review-server-");
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, RouteHandler>;
}, 30000);
afterAll(() => cleanupAuthEnv());

function api(route: string, method: string, opts: { id?: string; query?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {}) {
  const url = `/api/${route.replace("[id]", opts.id ?? "").replace("[mission_id]", opts.params?.mission_id ?? "")}${opts.query ?? ""}`;
  return callRoute(R[route], method, url, { params: { ...(opts.id ? { id: opts.id } : {}), ...opts.params }, body: opts.body, headers: opts.headers });
}
const ORIGIN_HDR = "http://127.0.0.1:3000";

/** Corps envoyé par blocs, SANS Content-Length (transfert « chunked ») ; compte les blocs effectivement lus. */
function chunkedBody(totalBytes: number, chunk = 1024 * 1024) {
  let sent = 0;
  let pulls = 0;
  const block = new Uint8Array(chunk).fill(0x20); // espaces : JSON vide de sens, mais lisible jusqu'au bout
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (sent >= totalBytes) return controller.close();
      const n = Math.min(chunk, totalBytes - sent);
      sent += n;
      controller.enqueue(n === chunk ? block : block.slice(0, n));
    },
  });
  return { stream, pulls: () => pulls };
}

describe("W2 — borne de 20 Mo appliquée au flux, même sans Content-Length", () => {
  it("readJson : 413 au-delà de la borne pour un envoi par blocs, avant d'avoir tout lu ; Content-Length menteur refusé", async () => {
    const { readJson, MAX_BODY_BYTES } = await import("@/lib/http");
    const big = chunkedBody(MAX_BODY_BYTES + 5 * 1024 * 1024);
    const req = new Request(`${ORIGIN_HDR}/api/x`, { method: "POST", body: big.stream, duplex: "half" } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
    expect(big.pulls()).toBeLessThanOrEqual(22); // lecture interrompue juste après la borne (20 blocs de 1 Mo + 1)
    // En dessous de la borne : lu normalement
    const ok = new Request(`${ORIGIN_HDR}/api/x`, { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(await readJson(ok)).toEqual({ a: 1 });
    // En-tête Content-Length déclaré au-delà de la borne : refusé sans lecture ; invalide : 400
    await expect(readJson(new Request(`${ORIGIN_HDR}/api/x`, { method: "POST", body: "{}", headers: { "content-length": String(MAX_BODY_BYTES + 1) } }))).rejects.toMatchObject({ status: 413 });
    const { readText } = await import("@/lib/http");
    await expect(readText(new Request(`${ORIGIN_HDR}/api/x`, { method: "POST", body: "x".repeat(70 * 1024) }), 64 * 1024)).rejects.toMatchObject({ status: 413 });
  });

  it("POST /api/migration/sources : un export de 25 Mo envoyé par blocs sans Content-Length est refusé (413), rien n'est enregistré", async () => {
    const u = await signUp();
    const created = await api("projects", "POST", { headers: asUser(u.cookie), body: { company: "Borne SARL", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const pid = created.body.project.id as string;
    const big = chunkedBody(25 * 1024 * 1024);
    const req = new Request(`${ORIGIN_HDR}/api/migration/sources?project=${pid}`, { method: "POST", headers: { "content-type": "application/json", ...asUser(u.cookie) }, body: big.stream, duplex: "half" } as RequestInit);
    const res = await R["migration/sources"].POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(413);
    expect(big.pulls()).toBeLessThanOrEqual(22);
    expect((await api("migration/sources", "GET", { query: `?project=${pid}`, headers: asUser(u.cookie) })).body).toEqual([]);
  });
});

describe("W4 — les lectures de session ne renvoient jamais de jeton de session au navigateur", () => {
  it("get-session et list-sessions : identifiants opaques seulement ; /revoke-session (par jeton) n'est plus servie", async () => {
    const u = await signUp();
    const token = decodeURIComponent(/reborn\.session_token=([^;.]+)/.exec(u.cookie)![1]);
    const gs = await authRequest("/get-session", { headers: { cookie: u.cookie } });
    expect(gs.status).toBe(200);
    const gsText = await gs.text();
    const s = JSON.parse(gsText) as { session: Record<string, unknown>; user: Record<string, unknown> };
    expect(typeof s.session.id).toBe("string");
    expect(s.session).not.toHaveProperty("token");
    expect(s.user.email).toBe(u.email);
    const ls = await authRequest("/list-sessions", { headers: { cookie: u.cookie } });
    expect(ls.status).toBe(200);
    const lsText = await ls.text();
    const list = JSON.parse(lsText) as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    for (const x of list) expect(x).not.toHaveProperty("token");
    expect(token.length).toBeGreaterThan(10);
    for (const t of [gsText, lsText]) expect(t).not.toContain(token);
    expect((await authRequest("/revoke-session", { body: { token }, headers: { cookie: u.cookie } })).status).toBe(404);
  });
});

describe("PR-08 — changement de mot de passe : une requête partie avec l'ancien cookie n'efface pas le nouveau", () => {
  it("après /change-password, les réponses 401 (routes du Studio) et get-session avec l'ancien cookie n'effacent aucun cookie ; le nouveau reste valable", async () => {
    const u = await signUp();
    const old = u.cookie;
    const res = await authRequest("/change-password", { body: { currentPassword: u.password, newPassword: "Nouveau-Mot-De-Passe-PR08" }, headers: { cookie: old } });
    expect(res.status).toBe(200);
    const fresh = cookieFrom(res);
    expect(fresh).toMatch(/reborn\.session_token=/);
    // Sondage parti AVANT la réponse (ancien cookie) : 401, sans Set-Cookie d'effacement
    const late = await api("me", "GET", { headers: asUser(old) });
    expect(late.status).toBe(401);
    expect(late.headers.getSetCookie().filter((c) => /^reborn\./.test(c) && (/=;/.test(c) || /max-age=0/i.test(c)))).toEqual([]);
    const lateWrite = await api("projects", "POST", { headers: asUser(old), body: { company: "X", authorized: true } });
    expect(lateWrite.status).toBe(401);
    expect(lateWrite.headers.getSetCookie()).toEqual([]);
    const gs = await authRequest("/get-session", { headers: { cookie: old } });
    expect(await gs.json()).toBeNull();
    expect(gs.headers.getSetCookie().filter((c) => /max-age=0/i.test(c) || /=;/.test(c))).toEqual([]);
    // Le cookie neuf, lui, fonctionne
    expect((await api("me", "GET", { headers: asUser(fresh) })).status).toBe(200);
    // La déconnexion efface toujours les cookies (comportement inchangé hors lectures)
    const out = await authRequest("/sign-out", { body: {}, headers: { cookie: fresh } });
    expect(out.headers.getSetCookie().some((c) => /^reborn\.session_token=;/.test(c) || /^reborn\.session_token=.*max-age=0/i.test(c))).toBe(true);
  });

  it("isCookieDeletion reconnaît les effacements (valeur vide, Max-Age=0, date passée) et pas les prolongations (W2/PR-08)", async () => {
    const { isCookieDeletion } = await import("@/lib/http");
    expect(isCookieDeletion("reborn.session_token=; Max-Age=0; Path=/; HttpOnly")).toBe(true);
    expect(isCookieDeletion("reborn.session_data=abc; Max-Age=0; Path=/")).toBe(true);
    expect(isCookieDeletion("reborn.x=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT")).toBe(true);
    expect(isCookieDeletion("reborn.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax")).toBe(false);
  });
});

describe("W3 — adresse de capture d'un évènement ou d'une observation : jamais autre chose qu'une capture rangée par le Studio", () => {
  it("javascript:, http(s) externe, chemin relatif : écartés à l'enregistrement ; data URL d'image : rangée (/api/shots/…) ; capture déjà rangée : conservée", async () => {
    const op = await signUp();
    await makeOperator(op.email);
    const H = asUser(op.cookie);
    const bad = ["javascript:alert(document.cookie)", "JAVASCRIPT:alert(1)", "https://tiers.exemple/pixel.png", "//tiers.exemple/x.png", "/api/shots/../../etc/passwd", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4="];
    const sent = await api("events", "POST", { headers: H, body: bad.map((u, k) => ({ source: "explorer", type: "action", title: `Capture W3 ${k}`, screenshot_url: u })) });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    const { getState } = await import("@/lib/store");
    const mine = () => getState().events.filter((e) => e.title.startsWith("Capture W3 "));
    expect(mine()).toHaveLength(bad.length);
    for (const e of mine()) expect(e.screenshot_url, e.title).toBeUndefined();
    const good = await api("events", "POST", { headers: H, body: { source: "explorer", type: "action", title: "Capture W3 valide", screenshot_url: PNG } });
    expect(good.status).toBe(200);
    const stored = getState().events.find((e) => e.title === "Capture W3 valide")!.screenshot_url!;
    expect(stored).toMatch(/^\/api\/shots\/[a-f0-9-]{36}\.png$/);
    const again = await api("events", "POST", { headers: H, body: { source: "explorer", type: "action", title: "Capture W3 rejouée", screenshot_url: stored } });
    expect(again.status).toBe(200);
    expect(getState().events.find((e) => e.title === "Capture W3 rejouée")!.screenshot_url).toBe(stored);
    // Observations : même règle (et l'évènement « observation » qui reprend la capture)
    const obs = await api("observations", "POST", { headers: H, body: [{ experiment_id: "W3_EXP_1", inputs: { q: 1 }, observed_output: { total_price: 2 }, screenshot_url: "javascript:alert(1)" }, { experiment_id: "W3_EXP_2", inputs: { q: 2 }, observed_output: { total_price: 4 }, screenshot_url: PNG }] });
    expect(obs.status, JSON.stringify(obs.body)).toBe(200);
    const o1 = getState().observations.find((o) => o.experiment_id === "W3_EXP_1")!;
    const o2 = getState().observations.find((o) => o.experiment_id === "W3_EXP_2")!;
    expect(o1.screenshot_url).toBeUndefined();
    expect(o2.screenshot_url).toMatch(/^\/api\/shots\/[a-f0-9-]{36}\.png$/);
    expect(getState().events.filter((e) => e.type === "observation" && /W3_EXP_1/.test(e.title)).every((e) => e.screenshot_url === undefined)).toBe(true);
  });

  it("état enregistré AVANT ce contrôle : une adresse non sûre n'est jamais relue au redémarrage", async () => {
    const store = await import("@/lib/store");
    store.flushPersist();
    const file = path.join(env.dataDir, "state.json");
    const st = JSON.parse(fs.readFileSync(file, "utf8"));
    st.events.push({ id: "w3-ancien", seq: st.event_seq + 1, ts: new Date().toISOString(), source: "explorer", type: "action", title: "Ancienne capture W3", screenshot_url: "javascript:alert(1)" });
    st.event_seq += 1;
    st.observations.push({ experiment_id: "W3_ANCIEN", inputs: {}, observed_output: {}, status: "success", screenshot_url: "https://tiers.exemple/x.png" });
    fs.writeFileSync(file, JSON.stringify(st));
    store.reloadFromDisk();
    expect(store.getState().events.find((e) => e.id === "w3-ancien")).toBeDefined();
    expect(store.getState().events.find((e) => e.id === "w3-ancien")!.screenshot_url).toBeUndefined();
    expect(store.getState().observations.find((o) => o.experiment_id === "W3_ANCIEN")!.screenshot_url).toBeUndefined();
    expect(store.getState().events.find((e) => e.title === "Capture W3 valide")!.screenshot_url).toMatch(/^\/api\/shots\//);
  });
});

describe("SEC-04 — création de projet : aucun consentement présumé", () => {
  it("identifiants sans credentials_notice_version : 400, ni projet, ni consentement, ni identifiants ; autorisation sans version : 400 ; avec les versions : 201 et les deux consentements", async () => {
    const { LEGAL_DOCUMENTS } = await import("@/lib/legal");
    const { listConsents } = await import("@/lib/auth/consents");
    const u = await signUp();
    const H = asUser(u.cookie);
    const before = (await api("projects", "GET", { headers: H })).body.projects.length;
    const noNotice = await api("projects", "POST", { headers: H, body: { company: "Sans notice", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials: { username: "compte.sec04", password: "Mdp-Sec04-Temoin" } } });
    expect(noNotice.status).toBe(400);
    expect(noNotice.body.error).toMatch(/Confirmez avoir pris connaissance du traitement de vos identifiants/);
    const noAuthz = await api("projects", "POST", { headers: H, body: { company: "Sans version", authorized: true } });
    expect(noAuthz.status).toBe(400);
    expect(noAuthz.body.error).toMatch(/déclaration d'autorisation/);
    expect((await api("projects", "GET", { headers: H })).body.projects).toHaveLength(before);
    expect((await listConsents(u.userId)).filter((c) => c.project_id !== null)).toEqual([]);
    expect(fs.readdirSync(path.join(env.dataDir, "migration", "projects")).some((d) => fs.existsSync(path.join(env.dataDir, "migration", "projects", d, "credentials.enc.json")) && fs.readFileSync(path.join(env.dataDir, "migration", "projects", d, "project.json"), "utf8").includes("Sans notice"))).toBe(false);
    // Versions périmées : 409
    expect((await api("projects", "POST", { headers: H, body: { company: "Périmée", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials: { username: "u", password: "Mdp-Sec04-Temoin" }, credentials_notice_version: "0.1" } })).status).toBe(409);
    const ok = await api("projects", "POST", { headers: H, body: { company: "Avec notice", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials: { username: "compte.sec04", password: "Mdp-Sec04-Temoin" }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
    expect(ok.status).toBe(201);
    expect((await listConsents(u.userId, ok.body.project.id)).map((c) => [c.kind, c.version])).toEqual([
      ["source_authorization", AUTHORIZATION_DECLARATION.version],
      ["credentials_notice", LEGAL_DOCUMENTS.identifiants.version],
    ]);
  });
});


/** Projet Relatio d'un nouveau compte client (jeu de test applicable). */
async function relatioProject(company: string) {
  const u = await signUp({ company });
  const r = await api("projects", "POST", { headers: asUser(u.cookie), body: { company, software: "Relatio 2004", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { u, pid: r.body.project.id as string, H: asUser(u.cookie) };
}

describe("PR-01 — jeu de test Relatio : le logiciel livré porte l'identité du projet, jamais « morel-crm »", () => {
  it("deux comptes appliquent le jeu de test : deux identifiants distincts dérivés de leur projet, nom « <entreprise> — nouveau logiciel »", async () => {
    const a = await relatioProject("Garnier & Fils SARL");
    const b = await relatioProject("Lefèvre Industrie");
    const target = async (x: { pid: string; H: Record<string, string> }) => {
      const r = await api("migration/mapping", "POST", { query: `?project=${x.pid}&fixture=crm`, headers: x.H });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return (await api("migration/mapping", "GET", { query: `?project=${x.pid}`, headers: x.H })).body.current.mapping.target as { id: string; name: string };
    };
    const ta = await target(a);
    const tb = await target(b);
    expect(ta).toEqual({ id: `garnier-fils-sarl-${a.pid.slice(-4)}`, name: "Garnier & Fils SARL — nouveau logiciel" });
    expect(tb).toEqual({ id: `lefevre-industrie-${b.pid.slice(-4)}`, name: "Lefèvre Industrie — nouveau logiciel" });
    expect(ta.id).not.toBe(tb.id);
    for (const t of [ta, tb]) expect(JSON.stringify(t)).not.toMatch(/morel/i);
    // Même dérivation que la proposition automatique
    const { projectAppIdentity, loadProject } = await import("@/lib/migration/project");
    expect(projectAppIdentity(loadProject(a.pid)!)).toEqual(ta);
  });

  it("projet déjà livré : le jeu de test appliqué de nouveau garde le logiciel livré (mise à jour sans perte), son identifiant et son nom", async () => {
    const x = await relatioProject("Atelier Livré");
    expect((await api("migration/mapping", "POST", { query: `?project=${x.pid}&fixture=crm`, headers: x.H })).status).toBe(200);
    const project = await import("@/lib/migration/project");
    const { projectScope } = await import("@/lib/migration/context");
    const delivered = "logiciel-livre-historique";
    // Logiciel livré auparavant sous un autre identifiant (ex. livraison antérieure à ce correctif)
    project.updateProject(x.pid, (p) => {
      p.mappings.at(-1)!.mapping.target = { id: delivered, name: "Nom livré" };
    });
    projectScope.run(x.pid, () => project.recordDeployment({ id: "D_pr01", at: new Date().toISOString(), by: "test", run_id: "RUN_001", app_dir: path.join(env.dataDir, "apps", delivered), backup: null, status: "active" }, { id: delivered, port: 59999 }));
    expect((await api("migration/mapping", "POST", { query: `?project=${x.pid}&fixture=crm`, headers: x.H })).status).toBe(200);
    expect((await api("migration/mapping", "GET", { query: `?project=${x.pid}`, headers: x.H })).body.current.mapping.target).toEqual({ id: delivered, name: "Nom livré" });
  });
});

describe("PR-06 — « point(s) à valider » : le reste réel, à chaque décision", () => {
  it("la raison d'état suit chaque décision, sans nouvelle entrée d'historique ; l'activité distingue le total et les points déjà tranchés", async () => {
    const x = await relatioProject("Compteurs SARL");
    const q = `?project=${x.pid}`;
    const applied = await api("migration/mapping", "POST", { query: `${q}&fixture=crm`, headers: x.H });
    const items = applied.body.review.items as { key: string }[];
    const total = items.length;
    expect(total).toBeGreaterThan(2);
    const reason = async () => (await api("projects/[id]", "GET", { id: x.pid, headers: x.H })).body.project.status_reason as string;
    const history = async () => ((await api("projects/[id]", "GET", { id: x.pid, headers: x.H })).body.details.status_history as unknown[]).length;
    expect(await reason()).toBe(`Correspondances v1 : ${total} point(s) à valider`);
    const h0 = await history();
    expect((await api("migration/decisions", "POST", { query: q, headers: x.H, body: { key: items[0].key, decision: "accepted" } })).status).toBe(200);
    expect(await reason()).toBe(`Correspondances v1 : ${total - 1} point(s) à valider`);
    expect(await history()).toBe(h0);
    // Nouvelle version (décisions reprises) : reste réel dans la raison, total ET déjà tranchés dans l'activité
    expect((await api("migration/mapping", "POST", { query: `${q}&fixture=crm`, headers: x.H })).status).toBe(200);
    expect(await reason()).toBe(`Correspondances v2 : ${total - 1} point(s) à valider`);
    const { getState } = await import("@/lib/store");
    const v2 = getState().events.filter((e) => (e as { project_id?: string }).project_id === x.pid && e.title.startsWith("Correspondances v2 reçues")).at(-1)!;
    expect(v2.detail!.startsWith(`${total} point(s) à examiner (dont 1 déjà tranché)`), v2.detail).toBe(true); // (suivi des erreurs bloquantes : projet sans données ici)
    expect((await api("migration/decisions", "POST", { query: q, headers: x.H, body: { key: items[1].key, decision: "excluded" } })).status).toBe(200);
    expect(await reason()).toBe(`Correspondances v2 : ${total - 2} point(s) à valider`);
    for (const it of items.slice(2)) await api("migration/decisions", "POST", { query: q, headers: x.H, body: { key: it.key, decision: "accepted" } });
    expect(await reason()).toBe("Toutes les correspondances incertaines ont été tranchées : migration possible");
  });
});


/**
 * Formes d'une valeur témoin à rechercher (implémentation indépendante de celle du Studio, comme la revue) :
 * brut, adresse, formulaire, JSON, HTML, hexadécimal, base64 et base64url aux 3 alignements, cœur distinctif.
 */
function witnessForms(v: string): string[] {
  const out = [v, encodeURIComponent(v), new URLSearchParams({ x: v }).toString().slice(2), JSON.stringify(v).slice(1, -1), v.replace(/&/g, "&amp;"), Buffer.from(v).toString("hex"), v.slice(0, 8)];
  for (const o of [0, 1, 2]) {
    for (const enc of ["base64", "base64url"] as const) {
      const b = Buffer.from("\0".repeat(o) + v + "\0\0\0").toString(enc);
      out.push(b.slice(o ? 4 : 0, b.length - 8));
    }
  }
  return [...new Set(out.filter((x) => x.length >= 6))];
}
const leaks = (text: string, forms: string[]) => forms.filter((f) => text.includes(f));

describe("SEC-01 — identifiants de l'ancien logiciel envoyés par l'agent : jamais conservés ni réaffichés, sous aucune forme", () => {
  const WITNESS = "ZQ7legPw-4%k+é&x9";
  const USER = "compte.sec01";
  const forms = witnessForms(WITNESS);
  const ex = (instance: string) => ({ ...asService("explorer"), "x-reborn-executor": instance });

  async function withMission(company: string) {
    const { LEGAL_DOCUMENTS } = await import("@/lib/legal");
    const u = await signUp({ company });
    const H = asUser(u.cookie);
    const r = await api("projects", "POST", { headers: H, body: { company, software: "ERP maison", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: USER, password: WITNESS }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const pid = r.body.project.id as string;
    return { u, H, pid };
  }

  it("observation, schéma d'écran, écran découvert, journal, rapport de connexion et fin de mission : aucune forme de la valeur dans les réponses, state.json, project.json ni la base ; les valeurs métier restent intactes", async () => {
    const { H, pid } = await withMission("Société Témoin SEC01");
    const q = `?project=${pid}`;
    expect((await api("projects/[id]/analysis", "POST", { id: pid, headers: H, body: {} })).status).toBe(202);
    const E = ex("doublure-sec01");
    expect((await api("executor/heartbeat", "POST", { headers: E, body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: [] } })).status).toBe(200);
    const m = (await api("executor/missions/claim", "POST", { headers: E })).body;
    expect(m.project_id).toBe(pid);
    const form = new URLSearchParams({ x: WITNESS }).toString().slice(2);
    const sent = [
      await api("projects/[id]/connection", "POST", { id: pid, headers: E, body: { status: "connected", detail: `formulaire envoyé : utilisateur=${USER}&motdepasse=${form}`, mission_id: m.mission_id } }),
      await api("observations", "POST", { query: q, headers: E, body: { experiment_id: `${m.mission_id}-EXP_CONNEXION`, application: "ERP maison", module: "Connexion", inputs: { utilisateur: USER, motdepasse: WITNESS, nb_passagers: 3, code_passage: "B12" }, observed_output: { resultat: "connecté" }, error: `rejeu : mot_de_passe=${encodeURIComponent(WITNESS)}` } }),
      await api("schema", "POST", { query: q, headers: E, body: { application: "ERP maison", module: "Connexion", fields: [{ name: "motdepasse", type: "password", default: WITNESS }, { name: "mot_de_passe", type: "text", label: "Mot de passe", placeholder: encodeURIComponent(WITNESS) }, { name: "remarque", type: "text", help: `aide ${Buffer.from(`ab${WITNESS}cd`).toString("base64")}` }, { name: "nb_passagers", type: "number", default: 3 }] } }),
      await api("events", "POST", { query: q, headers: E, body: [
        { source: "explorer", type: "form_discovered", title: "Écran de connexion", data: { fields: [{ name: "mdp", type: "text", default: WITNESS }, { name: "client", type: "text" }] } },
        { source: "explorer", type: "log", title: "Requête de connexion", detail: `GET /login?u=${USER}&p=${encodeURIComponent(WITNESS)}` },
        { source: "explorer", type: "action", title: "Saisie", data: { field: "Code d'accès", value: JSON.stringify({ secret: WITNESS }) } },
      ] }),
      await api("executor/missions/[mission_id]/complete", "POST", { params: { mission_id: m.mission_id }, headers: E, body: { outcome: "completed", detail: `fin ; trace ${Buffer.from(`x${WITNESS}`).toString("base64url")} ; formulaire motdepasse=${form}`, disposal: { local_artifacts_purged: true } } }),
    ];
    for (const r of sent) expect(r.status, JSON.stringify(r.body)).toBe(200);
    for (const r of sent) expect(leaks(JSON.stringify(r.body), forms), "réponse à l'agent").toEqual([]);

    // Ce que voient le propriétaire et l'équipe
    const op = await signUp();
    await makeOperator(op.email);
    const views = {
      state: await api("state", "GET", { headers: H }),
      events: await api("events", "GET", { query: q, headers: H }),
      observations: await api("observations", "GET", { query: q, headers: H }),
      project: await api("projects/[id]", "GET", { id: pid, headers: H }),
      analysis: await api("projects/[id]/analysis", "GET", { id: pid, headers: H }),
      schema: await api("schema", "GET", { query: `${q}&all=1`, headers: asUser(op.cookie) }),
      teamState: await api("state", "GET", { headers: asUser(op.cookie) }),
    };
    for (const [name, r] of Object.entries(views)) {
      expect(r.status, name).toBe(200);
      expect(leaks(JSON.stringify(r.body), forms), name).toEqual([]);
      expect(JSON.stringify(r.body), name).not.toContain(USER);
    }
    // Sur le disque : journal, observations, schémas, projet, missions
    const store = await import("@/lib/store");
    store.flushPersist();
    const disk = {
      "state.json": fs.readFileSync(path.join(env.dataDir, "state.json"), "utf8"),
      "project.json": fs.readFileSync(path.join(env.dataDir, "migration", "projects", pid, "project.json"), "utf8"),
      analysis_missions: JSON.stringify((await (await import("@/lib/auth/auth")).getAuthDb()).prepare("SELECT * FROM analysis_missions WHERE project_id = ?").all(pid)),
    };
    for (const [name, text] of Object.entries(disk)) expect(leaks(text, forms), name).toEqual([]);
    // Valeurs métier conservées : un champ « nb_passagers » ou « code_passage » n'est pas un mot de passe
    const obs = store.getState().observations.find((o) => o.experiment_id === `${m.mission_id}-EXP_CONNEXION`)!;
    expect(obs.inputs).toEqual({ utilisateur: "•••", motdepasse: "•••", nb_passagers: 3, code_passage: "B12" });
    // Schéma envoyé (version 1 ; l'écran découvert en crée une seconde)
    const versions = views.schema.body as { fields: { name: string; type: string; default?: unknown; placeholder?: unknown; label?: string }[] }[];
    const sent1 = versions.find((v) => v.fields.some((f) => f.name === "nb_passagers"))!;
    expect(sent1.fields.find((f) => f.name === "nb_passagers")!.default).toBe(3);
    expect(sent1.fields.find((f) => f.name === "motdepasse")!.default).toBe("•••");
    expect(sent1.fields.find((f) => f.name === "mot_de_passe")).toMatchObject({ label: "Mot de passe", placeholder: "•••" });
    const discovered = versions.find((v) => v.fields.some((f) => f.name === "mdp"))!;
    expect(discovered.fields.find((f) => f.name === "mdp")!.default).toBe("•••");
  });

  it("copies enregistrées AVANT ce masquage : effacées des journaux, de project.json et des missions à l'effacement des identifiants (demande du client, échéance de 24 h)", async () => {
    const cred = await import("@/lib/migration/credentials");
    const store = await import("@/lib/store");
    const project = await import("@/lib/migration/project");
    const db = await (await import("@/lib/auth/auth")).getAuthDb();
    const plant = async (pid: string, H: Record<string, string>) => {
      // Copies posées directement (comme un état enregistré avant le correctif), sans passer par les routes
      store.addEvent({ source: "explorer", type: "log", title: `ancienne saisie motdepasse ${WITNESS}`, detail: `adresse ${encodeURIComponent(WITNESS)}`, project_id: pid, data: { value: WITNESS, nested: [{ v: `x ${WITNESS}` }] } });
      project.updateProject(pid, (p) => {
        p.connection = { status: "failed", detail: `refus : ${WITNESS}`, at: new Date().toISOString(), by: "test" };
        p.status_history = [...(p.status_history ?? []), { status: "FAILED", at: new Date().toISOString(), reason: `Connexion échouée — ${encodeURIComponent(WITNESS)}` }];
      });
      expect((await api("projects/[id]/analysis", "POST", { id: pid, headers: H, body: {} })).status).toBe(202);
      const { outsideTransaction } = await import("@/lib/auth/db");
      await outsideTransaction(db, () => db.prepare("UPDATE analysis_missions SET outcome_detail = ? WHERE project_id = ?").run(`ancien détail ${WITNESS}`, pid));
    };
    const remaining = async (pid: string) => {
      await cred.copyScrubsSettled();
      store.flushPersist();
      return {
        state: leaks(fs.readFileSync(path.join(env.dataDir, "state.json"), "utf8"), forms),
        project: leaks(fs.readFileSync(path.join(env.dataDir, "migration", "projects", pid, "project.json"), "utf8"), forms),
        missions: leaks(JSON.stringify(db.prepare("SELECT outcome_detail FROM analysis_missions WHERE project_id = ?").all(pid)), forms),
      };
    };
    // 1) Suppression demandée par le client
    const a = await withMission("Copies anciennes A");
    await plant(a.pid, a.H);
    expect((await remaining(a.pid)).state.length).toBeGreaterThan(0); // témoin : les copies sont bien là avant l'effacement
    const del = await api("projects/[id]/credentials", "DELETE", { id: a.pid, headers: a.H });
    expect(del.body).toMatchObject({ stored: false, erased: true });
    expect(await remaining(a.pid)).toEqual({ state: [], project: [], missions: [] });
    expect(store.getState().events.some((e) => e.title === "ancienne saisie motdepasse •••")).toBe(true); // l'évènement reste, la valeur non
    // 2) Échéance de 24 h atteinte (balayage), même si personne ne revient
    const b = await withMission("Copies anciennes B");
    await plant(b.pid, b.H);
    const restore = cred.setClock(() => Date.now() + 24 * 3600_000 + 1_000);
    try {
      expect(cred.sweepCredentials().credentials).toBeGreaterThanOrEqual(1);
    } finally {
      restore();
    }
    expect(fs.existsSync(path.join(env.dataDir, "migration", "projects", b.pid, "credentials.enc.json"))).toBe(false);
    expect(await remaining(b.pid)).toEqual({ state: [], project: [], missions: [] });
  });

  it("masquage : toutes les formes d'un secret ; un nom de champ métier n'est jamais pris pour un mot de passe", async () => {
    const { redactText, secretVariants } = await import("@/lib/migration/credentials");
    const { isSecretFieldName } = await import("@/lib/migration/redact");
    // Le secret ENTIER encodé dans son contexte (adresse, formulaire, JSON, HTML, hexadécimal, base64 décalé de
    // 0, 1 ou 2 octets) : aucune forme de détection ne subsiste après masquage
    const encodings: [string, (v: string) => string][] = [
      ["brut", (v) => v],
      ["adresse", (v) => `/login?p=${encodeURIComponent(v)}`],
      ["adresse (minuscules)", (v) => encodeURIComponent(v).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase())],
      ["formulaire", (v) => new URLSearchParams({ utilisateur: "u", motdepasse: v }).toString()],
      ["JSON", (v) => JSON.stringify({ secret: v })],
      ["HTML", (v) => `<input value="${v.replace(/&/g, "&amp;")}">`],
      ["hexadécimal", (v) => Buffer.from(`--${v}--`).toString("hex")],
      ...[0, 1, 2].flatMap((o) => [
        [`base64 +${o}`, (v: string) => Buffer.from(`${"x".repeat(o)}${v}yz`).toString("base64")] as [string, (v: string) => string],
        [`base64url +${o}`, (v: string) => Buffer.from(`${"x".repeat(o)}${v}yz`).toString("base64url")] as [string, (v: string) => string],
      ]),
    ];
    for (const [name, enc] of encodings) {
      const text = `avant ${enc(WITNESS)} après`;
      expect(leaks(text, forms).length, `${name} : témoin présent avant masquage`).toBeGreaterThan(0);
      expect(leaks(redactText(text, [WITNESS]), forms), name).toEqual([]);
    }
    expect(redactText("aucun secret ici", [WITNESS])).toBe("aucun secret ici");
    expect(secretVariants("abc")).toEqual(["abc"]); // formes dérivées trop courtes : ignorées (jamais de masquage de fragments)
    expect(secretVariants("test")).toEqual(["test"]); // « 74657374 » : chiffres seulement, jamais masqué (numéro, montant)
    expect(redactText("tél. 74657374 · montant 616263", ["test", "abc"])).toBe("tél. 74657374 · montant 616263");
    for (const n of ["motdepasse", "mot_de_passe", "Mot de passe", "password", "user_password", "userPassword", "pwd", "MDP", "passwd"]) expect(isSecretFieldName(n), n).toBe(true);
    for (const n of ["nb_passagers", "passeport", "compass", "code_passage", "passager", "impasse", "client"]) expect(isSecretFieldName(n), n).toBe(false);
  });
});

describe("W1 — en-têtes de sécurité du Studio (pages, API, fichiers)", () => {
  it("next.config : CSP (frame-ancestors 'none', base-uri 'none', object-src 'none'), X-Frame-Options DENY, nosniff, no-referrer, sur toutes les adresses ; HSTS seulement en https", async () => {
    const { vi } = await import("vitest");
    const load = async (publicUrl?: string) => {
      vi.resetModules();
      const before = process.env.REBORN_PUBLIC_URL;
      if (publicUrl) process.env.REBORN_PUBLIC_URL = publicUrl;
      else delete process.env.REBORN_PUBLIC_URL;
      try {
        const cfg = (await import("../next.config")).default;
        return await cfg.headers!();
      } finally {
        if (before === undefined) delete process.env.REBORN_PUBLIC_URL;
        else process.env.REBORN_PUBLIC_URL = before;
      }
    };
    const rules = await load();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    const h = Object.fromEntries(rules[0].headers.map((x) => [x.key.toLowerCase(), x.value]));
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    const csp = h["content-security-policy"];
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "object-src 'none'", "form-action 'self'", "frame-src 'none'"]) expect(csp, d).toContain(d);
    expect(csp).not.toContain("unsafe-eval"); // développement seulement
    expect(csp).not.toMatch(/https?:\/\/|\*/); // aucune origine tierce
    expect(h["strict-transport-security"]).toBeUndefined();
    const secure = Object.fromEntries((await load("https://studio.exemple.fr"))[0].headers.map((x) => [x.key.toLowerCase(), x.value]));
    expect(secure["strict-transport-security"]).toBe("max-age=31536000");
    expect(secure["content-security-policy"]).toContain("upgrade-insecure-requests");
  });

  it("handler() : Strict-Transport-Security sur les réponses de l'API dès que REBORN_PUBLIC_URL est en https (lu au démarrage, pas au build)", async () => {
    const before = process.env.REBORN_PUBLIC_URL;
    try {
      delete process.env.REBORN_PUBLIC_URL;
      expect((await api("me", "GET")).headers.get("strict-transport-security")).toBeNull();
      process.env.REBORN_PUBLIC_URL = "https://127.0.0.1";
      const r = await api("me", "GET");
      expect(r.status).toBe(401);
      expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000");
    } finally {
      if (before === undefined) delete process.env.REBORN_PUBLIC_URL;
      else process.env.REBORN_PUBLIC_URL = before;
    }
  });
});


describe("SEC-06 — suppression d'un compte ou d'un projet sur demande (npm run account -- delete / delete-project)", () => {
  let appsDir = "";
  let before: string | undefined;
  beforeAll(() => {
    before = process.env.REBORN_APPS_DIR;
    appsDir = fs.mkdtempSync(path.join(env.dataDir, "apps-")); // jamais le dossier generated/ réel
    process.env.REBORN_APPS_DIR = appsDir;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.REBORN_APPS_DIR;
    else process.env.REBORN_APPS_DIR = before;
  });
  const erase = (body: unknown, headers: Record<string, string> = asOperatorCli()) => callRoute(R["admin/erase"], "POST", "/api/admin/erase", { body, headers });

  /** Fichiers du dossier de données (récursif) contenant l'une des valeurs : { fichier: [valeurs] }. */
  function traces(values: string[], skip: (rel: string) => boolean = () => false): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        const rel = path.relative(env.dataDir, f);
        if (skip(rel)) continue;
        if (e.isDirectory()) walk(f);
        else if (e.isFile()) {
          const buf = fs.readFileSync(f);
          const hits = values.filter((v) => buf.includes(Buffer.from(v, "utf8")));
          if (hits.length) out[rel] = hits;
        }
      }
    };
    walk(env.dataDir);
    return out;
  }

  it("clé de l'opérateur exigée (sans elle : 401 ; depuis une page web ou avec un compte, même opérateur : 403) ; aperçu sans --confirm : rien n'est supprimé", async () => {
    const u = await signUp({ company: "Aperçu SARL" });
    const p = await api("projects", "POST", { headers: asUser(u.cookie), body: { company: "Aperçu SARL", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    const pid = p.body.project.id as string;
    expect((await erase({ project_id: pid }, {})).status).toBe(401);
    expect((await erase({ project_id: pid }, { ...asOperatorCli(), origin: "http://127.0.0.1:3000" })).status).toBe(403);
    const op = await signUp();
    await makeOperator(op.email);
    expect((await erase({ project_id: pid }, asUser(op.cookie))).status).toBe(403);
    expect((await erase({ project_id: pid }, { cookie: op.cookie })).status).toBe(403); // écriture par cookie sans Origin : refus CSRF, avant même la clé
    const dry = await erase({ email: u.email, dry_run: true });
    expect(dry.status, JSON.stringify(dry.body)).toBe(200);
    expect(dry.body).toMatchObject({ dry_run: true, account: { email: u.email, projects: [{ project_id: pid, company: "Aperçu SARL" }] } });
    expect((await api("projects/[id]", "GET", { id: pid, headers: asUser(u.cookie) })).status).toBe(200);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(200);
    expect((await erase({ project_id: "MIG_00000000" })).status).toBe(404);
    expect((await erase({ project_id: pid, email: u.email })).status).toBe(400);
  });

  it("delete <email> : compte, projets, identifiants (clé comprise), logiciel livré, captures, journal, observations, missions, sessions, liens en attente — aucune trace ; seuls les consentements (sans nom ni e-mail) restent", async () => {
    const { LEGAL_DOCUMENTS } = await import("@/lib/legal");
    const who = { firstName: "Ophélie", lastName: "Témoin-Effacement", company: "Effacement Témoin SARL" };
    const u = await signUp(who);
    const H = asUser(u.cookie);
    const created = await api("projects", "POST", { headers: H, body: { company: who.company, software: "ERP maison", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: "compte.effacement", password: "Mdp-Effacement-Temoin" }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
    const pid = created.body.project.id as string;
    const credId = (JSON.parse(fs.readFileSync(path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json"), "utf8")) as { id: string }).id;
    // Mission prise par l'exécuteur, évènement avec capture, observation
    expect((await api("projects/[id]/analysis", "POST", { id: pid, headers: H, body: {} })).status).toBe(202);
    const E = { ...asService("explorer"), "x-reborn-executor": "doublure-sec06" };
    await api("executor/heartbeat", "POST", { headers: E, body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: [] } });
    expect((await api("executor/missions/claim", "POST", { headers: E })).body.project_id).toBe(pid);
    expect((await api("events", "POST", { query: `?project=${pid}`, headers: E, body: { source: "explorer", type: "action", title: `Écran de ${who.company}`, screenshot_url: PNG } })).status).toBe(200);
    expect((await api("observations", "POST", { query: `?project=${pid}`, headers: E, body: { experiment_id: "SEC06_EXP", inputs: { client: who.company }, observed_output: { total: 1 } } })).status).toBe(200);
    expect(fs.readdirSync(path.join(env.dataDir, "shots", pid)).length).toBe(1);
    // Logiciel livré (dossier marqué au nom du projet), lien de réinitialisation en attente, échec de connexion compté
    const project = await import("@/lib/migration/project");
    const { projectScope } = await import("@/lib/migration/context");
    const appId = `effacement-${pid.slice(-4)}`;
    fs.mkdirSync(path.join(appsDir, appId, "data"), { recursive: true });
    fs.writeFileSync(path.join(appsDir, appId, ".reborn-project"), pid);
    fs.writeFileSync(path.join(appsDir, appId, "data", "app.db"), `base du logiciel livré de ${who.company}`);
    projectScope.run(pid, () => project.recordDeployment({ id: "D_sec06", at: new Date().toISOString(), by: `${who.firstName} ${who.lastName}`, run_id: "RUN_001", app_dir: path.join(appsDir, appId), backup: null, status: "active" }, { id: appId, port: 59998 }));
    fs.mkdirSync(path.join(env.dataDir, "outbox"), { recursive: true });
    fs.writeFileSync(path.join(env.dataDir, "outbox", "sec06.json"), JSON.stringify({ kind: "password_reset", to: u.email, link: "http://127.0.0.1:3000/reinitialisation#jeton-fictif", created_at: new Date().toISOString() }));
    expect((await signIn(u.email, "Mauvais-Mot-De-Passe-1")).status).toBe(401);

    const res = await erase({ email: u.email });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.account).toMatchObject({ email: u.email, removed: { user: 1, outbox: 1, lockout: 1 }, projects: [{ project_id: pid, app: { id: appId, removed: true }, credentials_erased: true, files_removed: true }] });
    expect(res.body.account.removed.sessions).toBeGreaterThanOrEqual(1);
    expect(res.body.account.consents_kept).toBeGreaterThanOrEqual(4);
    // Plus rien du projet ni du compte
    const store = await import("@/lib/store");
    const cred = await import("@/lib/migration/credentials");
    await cred.copyScrubsSettled();
    store.flushPersist();
    expect(fs.existsSync(path.join(env.dataDir, "migration", "projects", pid))).toBe(false);
    expect(fs.existsSync(path.join(env.dataDir, "shots", pid))).toBe(false);
    expect(fs.existsSync(path.join(appsDir, appId))).toBe(false);
    expect(fs.existsSync(path.join(cred.keysDir(), `${credId}.key`))).toBe(false);
    expect(project.projectExists(pid)).toBe(false);
    const st = store.getState();
    expect(st.events.filter((e) => JSON.stringify(e).includes(pid))).toEqual([]);
    expect(st.observations.filter((o) => JSON.stringify(o).includes(pid) || o.experiment_id === "SEC06_EXP")).toEqual([]);
    expect(st.investigations.filter((i) => i.project_id === pid)).toEqual([]);
    const db = await (await import("@/lib/auth/auth")).getAuthDb();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE id = ?`).get(u.userId)).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM session WHERE userId = ?").get(u.userId)).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM account WHERE userId = ?").get(u.userId)).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_missions WHERE project_id = ?").get(pid)).toMatchObject({ n: 0 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = ?").get(u.userId) as { n: number }).n).toBeGreaterThanOrEqual(4);
    // Aucune trace du nom, de l'e-mail ni de l'entreprise, nulle part dans le dossier de données (auth.db comprise) ;
    // l'identifiant du projet ne subsiste que dans les consentements conservés comme preuve (auth.db).
    expect(traces([u.email, who.lastName, who.company, "compte.effacement", "Mdp-Effacement-Temoin"])).toEqual({});
    expect(traces([pid], (rel) => rel === "auth.db")).toEqual({});
    // Le compte n'existe plus : ancienne session refusée, connexion refusée
    expect((await api("me", "GET", { headers: H })).status).toBe(401);
    expect((await signIn(u.email, u.password)).status).toBe(401);
  });
});


describe("SEC-05 — nouvelle version des conditions : acceptation redemandée, écritures refusées en attendant", () => {
  it("compte dont l'acceptation porte sur une version antérieure : lecture permise, écritures 403 (sauf retraits), nouvelle acceptation à la version en vigueur, puis tout refonctionne", async () => {
    const { LEGAL_DOCUMENTS } = await import("@/lib/legal");
    const { outsideTransaction } = await import("@/lib/auth/db");
    const db = await (await import("@/lib/auth/auth")).getAuthDb();
    const u = await signUp();
    const H = asUser(u.cookie);
    const p = await api("projects", "POST", { headers: H, body: { company: "Conditions SARL", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: "u", password: "Mdp-Conditions-1" }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } });
    expect(p.status).toBe(201);
    const pid = p.body.project.id as string;
    expect((await api("me", "GET", { headers: H })).body.consents_required).toEqual([]);
    // Version en vigueur (1.0) postérieure à celle acceptée par ce compte (0.9)
    await outsideTransaction(db, () => db.prepare("UPDATE consents SET version = '0.9' WHERE user_id = ? AND kind = 'terms_acceptance'").run(u.userId));
    const me = await api("me", "GET", { headers: H });
    expect(me.status).toBe(200);
    expect(me.body.consents_required).toEqual([{ kind: "terms_acceptance", document: "conditions", version: LEGAL_DOCUMENTS.conditions.version, title: "Conditions d'utilisation", path: "/legal/conditions" }]);
    expect((await api("projects", "GET", { headers: H })).status).toBe(200);
    const refused = await api("projects", "POST", { headers: H, body: { company: "Bloqué", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ ok: false, code: "consents_required" });
    expect(refused.body.error).toMatch(/^Nouvelles conditions à accepter : Conditions d'utilisation \(version 1\.0\)/);
    expect((await api("me", "PATCH", { headers: H, body: { firstName: "Bloqué" } })).status).toBe(403);
    // Un retrait reste toujours possible (identifiants confiés)
    expect((await api("projects/[id]/credentials", "DELETE", { id: pid, headers: H })).body).toMatchObject({ stored: false });
    // Nouvelle acceptation : version affichée exigée, jamais présumée ; version périmée refusée
    expect((await api("me/consents", "POST", { headers: H, body: {} })).status).toBe(400);
    expect((await api("me/consents", "POST", { headers: H, body: { termsVersion: "0.9" } })).status).toBe(409);
    const ok = await api("me/consents", "POST", { headers: H, body: { termsVersion: LEGAL_DOCUMENTS.conditions.version } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.recorded.map((c: { kind: string; version: string }) => [c.kind, c.version])).toEqual([["terms_acceptance", LEGAL_DOCUMENTS.conditions.version]]);
    expect((await api("me", "GET", { headers: H })).body.consents_required).toEqual([]);
    expect((await api("projects", "POST", { headers: H, body: { company: "Débloqué", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version } })).status).toBe(201);
    // Les agents (jetons de service) ne sont jamais concernés
    expect((await api("executor/heartbeat", "POST", { headers: { ...asService("explorer"), "x-reborn-executor": "doublure-sec05" }, body: { version: "1.1", networks: ["public"], login: "cdp", max_concurrent: 1, active_missions: [] } })).status).toBe(200);
  });
});
