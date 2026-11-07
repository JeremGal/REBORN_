/**
 * Contrats de données REBORN.
 *
 * Mouss (Explorer)  → POST /api/observations  : Observation (format du brief, p.6)
 *                   → POST /api/events        : actions de l'agent (clic, saisie, capture…)
 * Alan  (Analyste)  → POST /api/rules         : RuleModel (format du brief, p.6)
 *                   → POST /api/events        : hypothèses, demandes d'expérience
 * Jerem (Plateforme) exécute les règles, reconstruit l'app et compare.
 */

export type Primitive = string | number | boolean;
export type Inputs = Record<string, Primitive>;

/* ------------------------------------------------------------------ */
/* Mouss → Alan / Jerem : observation d'une expérience                  */
/* ------------------------------------------------------------------ */

export interface Observation {
  experiment_id: string;
  application?: string;
  module?: string;
  inputs: Inputs;
  observed_output: Record<string, Primitive>;
  /**
   * success : le logiciel a produit une sortie.
   * error   : le logiciel a affiché un refus métier (ex. « QUANTITE INVALIDE ») → comparé comme une exception.
   * failed  : l'expérience n'a pas pu être menée (échec technique) → exclue du score.
   */
  status: "success" | "error" | "failed" | string;
  error?: string;
  /** Rattachement à une investigation. Si absent, la plateforme rattache à l'investigation active. */
  investigation_id?: string;
  /** Capture d'écran (URL http ou data URL base64). */
  screenshot_url?: string;
  /** Si l'expérience répond à une demande d'Alan. */
  request_id?: string;
  received_at?: string;
}

/* ------------------------------------------------------------------ */
/* Alan → Jerem : modèle métier                                         */
/* ------------------------------------------------------------------ */

export type ValidationStatus = "hypothesis" | "tested" | "validated" | "rejected";

