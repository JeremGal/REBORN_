/**
 * Lot C4 — durcissements demandés par les lots précédents, par les VRAIES routes (handlers en mémoire,
 * vrais comptes, vraie base auth.db, vrai coffre sur disque, dossier temporaire supprimé en fin de fichier).
 * L'exécuteur de Mouss n'existe pas encore : il est remplacé par des DOUBLURES D'EXÉCUTEUR étiquetées
 * « jeu de test » (jeton explorer + X-Reborn-Executor). Rien n'est simulé côté Studio.
 *
 * - titulaire du prêt pour les écritures de l'exécuteur (évènements, observations, schéma, exports), markExploring ;
 * - saisies de mot de passe et secrets connus masqués dans les évènements reçus ;
 * - PATCH de l'adresse : LegacyUrlSchema, effacement des identifiants, annulation de la mission ;
 * - investigations : adresse cible contrôlée ; balayage depuis handler() au plus une fois par minute ;
 * - repli de l'opérateur jamais sur le projet d'un client ; /api/session par handler() ; /api/contracts ;
 * - règles d'affichage du navigateur client (processus du logiciel livré, captures, journal, mission,
 *   session expirée → page de connexion).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { asService, asUser, callRoute, cleanupAuthEnv, makeOperator, ORIGIN, setupAuthEnv, signUp, type Json, type RouteHandler, type TestEnv, type TestUser } from "@/test/auth";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS } from "@/lib/legal";

type Mod = Record<string, RouteHandler>;
const R: Record<string, Mod> = {};
const ROUTES = [
  "me", "projects", "projects/[id]", "projects/[id]/analysis", "projects/[id]/connection", "projects/[id]/credentials/redeem", "executor/heartbeat", "executor/missions/claim",
  "events", "observations", "schema", "investigations", "migration/sources", "migration/mapping", "migration/project", "contracts", "state", "session",
];
const SECRET_A = "Mdp-Ancien-Logiciel-C4-Alpha";
const SECRET_B = "Mdp-Ancien-Logiciel-C4-Bravo";
const ACCOUNT = path.resolve(import.meta.dirname, "../../scripts/account.mjs");

let env: TestEnv;
let owner: TestUser;
let offset = 0; // horloge des identifiants et missions : toujours croissante dans ce fichier
let restoreClock: () => void = () => {};
let lib: {
  cred: typeof import("@/lib/migration/credentials");
  store: typeof import("@/lib/store");
  contracts: typeof import("@/lib/migration/project-contracts");
  analysis: typeof import("@/lib/migration/analysis");
};

function api(route: string, method: string, o: { id?: string; query?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return callRoute(R[route], method, `/api/${route.replace("[id]", o.id ?? "")}${o.query ?? ""}`, { params: o.id ? { id: o.id } : {}, body: o.body, headers: o.headers ?? asUser(owner.cookie) });
}
/** Doublure d'exécuteur (jeu de test) : jeton explorer + nom d'instance. */
const executor = (instance: string) => ({ ...asService("explorer"), "x-reborn-executor": instance });
const credFile = (pid: string) => path.join(env.dataDir, "migration", "projects", pid, "credentials.enc.json");
const keyFileOf = (pid: string) => path.join(env.dataDir, ".keys", `${(JSON.parse(fs.readFileSync(credFile(pid), "utf8")) as { id: string }).id}.key`);
const events = () => lib.store.getState().events;

async function newProject(company: string, extra: Record<string, unknown> = {}) {
  const r = await api("projects", "POST", { body: { company, software: "ERP maison", authorized: true, authorization_version: AUTHORIZATION_DECLARATION.version, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version, legacy_url: "http://127.0.0.1:9/", ...extra } });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.project.id as string;
}

/** « Analyser mon logiciel » puis prise de la mission par la doublure : elle tient le prêt du projet. */
async function claimed(pid: string, instance: string) {
  expect((await api("projects/[id]/analysis", "POST", { id: pid, body: {} })).status).toBe(202);
  expect((await api("executor/heartbeat", "POST", { headers: executor(instance), body: { version: "1.1", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: [] } })).status).toBe(200);
  const m = await api("executor/missions/claim", "POST", { headers: executor(instance) });
  expect(m.status, JSON.stringify(m.body)).toBe(200);
  expect(m.body.project_id).toBe(pid);
  return m.body as Json;
}

