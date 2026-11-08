import { currentModel, modelByVersion, modelsOf } from "@/lib/store";
import { publishRules } from "@/lib/service";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Analyste → REBORN. Valide le modèle (forme + sémantique), crée une nouvelle version
 * et la compare aussitôt aux observations de la portée (?project= : ce projet ; sinon l'atelier).
 * ?dry_run=1 : valide et compare sans publier. ?source=user : modèle saisi par l'équipe (opérateur seulement).
 * Réponses : 200 publié · 400 format · 403 rôle · 422 modèle non exécutable (liste des erreurs).
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const source = sp.get("source") ?? "analyst";
    if (source !== "analyst" && source !== "user") throw new ApiError(400, "source : analyst (défaut) ou user");
    if (source === "user" && !isOperator(currentPrincipal())) throw new ApiError(403, "?source=user : réservé à l'équipe REBORN (opérateur)");
    const result = publishRules(await readJson(req), { source, dryRun: sp.get("dry_run") === "1" });
    return json(result);
  },
  { access: ["analyst", "operator"], write: true, project: "query" },
);

/** ?version=n pour une version précise, ?all=1 pour l'historique (de la portée : ?project=, sinon l'atelier). */
export const GET = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    if (sp.get("all")) return json(modelsOf());
    const v = sp.get("version");
    const m = v ? modelByVersion(Number(v)) : currentModel();
    return m ? json(m) : json({ ok: false, error: "Aucun modèle" }, 404);
  },
  { access: ["analyst", "operator"], project: "query" },
);
