// Behaviour probe: for each business document type, save a draft with only its mandatory fields filled with fictitious
// values, and record what the program does (stored, or refused with its message). Drafts only, never submitted.
// Document types that change the configuration of the site are never touched.

export const PROBE_MODULES = new Set(["Accounts", "Selling", "Buying", "Stock", "CRM", "Projects", "Manufacturing", "Assets", "Quality Management", "Support", "Maintenance", "Subcontracting", "Setup"]);
const NEVER = new Set(["Company", "Fiscal Year", "Account", "Cost Center", "Accounting Period", "Accounting Dimension", "Accounting Dimension Filter", "Party Type", "Payment Gateway Account", "Tax Rule", "Email Digest", "Employee", "Exchange Rate Revaluation", "Dunning Type", "Finance Book", "Monthly Distribution", "Budget", "Shareholder", "Share Transfer", "Share Type", "Department", "Designation", "Branch", "Holiday List", "Terms and Conditions", "Letter Head", "Print Heading", "Currency Exchange", "Mode of Payment", "UOM Conversion Factor"]);
const NEVER_PATTERN = /^(Repost|Process |Ledger |Bisect|Transaction Deletion|Authorization|Closing Stock|Stock Closing|Period Closing|Bank Statement Import|Bulk |Unreconcile|Payment Reconciliation|Opening Invoice Creation|Chart of Accounts|Pricing Rule|Promotional Scheme|Putaway Rule|Inventory Dimension|Serial and Batch|Quality Inspection Template)/;

export function probeable(meta) {
  return !meta.istable && !meta.issingle && PROBE_MODULES.has(meta.module) && !NEVER.has(meta.name) && !NEVER_PATTERN.test(meta.name);
}

const LAYOUT = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Fold", "Heading", "Image"]);

// Fictitious value for one mandatory field, or undefined when none can be chosen (a link with no record to point to).
export function valueFor(f, { linkValue, today }) {
  switch (f.fieldtype) {
    case "Link": return linkValue(f.options);
    case "Dynamic Link": return undefined;
    case "Select": return String(f.options || "").split("\n").map((s) => s.trim()).find(Boolean);
    case "Date": return today;
    case "Datetime": return `${today} 09:00:00`;
    case "Time": return "09:00:00";
    case "Int": case "Float": case "Currency": case "Percent": case "Duration": return 1;
    case "Check": return 0;
    case "Rating": return 0.5;
    default: return `TEST ${f.label || f.fieldname}`.slice(0, Number(f.length) > 0 ? Number(f.length) : 140);
  }
}

// Builds the minimal draft. Returns { doc } or { skip: reason }.
export function minimalDoc(meta, byName, ctx) {
  const doc = { doctype: meta.name };
  for (const f of meta.fields || []) {
    if (!f.fieldname || LAYOUT.has(f.fieldtype) || !f.reqd || f.read_only || (f.default !== undefined && f.default !== null && f.default !== "")) continue;
    if (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect") {
      const child = byName.get(f.options);
      if (!child) return { skip: `mandatory table ${f.fieldname} has no definition` };
      const row = {};
      for (const c of child.fields || []) {
        if (!c.fieldname || LAYOUT.has(c.fieldtype) || !c.reqd || c.read_only || (c.default !== undefined && c.default !== null && c.default !== "")) continue;
        if (c.fieldtype === "Table" || c.fieldtype === "Table MultiSelect") return { skip: `nested mandatory table in ${f.options}` };
        const v = valueFor(c, ctx);
        if (v === undefined) return { skip: `no ${c.options || c.fieldtype} record for ${f.options}.${c.fieldname}` };
        row[c.fieldname] = v;
      }
      doc[f.fieldname] = [row];
      continue;
    }
    const v = valueFor(f, ctx);
    if (v === undefined) return { skip: `no ${f.options || f.fieldtype} record to fill ${f.fieldname}` };
    doc[f.fieldname] = v;
  }
  return { doc };
}
