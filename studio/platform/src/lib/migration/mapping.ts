import { z } from "zod";
import { compile } from "../engine/expr";
import type { SourceProfile, TableProfile } from "./profile";
import type { FieldType, Transform } from "./transforms";
import { humanLabel, singularLabel } from "./labels";

/**
 * Contrat « correspondances de migration » (Alan → Jerem), version 1.0.
 * Décrit, entité par entité, d'où vient chaque champ du nouveau logiciel, par quelles
 * transformations explicites, avec quelle confiance. Toute correspondance dont la confiance
 * est inférieure au seuil doit être validée (ou exclue) par un humain avant l'import.
 */
export const MAPPING_CONTRACT_VERSION = "1.0";

const Ident = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "identifiant attendu : minuscules, chiffres et _ (60 caractères max)");
export const FIELD_TYPES = ["text", "integer", "decimal", "money", "percent", "date", "boolean", "enum", "email", "phone", "reference"] as const;

export const TransformSchema = z.union([
  z.enum(["trim", "lower", "upper", "collapse_spaces", "digits"]),
  z.object({ date: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "excel"]) }).strict(),
  z.object({ decimal: z.enum(["comma", "dot", "auto"]) }).strict(),
  z.object({ money: z.enum(["comma", "dot", "auto"]) }).strict(),
  z.object({ boolean: z.object({ true: z.array(z.string()), false: z.array(z.string()) }) }).strict(),
  z.object({ map: z.record(z.string(), z.string()) }).strict(),
  z.object({ null_if: z.array(z.string()) }).strict(),
]);

const Confidence = z.number().min(0).max(1);

export const FieldMapSchema = z
  .object({
    name: Ident,
    label: z.string().max(80).optional(),
    source: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional(),
    unique: z.boolean().optional(),
    transforms: z.array(TransformSchema).optional(),
    options: z.array(z.object({ value: z.string(), label: z.string().optional() })).optional(),
    references: Ident.optional(),
    on_missing: z.enum(["reject", "keep_unlinked"]).optional(),
    accounting: z.boolean().optional(),
    list: z.boolean().optional(),
    confidence: Confidence.optional(),
    note: z.string().optional(),
  })
  .strict();

const CheckSchema = z.object({ id: z.string().min(1), description: z.string().optional(), expr: z.string().min(1).max(500), severity: z.enum(["info", "warning", "blocking"]).default("warning") }).strict();
const AggregateSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    field: Ident,
    children: Ident,
    via: Ident,
    expr: z.string().min(1).max(500),
    severity: z.enum(["info", "warning", "blocking"]).default("info"),
    /** false : sert uniquement au calcul des nouveaux enregistrements, pas au contrôle de l'historique. */
    verify: z.boolean().default(true),
  })
  .strict();

export const EntityMapSchema = z
  .object({
    name: Ident,
    label: z.string().max(80).optional(),
    label_singular: z.string().max(80).optional(),
    source: z.object({ table: z.string().min(1), key: z.string().min(1) }).strict(),
    title_field: Ident.optional(),
    fields: z.array(FieldMapSchema).min(1).max(200),
    duplicates: z.array(z.object({ fields: z.array(Ident).min(1), label: z.string().optional() }).strict()).optional(),
    checks: z.array(CheckSchema).optional(),
    aggregates: z.array(AggregateSchema).optional(),
    computed: z.array(z.object({ field: Ident, expr: z.string().min(1).max(500) }).strict()).optional(),
    /**
     * Nature des données (protection de l'historique) : financial = document comptable (facture,
     * règlement…), commercial = document commercial (devis, commande), line = lignes d'un document,
     * master = référentiel. Les champs `accounting` des enregistrements migrés ne sont jamais modifiés.
     */
    classification: z
      .object({
        kind: z.enum(["financial", "commercial", "line", "master", "other"]),
        confidence: Confidence,
        parent: Ident.optional(),
        note: z.string().optional(),
      })
      .strict()
      .optional(),
    /** Lignes d'un document : on ne peut pas en ajouter à un document historique protégé. */
    line_of: z.object({ entity: Ident, via: Ident }).strict().optional(),
    /** Indications de présentation pour le logiciel généré (facultatives). */
    ui: z
      .object({
        nav: z.boolean().optional(),
        list_fields: z.array(Ident).optional(),
        search_fields: z.array(Ident).optional(),
        indicators: z.array(z.object({ label: z.string(), kind: z.enum(["count", "sum"]), field: Ident.optional() }).strict()).optional(),
        breakdown: Ident.optional(),
      })
      .strict()
      .optional(),
    confidence: Confidence.optional(),
    note: z.string().optional(),
  })
  .strict();

