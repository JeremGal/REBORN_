import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/auth";
import { hasSessionCookie } from "@/lib/auth/principal";
import { toPrincipal, userDto } from "@/lib/auth/session";
import { loginPath, PATH_HEADER, safeNextPath } from "./next-path";

/**
 * Session côté serveur pour les pages et layouts (Server Components).
 *
 * Contrôle RÉEL (session relue en base par Better Auth), contrairement à proxy.ts qui ne regarde
 * que la présence du cookie. Lecture seule : `disableRefresh` évite que le rendu prolonge la session
 * sans pouvoir renvoyer le cookie (un layout ne peut pas écrire de cookie) ; la prolongation
 * glissante reste faite par les routes d'API (handler() recopie les Set-Cookie).
 * La vraie barrière reste l'API : ces contrôles n'évitent que d'afficher une page vide.
 */

export type ViewerUser = ReturnType<typeof userDto>;
export interface Viewer {
  user: ViewerUser;
  /** Identifiant de la session en cours (pas le jeton) : repère « cet appareil » dans Paramètres. */
  sessionId: string;
}

interface SessionLike {
  session: { id: string };
  user: { id: string; email: string; firstName?: unknown; lastName?: unknown; company?: unknown; role?: unknown };
}

/** Session du navigateur qui demande la page (mémorisée pour une passe de rendu). */
export const getViewer = cache(async (): Promise<{ viewer: Viewer | null; hadCookie: boolean }> => {
  const h = await headers();
  const cookie = h.get("cookie");
  if (!hasSessionCookie(cookie)) return { viewer: null, hadCookie: false };
  const auth = await getAuth();
  const s = (await auth.api.getSession({ headers: new Headers({ cookie: cookie ?? "" }), query: { disableRefresh: true } })) as SessionLike | null;
  if (!s?.user || !s.session) return { viewer: null, hadCookie: true };
  const p = toPrincipal(s);
  return { viewer: { user: userDto(p), sessionId: p.sessionId }, hadCookie: true };
});

/** Chemin demandé (posé par proxy.ts), validé : sert d'adresse de retour après la connexion. */
export async function requestedPath(): Promise<string> {
  return safeNextPath((await headers()).get(PATH_HEADER));
}

/** Espace connecté : session réelle exigée, sinon page de connexion avec retour à la page demandée. */
export async function requireViewer(): Promise<Viewer> {
  const { viewer, hadCookie } = await getViewer();
  if (viewer) return viewer;
  redirect(loginPath(await requestedPath(), hadCookie ? "expiree" : undefined));
}

/** Pages de l'équipe REBORN : un compte client reçoit la même réponse qu'une page inexistante. */
export async function requireOperator(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.user.role !== "operator") notFound();
  return viewer;
}
