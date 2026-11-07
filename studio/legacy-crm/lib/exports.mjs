// Mécanismes d'export de Relatio 2004, tels que l'éditeur les proposait : CSV (Windows-1252,
// « ; », décimales à virgule), Excel, JSON (API v1), archive des documents, sauvegarde SQL.
// Chaque export exige un droit : le compte fourni pour la migration n'a pas tout.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { zip } from "./zip.mjs";
import { xlsx } from "./xlsx.mjs";

export const EXPORTS = [
  { file: "clients.csv", table: "T_CLIENT", format: "csv", right: "export", label: "Fichier clients" },
  { file: "prospects.csv", table: "T_PROSPECT", format: "csv", right: "export", label: "Prospects" },
  { file: "articles.xlsx", table: "T_ARTICLE", format: "xlsx", right: "export", label: "Catalogue articles (Excel)" },
  { file: "devis.csv", table: "T_DEVIS", format: "csv", right: "export", label: "Devis (en-têtes)" },
  { file: "devis_lignes.csv", table: "T_DEVIS_LIGNE", format: "csv", right: "export", label: "Devis (lignes)" },
  { file: "factures.csv", table: "T_FACTURE", format: "csv", right: "export", label: "Factures (en-têtes)" },
  { file: "factures_lignes.csv", table: "T_FACTURE_LIGNE", format: "csv", right: "export", label: "Factures (lignes)" },
  { file: "paiements.json", table: "T_PAIEMENT", format: "json", right: "export", label: "Règlements (API v1, JSON)" },
  { file: "activites.csv", table: "T_ACTIVITE", format: "csv", right: "export", label: "Historique d'activité" },
  { file: "documents.csv", table: "T_DOCUMENT", format: "csv", right: "export", label: "Index des documents" },
  { file: "documents.zip", table: null, format: "zip", right: "export", label: "Pièces jointes (archive)" },
  { file: "commissions.csv", table: "T_COMMISSION", format: "csv", right: "direction", label: "Commissions commerciales" },
  { file: "sauvegarde.sql", table: "*", format: "sql", right: "admin", label: "Sauvegarde complète (SQL)" },
];

const CONTENT_TYPE = {
  csv: "text/csv; charset=windows-1252",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json; charset=utf-8",
  zip: "application/zip",
  sql: "application/sql; charset=utf-8",
};

/* Windows-1252 : l'encodage des exports d'époque */
const CP1252 = { "€": 0x80, "‚": 0x82, ƒ: 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, ˆ: 0x88, "‰": 0x89, Š: 0x8a, "‹": 0x8b, Œ: 0x8c, Ž: 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, š: 0x9a, "›": 0x9b, œ: 0x9c, ž: 0x9e, Ÿ: 0x9f };
function cp1252(text) {
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    out[n++] = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : (CP1252[ch] ?? 0x3f);
  }
  return out.subarray(0, n);
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function csv(db, table) {
  const cols = columns(db, table);
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
  const cell = (v, type) => {
    if (v === null || v === undefined) return "";
    let s = type === "REAL" ? Number(v).toFixed(2).replace(".", ",") : String(v);
    if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.map((c) => c.name).join(";"), ...rows.map((r) => cols.map((c) => cell(r[c.name], c.type)).join(";"))];
  return { bytes: cp1252(lines.join("\r\n") + "\r\n"), rows: rows.length };
}

function sqlDump(db) {
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name <> 'T_UTILISATEUR' ORDER BY name").all();
  const lit = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  let out = "-- Relatio 2004 — sauvegarde SQL\nBEGIN TRANSACTION;\n";
  let rows = 0;
  for (const t of tables) {
    out += `${t.sql};\n`;
    for (const r of db.prepare(`SELECT * FROM ${t.name} ORDER BY 1`).all()) {
      out += `INSERT INTO ${t.name} VALUES (${Object.values(r).map(lit).join(",")});\n`;
      rows++;
    }
  }
  return { bytes: Buffer.from(out + "COMMIT;\n", "utf8"), rows };
}

/** Contenu d'un export (octets déterministes : même base → même empreinte). */
export function buildExport(db, dataDir, exp) {
  if (exp.format === "csv") return csv(db, exp.table);
  if (exp.format === "json") {
    const rows = db.prepare(`SELECT * FROM ${exp.table} ORDER BY 1`).all();
    return { bytes: Buffer.from(JSON.stringify(rows.map((r) => ({ ...r })), null, 1), "utf8"), rows: rows.length };
  }
  if (exp.format === "xlsx") {
    const cols = columns(db, exp.table).map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM ${exp.table} ORDER BY 1`).all();
    return { bytes: xlsx("Articles", cols, rows.map((r) => cols.map((c) => r[c]))), rows: rows.length };
  }
  if (exp.format === "zip") {
    const docs = db.prepare("SELECT CHEMIN FROM T_DOCUMENT ORDER BY ID_DOC").all();
    const entries = [];
    for (const d of docs) {
      const p = path.join(dataDir, "files", d.CHEMIN);
      if (fs.existsSync(p)) entries.push({ name: d.CHEMIN, data: fs.readFileSync(p) });
    }
    return { bytes: zip(entries), rows: entries.length };
  }
  if (exp.format === "sql") return sqlDump(db);
  throw new Error(`format inconnu ${exp.format}`);
}

export const contentType = (exp) => CONTENT_TYPE[exp.format];
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
