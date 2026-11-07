import { runArtifacts, getProject } from "@/lib/migration/project";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Rapport complet d'une exécution : volumes, contrôles, écarts, rejets (200 premiers), réconciliation. */
export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { result, report, reconciliation, meta } = runArtifacts(id);
  return json({
    meta,
    acknowledged: getProject().acknowledgements[id] ?? null,
    entities: result.entities,
    attachments: { expected: result.attachments.expected, stored: result.attachments.stored, bytes: result.attachments.bytes, missing: result.attachments.missing.length },
    rejections: { total: result.rejections.length, items: result.rejections.slice(0, 200) },
    field_issues: { total: result.field_issues.length, items: result.field_issues.slice(0, 200) },
    duplicates: result.duplicates,
    db_sha256: result.db_sha256,
    report,
    reconciliation,
  });
});
