/**
 * Sorties réseau du Studio (SPEC §7, lot B2) : contrôle SSRF RÉEL avec de vrais serveurs HTTP éphémères
 * (127.0.0.1, port aléatoire) et un résolveur DNS injecté pour les noms (aucun accès à Internet).
 * Liste blanche de test injectée (setEgressOverrides), jamais celle du poste.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkEgressTarget, egressAllowList, egressRequest, EgressError, isDeniedAddress, requiredNetwork, setEgressOverrides } from "@/lib/migration/egress";
import { LegacyUrlSchema, legacyUrlProblem, ProjectCreateSchema } from "@/lib/migration/project-contracts";
import { runHttpExtraction } from "@/lib/migration/connectors";

interface Srv {
  port: number;
  hits: string[];
  close: () => Promise<void>;
}
/** Serveur HTTP de test : enregistre chaque requête reçue (chemin). */
function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<Srv> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    handler(req, res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, hits, close: () => new Promise<void>((r) => server.close(() => r())) })),
  );
}

let ok: Srv; // logiciel de test autorisé
let secret: Srv; // cible interne qui ne doit JAMAIS être contactée
let redirect: Srv; // répond par une redirection vers la cible interne
let big: Srv;
let slow: Srv;
let restore: () => void = () => {};

beforeAll(async () => {
  secret = await serve((_req, res) => res.end("DONNEES-INTERNES"));
  ok = await serve((req, res) => {
    if (req.url === "/login" && req.method === "POST") {
      res.writeHead(302, { location: "/", "set-cookie": "SID=abc; Path=/; HttpOnly" });
      return res.end();
    }
    if (req.url === "/exports/clients.csv") {
      if (!String(req.headers.cookie ?? "").includes("SID=abc")) {
        res.writeHead(401);
        return res.end("Session requise");
      }
      return res.end("id;nom\n1;Client\n");
    }
    if (req.url === "/exports/redirige.csv") {
      res.writeHead(302, { location: `http://127.0.0.1:${secret.port}/vol` });
      return res.end();
    }
    res.end("bonjour");
  });
  redirect = await serve((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${secret.port}/vol` });
    res.end();
  });
  big = await serve((_req, res) => res.end(Buffer.alloc(2 * 1024 * 1024, 65)));
  slow = await serve(() => {
    /* ne répond jamais */
  });
  restore = setEgressOverrides({ allow: [`127.0.0.1:${ok.port}`, `[::1]:${ok.port}`, `127.0.0.1:${redirect.port}`, `127.0.0.1:${big.port}`, `127.0.0.1:${slow.port}`] });
});
afterAll(async () => {
  restore();
  for (const s of [ok, secret, redirect, big, slow]) await s?.close();
});

const refusal = async (target: string, opts?: Parameters<typeof egressRequest>[1]) => {
  try {
    await egressRequest(target, opts);
  } catch (e) {
    return e as EgressError;
  }
  throw new Error(`requête acceptée à tort : ${target}`);
};

describe("SSRF : adresses internes refusées avant toute connexion", () => {
  const internal = [
    ["Studio (127.0.0.1:3000)", "http://127.0.0.1:3000/api/state"],
    ["métadonnées de l'hébergeur", "http://169.254.169.254/latest/meta-data/"],
    ["console de maintenance IPv6 ([::1]:4001)", "http://[::1]:4001/"],
    ["écriture hexadécimale 0x7f.1", "http://0x7f.1/"],
    ["écriture décimale 2130706433", "http://2130706433/"],
    ["IPv4 mappée ::ffff:127.0.0.1", "http://[::ffff:127.0.0.1]/"],
    ["IPv4 mappée hexadécimale", "http://[::ffff:7f00:1]:4100/"],
    ["réseau privé 10/8", "http://10.0.0.5/"],
    ["réseau privé 192.168/16", "http://192.168.1.1/"],
    ["réseau privé 172.16/12", "http://172.20.0.1/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["0.0.0.0", "http://0.0.0.0:4100/"],
    ["IPv6 ULA", "http://[fd00::1]/"],
    ["IPv6 lien local", "http://[fe80::1]/"],
    ["NAT64", "http://[64:ff9b::7f00:1]/"],
    ["6to4", "http://[2002:7f00:1::1]/"],
  ];
  it.each(internal)("%s : refusé", async (_label, target) => {
    const e = await refusal(target);
    expect(e).toBeInstanceOf(EgressError);
    expect(e.code).toBe("blocked");
    // Jamais l'adresse dans le message (aucune information sur le réseau interne)
    expect(e.message).not.toContain(new URL(target).hostname.replace(/^\[|\]$/g, ""));
  });

  it("le port du Studio, de la console et du logiciel livré n'est jamais autorisé, même inscrit dans la liste blanche", async () => {
    const back = setEgressOverrides({ allow: ["127.0.0.1:3000", "127.0.0.1:4001", "127.0.0.1:5050", "[::1]:3000"] });
    try {
      expect(egressAllowList().size).toBe(0);
      for (const t of ["http://127.0.0.1:3000/", "http://127.0.0.1:4001/", "http://127.0.0.1:5050/", "http://[::1]:3000/"]) expect((await refusal(t)).code).toBe("blocked");
      // Même passée explicitement à la requête
      expect((await refusal("http://127.0.0.1:3000/", { allow: new Set(["127.0.0.1:3000"]) })).code).toBe("blocked");
    } finally {
      back();
    }
  });

  it("les plages réservées ne débordent pas sur les adresses publiques (IPv4 et IPv6)", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "2a00:1450:4007:80b::200e"]) expect(isDeniedAddress(ip), ip).toBe(false);
    for (const ip of ["127.0.0.1", "::1", "::", "::ffff:10.0.0.1", "169.254.169.254", "fc00::1", "ff02::1", "224.0.0.1", "255.255.255.255"]) expect(isDeniedAddress(ip), ip).toBe(true);
  });
});

describe("SSRF : noms DNS contrôlés à la connexion (chaque adresse résolue)", () => {
  it("un nom résolu vers une adresse privée est refusé ; une seule adresse interne suffit", async () => {
    const back = setEgressOverrides({
      resolve: async (name) =>
        name === "interne.exemple.test" ? [{ address: "10.1.2.3", family: 4 }] : name === "mixte.exemple.test" ? [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] : [{ address: "fd12::5", family: 6 }],
    });
    try {
      for (const t of ["http://interne.exemple.test/", "http://mixte.exemple.test/", "https://ula.exemple.test/"]) expect((await refusal(t)).code, t).toBe("blocked");
    } finally {
      back();
    }
  });

  it("le vrai nom « localhost » (résolution du système) est refusé hors liste blanche", async () => {
    expect((await refusal("http://localhost:3000/")).code).toBe("blocked");
    expect((await refusal(`http://localhost:${secret.port}/`)).code).toBe("blocked");
    expect(secret.hits).toEqual([]);
  });

  it("liste blanche de test : le logiciel de test local est joignable (IP littérale ou nom)", async () => {
    const r = await egressRequest(`http://127.0.0.1:${ok.port}/`);
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe("bonjour");
    const byName = await egressRequest(`http://localhost:${ok.port}/`);
    expect(byName.status).toBe(200);
  });
});