export const AttachmentMapSchema = z
  .object({
    source: z.object({ table: z.string().min(1), key: z.string().min(1) }).strict(),
    archive: z.string().min(1),
    path: z.string().min(1),
    filename: z.string().min(1),
    owner: z.union([
      z.object({ type: z.string().min(1), id: z.string().min(1), map: z.record(z.string(), Ident) }).strict(),
      z.object({ entity: Ident, id: z.string().min(1) }).strict(),
    ]),
    confidence: Confidence.optional(),
    note: z.string().optional(),
  })
  .strict();

export const MigrationMappingSchema = z
  .object({
    contract_version: z.string().default(MAPPING_CONTRACT_VERSION),
    source_system: z.string().optional(),
    target: z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/), name: z.string().min(1).max(80) }).strict(),
    review_threshold: z.number().min(0).max(1).default(0.9),
    entities: z.array(EntityMapSchema).min(1).max(100),
    attachments: z.array(AttachmentMapSchema).optional(),
    excluded_sources: z.array(z.object({ table: z.string(), reason: z.string() }).strict()).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type MigrationMapping = z.output<typeof MigrationMappingSchema>;
export type EntityMap = MigrationMapping["entities"][number];
export type FieldMap = EntityMap["fields"][number];
export type AttachmentMap = NonNullable<MigrationMapping["attachments"]>[number];

export interface MappingIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Points à valider                                                     */
/* ------------------------------------------------------------------ */

export interface ReviewItem {
  key: string;
  /** accounting : protection de l'historique (accepted = protégé, excluded = modifiable, décision tracée). */
  kind: "entity" | "field" | "attachment" | "accounting";
  label: string;
  confidence: number;
  detail: string;
}

export type Decision = { decision: "accepted" | "excluded"; at: string; by: string; comment?: string };

export function reviewItems(m: MigrationMapping): ReviewItem[] {
  const out: ReviewItem[] = [];
  const th = m.review_threshold;
  for (const e of m.entities) {
    if ((e.confidence ?? 1) < th) out.push({ key: `entity:${e.name}`, kind: "entity", label: `${e.label ?? e.name} ← ${e.source.table}`, confidence: e.confidence ?? 1, detail: e.note ?? "Entité proposée avec une confiance limitée" });
    const c = e.classification;
    if (c && c.kind !== "master" && c.kind !== "line" && c.confidence < th && e.fields.some((f) => f.accounting)) {
      const locked = e.fields.filter((f) => f.accounting).map((f) => f.label ?? f.name);
      out.push({
        key: `accounting:${e.name}`,
        kind: "accounting",
        label: `${e.label ?? e.name} : ${c.kind === "financial" ? "document comptable" : c.kind === "commercial" ? "document commercial" : "document historique"} à protéger ?`,
        confidence: c.confidence,
        detail: `Protégé par défaut : ${locked.join(", ")} des enregistrements migrés ne pourront pas être modifiés, ni leurs lignes complétées. Accepter = garder la protection · Exclure = autoriser les modifications (tracées). ${c.note ?? ""}`.trim(),
      });
    }
    for (const f of e.fields) {
      if ((f.confidence ?? 1) < th) {
        out.push({
          key: `field:${e.name}.${f.name}`,
          kind: "field",
          label: `${e.label ?? e.name} · ${f.label ?? f.name} ← ${f.source}`,
          confidence: f.confidence ?? 1,
          detail: f.note ?? describeField(f),
        });
      }
    }
  }
  (m.attachments ?? []).forEach((a, i) => {
    if ((a.confidence ?? 1) < th) out.push({ key: `attachment:${i}`, kind: "attachment", label: `Pièces jointes ← ${a.source.table} + ${a.archive}`, confidence: a.confidence ?? 1, detail: a.note ?? "Rattachement des fichiers aux enregistrements" });
  });
  return out;
}

