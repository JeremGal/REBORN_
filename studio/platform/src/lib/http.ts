import { z } from "zod";
import { ApiError } from "./errors";
import { StoreError } from "./store";
import { PROJECT_ID, projectScope } from "./migration/context";
import { ownerOf } from "./migration/project";
import { ANONYMOUS, principalScope, type Principal } from "./auth/principal";
import { bearerToken, serviceFromToken } from "./auth/tokens";
import { resolveSession } from "./auth/session";
import { configuredPublicUrl, platformHosts, requestHostOf } from "./auth/request-host";
import { requiredAccountConsents } from "./auth/consents";

export { ApiError };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function badRequest(message: string, issues?: unknown) {
  return json({ ok: false, error: message, issues }, 400);
}

/** Valide une valeur avec un schéma Zod ; lève une ApiError 400 lisible. */
export function parseWith<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new ApiError(
      400,
      "Format non conforme au contrat REBORN",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}

/** Taille maximale d'un corps de requête lu par l'API (exports déposés compris). */
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

/**
 * Corps de la requête, borné EN LISANT LE FLUX (et pas seulement d'après Content-Length, que le client peut
 * omettre en envoyant par blocs) : 413 dès que la borne est dépassée, sans tout garder en mémoire.
 */
export async function readBody(req: Request, limit = MAX_BODY_BYTES): Promise<Uint8Array> {
  const tooLarge = () => new ApiError(413, `Corps de requête trop volumineux (${limit >= 1024 * 1024 ? `${Math.round(limit / (1024 * 1024))} Mo` : `${Math.round(limit / 1024)} Ko`} max)`);
  const declared = req.headers.get("content-length");
  if (declared !== null && declared.trim() !== "") {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) throw new ApiError(400, "En-tête Content-Length invalide");
    if (n > limit) throw tooLarge();
  }
  if (!req.body) return new Uint8Array(0);
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = req.body.getReader();
  } catch {
    throw new ApiError(400, "Corps de requête déjà lu ou illisible");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Corps texte (UTF-8), borné comme readBody. */
export async function readText(req: Request, limit = MAX_BODY_BYTES): Promise<string> {
  return new TextDecoder("utf-8").decode(await readBody(req, limit));
}

/** Corps JSON, borné comme readBody (20 Mo par défaut) ; JSON illisible → 400. */
export async function readJson(req: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  const text = await readText(req, limit);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "Corps JSON invalide");
  }
}

/* ------------------------------------------------------------------ */
/* Enveloppe des routes : point d'application unique (SPEC §1.3)        */
/* ------------------------------------------------------------------ */

/**
 * public : tout le monde · user : tout compte connecté (client ou opérateur) · owner : propriétaire
 * du projet désigné (ou opérateur pour un projet sans propriétaire) · operator : équipe REBORN
 * (tout projet) · explorer / analyst : jetons de service (« all » vaut les deux).
 */
export type Access = "public" | "user" | "owner" | "operator" | "explorer" | "analyst";
/** param : projet = segment [id] · query : ?project= ou x-reborn-project · none : aucun projet. */
export type ProjectMode = "param" | "query" | "none";
export interface HandlerOptions {
  /**
   * OBLIGATOIRE (refus par défaut, SPEC §1.3) : qui peut appeler la méthode. Une route sans contrôle
   * explicite ne compile pas, et handler() refuse de l'envelopper (le module ne se charge pas).
   */
  access: Access[];
  /** Méthode qui modifie l'état : contrôle d'origine même si la méthode est GET. */
  write?: boolean;
  /** Défaut : [id] pour /api/projects/[id]/…, sinon ?project= / x-reborn-project. */
  project?: ProjectMode;
  /** Route qui reste ouverte à un compte qui n'a pas encore accepté les textes en vigueur (leur acceptation elle-même). */
  beforeConsents?: boolean;
}
type RouteCtx = { params: Promise<Record<string, string>> };
type RouteFn = (req: Request, ctx: RouteCtx) => Promise<Response> | Response;

