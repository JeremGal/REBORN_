// From the declared definition of every document type of a Frappe site: one screen card per form and one feature card
// per document (create, edit, and for documents with a life cycle: submit, cancel, amend). This is the STRUCTURE of each
// feature (what the form holds, what is mandatory, which lines it has, its life cycle), declared by the program itself.
// Behaviour beyond that (calculations, validations, side effects) is not claimed: cards are graded partial.
import { pascal } from "./frappe-model.mjs";

const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"]);
const fieldName = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "f_$1");
const CORE = new Set(["Accounts", "Selling", "Buying", "Stock", "Manufacturing", "Projects", "CRM", "Assets", "Setup"]);
export const GENERATED = "Generated from the program's declared definition";

function control(f) {
  switch (f.fieldtype) {
    case "Int": case "Float": case "Percent": case "Rating": case "Duration": return "number";
    case "Currency": return "money";
    case "Date": case "Datetime": case "Time": return "date";
    case "Select": return "select";
    case "Check": return "checkbox";
    case "Link": case "Dynamic Link": return "lookup";
    case "Table": case "Table MultiSelect": return "grid";
    case "Read Only": return "display";
    case "Data": case "Small Text": case "Text": case "Long Text": case "Text Editor": case "Markdown Editor": case "Code": case "Phone": case "Password": case "Autocomplete": return "text";
    default: return "other";
  }
}
function inputType(f) {
  return { Int: "integer", Float: "decimal", Currency: "money", Percent: "percent", Check: "boolean", Date: "date", Datetime: "datetime", Time: "time", Select: "enum", Link: "ref" }[f.fieldtype] ?? "string";
}

// Labels the H agent read on screen against the labels the program declares for that form. A screen whose observed
// labels mostly match the declared ones is confirmed by observation; otherwise the gap is written down.
const normLabel = (s) => String(s).toLowerCase().replace(/[*:()\s]+/g, " ").trim();
export function compareLabels(declared, observed) {
  const d = new Set(declared.map(normLabel));
  const seen = [...new Set(observed.map(normLabel).filter(Boolean))];
  const matched = seen.filter((l) => d.has(l));
  return { observed: seen.length, matched: matched.length, ratio: seen.length ? matched.length / seen.length : 0, unmatched: seen.filter((l) => !d.has(l)).slice(0, 8) };
}

