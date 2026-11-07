import { getState } from "@/lib/store";
import { migrationSummary } from "@/lib/migration/project";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Instantané complet de l'état (consommé par le tableau de bord). */
export const GET = handler(async () => json({ ...getState(), migration: migrationSummary() }));
