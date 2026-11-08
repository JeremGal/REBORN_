import { z } from "zod";
import { ApiError, handler, json, parseWith, readJson } from "@/lib/http";
import { currentPrincipal, displayName } from "@/lib/auth/principal";
import { compile } from "@/lib/engine/expr";
import { checkBusinessModel, type BusinessModel } from "@/lib/migration/business-model";
import { checkMapping, effectiveMapping, FIELD_TYPES, reviewItems, TransformSchema, type EntityMap, type FieldMap, type MappingIssue, type MigrationMapping } from "@/lib/migration/mapping";
import { assertActive, businessModelPackage, currentMapping, decide, getProject, loadSources, migrationLog, planStatus, profile, setMapping } from "@/lib/migration/project";
import { convert, TransformError, type StoredValue } from "@/lib/migration/transforms";

export const dynamic = "force-dynamic";

/**
 * Correction d'un champ des correspondances par le propriétaire du projet (étape Correspondances).
 *
 * POST { version, entity, field, op, changes?, comment?, dry_run? } :
 *  - op « update » : nom affiché, ancienne colonne, type, conversion, caractère obligatoire, valeurs
 *    autorisées. Un champ protégé (historique comptable) ou une relation ne peut changer que de nom affiché.
 *  - op « exclude » : le champ n'est plus repris (champ sûr ; un point incertain se rejette par décision).
 *  - op « restore » : le champ retiré revient avec sa définition de la dernière version qui le contenait.
 *  - dry_run : rien n'est enregistré ; aperçu de la conversion sur TOUTES les valeurs réelles de la colonne.
 * Chaque correction crée une nouvelle version des correspondances (origine « user ») : l'identifiant du
 * nouveau logiciel (target.id) et les noms internes des champs ne changent jamais. Une correction qui
 * introduirait une erreur bloquante, ou casserait un modèle métier validé, est refusée sans rien créer.
 * La version corrigée doit être la version en vigueur (409 sinon : rien n'est écrasé).
 *
 * GET : champs retirés par une correction (reprenables), d'après l'historique des versions.
 */

const Ident = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "identifiant interne attendu");
const EDITABLE_TYPES = FIELD_TYPES.filter((t) => t !== "reference") as [Exclude<(typeof FIELD_TYPES)[number], "reference">, ...Exclude<(typeof FIELD_TYPES)[number], "reference">[]];

const ChangesSchema = z
  .object({
    label: z.string().trim().min(1, "nom affiché requis").max(80, "nom affiché : 80 caractères au plus").optional(),
    source: z.string().min(1).max(200).optional(),
    type: z.enum(EDITABLE_TYPES).optional(),
    transforms: z.array(TransformSchema).max(12).optional(),
    required: z.boolean().optional(),
    options: z.array(z.object({ value: z.string().max(200), label: z.string().max(80).optional() }).strict()).max(200).optional(),
  })
  .strict();

const BodySchema = z
  .object({
    version: z.number().int().positive(),
    entity: Ident,
    field: Ident,
    op: z.enum(["update", "exclude", "restore"]),
    changes: ChangesSchema.optional(),
    comment: z.string().trim().max(500).optional(),
    dry_run: z.boolean().optional(),
  })
  .strict();
type Changes = z.output<typeof ChangesSchema>;

const TYPE_FR: Record<string, string> = {
  text: "texte",
  integer: "entier",
  decimal: "décimal",
  money: "montant",
  percent: "pourcentage",
  date: "date",
  boolean: "oui / non",
  enum: "liste de valeurs",
  email: "e-mail",
  phone: "téléphone",
  reference: "relation",
};
const SENSITIVE = /(pass|pwd|mdp|mot_?de_?passe|secret|token|jeton|api_?key|hash|salt)/i;
const labelOf = (f: Pick<FieldMap, "label" | "name">) => f.label ?? f.name;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const varsOf = (expr: string): string[] => {
  try {
    return compile(expr).vars;
  } catch {
    return [];
  }
};
/** Clé d'un problème indépendante de la position (les indices bougent quand un champ est retiré). */
const issueKey = (i: MappingIssue) => `${i.level}|${i.path.replace(/\.\d+\(/g, "(")}|${i.message}`;

