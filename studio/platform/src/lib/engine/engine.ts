import { compile, evaluate, ExprError, looseEqual, resolveNumber, roundHalfUp } from "./expr";
import { describeAction, fieldLabel, formatValue, type Labels } from "./describe";
import { normalizeInputs, prepareInputs } from "./inputs";
import {
  STAGES,
  type ComputeError,
  type ComputeResult,
  type Condition,
  type InputField,
  type Primitive,
  type Rule,
  type RuleModel,
  type Stage,
  type TraceStep,
} from "../types";

/**
 * Moteur de règles REBORN — indépendant de l'interface et de tout domaine métier.
 *
 * Exécution déterministe :
 *   1. préparation des entrées (typage, valeurs par défaut, contraintes du schéma) ;
 *   2. étapes dans l'ordre fixe validation → base → discount → fee → adjust → rounding ;
 *   3. dans une étape : priorité croissante, puis ordre de déclaration ;
 *   4. groupes exclusifs : seule la première règle qui correspond s'applique ;
 *   5. affectations concurrentes : la dernière règle appliquée l'emporte, un conflit est signalé.
 */

export const ENGINE_ID = "reborn-engine/2";

export { normalizeInputs };

/** Normalise une sortie observée ("810,00 €" → 810). */
export function normalizeOutput(raw: Record<string, unknown>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") {
      const cleaned = v.replace(/[€$£\s  ]|EUR|HT|TTC/gi, "");
      let n = cleaned;
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
      else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(n)) n = n.replace(/,/g, "");
      else n = n.replace(",", ".");
      out[k] = n !== "" && !Number.isNaN(Number(n)) ? Number(n) : v.trim();
    } else if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Étapes                                                               */
/* ------------------------------------------------------------------ */

export const ACTION_KEYS: Record<Stage, string[]> = {
  validation: ["error", "reject"],
  base: ["unit_price", "set_unit_price", "base_total", "base_price"],
  discount: ["discount_percent", "discount_amount"],
  fee: ["fee_amount", "shipping_fee", "surcharge_percent", "fee"],
  adjust: ["multiply", "total_price", "minimum_total", "maximum_total"],
  rounding: ["round"],
};
export const KNOWN_ACTION_KEYS = new Set([...Object.values(ACTION_KEYS).flat(), "set", "amount"]);

export const BUILTIN_VARS = ["unit_price", "base_total", "subtotal", "discount_total", "fees_total", "total_price"];

export function stageOf(rule: Rule): Stage {
  if (rule.stage && (STAGES as readonly string[]).includes(rule.stage)) return rule.stage;
  const keys = Object.keys(rule.action ?? {});
  for (const st of ["validation", "base", "discount", "fee", "rounding", "adjust"] as const) {
    if (keys.some((k) => ACTION_KEYS[st].includes(k))) return st;
  }
  const t = (rule.type ?? "").toLowerCase();
  if (/exception|validation|error|refus/.test(t)) return "validation";
  if (/discount|remise|rebate/.test(t)) return "discount";
  if (/fee|shipping|delivery|livraison|frais|surcharge/.test(t)) return "fee";
  if (/round|arrondi/.test(t)) return "rounding";
  if (/unit_price|base_price|price|prix|base|tarif|rate/.test(t)) return "base";
  return "adjust";
}

/** Ordre d'exécution global et déterministe des règles. */
export function orderRules(rules: Rule[]): { rule: Rule; stage: Stage; index: number }[] {
  return rules
    .map((rule, index) => ({ rule, index, stage: stageOf(rule) }))
    .sort(
      (a, b) =>
        STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) ||
        (a.rule.priority ?? a.index) - (b.rule.priority ?? b.index) ||
        a.index - b.index,
    );
}

/* ------------------------------------------------------------------ */
/* Conditions                                                           */
/* ------------------------------------------------------------------ */

export const SUFFIXES = ["_between", "_not_in", "_nin", "_neq", "_gte", "_lte", "_eq", "_ne", "_gt", "_lt", "_in"] as const;

type Ctx = Record<string, Primitive | undefined>;