/**
 * Historique (lot A1) : défaut qui s'appliquait aux routes non encore annotées. Plus appliqué par
 * handler() depuis que `access` est obligatoire (lot B1) ; conservé comme référence de classement
 * (et pour les tests du lot A1). Défaut FERMÉ pour les clients :
 * - routes d'un projet (/api/migration[/…], /api/projects/<id>[/…]) : propriétaire du projet désigné
 *   (propriété vérifiée, projet obligatoire pour un client) ou agents internes ;
 * - toutes les autres routes (état global de l'atelier : investigations, évènements, observations,
 *   règles, remise à zéro…) : équipe REBORN (opérateur) et agents, JAMAIS un compte client.
 * Le défaut dépend de la ROUTE, jamais de la présence de ?project= : désigner son propre projet sur une
 * route globale ne donne aucun droit sur l'état global (celui-ci n'est pas filtré par projet).
 */
export const DEFAULT_ACCESS: Readonly<{ project: readonly Access[]; global: readonly Access[] }> = Object.freeze({
  project: Object.freeze(["owner", "explorer", "analyst"] as Access[]),
  global: Object.freeze(["operator", "explorer", "analyst"] as Access[]),
});
const PROJECT_ROUTE = /^\/api\/(?:migration(?:\/|$)|projects\/[^/]+(?:\/|$))/;

/** Classement historique d'une route d'après son chemin (voir DEFAULT_ACCESS) ; handler() ne l'applique plus. */
export function defaultAccess(pathname: string): readonly Access[] {
  return PROJECT_ROUTE.test(pathname) ? DEFAULT_ACCESS.project : DEFAULT_ACCESS.global;
}

export type Authentication =
  | { via: "bearer"; principal: Principal; setCookies: string[] }
  | { via: "cookie"; principal: Principal; setCookies: string[] }
  | { via: "invalid-bearer"; principal: Principal; setCookies: string[] }
  | { via: "none"; principal: Principal; setCookies: string[] };

/**
 * Identité de la requête : jeton de service Bearer, sinon session Better Auth (cookie), sinon anonyme.
 * L'ancien cookie reborn_token n'est plus lu.
 */
export async function authenticate(req: Request): Promise<Authentication> {
  const token = bearerToken(req);
  if (token !== null) {
    const svc = serviceFromToken(token);
    return svc ? { via: "bearer", principal: svc, setCookies: [] } : { via: "invalid-bearer", principal: ANONYMOUS, setCookies: [] };
  }
  const { principal, setCookies } = await resolveSession(req.headers);
  return { via: principal.kind === "user" ? "cookie" : "none", principal, setCookies };
}

export function handler(fn: RouteFn, opts: HandlerOptions) {
  // Refus par défaut : sans contrôle d'accès explicite, la route n'est pas servie (erreur au chargement du module).
  if (!opts || !Array.isArray(opts.access) || opts.access.length === 0) throw new Error("handler() : contrôle d'accès « access » obligatoire (SPEC §1.3)");
  const serve = async (req: Request, ctx: RouteCtx) => {
    let setCookies: string[] = [];
    try {
      const deniedHost = checkHost(req);
      if (deniedHost) return deniedHost;
      await sweepFromRoutes();
      const auth = await authenticate(req);
      // Session valide : prolongation recopiée. Session invalide (révoquée, expirée) : les effacements de
      // cookie de Better Auth ne sont PAS recopiés — une requête partie avec l'ancien cookie juste avant un
      // changement de mot de passe effacerait sinon le cookie neuf posé entre-temps. Le 401 suffit : la page
      // de connexion et l'espace connecté revérifient la session en base.
      setCookies = auth.principal.kind === "user" ? auth.setCookies : auth.setCookies.filter((c) => !isCookieDeletion(c));
      const csrf = checkCsrf(req, auth, !!opts.write);
      if (csrf) return withCookies(csrf, setCookies);
      const pid = await targetProject(req, ctx, opts.project);
      const denied = authorize(auth, opts.access, pid);
      if (denied) return withCookies(denied, setCookies);
      const outdated = await consentsBarrier(req, auth.principal, opts);
      if (outdated) return withCookies(outdated, setCookies);
      const run = () => (pid ? projectScope.run(pid, () => fn(req, ctx)) : fn(req, ctx));
      return withCookies(await principalScope.run(auth.principal, run), setCookies);
    } catch (e) {
      return withCookies(errorResponse(e), setCookies);
    }
  };
  const wrapped = async (req: Request, ctx: RouteCtx) => withTransportSecurity(await serve(req, ctx));
  // Inventaire (lot B1) : chaque méthode exportée par handler() porte son contrôle d'accès.
  return Object.assign(wrapped, { reborn: { access: opts.access, write: !!opts.write, project: opts.project ?? null } });
}

