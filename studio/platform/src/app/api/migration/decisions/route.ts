import { decide } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Validation humaine d'une correspondance incertaine : { key, decision: "accepted" | "excluded", comment? }.
 * Propriétaire du projet ; l'auteur de la décision est l'identité authentifiée (un champ `by` du corps est ignoré).
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { key?: unknown; decision?: unknown; comment?: unknown };
    if (typeof b.key !== "string" || (b.decision !== "accepted" && b.decision !== "excluded")) throw new ApiError(400, "key et decision (accepted | excluded) requis");
    decide(b.key, b.decision, actorName(), typeof b.comment === "string" ? b.comment.slice(0, 500) : undefined);
    return json({ ok: true });
  },
  { access: ["owner"], write: true, project: "query" },
);
