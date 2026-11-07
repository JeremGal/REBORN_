/**
 * Quotix 98 — logique métier CACHÉE (utilisée par l'interface et par le générateur
 * de jeux de données). REBORN n'importe jamais ce module : il ne voit que l'écran.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function loadDefaultRules() {
  return JSON.parse(fs.readFileSync(path.join(DIR, "hidden-rules.json"), "utf8"));
}

export function computeQuote(rules, { product, quantity, customer_type }) {
  const p = rules.products[product];
  const c = rules.customer_types[customer_type];
  const q = Number(String(quantity ?? "").replace(",", "."));
  if (!p) return { error: "ERREUR 0x11 : CODE ARTICLE INCONNU" };
  if (!c) return { error: "ERREUR 0x12 : CATEGORIE CLIENT INCONNUE" };
  if (!Number.isInteger(q) || q < 1 || q > rules.max_quantity) {
    return { error: `ERREUR 0x17 : QUANTITE INVALIDE (1-${rules.max_quantity})` };
  }
  const tier = [...rules.quantity_tiers].sort((a, b) => b.min - a.min).find((t) => q >= t.min);
  let amount = p.price * q;
  amount *= 1 - (tier?.discount ?? 0) / 100;
  amount *= 1 - c.discount / 100;
  if (amount < rules.shipping.threshold) amount += rules.shipping.fee;
  return { total: Math.round((amount + 1e-9) * 100) / 100 };
}
