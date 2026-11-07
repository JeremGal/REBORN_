// Business logic coverage of a Frappe site: every rule the business forms declare, graded against what was observed.
// Only positive observations confirm a rule: a field the agent did not report proves nothing (it may sit on another tab).

// Screens add a currency to some labels ("Total (USD)") and cut long column headers ("Montant (U..."): both are dropped.
const norm = (s) => String(s ?? "").toLowerCase().replace(/\([^)]*\)?/g, " ").replace(/\.{2,}|…/g, " ").replace(/[*:\s]+/g, " ").trim();
const SPECIAL = /^(today|now|user$|__user|__today|:|eval:)/i;   // "user" = the signed-in user: a value that depends on who looks
const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"]);

// The rules a form declares, by kind. `default` keeps only literal defaults (not "Today", the current user, expressions).
export function declaredRules(metas) {
  const out = [];
  for (const m of metas) {
    for (const f of m.fields || []) {
      if (!f.fieldname || LAYOUT.has(f.fieldtype) || f.hidden) continue;
      const base = { doctype: m.name, field: f.fieldname, label: f.label || f.fieldname, fieldtype: f.fieldtype, options: f.options };
      if (f.default !== undefined && f.default !== null && f.default !== "") out.push({ ...base, kind: SPECIAL.test(String(f.default)) ? "default-dynamic" : "default", value: String(f.default) });
      if (f.depends_on) out.push({ ...base, kind: "visibility", expr: String(f.depends_on) });
      if (f.mandatory_depends_on) out.push({ ...base, kind: "conditional-mandatory", expr: String(f.mandatory_depends_on) });
      if (f.read_only_depends_on) out.push({ ...base, kind: "conditional-read-only", expr: String(f.read_only_depends_on) });
      if (f.fetch_from) out.push({ ...base, kind: "auto-fill", expr: String(f.fetch_from) });
      if (f.read_only && ["Currency", "Float", "Int", "Percent"].includes(f.fieldtype)) out.push({ ...base, kind: "computed" });
      if (f.link_filters) out.push({ ...base, kind: "link-filter", expr: String(f.link_filters) });
    }
  }
  return out;
}

// The display conditions simple enough to evaluate without running the program's code.
export function parseCondition(expr) {
  const e = String(expr).trim().replace(/;$/, "");
  let m;
  if ((m = /^eval:\s*doc\.(\w+)\s*(===?|!==?)\s*["']([^"']*)["']$/.exec(e))) return { field: m[1], op: m[2].startsWith("=") ? "eq" : "ne", value: m[3] };
  if ((m = /^eval:\s*doc\.(\w+)\s*(===?|!==?)\s*(-?\d+(?:\.\d+)?)$/.exec(e))) return { field: m[1], op: m[2].startsWith("=") ? "eq" : "ne", value: m[3] };
  if ((m = /^eval:\s*!\s*doc\.(\w+)$/.exec(e))) return { field: m[1], op: "falsy" };
  if ((m = /^eval:\s*doc\.(\w+)$/.exec(e))) return { field: m[1], op: "truthy" };
  if ((m = /^(\w+)$/.exec(e))) return { field: m[1], op: "truthy" };
  return null;
}

const truthy = (v) => !(v === undefined || v === null || v === "" || v === "0" || v === 0);
// null = the state the condition looks at is not known, so nothing can be predicted (never a contradiction).
export function evaluate(c, doc) {
  if (!(c.field in doc)) return null;
  const v = doc[c.field];
  if (c.op === "truthy") return truthy(v);
  if (c.op === "falsy") return !truthy(v);
  const same = String(v ?? "") === String(c.value) || (v !== undefined && v !== "" && Number(v) === Number(c.value) && c.value !== "");
  return c.op === "eq" ? same : !same;
}

