import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { contractJsonSchemas } from "./schemas";
import { ExtractionPlanSchema, EXTRACTION_CONTRACT_VERSION } from "./migration/connectors";
import { MigrationMappingSchema, MAPPING_CONTRACT_VERSION } from "./migration/mapping";
import { BusinessModelSchema } from "./migration/business-model";
import { BUSINESS_MODEL_CONTRACT_VERSION } from "./engine/bindings";
import { ApplicationSpecSchema, APPLICATION_SPEC_VERSION } from "./migration/application-spec";
import {
  CONNECTION_MISSION_CONTRACT_VERSION,
  CONNECTION_REPORT_CONTRACT_VERSION,
  ConnectionMissionSchema,
  connectionMissionExample,
  ConnectionReportSchema,
  EXECUTOR_HEARTBEAT_CONTRACT_VERSION,
  ExecutorHeartbeatSchema,
  MISSION_COMPLETE_CONTRACT_VERSION,
  MissionCompleteSchema,
  ProjectCreateSchema,
  PROJECT_CREATE_CONTRACT_VERSION,
} from "./migration/project-contracts";

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
    "project_create.schema.json": js(ProjectCreateSchema, "project_create", PROJECT_CREATE_CONTRACT_VERSION, "Création d'un projet de migration par un compte client connecté (propriétaire → Studio). L'autorisation est enregistrée au nom du compte ; les identifiants sont chiffrés et jamais renvoyés. 1.3 : aucun consentement présumé — authorization_version exigée, et credentials_notice_version dès que des identifiants sont confiés (400 sans elles, 409 si périmées)."),
    "connection_report.schema.json": js(ConnectionReportSchema, "connection_report", CONNECTION_REPORT_CONTRACT_VERSION, "Rapport d'état de connexion de l'exécuteur de l'agent Computer Use (Mouss → Studio), réservé au titulaire de la mission en cours. 1.1 : mission_id facultatif ; by ignoré (identité authentifiée)."),
    "connection_mission.schema.json": js(ConnectionMissionSchema, "connection_mission", CONNECTION_MISSION_CONTRACT_VERSION, "Mission remise à l'exécuteur (Studio → Mouss) : POST /api/executor/missions/claim, ou compatibilité 1.0 POST /api/projects/<id>/mission. 1.1 additif (tous les champs 1.0 conservés) : état, échéance, réseau requis, investigation, prêt de l'exécuteur, consentement, limites, jeton de remise lié à la mission et à l'exécuteur (15 min, usage unique), points de rapport heartbeat et complete."),
    "connection_mission.example.json": connectionMissionExample(),
    "executor_heartbeat.schema.json": js(ExecutorHeartbeatSchema, "executor_heartbeat", EXECUTOR_HEARTBEAT_CONTRACT_VERSION, "Battement de cœur de l'exécuteur (Mouss → Studio), au moins toutes les 20 s : POST /api/executor/heartbeat. Renouvelle le prêt (120 s) des missions déclarées en cours ; sans battement depuis 60 s, l'agent est « non disponible »."),
    "mission_complete.schema.json": js(MissionCompleteSchema, "mission_complete", MISSION_COMPLETE_CONTRACT_VERSION, "Fin de mission déclarée par l'exécuteur titulaire (Mouss → Studio) : POST /api/executor/missions/<mission_id>/complete. Clôt l'investigation, libère le prêt et efface les identifiants confiés ; jamais de fin « completed » implicite."),
    "rule_model.schema.json": { title: "rule_model", "x-contract-version": studio.contract_version, ...studio.rule_model },
    "observation.schema.json": { title: "observation", "x-contract-version": studio.contract_version, ...studio.observation },
    "event.schema.json": { title: "event", "x-contract-version": studio.contract_version, ...studio.event },
    "investigation.schema.json": { title: "investigation", "x-contract-version": studio.contract_version, ...studio.investigation },
    "business_model.example.json": JSON.parse(fs.readFileSync(path.join(root, "platform/scenarios/crm/business-model.json"), "utf8")),
  };
}
