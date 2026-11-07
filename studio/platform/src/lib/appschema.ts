import { normalizeInputs, fieldType } from "./engine/inputs";
import { BUILTIN_VARS, KNOWN_ACTION_KEYS, splitConditionKey } from "./engine/engine";
import { compile, referencedVars } from "./engine/expr";
import type {
  AppSchema,
  AppSection,
  Condition,
  FieldType,
  InputField,
  Issue,
  Observation,
  OutputField,
  Primitive,
  ResultTable,
  Rule,
  RuleModel,
  StoredRuleModel,
  StoredSchema,
  UnsupportedFeature,
} from "./types";

/**
 * Générateur d'application — partie « description » (sans React).
 * Construit la description complète de l'application reconstruite à partir :
 *   1. du schéma d'interface (écran découvert par l'Explorer ou description fournie) ;
 *   2. des entrées décrites dans le modèle de règles (prioritaires, champ par champ) ;
 *   3. à défaut, d'une inférence depuis les observations et les conditions des règles.
 */

export interface ResolvedField extends InputField {
  kind: FieldType | null;
  supported: boolean;
  origin: "schema" | "model" | "schema+model" | "inferred";
}

export interface ResolvedApp {
  title: string;
  description?: string;
  application?: string;
  module?: string;
  fields: ResolvedField[];
  sections: AppSection[];
  outputs: OutputField[];
  tables: ResultTable[];
  unsupported: UnsupportedFeature[];
  issues: Issue[];
  schema_version: number | null;
  model_version: number | null;
  currency: string;
  stats: { fields_total: number; fields_supported: number; rules_total: number; rules_executable: number; outputs: number; tables: number };
}

const RESERVED = new Set(BUILTIN_VARS);

export function resolveApp(model: StoredRuleModel | RuleModel | null | undefined, schema: StoredSchema | AppSchema | null | undefined, observations: Observation[] = []): ResolvedApp {
  const issues: Issue[] = [];

  // 1 + 2 : fusion schéma / modèle
  const byName = new Map<string, ResolvedField>();
  for (const f of schema?.fields ?? []) byName.set(f.name, decorate(f, "schema"));
  for (const f of model?.inputs ?? []) {
    const prev = byName.get(f.name);
    const merged = prev ? { ...prev, ...stripUndefined(f) } : f;
    byName.set(f.name, decorate(merged, prev ? "schema+model" : "model"));
  }
  let fields = [...byName.values()];

  // 3 : inférence
  if (!fields.length) fields = inferFields(model, observations).map((f) => decorate(f, "inferred"));

  for (const f of fields) {
    if (RESERVED.has(f.name)) issues.push({ level: "warning", field: f.name, message: `Le champ « ${f.name} » porte le nom d'une variable du moteur` });
  }

  // Sorties
  let outputs: OutputField[] = model?.outputs?.length ? model.outputs : schema?.outputs?.length ? schema.outputs : [];
  if (!outputs.length) outputs = [{ name: model?.settings?.output_field ?? "total_price", label: "Total", format: "currency", primary: true }];
  if (!outputs.some((o) => o.primary)) outputs = outputs.map((o, i) => ({ ...o, primary: i === 0 }));

  // Fonctionnalités non reconstruites
  const unsupported: UnsupportedFeature[] = [...(schema?.unsupported ?? [])];
  for (const f of fields.filter((x) => !x.supported)) {
    unsupported.push({ name: f.name, label: f.label ?? f.name, reason: `Type de champ « ${f.type} » non pris en charge par le générateur` });
  }
  let executable = 0;
  const fieldNames = new Set(fields.map((f) => f.name));
  for (const r of model?.rules ?? []) {
    const keys = Object.keys(r.action ?? {});
    const unknown = keys.filter((k) => !KNOWN_ACTION_KEYS.has(k));
    if (r.validation_status === "rejected") continue;
    if (keys.some((k) => KNOWN_ACTION_KEYS.has(k))) executable++;
    if (unknown.length) unsupported.push({ name: r.id, label: `${r.id} : ${unknown.join(", ")}`, reason: "Action de règle non prise en charge par le moteur, ignorée" });
    for (const v of ruleInputVars(r)) {
      if (!fieldNames.has(v) && !RESERVED.has(v) && v !== "quantity" && !setVarsOf(model).has(v)) {
        issues.push({ level: "warning", rule_id: r.id, field: v, message: `${r.id} utilise « ${v} », absent du formulaire : la règle ne pourra pas s'appliquer` });
      }
    }
  }

  const sections = schema?.sections ?? [];
  const tables = (schema?.tables ?? []).filter((t) => fieldNames.has(t.vary));

  return {
    title: schema?.title ?? model?.module ?? "Application reconstruite",
    description: schema?.description,
    application: schema?.application ?? model?.application,
    module: schema?.module ?? model?.module,
    fields,
    sections,
    outputs,
    tables,
    unsupported,
    issues,
    schema_version: (schema as StoredSchema | null | undefined)?.version ?? null,
    model_version: (model as StoredRuleModel | null | undefined)?.version ?? null,
    currency: model?.settings?.currency ?? "EUR",
    stats: {
      fields_total: fields.length,
      fields_supported: fields.filter((f) => f.supported).length,
      rules_total: model?.rules.length ?? 0,
      rules_executable: executable,
      outputs: outputs.length,
      tables: tables.length,
    },
  };
}

