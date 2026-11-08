import type { NextConfig } from "next";

/**
 * En-têtes de sécurité de toutes les réponses du Studio (pages, API, fichiers statiques), sur le modèle de
 * ceux du logiciel livré (runtime/server.mjs) :
 * - Content-Security-Policy : ressources du Studio seulement ; aucune page ne peut l'afficher dans un cadre
 *   (frame-ancestors 'none'), ni changer la base des adresses (base-uri 'none'), ni envoyer un formulaire
 *   ailleurs (form-action 'self'). Scripts en ligne autorisés : Next les utilise pour l'hydratation des pages
 *   statiques (politique « sans nonces » de la documentation de Next 16) ; « unsafe-eval » en développement seulement.
 * - X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer (le chemin d'un projet
 *   n'est jamais transmis au logiciel livré ni à un site tiers).
 * Ces en-têtes sont figés dans le build (routes-manifest) ; Strict-Transport-Security, qui dépend de
 * REBORN_PUBLIC_URL au démarrage, est posé par handler() (lib/http.ts) sur les réponses de l'API, et ici si
 * l'adresse publique en https est déjà connue au moment du build.
 */
const dev = process.env.NODE_ENV === "development";
const httpsPublic = /^https:\/\//i.test(process.env.REBORN_PUBLIC_URL?.trim() ?? "");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  ...(httpsPublic ? ["upgrade-insecure-requests"] : []),
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  ...(httpsPublic ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  // Build de test isolé (REBORN_DIST_DIR=.next-xxx) : ne remplace pas le build du Studio en service.
  distDir: process.env.REBORN_DIST_DIR || ".next",
  // Le store vit en mémoire dans le process Node : on reste sur un seul serveur.
  devIndicators: false,
  // Mode réseau (npm run dev:lan) : IP du poste fournies par scripts/dev.mjs, pour que le
  // dashboard ouvert depuis un autre poste charge ses ressources de développement.
  ...(process.env.REBORN_DEV_ORIGINS ? { allowedDevOrigins: process.env.REBORN_DEV_ORIGINS.split(",").filter(Boolean) } : {}),
  // Journal du terminal lisible pendant la démo : les interrogations de synchronisation
  // (plusieurs par seconde et par onglet) ne sont pas journalisées.
  logging: {
    incomingRequests: {
      ignore: [/\/api\/(revision|state|health)\b/, /\/api\/investigations\?active=/, /\/api\/events\?.*type=experiment_request/],
    },
  },
  // Un package-lock.json existe plus haut dans l'arborescence : on fixe la racine.
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
