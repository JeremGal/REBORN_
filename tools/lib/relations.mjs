// Implicit relations: a column named after another table (account_guid, customer_id, taxid...) that no foreign key declares.
// Old databases often skip foreign keys, so the link only exists in the program. Each candidate is a hypothesis to check,
// never a fact: the cards are not changed, the investigator decides.
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const singular = (s) => (s.endsWith("ies") ? `${s.slice(0, -3)}y` : s.endsWith("s") ? s.slice(0, -1) : s);

export function implicitRelations(entities) {
  const targets = new Map();
  for (const e of entities) {
    for (const key of [norm(e.name), norm(e.storage?.observed_table)]) {
      if (!key) continue;
      targets.set(key, e.name);
      targets.set(singular(key), e.name);
    }
  }
  const out = [];
  for (const e of entities) {
    const declared = new Set([...(e.relations || []).map((r) => `${norm(r.via)}>${r.to}`), ...(e.fields || []).filter((f) => f.ref).map((f) => `${norm(f.name)}>${f.ref}`)]);
    for (const f of e.fields || []) {
      if (f.ref) continue;
      const m = /^(.+?)_?(id|guid|uuid|code|ref|no|num)$/i.exec(f.name);
      if (!m || m[1].length < 2) continue;
      const to = targets.get(norm(m[1])) ?? targets.get(singular(norm(m[1])));
      if (!to || to === e.name || declared.has(`${norm(f.name)}>${to}`)) continue;
      out.push({ from: e.name, field: f.name, to, why: `column "${f.name}" is named after ${to} and no foreign key declares it` });
    }
  }
  return out;
}
