import { z } from "zod";
import { contractJsonSchemas } from "@/lib/schemas";
import {
  CONNECTION_MISSION_CONTRACT_VERSION,
  CONNECTION_REPORT_CONTRACT_VERSION,
  ConnectionMissionSchema,
  ConnectionReportSchema,
  EXECUTOR_HEARTBEAT_CONTRACT_VERSION,
  ExecutorHeartbeatSchema,
  MISSION_COMPLETE_CONTRACT_VERSION,
  MissionCompleteSchema,
} from "@/lib/migration/project-contracts";
import { EXECUTOR_HEADER, HEARTBEAT_FRESH_MS, LEASE_MS, RENEW_WITHIN_S } from "@/lib/migration/analysis";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

const js = (s: z.ZodType, version: string) => ({ "x-contract-version": version, ...z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) });

/** Contrats d'intégration publiés en JSON Schema (générés depuis la validation réelle). */
export const GET = handler(async () =>
  json({
    ...contractJsonSchemas(),
    endpoints: {
      "POST /api/observations": "observation | observation[] | { observations } (exécuteur : titulaire du prêt de la mission du projet)",
      "POST /api/events": "event | event[] (action, form_discovered, hypothesis, experiment_request, log…) — exécuteur : titulaire du prêt ; saisies de mot de passe masquées par le Studio",
      "POST /api/schema": "app_schema — nouvelle version du schéma d'interface (exécuteur : titulaire du prêt)",
      "POST /api/rules[?dry_run=1]": "rule_model — 422 si non exécutable",
      "POST /api/compute": "compute",
      "POST /api/investigations": "investigation (target_url : http(s), sans identifiant)",
      "PATCH /api/investigations": "{ id, status }",
      "GET /api/investigations?active=1[&mode=live]": "investigation en cours (mode=live : uniquement si elle attend les agents réels)",
      "GET /api/health": "vérification de connexion : contrats, jeton exigé/valide, mode courant",
      "GET /api/revision": "compteurs { revision, event_seq } (synchronisation légère ; compte client : ceux de ses projets)",
      "GET /api/observations?investigation_id=": "observations reçues",
      "GET /api/rules[?version=n|?all=1]": "modèle courant, version précise ou historique",
      "GET /api/schema[?all=1]": "schéma d'interface courant ou historique",
      "GET /api/events?after_seq=N&type=…": "polling des évènements",
      "GET /api/compare?investigation_id=&version=": "rapport de comparaison",
      "GET /api/app": "application reconstruite résolue",
      "GET /api/state": "état (compte client : ses projets seulement ; équipe et agents : complet ; ?project= : ce projet)",
      "GET /api/stream": "Server-Sent Events (compte ou jeton de service ; compte client : ses projets seulement)",
    },
    // Exécuteur de l'agent d'analyse (Mouss) : jeton de service explorer + en-tête X-Reborn-Executor (SPEC §6, INTEGRATION_MOUSS.md).
    executor: {
      authentication: `Authorization: Bearer <jeton explorer> ; en-tête ${EXECUTOR_HEADER} (nom d'instance, 1 à 64 caractères) ; jamais d'en-tête Origin`,
      lease: `prêt de ${LEASE_MS / 1000} s renouvelé par le battement de cœur (au moins toutes les ${RENEW_WITHIN_S} s) ; sans battement depuis ${HEARTBEAT_FRESH_MS / 1000} s : agent « non disponible »`,
      endpoints: {
        "POST /api/executor/heartbeat": `executor_heartbeat ${EXECUTOR_HEARTBEAT_CONTRACT_VERSION} → { server_time, renew_within_s, executor_id, lease_s, leases }`,
        "POST /api/executor/missions/claim": `prise atomique de la plus ancienne mission en file compatible → 200 connection_mission ${CONNECTION_MISSION_CONTRACT_VERSION} (jeton de remise à usage unique, 15 min, lié à la mission et à l'exécuteur) ; 204 s'il n'y a rien`,
        "POST /api/executor/missions/{mission_id}/complete": `mission_complete ${MISSION_COMPLETE_CONTRACT_VERSION} { outcome: completed|failed, detail?, disposal? } (titulaire) : investigation close, prêt libéré, identifiants effacés`,
        "POST /api/projects/{id}/credentials/redeem": "{ token, mission_id? } → { username, password } une seule fois (titulaire du prêt) ; à saisir hors du modèle (coffre H fill_secret_at ou CDP), jamais dans la consigne",
        "POST /api/projects/{id}/connection": `connection_report ${CONNECTION_REPORT_CONTRACT_VERSION} { status, detail?, mission_id? } (titulaire du prêt)`,
        "GET /api/projects/{id}/mission": `aperçu connection_mission ${CONNECTION_MISSION_CONTRACT_VERSION} sans jeton (mission_id null et note si aucune analyse n'est demandée)`,
        "POST /api/projects/{id}/mission": "compatibilité 1.0 (take_mission) : prend la mission en file de ce projet ; 409 si rien en file",
        "POST /api/migration/extract?project=": "extraction autorisée (plan extraction_plan, adresse déclarée du projet seulement ; titulaire du prêt)",
        "POST /api/migration/sources?project=": "export déposé { name, content_base64, mechanism? } (titulaire du prêt)",
        "POST /api/events?project= · /api/observations?project= · /api/schema?project=": "rapports de découverte de la mission (titulaire du prêt ; 403 sinon, 409 si l'adresse du logiciel a changé)",
      },
      contracts: {
        connection_mission: js(ConnectionMissionSchema, CONNECTION_MISSION_CONTRACT_VERSION),
        executor_heartbeat: js(ExecutorHeartbeatSchema, EXECUTOR_HEARTBEAT_CONTRACT_VERSION),
        mission_complete: js(MissionCompleteSchema, MISSION_COMPLETE_CONTRACT_VERSION),
        connection_report: js(ConnectionReportSchema, CONNECTION_REPORT_CONTRACT_VERSION),
      },
    },
  }),
  // Schémas statiques, sans aucune donnée : publics (comme /api/health réduit).
  { access: ["public"], project: "none" },
);
