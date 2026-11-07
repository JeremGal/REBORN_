import { acknowledge } from "@/lib/migration/project";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Acceptation humaine des écarts documentés (statut « validation humaine requise ») : { comment, by? }. */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const b = (await readJson(req)) as { comment?: unknown; by?: unknown };
    acknowledge(id, typeof b.by === "string" ? b.by.slice(0, 60) : "responsable", typeof b.comment === "string" ? b.comment.slice(0, 1000) : undefined);
    return json({ ok: true });
  },
  { write: true },
);
