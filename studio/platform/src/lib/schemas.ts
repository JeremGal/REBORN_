import { z } from "zod";

/**
 * Schémas des contrats d'intégration (version 1.x).
 * Règle de compatibilité : uniquement des ajouts optionnels. Les champs
 * inconnus sont tolérés (`loose`) pour ne pas casser les envois existants.
 */
export const CONTRACT_VERSION = "1.1";

const primitive = z.union([z.string(), z.number(), z.boolean()]);
const dropNulls = (r: Record<string, string | number | boolean | null>) =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as Record<string, string | number | boolean>;

export const ObservationSchema = z
  .object({
    experiment_id: z.string().min(1).max(120),
    application: z.string().optional(),
    module: z.string().optional(),
    inputs: z.record(z.string(), primitive.nullable()).transform(dropNulls),
    observed_output: z.record(z.string(), primitive.nullable()).default({}).transform(dropNulls),
    status: z.string().default("success"),
    error: z.string().optional(),
    investigation_id: z.string().optional(),
    screenshot_url: z.string().optional(),
    request_id: z.string().optional(),
  })
  .loose();

export const ObservationPayload = z.union([
  ObservationSchema.transform((o) => [o]),
  z.array(ObservationSchema).max(2000),
  z.object({ observations: z.array(ObservationSchema).max(2000) }).transform((o) => o.observations),
]);

export const RuleSchema = z
  .object({
    id: z.string().min(1).max(120),
    type: z.string().default("custom"),
    description: z.string().optional(),
    condition: z.record(z.string(), z.unknown()).optional(),
    action: z.record(z.string(), z.unknown()),
    stage: z.enum(["validation", "base", "discount", "fee", "adjust", "rounding"]).optional(),
    priority: z.number().optional(),
    group: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    validation_status: z.string().optional(),
    evidence: z.array(z.string()).optional(),
    depends_on: z.array(z.string()).optional(),
  })
  .loose();

export const InputFieldSchema = z
  .object({
    name: z.string().min(1).max(80),
    label: z.string().optional(),
    type: z.string().min(1),
    options: z.array(z.object({ value: z.union([z.string(), z.number()]).transform(String), label: z.string().optional(), description: z.string().optional() })).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    integer: z.boolean().optional(),
    required: z.boolean().optional(),
    default: primitive.optional(),
    unit: z.string().optional(),
    help: z.string().optional(),
    placeholder: z.string().optional(),
    pattern: z.string().max(200).optional(),
    max_length: z.number().int().positive().optional(),
    display: z.enum(["auto", "select", "segmented", "cards", "checkbox", "toggle"]).optional(),
    section: z.string().optional(),
  })
  .loose();

export const OutputFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  format: z.enum(["currency", "number", "integer", "percent", "text"]).optional(),
  unit: z.string().optional(),
  unit_singular: z.string().optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  primary: z.boolean().optional(),
});

export const AppSchemaSchema = z
  .object({
    application: z.string().optional(),
    module: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    fields: z.array(InputFieldSchema).min(1).max(200),
    sections: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })).optional(),
    outputs: z.array(OutputFieldSchema).optional(),
    tables: z.array(z.object({ id: z.string(), title: z.string(), vary: z.string(), values: z.array(primitive).min(1).max(50), outputs: z.array(z.string()).optional() })).optional(),
    unsupported: z.array(z.object({ name: z.string().optional(), label: z.string(), reason: z.string().optional() })).optional(),
    investigation_id: z.string().optional(),
  })
  .loose();

export const RuleModelSchema = z
  .object({
    module: z.string().default("Module"),
    application: z.string().optional(),
    rules: z.array(RuleSchema).max(1000),
    settings: z
      .object({
        discount_stacking: z.enum(["compound", "additive", "max"]).optional(),
        rounding: z
          .object({
            decimals: z.number().int().min(0).max(6).optional(),
            mode: z.enum(["half_up", "half_even", "floor", "ceil"]).optional(),
            at: z.enum(["end", "each_step"]).optional(),
          })
          .optional(),
        currency: z.string().length(3).optional(),
        output_field: z.string().optional(),
        tolerance: z.number().min(0).optional(),
      })
      .loose()
      .optional(),
    inputs: z.array(InputFieldSchema).optional(),
    outputs: z.array(OutputFieldSchema).optional(),
    notes: z.string().optional(),
    contract_version: z.string().optional(),
  })
  .loose();

export const EVENT_TYPES = [
  "investigation_started",
  "investigation_completed",
  "action",
  "observation",
  "form_discovered",
  "hypothesis",
  "experiment_request",
  "rules_updated",
  "schema_updated",
  "validation",
  "drift",
  "log",
  "error",
  "migration",
] as const;

export const EventSchema = z.object({
  source: z.enum(["explorer", "analyst", "platform", "user"]).default("explorer"),
  type: z.enum(EVENT_TYPES).default("log"),
  title: z.string().min(1).max(500),
  detail: z.string().max(5000).optional(),
  investigation_id: z.string().optional(),
  screenshot_url: z.string().optional(),
  data: z.unknown().optional(),
  ts: z.string().optional(),
});

export const EventPayload = z.union([EventSchema.transform((e) => [e]), z.array(EventSchema).max(500)]);

export const InvestigationCreateSchema = z.object({
  application: z.string().min(1).default("Quotix 98"),
  module: z.string().min(1).default("Devis"),
  target_url: z.string().optional(),
  objective: z.string().optional(),
  mode: z.enum(["live", "simulation", "replay"]).default("live"),
  kind: z.enum(["initial", "blind_challenge", "verification"]).default("initial"),
  /** Projet de migration concerné (facultatif, contrat 1.2) : relie la découverte au projet. */
  project_id: z.string().regex(/^MIG_[a-f0-9]{8}$/).optional(),
});

export const ComputeSchema = z.object({
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  version: z.number().int().optional(),
  model: RuleModelSchema.optional(),
});

/** JSON Schemas publiés par GET /api/contracts. */
export function contractJsonSchemas() {
  const js = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });
  return {
    contract_version: CONTRACT_VERSION,
    observation: js(ObservationSchema),
    rule_model: js(RuleModelSchema),
    app_schema: js(AppSchemaSchema),
    event: js(EventSchema),
    investigation: js(InvestigationCreateSchema),
    compute: js(ComputeSchema),
  };
}
