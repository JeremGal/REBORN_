// Turns a shipped SQL schema script (CREATE TABLE ...) into entity cards with real types, primary and foreign keys.
// A shipped create script is an exact artifact, so entities built from it are graded "confirmed".
// Reusable across any target that ships its schema (HSQLDB/Derby/MySQL/Postgres/SQLite dialects).
import fs from "node:fs";
import path from "node:path";

const TYPE = (sql) => {
  const t = sql.toUpperCase();
  if (/\b(INT|INTEGER|BIGINT|SMALLINT)\b/.test(t)) return "integer";
  if (/\b(DOUBLE|REAL|FLOAT|DECIMAL|NUMERIC)\b/.test(t)) return "decimal";
  if (/\b(BOOLEAN|BIT)\b/.test(t)) return "boolean";
  if (/\bTIMESTAMP\b/.test(t)) return "datetime";
  if (/\bDATE\b/.test(t)) return "date";
  if (/\bTIME\b/.test(t)) return "time";
  if (/\b(VARBINARY|BLOB|BINARY)\b/.test(t)) return "file";
  if (/\b(VARCHAR|CHAR|CLOB|TEXT|LONGVARCHAR)\b/.test(t)) return "string";
  return "string";
};
const MAXLEN = (sql) => Number(/\bVARCHAR\s*\(\s*(\d+)/i.exec(sql)?.[1]) || undefined;
const pascal = (name) => name.toLowerCase().replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

// Split a CREATE TABLE body on top-level commas (ignore commas inside parentheses).
function splitTop(body) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSqlSchema(sql) {
  const tables = {};
  const re = /CREATE\s+(?:CACHED\s+|MEMORY\s+|GLOBAL\s+TEMPORARY\s+)?TABLE\s+([A-Za-z0-9_."]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    // find the matching close paren for this CREATE
    let i = re.lastIndex, depth = 1;
    while (i < sql.length && depth > 0) { const c = sql[i]; if (c === "(") depth++; else if (c === ")") depth--; i++; }
    const body = sql.slice(re.lastIndex, i - 1);
    const name = m[1].replace(/[".]/g, (x) => (x === "." ? "." : "")).split(".").pop();
    const fields = [];
    const fks = [];
    let pk = [];
    for (const item of splitTop(body)) {
      const up = item.toUpperCase();
      if (/^PRIMARY\s+KEY/.test(up)) { pk = (item.match(/\(([^)]*)\)/)?.[1] || "").split(",").map((s) => s.trim()); continue; }
      if (/^(CONSTRAINT|FOREIGN\s+KEY|UNIQUE|CHECK|KEY)\b/.test(up)) {
        const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z0-9_."]+)\s*\(([^)]*)\)/i.exec(item);
        if (fk) fks.push({ col: fk[1].trim().replace(/["`]/g, ""), to: fk[2].split(".").pop().replace(/["`]/g, ""), toCol: fk[3].trim() });
        continue;
      }
      const cm = /^["`]?([A-Za-z0-9_]+)["`]?\s+(.+)$/.exec(item);
      if (!cm) continue;
      const col = cm[1], rest = cm[2];
      fields.push({ name: col.toLowerCase(), observed_as: col, type: TYPE(rest), max_length: MAXLEN(rest), required: /\bNOT\s+NULL\b/i.test(rest) || undefined });
    }
    tables[name] = { name, fields, fks, pk };
  }
  return tables;
}

export function schemaToEntities(sql, { engine = "SQL", sourceRef }) {
  const tables = parseSqlSchema(sql);
  const byTable = Object.fromEntries(Object.values(tables).map((t) => [t.name.toUpperCase(), pascal(t.name)]));
  const out = [];
  for (const t of Object.values(tables)) {
    const fkByCol = Object.fromEntries(t.fks.map((f) => [f.col.toUpperCase(), f]));
    const fields = t.fields.map((f) => {
      const fk = fkByCol[f.observed_as.toUpperCase()];
      const o = { name: f.name, label: "", type: fk ? "ref" : f.type, observed_as: f.observed_as };
      if (f.required) o.required = true;
      if (f.max_length && !fk) o.max_length = f.max_length;
      if (t.pk.length === 1 && t.pk[0].toUpperCase() === f.observed_as.toUpperCase()) o.unique = true;
      if (fk) o.ref = byTable[fk.to.toUpperCase()] || pascal(fk.to);
      return o;
    });
    const relations = t.fks.map((f) => ({ to: byTable[f.to.toUpperCase()] || pascal(f.to), kind: "many-to-one", via: f.col.toLowerCase() }));
    out.push({
      name: pascal(t.name),
      description: `Table ${t.name} from the shipped database schema.`,
      fields,
      relations,
      storage: { engine, observed_table: t.name },
      status: "confirmed",
      evidence: [{ ref: sourceRef, kind: "rea", locator: `CREATE TABLE ${t.name}`, note: "shipped SQL create script" }],
    });
  }
  return out;
}
