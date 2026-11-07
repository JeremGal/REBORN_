// Builds targets/<id>/02-investigation/handoff.json: one machine-readable kit for the rebuild block.
// Not a report. It carries a computed build order, per-feature discovery traces, a migration map,
// test vectors, and the open questions, each item tied to evidence with an honest grade.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadTarget } from "./load.mjs";
import { assertValidTarget } from "./validate.mjs";
import { assertNoLeak, scrubEvidence } from "./guard.mjs";
import { basisOfRef } from "./basis.mjs";

const PRIO = { must: 0, should: 1, could: 2 };
const nonEmpty = (o) => !!o && Object.keys(o).length > 0;
// An acceptance scenario is "observed" only when a run on the original supplied its expected values.
const isObserved = (a) => nonEmpty(a.expected_values) && !!a.source_run;
const live = (arr, k = "status") => arr.filter((x) => x[k] !== "refuted");

// Stable JSON: same cards, same text, whatever the key order.
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

// What the kit was built from. Block 3 records it in its parity report, so a rebuild made from an outdated kit is detectable.
export function inputsDigest(t) {
  const m = t.meta || {};
  const input = { meta: { id: t.target, kit_title: m.kit_title, domain: m.domain, kind: m.kind, tech: m.tech }, features: t.features, rules: t.rules, screens: t.screens, entities: t.entities, unknowns: t.unknowns, runs: t.runs.map((r) => ({ id: r.id, subject: r.subject, outcome: r.outcome })), evidence: t.evidence.map((e) => [e.id, e.sha256]) };
  return crypto.createHash("sha256").update(canon(input)).digest("hex");
}

// A feature depends on the entities and rules it cites. Build order = entities, then rules, then features,
// each group topologically by "needs", so the rebuilder never has to code something before its dependencies.
function buildOrder(t) {
  const order = [];
  // A refuted card is something the evidence contradicts: it is never built. Every item shows its grade.
  const entities = live(t.entities);
  const eByName = new Map(entities.map((e) => [e.name, e]));
  // entities first, parents (referenced) before children
  const seen = new Set();
  const visit = (name, stack = new Set()) => {
    if (seen.has(name) || !eByName.has(name) || stack.has(name)) return;
    stack.add(name);
    for (const r of eByName.get(name).relations || []) if (r.kind === "many-to-one" || r.kind === "one-to-one") visit(r.to, stack);
    for (const f of eByName.get(name).fields || []) if (f.ref) visit(f.ref, stack);
    seen.add(name);
    order.push({ kind: "entity", id: name, grade: eByName.get(name).status });
  };
  for (const e of entities) visit(e.name);
  for (const r of [...live(t.rules)].sort((a, b) => a.id.localeCompare(b.id))) order.push({ kind: "rule", id: r.id, grade: r.status });
  for (const f of [...live(t.features)].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9) || a.id.localeCompare(b.id))) order.push({ kind: "feature", id: f.id, grade: f.status, priority: f.priority });
  return order;
}

// The discovery trace: the chain the investigator followed, screen -> label -> code -> table -> observed value.
// It is assembled from what the feature cites, so the rebuilder sees how each claim was established.
function discoveryTrace(f, t, basisOf) {
  const ruleById = new Map(t.rules.map((r) => [r.id, r]));
  const steps = [];
  for (const s of f.screens || []) steps.push({ layer: "screen", ref: s, from: "ui-inventory or run screenshot" });
  for (const e of f.entities || []) steps.push({ layer: "data", ref: e });
  for (const id of f.rules || []) {
    const r = ruleById.get(id);
    steps.push({ layer: "rule", ref: id, grade: r?.status, has_example: !!(r?.examples || []).length });
  }
  const observed = (f.acceptance || []).some(isObserved);
  steps.push({ layer: "observed-value", present: observed, note: observed ? "a run supplied expected values" : "MISSING: no observed run; rule grades stay below confirmed until block 1 supplies values" });
  return { grade: f.status, confidence: f.confidence, evidence: scrubEvidence(f.evidence || [], basisOf), steps };
}

// Migration map: for every entity field that records where it was observed in the original, emit new <- old.
function migrationMap(t) {
  const rows = [];
  for (const e of t.entities) {
    const table = e.storage?.observed_table;
    for (const f of e.fields || []) {
      if (f.observed_as || table) rows.push({ entity: e.name, new_field: f.name, from_table: table ?? null, from_column: f.observed_as ?? null, type: f.type, grade: e.status });
    }
  }
  return rows;
}

