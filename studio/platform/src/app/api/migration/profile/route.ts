import { profile } from "@/lib/migration/project";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Structure analysée des sources : tables, colonnes (types, formats, anomalies), clés, relations probables.
 * Contient des échantillons de valeurs réelles : propriétaire du projet et Analyste seulement.
 */
export const GET = handler(async () => json(profile()), { access: ["owner", "analyst"], project: "query" });
