import { canSeeProject, ownerOf, projectSummary, selectProject } from "@/lib/migration/project";
import { ApiError, handler, json } from "@/lib/http";
import { currentPrincipal } from "@/lib/auth/principal";

export const dynamic = "force-dynamic";

/**
 * Projet de repli des pages historiques de l'équipe (requêtes de l'opérateur sans ?project=).
 * Réservé à l'opérateur, et limité à ses projets et à ceux sans propriétaire : le repli ne peut pas
 * pointer vers le projet d'un client. Un client ou un service désigne toujours son projet explicitement.
 */
export const POST = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    if (!canSeeProject(currentPrincipal(), ownerOf(id))) throw new ApiError(404, "Projet introuvable");
    selectProject(id);
    return json({ ok: true, project: projectSummary(id) });
  },
  { access: ["operator"], project: "param", write: true },
);
