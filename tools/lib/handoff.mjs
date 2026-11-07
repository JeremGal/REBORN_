// Builds targets/<id>/02-investigation/handoff.json: one machine-readable kit for the rebuild block.
// Not a report. It carries a computed build order, per-feature discovery traces, a migration map,
// test vectors, and the open questions, each item tied to evidence with an honest grade.
import fs from "node:fs";
import path from "node:path";
import { loadTarget } from "./load.mjs";

const PRIO = { must: 0, should: 1, could: 2 };
const uniq = (a) => [...new Set(a.filter(Boolean))];

// A feature depends on the entities and rules it cites. Build order = entities, then rules, then features,
// each group topologically by "needs", so the rebuilder never has to code something before its dependencies.
function buildOrder(t) {
  const order = [];
  // entities first, parents (referenced) before children
  const eByName = new Map(t.entities.map((e) => [e.name, e]));
  const seen = new Set();
  const visit = (name, stack = new Set()) => {
    if (seen.has(name) || !eByName.has(name) || stack.has(name)) return;
    stack.add(name);
    for (const r of eByName.get(name).relations || []) if (r.kind === "many-to-one" || r.kind === "one-to-one") visit(r.to, stack);
    for (const f of eByName.get(name).fields || []) if (f.ref) visit(f.ref, stack);
    seen.add(name);
    order.push({ kind: "entity", id: name });
  };
  for (const e of t.entities) visit(e.name);
  for (const r of [...t.rules].sort((a, b) => a.id.localeCompare(b.id))) order.push({ kind: "rule", id: r.id });
  for (const f of [...t.features].sort((a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9) || a.id.localeCompare(b.id))) order.push({ kind: "feature", id: f.id, priority: f.priority });
  return order;
}

// The discovery trace: the chain the investigator followed, screen -> label -> code -> table -> observed value.
// It is assembled from what the feature cites, so the rebuilder sees how each claim was established.
function discoveryTrace(f, t) {
  const ruleById = new Map(t.rules.map((r) => [r.id, r]));
  const steps = [];
  for (const s of f.screens || []) steps.push({ layer: "screen", ref: s, from: "ui-inventory or run screenshot" });
  for (const e of f.entities || []) steps.push({ layer: "data", ref: e });
  for (const id of f.rules || []) {
    const r = ruleById.get(id);
    steps.push({ layer: "rule", ref: id, grade: r?.status, has_example: !!(r?.examples || []).length });
  }
  const observed = (f.acceptance || []).some((a) => a.source_run);
  steps.push({ layer: "observed-value", present: observed, note: observed ? "a run supplied expected values" : "MISSING: no observed run; rule grades stay below confirmed until block 1 supplies values" });
  return { grade: f.status, confidence: f.confidence, evidence: (f.evidence || []).map((e) => ({ ref: e.ref, kind: e.kind, locator: e.locator })), steps };
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

function testVectors(t) {
  const fromRules = t.rules.flatMap((r) => (r.examples || []).map((x, i) => ({ kind: "rule", id: `${r.id}#${i + 1}`, rule: r.id, given: x.given, expect: x.expect, source: x.source?.ref })));
  const fromFeatures = t.features.flatMap((f) => (f.acceptance || []).map((a) => ({ kind: "acceptance", id: a.id, feature: f.id, given: a.given, when: a.when, then: a.then, expected: a.expected_values, source_run: a.source_run })));
  return { from_rules: fromRules, from_acceptance: fromFeatures };
}

export function buildHandoff(target) {
  const t = loadTarget(target);
  const m = t.meta || {};
  const grade = (arr, k = "status") => arr.reduce((o, x) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {});
  const kit = {
    schema: "reborn/handoff@1",
    target: { id: target, name: m.name, domain: m.domain, kind: m.kind, tech: m.tech?.stack ?? null, legal: m.legal },
    generated_at: new Date().toISOString(),
    clean_room: true,
    readiness: {
      features: grade(t.features), rules: grade(t.rules), entities: grade(t.entities),
      has_observed_values: t.features.some((f) => (f.acceptance || []).some((a) => a.source_run)),
      open_questions: t.unknowns.filter((u) => u.status === "open").length,
      note: "Rebuild-ready for a feature only when its grade is confirmed/partial and it has at least one acceptance scenario with expected values.",
    },
    build_order: buildOrder(t),
    entities: t.entities,
    rules: t.rules,
    screens: t.screens,
    features: t.features.map((f) => ({ ...f, discovery_trace: discoveryTrace(f, t) })),
    migration_map: migrationMap(t),
    test_vectors: testVectors(t),
    open_questions: t.unknowns.filter((u) => u.status === "open"),
  };
  const out = path.join(t.root, "02-investigation", "handoff.json");
  fs.writeFileSync(out, JSON.stringify(kit, null, 2));
  return { out, kit };
}