function decorate(f: InputField, origin: ResolvedField["origin"]): ResolvedField {
  const kind = fieldType(f);
  const integer = f.integer ?? (/^(integer|int)$/i.test(String(f.type)) ? true : undefined);
  return { ...f, ...(integer !== undefined && { integer }), kind, supported: kind !== null, origin };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function setVarsOf(model: RuleModel | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const r of model?.rules ?? []) if (r.action?.set && typeof r.action.set === "object") for (const k of Object.keys(r.action.set)) s.add(k);
  return s;
}

/** Variables d'entrée lues par une règle (conditions + expressions). */
export function ruleInputVars(r: Rule): Set<string> {
  const out = new Set<string>();
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return;
    for (const [k, v] of Object.entries(c as Condition)) {
      if ((k === "any" || k === "all") && Array.isArray(v)) v.forEach(walk);
      else if (k === "not") walk(v);
      else if (k === "expr" && typeof v === "string") safe(() => compile(v).vars.forEach((x) => out.add(x)));
      else out.add(splitConditionKey(k).field);
    }
  };
  walk(r.condition);
  for (const [k, v] of Object.entries(r.action ?? {})) {
    if (k === "set" && v && typeof v === "object") for (const x of Object.values(v)) safe(() => referencedVars(x).forEach((y) => out.add(y)));
    else safe(() => referencedVars(v).forEach((y) => out.add(y)));
  }
  return out;
}

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* expression invalide : signalée par validateModel */
  }
}

/** Inférence de secours : valeurs vues dans les observations et dans les conditions. */
export function inferFields(model: RuleModel | null | undefined, observations: Observation[]): InputField[] {
  const values = new Map<string, Set<Primitive>>();
  const add = (k: string, v: Primitive) => {
    if (RESERVED.has(k)) return;
    if (!values.has(k)) values.set(k, new Set());
    values.get(k)!.add(v);
  };
  for (const o of observations) for (const [k, v] of Object.entries(normalizeInputs(o.inputs))) add(k, v);
  for (const r of model?.rules ?? []) {
    const walk = (c: unknown) => {
      if (!c || typeof c !== "object" || Array.isArray(c)) return;
      for (const [k, v] of Object.entries(c as Condition)) {
        if ((k === "any" || k === "all") && Array.isArray(v)) v.forEach(walk);
        else if (k === "not") walk(v);
        else if (k === "expr") continue;
        else {
          const { field, op } = splitConditionKey(k);
          if (op === "eq" || op === "ne" || op === "neq") {
            if (typeof v === "string" || typeof v === "boolean") add(field, v);
          } else if ((op === "in" || op === "nin" || op === "not_in") && Array.isArray(v)) v.forEach((x) => typeof x === "string" && add(field, x));
          else if (typeof v === "number") add(field, v);
        }
      }
    };
    walk(r.condition);
  }
  const fields: InputField[] = [];
  for (const [name, set] of values) {
    const vals = [...set];
    if (vals.every((v) => typeof v === "boolean")) fields.push({ name, type: "boolean", default: false });
    else if (vals.every((v) => typeof v === "number")) {
      const nums = vals as number[];
      fields.push({ name, type: "number", default: Math.min(...nums.filter((x) => x > 0), 1) });
    } else {
      const opts = [...new Set(vals.map(String))].sort();
      fields.push({ name, type: "enum", options: opts.map((v) => ({ value: v })), default: opts[0] });
    }
  }
  return fields.sort((a, b) => (a.type === b.type ? 0 : a.type === "enum" ? -1 : 1));
}

/** Valeurs initiales du formulaire. */
export function defaultValues(fields: ResolvedField[]): Record<string, Primitive> {
  const v: Record<string, Primitive> = {};
  for (const f of fields) {
    if (!f.supported) continue;
    if (f.default !== undefined) v[f.name] = f.default;
    else if (f.kind === "boolean") v[f.name] = false;
    else if (f.kind === "enum" && f.required && f.options?.length) v[f.name] = f.options[0].value;
    else if (f.kind === "number" && f.required) v[f.name] = f.min !== undefined && f.min > 0 ? f.min : 1;
  }
  return v;
}

/** Seuils numériques lus dans les conditions des règles (pour guider la saisie). */
export function thresholdsFor(field: string, model: RuleModel | null | undefined): { value: number; rule: Rule; op: string }[] {
  const out: { value: number; rule: Rule; op: string }[] = [];
  const walk = (c: unknown, rule: Rule) => {
    if (!c || typeof c !== "object" || Array.isArray(c)) return;
    for (const [k, v] of Object.entries(c as Condition)) {
      if ((k === "any" || k === "all") && Array.isArray(v)) v.forEach((x) => walk(x, rule));
      else if (k === "not") walk(v, rule);
      else {
        const { field: f, op } = splitConditionKey(k);
        if (f === field && ["gte", "gt", "lte", "lt"].includes(op) && typeof v === "number") out.push({ value: v, rule, op });
      }
    }
  };
  for (const r of model?.rules ?? []) if (r.validation_status !== "rejected") walk(r.condition, r);
  return out.sort((a, b) => a.value - b.value);
}