describe("Redirections, taille, délai", () => {
  it("une redirection n'est jamais suivie : la cible interne ne reçoit rien", async () => {
    const r = await egressRequest(`http://127.0.0.1:${redirect.port}/`);
    expect(r.status).toBe(302);
    expect(String(r.headers.location)).toContain(`:${secret.port}/`);
    expect(secret.hits).toEqual([]);
  });

  it("le connecteur traite une redirection d'export comme un refus, sans la suivre", async () => {
    const out = await runHttpExtraction(
      { contract_version: "1.0", system: "Logiciel de test", login: { url: "/login", username_field: "u", password_field: "p", session_cookie: "SID" }, mechanisms: [{ id: "clients", kind: "export", url: "/exports/clients.csv" }, { id: "piege", kind: "export", url: "/exports/redirige.csv" }] },
      { baseUrl: `http://127.0.0.1:${ok.port}`, username: "compte", password: "mot-de-passe-de-test" },
    );
    expect(out.results.find((r) => r.id === "clients")?.status).toBe("ok");
    expect(out.results.find((r) => r.id === "piege")).toMatchObject({ status: "unauthorized", http: 302 });
    expect(secret.hits).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("mot-de-passe-de-test");
    expect(out.account).toBe("c••••e"); // masque unique (premier et dernier caractère)
  });

  it("une réponse trop volumineuse est abandonnée en cours de lecture", async () => {
    const e = await refusal(`http://127.0.0.1:${big.port}/`, { maxBytes: 1024 * 1024 });
    expect(e.code).toBe("too_large");
  });

  it("délai global : un logiciel qui ne répond pas est abandonné", async () => {
    const t0 = Date.now();
    const e = await refusal(`http://127.0.0.1:${slow.port}/`, { timeoutMs: 300 });
    expect(e.code).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("le connecteur refuse une base interne sans rien contacter, et sans recopier l'adresse", async () => {
    await expect(runHttpExtraction({ contract_version: "1.0", system: "X", mechanisms: [{ id: "a", kind: "export", url: "/a" }] }, { baseUrl: `http://169.254.169.254/` })).resolves.toMatchObject({
      results: [{ id: "a", status: "error", message: expect.stringMatching(/^Adresse refusée/) }],
    });
  });
});

describe("Adresse avec identifiants : refusée partout, jamais recopiée", () => {
  const URLS = ["http://alice:S3cret-Pw@127.0.0.1:4100/", "https://alice@logiciel.exemple.test/", "http://:S3cret-Pw@logiciel.exemple.test/"];
  it.each(URLS)("%s", async (u) => {
    const e = await refusal(u);
    expect(e.code).toBe("credentials_in_url");
    expect(e.message).not.toMatch(/alice|S3cret/);
    expect(() => checkEgressTarget(u)).toThrow(/identifiant ou un mot de passe/);
    const parsed = LegacyUrlSchema.safeParse(u);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).not.toMatch(/alice|S3cret/);
    expect(legacyUrlProblem(u)).toMatch(/identifiant ou un mot de passe/);
    const create = ProjectCreateSchema.safeParse({ company: "X", authorized: true, legacy_url: u });
    expect(create.success).toBe(false);
    expect(JSON.stringify(create.error?.issues)).not.toMatch(/alice|S3cret/);
  });

  it("LegacyUrlSchema : http(s) seulement, hôte non vide, 500 caractères au plus", () => {
    expect(LegacyUrlSchema.safeParse("https://logiciel.exemple.fr/connexion").success).toBe(true);
    expect(LegacyUrlSchema.safeParse("http://127.0.0.1:4100").success).toBe(true);
    for (const bad of ["ftp://logiciel.exemple.fr/", "javascript:alert(1)", "file:///etc/passwd", "http://", "logiciel.exemple.fr", `https://exemple.fr/${"a".repeat(500)}`]) expect(LegacyUrlSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe("Réseau requis par une adresse (file des missions)", () => {
  it("bouclage, réseau local, .local et noms sans domaine → private ; Internet → public", async () => {
    const back = setEgressOverrides({ resolve: async (name) => (name === "intranet.exemple.test" ? [{ address: "192.168.10.4", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]) });
    try {
      expect(await requiredNetwork("http://127.0.0.1:4100/")).toBe("private");
      expect(await requiredNetwork("http://serveur-erp:8080/")).toBe("private");
      expect(await requiredNetwork("http://erp.local/")).toBe("private");
      expect(await requiredNetwork("http://intranet.exemple.test/")).toBe("private");
      expect(await requiredNetwork("https://crm.exemple.test/")).toBe("public");
      expect(await requiredNetwork("https://93.184.216.34/")).toBe("public");
    } finally {
      back();
    }
  });
});

describe("Explorateur de répétition de l'atelier : même garde réseau", () => {
  it("une investigation simulée vers une adresse interne échoue sans requête ni URL complète dans le journal", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-egress-"));
    const previous = process.env.REBORN_DATA_DIR;
    process.env.REBORN_DATA_DIR = dataDir;
    try {
      const store = await import("@/lib/store");
      const { runSimulation } = await import("@/lib/simulator");
      const inv = store.createInvestigation({ application: "Quotix 98", module: "Devis", mode: "simulation", kind: "initial", target_url: `http://alice:S3cret-Pw@127.0.0.1:${secret.port}/` });
      await runSimulation(inv);
      // Évènements émis par l'explorateur de répétition lui-même (l'évènement de lancement relève du lot B1)
      const events = store.getState().events.filter((e) => e.investigation_id === inv.id && e.source === "explorer");
      const error = events.find((e) => e.type === "error");
      expect(error?.title).toBe("Logiciel historique injoignable");
      expect(error?.detail).toMatch(/Adresse refusée/);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(events)).not.toMatch(/alice|S3cret/);
      expect(secret.hits).toEqual([]);
      store.flushPersist();
    } finally {
      if (previous === undefined) delete process.env.REBORN_DATA_DIR;
      else process.env.REBORN_DATA_DIR = previous;
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
