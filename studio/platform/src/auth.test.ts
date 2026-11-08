/**
 * Comptes REBORN et contrôle d'accès côté serveur (lot A1) : vrais handlers (Better Auth et routes
 * du Studio) appelés en mémoire, base SQLite réelle dans un dossier temporaire, secrets aléatoires.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { asOperatorCli, asService, asUser, authRequest, callRoute, cleanupAuthEnv, consentFields, cookieFrom, makeOperator, ORIGIN, setupAuthEnv, signIn, signUp, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, consentStatement, LEGAL_DOCUMENTS } from "@/lib/legal";

let env: TestEnv;
const R: Record<string, Record<string, RouteHandler>> = {};
const ROUTES = [
  "me", "projects", "projects/[id]", "projects/[id]/select", "projects/[id]/credentials", "migration/project", "migration/sources", "session", "health", "state", "auth/[...all]",
  // Revue de sécurité A1 : routes de l'atelier, flux, captures, remise des identifiants
  "revision", "events", "observations", "investigations", "schema", "rules", "app", "compare", "compute", "scenarios", "reset", "contracts", "migration/contracts",
  "stream", "shots/[id]", "projects/[id]/mission", "projects/[id]/credentials/redeem", "projects/[id]/analysis",
];

beforeAll(async () => {
  env = setupAuthEnv("reborn-auth-");
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Record<string, RouteHandler>;
});
afterAll(() => cleanupAuthEnv());

/** Appel d'une route du Studio : `[id]` remplacé, paramètres de chemin transmis comme le fait Next. */
function api(route: string, method: string, opts: { id?: string; query?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return callRoute(R[route], method, `/api/${route.replace("[id]", opts.id ?? "")}${opts.query ?? ""}`, { params: opts.id ? { id: opts.id } : {}, body: opts.body, headers: opts.headers });
}
const db = async () => (await import("@/lib/auth/auth")).getAuthDb();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(";")).join("\n"), "utf8").toString("base64");
const newProject = (u: TestUser, body: Record<string, unknown> = {}) => api("projects", "POST", { headers: asUser(u.cookie), body: { company: "Entreprise test", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, ...body } });
const indexOf = () => JSON.parse(fs.readFileSync(path.join(env.dataDir, "migration", "projects.json"), "utf8")) as { current: string | null; projects: { id: string; owner_id?: string }[] };

describe("Inscription et consentements", () => {
  it("refuse l'inscription sans acceptation des CGU ET prise de connaissance de la politique, aux versions courantes", async () => {
    const base = { email: "sans.accord@exemple.test", password: "Mot-De-Passe-Long-1", firstName: "Sans", lastName: "Accord", company: "X" };
    for (const extra of [{}, { termsVersion: LEGAL_DOCUMENTS.conditions.version }, { privacyVersion: LEGAL_DOCUMENTS.confidentialite.version }, { termsVersion: "0.9", privacyVersion: LEGAL_DOCUMENTS.confidentialite.version }]) {
      const r = await authRequest("/sign-up/email", { body: { ...base, ...extra } });
      expect(r.status).toBe(400);
      const b = await r.json();
      expect(b.code).toBe("CONSENT_REQUIRED");
      expect(b.message).toMatch(/conditions d'utilisation \(version 1\.0\).*politique de confidentialité \(version 1\.0\)/);
      expect(r.headers.getSetCookie()).toEqual([]);
    }
    const d = await db();
    expect(d.prepare(`SELECT COUNT(*) AS n FROM "user" WHERE email = ?`).get(base.email)).toMatchObject({ n: 0 });
  });

  it("enregistre les deux consentements avec le compte (document, version, empreinte du texte exact)", async () => {
    const u = await signUp({ firstName: "Alice", lastName: "Martin", company: "Garage Martin" });
    const me = await api("me", "GET", { headers: asUser(u.cookie) });
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({ id: u.userId, email: u.email, firstName: "Alice", lastName: "Martin", company: "Garage Martin", role: "client" });
    const consents = me.body.consents as { kind: string; document: string; version: string; statement_sha256: string; project_id: string | null }[];
    expect(consents.map((c) => c.kind)).toEqual(["terms_acceptance", "privacy_acknowledgement"]);
    expect(consents[0]).toMatchObject({ document: "conditions", version: LEGAL_DOCUMENTS.conditions.version, project_id: null, statement_sha256: sha(consentStatement("terms_acceptance").text) });
    expect(consents[1]).toMatchObject({ document: "confidentialite", version: LEGAL_DOCUMENTS.confidentialite.version, statement_sha256: sha(consentStatement("privacy_acknowledgement").text) });
    // name = « Prénom Nom » calculé par le serveur
    expect((await db()).prepare(`SELECT name FROM "user" WHERE id = ?`).get(u.userId)).toMatchObject({ name: "Alice Martin" });
  });

  it("ne laisse jamais choisir ni modifier le rôle", async () => {
    const r = await authRequest("/sign-up/email", { body: { email: "pirate@exemple.test", password: "Mot-De-Passe-Long-1", firstName: "P", lastName: "R", role: "operator", ...consentFields() } });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("UNEXPECTED_FIELD");
    expect((await db()).prepare(`SELECT COUNT(*) AS n FROM "user" WHERE email = 'pirate@exemple.test'`).get()).toMatchObject({ n: 0 });
    const u = await signUp();
    // Fonctions de Better Auth non exposées : modification de profil, suppression, changement d'e-mail
    for (const p of ["/update-user", "/delete-user", "/change-email"]) {
      const res = await authRequest(p, { body: { role: "operator", name: "X", newEmail: "y@exemple.test" }, headers: { cookie: u.cookie } });
      expect(res.status, p).toBe(404);
    }
    expect((await api("me", "PATCH", { headers: asUser(u.cookie), body: { role: "operator" } })).status).toBe(400);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).body.user).toMatchObject({ role: "client" });
  });

  it("valide les champs, normalise l'adresse et refuse un doublon (messages en français)", async () => {
    const short = await authRequest("/sign-up/email", { body: { email: "court@exemple.test", password: "123456789", firstName: "A", lastName: "B", ...consentFields() } });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ code: "PASSWORD_TOO_SHORT", message: "Mot de passe trop court : 10 caractères au minimum." });
    const long = await authRequest("/sign-up/email", { body: { email: "long@exemple.test", password: "x".repeat(129), firstName: "A", lastName: "B", ...consentFields() } });
    expect((await long.json()).code).toBe("PASSWORD_TOO_LONG");
    const noName = await authRequest("/sign-up/email", { body: { email: "anonyme@exemple.test", password: "Mot-De-Passe-Long-1", firstName: "  ", lastName: "B", ...consentFields() } });
    expect(await noName.json()).toMatchObject({ code: "INVALID_FIELDS", message: "Prénom requis." });
    const u = await signUp({ email: "Majuscules@Exemple.TEST" });
    expect(u.email).toBe("majuscules@exemple.test");
    expect((await signIn("MAJUSCULES@exemple.test", u.password)).status).toBe(200);
    const dup = await authRequest("/sign-up/email", { body: { email: "majuscules@exemple.test", password: "Autre-Mot-De-Passe-1", firstName: "A", lastName: "B", ...consentFields() } });
    expect(dup.status).toBe(422);
    expect((await dup.json()).message).toBe("Un compte existe déjà avec cette adresse e-mail.");
  });
});

