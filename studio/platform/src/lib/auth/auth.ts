import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { LEGAL_DOCUMENTS } from "../legal";
import {
  authDataDir,
  clearLoginFailures,
  consentRows,
  createRebornTables,
  insertConsentRows,
  LOCKOUT,
  lockedUntil,
  openAuthDb,
  outsideTransaction,
  recordLoginFailure,
} from "./db";
import { enterGate, enterSessionGate, leaveGate, leaveSessionGate } from "./limits";
import { linkBase, writeOutbox } from "./outbox";
import { configuredPublicUrl, requestHostOf, VALID_HOST } from "./request-host";

/**
 * Comptes REBORN (lot A1, SPEC §2) : Better Auth 1.7.12 sur node:sqlite, essai réel validé sur ce poste.
 *
 * - getAuth() paresseux ; base <REBORN_DATA_DIR ?? cwd/.data>/auth.db migrée par programme au
 *   premier usage ; instance recréée si la configuration (dossier de données, URL publique…) change.
 * - Secret : REBORN_AUTH_SECRET, sinon <dataDir>/auth.secret (0600) créé une seule fois.
 * - Sessions : cookie « reborn.session_token » (HttpOnly, SameSite=Lax ; Secure et préfixe __Secure-
 *   seulement si REBORN_PUBLIC_URL est en https), 7 jours glissants, pas de cookieCache (une session
 *   révoquée serait encore acceptée), révocation à la réinitialisation et au changement de mot de passe.
 * - Origines de confiance : l'origine du Studio lui-même (même hôte que la requête, n'importe quel
 *   port), plus REBORN_PUBLIC_URL et REBORN_DEV_ORIGINS s'ils sont définis.
 * - Tentatives abusives (lot C4, voir limits.ts) : verrouillage par compte (8 échecs en 15 min → 15 min),
 *   limite globale large à fenêtre glissante exacte sur les échecs de connexion et sur les comptes créés,
 *   délai constant sur chaque échec, 10 changements de mot de passe par session et par quart d'heure.
 *   La limitation PAR ADRESSE de Better Auth (en mémoire) n'est active qu'avec REBORN_TRUST_PROXY=1
 *   (Studio derrière un proxy qui écrit x-forwarded-for) : un seau par adresse cliente, en partant de la
 *   droite de la chaîne (REBORN_TRUSTED_PROXIES, par défaut 127.0.0.1 et ::1) — connexion 20/min,
 *   inscription 10/min, demande de réinitialisation 5/min. Sans proxy de confiance, l'adresse n'est pas
 *   connue (x-forwarded-for est usurpable) : Better Auth retombait sur UN seau par chemin partagé par
 *   tout le monde, que 20 requêtes par minute suffisaient à fermer pour tous (constat du lot B3).
 * - Seules les fonctions utilisées par le Studio sont exposées (liste ci-dessous) : pas de connexion
 *   sociale, pas de modification de profil par Better Auth (PATCH /api/me), pas de changement d'e-mail.
 * - Les appels serveur auth.api.* ne passent ni par la limitation ni par le contrôle d'origine :
 *   le Studio n'utilise côté serveur que getSession (et l'adaptateur interne pour /api/me).
 */

export interface AuthConfig {
  dir: string;
  secret: string;
  /** Clé de l'opérateur (<dataDir>/operator.key) : seule la CLI du poste peut demander un lien de réinitialisation. */
  operatorKey: string;
  secure: boolean;
  publicOrigin: string | null;
  devOrigins: string[];
  trustProxy: boolean;
  trustedProxies: string[];
}

const DAY = 24 * 3600;

/**
 * Fonctions de Better Auth accessibles (HTTP et serveur). Toute autre route répond 404.
 * /revoke-session (une session désignée par son JETON) n'en fait pas partie : les jetons ne sont jamais
 * renvoyés au navigateur (route /api/auth/[...all]) ; « Déconnecter les autres appareils » et « Se
 * déconnecter de tous les appareils » passent par /revoke-other-sessions et /revoke-sessions.
 */
export const ALLOWED_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/list-sessions",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/change-password",
  "/request-password-reset",
  "/reset-password",
  "/ok",
  "/error",
]);

