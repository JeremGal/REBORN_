import { projectSummary, selectProject } from "@/lib/migration/project";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Fait du projet le projet courant (utilisé par défaut quand une requête ne précise pas ?project=). */
export const POST = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    selectProject(id);
    return json({ ok: true, project: projectSummary(id) });
  },
  { write: true },
);
