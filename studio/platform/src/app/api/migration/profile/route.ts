import { profile } from "@/lib/migration/project";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Structure analysée des sources : tables, colonnes (types, formats, anomalies), clés, relations probables. */
export const GET = handler(async () => json(profile()));
