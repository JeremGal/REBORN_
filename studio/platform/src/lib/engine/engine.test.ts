import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyRounding, compute, ENGINE_ID, normalizeOutput } from "./engine";
import { compile, evaluate } from "./expr";
import { validateModel, validateSchema } from "./validate";
import { compareAll, compareOne, diffModels } from "../compare";
import { inferFields, resolveApp } from "../appschema";
import quoteV1 from "../../../scenarios/quote/rules.v1.json";
import quoteV2 from "../../../scenarios/quote/rules.v2.json";
import quoteSchema from "../../../scenarios/quote/schema.json";
import type { InputField, Observation, RuleModel, StoredRuleModel } from "../types";

const V1 = quoteV1 as RuleModel;
const V2 = quoteV2 as RuleModel;
const quoteFields = resolveApp(V1, quoteSchema as never).fields;

/** Référence : la logique cachée du logiciel historique (legacy-app/quotix-core.mjs). */
function legacy(product: string, quantity: number, customer: string, qtyTier1 = 10) {
  const unit = { A: 100, B: 250, C: 40 }[product]!;
  const qd = quantity >= 50 ? 20 : quantity >= 10 ? qtyTier1 : 0;
  const cd = { standard: 0, premium: 10, partenaire: 20 }[customer]!;
  const sub = unit * quantity * (1 - qd / 100) * (1 - cd / 100);
  return Math.round((sub + (sub < 500 ? 45 : 0)) * 100) / 100;
}

const priced = (m: RuleModel, rules: RuleModel["rules"]): RuleModel => ({ ...m, rules });

