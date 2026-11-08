import { decideBusinessModel } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Décision humaine sur une version du modèle métier : { version, decision: "validated" | "rejected", comment? }.
 * Propriétaire du projet ; l'auteur de la décision est l'identité authentifiée (un champ `by` du corps est ignoré).
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { version?: unknown; decision?: unknown; comment?: unknown };
    if (typeof b.version !== "number" || (b.decision !== "validated" && b.decision !== "rejected")) throw new ApiError(400, "version (nombre) et decision (validated | rejected) requis");
    const meta = decideBusinessModel(b.version, b.decision, actorName(), typeof b.comment === "string" ? b.comment.slice(0, 1000) : undefined);
    return json({ ok: true, version: meta.version, status: meta.status });
  },
  { access: ["owner"], write: true, project: "query" },
);
