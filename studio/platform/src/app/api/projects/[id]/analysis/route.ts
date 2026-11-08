import { z } from "zod";
import { analysisState, cancelAnalysis, requestAnalysis } from "@/lib/migration/analysis";
import { currentPrincipal, type UserPrincipal } from "@/lib/auth/principal";
import { ApiError, handler, json, readText } from "@/lib/http";

export const dynamic = "force-dynamic";

/*
 * « ANALYSER MON LOGICIEL » (SPEC §6) — propriétaire du projet.
 * Réponse commune : { ok, state, agent_available, executor_available, message?, requested_at,
 *   requested_by, mission: { id, status, created_at, expires_at, … } | null }.
 * Sans exécuteur disponible : message exact « Agent d'analyse non disponible pour le moment. » ; la
 * demande reste en file et démarrera quand l'agent sera disponible. Rien n'est simulé.
 */

const RequestSchema = z
  .object({
    /** Analyse explicitement demandée sans identifiants (l'agent n'explorera que ce qui est accessible sans compte). */
    without_credentials: z.boolean().optional(),
    /** Nouvelle confirmation de la déclaration d'autorisation (si sa version a changé depuis la création du projet). */
    authorization_version: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

const CancelSchema = z.object({ erase_credentials: z.boolean().optional() }).strict();

/** Corps facultatif (64 Ko au plus, lus sur le flux) : vide → {} ; JSON invalide ou champ inconnu → 400. */
async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> {
  const text = await readText(req, 64 * 1024);
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "Corps JSON invalide");
    }
  }
  const r = schema.safeParse(raw ?? {});
  if (!r.success) throw new ApiError(400, "Demande invalide", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}

/** Lance (ou renouvelle) la demande d'analyse : 202 { state: "queued", agent_available, message? … }. */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const b = await body(req, RequestSchema);
    const { status, view } = await requestAnalysis(id, currentPrincipal() as UserPrincipal, b);
    return json(view, status);
  },
  { access: ["owner"], project: "param", write: true },
);

/** État de la demande et disponibilité de l'agent (jamais d'indice d'identifiant). */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    return json(await analysisState(id));
  },
  { access: ["owner"], project: "param" },
);

/** Annule la demande en cours (jetons révoqués) ; { erase_credentials: true } efface aussi les identifiants. */
export const DELETE = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const b = await body(req, CancelSchema);
    return json(await cancelAnalysis(id, currentPrincipal() as UserPrincipal, b));
  },
  { access: ["owner"], project: "param", write: true },
);
