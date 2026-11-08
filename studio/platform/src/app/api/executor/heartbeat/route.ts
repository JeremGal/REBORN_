import { executorIdentity, heartbeat } from "@/lib/migration/analysis";
import { ExecutorHeartbeatSchema } from "@/lib/migration/project-contracts";
import { currentPrincipal } from "@/lib/auth/principal";
import { handler, json, parseWith, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Battement de cœur de l'exécuteur (contrat executor_heartbeat 1.0), au moins toutes les 20 s :
 * { version, networks: ["public"|"private"], login: "h_vault"|"cdp"|"none", max_concurrent, active_missions[] }
 * → { server_time, renew_within_s: 20, executor_id, lease_s, leases[] }. Renouvelle le prêt (120 s) des
 * missions déclarées en cours ; sans battement depuis 60 s, l'agent est « non disponible ».
 * Jeton de service explorer ; plusieurs exécuteurs d'un même jeton se distinguent par X-Reborn-Executor.
 */
export const POST = handler(
  async (req) => {
    const ex = executorIdentity(currentPrincipal(), req);
    const b = parseWith(ExecutorHeartbeatSchema, await readJson(req));
    return json(await heartbeat(ex, b));
  },
  { access: ["explorer"], project: "none", write: true },
);