describe("Connexion, sessions et verrouillage", () => {
  it("connecte avec le bon mot de passe ; refuse un mauvais mot de passe ou une adresse inconnue de la même façon", async () => {
    const u = await signUp();
    const ok = await authRequest("/sign-in/email", { body: { email: u.email, password: u.password } });
    expect(ok.status).toBe(200);
    const sc = ok.headers.getSetCookie();
    expect(sc).toHaveLength(1);
    expect(sc[0]).toMatch(/^reborn\.session_token=[^;]+; Max-Age=604800; Path=\/; HttpOnly; SameSite=Lax$/); // pas de Secure en http
    expect((await api("me", "GET", { headers: asUser(cookieFrom(ok)) })).status).toBe(200);
    const bad = await signIn(u.email, "mauvais-mot-de-passe");
    const unknown = await signIn("inconnu@exemple.test", "mauvais-mot-de-passe");
    expect(bad).toMatchObject({ status: 401, cookie: "", body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "E-mail ou mot de passe incorrect." } });
    expect(unknown).toMatchObject({ status: 401, body: bad.body });
  });

  it("verrouille le compte 15 minutes après 8 échecs en 15 minutes (429, message clair), sans gêner les autres comptes", async () => {
    const u = await signUp();
    const other = await signUp();
    for (let i = 0; i < 8; i++) expect((await signIn(u.email, `faux-mot-de-passe-${i}`)).status).toBe(401);
    const locked = await signIn(u.email, u.password); // même avec le bon mot de passe
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ code: "ACCOUNT_LOCKED", message: "Trop de tentatives de connexion échouées pour ce compte. Réessayez dans 15 minutes." });
    expect(locked.cookie).toBe("");
    expect((await signIn(u.email.toUpperCase(), u.password)).status).toBe(429); // casse indifférente
    expect((await signIn(other.email, other.password)).status).toBe(200);
    // L'adresse n'est pas stockée en clair dans le compteur
    const d = await db();
    const rows = d.prepare("SELECT email_sha256, locked_until FROM auth_lockout").all() as { email_sha256: string; locked_until: number }[];
    expect(JSON.stringify(rows)).not.toContain(u.email);
    const row = rows.find((r) => r.email_sha256 === sha(u.email))!;
    expect(row.locked_until - Date.now()).toBeGreaterThan(14 * 60_000);
    // Fin du blocage (échéance simulée en base) : connexion acceptée, compteur remis à zéro
    d.prepare("UPDATE auth_lockout SET locked_until = ? WHERE email_sha256 = ?").run(Date.now() - 1, sha(u.email));
    expect((await signIn(u.email, u.password)).status).toBe(200);
    expect(d.prepare("SELECT COUNT(*) AS n FROM auth_lockout WHERE email_sha256 = ?").get(sha(u.email))).toMatchObject({ n: 0 });
  });

  it("ne compte que les échecs des 15 dernières minutes", async () => {
    const u = await signUp();
    for (let i = 0; i < 7; i++) await signIn(u.email, `faux-${i}-mot-de-passe`);
    const d = await db();
    d.prepare("UPDATE auth_lockout SET window_start = ? WHERE email_sha256 = ?").run(Date.now() - 16 * 60_000, sha(u.email));
    expect((await signIn(u.email, "encore-un-faux-mot")).status).toBe(401); // 8e échec, mais hors fenêtre : compteur reparti à 1
    expect((await signIn(u.email, u.password)).status).toBe(200);
  });

  it("déconnexion effective : l'ancien cookie ne donne plus accès", async () => {
    const u = await signUp();
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(200);
    const out = await authRequest("/sign-out", { body: {}, headers: { cookie: u.cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().some((c) => /^reborn\.session_token=;.*Max-Age=0/.test(c))).toBe(true);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(401);
  });

  it("« se déconnecter de tous les appareils » révoque toutes les sessions", async () => {
    const u = await signUp();
    const a = (await signIn(u.email, u.password)).cookie;
    const b = (await signIn(u.email, u.password)).cookie;
    expect((await authRequest("/revoke-sessions", { body: {}, headers: { cookie: a } })).status).toBe(200);
    for (const c of [a, b, u.cookie]) expect((await api("me", "GET", { headers: asUser(c) })).status).toBe(401);
    expect((await db()).prepare("SELECT COUNT(*) AS n FROM session WHERE userId = ?").get(u.userId)).toMatchObject({ n: 0 });
  });

  it("changement de mot de passe : les autres sessions sont toujours révoquées", async () => {
    const u = await signUp();
    const other = (await signIn(u.email, u.password)).cookie;
    const res = await authRequest("/change-password", { body: { currentPassword: u.password, newPassword: "Nouveau-Mot-De-Passe-42" }, headers: { cookie: u.cookie } });
    expect(res.status).toBe(200);
    expect((await api("me", "GET", { headers: asUser(other) })).status).toBe(401);
    expect((await api("me", "GET", { headers: asUser(cookieFrom(res)) })).status).toBe(200); // nouvelle session de cet appareil
    expect((await signIn(u.email, u.password)).status).toBe(401);
    expect((await signIn(u.email, "Nouveau-Mot-De-Passe-42")).status).toBe(200);
  });

  it("session glissante sur 7 jours : prolongée en base et cookie renouvelé par les routes du Studio", async () => {
    const u = await signUp();
    const d = await db();
    const old = new Date(Date.now() + 5 * 864e5).toISOString(); // dernière prolongation il y a 2 jours
    d.prepare("UPDATE session SET expiresAt = ? WHERE userId = ?").run(old, u.userId);
    const r = await api("me", "GET", { headers: asUser(u.cookie) });
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie().some((c) => /^reborn\.session_token=.+; Max-Age=604800/.test(c))).toBe(true);
    const row = d.prepare("SELECT expiresAt FROM session WHERE userId = ?").get(u.userId) as { expiresAt: string };
    expect(Date.parse(row.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 864e5);
  });
});

describe("/api/me", () => {
  it("renvoie un DTO minimal et modifie prénom, nom, entreprise (validation zod)", async () => {
    const u = await signUp({ firstName: "Jean", lastName: "Dupont", company: "" });
    const before = await api("me", "GET", { headers: asUser(u.cookie) });
    expect(Object.keys(before.body.user).sort()).toEqual(["company", "email", "firstName", "id", "lastName", "role"]);
    expect(before.body.user.company).toBeNull();
    const patched = await api("me", "PATCH", { headers: asUser(u.cookie), body: { firstName: "  Jeanne ", company: "Dupont & Fils" } });
    expect(patched.status).toBe(200);
    expect(patched.body.user).toMatchObject({ firstName: "Jeanne", lastName: "Dupont", company: "Dupont & Fils" });
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).body.user).toMatchObject({ firstName: "Jeanne", company: "Dupont & Fils" });
    expect((await db()).prepare(`SELECT name FROM "user" WHERE id = ?`).get(u.userId)).toMatchObject({ name: "Jeanne Dupont" });
    for (const body of [{ firstName: "" }, { email: "autre@exemple.test" }, { lastName: "x".repeat(81) }]) {
      expect((await api("me", "PATCH", { headers: asUser(u.cookie), body })).status).toBe(400);
    }
    expect((await api("me", "GET", { headers: asService("all") })).status).toBe(403); // un service n'a pas de compte
  });
});

