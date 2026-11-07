import { deploy } from "@/lib/migration/generate";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Génère le nouveau logiciel et le met en service avec la base migrée : { run_id, force? }.
 * 409 si la vérification n'est pas validée (ou ses écarts non acceptés), ou si le logiciel en
 * service contient des saisies d'utilisateurs (force = confirmation explicite, sauvegarde faite).
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { run_id?: unknown; force?: unknown; by?: unknown };
    if (typeof b.run_id !== "string") throw new ApiError(400, "run_id requis");
    const out = await deploy(b.run_id, typeof b.by === "string" ? b.by.slice(0, 60) : "opérateur", { force: b.force === true });
    return json({ ok: true, deployment: out.deployment, url: out.url });
  },
  { write: true },
);
