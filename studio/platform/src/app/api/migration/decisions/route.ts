import { decide } from "@/lib/migration/project";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Validation humaine d'une correspondance incertaine : { key, decision: "accepted" | "excluded", comment?, by? }. */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { key?: unknown; decision?: unknown; comment?: unknown; by?: unknown };
    if (typeof b.key !== "string" || (b.decision !== "accepted" && b.decision !== "excluded")) throw new ApiError(400, "key et decision (accepted | excluded) requis");
    decide(b.key, b.decision, typeof b.by === "string" ? b.by.slice(0, 60) : "opérateur", typeof b.comment === "string" ? b.comment.slice(0, 500) : undefined);
    return json({ ok: true });
  },
  { write: true },
);
