import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { StoreError } from "./store";
import { PROJECT_ID, projectFromRequest, projectScope } from "./migration/context";

/** Erreur d'API avec statut HTTP et détails lisibles. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: unknown,
  ) {
    super(message);
  }
}

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

export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 20 * 1024 * 1024) throw new ApiError(413, "Corps de requête trop volumineux (20 Mo max)");
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Corps JSON invalide");
  }
}

/** Enveloppe commune des routes : contrôle de l'hôte, de l'origine, du jeton d'écriture + erreurs homogènes. */
export function handler(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response, opts: { write?: boolean } = {}) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const deniedHost = checkHost(req);
      if (deniedHost) return deniedHost;
      if (opts.write) {
        const denied = checkOrigin(req) ?? checkWrite(req);
        if (denied) return denied;
      }
      const project = projectFromRequest(req);
      if (project) {
        if (!PROJECT_ID.test(project)) return json({ ok: false, error: "Identifiant de projet invalide" }, 400);
        return await projectScope.run(project, () => fn(req, ctx));
      }
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ ok: false, error: e.message, issues: e.issues }, e.status);
      if (e instanceof StoreError) return json({ ok: false, error: e.message }, e.status);
      console.error("[reborn] erreur interne", e);
      return json({ ok: false, error: "Erreur interne" }, 500);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Authentification (mode réseau)                                       */
/* ------------------------------------------------------------------ */

export const TOKEN_COOKIE = "reborn_token";

function tokensMatch(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Jeton présenté : en-tête Authorization: Bearer … ou cookie posé par /api/session. */
export function presentedToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]+)`).exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Si REBORN_API_TOKEN est défini (mode réseau), toute écriture exige ce jeton.
 * Sans jeton configuré, la plateforme n'écoute que sur 127.0.0.1 (voir scripts/dev.mjs).
 */
export function checkWrite(req: Request): Response | null {
  const expected = process.env.REBORN_API_TOKEN;
  if (!expected) return null;
  const got = presentedToken(req);
  if (got && tokensMatch(got, expected)) return null;
  return json({ ok: false, error: "Jeton d'API requis (Authorization: Bearer <REBORN_API_TOKEN>)" }, 401);
}

export function isValidToken(t: string | null): boolean {
  const expected = process.env.REBORN_API_TOKEN;
  return !!expected && !!t && tokensMatch(t, expected);
}

/* ------------------------------------------------------------------ */
/* Hôte et origine (navigateur)                                         */
/* ------------------------------------------------------------------ */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function requestHost(req: Request): string {
  return (req.headers.get("host") ?? new URL(req.url).host).toLowerCase();
}

function hostname(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.replace(/:\d+$/, "");
}

/**
 * Sans jeton configuré (mode local), seules les adresses de bouclage sont servies :
 * une page web tierce ne peut pas atteindre l'API par rebinding DNS.
 * En mode réseau (REBORN_API_TOKEN), toutes les adresses sont servies et les écritures
 * exigent le jeton. REBORN_ALLOWED_HOSTS=nom1,nom2 ajoute des noms d'hôte autorisés.
 */
export function checkHost(req: Request): Response | null {
  if (process.env.REBORN_API_TOKEN) return null;
  const name = hostname(requestHost(req));
  const extra = (process.env.REBORN_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (LOOPBACK.has(name) || extra.includes(name)) return null;
  return json({ ok: false, error: `Hôte non autorisé : ${name}. En local, utilisez http://127.0.0.1:3000 ; pour le réseau, lancez npm run dev:lan.` }, 403);
}

/**
 * Écritures depuis un navigateur : l'origine doit être la plateforme elle-même.
 * Bloque les requêtes forgées par une autre page ouverte dans le navigateur (CSRF),
 * y compris un autre port de la même machine. Les clients HTTP (Python, curl)
 * n'envoient pas d'en-tête Origin et ne sont pas concernés.
 */
export function checkOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  let sameOrigin = true;
  if (origin) {
    try {
      sameOrigin = origin !== "null" && new URL(origin).host.toLowerCase() === requestHost(req);
    } catch {
      sameOrigin = false;
    }
  } else if (site && site !== "same-origin" && site !== "none") {
    sameOrigin = false;
  }
  return sameOrigin ? null : json({ ok: false, error: "Origine refusée : écriture depuis une autre page web" }, 403);
}
