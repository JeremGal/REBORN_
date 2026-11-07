import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

/**
 * Connecteurs de lecture : CSV, JSON, Excel (.xlsx), export SQL, base SQLite (lecture seule),
 * archive ZIP (pièces jointes). Aucune dépendance. Les valeurs sont restituées telles que lues
 * (aucune conversion de type ici : les conversions sont déclarées et tracées dans transforms.ts).
 *
 * Ajouter un connecteur = ajouter un lecteur qui renvoie des RawTable.
 */

export type RawValue = string | number | boolean | null;

export interface RawTable {
  name: string;
  columns: string[];
  rows: RawValue[][];
}

export interface ArchiveEntry {
  path: string;
  data: Buffer;
}

export type SourceFormat = "csv" | "json" | "xlsx" | "sql" | "sqlite" | "zip";

export interface ParsedSource {
  format: SourceFormat;
  encoding?: string;
  tables: RawTable[];
  archive?: ArchiveEntry[];
  warnings: string[];
}

export class FormatError extends Error {}

/* ------------------------------------------------------------------ */
/* Détection                                                            */
/* ------------------------------------------------------------------ */

export function detectFormat(name: string, data: Buffer): SourceFormat {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (data.subarray(0, 16).toString("latin1") === "SQLite format 3\0") return "sqlite";
  if (data.readUInt32LE(0) === 0x04034b50) return ext === "xlsx" ? "xlsx" : "zip";
  if (ext === "json" || ext === "ndjson" || ext === "jsonl") return "json";
  if (ext === "sql") return "sql";
  if (ext === "csv" || ext === "txt" || ext === "tsv") return "csv";
  const head = data.subarray(0, 200).toString("utf8").trimStart();
  if (head.startsWith("[") || head.startsWith("{")) return "json";
  if (/^(--|BEGIN|CREATE|INSERT|PRAGMA)/i.test(head)) return "sql";
  return "csv";
}

/** Texte : UTF-8 (avec ou sans BOM) si valide, sinon Windows-1252 (exports d'époque). */
export function decodeText(data: Buffer): { text: string; encoding: string } {
  const bom = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bom ? data.subarray(3) : data), encoding: bom ? "utf-8 (BOM)" : "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(data), encoding: "windows-1252" };
  }
}

export function parseSource(name: string, data: Buffer, format: SourceFormat = detectFormat(name, data)): ParsedSource {
  const base = name.replace(/\.[^.]+$/, "");
  switch (format) {
    case "csv": {
      const { text, encoding } = decodeText(data);
      const { table, warnings } = parseCsv(base, text);
      return { format, encoding, tables: [table], warnings };
    }
    case "json": {
      const { text, encoding } = decodeText(data);
      return { format, encoding, ...parseJson(base, text) };
    }
    case "xlsx":
      return { format, ...parseXlsx(data) };
    case "zip":
      return { format, tables: [], archive: readZip(data), warnings: [] };
    case "sql": {
      const { text, encoding } = decodeText(data);
      return { format, encoding, ...parseSqlDump(text) };
    }
    case "sqlite":
      return { format, ...readSqliteFile(data) };
  }
}

/* ------------------------------------------------------------------ */
/* CSV (RFC 4180 : guillemets, retours à la ligne dans les champs)       */
/* ------------------------------------------------------------------ */

export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  let best = ",";
  let bestCount = 0;
  for (const d of [";", ",", "\t", "|"]) {
    let count = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(name: string, text: string, delimiter = detectDelimiter(text)): { table: RawTable; warnings: string[] } {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === "\r" && text[i + 1] === "\n") {
      pushRow();
      i++;
    } else if (ch === "\n" || ch === "\r") pushRow();
    else field += ch;
    i++;
  }
  if (field !== "" || row.length) pushRow();
  if (quoted) throw new FormatError(`${name} : guillemet non fermé`);
  const warnings: string[] = [];
  // Lignes entièrement vides : ignorées (et signalées)
  const blank = records.filter((r) => r.length === 1 && r[0] === "").length;
  const [header = [], ...body] = records.filter((r) => !(r.length === 1 && r[0] === ""));
  const columns = header.map((h, idx) => h.replace(/^﻿/, "").trim() || `colonne_${idx + 1}`);
  if (new Set(columns).size !== columns.length) throw new FormatError(`${name} : noms de colonnes dupliqués`);
  let ragged = 0;
  const rows = body.map((r) => {
    if (r.length !== columns.length) ragged++;
    return columns.map((_, c) => r[c] ?? "");
  });
  if (blank) warnings.push(`${name} : ${blank} ligne(s) vide(s) ignorée(s)`);
  if (ragged) warnings.push(`${name} : ${ragged} ligne(s) avec un nombre de colonnes inattendu (complétées par des valeurs vides)`);
  return { table: { name, columns, rows }, warnings };
}

