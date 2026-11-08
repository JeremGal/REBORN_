import { getState, investigationById } from "@/lib/store";
import { callerVisibility, ingestEvents } from "@/lib/service";
import { canSee, canSeeInvestigation, eventProject } from "@/lib/visibility";
import { EventPayload } from "@/lib/schemas";
import { projectOfWrite, redactIncomingEvents, requireExecutorLease, secretContext } from "@/lib/migration/agent-writes";
import { ApiError, handler, json, parseWith, readJson } from "@/lib/http";
import { runRequestedExperiment } from "@/lib/simulator";

export const dynamic = "force-dynamic";

/**
 * Journal temps réel : actions de l'Explorer, hypothèses et demandes d'expérience de l'Analyste.
 * Agents (jetons de service) et équipe uniquement. Projet de chaque évènement fixé par REBORN :
 * ?project= de la requête, sinon projet de l'investigation (une investigation d'un autre projet que
 * celui de la requête : 422).
 * Exécuteur de l'agent : dans le projet d'un client, seulement s'il tient le prêt de la mission en cours
 * (SPEC §6 ; 403 sinon). Saisies de mot de passe et secrets connus masqués AVANT l'enregistrement
 * (lib/migration/agent-writes.ts) : ils n'entrent jamais dans le journal ni dans le flux temps réel.
 */
export const POST = handler(
  async (req) => {
    const raw = await readJson(req);
    const list = parseWith(EventPayload, raw);
    const projects = list.map((e) => projectOfWrite(e.investigation_id));
    await requireExecutorLease(req, projects, list.map((e) => e.source));
    const saved = ingestEvents(redactIncomingEvents(raw, secretContext(projects)), { external: true });
    // Explorateur de répétition (atelier) : il exécute lui-même les demandes d'expérience de l'atelier,
    // jamais celles d'un projet client.
    const s = getState();
    for (const e of saved) if (e.type === "experiment_request" && eventProject(s, e) === null) void runRequestedExperiment(e);
    return json({ ok: true, ids: saved.map((e) => e.id), seqs: saved.map((e) => e.seq) });
  },
  { access: ["explorer", "analyst", "operator"], write: true, project: "query" },
);

/**
 * Polling : ?after_seq=N (recommandé) ou ?since=ISO, &type=…, &investigation_id=…, &limit=…
 * Compte client : évènements de SES projets seulement (?project= : ce projet seul). Une investigation
 * qu'il ne peut pas voir : 404, comme une investigation inconnue.
 */
export const GET = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const afterSeq = sp.get("after_seq");
    const since = sp.get("since");
    const type = sp.get("type");
    const inv = sp.get("investigation_id");
    const limit = Math.min(Number(sp.get("limit") ?? 1000) || 1000, 5000);
    const v = callerVisibility();
    if (inv && !v.all) {
      const i = investigationById(inv);
      if (!i || !canSeeInvestigation(v, i)) throw new ApiError(404, "Investigation introuvable");
    }
    const s = getState();
    const events = s.events.filter(
      (e) =>
        (afterSeq === null || e.seq > Number(afterSeq)) &&
        (!since || e.ts > since) &&
        (!type || e.type === type) &&
        (!inv || e.investigation_id === inv) &&
        canSee(v, s, e),
    );
    return json(events.slice(0, limit));
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