describe("Contrôle d'accès : anonyme, CSRF, jetons de service", () => {
  it("anonyme : 401 « Connexion requise » ; /api/health public et réduit", async () => {
    for (const [route, query] of [["me", ""], ["projects", ""], ["state", ""], ["migration/sources", "?project=MIG_00000000"]] as const) {
      const r = await api(route, "GET", { query });
      expect(r.status, route).toBe(401);
      expect(r.body).toEqual({ ok: false, error: "Connexion requise" });
    }
    const h = await api("health", "GET");
    expect(h.status).toBe(200);
    expect(h.body).toEqual({ ok: true, service: "reborn", contract_version: expect.any(String), auth: { authenticated: false } });
    const svc = await api("health", "GET", { headers: asService("explorer") });
    expect(svc.body).toMatchObject({ auth: { authenticated: true, kind: "service", service: "explorer" }, counts: expect.any(Object) });
    expect(JSON.stringify(svc.body)).not.toContain(env.tokens.explorer);
    expect((await api("health", "GET", { headers: { authorization: "Bearer faux-jeton-faux-jeton" } })).body.auth).toEqual({ authenticated: false, token_valid: false });
  });

  it("CSRF : un cookie sans Origin ou avec une Origin étrangère est refusé ; même origine ou sec-fetch-site same-origin accepté", async () => {
    const u = await signUp();
    const patch = (headers: Record<string, string>) => api("me", "PATCH", { headers: { cookie: u.cookie, ...headers }, body: { company: "Nouvelle" } });
    expect((await patch({})).status).toBe(403);
    expect((await patch({ origin: "https://evil.example" })).status).toBe(403);
    expect((await patch({ origin: "http://127.0.0.1:4000" })).status).toBe(403); // autre port du même poste
    expect((await patch({ origin: "null" })).status).toBe(403);
    expect((await patch({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await patch({ origin: ORIGIN })).status).toBe(200);
    expect((await patch({ "sec-fetch-site": "same-origin" })).status).toBe(200);
    // Lecture (GET) : pas d'Origin exigée
    expect((await api("me", "GET", { headers: { cookie: u.cookie } })).status).toBe(200);
  });

  it("jeton de service : sans Origin accepté, Origin étrangère refusée, jeton invalide refusé, ancien cookie reborn_token ignoré", async () => {
    const u = await signUp();
    const pid = (await newProject(u, { legacy_url: "http://127.0.0.1:9/" })).body.project.id as string;
    const upload = (headers: Record<string, string>) => api("migration/sources", "POST", { query: `?project=${pid}`, headers, body: { name: "clients.csv", content_base64: csv([["id"], ["1"]]) } });
    // SPEC §6 (lot C4) : l'exécuteur n'écrit dans le projet d'un client qu'en titulaire du prêt de la mission en cours
    expect((await upload(asService("explorer"))).status).toBe(403);
    expect((await api("projects/[id]/analysis", "POST", { id: pid, headers: asUser(u.cookie), body: { without_credentials: true } })).status).toBe(202);
    expect((await api("projects/[id]/mission", "POST", { id: pid, headers: asService("explorer") })).status).toBe(200); // prise de la mission (take_mission 1.0)
    expect((await upload(asService("explorer"))).status).toBe(200);
    // Le propriétaire annule l'analyse : le prêt est libéré (l'exécuteur 1.0 ne tient qu'une mission à la fois)
    expect((await api("projects/[id]/analysis", "DELETE", { id: pid, headers: asUser(u.cookie) })).body.state).toBe("cancelled");
    expect((await upload(asService("explorer"))).status).toBe(403);
    expect((await upload({ ...asService("explorer"), origin: "https://evil.example" })).status).toBe(403);
    expect((await upload({ ...asService("explorer"), "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await upload({ authorization: "Bearer jeton-invalide-jeton-invalide" })).status).toBe(401);
    expect((await upload({ authorization: "Bearer jeton-invalide-jeton-invalide" })).body.error).toBe("Jeton de service invalide");
    expect((await api("projects", "GET", { headers: { cookie: `reborn_token=${env.tokens.all}` } })).status).toBe(401);
    // Un service ne crée pas de projet
    expect((await api("projects", "POST", { headers: asService("all"), body: { company: "X", authorized: true } })).status).toBe(403);
  });

  it("/api/session répond 410 à toutes les méthodes, sans poser de cookie", async () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const r = await api("session", m, { body: m === "GET" ? undefined : { token: env.tokens.all } });
      expect(r.status, m).toBe(410);
      expect(r.body.error).toBe("Remplacé par les comptes REBORN : connectez-vous sur /connexion");
      expect(r.headers.getSetCookie()).toEqual([]);
    }
  });
});

describe("Projets : propriété et isolation entre clients", () => {
  let a: TestUser, b: TestUser, pa: string, pb: string;
  beforeAll(async () => {
    a = await signUp({ firstName: "Alice", lastName: "Martin" });
    b = await signUp({ firstName: "Bruno", lastName: "Petit" });
    const ra = await newProject(a, { company: "Garage Martin", authorized_by: "Usurpateur", authorization_version: AUTHORIZATION_DECLARATION.version, legacy_url: "http://127.0.0.1:9/", credentials: { username: "migration", password: "S3cret-Ancien-Logiciel" }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version });
    expect(ra.status).toBe(201);
    pa = ra.body.project.id;
    pb = (await newProject(b, { company: "Petit SARL" })).body.project.id;
  });

  it("le propriétaire est le compte ; l'autorisation est enregistrée à son nom avec la version ; le projet de repli ne change pas", async () => {
    const idx = indexOf();
    expect(idx.projects.find((p) => p.id === pa)?.owner_id).toBe(a.userId);
    expect(idx.projects.find((p) => p.id === pb)?.owner_id).toBe(b.userId);
    expect(idx.current).toBeNull();
    const detail = await api("projects/[id]", "GET", { id: pa, headers: asUser(a.cookie) });
    expect(detail.body.details.authorization).toMatchObject({ by: "Alice Martin", statement: AUTHORIZATION_DECLARATION.text, version: AUTHORIZATION_DECLARATION.version });
    expect(detail.body.project).not.toHaveProperty("current");
    expect(JSON.stringify(detail.body)).not.toContain("S3cret-Ancien-Logiciel");
    const consents = (await api("me", "GET", { headers: asUser(a.cookie) })).body.consents as { kind: string; project_id: string | null; document: string; version: string; statement_sha256: string }[];
    const mine = consents.filter((c) => c.project_id === pa);
    expect(mine.map((c) => c.kind)).toEqual(["source_authorization", "credentials_notice"]);
    expect(mine[0]).toMatchObject({ document: AUTHORIZATION_DECLARATION.id, version: AUTHORIZATION_DECLARATION.version, statement_sha256: sha(AUTHORIZATION_DECLARATION.text) });
    expect(mine[1]).toMatchObject({ document: "identifiants", version: LEGAL_DOCUMENTS.identifiants.version });
    // Sans identifiants : seulement l'autorisation
    expect(((await api("me", "GET", { headers: asUser(b.cookie) })).body.consents as { kind: string; project_id: string }[]).filter((c) => c.project_id === pb).map((c) => c.kind)).toEqual(["source_authorization"]);
    // Déclaration périmée → refus
    expect((await newProject(a, { authorization_version: "0.1" })).status).toBe(409);
    // Autorisation non confirmée → refus
    expect((await api("projects", "POST", { headers: asUser(a.cookie), body: { company: "Sans accord" } })).status).toBe(400);
  });

  it("un client ne voit que ses projets", async () => {
    const la = (await api("projects", "GET", { headers: asUser(a.cookie) })).body.projects as { id: string }[];
    const lb = (await api("projects", "GET", { headers: asUser(b.cookie) })).body.projects as { id: string }[];
    expect(la.map((p) => p.id)).toContain(pa);
    expect(la.map((p) => p.id)).not.toContain(pb);
    expect(lb.map((p) => p.id)).toEqual([pb]);
  });

  it("404 sur le projet d'un autre client, quel que soit le moyen de le désigner (même réponse qu'un projet inconnu)", async () => {
    const unknown = await api("projects/[id]", "GET", { id: "MIG_ffffffff", headers: asUser(b.cookie) });
    expect(unknown).toMatchObject({ status: 404, body: { ok: false, error: "Projet introuvable" } });
    const attempts = [
      api("projects/[id]", "GET", { id: pa, headers: asUser(b.cookie) }),
      api("projects/[id]", "PATCH", { id: pa, headers: asUser(b.cookie), body: { notes: "intrusion" } }),
      api("projects/[id]/credentials", "GET", { id: pa, headers: asUser(b.cookie) }),
      api("projects/[id]/credentials", "DELETE", { id: pa, headers: asUser(b.cookie) }),
      api("migration/sources", "GET", { query: `?project=${pa}`, headers: asUser(b.cookie) }),
      api("migration/sources", "GET", { headers: { ...asUser(b.cookie), "x-reborn-project": pa } }),
      api("migration/sources", "POST", { query: `?project=${pa}`, headers: asUser(b.cookie), body: { name: "x.csv", content_base64: csv([["id"], ["1"]]) } }),
    ];
    for (const r of await Promise.all(attempts)) expect(r).toMatchObject({ status: 404, body: unknown.body });
    // Les identifiants de A sont intacts
    expect((await api("projects/[id]/credentials", "GET", { id: pa, headers: asUser(a.cookie) })).body).toMatchObject({ stored: true });
    expect((await api("migration/sources", "GET", { query: `?project=${pa}`, headers: asUser(a.cookie) })).status).toBe(200);
  });

  it("désignations invalides ou contradictoires : 400", async () => {
    const h = asUser(a.cookie);
    expect((await api("projects/[id]", "GET", { id: "../../etc", headers: h })).status).toBe(400);
    expect((await api("projects/[id]", "GET", { id: pa, query: `?project=${pb}`, headers: h })).status).toBe(400);
    expect((await api("migration/sources", "GET", { query: `?project=${pa}`, headers: { ...h, "x-reborn-project": pb } })).status).toBe(400);
    expect((await api("migration/sources", "GET", { query: "?project=", headers: h })).status).toBe(400);
    expect((await api("migration/sources", "GET", { query: "?project=../../etc", headers: h })).status).toBe(400);
  });

  it("pas de repli sur le projet courant pour un client ou un service ; l'opérateur le garde", async () => {
    const noProject = await api("migration/sources", "GET", { headers: asUser(a.cookie) });
    expect(noProject.status).toBe(400);
    expect(noProject.body.error).toMatch(/^Projet requis/);
    expect((await api("migration/sources", "GET", { headers: asService("explorer") })).status).toBe(400);
    // Routes de l'équipe interdites au client
    expect((await api("migration/project", "POST", { headers: asUser(a.cookie), body: { name: "Hors consentement" } })).status).toBe(403);
    expect((await api("projects/[id]/select", "POST", { id: pa, headers: asUser(a.cookie) })).status).toBe(403);
    // Opérateur : création historique (projet de repli) puis lecture sans ?project=
    const op = await signUp({ firstName: "Olivia", lastName: "Opératrice" });
    await makeOperator(op.email);
    const created = await api("migration/project", "POST", { headers: asUser(op.cookie), body: { name: "Atelier interne" } });
    expect(created.status).toBe(200);
    expect(indexOf().current).toBe(created.body.project.id);
    expect(indexOf().projects.find((p) => p.id === created.body.project.id)?.owner_id).toBe(op.userId);
    expect((await api("migration/sources", "GET", { headers: asUser(op.cookie) })).status).toBe(200);
    expect((await api("projects/[id]/select", "POST", { id: created.body.project.id, headers: asUser(op.cookie) })).status).toBe(200);
    // … mais n'accède pas aux projets des clients, ni directement ni par le projet de repli
    expect((await api("projects/[id]", "GET", { id: pa, headers: asUser(op.cookie) })).status).toBe(404);
    expect((await api("projects/[id]/select", "POST", { id: pa, headers: asUser(op.cookie) })).status).toBe(404);
    expect(indexOf().current).toBe(created.body.project.id);
  });

  it("projets sans propriétaire : visibles de l'opérateur seulement ; les agents voient tous les projets", async () => {
    const { createProject } = await import("@/lib/migration/project");
    const legacy = createProject({ company: "Projet historique" }); // appel interne : aucun propriétaire
    const op = await signUp();
    await makeOperator(op.email);
    const opList = ((await api("projects", "GET", { headers: asUser(op.cookie) })).body.projects as { id: string }[]).map((p) => p.id);
    expect(opList).toContain(legacy.id);
    expect(opList).not.toContain(pa);
    expect(((await api("projects", "GET", { headers: asUser(a.cookie) })).body.projects as { id: string }[]).map((p) => p.id)).not.toContain(legacy.id);
    expect((await api("projects/[id]", "GET", { id: legacy.id, headers: asUser(op.cookie) })).status).toBe(200);
    expect((await api("projects/[id]", "GET", { id: legacy.id, headers: asUser(a.cookie) })).status).toBe(404);
    const svc = ((await api("projects", "GET", { headers: asService("analyst") })).body.projects as { id: string }[]).map((p) => p.id);
    expect(svc).toEqual(expect.arrayContaining([pa, pb, legacy.id]));
    expect((await api("projects/[id]", "GET", { id: pa, headers: asService("explorer") })).status).toBe(200);
    expect((await api("projects/[id]", "GET", { id: "MIG_ffffffff", headers: asService("explorer") })).status).toBe(404);
    expect((await api("projects/[id]", "PATCH", { id: pa, headers: asService("explorer"), body: { notes: "x" } })).status).toBe(403);
  });

  it("changer l'adresse de l'ancien logiciel efface les identifiants confiés", async () => {
    const dir = path.join(env.dataDir, "migration", "projects", pa);
    expect(fs.existsSync(path.join(dir, "credentials.enc.json"))).toBe(true);
    const same = await api("projects/[id]", "PATCH", { id: pa, headers: asUser(a.cookie), body: { legacy_url: "http://127.0.0.1:9/", notes: "rien ne change" } });
    expect(same.status).toBe(200);
    expect(fs.existsSync(path.join(dir, "credentials.enc.json"))).toBe(true);
    const moved = await api("projects/[id]", "PATCH", { id: pa, headers: asUser(a.cookie), body: { legacy_url: "http://127.0.0.1:8/" } });
    expect(moved.status).toBe(200);
    expect(moved.body.credentials).toEqual({ stored: false });
    expect(fs.existsSync(path.join(dir, "credentials.enc.json"))).toBe(false);
    expect((await api("projects/[id]/credentials", "GET", { id: pa, headers: asUser(a.cookie) })).body).toEqual({ stored: false });
    const paused = await api("projects/[id]", "PATCH", { id: pa, headers: asUser(a.cookie), body: { action: "pause" } });
    expect(paused.body.project.status_reason).toBe("Projet mis en pause par Alice Martin");
  });
});

describe("Réinitialisation du mot de passe (boîte d'envoi locale, aucun e-mail)", () => {
  it("écrit le lien uniquement dans la boîte d'envoi (0600), usage unique, révoque les sessions", async () => {
    const u = await signUp();
    const outbox = path.join(env.dataDir, "outbox");
    // Pas de libre-service : sans la clé de l'opérateur (ou avec une fausse), refus et aucun message
    const attempts: Record<string, string>[] = [{ origin: "" }, { origin: "", "x-reborn-operator-key": "fausse-cle-fausse-cle" }, {}];
    for (const headers of attempts) {
      const denied = await authRequest("/request-password-reset", { body: { email: u.email }, headers });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ code: "OPERATOR_ONLY", message: "Mot de passe oublié ? Un administrateur REBORN peut vous transmettre un lien de réinitialisation." });
    }
    expect(fs.existsSync(outbox) ? fs.readdirSync(outbox) : []).toEqual([]);
    expect(fs.statSync(path.join(env.dataDir, "operator.key")).mode & 0o777).toBe(0o600);
    // Demande de la CLI (sans Origin, avec la clé) ; adresse inconnue : même réponse, aucun message
    const unknown = await authRequest("/request-password-reset", { body: { email: "personne@exemple.test" }, headers: asOperatorCli() });
    expect(unknown.status).toBe(200);
    expect(fs.existsSync(outbox) ? fs.readdirSync(outbox) : []).toEqual([]);
    const req = await authRequest("/request-password-reset", { body: { email: u.email }, headers: asOperatorCli() });
    expect(req.status).toBe(200);
    const body = await req.json();
    expect(JSON.stringify(body)).not.toMatch(/reinitialisation#token/);
    const files = fs.readdirSync(outbox);
    expect(files).toHaveLength(1);
    expect(fs.statSync(path.join(outbox, files[0])).mode & 0o777).toBe(0o600);
    expect(fs.statSync(outbox).mode & 0o777).toBe(0o700);
    const msg = JSON.parse(fs.readFileSync(path.join(outbox, files[0]), "utf8"));
    expect(msg).toMatchObject({ kind: "password_reset", to: u.email });
    const m = /^http:\/\/127\.0\.0\.1:3000\/reinitialisation#token=([\w-]+)$/.exec(msg.link);
    expect(m).not.toBeNull();
    const token = m![1];
    // Le jeton n'est pas stocké en clair en base (identifiant haché)
    const ver = (await db()).prepare("SELECT identifier FROM verification").all() as { identifier: string }[];
    expect(JSON.stringify(ver)).not.toContain(token);
    expect((await authRequest("/reset-password", { body: { token, newPassword: "court" } })).status).toBe(400);
    const done = await authRequest("/reset-password", { body: { token, newPassword: "Mot-De-Passe-Retrouve-7" } });
    expect(done.status).toBe(200);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(401); // sessions révoquées
    expect((await signIn(u.email, u.password)).status).toBe(401);
    expect((await signIn(u.email, "Mot-De-Passe-Retrouve-7")).status).toBe(200);
    const again = await authRequest("/reset-password", { body: { token, newPassword: "Encore-Un-Autre-Mot-9" } });
    expect(again.status).toBe(400);
    expect((await again.json()).message).toMatch(/^Lien de réinitialisation invalide/);
  });

  it("une nouvelle demande invalide la précédente ; la réinitialisation lève le verrouillage", async () => {
    const u = await signUp();
    const outbox = path.join(env.dataDir, "outbox");
    const ask = async () => {
      await authRequest("/request-password-reset", { body: { email: u.email }, headers: asOperatorCli() });
      const f = fs.readdirSync(outbox).map((n) => JSON.parse(fs.readFileSync(path.join(outbox, n), "utf8"))).find((x) => x.to === u.email);
      return /#token=([\w-]+)$/.exec(f.link)![1];
    };
    const first = await ask();
    const second = await ask();
    expect(first).not.toBe(second);
    expect(fs.readdirSync(outbox).filter((n) => JSON.parse(fs.readFileSync(path.join(outbox, n), "utf8")).to === u.email)).toHaveLength(1);
    expect((await authRequest("/reset-password", { body: { token: first, newPassword: "Premier-Lien-Perime-1" } })).status).toBe(400);
    for (let i = 0; i < 8; i++) await signIn(u.email, `faux-mot-de-passe-${i}`);
    expect((await signIn(u.email, u.password)).status).toBe(429);
    expect((await authRequest("/reset-password", { body: { token: second, newPassword: "Second-Lien-Valide-2" } })).status).toBe(200);
    expect((await signIn(u.email, "Second-Lien-Valide-2")).status).toBe(200);
  });
});

// Limitation des tentatives (seau partagé sans proxy de confiance, puis protection qui le remplace) :
// bloc « Limitation des tentatives sans blocage global (lot C4) » en fin de fichier.

describe("CLI de l'opérateur (npm run account)", () => {
  const SCRIPT = path.resolve(import.meta.dirname, "../../scripts/account.mjs");
  let srv: http.Server;
  let studio: string;
  beforeAll(async () => {
    // Studio minimal sur un port libre : la route Better Auth réelle (reset-link passe par HTTP)
    srv = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await R["auth/[...all]"][req.method ?? "GET"](new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body }), { params: Promise.resolve({}) });
      res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
      res.end(Buffer.from(await r.arrayBuffer()));
    });
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", () => ok()));
    studio = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  });
  afterAll(() => srv?.close());

  const cli = (...args: string[]) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const cliEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", REBORN_DATA_DIR: env.dataDir, REBORN_URL: studio } as unknown as NodeJS.ProcessEnv;
      const p = spawn(process.execPath, ["--no-warnings", SCRIPT, ...args], { env: cliEnv, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      p.stdout.on("data", (d: Buffer) => (out += d));
      p.stderr.on("data", (d: Buffer) => (out += d));
      p.on("close", (code) => resolve({ code, out }));
    });

  it("list, operator, client, assign, claim-unowned : sans aucun secret, effet immédiat sur le Studio", async () => {
    const u = await signUp({ firstName: "Claire", lastName: "Dubois", company: "Dubois SA" });
    const { createProject } = await import("@/lib/migration/project");
    const orphan = createProject({ company: "Orphelin" });
    const list = await cli("list");
    expect(list.code).toBe(0);
    expect(list.out).toContain(u.email);
    expect(list.out).toContain("Claire Dubois · Dubois SA");
    expect(list.out).toMatch(new RegExp(`${orphan.id}\\s+Orphelin\\s+sans propriétaire`));
    expect(list.out).not.toContain(u.password);
    expect(list.out).not.toContain(env.tokens.all);
    expect((await cli("operator", u.email.toUpperCase())).code).toBe(0);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).body.user.role).toBe("operator"); // sans reconnexion
    expect((await cli("client", u.email)).code).toBe(0);
    expect((await api("me", "GET", { headers: asUser(u.cookie) })).body.user.role).toBe("client");
    expect((await api("projects/[id]", "GET", { id: orphan.id, headers: asUser(u.cookie) })).status).toBe(404);
    const assign = await cli("assign", orphan.id, u.email);
    expect(assign.code).toBe(0);
    // Le Studio relit l'index modifié par la CLI : le projet est maintenant visible de ce client
    expect((await api("projects/[id]", "GET", { id: orphan.id, headers: asUser(u.cookie) })).status).toBe(200);
    const other = createProject({ company: "Autre orphelin" });
    const claim = await cli("claim-unowned", u.email);
    expect(claim.code).toBe(0);
    expect(claim.out).toContain(other.id);
    expect(indexOf().projects.filter((p) => !p.owner_id)).toEqual([]);
    expect((await cli("assign", "MIG_ffffffff", u.email)).code).toBe(1);
    expect((await cli("operator", "inconnu@exemple.test")).code).toBe(1);
  });

  it("reset-link : demande au Studio en service, lien affiché dans le terminal seulement, fichier supprimé", async () => {
    const u = await signUp();
    const r = await cli("reset-link", u.email);
    expect(r.code).toBe(0);
    const m = /\/reinitialisation#token=([\w-]+)/.exec(r.out);
    expect(m).not.toBeNull();
    const outbox = path.join(env.dataDir, "outbox");
    expect(fs.readdirSync(outbox).filter((f) => JSON.parse(fs.readFileSync(path.join(outbox, f), "utf8")).to === u.email)).toEqual([]);
    expect((await authRequest("/reset-password", { body: { token: m![1], newPassword: "Par-La-CLI-Retrouve-3" } })).status).toBe(200);
    expect((await signIn(u.email, "Par-La-CLI-Retrouve-3")).status).toBe(200);
    expect((await cli("reset-link", "inconnu@exemple.test")).code).toBe(1);
  });
});

