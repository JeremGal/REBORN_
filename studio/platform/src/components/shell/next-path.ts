/**
 * Adresse de retour après la connexion (`?suite=`) : chemin INTERNE uniquement.
 *
 * Aucune redirection ouverte : on n'accepte qu'un chemin qui commence par une seule barre,
 * sans barre oblique inverse ni caractère de contrôle, qui reste sur l'origine du Studio une fois
 * normalisé (`/.//site.example` devient `//site.example` : refusé), et qui ne renvoie ni vers
 * l'API ni vers les pages de connexion (boucle). Sinon : l'adresse par défaut.
 *
 * Module sans dépendance : utilisé par proxy.ts, les layouts serveur et les formulaires.
 */

export const DEFAULT_AFTER_LOGIN = "/espace";

/** En-tête posé par proxy.ts : chemin demandé (le layout serveur s'en sert pour `?suite=`). */
export const PATH_HEADER = "x-reborn-path";

/** Raisons affichées sur la page de connexion (texte choisi par la page, jamais repris de l'adresse). */
export type LoginReason = "expiree" | "deconnexion" | "reinitialise";
export const LOGIN_REASONS: readonly LoginReason[] = ["expiree", "deconnexion", "reinitialise"];

const BASE = "http://reborn.invalid";
const MAX = 512;
const EXCLUDED = ["/api", "/_next", "/connexion", "/inscription", "/reinitialisation"];
// Barre oblique inverse, caractères de contrôle et espaces (y compris insécables et séparateurs Unicode)
const UNSAFE_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x20],
  [0x5c, 0x5c],
  [0x7f, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200f],
  [0x2028, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];
const hasUnsafeChar = (s: string) => {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (UNSAFE_RANGES.some(([a, b]) => c >= a && c <= b)) return true;
  }
  return false;
};

export function safeNextPath(raw: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || hasUnsafeChar(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  const path = url.pathname;
  // Après normalisation (segments « . » et « .. »), le chemin ne doit pas devenir « //hôte »
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (EXCLUDED.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return `${path}${url.search}${url.hash}`;
}

/** Adresse de la page de connexion, avec le retour prévu (s'il diffère de l'espace) et une raison connue. */
export function loginPath(next?: string | null, reason?: LoginReason): string {
  const params = new URLSearchParams();
  const safe = safeNextPath(next);
  if (safe !== DEFAULT_AFTER_LOGIN) params.set("suite", safe);
  if (reason && LOGIN_REASONS.includes(reason)) params.set("raison", reason);
  const q = params.toString();
  return q ? `/connexion?${q}` : "/connexion";
}

/** Lien vers une autre page d'entrée (inscription ↔ connexion) qui conserve le retour prévu. */
export function withNext(base: "/connexion" | "/inscription", next?: string | null): string {
  const safe = safeNextPath(next);
  return safe === DEFAULT_AFTER_LOGIN ? base : `${base}?suite=${encodeURIComponent(safe)}`;
}

export const isLoginReason = (v: unknown): v is LoginReason => typeof v === "string" && (LOGIN_REASONS as readonly string[]).includes(v);
