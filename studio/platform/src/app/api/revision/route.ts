import { getState, projectRevisions } from "@/lib/store";
import { callerVisibility } from "@/lib/service";
import { viewRevision } from "@/lib/visibility";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Compteur de révision (quelques octets) : l'espace connecté l'interroge pour savoir s'il doit recharger
 * l'état. Contrairement au SSE, aucune connexion n'est retenue : pas de saturation quand plusieurs
 * onglets sont ouverts.
 * Compte client (ou projet désigné par ?project=) : numéro du dernier évènement de SES projets, tenu par
 * le store à chaque écriture ; l'activité des autres ne s'y lit pas. Équipe et agents : compteurs globaux.
 */
export const GET = handler(
  async () => {
    const v = callerVisibility();
    const s = getState();
    if (v.all) return json({ revision: s.revision, event_seq: s.event_seq });
    const r = viewRevision(v, s, projectRevisions());
    return json({ revision: r, event_seq: r });
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
