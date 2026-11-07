import { getState } from "@/lib/store";
import { ingestEvents } from "@/lib/service";
import { handler, json, readJson } from "@/lib/http";
import { runRequestedExperiment } from "@/lib/simulator";

export const dynamic = "force-dynamic";

/** Journal temps réel : actions de l'Explorer, hypothèses et demandes d'expérience de l'Analyste. */
export const POST = handler(
  async (req) => {
    const saved = ingestEvents(await readJson(req), { external: true });
    // Explorer simulé : il exécute lui-même les demandes d'expérience
    for (const e of saved) if (e.type === "experiment_request") void runRequestedExperiment(e);
    return json({ ok: true, ids: saved.map((e) => e.id), seqs: saved.map((e) => e.seq) });
  },
  { write: true },
);

/** Polling : ?after_seq=N (recommandé) ou ?since=ISO, &type=…, &investigation_id=…, &limit=… */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const afterSeq = sp.get("after_seq");
  const since = sp.get("since");
  const type = sp.get("type");
  const inv = sp.get("investigation_id");
  const limit = Math.min(Number(sp.get("limit") ?? 1000) || 1000, 5000);
  const events = getState().events.filter(
    (e) =>
      (afterSeq === null || e.seq > Number(afterSeq)) &&
      (!since || e.ts > since) &&
      (!type || e.type === type) &&
      (!inv || e.investigation_id === inv),
  );
  return json(events.slice(0, limit));
});
