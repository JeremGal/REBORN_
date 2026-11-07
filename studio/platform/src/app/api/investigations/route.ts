import { completeInvestigation, getState } from "@/lib/store";
import { launchInvestigation } from "@/lib/service";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { runSimulation } from "@/lib/simulator";

export const dynamic = "force-dynamic";

export const POST = handler(
  async (req) => {
    const inv = launchInvestigation(await readJson(req));
    if (inv.mode === "simulation") void runSimulation(inv);
    return json({ ok: true, investigation: inv });
  },
  { write: true },
);

/**
 * ?active=1 : investigation en cours, ou null.
 * ?active=1&mode=live : uniquement si elle attend les agents réels (polling de l'Explorer :
 * un scénario local ou l'explorateur de répétition ne déclenchent jamais l'agent H Company).
 */
export const GET = handler(async (req) => {
  const s = getState();
  const sp = new URL(req.url).searchParams;
  if (sp.get("active")) {
    const mode = sp.get("mode");
    return json(s.investigations.find((i) => i.id === s.active_investigation_id && i.status === "running" && (!mode || i.mode === mode)) ?? null);
  }
  return json(s.investigations);
});

/** Clôture : { id, status: "completed" | "failed" } */
export const PATCH = handler(
  async (req) => {
    const body = (await readJson(req)) as { id?: unknown; status?: unknown };
    if (typeof body?.id !== "string") throw new ApiError(400, "id requis");
    completeInvestigation(body.id, body.status === "failed" ? "failed" : "completed");
    return json({ ok: true });
  },
  { write: true },
);
