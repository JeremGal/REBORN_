import { appStatus, startApp, stopApp } from "@/lib/migration/generate";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handler(async () => json(await appStatus()));

/** { action: "start" | "stop" } — le logiciel livré peut aussi être lancé seul (npm run crm). */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { action?: unknown };
    const st = await appStatus();
    if (!st.app_id) throw new ApiError(409, "Aucun logiciel mis en service");
    if (b.action === "start") await startApp(st.app_id);
    else if (b.action === "stop") await stopApp(st.app_id);
    else throw new ApiError(400, "action : start ou stop");
    return json({ ok: true, app: await appStatus() });
  },
  { write: true },
);