export function describeField(f: FieldMap): string {
  const t = (f.transforms ?? []).map((x) => (typeof x === "string" ? x : `${Object.keys(x)[0]}`)).join(" → ");
  return `${f.type}${f.references ? ` → ${f.references}` : ""}${t ? ` · ${t}` : ""}`;
}

/** Correspondances effectivement appliquées : éléments exclus retirés. */
export function effectiveMapping(m: MigrationMapping, decisions: Record<string, Decision>): MigrationMapping {
  const excluded = (k: string) => decisions[k]?.decision === "excluded";
  // Protection de l'historique retirée par une décision humaine : l'entité et ses lignes deviennent modifiables
  const unprotected = new Set(m.entities.filter((e) => excluded(`accounting:${e.name}`)).map((e) => e.name));
  const entities = m.entities
    .filter((e) => !excluded(`entity:${e.name}`))
    .map((e) => {
      const fields = e.fields.filter((f) => !excluded(`field:${e.name}.${f.name}`));
      const free = unprotected.has(e.name) || (e.classification?.kind === "line" && unprotected.has(e.classification.parent ?? ""));
      return { ...e, fields: free ? fields.map((f) => ({ ...f, accounting: false })) : fields };
    });
  const names = new Set(entities.map((e) => e.name));
  return {
    ...m,
    entities: entities.map((e) => ({ ...e, fields: e.fields.filter((f) => f.type !== "reference" || names.has(f.references ?? "")) })),
    attachments: (m.attachments ?? []).filter((_, i) => !excluded(`attachment:${i}`)),
  };
}

/* ------------------------------------------------------------------ */
/* Cohérence avec la structure réellement lue                           */
/* ------------------------------------------------------------------ */

const RESERVED = new Set(["id", "rowid", "oid"]);

