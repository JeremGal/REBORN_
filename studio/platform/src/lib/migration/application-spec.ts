import { z } from "zod";
import type { RulePackage } from "../engine/bindings";
import type { AppSpec } from "./generate";
import { viewProblems, type Decision, type MigrationMapping } from "./mapping";

/**
 * ApplicationSpec — contrat unique décrivant un logiciel reconstruit (fichier app.json du logiciel
 * livré, version 1.1). C'est l'app.json existant, enrichi de façon additive : le runtime générique
 * ignore ce qu'il n'utilise pas, et les logiciels déjà livrés (1.0) restent valides.
 *
 * Chaque élément dit d'où il vient :
 *   observed  — présent dans les données réellement extraites de l'ancien logiciel ;
 *   deduced   — proposé (par REBORN ou par l'Analyste) sans validation humaine explicite ;
 *   validated — validé par un humain (décision tracée) ou version validée du modèle métier ;
 *   not_rebuilt — identifié mais non reconstruit (liste `not_rebuilt`, avec la raison).
 * Rien n'est inventé : un élément sans source n'apparaît pas, il est listé dans `not_rebuilt`.
 */

export const APPLICATION_SPEC_VERSION = "1.1";

const Provenance = z
  .object({
    status: z.enum(["observed", "deduced", "validated"]),
    observed: z.boolean().optional(),
    source: z.string().optional(),
    basis: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    by: z.string().optional(),
    at: z.string().optional(),
  })
  .strict();

const Field = z
  .object({
    name: z.string(),
    label: z.string(),
    type: z.string(),
    required: z.boolean(),
    unique: z.boolean(),
    options: z.array(z.object({ value: z.string(), label: z.string().optional() })).optional(),
    references: z.string().optional(),
    accounting: z.boolean(),
    computed_by_rules: z.boolean().optional(),
    provenance: Provenance.optional(),
  })
  .loose();

