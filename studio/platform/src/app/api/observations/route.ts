import { getState } from "@/lib/store";
import { ingestObservationBatch } from "@/lib/service";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Explorer → REBORN. Une observation, un tableau, ou { observations: [...] } (contracts/observation.example.json).
 * 200 : enregistrées (`duplicates` = renvois identiques ignorés) · 400 format · 409 investigation active locale · 422 incohérence.
 */
export const POST = handler(
  async (req) => {
    const { saved, duplicates } = ingestObservationBatch(await readJson(req), "explorer", { external: true });
    const s = getState();
    return json({
      ok: true,
      count: saved.length,
      duplicates,
      investigation_id: saved[0]?.investigation_id ?? s.active_investigation_id ?? null,
      experiment_ids: saved.map((o) => o.experiment_id),
    });
  },
  { write: true },
);

export const GET = handler(async (req) => {
  const inv = new URL(req.url).searchParams.get("investigation_id");
  const obs = getState().observations;
  return json(inv ? obs.filter((o) => o.investigation_id === inv) : obs);
});
