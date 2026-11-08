import { completeMission, executorIdentity } from "@/lib/migration/analysis";
import { MISSION_ID, MissionCompleteSchema } from "@/lib/migration/project-contracts";
import { currentPrincipal } from "@/lib/auth/principal";
import { ApiError, handler, json, parseWith, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Fin de mission déclarée par l'exécuteur TITULAIRE (contrat mission_complete 1.0) :
 * { outcome: "completed"|"failed", detail?, disposal?: { h_vault_item_deleted, local_artifacts_purged } }.
 * Clôt l'investigation de la mission, libère le prêt, révoque les jetons et EFFACE les identifiants
 * confiés au projet. Jamais de « completed » implicite : seul cet appel le déclare.
 */
export const POST = handler(
  async (req, ctx) => {
    const { mission_id } = await ctx.params;
    if (!MISSION_ID.test(mission_id ?? "")) throw new ApiError(400, "Identifiant de mission invalide");
    const ex = executorIdentity(currentPrincipal(), req);
    const b = parseWith(MissionCompleteSchema, await readJson(req));
    return json(await completeMission(mission_id, ex, b));
  },
  { access: ["explorer"], project: "none", write: true },
);