/** Décompose une clé de condition (« quantity_gte ») en champ et opérateur. */
export function splitConditionKey(key: string, known?: (field: string) => boolean): { field: string; op: string } {
  if (known?.(key)) return { field: key, op: "eq" };
  const suf = SUFFIXES.find((s) => key.endsWith(s) && key.length > s.length);
  return suf ? { field: key.slice(0, -suf.length), op: suf.slice(1) } : { field: key, op: "eq" };
}

export function evalCondition(cond: Condition | undefined, ctx: Ctx, labels?: Labels): { ok: boolean; reason?: string } {
  if (!cond || Object.keys(cond).length === 0) return { ok: true };
  for (const [key, expected] of Object.entries(cond)) {
    const r = evalPredicate(key, expected, ctx, labels);
    if (!r.ok) return r;
  }
  return { ok: true };
}

function evalPredicate(key: string, expected: unknown, ctx: Ctx, labels?: Labels): { ok: boolean; reason?: string } {
  if (key === "any" && Array.isArray(expected)) {
    return expected.some((c) => evalCondition(c as Condition, ctx, labels).ok) ? { ok: true } : { ok: false, reason: "aucune alternative remplie" };
  }
  if (key === "all" && Array.isArray(expected)) {
    for (const c of expected) {
      const r = evalCondition(c as Condition, ctx, labels);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (key === "not" && expected && typeof expected === "object") {
    return evalCondition(expected as Condition, ctx, labels).ok ? { ok: false, reason: "condition inverse remplie" } : { ok: true };
  }
  if (key === "expr" && typeof expected === "string") {
    try {
      return evaluate(expected, ctx) ? { ok: true } : { ok: false, reason: `${expected} est faux` };
    } catch (e) {
      return { ok: false, reason: `expression non évaluable : ${(e as Error).message}` };
    }
  }

  const { field, op } = splitConditionKey(key, (k) => k in ctx);
  const actual = ctx[field];
  if (actual === undefined || actual === null) return { ok: false, reason: `${fieldLabel(field, labels)} non renseigné(e)` };
  const fail = (txt: string) => ({ ok: false, reason: `${fieldLabel(field, labels)} = ${formatValue(actual)} ${txt}` });
  const numeric = (x: unknown) => typeof x === "number" || (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x)));

  switch (op) {
    case "eq":
      return looseEqual(actual, expected) ? { ok: true } : fail(`≠ ${formatValue(expected)}`);
    case "ne":
    case "neq":
      return !looseEqual(actual, expected) ? { ok: true } : fail(`= ${formatValue(expected)}`);
    case "gte":
    case "gt":
    case "lte":
    case "lt": {
      if (!numeric(actual)) return fail("(valeur non numérique)");
      const a = Number(actual),
        b = Number(expected);
      const ok = op === "gte" ? a >= b : op === "gt" ? a > b : op === "lte" ? a <= b : a < b;
      return ok ? { ok: true } : fail(`${{ gte: "<", gt: "≤", lte: ">", lt: "≥" }[op]} ${formatValue(expected)}`);
    }
    case "in":
    case "nin":
    case "not_in": {
      const list = Array.isArray(expected) ? expected : [expected];
      const inList = list.some((e) => looseEqual(actual, e));
      if (op === "in") return inList ? { ok: true } : fail(`∉ {${list.map(formatValue).join(", ")}}`);
      return !inList ? { ok: true } : fail(`∈ {${list.map(formatValue).join(", ")}}`);
    }
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) return { ok: false, reason: `${key} : [min, max] attendu` };
      if (!numeric(actual)) return fail("(valeur non numérique)");
      const n = Number(actual);
      return n >= Number(expected[0]) && n <= Number(expected[1]) ? { ok: true } : fail(`hors [${formatValue(expected[0])} ; ${formatValue(expected[1])}]`);
    }
  }
  return { ok: false, reason: `opérateur inconnu ${op}` };
}

/* ------------------------------------------------------------------ */
/* Calcul                                                               */
/* ------------------------------------------------------------------ */

export interface ComputeOptions {
  /** Schéma des entrées pour typage et validation (défaut : model.inputs). */
  fields?: InputField[] | null;
}

type RoundMode = "half_up" | "half_even" | "floor" | "ceil";

