/**
 * Tests d'intégration : simulent les futurs envois de l'Explorer (Mouss) et de
 * l'Analyste (Alan) à travers les VRAIES routes API, avec les formats JSON prévus
 * pour l'intégration finale (fichiers platform/scenarios/*).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Mod = Record<string, (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>>;
const R: Record<string, Mod> = {};
let store: typeof import("@/lib/store");
let ENGINE_ID: string;

const scen = (s: string, f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../scenarios", s, f), "utf8"));

async function call(route: string, method: string, url = "", body?: unknown, headers: Record<string, string> = {}) {
  const req = new Request(`http://127.0.0.1:3000/api/${route}${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await R[route][method](req, { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  process.env.REBORN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-it-"));
  delete process.env.REBORN_API_TOKEN;
  delete process.env.EXPLORER_WEBHOOK_URL;
  for (const r of ["state", "observations", "rules", "schema", "app", "events", "investigations", "compute", "compare", "reset", "scenarios", "contracts", "health", "session", "revision"]) {
    R[r] = (await import(`@/app/api/${r}/route`)) as unknown as Mod;
  }
  store = await import("@/lib/store");
  ENGINE_ID = (await import("@/lib/engine/engine")).ENGINE_ID;
});

beforeEach(async () => {
  await call("reset", "POST");
});

/** Séquence d'intégration : investigation → schéma → observations → règles. */
async function baseline(s: "quote" | "logistics", schemaFile: string) {
  const inv = await call("investigations", "POST", "", { application: s, module: s, mode: "replay" });
  expect(inv.status).toBe(200);
  expect((await call("schema", "POST", "", scen(s, schemaFile))).status).toBe(200);
  // Investigation locale : les données sont rattachées explicitement (sinon 409, voir plus bas)
  const id = inv.body.investigation.id;
  const o = await call("observations", "POST", "", (scen(s, "observations.v1.json") as object[]).map((x) => ({ ...x, investigation_id: id })));
  expect(o.status).toBe(200);
  const r = await call("rules", "POST", "", scen(s, "rules.v1.json"));
  expect(r.status).toBe(200);
  return { inv: inv.body.investigation, rules: r.body };
}

describe("Scénario A — configurateur de devis (Quotix 98)", () => {
  it("reconstruit un configurateur fonctionnel et équivalent", async () => {
    const { rules } = await baseline("quote", "schema.json");
    expect(rules.version).toBe(1);
    expect(rules.validation).toMatchObject({ scored: 23, matched: 23, equivalence: 1 });
    expect(rules.validation.independent).toEqual({ total: 5, matched: 5 });

    const app = (await call("app", "GET")).body;
    expect(app.fields.map((f: { name: string }) => f.name)).toEqual(["product", "quantity", "customer_type"]);
    const qty = app.fields.find((f: { name: string }) => f.name === "quantity");
    expect(qty).toMatchObject({ kind: "number", integer: true, origin: "schema+model" });
    expect(app.outputs[0]).toMatchObject({ name: "total_price", label: "Total HT", primary: true });
    expect(app.tables).toHaveLength(1);
    expect(app.unsupported.length).toBeGreaterThanOrEqual(2);

    const ok = await call("compute", "POST", "", { inputs: { product: "A", quantity: 10, customer_type: "premium" } });
    expect(ok.body).toMatchObject({ status: "ok", engine: ENGINE_ID });
    expect(ok.body.outputs.total_price).toBe(810);
    const refused = await call("compute", "POST", "", { inputs: { product: "A", quantity: 0, customer_type: "standard" } });
    expect(refused.body.status).toBe("rejected");
    const invalid = await call("compute", "POST", "", { inputs: { product: "A", quantity: 2.5, customer_type: "standard" } });
    expect(invalid.body.status).toBe("invalid");
  });

  it("le chargeur de scénarios produit le même résultat que les appels API", async () => {
    const r = await call("scenarios", "POST", "", { scenario: "quote", step: "baseline" });
    expect(r.status).toBe(200);
    const cmp = (await call("compare", "GET")).body;
    expect(cmp).toMatchObject({ scored: 23, matched: 23, exceptions_matched: 1 });
  });
});