function describeTransforms(list: FieldMap["transforms"]): string {
  if (!list?.length) return "aucune";
  return list
    .map((t) => {
      if (typeof t === "string") return { trim: "espaces retirés", lower: "minuscules", upper: "majuscules", collapse_spaces: "espaces réduits", digits: "chiffres seulement" }[t] ?? t;
      if ("date" in t) return `date ${t.date === "DD/MM/YYYY" ? "JJ/MM/AAAA" : t.date === "MM/DD/YYYY" ? "MM/JJ/AAAA" : t.date === "YYYY-MM-DD" ? "AAAA-MM-JJ" : "Excel"}`;
      if ("decimal" in t) return `nombre (${t.decimal === "comma" ? "virgule" : t.decimal === "dot" ? "point" : "séparateur détecté"})`;
      if ("money" in t) return `montant (${t.money === "comma" ? "virgule" : t.money === "dot" ? "point" : "séparateur détecté"})`;
      if ("boolean" in t) return "oui / non";
      if ("map" in t) return "codes remplacés";
      if ("null_if" in t) return "valeurs effacées";
      return "transformation";
    })
    .join(" puis ");
}

/** Usages du champ dans les règles des correspondances (contrôles, calculs, totaux). */
function ruleUses(m: MigrationMapping, e: EntityMap, name: string): string[] {
  const out: string[] = [];
  for (const c of e.checks ?? []) if (varsOf(c.expr).includes(name)) out.push(`contrôle « ${c.description ?? c.id} »`);
  for (const c of e.computed ?? []) if (c.field === name || varsOf(c.expr).includes(name)) out.push(`calcul de « ${labelOf(e.fields.find((f) => f.name === c.field) ?? { name: c.field })} »`);
  for (const a of e.aggregates ?? []) if (a.field === name) out.push(`total « ${a.description ?? a.id} »`);
  for (const p of m.entities) for (const a of p.aggregates ?? []) if (a.children === e.name && (a.via === name || varsOf(a.expr).includes(name))) out.push(`total « ${a.description ?? a.id} » de ${p.label ?? p.name}`);
  return out;
}