/** Champs acceptés à l'inscription (aucun autre : pas de rôle, pas d'image…). */
const SIGN_UP_KEYS = new Set(["email", "password", "firstName", "lastName", "company", "termsVersion", "privacyVersion", "name", "rememberMe", "callbackURL"]);

const SignUpFields = z.object({
  email: z.string({ error: "Adresse e-mail requise." }).trim().toLowerCase().min(3, "Adresse e-mail requise.").max(254, "Adresse e-mail trop longue."),
  firstName: z.string({ error: "Prénom requis." }).trim().min(1, "Prénom requis.").max(80, "Prénom trop long (80 caractères au maximum)."),
  lastName: z.string({ error: "Nom requis." }).trim().min(1, "Nom requis.").max(80, "Nom trop long (80 caractères au maximum)."),
  company: z.string({ error: "Entreprise invalide." }).trim().max(120, "Nom de l'entreprise trop long (120 caractères au maximum).").optional(),
});

const fullName = (u: { firstName?: unknown; lastName?: unknown }) => `${String(u.firstName ?? "").trim()} ${String(u.lastName ?? "").trim()}`.trim();

function consentRequired(): APIError {
  const terms = LEGAL_DOCUMENTS.conditions.version;
  const privacy = LEGAL_DOCUMENTS.confidentialite.version;
  return new APIError("BAD_REQUEST", {
    code: "CONSENT_REQUIRED",
    message: `Pour créer un compte, acceptez les conditions d'utilisation (version ${terms}) et prenez connaissance de la politique de confidentialité (version ${privacy}).`,
    required: { termsVersion: terms, privacyVersion: privacy },
  });
}

/** Consentements aux versions courantes, champs vérifiés ; nom = « Prénom Nom » calculé par le serveur. */
function validateSignUp(body: unknown): Record<string, unknown> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.termsVersion !== LEGAL_DOCUMENTS.conditions.version || b.privacyVersion !== LEGAL_DOCUMENTS.confidentialite.version) throw consentRequired();
  const extra = Object.keys(b).filter((k) => !SIGN_UP_KEYS.has(k));
  if (extra.length) {
    throw new APIError("BAD_REQUEST", { code: "UNEXPECTED_FIELD", message: `Champ non autorisé à l'inscription : ${extra.slice(0, 5).map((k) => k.slice(0, 40)).join(", ")}.` });
  }
  const parsed = SignUpFields.safeParse(b);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_FIELDS",
      message: parsed.error.issues[0]?.message ?? "Formulaire d'inscription incomplet.",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { email, firstName, lastName, company } = parsed.data;
  return { ...b, email, firstName, lastName, company: company ?? "", name: `${firstName} ${lastName}` };
}

/** En-tête de la CLI de l'opérateur (npm run account -- reset-link), qui lit <dataDir>/operator.key. */
export const OPERATOR_KEY_HEADER = "x-reborn-operator-key";

const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

function lockedError(until: number): APIError {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  return new APIError("TOO_MANY_REQUESTS", {
    code: "ACCOUNT_LOCKED",
    message: `Trop de tentatives de connexion échouées pour ce compte. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`,
  });
}

/**
 * Messages de Better Auth : échecs ordinaires (comptés par le verrouillage) et choix délibérés
 * (adresse de base déduite de la requête) non journalisés ; les autres traduits quand ils sont connus.
 */
const SILENT = [/^Invalid password$/, /^User not found$/, /^Reset Password: User not found$/, /^\[better-auth\] Base URL is not set/];
const TRANSLATED: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Invalid origin: (\S{0,200})/, (m) => `requête refusée : origine étrangère (${m[1]})`],
  [/^Invalid (callbackURL|redirectURL|errorCallbackURL|newUserCallbackURL)/, () => "requête refusée : adresse de retour hors du Studio"],
  [/^Blocked cross-site navigation login attempt/, () => "connexion refusée : formulaire envoyé depuis un autre site"],
  [/^Rate limiting could not determine a client IP/, () => "limitation par adresse : requête reçue sans adresse cliente du proxy de confiance (x-forwarded-for absent), comptée dans un seau commun à ces requêtes"],
];