export function compute(model: RuleModel | null | undefined, rawInputs: Record<string, unknown>, opts: ComputeOptions = {}): ComputeResult {
  const warnings: string[] = [];
  const trace: TraceStep[] = [];
  const fields = opts.fields ?? model?.inputs ?? null;
  const labels: Labels = Object.fromEntries((fields ?? []).filter((f) => f.label).map((f) => [f.name, f.label as string]));
  const done = (status: ComputeResult["status"], outputs: ComputeResult["outputs"], errors: ComputeError[] = []): ComputeResult => ({
    status,
    outputs,
    trace,
    warnings,
    errors,
    engine: ENGINE_ID,
  });

  const { values: inputs, errors: inputErrors } = prepareInputs(rawInputs, fields);
  if (inputErrors.length) return done("invalid", {}, inputErrors);

  const settings = model?.settings ?? {};
  const stacking = settings.discount_stacking ?? "compound";
  const decimals = settings.rounding?.decimals ?? 2;
  const roundMode: RoundMode = settings.rounding?.mode ?? "half_up";
  const roundEachStep = settings.rounding?.at === "each_step";

  const ctx: Ctx = { ...inputs, unit_price: undefined, base_total: 0, subtotal: 0, discount_total: 0, fees_total: 0, total_price: 0 };
  const money = (x: number) => (roundEachStep ? applyRounding(x, decimals, roundMode) : x);
  const n = (k: string) => Number(ctx[k] ?? 0);
  const syncTotal = () => {
    ctx.total_price = money(n("subtotal") + n("fees_total"));
  };

  const ordered = orderRules((model?.rules ?? []).filter((r) => r && typeof r === "object" && r.action));
  const applied = new Set<string>();
  const firedGroups = new Set<string>();
  const assignedBy = new Map<string, Rule>();
  let explicitRounding = false;
  let baseTotalExplicit = false;

  const assign = (rule: Rule, target: string) => {
    const prev = assignedBy.get(target);
    if (prev && prev.id !== rule.id && !(prev.group && prev.group === rule.group)) {
      warnings.push(`Conflit : ${prev.id} et ${rule.id} fixent tous deux ${target} — ${rule.id} (appliquée en dernier) l'emporte`);
    }
    assignedBy.set(target, rule);
  };

  for (const stage of STAGES) {
    const discountQueue: { rule: Rule; pct: number; amount: number }[] = [];

    for (const { rule } of ordered.filter((x) => x.stage === stage)) {
      const base: Omit<TraceStep, "label" | "applied"> = {
        rule_id: rule.id,
        rule_type: rule.type,
        stage,
        validation_status: rule.validation_status,
        confidence: rule.confidence,
        evidence: rule.evidence,
      };
      const label = rule.description || describeAction(rule.action, stage, labels);
      const skip = (reason: string) => trace.push({ ...base, label, applied: false, reason });

      if (rule.validation_status === "rejected") {
        skip("règle rejetée par l'analyse");
        continue;
      }
      if (rule.group && firedGroups.has(rule.group)) {
        skip(`groupe « ${rule.group} » déjà résolu`);
        continue;
      }
      const missingDep = (rule.depends_on ?? []).find((d) => !applied.has(d));
      if (missingDep) {
        skip(`dépend de ${missingDep}, non appliquée`);
        continue;
      }
      const cond = evalCondition(rule.condition, ctx, labels);
      if (!cond.ok) {
        skip(cond.reason ?? "condition non remplie");
        continue;
      }

      try {
        const action = rule.action;
        const unknown = Object.keys(action).filter((k) => !KNOWN_ACTION_KEYS.has(k));
        if (unknown.length) warnings.push(`${rule.id} : action(s) non prise(s) en charge ignorée(s) : ${unknown.join(", ")}`);

        // Exception métier : le calcul s'arrête sur un refus
        if (stage === "validation") {
          const message = String(action.error ?? action.reject ?? "Refusé par une règle métier");
          trace.push({ ...base, label: rule.description || message, applied: true });
          applied.add(rule.id);
          return done("rejected", {}, [{ rule_id: rule.id, message }]);
        }

        if (action.set && typeof action.set === "object") {
          for (const [k, v] of Object.entries(action.set as Record<string, unknown>)) {
            const before = typeof ctx[k] === "number" ? (ctx[k] as number) : undefined;
            const val = resolveSetValue(v, ctx);
            ctx[k] = val;
            assign(rule, k);
            if (k === "base_total") baseTotalExplicit = true;
            if (k === "fees_total" || k === "subtotal") syncTotal();
            trace.push({ ...base, label, applied: true, target: k, before, after: typeof val === "number" ? val : undefined, delta: typeof val === "number" && before !== undefined ? val - before : undefined });
          }
        }

        if (stage === "base") {
          const up = action.unit_price ?? action.set_unit_price;
          if (up !== undefined) {
            const val = resolveNumber(up, ctx);
            assign(rule, "unit_price");
            ctx.unit_price = val;
            trace.push({ ...base, label, applied: true, target: "unit_price", after: val });
          }
          const bt = action.base_total ?? action.base_price;
          if (bt !== undefined) {
            const val = money(resolveNumber(bt, ctx));
            assign(rule, "base_total");
            ctx.base_total = val;
            baseTotalExplicit = true;
            trace.push({ ...base, label, applied: true, target: "base_total", after: val });
          }
        } else if (stage === "discount") {
          const pct = action.discount_percent !== undefined ? resolveNumber(action.discount_percent, ctx) : 0;
          const amount = action.discount_amount !== undefined ? resolveNumber(action.discount_amount, ctx) : 0;
          if (pct || amount) discountQueue.push({ rule, pct, amount });
          else if (!action.set) trace.push({ ...base, label, applied: true, reason: "remise nulle" });
        } else if (stage === "fee") {
          const amountRaw = action.fee_amount ?? action.shipping_fee ?? action.fee ?? action.amount;
          if (amountRaw !== undefined) {
            const val = money(resolveNumber(amountRaw, ctx));
            const before = n("total_price");
            ctx.fees_total = money(n("fees_total") + val);
            syncTotal();
            trace.push({ ...base, label, applied: true, target: "total_price", before, after: n("total_price"), delta: val });
          }
          if (action.surcharge_percent !== undefined) {
            const val = money((n("subtotal") * resolveNumber(action.surcharge_percent, ctx)) / 100);
            const before = n("total_price");
            ctx.fees_total = money(n("fees_total") + val);
            syncTotal();
            trace.push({ ...base, label, applied: true, target: "total_price", before, after: n("total_price"), delta: val });
          }
        } else if (stage === "adjust") {
          const step = (fn: (before: number) => number) => {
            const before = n("total_price");
            ctx.total_price = money(fn(before));
            trace.push({ ...base, label, applied: true, target: "total_price", before, after: n("total_price"), delta: n("total_price") - before });
          };
          if (action.multiply !== undefined) step((b) => b * resolveNumber(action.multiply, ctx));
          if (action.minimum_total !== undefined) step((b) => Math.max(b, resolveNumber(action.minimum_total, ctx)));
          if (action.maximum_total !== undefined) step((b) => Math.min(b, resolveNumber(action.maximum_total, ctx)));
          if (action.total_price !== undefined) {
            assign(rule, "total_price");
            step(() => resolveNumber(action.total_price, ctx));
          }
        } else if (stage === "rounding") {
          const ro = (action.round ?? {}) as { decimals?: number; mode?: RoundMode };
          explicitRounding = true;
          const before = n("total_price");
          ctx.total_price = applyRounding(before, ro.decimals ?? decimals, ro.mode ?? roundMode);
          trace.push({ ...base, label, applied: true, target: "total_price", before, after: n("total_price"), delta: n("total_price") - before });
        }
        applied.add(rule.id);
        if (rule.group) firedGroups.add(rule.group);
      } catch (e) {
        const msg = e instanceof ExprError ? e.message : String((e as Error).message ?? e);
        warnings.push(`${rule.id} : ${msg}`);
        skip(`erreur : ${msg}`);
      }
    }

    /* Fin d'étape ---------------------------------------------------- */
    if (stage === "base") {
      const hasBaseRules = ordered.some((x) => x.stage === "base");
      if (ctx.unit_price === undefined && !baseTotalExplicit) {
        if (hasBaseRules) {
          return done("invalid", {}, [{ message: "Aucune règle de prix de base ne s'applique à ces entrées." }]);
        }
      } else if (!baseTotalExplicit) {
        const q = ctx.quantity === undefined ? 1 : Number(ctx.quantity);
        if (!Number.isFinite(q)) return done("invalid", {}, [{ field: "quantity", message: `${fieldLabel("quantity", labels)} : nombre attendu` }]);
        ctx.base_total = money(n("unit_price") * q);
        trace.push({
          rule_id: "(calcul)",
          rule_type: "derived",
          stage: "base",
          label: ctx.quantity === undefined ? "Montant de base = prix unitaire" : "Montant de base = prix unitaire × quantité",
          applied: true,
          target: "base_total",
          after: n("base_total"),
        });
      }
      ctx.subtotal = n("base_total");
      syncTotal();
    }
    if (stage === "discount") {
      applyDiscounts(discountQueue, stacking, ctx, trace, money, applied);
      ctx.discount_total = n("base_total") - n("subtotal");
      syncTotal();
    }
  }

  if (!explicitRounding) ctx.total_price = applyRounding(n("total_price"), decimals, roundMode);

  const outputs: ComputeResult["outputs"] = {};
  for (const k of BUILTIN_VARS) {
    if (k === "unit_price" && ctx.unit_price === undefined) continue;
    outputs[k] = applyRounding(n(k), Math.max(decimals, 2), "half_up");
  }
  outputs.total_price = n("total_price");
  for (const [k, v] of Object.entries(ctx)) {
    if (k in outputs || k in inputs || v === undefined) continue;
    outputs[k] = v;
  }
  return done("ok", outputs);
}

