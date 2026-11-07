import { compile, referencedVars } from "./expr";
import { BUILTIN_VARS, KNOWN_ACTION_KEYS, orderRules, splitConditionKey, stageOf } from "./engine";
import { fieldType } from "./inputs";
import { STAGES, type AppSchema, type Condition, type InputField, type Issue, type RuleModel } from "../types";

/**
 * Validation statique d'un modèle de règles AVANT exécution.
 * - error   : le modèle n'est pas exécutable de façon fiable → publication refusée.
 * - warning : exécutable, mais une partie est ignorée ou suspecte.
 */
export function validateModel(model: RuleModel, opts: { fields?: InputField[] | null } = {}): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string, rule_id?: string, path?: string) => issues.push({ level: "error", message, rule_id, path });
  const warn = (message: string, rule_id?: string, path?: string) => issues.push({ level: "warning", message, rule_id, path });

  const rules = model.rules ?? [];
  if (!rules.length) warn("Le modèle ne contient aucune règle.");

  // Identifiants uniques
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) err(`Identifiant de règle dupliqué : ${r.id}`, r.id);
    seen.add(r.id);
  }

  // Variables connues : champs du schéma + variables du moteur + variables posées par `set`
  const fields = opts.fields ?? model.inputs ?? null;
  const fieldNames = new Set((fields ?? []).map((f) => f.name));
  const setVars = new Set<string>();
  for (const r of rules) if (r.action?.set && typeof r.action.set === "object") for (const k of Object.keys(r.action.set)) setVars.add(k);
  const known = (v: string) => fieldNames.has(v) || BUILTIN_VARS.includes(v) || setVars.has(v) || v === "quantity";
  const checkVars = fields?.length ? true : false;

  const order = orderRules(rules);
  const position = new Map(order.map((x, i) => [x.rule.id, i]));

  for (const r of rules) {
    const id = r.id;
    const keys = Object.keys(r.action ?? {});
    const recognized = keys.filter((k) => KNOWN_ACTION_KEYS.has(k));
    const unknown = keys.filter((k) => !KNOWN_ACTION_KEYS.has(k));
    if (!recognized.length) err(`Aucune action exécutable (${keys.join(", ") || "action vide"}). Actions prises en charge : ${[...KNOWN_ACTION_KEYS].join(", ")}`, id, "action");
    else if (unknown.length) warn(`Action(s) non prise(s) en charge, ignorée(s) : ${unknown.join(", ")}`, id, "action");

    const stage = stageOf(r);
    if (r.stage && !(STAGES as readonly string[]).includes(r.stage)) err(`Étape inconnue « ${r.stage} »`, id, "stage");
    if ((r.action?.error !== undefined || r.action?.reject !== undefined) && stage !== "validation") {
      err("Une action `error` doit être dans l'étape validation", id, "stage");
    }
    if (stage === "validation" && typeof (r.action?.error ?? r.action?.reject) !== "string") err("`error` doit être un message texte", id, "action.error");

    // Valeurs numériques / expressions
    for (const [k, v] of Object.entries(r.action ?? {})) {
      if (k === "set" || k === "error" || k === "reject") continue;
      if (k === "round") {
        const ro = v as { decimals?: unknown; mode?: unknown };
        if (typeof ro !== "object" || ro === null) err("`round` doit être un objet { decimals, mode }", id, "action.round");
        else {
          if (ro.decimals !== undefined && (!Number.isInteger(ro.decimals) || (ro.decimals as number) < 0 || (ro.decimals as number) > 6)) err("round.decimals doit être un entier entre 0 et 6", id);
          if (ro.mode !== undefined && !["half_up", "half_even", "floor", "ceil"].includes(String(ro.mode))) err(`round.mode inconnu « ${ro.mode} »`, id);
        }
        continue;
      }
      if (!KNOWN_ACTION_KEYS.has(k)) continue;
      checkValue(v, `action.${k}`);
    }
    if (r.action?.set !== undefined) {
      if (typeof r.action.set !== "object" || r.action.set === null || Array.isArray(r.action.set)) err("`set` doit être un objet { variable: valeur }", id, "action.set");
      else
        for (const [k, v] of Object.entries(r.action.set as Record<string, unknown>)) {
          if (fieldNames.has(k)) warn(`\`set\` écrase le champ d'entrée « ${k} »`, id, `action.set.${k}`);
          if (typeof v === "string") {
            try {
              compile(v);
              for (const name of compile(v).vars) if (checkVars && !known(name)) warn(`Variable inconnue « ${name} » dans set.${k}`, id);
            } catch {
              /* texte littéral accepté */
            }
          }
        }
    }

    // Conditions
    checkCondition(r.condition, "condition");

    // Dépendances
    for (const dep of r.depends_on ?? []) {
      if (!seen.has(dep)) err(`depends_on : règle inconnue ${dep}`, id, "depends_on");
      else if ((position.get(dep) ?? 0) >= (position.get(id) ?? 0)) err(`depends_on : ${dep} s'exécute après ${id} (ordre incompatible)`, id, "depends_on");
    }

    function checkValue(v: unknown, path: string) {
      if (typeof v === "number") {
        if (!Number.isFinite(v)) err(`Valeur non finie (${path})`, id, path);
        return;
      }
      if (typeof v !== "string") {
        err(`Nombre ou expression attendu (${path})`, id, path);
        return;
      }
      try {
        for (const name of referencedVars(v)) if (checkVars && !known(name)) warn(`Variable inconnue « ${name} » (${path})`, id, path);
      } catch (e) {
        err(`Expression invalide (${path}) : ${(e as Error).message}`, id, path);
      }
    }

    function checkCondition(c: Condition | undefined, path: string) {
      if (c === undefined) return;
      if (typeof c !== "object" || c === null || Array.isArray(c)) {
        err("La condition doit être un objet", id, path);
        return;
      }
      for (const [key, val] of Object.entries(c)) {
        const p = `${path}.${key}`;
        if (key === "any" || key === "all") {
          if (!Array.isArray(val)) err(`${key} doit être une liste de conditions`, id, p);
          else val.forEach((x, i) => checkCondition(x as Condition, `${p}[${i}]`));
          continue;
        }
        if (key === "not") {
          checkCondition(val as Condition, p);
          continue;
        }
        if (key === "expr") {
          if (typeof val !== "string") err("expr doit être une chaîne", id, p);
          else
            try {
              for (const name of compile(val).vars) if (checkVars && !known(name)) warn(`Variable inconnue « ${name} » dans expr`, id, p);
            } catch (e) {
              err(`Expression invalide : ${(e as Error).message}`, id, p);
            }
          continue;
        }
        const { field, op } = splitConditionKey(key, (k) => fieldNames.has(k));
        if (checkVars && !known(field)) warn(`La condition porte sur « ${field} », qui n'est ni un champ du formulaire ni une variable calculée`, id, p);
        if (op === "between" && !(Array.isArray(val) && val.length === 2 && val.every((x) => typeof x === "number"))) err(`${key} : [min, max] numériques attendus`, id, p);
        if ((op === "in" || op === "nin" || op === "not_in") && !Array.isArray(val)) err(`${key} : liste attendue`, id, p);
        if (["gte", "gt", "lte", "lt"].includes(op) && typeof val !== "number") err(`${key} : valeur numérique attendue`, id, p);
        if (val !== null && typeof val === "object" && !Array.isArray(val)) err(`${key} : valeur scalaire attendue`, id, p);
      }
    }
  }

  // Conflits statiques : même cible, même condition, sans groupe exclusif
  const targets = new Map<string, { id: string; cond: string; group?: string }[]>();
  for (const r of rules) {
    const tgts = ["unit_price", "set_unit_price", "base_total", "base_price", "total_price"].filter((k) => r.action?.[k] !== undefined);
    if (r.action?.set && typeof r.action.set === "object") tgts.push(...Object.keys(r.action.set));
    for (const t of tgts) {
      const key = t === "set_unit_price" ? "unit_price" : t === "base_price" ? "base_total" : t;
      const list = targets.get(key) ?? [];
      list.push({ id: r.id, cond: JSON.stringify(r.condition ?? {}), group: r.group });
      targets.set(key, list);
    }
  }
  for (const [t, list] of targets) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i],
          b = list[j];
        if (a.cond === b.cond && !(a.group && a.group === b.group)) warn(`Conflit : ${a.id} et ${b.id} fixent ${t} sous la même condition (la dernière exécutée l'emporte)`, b.id);
      }
  }

  // Groupes répartis sur plusieurs étapes
  const groupStages = new Map<string, Set<string>>();
  for (const { rule, stage } of order) if (rule.group) groupStages.set(rule.group, (groupStages.get(rule.group) ?? new Set()).add(stage));
  for (const [g, st] of groupStages) if (st.size > 1) warn(`Le groupe « ${g} » couvre plusieurs étapes (${[...st].join(", ")}) : l'exclusivité ne vaut que dans l'ordre d'exécution`);

  return issues;
}

