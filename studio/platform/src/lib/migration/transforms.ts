import { createHash } from "node:crypto";
import type { RawValue } from "./formats";

/**
 * Conversions déclarées dans les correspondances : chaque valeur migrée résulte d'une suite
 * explicite de transformations, rejouable par le moteur de vérification.
 *
 * Règles fixes (documentées dans le rapport) :
 *  - une valeur absente, vide ou composée d'espaces devient NULL ; aucune valeur n'est inventée ;
 *  - une valeur non convertible n'est jamais approchée : c'est une erreur, signalée ;
 *  - un montant est converti en centimes entiers à partir de sa représentation textuelle
 *    (aucun calcul flottant, aucun arrondi : plus de 2 décimales non nulles = erreur).
 */

export type FieldType = "text" | "integer" | "decimal" | "money" | "percent" | "date" | "boolean" | "enum" | "email" | "phone" | "reference";

export type Transform =
  | "trim"
  | "lower"
  | "upper"
  | "collapse_spaces"
  | "digits"
  | { date: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "excel" }
  | { decimal: "comma" | "dot" | "auto" }
  | { money: "comma" | "dot" | "auto" }
  | { boolean: { true: string[]; false: string[] } }
  | { map: Record<string, string> }
  | { null_if: string[] };

export type StoredValue = string | number | null;

export class TransformError extends Error {}

export interface FieldSpec {
  type: FieldType;
  transforms?: Transform[];
  options?: { value: string; label?: string }[];
}

export const transformName = (t: Transform) => (typeof t === "string" ? t : `${Object.keys(t)[0]}:${JSON.stringify(Object.values(t)[0])}`);

/* ------------------------------------------------------------------ */
/* Nombres exacts                                                       */
/* ------------------------------------------------------------------ */

function splitDecimal(input: string, mode: "comma" | "dot" | "auto"): { neg: boolean; int: string; frac: string } {
  let t = input.replace(/[\s  ']/g, "").replace(/€|EUR|\$|USD|£|GBP|CHF/gi, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-") || t.startsWith("+")) {
    neg = neg || t.startsWith("-");
    t = t.slice(1);
  } else if (t.endsWith("-")) {
    neg = true;
    t = t.slice(0, -1);
  }
  let sep: string | null = null;
  if (mode === "comma") sep = ",";
  else if (mode === "dot") sep = ".";
  else {
    const lc = t.lastIndexOf(",");
    const ld = t.lastIndexOf(".");
    sep = lc < 0 && ld < 0 ? null : lc > ld ? "," : ".";
  }
  const thousands = sep === "," ? "." : ",";
  if (sep) {
    const parts = t.split(sep);
    if (parts.length > 2) throw new TransformError(`nombre illisible « ${input} »`);
    const int = parts[0].split(thousands).join("");
    const frac = parts[1] ?? "";
    if (!/^\d+$/.test(int || "0") || !/^\d*$/.test(frac)) throw new TransformError(`nombre illisible « ${input} »`);
    return { neg, int: int || "0", frac };
  }
  if (!/^\d+$/.test(t)) throw new TransformError(`nombre illisible « ${input} »`);
  return { neg, int: t, frac: "" };
}

/** Montant → centimes entiers, sans perte (aucun arrondi). */
export function toCents(v: RawValue, mode: "comma" | "dot" | "auto" = "auto"): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new TransformError(`montant invalide « ${v} »`);
    // Représentation décimale la plus courte (1234.56 → « 1234.56 »)
    v = String(v);
    if (/e/i.test(v)) throw new TransformError(`montant hors format « ${v} »`);
    mode = "dot";
  }
  const { neg, int, frac } = splitDecimal(String(v), mode);
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) throw new TransformError(`montant à plus de 2 décimales « ${v} » : arrondi refusé`);
  const cents = Number(int) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) throw new TransformError(`montant trop grand « ${v} »`);
  return neg ? -cents : cents;
}

export function toDecimal(v: RawValue, mode: "comma" | "dot" | "auto" = "auto"): number {
  if (typeof v === "number") return v;
  const { neg, int, frac } = splitDecimal(String(v), mode);
  const n = Number(`${int}.${frac || "0"}`);
  return neg ? -n : n;
}

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number, raw: string): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1800 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new TransformError(`date inexistante « ${raw} »`);
  return `${y}-${pad(m)}-${pad(d)}`;
}