function logAuth(level: string, message: unknown) {
  // Jamais les arguments (objets d'erreur, requêtes) : seulement le message, sur une ligne.
  if (level !== "warn" && level !== "error") return;
  let m = String(message).replace(/[\r\n]+/g, " ").slice(0, 300);
  if (SILENT.some((r) => r.test(m))) return;
  for (const [re, fr] of TRANSLATED) {
    const hit = re.exec(m);
    if (hit) {
      m = fr(hit);
      break;
    }
  }
  console.warn(`[reborn] comptes : ${m}`);
}

/** Erreurs levées pendant une requête : les refus attendus (4xx) ne sont pas journalisés ; les autres, sans détail. */
function onAuthError(e: unknown) {
  if (isAPIError(e) && e.statusCode < 500) return;
  console.error("[reborn] comptes : erreur interne :", (e as Error | undefined)?.message ?? String(e));
}

function trustedOriginsFor(request: Request | undefined, cfg: AuthConfig): string[] {
  const out: string[] = [];
  if (cfg.publicOrigin) out.push(cfg.publicOrigin);
  for (const entry of cfg.devOrigins) {
    if (entry.includes("://")) out.push(entry);
    else if (VALID_HOST.test(entry)) out.push(`http://${entry}`, `https://${entry}`, `http://${entry}:*`, `https://${entry}:*`);
  }
  if (request) {
    const host = requestHostOf(request);
    if (host && VALID_HOST.test(host)) out.push(`http://${host}`, `https://${host}`);
  }
  return out;
}