describe("Scénario B — calculateur logistique (logiciel différent, même moteur)", () => {
  it("reconstruit d'autres champs, d'autres règles, et reste équivalent", async () => {
    const { rules } = await baseline("logistics", "schema.v1.json");
    expect(rules.validation).toMatchObject({ scored: 25, matched: 25, equivalence: 1 });

    const app = (await call("app", "GET")).body;
    const kinds = Object.fromEntries(app.fields.map((f: { name: string; kind: string | null }) => [f.name, f.kind]));
    expect(kinds).toEqual({ zone: "enum", weight_kg: "number", pickup_date: null, express: "boolean", fragile: "boolean", reference: "text" });
    expect(app.unsupported.map((u: { label: string }) => u.label)).toContain("Date d'enlèvement");
    expect(app.sections).toHaveLength(3);
    expect(app.outputs.map((o: { name: string }) => o.name)).toEqual(["total_price", "transit_days"]);

    const obs = scen("logistics", "observations.v1.json").find((o: { experiment_id: string }) => o.experiment_id === "LOG_018");
    const r = await call("compute", "POST", "", { inputs: obs.inputs });
    expect(r.body).toMatchObject({ status: "ok", engine: ENGINE_ID });
    expect(r.body.outputs.total_price).toBe(obs.observed_output.total_price);
    expect(r.body.outputs.transit_days).toBe(obs.observed_output.transit_days);

    const badRef = await call("compute", "POST", "", { inputs: { zone: "FR", weight_kg: 2, reference: "cmd 1" } });
    expect(badRef.body.status).toBe("invalid");
    expect(badRef.body.errors[0].field).toBe("reference");
    const crossException = await call("compute", "POST", "", { inputs: { zone: "INT", weight_kg: 2, fragile: true } });
    expect(crossException.body).toMatchObject({ status: "rejected", errors: [{ rule_id: "TR_002" }] });
  });
});

describe("Scénario C — modification des règles sans modification de code", () => {
  it("détecte la dérive, intègre le nouveau champ et le nouveau modèle", async () => {
    await baseline("logistics", "schema.v1.json");
    const bc = (await call("investigations", "POST", "", { application: "logistics", module: "logistics", mode: "replay", kind: "blind_challenge" })).body.investigation;
    const s2 = await call("schema", "POST", "", scen("logistics", "schema.v2.json"));
    expect(s2.body.version).toBe(2);
    const app2 = (await call("app", "GET")).body;
    expect(app2.fields.map((f: { name: string }) => f.name)).toContain("insurance_value");

    const sent = await call("observations", "POST", "", (scen("logistics", "observations.v2.json") as object[]).map((x) => ({ ...x, investigation_id: bc.id })));
    expect(sent.status).toBe(200);
    const drift = (await call("events", "GET", "?type=drift")).body;
    expect(drift.length).toBeGreaterThan(0);
    const before = (await call("compare", "GET")).body;
    expect(before.equivalence).toBeLessThan(1);

    const v2 = await call("rules", "POST", "", scen("logistics", "rules.v2.json"));
    expect(v2.body.version).toBe(2);
    expect(v2.body.diff.map((d: { rule_id: string; kind: string }) => `${d.rule_id}:${d.kind}`).sort()).toEqual(["TR_030:changed", "TR_032:added"]);
    expect(v2.body.validation).toMatchObject({ scored: 13, matched: 13, equivalence: 1 });

    // L'application calcule immédiatement avec la nouvelle règle et le nouveau champ
    const withInsurance = await call("compute", "POST", "", { inputs: { zone: "FR", weight_kg: 10, insurance_value: 1000 } });
    const without = await call("compute", "POST", "", { inputs: { zone: "FR", weight_kg: 10, insurance_value: 0 } });
    expect(withInsurance.body.outputs.total_price - without.body.outputs.total_price).toBeCloseTo(10, 5);
    // Et l'ancien modèle reste consultable
    const old = await call("compare", "GET", "?version=1");
    expect(old.body.equivalence).toBeLessThan(1);
    expect((await call("rules", "GET", "?all=1")).body).toHaveLength(2);
  });

  it("le Blind Challenge Quotix : v1 décroche, v2 retrouve 100 %", async () => {
    for (const step of ["baseline", "change"]) await call("scenarios", "POST", "", { scenario: "quote", step });
    const drifted = (await call("compare", "GET")).body;
    expect(drifted.mismatched).toBeGreaterThan(0);
    await call("scenarios", "POST", "", { scenario: "quote", step: "update" });
    const fixed = (await call("compare", "GET")).body;
    expect(fixed).toMatchObject({ equivalence: 1, model_version: 2 });
    expect(fixed.independent_total).toBeGreaterThan(0);
  });
});

