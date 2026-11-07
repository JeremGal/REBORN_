import { contractJsonSchemas } from "@/lib/schemas";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Contrats d'intégration publiés en JSON Schema (générés depuis la validation réelle). */
export const GET = handler(async () =>
  json({
    ...contractJsonSchemas(),
    endpoints: {
      "POST /api/observations": "observation | observation[] | { observations }",
      "POST /api/events": "event | event[] (action, form_discovered, hypothesis, experiment_request, log…)",
      "POST /api/schema": "app_schema — nouvelle version du schéma d'interface",
      "POST /api/rules[?dry_run=1]": "rule_model — 422 si non exécutable",
      "POST /api/compute": "compute",
      "POST /api/investigations": "investigation",
      "PATCH /api/investigations": "{ id, status }",
      "GET /api/investigations?active=1[&mode=live]": "investigation en cours (mode=live : uniquement si elle attend les agents réels)",
      "GET /api/health": "vérification de connexion : contrats, jeton exigé/valide, mode courant",
      "GET /api/revision": "compteurs { revision, event_seq } (synchronisation légère)",
      "GET /api/observations?investigation_id=": "observations reçues",
      "GET /api/rules[?version=n|?all=1]": "modèle courant, version précise ou historique",
      "GET /api/schema[?all=1]": "schéma d'interface courant ou historique",
      "GET /api/events?after_seq=N&type=…": "polling des évènements",
      "GET /api/compare?investigation_id=&version=": "rapport de comparaison",
      "GET /api/app": "application reconstruite résolue",
      "GET /api/state": "état complet",
      "GET /api/stream": "Server-Sent Events",
    },
  }),
);
