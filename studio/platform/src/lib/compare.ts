import { compute, normalizeOutput } from "./engine/engine";
import { normalizeInputs, fieldType } from "./engine/inputs";
import type { ComparisonReport, ComparisonRow, InputField, Observation, Primitive, Rule, RuleDiff, RuleModel, StoredRuleModel } from "./types";

export { inferFields as buildForm } from "./appschema";

/* ------------------------------------------------------------------ */
/* Comparaison logiciel historique ↔ application reconstruite           */
/* ------------------------------------------------------------------ */

export function evidenceSet(model: RuleModel | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const r of model?.rules ?? []) for (const e of r.evidence ?? []) s.add(e);
  return s;
}

export interface CompareOptions {
  /** Champs de l'application reconstruite : la comparaison inclut sa validation des entrées. */
  fields?: InputField[] | null;
  evidence?: Set<string>;
}

export function compareOne(model: RuleModel | null | undefined, obs: Observation, opts: CompareOptions = {}): ComparisonRow {
  const evidence = opts.evidence ?? evidenceSet(model);
  const inputs = normalizeInputs(obs.inputs);
  const observed = normalizeOutput(obs.observed_output ?? {});
  const tolerance = model?.settings?.tolerance ?? 0.01;
  const primary = model?.settings?.output_field ?? "total_price";
  const row = {
    experiment_id: obs.experiment_id,
    investigation_id: obs.investigation_id,
    inputs,
    observed,
    independent: !evidence.has(obs.experiment_id),
  };

  // Expérience non menée à terme : exclue du score
  if (obs.status && obs.status !== "success" && obs.status !== "error") {
    return { ...row, computed: {}, status: "inconclusive", mismatched_fields: [], trace: [], reason: obs.error ?? "Expérience non aboutie" };
  }

  const result = compute(model, inputs, { fields: opts.fields ?? undefined });
  const refusedByRebuilt = result.status !== "ok";
  const base = { ...row, computed: result.outputs, computed_status: result.status, trace: result.trace };

  // L'original a refusé le cas (exception métier)
  if (obs.status === "error") {
    return refusedByRebuilt
      ? { ...base, status: "match", exception: true, mismatched_fields: [], reason: `Refus reproduit : ${result.errors.map((e) => e.message).join(" ; ")}` }
      : { ...base, status: "mismatch", exception: true, mismatched_fields: ["status"], reason: "L'original refuse ce cas, la reconstruction l'accepte" };
  }
  if (refusedByRebuilt) {
    return { ...base, status: "mismatch", mismatched_fields: ["status"], reason: `La reconstruction refuse un cas accepté par l'original : ${result.errors.map((e) => e.message).join(" ; ")}` };
  }

  const mismatched: string[] = [];
  let covered = 0;
  for (const [k, ov] of Object.entries(observed)) {
    if (!(k in result.outputs)) continue;
    covered++;
    if (!sameValue(ov, result.outputs[k], tolerance)) mismatched.push(k);
  }
  const pv = observed[primary];
  const cv = result.outputs[primary];
  const delta = typeof pv === "number" && typeof cv === "number" ? round2(cv - pv) : undefined;
  return {
    ...base,
    status: covered === 0 ? "not_covered" : mismatched.length ? "mismatch" : "match",
    delta,
    mismatched_fields: mismatched,
    reason: covered === 0 ? "Aucune sortie observée n'est produite par le modèle" : undefined,
  };
}

export function compareAll(
  model: StoredRuleModel | RuleModel | null | undefined,
  observations: Observation[],
  investigationId: string | "all" = "all",
  opts: CompareOptions = {},
): ComparisonReport {
  const evidence = evidenceSet(model);
  const scoped = investigationId === "all" ? observations : observations.filter((o) => o.investigation_id === investigationId);

  // Une expérience rejouée remplace la précédente (dernière observation retenue)
  const latest = new Map<string, Observation>();
  for (const o of scoped) latest.set(o.experiment_id, o);

  const rows = [...latest.values()].map((o) => compareOne(model, o, { ...opts, evidence }));
  const scoredRows = rows.filter((r) => r.status !== "inconclusive");
  const matched = rows.filter((r) => r.status === "match").length;
  const mismatched = rows.filter((r) => r.status === "mismatch").length;
  const notCovered = rows.filter((r) => r.status === "not_covered").length;
  const inconclusive = rows.length - scoredRows.length;
  const construction = scoredRows.filter((r) => !r.independent);
  const indep = scoredRows.filter((r) => r.independent);
  const indepMatched = indep.filter((r) => r.status === "match").length;
  const scored = scoredRows.length;

  // Couverture des règles : dans combien d'expériences comparées chaque règle s'applique
  const ruleCoverage = (model?.rules ?? []).map((rule) => {
    const hit = scoredRows.filter((r) => r.trace.some((t) => t.rule_id === rule.id && t.applied));
    return { rule_id: rule.id, applied: hit.length, matched: hit.filter((r) => r.status === "match").length };
  });

  // Couverture des entrées
  const inputCoverage = new Map<string, Set<Primitive>>();
  for (const r of scoredRows) for (const [k, v] of Object.entries(r.inputs)) (inputCoverage.get(k) ?? inputCoverage.set(k, new Set()).get(k)!).add(v);
  const input_coverage = [...inputCoverage.entries()].map(([field, set]) => {
    const values = [...set];
    const nums = values.filter((v): v is number => typeof v === "number");
    return nums.length === values.length && nums.length
      ? { field, values: [...new Set(nums)].sort((a, b) => a - b).slice(0, 30), min: Math.min(...nums), max: Math.max(...nums) }
      : { field, values: values.slice(0, 30) };
  });

  return {
    model_version: (model as StoredRuleModel | null | undefined)?.version ?? null,
    investigation_id: investigationId,
    total: rows.length,
    scored,
    matched,
    mismatched,
    errors: inconclusive,
    not_covered: notCovered,
    exceptions_matched: rows.filter((r) => r.exception && r.status === "match").length,
    equivalence: model && scored ? matched / scored : null,
    construction_total: construction.length,
    construction_matched: construction.filter((r) => r.status === "match").length,
    independent_total: indep.length,
    independent_matched: indepMatched,
    independent_equivalence: model && indep.length ? indepMatched / indep.length : null,
    max_abs_delta: rows.reduce((m, r) => Math.max(m, Math.abs(r.delta ?? 0)), 0),
    rule_coverage: ruleCoverage,
    input_coverage,
    limitations: limitations(model, rows, scored, indep.length, ruleCoverage, input_coverage, opts.fields ?? null),
    rows,
  };
}

