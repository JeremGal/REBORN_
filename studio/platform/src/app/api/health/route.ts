import { CONTRACT_VERSION } from "@/lib/schemas";
import { ENGINE_ID } from "@/lib/engine/engine";
import { activeInvestigation, currentModel, currentSchema, getState } from "@/lib/store";
import { handler, json } from "@/lib/http";
import { bearerToken } from "@/lib/auth/tokens";
import { currentPrincipal, isOperator, type Principal } from "@/lib/auth/principal";
import { modeGroup } from "@/lib/modes";

export const dynamic = "force-dynamic";

function authInfo(p: Principal, bearerPresented: boolean) {
  if (p.kind === "user") return { authenticated: true, kind: "user" as const, role: p.role };
  if (p.kind === "service") return { authenticated: true, kind: "service" as const, service: p.service };
  return { authenticated: false, ...(bearerPresented ? { token_valid: false } : {}) };
}

/**
 * Vérification de connexion (ne révèle aucun secret). Publique et réduite : joignable, version des
 * contrats, état d'authentification de l'appelant. Le diagnostic complet (investigation active,
 * compteurs) n'est servi qu'à l'équipe (opérateur) et aux agents (jetons de service).
 */
export const GET = handler(
  async (req) => {
    const p = currentPrincipal();
    const base = { ok: true, service: "reborn", contract_version: CONTRACT_VERSION, auth: authInfo(p, bearerToken(req) !== null) };
    if (!(p.kind === "service" || isOperator(p))) return json(base);
    const s = getState();
    const inv = activeInvestigation();
    return json({
      ...base,
      engine: ENGINE_ID,
      mode: inv ? modeGroup(inv.mode) : null,
      active_investigation: inv ? { id: inv.id, number: inv.number, mode: inv.mode, kind: inv.kind, status: inv.status, application: inv.application } : null,
      revision: s.revision,
      event_seq: s.event_seq,
      counts: { investigations: s.investigations.length, observations: s.observations.length, models: s.models.length, schemas: s.schemas.length, events: s.events.length },
      current: { model_version: currentModel()?.version ?? null, schema_version: currentSchema()?.version ?? null },
      server_time: new Date().toISOString(),
    });
  },
  { access: ["public"], project: "none" },
);
