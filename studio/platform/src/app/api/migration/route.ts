import { getProject, planStatus } from "@/lib/migration/project";
import { appStatus } from "@/lib/migration/generate";
import { appStatusView } from "@/lib/service";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Vue d'ensemble du projet de migration (sources, correspondances, exécutions, mise en service).
 * Propriétaire du projet et Analyste (lecture). L'état du logiciel livré n'indique ni processus, ni
 * fichier d'identifiants, ni commande hors de l'équipe REBORN.
 */
export const GET = handler(
  async () => {
    const p = getProject();
    const plan = planStatus();
    return json({
      project: { id: p.id, name: p.name, created_at: p.created_at, source_system: p.source_system ?? null },
      sources: p.sources,
      extraction: p.extraction ?? null,
      mapping: plan.mapping ? { version: plan.mapping.version, origin: plan.mapping.origin, received_at: plan.mapping.received_at, sha256: plan.mapping.sha256, target: plan.mapping.mapping.target, entities: plan.mapping.mapping.entities, attachments: plan.mapping.mapping.attachments ?? [], issues: plan.mapping.issues } : null,
      review: { items: plan.items, pending: plan.pending, can_run: plan.can_run, blockers: plan.blockers },
      runs: p.runs,
      acknowledgements: p.acknowledgements,
      deployments: p.deployments,
      app: appStatusView(await appStatus()),
    });
  },
  { access: ["owner", "analyst"], project: "query" },
);
