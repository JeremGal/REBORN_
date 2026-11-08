/**
 * Point d'application unique du contrôle d'accès (SPEC §1.3, §1.4) : tables de décision complètes des fonctions
 * de src/lib/http.ts — authorize() (qui ? quel droit ? quel projet ?), checkCsrf() (origine des écritures) et
 * targetProject() (désignation du projet). Complète les tests par les routes (isolation.test.ts, auth.test.ts) :
 * chaque barrière est vérifiée pour elle-même, même quand une seconde barrière (project.ts) masquerait son
 * absence dans un test de bout en bout.
 * Index des projets réel (projects.json) dans un dossier temporaire ; aucune donnée ni aucun secret du poste.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Access, Authentication } from "@/lib/http";
import type { Principal } from "@/lib/auth/principal";

const A = "MIG_aaaaaaaa"; // projet du client A
const B = "MIG_bbbbbbbb"; // projet du client B
const ORPHAN = "MIG_cccccccc"; // projet sans propriétaire (historique)
const OPS = "MIG_eeeeeeee"; // projet de l'opérateur
const UNKNOWN = "MIG_dddddddd"; // projet inexistant

let dir = "";
let http: typeof import("@/lib/http");

const user = (userId: string, role: "client" | "operator"): Principal => ({ kind: "user", userId, role, email: `${userId}@exemple.test`, firstName: "P", lastName: "N", company: null, sessionId: `s-${userId}` });
const svc = (service: "explorer" | "analyst" | "all"): Principal => ({ kind: "service", service, tokenId: `T_${service}` });
const PRINCIPALS: Record<string, Authentication> = {
  anonyme: { via: "none", principal: { kind: "anonymous" }, setCookies: [] },
  "jeton invalide": { via: "invalid-bearer", principal: { kind: "anonymous" }, setCookies: [] },
  "client A": { via: "cookie", principal: user("u-a", "client"), setCookies: [] },
  "client B": { via: "cookie", principal: user("u-b", "client"), setCookies: [] },
  opérateur: { via: "cookie", principal: user("u-op", "operator"), setCookies: [] },
  explorer: { via: "bearer", principal: svc("explorer"), setCookies: [] },
  analyst: { via: "bearer", principal: svc("analyst"), setCookies: [] },
  all: { via: "bearer", principal: svc("all"), setCookies: [] },
};

/** Issue attendue d'une décision : null = autorisé, sinon statut (et message pour 401/403/404/400). */
type Outcome = "ok" | 400 | 401 | "401-jeton" | 403 | 404;
async function outcome(who: string, access: Access[], pid: string | null): Promise<Outcome> {
  const res = http.authorize(PRINCIPALS[who], access, pid);
  if (!res) return "ok";
  const body = (await res.json()) as { error: string };
  const expectedMessage: Record<number, string> = { 401: "Connexion requise", 403: "Accès refusé : droits insuffisants", 404: "Projet introuvable" };
  if (res.status === 401 && body.error === "Jeton de service invalide") return "401-jeton";
  if (res.status === 400) {
    expect(body.error).toMatch(/^Projet requis/);
    return 400;
  }
  expect(body.error, `${who} ${access} ${pid}`).toBe(expectedMessage[res.status]);
  return res.status as Outcome;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-http-access-"));
  process.env.REBORN_DATA_DIR = dir;
  fs.mkdirSync(path.join(dir, "migration"), { recursive: true });
  const projects = [
    { id: A, dir: `projects/${A}`, owner_id: "u-a" },
    { id: B, dir: `projects/${B}`, owner_id: "u-b" },
    { id: ORPHAN, dir: `projects/${ORPHAN}` },
    { id: OPS, dir: `projects/${OPS}`, owner_id: "u-op" },
  ];
  fs.writeFileSync(path.join(dir, "migration", "projects.json"), JSON.stringify({ current: ORPHAN, projects }));
  for (const k of ["REBORN_LAN", "REBORN_ALLOWED_HOSTS", "REBORN_PUBLIC_URL", "REBORN_TRUST_PROXY"]) delete process.env[k];
  http = await import("@/lib/http");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("authorize() : table de décision complète (SPEC §1.3)", () => {
  it("anonyme 401, jeton invalide 401 explicite, « public » ouvert à tous", async () => {
    for (const access of [["user"], ["owner"], ["operator"], ["explorer"], ["analyst"], ["owner", "explorer", "analyst"]] as Access[][]) {
      for (const pid of [null, A, UNKNOWN]) {
        expect(await outcome("anonyme", access, pid), `${access} ${pid}`).toBe(401);
        expect(await outcome("jeton invalide", access, pid), `${access} ${pid}`).toBe("401-jeton");
      }
    }
    for (const who of Object.keys(PRINCIPALS)) for (const pid of [null, A, UNKNOWN]) expect(await outcome(who, ["public"], pid), `${who} ${pid}`).toBe("ok");
  });

  it("client : son projet seulement ; projet d'autrui, sans propriétaire ou inconnu → même 404 ; sans projet → 400 (aucun repli) ; rôle insuffisant → 403 avant tout projet", async () => {
    const expectFor: [Access[], string | null, Outcome][] = [
      [["owner"], A, "ok"], [["owner"], B, 404], [["owner"], ORPHAN, 404], [["owner"], OPS, 404], [["owner"], UNKNOWN, 404], [["owner"], null, 400],
      [["user"], A, "ok"], [["user"], B, 404], [["user"], ORPHAN, 404], [["user"], UNKNOWN, 404], [["user"], null, "ok"],
      [["operator"], A, 403], [["operator"], null, 403], [["operator"], UNKNOWN, 403],
      [["explorer"], A, 403], [["analyst"], A, 403], [["explorer", "analyst"], null, 403],
      [["owner", "explorer", "analyst"], A, "ok"], [["owner", "explorer", "analyst"], B, 404], [["owner", "explorer", "analyst"], null, 400],
    ];
    for (const [access, pid, want] of expectFor) {
      expect(await outcome("client A", access, pid), `client A ${access} ${pid}`).toBe(want);
      // Symétrie : B est traité exactement comme A sur ses propres projets
      const mirror = pid === A ? B : pid === B ? A : pid;
      expect(await outcome("client B", access, mirror), `client B ${access} ${mirror}`).toBe(want);
    }
  });

  it("opérateur : droit « operator » sur tout projet existant ; en « owner », ses projets et ceux sans propriétaire seulement, avec le repli sur le projet courant", async () => {
    const expectFor: [Access[], string | null, Outcome][] = [
      [["operator"], A, "ok"], [["operator"], ORPHAN, "ok"], [["operator"], null, "ok"], [["operator"], UNKNOWN, 404],
      [["owner"], OPS, "ok"], [["owner"], ORPHAN, "ok"], [["owner"], A, 404], [["owner"], B, 404], [["owner"], UNKNOWN, 404], [["owner"], null, "ok"],
      [["user"], A, 404], [["user"], null, "ok"],
      [["explorer"], ORPHAN, 403], [["analyst"], null, 403],
    ];
    for (const [access, pid, want] of expectFor) expect(await outcome("opérateur", access, pid), `opérateur ${access} ${pid}`).toBe(want);
  });

  it("services : explorer / analyst selon leur droit (« all » vaut les deux), tous les projets existants, jamais un projet inconnu ; jamais « owner », « user » ni « operator »", async () => {
    const table: [string, Access[], Outcome][] = [
      ["explorer", ["explorer"], "ok"], ["explorer", ["analyst"], 403], ["explorer", ["owner"], 403], ["explorer", ["user"], 403], ["explorer", ["operator"], 403],
      ["analyst", ["analyst"], "ok"], ["analyst", ["explorer"], 403], ["analyst", ["owner"], 403], ["analyst", ["operator"], 403],
      ["all", ["explorer"], "ok"], ["all", ["analyst"], "ok"], ["all", ["owner"], 403], ["all", ["operator"], 403], ["all", ["user"], 403],
    ];
    for (const [who, access, want] of table) {
      for (const pid of [null, A, B, ORPHAN]) expect(await outcome(who, access, pid), `${who} ${access} ${pid}`).toBe(want);
      expect(await outcome(who, access, UNKNOWN), `${who} ${access} inconnu`).toBe(want === "ok" ? 404 : want);
    }
  });
});

describe("checkCsrf() : origine des écritures (SPEC §1.4)", () => {
  const req = (method: string, headers: Record<string, string>) => new Request("http://127.0.0.1:3000/api/x", { method, headers: { host: "127.0.0.1:3000", ...headers } });
  const status = (via: Authentication["via"], method: string, headers: Record<string, string>, write = false) => http.checkCsrf(req(method, headers), { via }, write)?.status ?? "ok";

  it("cookie : écriture seulement avec l'Origin du Studio ou sec-fetch-site same-origin ; lecture libre ; write:true contrôlé même en GET", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(status("cookie", m, {}), m).toBe(403);
      expect(status("cookie", m, { origin: "https://evil.example" }), m).toBe(403);
      expect(status("cookie", m, { origin: "http://127.0.0.1:4000" }), m).toBe(403); // autre port du poste
      expect(status("cookie", m, { origin: "null" }), m).toBe(403);
      expect(status("cookie", m, { "sec-fetch-site": "cross-site" }), m).toBe(403);
      expect(status("cookie", m, { "sec-fetch-site": "same-site" }), m).toBe(403);
      expect(status("cookie", m, { origin: "http://127.0.0.1:3000" }), m).toBe("ok");
      expect(status("cookie", m, { "sec-fetch-site": "same-origin" }), m).toBe("ok");
      // Origin étrangère + sec-fetch-site same-origin (incohérent) : l'Origin fait foi
      expect(status("cookie", m, { origin: "https://evil.example", "sec-fetch-site": "same-origin" }), m).toBe(403);
    }
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(status("cookie", m, { origin: "https://evil.example" }), m).toBe("ok");
    expect(status("cookie", "GET", {}, true)).toBe(403);
    expect(status("cookie", "GET", { origin: "http://127.0.0.1:3000" }, true)).toBe("ok");
  });

  it("jeton Bearer : Origin non exigée (clients Python, Node), mais toute Origin étrangère refusée, en lecture comme en écriture", () => {
    for (const via of ["bearer", "invalid-bearer"] as const) {
      for (const m of ["GET", "POST", "DELETE"]) {
        expect(status(via, m, {}), `${via} ${m}`).toBe("ok");
        expect(status(via, m, { origin: "http://127.0.0.1:3000" }), `${via} ${m}`).toBe("ok");
        expect(status(via, m, { origin: "https://evil.example" }), `${via} ${m}`).toBe(403);
        expect(status(via, m, { "sec-fetch-site": "cross-site" }), `${via} ${m}`).toBe(403);
      }
    }
  });

  it("anonyme : écriture d'une page étrangère refusée (le 401 suit ensuite)", () => {
    expect(status("none", "POST", { origin: "https://evil.example" })).toBe(403);
    expect(status("none", "POST", {})).toBe("ok");
  });
});