describe("moteur — calculs", () => {
  it("reproduit l'exemple du brief : A × 10, premium → 810", () => {
    const r = compute(V1, { product: "A", quantity: 10, customer_type: "premium" });
    expect(r.status).toBe("ok");
    expect(r.outputs.total_price).toBe(810);
    expect(r.warnings).toEqual([]);
    expect(r.engine).toBe(ENGINE_ID);
  });

  it("le mode de cumul des remises change le résultat", () => {
    const inputs = { product: "A", quantity: 10, customer_type: "premium" };
    expect(compute({ ...V1, settings: { ...V1.settings, discount_stacking: "additive" } }, inputs).outputs.total_price).toBe(800);
    expect(compute({ ...V1, settings: { ...V1.settings, discount_stacking: "max" } }, inputs).outputs.total_price).toBe(900);
  });

  it("applique les frais après remises, avec seuil strict", () => {
    // 13 × 40 = 520 ≥ 500 avant remise, mais 468 < 500 après remise volume → frais dus
    expect(compute(V1, { product: "C", quantity: 13, customer_type: "standard" }).outputs.total_price).toBe(513);
    expect(compute(V1, { product: "B", quantity: 2, customer_type: "standard" }).outputs.total_price).toBe(500);
  });

  it("n'applique qu'une règle par groupe exclusif", () => {
    const r = compute(V1, { product: "A", quantity: 60, customer_type: "standard" });
    expect(r.outputs.total_price).toBe(4800);
    expect(r.trace.find((t) => t.rule_id === "RULE_005")?.applied).toBe(false);
  });

  it("concorde avec la logique cachée sur une grille complète (v1 et v2)", () => {
    for (const p of ["A", "B", "C"])
      for (const c of ["standard", "premium", "partenaire"])
        for (const q of [1, 3, 9, 10, 11, 12, 13, 49, 50, 51, 120, 999]) {
          expect(compute(V1, { product: p, quantity: q, customer_type: c }).outputs.total_price).toBe(legacy(p, q, c));
          expect(compute(V2, { product: p, quantity: q, customer_type: c }).outputs.total_price).toBe(legacy(p, q, c, 15));
        }
  });

  it("est déterministe : mêmes entrées → même résultat, trace comprise", () => {
    const a = compute(V1, { product: "B", quantity: 12, customer_type: "premium" });
    const b = compute(V1, { product: "B", quantity: 12, customer_type: "premium" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("évalue les expressions et ignore les règles rejetées", () => {
    const m: RuleModel = {
      module: "x",
      rules: [
        { id: "P", type: "unit_price", action: { unit_price: 10 } },
        { id: "F", type: "fee", action: { fee_amount: "5 + 0.5 * quantity" } },
        { id: "X", type: "discount", action: { discount_percent: 50 }, validation_status: "rejected" },
        { id: "E", type: "discount", condition: { expr: "quantity >= 4 && product == 'Z'" }, action: { discount_percent: 10 } },
      ],
    };
    expect(compute(m, { product: "z", quantity: 4 }).outputs.total_price).toBe(43);
  });
});

describe("moteur — entrées, données absentes et exceptions", () => {
  it("refuse une entrée invalide au lieu de calculer avec une valeur par défaut", () => {
    const r = compute(V1, { product: "A", quantity: "abc", customer_type: "standard" }, { fields: quoteFields });
    expect(r.status).toBe("invalid");
    expect(r.errors[0].field).toBe("quantity");
  });

  it("signale un champ requis absent (sans valeur par défaut)", () => {
    const fields: InputField[] = [{ name: "product", type: "enum", required: true, options: [{ value: "A" }] }];
    const r = compute(V1, { quantity: 3, customer_type: "standard" }, { fields });
    expect(r.status).toBe("invalid");
    expect(r.errors.map((e) => e.field)).toContain("product");
    // Avec une valeur par défaut déclarée, le champ est complété comme dans l'écran d'origine
    expect(compute(V1, { quantity: 3, customer_type: "standard" }, { fields: quoteFields }).outputs.total_price).toBe(345);
  });

  it("refuse une valeur hors liste et normalise la casse", () => {
    expect(compute(V1, { product: "Z", quantity: 1, customer_type: "standard" }, { fields: quoteFields }).status).toBe("invalid");
    expect(compute(V1, { product: "a", quantity: "10", customer_type: "PREMIUM" }, { fields: quoteFields }).outputs.total_price).toBe(810);
  });

  it("sans schéma, aucune règle de base applicable → invalide (pas de prix inventé)", () => {
    const r = compute(V1, { product: "Z", quantity: 1, customer_type: "standard" });
    expect(r.status).toBe("invalid");
    expect(r.outputs).toEqual({});
  });

  it("reproduit une exception métier (étape validation)", () => {
    const r = compute(V1, { product: "A", quantity: 0, customer_type: "standard" }, { fields: quoteFields });
    expect(r.status).toBe("rejected");
    expect(r.errors[0]).toMatchObject({ rule_id: "RULE_009", message: "QUANTITE INVALIDE (1-999)" });
  });

  it("applique les contraintes du modèle fusionnées au schéma (quantité entière)", () => {
    expect(compute(V1, { product: "A", quantity: 2.5, customer_type: "standard" }, { fields: quoteFields }).status).toBe("invalid");
  });

  it("type les cases à cocher (on / oui / 1)", () => {
    const fields: InputField[] = [{ name: "flag", type: "checkbox" }];
    const m: RuleModel = { module: "x", rules: [{ id: "B", type: "base", action: { base_total: 10 } }, { id: "S", type: "fee", condition: { flag: true }, action: { fee_amount: 5 } }] };
    expect(compute(m, { flag: "oui" }, { fields }).outputs.total_price).toBe(15);
    expect(compute(m, { flag: "on" }, { fields }).outputs.total_price).toBe(15);
    expect(compute(m, {}, { fields }).outputs.total_price).toBe(10);
    expect(compute(m, { flag: "peut-être" }, { fields }).status).toBe("invalid");
  });
});

describe("moteur — dépendances, conflits, arrondis", () => {
  const base = { id: "B", type: "base", action: { base_total: 100 } };

  it("depends_on : la règle ne s'applique que si sa dépendance s'est appliquée", () => {
    const m = priced({ module: "x", rules: [] }, [
      base,
      { id: "D1", type: "discount", condition: { vip: true }, action: { discount_percent: 10 } },
      { id: "F1", type: "fee", depends_on: ["D1"], action: { fee_amount: 1 } },
    ]);
    expect(compute(m, { vip: true }).outputs.total_price).toBe(91);
    const r = compute(m, { vip: false });
    expect(r.outputs.total_price).toBe(100);
    expect(r.trace.find((t) => t.rule_id === "F1")?.reason).toMatch(/dépend de D1/);
  });

  it("conflit d'affectation : la dernière règle l'emporte et un avertissement est émis", () => {
    const m = priced({ module: "x", rules: [] }, [
      { id: "U1", type: "unit_price", action: { unit_price: 10 } },
      { id: "U2", type: "unit_price", action: { unit_price: 12 } },
    ]);
    const r = compute(m, { quantity: 2 });
    expect(r.outputs.total_price).toBe(24);
    expect(r.warnings.join()).toMatch(/Conflit : U1 et U2/);
  });

  it("mode max : à remise égale, la première dans l'ordre d'exécution gagne", () => {
    const m: RuleModel = {
      module: "x",
      settings: { discount_stacking: "max" },
      rules: [base, { id: "A", type: "discount", action: { discount_percent: 10 } }, { id: "B2", type: "discount", action: { discount_amount: 10 } }],
    };
    const r = compute(m, {});
    expect(r.outputs.total_price).toBe(90);
    expect(r.trace.find((t) => t.rule_id === "A")?.applied).toBe(true);
    expect(r.trace.find((t) => t.rule_id === "B2")?.applied).toBe(false);
  });

  it("modes d'arrondi", () => {
    expect(applyRounding(12.341, 1, "ceil")).toBe(12.4);
    expect(applyRounding(12.4, 1, "ceil")).toBe(12.4);
    expect(applyRounding(12.349, 1, "floor")).toBe(12.3);
    expect(applyRounding(2.5, 0, "half_even")).toBe(2);
    expect(applyRounding(3.5, 0, "half_even")).toBe(4);
    expect(applyRounding(1.005, 2, "half_up")).toBe(1.01);
  });

  it("arrondi à chaque étape vs en fin de calcul", () => {
    const rules = [{ id: "B", type: "base", action: { base_total: 10.005 } }, { id: "D", type: "discount", action: { discount_percent: 33.3 } }];
    const end = compute({ module: "x", rules, settings: { rounding: { decimals: 2, at: "end" } } }, {}).outputs.total_price;
    const each = compute({ module: "x", rules, settings: { rounding: { decimals: 2, at: "each_step" } } }, {}).outputs.total_price;
    expect(end).toBe(6.67);
    expect(each).toBe(6.68);
  });

  it("produit des sorties non monétaires via set", () => {
    const m: RuleModel = { module: "x", rules: [base, { id: "T", type: "transit", action: { set: { days: "zone == 'FR' ? 2 : 5" } } }] };
    expect(compute(m, { zone: "FR" }).outputs.days).toBe(2);
  });
});

describe("validation des modèles avant exécution", () => {
  const issues = (m: RuleModel, fields?: InputField[]) => validateModel(m, { fields });
  const errorsOf = (m: RuleModel) => issues(m).filter((i) => i.level === "error").map((i) => i.message);

  it("accepte les modèles de démonstration sans erreur", () => {
    expect(errorsOf(V1)).toEqual([]);
    expect(errorsOf(V2)).toEqual([]);
  });

  it("rejette identifiants dupliqués, expressions invalides, actions inconnues, opérateurs mal formés", () => {
    const bad: RuleModel = {
      module: "x",
      rules: [
        { id: "R1", type: "fee", action: { fee_amount: "2 *" } },
        { id: "R1", type: "fee", action: { teleport: 1 } },
        { id: "R2", type: "discount", condition: { quantity_between: 5 }, action: { discount_percent: 5 } },
        { id: "R3", type: "fee", condition: { expr: "constructor.prototype" }, action: { fee_amount: 1 } },
        { id: "R4", type: "fee", stage: "fee", action: { error: "x" } },
      ],
    };
    const errs = errorsOf(bad).join(" | ");
    expect(errs).toMatch(/dupliqué/);
    expect(errs).toMatch(/Expression invalide/);
    expect(errs).toMatch(/Aucune action exécutable/);
    expect(errs).toMatch(/\[min, max\]/);
    expect(errs).toMatch(/Accès aux propriétés interdit/);
    expect(errs).toMatch(/étape validation/);
  });

  it("vérifie l'ordre des dépendances", () => {
    const m: RuleModel = { module: "x", rules: [{ id: "F", type: "fee", depends_on: ["D"], action: { fee_amount: 1 } }, { id: "X", type: "fee", depends_on: ["NOPE"], action: { fee_amount: 1 } }, { id: "D", type: "adjust", action: { multiply: 2 } }] };
    const errs = errorsOf(m).join(" | ");
    expect(errs).toMatch(/D s'exécute après F/);
    expect(errs).toMatch(/règle inconnue NOPE/);
  });

  it("avertit sur une variable absente du formulaire et sur un conflit statique", () => {
    const fields: InputField[] = [{ name: "qty", type: "number" }];
    const m: RuleModel = { module: "x", rules: [{ id: "A", type: "unit_price", condition: { color: "red" }, action: { unit_price: 1 } }, { id: "B", type: "unit_price", condition: { color: "red" }, action: { unit_price: 2 } }] };
    const w = issues(m, fields).filter((i) => i.level === "warning").map((i) => i.message).join(" | ");
    expect(w).toMatch(/« color »/);
    expect(w).toMatch(/Conflit : A et B/);
  });

  it("valide les schémas d'interface", () => {
    const r = validateSchema({ fields: [{ name: "a", type: "number", min: 5, max: 1 }, { name: "a", type: "date" }, { name: "b c", type: "text", pattern: "(" }] });
    const msg = r.map((i) => `${i.level}:${i.message}`).join(" | ");
    expect(msg).toMatch(/error:min > max/);
    expect(msg).toMatch(/error:Champ dupliqué/);
    expect(msg).toMatch(/warning:Type « date » non pris en charge/);
    expect(msg).toMatch(/error:Nom de champ invalide/);
    expect(msg).toMatch(/error:Motif/);
  });
});

describe("évaluateur d'expressions — sûreté", () => {
  it("respecte les priorités et les fonctions", () => {
    expect(evaluate("2 + 3 * 4", {})).toBe(14);
    expect(evaluate("max(1, min(5, 3)) + round(2.345, 2)", {})).toBe(5.35);
    expect(evaluate("clamp(15, 0, 10)", {})).toBe(10);
    expect(evaluate("q >= 10 ? 'oui' : 'non'", { q: 12 })).toBe("oui");
    expect(compile("a * b + c").vars.sort()).toEqual(["a", "b", "c"]);
  });
  it("n'exécute jamais de JavaScript arbitraire", () => {
    expect(() => evaluate("constructor", {})).toThrow(/Variable inconnue/);
    expect(() => evaluate("process", {})).toThrow();
    expect(() => evaluate("a.b", { a: 1 })).toThrow(/propriétés interdit/);
    expect(() => evaluate("alert(1)", {})).toThrow(/Fonction inconnue/);
    expect(() => evaluate("x = 1", { x: 0 })).toThrow();
    expect(() => evaluate("1 / 0", {})).toThrow(/Division par zéro/);
  });
  it("borne la taille et l'imbrication (pas de déni de service)", () => {
    expect(() => compile("1+".repeat(600) + "1")).toThrow(/trop/);
    expect(() => compile("(".repeat(200) + "1" + ")".repeat(200))).toThrow(/trop/);
  });
});

describe("normalisation des sorties lues à l'écran", () => {
  it("lit les montants affichés", () => {
    expect(normalizeOutput({ t: "810,00 €" }).t).toBe(810);
    expect(normalizeOutput({ t: "1.234,56 EUR" }).t).toBe(1234.56);
    expect(normalizeOutput({ t: "1 234,56" }).t).toBe(1234.56);
    expect(normalizeOutput({ t: "1,234.56" }).t).toBe(1234.56);
  });
});

describe("comparaison", () => {
  const obs = (id: string, product: string, quantity: number, customer: string, total: number | null, inv = "inv1", status = "success"): Observation => ({
    experiment_id: id,
    inputs: { product, quantity, customer_type: customer },
    observed_output: total === null ? {} : { total_price: total },
    status,
    investigation_id: inv,
  });

  it("détecte la dérive du Blind Challenge puis la résorbe avec v2", () => {
    const after = [obs("EXP_106", "A", 10, "standard", legacy("A", 10, "standard", 15), "inv2"), obs("EXP_118", "B", 12, "premium", legacy("B", 12, "premium", 15), "inv2")];
    const v1 = { ...V1, version: 1, received_at: "" } as StoredRuleModel;
    const v2 = { ...V2, version: 2, received_at: "" } as StoredRuleModel;
    const before = compareAll(v1, after, "inv2");
    expect(before.mismatched).toBe(2);
    expect(before.rows[0].delta).toBe(50);
    const fixed = compareAll(v2, after, "inv2");
    expect(fixed.equivalence).toBe(1);
    expect(fixed.construction_total + fixed.independent_total).toBe(2);
  });

  it("compare les refus métier : reproduits, non reproduits, et expériences échouées", () => {
    const refused = obs("E0", "A", 0, "standard", null, "i", "error");
    expect(compareOne(V1, refused, { fields: quoteFields })).toMatchObject({ status: "match", exception: true });
    const noException = { ...V1, rules: V1.rules.filter((r) => r.id !== "RULE_009") };
    expect(compareOne(noException, refused)).toMatchObject({ status: "mismatch", exception: true });
    expect(compareOne(V1, obs("E1", "A", 1, "standard", null, "i", "failed")).status).toBe("inconclusive");
  });

  it("calcule couverture des règles et limites de vérification", () => {
    const r = compareAll(V1, [obs("E1", "A", 1, "standard", 145)], "all", { fields: quoteFields });
    expect(r.rule_coverage.find((c) => c.rule_id === "RULE_001")?.applied).toBe(1);
    expect(r.limitations.join(" ")).toMatch(/jamais exercée/);
    expect(r.limitations.join(" ")).toMatch(/jamais testée/);
  });

  it("diff de modèle : 10 % → 15 %", () => {
    const d = diffModels(V1, V2);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ rule_id: "RULE_005", kind: "changed", fields: ["action.discount_percent"] });
  });

  it("infère un formulaire en dernier recours", () => {
    const form = inferFields(V1, [obs("E1", "A", 1, "standard", 145)]);
    expect(form.find((f) => f.name === "product")?.options?.map((o) => o.value)).toEqual(["A", "B", "C"]);
    expect(form.find((f) => f.name === "quantity")?.type).toBe("number");
  });
});

describe("généricité", () => {
  it("le moteur et le générateur d'interface ne contiennent aucun vocabulaire métier", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const files = [
      ...fs.readdirSync(path.join(root, "lib/engine")).filter((f) => !f.endsWith(".test.ts")).map((f) => path.join(root, "lib/engine", f)),
      path.join(root, "lib/appschema.ts"),
      path.join(root, "lib/compare.ts"),
      ...fs.readdirSync(path.join(root, "components/app")).map((f) => path.join(root, "components/app", f)),
    ];
    const forbidden = /\b(product|customer_type|premium|partenaire|quotix|morel|weight_kg|zone|express|fragile|transcalc|insurance_value)\b/i;
    for (const f of files) {
      const hit = fs.readFileSync(f, "utf8").split("\n").find((l) => forbidden.test(l) && !l.trim().startsWith("*") && !l.trim().startsWith("//"));
      expect(hit, `${path.relative(root, f)} : ${hit}`).toBeUndefined();
    }
  });
});
