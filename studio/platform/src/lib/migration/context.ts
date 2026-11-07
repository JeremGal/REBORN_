import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Projet de migration de la requête en cours. Chaque appel d'API peut désigner son projet
 * (?project=MIG_xxxxxxxx ou en-tête x-reborn-project) ; sinon le projet courant est utilisé.
 * Deux requêtes simultanées sur deux projets ne se mélangent pas (contexte asynchrone).
 */
const g = globalThis as unknown as { __rebornProjectScope?: AsyncLocalStorage<string> };
export const projectScope = (g.__rebornProjectScope ??= new AsyncLocalStorage<string>());

export const PROJECT_ID = /^MIG_[a-f0-9]{8}$/;

export function projectFromRequest(req: Request): string | null {
  try {
    return new URL(req.url).searchParams.get("project") ?? req.headers.get("x-reborn-project");
  } catch {
    return null;
  }
}