describe("Erreurs de contrat", () => {
  it("refuse les modèles non exécutables avec la liste des erreurs (422)", async () => {
    const r = await call("rules", "POST", "", { module: "x", rules: [{ id: "A", action: { fee_amount: "2 *" } }, { id: "A", action: { nope: 1 } }] });
    expect(r.status).toBe(422);
    expect(r.body.issues.length).toBeGreaterThanOrEqual(2);
    expect((await call("rules", "GET")).status).toBe(404);
  });
  it("refuse un modèle mal formé (400) et explique le champ fautif", async () => {
    const r = await call("rules", "POST", "", { rules: [{ id: "A" }] });
    expect(r.status).toBe(400);
    expect(r.body.issues[0].path).toBe("rules.0.action");
  });
  it("dry_run valide sans publier", async () => {
    const r = await call("rules", "POST", "?dry_run=1", scen("quote", "rules.v1.json"));
    expect(r.body).toMatchObject({ dry_run: true, version: null });
    expect((await call("rules", "GET")).status).toBe(404);
  });
  it("refuse un schéma incohérent et une investigation inconnue", async () => {
    expect((await call("schema", "POST", "", { fields: [{ name: "a", type: "number" }, { name: "a", type: "text" }] })).status).toBe(422);
    const o = await call("observations", "POST", "", { experiment_id: "E1", investigation_id: "INV_999", inputs: { a: 1 }, observed_output: { total_price: 1 } });
    expect(o.status).toBe(422);
  });
  it("crée une investigation si des observations arrivent sans contexte", async () => {
    const o = await call("observations", "POST", "", { experiment_id: "E1", inputs: { a: 1 }, observed_output: { total_price: 1 } });
    expect(o.body.investigation_id).toMatch(/^INV_\d{3}$/);
    const inv = (await call("investigations", "GET")).body[0];
    expect(inv).toMatchObject({ id: o.body.investigation_id, mode: "live", number: 1 });
  });
  it("publie les contrats en JSON Schema", async () => {
    const c = (await call("contracts", "GET")).body;
    expect(c.contract_version).toBeDefined();
    expect(c.observation.properties.experiment_id).toBeDefined();
    expect(c.rule_model.properties.rules).toBeDefined();
  });
});

