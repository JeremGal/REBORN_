import { getProject, startRun } from "@/lib/migration/project";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Lance la migration (409 si des correspondances restent à valider), puis la vérification. */
export const POST = handler(
  async (req) => {
    const b = ((await readJson(req).catch(() => ({}))) ?? {}) as { by?: unknown };
    const { run, report } = startRun(typeof b.by === "string" ? b.by.slice(0, 60) : "opérateur");
    return json({ ok: true, run, report: report ? { status: report.status, checks: report.checks.length, failed: report.checks.filter((c) => c.status === "fail").length } : null });
  },
  { write: true },
);

export const GET = handler(async () => json(getProject().runs));
