import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";
import { SESSION_COOKIE_NAMES } from "./principal";

/**
 * Limitation des tentatives propre à REBORN (lot C4, constat du lot B3), indépendante de l'adresse IP.
 *
 * Constat : sans proxy de confiance, l'adresse du client n'est pas connue (x-forwarded-for est usurpable).
 * La limitation de Better Auth retombait alors sur UN seau par chemin, partagé par tout le monde, et sa
 * fenêtre de 60 s se recomptait depuis la dernière requête acceptée : 20 tentatives par minute suffisaient
 * à fermer la connexion à TOUS les comptes, aussi longtemps que l'attaquant continuait (de même pour
 * l'inscription, 10 requêtes invalides par minute, et pour la demande de réinitialisation de l'opérateur).
 * La limitation de Better Auth n'est donc active que derrière un proxy de confiance (REBORN_TRUST_PROXY=1 :
 * un seau par adresse réelle, voir auth.ts). Dans tous les cas, REBORN applique :
 *
 * - connexion : le verrouillage par compte (db.ts : 8 échecs en 15 min → 15 min) ; une limite GLOBALE
 *   large à fenêtre glissante exacte (300 par minute par défaut) qui ne compte que les tentatives en cours
 *   et les ÉCHECS des 60 dernières secondes : une connexion réussie libère sa place, une requête refusée
 *   n'est jamais comptée, et chaque place expire 60 s après SA requête (la fenêtre ne se prolonge ni par
 *   les requêtes acceptées ni par les refus) ; un délai constant sur chaque échec (réponse jamais avant
 *   250 ms) : même temps de réponse pour un compte inconnu et pour un mauvais mot de passe, essais à la
 *   chaîne ralentis ;
 * - inscription : limite globale sur les comptes CRÉÉS et les inscriptions en cours (100 par 10 min par
 *   défaut) ; une requête invalide ou refusée ne compte pas ;
 * - changement de mot de passe : 10 essais par session et par quart d'heure (le mot de passe actuel ne se
 *   devine pas avec une session volée).
 *
 * Limite assumée (déclarée) : sans proxy, un attaquant qui produit durablement plus d'échecs que la limite
 * globale ralentit la connexion de tous tant qu'il continue ; il ne la ferme plus avec quelques requêtes,
 * et elle se rouvre au plus 60 s après son arrêt. La limitation par adresse exige un proxy de confiance.
 *
 * Réglages (entiers, bornés) : REBORN_AUTH_SIGNIN_MAX (échecs par minute), REBORN_AUTH_SIGNUP_MAX
 * (inscriptions par 10 min), REBORN_AUTH_FAILURE_DELAY_MS (0 à 5000). État en mémoire du processus,
 * comme le stockage « memory » de Better Auth (un seul serveur Studio).
 */

export interface WindowRule {
  max: number;
  windowMs: number;
}

export interface AuthLimits {
  signIn: WindowRule;
  signUp: WindowRule;
  changePassword: WindowRule;
  failureDelayMs: number;
}

const int = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : def;
};

/** Réglages lus à chaque requête (un changement d'environnement s'applique sans redémarrage). */
export function authLimits(): AuthLimits {
  return {
    signIn: { max: int(process.env.REBORN_AUTH_SIGNIN_MAX, 300, 1, 1_000_000), windowMs: 60_000 },
    signUp: { max: int(process.env.REBORN_AUTH_SIGNUP_MAX, 100, 1, 1_000_000), windowMs: 10 * 60_000 },
    changePassword: { max: 10, windowMs: 15 * 60_000 },
    failureDelayMs: int(process.env.REBORN_AUTH_FAILURE_DELAY_MS, 250, 0, 5000),
  };
}

/* ------------------------------------------------------------------ */
/* Fenêtre glissante exacte                                             */
/* ------------------------------------------------------------------ */

interface Slot {
  /** Instant d'admission : la place expire à t + fenêtre, quoi qu'il arrive ensuite. */
  t: number;
}

interface State {
  signIn: Slot[];
  signUp: Slot[];
  perSession: Map<string, number[]>;
}

