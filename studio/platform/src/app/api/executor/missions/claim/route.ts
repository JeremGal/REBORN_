import { claimMission, executorIdentity } from "@/lib/migration/analysis";
import { currentPrincipal } from "@/lib/auth/principal";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Prise de la plus ancienne mission en file compatible avec l'exécuteur (réseau joignable, saisie des
 * identifiants hors du modèle, capacité) : 200 + mission (contrat connection_mission 1.1, avec un jeton de
 * remise lié à la mission et à l'exécuteur, 15 min, usage unique) ; 204 s'il n'y a rien.
 * Prise atomique : deux exécuteurs simultanés, une seule prise. Battement de cœur récent exigé (409 sinon).
 */
export const POST = handler(
  async (req) => {
    const ex = executorIdentity(currentPrincipal(), req);
    const mission = await claimMission(ex);
    return mission ? json(mission) : new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  },
  { access: ["explorer"], project: "none", write: true },
);