describe("Traçabilité, persistance et stabilité", () => {
  it("numérote les évènements sans trou ni doublon (polling after_seq)", async () => {
    await baseline("quote", "schema.json");
    const all = (await call("events", "GET")).body as { seq: number }[];
    const seqs = all.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    const mid = seqs[Math.floor(seqs.length / 2)];
    const after = (await call("events", "GET", `?after_seq=${mid}`)).body as { seq: number }[];
    expect(after.every((e) => e.seq > mid)).toBe(true);
    expect(after.length).toBe(seqs.filter((s) => s > mid).length);
  });

  it("restitue exactement le même état après redémarrage du serveur", async () => {
    await baseline("logistics", "schema.v1.json");
    const before = (await call("state", "GET")).body;
    const appBefore = (await call("app", "GET")).body;
    const cmpBefore = (await call("compare", "GET")).body;
    store.flushPersist();
    store.reloadFromDisk();
    expect((await call("state", "GET")).body).toEqual(before);
    expect((await call("app", "GET")).body).toEqual(appBefore);
    expect((await call("compare", "GET")).body).toEqual(cmpBefore);
  });

  it("exige le jeton d'API en mode réseau", async () => {
    process.env.REBORN_API_TOKEN = "secret-test";
    try {
      expect((await call("rules", "POST", "", scen("quote", "rules.v1.json"))).status).toBe(401);
      expect((await call("rules", "POST", "", scen("quote", "rules.v1.json"), { authorization: "Bearer mauvais" })).status).toBe(401);
      expect((await call("rules", "POST", "", scen("quote", "rules.v1.json"), { authorization: "Bearer secret-test" })).status).toBe(200);
      expect((await call("state", "GET")).status).toBe(200); // lecture libre
    } finally {
      delete process.env.REBORN_API_TOKEN;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Préparation de l'intégration (Mouss, Alan) : robustesse des échanges  */
/* ------------------------------------------------------------------ */

const obs = (id: string, extra: Record<string, unknown> = {}) => ({ experiment_id: id, inputs: { product: "A", quantity: 10, customer_type: "standard" }, observed_output: { total_price: 900 }, ...extra });

describe("Intégration future — identifiants, synchronisation et modes", () => {
  it("conserve event_seq et n'attribue jamais deux fois un identifiant d'investigation après une remise à zéro", async () => {
    const a = (await call("investigations", "POST", "", { mode: "live" })).body.investigation;
    const seqBefore = (await call("revision", "GET")).body.event_seq;
    await call("reset", "POST");
    expect((await call("revision", "GET")).body.event_seq).toBe(seqBefore);
    const b = (await call("investigations", "POST", "", { mode: "live" })).body.investigation;
    expect(b.id).not.toBe(a.id);
    expect(b.number).toBe(1);
    const ev = (await call("events", "GET", `?after_seq=${seqBefore}`)).body as { seq: number; type: string }[];
    expect(ev.some((e) => e.type === "investigation_started")).toBe(true);
    // Un agent resté sur l'investigation d'avant la remise à zéro est refusé, pas mélangé
    const stale = await call("observations", "POST", "", obs("E1", { investigation_id: a.id }));
    expect(stale.status).toBe(422);
  });

  it("n'expose à l'Explorer que les investigations « agents réels » (?active=1&mode=live)", async () => {
    await call("scenarios", "POST", "", { scenario: "quote", step: "baseline" });
    expect((await call("investigations", "GET", "?active=1")).body).toMatchObject({ mode: "replay" });
    expect((await call("investigations", "GET", "?active=1&mode=live")).body).toBeNull();
    const live = (await call("investigations", "POST", "", { mode: "live" })).body.investigation;
    expect((await call("investigations", "GET", "?active=1&mode=live")).body.id).toBe(live.id);
  });

  it("refuse (409) une observation d'agent sans investigation_id pendant un scénario local", async () => {
    await call("scenarios", "POST", "", { scenario: "quote", step: "baseline" });
    const before = (await call("compare", "GET")).body.scored;
    const r = await call("observations", "POST", "", obs("AGENT_1"));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/mode local/);
    expect((await call("compare", "GET")).body.scored).toBe(before);
    // Rattachement explicite (import délibéré) : accepté
    const inv = (await call("investigations", "GET", "?active=1")).body.id;
    expect((await call("observations", "POST", "", obs("IMPORT_1", { investigation_id: inv }))).status).toBe(200);
    // Investigation agents réels : rattachement implicite accepté
    const live = (await call("investigations", "POST", "", { mode: "live" })).body.investigation;
    const ok = await call("observations", "POST", "", obs("AGENT_1"));
    expect(ok.body).toMatchObject({ ok: true, count: 1, investigation_id: live.id });
  });

  it("ignore un renvoi identique (nouvelle tentative réseau) sans fausser la comparaison", async () => {
    const live = (await call("investigations", "POST", "", { mode: "live" })).body.investigation;
    expect((await call("observations", "POST", "", obs("E1"))).body).toMatchObject({ count: 1, duplicates: [] });
    expect((await call("observations", "POST", "", obs("E1"))).body).toMatchObject({ count: 0, duplicates: ["E1"], investigation_id: live.id });
    expect((await call("observations", "POST", "", obs("E1", { investigation_id: live.id }))).body.duplicates).toEqual(["E1"]);
    expect((await call("observations", "GET", `?investigation_id=${live.id}`)).body).toHaveLength(1);
    // Même identifiant, contenu différent : nouvelle mesure (la dernière fait foi)
    expect((await call("observations", "POST", "", obs("E1", { observed_output: { total_price: 910 } }))).body.count).toBe(1);
  });

  it("valide le statut : success, error ou failed (casse ignorée)", async () => {
    await call("investigations", "POST", "", { mode: "live" });
    expect((await call("observations", "POST", "", obs("E1", { status: "Success" }))).status).toBe(200);
    const bad = await call("observations", "POST", "", obs("E2", { status: "ok" }));
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatch(/success, error ou failed/);
    expect((await call("observations", "POST", "", { experiment_id: "E3", inputs: { quantity: 0 }, status: "error", error: "QUANTITE INVALIDE" })).status).toBe(200);
    expect((await call("observations", "POST", "", { experiment_id: "E4", inputs: { quantity: 5 }, status: "failed", error: "Timeout" })).status).toBe(200);
  });

  it("réserve à la plateforme les évènements de validation, dérive et cycle de vie", async () => {
    await call("investigations", "POST", "", { mode: "live" });
    for (const type of ["validation", "drift", "rules_updated", "investigation_started", "observation"]) {
      expect((await call("events", "POST", "", { source: "analyst", type, title: "x" })).status).toBe(422);
    }
    expect((await call("events", "POST", "", { source: "platform", type: "log", title: "x" })).status).toBe(422);
    expect((await call("events", "POST", "", { source: "analyst", type: "hypothesis", title: "Remise à 10 unités" })).status).toBe(200);
    expect((await call("events", "POST", "", { source: "user", type: "experiment_request", title: "Vérifier", data: { inputs: { quantity: 10 } } })).status).toBe(200);
  });

  it("refuse un brouillon non exécutable sur /api/compute (422, pas 500)", async () => {
    const r = await call("compute", "POST", "", { inputs: { quantity: 2 }, model: { rules: [{ id: "R1", action: { base_total: "quantity *" } }] } });
    expect(r.status).toBe(422);
    expect(r.body.issues.some((i: { rule_id?: string }) => i.rule_id === "R1")).toBe(true);
    const ok = await call("compute", "POST", "", { inputs: { quantity: 2 }, model: { rules: [{ id: "R1", action: { base_total: "quantity * 3" } }] } });
    expect(ok.body).toMatchObject({ ok: true, status: "ok", outputs: { total_price: 6 } });
  });

  it("transmet les demandes d'expérience au webhook uniquement pour les investigations agents réels", async () => {
    const http = await import("node:http");
    const received: string[] = [];
    const srv = http.createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        received.push(JSON.parse(b).kind);
        res.end("ok");
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    process.env.EXPLORER_WEBHOOK_URL = `http://127.0.0.1:${(srv.address() as { port: number }).port}/hook`;
    try {
      await call("scenarios", "POST", "", { scenario: "quote", step: "baseline" });
      await call("events", "POST", "", { source: "analyst", type: "experiment_request", title: "local", data: { inputs: { quantity: 10 } } });
      await call("investigations", "POST", "", { mode: "live" });
      await call("events", "POST", "", { source: "analyst", type: "experiment_request", title: "réel", data: { inputs: { quantity: 10 } } });
      await new Promise((r) => setTimeout(r, 300));
      expect(received).toEqual(["investigation", "experiment_request"]);
    } finally {
      delete process.env.EXPLORER_WEBHOOK_URL;
      srv.close();
    }
  });
});

describe("Sécurité des API", () => {
  it("en mode local, ne sert que les adresses de bouclage (rebinding DNS)", async () => {
    const r = await R.state.GET(new Request("http://evil.example:3000/api/state", { headers: { host: "evil.example:3000" } }), { params: Promise.resolve({}) });
    expect(r.status).toBe(403);
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect((await R.state.GET(new Request(`http://${host}/api/state`, { headers: { host } }), { params: Promise.resolve({}) })).status).toBe(200);
    }
  });

  it("refuse les écritures venant d'une autre page web (CSRF), y compris un autre port", async () => {
    const body = scen("quote", "rules.v1.json");
    expect((await call("rules", "POST", "", body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call("rules", "POST", "", body, { origin: "http://127.0.0.1:4000" })).status).toBe(403);
    expect((await call("reset", "POST", "", undefined, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call("rules", "POST", "", body, { origin: "http://127.0.0.1:3000" })).status).toBe(200);
    expect((await call("rules", "POST", "", body)).status).toBe(200); // client Python : pas d'Origin
  });

  it("indique via /api/health si le jeton est exigé et valide, sans le révéler", async () => {
    expect((await call("health", "GET")).body.auth).toEqual({ write_token_required: false, token_presented: false, token_valid: null, can_write: true });
    process.env.REBORN_API_TOKEN = "secret-test";
    try {
      const anon = (await call("health", "GET")).body;
      expect(anon.auth).toMatchObject({ write_token_required: true, token_valid: false, can_write: false });
      const good = (await call("health", "GET", "", undefined, { authorization: "Bearer secret-test" })).body;
      expect(good.auth).toMatchObject({ token_valid: true, can_write: true });
      expect(JSON.stringify(good)).not.toContain("secret-test");
      // Mode réseau : toutes les adresses sont servies, l'écriture reste protégée
      const lan = new Request("http://172.16.0.9:3000/api/state", { headers: { host: "172.16.0.9:3000" } });
      expect((await R.state.GET(lan, { params: Promise.resolve({}) })).status).toBe(200);
    } finally {
      delete process.env.REBORN_API_TOKEN;
    }
  });

  it("ouvre la session navigateur par POST uniquement (jeton jamais dans l'URL)", async () => {
    process.env.REBORN_API_TOKEN = "secret-test";
    try {
      expect((await call("session", "GET", "?token=secret-test")).status).toBe(410);
      expect((await call("session", "POST", "", { token: "mauvais" })).status).toBe(401);
      const req = new Request("http://127.0.0.1:3000/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "secret-test" }) });
      const res = await R.session.POST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
      const cookie = res.headers.get("set-cookie")!.split(";")[0];
      expect((await call("reset", "POST", "", undefined, { cookie })).status).toBe(200);
    } finally {
      delete process.env.REBORN_API_TOKEN;
    }
  });
});

describe("Persistance", () => {
  it("met de côté un fichier d'état illisible au lieu de l'écraser", async () => {
    store.flushPersist();
    const dir = process.env.REBORN_DATA_DIR!;
    fs.writeFileSync(path.join(dir, "state.json"), "{ illisible");
    store.reloadFromDisk();
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith("state.json.corrupt-"));
    expect(backups.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, backups[0]), "utf8")).toBe("{ illisible");
    const ev = (await call("events", "GET")).body as { type: string; title: string }[];
    expect(ev.at(-1)).toMatchObject({ type: "error" });
    expect(ev.at(-1)!.title).toMatch(/illisible/);
  });
});