/** Étapes du pipeline de calcul, exécutées dans cet ordre. `validation` porte les exceptions métier. */
export const STAGES = ["validation", "base", "discount", "fee", "adjust", "rounding"] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Condition : toutes les clés sont combinées en ET.
 *  - `champ: valeur`                  égalité (insensible à la casse pour le texte)
 *  - `champ_gte|_gt|_lte|_lt: n`      comparaisons numériques
 *  - `champ_eq|_neq: v`               égalité / différence
 *  - `champ_in|_nin: [..]`            appartenance
 *  - `champ_between: [a, b]`          a <= champ <= b
 *  - `any: [cond, ...]`               OU
 *  - `all: [cond, ...]`               ET explicite
 *  - `not: cond`                      négation
 *  - `expr: "quantity >= 10 && customer_type == 'premium'"`
 * Variables disponibles : toutes les entrées + unit_price, base_total, subtotal,
 * discount_total, fees_total, total_price (valeurs courantes au moment de l'étape).
 */
export type Condition = Record<string, unknown>;

/**
 * Action : une ou plusieurs opérations. Toute valeur numérique peut être une
 * expression ("5 + 0.5 * quantity").
 *  - unit_price / set_unit_price : fixe le prix unitaire                (étape base)
 *  - discount_percent            : remise en %                          (étape discount)
 *  - discount_amount             : remise fixe                          (étape discount)
 *  - fee_amount / shipping_fee   : ajoute des frais                     (étape fee)
 *  - surcharge_percent           : majoration en %                      (étape fee)
 *  - multiply                    : subtotal *= n                        (étape adjust)
 *  - set: { variable: valeur }   : affecte des variables                (toute étape)
 *  - round: { decimals, mode }   : arrondi                              (étape rounding)
 *  - error: "message"            : refus métier, le calcul s'arrête     (étape validation)
 */
export type Action = Record<string, unknown>;

export interface Rule {
  id: string;
  type: string;
  description?: string;
  condition?: Condition;
  action: Action;
  /** Si absent, déduit du `type` (unit_price → base, *_discount → discount, *_fee → fee…). */
  stage?: Stage;
  /** Ordre d'application dans l'étape (croissant). */
  priority?: number;
  /** Règles exclusives : dans un même groupe, seule la première qui correspond s'applique. */
  group?: string;
  confidence?: number;
  validation_status?: ValidationStatus | string;
  /** Identifiants des expériences qui justifient la règle. */
  evidence?: string[];
  depends_on?: string[];
}

/* ------------------------------------------------------------------ */
/* Description de l'interface (schéma d'application)                    */
/* ------------------------------------------------------------------ */

/** Types de champs que le générateur sait reconstruire. Tout autre type est signalé « non pris en charge ». */
export const FIELD_TYPES = ["number", "enum", "text", "boolean"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface InputField {
  name: string;
  label?: string;
  /** number | enum | text | boolean (alias acceptés : integer, select, radio, string, textarea, checkbox). */
  type: FieldType | (string & {});
  options?: { value: string; label?: string; description?: string }[];
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  required?: boolean;
  default?: Primitive;
  unit?: string;
  help?: string;
  placeholder?: string;
  /** Expression régulière (texte), 200 caractères max. */
  pattern?: string;
  max_length?: number;
  display?: "auto" | "select" | "segmented" | "cards" | "checkbox" | "toggle";
  section?: string;
}

export interface OutputField {
  name: string;
  label?: string;
  format?: "currency" | "number" | "integer" | "percent" | "text";
  unit?: string;
  /** Unité au singulier (valeurs ≤ 1), ex. « jour » pour « jours ». */
  unit_singular?: string;
  decimals?: number;
  primary?: boolean;
}

export interface AppSection {
  id: string;
  title: string;
  description?: string;
}

/** Tableau calculé : fait varier un champ et affiche les sorties pour chaque valeur. */
export interface ResultTable {
  id: string;
  title: string;
  vary: string;
  values: Primitive[];
  outputs?: string[];
}

export interface UnsupportedFeature {
  name?: string;
  label: string;
  reason?: string;
}

export interface AppSchema {
  application?: string;
  module?: string;
  title?: string;
  description?: string;
  fields: InputField[];
  sections?: AppSection[];
  outputs?: OutputField[];
  tables?: ResultTable[];
  /** Éléments observés dans le logiciel historique mais non reconstruits (impression, export…). */
  unsupported?: UnsupportedFeature[];
}

export interface StoredSchema extends AppSchema {
  version: number;
  received_at: string;
  source: string;
}

export interface Issue {
  level: "error" | "warning" | "info";
  message: string;
  rule_id?: string;
  field?: string;
  path?: string;
}

export interface ModelSettings {
  /** compound : remises successives (×0,9 ×0,9) · additive : somme des % · max : meilleure remise seule. */
  discount_stacking?: "compound" | "additive" | "max";
  rounding?: { decimals?: number; mode?: "half_up" | "half_even" | "floor" | "ceil"; at?: "end" | "each_step" };
  currency?: string;
  /** Champ de sortie principal comparé au logiciel historique. */
  output_field?: string;
  /** Tolérance de comparaison numérique (défaut 0,01). */
  tolerance?: number;
}

export interface RuleModel {
  module: string;
  application?: string;
  rules: Rule[];
  settings?: ModelSettings;
  /** Schéma des entrées (prioritaire sur l'écran découvert, champ par champ). */
  inputs?: InputField[];
  /** Sorties à afficher dans l'application reconstruite (défaut : output_field). */
  outputs?: OutputField[];
  notes?: string;
  contract_version?: string;
}

export interface StoredRuleModel extends RuleModel {
  version: number;
  received_at: string;
  source?: string;
  diff?: RuleDiff[];
  /** Avertissements de validation (les erreurs bloquent la publication). */
  issues?: Issue[];
}

export interface RuleDiff {
  rule_id: string;
  kind: "added" | "removed" | "changed";
  before?: Rule;
  after?: Rule;
  /** Chemins modifiés, ex: "action.discount_percent". */
  fields?: string[];
}

/* ------------------------------------------------------------------ */
/* Évènements temps réel                                                */
/* ------------------------------------------------------------------ */

export type EventSource = "explorer" | "analyst" | "platform" | "user";

export type EventType =
  | "investigation_started"
  | "investigation_completed"
  | "action"
  | "observation"
  | "form_discovered"
  | "hypothesis"
  | "experiment_request"
  | "rules_updated"
  | "schema_updated"
  | "validation"
  | "drift"
  | "log"
  | "error"
  | "migration";

export interface AgentEvent {
  id: string;
  /** Numéro d'ordre strictement croissant (polling fiable : ?after_seq=). */
  seq: number;
  ts: string;
  source: EventSource;
  type: EventType;
  title: string;
  detail?: string;
  investigation_id?: string;
  screenshot_url?: string;
  data?: unknown;
}

export interface Investigation {
  id: string;
  number: number;
  kind: "initial" | "blind_challenge" | "verification";
  application: string;
  module: string;
  target_url?: string;
  objective?: string;
  /** live : agents réels (Mouss, Alan) · simulation : explorateur de répétition intégré · replay : données de référence (scénario, script de test). */
  mode: "live" | "simulation" | "replay";
  status: "running" | "completed" | "failed";
  created_at: string;
  completed_at?: string;
  /** Version du modèle de règles en vigueur au lancement. */
  model_version_at_start?: number;
  /** Projet de migration concerné (découverte de l'ancien logiciel de ce projet). */
  project_id?: string;
}

/* ------------------------------------------------------------------ */
/* Moteur & comparaison                                                 */
/* ------------------------------------------------------------------ */

export interface TraceStep {
  rule_id: string;
  rule_type: string;
  stage: Stage;
  label: string;
  applied: boolean;
  reason?: string;
  /** Variable impactée et valeurs avant/après. */
  target?: string;
  before?: number;
  after?: number;
  delta?: number;
  validation_status?: string;
  confidence?: number;
  evidence?: string[];
}

export interface ComputeError {
  message: string;
  field?: string;
  rule_id?: string;
}

export interface ComputeResult {
  /** ok : calcul effectué · invalid : entrées invalides · rejected : refus métier (règle d'exception). */
  status: "ok" | "invalid" | "rejected";
  outputs: Record<string, number | string | boolean>;
  trace: TraceStep[];
  warnings: string[];
  errors: ComputeError[];
  engine: string;
}

export interface ComparisonRow {
  experiment_id: string;
  investigation_id?: string;
  inputs: Inputs;
  observed: Record<string, Primitive>;
  computed: Record<string, number | string | boolean>;
  /** match / mismatch : comparés · not_covered : aucune sortie comparable · inconclusive : expérience échouée, exclue. */
  status: "match" | "mismatch" | "not_covered" | "inconclusive";
  /** true si l'original a refusé le cas (exception métier). */
  exception?: boolean;
  computed_status?: ComputeResult["status"];
  reason?: string;
  /** Écart sur le champ principal (calculé - observé). */
  delta?: number;
  mismatched_fields: string[];
  /** true si l'expérience n'a servi de preuve à aucune règle : cas indépendant. */
  independent: boolean;
  trace: TraceStep[];
}

export interface ComparisonReport {
  model_version: number | null;
  investigation_id: string | "all";
  /** Nombre d'expériences distinctes (dernière observation retenue par experiment_id). */
  total: number;
  /** Expériences effectivement comparées (hors inconclusive). */
  scored: number;
  matched: number;
  mismatched: number;
  /** Expériences échouées côté explorateur, exclues du score. */
  errors: number;
  not_covered: number;
  /** Refus métier de l'original correctement reproduits. */
  exceptions_matched: number;
  equivalence: number | null;
  /** Cas ayant servi de preuve aux règles (construction du modèle). */
  construction_total: number;
  construction_matched: number;
  /** Cas jamais utilisés comme preuve (validation). */
  independent_total: number;
  independent_matched: number;
  independent_equivalence: number | null;
  max_abs_delta: number;
  /** Nombre d'expériences comparées dans lesquelles chaque règle s'est appliquée. */
  rule_coverage: { rule_id: string; applied: number; matched: number }[];
  /** Valeurs testées par champ d'entrée. */
  input_coverage: { field: string; values: (string | number | boolean)[]; min?: number; max?: number }[];
  /** Limites de la vérification, calculées. */
  limitations: string[];
  rows: ComparisonRow[];
}

export interface RebornState {
  investigations: Investigation[];
  active_investigation_id: string | null;
  events: AgentEvent[];
  event_seq: number;
  /** Dernier numéro d'investigation attribué (jamais réutilisé, même après remise à zéro). */
  investigation_seq?: number;
  observations: Observation[];
  models: StoredRuleModel[];
  /** Versions successives du schéma d'interface (écran découvert ou description fournie). */
  schemas: StoredSchema[];
  /** Compteur incrémenté à chaque mutation. */
  revision: number;
  /** Résumé du projet de migration (ajouté par GET /api/state, non persisté ici). */
  migration?: import("./migration/project").MigrationSummary;
}
