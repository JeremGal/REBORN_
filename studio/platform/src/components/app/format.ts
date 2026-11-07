import type { OutputField } from "@/lib/types";

const MONEY_TARGETS = new Set(["unit_price", "base_total", "subtotal", "discount_total", "fees_total", "total_price"]);

export function isMoneyVar(name: string) {
  return MONEY_TARGETS.has(name);
}

export function formatCurrency(v: number, currency = "EUR") {
  return v.toLocaleString("fr-FR", { style: "currency", currency, minimumFractionDigits: 2 });
}

/** Mise en forme d'une sortie selon sa déclaration dans le schéma. */
export function formatOutput(value: unknown, out: OutputField | undefined, currency = "EUR"): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value !== "number") return String(value);
  const u = Math.abs(value) <= 1 && out?.unit_singular ? out.unit_singular : out?.unit;
  const unit = u ? ` ${u}` : "";
  switch (out?.format) {
    case "currency":
      return formatCurrency(value, currency);
    case "integer":
      return `${Math.round(value).toLocaleString("fr-FR")}${unit}`;
    case "percent":
      return `${value.toLocaleString("fr-FR", { maximumFractionDigits: out.decimals ?? 2 })} %`;
    case "text":
      return `${value}${unit}`;
    default:
      return `${value.toLocaleString("fr-FR", { maximumFractionDigits: out?.decimals ?? 2 })}${unit}`;
  }
}
