// Turns a shipped SQL schema script (CREATE TABLE, ALTER TABLE ...) into entity cards with real types, primary and foreign keys.
// A shipped create script is an exact artifact, so entities built from it are graded "confirmed", but only when every
// statement that touches the table was understood. A table changed by a statement this reader does not apply is "partial".
// Reusable across any target that ships its schema (HSQLDB/Derby/MySQL/Postgres/SQLite dialects).

const unquote = (s) => String(s).trim().replace(/^["`\[]|["`\]]$/g, "");
const pascal = (name) => name.toLowerCase().replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

// Removes -- and /* */ comments, leaving string literals alone.
export function stripComments(sql) {
  let out = "", i = 0, quoted = false;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (quoted) {
      out += c;
      if (c === "'") { if (n === "'") { out += n; i += 2; continue; } quoted = false; }
      i++;
      continue;
    }
    if (c === "'") { quoted = true; out += c; i++; continue; }
    if (c === "-" && n === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? sql.length : e + 2; out += " "; continue; }
    out += c;
    i++;
  }
  return out;
}

// Split on top-level commas (ignore commas inside parentheses and string literals).
function splitTop(body) {
  const parts = [];
  let depth = 0, cur = "", quoted = false;
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted) { if (ch === "(") depth++; else if (ch === ")") depth--; }
    if (ch === "," && depth === 0 && !quoted) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// SQL type -> ReBorn field type. `known: false` means the reader guessed.
function typeOf(rest) {
  const m = /^\s*([A-Za-z]+)\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?/.exec(rest);
  const base = (m?.[1] ?? "").toUpperCase();
  const p = m?.[2] !== undefined ? Number(m[2]) : undefined;
  const s = m?.[3] !== undefined ? Number(m[3]) : undefined;
  if (/^(INT|INTEGER|BIGINT|SMALLINT|MEDIUMINT|SERIAL|BIGSERIAL|IDENTITY)$/.test(base)) return { type: "integer", known: true };
  if (base === "TINYINT") return { type: p === 1 ? "boolean" : "integer", known: true };
  if (/^(BOOLEAN|BOOL|BIT)$/.test(base)) return { type: "boolean", known: true };
  if (/^(MONEY|SMALLMONEY)$/.test(base)) return { type: "money", precision: 4, known: true };
  if (base === "NUMBER") return s === undefined ? { type: "integer", known: true } : { type: "decimal", precision: s, known: true };
  if (/^(DECIMAL|NUMERIC|DEC)$/.test(base)) return { type: "decimal", precision: s ?? 0, known: true };
  if (/^(DOUBLE|REAL|FLOAT)$/.test(base)) return { type: "decimal", known: true };
  if (/^(DATETIME|TIMESTAMP|SMALLDATETIME|DATETIME2)$/.test(base)) return { type: "datetime", known: true };
  if (base === "DATE") return { type: "date", known: true };
  if (base === "TIME") return { type: "time", known: true };
  if (/^(VARBINARY|BINARY|BLOB|LONGVARBINARY|IMAGE|BYTEA)$/.test(base)) return { type: "file", known: true };
  if (/^(CLOB|TEXT|NTEXT|LONGVARCHAR|MEDIUMTEXT|LONGTEXT)$/.test(base)) return { type: "text", known: true };
  if (/^(VARCHAR|CHAR|NVARCHAR|NCHAR|CHARACTER|VARCHAR2|VARCHAR_IGNORECASE)$/.test(base)) return { type: "string", max_length: p, known: true };
  if (/^(UUID|GUID|UNIQUEIDENTIFIER)$/.test(base)) return { type: "string", known: true };
  return { type: "string", known: false, base };
}

function parseColumn(item, table) {
  const cm = /^["`\[]?([A-Za-z0-9_]+)["`\]]?\s+(.+)$/s.exec(item);
  if (!cm) return;
  const col = cm[1], rest = cm[2];
  const ty = typeOf(rest);
  // A column declared twice is a contradiction in the script (a real database refuses the second one). Keep the first,
  // never build a card with two fields of the same name, and grade the table partial so the conflict gets looked at.
  const first = table.fields.find((f) => f.observed_as.toUpperCase() === col.toUpperCase());
  if (first) { table.unhandled.push(`column ${col} declared twice (${first.type}, then ${ty.type})`); return; }
  if (!ty.known) table.unhandled.push(`column ${col}: unrecognised type ${ty.base || "?"}`);
  table.fields.push({ name: col.toLowerCase(), observed_as: col, type: ty.type, max_length: ty.max_length, precision: ty.precision, required: /\bNOT\s+NULL\b/i.test(rest) || undefined });
  if (/\bPRIMARY\s+KEY\b(?!\s*\()/i.test(rest)) table.pk = [col];
  const ref = /\bREFERENCES\s+([A-Za-z0-9_."`\[\]]+)\s*\(([^)]*)\)/i.exec(rest);
  if (ref) table.fks.push({ col, to: unquote(ref[1].split(".").pop()), toCol: ref[2].trim() });
}

function constraint(item, table) {
  const up = item.toUpperCase();
  const cols = (s) => (s.match(/\(([^)]*)\)/)?.[1] || "").split(",").map((x) => unquote(x));
  if (/(^|\s)PRIMARY\s+KEY\s*\(/.test(up)) { table.pk = cols(item.slice(up.indexOf("PRIMARY"))); return true; }
  const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([A-Za-z0-9_."`\[\]]+)\s*\(([^)]*)\)/i.exec(item);
  if (fk) { table.fks.push({ col: unquote(fk[1]), to: unquote(fk[2].split(".").pop()), toCol: fk[3].trim() }); return true; }
  return /^(CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)\b/.test(up);
}

export function parseSqlSchema(rawSql) {
  const sql = stripComments(rawSql);
  const tables = {};
  const re = /CREATE\s+(?:CACHED\s+|MEMORY\s+|GLOBAL\s+TEMPORARY\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."`\[\]]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    let i = re.lastIndex, depth = 1;
    while (i < sql.length && depth > 0) { const c = sql[i]; if (c === "(") depth++; else if (c === ")") depth--; i++; }
    const body = sql.slice(re.lastIndex, i - 1);
    const name = unquote(m[1].split(".").pop());
    const table = { name, fields: [], fks: [], pk: [], unhandled: [] };
    for (const item of splitTop(body)) {
      if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|KEY|INDEX)\b/i.test(item)) {
        if (!constraint(item, table)) table.unhandled.push(`constraint: ${item.slice(0, 40)}`);
        continue;
      }
      parseColumn(item, table);
    }
    tables[name.toUpperCase()] = table;
  }

  // Statements that change a table after its CREATE: the schema a program really runs on includes them.
  const alter = /ALTER\s+TABLE\s+([A-Za-z0-9_."`\[\]]+)\s+([^;]+?)\s*(?:;|$)/gi;
  while ((m = alter.exec(sql))) {
    const table = tables[unquote(m[1].split(".").pop()).toUpperCase()];
    if (!table) continue;
    for (const part of splitTop(m[2])) {
      const add = /^ADD\s+(?:COLUMN\s+)?(.+)$/is.exec(part);
      const drop = /^DROP\s+(?:COLUMN\s+)?["`\[]?([A-Za-z0-9_]+)/i.exec(part);
      if (add && /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|KEY|INDEX)\b/i.test(add[1])) {
        if (!constraint(add[1], table)) table.unhandled.push(`ALTER ADD ${add[1].slice(0, 40)}`);
      } else if (add) parseColumn(add[1], table);
      else if (drop && !/^(CONSTRAINT|PRIMARY|FOREIGN)/i.test(part.replace(/^DROP\s+/i, ""))) table.fields = table.fields.filter((f) => f.observed_as.toUpperCase() !== drop[1].toUpperCase());
      else table.unhandled.push(`ALTER ${part.slice(0, 50)}`);
    }
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
      if (f.precision !== undefined && !fk) o.precision = f.precision;
      if (t.pk.length === 1 && t.pk[0].toUpperCase() === f.observed_as.toUpperCase()) o.unique = true;
      if (fk) o.ref = byTable[fk.to.toUpperCase()] || pascal(fk.to);
      return o;
    });
    const relations = t.fks.map((f) => ({ to: byTable[f.to.toUpperCase()] || pascal(f.to), kind: "many-to-one", via: f.col.toLowerCase() }));
    const partial = t.unhandled.length > 0;
    out.push({
      name: pascal(t.name),
      description: `Table ${t.name} from the shipped database schema.${partial ? ` ${t.unhandled.length} statement(s) on this table were not applied by the reader (${t.unhandled.slice(0, 3).join("; ")}): check them by hand.` : ""}`,
      fields,
      relations,
      storage: { engine, observed_table: t.name },
      status: partial ? "partial" : "confirmed",
      evidence: [{ ref: sourceRef, kind: "rea", locator: `CREATE TABLE ${t.name}`, note: "shipped SQL create script" }],
    });
  }
  return out;
}