describe("targetProject() : désignation du projet (SPEC §1.3)", () => {
  const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
  const pick = async (url: string, opts: { mode?: "param" | "query" | "none"; params?: Record<string, string>; header?: string } = {}) => {
    try {
      return await http.targetProject(new Request(`http://127.0.0.1:3000${url}`, { headers: opts.header ? { "x-reborn-project": opts.header } : {} }), ctx(opts.params), opts.mode);
    } catch (e) {
      return (e as { status?: number }).status ?? "erreur";
    }
  };

  it("?project=, x-reborn-project, [id] : identiques ou 400 ; identifiant invalide ou vide 400 ; « none » ignore tout", async () => {
    expect(await pick(`/api/migration/sources?project=${A}`)).toBe(A);
    expect(await pick("/api/migration/sources", { header: A })).toBe(A);
    expect(await pick(`/api/migration/sources?project=${A}`, { header: A })).toBe(A);
    expect(await pick(`/api/migration/sources?project=${A}`, { header: B })).toBe(400);
    expect(await pick("/api/migration/sources?project=")).toBe(400);
    expect(await pick("/api/migration/sources?project=../../etc")).toBe(400);
    expect(await pick("/api/migration/sources", { header: "MIG_zz" })).toBe(400);
    expect(await pick("/api/migration/sources")).toBeNull();
    expect(await pick(`/api/projects/${A}/credentials`, { mode: "param", params: { id: A } })).toBe(A);
    expect(await pick(`/api/projects/${A}/credentials?project=${B}`, { mode: "param", params: { id: A } })).toBe(400);
    expect(await pick(`/api/projects/${A}/credentials`, { mode: "param", params: { id: A }, header: B })).toBe(400);
    expect(await pick("/api/projects/x/credentials", { mode: "param", params: { id: "../../etc" } })).toBe(400);
    expect(await pick(`/api/projects/${A}`, { params: { id: A } })).toBe(A); // mode par défaut : [id] des routes /api/projects/…
    expect(await pick(`/api/executor/heartbeat?project=${A}`, { mode: "none", header: B })).toBeNull();
  });
});

