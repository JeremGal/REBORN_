import type { RawTable, RawValue } from "./formats";
import { sourceKey } from "./transforms";
import { FLAG_NAME } from "./labels";

/**
 * Analyse de structure : types de colonnes, formats, clés, relations probables, entités.
 * Heuristiques génériques (aucune connaissance du logiciel source) ; chaque déduction porte
 * une confiance. Les correspondances définitives viennent de l'Analyste (Alan) ou d'une
 * validation humaine.
 */

export type InferredType = "empty" | "integer" | "decimal" | "money" | "boolean" | "date" | "email" | "phone" | "text";

export interface ColumnProfile {
  name: string;
  type: InferredType;
  /** Format lu : DD/MM/YYYY, YYYY-MM-DD, comma (décimale « , »), dot… */
  format?: string;
  /** Part des valeurs non vides conformes au type retenu. */
  conformity: number;
  nulls: number;
  distinct: number;
  unique: boolean;
  max_length: number;
  max_decimals?: number;
  samples: RawValue[];
  /** Valeurs non conformes au type retenu (échantillon). */
  anomalies: { count: number; samples: RawValue[] };
  /** Peu de valeurs distinctes : codes probables. */
  codes?: { value: string; count: number }[];
}

export interface RelationGuess {
  table: string;
  column: string;
  references: { table: string; column: string };
  coverage: number;
  orphans: number;
  orphan_samples: string[];
  confidence: number;
}

export interface TableProfile {
  name: string;
  source_file?: string;
  rows: number;
  columns: ColumnProfile[];
  primary_key: string | null;
  entity: string;
}

export interface SourceProfile {
  tables: TableProfile[];
  relations: RelationGuess[];
}

const isBlank = (v: RawValue) => v === null || (typeof v === "string" && v.trim() === "");

const RE = {
  integer: /^[+-]?\d+$/,
  decComma: /^[+-]?\d{1,3}(?:[ .  ]\d{3})*,\d+$|^[+-]?\d+,\d+$/,
  decDot: /^[+-]?\d{1,3}(?:[ ,]\d{3})*\.\d+$|^[+-]?\d+\.\d+$/,
  dateFr: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  dateIso: /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.]+Z?)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s.\-()]{8,20}$/,
};
const BOOL = new Set(["o", "n", "oui", "non", "y", "yes", "no", "true", "false", "vrai", "faux"]);
/** Mots génériques désignant un montant (français / anglais). */
const MONEY_HINT = /(^|_)(PRIX|MONTANT|TOTAL|PU|HT|TTC|TVA|SOLDE|CA|AMOUNT|PRICE|TOTAL|BALANCE|COST|COUT)(_|$)/i;

function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function profileColumn(name: string, values: RawValue[]): ColumnProfile {
  const present = values.filter((v) => !isBlank(v));
  const strs = present.map((v) => (typeof v === "string" ? v.trim() : String(v)));
  const counts = new Map<string, number>();
  for (const s of strs) counts.set(s, (counts.get(s) ?? 0) + 1);
  const n = strs.length;
  const base = {
    name,
    nulls: values.length - n,
    distinct: counts.size,
    unique: counts.size === n && n === values.length && n > 0,
    max_length: strs.reduce((m, s) => Math.max(m, s.length), 0),
    samples: [...counts.keys()].slice(0, 5),
  };
  if (!n) return { ...base, type: "empty", conformity: 1, anomalies: { count: 0, samples: [] } };

  const score = (pred: (s: string, raw: RawValue) => boolean) => {
    const bad: RawValue[] = [];
    let ok = 0;
    present.forEach((raw, i) => (pred(strs[i], raw) ? ok++ : bad.push(raw)));
    return { ratio: ok / n, bad };
  };
  const pick = (type: InferredType, r: { ratio: number; bad: RawValue[] }, extra: Partial<ColumnProfile> = {}): ColumnProfile => ({
    ...base,
    type,
    conformity: r.ratio,
    anomalies: { count: r.bad.length, samples: [...new Set(r.bad)].slice(0, 5) },
    ...extra,
  });
  const allNum = present.every((v) => typeof v === "number");

  const bool = score((s, raw) => typeof raw === "boolean" || BOOL.has(s.toLowerCase()));
  if (bool.ratio === 1 && counts.size <= 2) return pick("boolean", bool);
  // Indicateur 0/1 dont le nom l'annonce (paid, active, is_…) : oui/non plutôt qu'un entier
  if (FLAG_NAME.test(name)) {
    const flag = score((s) => s === "0" || s === "1");
    if (flag.ratio === 1) return pick("boolean", flag);
  }

  const int = score((s, raw) => (typeof raw === "number" ? Number.isInteger(raw) : RE.integer.test(s)));
  if (int.ratio >= 0.98) return pick("integer", int);

  const comma = score((s) => RE.decComma.test(s) || RE.integer.test(s));
  const dot = score((s, raw) => typeof raw === "number" || RE.decDot.test(s) || RE.integer.test(s));
  const dec = comma.ratio >= dot.ratio && !allNum ? { r: comma, format: "comma" } : { r: dot, format: "dot" };
  if (dec.r.ratio >= 0.98) {
    const decimals = strs.reduce((m, s) => Math.max(m, (s.split(/[.,]/)[1] ?? "").length), 0);
    const money = MONEY_HINT.test(name) && decimals <= 2;
    return pick(money ? "money" : "decimal", dec.r, { format: dec.format, max_decimals: decimals });
  }

  const fr = score((s) => {
    const m = RE.dateFr.exec(s);
    return !!m && validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  });
  const frShape = score((s) => RE.dateFr.test(s));
  if (frShape.ratio >= 0.95) return pick("date", fr, { format: "DD/MM/YYYY" });
  const iso = score((s) => {
    const m = RE.dateIso.exec(s);
    return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  });
  if (score((s) => RE.dateIso.test(s)).ratio >= 0.95) return pick("date", iso, { format: "YYYY-MM-DD" });

  const email = score((s) => RE.email.test(s));
  if (email.ratio >= 0.9) return pick("email", email);
  const phone = score((s) => RE.phone.test(s) && s.replace(/\D/g, "").length >= 8);
  if (phone.ratio >= 0.9) return pick("phone", phone);

  const text = pick("text", { ratio: 1, bad: [] });
  if (counts.size <= 12 && n >= 20 && base.max_length <= 24) {
    text.codes = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  }
  return text;
}

