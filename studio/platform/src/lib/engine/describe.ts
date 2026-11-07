import type { Action, Condition, Rule, Stage } from "../types";

/**
 * Descriptions lisibles des règles. Aucun vocabulaire métier ici : seuls les
 * concepts du moteur ont un libellé par défaut ; les libellés des champs
 * viennent du schéma de l'application (paramètre `labels`).
 */

export type Labels = Record<string, string>;

const ENGINE_LABELS: Labels = {
  quantity: "quantité",
  unit_price: "prix unitaire",
  base_total: "montant de base",
  subtotal: "sous-total",
  discount_total: "total des remises",
  fees_total: "frais",
  total_price: "total",
};

export function fieldLabel(field: string, labels?: Labels): string {
  return labels?.[field] ?? ENGINE_LABELS[field] ?? field.replace(/_/g, " ");
}

export function formatValue(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  if (typeof v === "string") return `« ${v} »`;
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  return String(v);
}

export function formatMoney(v: number | undefined | null, currency = "EUR"): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString("fr-FR", { style: "currency", currency, minimumFractionDigits: 2 });
}

function num(v: unknown): string {
  return typeof v === "number" ? formatValue(v) : `(${String(v)})`;
}

const OP_TXT: Record<string, string> = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=", ne: "≠", neq: "≠", in: "∈", nin: "∉", not_in: "∉" };
const SUFFIXES = ["_between", "_not_in", "_nin", "_neq", "_gte", "_lte", "_eq", "_ne", "_gt", "_lt", "_in"];

export function describeCondition(cond: Condition | undefined, labels?: Labels): string {
  if (!cond || Object.keys(cond).length === 0) return "toujours";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(cond)) {
    if (key === "any" && Array.isArray(val)) {
      parts.push(`(${val.map((c) => describeCondition(c as Condition, labels)).join(" ou ")})`);
      continue;
    }
    if (key === "all" && Array.isArray(val)) {
      parts.push(val.map((c) => describeCondition(c as Condition, labels)).join(" et "));
      continue;
    }
    if (key === "not") {
      parts.push(`non (${describeCondition(val as Condition, labels)})`);
      continue;
    }
    if (key === "expr") {
      parts.push(String(val));
      continue;
    }
    const suf = SUFFIXES.find((s) => key.endsWith(s) && key.length > s.length);
    const field = suf ? key.slice(0, -suf.length) : key;
    const op = suf ? suf.slice(1) : "eq";
    const f = fieldLabel(field, labels);
    if (op === "between" && Array.isArray(val)) parts.push(`${f} entre ${formatValue(val[0])} et ${formatValue(val[1])}`);
    else if ((op === "in" || op === "nin" || op === "not_in") && Array.isArray(val)) parts.push(`${f} ${OP_TXT[op]} {${val.map(formatValue).join(", ")}}`);
    else if (typeof val === "boolean" && op === "eq") parts.push(val ? f : `non ${f}`);
    else parts.push(`${f} ${OP_TXT[op] ?? op} ${formatValue(val)}`);
  }
  return parts.join(" et ");
}

export function describeAction(action: Action, stage?: Stage, labels?: Labels): string {
  const parts: string[] = [];
  const a = action ?? {};
  if (a.error !== undefined || a.reject !== undefined) parts.push(`refus : « ${String(a.error ?? a.reject)} »`);
  if (a.unit_price !== undefined || a.set_unit_price !== undefined) parts.push(`prix unitaire ${num(a.unit_price ?? a.set_unit_price)} €`);
  if (a.base_total !== undefined || a.base_price !== undefined) parts.push(`montant de base ${num(a.base_total ?? a.base_price)}`);
  if (a.discount_percent !== undefined) parts.push(`remise de ${num(a.discount_percent)} %`);
  if (a.discount_amount !== undefined) parts.push(`remise de ${num(a.discount_amount)} €`);
  const fee = a.fee_amount ?? a.shipping_fee ?? a.fee ?? (stage === "fee" ? a.amount : undefined);
  if (fee !== undefined) parts.push(Number(fee) === 0 ? "frais offerts" : `frais de ${num(fee)}${typeof fee === "number" ? " €" : ""}`);
  if (a.surcharge_percent !== undefined) parts.push(`majoration de ${num(a.surcharge_percent)} %`);
  if (a.multiply !== undefined) parts.push(`× ${num(a.multiply)}`);
  if (a.minimum_total !== undefined) parts.push(`minimum ${num(a.minimum_total)}`);
  if (a.maximum_total !== undefined) parts.push(`plafond ${num(a.maximum_total)}`);
  if (a.total_price !== undefined) parts.push(`total = ${num(a.total_price)}`);
  if (a.round && typeof a.round === "object") {
    const r = a.round as { decimals?: number; mode?: string };
    parts.push(`arrondi à ${r.decimals ?? 2} décimale(s)${r.mode ? ` (${r.mode})` : ""}`);
  }
  if (a.set && typeof a.set === "object") {
    for (const [k, v] of Object.entries(a.set as Record<string, unknown>)) parts.push(`${fieldLabel(k, labels)} = ${typeof v === "string" ? v : formatValue(v)}`);
  }
  if (parts.length === 0) return JSON.stringify(a);
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ruleSentence(rule: Rule, labels?: Labels): { when: string; then: string } {
  return { when: describeCondition(rule.condition, labels), then: describeAction(rule.action, undefined, labels) };
}

export const STATUS_LABEL: Record<string, string> = {
  hypothesis: "Hypothèse",
  tested: "Testée",
  validated: "Validée",
  rejected: "Rejetée",
};

export const STAGE_LABEL: Record<Stage, string> = {
  validation: "Exceptions",
  base: "Montant de base",
  discount: "Remises",
  fee: "Frais et majorations",
  adjust: "Ajustements",
  rounding: "Arrondi",
};
