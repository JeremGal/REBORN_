import { businessModelPackage, getProject, publishBusinessModel } from "@/lib/migration/project";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { currentModel } from "@/lib/store";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Modèle métier (Analyste → Jerem) : corps = contrat business_model (modules de règles + liaisons).
 * ?fixture=crm : jeu de test au format de l'Analyste (Relatio 2004), étiqueté comme tel.
 * Chaque envoi crée une version « à valider » ; 400 contrat non conforme.
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    if (sp.get("from") === "investigation") {
      // Chaîne unifiée : les règles reconstruites par l'investigation (écran de l'ancien logiciel)
      // deviennent un module du modèle métier, lié à une entité du nouveau logiciel : { module?, bindings }
      const body = (await readJson(req)) as { module?: unknown; bindings?: unknown; notes?: unknown };
      const model = currentModel();
      if (!model) throw new ApiError(409, "Aucun modèle de règles publié par l'investigation");
      const { version: _v, received_at: _r, source: _s, diff: _d, issues: _i, ...rules } = model;
      const name = typeof body.module === "string" && body.module ? body.module : (rules.module || "regles").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 60) || "regles";
      const meta = publishBusinessModel(
        { contract_version: "1.0", source_system: rules.application, modules: { [name]: rules }, bindings: body.bindings ?? [], notes: typeof body.notes === "string" ? body.notes : `Règles de l'investigation (modèle v${model.version}), liées au nouveau logiciel` },
        "investigation",
        sp.get("by")?.slice(0, 60) ?? "opérateur",
      );
      return json({ ok: true, version: meta.version, status: meta.status, issues: meta.issues, module: name });
    }
    const b = sp.get("fixture") === "crm" ? CRM_FIXTURES.business_model : await readJson(req);
    const by = sp.get("by")?.slice(0, 60) ?? (sp.get("fixture") ? "jeu de test" : "Analyste");
    const meta = publishBusinessModel(b, sp.get("fixture") === "crm" ? "fixture" : sp.get("source") === "user" ? "user" : "analyst", by);
    return json({ ok: true, version: meta.version, status: meta.status, issues: meta.issues });
  },
  { write: true },
);

/** Versions reçues (+ ?version=N : contenu complet de la version). */
export const GET = handler(async (req) => {
  const v = new URL(req.url).searchParams.get("version");
  if (v) return json(businessModelPackage(Number(v)));
  return json({ versions: getProject().business_models ?? [] });
});
