#!/usr/bin/env node
/**
 * Génère les observations des scénarios de démonstration à partir de la logique
 * CACHÉE de chaque logiciel historique. Ces fichiers simulent fidèlement ce que
 * l'Explorer (Mouss) enverra : entrées saisies + sortie lue à l'écran.
 * REBORN ne lit jamais cette logique : il ne reçoit que les observations.
 *
 *   node scripts/gen-scenarios.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeQuote, loadDefaultRules } from "../legacy-app/quotix-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = (s) => path.join(root, "platform/scenarios", s);
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");

/* Scénario A — Quotix 98 (configurateur de devis) ---------------------- */
const plan = JSON.parse(fs.readFileSync(path.join(dir("quote"), "plan.json"), "utf8"));
const v1 = loadDefaultRules();
const v2 = structuredClone(v1);
v2.quantity_tiers.find((t) => t.min === 10).discount = 15; // la règle cachée change
const quoteObs = (rules, offset) =>
  plan.map((p) => {
    const r = computeQuote(rules, p.inputs);
    const id = `EXP_${String(offset + p.n).padStart(3, "0")}`;
    return r.error
      ? { experiment_id: id, application: "Quotix 98", module: "Devis", inputs: p.inputs, observed_output: {}, status: "error", error: r.error }
      : { experiment_id: id, application: "Quotix 98", module: "Devis", inputs: p.inputs, observed_output: { total_price: r.total }, status: "success" };
  });
write(path.join(dir("quote"), "observations.v1.json"), quoteObs(v1, 0));
write(path.join(dir("quote"), "observations.v2.json"), quoteObs(v2, 100));

/* Scénario B — TransCalc 2003 (frais logistiques) ---------------------- */
function transcalc(version, { zone, weight_kg: w, express, fragile, insurance_value = 0 }) {
  if (w < 0.1 || w > 1000) return { error: "POIDS HORS LIMITES (0,1 - 1000 KG)" };
  if (zone === "INT" && fragile) return { error: "ENVOI FRAGILE REFUSE A L'INTERNATIONAL" };
  const [fixed, perKg] = { FR: [6.5, 0.85], EU: [14, 1.6], INT: [29, 3.1] }[zone];
  const disc = w >= 500 ? 15 : w >= 100 ? 8 : 0;
  const sub = (fixed + perKg * w) * (1 - disc / 100);
  let fees = 0;
  if (express) fees += (sub * (version === 1 ? 50 : 65)) / 100;
  if (fragile) fees += 12;
  if (version === 2 && insurance_value > 0) fees += Math.max(5, insurance_value * 0.01);
  const total = Math.ceil(Math.max(sub + fees, 12) * 10 - 1e-9) / 10;
  const days = zone === "FR" ? (express ? 1 : 2) : zone === "EU" ? (express ? 2 : 4) : express ? 4 : 7;
  return { total, days };
}
const lplan = JSON.parse(fs.readFileSync(path.join(dir("logistics"), "plan.json"), "utf8"));
const logObs = (version, list) =>
  list.map(({ id, inputs }) => {
    const r = transcalc(version, inputs);
    return r.error
      ? { experiment_id: id, application: "TransCalc 2003", module: "Tarification", inputs, observed_output: {}, status: "error", error: r.error }
      : { experiment_id: id, application: "TransCalc 2003", module: "Tarification", inputs, observed_output: { total_price: r.total, transit_days: r.days }, status: "success" };
  });
write(path.join(dir("logistics"), "observations.v1.json"), logObs(1, lplan.v1));
write(path.join(dir("logistics"), "observations.v2.json"), logObs(2, lplan.v2));
console.log("Scénarios générés dans platform/scenarios/");