export function featuresFromMetas(metas, { sourceRef, firstFeature, firstScreen, firstAcceptance, docSlugs = new Set(), observations = new Map(), apiObservations = new Map(), translations = {} }) {
  const byName = new Map(metas.map((m) => [m.name, m]));
  const forms = metas.filter((m) => !m.istable).sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
  const features = [], screens = [];
  let fn = firstFeature, sn = firstScreen, an = firstAcceptance, documented = 0;
  for (const m of forms) {
    const entity = pascal(m.name);
    const sid = `S-${String(sn++).padStart(3, "0")}`;
    const fid = `F-${String(fn++).padStart(3, "0")}`;
    const data = (m.fields || []).filter((f) => f.fieldname && !LAYOUT.has(f.fieldtype));
    const tabs = (m.fields || []).filter((f) => f.fieldtype === "Tab Break" && f.label).map((f) => f.label);
    const sections = (m.fields || []).filter((f) => f.fieldtype === "Section Break" && f.label).map((f) => f.label);
    const tables = data.filter((f) => ["Table", "Table MultiSelect"].includes(f.fieldtype) && byName.has(f.options));
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const hasDoc = docSlugs.has(slug);
    if (hasDoc) documented++;
    screens.push({
      id: sid,
      title: m.name,
      purpose: m.issingle ? `settings of ${m.name}` : `create, view and edit ${m.name} records`,
      kind: m.issingle ? "settings" : "form",
      layout: [tabs.length ? `tabs: ${tabs.join(", ")}` : "", sections.length ? `sections: ${sections.slice(0, 25).join(", ")}${sections.length > 25 ? ", ..." : ""}` : "", `${data.length} fields`].filter(Boolean).join("; "),
      fields: data.map((f) => {
        const o = { label: f.label || f.fieldname, control: control(f) };
        if (!["Table", "Table MultiSelect"].includes(f.fieldtype)) o.binds = `${entity}.${fieldName(f.fieldname)}`;
        if (f.reqd) o.required = true;
        const v = [f.read_only ? "read only (computed or filled by the program)" : "", f.depends_on ? `shown only when ${String(f.depends_on).slice(0, 80)}` : "", f.fieldtype === "Link" && f.options ? `chosen among ${f.options} records` : ""].filter(Boolean).join("; ");
        if (v) o.validation = v;
        if (o.control === "grid" && byName.has(f.options)) o.columns = (byName.get(f.options).fields || []).filter((c) => c.in_list_view && c.label).map((c) => c.label).slice(0, 10);
        return o;
      }),
      actions: [{ label: "Save", triggers: fid }, ...(m.is_submittable ? [{ label: "Submit", triggers: fid }, { label: "Cancel", triggers: fid }, { label: "Amend", triggers: fid }] : [])],
      status: "partial",
      evidence: [{ ref: sourceRef, kind: "rea", locator: `form layout of ${m.name}`, note: "declared by the program" }],
    });
    const screen = screens.at(-1);
    for (const o of observations.get(m.name) ?? []) {
      const english = [...data.map((f) => f.label || f.fieldname), ...sections, ...tabs];
      const declaredLabels = [...english, ...english.map((l) => translations[l]).filter(Boolean)];
      const cmp = compareLabels(declaredLabels, o.labels);
      screen.evidence.push({ ref: o.run, kind: "h-run", locator: "form opened by the H Company agent", note: `${cmp.matched}/${cmp.observed} labels read on screen match the declared form` });
      if (o.screenshots.length) screen.screenshots = [...(screen.screenshots || []), ...o.screenshots];
      if (cmp.observed >= 3 && cmp.ratio >= 0.6) screen.status = "confirmed";
      else screen.layout = `${screen.layout}; observed labels differ from the declared form (${cmp.matched}/${cmp.observed} match${cmp.unmatched.length ? `; not declared: ${cmp.unmatched.join(", ")}` : ""})`;
    }
    const mandatory = data.filter((f) => f.reqd && !f.read_only && !["Table", "Table MultiSelect"].includes(f.fieldtype));
    const steps = [
      { n: 1, actor: "user", does: `opens the ${m.name} form`, screen: sid },
      { n: 2, actor: "user", does: mandatory.length ? `fills the mandatory fields: ${mandatory.map((f) => f.label || f.fieldname).slice(0, 12).join(", ")}${mandatory.length > 12 ? ", ..." : ""}` : "fills the fields it needs (none is mandatory)" },
      ...(tables.length ? [{ n: 3, actor: "user", does: `adds lines in: ${tables.map((f) => f.label || f.fieldname).join(", ")}` }] : []),
    ];
    steps.push({ n: steps.length + 1, actor: "system", does: m.issingle ? "saves the settings" : "saves the record as a draft after checking mandatory fields and links" });
    if (m.is_submittable) steps.push({ n: steps.length + 1, actor: "user", does: "submits it: it becomes read only; it can then only be cancelled, and a cancelled one amended into a new draft" });
    features.push({
      id: fid,
      title: m.issingle ? `Configure ${m.name}` : m.is_submittable ? `Create, submit and cancel a ${m.name}` : `Create and edit a ${m.name}`,
      module: m.module,
      priority: CORE.has(m.module) ? (m.is_submittable ? "must" : "should") : "could",
      status: "partial",
      confidence: "medium",
      user_goal: m.description ? String(m.description).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 300) : `As a user, I record and maintain ${m.name} ${m.issingle ? "settings" : "records"}.`,
      entry_points: [{ screen: sid, action: "open the form" }],
      ...(mandatory.length ? { inputs: mandatory.map((f) => ({ label: f.label || f.fieldname, field: `${entity}.${fieldName(f.fieldname)}`, type: inputType(f), required: true })) } : {}),
      steps,
      outputs: [{ kind: "data-change", description: `${m.issingle ? "settings" : `a ${m.name} record`} stored`, entities: [entity] }],
      entities: [entity, ...tables.map((f) => pascal(f.options))].filter((v, i, a) => a.indexOf(v) === i),
      screens: [sid],
      acceptance: [{ id: `AC-${String(an++).padStart(3, "0")}`, given: mandatory.length ? "every mandatory field filled with a valid value" : "the form opened", when: m.issingle ? "the settings are saved" : "the record is saved", then: m.issingle ? "the settings are stored" : "a draft record is stored" }],
      evidence: [{ ref: sourceRef, kind: "rea", locator: `definition of ${m.name}`, note: "declared by the program" }],
      rebuild_notes: `${GENERATED}: form, mandatory fields, lines and life cycle are certain; behaviour beyond that is not observed yet.${hasDoc ? ` Documented in the vendor manual (page "${slug}").` : ""}`,
    });
    // What the program did when a draft was saved through its API (probe or computation runs).
    const feature = features.at(-1);
    const api = apiObservations.get(m.name);
    if (api?.result === "stored") {
      feature.acceptance[0] = { ...feature.acceptance[0], expected_values: { saved_as_draft: true }, source_run: api.run };
      feature.evidence.push({ ref: api.run, kind: "h-run", locator: `step ${api.step}`, note: "draft stored by the running program" });
    } else if (api?.result === "refused") {
      feature.errors = [{ when: "only the mandatory fields are filled with test values", behaviour: "the program refuses to save the draft", message: api.message }];
      feature.evidence.push({ ref: api.run, kind: "h-run", locator: `step ${api.step}`, note: "save refused by the running program" });
    }
  }
  return { features, screens, documented };
}
