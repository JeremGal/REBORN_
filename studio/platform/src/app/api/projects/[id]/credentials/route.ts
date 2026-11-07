import { z } from "zod";
import { loadProject, projectRoot } from "@/lib/migration/project";
import { credentialStatus, forgetCredentials, storeCredentials } from "@/lib/migration/credentials";
import { addEvent } from "@/lib/store";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const known = (id: string) => {
  if (!loadProject(id)) throw new ApiError(404, `Projet inconnu : ${id}`);
};

/** État des identifiants (jamais leur valeur). */
export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  known(id);
  return json(credentialStatus(projectRoot(id)));
});

const Schema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(500), ttl_hours: z.number().min(0.25).max(168).optional() }).strict();

/** Confie les identifiants de l'ancien logiciel au projet : chiffrés, durée limitée, jamais renvoyés. */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    known(id);
    const parsed = Schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Identifiant et mot de passe requis");
    const out = storeCredentials(projectRoot(id), parsed.data.username, parsed.data.password, parsed.data.ttl_hours);
    addEvent({ source: "user", type: "migration", title: "Identifiants de l'ancien logiciel confiés au projet", detail: `Compte ${out.username_hint} · chiffrés, effacés le ${new Date(out.expires_at).toLocaleString("fr-FR")}` });
    return json({ ok: true, ...out });
  },
  { write: true },
);

/** Efface immédiatement les identifiants confiés (et tout jeton de remise en cours). */
export const DELETE = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    known(id);
    forgetCredentials(projectRoot(id));
    addEvent({ source: "user", type: "migration", title: "Identifiants de l'ancien logiciel effacés" });
    return json({ ok: true });
  },
  { write: true },
);
