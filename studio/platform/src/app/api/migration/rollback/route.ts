import { rollback } from "@/lib/migration/generate";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Retour arrière : restaure la base antérieure à une mise en service ({ deployment_id }). */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { deployment_id?: unknown };
    if (typeof b.deployment_id !== "string") throw new ApiError(400, "deployment_id requis");
    await rollback(b.deployment_id, "opérateur");
    return json({ ok: true });
  },
  { write: true },
);
