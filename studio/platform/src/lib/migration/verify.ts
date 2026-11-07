import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { compile, evaluate, type Value } from "../engine/expr";
import type { ArchiveEntry, RawValue } from "./formats";
import { importOrder, type MigrationMapping } from "./mapping";
import { q } from "./model";
import { rowObject, type RunResult, type SourceTableInput } from "./run";
import { convert, rowHash, sha256, sourceKey, TransformError, type StoredValue } from "./transforms";

/**
 * Moteur de vérification : compare les données SOURCES (relues depuis les fichiers extraits)
 * et la base de DESTINATION (relue par requêtes SQL). Aucun score n'est déclaré : chaque
 * contrôle compte ce qu'il a réellement lu.
 */

export type CheckStatus = "pass" | "fail" | "warn" | "info";

export interface Check {
  id: string;
  group: "sources" | "volumes" | "enregistrements" | "relations" | "montants" | "pieces_jointes" | "regles" | "integrite" | "couverture";
  label: string;
  status: CheckStatus;
  blocking: boolean;
  summary: string;
  metrics?: Record<string, number | string>;
  details?: unknown[];
}

export interface Gap {
  kind: "rejected" | "unlinked" | "conversion" | "attachment" | "unmapped_table" | "unmapped_column" | "inaccessible" | "excluded" | "duplicate" | "historical";
  entity?: string;
  source?: string;
  message: string;
  count: number;
  examples?: unknown[];
}

export interface EntityVerification {
  entity: string;
  label?: string;
  source_table: string;
  source_rows: number;
  target_rows: number;
  rejected: number;
  exact: number;
  mismatched: number;
  totals: { field: string; accounting: boolean; source_cents: number; target_cents: number; rejected_cents: number }[];
}

export interface VerificationReport {
  run_id: string;
  verified_at: string;
  target: string;
  status: "validated" | "review" | "blocked";
  statement: string;
  checks: Check[];
  entities: EntityVerification[];
  gaps: Gap[];
  database: { sha256: string; bytes: number; integrity: string };
}

export interface SourceFileMeta {
  name: string;
  sha256: string;
  vault_path: string;
  tables: { name: string; rows: number }[];
}

export interface VerifyInput {
  mapping: MigrationMapping;
  tables: Map<string, SourceTableInput>;
  archives: Map<string, ArchiveEntry[]>;
  run: RunResult;
  dbPath: string;
  filesDir: string;
  sources: SourceFileMeta[];
  /** Manifeste publié par le logiciel source (nombre de lignes et empreinte par export). */
  manifest?: { exports: { file: string; rows?: number; sha256?: string }[] } | null;
  inaccessible?: { id: string; label?: string; url?: string; reason: string }[];
  excluded?: { key: string; label: string; comment?: string }[];
  /** Tables sources sans correspondance. */
  unmappedTables?: { name: string; rows: number }[];
  /** Après mise en service : enregistrements modifiés dans le nouveau logiciel (journal d'audit), exclus de la comparaison champ à champ. */
  modifiedAfterMigration?: Map<string, Set<number>>;
}

const LIMIT = 25;

