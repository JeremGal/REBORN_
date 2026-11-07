import { compareAll } from "@/lib/compare";
import { resolveApp } from "@/lib/appschema";
import { currentSchema, getState, modelByVersion } from "@/lib/store";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Rapport de comparaison historique ↔ reconstruit. ?investigation_id=INV_002&version=1 */
export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const s = getState();
  const v = sp.get("version");
  const model = modelByVersion(v ? Number(v) : null);
  const inv = sp.get("investigation_id") ?? s.active_investigation_id ?? "all";
  const app = resolveApp(model, currentSchema(), s.observations);
  return json(compareAll(model, s.observations, inv, { fields: app.fields }));
});
