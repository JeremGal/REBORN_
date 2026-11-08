import { executorIdentity, reportConnection } from "@/lib/migration/analysis";
import { ConnectionReportSchema } from "@/lib/migration/project-contracts";
import { currentPrincipal, type ServicePrincipal } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * État de connexion rapporté par l'exécuteur de l'agent Computer Use (Mouss) — contrat
 * connection_report 1.1 : { status, detail?, mission_id?, by? (ignoré) }.
 * pending · connected · failed · mfa_required (double authentification) · human_needed (intervention).
 *
 * Réservé à l'exécuteur TITULAIRE de la mission en cours du projet (sinon 403) : REBORN ne simule jamais
 * une connexion réussie. Seul ce rapport, ou le test réel du connecteur HTTP (/connection/test), fait
 * passer le projet à « Connecté ». `by` est l'identité authentifiée ; le texte libre est débarrassé des
 * identifiants confiés.
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const who = currentPrincipal() as ServicePrincipal; // access ["explorer"]
    const ex = executorIdentity(who, req);
    const parsed = ConnectionReportSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Rapport de connexion invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    return json(await reportConnection(id, ex, who, parsed.data));
  },
  { access: ["explorer"], project: "param", write: true },
);
