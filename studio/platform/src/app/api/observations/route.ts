import { activeInvestigationFor, currentScope, getState, investigationById } from "@/lib/store";
import { callerVisibility, ingestObservationBatch } from "@/lib/service";
import { canSeeInvestigation, canSeeObservation } from "@/lib/visibility";
import { ObservationPayload } from "@/lib/schemas";
import { projectOfWrite, redactIncomingObservations, requireExecutorLease, secretContext } from "@/lib/migration/agent-writes";
import { markExploring } from "@/lib/migration/analysis";
import { ApiError, handler, json, parseWith, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Explorer → REBORN. Une observation, un tableau, ou { observations: [...] } (contracts/observation.example.json).
 * Exécuteur de l'agent et équipe uniquement. Chaque observation hérite du projet de son investigation
 * (?project= de la requête : investigation de ce projet, 422 sinon).
 * Exécuteur : dans le projet d'un client, seulement s'il tient le prêt de la mission en cours (SPEC §6 ;
 * 403 sinon) ; ses premières observations font passer la mission à « exploring » et le projet à
 * « Découverte en cours » (markExploring). Avant l'enregistrement, toute saisie d'un champ mot de passe et
 * toute copie d'un secret connu (identifiants confiés au projet, jetons du serveur, sous toutes leurs formes)
 * sont masquées (lib/migration/redact.ts) : elles n'entrent jamais dans le journal ni dans les observations.
 * 200 : enregistrées (`duplicates` = renvois identiques ignorés) · 400 format · 403 prêt · 409 investigation active locale · 422 incohérence.
 */
export const POST = handler(
  async (req) => {
    const raw = await readJson(req);
    const projects = (parseWith(ObservationPayload, raw) as { investigation_id?: string }[]).map((o) => projectOfWrite(o.investigation_id));
    const executor = await requireExecutorLease(req, projects);
    const { saved, duplicates } = ingestObservationBatch(redactIncomingObservations(raw, secretContext(projects)), "explorer", { external: true });
    if (executor && saved.length) for (const p of new Set(projects)) if (p) await markExploring(p, executor);
    return json({
      ok: true,
      count: saved.length,
      duplicates,
      investigation_id: saved[0]?.investigation_id ?? activeInvestigationFor(currentScope())?.id ?? null,
      experiment_ids: saved.map((o) => o.experiment_id),
    });
  },
  { access: ["explorer", "operator"], write: true, project: "query" },
);

/**
 * Observations visibles (compte client : celles de SES projets ; ?project= : ce projet), ou celles
 * d'une investigation (?investigation_id= ; investigation qu'il ne peut pas voir : 404).
 */
export const GET = handler(
  async (req) => {
    const inv = new URL(req.url).searchParams.get("investigation_id");
    const v = callerVisibility();
    if (inv && !v.all) {
      const i = investigationById(inv);
      if (!i || !canSeeInvestigation(v, i)) throw new ApiError(404, "Investigation introuvable");
    }
    const s = getState();
    return json(s.observations.filter((o) => (!inv || o.investigation_id === inv) && canSeeObservation(v, s, o)));
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
