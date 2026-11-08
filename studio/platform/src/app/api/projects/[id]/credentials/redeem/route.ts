import { loadProject } from "@/lib/migration/project";
import { redeemToken, type RedeemRefusal } from "@/lib/migration/credentials";
import { executorIdentity, projectEvent, requireLeaseHolder } from "@/lib/migration/analysis";
import { currentPrincipal } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const REASON: Record<RedeemRefusal, string> = {
  invalid: "jeton inconnu",
  expired: "jeton expiré (15 minutes)",
  used: "jeton déjà utilisé (usage unique)",
  revoked: "jeton révoqué (identifiants remplacés ou effacés, pause, fin ou reprise de la mission)",
  executor: "jeton remis à un autre exécuteur",
  mission: "jeton d'une autre mission",
  no_credentials: "aucun identifiant disponible (effacés ou expirés)",
};

/**
 * Remise des identifiants à l'exécuteur TITULAIRE de la mission en cours : { token, mission_id? }
 * (format 1.0 inchangé) → { ok, username, password } ; refus : 403 { ok:false, error, reason }.
 * Jeton à usage unique, 15 min, lié à la mission et à l'exécuteur (X-Reborn-Executor). À appeler par le
 * code technique de l'exécuteur, jamais à transmettre à un modèle de langage ni à journaliser.
 *
 * Jamais depuis un navigateur : toute requête portant Origin ou Sec-Fetch-Site (même celle du Studio)
 * est refusée AVANT de lire le jeton, qui n'est donc pas consommé.
 */
export const POST = handler(
  async (req, ctx) => {
    if (req.headers.has("origin") || req.headers.has("sec-fetch-site")) {
      throw new ApiError(403, "Remise des identifiants réservée au code technique de l'exécuteur : jamais depuis un navigateur");
    }
    const { id } = await ctx.params;
    const p = loadProject(id);
    if (!p) throw new ApiError(404, "Projet introuvable");
    if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : aucune remise d'identifiants");
    const ex = executorIdentity(currentPrincipal(), req);
    const b = ((await readJson(req)) ?? {}) as { token?: unknown; mission_id?: unknown };
    const mission = await requireLeaseHolder(id, ex, typeof b.mission_id === "string" ? b.mission_id : undefined);
    const out = redeemToken(id, typeof b.token === "string" ? b.token : "", { executor_id: ex.id, mission_id: mission.id });
    if (!out.ok) return json({ ok: false, error: "Jeton invalide, expiré ou déjà utilisé", reason: out.reason, detail: REASON[out.reason] }, 403);
    projectEvent(id, "Identifiants remis à l'exécuteur titulaire de la mission (jeton à usage unique)", `Mission ${mission.id} · aucune valeur conservée dans le journal`, "explorer", { mission_id: mission.id });
    return json({ ok: true, username: out.credentials.username, password: out.credentials.password });
  },
  { access: ["explorer"], project: "param", write: true },
);