function limitations(
  model: RuleModel | null | undefined,
  rows: ComparisonRow[],
  scored: number,
  independent: number,
  coverage: ComparisonReport["rule_coverage"],
  inputs: ComparisonReport["input_coverage"],
  fields: InputField[] | null,
): string[] {
  const out: string[] = [];
  if (!model) return ["Aucun modèle publié : rien n'est comparé."];
  if (!scored) return ["Aucune expérience comparable pour cette sélection."];
  out.push(`Score calculé sur ${scored} expérience${scored > 1 ? "s" : ""} : il ne garantit pas le comportement sur des entrées non testées.`);
  if (!independent) out.push("Aucun cas indépendant : le score mesure la reproduction des cas ayant servi à construire le modèle, pas sa généralisation.");
  else if (independent < 5) out.push(`Seulement ${independent} cas indépendant${independent > 1 ? "s" : ""} : validation à renforcer.`);
  const never = coverage.filter((c) => c.applied === 0).map((c) => c.rule_id);
  if (never.length) out.push(`Règle${never.length > 1 ? "s" : ""} jamais exercée${never.length > 1 ? "s" : ""} par une expérience : ${never.join(", ")}.`);
  for (const f of fields ?? []) {
    const cov = inputs.find((c) => c.field === f.name);
    if (fieldType(f) === "enum" && f.options?.length) {
      const seen = new Set((cov?.values ?? []).map((v) => String(v).toLowerCase()));
      const missing = f.options.filter((o) => !seen.has(String(o.value).toLowerCase())).map((o) => o.value);
      if (missing.length) out.push(`${f.label ?? f.name} : valeur${missing.length > 1 ? "s" : ""} jamais testée${missing.length > 1 ? "s" : ""} (${missing.join(", ")}).`);
    } else if (fieldType(f) === "boolean") {
      const seen = new Set((cov?.values ?? []).map(String));
      if (seen.size < 2) out.push(`${f.label ?? f.name} : un seul état testé${seen.size ? ` (${[...seen][0]})` : ""}.`);
    } else if (fieldType(f) === "number" && cov?.min !== undefined) {
      out.push(`${f.label ?? f.name} testé(e) entre ${cov.min} et ${cov.max} uniquement.`);
    }
  }
  const compared = new Set(rows.flatMap((r) => Object.keys(r.observed)));
  if (compared.size) out.push(`Sorties comparées : ${[...compared].join(", ")} (tolérance ± ${model.settings?.tolerance ?? 0.01}).`);
  const inconclusive = rows.filter((r) => r.status === "inconclusive").length;
  if (inconclusive) out.push(`${inconclusive} expérience${inconclusive > 1 ? "s" : ""} échouée${inconclusive > 1 ? "s" : ""} côté explorateur, exclue${inconclusive > 1 ? "s" : ""} du score.`);
  return out;
}

function sameValue(a: Primitive, b: number | string | boolean, tol: number): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= tol + 1e-9;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a).toLowerCase() === String(b).toLowerCase();
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Diff entre deux versions du modèle                                   */
/* ------------------------------------------------------------------ */

const IGNORED = new Set(["confidence", "evidence", "validation_status", "description"]);

export function diffModels(prev: RuleModel | null | undefined, next: RuleModel): RuleDiff[] {
  if (!prev) return next.rules.map((r) => ({ rule_id: r.id, kind: "added", after: r }));
  const before = new Map(prev.rules.map((r) => [r.id, r]));
  const after = new Map(next.rules.map((r) => [r.id, r]));
  const out: RuleDiff[] = [];
  for (const [id, r] of after) {
    const p = before.get(id);
    if (!p) {
      out.push({ rule_id: id, kind: "added", after: r });
      continue;
    }
    const fields = changedPaths(p, r).filter((f) => !IGNORED.has(f.split(".")[0]));
    if (fields.length) out.push({ rule_id: id, kind: "changed", before: p, after: r, fields });
  }
  for (const [id, r] of before) if (!after.has(id)) out.push({ rule_id: id, kind: "removed", before: r as Rule });
  return out;
}

function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => changedPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix || "(racine)"];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