export const ApplicationSpecSchema = z
  .object({
    spec_version: z.string(),
    app: z
      .object({
        id: z.string(),
        name: z.string(),
        tagline: z.string(),
        currency: z.string(),
        locale: z.string(),
        generated_at: z.string(),
        generator: z.string(),
        source_system: z.string().optional(),
        migration_run: z.string(),
        port: z.number().int(),
        company: z.string().optional(),
        branding: z.object({ name: z.string(), primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/), logo_text: z.string().max(4) }).strict().optional(),
      })
      .loose(),
    entities: z.array(
      z
        .object({
          name: z.string(),
          label: z.string(),
          label_singular: z.string(),
          title_field: z.string().nullable(),
          fields: z.array(Field),
          list_fields: z.array(z.string()),
          search_fields: z.array(z.string()),
          children: z.array(z.object({ entity: z.string(), via: z.string(), label: z.string() })),
          computed: z.array(z.object({ field: z.string(), expr: z.string() })),
          aggregates: z.array(z.object({ field: z.string(), children: z.string(), via: z.string(), expr: z.string() })),
          /** Champs essentiels, dans l'ordre (formulaire et tête de fiche) ; absents ou vides : tous les champs. */
          form_fields: z.array(z.string()).optional(),
          /** Champs techniques : jamais saisis ni en colonne ; repliés dans « Données d'origine ». */
          technical_fields: z.array(z.string()).optional(),
          provenance: Provenance.optional(),
        })
        .loose(),
    ),
    navigation: z.array(z.object({ entity: z.string() })),
    dashboard: z.object({ cards: z.array(z.record(z.string(), z.unknown())), breakdowns: z.array(z.record(z.string(), z.unknown())) }),
    /** Vues d'ensemble : planning = une ligne par ressource, une colonne par jour, une barre par élément (fin exclue). */
    views: z
      .array(
        z
          .object({
            entity: z.string(),
            kind: z.enum(["planning"]),
            name: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
            label: z.string(),
            start: z.string(),
            end: z.string(),
            resource: z.string(),
            title: z.string(),
            status: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    ddl: z.array(z.string()),
    screens: z.array(z.object({ id: z.string(), kind: z.enum(["dashboard", "list", "detail", "form", "admin", "planning"]), entity: z.string().optional(), fields: z.array(z.string()).optional(), note: z.string().optional() }).strict()).optional(),
    actions: z.array(z.object({ entity: z.string(), action: z.enum(["create", "update", "delete", "export", "attach", "reprice"]), available: z.boolean(), note: z.string().optional() }).strict()).optional(),
    rules: z
      .object({
        versions: z.array(z.object({ version: z.number().int(), source: z.string().optional(), modules: z.array(z.string()), history_check: z.string().nullable().optional() }).strict()),
        bindings: z.array(z.object({ id: z.string(), entity: z.string(), scope: z.enum(["line", "document"]), module: z.string(), outputs: z.array(z.string()) }).strict()),
      })
      .strict()
      .optional(),
    workflows: z.array(z.record(z.string(), z.unknown())).optional(),
    not_rebuilt: z.array(z.object({ kind: z.enum(["table", "field", "entity", "workflow", "rule", "attachment", "view"]), name: z.string(), reason: z.string() }).strict()).optional(),
    provenance: z
      .object({
        mapping_version: z.number().int(),
        mapping_origin: z.string(),
        migration_run: z.string(),
        business_model_versions: z.array(z.number().int()),
        statement: z.string(),
      })
      .strict()
      .optional(),
  })
  .loose();
export type ApplicationSpec = z.output<typeof ApplicationSpecSchema>;

export interface SpecContext {
  decisions: Record<string, Decision>;
  mapping: { version: number; origin: string };
  runId: string;
  rules: (RulePackage & { history_check?: string | null })[];
  /** Versions reçues mais non validées (ou refusées) : listées comme non reconstruites. */
  pendingModels: { version: number; status: string }[];
  unmapped: { name: string; rows: number }[];
  /** Mécanismes d'extraction refusés ou en échec : données non récupérées. */
  refused?: { name: string; status: string; message?: string }[];
  workflows?: Record<string, unknown>[];
}

const ORIGIN: Record<string, string> = { auto: "proposition automatique de REBORN", analyst: "Analyste (Alan)", fixture: "jeu de test au format de l'Analyste", user: "opérateur" };
const BRAND_COLORS = ["#1f4e79", "#2d6a4f", "#7a3e2b", "#4b3f72", "#1d5c63", "#6b4e16"];

/** Enrichit la spécification d'exécution avec provenance, écrans, actions, règles et éléments non reconstruits. */
export function enrichSpec(spec: AppSpec, m: MigrationMapping, ctx: SpecContext): ApplicationSpec {
  const prov = (key: string, source: string, confidence?: number) => {
    const d = ctx.decisions[key];
    if (d?.decision === "accepted") return { status: "validated" as const, observed: true, source, confidence, by: d.by, at: d.at };
    return { status: "deduced" as const, observed: true, source, confidence, basis: ORIGIN[ctx.mapping.origin] ?? ctx.mapping.origin };
  };
  const latest = ctx.rules.at(-1) ?? null;
  const ruleOutputs = new Map<string, Set<string>>();
  for (const b of latest?.bindings ?? []) for (const f of Object.values(b.outputs)) ruleOutputs.set(b.entity, (ruleOutputs.get(b.entity) ?? new Set()).add(f));
  const derived = new Map<string, { name: string; label: string; type: string }[]>();
  for (const pkg of ctx.rules) for (const b of pkg.bindings) for (const f of b.fields ?? []) if (!(derived.get(b.entity) ?? []).some((x) => x.name === f.name)) derived.set(b.entity, [...(derived.get(b.entity) ?? []), f]);

  const entities = spec.entities.map((e) => {
    const em = m.entities.find((x) => x.name === e.name)!;
    const outs = ruleOutputs.get(e.name) ?? new Set();
    const fields = [
      ...e.fields.map((f) => {
        const fm = em.fields.find((x) => x.name === f.name);
        return { ...f, ...(outs.has(f.name) ? { computed_by_rules: true } : {}), provenance: prov(`field:${e.name}.${f.name}`, `${em.source.table}.${fm?.source ?? f.name}`, fm?.confidence) };
      }),
      ...(derived.get(e.name) ?? []).map((f) => ({
        name: f.name,
        label: f.label,
        type: f.type,
        required: false,
        unique: false,
        accounting: false,
        computed_by_rules: true,
        provenance: { status: "validated" as const, observed: false, basis: `sortie du modèle métier validé (v${latest?.version ?? "?"}) — vide pour l'historique` },
      })),
    ];
    return { ...e, fields, provenance: prov(`entity:${e.name}`, em.source.table, em.confidence) };
  });

  const views = spec.views ?? [];
  const screens: NonNullable<ApplicationSpec["screens"]> = [
    { id: "dashboard", kind: "dashboard", note: views.length ? "« Aujourd'hui » (arrivées, départs, en cours, occupation), puis indicateurs et répartitions calculés sur la base du logiciel" : "Indicateurs et répartitions calculés sur la base du logiciel" },
    ...views.map((v) => ({ id: `view.${v.name}`, kind: "planning" as const, entity: v.entity, fields: [v.start, v.end, v.resource, v.title, ...(v.status ? [v.status] : [])], note: v.label })),
    ...entities.flatMap((e) => {
      const technical = new Set(e.technical_fields ?? []);
      // Formulaire : champs essentiels d'abord (dans leur ordre), puis les autres ; jamais les champs techniques ni calculés
      const editable = e.fields.filter((f) => !technical.has(f.name) && !("computed_by_rules" in f && f.computed_by_rules)).map((f) => f.name);
      const essential = (e.form_fields ?? []).filter((n) => editable.includes(n));
      return [
        { id: `${e.name}.list`, kind: "list" as const, entity: e.name, fields: e.list_fields },
        { id: `${e.name}.detail`, kind: "detail" as const, entity: e.name, fields: [...essential, ...e.fields.map((f) => f.name).filter((n) => !essential.includes(n))] },
        { id: `${e.name}.form`, kind: "form" as const, entity: e.name, fields: [...essential, ...editable.filter((n) => !essential.includes(n))], ...(essential.length ? { note: `${essential.length} champ(s) essentiel(s) affichés d'emblée ; les autres sous « Informations complémentaires »` } : {}) },
      ];
    }),
    { id: "admin", kind: "admin", note: "Utilisateurs, sauvegardes, journal d'audit" },
  ];
  // Vues déclarées mais incohérentes avec les champs appliqués (champ exclu, type inattendu…) : dites, jamais ignorées en silence
  const built = new Set(views.map((v) => `${v.entity}.${v.name}`));
  const droppedViews = m.entities.flatMap((e) => (e.ui?.views ?? []).filter((v) => !built.has(`${e.name}.${v.name}`)).map((v) => ({ e, v })));
  const protectedDoc = (name: string) => entities.find((e) => e.name === name)?.fields.some((f) => f.accounting) || latest?.bindings.some((b) => b.entity === name && b.scope === "document");
  const actions: NonNullable<ApplicationSpec["actions"]> = entities.flatMap((e) => [
    { entity: e.name, action: "create" as const, available: true },
    { entity: e.name, action: "update" as const, available: true, ...(protectedDoc(e.name) ? { note: "Enregistrements historiques : montants, dates et numéros protégés" } : {}) },
    { entity: e.name, action: "delete" as const, available: true, ...(protectedDoc(e.name) ? { note: "Interdit pour l'historique protégé ; possible pour les enregistrements créés ici" } : {}) },
    { entity: e.name, action: "export" as const, available: true },
    { entity: e.name, action: "attach" as const, available: true },
    ...(latest?.bindings.some((b) => b.entity === e.name && b.scope === "document") ? [{ entity: e.name, action: "reprice" as const, available: true, note: "Recalcul explicite avec la version active du modèle (documents créés ici seulement)" }] : []),
  ]);

  const not_rebuilt: NonNullable<ApplicationSpec["not_rebuilt"]> = [
    ...ctx.unmapped.map((t) => ({ kind: "table" as const, name: t.name, reason: `${t.rows} ligne(s) extraites sans correspondance : non migrées (voir le rapport d'écarts)` })),
    ...(ctx.refused ?? []).map((r) => ({ kind: "table" as const, name: r.name, reason: r.status === "forbidden" || r.status === "unauthorized" ? "Export refusé au compte fourni par le propriétaire : données non récupérées (aucune tentative de contournement)" : `Export non récupéré : ${r.message ?? r.status}` })),
    ...Object.entries(ctx.decisions)
      .filter(([, d]) => d.decision === "excluded")
      .filter(([k]) => !k.startsWith("accounting:"))
      .map(([k, d]) => ({ kind: (k.startsWith("entity:") ? "entity" : k.startsWith("field:") ? "field" : "attachment") as "entity" | "field" | "attachment", name: k.split(":")[1], reason: `Exclu par décision humaine (${d.by})${d.comment ? ` : ${d.comment}` : ""}` })),
    ...ctx.pendingModels.map((x) => ({ kind: "rule" as const, name: `modèle métier v${x.version}`, reason: x.status === "rejected" ? "Version refusée par un responsable" : "Version reçue, non validée : non installée" })),
    ...(ctx.workflows ?? []).map((w, i) => ({ kind: "workflow" as const, name: String(w.name ?? w.id ?? `workflow ${i + 1}`), reason: "Workflow décrit par l'analyse : l'exécution de workflows n'est pas encore prise en charge par le runtime" })),
    ...droppedViews.map(({ e, v }) => {
      const why = viewProblems(e, v, new Set(m.entities.map((x) => x.name)));
      return { kind: "view" as const, name: `${e.name}.${v.name}`, reason: why.length ? `Vue « ${v.label} » non construite : ${why.join(" ; ")}` : `Vue « ${v.label} » non construite : nom déjà utilisé par une autre vue` };
    }),
    ...(latest ? [] : [{ kind: "rule" as const, name: "règles de calcul", reason: "Aucun modèle métier validé : les nouveaux documents ne sont pas calculés automatiquement" }]),
  ];

  const name = spec.app.company ?? spec.app.name;
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    ...spec,
    spec_version: APPLICATION_SPEC_VERSION,
    app: {
      ...spec.app,
      branding: {
        name,
        primary_color: BRAND_COLORS[hash % BRAND_COLORS.length],
        logo_text: name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join(""),
      },
    },
    entities,
    screens,
    actions,
    rules: {
      versions: ctx.rules.map((r) => ({ version: r.version, source: r.source, modules: Object.keys(r.modules), history_check: r.history_check ?? null })),
      bindings: (latest?.bindings ?? []).map((b) => ({ id: b.id, entity: b.entity, scope: b.scope, module: b.module, outputs: Object.values(b.outputs) })),
    },
    workflows: ctx.workflows ?? [],
    not_rebuilt,
    provenance: {
      mapping_version: ctx.mapping.version,
      mapping_origin: ORIGIN[ctx.mapping.origin] ?? ctx.mapping.origin,
      migration_run: ctx.runId,
      business_model_versions: ctx.rules.map((r) => r.version),
      statement: "Spécification déduite des données réellement extraites, des correspondances et du modèle métier validés. Les éléments listés dans not_rebuilt ne sont pas reconstruits.",
    },
  };
}

export const applicationSpecJsonSchema = () => z.toJSONSchema(ApplicationSpecSchema, { target: "draft-2020-12", unrepresentable: "any" });