function buildOptions(db: DatabaseSync, cfg: AuthConfig) {
  return {
    appName: "REBORN Studio",
    basePath: "/api/auth",
    secret: cfg.secret,
    database: db,
    telemetry: { enabled: false },
    logger: { level: "warn", log: logAuth },
    onAPIError: { onError: onAuthError },
    trustedOrigins: async (request?: Request) => trustedOriginsFor(request, cfg),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // 10 caractères par défaut ; REBORN_AUTH_MIN_PASSWORD (8 à 64) pour un déploiement qui en décide autrement.
      minPasswordLength: ((n) => (Number.isInteger(n) && n >= 8 && n <= 64 ? n : 10))(Number(process.env.REBORN_AUTH_MIN_PASSWORD)),
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      // Aucun service d'e-mail : le lien va UNIQUEMENT dans la boîte d'envoi locale (CLI de l'opérateur).
      sendResetPassword: async ({ user, token }: { user: { id: string; email: string }; url: string; token: string }, request?: Request) => {
        const now = Date.now();
        // Un seul lien valide par compte : les demandes précédentes sont invalidées (seules les
        // réinitialisations utilisent la table verification ici ; l'identifiant y est haché).
        await outsideTransaction(db, () =>
          db.prepare("DELETE FROM verification WHERE value = ? AND id NOT IN (SELECT id FROM verification WHERE value = ? ORDER BY createdAt DESC LIMIT 1)").run(user.id, user.id),
        );
        writeOutbox(cfg.dir, {
          kind: "password_reset",
          to: user.email,
          link: `${linkBase(request)}/reinitialisation#token=${encodeURIComponent(token)}`,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(now + 3600_000).toISOString(),
        });
      },
      onPasswordReset: async ({ user }: { user: { email: string } }) => {
        await outsideTransaction(db, () => clearLoginFailures(db, user.email));
      },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: true },
        lastName: { type: "string", required: true },
        company: { type: "string", required: false },
        role: { type: "string", required: false, defaultValue: "client", input: false },
      },
    },
    session: { expiresIn: 7 * DAY, updateAge: DAY },
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      // Par adresse réelle seulement (proxy de confiance) ; sinon seau commun = blocage de tous (limits.ts).
      enabled: cfg.trustProxy,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 20 },
        "/sign-up/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
        "/get-session": false,
      },
    },
    advanced: {
      cookiePrefix: "reborn",
      useSecureCookies: cfg.secure,
      // Explicites : Better Auth les désactive sinon sous NODE_ENV=test.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: cfg.trustProxy ? { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: cfg.trustedProxies } : { ipAddressHeaders: [] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!ALLOWED_AUTH_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND", { code: "NOT_AVAILABLE", message: "Fonction non disponible sur REBORN Studio." });
        if (ctx.path === "/sign-in/email") {
          const until = lockedUntil(db, ctx.body?.email);
          if (until) throw lockedError(until);
          // Après le verrouillage : un compte verrouillé ne prend aucune place dans la limite globale.
          enterGate("sign-in", ctx.request);
          return;
        }
        if (ctx.path === "/sign-up/email") {
          const body = validateSignUp(ctx.body);
          enterGate("sign-up", ctx.request);
          return { context: { body } };
        }
        // Pas de « mot de passe oublié » en libre-service (aucun e-mail configuré) : la demande vient de l'opérateur.
        if (ctx.path === "/request-password-reset") {
          const got = ctx.request?.headers.get(OPERATOR_KEY_HEADER) ?? ctx.headers?.get(OPERATOR_KEY_HEADER) ?? "";
          if (!got || !sameSecret(got, cfg.operatorKey)) {
            throw new APIError("FORBIDDEN", { code: "OPERATOR_ONLY", message: "Mot de passe oublié ? Un administrateur REBORN peut vous transmettre un lien de réinitialisation." });
          }
          return;
        }
        // Changement de mot de passe : 10 essais par session et par quart d'heure ; les autres sessions sont toujours révoquées.
        if (ctx.path === "/change-password") {
          enterSessionGate(ctx.request?.headers ?? ctx.headers, ctx.request);
          return { context: { body: { ...(ctx.body ?? {}), revokeOtherSessions: true } } };
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/change-password") {
          const r = ctx.context.returned;
          leaveSessionGate(ctx.request, isAPIError(r) && r.statusCode === 401);
          return;
        }
        if (ctx.path === "/sign-up/email") {
          await leaveGate(ctx.request, { ok: !isAPIError(ctx.context.returned) });
          return;
        }
        if (ctx.path !== "/sign-in/email") return;
        const r = ctx.context.returned;
        const email = ctx.body?.email;
        const badCredentials = isAPIError(r) && r.statusCode === 401;
        if (isAPIError(r)) {
          if (badCredentials && (await outsideTransaction(db, () => recordLoginFailure(db, email)))) {
            console.warn(`[reborn] comptes : un compte est verrouillé ${LOCKOUT.lockMs / 60_000} min après ${LOCKOUT.maxFailures} échecs de connexion en ${LOCKOUT.windowMs / 60_000} min.`);
          }
        } else if (r) await outsideTransaction(db, () => clearLoginFailures(db, email));
        // Échec : place gardée 60 s dans la limite globale et réponse après le délai constant ; sinon place libérée.
        await leaveGate(ctx.request, { ok: !isAPIError(r) && !!r, badCredentials });
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Défense en profondeur : rôle « client » et nom « Prénom Nom » imposés quelle que soit l'entrée.
          before: async (user: Record<string, unknown>) => ({ data: { ...user, role: "client", name: fullName(user) || String(user.name ?? "") } }),
        },
        update: {
          // Le rôle ne change qu'en ligne de commande (npm run account) ; l'e-mail ne change pas.
          before: async (data: Record<string, unknown>) => ("role" in data || "email" in data ? false : undefined),
        },
      },
      account: {
        create: {
          // Dans la transaction d'inscription : compte et consentements enregistrés ensemble ou pas du tout.
          before: async (account: { userId: string; providerId: string }, context: { path?: string } | null) => {
            if (context?.path === "/sign-up/email" && account.providerId === "credential") {
              const rows = consentRows(account.userId, null, ["terms_acceptance", "privacy_acknowledgement"]);
              if (db.isTransaction) insertConsentRows(db, rows);
              else await outsideTransaction(db, () => insertConsentRows(db, rows));
            }
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

/** Instance créée APRÈS les migrations (sinon Better Auth signale à tort des tables manquantes). */
const createAuth = (options: ReturnType<typeof buildOptions>) => betterAuth(options);
export type RebornAuth = ReturnType<typeof createAuth>;

/* ------------------------------------------------------------------ */
/* Configuration et instance paresseuse                                 */
/* ------------------------------------------------------------------ */

/** Secret aléatoire conservé dans <dir>/<name> (0600), créé une seule fois (jamais régénéré s'il existe). */
function fileSecret(dir: string, name: string, emptyHint: string): string {
  const file = path.join(/* turbopackIgnore: true */ dir, name);
  const read = () => {
    const s = fs.readFileSync(file, "utf8").trim();
    if (!s) throw new Error(`${name} est vide : ${emptyHint}`);
    return s;
  };
  if (fs.existsSync(file)) return read();
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return read();
}

function resolveSecret(dir: string): string {
  const fromEnv = process.env.REBORN_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return fileSecret(dir, "auth.secret", "définissez REBORN_AUTH_SECRET ou supprimez ce fichier (toutes les sessions seront fermées)");
}

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function publicOrigin(): string | null {
  const v = configuredPublicUrl();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

function configKey(): string {
  const parts = [authDataDir(), process.env.REBORN_AUTH_SECRET ?? "", process.env.REBORN_PUBLIC_URL ?? "", process.env.REBORN_DEV_ORIGINS ?? "", process.env.REBORN_TRUST_PROXY ?? "", process.env.REBORN_TRUSTED_PROXIES ?? ""];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function readConfig(): AuthConfig {
  const dir = authDataDir();
  const origin = publicOrigin();
  return {
    dir,
    secret: resolveSecret(dir),
    operatorKey: fileSecret(dir, "operator.key", "supprimez ce fichier, il sera recréé"),
    secure: !!origin?.startsWith("https://"),
    publicOrigin: origin,
    devOrigins: list(process.env.REBORN_DEV_ORIGINS),
    trustProxy: process.env.REBORN_TRUST_PROXY === "1",
    trustedProxies: list(process.env.REBORN_TRUSTED_PROXIES).length ? list(process.env.REBORN_TRUSTED_PROXIES) : ["127.0.0.1", "::1"],
  };
}

interface Ready {
  auth: RebornAuth;
  db: DatabaseSync;
  cfg: AuthConfig;
}
const g = globalThis as unknown as { __rebornAuth?: { key: string; ready: Promise<Ready> } };

async function init(): Promise<Ready> {
  const cfg = readConfig();
  const db = openAuthDb(cfg.dir);
  try {
    const options = buildOptions(db, cfg);
    const { runMigrations } = await getMigrations(options);
    await runMigrations();
    createRebornTables(db);
    const auth = createAuth(options);
    await auth.$context;
    return { auth, db, cfg };
  } catch (e) {
    try {
      db.close();
    } catch {}
    throw e;
  }
}

function ready(): Promise<Ready> {
  const key = configKey();
  const cur = g.__rebornAuth;
  if (cur && cur.key === key) return cur.ready;
  if (cur) {
    // Changement de dossier de données (tests) : l'ancienne connexion est fermée.
    cur.ready.then((r) => r.db.close()).catch(() => {});
  }
  const state = { key, ready: init() };
  g.__rebornAuth = state;
  state.ready.catch(() => {
    if (g.__rebornAuth === state) g.__rebornAuth = undefined;
  });
  return state.ready;
}

/** Instance Better Auth du Studio (créée et migrée au premier appel). */
export async function getAuth(): Promise<RebornAuth> {
  return (await ready()).auth;
}

/** Connexion partagée à auth.db (pour consents.ts et les tests ; écrire via outsideTransaction). */
export async function getAuthDb(): Promise<DatabaseSync> {
  return (await ready()).db;
}

/**
 * Clé de l'opérateur (<données>/operator.key, lisible de ce poste seulement) présentée par la ligne de commande
 * (`npm run account`) ? Comparaison en temps constant ; une valeur absente ou vide n'est jamais acceptée.
 */
export async function isOperatorKey(value: string | null | undefined): Promise<boolean> {
  if (!value) return false;
  return sameSecret(value, (await ready()).cfg.operatorKey);
}
