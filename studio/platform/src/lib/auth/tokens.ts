import { createHash, timingSafeEqual } from "node:crypto";
import type { ServiceKind, ServicePrincipal } from "./principal";

/**
 * Jetons de service des agents internes (Authorization: Bearer …), transmis par scripts/dev.mjs
 * depuis .secrets/tokens.json (jamais affichés) :
 *   REBORN_EXPLORER_TOKEN → service « explorer » (exécuteur de Mouss)
 *   REBORN_ANALYST_TOKEN  → service « analyst »  (Analyste d'Alan)
 *   REBORN_API_TOKEN      → service « all »      (ancien jeton unique, conservé pour compatibilité)
 * Comparaison en temps constant sur les empreintes SHA-256 (longueurs égales), sans sortie anticipée.
 */
const TOKEN_ENV: readonly (readonly [ServiceKind, string])[] = [
  ["explorer", "REBORN_EXPLORER_TOKEN"],
  ["analyst", "REBORN_ANALYST_TOKEN"],
  ["all", "REBORN_API_TOKEN"],
];

/** Un jeton configuré trop court est ignoré (jamais un secret faible accepté par erreur). */
export const MIN_TOKEN_LENGTH = 16;

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
const warned = new Set<string>();

export function configuredServices(): ServiceKind[] {
  return TOKEN_ENV.filter(([, env]) => (process.env[env] ?? "").length >= MIN_TOKEN_LENGTH).map(([kind]) => kind);
}

/** Service correspondant au jeton présenté, ou null. */
export function serviceFromToken(presented: string): ServicePrincipal | null {
  if (!presented) return null;
  const got = digest(presented);
  let match: ServicePrincipal | null = null;
  for (const [service, env] of TOKEN_ENV) {
    const expected = process.env[env];
    if (!expected) continue;
    if (expected.length < MIN_TOKEN_LENGTH) {
      if (!warned.has(env)) {
        warned.add(env);
        console.warn(`[reborn] ${env} ignoré : jeton trop court (${MIN_TOKEN_LENGTH} caractères au minimum).`);
      }
      continue;
    }
    if (timingSafeEqual(digest(expected), got) && !match) match = { kind: "service", service, tokenId: env };
  }
  return match;
}

/** Jeton Bearer de l'en-tête Authorization (sans le valider), ou null. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}
