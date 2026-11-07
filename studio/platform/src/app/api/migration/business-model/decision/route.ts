import { decideBusinessModel } from "@/lib/migration/project";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Décision humaine sur une version du modèle métier : { version, decision: "validated" | "rejected", comment?, by? }. */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { version?: unknown; decision?: unknown; comment?: unknown; by?: unknown };
    if (typeof b.version !== "number" || (b.decision !== "validated" && b.decision !== "rejected")) throw new ApiError(400, "version (nombre) et decision (validated | rejected) requis");
    const meta = decideBusinessModel(b.version, b.decision, typeof b.by === "string" ? b.by.slice(0, 60) : "responsable", typeof b.comment === "string" ? b.comment.slice(0, 1000) : undefined);
    return json({ ok: true, version: meta.version, status: meta.status });
  },
  { write: true },
);