/**
 * Nouvelle version des conditions d'utilisation ou de la politique de confidentialité (lib/legal.ts) : un compte
 * qui ne l'a pas encore acceptée (ou lue) ne peut plus rien ÉCRIRE par l'API (403 « Nouvelles conditions à
 * accepter », code consents_required) tant qu'il ne l'a pas fait (POST /api/me/consents). La lecture reste
 * possible, ainsi que les retraits (DELETE : identifiants confiés, analyse, fichier déposé), la déconnexion et
 * le changement de mot de passe (Better Auth). Les agents (jetons de service) ne sont pas concernés.
 */
async function consentsBarrier(req: Request, who: Principal, opts: HandlerOptions): Promise<Response | null> {
  if (who.kind !== "user" || opts.beforeConsents) return null;
  const method = req.method.toUpperCase();
  const write = !!opts.write || !["GET", "HEAD", "OPTIONS"].includes(method);
  if (!write || method === "DELETE") return null;
  const required = await requiredAccountConsents(who.userId);
  if (!required.length) return null;
  return json(
    {
      ok: false,
      code: "consents_required",
      error: `Nouvelles conditions à accepter : ${required.map((r) => `${r.title} (version ${r.version})`).join(" et ")}. Relisez-les et acceptez-les pour continuer.`,
      required,
    },
    403,
  );
}

/**
 * Balayage des identifiants, jetons de remise et missions échus (SPEC §5) : au plus une fois par minute
 * depuis n'importe quelle route (garde de sweepIfDue, horloge injectable des identifiants), en plus de la
 * minuterie de démarrage (instrumentation.ts). Import différé : pas de cycle de modules avec http.ts.
 * Une erreur de balayage n'empêche jamais de servir la requête.
 */