const num = (s) => { const t = String(s).replace(/[^\d,.\-]/g, "").replace(/\s/g, ""); const n = Number(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const UNCHECKED = /^(un ?check|décoch|non coch|no$|non$|false|0)/i;
// A naming series is shown without its separators dots ("BUDGET-.####" appears as "BUDGET-####").
const flat = (s) => norm(s).replace(/\./g, "");
function sameValue(rule, observed, translations) {
  const o = norm(observed);
  if (rule.fieldtype === "Check") { const off = UNCHECKED.test(String(observed).trim()); return rule.value === "1" ? !off && /check|coch|oui|yes|true|✓|1/.test(o) : off; }
  if (["Int", "Float", "Currency", "Percent"].includes(rule.fieldtype)) return num(observed) !== null && num(observed) === Number(rule.value);
  const want = [rule.value, translations[rule.value]].filter(Boolean);
  return want.some((w) => norm(w) && (o === norm(w) || o.includes(norm(w)) || flat(observed) === flat(w)));
}

// readings: doctype -> { labels: string[], prefilled: string[] ("Label: value") }
// computedSeen: Set of "Doctype.field" whose computed value was read back from the running program.
// Values a line of 3 x 10.00 must produce, whatever taxes a template may add (grand totals are left out on purpose).
const LINE_EXPECT = { amount: 30, net_amount: 30, base_amount: 30, base_net_amount: 30, total: 30, net_total: 30, base_total: 30, base_net_total: 30, rate: 10, net_rate: 10, base_rate: 10, base_net_rate: 10, qty: 3, stock_qty: 3, total_qty: 3 };

// What the agent saw after acting on an unsaved form: display rules revealed by a choice, amounts recomputed by a line.
function confirmedByInteraction(r, interactions, translations, docDefaults, byDoctype) {
  const labelsFor = [r.label, translations[r.label]].filter(Boolean).map(norm);
  for (const it of interactions) {
    const labels = new Set((it.labels || []).map(norm));
    if (r.kind === "visibility" && it.doctype === r.doctype && it.action?.field) {
      const c = parseCondition(r.expr);
      if (!c || c.field !== it.action.field) continue;
      if (evaluate(c, { ...(docDefaults.get(r.doctype) || {}), [it.action.field]: it.action.value }) && labelsFor.some((l) => labels.has(l))) return true;
    }
    if (r.kind === "computed" && it.action?.line && LINE_EXPECT[r.field] !== undefined) {
      const parent = byDoctype.get(it.doctype);
      const itemsTable = (parent?.fields || []).find((f) => f.fieldname === "items")?.options;
      if (r.doctype !== it.doctype && r.doctype !== itemsTable) continue;
      for (const p of it.prefilled || []) {
        const i = String(p).indexOf(":");
        if (i < 0 || !labelsFor.includes(norm(p.slice(0, i)))) continue;
        if (num(p.slice(i + 1)) === LINE_EXPECT[r.field]) return true;
      }
    }
  }
  return false;
}

export function gradeLogic(metas, { readings, translations = {}, computedSeen = new Set(), interactions = [] }) {
  const rules = declaredRules(metas);
  const byDoctype = new Map(metas.map((m) => [m.name, m]));
  const tally = {};
  const bump = (kind, state) => { tally[kind] = tally[kind] || { declared: 0, confirmed: 0, consistent: 0, contradicted: 0, not_checkable: 0 }; tally[kind].declared++; tally[kind][state]++; };
  const contradictions = [];
  // The state of a NEW document, as far as the definition tells: literal defaults, ticked boxes default to off, and a new
  // document is a draft (docstatus 0) that is not saved yet (__islocal). Everything else is unknown.
  const docDefaults = new Map();
  for (const m of metas) {
    const d = { docstatus: "0", __islocal: "1" };
    for (const f of m.fields || []) {
      if (!f.fieldname) continue;
      if (f.default !== undefined && f.default !== null && f.default !== "" && !SPECIAL.test(String(f.default))) d[f.fieldname] = String(f.default);
      else if (f.fieldtype === "Check") d[f.fieldname] = "0";
    }
    docDefaults.set(m.name, d);
  }
  for (const r of rules) {
    if ((r.kind === "visibility" || r.kind === "computed") && interactions.length && confirmedByInteraction(r, interactions, translations, docDefaults, byDoctype)) { bump(r.kind, "confirmed"); continue; }
    const reading = readings.get(r.doctype);
    const labelsFor = [r.label, translations[r.label]].filter(Boolean).map(norm);
    const seenLabels = new Set((reading?.labels || []).map(norm));
    const visible = reading && labelsFor.some((l) => seenLabels.has(l));
    if (r.kind === "computed") { bump(r.kind, computedSeen.has(`${r.doctype}.${r.field}`) ? "confirmed" : "not_checkable"); continue; }
    // A settings page shows the values saved on the site, not the defaults of a new document: it cannot grade a default or
    // a display rule, whatever it shows.
    const single = byDoctype.get(r.doctype)?.issingle;
    if (single && (r.kind === "default" || r.kind === "visibility")) { bump(r.kind, "not_checkable"); continue; }
    if (r.kind === "default") {
      if (!reading || !visible) { bump(r.kind, "not_checkable"); continue; }
      const pre = (reading.prefilled || []).map((p) => { const i = String(p).indexOf(":"); return i < 0 ? [norm(p), ""] : [norm(p.slice(0, i)), p.slice(i + 1).trim()]; });
      const hit = pre.find(([l]) => labelsFor.includes(l));
      if (!hit) { bump(r.kind, "consistent"); continue; } // visible but not reported as filled: weak, not a proof either way
      if (sameValue(r, hit[1], translations)) bump(r.kind, "confirmed");
      else { bump(r.kind, "contradicted"); contradictions.push({ ...r, observed: hit[1] }); }
      continue;
    }
    if (r.kind === "visibility") {
      const c = parseCondition(r.expr);
      if (!reading || !c) { bump(r.kind, "not_checkable"); continue; }
      const predicted = evaluate(c, docDefaults.get(r.doctype) || {});
      if (predicted === null) { bump(r.kind, visible ? "consistent" : "not_checkable"); continue; } // state of the control unknown
      if (predicted && visible) bump(r.kind, "confirmed");
      else if (!predicted && visible) { bump(r.kind, "contradicted"); contradictions.push({ ...r, predicted }); }
      else bump(r.kind, predicted ? "not_checkable" : "consistent"); // not seen: maybe another tab, maybe hidden
      continue;
    }
    bump(r.kind, "not_checkable"); // auto-fill, conditional mandatory/read-only, filters: need typing, not a reading
  }
  const total = Object.values(tally).reduce((a, t) => ({ declared: a.declared + t.declared, confirmed: a.confirmed + t.confirmed, consistent: a.consistent + t.consistent, contradicted: a.contradicted + t.contradicted }), { declared: 0, confirmed: 0, consistent: 0, contradicted: 0 });
  return { tally, total, contradictions: contradictions.slice(0, 40), formsRead: readings.size, forms: [...byDoctype.values()].filter((m) => !m.istable).length };
}