const g = globalThis as unknown as { __rebornAuthLimits?: State; __rebornAuthLimitClock?: () => number };
const state = (): State => (g.__rebornAuthLimits ??= { signIn: [], signUp: [], perSession: new Map() });
const now = () => (g.__rebornAuthLimitClock ?? Date.now)();

/** Horloge des fenêtres (tests). Renvoie la restauration. Le délai constant, lui, est toujours réel. */
export function setAuthLimitClock(fn: (() => number) | null): () => void {
  const prev = g.__rebornAuthLimitClock;
  g.__rebornAuthLimitClock = fn ?? undefined;
  return () => {
    g.__rebornAuthLimitClock = prev;
  };
}

/** Oublie toutes les places (tests, ou redémarrage). */
export function resetAuthLimits(): void {
  g.__rebornAuthLimits = undefined;
}

/** Places encore comptées (diagnostic et tests). */
export function authLimitUsage(): { signIn: number; signUp: number; sessions: number } {
  const s = state();
  const t = now();
  const l = authLimits();
  return { signIn: s.signIn.filter((x) => x.t > t - l.signIn.windowMs).length, signUp: s.signUp.filter((x) => x.t > t - l.signUp.windowMs).length, sessions: s.perSession.size };
}

function prune(list: Slot[], t: number, windowMs: number) {
  let w = 0;
  for (const x of list) if (x.t > t - windowMs) list[w++] = x;
  list.length = w;
}

/** Admet la requête si moins de `max` places sont prises dans la fenêtre ; sinon délai avant la libération de la plus ancienne. */
function admit(list: Slot[], rule: WindowRule, t: number): { slot: Slot } | { retryAfterMs: number } {
  prune(list, t, rule.windowMs);
  if (list.length >= rule.max) {
    let oldest = Infinity;
    for (const x of list) oldest = Math.min(oldest, x.t);
    return { retryAfterMs: Math.max(1000, oldest + rule.windowMs - t) };
  }
  const slot = { t };
  list.push(slot);
  return { slot };
}

