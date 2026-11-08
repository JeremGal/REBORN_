import { appStatus, startApp, stopApp, upgradeApp } from "@/lib/migration/generate";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { assertActive } from "@/lib/migration/project";
import { actorName, appStatusView } from "@/lib/service";
import { waitAppPublicUrl } from "@/lib/migration/public-urls";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";

export const dynamic = "force-dynamic";

/** État du logiciel livré du projet (propriétaire) : ni processus, ni fichier d'identifiants, ni commande pour un client. */
export const GET = handler(async () => json(appStatusView(await appStatus())), { access: ["owner"], project: "query" });

/**
 * { action: "start" | "stop" | "upgrade" } — le logiciel livré peut aussi être lancé seul (npm run crm).
 * start / stop : propriétaire du projet. upgrade (nouvelle version du moteur et de la spécification,
 * données conservées) : équipe REBORN seulement.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { action?: unknown };
    if (b.action !== "start" && b.action !== "stop" && b.action !== "upgrade") throw new ApiError(400, "action : start, stop ou upgrade");
    if (b.action === "upgrade" && !isOperator(currentPrincipal())) throw new ApiError(403, "Mise à jour du logiciel livré : réservée à l'équipe REBORN (opérateur)");
    assertActive();
    const st = await appStatus();
    if (!st.app_id) throw new ApiError(409, "Aucun logiciel mis en service");
    if (b.action === "upgrade") return json({ ok: true, upgrade: await upgradeApp(actorName()), app: appStatusView(await appStatus()) });
    if (b.action === "start") {
      await startApp(st.app_id);
      await waitAppPublicUrl(st.port); // mode tunnels : la réponse porte déjà l'adresse https du logiciel
    }
    else await stopApp(st.app_id);
    return json({ ok: true, app: appStatusView(await appStatus()) });
  },
  { access: ["owner"], write: true, project: "query" },
);
