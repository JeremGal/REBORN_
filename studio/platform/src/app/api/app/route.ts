import { currentAppDescription } from "@/lib/service";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Description résolue de l'application reconstruite (schéma × modèle courants). */
export const GET = handler(async () => json(currentAppDescription()));