/* ------------------------------------------------------------------ */
/* JSON : tableau d'objets, { table: [...] } ou NDJSON                   */
/* ------------------------------------------------------------------ */

export function parseJson(name: string, text: string): { tables: RawTable[]; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    try {
      data = lines.map((l) => JSON.parse(l));
    } catch {
      throw new FormatError(`${name} : JSON invalide`);
    }
  }
  const warnings: string[] = [];
  const toTable = (tname: string, list: unknown[]): RawTable => {
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const o of list) {
      if (!o || typeof o !== "object" || Array.isArray(o)) throw new FormatError(`${tname} : chaque élément doit être un objet`);
      for (const k of Object.keys(o)) if (!seen.has(k)) seen.add(k), columns.push(k);
    }
    let nested = 0;
    const rows = list.map((o) =>
      columns.map((c) => {
        const v = (o as Record<string, unknown>)[c];
        if (v === undefined || v === null) return null;
        if (typeof v === "object") {
          nested++;
          return JSON.stringify(v);
        }
        return v as RawValue;
      }),
    );
    if (nested) warnings.push(`${tname} : ${nested} valeur(s) imbriquée(s) conservée(s) en texte JSON`);
    return { name: tname, columns, rows };
  };
  if (Array.isArray(data)) return { tables: [toTable(name, data)], warnings };
  if (data && typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => Array.isArray(v));
    if (entries.length) return { tables: entries.map(([k, v]) => toTable(k, v as unknown[])), warnings };
  }
  throw new FormatError(`${name} : structure JSON non tabulaire`);
}

/* ------------------------------------------------------------------ */
/* ZIP (lecture, méthodes STORED et DEFLATE)                             */
/* ------------------------------------------------------------------ */

export function readZip(data: Buffer): ArchiveEntry[] {
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FormatError("Archive ZIP illisible (fin de répertoire absente)");
  const count = data.readUInt16LE(eocd + 10);
  let p = data.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new FormatError("Archive ZIP64 non prise en charge");
  const out: ArchiveEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (data.readUInt32LE(p) !== 0x02014b50) throw new FormatError("Répertoire ZIP corrompu");
    const method = data.readUInt16LE(p + 10);
    const crc = data.readUInt32LE(p + 16);
    const compSize = data.readUInt32LE(p + 20);
    const nameLen = data.readUInt16LE(p + 28);
    const extraLen = data.readUInt16LE(p + 30);
    const commentLen = data.readUInt16LE(p + 32);
    const local = data.readUInt32LE(p + 42);
    const path = data.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith("/")) continue;
    const lNameLen = data.readUInt16LE(local + 26);
    const lExtraLen = data.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = data.subarray(start, start + compSize);
    const content = method === 0 ? Buffer.from(raw) : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!content) throw new FormatError(`${path} : méthode de compression ${method} non prise en charge`);
    if (zlib.crc32(content) !== crc) throw new FormatError(`${path} : somme de contrôle CRC invalide`);
    if (path.includes("..") || path.startsWith("/")) throw new FormatError(`${path} : chemin d'archive refusé`);
    out.push({ path, data: content });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Excel .xlsx (Office Open XML)                                         */
/* ------------------------------------------------------------------ */