function release(list: Slot[], slot: Slot) {
  const i = list.indexOf(slot);
  if (i >= 0) list.splice(i, 1);
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

function tooMany(code: string, message: string, retryAfterMs: number): APIError {
  const s = String(seconds(retryAfterMs));
  return new APIError("TOO_MANY_REQUESTS", { code, message }, { "Retry-After": s, "X-Retry-After": s });
}

/* ------------------------------------------------------------------ */
/* Connexion et inscription (hooks before / after de Better Auth)       */
/* ------------------------------------------------------------------ */

type GateKind = "sign-in" | "sign-up";
interface Gate {
  kind: GateKind;
  slot: Slot;
  /** Horloge réelle (performance.now) : base du délai constant. */
  startedAt: number;
}

/** Requête HTTP → place réservée (les appels serveur auth.api.* n'ont pas de requête : jamais limités). */
const gates = new WeakMap<Request, Gate>();

/**
 * Hook before : réserve une place dans la fenêtre globale, ou lève 429 (code TOO_MANY_ATTEMPTS /
 * TOO_MANY_SIGNUPS, en-tête Retry-After). À appeler APRÈS les contrôles qui refusent sans rien coûter
 * (verrouillage du compte, champs invalides) : un refus ne prend aucune place.
 */
export function enterGate(kind: GateKind, request: Request | undefined): void {
  if (!request) return;
  const l = authLimits();
  const s = state();
  const got = admit(kind === "sign-in" ? s.signIn : s.signUp, kind === "sign-in" ? l.signIn : l.signUp, now());
  if ("retryAfterMs" in got) {
    const wait = seconds(got.retryAfterMs);
    throw kind === "sign-in"
      ? tooMany("TOO_MANY_ATTEMPTS", `Trop de tentatives de connexion sur REBORN en ce moment. Réessayez dans ${wait} seconde${wait > 1 ? "s" : ""}.`, got.retryAfterMs)
      : tooMany("TOO_MANY_SIGNUPS", `Trop d'inscriptions sur REBORN en ce moment. Réessayez dans ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, got.retryAfterMs);
  }
  gates.set(request, { kind, slot: got.slot, startedAt: performance.now() });
}

/**
 * Hook after. Connexion : un échec d'identification (401) garde sa place jusqu'à la fin de la fenêtre et
 * n'est répondu qu'après le délai constant ; toute autre issue (réussite, formulaire invalide…) libère la
 * place. Inscription : un compte créé garde sa place ; un échec la libère.
 */
export async function leaveGate(request: Request | undefined, outcome: { ok: boolean; badCredentials?: boolean }): Promise<void> {
  if (!request) return;
  const gate = gates.get(request);
  if (!gate) return;
  gates.delete(request);
  const s = state();
  if (gate.kind === "sign-up") {
    if (!outcome.ok) release(s.signUp, gate.slot);
    return;
  }
  if (!outcome.badCredentials) {
    release(s.signIn, gate.slot);
    return;
  }
  const wait = authLimits().failureDelayMs - (performance.now() - gate.startedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/* ------------------------------------------------------------------ */
/* Changement de mot de passe : par session                             */
/* ------------------------------------------------------------------ */

const MAX_SESSION_KEYS = 10_000;

/** Valeur du cookie de session (jamais conservée : seule son empreinte sert de clé). */
function sessionCookieValue(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if ((SESSION_COOKIE_NAMES as readonly string[]).includes(name) && value) return value;
  }
  return null;
}

/** Essai en cours de changement de mot de passe : clé de session et instant compté. */
const sessionAttempts = new WeakMap<Request, { key: string; t: number }>();

/**
 * Hook before de /change-password : 10 essais par session et par quart d'heure, sinon 429. Sans cookie de
 * session : rien (Better Auth répond 401). L'essai est compté tout de suite (des essais simultanés ne passent
 * pas tous) ; leaveSessionGate le retire si la session n'était pas valide.
 */
export function enterSessionGate(headers: Headers | undefined, request?: Request): void {
  const cookie = sessionCookieValue(headers?.get("cookie"));
  if (!cookie) return;
  const key = createHash("sha256").update(cookie, "utf8").digest("base64url");
  const rule = authLimits().changePassword;
  const t = now();
  const s = state();
  const hits = (s.perSession.get(key) ?? []).filter((x) => x > t - rule.windowMs);
  if (hits.length >= rule.max) {
    s.perSession.set(key, hits);
    const wait = Math.min(...hits) + rule.windowMs - t;
    const min = Math.ceil(seconds(wait) / 60);
    throw tooMany("TOO_MANY_ATTEMPTS", `Trop de tentatives de changement de mot de passe. Réessayez dans ${min} minute${min > 1 ? "s" : ""}.`, wait);
  }
  hits.push(t);
  s.perSession.set(key, hits);
  if (request) sessionAttempts.set(request, { key, t });
  if (s.perSession.size > MAX_SESSION_KEYS) {
    for (const [k, v] of s.perSession) if (!v.some((x) => x > t - rule.windowMs)) s.perSession.delete(k);
    for (const k of s.perSession.keys()) {
      if (s.perSession.size <= MAX_SESSION_KEYS) break;
      s.perSession.delete(k);
    }
  }
}

/**
 * Hook after de /change-password : un essai refusé faute de session valide (401, cookie inventé ou périmé)
 * n'est pas gardé — des cookies inventés ne peuvent ni remplir la table ni évincer le compteur d'une vraie
 * session (une session volée ne regagne pas d'essais ainsi).
 */
export function leaveSessionGate(request: Request | undefined, sessionRefused: boolean): void {
  if (!request) return;
  const attempt = sessionAttempts.get(request);
  if (!attempt) return;
  sessionAttempts.delete(request);
  if (!sessionRefused) return;
  const s = state();
  const hits = s.perSession.get(attempt.key);
  if (!hits) return;
  const i = hits.indexOf(attempt.t);
  if (i >= 0) hits.splice(i, 1);
  if (!hits.length) s.perSession.delete(attempt.key);
}
