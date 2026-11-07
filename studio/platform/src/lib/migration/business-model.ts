import { z } from "zod";
import { RuleModelSchema } from "../schemas";
import { validateModel } from "../engine/validate";
import { BUILTIN_VARS } from "../engine/engine";
import type { RuleModel } from "../types";
import { BUSINESS_MODEL_CONTRACT_VERSION, type RuleBinding } from "../engine/bindings";
import type { MigrationMapping } from "./mapping";

/**
 * Contrat « modèle métier » (Alan → Jerem), version 1.0.
 *
 * Il décrit la logique métier du logiciel historique sous une forme exécutable par le moteur de
 * règles REBORN : des modules de règles (contrat « rules » existant) et leurs liaisons aux entités
 * du nouveau logiciel. Chaque publication crée une version immuable, « à valider » tant qu'un
 * responsable ne l'a pas validée ; seule une version validée est installée dans le logiciel livré.
 * Les champs workflows, hypotheses et parameters sont acceptés et conservés (réservés à l'analyse).
 */

const Ident = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "identifiant attendu : minuscules, chiffres et _");
const PathString = z.string().regex(/^[a-z][a-z0-9_]{0,59}(\.[a-z][a-z0-9_]{0,59}){0,4}$/, "chemin attendu : champ ou champ.champ (5 niveaux max)");
export const InputSourceSchema = z.union([
  PathString,
  z.array(PathString).min(1).max(5),
  z.object({ sum: PathString }).strict(),
  z.object({ date_number: PathString }).strict(),
  z.object({ value: z.union([z.number(), z.string().max(200), z.boolean()]) }).strict(),
]);
export const RuleBindingSchema = z
  .object({
    id: z.string().min(1).max(80),
    module: z.string().min(1).max(80),
    scope: z.enum(["line", "document"]),
    entity: Ident,
    document: z.object({ entity: Ident, via: Ident }).strict().optional(),
    lines: z.object({ entity: Ident, via: Ident }).strict().optional(),
    inputs: z.record(z.string().min(1).max(80), InputSourceSchema),
    outputs: z.record(z.string().min(1).max(80), Ident),
    fields: z.array(z.object({ name: Ident, label: z.string().min(1).max(80), type: z.enum(["money", "decimal", "percent", "integer", "text"]) }).strict()).max(20).optional(),
    note: z.string().max(1000).optional(),
  })
  .strict();
