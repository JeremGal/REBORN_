import { ApiError } from "../errors";
import { currentScope, investigationById } from "../store";
import { currentPrincipal, type Principal } from "../auth/principal";
import { executorIdentity, requireLeaseHolder, type ExecutorIdentity } from "./analysis";
export { isSecretFieldName, MASK, PASSWORD_FIELD, redactFreeText, redactIncomingEvents, redactIncomingObservations, redactIncomingSchema, secretContext, type SecretContext } from "./redact";

/**
 * Écritures reçues des agents sur les routes de la découverte (lot C4, demandes des lots B1 et B2) :
 * évènements, observations, schémas d'écran et exports déposés.
 *
 * 1. Titulaire du prêt (SPEC §6) : un appel de l'EXÉCUTEUR qui écrit dans le projet d'un client (désigné par
 *    ?project= ou par l'investigation citée) n'est accepté que s'il tient le prêt de la mission en cours de
 *    ce projet (requireLeaseHolder : 403 sinon, 409 si l'adresse a changé). L'atelier (aucun projet) n'est
 *    pas concerné. L'Analyste (jeton analyst) n'a pas de mission : jamais concerné. L'ancien jeton commun
 *    (« all », explorer + analyst) agit comme l'exécuteur, sauf pour un envoi entièrement déclaré
 *    « analyst » (évènements source analyst, schéma ?source=analyst).
 * 2. Masquage des secrets dans tout ce que les agents envoient (évènements, observations, schémas d'écran,
 *    rapports) : lib/migration/redact.ts (réexporté ici pour les routes). Les observations et les schémas,
 *    valeurs métier, ne perdent qu'un champ mot de passe nommé comme tel au mot près et les secrets connus.
 */

/* ------------------------------------------------------------------ */
/* Titulaire du prêt                                                    */
/* ------------------------------------------------------------------ */

/** L'appel est-il celui de l'exécuteur de l'agent ? (sources déclarées : celles de l'envoi, si la route en a) */
export function executorCall(who: Principal, declaredSources?: readonly string[]): boolean {
  if (who.kind !== "service") return false;
  if (who.service === "explorer") return true;
  if (who.service === "all") return !(declaredSources && declaredSources.length > 0 && declaredSources.every((s) => s === "analyst"));
  return false;
}

/**
 * Projet d'un envoi : celui de l'investigation citée, sinon la portée de la requête (?project=) —
 * exactement le rattachement du store. Investigation d'un autre projet que celui de la requête : 422 tout de
 * suite (même refus que le store, avant le contrôle du prêt) ; une investigation inconnue est refusée plus loin.
 */
export function projectOfWrite(investigationId: unknown): string | null {
  const scope = currentScope();
  if (typeof investigationId !== "string" || !investigationId) return scope;
  const inv = investigationById(investigationId);
  if (!inv) return scope;
  const project = inv.project_id ?? null;
  if (scope && project !== scope) throw new ApiError(422, `investigation_id ${investigationId} : investigation d'un autre projet que celui de la requête (?project=).`);
  return project;
}

/**
 * Exécuteur qui écrit dans des projets clients : prêt exigé pour CHACUN (403 / 409), avant toute écriture.
 * Renvoie son identité (pour markExploring), ou null si l'appel n'est pas celui de l'exécuteur.
 */
export async function requireExecutorLease(req: Request, projects: Iterable<string | null | undefined>, declaredSources?: readonly string[]): Promise<ExecutorIdentity | null> {
  const who = currentPrincipal();
  if (!executorCall(who, declaredSources)) return null;
  const ex = executorIdentity(who, req);
  for (const p of new Set([...projects].filter((x): x is string => typeof x === "string" && x.length > 0))) await requireLeaseHolder(p, ex);
  return ex;
}