export function verifyMigration(v: VerifyInput): VerificationReport {
  const checks: Check[] = [];
  const gaps: Gap[] = [];
  const entities: EntityVerification[] = [];
  const add = (c: Check) => checks.push({ ...c, details: c.details?.slice(0, LIMIT) });
  const db = new DatabaseSync(v.dbPath, { readOnly: true });

  try {
    /* 1. Sources : empreintes et manifeste ------------------------------- */
    const altered = v.sources.filter((s) => !fs.existsSync(s.vault_path) || sha256(fs.readFileSync(s.vault_path)) !== s.sha256);
    add({
      id: "sources.empreintes",
      group: "sources",
      label: "Fichiers extraits intacts (SHA-256)",
      status: altered.length ? "fail" : "pass",
      blocking: true,
      summary: altered.length ? `${altered.length} fichier(s) modifié(s) depuis l'extraction` : `${v.sources.length} fichier(s) relus, empreintes identiques à l'extraction`,
      details: altered.map((s) => s.name),
    });
    if (v.manifest) {
      const diffs: string[] = [];
      for (const ex of v.manifest.exports) {
        const s = v.sources.find((x) => x.name === ex.file);
        if (!s) continue;
        if (ex.sha256 && ex.sha256 !== s.sha256) diffs.push(`${ex.file} : empreinte différente de celle annoncée par la source`);
        const parsed = s.tables.reduce((n, t) => n + t.rows, 0);
        if (ex.rows !== undefined && s.tables.length && ex.rows !== parsed) diffs.push(`${ex.file} : ${parsed} ligne(s) lue(s), ${ex.rows} annoncée(s)`);
      }
      add({
        id: "sources.manifeste",
        group: "sources",
        label: "Concordance avec le manifeste du logiciel source",
        status: diffs.length ? "fail" : "pass",
        blocking: true,
        summary: diffs.length ? `${diffs.length} écart(s) avec le manifeste` : `Nombre de lignes et empreintes conformes au manifeste (${v.manifest.exports.length} export(s))`,
        details: diffs,
      });
    }

    /* 2. Enregistrement par enregistrement --------------------------------- */
    const lineageKeys = new Map<string, Map<string, number>>(); // entité → clé source → id
    for (const e of importOrder(v.mapping)) {
      const rows = db.prepare(`SELECT "source_key", "record_id" FROM "_lineage" WHERE "entity" = ?`).all(e.name) as { source_key: string; record_id: number }[];
      lineageKeys.set(e.name, new Map(rows.map((r) => [r.source_key, Number(r.record_id)])));
    }
    let blockingRecords = 0;
    for (const e of importOrder(v.mapping)) {
      const t = v.tables.get(e.source.table)!;
      const keyIdx = t.columns.indexOf(e.source.key);
      const bySource = new Map<string, Record<string, RawValue>>();
      for (const r of t.rows) {
        const k = sourceKey(r[keyIdx] ?? null);
        if (k !== null && !bySource.has(k)) bySource.set(k, rowObject(t, r));
      }
      const rejected = v.run.rejections.filter((x) => x.entity === e.name);
      const lin = db.prepare(`SELECT "record_id", "source_key", "source_row_hash", "target_row_hash" FROM "_lineage" WHERE "entity" = ?`).all(e.name) as { record_id: number; source_key: string; source_row_hash: string; target_row_hash: string }[];
      const targetCount = Number((db.prepare(`SELECT COUNT(*) AS n FROM ${q(e.name)} WHERE "_migrated" = 1`).get() as { n: number }).n);

      // Volumes : chaque ligne source est importée ou rejetée, jamais perdue
      const rejectedKeys = new Set(rejected.map((x) => x.source_key));
      const linKeys = new Set(lin.map((l) => l.source_key));
      const lost = [...bySource.keys()].filter((k) => !linKeys.has(k) && !rejectedKeys.has(k));
      const phantom = lin.filter((l) => !bySource.has(l.source_key)).map((l) => l.source_key);
      // Après mise en service : un enregistrement supprimé par un utilisateur (journal d'audit) n'est pas une perte
      const modifiedIds = v.modifiedAfterMigration?.get(e.name) ?? new Set<number>();
      const existing = new Set((db.prepare(`SELECT "id" FROM ${q(e.name)} WHERE "_migrated" = 1`).all() as { id: number }[]).map((r) => Number(r.id)));
      const deletedAfter = lin.filter((l) => !existing.has(Number(l.record_id)) && modifiedIds.has(Number(l.record_id))).length;
      const balanced = t.rows.length === targetCount + deletedAfter + rejected.length && lost.length === 0 && phantom.length === 0 && lin.length === targetCount + deletedAfter;
      add({
        id: `volumes.${e.name}`,
        group: "volumes",
        label: `${e.label ?? e.name} : lignes sources = importées + rejetées`,
        status: balanced ? "pass" : "fail",
        blocking: true,
        summary: `${t.rows.length} lue(s) dans ${e.source.table} · ${targetCount} en base · ${rejected.length} rejetée(s)${deletedAfter ? ` · ${deletedAfter} supprimée(s) depuis la mise en service (journal)` : ""}${lost.length ? ` · ${lost.length} perdue(s)` : ""}${phantom.length ? ` · ${phantom.length} sans origine` : ""}`,
        metrics: { source: t.rows.length, target: targetCount, rejected: rejected.length, deleted_after_migration: deletedAfter, lost: lost.length, phantom: phantom.length },
        details: [...lost.map((k) => `clé ${k} : ni importée ni rejetée`), ...phantom.map((k) => `clé ${k} : absente de la source`)],
      });

      // Exactitude : valeurs relues en base = valeurs recalculées depuis la ligne source
      const select = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "id" = ?`);
      const modified = v.modifiedAfterMigration?.get(e.name) ?? new Set<number>();
      let exact = 0;
      let skipped = 0;
      const mismatches: string[] = [];
      const totals = new Map<string, { source: number; target: number }>();
      for (const f of e.fields) if (f.type === "money") totals.set(f.name, { source: 0, target: 0 });
      for (const l of lin) {
        const src = bySource.get(l.source_key);
        const row = select.get(l.record_id) as Record<string, StoredValue> | undefined;
        if (!src) continue;
        if (!row) {
          if (modified.has(Number(l.record_id))) skipped++;
          else if (mismatches.length < LIMIT) mismatches.push(`${l.source_key} → #${l.record_id} : enregistrement absent de la destination`);
          continue;
        }
        for (const f of e.fields) {
          if (f.type !== "money" || modified.has(Number(l.record_id))) continue;
          const tot = totals.get(f.name)!;
          tot.target += Number(row[f.name] ?? 0);
          try {
            tot.source += Number(convert(src[f.source] ?? null, f) ?? 0);
          } catch {}
        }
        if (modified.has(Number(l.record_id))) {
          skipped++;
          continue;
        }
        const expected: Record<string, StoredValue> = {};
        for (const f of e.fields) {
          const raw = src[f.source] ?? null;
          if (f.type === "reference") {
            let k: StoredValue = null;
            try {
              k = convert(raw, { type: "reference", transforms: f.transforms });
            } catch {}
            expected[f.name] = k === null ? null : (lineageKeys.get(f.references!)?.get(String(k)) ?? null);
            continue;
          }
          try {
            expected[f.name] = convert(raw, f);
          } catch (x) {
            if (!(x instanceof TransformError)) throw x;
            expected[f.name] = null;
          }
        }
        const actual = Object.fromEntries(e.fields.map((f) => [f.name, row[f.name] ?? null]));
        const diff = e.fields.filter((f) => !same(expected[f.name], actual[f.name]));
        const hashOk = rowHash(actual) === l.target_row_hash && rowHash(src) === l.source_row_hash;
        if (!diff.length && hashOk) exact++;
        else if (mismatches.length < LIMIT) mismatches.push(diff.length ? `${l.source_key} → #${l.record_id} : ${diff.map((f) => `${f.name} attendu ${JSON.stringify(expected[f.name])}, lu ${JSON.stringify(actual[f.name])}`).join(" ; ")}` : `${l.source_key} → #${l.record_id} : empreinte de ligne différente`);
      }
      const mismatched = lin.length - exact - skipped;
      blockingRecords += mismatched;
      add({
        id: `enregistrements.${e.name}`,
        group: "enregistrements",
        label: `${e.label ?? e.name} : enregistrements retrouvés à l'identique`,
        status: mismatched ? "fail" : "pass",
        blocking: true,
        summary: `${exact}/${lin.length - skipped} identique(s) champ par champ (${e.fields.length} champ(s), relations comprises)${skipped ? ` · ${skipped} modifié(s) depuis la mise en service, exclus` : ""}`,
        metrics: { compared: lin.length - skipped, exact, mismatched, modified_after_migration: skipped },
        details: mismatches,
      });

      // Montants : sommes exactes en centimes, côté source et côté destination
      const totalRows: EntityVerification["totals"] = [];
      for (const f of e.fields.filter((x) => x.type === "money")) {
        const tot = totals.get(f.name)!;
        let rejectedCents = 0;
        for (const r of rejected) {
          try {
            rejectedCents += Number(convert(r.raw[f.source] ?? null, f) ?? 0);
          } catch {}
        }
        const excludedIds = [...modified];
        const dbSum = Number(
          (db.prepare(`SELECT COALESCE(SUM(${q(f.name)}), 0) AS s FROM ${q(e.name)} WHERE "_migrated" = 1${excludedIds.length ? ` AND "id" NOT IN (${excludedIds.map(() => "?").join(",")})` : ""}`).get(...excludedIds) as { s: number }).s,
        );
        const ok = tot.source === tot.target && dbSum === tot.target;
        const accounting = !!f.accounting;
        totalRows.push({ field: f.name, accounting, source_cents: tot.source, target_cents: dbSum, rejected_cents: rejectedCents });
        add({
          id: `montants.${e.name}.${f.name}`,
          group: "montants",
          label: `${e.label ?? e.name} · ${f.label ?? f.name} : total source = total migré${accounting ? " (donnée comptable)" : ""}`,
          status: !ok || (accounting && rejectedCents !== 0) ? "fail" : rejectedCents ? "warn" : "pass",
          blocking: !ok || accounting,
          summary: `source ${euros(tot.source)} · destination ${euros(dbSum)}${rejectedCents ? ` · ${euros(rejectedCents)} dans des lignes rejetées` : ""}`,
          metrics: { source_cents: tot.source, target_cents: dbSum, rejected_cents: rejectedCents },
        });
      }
      entities.push({ entity: e.name, label: e.label, source_table: e.source.table, source_rows: t.rows.length, target_rows: targetCount, rejected: rejected.length, exact, mismatched, totals: totalRows });

      if (rejected.length) {
        const reasons = new Map<string, number>();
        for (const r of rejected) for (const why of r.reasons) reasons.set(why.replace(/\d+/g, "#"), (reasons.get(why.replace(/\d+/g, "#")) ?? 0) + 1);
        gaps.push({
          kind: "rejected",
          entity: e.name,
          source: e.source.table,
          count: rejected.length,
          message: `${rejected.length} ligne(s) de ${e.source.table} non migrée(s)`,
          examples: rejected.slice(0, 10).map((r) => ({ source_key: r.source_key, ligne: r.row, motifs: r.reasons })),
        });
      }
    }

    /* 3. Relations et intégrité référentielle ------------------------------- */
    const fk = db.prepare("PRAGMA foreign_key_check").all() as Record<string, unknown>[];
    const unlinked = v.run.field_issues.filter((i) => i.kind === "unlinked");
    add({
      id: "relations.integrite",
      group: "relations",
      label: "Intégrité référentielle (clés étrangères)",
      status: fk.length ? "fail" : "pass",
      blocking: true,
      summary: fk.length ? `${fk.length} référence(s) cassée(s) dans la destination` : "Aucune référence cassée dans la destination",
      details: fk,
    });
    add({
      id: "relations.rattachements",
      group: "relations",
      label: "Relations de la source reproduites",
      status: blockingRecords ? "fail" : unlinked.length ? "warn" : "pass",
      blocking: false,
      summary: unlinked.length ? `${unlinked.length} rattachement(s) impossible(s) (référence absente de la source), conservé(s) sans lien et signalé(s)` : "Chaque relation lue dans la source pointe vers le bon enregistrement migré",
      details: unlinked.map((u) => `${u.entity} ${u.source_key} · ${u.field} : ${u.message}`),
    });
    for (const [entity, list] of group(unlinked, (u) => `${u.entity}.${u.field}`)) {
      gaps.push({ kind: "unlinked", entity: entity.split(".")[0], count: list.length, message: `${list.length} enregistrement(s) migré(s) sans lien « ${entity.split(".")[1]} » (référence introuvable dans la source)`, examples: list.slice(0, 10).map((u) => ({ source_key: u.source_key, valeur_source: u.raw })) });
    }
    const conversions = v.run.field_issues.filter((i) => i.kind === "conversion");
    for (const [key, list] of group(conversions, (u) => `${u.entity}.${u.field}`)) {
      gaps.push({ kind: "conversion", entity: key.split(".")[0], count: list.length, message: `${list.length} valeur(s) « ${key.split(".")[1]} » non convertible(s), laissée(s) vide(s) — valeur d'origine conservée dans la traçabilité`, examples: list.slice(0, 10).map((u) => ({ source_key: u.source_key, valeur_source: u.raw, motif: u.message })) });
    }

    /* 4. Règles métier sur les données migrées (jamais de recalcul) ---------- */
    for (const e of v.mapping.entities) {
      if (!e.checks?.length && !e.aggregates?.some((a) => a.verify !== false)) continue;
      const rows = db.prepare(`SELECT * FROM ${q(e.name)} WHERE "_migrated" = 1`).all() as Record<string, StoredValue>[];
      for (const c of e.checks ?? []) {
        const ast = compile(c.expr);
        const bad: string[] = [];
        let evaluated = 0;
        for (const r of rows) {
          const scope = Object.fromEntries(ast.vars.map((k) => [k, (r[k] ?? null) as Value]));
          if (ast.vars.some((k) => scope[k] === null)) continue;
          evaluated++;
          let ok = false;
          try {
            ok = !!evaluate(c.expr, scope);
          } catch {}
          if (!ok) bad.push(`#${r.id} (${r._source_key})`);
        }
        add(ruleCheck(`regles.${e.name}.${c.id}`, `${e.label ?? e.name} · ${c.description ?? c.expr}`, c.severity, bad, evaluated));
        if (bad.length) gaps.push({ kind: "historical", entity: e.name, count: bad.length, message: `${bad.length} enregistrement(s) ne vérifient pas « ${c.description ?? c.expr} » : valeurs historiques conservées telles quelles`, examples: bad.slice(0, 10) });
      }
      for (const a of (e.aggregates ?? []).filter((x) => x.verify !== false)) {
        const child = v.mapping.entities.find((x) => x.name === a.children)!;
        const ast = compile(a.expr);
        const sums = new Map<number, number>();
        for (const r of db.prepare(`SELECT * FROM ${q(child.name)} WHERE "_migrated" = 1`).all() as Record<string, StoredValue>[]) {
          const parent = r[a.via];
          if (parent === null) continue;
          let val = 0;
          try {
            val = Number(evaluate(a.expr, Object.fromEntries(ast.vars.map((k) => [k, (r[k] ?? null) as Value]))));
          } catch {}
          sums.set(Number(parent), (sums.get(Number(parent)) ?? 0) + val);
        }
        const bad: string[] = [];
        for (const r of rows) {
          const expected = Math.round(sums.get(Number(r.id)) ?? 0);
          if (r[a.field] === null) continue;
          if (Number(r[a.field]) !== expected) bad.push(`#${r.id} (${r._source_key}) : ${euros(Number(r[a.field]))} enregistré, ${euros(expected)} selon les lignes`);
        }
        add(ruleCheck(`regles.${e.name}.${a.id}`, `${e.label ?? e.name} · ${a.description ?? `${a.field} = somme(${a.children}.${a.expr})`}`, a.severity, bad, rows.length));
        if (bad.length) gaps.push({ kind: "historical", entity: e.name, count: bad.length, message: `${bad.length} écart(s) historique(s) : ${a.description ?? a.field} — montants d'origine conservés, non recalculés`, examples: bad.slice(0, 10) });
      }
    }

    /* 5. Pièces jointes ---------------------------------------------------- */
    if (v.mapping.attachments?.length) {
      const stored = db.prepare(`SELECT "id", "sha256", "storage", "size", "source_path" FROM "_files" WHERE "_migrated" = 1`).all() as { id: number; sha256: string; storage: string; size: number; source_path: string }[];
      const archive = new Map<string, Buffer>();
      for (const a of v.mapping.attachments) for (const x of v.archives.get(a.archive) ?? []) archive.set(x.path, x.data);
      const corrupt: string[] = [];
      for (const f of stored) {
        const p = path.join(v.filesDir, f.storage);
        const data = fs.existsSync(p) ? fs.readFileSync(p) : null;
        const src = archive.get(f.source_path);
        if (!data || sha256(data) !== f.sha256 || data.length !== f.size || !src || sha256(src) !== f.sha256) corrupt.push(`${f.source_path} (#${f.id})`);
      }
      const missing = v.run.attachments.missing;
      add({
        id: "pieces_jointes.empreintes",
        group: "pieces_jointes",
        label: "Pièces jointes copiées à l'identique (SHA-256)",
        status: corrupt.length ? "fail" : "pass",
        blocking: true,
        summary: `${stored.length - corrupt.length}/${stored.length} fichier(s) identiques à l'archive source`,
        details: corrupt,
      });
      add({
        id: "pieces_jointes.couverture",
        group: "pieces_jointes",
        label: "Pièces jointes référencées et récupérées",
        status: missing.length ? "warn" : "pass",
        blocking: false,
        summary: `${stored.length}/${v.run.attachments.expected} récupérée(s)${missing.length ? ` · ${missing.length} non récupérable(s)` : ""}`,
        details: missing.map((m) => `${m.filename ?? m.path} : ${m.reason}`),
      });
      if (missing.length) gaps.push({ kind: "attachment", count: missing.length, message: `${missing.length} pièce(s) jointe(s) référencée(s) mais non récupérée(s)`, examples: missing.slice(0, 10) });
    }

    /* 6. Doublons potentiels ------------------------------------------------ */
    if (v.run.duplicates.length) {
      add({
        id: "enregistrements.doublons",
        group: "enregistrements",
        label: "Doublons potentiels",
        status: "warn",
        blocking: false,
        summary: `${v.run.duplicates.length} groupe(s) de doublons potentiels, migrés séparément (aucune fusion automatique)`,
        details: v.run.duplicates.map((d) => `${d.entity} · ${d.rule} = « ${d.value} » : ${d.records.map((r) => r.source_key).join(", ")}`),
      });
      gaps.push({ kind: "duplicate", count: v.run.duplicates.length, message: `${v.run.duplicates.length} groupe(s) de doublons potentiels à arbitrer`, examples: v.run.duplicates.slice(0, 10) });
    }

    /* 7. Couverture : ce qui n'est pas migré ------------------------------- */
    const unmappedCols: string[] = [];
    for (const e of v.mapping.entities) {
      const t = v.tables.get(e.source.table)!;
      const used = new Set([e.source.key, ...e.fields.map((f) => f.source)]);
      const rest = t.columns.filter((c) => !used.has(c));
      if (rest.length) unmappedCols.push(`${e.source.table} : ${rest.join(", ")}`);
    }
    for (const u of v.unmappedTables ?? []) gaps.push({ kind: "unmapped_table", source: u.name, count: u.rows, message: `Table ${u.name} (${u.rows} ligne(s)) sans correspondance : non migrée` });
    for (const c of unmappedCols) gaps.push({ kind: "unmapped_column", count: 1, message: `Colonnes non reprises — ${c} (valeurs conservées dans la traçabilité de chaque enregistrement)` });
    for (const i of v.inaccessible ?? []) gaps.push({ kind: "inaccessible", source: i.label ?? i.id, count: 1, message: `${i.label ?? i.id} : non extrait — ${i.reason}` });
    for (const x of v.excluded ?? []) gaps.push({ kind: "excluded", count: 1, message: `Exclu par décision : ${x.label}${x.comment ? ` — ${x.comment}` : ""}` });
    add({
      id: "couverture.perimetre",
      group: "couverture",
      label: "Périmètre : données non extraites ou non reprises",
      status: (v.unmappedTables?.length ?? 0) + (v.inaccessible?.length ?? 0) + (v.excluded?.length ?? 0) ? "warn" : "pass",
      blocking: false,
      summary: `${v.inaccessible?.length ?? 0} mécanisme(s) d'extraction refusé(s) · ${v.unmappedTables?.length ?? 0} table(s) sans correspondance · ${v.excluded?.length ?? 0} élément(s) exclu(s) · ${unmappedCols.length} table(s) avec colonnes non reprises`,
      details: [...(v.inaccessible ?? []).map((i) => `${i.label ?? i.id} : ${i.reason}`), ...(v.unmappedTables ?? []).map((u) => `${u.name} : ${u.rows} ligne(s)`), ...unmappedCols],
    });

    /* 8. Base de destination ------------------------------------------------ */
    const integrity = String((db.prepare("PRAGMA integrity_check").get() as Record<string, unknown>)?.integrity_check ?? "?");
    add({ id: "integrite.base", group: "integrite", label: "Intégrité physique de la base (PRAGMA integrity_check)", status: integrity === "ok" ? "pass" : "fail", blocking: true, summary: integrity === "ok" ? "Base de destination intègre" : integrity });
  } finally {
    db.close();
  }

  const bytes = fs.readFileSync(v.dbPath);
  const blocked = checks.some((c) => c.blocking && c.status === "fail");
  const review = !blocked && (checks.some((c) => c.status === "fail" || c.status === "warn") || gaps.length > 0);
  return {
    run_id: v.run.run_id,
    verified_at: new Date().toISOString(),
    target: path.basename(v.dbPath),
    status: blocked ? "blocked" : review ? "review" : "validated",
    statement:
      "Contrôles calculés sur les données réellement relues : fichiers extraits du logiciel source (réanalysés) et base de destination (requêtes SQL). " +
      "Ils établissent la correspondance des volumes, des enregistrements, des relations, des montants et des fichiers listés ci-dessous ; " +
      "ils ne prouvent pas l'absence de données que le logiciel source n'a pas exportées.",
    checks,
    entities,
    gaps,
    database: { sha256: sha256(bytes), bytes: bytes.length, integrity: checks.find((c) => c.id === "integrite.base")?.summary ?? "" },
  };
}

function ruleCheck(id: string, label: string, severity: "info" | "warning" | "blocking", bad: string[], evaluated: number): Check {
  return {
    id,
    group: "regles",
    label,
    status: bad.length ? (severity === "blocking" ? "fail" : severity === "warning" ? "warn" : "info") : "pass",
    blocking: severity === "blocking",
    summary: bad.length ? `${bad.length}/${evaluated} enregistrement(s) en écart — valeurs historiques conservées, non recalculées` : `${evaluated} enregistrement(s) conformes`,
    details: bad,
  };
}

function same(a: StoredValue, b: StoredValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
}

function group<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

export const euros = (cents: number) => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