describe("Secret de signature des sessions", () => {
  it("sans REBORN_AUTH_SECRET : <dataDir>/auth.secret créé une seule fois (0600) puis réutilisé", async () => {
    const saved = process.env.REBORN_AUTH_SECRET;
    delete process.env.REBORN_AUTH_SECRET;
    const file = path.join(env.dataDir, "auth.secret");
    try {
      expect(fs.existsSync(file)).toBe(false);
      const u = await signUp();
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      const secret = fs.readFileSync(file, "utf8");
      expect(secret.length).toBeGreaterThanOrEqual(43);
      // Nouvelle instance (configuration modifiée, comme un redémarrage) : même secret, la session reste valide
      process.env.REBORN_TRUSTED_PROXIES = "127.0.0.1";
      expect((await api("me", "GET", { headers: asUser(u.cookie) })).status).toBe(200);
      expect(fs.readFileSync(file, "utf8")).toBe(secret);
    } finally {
      delete process.env.REBORN_TRUSTED_PROXIES;
      process.env.REBORN_AUTH_SECRET = saved;
    }
  });
});

/*
 * Non-régression de la revue de sécurité adverse du lot A1 :
 * 1. défaut d'accès ouvert (un client lisait et effaçait l'état global, y compris avec ?project=<le sien>) ;
 * 2. /api/stream et /api/shots hors handler() (accès anonyme) ;
 * 3. jeton de remise émis au navigateur du propriétaire puis échangé contre le mot de passe en clair.
 */