export function checkMapping(m: MigrationMapping, profile: SourceProfile, archives: string[] = []): MappingIssue[] {
  const issues: MappingIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: "error", path, message });
  const warn = (path: string, message: string) => issues.push({ level: "warning", path, message });
  const tables = new Map(profile.tables.map((t) => [t.name, t]));
  const names = new Set<string>();
  const entityByName = new Map(m.entities.map((e) => [e.name, e]));

  m.entities.forEach((e, ei) => {
    const p = `entities.${ei}(${e.name})`;
    if (names.has(e.name)) err(p, `entité dupliquée : ${e.name}`);
    names.add(e.name);
    const t = tables.get(e.source.table);
    if (!t) return err(p, `table source introuvable : ${e.source.table}`);
    const col = (c: string) => t.columns.find((x) => x.name === c);
    const key = col(e.source.key);
    if (!key) err(`${p}.source.key`, `colonne clé introuvable : ${e.source.table}.${e.source.key}`);
    else if (!key.unique) warn(`${p}.source.key`, `${e.source.key} n'est pas unique dans la source (${t.rows - key.distinct - key.nulls} doublon(s) ou vide(s)) : les lignes concernées seront rejetées`);
    const fnames = new Set<string>();
    e.fields.forEach((f, fi) => {
      const fp = `${p}.fields.${fi}(${f.name})`;
      if (RESERVED.has(f.name) || f.name.startsWith("_")) err(fp, `nom réservé : ${f.name}`);
      if (fnames.has(f.name)) err(fp, `champ dupliqué : ${f.name}`);
      fnames.add(f.name);
      const c = col(f.source);
      if (!c) return err(fp, `colonne source introuvable : ${e.source.table}.${f.source}`);
      if (f.type === "reference") {
        if (!f.references) err(fp, "référence sans entité cible (references)");
        else if (!entityByName.has(f.references)) err(fp, `entité référencée inconnue : ${f.references}`);
        if (f.on_missing === "keep_unlinked" && f.required) err(fp, "keep_unlinked impossible sur une référence obligatoire");
      }
      if (f.type === "enum" && !f.options?.length) warn(fp, "liste sans valeurs autorisées : toute valeur sera acceptée");
      if (f.type === "money" && !["money", "decimal", "integer"].includes(c.type)) warn(fp, `colonne lue comme « ${c.type} », déclarée montant`);
      if (f.type === "date" && c.type !== "date") warn(fp, `colonne lue comme « ${c.type} », déclarée date`);
      if (f.required && c.nulls) warn(fp, `${c.nulls} valeur(s) vide(s) dans la source : lignes rejetées (champ obligatoire)`);
    });
    if (e.title_field && !fnames.has(e.title_field)) err(`${p}.title_field`, `champ titre inconnu : ${e.title_field}`);
    for (const d of e.duplicates ?? []) for (const f of d.fields) if (!fnames.has(f)) err(`${p}.duplicates`, `champ inconnu : ${f}`);
    for (const c of [...(e.checks ?? []), ...(e.computed ?? []).map((x) => ({ id: x.field, expr: x.expr }))]) {
      try {
        const vars = compile(c.expr).vars;
        const unknown = vars.filter((v) => !fnames.has(v));
        if (unknown.length) warn(`${p}.checks.${c.id}`, `variables inconnues : ${unknown.join(", ")}`);
      } catch (x) {
        err(`${p}.checks.${c.id}`, `expression invalide : ${(x as Error).message}`);
      }
    }
    for (const a of e.aggregates ?? []) {
      const child = entityByName.get(a.children);
      if (!child) err(`${p}.aggregates.${a.id}`, `entité enfant inconnue : ${a.children}`);
      else if (!child.fields.some((f) => f.name === a.via && f.references === e.name)) err(`${p}.aggregates.${a.id}`, `${a.children}.${a.via} ne référence pas ${e.name}`);
      if (!fnames.has(a.field)) err(`${p}.aggregates.${a.id}`, `champ inconnu : ${a.field}`);
      try {
        compile(a.expr);
      } catch (x) {
        err(`${p}.aggregates.${a.id}`, `expression invalide : ${(x as Error).message}`);
      }
    }
  });

  // Dépendances obligatoires sans cycle (ordre d'import)
  try {
    importOrder(m);
  } catch (x) {
    err("entities", (x as Error).message);
  }

  (m.attachments ?? []).forEach((a, i) => {
    const p = `attachments.${i}`;
    const t = tables.get(a.source.table);
    if (!t) return err(p, `table source introuvable : ${a.source.table}`);
    for (const c of [a.source.key, a.path, a.filename, "type" in a.owner ? a.owner.type : null, a.owner.id].filter(Boolean) as string[]) {
      if (!t.columns.some((x) => x.name === c)) err(p, `colonne introuvable : ${a.source.table}.${c}`);
    }
    const owners = "map" in a.owner ? Object.values(a.owner.map) : [a.owner.entity];
    for (const o of owners) if (!entityByName.has(o)) err(p, `entité propriétaire inconnue : ${o}`);
    if (archives.length && !archives.includes(a.archive)) err(p, `archive introuvable parmi les sources : ${a.archive}`);
  });
  return issues;
}

