// Turns a Frappe document type definition into a ReBorn entity card. The definition is what the program itself declares
// and serves (shipped-data): field types, mandatory flags, links, select options, precision, child tables.

const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"]);
export const pascal = (s) => String(s).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase()).replace(/^(\d)/, "N$1");

function typeOf(f) {
  switch (f.fieldtype) {
    case "Int": case "Duration": return "integer";
    case "Float": case "Rating": return "decimal";
    case "Currency": return "money";
    case "Percent": return "percent";
    case "Check": return "boolean";
    case "Date": return "date";
    case "Datetime": return "datetime";
    case "Time": return "time";
    case "Select": return "enum";
    case "Link": return "ref";
    case "Attach": case "Attach Image": case "Signature": return "file";
    case "JSON": case "Geolocation": return "json";
    case "Small Text": case "Text": case "Long Text": case "Text Editor": case "Markdown Editor": case "HTML Editor": case "Code": return "text";
    default: return "string";
  }
}

const fieldName = (s) => String(s).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^(\d)/, "f_$1");

export function metaToEntity(meta, { sourceRef }) {
  const fields = [];
  const relations = [];
  for (const f of meta.fields || []) {
    if (!f.fieldname || LAYOUT.has(f.fieldtype)) continue;
    if (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") {
      if (f.options) relations.push({ to: pascal(f.options), kind: "one-to-many", via: f.fieldname, description: `lines (${f.label || f.fieldname})` });
      continue;
    }
    const o = { name: fieldName(f.fieldname), label: f.label || "", type: typeOf(f), observed_as: f.fieldname };
    if (f.reqd) o.required = true;
    if (f.unique) o.unique = true;
    if (f.length && o.type === "string") o.max_length = Number(f.length);
    if (f.precision !== undefined && f.precision !== null && f.precision !== "" && ["decimal", "money", "percent"].includes(o.type)) o.precision = Number(f.precision);
    if (o.type === "enum") { const v = String(f.options || "").split("\n").map((x) => x.trim()).filter(Boolean); if (v.length) o.enum_values = v; else o.type = "string"; }
    if (o.type === "ref") { if (f.options) { o.ref = pascal(f.options); relations.push({ to: o.ref, kind: "many-to-one", via: f.fieldname }); } else o.type = "string"; }
    if (f.default !== undefined && f.default !== null && f.default !== "" && typeof f.default !== "object") o.default = String(f.default);
    fields.push(o);
  }
  if (!fields.length) fields.push({ name: "name", label: "ID", type: "string", observed_as: "name" });
  const flags = [meta.istable ? "lines of another document" : null, meta.issingle ? "single settings record" : null, meta.is_submittable ? "draft, submitted, cancelled life cycle" : null].filter(Boolean);
  return {
    name: pascal(meta.name),
    description: `${meta.description ? `${String(meta.description).replace(/<[^>]+>/g, "").slice(0, 300)} ` : ""}Document type "${meta.name}" (module ${meta.module})${flags.length ? `: ${flags.join(", ")}` : ""}.`,
    fields,
    ...(relations.length ? { relations } : {}),
    ...(meta.is_submittable ? { lifecycle: ["draft", "submitted", "cancelled"] } : {}),
    storage: { engine: "Frappe (MariaDB)", observed_table: `tab${meta.name}` },
    status: "confirmed",
    evidence: [{ ref: sourceRef, kind: "rea", locator: `definition of ${meta.name}`, note: "declared by the program and served by its API" }],
  };
}
