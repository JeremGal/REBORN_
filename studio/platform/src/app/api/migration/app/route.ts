import { appStatus, startApp, stopApp, upgradeApp } from "@/lib/migration/generate";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { assertActive } from "@/lib/migration/project";

export const dynamic = "force-dynamic";

export const GET = handler(async () => json(await appStatus()));

/** { action: "start" | "stop" | "upgrade" } — le logiciel livré peut aussi être lancé seul (npm run crm). upgrade : nouvelle version du moteur et de la spécification, données conservées. */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { action?: unknown };
    assertActive();
    const st = await appStatus();
    if (!st.app_id) throw new ApiError(409, "Aucun logiciel mis en service");
    if (b.action === "start") await startApp(st.app_id);
    else if (b.action === "stop") await stopApp(st.app_id);
    else if (b.action === "upgrade") return json({ ok: true, upgrade: await upgradeApp("opérateur"), app: await appStatus() });
    else throw new ApiError(400, "action : start, stop ou upgrade");
    return json({ ok: true, app: await appStatus() });
  },
  { write: true },
);
