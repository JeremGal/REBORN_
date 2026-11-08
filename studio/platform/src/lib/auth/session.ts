import { getAuth } from "./auth";
import { ANONYMOUS, hasSessionCookie, type Principal, type UserPrincipal } from "./principal";

/**
 * Session Better Auth → Principal (DTO minimal). Lit l'en-tête Cookie brut : aucun contexte de
 * requête Next n'est nécessaire (route handlers, tests vitest). Sans cookie de session, aucune
 * lecture de la base. La session est revérifiée en base à chaque requête (pas de cookieCache).
 */

interface SessionLike {
  session: { id: string };
  user: { id: string; email: string; firstName?: unknown; lastName?: unknown; company?: unknown; role?: unknown };
}

export function toPrincipal(s: SessionLike): UserPrincipal {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const company = str(s.user.company).trim();
  return {
    kind: "user",
    userId: s.user.id,
    role: s.user.role === "operator" ? "operator" : "client",
    email: s.user.email,
    firstName: str(s.user.firstName),
    lastName: str(s.user.lastName),
    company: company || null,
    sessionId: s.session.id,
  };
}

/**
 * Principal et en-têtes Set-Cookie produits par Better Auth (session prolongée : 7 jours glissants,
 * ou cookie périmé effacé) : handler() les recopie sur la réponse.
 */
export async function resolveSession(headers: Headers): Promise<{ principal: Principal; setCookies: string[] }> {
  if (!hasSessionCookie(headers.get("cookie"))) return { principal: ANONYMOUS, setCookies: [] };
  const auth = await getAuth();
  const out = await auth.api.getSession({ headers, returnHeaders: true });
  const setCookies = out.headers?.getSetCookie?.() ?? [];
  const s = out.response as SessionLike | null;
  return { principal: s?.user && s.session ? toPrincipal(s) : ANONYMOUS, setCookies };
}

/** Principal de la session présentée (anonyme si aucune session valide). */
export async function getSessionPrincipal(headers: Headers): Promise<Principal> {
  return (await resolveSession(headers)).principal;
}

/** Ce que le navigateur peut connaître de son propre compte. */
export function userDto(p: UserPrincipal) {
  return { id: p.userId, email: p.email, firstName: p.firstName, lastName: p.lastName, company: p.company, role: p.role };
}
