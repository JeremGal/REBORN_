import { NextResponse, type NextRequest, type ProxyConfig } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/principal";
import { loginPath, PATH_HEADER } from "@/components/shell/next-path";

/**
 * Redirection OPTIMISTE vers la connexion (Next 16 : proxy.ts remplace middleware.ts).
 *
 * Seule la présence du cookie de session est regardée : aucune lecture de base, aucune décision
 * d'accès. La vérification réelle est faite par le layout serveur de l'espace connecté
 * ((platform)/layout.tsx, session relue en base) et, surtout, par chaque route d'API (handler()).
 * Le chemin demandé est transmis au layout (en-tête x-reborn-path) pour le retour après connexion.
 * /api n'est jamais concerné : l'API répond elle-même 401 en JSON (pas de redirection, corps intact).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const here = `${pathname}${search}`;
  if (!SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))) {
    return NextResponse.redirect(new URL(loginPath(here), request.url));
  }
  const forwarded = new Headers(request.headers);
  forwarded.set(PATH_HEADER, here);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // Pages de l'espace connecté et de l'équipe REBORN uniquement (valeurs constantes, lues au build).
  matcher: [
    "/espace",
    "/projets",
    "/projets/:path*",
    "/activite",
    "/parametres",
    "/atelier",
    "/investigation",
    "/regles",
    "/reconstruction",
    "/comparaison",
    "/migration",
    "/design-system",
    "/app",
    "/app/:path*",
  ],
} satisfies ProxyConfig;
