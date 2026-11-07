/**
 * Registre des scénarios de démonstration (imports statiques : aucun accès
 * disque dynamique au runtime). Pour ajouter un scénario : créer le dossier
 * avec scenario.json + fichiers, puis l'enregistrer ici.
 */
import quoteManifest from "./quote/scenario.json";
import quoteSchema from "./quote/schema.json";
import quoteObsV1 from "./quote/observations.v1.json";
import quoteObsV2 from "./quote/observations.v2.json";
import quoteRulesV1 from "./quote/rules.v1.json";
import quoteRulesV2 from "./quote/rules.v2.json";
import logManifest from "./logistics/scenario.json";
import logSchemaV1 from "./logistics/schema.v1.json";
import logSchemaV2 from "./logistics/schema.v2.json";
import logObsV1 from "./logistics/observations.v1.json";
import logObsV2 from "./logistics/observations.v2.json";
import logRulesV1 from "./logistics/rules.v1.json";
import logRulesV2 from "./logistics/rules.v2.json";

export const SCENARIO_REGISTRY: Record<string, { manifest: unknown; files: Record<string, unknown> }> = {
  quote: {
    manifest: quoteManifest,
    files: {
      "schema.json": quoteSchema,
      "observations.v1.json": quoteObsV1,
      "observations.v2.json": quoteObsV2,
      "rules.v1.json": quoteRulesV1,
      "rules.v2.json": quoteRulesV2,
    },
  },
  logistics: {
    manifest: logManifest,
    files: {
      "schema.v1.json": logSchemaV1,
      "schema.v2.json": logSchemaV2,
      "observations.v1.json": logObsV1,
      "observations.v2.json": logObsV2,
      "rules.v1.json": logRulesV1,
      "rules.v2.json": logRulesV2,
    },
  },
};
