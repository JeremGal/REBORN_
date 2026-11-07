import { CONTRACT_VERSION } from "@/lib/schemas";
import { ENGINE_ID } from "@/lib/engine/engine";
import { activeInvestigation, currentModel, currentSchema, getState } from "@/lib/store";
import { handler, json, presentedToken, isValidToken } from "@/lib/http";
import { modeGroup } from "@/lib/modes";

export const dynamic = "force-dynamic";

/**
 * Vérification de connexion pour les intégrations (ne révèle aucun secret) :
 * plateforme joignable, version des contrats, jeton exigé et valide, mode courant.
 */
export const GET = handler(async (req) => {
  const s = getState();
  const inv = activeInvestigation();
  const required = !!process.env.REBORN_API_TOKEN;
  const presented = presentedToken(req);
  return json({
    ok: true,
    service: "reborn",
    contract_version: CONTRACT_VERSION,
    engine: ENGINE_ID,
    auth: {
      write_token_required: required,
      token_presented: !!presented,
      token_valid: required ? isValidToken(presented) : null,
      can_write: !required || isValidToken(presented),
    },
    mode: inv ? modeGroup(inv.mode) : null,
    active_investigation: inv ? { id: inv.id, number: inv.number, mode: inv.mode, kind: inv.kind, status: inv.status, application: inv.application } : null,
    revision: s.revision,
    event_seq: s.event_seq,
    counts: { investigations: s.investigations.length, observations: s.observations.length, models: s.models.length, schemas: s.schemas.length, events: s.events.length },
    current: { model_version: currentModel()?.version ?? null, schema_version: currentSchema()?.version ?? null },
    server_time: new Date().toISOString(),
  });
});
