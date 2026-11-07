import { compute } from "@/lib/engine/engine";
import { validateModel } from "@/lib/engine/validate";
import { resolveApp } from "@/lib/appschema";
import { currentSchema, getState, modelByVersion } from "@/lib/store";
import { ComputeSchema } from "@/lib/schemas";
import { handler, json, parseWith, readJson } from "@/lib/http";
import type { RuleModel } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Exécute le moteur reconstruit avec la validation des entrées de l'application.
 * { inputs, model } teste un brouillon ; { inputs, version? } utilise un modèle publié.
 */
export const POST = handler(async (req) => {
  const { inputs, version, model } = parseWith(ComputeSchema, await readJson(req));
  const m = (model as RuleModel | undefined) ?? modelByVersion(version);
  if (!m) return json({ ok: false, error: "Aucun modèle de règles disponible" }, 404);
  const app = resolveApp(m, currentSchema(), getState().observations);
  if (model) {
    // Brouillon : même validation qu'à la publication (sinon une expression invalide finirait en 500)
    const issues = validateModel(m, { fields: app.fields });
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length) return json({ ok: false, error: `Brouillon non exécutable : ${errors.length} erreur${errors.length > 1 ? "s" : ""}`, issues }, 422);
  }
  const result = compute(m, inputs, { fields: app.fields });
  return json({ ok: true, version: "version" in m ? m.version : null, ...result });
});
