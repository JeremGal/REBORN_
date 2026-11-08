import { operationsOverview } from "@/lib/migration/operations";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Vue d'ensemble des opérations (page /operations de l'équipe REBORN) : agents d'analyse connectés (dernier battement,
 * réseaux, mission en cours), file des missions (projet, entreprise, état, dates, exécuteur), projets (entreprise,
 * logiciel, étape du parcours, état, enregistrements migrés, logiciel livré). Rôle opérateur SEULEMENT : client 403,
 * agents (jetons de service) 403, anonyme 401. Métadonnées seulement (lib/migration/operations.ts).
 */
export const GET = handler(async () => json(await operationsOverview()), { access: ["operator"], project: "none" });
