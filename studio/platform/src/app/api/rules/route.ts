import { currentModel, getState, modelByVersion } from "@/lib/store";
import { publishRules } from "@/lib/service";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Analyste → REBORN. Valide le modèle (forme + sémantique), crée une nouvelle version
 * et la compare aussitôt aux observations. ?dry_run=1 : valide et compare sans publier.
 * Réponses : 200 publié · 400 format · 422 modèle non exécutable (liste des erreurs).
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const result = publishRules(await readJson(req), { source: sp.get("source") ?? "analyst", dryRun: sp.get("dry_run") === "1" });
    return json(result);
  },
  { write: true },
);

/** ?version=n pour une version précise, ?all=1 pour l'historique. */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get("all")) return json(getState().models);
  const v = sp.get("version");
  const m = v ? modelByVersion(Number(v)) : currentModel();
  return m ? json(m) : json({ ok: false, error: "Aucun modèle" }, 404);
});
