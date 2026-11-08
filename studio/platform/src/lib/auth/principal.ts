import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Identité de la requête en cours (lot A1, SPEC §1.1).
 *
 * - client : compte créé par inscription ; operator : équipe REBORN (attribué uniquement par
 *   `npm run account -- operator <email>`, jamais par l'API) ;
 * - service : agents internes (exécuteur de Mouss, Analyste d'Alan) par jeton Bearer ;
 * - anonymous : aucune identité.
 *
 * Module sans dépendance lourde : importable par project.ts, http.ts et les tests.
 */
export type Role = "client" | "operator";
export type ServiceKind = "explorer" | "analyst" | "all";
export type UserPrincipal = {
  kind: "user";
  userId: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  sessionId: string;
};
export type ServicePrincipal = { kind: "service"; service: ServiceKind; tokenId: string };
export type Principal = { kind: "anonymous" } | UserPrincipal | ServicePrincipal;

export const ANONYMOUS: Principal = Object.freeze({ kind: "anonymous" }) as Principal;

/** Singleton porté par globalThis (comme projectScope) : survit au rechargement à chaud. */
const g = globalThis as unknown as { __rebornPrincipalScope?: AsyncLocalStorage<Principal> };
export const principalScope = (g.__rebornPrincipalScope ??= new AsyncLocalStorage<Principal>());

/** Principal de la requête ; { kind: "anonymous" } hors portée. */
export function currentPrincipal(): Principal {
  return principalScope.getStore() ?? ANONYMOUS;
}

/** Principal posé par handler(), ou undefined pour un appel interne (tests de la chaîne, scénarios). */
export function scopedPrincipal(): Principal | undefined {
  return principalScope.getStore();
}

export const isOperator = (p: Principal | undefined): p is UserPrincipal => p?.kind === "user" && p.role === "operator";

const SERVICE_LABEL: Record<ServiceKind, string> = { explorer: "Exécuteur de l'agent (service)", analyst: "Analyste (service)", all: "Agent REBORN (service)" };

/** Nom affiché pour la traçabilité (« Prénom Nom », ou le service) : jamais pris du corps d'une requête. */
export function displayName(p: Principal): string {
  if (p.kind === "user") return `${p.firstName} ${p.lastName}`.trim() || p.email;
  if (p.kind === "service") return SERVICE_LABEL[p.service];
  return "Anonyme";
}

/**
 * Noms possibles du cookie de session Better Auth (préfixe « reborn »). `__Secure-` seulement
 * quand REBORN_PUBLIC_URL est en https. Constantes sans dépendance : utilisables par un futur proxy.ts
 * pour une redirection optimiste (la vraie vérification reste côté API).
 */
export const SESSION_COOKIE = "reborn.session_token";
export const SECURE_SESSION_COOKIE = "__Secure-reborn.session_token";
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE, SECURE_SESSION_COOKIE] as const;

export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const name = part.split("=")[0]?.trim();
    return name === SESSION_COOKIE || name === SECURE_SESSION_COOKIE;
  });
}