const xmlText = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseXlsx(data: Buffer): { tables: RawTable[]; warnings: string[] } {
  const files = new Map(readZip(data).map((e) => [e.path, e.data.toString("utf8")]));
  const workbook = files.get("xl/workbook.xml");
  if (!workbook) throw new FormatError("Classeur Excel invalide (xl/workbook.xml absent)");
  const rels = new Map<string, string>();
  for (const m of (files.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(""));
  const tables: RawTable[] = [];
  const warnings: string[] = [];
  for (const s of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlText(/name="([^"]+)"/.exec(s[0])?.[1] ?? "Feuille");
    const rid = /r:id="([^"]+)"/.exec(s[0])?.[1] ?? "";
    const xml = files.get(rels.get(rid) ?? "");
    if (!xml) continue;
    const grid: RawValue[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: RawValue[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const t = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
        const inner = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value: RawValue = null;
        if (t === "s" && v !== undefined) value = shared[Number(v)] ?? null;
        else if (t === "inlineStr") value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlText(x[1])).join("");
        else if (t === "b" && v !== undefined) value = v === "1";
        else if (t === "str" || t === "e") value = v !== undefined ? xmlText(v) : null;
        else if (v !== undefined) value = Number(v);
        cells[ref ? colIndex(ref) : cells.length] = value;
      }
      grid.push(cells);
    }
    if (!grid.length) continue;
    const [header, ...body] = grid;
    const columns = Array.from({ length: header.length }, (_, i) => String(header[i] ?? `colonne_${i + 1}`).trim());
    const rows = body.filter((r) => r.some((v) => v !== null && v !== undefined && v !== "")).map((r) => columns.map((_, i) => (r[i] === undefined ? null : r[i])));
    if (body.some((r) => r.length > columns.length)) warnings.push(`${name} : cellules au-delà de l'en-tête ignorées`);
    tables.push({ name, columns, rows });
  }
  if (!tables.length) throw new FormatError("Classeur Excel sans feuille lisible");
  warnings.push("Excel : les dates stockées en numéro de série restent des nombres (transformation « date: excel » à déclarer)");
  return { tables, warnings };
}

/* ------------------------------------------------------------------ */
/* Export SQL : exécuté dans une base SQLite EN MÉMOIRE, après filtrage  */
/* ------------------------------------------------------------------ */

/** Découpe un script SQL en instructions (guillemets, commentaires). */
export function splitSql(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      cur += ch;
      if (ch === q) {
        if (text[i + 1] === q) {
          cur += text[++i];
        } else q = null;
      }
      continue;
    }
    if (ch === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") q = ch;
    if (ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Seules les instructions de structure et de données sont admises (pas d'ATTACH, VACUUM INTO, TRIGGER…). */
const ALLOWED_SQL = /^(CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|INSERT\s+INTO|BEGIN(\s+TRANSACTION)?|COMMIT|END(\s+TRANSACTION)?)\b/i;

export function parseSqlDump(text: string): { tables: RawTable[]; warnings: string[] } {
  const statements = splitSql(text);
  const refused = statements.filter((s) => !ALLOWED_SQL.test(s));
  if (refused.length) throw new FormatError(`Export SQL refusé : instruction non autorisée « ${refused[0].slice(0, 60)} » (seuls CREATE TABLE, CREATE INDEX et INSERT sont acceptés)`);
  const db = new DatabaseSync(":memory:");
  try {
    for (const s of statements) {
      if (/^(BEGIN|COMMIT|END)\b/i.test(s)) continue;
      // Syntaxe MySQL courante : `identifiants` → "identifiants"
      db.exec(s.replace(/`([^`]*)`/g, '"$1"'));
    }
    return { tables: readAllTables(db), warnings: [] };
  } catch (e) {
    if (e instanceof FormatError) throw e;
    throw new FormatError(`Export SQL illisible : ${(e as Error).message}`);
  } finally {
    db.close();
  }
}

/** Base SQLite fournie par le propriétaire : ouverte en lecture seule. */
function readSqliteFile(data: Buffer): { tables: RawTable[]; warnings: string[] } {
  // Copie en mémoire via une base temporaire : aucun accès en écriture au fichier fourni
  const tmp = path.join(os.tmpdir(), `reborn-src-${randomUUID()}.db`);
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    return { tables: readAllTables(db), warnings: [] };
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}

function readAllTables(db: DatabaseSync): RawTable[] {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return names.map(({ name }) => {
    const cols = (db.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all() as { name: string }[]).map((c) => c.name);
    const rows = (db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all() as Record<string, unknown>[]).map((r) =>
      cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return null;
        if (typeof v === "bigint") return Number(v);
        if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
        return v as RawValue;
      }),
    );
    return { name, columns: cols, rows };
  });
}