describe("Revue de sécurité A1 : état global, flux, captures, remise des identifiants", () => {
  let a: TestUser, b: TestUser, op: TestUser, pa: string, pb: string;
  let store: typeof import("@/lib/store");
  type Ev = { seq: number; type: string; title: string; investigation_id?: string; data?: { project_id?: string } };
  beforeAll(async () => {
    store = await import("@/lib/store");
    a = await signUp({ firstName: "Anne", lastName: "Aubert", company: "Garage Aubert" });
    b = await signUp({ firstName: "Benoît", lastName: "Bertin", company: "Boulangerie Bertin" });
    op = await signUp({ firstName: "Équipe", lastName: "REBORN" });
    await makeOperator(op.email);
    pa = (await newProject(a, { company: "Garage Aubert" })).body.project.id;
    pb = (await newProject(b, { company: "Boulangerie Bertin" })).body.project.id;
  });

  it("/api/state et /api/revision : un client ne voit que SES projets (découverte et journal), rien de l'atelier ni d'un autre client", async () => {
    // Investigation et observation de l'atelier rattachées au projet de A, puis activité de A pendant qu'elle est active
    const inv = store.createInvestigation({ application: "Logiciel de Garage Aubert", module: "Devis", mode: "replay", kind: "initial", project_id: pa });
    store.addObservations([{ experiment_id: "EXP_AUBERT_1", inputs: { quantite: 3 }, observed_output: { total: 42 }, status: "success", investigation_id: inv.id }], "explorer");
    const pa2 = (await newProject(a, { company: "Garage Aubert — atelier 2" })).body.project.id as string;
    const raw = store.getState().events.find((e) => e.title === "Projet de migration « Garage Aubert — atelier 2 » créé");
    // Lot B1 : le journal de migration n'est jamais rattaché à l'investigation en cours ; projet fixé par le serveur
    expect(raw?.investigation_id).toBeUndefined();
    expect((raw as { project_id?: string } | undefined)?.project_id).toBe(pa2);

    const va = await api("state", "GET", { headers: asUser(a.cookie) });
    expect(va.status).toBe(200);
    expect(va.body).not.toHaveProperty("migration");
    // Lot B1 : SA découverte (investigation, observations) est servie ; rien d'un autre compte
    expect(va.body.investigations.map((i: { id: string }) => i.id)).toEqual([inv.id]);
    expect(va.body.observations.map((o: { experiment_id: string }) => o.experiment_id)).toEqual(["EXP_AUBERT_1"]);
    const evA = va.body.events as (Ev & { project_id?: string })[];
    expect(evA.map((e) => e.title)).toEqual(expect.arrayContaining(["Projet de migration « Garage Aubert » créé", "Projet de migration « Garage Aubert — atelier 2 » créé"]));
    expect(evA.every((e) => [pa, pa2].includes(e.project_id ?? ""))).toBe(true);
    expect(evA.filter((e) => e.type === "migration").some((e) => "investigation_id" in e)).toBe(false);
    expect(JSON.stringify(va.body)).not.toContain("Boulangerie Bertin");
    expect(va.body.revision).toBe(evA.at(-1)!.seq);

    const vb = await api("state", "GET", { headers: asUser(b.cookie) });
    expect(JSON.stringify(vb.body)).toContain("Projet de migration « Boulangerie Bertin » créé");
    for (const foreign of ["Garage Aubert", "EXP_AUBERT_1", inv.id, "Logiciel de Garage Aubert"]) expect(JSON.stringify(vb.body), foreign).not.toContain(foreign);
    // Le projet désigné est vérifié (propriété) ; la vue se limite alors à ce projet
    expect((await api("state", "GET", { headers: asUser(a.cookie), query: `?project=${pb}` })).status).toBe(404);
    expect((await api("state", "GET", { headers: asUser(a.cookie), query: `?project=${pa}` })).body.events).toEqual(evA.filter((e) => e.project_id === pa));

    // Révision : celle de A ne bouge pas quand seul B travaille
    const ra = (await api("revision", "GET", { headers: asUser(a.cookie) })).body;
    expect(ra).toEqual({ revision: va.body.revision, event_seq: va.body.revision });
    const rb = (await api("revision", "GET", { headers: asUser(b.cookie) })).body.revision as number;
    await newProject(b, { company: "Boulangerie Bertin — dépôt" });
    expect((await api("revision", "GET", { headers: asUser(a.cookie) })).body).toEqual(ra);
    expect((await api("revision", "GET", { headers: asUser(b.cookie) })).body.revision).toBeGreaterThan(rb);
    expect((await api("revision", "GET")).status).toBe(401);

    // Équipe et agents : état complet de l'atelier
    const full = await api("state", "GET", { headers: asUser(op.cookie) });
    expect((full.body.investigations as { id: string }[]).map((i) => i.id)).toContain(inv.id);
    expect(full.body).toHaveProperty("migration");
    expect((await api("state", "GET", { headers: asService("analyst") })).body.observations.length).toBeGreaterThan(0);
    expect((await api("revision", "GET", { headers: asService("explorer") })).body.revision).toBe(store.getState().revision);
  });

  it("défaut fermé : l'atelier (écritures, règles, schémas, outils, scénarios, remise à zéro) n'est jamais servi à un client, même en désignant son propre projet", async () => {
    const inv = store.createInvestigation({ application: "Logiciel de Garage Aubert", module: "Factures", mode: "replay", kind: "initial", project_id: pa });
    const before = store.getState().revision;
    const routes: [string, string][] = [
      // Lot B1 : events, observations et investigations GET sont filtrés par projet, PATCH limité au propriétaire (isolation.test.ts)
      ["events", "POST"], ["observations", "POST"], ["investigations", "POST"],
      ["schema", "GET"], ["schema", "POST"], ["rules", "GET"], ["rules", "POST"], ["app", "GET"], ["compare", "GET"], ["compute", "POST"], ["scenarios", "GET"], ["scenarios", "POST"], ["reset", "POST"],
    ];
    const vias: { query?: string; headers?: Record<string, string> }[] = [{}, { query: `?project=${pa}` }, { headers: { "x-reborn-project": pa } }];
    for (const [route, method] of routes) {
      const body = method === "GET" ? undefined : { scenario: "quote", step: "baseline", id: inv.id, status: "completed" };
      for (const via of vias) {
        const r = await api(route, method, { query: via.query, headers: { ...asUser(a.cookie), ...via.headers }, body });
        expect(r, `${method} ${route} ${JSON.stringify(via)}`).toMatchObject({ status: 403, body: { ok: false, error: "Accès refusé : droits insuffisants" } });
      }
      expect((await api(route, method, { body })).status, `${method} ${route} anonyme`).toBe(401);
    }
    // Rien n'a bougé : l'investigation de A est toujours en cours, l'atelier n'a pas été remis à zéro
    expect(store.getState().revision).toBe(before);
    expect(store.getState().investigations.find((i) => i.id === inv.id)?.status).toBe("running");

    // Agents internes : l'atelier leur reste ouvert, jamais la remise à zéro (jeton sans Origin compris)
    for (const kind of ["explorer", "analyst", "all"] as const) {
      expect((await api("reset", "POST", { headers: asService(kind) })).status, kind).toBe(403);
      expect((await api("scenarios", "POST", { headers: asService(kind), body: { scenario: "quote", step: "baseline" } })).status, kind).toBe(403);
      expect((await api("events", "GET", { headers: asService(kind) })).status, kind).toBe(200);
    }
    expect(store.getState().investigations.find((i) => i.id === inv.id)?.status).toBe("running");

    // Routes d'un projet sans annotation : toujours le propriétaire seulement (et les agents)
    expect((await api("migration/sources", "GET", { query: `?project=${pa}`, headers: asUser(b.cookie) })).status).toBe(404);
    expect((await api("migration/sources", "GET", { query: `?project=${pa}`, headers: asUser(a.cookie) })).status).toBe(200);

    // Schémas statiques des contrats : publics, sans aucune donnée
    for (const route of ["contracts", "migration/contracts"]) expect((await api(route, "GET")).status, route).toBe(200);

    // Classement des routes sans annotation : d'après le chemin, jamais d'après ?project=
    const { defaultAccess, DEFAULT_ACCESS } = await import("@/lib/http");
    for (const p of ["/api/reset", "/api/state", "/api/events", "/api/stream", "/api/projects", "/api/migrationx", "/api/nouvelle-route"]) expect(defaultAccess(p), p).toBe(DEFAULT_ACCESS.global);
    for (const p of ["/api/migration", "/api/migration/runs/RUN_001", "/api/projects/MIG_00000000", "/api/projects/MIG_00000000/connection"]) expect(defaultAccess(p), p).toBe(DEFAULT_ACCESS.project);
    expect(DEFAULT_ACCESS.global).not.toContain("user");
    expect(DEFAULT_ACCESS.global).not.toContain("owner");

    // Équipe REBORN (navigateur du Studio) : remise à zéro effective de l'atelier, sans toucher aux projets (lot B1)
    expect((await api("reset", "POST", { headers: asUser(op.cookie) })).status).toBe(200);
    expect(store.getState().investigations.every((i) => !!i.project_id)).toBe(true);
    expect(store.getState().investigations.some((i) => i.id === inv.id)).toBe(true);
  });

  it("/api/stream : jamais anonyme ; client : flux de SES projets (première révision : la sienne) ; équipe et agents : tout", async () => {
    const open = async (headers: Record<string, string>) => {
      const ctrl = new AbortController();
      const res = await R["stream"].GET(new Request(`${ORIGIN}/api/stream`, { headers, signal: ctrl.signal }), { params: Promise.resolve({}) });
      if (!res.headers.get("content-type")?.startsWith("text/event-stream")) return { status: res.status, first: await res.text() };
      const reader = res.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      ctrl.abort();
      await reader.cancel().catch(() => {});
      return { status: res.status, first };
    };
    expect(await open({})).toMatchObject({ status: 401, first: JSON.stringify({ ok: false, error: "Connexion requise" }) });
    const ra = (await api("revision", "GET", { headers: asUser(a.cookie) })).body.revision;
    expect(await open(asUser(a.cookie))).toEqual({ status: 200, first: `event: hello\ndata: ${JSON.stringify({ revision: ra })}\n\n` });
    expect((await open({ ...asUser(op.cookie), host: "evil.example:3000" })).status).toBe(403); // rebinding DNS : contrôle d'hôte d'abord
    for (const h of [asUser(op.cookie), asService("explorer"), asService("analyst")]) {
      const r = await open(h);
      expect(r.status).toBe(200);
      expect(r.first).toMatch(/^event: hello\ndata: \{"revision":\d+\}\n\n/);
    }
  });

  it("/api/shots : captures de l'atelier réservées à l'équipe et aux agents (introuvables pour un client), jamais en cache partagé", async () => {
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const e = store.addEvent({ source: "explorer", type: "action", title: "Écran de l'ancien logiciel", screenshot_url: PNG });
    const id = e.screenshot_url!.replace("/api/shots/", "");
    expect(id).toMatch(/^[a-f0-9-]{36}\.png$/);
    const get = (headers: Record<string, string>, shot = id) => api("shots/[id]", "GET", { id: shot, headers });
    expect((await get({})).status).toBe(401);
    for (const u of [a, b]) expect((await get(asUser(u.cookie))).status).toBe(404); // lot B1 : rangées par projet, servies au seul propriétaire
    for (const h of [asUser(op.cookie), asService("explorer")]) {
      const r = await get(h);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
    expect((await get(asUser(op.cookie), "../state.json")).status).toBe(404);
    expect((await get(asUser(op.cookie), "00000000-0000-0000-0000-000000000000.png")).status).toBe(404);
  });

  it("identifiants de l'ancien logiciel : aucun navigateur, même celui du propriétaire, n'obtient de jeton de remise ni le mot de passe en clair", async () => {
    const SECRET = "Ancien-Logiciel-Mot-De-Passe-77";
    const pid = (await newProject(a, { company: "Garage Aubert — accès", legacy_url: "http://127.0.0.1:9/", credentials: { username: "migration", password: SECRET }, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version })).body.project.id as string;
    // Jetons de remise : enregistrés par mission dans missions.json du projet, empreinte seulement (lot B2)
    const tokensFile = path.join(env.dataDir, "migration", "projects", pid, "missions.json");
    const mission = (headers: Record<string, string>) => api("projects/[id]/mission", "POST", { id: pid, headers });
    const redeem = (token: string, headers: Record<string, string>) => api("projects/[id]/credentials/redeem", "POST", { id: pid, headers, body: { token } });
    // Propriétaire : consultation de la mission sans jeton ; émission d'un jeton refusée, aucun jeton créé
    const view = await api("projects/[id]/mission", "GET", { id: pid, headers: asUser(a.cookie) });
    expect(view.status).toBe(200);
    expect(view.body.credential).not.toHaveProperty("token");
    expect(await mission(asUser(a.cookie))).toMatchObject({ status: 403, body: { ok: false, error: "Accès refusé : droits insuffisants" } });
    expect((await mission(asUser(b.cookie))).status).toBe(403);
    expect((await mission({})).status).toBe(401);
    // SPEC §6 : sans « Analyser mon logiciel » du propriétaire, rien en file — même l'exécuteur ne reçoit rien (409)
    expect((await mission(asService("explorer"))).status).toBe(409);
    expect(fs.existsSync(tokensFile)).toBe(false);
    expect((await api("projects/[id]/analysis", "POST", { id: pid, headers: asUser(a.cookie), body: {} })).status).toBe(202);
    // L'équipe REBORN ne reçoit jamais de jeton (lot B2 : 409, la mission n'est remise qu'à l'exécuteur qui la prend)
    const byOperator = await mission(asUser(op.cookie));
    expect(byOperator.status).toBe(409);
    expect(JSON.stringify(byOperator.body)).not.toMatch(/"token"|redeem_url/);
    expect(fs.existsSync(tokensFile)).toBe(false);
    // L'exécuteur (jeton explorer) prend la mission en file (take_mission 1.0) et reçoit le jeton
    const taken = await mission(asService("explorer"));
    expect(taken.status).toBe(200);
    const token = taken.body.credential.token as string;
    expect(token).toMatch(/^[\w-]{20,}$/);
    expect(fs.readFileSync(tokensFile, "utf8")).not.toContain(token); // empreinte seulement, jamais le jeton
    // Aucun navigateur ne l'échange : propriétaire, équipe, ni l'exécuteur appelé avec une Origin (même celle du Studio)
    for (const h of [asUser(a.cookie), asUser(op.cookie), { ...asService("explorer"), origin: ORIGIN }, { ...asService("explorer"), "sec-fetch-site": "same-origin" }, asService("analyst"), {}]) {
      const r = await redeem(token, h);
      expect(r.status, JSON.stringify(Object.keys(h))).toBe(Object.keys(h).length ? 403 : 401);
      expect(JSON.stringify(r.body)).not.toContain(SECRET);
    }
    // … refus qui n'ont pas consommé le jeton : l'exécuteur, sans Origin, l'échange une seule fois
    expect(await redeem(token, asService("explorer"))).toMatchObject({ status: 200, body: { username: "migration", password: SECRET } });
    expect((await redeem(token, asService("explorer"))).status).toBe(403);
  });

  it("inscription : les champs tolérés restent sans effet (nom recalculé, rôle client, adresse de retour étrangère refusée)", async () => {
    const email = `nom.impose.${Date.now()}@exemple.test`;
    const r = await authRequest("/sign-up/email", { body: { email, password: "Mot-De-Passe-Long-1", firstName: "Vrai", lastName: "Nom", name: "Opérateur REBORN", rememberMe: false, ...consentFields() } });
    expect(r.status).toBe(200);
    expect((await db()).prepare(`SELECT name, role FROM "user" WHERE email = ?`).get(email)).toMatchObject({ name: "Vrai Nom", role: "client" });
    const evil = `retour.${Date.now()}@exemple.test`;
    const cb = await authRequest("/sign-up/email", { body: { email: evil, password: "Mot-De-Passe-Long-1", firstName: "A", lastName: "B", callbackURL: "https://evil.example/x", ...consentFields() } });
    expect(cb.status).toBe(403);
    expect(cb.headers.getSetCookie()).toEqual([]);
    expect((await db()).prepare(`SELECT COUNT(*) AS n FROM "user" WHERE email = ?`).get(evil)).toMatchObject({ n: 0 });
  });

  it("un jeton Bearer invalide n'est jamais complété par le cookie de session (aucune identité : 401)", async () => {
    expect(await api("me", "GET", { headers: { ...asUser(a.cookie), authorization: "Bearer jeton-invalide-jeton-invalide" } })).toMatchObject({ status: 401, body: { error: "Jeton de service invalide" } });
  });

  it("inventaire des routes corrigées : chaque méthode passe par handler() avec un contrôle d'accès explicite", () => {
    const expected: Record<string, Record<string, string[]>> = {
      stream: { GET: ["user", "explorer", "analyst"] },
      "shots/[id]": { GET: ["user", "explorer", "analyst"] },
      reset: { POST: ["operator"] },
      scenarios: { POST: ["operator"] },
      state: { GET: ["user", "explorer", "analyst"] },
      revision: { GET: ["user", "explorer", "analyst"] },
      contracts: { GET: ["public"] },
      "migration/contracts": { GET: ["public"] },
      "projects/[id]/mission": { POST: ["explorer", "operator"] },
      "projects/[id]/credentials/redeem": { POST: ["explorer"] },
    };
    for (const [route, methods] of Object.entries(expected)) {
      for (const [m, access] of Object.entries(methods)) expect((R[route][m] as unknown as { reborn?: { access: string[] | null } }).reborn?.access, `${m} ${route}`).toEqual(access);
    }
  });
});

/*
 * Lot C4 — constat du lot B3 : sans proxy de confiance, la limitation de Better Auth tombait sur UN seau
 * par chemin partagé par tout le monde (20 connexions par minute, fenêtre recomptée depuis la dernière
 * requête acceptée) : quelques requêtes par minute fermaient la connexion à tous les comptes.
 * Remplacée par : verrouillage par compte + limite globale large à fenêtre glissante exacte (échecs
 * seulement) + délai constant sur les échecs ; limitation par adresse réelle avec REBORN_TRUST_PROXY=1.
 */
describe("Limitation des tentatives sans blocage global (lot C4)", () => {
  let limits: typeof import("@/lib/auth/limits");
  const TUNING = ["REBORN_AUTH_SIGNIN_MAX", "REBORN_AUTH_SIGNUP_MAX", "REBORN_AUTH_FAILURE_DELAY_MS"];
  /** Exécute fn sans proxy de confiance (x-forwarded-for ignoré), réglages de test, horloge des fenêtres injectable. */
  async function withLimits<T>(over: { proxy?: boolean; env?: Record<string, string> }, fn: (clock: { t: number }) => Promise<T>): Promise<T> {
    const clock = { t: Date.now() };
    const restoreClock = limits.setAuthLimitClock(() => clock.t);
    limits.resetAuthLimits();
    if (!over.proxy) delete process.env.REBORN_TRUST_PROXY;
    Object.assign(process.env, over.env ?? {});
    try {
      return await fn(clock);
    } finally {
      process.env.REBORN_TRUST_PROXY = "1";
      for (const k of TUNING) delete process.env[k];
      restoreClock();
      limits.resetAuthLimits();
    }
  }
  const fail = (tag: string, headers: Record<string, string> = {}) => signIn(`${tag}@inconnu.exemple.test`, "mauvais-mot-de-passe", headers);
  beforeAll(async () => {
    limits = await import("@/lib/auth/limits");
  });

  it("sans proxy de confiance : 30 échecs sur des comptes différents, 12 inscriptions invalides et 6 demandes de réinitialisation refusées ne bloquent personne", async () => {
    await withLimits({ env: { REBORN_AUTH_FAILURE_DELAY_MS: "0" } }, async () => {
      const u = await signUp();
      const statuses: number[] = [];
      for (let i = 0; i < 30; i++) statuses.push((await fail(`seau-${i}`)).status); // adresse x-forwarded-for différente à chaque appel (ignorée)
      expect(statuses.every((s) => s === 401)).toBe(true); // avant : 429 pour tout le monde dès la 21e
      expect((await signIn(u.email, u.password)).status).toBe(200);
      for (let i = 0; i < 12; i++) expect((await authRequest("/sign-up/email", { body: { email: `invalide-${i}` } })).status).toBe(400);
      await signUp(); // avant : seau commun de 10 inscriptions par minute → 429
      for (let i = 0; i < 6; i++) expect((await authRequest("/request-password-reset", { body: { email: u.email } })).status).toBe(403);
      expect((await authRequest("/request-password-reset", { body: { email: u.email }, headers: asOperatorCli() })).status).toBe(200); // avant : 5 par minute communs → 429
      // La protection contre les essais de mots de passe reste le verrouillage par compte
      for (let i = 0; i < 8; i++) expect((await signIn(u.email, `faux-mot-de-passe-${i}`)).status).toBe(401);
      expect((await signIn(u.email, u.password)).body).toMatchObject({ code: "ACCOUNT_LOCKED" });
      const other = await signUp();
      expect((await signIn(other.email, other.password)).status).toBe(200);
    });
  }, 30_000);

  it("limite globale large à fenêtre glissante : seuls les échecs comptent, ni les connexions acceptées ni les refus ne prolongent la fenêtre, elle se rouvre d'elle-même", async () => {
    await withLimits({ env: { REBORN_AUTH_SIGNIN_MAX: "5", REBORN_AUTH_FAILURE_DELAY_MS: "0" } }, async (clock) => {
      const u = await signUp();
      const t0 = clock.t;
      for (let i = 0; i < 3; i++) expect((await fail(`fenetre-a${i}`)).status).toBe(401); // t0 : 3 échecs
      clock.t = t0 + 30_000;
      for (let i = 0; i < 4; i++) expect((await signIn(u.email, u.password)).status).toBe(200); // réussites : aucune place gardée
      for (let i = 0; i < 2; i++) expect((await fail(`fenetre-b${i}`)).status).toBe(401); // t0 + 30 s : 5 échecs dans la fenêtre
      expect(limits.authLimitUsage().signIn).toBe(5);
      clock.t = t0 + 31_000;
      const refused = await authRequest("/sign-in/email", { body: { email: "fenetre-c@inconnu.exemple.test", password: "mauvais-mot-de-passe" } });
      expect(refused.status).toBe(429);
      expect(refused.headers.get("retry-after")).toBe("29"); // libération de la plus ancienne place (t0 + 60 s)
      expect(await refused.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", message: "Trop de tentatives de connexion sur REBORN en ce moment. Réessayez dans 29 secondes." });
      expect((await signIn(u.email, u.password)).status).toBe(429); // aucun mot de passe vérifié pendant la saturation (pas d'oracle)
      for (let i = 0; i < 10; i++) {
        clock.t += 2_000; // refus répétés jusqu'à t0 + 51 s : jamais comptés
        expect((await fail(`fenetre-d${i}`)).status).toBe(429);
      }
      expect(limits.authLimitUsage().signIn).toBe(5);
      clock.t = t0 + 60_001; // les 3 échecs de t0 sortent de la fenêtre : 3 places, pas une de plus
      expect((await signIn(u.email, u.password)).status).toBe(200);
      for (let i = 0; i < 3; i++) expect((await fail(`fenetre-e${i}`)).status).toBe(401);
      expect((await fail("fenetre-f")).status).toBe(429);
      clock.t = t0 + 90_001; // les 2 échecs de t0 + 30 s sortent à leur tour
      expect((await signIn(u.email, u.password)).status).toBe(200);
      expect(limits.authLimitUsage().signIn).toBe(3);
    });
  });

  it("délai constant : un échec n'est jamais répondu avant le délai (compte inconnu comme mauvais mot de passe) ; une connexion réussie n'attend pas", async () => {
    await withLimits({ env: { REBORN_AUTH_FAILURE_DELAY_MS: "1200" } }, async () => {
      const u = await signUp();
      const timed = async (email: string, password: string) => {
        const t = performance.now();
        const r = await signIn(email, password);
        return { status: r.status, ms: performance.now() - t };
      };
      const unknown = await timed("delai@inconnu.exemple.test", "mauvais-mot-de-passe");
      const wrong = await timed(u.email, "mauvais-mot-de-passe");
      const ok = await timed(u.email, u.password);
      expect([unknown.status, wrong.status, ok.status]).toEqual([401, 401, 200]);
      expect(unknown.ms).toBeGreaterThanOrEqual(1190);
      expect(wrong.ms).toBeGreaterThanOrEqual(1190);
      expect(ok.ms).toBeLessThan(1200);
    });
  }, 20_000);

  it("avec REBORN_TRUST_PROXY=1 : limitation par adresse réelle (20 par minute), sans gêner les autres adresses ; usurper la gauche de x-forwarded-for ne sert à rien", async () => {
    await withLimits({ proxy: true, env: { REBORN_AUTH_FAILURE_DELAY_MS: "0" } }, async () => {
      const ip = "203.0.113.77";
      for (let i = 0; i < 20; i++) expect((await fail(`adresse-${i}`, { "x-forwarded-for": ip })).status).toBe(401);
      expect(await fail("adresse-x", { "x-forwarded-for": ip })).toMatchObject({ status: 429, body: { message: "Trop de tentatives : patientez une minute avant de réessayer." } });
      // L'adresse retenue est la plus à droite qui n'est pas un proxy de confiance (127.0.0.1, ::1)
      expect((await fail("adresse-y", { "x-forwarded-for": `198.51.100.250, ${ip}` })).status).toBe(429);
      expect((await fail("adresse-z", { "x-forwarded-for": `${ip}, 127.0.0.1` })).status).toBe(429);
      const other = await signUp();
      expect((await signIn(other.email, other.password, { "x-forwarded-for": "203.0.113.78" })).status).toBe(200);
    });
  });

  it("inscription : limite globale sur les comptes CRÉÉS ; les requêtes invalides, les doublons et les refus ne comptent pas", async () => {
    await withLimits({ env: { REBORN_AUTH_SIGNUP_MAX: "3" } }, async (clock) => {
      for (let i = 0; i < 5; i++) expect((await authRequest("/sign-up/email", { body: { email: `invalide-${i}@exemple.test`, password: "court", firstName: "A", lastName: "B", ...consentFields() } })).status).toBe(400);
      const first = await signUp();
      expect((await authRequest("/sign-up/email", { body: { email: first.email, password: "Autre-Mot-De-Passe-1", firstName: "A", lastName: "B", ...consentFields() } })).status).toBe(422);
      await signUp();
      await signUp();
      const email = `limite.inscription.${Date.now()}@exemple.test`;
      const refused = await authRequest("/sign-up/email", { body: { email, password: "Mot-De-Passe-Long-1", firstName: "A", lastName: "B", ...consentFields() } });
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ code: "TOO_MANY_SIGNUPS", message: "Trop d'inscriptions sur REBORN en ce moment. Réessayez dans 10 minutes." });
      expect((await db()).prepare(`SELECT COUNT(*) AS n FROM "user" WHERE email = ?`).get(email)).toMatchObject({ n: 0 });
      clock.t += 10 * 60_000 + 1;
      await signUp({ email });
    });
  });

  it("changement de mot de passe : 10 essais par session et par quart d'heure (le mot de passe actuel ne se devine pas avec une session volée)", async () => {
    await withLimits({}, async (clock) => {
      const u = await signUp();
      const change = (cookie: string, currentPassword: string) => authRequest("/change-password", { body: { currentPassword, newPassword: "Nouveau-Mot-De-Passe-9" }, headers: { cookie } });
      for (let i = 0; i < 10; i++) expect((await change(u.cookie, `faux-actuel-${i}`)).status).toBe(400);
      const limited = await change(u.cookie, u.password);
      expect(limited.status).toBe(429); // même le bon mot de passe : aucun oracle
      expect(await limited.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", message: "Trop de tentatives de changement de mot de passe. Réessayez dans 15 minutes." });
      // Cookies inventés : 401, jamais gardés (ils ne peuvent ni remplir la table ni évincer le compteur de la vraie session)
      for (let i = 0; i < 30; i++) expect((await change(`reborn.session_token=invente-${i}.signature`, "peu-importe")).status).toBe(401);
      expect(limits.authLimitUsage().sessions).toBe(1);
      expect((await change(u.cookie, u.password)).status).toBe(429);
      clock.t += 15 * 60_000 + 1;
      expect((await change(u.cookie, u.password)).status).toBe(200);
      expect((await signIn(u.email, "Nouveau-Mot-De-Passe-9")).status).toBe(200);
    });
  });
});
