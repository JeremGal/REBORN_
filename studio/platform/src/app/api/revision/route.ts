import { getState } from "@/lib/store";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Compteur de révision (quelques octets) : le dashboard l'interroge pour savoir
 * s'il doit recharger l'état. Contrairement au SSE, aucune connexion n'est
 * retenue : pas de saturation quand plusieurs onglets sont ouverts.
 */
export const GET = handler(async () => {
  const s = getState();
  return json({ revision: s.revision, event_seq: s.event_seq });
});
