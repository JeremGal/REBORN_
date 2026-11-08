/**
 * Outils de test des comptes (pas un fichier *.test.ts : non collecté par vitest).
 *
 * - setupAuthEnv() : environnement temporaire isolé (REBORN_DATA_DIR, REBORN_AUTH_SECRET et jetons
 *   de service aléatoires) ; jamais les données ni les secrets réels du poste.
 * - signUp() / signIn() : par le VRAI handler Better Auth (/api/auth/[...all]), en mémoire ; le cookie
 *   est relu avec getSetCookie() (jamais get("set-cookie").split(";")).
 * - asUser(cookie) : en-têtes d'un navigateur connecté (cookie + Origin du Studio) ;
 *   asService(kind) : jeton Bearer d'un agent interne ; makeOperator(email) : rôle opérateur ;
 *   asOperatorCli() : en-têtes de `npm run account -- reset-link` (clé de l'opérateur, sans Origin).
 * - callRoute(module, méthode, url, { params, body, headers }) : appel en mémoire d'une route du Studio.
 * - cleanupAuthEnv() (afterAll) : supprime le dossier temporaire (comptes fictifs, secrets aléatoires).
 *
 * Limitation de débit : en mémoire et par adresse quand REBORN_TRUST_PROXY=1. Les tests le posent et
 * donnent à chaque appel une adresse distincte (x-forwarded-for), pour que les nombreuses inscriptions
 * d'un même fichier ne partagent pas un seau ; un test dédié vérifie le seau partagé sans proxy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { LEGAL_DOCUMENTS } from "@/lib/legal";

export const ORIGIN = "http://127.0.0.1:3000";
export type RouteCtx = { params: Promise<Record<string, string>> };
export type RouteHandler = (req: Request, ctx: RouteCtx) => Promise<Response>;
export type ServiceName = "explorer" | "analyst" | "all";

const rnd = (n = 24) => randomBytes(n).toString("base64url");

let ipCounter = 0;
/** Adresse cliente distincte à chaque appel (plage de documentation 198.51.100.0/24 et suivantes). */
export function nextIp(): string {
  ipCounter++;
  return `198.51.${100 + (Math.floor(ipCounter / 250) % 100)}.${(ipCounter % 250) + 1}`;
}

export interface TestEnv {
  dataDir: string;
  tokens: Record<ServiceName, string>;
}

let env: TestEnv | null = null;

/** Prépare un environnement isolé et aléatoire ; à appeler dans beforeAll, avant tout appel de route. */
export function setupAuthEnv(prefix = "reborn-auth-"): TestEnv {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const tokens = { explorer: rnd(), analyst: rnd(), all: rnd() };
  Object.assign(process.env, {
    REBORN_DATA_DIR: dataDir,
    REBORN_AUTH_SECRET: rnd(32),
    REBORN_EXPLORER_TOKEN: tokens.explorer,
    REBORN_ANALYST_TOKEN: tokens.analyst,
    REBORN_API_TOKEN: tokens.all,
    REBORN_TRUST_PROXY: "1",
  });
  for (const k of ["REBORN_LAN", "REBORN_PUBLIC_URL", "REBORN_DEV_ORIGINS", "REBORN_ALLOWED_HOSTS", "REBORN_TRUSTED_PROXIES"]) delete process.env[k];
  env = { dataDir, tokens };
  return env;
}

/**
 * Supprime le dossier temporaire du fichier de test (afterAll) : il contient une base de comptes
 * fictifs et des secrets aléatoires, inutile de les laisser dans le dossier temporaire du poste.
 */
export async function cleanupAuthEnv(): Promise<void> {
  if (!env) return;
  try {
    (await import("@/lib/store")).flushPersist(); // aucune écriture différée après la suppression
  } catch {}
  fs.rmSync(env.dataDir, { recursive: true, force: true });
  env = null;
}

function current(): TestEnv {
  if (!env) throw new Error("setupAuthEnv() doit être appelé avant (beforeAll)");
  return env;
}

let authModule: Record<string, RouteHandler> | null = null;
async function authRoute() {
  return (authModule ??= (await import("@/app/api/auth/[...all]/route")) as unknown as Record<string, RouteHandler>);
}

