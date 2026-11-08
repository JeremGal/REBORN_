import { compareAll } from "@/lib/compare";
import { resolveApp } from "@/lib/appschema";
import { activeInvestigationFor, currentSchema, currentScope, investigationById, modelByVersion, observationsOf } from "@/lib/store";
import { ApiError, handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Rapport de comparaison historique ↔ reconstruit sur les observations de la portée (?project= : ce
 * projet ; sinon l'atelier). ?investigation_id=INV_002&version=1 (investigation d'une autre portée : 422).
 */
export const GET = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const scope = currentScope();
    const v = sp.get("version");
    const model = modelByVersion(v ? Number(v) : null);
    const asked = sp.get("investigation_id");
    if (asked) {
      const i = investigationById(asked);
      if (i && (i.project_id ?? null) !== scope) throw new ApiError(422, "Investigation d'une autre portée : précisez son projet dans ?project=");
    }
    const inv = asked ?? activeInvestigationFor(scope)?.id ?? "all";
    const observations = observationsOf(scope);
    const app = resolveApp(model, currentSchema(scope), observations);
    return json(compareAll(model, observations, inv, { fields: app.fields }));
  },
  { access: ["analyst", "operator"], project: "query" },
);
