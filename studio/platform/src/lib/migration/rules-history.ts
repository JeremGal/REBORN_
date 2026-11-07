import { DatabaseSync } from "node:sqlite";
import { evaluateBinding, type RecordAccess, type RuleBinding, type RulePackage } from "../engine/bindings";
import type { MigrationMapping } from "./mapping";
import { q } from "./model";

/**
 * Vérification d'un modèle métier sur l'historique migré (lecture seule).
 *
 * Pour chaque document historique lié au modèle, le moteur recalcule ses lignes puis ses totaux à
 * partir des données migrées, et compare aux montants ENREGISTRÉS dans l'ancien logiciel. Rien
 * n'est écrit : l'historique garde ses montants d'origine. Le résultat mesure à quel point le
 * modèle reproduit le comportement réel de l'ancien logiciel — ce n'est pas une garantie.
 */

export interface HistoryCheck {
  version: number;
  run_id: string;
  at: string;
  bindings: {
    id: string;
    entity: string;
    scope: "line" | "document";
    checked: number;
    identical: number;
    /** Écarts d'arrondi seulement (au plus ROUNDING_CENTS centimes sur chaque montant comparé). */
    rounding: number;
    different: number;
    not_computable: number;
    compared_fields: string[];
    samples: { record: string; field: string; stored: number | string | null; computed: number | string | null; reason?: string }[];
  }[];
  statement: string;
}

type Row = Record<string, unknown> & { id: number };

/** Tolérance d'arrondi : écart cumulé possible sur HT, TVA puis TTC (1 centime à chaque étape). */
export const ROUNDING_CENTS = 2;
const gapKind = (pairs: { stored: unknown; computed: unknown }[]): "rounding" | "different" =>
  pairs.every((x) => typeof x.stored === "number" && typeof x.computed === "number" && Math.abs(x.stored - x.computed) <= ROUNDING_CENTS) ? "rounding" : "different";

