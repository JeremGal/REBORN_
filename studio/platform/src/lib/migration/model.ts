import { importOrder, type EntityMap, type FieldMap, type MigrationMapping } from "./mapping";
import type { FieldType } from "./transforms";

/**
 * Nouvelle architecture de données : une table par entité, clés techniques neuves,
 * identifiant source conservé (_source_key), contraintes d'intégrité (NOT NULL, UNIQUE,
 * CHECK des listes, clés étrangères), tables système de traçabilité.
 *
 * Montants : entiers en centimes (aucune erreur d'arrondi). Dates : texte ISO 8601.
 */

export const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function sqlType(t: FieldType): string {
  switch (t) {
    case "integer":
    case "money":
    case "boolean":
    case "reference":
      return "INTEGER";
    case "decimal":
    case "percent":
      return "REAL";
    default:
      return "TEXT";
  }
}

function column(f: FieldMap): string {
  const parts = [q(f.name), sqlType(f.type)];
  if (f.required) parts.push("NOT NULL");
  if (f.unique) parts.push("UNIQUE");
  if (f.type === "enum" && f.options?.length) parts.push(`CHECK (${q(f.name)} IN (${f.options.map((o) => lit(o.value)).join(", ")}))`);
  if (f.type === "boolean") parts.push(`CHECK (${q(f.name)} IN (0, 1))`);
  if (f.type === "date") parts.push(`CHECK (${q(f.name)} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`);
  if (f.type === "reference" && f.references) parts.push(`REFERENCES ${q(f.references)}("id") ON DELETE RESTRICT`);
  return parts.join(" ");
}

export const SYSTEM_DDL = [
  `CREATE TABLE IF NOT EXISTS "_lineage" ("id" INTEGER PRIMARY KEY, "entity" TEXT NOT NULL, "record_id" INTEGER NOT NULL, "source_system" TEXT, "source_table" TEXT NOT NULL, "source_key" TEXT NOT NULL, "source_file" TEXT, "source_file_sha256" TEXT, "source_row" TEXT NOT NULL, "source_row_hash" TEXT NOT NULL, "target_row_hash" TEXT NOT NULL, "transforms" TEXT, "run_id" TEXT NOT NULL, "migrated_at" TEXT NOT NULL, UNIQUE ("entity", "record_id"), UNIQUE ("entity", "source_key"))`,
  `CREATE TABLE IF NOT EXISTS "_files" ("id" INTEGER PRIMARY KEY, "entity" TEXT NOT NULL, "record_id" INTEGER NOT NULL, "filename" TEXT NOT NULL, "mime" TEXT, "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "storage" TEXT NOT NULL, "source_key" TEXT, "source_path" TEXT, "_migrated" INTEGER NOT NULL DEFAULT 0, "created_at" TEXT NOT NULL, "created_by" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "_files_owner" ON "_files" ("entity", "record_id")`,
  `CREATE TABLE IF NOT EXISTS "_audit" ("id" INTEGER PRIMARY KEY, "ts" TEXT NOT NULL, "user" TEXT NOT NULL, "action" TEXT NOT NULL, "entity" TEXT, "record_id" INTEGER, "before" TEXT, "after" TEXT, "justification" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "_audit_record" ON "_audit" ("entity", "record_id")`,
  `CREATE TABLE IF NOT EXISTS "_users" ("id" INTEGER PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "password_hash" TEXT NOT NULL, "role" TEXT NOT NULL CHECK ("role" IN ('admin', 'editor', 'viewer')), "created_at" TEXT NOT NULL, "disabled" INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS "_meta" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL)`,
];

export function entityDdl(e: EntityMap): string[] {
  const cols = [
    `"id" INTEGER PRIMARY KEY AUTOINCREMENT`,
    ...e.fields.map(column),
    `"_source_key" TEXT UNIQUE`,
    `"_migrated" INTEGER NOT NULL DEFAULT 0`,
    `"_run_id" TEXT`,
    `"_created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    `"_updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
  ];
  return [
    `CREATE TABLE ${q(e.name)} (\n  ${cols.join(",\n  ")}\n)`,
    ...e.fields.filter((f) => f.type === "reference").map((f) => `CREATE INDEX ${q(`${e.name}_${f.name}_idx`)} ON ${q(e.name)} (${q(f.name)})`),
  ];
}

/** Script complet de création de la base de destination (ordre des dépendances). */
export function buildDdl(m: MigrationMapping): string[] {
  return [...importOrder(m).flatMap(entityDdl), ...SYSTEM_DDL];
}
