import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ArchiveEntry, RawTable, RawValue } from "./formats";
import { importOrder, type MigrationMapping } from "./mapping";
import { buildDdl, q } from "./model";
import { canonical, convert, rowHash, sha256, sourceKey, transformName, TransformError, type StoredValue } from "./transforms";

/**
 * Exécuteur de migration : lit les tables sources, applique les correspondances validées,
 * écrit la base de destination en une transaction, et consigne pour chaque enregistrement
 * son origine (table, clé, empreinte de la ligne source, transformations).
 *
 * Aucune donnée n'est inventée : une ligne qu'on ne peut pas migrer est rejetée avec ses
 * motifs ; une valeur facultative non convertible est laissée vide ET signalée ; la ligne
 * source complète reste consultable dans _lineage.
 */

export interface SourceTableInput extends RawTable {
  file: string;
  file_sha256: string;
}

export interface Rejection {
  entity: string;
  source_table: string;
  source_key: string | null;
  row: number;
  reasons: string[];
  raw: Record<string, RawValue>;
}

export interface FieldIssue {
  entity: string;
  record_id: number;
  source_key: string;
  field: string;
  kind: "conversion" | "unlinked";
  message: string;
  raw: RawValue;
}

export interface DuplicateGroup {
  entity: string;
  rule: string;
  value: string;
  records: { id: number; source_key: string }[];
}

export interface EntityRunResult {
  entity: string;
  label?: string;
  source_table: string;
  source_rows: number;
  imported: number;
  rejected: number;
  conversion_issues: number;
  unlinked: number;
}

export interface AttachmentResult {
  expected: number;
  stored: number;
  bytes: number;
  missing: { source_key: string | null; path: string | null; filename: string | null; reason: string }[];
}

export interface RunResult {
  run_id: string;
  started_at: string;
  finished_at: string;
  status: "completed" | "failed";
  error?: string;
  db_path: string;
  files_dir: string;
  db_sha256?: string;
  entities: EntityRunResult[];
  rejections: Rejection[];
  field_issues: FieldIssue[];
  duplicates: DuplicateGroup[];
  attachments: AttachmentResult;
}

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export const mimeOf = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export function rowObject(t: RawTable, row: RawValue[]): Record<string, RawValue> {
  const o: Record<string, RawValue> = {};
  t.columns.forEach((c, i) => (o[c] = row[i] ?? null));
  return o;
}