// A test vector needs values to compare. A scenario without any (a test that can never fail) is listed apart.
function testVectors(t) {
  const fromRules = live(t.rules).flatMap((r) => (r.examples || []).map((x, i) => ({ kind: "rule", id: `${r.id}#${i + 1}`, rule: r.id, grade: r.status, given: x.given, expect: x.expect, source: x.source?.ref })));
  const acceptance = live(t.features).flatMap((f) => (f.acceptance || []).map((a) => ({ f, a })));
  const fromFeatures = acceptance.filter(({ a }) => nonEmpty(a.expected_values)).map(({ f, a }) => ({ kind: "acceptance", id: a.id, feature: f.id, grade: f.status, observed: !!a.source_run, given: a.given, when: a.when, then: a.then, expected: a.expected_values, source_run: a.source_run }));
  const unobserved = acceptance.filter(({ a }) => !nonEmpty(a.expected_values)).map(({ f, a }) => ({ id: a.id, feature: f.id }));
  return { from_rules: fromRules, from_acceptance: fromFeatures, unobserved_acceptance: unobserved };
}

// Checkable expectations: what block 3 must prove, and the weakest proof that counts for each (Craft's rebuild ledger).
// A unit test never proves what only the built app can show, and the built app never proves what only a live replay shows.
export const PROOF_STRENGTH = { "unit-test": 1, "built-app": 2, "live-run": 3 };

function casesFor(r) {
  const c = ["nominal"];
  if (r.kind === "rounding") c.push("halfway value");
  if (r.kind === "tax") c.push("several taxes");
  if (["validation", "integrity", "permission"].includes(r.kind)) c.push("rejected input");
  if ((r.contradictions || []).length) c.push("the contradicted case");
  return c;
}

export function expectations(t) {
  const out = [];
  for (const r of live(t.rules)) out.push({ id: `X-${r.id}`, kind: "rule", ref: r.id, grade: r.status, proof_needed: "unit-test", cases: casesFor(r), has_examples: (r.examples || []).length > 0 });
  for (const f of live(t.features)) {
    for (const a of f.acceptance || []) out.push({ id: `X-${a.id}`, kind: "acceptance", ref: a.id, feature: f.id, grade: f.status, proof_needed: "live-run", observed: isObserved(a) });
    (f.errors || []).forEach((e, i) => out.push({ id: `X-${f.id}-E${i + 1}`, kind: "refusal", ref: f.id, grade: f.status, proof_needed: "built-app", when: e.when }));
  }
  for (const s of live(t.screens)) out.push({ id: `X-${s.id}`, kind: "screen", ref: s.id, grade: s.status, proof_needed: "built-app", controls: (s.fields || []).length + (s.actions || []).length });
  return out;
}

// Proven share of a parity report against the kit's expectations. Unknown or missing counts as not proven.
export function parityScore(kit, report) {
  const byId = new Map((report?.expectations || []).map((r) => [r.id, r]));
  const rows = (kit.expectations || []).map((x) => {
    const r = byId.get(x.id);
    if (!r) return { ...x, state: "not checked" };
    if (r.result === "fail") return { ...x, state: "failed", verified_by: r.verified_by };
    if (r.result !== "pass") return { ...x, state: "unknown", verified_by: r.verified_by };
    const strong = (PROOF_STRENGTH[r.verified_by] || 0) >= PROOF_STRENGTH[x.proof_needed];
    return { ...x, state: strong ? "proven" : "passed with a weaker proof", verified_by: r.verified_by };
  });
  const count = (s) => rows.filter((r) => r.state === s).length;
  return {
    total: rows.length,
    proven: count("proven"),
    ratio: rows.length ? Math.round((count("proven") / rows.length) * 100) : null,
    failed: count("failed"),
    weaker: count("passed with a weaker proof"),
    unknown: count("unknown") + count("not checked"),
    stale: !!report && report.kit_inputs_sha256 !== undefined && report.kit_inputs_sha256 !== kit.inputs_sha256,
    rows,
  };
}