/** Nom d'entité proposé à partir du nom de table : préfixes techniques retirés, minuscules. */
export function entityName(table: string): string {
  let n = table
    .replace(/^(T|TB|TBL|TAB)_/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!/^[a-z]/.test(n)) n = `t_${n}`;
  if (!/[sx]$/.test(n)) n += "s";
  return n.slice(0, 60);
}

export function profileTables(tables: (RawTable & { source_file?: string })[]): SourceProfile {
  const profiles: TableProfile[] = tables.map((t) => {
    const columns = t.columns.map((c, i) => profileColumn(c, t.rows.map((r) => r[i] ?? null)));
    // Clé primaire : colonne unique et toujours renseignée, de préférence entière et nommée ID…
    const keys = columns.filter((c) => c.unique && c.nulls === 0);
    const pk =
      keys.find((c) => c.type === "integer" && /^(ID|ID_|.*_ID$)|^id$/i.test(c.name)) ??
      keys.find((c) => /^(ID|CODE|REF|NUM)/i.test(c.name)) ??
      keys.find((c) => c.name === t.columns[0]) ??
      keys[0] ??
      null;
    return { name: t.name, source_file: t.source_file, rows: t.rows.length, columns, primary_key: pk?.name ?? null, entity: entityName(t.name) };
  });

  // Relations : valeurs d'une colonne incluses dans la clé d'une autre table, et nom évocateur
  const keySets = new Map<string, Set<string>>();
  for (const t of tables) {
    const p = profiles.find((x) => x.name === t.name)!;
    if (!p.primary_key) continue;
    const idx = t.columns.indexOf(p.primary_key);
    keySets.set(t.name, new Set(t.rows.map((r) => sourceKey(r[idx])).filter((k): k is string => k !== null)));
  }
  const stem = (s: string) => s.replace(/^(ID|CODE|REF|NUM)_?/i, "").replace(/_?(ID|CODE)$/i, "").toUpperCase();
  const relations: RelationGuess[] = [];
  for (const t of tables) {
    const p = profiles.find((x) => x.name === t.name)!;
    t.columns.forEach((col, ci) => {
      if (col === p.primary_key) return;
      const prof = p.columns[ci];
      if (prof.type !== "integer" && prof.type !== "text") return;
      for (const target of profiles) {
        if (!target.primary_key || (target.name === t.name && col === p.primary_key)) continue;
        const pkStem = stem(target.primary_key);
        const tableStem = target.name.replace(/^(T|TB|TBL)_/i, "").toUpperCase();
        const nameMatch = col.toUpperCase() === target.primary_key.toUpperCase() || (pkStem.length >= 2 && col.toUpperCase().includes(target.primary_key.toUpperCase())) || (tableStem.length >= 3 && col.toUpperCase().includes(tableStem.replace(/S$/, "")));
        if (!nameMatch) continue;
        const keys = keySets.get(target.name)!;
        const vals = t.rows.map((r) => sourceKey(r[ci])).filter((k): k is string => k !== null);
        if (!vals.length) continue;
        const orphans = vals.filter((v) => !keys.has(v));
        const coverage = 1 - orphans.length / vals.length;
        if (coverage < 0.8) continue;
        relations.push({
          table: t.name,
          column: col,
          references: { table: target.name, column: target.primary_key },
          coverage,
          orphans: orphans.length,
          orphan_samples: [...new Set(orphans)].slice(0, 5),
          confidence: Math.round((col.toUpperCase() === target.primary_key.toUpperCase() ? 0.95 : 0.8) * coverage * 100) / 100,
        });
      }
    });
  }
  return { tables: profiles, relations };
}
