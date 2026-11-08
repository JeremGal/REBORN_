import { businessModelPackage, getProject, publishBusinessModel } from "@/lib/migration/project";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { currentModel } from "@/lib/store";
import { actorName, assertFixtureAllowed } from "@/lib/service";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Modèle métier : corps = contrat business_model (modules de règles + liaisons). Chaque envoi crée une
 * version « à valider » ; 400 contrat non conforme. L'auteur enregistré est l'identité authentifiée.
 * - envoi de l'Analyste : jeton analyst (ou l'équipe qui le relaie) ; ?source=user : saisi par l'équipe ;
 * - ?fixture=crm : jeu de test au format de l'Analyste (Relatio 2004), étiqueté comme tel : propriétaire
 *   (projet Relatio seulement) ou équipe, jamais un agent ;
 * - ?from=investigation : règles reconstruites par l'investigation DE CE PROJET (équipe seulement).
 * Un compte client ne publie jamais un modèle présenté comme venant de l'Analyste.
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const who = currentPrincipal();
    const by = actorName();
    if (sp.has("from")) {
      if (sp.get("from") !== "investigation") throw new ApiError(400, "from : investigation");
      if (!isOperator(who)) throw new ApiError(403, "?from=investigation : réservé à l'équipe REBORN (opérateur)");
      // Chaîne unifiée : les règles reconstruites par l'investigation (écran de l'ancien logiciel) de CE
      // projet deviennent un module du modèle métier, lié à une entité du nouveau logiciel : { module?, bindings }
      const body = (await readJson(req)) as { module?: unknown; bindings?: unknown; notes?: unknown };
      const model = currentModel();
      if (!model) throw new ApiError(409, "Aucun modèle de règles publié par l'investigation de ce projet");
      const { version: _v, received_at: _r, source: _s, diff: _d, issues: _i, project_id: _p, investigation_id: _inv, ...rules } = model as typeof model & { project_id?: string; investigation_id?: string };
      const name = typeof body.module === "string" && body.module ? body.module : (rules.module || "regles").toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").slice(0, 60) || "regles";
      const meta = publishBusinessModel(
        { contract_version: "1.0", source_system: rules.application, modules: { [name]: rules }, bindings: body.bindings ?? [], notes: typeof body.notes === "string" ? body.notes : `Règles de l'investigation (modèle v${model.version}), liées au nouveau logiciel` },
        "investigation",
        by,
      );
      return json({ ok: true, version: meta.version, status: meta.status, issues: meta.issues, module: name });
    }
    if (sp.has("fixture")) {
      if (sp.get("fixture") !== "crm") throw new ApiError(400, "Jeu de test inconnu : seul ?fixture=crm (Relatio 2004) existe");
      assertFixtureAllowed(who);
      const meta = publishBusinessModel(CRM_FIXTURES.business_model, "fixture", by);
      return json({ ok: true, version: meta.version, status: meta.status, issues: meta.issues });
    }
    const source = sp.get("source") ?? "analyst";
    if (source !== "analyst" && source !== "user") throw new ApiError(400, "source : analyst (défaut) ou user");
    if (source === "user" && !isOperator(who)) throw new ApiError(403, "?source=user : réservé à l'équipe REBORN (opérateur)");
    if (who.kind === "user" && !isOperator(who)) {
      throw new ApiError(403, "Le modèle métier est publié par l'agent d'analyse : utilisez le jeu de test, ou attendez son envoi");
    }
    const meta = publishBusinessModel(await readJson(req), source, by);
    return json({ ok: true, version: meta.version, status: meta.status, issues: meta.issues });
  },
  { access: ["owner", "analyst"], write: true, project: "query" },
);

/** Versions reçues (+ ?version=N : contenu complet de la version). Propriétaire et Analyste. */
export const GET = handler(
  async (req) => {
    const v = new URL(req.url).searchParams.get("version");
    if (v) return json(businessModelPackage(Number(v)));
    return json({ versions: getProject().business_models ?? [] });
  },
  { access: ["owner", "analyst"], project: "query" },
);