beforeAll(async () => {
  env = setupAuthEnv("reborn-c4-");
  delete process.env.EXPLORER_WEBHOOK_URL;
  for (const r of ROUTES) R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  lib = { cred: await import("@/lib/migration/credentials"), store: await import("@/lib/store"), contracts: await import("@/lib/migration/project-contracts"), analysis: await import("@/lib/migration/analysis") };
  restoreClock = lib.cred.setClock(() => Date.now() + offset);
  owner = await signUp({ firstName: "Inès", lastName: "Durand", company: "Durand Menuiserie" });
}, 30_000);

afterAll(async () => {
  restoreClock();
  await cleanupAuthEnv();
});

describe("C4 — écritures de l'exécuteur : titulaire du prêt de la mission du projet (SPEC §6)", () => {
  let pa = "";
  let m: Json;
  let holder: Record<string, string>;
  let intruder: Record<string, string>;
  beforeAll(async () => {
    holder = executor("doublure-c4-alpha");
    intruder = executor("doublure-c4-intrus");
    pa = await newProject("Durand Menuiserie", { credentials: { username: "compte.agent", password: SECRET_A } });
    m = await claimed(pa, "doublure-c4-alpha");
  });

  it("sans mission, ou pour une autre instance : 403 sur évènements, observations, schéma et exports — y compris en désignant le projet par l'investigation seule", async () => {
    const q = `?project=${pa}`;
    const before = lib.store.getState().event_seq;
    const attempts = [
      api("events", "POST", { query: q, headers: intruder, body: { type: "log", title: "intrus 1" } }),
      api("observations", "POST", { query: q, headers: intruder, body: { experiment_id: "EXP_INTRUS_1", inputs: { quantite: 1 }, observed_output: { total: 1 } } }),
      api("schema", "POST", { query: q, headers: intruder, body: { title: "intrus", fields: [{ name: "x", type: "number" }] } }),
      api("migration/sources", "POST", { query: q, headers: intruder, body: { name: "intrus.csv", content_base64: Buffer.from("id\n1").toString("base64") } }),
      // Sans ?project= : le projet est celui de l'investigation de la mission (le contournement est fermé)
      api("events", "POST", { headers: intruder, body: { type: "log", title: "intrus 2", investigation_id: m.investigation_id } }),
      api("observations", "POST", { headers: intruder, body: { experiment_id: "EXP_INTRUS_2", investigation_id: m.investigation_id, inputs: { quantite: 1 }, observed_output: { total: 1 } } }),
      api("schema", "POST", { headers: intruder, body: { title: "intrus", investigation_id: m.investigation_id, fields: [{ name: "x", type: "number" }] } }),
      // Jeton explorer sans nom d'instance (« default ») : pas le titulaire non plus
      api("events", "POST", { query: q, headers: asService("explorer"), body: { type: "log", title: "intrus 3" } }),
      // Ancien jeton commun agissant comme l'exécuteur (source explorer) : même règle
      api("events", "POST", { query: q, headers: asService("all"), body: { source: "explorer", type: "log", title: "intrus 4" } }),
    ];
    for (const r of await Promise.all(attempts)) expect(r, JSON.stringify(r.body)).toMatchObject({ status: 403, body: { ok: false, error: expect.stringMatching(/^Refusé : seul l'exécuteur titulaire de la mission en cours de ce projet/) } });
    expect(lib.store.getState().event_seq).toBe(before); // rien n'a été écrit
    expect(lib.store.getState().observations.some((o) => o.experiment_id.startsWith("EXP_INTRUS"))).toBe(false);
    // Investigation d'un autre projet que celui de la requête : 422 (incohérence), avant même le contrôle du prêt
    const other = await newProject("Durand — dépôt");
    expect((await api("observations", "POST", { query: `?project=${other}`, headers: holder, body: { experiment_id: "EXP_X", investigation_id: m.investigation_id, inputs: { a: 1 }, observed_output: { t: 1 } } })).status).toBe(422);
  });

  it("le titulaire écrit ; ses premières observations font passer la mission à « exploring » et le projet à « Découverte en cours » ; l'atelier et l'Analyste ne sont pas concernés", async () => {
    const q = `?project=${pa}`;
    expect((await api("events", "POST", { query: q, headers: holder, body: { type: "action", title: "Page d'accueil ouverte" } })).status).toBe(200);
    expect((await api("projects/[id]/connection", "POST", { id: pa, headers: holder, body: { status: "connected", detail: "Session ouverte", mission_id: m.mission_id } })).status).toBe(200);
    expect((await api("projects/[id]", "GET", { id: pa })).body.project.status).toBe("CONNECTED");
    const obs = await api("observations", "POST", { query: q, headers: holder, body: [{ experiment_id: "EXP_C4_1", inputs: { quantite: 2 }, observed_output: { total_price: 42 } }] });
    expect(obs.status, JSON.stringify(obs.body)).toBe(200);
    expect(obs.body.investigation_id).toBe(m.investigation_id);
    expect((await api("projects/[id]/analysis", "GET", { id: pa })).body.state).toBe("exploring");
    expect((await api("projects/[id]", "GET", { id: pa })).body.project.status).toBe("DISCOVERING");
    expect((await api("schema", "POST", { query: q, headers: holder, body: { title: "Devis", fields: [{ name: "quantite", type: "number" }] } })).status).toBe(200);
    expect((await api("migration/sources", "POST", { query: q, headers: holder, body: { name: "clients.csv", content_base64: Buffer.from("id;nom\n1;Client 1").toString("base64"), mechanism: "export CSV" } })).status).toBe(200);
    // Atelier (aucun projet) : ouvert aux agents comme avant
    expect((await api("events", "POST", { headers: intruder, body: { type: "log", title: "Atelier : répétition" } })).status).toBe(200);
    // L'Analyste n'a pas de mission : jamais concerné ; l'ancien jeton commun déclaré « analyst » non plus
    expect((await api("events", "POST", { query: q, headers: asService("analyst"), body: { source: "analyst", type: "hypothesis", title: "Remise de 10 % au-delà de 5 unités" } })).status).toBe(200);
    expect((await api("events", "POST", { query: q, headers: asService("all"), body: { source: "analyst", type: "hypothesis", title: "Arrondi à l'euro" } })).status).toBe(200);
    expect((await api("schema", "POST", { query: `${q}&source=analyst`, headers: asService("all"), body: { title: "Devis (Analyste)", fields: [{ name: "quantite", type: "number" }] } })).status).toBe(200);
  });

  it("saisies de mot de passe et secrets connus masqués AVANT l'enregistrement : jamais dans le journal, le flux ni les réponses ; valeurs métier de l'Analyste intactes", async () => {
    const q = `?project=${pa}`;
    const sent = await api("events", "POST", {
      query: q,
      headers: holder,
      body: [
        { type: "action", title: `Saisie motdepasse = ${SECRET_A}`, detail: `Connexion avec compte.agent / ${SECRET_A}`, data: { action: "fill", target: "motdepasse", value: SECRET_A } },
        { type: "action", title: "Saisie du mot de passe", data: { action: "type", selector: "#password", text: "Autre-Saisie-Inconnue-42" } },
        { type: "log", title: "Formulaire rempli", data: { fields: [{ name: "pwd", value: "Encore-Une-Valeur-77" }], password: "Valeur-Directe-55" } },
        { type: "error", title: "Diagnostic", detail: `Jeton ${env.tokens.explorer} refusé par le proxy` },
      ],
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    const analyst = await api("events", "POST", { query: q, headers: asService("analyst"), body: { source: "analyst", type: "experiment_request", title: "Expérience demandée : 3 passagers", data: { inputs: { nb_passagers: 3, code_tarif: "PASS-2024" } } } });
    expect(analyst.status).toBe(200);
    const saved = events().filter((e) => [...sent.body.ids, ...analyst.body.ids].includes(e.id));
    expect(saved).toHaveLength(5);
    expect(saved[0]).toMatchObject({ title: "Saisie motdepasse = •••", detail: "Connexion avec ••• / •••", data: { action: "fill", target: "motdepasse", value: "•••" } });
    expect(saved[1].data).toEqual({ action: "type", selector: "#password", text: "•••" });
    expect(saved[2].data).toEqual({ fields: [{ name: "pwd", value: "•••" }], password: "•••" });
    expect(saved[3].detail).toBe("Jeton ••• refusé par le proxy");
    expect(saved[4].data).toEqual({ inputs: { nb_passagers: 3, code_tarif: "PASS-2024" } });
    const leaks = [SECRET_A, "compte.agent", "Autre-Saisie-Inconnue-42", "Encore-Une-Valeur-77", "Valeur-Directe-55", env.tokens.explorer];
    const stored = JSON.stringify(lib.store.getState());
    const seen = JSON.stringify((await api("events", "GET", { query: q })).body);
    for (const s of leaks) {
      expect(stored, "état du Studio").not.toContain(s);
      expect(seen, "réponse au propriétaire").not.toContain(s);
    }
  });
});

describe("C4 — adresse de l'ancien logiciel modifiée (PATCH) : contrôle LegacyUrlSchema, identifiants effacés, mission annulée", () => {
  it("adresse avec identifiant ou non http(s) refusée sans être recopiée ; changement : clé et chiffré effacés, jeton révoqué, analyse annulée, refus explicite (409) à l'exécuteur", async () => {
    const pb = await newProject("Durand — atelier B", { credentials: { username: "compte.b", password: SECRET_B } });
    const m = await claimed(pb, "doublure-c4-bravo");
    const key = keyFileOf(pb);
    expect(fs.existsSync(credFile(pb)) && fs.existsSync(key)).toBe(true);
    expect(lib.cred.activeRedeemTokens(pb)).toBe(1);
    const patch = (legacy_url: string) => api("projects/[id]", "PATCH", { id: pb, body: { legacy_url } });
    const withCreds = await patch("http://compte.b:motdepasse@127.0.0.1:9/");
    expect(withCreds.status).toBe(400);
    expect(withCreds.body.issues).toEqual([{ path: "legacy_url", message: lib.contracts.LEGACY_URL_WITH_CREDENTIALS }]);
    expect(JSON.stringify(withCreds.body)).not.toMatch(/motdepasse@|compte\.b:/);
    for (const bad of ["ftp://127.0.0.1:9/", "javascript:alert(1)", `http://${"a".repeat(600)}.exemple.fr/`]) expect((await patch(bad)).status, bad).toBe(400);
    // Refus : rien n'a changé (identifiants, jeton, mission)
    expect(fs.existsSync(credFile(pb))).toBe(true);
    expect(lib.cred.activeRedeemTokens(pb)).toBe(1);
    expect((await api("projects/[id]/analysis", "GET", { id: pb })).body.state).toBe("claimed");
    // Même adresse : rien n'est effacé
    expect((await patch("http://127.0.0.1:9/")).body).not.toHaveProperty("credentials");
    expect(fs.existsSync(credFile(pb))).toBe(true);
    const seq = lib.store.getState().event_seq;
    const moved = await patch("http://127.0.0.1:8/");
    expect(moved.status).toBe(200);
    expect(moved.body.credentials).toEqual({ stored: false });
    // Annulation immédiate, par le PATCH lui-même (avant toute lecture qui la déclencherait aussi)
    expect(await lib.analysis.activeMission(pb)).toBeNull();
    const titles = events().filter((e) => e.seq > seq && (e as { project_id?: string }).project_id === pb).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining(["Identifiants de l'ancien logiciel effacés : adresse de l'ancien logiciel modifiée (confiez à nouveau un accès pour la nouvelle adresse)", "Analyse annulée : l'adresse de l'ancien logiciel a changé depuis la demande"]));
    expect(fs.existsSync(key)).toBe(false);
    expect(fs.existsSync(credFile(pb))).toBe(false);
    expect(lib.cred.activeRedeemTokens(pb)).toBe(0);
    expect((await api("projects/[id]/analysis", "GET", { id: pb })).body.state).toBe("cancelled");
    expect(JSON.stringify(events())).not.toContain(SECRET_B);
    // L'exécuteur est arrêté explicitement, et son jeton ne sert plus
    const late = await api("events", "POST", { query: `?project=${pb}`, headers: executor("doublure-c4-bravo"), body: { type: "log", title: "toujours là" } });
    expect(late.status).toBe(409);
    expect(late.body.error).toMatch(/adresse de l'ancien logiciel a changé/);
    expect((await api("projects/[id]/credentials/redeem", "POST", { id: pb, headers: executor("doublure-c4-bravo"), body: { token: m.credential.token } })).status).toBe(409);
    expect(lib.cred.redeemToken(pb, m.credential.token).ok).toBe(false);
    // Adresse effacée ("")
    expect((await patch("")).body.project.legacy_url).toBeNull();
  });
});

describe("C4 — investigations : adresse cible contrôlée (LegacyUrlSchema), secrets masqués dans les textes libres", () => {
  it("refuse une adresse avec identifiant ou non http(s) sans la recopier ; accepte une adresse valide ; ignore une adresse vide", async () => {
    const post = (body: Record<string, unknown>) => api("investigations", "POST", { headers: asService("explorer"), body: { application: "Atelier C4", module: "Devis", mode: "live", ...body } });
    const bad = await post({ target_url: "http://agent:motdepasse@127.0.0.1:9/" });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: "Adresse cible refusée", issues: [{ path: "target_url", message: lib.contracts.LEGACY_URL_WITH_CREDENTIALS }] });
    expect(JSON.stringify(bad.body)).not.toContain("motdepasse");
    for (const url of ["ftp://127.0.0.1/", "javascript:alert(1)", "//127.0.0.1:9/"]) expect((await post({ target_url: url })).status, url).toBe(400);
    expect(JSON.stringify(events())).not.toContain("agent:motdepasse");
    const ok = await post({ target_url: "http://127.0.0.1:9/", objective: `Explorer avec le jeton ${env.tokens.analyst}` });
    expect(ok.status).toBe(200);
    expect(ok.body.investigation).toMatchObject({ target_url: "http://127.0.0.1:9/", objective: "Explorer avec le jeton •••" });
    expect(JSON.stringify(events())).not.toContain(env.tokens.analyst);
    const empty = await post({ target_url: "" });
    expect(empty.status).toBe(200);
    expect(empty.body.investigation).not.toHaveProperty("target_url");
  });
});

describe("C4 — balayage des identifiants depuis handler() : au plus une fois par minute, depuis n'importe quelle route", () => {
  it("GET /api/me efface un identifiant échu ; 39 s plus tard rien n'est balayé ; après 61 s, le suivant l'est", async () => {
    offset += 2 * 60_000; // aucun balayage récent
    const p2 = await newProject("Durand — balayage 1", { credentials: { username: "u2", password: "Mdp-Balayage-Deux", ttl_hours: 0.25 } });
    const p3 = await newProject("Durand — balayage 2", { credentials: { username: "u3", password: "Mdp-Balayage-Trois", ttl_hours: 0.25 + 30 / 3600 } });
    offset += 15 * 60_000 + 1_000; // p2 échu, p3 pas encore
    expect((await api("me", "GET")).status).toBe(200);
    expect(fs.existsSync(credFile(p2))).toBe(false);
    expect(fs.existsSync(credFile(p3))).toBe(true);
    offset += 39_000; // p3 échu, mais dernier balayage il y a 39 s
    expect((await api("me", "GET")).status).toBe(200);
    expect(fs.existsSync(credFile(p3))).toBe(true);
    offset += 22_000; // 61 s après le premier balayage
    expect((await api("me", "GET")).status).toBe(200);
    expect(fs.existsSync(credFile(p3))).toBe(false);
    expect(events().filter((e) => e.title === "Identifiants effacés : échéance de 24 h atteinte" && [p2, p3].includes((e as { project_id?: string }).project_id ?? "")).length).toBe(2);
  });

  it("jeton de remise échu : inutilisable dès l'échéance ; son empreinte survit une heure au balayage (motif exact « expiré »), puis disparaît", async () => {
    const p = await newProject("Durand — jeton échu", { credentials: { username: "u4", password: "Mdp-Jeton-Echu-4" } });
    const t = lib.cred.issueRedeemToken(p, { mission_id: "MIS_00000000c4", executor_id: "EXE_c4c4c4c4c4c4" });
    offset += 15 * 60_000 + 1_000;
    lib.cred.sweepCredentials(Date.now() + offset); // balayage minute (handler(), minuterie)
    expect(lib.cred.redeemToken(p, t.token, { executor_id: "EXE_c4c4c4c4c4c4" })).toEqual({ ok: false, reason: "expired" });
    offset += 3600_000;
    lib.cred.sweepCredentials(Date.now() + offset);
    expect(lib.cred.redeemToken(p, t.token, { executor_id: "EXE_c4c4c4c4c4c4" })).toEqual({ ok: false, reason: "invalid" });
    expect(fs.existsSync(path.join(env.dataDir, "migration", "projects", p, "missions.json"))).toBe(false); // seule empreinte du projet : supprimée
  });
});

describe("C4 — repli de l'opérateur : jamais sur le projet d'un client (rattaché par la CLI)", () => {
  it("projet courant rattaché à un client : l'opérateur doit désigner le projet (400), /api/state ne le résume plus, ?project= → 404 ; le client y accède", async () => {
    const op = await signUp({ firstName: "Équipe", lastName: "REBORN" });
    await makeOperator(op.email);
    const client = await signUp({ firstName: "Chloé", lastName: "Martin", company: "Martin SARL" });
    const created = await api("migration/project", "POST", { headers: asUser(op.cookie), body: { name: "Projet repris par un client" } });
    expect(created.status).toBe(200);
    const pid = created.body.project.id as string;
    expect((await api("migration/sources", "GET", { headers: asUser(op.cookie) })).status).toBe(200); // repli sur son propre projet
    expect((await api("state", "GET", { headers: asUser(op.cookie) })).body.migration).toMatchObject({ name: "Projet repris par un client" });
    // npm run account -- assign <MIG> <email> (même base, même index, comme en service)
    const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
      const p = spawn(process.execPath, ["--no-warnings", ACCOUNT, "assign", pid, client.email], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", REBORN_DATA_DIR: env.dataDir } as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      p.stdout.on("data", (d: Buffer) => (text += d));
      p.stderr.on("data", (d: Buffer) => (text += d));
      p.on("close", (code) => resolve({ code, text }));
    });
    expect(out.code, out.text).toBe(0);
    const fallback = await api("migration/sources", "GET", { headers: asUser(op.cookie) });
    expect(fallback.status).toBe(400);
    expect(fallback.body.error).toMatch(/^Projet requis : le projet courant appartient à un client/);
    const st = await api("state", "GET", { headers: asUser(op.cookie) });
    expect(st.status).toBe(200);
    expect(st.body.migration).toBeNull();
    expect((await api("migration/sources", "GET", { headers: asUser(op.cookie), query: `?project=${pid}` })).status).toBe(404);
    expect((await api("migration/sources", "GET", { headers: asUser(client.cookie), query: `?project=${pid}` })).status).toBe(200);
  });
});

describe("C4 — journal des correspondances : une correction manuelle n'est jamais présentée comme venant de l'équipe", () => {
  it("nouvelle version d'origine « user » : « Correspondances vN reçues (correction manuelle) »", async () => {
    const pid = await newProject("Durand — correspondances");
    const csv = Buffer.from("id;nom;categorie\n1;Client 1;A\n2;Client 2;B\n3;Client 3;A").toString("base64");
    expect((await api("migration/sources", "POST", { query: `?project=${pid}`, body: { name: "clients.csv", content_base64: csv } })).status).toBe(200);
    expect((await api("migration/mapping", "POST", { query: `?project=${pid}&propose=auto` })).status).toBe(200);
    const { currentMapping, setMapping } = await import("@/lib/migration/project");
    const { projectScope } = await import("@/lib/migration/context");
    const v = projectScope.run(pid, () => setMapping(currentMapping()!.mapping, "user"));
    const title = events().filter((e) => (e as { project_id?: string }).project_id === pid && e.title.startsWith(`Correspondances v${v.version} reçues`)).at(-1)?.title;
    expect(title).toMatch(/^Correspondances v2 reçues \(correction manuelle\) — \d+ entité\(s\)$/);
  });
});

describe("C4 — /api/session par handler() ; /api/contracts liste les routes de l'exécuteur", () => {
  it("/api/session : 410 public, annotation d'accès, contrôle d'hôte et d'origine de handler()", async () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      expect((R.session[m] as unknown as { reborn?: unknown }).reborn, m).toEqual({ access: ["public"], write: false, project: "none" });
      expect((await api("session", m, { headers: {}, body: m === "GET" ? undefined : {} })).status, m).toBe(410);
    }
    expect((await api("session", "POST", { headers: { origin: "https://evil.example" }, body: {} })).status).toBe(403);
    expect((await api("session", "GET", { headers: { host: "evil.example" } })).status).toBe(403);
  });

  it("/api/contracts (public) : battement, prise, fin de mission, remise, rapport de connexion, avec leurs schémas", async () => {
    const c = await api("contracts", "GET", { headers: {} });
    expect(c.status).toBe(200);
    expect(Object.keys(c.body.executor.endpoints)).toEqual(
      expect.arrayContaining(["POST /api/executor/heartbeat", "POST /api/executor/missions/claim", "POST /api/executor/missions/{mission_id}/complete", "POST /api/projects/{id}/credentials/redeem", "POST /api/projects/{id}/connection", "GET /api/projects/{id}/mission"]),
    );
    expect(c.body.executor.authentication).toMatch(/x-reborn-executor/i);
    expect(c.body.executor.contracts.connection_mission).toMatchObject({ "x-contract-version": "1.1", properties: { mission_id: expect.any(Object), credential: expect.any(Object) } });
    expect(c.body.executor.contracts.executor_heartbeat.properties.networks).toBeDefined();
    expect(c.body.executor.contracts.mission_complete.properties.outcome).toBeDefined();
    expect(c.body.executor.contracts.connection_report.properties.mission_id).toBeDefined();
    expect(c.body.observation.properties.experiment_id).toBeDefined(); // contrats existants inchangés
  });
});

describe("C4 — règles d'affichage du navigateur client", () => {
  it("logiciel livré : l'état du processus se lit sur `managed` (pid masqué pour un client) — jamais « lancé hors du Studio » à tort", async () => {
    const { appProcessState } = await import("@/components/project/view-rules");
    expect(appProcessState({ running: true, managed: true })).toBe("managed"); // client : pid null, géré par le Studio
    expect(appProcessState({ running: true, managed: false })).toBe("external");
    expect(appProcessState({ running: false, managed: true })).toBe("unresponsive");
    expect(appProcessState({ running: false, managed: false })).toBe("stopped");
  });

  it("captures : seulement /api/shots/<nom> (aucune image externe chargée par le navigateur du client)", async () => {
    const { connSafeShot } = await import("@/components/project/ConnShared");
    expect(connSafeShot("/api/shots/0f8fad5b-d9cb-469f-a165-70867728950e.png")).toBe("/api/shots/0f8fad5b-d9cb-469f-a165-70867728950e.png");
    for (const url of ["https://tiers.exemple/pixel.png", "http://127.0.0.1:4000/a.png", "//tiers.exemple/a.png", "/api/shots/../state.json", "/api/shots/a/b.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "", null, undefined]) {
      expect(connSafeShot(url as string | null | undefined), String(url)).toBeNull();
    }
  });

  it("journal de migration : uniquement les évènements portant l'identifiant du projet (aucun repli par date)", async () => {
    const { projectJournal } = await import("@/components/project/view-rules");
    const ev = [
      { id: "1", type: "migration", project_id: "MIG_aaaaaaaa", title: "A ancien" },
      { id: "2", type: "migration", title: "sans projet (atelier, ancien journal global), récent" },
      { id: "3", type: "migration", project_id: "MIG_bbbbbbbb", title: "B" },
      { id: "4", type: "log", project_id: "MIG_aaaaaaaa", title: "A, pas un évènement de migration" },
      { id: "5", type: "migration", data: { project_id: "MIG_aaaaaaaa" }, title: "A (format ancien : data.project_id)" },
      { id: "6", type: "migration", project_id: "MIG_aaaaaaaa", title: "A récent" },
    ];
    expect(projectJournal(ev, "MIG_aaaaaaaa", 30).map((e) => e.id)).toEqual(["6", "5", "1"]);
    expect(projectJournal(ev, "MIG_aaaaaaaa", 2).map((e) => e.id)).toEqual(["6", "5"]);
  });

  it("aperçu de la mission sans demande d'analyse (mission_id null) : la note du Studio est affichée, jamais un identifiant absent", async () => {
    const { missionPreviewLine } = await import("@/components/project/view-rules");
    const { missionInfo } = await import("@/components/project/ConnAnalysis");
    expect(missionPreviewLine({ mission_id: null, status: null, note: "Aperçu : aucune analyse demandée pour ce projet." })).toEqual({ kind: "preview", text: "Aperçu : aucune analyse demandée pour ce projet." });
    expect(missionPreviewLine({ mission_id: null }).kind).toBe("preview");
    expect(missionPreviewLine({ mission_id: "MIS_0123456789", status: "queued" }, (s) => missionInfo(s).label)).toEqual({ kind: "mission", text: `Mission MIS_0123456789 · ${missionInfo("queued").label}` });
    // Contrat réel : GET …/mission d'un projet sans analyse
    const pid = await newProject("Durand — aperçu");
    const R2 = (await import("@/app/api/projects/[id]/mission/route")) as unknown as Mod;
    const view = await callRoute(R2, "GET", `/api/projects/${pid}/mission`, { params: { id: pid }, headers: asUser(owner.cookie) });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ mission_id: null, note: expect.stringMatching(/^Aperçu : aucune analyse demandée/) });
    expect(missionPreviewLine(view.body)).toEqual({ kind: "preview", text: view.body.note });
  });

  it("projectCall : une réponse 401 ramène à la page de connexion (une seule fois), avec la page en cours comme retour ; les autres erreurs restent affichées", async () => {
    const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
    const saved = { window: g.window, fetch: g.fetch };
    const assign = vi.fn();
    g.window = { location: { origin: ORIGIN, pathname: "/projets/MIG_12345678/livraison", search: "?onglet=acces", assign } };
    let status = 401;
    g.fetch = vi.fn(async () => new Response(JSON.stringify(status === 401 ? { ok: false, error: "Connexion requise" } : { ok: false, error: "Projet introuvable" }), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    try {
      const { projectCall, SESSION_LOST_MESSAGE } = await import("@/components/project/ProjectProvider");
      const { loginPath } = await import("@/components/shell/next-path");
      await expect(projectCall("MIG_12345678", "GET", "/api/migration/app")).rejects.toThrow(SESSION_LOST_MESSAGE);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith(loginPath("/projets/MIG_12345678/livraison?onglet=acces", "expiree"));
      expect(assign.mock.calls[0][0]).toMatch(/^\/connexion\?suite=%2Fprojets%2FMIG_12345678%2Flivraison.*&raison=expiree$/);
      await expect(projectCall("MIG_12345678", "POST", "/api/migration/app", { action: "start" })).rejects.toThrow(SESSION_LOST_MESSAGE);
      expect(assign).toHaveBeenCalledTimes(1); // une seule redirection
      status = 404;
      await expect(projectCall("MIG_12345678", "GET", "/api/migration/app")).rejects.toThrow("Projet introuvable");
      expect(assign).toHaveBeenCalledTimes(1);
      // Même règle pour connApi (écrans Connexion et Découverte), dans une nouvelle page (modules rechargés)
      vi.resetModules();
      assign.mockClear();
      status = 401;
      const shared = await import("@/components/project/ConnShared");
      await expect(shared.connApi("GET", "/api/projects/MIG_12345678/analysis")).rejects.toMatchObject({ status: 401, message: SESSION_LOST_MESSAGE });
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign.mock.calls[0][0]).toMatch(/^\/connexion\?suite=.*&raison=expiree$/);
    } finally {
      g.window = saved.window;
      g.fetch = saved.fetch;
    }
  });
});
