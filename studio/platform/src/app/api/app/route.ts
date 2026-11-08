import { currentAppDescription } from "@/lib/service";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Description résolue de l'application reconstruite de l'atelier (schéma × modèle courants de la portée : ?project=, sinon l'atelier). */
export const GET = handler(async () => json(currentAppDescription()), { access: ["analyst", "operator"], project: "query" });
