// Validates every YAML file against contracts/*.schema.json, then checks cross references between files.
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ROOT } from "./config.mjs";
import { loadTarget } from "./load.mjs";
import { basisOfRef, confirmedBlocker } from "./basis.mjs";

const SCHEMA_FILES = {
  target: "target.schema.json",
  mission: "mission.schema.json",
  run: "run.schema.json",
  observations: "observations.schema.json",
  feature: "feature.schema.json",
  rule: "rule.schema.json",
  screen: "screen.schema.json",
  entity: "entity.schema.json",
  unknowns: "unknowns.schema.json",
  "evidence-index": "evidence-index.schema.json",
  "parity-report": "parity-report.schema.json",
};

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const dir = path.join(ROOT, "contracts");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return ajv;
}

// The kit and the dossier are only written from a target that validates: a broken card must not vanish silently from them.
export function assertValidTarget(target) {
  const v = validateTarget(target);
  if (v.errors.length) throw new Error(`${target} does not validate (${v.errors.length} error(s)), so nothing was written. First errors:\n  ${v.errors.slice(0, 5).join("\n  ")}\nRun: node tools/reborn.mjs validate ${target}`);
  return v;
}

export function validateTarget(target) {
  const ajv = makeAjv();
  const t = loadTarget(target);
  const errors = [];
  const warnings = [];
  const err = (rel, msg) => errors.push(`${rel}: ${msg}`);
  const warn = (rel, msg) => warnings.push(`${rel}: ${msg}`);

  for (const d of t.docs) {
    if (d.parseError) { err(d.rel, `YAML parse error: ${d.parseError}`); continue; }
    if (!d.kind) { warn(d.rel, "not covered by any contract (ignored)"); continue; }
    const validate = ajv.getSchema(`https://reborn.dev/contracts/${SCHEMA_FILES[d.kind]}`);
    if (!validate(d.data)) {
      for (const e of validate.errors) err(d.rel, `${e.instancePath || "/"} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(", ")})` : ""}`);
    }
    // File name must match the id so people can find things.
    const id = d.data?.id ?? d.data?.name;
    const base = path.basename(d.rel).replace(/\.ya?ml$/, "");
    if (["mission", "feature", "rule", "screen", "entity"].includes(d.kind) && id && id !== base) warn(d.rel, `file name should be ${id}.yaml`);
    if (d.kind === "run" && id && id !== path.basename(path.dirname(d.rel))) warn(d.rel, `run folder should be named ${id}`);
  }

  // Cross references.
  const ids = (arr, key = "id") => new Set(arr.map((x) => x?.[key]).filter(Boolean));
  const F = ids(t.features), R = ids(t.rules), S = ids(t.screens), E = ids(t.entities, "name");
  const U = ids(t.unknowns), M = ids(t.missions), RUN = ids(t.runs), O = ids(t.observations);
  const EV = new Set(t.evidence.map((e) => e.id));
  const entryById = new Map(t.evidence.map((e) => [e.id, e]));
  const runById = new Map(t.runs.map((r) => [r.id, r]));
  const fieldsOf = new Map(t.entities.map((e) => [e.name, new Set((e.fields || []).map((f) => f.name))]));

  const dup = (arr, key, label) => {
    const seen = new Set();
    for (const x of arr) { const v = x?.[key]; if (!v) continue; if (seen.has(v)) errors.push(`duplicate ${label} id ${v}`); seen.add(v); }
  };
  dup(t.features, "id", "feature"); dup(t.rules, "id", "rule"); dup(t.screens, "id", "screen");
  dup(t.entities, "name", "entity"); dup(t.unknowns, "id", "unknown"); dup(t.missions, "id", "mission"); dup(t.runs, "id", "run");

  const need = (set, v, where, what) => { if (v && !set.has(v)) err(where, `${what} ${v} does not exist`); };
  const field = (ref, where) => {
    if (!ref) return;
    const [ent, f] = ref.split(".");
    if (!fieldsOf.has(ent)) warn(where, `field ${ref}: entity ${ent} not described yet`);
    else if (!fieldsOf.get(ent).has(f)) warn(where, `field ${ref}: ${ent} has no field ${f}`);
  };
  // A card may only cite evidence that exists. A dead reference is an error: it would let a claim look backed when it is not.
  const evid = (list, where) => {
    for (const e of list || []) {
      if (["rea", "craft", "manual"].includes(e.kind)) {
        if (!EV.has(e.ref)) { err(where, `${e.kind} evidence ${e.ref.slice(0, 40)} does not exist in evidence/index.yaml`); continue; }
        const s = String(entryById.get(e.ref)?.summary ?? "");
        if (/^FAILED/.test(s)) err(where, `cites ${e.ref.slice(0, 30)}, a failed run`);
        else if (/^PARTIAL/.test(s)) warn(where, `cites ${e.ref.slice(0, 30)}, a partial result (${s.slice(0, 60)})`);
      }
      if (e.kind === "h-run" && !RUN.has(e.ref)) err(where, `run ${e.ref} not found in 01-exploration/runs`);
      if (e.kind === "observation" && !O.has(e.ref)) err(where, `observation ${e.ref} not found`);
      if (e.kind === "screenshot" && !fs.existsSync(path.join(t.root, e.ref))) err(where, `screenshot ${e.ref} not found`);
    }
  };
  // "confirmed" is the strongest grade: it needs an observation of the program running, or different kinds of proof.
  const grade = (card, where, { isEntity = false, extraRuntime = false } = {}) => {
    if (card.status !== "confirmed") return;
    const why = confirmedBlocker({ refs: card.evidence || [], entryById, isEntity, extraRuntime });
    if (why) err(where, why);
  };
  // Expected values must come from a run that really happened, on the original program.
  const sourceRun = (id, where) => {
    const r = runById.get(id);
    if (!r) return false;
    if ((r.subject ?? "original") !== "original") { err(where, `source_run ${id} is a replay of the rebuild: only a run on the original can supply expected values`); return false; }
    if (["failed", "aborted"].includes(r.outcome)) { err(where, `source_run ${id} outcome is ${r.outcome}: it cannot supply expected values`); return false; }
    return true;
  };

  for (const f of t.features) {
    const w = `feature ${f.id}`;
    (f.rules || []).forEach((r) => need(R, r, w, "rule"));
    (f.screens || []).forEach((s) => need(S, s, w, "screen"));
    (f.entities || []).forEach((e) => need(E, e, w, "entity"));
    (f.unknowns || []).forEach((u) => need(U, u, w, "unknown"));
    (f.entry_points || []).forEach((p) => need(S, p.screen, w, "screen"));
    (f.steps || []).forEach((s) => { need(S, s.screen, w, "screen"); (s.rules || []).forEach((r) => need(R, r, w, "rule")); });
    (f.inputs || []).forEach((i) => { field(i.field, w); evid(i.evidence, w); });
    let observed = false;
    (f.acceptance || []).forEach((a) => {
      if (a.source_run) { need(RUN, a.source_run, w, "run"); if (sourceRun(a.source_run, `${w} ${a.id}`)) observed = true; }
      if (a.mission) need(M, a.mission, w, "mission");
    });
    (f.errors || []).forEach((e) => evid(e.evidence, w));
    evid(f.evidence, w);
    grade(f, w, { extraRuntime: observed });
  }
  for (const r of t.rules) { const w = `rule ${r.id}`; (r.features || []).forEach((f) => need(F, f, w, "feature")); evid(r.evidence, w); (r.examples || []).forEach((x) => x.source && evid([x.source], w)); grade(r, w); }
  for (const s of t.screens) {
    const w = `screen ${s.id}`;
    (s.actions || []).forEach((a) => { need(F, a.triggers, w, "feature"); need(S, a.navigates_to, w, "screen"); });
    (s.fields || []).forEach((f) => field(f.binds, w));
    (s.screenshots || []).forEach((p) => { if (!fs.existsSync(path.join(t.root, p))) warn(w, `screenshot ${p} not found`); });
    evid(s.evidence, w);
    grade(s, w);
  }
  for (const e of t.entities) {
    const w = `entity ${e.name}`;
    (e.relations || []).forEach((r) => need(E, r.to, w, "entity"));
    (e.fields || []).forEach((f) => { need(E, f.ref, w, "entity"); need(R, f.computed_by, w, "rule"); evid(f.evidence, w); });
    evid(e.evidence, w);
    grade(e, w, { isEntity: true });
  }

  // The index itself: one entry per id, no failed run, a hash on every entry.
  const seenEv = new Set();
  for (const e of t.evidence) {
    if (seenEv.has(e.id)) errors.push(`duplicate evidence id ${String(e.id).slice(0, 30)} in evidence/index.yaml`);
    seenEv.add(e.id);
    if (/^FAILED/.test(String(e.summary ?? ""))) errors.push(`evidence/index.yaml: ${String(e.id).slice(0, 30)} is a failed run, it must not be registered as evidence`);
  }
  // An open question is closed by evidence of the right kind, not by an opinion. Reading the code is not a way to close a
  // question on a target whose legal basis forbids it.
  const deepOk = ["open-source", "licence", "provided-by-organizers"].includes(t.meta?.access?.method);
  for (const u of t.unknowns) {
    const w = `unknown ${u.id}`;
    (u.blocks || []).forEach((f) => need(F, f, w, "feature"));
    if (u.probe?.mission) need(M, u.probe.mission, w, "mission");
    evid(u.evidence, w);
    evid(u.evidence_against, w);
    if ((u.required_basis || []).includes("static-code") && !deepOk) err(w, `required_basis lists static-code, but target.yaml access.method "${t.meta?.access?.method}" does not allow reading the code`);
    if (u.status === "answered") {
      if (!u.answer) err(w, "answered without an answer");
      const bases = (u.evidence || []).filter((e) => !["rea", "craft", "manual"].includes(e.kind) || EV.has(e.ref)).map((e) => basisOfRef(e, entryById));
      if (!bases.length) err(w, "answered without evidence");
      else if (u.required_basis?.length && !bases.some((b) => u.required_basis.includes(b))) err(w, `answered with ${[...new Set(bases)].join(", ")} evidence, but it needs ${u.required_basis.join(" or ")}`);
    }
    if (u.status === "open" && u.severity === "blocking" && !u.probe) warn(w, "blocking question without a probe: say how it will be answered");
  }
  for (const m of t.missions) (m.features || []).forEach((f) => need(F, f, `mission ${m.id}`, "feature"));
  for (const r of t.runs) {
    need(M, r.mission, `run ${r.id}`, "mission");
    const runDir = t.docs.find((d) => d.kind === "run" && d.data?.id === r.id)?.rel;
    for (const s of r.steps || []) {
      if (s.screenshot && runDir && !fs.existsSync(path.join(t.root, path.dirname(runDir), s.screenshot))) warn(`run ${r.id}`, `step ${s.n}: screenshot ${s.screenshot} not found`);
    }
  }
  for (const o of t.observations) (o.runs || []).forEach((r) => need(RUN, r.run, `observation ${o.id}`, "run"));
  for (const p of t.parity) for (const r of p.results || []) { need(F, r.feature, "parity", "feature"); }

  return { target, errors, warnings, counts: { features: F.size, rules: R.size, screens: S.size, entities: E.size, unknowns: U.size, missions: M.size, runs: RUN.size, evidence: EV.size } };
}
