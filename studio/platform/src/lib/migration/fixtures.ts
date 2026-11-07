import extractionPlan from "../../../scenarios/crm/extraction-plan.json";
import mapping from "../../../scenarios/crm/mapping.json";

/**
 * Jeux de test indépendants (en attendant l'intégration) : plan d'extraction au format que
 * produira l'Explorer de Mouss, correspondances au format que produira l'Analyste d'Alan.
 * Ils passent par les mêmes API et les mêmes validations que les envois réels.
 */
export const CRM_FIXTURES = {
  extraction_plan: extractionPlan,
  mapping,
};
