import { loadProject } from "@/lib/migration/project";
import { claimMission, ensureExecutor, executorIdentity, missionPreview, sweepIfDue } from "@/lib/migration/analysis";
import { currentPrincipal } from "@/lib/auth/principal";
import { ApiError, handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Aperçu de la mission (contrat connection_mission 1.1), SANS jeton : la mission en cours ou la dernière,
 * sinon ce qu'elle contiendrait. Propriétaire, équipe REBORN, exécuteur.
 */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    await sweepIfDue();
    return json(await missionPreview(id));
  },
  { access: ["owner", "operator", "explorer"], project: "param" },
);

/**
 * Compatibilité 1.0 — take_mission(projet) : l'exécuteur (jeton explorer) prend la mission EN FILE de ce
 * projet (même format qu'en 1.0, champs 1.1 en plus, jeton de remise lié à la mission et à l'exécuteur) ;
 * 409 s'il n'y a rien en file. L'appel vaut signe de vie (exécuteur 1.0 sans battement de cœur).
 * L'équipe REBORN ne reçoit jamais de jeton : la mission n'est remise qu'à l'exécuteur qui la prend.
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const who = currentPrincipal();
    if (who.kind !== "service") {
      throw new ApiError(409, "La mission est remise à l'exécuteur par la file d'attente : il la prend lui-même (POST /api/executor/missions/claim). Aucun jeton n'est remis hors de l'exécuteur.");
    }
    const p = loadProject(id);
    if (!p) throw new ApiError(404, "Projet introuvable");
    if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : aucune mission n'est remise");
    const ex = executorIdentity(who, req);
    // Exécuteur 1.0 (sans battement) : cet appel est son signe de vie réel (capacités 1.0 par défaut).
    await ensureExecutor(ex);
    const mission = await claimMission(ex, { projectId: id });
    if (!mission) throw new ApiError(409, "Aucune analyse en file pour ce projet : le propriétaire doit d'abord lancer « Analyser mon logiciel »");
    return json(mission);
  },
  { access: ["explorer", "operator"], project: "param", write: true },
);