export function runMigration(input: {
  runId: string;
  mapping: MigrationMapping;
  tables: Map<string, SourceTableInput>;
  archives: Map<string, ArchiveEntry[]>;
  outDir: string;
  sourceSystem?: string;
}): RunResult {
  const { runId, mapping, tables, archives, outDir } = input;
  const started_at = new Date().toISOString();
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "files"), { recursive: true });
  const dbPath = path.join(outDir, "target.db");
  const db = new DatabaseSync(dbPath);
  const result: RunResult = {
    run_id: runId,
    started_at,
    finished_at: started_at,
    status: "completed",
    db_path: dbPath,
    files_dir: path.join(outDir, "files"),
    entities: [],
    rejections: [],
    field_issues: [],
    duplicates: [],
    attachments: { expected: 0, stored: 0, bytes: 0, missing: [] },
  };
  const keyMaps = new Map<string, Map<string, number>>();
  const rejectedKeys = new Map<string, Set<string>>();
  const now = new Date().toISOString();

  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const s of buildDdl(mapping)) db.exec(s);
    db.exec("BEGIN");
    const lineage = db.prepare(
      `INSERT INTO "_lineage" ("entity", "record_id", "source_system", "source_table", "source_key", "source_file", "source_file_sha256", "source_row", "source_row_hash", "target_row_hash", "transforms", "run_id", "migrated_at") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const e of importOrder(mapping)) {
      const t = tables.get(e.source.table);
      if (!t) throw new Error(`table source absente : ${e.source.table}`);
      const cols = [...e.fields.map((f) => f.name), "_source_key", "_migrated", "_run_id"];
      const insert = db.prepare(`INSERT INTO ${q(e.name)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
      const transforms = JSON.stringify(Object.fromEntries(e.fields.map((f) => [f.name, { source: f.source, type: f.type, transforms: (f.transforms ?? []).map(transformName) }])));
      const keys = new Map<string, number>();
      const rejected = new Set<string>();
      keyMaps.set(e.name, keys);
      rejectedKeys.set(e.name, rejected);
      const seen = new Map<string, number>();
      const stats: EntityRunResult = { entity: e.name, label: e.label, source_table: e.source.table, source_rows: t.rows.length, imported: 0, rejected: 0, conversion_issues: 0, unlinked: 0 };

      t.rows.forEach((r, rowIndex) => {
        const raw = rowObject(t, r);
        const key = sourceKey(raw[e.source.key]);
        const reasons: string[] = [];
        const issues: Omit<FieldIssue, "record_id">[] = [];
        if (key === null) reasons.push(`clé source ${e.source.key} absente`);
        else if (seen.has(key)) reasons.push(`clé source ${key} en double (ligne ${seen.get(key)! + 2})`);
        const values: Record<string, StoredValue> = {};
        for (const f of e.fields) {
          const rawv = raw[f.source] ?? null;
          if (f.type === "reference") {
            let ref: StoredValue = null;
            try {
              ref = convert(rawv, { type: "reference", transforms: f.transforms });
            } catch (x) {
              reasons.push(`${f.label ?? f.name} : ${(x as Error).message}`);
              continue;
            }
            const refKey = ref === null ? null : String(ref);
            if (refKey === null) {
              if (f.required) reasons.push(`${f.label ?? f.name} : référence obligatoire absente`);
              values[f.name] = null;
              continue;
            }
            const id = keyMaps.get(f.references!)?.get(refKey);
            if (id !== undefined) {
              values[f.name] = id;
              continue;
            }
            const why = rejectedKeys.get(f.references!)?.has(refKey) ? `${f.references} ${refKey} rejeté(e) lors de cette migration` : `${f.references} ${refKey} introuvable dans la source`;
            if (f.on_missing === "keep_unlinked" && !f.required) {
              values[f.name] = null;
              issues.push({ entity: e.name, source_key: key ?? "", field: f.name, kind: "unlinked", message: `rattachement impossible : ${why}`, raw: rawv });
            } else reasons.push(`${f.label ?? f.name} : ${why}`);
            continue;
          }
          try {
            values[f.name] = convert(rawv, f);
          } catch (x) {
            if (!(x instanceof TransformError)) throw x;
            if (f.required) reasons.push(`${f.label ?? f.name} : ${x.message}`);
            else {
              values[f.name] = null;
              issues.push({ entity: e.name, source_key: key ?? "", field: f.name, kind: "conversion", message: x.message, raw: rawv });
            }
            continue;
          }
          if (values[f.name] === null && f.required) reasons.push(`${f.label ?? f.name} : valeur obligatoire absente`);
        }
        if (key !== null && !seen.has(key)) seen.set(key, rowIndex);

        const reject = (why: string[]) => {
          stats.rejected++;
          if (key !== null) rejected.add(key);
          result.rejections.push({ entity: e.name, source_table: e.source.table, source_key: key, row: rowIndex + 2, reasons: why, raw });
        };
        if (reasons.length) return reject(reasons);
        let id: number;
        try {
          const info = insert.run(...e.fields.map((f) => values[f.name]), key, 1, runId);
          id = Number(info.lastInsertRowid);
        } catch (x) {
          return reject([`refus de la base de destination : ${(x as Error).message.replace(/^constraint failed\s*/i, "")}`]);
        }
        keys.set(key!, id);
        lineage.run(e.name, id, input.sourceSystem ?? null, e.source.table, key!, t.file, t.file_sha256, canonical(raw), rowHash(raw), rowHash(values), transforms, runId, now);
        stats.imported++;
        for (const i of issues) {
          result.field_issues.push({ ...i, record_id: id });
          if (i.kind === "conversion") stats.conversion_issues++;
          else stats.unlinked++;
        }
      });

      // Doublons potentiels : signalés, jamais fusionnés automatiquement
      for (const d of e.duplicates ?? []) {
        const rows = db.prepare(`SELECT "id", "_source_key", ${d.fields.map(q).join(", ")} FROM ${q(e.name)}`).all() as Record<string, StoredValue>[];
        const groups = new Map<string, { id: number; source_key: string }[]>();
        for (const row of rows) {
          const parts = d.fields.map((f) => row[f]);
          if (parts.some((p) => p === null || p === "")) continue;
          const k = parts.map((p) => String(p).trim().toLowerCase().replace(/\s+/g, " ")).join(" | ");
          groups.set(k, [...(groups.get(k) ?? []), { id: Number(row.id), source_key: String(row._source_key) }]);
        }
        for (const [value, records] of groups) if (records.length > 1) result.duplicates.push({ entity: e.name, rule: d.label ?? d.fields.join(" + "), value, records });
      }
      result.entities.push(stats);
    }

    // Pièces jointes : copiées, empreintes calculées, rattachées aux nouveaux enregistrements
    const insertFile = db.prepare(`INSERT INTO "_files" ("entity", "record_id", "filename", "mime", "size", "sha256", "storage", "source_key", "source_path", "_migrated", "created_at", "created_by") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'migration')`);
    for (const a of mapping.attachments ?? []) {
      const t = tables.get(a.source.table);
      if (!t) throw new Error(`table source absente : ${a.source.table}`);
      const entries = archives.get(a.archive);
      const byPath = new Map((entries ?? []).map((x) => [x.path, x.data]));
      for (const r of t.rows) {
        const raw = rowObject(t, r);
        result.attachments.expected++;
        const key = sourceKey(raw[a.source.key]);
        const p = raw[a.path] === null ? null : String(raw[a.path]).trim();
        const filename = raw[a.filename] === null ? null : String(raw[a.filename]).trim();
        const missing = (reason: string) => result.attachments.missing.push({ source_key: key, path: p, filename, reason });
        const entity = "map" in a.owner ? a.owner.map[String(raw[a.owner.type] ?? "").trim()] : a.owner.entity;
        if (!entity) {
          missing(`type de rattachement inconnu « ${raw["map" in a.owner ? a.owner.type : ""]} »`);
          continue;
        }
        const ownerKey = sourceKey(raw[a.owner.id]);
        const owner = ownerKey === null ? undefined : keyMaps.get(entity)?.get(ownerKey);
        if (owner === undefined) {
          missing(`${entity} ${ownerKey} non migré(e) ou introuvable`);
          continue;
        }
        if (!entries) {
          missing(`archive ${a.archive} non fournie`);
          continue;
        }
        const data = p ? byPath.get(p) : undefined;
        if (!data || !p) {
          missing("fichier absent de l'archive extraite");
          continue;
        }
        const digest = sha256(data);
        const dest = path.join(outDir, "files", digest);
        if (!fs.existsSync(dest)) fs.writeFileSync(dest, data);
        insertFile.run(entity, owner, filename ?? path.basename(p), mimeOf(filename ?? p), data.length, digest, digest, key, p, now);
        result.attachments.stored++;
        result.attachments.bytes += data.length;
      }
    }

    const meta = db.prepare(`INSERT OR REPLACE INTO "_meta" ("key", "value") VALUES (?, ?)`);
    meta.run("migration_run", runId);
    meta.run("source_system", input.sourceSystem ?? "");
    meta.run("migrated_at", now);
    meta.run("mapping_sha256", sha256(canonical(mapping)));
    meta.run("target", JSON.stringify(mapping.target));
    db.exec("COMMIT");
  } catch (x) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    result.status = "failed";
    result.error = (x as Error).message;
  } finally {
    db.close();
  }
  result.finished_at = new Date().toISOString();
  if (result.status === "completed") result.db_sha256 = sha256(fs.readFileSync(dbPath));
  return result;
}