/** Valeur d'un `set` : expression évaluée si possible, sinon texte littéral. */
function resolveSetValue(v: unknown, ctx: Ctx): Primitive {
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v !== "string") return String(v);
  try {
    compile(v);
  } catch {
    return v;
  }
  const r = evaluate(v, ctx);
  return r === null ? "" : r;
}

function applyDiscounts(
  queue: { rule: Rule; pct: number; amount: number }[],
  stacking: "compound" | "additive" | "max",
  ctx: Ctx,
  trace: TraceStep[],
  money: (x: number) => number,
  applied: Set<string>,
) {
  const base = Number(ctx.base_total ?? 0);
  const step = (rule: Rule, before: number, after: number, reason?: string): TraceStep => ({
    rule_id: rule.id,
    rule_type: rule.type,
    stage: "discount",
    label: rule.description || describeAction(rule.action, "discount"),
    applied: true,
    target: "subtotal",
    before,
    after,
    delta: after - before,
    reason,
    validation_status: rule.validation_status,
    confidence: rule.confidence,
    evidence: rule.evidence,
  });
  if (!queue.length) return;

  if (stacking === "max") {
    // Meilleure remise ; à valeur égale, la première dans l'ordre d'exécution (déterministe)
    const scored = queue.map((q, i) => ({ ...q, i, value: (base * q.pct) / 100 + q.amount }));
    scored.sort((a, b) => b.value - a.value || a.i - b.i);
    const [best, ...rest] = scored;
    const before = Number(ctx.subtotal);
    ctx.subtotal = money(before - best.value);
    trace.push(step(best.rule, before, Number(ctx.subtotal), "meilleure remise retenue"));
    for (const r of rest) {
      applied.delete(r.rule.id);
      trace.push({ ...step(r.rule, before, before), applied: false, delta: 0, reason: "non cumulable (meilleure remise seule)" });
    }
    return;
  }
  if (stacking === "additive") {
    let running = Number(ctx.subtotal);
    for (const q of queue) {
      const before = running;
      running = money(running - (base * q.pct) / 100 - q.amount);
      trace.push(step(q.rule, before, running, "remises additionnées"));
    }
    ctx.subtotal = running;
    return;
  }
  for (const q of queue) {
    const before = Number(ctx.subtotal);
    const after = money(before * (1 - q.pct / 100) - q.amount);
    ctx.subtotal = after;
    trace.push(step(q.rule, before, after));
  }
}

export function applyRounding(x: number, decimals: number, mode: RoundMode): number {
  const f = 10 ** decimals;
  switch (mode) {
    case "floor":
      return Math.floor(x * f + 1e-9) / f;
    case "ceil":
      return Math.ceil(x * f - 1e-9) / f;
    case "half_even": {
      const y = x * f;
      const r = Math.round(y);
      const isHalf = Math.abs(Math.abs(y - Math.trunc(y)) - 0.5) < 1e-9;
      return (isHalf && r % 2 !== 0 ? r - Math.sign(y) : r) / f;
    }
    default:
      return roundHalfUp(x, decimals);
  }
}
