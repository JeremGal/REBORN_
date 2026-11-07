import { loadProject, projectRoot } from "@/lib/migration/project";
import { redeem } from "@/lib/migration/credentials";
import { addEvent } from "@/lib/store";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Remise des identifiants à l'exécuteur de l'agent Computer Use : { token } (jeton à usage unique
 * de la mission, 15 min). Le jeton est détruit à la première utilisation. À appeler par le code
 * technique de l'agent, jamais à transmettre à un modèle de langage.
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    if (!loadProject(id)) throw new ApiError(404, `Projet inconnu : ${id}`);
    const b = (await readJson(req)) as { token?: unknown };
    const creds = redeem(projectRoot(id), String(b.token ?? ""));
    if (!creds) throw new ApiError(403, "Jeton invalide, expiré ou déjà utilisé");
    addEvent({ source: "explorer", type: "migration", title: "Identifiants remis à l'exécuteur de l'agent (jeton à usage unique)" });
    return json({ ok: true, ...creds }, 200);
  },
  { write: true },
);
