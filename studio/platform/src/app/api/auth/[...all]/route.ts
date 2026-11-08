import { toNextJsHandler } from "better-auth/next-js";
import { checkHost, errorResponse, isCookieDeletion } from "@/lib/http";
import { getAuth } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

/**
 * Comptes REBORN (Better Auth) : /api/auth/sign-up/email, /sign-in/email, /sign-out, /get-session,
 * /list-sessions, /revoke-sessions, /revoke-other-sessions, /change-password,
 * /request-password-reset, /reset-password. Toute autre fonction de Better Auth répond 404.
 * Contrôle de l'hôte d'abord (rebinding DNS), puis les contrôles propres à Better Auth :
 * origines de confiance, formulaires inter-sites, limitation, verrouillage par compte.
 * Lectures de session (/get-session, /list-sessions) : le jeton de chaque session est retiré de la réponse
 * (seul l'identifiant opaque `id` reste, l'interface n'a besoin de rien d'autre) et un cookie n'y est jamais
 * effacé (voir sessionRead).
 */

/** Messages des erreurs de Better Auth, en français (le code reste celui de Better Auth). */
const FR: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse e-mail.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cette adresse e-mail.",
  PASSWORD_TOO_SHORT: "Mot de passe trop court : 10 caractères au minimum.",
  PASSWORD_TOO_LONG: "Mot de passe trop long : 128 caractères au maximum.",
  INVALID_EMAIL: "Adresse e-mail invalide.",
  INVALID_PASSWORD: "Mot de passe actuel incorrect.",
  INVALID_TOKEN: "Lien de réinitialisation invalide, déjà utilisé ou expiré : demandez-en un nouveau à un administrateur REBORN.",
  TOKEN_EXPIRED: "Lien de réinitialisation expiré : demandez-en un nouveau à un administrateur REBORN.",
  USER_NOT_FOUND: "Compte introuvable.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Aucun mot de passe n'est associé à ce compte.",
  FAILED_TO_CREATE_USER: "Création du compte impossible pour le moment : réessayez dans un instant.",
  FAILED_TO_CREATE_SESSION: "Ouverture de session impossible pour le moment : réessayez dans un instant.",
  FAILED_TO_GET_SESSION: "Session illisible : reconnectez-vous.",
  SESSION_EXPIRED: "Session expirée : reconnectez-vous pour effectuer cette action.",
  SESSION_NOT_FRESH: "Pour cette action, reconnectez-vous d'abord (session trop ancienne).",
  MISSING_FIELD: "Champ obligatoire manquant.",
  VALIDATION_ERROR: "Formulaire non conforme.",
  FIELD_NOT_ALLOWED: "Ce champ ne peut pas être modifié.",
  BODY_MUST_BE_AN_OBJECT: "Corps de requête invalide.",
  INVALID_ORIGIN: "Origine refusée : requête émise depuis une autre page web.",
  MISSING_OR_NULL_ORIGIN: "Origine absente : requête refusée.",
  CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: "Connexion refusée : formulaire envoyé depuis un autre site.",
  INVALID_CALLBACK_URL: "Adresse de retour refusée.",
  INVALID_REDIRECT_URL: "Adresse de redirection refusée.",
  UNSUPPORTED_MEDIA_TYPE: "Format de requête non pris en charge (JSON attendu).",
};
const RATE_LIMITED = "Trop de tentatives : patientez une minute avant de réessayer.";

async function frenchErrors(res: Response): Promise<Response> {
  if (res.status < 400 || !(res.headers.get("content-type") ?? "").includes("json")) return res;
  let body: unknown;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  if (!body || typeof body !== "object") return res;
  const b = body as { code?: unknown; message?: unknown };
  const fr = res.status === 429 && b.code === undefined ? RATE_LIMITED : typeof b.code === "string" ? FR[b.code] : undefined;
  if (!fr) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({ ...b, message: fr }), { status: res.status, statusText: res.statusText, headers });
}

const SESSION_READS = /\/api\/auth\/(get-session|list-sessions)\/?$/;

/** Retire tout champ `token` (jeton de session) d'une session ou d'une liste de sessions. */
function withoutTokens(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutTokens);
  if (!v || typeof v !== "object") return v;
  const o = { ...(v as Record<string, unknown>) };
  delete o.token;
  if (o.session && typeof o.session === "object") o.session = withoutTokens(o.session);
  return o;
}

/**
 * Lectures de session (GET /get-session, /list-sessions) :
 * - le jeton de chaque session n'est jamais renvoyé au navigateur (un script de la page ne lit que
 *   l'identifiant opaque `id`, inutilisable pour se connecter) ;
 * - aucun cookie n'y est effacé : une lecture partie avec l'ancien cookie juste avant un changement de mot
 *   de passe effacerait sinon le cookie neuf posé entre-temps (la prolongation d'une session valide passe).
 */
async function sessionRead(req: Request, res: Response): Promise<Response> {
  if (req.method !== "GET" || !SESSION_READS.test(new URL(req.url).pathname)) return res;
  const cookies = res.headers.getSetCookie();
  const kept = cookies.filter((c) => !isCookieDeletion(c));
  let body: string | null = null;
  if ((res.headers.get("content-type") ?? "").includes("json")) {
    const text = await res.clone().text();
    try {
      body = JSON.stringify(withoutTokens(JSON.parse(text)));
    } catch {
      body = text;
    }
  }
  if (body === null && kept.length === cookies.length) return res;
  const headers = new Headers();
  res.headers.forEach((value, key) => {
    if (key !== "set-cookie" && key !== "content-length") headers.append(key, value);
  });
  for (const c of kept) headers.append("set-cookie", c);
  return new Response(body ?? res.body, { status: res.status, statusText: res.statusText, headers });
}

let cached: { auth: unknown; h: ReturnType<typeof toNextJsHandler> } | null = null;

async function handle(req: Request): Promise<Response> {
  const denied = checkHost(req);
  if (denied) return denied;
  try {
    const auth = await getAuth();
    if (cached?.auth !== auth) cached = { auth, h: toNextJsHandler(auth) };
    return await sessionRead(req, await frenchErrors(await cached.h.POST(req)));
  } catch (e) {
    return errorResponse(e);
  }
}

const tag = <T extends object>(f: T) => Object.assign(f, { reborn: { access: ["public"], write: false, project: "none", betterAuth: true } });

export const GET = tag(handle);
export const POST = tag(async (req: Request) => handle(req));
export const PATCH = tag(async (req: Request) => handle(req));
export const PUT = tag(async (req: Request) => handle(req));
export const DELETE = tag(async (req: Request) => handle(req));