// What still blocks each feature from being rebuild-ready, and the mission (for the computer-use agent) that fills it.
// This is the actionable answer to "is this enough to rebuild?": it names the exact gaps, not a vague "needs more".
function toObserve(t) {
  const missionByUnknown = new Map();
  for (const u of t.unknowns) if (u.probe?.mission) missionByUnknown.set(u.id, u.probe.mission);
  const ruleById = new Map(t.rules.map((r) => [r.id, r]));
  const rows = [];
  for (const f of t.features) {
    const missing = [];
    // An unknown blocks a feature when the feature lists it OR the unknown says it blocks the feature.
    const unknownIds = [...new Set([...(f.unknowns || []), ...t.unknowns.filter((u) => (u.blocks || []).includes(f.id) && u.status === "open").map((u) => u.id)])];
    const accWithValues = (f.acceptance || []).filter(isObserved);
    if (!accWithValues.length) missing.push("no acceptance scenario has observed expected values (run the feature and read them back)");
    for (const rid of f.rules || []) {
      const r = ruleById.get(rid);
      if (r && !(r.examples || []).length) missing.push(`rule ${rid} has no worked example (capture one input/output pair)`);
      if (r && r.status !== "confirmed") missing.push(`rule ${rid} is ${r.status} (confirm by observation)`);
    }
    for (const sid of f.screens || []) {
      const s = (t.screens || []).find((x) => x.id === sid);
      if (s && !(s.screenshots || []).length) missing.push(`screen ${sid} has no screenshot (capture it)`);
    }
    if (f.status === "confirmed" && !missing.length) continue;
    const missions = [...new Set(unknownIds.map((u) => missionByUnknown.get(u)).filter(Boolean))];
    rows.push({ feature: f.id, grade: f.status, priority: f.priority, missing, unknowns: unknownIds, missions });
  }
  return rows;
}

// How much of the original the cards cover. The denominator is only what the evidence inventoried (a lower bound),
// and there is no independent feature list yet: feature coverage is reported as unknown, never as complete.
export function computeCoverage(t) {
  const found = (key) => t.evidence.reduce((m, e) => Math.max(m, Number(e.counts?.[key]) || 0), 0) || null;
  const row = (carded, inventoried, source) => ({ carded, inventoried, ratio: inventoried ? Math.round((carded / inventoried) * 100) : null, source });
  const topics = found("features");
  return {
    screens: row(t.screens.length, found("windows"), "window inventory (counts.windows)"),
    entities: row(t.entities.length, found("tables"), "table inventory (counts.tables)"),
    features: topics
      ? { ...row(t.features.length, topics, "documented topics in the user manual (counts.features)"), note: "manual topics are not features one to one: a lower bound of what the program offers, not an exact list" }
      : { carded: t.features.length, inventoried: null, ratio: null, note: "no independent feature inventory yet (run: reborn manual <target> <manual.chm|pdf>): coverage is unknown, not complete" },
  };
}

export function buildHandoff(target) {
  assertValidTarget(target);
  const t = loadTarget(target);
  const m = t.meta || {};
  const entryById = new Map(t.evidence.map((e) => [e.id, e]));
  const basisOf = (ref) => basisOfRef(ref, entryById);
  const scrub = (v) => scrubEvidence(v, basisOf);
  const grade = (arr, k = "status") => arr.reduce((o, x) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {});
  const refutedRules = new Set(t.rules.filter((r) => r.status === "refuted").map((r) => r.id));
  const isReady = (f) => ["confirmed", "partial"].includes(f.status) && (f.acceptance || []).some(isObserved) && !(f.rules || []).some((r) => refutedRules.has(r));
  const features = live(t.features).map((f) => ({ ...scrub(f), ready: isReady(f), discovery_trace: discoveryTrace(f, t, basisOf) }));
  const kit = {
    schema: "reborn/handoff@2",
    // The product's own name and vendor stay out of the kit: the rebuild must not carry them. Use kit_title in target.yaml.
    target: { id: target, title: m.kit_title ?? target, domain: m.domain, kind: m.kind, tech: m.tech?.stack ?? null, access: m.access?.method },
    inputs_sha256: inputsDigest(t),
    clean_room: true,
    readiness: {
      features: grade(t.features), rules: grade(t.rules), entities: grade(t.entities),
      ready_features: features.filter((f) => f.ready).length,
      coverage: computeCoverage(t),
      has_observed_values: t.features.some((f) => (f.acceptance || []).some(isObserved)),
      open_questions: t.unknowns.filter((u) => u.status === "open").length,
      note: "A feature is ready (see its `ready` flag) only when it is confirmed or partial, none of its rules is refuted, and a run on the original supplied expected values for at least one acceptance scenario.",
    },
    to_observe: toObserve(t),
    expectations: expectations(t),
    build_order: buildOrder(t),
    entities: scrub(live(t.entities)),
    rules: scrub(live(t.rules)),
    screens: scrub(live(t.screens)),
    features,
    migration_map: migrationMap(t),
    test_vectors: testVectors(t),
    open_questions: scrub(t.unknowns.filter((u) => u.status === "open")),
  };
  const text = JSON.stringify(kit, null, 2) + "\n";
  assertNoLeak(target, text, "the kit", t.entities);
  const out = path.join(t.root, "02-investigation", "handoff.json");
  fs.writeFileSync(out, text);
  return { out, kit };
}
