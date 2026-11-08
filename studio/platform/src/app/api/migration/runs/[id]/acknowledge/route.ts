import { acknowledge } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Acceptation humaine des écarts documentés (statut « validation humaine requise ») : { comment }.
 * Propriétaire du projet ; l'auteur enregistré est l'identité authentifiée (un champ `by` du corps est ignoré).
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const b = (await readJson(req)) as { comment?: unknown };
    acknowledge(id, actorName(), typeof b.comment === "string" ? b.comment.slice(0, 1000) : undefined);
    return json({ ok: true });
  },
  { access: ["owner"], write: true, project: "query" },
);
