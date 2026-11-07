import { listScenarios, runScenarioStep } from "@/lib/scenarios";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Scénarios de démonstration autonomes (données au format des futurs envois Explorer / Analyste). */
export const GET = handler(async () => json(listScenarios()));

/** { scenario: "logistics", step: "baseline" | "change" | "update" } */
export const POST = handler(
  async (req) => {
    const body = (await readJson(req)) as { scenario?: unknown; step?: unknown };
    if (typeof body?.scenario !== "string" || typeof body?.step !== "string") throw new ApiError(400, "scenario et step requis");
    return json({ ok: true, ...runScenarioStep(body.scenario, body.step) });
  },
  { write: true },
);
