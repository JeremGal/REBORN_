import { getState, projectRevisions } from "@/lib/store";
import { migrationSummary } from "@/lib/migration/project";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { callerVisibility } from "@/lib/service";
import { viewState } from "@/lib/visibility";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Instantané de l'état (consommé par l'espace connecté et l'atelier).
 * - Compte client : investigations, évènements, observations, modèles et schémas de SES projets
 *   (lib/visibility.ts), sans résumé « migration » ni compteur global ; ?project= limite à ce projet.
 * - Équipe (opérateur) et agents : état complet de l'atelier et résumé du projet (?project= : ce projet seul).
 */
export const GET = handler(
  async () => {
    const view = viewState(callerVisibility(), getState(), projectRevisions());
    const p = currentPrincipal();
    if (p.kind === "user" && !isOperator(p)) return json(view);
    return json({ ...view, migration: migrationSummary() });
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
