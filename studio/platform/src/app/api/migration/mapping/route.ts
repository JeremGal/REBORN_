import { currentMapping, fixtureAppTarget, planStatus, proposeAutomatic, setMapping } from "@/lib/migration/project";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { assertFixtureAllowed } from "@/lib/service";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Correspondances : corps = contrat migration_mapping, publié par l'Analyste (jeton analyst, ou l'équipe
 * qui le relaie ; ?source=user : saisi par l'équipe).
 * ?propose=auto : proposition générique déduite de la structure lue (propriétaire, Analyste, équipe).
 * ?fixture=crm : jeu de test au format de l'Analyste (Relatio 2004), étiqueté : propriétaire (projet
 * Relatio seulement) ou équipe, jamais un agent ; le nouveau logiciel visé est celui du projet
 * (fixtureAppTarget), pas celui écrit dans le fichier du jeu de test. Un compte client ne publie jamais des correspondances
 * présentées comme venant de l'Analyste (il corrige champ par champ : /api/migration/mapping/fields).
 * Réponses : 200 (version créée, problèmes, points à valider) · 400 format · 403 rôle · 409 aucune source.
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const who = currentPrincipal();
    let v;
    if (sp.has("propose")) {
      if (sp.get("propose") !== "auto") throw new ApiError(400, "propose : auto");
      v = proposeAutomatic();
    } else if (sp.has("fixture")) {
      if (sp.get("fixture") !== "crm") throw new ApiError(400, "Jeu de test inconnu : seul ?fixture=crm (Relatio 2004) existe");
      assertFixtureAllowed(who);
      // Logiciel visé : celui de CE projet (déjà livré, sinon identité propre au projet), jamais celui du fichier
      // du jeu de test, partagé par tous les clients (deux clients ne peuvent pas livrer « morel-crm »).
      v = setMapping({ ...CRM_FIXTURES.mapping, target: fixtureAppTarget() }, "fixture");
    } else {
      const source = sp.get("source") ?? "analyst";
      if (source !== "analyst" && source !== "user") throw new ApiError(400, "source : analyst (défaut) ou user");
      if (source === "user" && !isOperator(who)) throw new ApiError(403, "?source=user : réservé à l'équipe REBORN (opérateur)");
      if (who.kind === "user" && !isOperator(who)) {
        throw new ApiError(403, "Les correspondances sont publiées par l'agent d'analyse : utilisez la proposition automatique, le jeu de test, ou corrigez un champ");
      }
      v = setMapping(await readJson(req), source);
    }
    const st = planStatus();
    return json({ ok: true, version: v.version, issues: v.issues, review: { items: st.items, pending: st.pending, can_run: st.can_run, blockers: st.blockers } });
  },
  { access: ["owner", "analyst"], write: true, project: "query" },
);

/** Version en vigueur et état de la revue. Propriétaire et Analyste. */
export const GET = handler(async () => json({ current: currentMapping(), status: planStatus() }), { access: ["owner", "analyst"], project: "query" });
