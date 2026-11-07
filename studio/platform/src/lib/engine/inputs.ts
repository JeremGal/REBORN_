import { looseEqual } from "./expr";
import type { ComputeError, FieldType, InputField, Inputs, Primitive } from "../types";

/**
 * Préparation des entrées : normalisation, typage d'après le schéma,
 * valeurs par défaut et contraintes de validation.
 * Indépendant de tout domaine métier.
 */

const TYPE_ALIASES: Record<string, FieldType> = {
  number: "number",
  integer: "number",
  int: "number",
  float: "number",
  decimal: "number",
  enum: "enum",
  select: "enum",
  dropdown: "enum",
  radio: "enum",
  text: "text",
  string: "text",
  textarea: "text",
  boolean: "boolean",
  bool: "boolean",
  checkbox: "boolean",
};

/** Type reconstruit, ou null si le type n'est pas pris en charge par le générateur. */
export function fieldType(f: Pick<InputField, "type">): FieldType | null {
  return TYPE_ALIASES[String(f.type).toLowerCase()] ?? null;
}

export function isInteger(f: InputField): boolean {
  return !!f.integer || String(f.type).toLowerCase() === "integer" || String(f.type).toLowerCase() === "int";
}

/** "10" → 10, "10,5" → 10.5, "1 000" → 1000. Le reste est laissé tel quel. */
export function normalizeInputs(raw: Record<string, unknown>): Inputs {
  const out: Inputs = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const s = v.trim();
      const asNum = s.replace(/[\s  ]/g, "").replace(",", ".");
      out[k] = s !== "" && /^-?\d+(\.\d+)?$/.test(asNum) ? Number(asNum) : s;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

const TRUE = new Set(["true", "1", "on", "oui", "yes", "vrai", "x"]);
const FALSE = new Set(["false", "0", "off", "non", "no", "faux", ""]);

function toBool(v: Primitive): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  const s = v.trim().toLowerCase();
  return TRUE.has(s) ? true : FALSE.has(s) ? false : null;
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export function prepareInputs(raw: Record<string, unknown>, fields: InputField[] | null | undefined): { values: Inputs; errors: ComputeError[] } {
  const values = normalizeInputs(raw);
  const errors: ComputeError[] = [];
  if (!fields?.length) return { values, errors };

  for (const f of fields) {
    const type = fieldType(f);
    const label = f.label ?? f.name;
    let v: Primitive | undefined = values[f.name];
    const fail = (message: string) => errors.push({ field: f.name, message: `${label} : ${message}` });

    if (type === "boolean") {
      // Une case non cochée est une valeur (false), pas une absence
      if (isEmpty(v)) v = f.default !== undefined ? f.default : false;
      const b = toBool(v as Primitive);
      if (b === null) fail("oui/non attendu");
      else values[f.name] = b;
      continue;
    }

    if (isEmpty(v)) {
      if (f.default !== undefined && f.default !== "") {
        values[f.name] = f.default;
        v = f.default;
      } else {
        delete values[f.name];
        if (f.required) fail("champ requis");
        continue;
      }
    }
    if (type === null) continue; // type non pris en charge : transmis tel quel

    if (type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (typeof v === "boolean" || !Number.isFinite(n)) {
        fail("nombre attendu");
        continue;
      }
      if (isInteger(f) && !Number.isInteger(n)) fail("nombre entier attendu");
      else if (f.min !== undefined && n < f.min) fail(`minimum ${f.min}`);
      else if (f.max !== undefined && n > f.max) fail(`maximum ${f.max}`);
      values[f.name] = n;
    } else if (type === "enum") {
      if (!f.options?.length) {
        values[f.name] = String(v);
        continue;
      }
      const opt = f.options.find((o) => looseEqual(o.value, v) || String(o.value).toLowerCase() === String(v).trim().toLowerCase());
      if (!opt) fail(`valeur « ${v} » non autorisée (${f.options.map((o) => o.value).join(", ")})`);
      else values[f.name] = opt.value;
    } else if (type === "text") {
      const s = String(v);
      if (f.max_length !== undefined && s.length > f.max_length) fail(`${f.max_length} caractères maximum`);
      else if (f.pattern && !safeTest(f.pattern, s)) fail("format invalide");
      values[f.name] = s;
    }
  }
  return { values, errors };
}

function safeTest(pattern: string, value: string): boolean {
  if (pattern.length > 200 || value.length > 1000) return false;
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true; // motif invalide : signalé à la validation du schéma, pas bloquant ici
  }
}