function toDate(v: RawValue, format: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "excel"): string {
  const raw = String(v).trim();
  if (format === "excel") {
    const n = typeof v === "number" ? v : Number(raw);
    if (!Number.isFinite(n) || n < 1) throw new TransformError(`numéro de série Excel invalide « ${raw} »`);
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m =
    format === "YYYY-MM-DD"
      ? /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(raw)
      : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (!m) throw new TransformError(`date au format inattendu « ${raw} » (attendu ${format})`);
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (format === "YYYY-MM-DD") return isoDate(a, b, c, raw);
  if (format === "DD/MM/YYYY") return isoDate(c, b, a, raw);
  return isoDate(c, a, b, raw);
}

/* ------------------------------------------------------------------ */
/* Conversion d'une valeur                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_TRUE = ["o", "oui", "y", "yes", "true", "vrai", "1", "x"];
const DEFAULT_FALSE = ["n", "non", "no", "false", "faux", "0", ""];

function applyOne(v: StoredValue | boolean, t: Transform): StoredValue | boolean {
  if (v === null) return null;
  if (typeof t === "string") {
    if (typeof v !== "string") return t === "digits" ? String(v).replace(/\D/g, "") : v;
    switch (t) {
      case "trim":
        return v.trim();
      case "lower":
        return v.toLowerCase();
      case "upper":
        return v.toUpperCase();
      case "collapse_spaces":
        return v.replace(/\s+/g, " ").trim();
      case "digits":
        return v.replace(/\D/g, "");
    }
  }
  if ("null_if" in t) return t.null_if.some((x) => String(v).trim().toLowerCase() === x.toLowerCase()) ? null : v;
  if ("map" in t) {
    const key = String(v).trim();
    if (!(key in t.map)) throw new TransformError(`code « ${key} » absent de la table de correspondance`);
    return t.map[key];
  }
  if ("date" in t) return toDate(v as RawValue, t.date);
  if ("money" in t) return toCents(v as RawValue, t.money);
  if ("decimal" in t) return toDecimal(v as RawValue, t.decimal);
  if ("boolean" in t) {
    const s = String(v).trim().toLowerCase();
    if (t.boolean.true.map((x) => x.toLowerCase()).includes(s)) return 1;
    if (t.boolean.false.map((x) => x.toLowerCase()).includes(s)) return 0;
    throw new TransformError(`valeur booléenne inconnue « ${v} »`);
  }
  return v;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Valeur source → valeur stockée (TransformError si non convertible). */
export function convert(raw: RawValue, spec: FieldSpec): StoredValue {
  if (isBlank(raw)) return null;
  let v: StoredValue | boolean = raw;
  for (const t of spec.transforms ?? []) {
    v = applyOne(v, t);
    if (isBlank(v)) return null;
  }
  const declared = new Set((spec.transforms ?? []).map((t) => (typeof t === "string" ? t : Object.keys(t)[0])));
  switch (spec.type) {
    case "integer": {
      if (typeof v === "number" && Number.isInteger(v)) return v;
      const s = String(v).trim();
      if (!/^[+-]?\d+$/.test(s)) throw new TransformError(`entier attendu « ${s} »`);
      const n = Number(s);
      if (!Number.isSafeInteger(n)) throw new TransformError(`entier trop grand « ${s} »`);
      return n;
    }
    case "decimal":
    case "percent":
      return typeof v === "number" ? v : toDecimal(String(v));
    case "money":
      return declared.has("money") && typeof v === "number" ? v : toCents(v as RawValue);
    case "date": {
      if (declared.has("date")) return v as string;
      return toDate(v as RawValue, "YYYY-MM-DD");
    }
    case "boolean": {
      if (declared.has("boolean")) return v as number;
      if (typeof v === "boolean") return v ? 1 : 0;
      const s = String(v).trim().toLowerCase();
      if (DEFAULT_TRUE.includes(s)) return 1;
      if (DEFAULT_FALSE.includes(s)) return 0;
      throw new TransformError(`valeur booléenne inconnue « ${v} »`);
    }
    case "enum": {
      const s = String(v);
      if (spec.options?.length && !spec.options.some((o) => o.value === s)) throw new TransformError(`valeur « ${s} » hors de la liste autorisée`);
      return s;
    }
    case "reference":
      return typeof v === "number" ? v : String(v).trim();
    default:
      return typeof v === "boolean" ? (v ? "true" : "false") : String(v);
  }
}

/* ------------------------------------------------------------------ */
/* Empreintes                                                           */
/* ------------------------------------------------------------------ */

/** JSON canonique (clés triées) : base des empreintes de ligne. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const rowHash = (row: Record<string, unknown>) => sha256(canonical(row));

/** Clé source normalisée (une clé « 42 » et 42 désignent le même enregistrement). */
export const sourceKey = (v: RawValue): string | null => (isBlank(v) ? null : typeof v === "number" ? String(v) : String(v).trim());
