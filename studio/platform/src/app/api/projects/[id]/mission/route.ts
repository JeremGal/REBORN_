import { randomUUID } from "node:crypto";
import { credentialStatus, issueRedeemToken } from "@/lib/migration/credentials";
import { loadProject, projectRoot } from "@/lib/migration/project";
import { addEvent } from "@/lib/store";
import { ApiError, handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

const MISSION_CONTRACT_VERSION = "1.0";

function mission(id: string, withToken: boolean) {
  const p = loadProject(id);
  if (!p) throw new ApiError(404, `Projet inconnu : ${id}`);
  const cred = credentialStatus(projectRoot(id));
  const q = `?project=${id}`;
  return {
    contract: "connection_mission",
    contract_version: MISSION_CONTRACT_VERSION,
    mission_id: `MIS_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
    project_id: id,
    target: { url: p.legacy_url ?? null, software: p.source_system ?? null, software_type: p.software_type ?? null, company: p.company ?? p.name },
    authorization: p.authorization ?? null,
    objectives: [
      "Se connecter à l'ancien logiciel avec le compte fourni et rapporter l'état de connexion",
      "Explorer les modules, écrans, menus, formulaires et fonctions accessibles à ce compte",
      "Repérer les mécanismes d'export autorisés (exports CSV/Excel, API, impression) et les données accessibles",
      "Déposer les exports obtenus et rapporter les observations avec leurs preuves (captures)",
    ],
    constraints: [
      "Ne jamais contourner une permission, un contrôle d'accès ou une limite du compte fourni",
      "Ne jamais modifier ni supprimer de données dans l'ancien logiciel",
      "Ne jamais transmettre les identifiants à un modèle de langage : seul le code technique de l'exécuteur les utilise",
      "Signaler toute double authentification ou intervention nécessaire au lieu de la contourner",
    ],
    credential: cred.stored
      ? { username_hint: cred.username_hint, expires_at: cred.expires_at, ...(withToken ? { redeem_url: `/api/projects/${id}/credentials/redeem`, ...issueRedeemToken(projectRoot(id)) } : {}) }
      : null,
    report: {
      connection_status: { method: "POST", url: `/api/projects/${id}/connection`, body: '{ "status": "pending|connected|failed|mfa_required|human_needed", "detail": "…" }' },
      investigation: { method: "POST", url: `/api/investigations`, body: `{ "application": "…", "module": "…", "mode": "live", "project_id": "${id}" }` },
      events: { method: "POST", url: `/api/events${q}` },
      screens: { method: "POST", url: `/api/schema${q}` },
      observations: { method: "POST", url: `/api/observations${q}` },
      exports: { method: "POST", url: `/api/migration/sources${q}`, body: '{ "name": "clients.csv", "content_base64": "…", "mechanism": "export CSV" }' },
    },
  };
}

/** Mission sans jeton (consultation). */
export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  return json(mission(id, false));
});

/** Mission transmise à l'exécuteur de l'agent : émet un jeton de remise à usage unique (15 min). */
export const POST = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const m = mission(id, true);
    addEvent({ source: "platform", type: "migration", title: "Mission de connexion préparée pour l'agent Computer Use", detail: m.credential ? "Jeton de remise des identifiants à usage unique (15 min) inclus" : "Aucun identifiant confié au projet" });
    return json(m);
  },
  { write: true },
);
