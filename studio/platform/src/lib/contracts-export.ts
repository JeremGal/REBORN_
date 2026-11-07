import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { contractJsonSchemas } from "./schemas";
import { ExtractionPlanSchema, EXTRACTION_CONTRACT_VERSION } from "./migration/connectors";
import { MigrationMappingSchema, MAPPING_CONTRACT_VERSION } from "./migration/mapping";
import { BusinessModelSchema } from "./migration/business-model";
import { BUSINESS_MODEL_CONTRACT_VERSION } from "./engine/bindings";
import { ApplicationSpecSchema, APPLICATION_SPEC_VERSION } from "./migration/application-spec";
import { ConnectionReportSchema, ProjectCreateSchema, PROJECT_CONTRACT_VERSION } from "./migration/project-contracts";

/**
 * Contrats publiés dans contracts/ (JSON Schema générés à partir de la validation réellement
 * appliquée par l'API : la documentation ne peut pas diverger du serveur). `npm run contracts`
 * les régénère ; un test vérifie qu'ils sont à jour.
 */
const js = (s: z.ZodType, title: string, version: string, description: string) => ({
  $comment: `GÉNÉRÉ par platform/src/lib/contracts-export.ts — ne pas modifier à la main (npm run contracts). Contrat ${title} ${version}.`,
  title,
  description,
  "x-contract-version": version,
  ...z.toJSONSchema(s, { io: "input", unrepresentable: "any" }),
});

export function contractFiles(root: string): Record<string, unknown> {
  const studio = contractJsonSchemas();
  return {
    "extraction_plan.schema.json": js(ExtractionPlanSchema, "extraction_plan", EXTRACTION_CONTRACT_VERSION, "Plan d'extraction (Explorer / Mouss → Studio) : mécanismes autorisés de récupération des données."),
    "migration_mapping.schema.json": js(MigrationMappingSchema, "migration_mapping", MAPPING_CONTRACT_VERSION, "Correspondances ancien → nouveau (Analyste / Alan → Studio), avec confiance et protection de l'historique."),
    "business_model.schema.json": js(BusinessModelSchema, "business_model", BUSINESS_MODEL_CONTRACT_VERSION, "Modèle métier exécutable (Analyste / Alan → Studio) : modules de règles du moteur REBORN et liaisons aux entités."),
    "application_spec.schema.json": js(ApplicationSpecSchema, "application_spec", APPLICATION_SPEC_VERSION, "Spécification d'un logiciel reconstruit (app.json du logiciel livré) : entités, provenance, écrans, actions, règles, éléments non reconstruits."),
    "project_create.schema.json": js(ProjectCreateSchema, "project_create", PROJECT_CONTRACT_VERSION, "Création d'un projet de migration (propriétaire → Studio). Les identifiants sont chiffrés et jamais renvoyés."),
    "connection_report.schema.json": js(ConnectionReportSchema, "connection_report", PROJECT_CONTRACT_VERSION, "Rapport d'état de connexion de l'agent Computer Use (Mouss → Studio)."),
    "rule_model.schema.json": { title: "rule_model", "x-contract-version": studio.contract_version, ...studio.rule_model },
    "observation.schema.json": { title: "observation", "x-contract-version": studio.contract_version, ...studio.observation },
    "event.schema.json": { title: "event", "x-contract-version": studio.contract_version, ...studio.event },
    "investigation.schema.json": { title: "investigation", "x-contract-version": studio.contract_version, ...studio.investigation },
    "business_model.example.json": JSON.parse(fs.readFileSync(path.join(root, "platform/scenarios/crm/business-model.json"), "utf8")),
  };
}
