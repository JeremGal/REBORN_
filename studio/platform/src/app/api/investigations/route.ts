import { activeInvestigationFor, completeInvestigation, createInvestigation, currentScope, getState, investigationById } from "@/lib/store";
import { callerVisibility, investigationInput } from "@/lib/service";
import { canSeeInvestigation } from "@/lib/visibility";
import { canSeeProject, ownerOf } from "@/lib/migration/project";
import { currentPrincipal, type Principal } from "@/lib/auth/principal";
import { LegacyUrlSchema } from "@/lib/migration/project-contracts";
import { redactFreeText, secretContext } from "@/lib/migration/agent-writes";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { runSimulation } from "@/lib/simulator";
import type { Investigation } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Nouvelle investigation. Jamais par un compte client (l'analyse de son logiciel passe par
 * POST /api/projects/[id]/analysis). Exécuteur de l'agent (jeton explorer) : « agents réels » (live)
 * uniquement, sur un projet existant s'il en désigne un. Équipe (opérateur) : tous les modes, dont
 * simulation (explorateur de répétition : requêtes émises par le serveur) et replay — l'explorateur de
 * répétition ne travaille que pour l'atelier, sans projet. Projet : project_id du corps et/ou ?project=
 * (identiques s'ils sont deux). Seule l'investigation en cours du MÊME projet (ou de l'atelier) est clôturée.
 * target_url : même contrôle que l'adresse d'un projet (LegacyUrlSchema : http(s), sans identifiant ;
 * l'évènement « investigation lancée » la recopie) ; secrets connus masqués dans les textes libres.
 */
export const POST = handler(
  async (req) => {
    const input = investigationInput(await readJson(req));
    const who = currentPrincipal();
    if (who.kind === "service" && input.mode !== "live") {
      throw new ApiError(403, "Modes simulation et replay réservés à l'équipe REBORN : un agent lance uniquement des investigations « agents réels » (mode live)");
    }
    if (input.mode === "simulation" && input.project_id) throw new ApiError(400, "Le mode simulation (explorateur de répétition) ne s'applique qu'à l'atelier, sans projet");
    if (input.target_url !== undefined) {
      if (!input.target_url.trim()) delete input.target_url;
      else {
        const url = LegacyUrlSchema.safeParse(input.target_url);
        if (!url.success) throw new ApiError(400, "Adresse cible refusée", [{ path: "target_url", message: url.error.issues[0]?.message ?? "Adresse invalide" }]);
        input.target_url = url.data;
      }
    }
    const secrets = secretContext([input.project_id ?? null]);
    for (const k of ["application", "module", "objective"] as const) {
      const v = input[k];
      if (typeof v === "string") input[k] = redactFreeText(v, secrets, false);
    }
    const inv = createInvestigation(input);
    if (inv.mode === "simulation") void runSimulation(inv);
    return json({ ok: true, investigation: inv });
  },
  { access: ["explorer", "operator"], write: true, project: "query" },
);

/**
 * Liste des investigations visibles (compte client : celles de SES projets ; ?project= : ce projet).
 * ?active=1 : investigation en cours, ou null. Équipe et agents sans projet : celle de l'atelier ;
 * sinon la plus récente en cours parmi les projets visibles.
 * ?active=1&mode=live : uniquement si elle attend les agents réels (polling de l'Explorer :
 * un scénario local ou l'explorateur de répétition ne déclenchent jamais l'agent H Company).
 */
export const GET = handler(
  async (req) => {
    const s = getState();
    const v = callerVisibility();
    const sp = new URL(req.url).searchParams;
    const visible = v.all ? s.investigations : s.investigations.filter((i) => canSeeInvestigation(v, i));
    if (sp.get("active")) {
      const mode = sp.get("mode");
      const ok = (i: Investigation | null | undefined) => !!i && i.status === "running" && (!mode || i.mode === mode);
      if (v.all) {
        const a = activeInvestigationFor(null);
        return json(ok(a) ? a : null);
      }
      return json(visible.filter(ok).at(-1) ?? null);
    }
    return json(visible);
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);

/** Qui peut clore une investigation : agents ; équipe (atelier et ses projets) ; client propriétaire du projet. */
function mayClose(who: Principal, inv: Investigation): boolean {
  if (who.kind === "service") return true;
  if (who.kind !== "user") return false;
  if (!inv.project_id) return who.role === "operator";
  return canSeeProject(who, ownerOf(inv.project_id));
}

/** Clôture : { id, status: "completed" | "failed" } — investigation introuvable ou d'un autre compte : 404. */
export const PATCH = handler(
  async (req) => {
    const body = (await readJson(req)) as { id?: unknown; status?: unknown };
    if (typeof body?.id !== "string") throw new ApiError(400, "id requis");
    const inv = investigationById(body.id);
    if (!inv || !mayClose(currentPrincipal(), inv)) throw new ApiError(404, "Investigation introuvable");
    const scope = currentScope();
    if (scope && (inv.project_id ?? null) !== scope) throw new ApiError(422, "Cette investigation appartient à un autre projet que celui de la requête (?project=)");
    completeInvestigation(inv.id, body.status === "failed" ? "failed" : "completed");
    return json({ ok: true });
  },
  { access: ["user", "explorer", "analyst"], write: true, project: "query" },
);
