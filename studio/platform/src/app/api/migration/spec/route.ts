import { previewSpec } from "@/lib/migration/generate";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Aperçu de l'ApplicationSpec du projet : entités, champs (provenance), écrans, actions, règles
 * installables, éléments non reconstruits. Calculé à la demande ; rien n'est généré ni démarré.
 * Propriétaire et Analyste.
 */
export const GET = handler(async () => json(previewSpec()), { access: ["owner", "analyst"], project: "query" });
