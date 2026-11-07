// GÉNÉRÉ depuis platform/src/lib/types.ts — ne pas modifier (npm --prefix platform run runtime)
/**
 * Contrats de données REBORN.
 *
 * Mouss (Explorer)  → POST /api/observations  : Observation (format du brief, p.6)
 *                   → POST /api/events        : actions de l'agent (clic, saisie, capture…)
 * Alan  (Analyste)  → POST /api/rules         : RuleModel (format du brief, p.6)
 *                   → POST /api/events        : hypothèses, demandes d'expérience
 * Jerem (Plateforme) exécute les règles, reconstruit l'app et compare.
 */
/** Étapes du pipeline de calcul, exécutées dans cet ordre. `validation` porte les exceptions métier. */
export const STAGES = ["validation", "base", "discount", "fee", "adjust", "rounding"];
/* ------------------------------------------------------------------ */
/* Description de l'interface (schéma d'application)                    */
/* ------------------------------------------------------------------ */
/** Types de champs que le générateur sait reconstruire. Tout autre type est signalé « non pris en charge ». */
export const FIELD_TYPES = ["number", "enum", "text", "boolean"];