export const BusinessModelSchema = z
  .object({
    contract_version: z.string().default(BUSINESS_MODEL_CONTRACT_VERSION),
    source_system: z.string().max(120).optional(),
    modules: z.record(z.string().regex(/^[a-z][a-z0-9_.-]{0,59}$/, "nom de module : minuscules, chiffres, . _ -"), RuleModelSchema),
    bindings: z.array(RuleBindingSchema).max(50).default([]),
    parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
    workflows: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
    hypotheses: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();
export type BusinessModel = z.output<typeof BusinessModelSchema>;

export interface ModelIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

/** Cohérence du modèle métier avec lui-même et avec les correspondances (entités, champs). */
export function checkBusinessModel(bm: BusinessModel, mapping: MigrationMapping | null): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: "error", path, message });
  const warn = (path: string, message: string) => issues.push({ level: "warning", path, message });
  if (!Object.keys(bm.modules).length) err("modules", "au moins un module de règles est attendu");
  for (const [name, model] of Object.entries(bm.modules)) {
    // Variables calculées par le moteur : une entrée de ce nom serait écrasée au démarrage du calcul
    for (const f of model.inputs ?? []) if (BUILTIN_VARS.includes(f.name)) err(`modules.${name}.inputs.${f.name}`, `« ${f.name} » est une variable réservée du moteur (${BUILTIN_VARS.join(", ")}) : renommez l'entrée`);
    for (const i of validateModel(model as RuleModel)) {
      if (i.level === "error") err(`modules.${name}${i.rule_id ? `.${i.rule_id}` : ""}`, i.message);
      else if (i.level === "warning") warn(`modules.${name}${i.rule_id ? `.${i.rule_id}` : ""}`, i.message);
    }
  }
  const entities = new Map((mapping?.entities ?? []).map((e) => [e.name, e]));
  const derived = new Map<string, Set<string>>();
  for (const b of bm.bindings) for (const f of b.fields ?? []) derived.set(b.entity, (derived.get(b.entity) ?? new Set()).add(f.name));
  const fieldsOf = (entity: string) => new Set([...(entities.get(entity)?.fields.map((f) => f.name) ?? []), ...(derived.get(entity) ?? [])]);
  const checkPath = (from: string, pth: string, at: string) => {
    let ent = from;
    const parts = pth.split(".");
    for (let i = 0; i < parts.length; i++) {
      const e = entities.get(ent);
      if (!e) return warn(at, `entité inconnue dans les correspondances : ${ent}`);
      const f = e.fields.find((x) => x.name === parts[i]);
      if (!f) {
        if (i === parts.length - 1 && derived.get(ent)?.has(parts[i])) return;
        return err(at, `champ inconnu : ${ent}.${parts[i]}`);
      }
      if (i < parts.length - 1) {
        if (f.type !== "reference" || !f.references) return err(at, `${ent}.${parts[i]} n'est pas une référence`);
        ent = f.references;
      }
    }
  };
  const ids = new Set<string>();
  bm.bindings.forEach((b, bi) => {
    const p = `bindings.${bi}(${b.id})`;
    if (ids.has(b.id)) err(p, `liaison dupliquée : ${b.id}`);
    ids.add(b.id);
    const model = bm.modules[b.module];
    if (!model) err(`${p}.module`, `module absent du modèle : ${b.module}`);
    if (!mapping) warn(p, "aucune correspondance chargée : liaison non vérifiée contre les entités");
    else if (!entities.has(b.entity)) err(`${p}.entity`, `entité inconnue : ${b.entity}`);
    for (const rel of [b.document, b.lines].filter(Boolean) as { entity: string; via: string }[]) {
      if (mapping && !entities.has(rel.entity)) err(p, `entité inconnue : ${rel.entity}`);
    }
    if (mapping && b.document) {
      const via = entities.get(b.entity)?.fields.find((f) => f.name === b.document!.via);
      if (!via || via.references !== b.document.entity) err(`${p}.document`, `${b.entity}.${b.document.via} ne référence pas ${b.document.entity}`);
    }
    if (mapping && b.lines) {
      const via = entities.get(b.lines.entity)?.fields.find((f) => f.name === b.lines!.via);
      if (!via || via.references !== b.entity) err(`${p}.lines`, `${b.lines.entity}.${b.lines.via} ne référence pas ${b.entity}`);
    }
    for (const f of b.fields ?? []) if (entities.get(b.entity)?.fields.some((x) => x.name === f.name)) err(`${p}.fields`, `${f.name} existe déjà dans ${b.entity}`);
    for (const name of Object.keys(b.inputs)) if (BUILTIN_VARS.includes(name)) err(`${p}.inputs.${name}`, `« ${name} » est une variable réservée du moteur : renommez l'entrée du module`);
    if (mapping && entities.has(b.entity)) {
      for (const [name, src] of Object.entries(b.inputs)) {
        const at = `${p}.inputs.${name}`;
        if (typeof src === "string") checkPath(b.entity, src, at);
        else if (Array.isArray(src)) src.forEach((s) => checkPath(b.entity, s, at));
        else if ("sum" in src) {
          const [ent, field] = src.sum.split(".");
          if (!b.lines || b.lines.entity !== ent) err(at, `somme sur ${ent} : déclarez lines: { entity: "${ent}", via: … }`);
          else if (!field || !fieldsOf(ent).has(field)) err(at, `champ inconnu : ${src.sum}`);
        } else if ("date_number" in src) checkPath(b.entity, src.date_number, at);
      }
      for (const [out, field] of Object.entries(b.outputs)) if (!fieldsOf(b.entity).has(field)) err(`${p}.outputs.${out}`, `champ de sortie inconnu : ${b.entity}.${field}`);
    }
    if (model) {
      const bound = new Set(Object.keys(b.inputs));
      for (const f of model.inputs ?? []) if (!bound.has(f.name) && f.required !== false && f.default === undefined) err(`${p}.inputs`, `entrée obligatoire du module non liée : ${f.name}`);
    }
  });
  return issues;
}