/**
 * Requête vers le handler Better Auth (/api/auth/…), avec l'Origin du Studio par défaut.
 * Un en-tête de valeur "" est retiré (ex. { origin: "" } : requête sans Origin, comme la CLI).
 */
export async function authRequest(pathname: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const mod = await authRoute();
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers = Object.fromEntries(Object.entries({ "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": nextIp(), ...init.headers }).filter(([, v]) => v !== ""));
  const req = new Request(`${ORIGIN}/api/auth${pathname}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return mod[method](req, { params: Promise.resolve({}) });
}

/** En-tête Cookie à partir des Set-Cookie d'une réponse (cookies effacés ignorés). */
export const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company: string;
  userId: string;
  cookie: string;
}

let seq = 0;
export const consentFields = () => ({ termsVersion: LEGAL_DOCUMENTS.conditions.version, privacyVersion: LEGAL_DOCUMENTS.confidentialite.version });

/** Inscription réelle (consentements aux versions courantes) ; lève une erreur si elle est refusée. */
export async function signUp(over: Partial<Omit<TestUser, "userId" | "cookie">> = {}): Promise<TestUser> {
  seq++;
  const u = {
    email: over.email ?? `client${seq}.${rnd(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}@exemple.test`,
    password: over.password ?? `Mot-De-Passe-Test-${seq}-${rnd(6)}`,
    firstName: over.firstName ?? `Prénom${seq}`,
    lastName: over.lastName ?? `Nom${seq}`,
    company: over.company ?? `Entreprise ${seq}`,
  };
  const res = await authRequest("/sign-up/email", { body: { ...u, ...consentFields() } });
  const body = (await res.json()) as { user?: { id: string }; code?: string; message?: string };
  if (res.status !== 200 || !body.user) throw new Error(`Inscription refusée (${res.status}) : ${body.code ?? ""} ${body.message ?? ""}`);
  return { ...u, email: u.email.toLowerCase(), userId: body.user.id, cookie: cookieFrom(res) };
}

/** Connexion réelle : statut, cookie (vide en cas d'échec) et corps JSON. */
export async function signIn(email: string, password: string, headers: Record<string, string> = {}) {
  const res = await authRequest("/sign-in/email", { body: { email, password }, headers });
  return { status: res.status, cookie: cookieFrom(res), body: (await res.json()) as Record<string, unknown> };
}

/** En-tête de la CLI de l'opérateur pour /request-password-reset (clé lue dans le dossier de données). */
export const asOperatorCli = () => ({ "x-reborn-operator-key": fs.readFileSync(path.join(current().dataDir, "operator.key"), "utf8").trim(), origin: "" });

/** Navigateur connecté : cookie de session + Origin du Studio (exigée pour les écritures). */
export const asUser = (cookie: string) => ({ cookie, origin: ORIGIN });

/** Agent interne : jeton de service (sans Origin, comme un client Python ou Node). */
export const asService = (kind: ServiceName) => ({ authorization: `Bearer ${current().tokens[kind]}` });

/** Rôle opérateur, comme `npm run account -- operator <email>` (écriture directe dans auth.db). */
export async function makeOperator(email: string): Promise<void> {
  const { getAuthDb } = await import("@/lib/auth/auth");
  const { outsideTransaction } = await import("@/lib/auth/db");
  const db = await getAuthDb();
  const r = await outsideTransaction(db, () => db.prepare(`UPDATE "user" SET role = 'operator' WHERE email = ?`).run(email.toLowerCase()));
  if (!r.changes) throw new Error(`Aucun compte ${email}`);
}

/** Corps JSON d'une réponse, typé librement pour les assertions des tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

/** Appel en mémoire d'une méthode de route (module importé), avec paramètres de chemin. */
export async function callRoute(mod: Record<string, RouteHandler>, method: string, url: string, opts: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const req = new Request(url.startsWith("http") ? url : `${ORIGIN}${url}`, {
    method,
    headers: { "content-type": "application/json", ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await mod[method](req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: body as Json, headers: res.headers };
}