async function sweepFromRoutes(): Promise<void> {
  try {
    await (await import("./migration/analysis")).sweepIfDue();
  } catch (e) {
    console.error("[reborn] balayage :", (e as Error | undefined)?.message ?? String(e));
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return json({ ok: false, error: e.message, issues: e.issues }, e.status);
  if (e instanceof StoreError) return json({ ok: false, error: e.message }, e.status);
  // Jamais l'objet requête ni un corps : seulement le message et la pile.
  const err = e as Error | undefined;
  console.error("[reborn] erreur interne :", err?.message ?? String(e), err?.stack ?? "");
  return json({ ok: false, error: "Erreur interne" }, 500);
}

/**
 * Strict-Transport-Security quand le Studio est servi en https (REBORN_PUBLIC_URL lue au démarrage) : les autres
 * en-têtes de sécurité sont posés par next.config.ts, figés au build ; celui-ci dépend de l'adresse publique.
 */
function withTransportSecurity(res: Response): Response {
  if (!/^https:\/\//i.test(configuredPublicUrl())) return res;
  const value = "max-age=31536000";
  try {
    res.headers.set("strict-transport-security", value);
    return res;
  } catch {
    const h = new Headers(res.headers);
    h.set("strict-transport-security", value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
}

/** En-tête Set-Cookie qui EFFACE un cookie (valeur vide, Max-Age ≤ 0 ou date d'expiration passée). */
export function isCookieDeletion(setCookie: string): boolean {
  const [pair, ...attrs] = setCookie.split(";").map((s) => s.trim());
  if (!pair.includes("=") || pair.slice(pair.indexOf("=") + 1) === "") return true;
  for (const a of attrs) {
    const [k, ...v] = a.split("=");
    const name = k.trim().toLowerCase();
    const value = v.join("=").trim();
    if (name === "max-age" && Number(value) <= 0) return true;
    if (name === "expires" && Date.parse(value) <= Date.now()) return true;
  }
  return false;
}

/** Recopie les Set-Cookie de Better Auth (session prolongée ; jamais un effacement pour une session invalide). */
function withCookies(res: Response, cookies: string[]): Response {
  if (!cookies.length) return res;
  try {
    for (const c of cookies) res.headers.append("set-cookie", c);
    return res;
  } catch {
    const h = new Headers(res.headers);
    for (const c of cookies) h.append("set-cookie", c);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  }
}

/* ------------------------------------------------------------------ */
/* Projet désigné                                                       */
/* ------------------------------------------------------------------ */

const PROJECTS_PATH = /^\/api\/projects\/([^/]+)(?:\/|$)/;

/**
 * Projet visé par la requête. [id] (routes /api/projects/[id]/…) et ?project= / x-reborn-project
 * sont tous validés (PROJECT_ID : aucune traversée de chemin) ; s'ils divergent → 400 ;
 * ?project= vide → 400. Le contrôle de propriété porte exactement sur cet identifiant.
 */
export async function targetProject(req: Request, ctx: RouteCtx, mode?: ProjectMode): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    throw new ApiError(400, "Adresse de requête invalide");
  }
  if (mode === "none") return null;
  const q = url.searchParams.has("project") ? (url.searchParams.get("project") ?? "") : null;
  const h = req.headers.get("x-reborn-project");
  if (q !== null && h !== null && q !== h) throw new ApiError(400, "Projet désigné deux fois de façon différente (?project= et x-reborn-project)");
  const designated = q ?? h;
  if (designated !== null && !PROJECT_ID.test(designated)) throw new ApiError(400, "Identifiant de projet invalide");
  const pathMatch = PROJECTS_PATH.exec(url.pathname);
  if (mode === "param" || (mode === undefined && pathMatch)) {
    const params = ((await ctx?.params) ?? {}) as Record<string, string | undefined>;
    let raw = params.id;
    if (raw === undefined && pathMatch) {
      try {
        raw = decodeURIComponent(pathMatch[1]);
      } catch {
        raw = undefined;
      }
    }
    if (raw === undefined || !PROJECT_ID.test(raw)) throw new ApiError(400, "Identifiant de projet invalide");
    if (designated !== null && designated !== raw) throw new ApiError(400, "Projet de l'adresse et projet demandé différents");
    return raw;
  }
  return designated;
}

/* ------------------------------------------------------------------ */
/* Autorisation                                                         */
/* ------------------------------------------------------------------ */

const NEED_LOGIN = () => json({ ok: false, error: "Connexion requise" }, 401);
const FORBIDDEN = () => json({ ok: false, error: "Accès refusé : droits insuffisants" }, 403);
const NOT_FOUND = () => json({ ok: false, error: "Projet introuvable" }, 404);

/**
 * Anonyme → 401 ; rôle insuffisant → 403 ; projet inconnu OU non possédé → 404 (même réponse :
 * pas d'énumération). Le rôle est vérifié avant l'existence du projet.
 */
export function authorize(auth: Authentication, access: readonly Access[], pid: string | null): Response | null {
  if (access.includes("public")) return null;
  const p = auth.principal;
  if (p.kind === "anonymous") {
    return auth.via === "invalid-bearer" ? json({ ok: false, error: "Jeton de service invalide" }, 401) : NEED_LOGIN();
  }
  if (p.kind === "service") {
    const ok = (access.includes("explorer") && (p.service === "explorer" || p.service === "all")) || (access.includes("analyst") && (p.service === "analyst" || p.service === "all"));
    if (!ok) return FORBIDDEN();
    return pid && ownerOf(pid) === undefined ? NOT_FOUND() : null;
  }
  const operator = p.role === "operator";
  if (operator && access.includes("operator")) return pid && ownerOf(pid) === undefined ? NOT_FOUND() : null;
  const ownerLike = access.includes("owner") || access.includes("user");
  if (!ownerLike) return FORBIDDEN();
  if (pid) {
    const owner = ownerOf(pid);
    if (owner === undefined) return NOT_FOUND();
    return owner === p.userId || (operator && owner === null) ? null : NOT_FOUND();
  }
  if (access.includes("user")) return null;
  // « owner » sans projet désigné : seul l'opérateur garde le repli sur le projet courant.
  return operator ? null : json({ ok: false, error: "Projet requis : précisez ?project=MIG_… (ou l'en-tête x-reborn-project)" }, 400);
}

/* ------------------------------------------------------------------ */
/* Hôte et origine (navigateur)                                         */
/* ------------------------------------------------------------------ */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Hôte demandé par le navigateur (x-forwarded-host seulement derrière un proxy de confiance). */
export function requestHost(req: Request): string {
  return requestHostOf(req);
}

function hostname(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.replace(/:\d+$/, "");
}

function publicHostname(): string | null {
  const v = configuredPublicUrl();
  if (!v) return null;
  try {
    return new URL(v).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Mode réseau : REBORN_LAN=1 (posé par scripts/dev.mjs --lan), indépendant des jetons. */
export const lanMode = () => process.env.REBORN_LAN === "1";

/**
 * Hors mode réseau, seules les adresses de bouclage sont servies (protection contre le rebinding DNS),
 * plus REBORN_ALLOWED_HOSTS=nom1,nom2 et l'hôte de REBORN_PUBLIC_URL. En mode réseau, tous les hôtes
 * sont servis : l'accès reste protégé par les comptes et les jetons de service.
 */
export function checkHost(req: Request): Response | null {
  if (lanMode()) return null;
  const name = hostname(requestHost(req));
  const extra = (process.env.REBORN_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const pub = publicHostname();
  if (pub) extra.push(pub);
  extra.push(...platformHosts().map(hostname));
  if (LOOPBACK.has(name) || extra.includes(name)) return null;
  return json({ ok: false, error: `Hôte non autorisé : ${name}. En local, utilisez http://127.0.0.1:3000 ; pour le réseau, lancez npm run dev:lan.` }, 403);
}

/** L'en-tête Origin désigne-t-il le Studio lui-même (même hôte que la requête) ? */
function sameHostOrigin(origin: string, req: Request): boolean {
  if (origin === "null") return false;
  try {
    return new URL(origin).host.toLowerCase() === requestHost(req);
  } catch {
    return false;
  }
}

/** Requête émise par une autre page web (Origin étrangère, ou sec-fetch-site cross-site / same-site). */
function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return !sameHostOrigin(origin, req);
  const site = req.headers.get("sec-fetch-site");
  return !!site && site !== "same-origin" && site !== "none";
}

const CSRF_REFUSED = () => json({ ok: false, error: "Origine refusée : requête émise depuis une autre page web" }, 403);

/**
 * CSRF (SPEC §1.4). Requête non GET/HEAD authentifiée par cookie : Origin présent et égal à l'hôte
 * (ou sec-fetch-site: same-origin), sinon 403. Jeton Bearer : Origin non exigé (clients Python, Node),
 * mais refus si une Origin étrangère est présente. Anonyme : refus des origines étrangères.
 */
export function checkCsrf(req: Request, auth: Pick<Authentication, "via">, write = false): Response | null {
  if (auth.via === "bearer" || auth.via === "invalid-bearer") return foreignOrigin(req) ? CSRF_REFUSED() : null;
  const unsafe = write || !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
  if (!unsafe) return null;
  if (auth.via === "cookie") {
    const origin = req.headers.get("origin");
    if (origin) return sameHostOrigin(origin, req) ? null : CSRF_REFUSED();
    return req.headers.get("sec-fetch-site") === "same-origin" ? null : CSRF_REFUSED();
  }
  return foreignOrigin(req) ? CSRF_REFUSED() : null;
}

/** Compatibilité : refuse une écriture venant d'une autre page web (même règle que pour un anonyme). */
export function checkOrigin(req: Request): Response | null {
  return foreignOrigin(req) ? CSRF_REFUSED() : null;
}