/** Validation d'un schéma d'interface. */
export function validateSchema(schema: AppSchema): Issue[] {
  const issues: Issue[] = [];
  const names = new Set<string>();
  for (const f of schema.fields ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name)) issues.push({ level: "error", field: f.name, message: `Nom de champ invalide « ${f.name} » (lettres, chiffres, _)` });
    if (names.has(f.name)) issues.push({ level: "error", field: f.name, message: `Champ dupliqué « ${f.name} »` });
    names.add(f.name);
    const t = fieldType(f);
    if (t === null) issues.push({ level: "warning", field: f.name, message: `Type « ${f.type} » non pris en charge : le champ sera signalé comme non reconstruit` });
    if (t === "enum" && !f.options?.length) issues.push({ level: "warning", field: f.name, message: "Liste sans options : saisie libre" });
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) issues.push({ level: "error", field: f.name, message: "min > max" });
    if (f.pattern) {
      try {
        new RegExp(f.pattern);
        if (f.pattern.length > 200) throw new Error("trop long");
      } catch {
        issues.push({ level: "error", field: f.name, message: "Motif (pattern) invalide" });
      }
    }
    if (f.default !== undefined && t === "enum" && f.options?.length && !f.options.some((o) => String(o.value) === String(f.default))) {
      issues.push({ level: "warning", field: f.name, message: `Valeur par défaut « ${f.default} » absente des options` });
    }
  }
  const sectionIds = new Set((schema.sections ?? []).map((s) => s.id));
  for (const f of schema.fields ?? []) if (f.section && !sectionIds.has(f.section)) issues.push({ level: "warning", field: f.name, message: `Section inconnue « ${f.section} »` });
  for (const t of schema.tables ?? []) if (!names.has(t.vary)) issues.push({ level: "error", message: `Tableau « ${t.title} » : champ « ${t.vary} » inconnu` });
  return issues;
}