describe("checkHost() : mode local et mode réseau (SPEC §1.2)", () => {
  const st = (host: string) => http.checkHost(new Request(`http://${host}/api/x`, { headers: { host } }))?.status ?? "ok";
  it("hors mode réseau : bouclage seulement (+ REBORN_ALLOWED_HOSTS) ; REBORN_LAN=1 : tous les hôtes, l'accès restant protégé par les comptes", () => {
    for (const h of ["127.0.0.1:3000", "localhost:3000", "[::1]:3000", "LOCALHOST:3000"]) expect(st(h), h).toBe("ok");
    for (const h of ["evil.example:3000", "192.168.1.20:3000", "127.0.0.1.evil.example:3000", "studio.interne:3000"]) expect(st(h), h).toBe(403);
    process.env.REBORN_ALLOWED_HOSTS = "studio.interne";
    try {
      expect(st("studio.interne:3000")).toBe("ok");
      expect(st("evil.example:3000")).toBe(403);
    } finally {
      delete process.env.REBORN_ALLOWED_HOSTS;
    }
    process.env.REBORN_LAN = "1";
    try {
      expect(st("192.168.1.20:3000")).toBe("ok");
    } finally {
      delete process.env.REBORN_LAN;
    }
    expect(st("192.168.1.20:3000")).toBe(403);
  });
});
