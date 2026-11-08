import path from "node:path";
import { appIdTaken, deploy } from "@/lib/migration/generate";
import { getProject, loadProject, projectIds, runArtifacts } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Logiciel livré déjà attribué à un AUTRE projet (mis en service par lui) : jamais remplacé. Complète le
 * marqueur .reborn-project du générateur, absent des logiciels livrés avant son introduction.
 */
function assertAppNotClaimed(appId: string, projectId: string) {
  for (const id of projectIds()) {
    if (id === projectId) continue;
    const other = loadProject(id);
    if (!other) continue;
    if (other.app?.id === appId || other.deployments.some((d) => path.basename(d.app_dir) === appId)) {
      throw appIdTaken(appId);
    }
  }
}

/**
 * Génère le nouveau logiciel et le met en service avec la base migrée : { run_id, force? }.
 * Propriétaire du projet ; l'auteur enregistré est l'identité authentifiée.
 * 409 si la vérification n'est pas validée (ou ses écarts non acceptés), si le logiciel visé appartient à
 * un autre projet, ou si le logiciel en service contient des saisies d'utilisateurs (force = confirmation
 * explicite, sauvegarde faite).
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { run_id?: unknown; force?: unknown };
    if (typeof b.run_id !== "string") throw new ApiError(400, "run_id requis");
    assertAppNotClaimed(runArtifacts(b.run_id).mapping.target.id, getProject().id);
    const out = await deploy(b.run_id, actorName(), { force: b.force === true });
    return json({ ok: true, deployment: out.deployment, url: out.url });
  },
  { access: ["owner"], write: true, project: "query" },
);