export function checkRulesOnHistory(pkg: RulePackage, mapping: MigrationMapping, dbPath: string, runId: string): HistoryCheck {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const ents = new Map(mapping.entities.map((e) => [e.name, e]));
    const derivedOf = (entity: string) => pkg.bindings.filter((b) => b.entity === entity).flatMap((b) => b.fields ?? []);
    const typeOf = (entity: string, field: string): string | null => ents.get(entity)?.fields.find((f) => f.name === field)?.type ?? derivedOf(entity).find((f) => f.name === field)?.type ?? null;
    const stored = (entity: string, field: string) => !!ents.get(entity)?.fields.some((f) => f.name === field);
    const byId = (entity: string, id: unknown): Row | null => (id === null || id === undefined ? null : ((db.prepare(`SELECT * FROM ${q(entity)} WHERE "id" = ?`).get(id as number) as Row | undefined) ?? null));

    const access = (entity: string, row: Row, computedLines?: { entity: string; via: string; values: Map<number, Record<string, unknown>> }): RecordAccess => ({
      get(pth) {
        let ent = entity;
        let cur: Row | null = row;
        const parts = pth.split(".");
        for (let i = 0; i < parts.length; i++) {
          if (!cur) return { value: undefined, type: null };
          const t = typeOf(ent, parts[i]);
          if (i === parts.length - 1) return { value: cur[parts[i]], type: t };
          const ref = ents.get(ent)?.fields.find((f) => f.name === parts[i])?.references;
          if (!ref) return { value: undefined, type: null };
          cur = byId(ref, cur[parts[i]]);
          ent = ref;
        }
        return { value: undefined, type: null };
      },
      sum(lineEntity, via, field) {
        const type = typeOf(lineEntity, field);
        if (computedLines && computedLines.entity === lineEntity && !stored(lineEntity, field)) {
          let s = 0;
          for (const v of computedLines.values.values()) s += Number(v[field] ?? 0);
          return { value: s, type };
        }
        if (!stored(lineEntity, field)) return { value: 0, type };
        const r = db.prepare(`SELECT COALESCE(SUM(${q(field)}), 0) AS v FROM ${q(lineEntity)} WHERE ${q(via)} = ?`).get(row.id) as { v: number };
        return { value: r.v, type };
      },
    });

    const out: HistoryCheck["bindings"] = [];
    const docBindings = pkg.bindings.filter((b) => b.scope === "document");
    const lineBindings = pkg.bindings.filter((b) => b.scope === "line");
    const report = (b: RuleBinding) => {
      const compared = Object.values(b.outputs).filter((f) => stored(b.entity, f));
      const r = { id: b.id, entity: b.entity, scope: b.scope, checked: 0, identical: 0, rounding: 0, different: 0, not_computable: 0, compared_fields: compared, samples: [] as HistoryCheck["bindings"][number]["samples"] };
      out.push(r);
      return r;
    };

    for (const b of docBindings) {
      if (!ents.has(b.entity)) continue;
      const r = report(b);
      const lb = lineBindings.find((x) => x.document?.entity === b.entity);
      const docs = db.prepare(`SELECT * FROM ${q(b.entity)} WHERE "_migrated" = 1 ORDER BY "id"`).all() as Row[];
      for (const doc of docs) {
        r.checked++;
        let lines: { entity: string; via: string; values: Map<number, Record<string, unknown>> } | undefined;
        let failed: string | null = null;
        if (lb && b.lines) {
          lines = { entity: lb.entity, via: b.lines.via, values: new Map() };
          for (const line of db.prepare(`SELECT * FROM ${q(lb.entity)} WHERE ${q(lb.document!.via)} = ?`).all(doc.id) as Row[]) {
            const lr = evaluateBinding(pkg, lb, access(lb.entity, line), (f) => typeOf(lb.entity, f));
            if (lr.status !== "ok") {
              failed = `ligne #${line.id} : ${lr.message}`;
              break;
            }
            lines.values.set(line.id, lr.values);
          }
        }
        const label = String(doc[ents.get(b.entity)?.title_field ?? "id"] ?? `#${doc.id}`);
        if (failed) {
          r.not_computable++;
          if (r.samples.length < 10) r.samples.push({ record: label, field: "-", stored: null, computed: null, reason: failed });
          continue;
        }
        const dr = evaluateBinding(pkg, b, access(b.entity, doc, lines), (f) => typeOf(b.entity, f));
        if (dr.status !== "ok") {
          r.not_computable++;
          if (r.samples.length < 10) r.samples.push({ record: label, field: "-", stored: null, computed: null, reason: dr.message });
          continue;
        }
        const diffs = r.compared_fields.filter((f) => dr.values[f] !== doc[f]);
        if (diffs.length) {
          const kind = gapKind(diffs.map((f) => ({ stored: doc[f], computed: dr.values[f] })));
          r[kind]++;
          for (const f of diffs) if (r.samples.length < 10) r.samples.push({ record: label, field: f, stored: (doc[f] as number | string | null) ?? null, computed: (dr.values[f] as number | string | null) ?? null, reason: kind === "rounding" ? "écart d'arrondi" : "écart" });
        } else r.identical++;
      }
    }
    // Lignes dont une sortie correspond à une valeur enregistrée dans l'ancien logiciel
    for (const b of lineBindings) {
      if (!ents.has(b.entity)) continue;
      const compared = Object.values(b.outputs).filter((f) => stored(b.entity, f));
      const inputs = new Set(Object.values(b.inputs).flatMap((s) => (typeof s === "string" ? [s] : Array.isArray(s) ? s : [])));
      // Une sortie qui est aussi une entrée (ex. prix déjà fixé sur la ligne) ne prouve rien : non comparée
      const meaningful = compared.filter((f) => !inputs.has(f));
      if (!meaningful.length) continue;
      const r = report(b);
      r.compared_fields = meaningful;
      for (const line of db.prepare(`SELECT * FROM ${q(b.entity)} WHERE "_migrated" = 1 ORDER BY "id"`).all() as Row[]) {
        r.checked++;
        const lr = evaluateBinding(pkg, b, access(b.entity, line), (f) => typeOf(b.entity, f));
        if (lr.status !== "ok") {
          r.not_computable++;
          continue;
        }
        const diffs = meaningful.filter((f) => lr.values[f] !== line[f]);
        if (diffs.length) {
          const kind = gapKind(diffs.map((f) => ({ stored: line[f], computed: lr.values[f] })));
          r[kind]++;
          for (const f of diffs) if (r.samples.length < 10) r.samples.push({ record: `#${line.id}`, field: f, stored: (line[f] as number | null) ?? null, computed: (lr.values[f] as number | null) ?? null, reason: kind === "rounding" ? "écart d'arrondi" : "écart" });
        } else r.identical++;
      }
    }
    const sum = (k: "checked" | "identical" | "rounding" | "different" | "not_computable") => out.reduce((n, x) => n + x[k], 0);
    const checked = sum("checked");
    const statement = checked
      ? `Modèle métier v${pkg.version} rejoué sur ${checked} enregistrement(s) historique(s) : ${sum("identical")} identique(s) au centime aux montants enregistrés dans l'ancien logiciel, ${sum("rounding")} avec un écart d'arrondi (≤ ${ROUNDING_CENTS} centimes), ${sum("different")} différent(s), ${sum("not_computable")} non calculable(s). Les montants historiques ne sont pas modifiés. Cette mesure porte sur les données migrées ; elle ne garantit pas le comportement dans des cas absents de l'historique.`
      : `Aucun document historique lié au modèle métier v${pkg.version} : rien à comparer.`;
    return { version: pkg.version, run_id: runId, at: new Date().toISOString(), bindings: out, statement };
  } finally {
    db.close();
  }
}