/** Ordre d'import : une entité après celles qu'elle référence (références obligatoires). */
export function importOrder(m: MigrationMapping): EntityMap[] {
  const byName = new Map(m.entities.map((e) => [e.name, e]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: EntityMap[] = [];
  const visit = (e: EntityMap, chain: string[]) => {
    if (done.has(e.name)) return;
    if (visiting.has(e.name)) throw new Error(`dépendance circulaire : ${[...chain, e.name].join(" → ")}`);
    visiting.add(e.name);
    for (const f of e.fields) {
      if (f.type !== "reference" || !f.references || f.references === e.name) continue;
      const dep = byName.get(f.references);
      if (dep) visit(dep, [...chain, e.name]);
    }
    visiting.delete(e.name);
    done.add(e.name);
    out.push(e);
  };
  for (const e of m.entities) visit(e, []);
  return out;
}

/* ------------------------------------------------------------------ */
/* Proposition automatique (générique)                                  */
/* ------------------------------------------------------------------ */

const fieldName = (col: string) =>
  col
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^(\d)/, "c_$1")
    .replace(/^(id|rowid|oid)$/, "source_$1")
    .slice(0, 60) || "colonne";
const label = (col: string) => humanLabel(col);

/**
 * Proposition déduite uniquement de la structure lue : une entité par table, un champ par
 * colonne, types et relations détectés. Les codes sans signification connue et les
 * relations incomplètes sont marqués « à valider ». Alan peut la remplacer par la sienne.
 */
export function proposeMapping(profile: SourceProfile, opts: { target?: { id: string; name: string }; source_system?: string } = {}): MigrationMapping {
  const entityOf = new Map(profile.tables.map((t) => [t.name, t.entity]));
  const entities: EntityMap[] = [];
  for (const t of profile.tables) {
    if (!t.primary_key || !t.rows) continue;
    const used = new Set<string>();
    const fields: FieldMap[] = [];
    for (const c of t.columns) {
      if (c.name === t.primary_key) continue;
      let name = fieldName(c.name);
      while (used.has(name)) name += "_2";
      used.add(name);
      const rel = profile.relations.find((r) => r.table === t.name && r.column === c.name);
      if (rel && entityOf.has(rel.references.table)) {
        fields.push({
          name,
          label: singularLabel(label(rel.references.table)),
          source: c.name,
          type: "reference",
          references: entityOf.get(rel.references.table)!,
          on_missing: rel.orphans ? "keep_unlinked" : "reject",
          // Références orphelines : le choix « conserver sans lien » doit être validé par un humain
          confidence: rel.orphans ? Math.min(rel.confidence, 0.85) : rel.confidence,
          note: rel.orphans ? `${rel.orphans} référence(s) introuvable(s) dans ${rel.references.table} (ex. ${rel.orphan_samples.join(", ")})` : `Relation vers ${rel.references.table}.${rel.references.column}`,
        });
        continue;
      }
      fields.push(proposeField(name, c));
    }
    if (!fields.length) continue;
    const title =
      fields.find((f) => f.type === "text" && /nom|name|raison|libelle|titre|title|societe|designation|sujet/.test(f.name)) ??
      fields.find((f) => f.type === "text" && /num|ref|code/.test(f.name)) ??
      fields.find((f) => f.type === "text");
    entities.push({
      name: t.entity,
      label: label(t.entity),
      label_singular: singularLabel(label(t.entity)),
      source: { table: t.name, key: t.primary_key },
      title_field: title?.name,
      fields,
      confidence: 0.92,
      note: `Proposition automatique : ${t.rows} lignes, clé ${t.primary_key}`,
    });
  }
  classifyEntities(entities);
  const target = opts.target ?? { id: "nouveau-logiciel", name: "Nouveau logiciel" };
  return { contract_version: MAPPING_CONTRACT_VERSION, source_system: opts.source_system, target, review_threshold: 0.9, entities, attachments: [] };
}

/* ------------------------------------------------------------------ */
/* Protection de l'historique (proposition automatique)                 */
/* ------------------------------------------------------------------ */
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const FINANCIAL = /(invoice|factur|bill|avoir|credit_?note|payment|paiement|reglement|encaissement|receipt|ecriture|ledger|compta)/;
const COMMERCIAL = /(quote|devis|estimate|proposal|order|commande)/;
const MASTER = /(product|produit|article|catalog|service|tarif|price_?list|customer|client|contact|lead|prospect|supplier|fournisseur|user|utilisateur|employee|salarie|company|societe|categor|famille|family|stock)/;
const LINE = /(line|ligne|lig|item|detail|position)s?$/;
const NUMBER_FIELD = /(^|_)(num|numero|number|no|ref|reference|code)(_|$)/;
const STATUS_FIELD = /(statut|status|etat|state|paid|paye|payment|reglement)/;

/**
 * Classe chaque entité et protège l'historique par défaut : montants, dates, numéros et statuts
 * des documents comptables ; montants et numéros des documents commerciaux ; lignes de ces
 * documents. Un classement incertain (confiance < seuil) devient un point à valider ; tant qu'il
 * n'est pas tranché, la protection reste active (aucune opération sensible n'est possible).
 */
export function classifyEntities(entities: EntityMap[]) {
  const kind = new Map<string, NonNullable<EntityMap["classification"]>>();
  const isLine = (e: EntityMap) => LINE.test(plain(e.name)) || LINE.test(plain(e.source.table));
  for (const e of entities) {
    if (isLine(e)) continue;
    const n = plain(`${e.name} ${e.source.table}`);
    const money = e.fields.some((f) => f.type === "money");
    const dated = e.fields.some((f) => f.type === "date");
    if (FINANCIAL.test(n) && money) kind.set(e.name, { kind: "financial", confidence: 0.95, note: "Nom évocateur d'un document comptable" });
    else if (COMMERCIAL.test(n) && money) kind.set(e.name, { kind: "commercial", confidence: 0.8, note: "Nom évocateur d'un document commercial" });
    else if (MASTER.test(n)) kind.set(e.name, { kind: "master", confidence: 0.9 });
    else if (money && dated) kind.set(e.name, { kind: "other", confidence: 0.6, note: "Montants datés : peut-être un document historique" });
  }
  for (const e of entities) {
    if (kind.has(e.name)) continue;
    const parent = e.fields.find((f) => f.type === "reference" && ["financial", "commercial", "other"].includes(kind.get(f.references ?? "")?.kind ?? ""));
    if (!parent || !(isLine(e) || e.fields.some((f) => f.type === "money"))) continue;
    kind.set(e.name, { kind: "line", confidence: kind.get(parent.references!)!.confidence, parent: parent.references, note: `Lignes de ${parent.references}` });
    e.line_of = { entity: parent.references!, via: parent.name };
  }
  for (const e of entities) {
    const c = kind.get(e.name);
    if (!c) continue;
    e.classification = c;
    for (const f of e.fields) {
      const protect =
        c.kind === "line"
          ? f.type !== "reference"
          : c.kind === "commercial"
            ? f.type === "money" || (f.type === "text" && NUMBER_FIELD.test(f.name))
            : c.kind === "financial" || c.kind === "other"
              ? f.type === "money" || f.type === "date" || (f.type === "text" && NUMBER_FIELD.test(f.name)) || (f.type !== "reference" && STATUS_FIELD.test(f.name))
              : false;
      if (protect) f.accounting = true;
    }
  }
}

function proposeField(name: string, c: TableProfile["columns"][number]): FieldMap {
  const base = { name, label: label(c.name), source: c.name, confidence: Math.round(c.conformity * 1000) / 1000 };
  const anomalies = c.anomalies.count ? `${c.anomalies.count} valeur(s) non conforme(s) (ex. ${c.anomalies.samples.slice(0, 3).join(", ")})` : undefined;
  const typed = (type: FieldType, transforms: Transform[] = []): FieldMap => ({ ...base, type, transforms: transforms.length ? transforms : undefined, note: anomalies });
  switch (c.type) {
    case "integer":
      return typed("integer");
    case "money":
      return typed("money", c.format === "comma" ? [{ money: "comma" }] : []);
    case "decimal":
      return typed("decimal", c.format === "comma" ? [{ decimal: "comma" }] : []);
    case "date":
      return typed("date", c.format === "DD/MM/YYYY" ? [{ date: "DD/MM/YYYY" }] : []);
    case "boolean":
      return typed("boolean");
    case "email":
      return typed("email", ["trim"]);
    case "phone":
      return typed("phone", ["trim"]);
    case "empty":
      return { ...typed("text"), confidence: 0.5, note: "Colonne toujours vide dans la source" };
    default:
      if (c.codes) {
        return {
          ...base,
          type: "enum",
          transforms: ["trim"],
          options: c.codes.map((x) => ({ value: x.value })),
          confidence: 0.7,
          note: `Codes sans libellé connu : ${c.codes.map((x) => x.value).join(", ")}. Valeurs conservées telles quelles.`,
        };
      }
      return typed("text", ["trim"]);
  }
}