/** Modèles métier (validés ou à valider) qui ne fonctionneraient plus si ce champ disparaissait. */
function modelUses(m: MigrationMapping, entity: string, name: string): { version: number; validated: boolean }[] {
  const p = getProject();
  const decisions = p.decisions;
  const before = effectiveMapping(m, decisions);
  const without = effectiveMapping({ ...m, entities: m.entities.map((e) => (e.name === entity ? { ...e, fields: e.fields.filter((f) => f.name !== name) } : e)) }, decisions);
  const out: { version: number; validated: boolean }[] = [];
  for (const meta of p.business_models ?? []) {
    if (meta.status === "rejected") continue;
    let pkg;
    try {
      pkg = businessModelPackage(meta.version);
    } catch {
      continue;
    }
    const bm = { contract_version: pkg.contract_version ?? "1.0", modules: pkg.modules, bindings: pkg.bindings } as BusinessModel;
    const keys = new Set(checkBusinessModel(bm, before).filter((i) => i.level === "error").map((i) => `${i.path}|${i.message}`));
    if (checkBusinessModel(bm, without).some((i) => i.level === "error" && !keys.has(`${i.path}|${i.message}`))) out.push({ version: meta.version, validated: meta.status === "validated" });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Aperçu de conversion sur les valeurs réelles                          */
/* ------------------------------------------------------------------ */

interface Preview {
  column: string;
  total: number;
  converted: number;
  empty: number;
  failed: number;
  /** Lignes qui seraient rejetées : valeur vide ou non convertible d'un champ obligatoire. */
  rejected: number;
  examples: { raw: string | number | boolean | null; stored: StoredValue; error?: string }[];
  masked: boolean;
}

function columnValues(e: EntityMap, column: string): (string | number | boolean | null)[] | null {
  const t = loadSources().tables.get(e.source.table);
  if (!t) return null;
  const i = t.columns.indexOf(column);
  if (i < 0) return null;
  return t.rows.map((r) => (r[i] ?? null) as string | number | boolean | null);
}

type Outcome = { ok: true; v: StoredValue } | { ok: false; error: string };
function convertOne(raw: string | number | boolean | null, f: FieldMap): Outcome {
  try {
    return { ok: true, v: convert(raw, f) };
  } catch (x) {
    if (x instanceof TransformError) return { ok: false, error: x.message };
    throw x;
  }
}

function preview(e: EntityMap, f: FieldMap): Preview | null {
  if (f.type === "reference") return null;
  const values = columnValues(e, f.source);
  if (!values) return null;
  const masked = SENSITIVE.test(f.source) || SENSITIVE.test(f.name);
  let converted = 0;
  let empty = 0;
  let failed = 0;
  const failures = new Map<string, Preview["examples"][number]>();
  const successes = new Map<string, Preview["examples"][number]>();
  for (const raw of values) {
    const o = convertOne(raw, f);
    const k = JSON.stringify(raw);
    if (!o.ok) {
      failed++;
      if (failures.size < 4 && !failures.has(k)) failures.set(k, { raw, stored: null, error: o.error });
    } else if (o.v === null) empty++;
    else {
      converted++;
      if (successes.size < 8 && !successes.has(k)) successes.set(k, { raw, stored: o.v });
    }
  }
  const examples = [...failures.values(), ...successes.values()].slice(0, 8).map((x) => (masked ? { raw: "•••• (masqué)", stored: x.stored === null ? null : "•••• (masqué)", ...(x.error ? { error: "valeur non convertible" } : {}) } : x));
  return { column: f.source, total: values.length, converted, empty, failed, rejected: f.required ? empty + failed : 0, examples, masked };
}

/** Nombre de lignes dont la valeur enregistrée changerait entre deux définitions du champ. */
function changedCount(e: EntityMap, a: FieldMap, b: FieldMap): number | null {
  if (a.type === "reference" || b.type === "reference") return null;
  const va = columnValues(e, a.source);
  const vb = a.source === b.source ? va : columnValues(e, b.source);
  if (!va || !vb) return null;
  let n = 0;
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x = convertOne(va[i] ?? null, a);
    const y = convertOne(vb[i] ?? null, b);
    if (!same(x.ok ? x.v : `!${x.error}`, y.ok ? y.v : `!${y.error}`)) n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Construction de la version corrigée                                   */
/* ------------------------------------------------------------------ */

const MARK = /^Corrigé le [^:]+? par .+? : .*?\.(?: Note d'origine : ([\s\S]*))?$/;
/** Note du champ corrigé : trace lisible de la correction, la note d'origine est conservée. */
function correctionNote(previous: string | undefined, who: string, summary: string[]): string {
  const original = previous ? (MARK.exec(previous) ? (MARK.exec(previous)![1] ?? "") : previous) : "";
  const day = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `Corrigé le ${day} par ${who} : ${summary.join(" ; ")}.${original ? ` Note d'origine : ${original}` : ""}`;
}

function applyChanges(m: MigrationMapping, e: EntityMap, f: FieldMap, c: Changes): { next: FieldMap; summary: string[] } {
  const next: FieldMap = { ...f };
  const summary: string[] = [];
  const nextType = c.type ?? f.type;
  const structural =
    (c.source !== undefined && c.source !== f.source) ||
    (c.type !== undefined && c.type !== f.type) ||
    (c.transforms !== undefined && !same(c.transforms, f.transforms ?? [])) ||
    (c.required !== undefined && c.required !== !!f.required) ||
    (c.options !== undefined && !same(c.options, f.options ?? []));
  if (structural && f.accounting)
    throw new ApiError(409, `« ${labelOf(f)} » fait partie de l'historique protégé : seul son nom affiché peut être corrigé ici. Pour corriger sa lecture, une nouvelle version des correspondances doit être fournie par l'Analyste ou l'équipe REBORN.`);
  if (structural && f.type === "reference") throw new ApiError(409, `« ${labelOf(f)} » est une relation entre fiches : seul son nom affiché peut être corrigé ici.`);

  if (c.label !== undefined && c.label !== labelOf(f)) {
    summary.push(`nom affiché « ${labelOf(f)} » → « ${c.label} »`);
    next.label = c.label;
  }
  if (c.source !== undefined && c.source !== f.source) {
    summary.push(`ancienne colonne ${f.source} → ${c.source}`);
    next.source = c.source;
  }
  if (c.type !== undefined && c.type !== f.type) {
    const uses = [...ruleUses(m, e, f.name), ...modelUses(m, e.name, f.name).map((u) => `modèle métier v${u.version}`)];
    if (uses.length) throw new ApiError(409, `« ${labelOf(f)} » sert à : ${uses.join(", ")}. Son type ne peut pas être changé ici.`);
    summary.push(`type ${TYPE_FR[f.type] ?? f.type} → ${TYPE_FR[c.type] ?? c.type}`);
    next.type = c.type;
  }
  if (c.transforms !== undefined && !same(c.transforms, f.transforms ?? [])) {
    summary.push(`conversion « ${describeTransforms(f.transforms)} » → « ${describeTransforms(c.transforms)} »`);
    next.transforms = c.transforms.length ? c.transforms : undefined;
  }
  if (c.required !== undefined && c.required !== !!f.required) {
    summary.push(c.required ? "devient obligatoire" : "devient facultatif");
    next.required = c.required || undefined;
  }
  if (nextType === "enum") {
    if (c.options !== undefined && !same(c.options, f.options ?? [])) {
      summary.push("valeurs autorisées modifiées");
      next.options = c.options.length ? c.options : undefined;
    }
  } else if (next.options) {
    summary.push("liste de valeurs autorisées retirée");
    delete next.options;
  }
  return { next, summary };
}

/** Champ retiré : dernière version précédente qui contenait ce champ (même entité, même nom interne). */
function removedDefinition(entity: string, field: string): { def: FieldMap; version: number; after: string | null } | null {
  const versions = [...getProject().mappings].reverse().slice(1);
  for (const v of versions) {
    const e = v.mapping.entities.find((x) => x.name === entity);
    const i = e ? e.fields.findIndex((x) => x.name === field) : -1;
    if (e && i >= 0) return { def: e.fields[i], version: v.version, after: i > 0 ? e.fields[i - 1].name : null };
  }
  return null;
}

/** Ce que le retrait du champ entraîne (refus si une règle, un titre ou un modèle validé en dépend). */
function exclusionPlan(m: MigrationMapping, e: EntityMap, f: FieldMap): { consequences: string[]; blockers: string[] } {
  const consequences: string[] = [];
  const blockers: string[] = [];
  if (e.fields.length <= 1) blockers.push("c'est le seul champ repris de cette table");
  if (f.accounting) blockers.push("il fait partie de l'historique protégé (données comptables ou commerciales)");
  if (e.title_field === f.name) blockers.push("il sert de titre aux fiches");
  for (const d of e.duplicates ?? []) if (d.fields.includes(f.name)) blockers.push(`il sert à repérer les doublons (« ${d.label ?? d.fields.join(" + ")} »)`);
  if (e.line_of?.via === f.name) blockers.push("il relie les lignes à leur document");
  if (e.ui?.breakdown === f.name) blockers.push("il sert de répartition au tableau de bord");
  for (const i of e.ui?.indicators ?? []) if (i.field === f.name) blockers.push(`il alimente l'indicateur « ${i.label} »`);
  blockers.push(...ruleUses(m, e, f.name).map((u) => `il sert au ${u}`));
  for (const u of modelUses(m, e.name, f.name)) (u.validated ? blockers : consequences).push(u.validated ? `il est utilisé par le modèle métier validé v${u.version}` : `le modèle métier v${u.version} (à valider) ne pourra plus être validé tel quel`);
  if (e.ui?.list_fields?.includes(f.name) || e.ui?.search_fields?.includes(f.name)) consequences.push("il disparaît des colonnes de la liste et de la recherche");
  if (f.required) consequences.push("il était obligatoire : les fiches n'auront plus cette information");
  consequences.push(`la colonne ${f.source} n'est plus migrée : ses valeurs restent dans la traçabilité de chaque fiche et la colonne figure au rapport d'écarts`);
  return { consequences, blockers };
}

/* ------------------------------------------------------------------ */
/* Routes                                                               */
/* ------------------------------------------------------------------ */

export const POST = handler(
  async (req) => {
    const b = parseWith(BodySchema, await readJson(req));
    const cur = currentMapping();
    if (!cur) throw new ApiError(409, "Aucune correspondance à corriger : obtenez d'abord une première version");
    if (b.version !== cur.version)
      throw new ApiError(409, `Les correspondances ont changé : la version ${cur.version} est en vigueur et vous corrigiez la version ${b.version}. Rechargez la page, puis refaites la correction.`);
    if (!b.dry_run) assertActive();
    const who = displayName(currentPrincipal());
    const mapping = structuredClone(cur.mapping) as MigrationMapping;
    const e = mapping.entities.find((x) => x.name === b.entity);
    if (!e) throw new ApiError(404, `Table inconnue dans la version ${cur.version} des correspondances`);
    const reviewKey = `field:${e.name}.${b.field}`;
    const isReview = reviewItems(cur.mapping).some((i) => i.key === reviewKey);

    let before: FieldMap | null = null;
    let after: FieldMap | null = null;
    let summary: string[] = [];
    let consequences: string[] = [];

    if (b.op === "update") {
      const i = e.fields.findIndex((x) => x.name === b.field);
      if (i < 0) throw new ApiError(404, `Champ inconnu dans la version ${cur.version} des correspondances`);
      before = e.fields[i];
      const r = applyChanges(cur.mapping, e, before, b.changes ?? {});
      // Sans modification, seul l'aperçu de la définition actuelle est possible (ouverture du formulaire)
      if (!r.summary.length && !b.dry_run) throw new ApiError(400, "Aucune modification : le champ est déjà défini ainsi");
      summary = r.summary;
      after = r.summary.length ? { ...r.next, note: correctionNote(before.note, who, summary) } : before;
      e.fields[i] = after;
    } else if (b.op === "exclude") {
      const i = e.fields.findIndex((x) => x.name === b.field);
      if (i < 0) throw new ApiError(404, `Champ inconnu dans la version ${cur.version} des correspondances`);
      before = e.fields[i];
      if (isReview) throw new ApiError(409, `« ${labelOf(before)} » est une proposition à valider : rejetez-la par une décision (elle reste modifiable).`);
      const plan = exclusionPlan(cur.mapping, e, before);
      if (plan.blockers.length) throw new ApiError(409, `« ${labelOf(before)} » ne peut pas être retiré : ${plan.blockers.join(" ; ")}.`);
      consequences = plan.consequences;
      summary = [`champ « ${labelOf(before)} » retiré (colonne ${before.source})`];
      e.fields.splice(i, 1);
      if (e.ui) {
        e.ui = { ...e.ui, ...(e.ui.list_fields ? { list_fields: e.ui.list_fields.filter((n) => n !== b.field) } : {}), ...(e.ui.search_fields ? { search_fields: e.ui.search_fields.filter((n) => n !== b.field) } : {}) };
      }
    } else {
      if (e.fields.some((x) => x.name === b.field)) throw new ApiError(409, "Ce champ est déjà repris dans la version en vigueur");
      const found = removedDefinition(e.name, b.field);
      if (!found) throw new ApiError(404, "Aucune version précédente ne contient ce champ");
      after = found.def;
      // Même place qu'avant : après le champ qui le précédait (s'il existe encore), sinon en tête ou en fin
      const prev = found.after === null ? -1 : e.fields.findIndex((x) => x.name === found.after);
      e.fields.splice(found.after === null ? 0 : prev >= 0 ? prev + 1 : e.fields.length, 0, after);
      summary = [`champ « ${labelOf(after)} » repris (définition de la version ${found.version})`];
    }
    if (mapping.target.id !== cur.mapping.target.id) throw new ApiError(500, "Identifiant du nouveau logiciel modifié : correction annulée");

    // Aucune version cassée : les erreurs bloquantes nouvelles sont refusées avant toute écriture
    const { archives } = loadSources();
    const known = new Set(cur.issues.map(issueKey));
    const fresh = checkMapping(mapping, profile(), [...archives.keys()]).filter((i) => !known.has(issueKey(i)));
    const errors = fresh.filter((i) => i.level === "error");
    if (errors.length) throw new ApiError(400, `Correction refusée : ${errors.map((x) => x.message).join(" ; ")}`, errors);
    const warnings = fresh.filter((i) => i.level === "warning").map((i) => i.message);

    const pv = (f: FieldMap | null) => (f ? preview(e, f) : null);
    if (b.dry_run) {
      return json({
        ok: true,
        dry_run: true,
        op: b.op,
        summary,
        consequences,
        warnings,
        review: isReview,
        field: after ?? before,
        current: pv(before),
        candidate: b.op === "exclude" ? null : pv(after),
        changed: before && after ? changedCount(e, before, after) : null,
      });
    }

    const v = setMapping(mapping, "user");
    // Corriger une proposition incertaine vaut confirmation : la décision est consignée au nom du compte
    if (b.op === "update" && reviewItems(v.mapping).some((i) => i.key === reviewKey)) decide(reviewKey, "accepted", who, b.comment || `Corrigé : ${summary.join(" ; ")}`);
    const name = labelOf(after ?? before!);
    migrationLog(
      `${b.op === "update" ? "Champ corrigé" : b.op === "exclude" ? "Champ retiré" : "Champ repris"} : ${e.label ?? e.name} · ${name} (correspondances v${v.version}, par ${who})`,
      `${summary.join(" ; ")}${b.comment ? ` — « ${b.comment} »` : ""}`,
    );
    const st = planStatus();
    return json({ ok: true, version: v.version, op: b.op, summary, consequences, warnings, issues: v.issues, review: { items: st.items, pending: st.pending, can_run: st.can_run, blockers: st.blockers } });
  },
  { access: ["owner"], write: true, project: "query" },
);

/** Champs retirés par une correction, reprenables : { version, removed: [{ entity, field, label, source, type, from_version }] }. */
export const GET = handler(
  async () => {
    const cur = currentMapping();
    if (!cur) return json({ version: null, removed: [] });
    const removed: { entity: string; field: string; label: string; source: string; type: string; from_version: number }[] = [];
    for (const e of cur.mapping.entities) {
      const present = new Set(e.fields.map((f) => f.name));
      const seen = new Set<string>();
      for (const v of [...getProject().mappings].reverse().slice(1)) {
        const old = v.mapping.entities.find((x) => x.name === e.name);
        for (const f of old?.fields ?? []) {
          if (present.has(f.name) || seen.has(f.name)) continue;
          seen.add(f.name);
          // Seuls les retraits faits par une correction sont proposés (pas les champs abandonnés par l'Analyste)
          const next = getProject().mappings.find((x) => x.version > v.version);
          if (next?.origin !== "user") continue;
          removed.push({ entity: e.name, field: f.name, label: labelOf(f), source: f.source, type: f.type, from_version: v.version });
        }
      }
    }
    return json({ version: cur.version, removed });
  },
  { access: ["owner"], project: "query" },
);
