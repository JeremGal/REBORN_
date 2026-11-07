import { reconcile } from "@/lib/migration/generate";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Réconciliation : relit la base du logiciel en service et la recompare aux sources (modifications des utilisateurs isolées). */
export const POST = handler(
  async () => {
    const r = reconcile();
    return json({ ok: true, status: r.status, checks: r.checks.length, failed: r.checks.filter((c) => c.status === "fail").map((c) => c.id) });
  },
  { write: true },
);
