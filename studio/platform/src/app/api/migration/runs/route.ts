import { getProject, startRun } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Lance la migration (409 si des correspondances restent à valider), puis la vérification.
 * Propriétaire du projet ; l'auteur enregistré est l'identité authentifiée (un champ `by` du corps est ignoré).
 */
export const POST = handler(
  async () => {
    const { run, report } = startRun(actorName());
    return json({ ok: true, run, report: report ? { status: report.status, checks: report.checks.length, failed: report.checks.filter((c) => c.status === "fail").length } : null });
  },
  { access: ["owner"], write: true, project: "query" },
);

/** Exécutions du projet. Propriétaire et Analyste. */
export const GET = handler(async () => json(getProject().runs), { access: ["owner", "analyst"], project: "query" });
