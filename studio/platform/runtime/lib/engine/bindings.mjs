// GÉNÉRÉ depuis platform/src/lib/engine/bindings.ts — ne pas modifier (npm --prefix platform run runtime)
import { compute } from "./engine.mjs";
/**
 * Liaisons entre un modèle métier versionné et les entités du logiciel reconstruit.
 *
 * Le modèle métier (produit par l'analyse — Alan — ou par l'investigation du Studio) contient des
 * modules de règles exécutés par le moteur REBORN. Une liaison dit, pour une entité du nouveau
 * logiciel, où lire chaque entrée du module et dans quel champ écrire chaque sortie :
 *
 *   ligne de devis  : quantite, prix_unitaire|article.prix_ht, remise_pct → montant_ht
 *   devis           : somme des lignes, remise_pct, date → total_ht, total_tva, total_ttc
 *
 * Aucune formule n'est écrite ici ni dans l'interface : les calculs viennent du module de règles.
 * Si une entrée, un module ou une sortie manque, le calcul est déclaré indisponible — jamais deviné.
 *
 * Ce fichier est copié dans le runtime du logiciel livré (scripts/build-runtime.mjs) : le Studio
 * (vérification sur l'historique) et le logiciel livré (nouveaux documents) exécutent le même code.
 */
export const BUSINESS_MODEL_CONTRACT_VERSION = "1.0";
const empty = (v) => v === null || v === undefined || v === "";
/** Valeur stockée → valeur du modèle (les montants sont stockés en centimes, calculés en euros). */
export function fromStored(v, type) {
    if (empty(v))
        return undefined;
    if (type === "money")
        return Number(v) / 100;
    return v;
}
/** Valeur du modèle → valeur stockée. */
export function toStored(v, type) {
    if (v === undefined || v === null || v === "")
        return null;
    if (type === "money")
        return Math.round(Number(v) * 100);
    if (type === "integer")
        return Math.round(Number(v));
    if (type === "decimal" || type === "percent")
        return Number(v);
    if (typeof v === "number" || typeof v === "boolean")
        return v;
    return String(v);
}
export function resolveInputs(b, access) {
    const values = {};
    const missing = [];
    for (const [name, src] of Object.entries(b.inputs ?? {})) {
        let v;
        if (typeof src === "string") {
            const r = access.get(src);
            v = fromStored(r.value, r.type);
        }
        else if (Array.isArray(src)) {
            for (const pth of src) {
                const r = access.get(pth);
                v = fromStored(r.value, r.type);
                if (v !== undefined)
                    break;
            }
        }
        else if ("sum" in src) {
            const [entity, field] = String(src.sum).split(".");
            const via = b.lines?.entity === entity ? b.lines.via : "";
            if (!via || !field) {
                missing.push(name);
                continue;
            }
            const r = access.sum(entity, via, field);
            v = fromStored(r.value, r.type) ?? 0;
        }
        else if ("date_number" in src) {
            const r = access.get(src.date_number);
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r.value ?? ""));
            v = m ? Number(`${m[1]}${m[2]}${m[3]}`) : undefined;
        }
        else if ("value" in src) {
            v = src.value;
        }
        if (v === undefined)
            missing.push(name);
        else
            values[name] = v;
    }
    return { values, missing };
}
/**
 * Exécute un module de règles pour un enregistrement. `outputType(champ)` donne le type de
 * stockage de chaque champ de sortie. Ne produit jamais de valeur que le module n'a pas calculée.
 */
export function evaluateBinding(pkg, b, access, outputType) {
    if (!pkg)
        return { status: "unavailable", values: {}, message: "Calcul non disponible : aucun modèle métier publié pour ce logiciel" };
    const model = pkg.modules?.[b.module];
    if (!model)
        return { status: "unavailable", values: {}, message: `Calcul non disponible : le module « ${b.module} » est absent du modèle métier v${pkg.version}` };
    const { values: inputs, missing } = resolveInputs(b, access);
    const required = new Set((model.inputs ?? []).filter((f) => f.required !== false).map((f) => f.name));
    const blocking = missing.filter((n) => required.has(n));
    if (blocking.length)
        return { status: "invalid", values: {}, inputs, message: `Calcul impossible : donnée(s) manquante(s) — ${blocking.join(", ")}` };
    const result = compute(model, inputs);
    if (result.status !== "ok") {
        const msg = result.errors.map((e) => e.message).join(" · ") || (result.status === "rejected" ? "Refusé par une règle métier" : "Entrées invalides");
        return { status: result.status, values: {}, result, inputs, message: result.status === "rejected" ? msg : `Calcul impossible : ${msg}` };
    }
    const values = {};
    for (const [out, field] of Object.entries(b.outputs ?? {})) {
        if (!(out in result.outputs)) {
            return { status: "unavailable", values: {}, result, inputs, message: `Calcul non disponible : le module « ${b.module} » ne produit pas « ${out} » (règle manquante, à valider)` };
        }
        values[field] = toStored(result.outputs[out], outputType(field));
    }
    return { status: "ok", values, result, inputs };
}
/** Liaison d'une entité, ou null. */
export function bindingFor(pkg, entity) {
    return (pkg?.bindings ?? []).find((b) => b.entity === entity && b.status !== "proposed") ?? null;
}
/** Champs écrits par le modèle métier (non modifiables à la main). */
export function outputFields(pkg, entity) {
    return new Set((pkg?.bindings ?? []).filter((b) => b.entity === entity && b.status !== "proposed").flatMap((b) => Object.values(b.outputs ?? {})));
}
