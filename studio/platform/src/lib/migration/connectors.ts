import { z } from "zod";
import { sha256 } from "./transforms";
import { maskUsername, redactText } from "./credentials";
import { egressErrorMessage, egressRequest, EgressError, safeOrigin, type EgressResponse } from "./egress";
import { legacyUrlProblem } from "./project-contracts";

/**
 * Connecteur d'extraction HTTP générique : ouvre une session avec le compte confié par le
 * propriétaire, puis télécharge les exports que ce compte est autorisé à obtenir.
 *
 * Le plan d'extraction (mécanismes, URL, droits requis) est produit par l'Explorer (Mouss)
 * pendant la découverte ; REBORN ne devine rien et ne tente aucun contournement : un refus
 * (401/403) est consigné comme donnée inaccessible.
 *
 * Sorties réseau : uniquement par egress.ts (adresses internes refusées, chaque adresse résolue
 * contrôlée, redirections jamais suivies, délais, taille lue en flux). Toutes les requêtes restent
 * sur l'origine de l'ancien logiciel : le cookie de session n'est jamais envoyé ailleurs.
 *
 * Identifiants : utilisés en mémoire le temps de l'extraction, jamais stockés ni journalisés ; aucun
 * message (résultat, erreur) ne contient le mot de passe, l'identifiant en clair ou une URL complète.
 */
export const EXTRACTION_CONTRACT_VERSION = "1.0";

export const ExtractionPlanSchema = z
  .object({
    contract_version: z.string().default(EXTRACTION_CONTRACT_VERSION),
    system: z.string().min(1),
    base_url: z.string().url().optional(),
    discovered_by: z.string().optional(),
    login: z.object({ url: z.string().min(1), username_field: z.string().min(1), password_field: z.string().min(1), session_cookie: z.string().optional() }).strict().optional(),
    manifest: z.string().optional(),
    mechanisms: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().optional(),
            kind: z.enum(["export", "api", "archive", "database"]).default("export"),
            url: z.string().min(1),
            file: z.string().regex(/^[\w.-]+$/).optional(),
            requires: z.string().optional(),
            note: z.string().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    not_extractable: z.array(z.object({ label: z.string(), reason: z.string() }).strict()).optional(),
  })
  .strict();

export type ExtractionPlan = z.output<typeof ExtractionPlanSchema>;

export interface ExtractedFile {
  mechanism: string;
  name: string;
  url: string;
  data: Buffer;
  content_type: string | null;
}

export interface MechanismResult {
  id: string;
  label?: string;
  url: string;
  status: "ok" | "forbidden" | "unauthorized" | "not_found" | "error";
  http?: number;
  message?: string;
  bytes?: number;
  sha256?: string;
  file?: string;
}

export interface ExtractionOutcome {
  at: string;
  system: string;
  base_url: string;
  account: string;
  files: ExtractedFile[];
  results: MechanismResult[];
  manifest: { exports: { file: string; rows?: number; sha256?: string }[] } | null;
  not_extractable: { label: string; reason: string }[];
}

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;

/** Compatibilité : l'ancien second masque n'est plus publié (masque unique : maskUsername). */
export const maskAccount = maskUsername;

/** Adresse de base contrôlée (forme de LegacyUrlSchema), sans jamais recopier l'adresse dans l'erreur. */
function baseOf(raw: string | undefined): URL {
  const problem = legacyUrlProblem(raw ?? "");
  if (problem) throw new EgressError("url", problem);
  return new URL(raw!.trim());
}

/** Toutes les URL du plan sont résolues contre la base et doivent garder la même origine. */
function resolver(base: URL) {
  return (u: string) => {
    let url: URL;
    try {
      url = new URL(u, base);
    } catch {
      throw new EgressError("url", "URL du plan invalide");
    }
    if (url.origin !== base.origin) throw new EgressError("url", "URL hors du logiciel source refusée (autre origine que l'adresse déclarée)");
    if (url.username || url.password) throw new EgressError("credentials_in_url", "URL du plan refusée : elle contient des identifiants");
    return url;
  };
}

const cookiesOf = (res: EgressResponse, wanted?: string) => {
  const pairs = res.setCookies.map((c) => c.split(";")[0].trim()).filter(Boolean);
  return (wanted ? pairs.filter((c) => c.startsWith(`${wanted}=`)) : pairs).join("; ");
};

async function login(plan: ExtractionPlan & { login: NonNullable<ExtractionPlan["login"]> }, base: URL, username: string, password: string, timeoutMs: number) {
  const resolve = resolver(base);
  const body = new URLSearchParams({ [plan.login.username_field]: username, [plan.login.password_field]: password }).toString();
  try {
    return await egressRequest(resolve(plan.login.url), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs,
      maxErrorBytes: 16 * 1024,
      maxBytes: 2 * 1024 * 1024,
    });
  } catch (e) {
    throw new EgressError(e instanceof EgressError ? e.code : "network", egressErrorMessage(e));
  }
}

export async function runHttpExtraction(plan: ExtractionPlan, opts: { baseUrl?: string; username?: string; password?: string; timeoutMs?: number }): Promise<ExtractionOutcome> {
  const base = baseOf(opts.baseUrl ?? plan.base_url);
  const timeout = opts.timeoutMs ?? 30000;
  const resolve = resolver(base);
  const secrets = [opts.password, opts.username];
  const clean = (m: string) => redactText(m, secrets);
  let cookie = "";
  if (plan.login) {
    if (!opts.username || !opts.password) throw new Error("Identifiants du compte de migration requis pour ce logiciel");
    const res = await login(plan as ExtractionPlan & { login: NonNullable<ExtractionPlan["login"]> }, base, opts.username, opts.password, timeout);
    cookie = cookiesOf(res, plan.login.session_cookie);
    if (res.status >= 400 || !cookie) throw new Error(`Connexion refusée par le logiciel source (HTTP ${res.status}) : vérifiez les identifiants fournis par le propriétaire`);
  }
  const get = (u: URL, maxBytes = MAX_BYTES) => egressRequest(u, { headers: cookie ? { cookie } : {}, timeoutMs: timeout, maxBytes, maxErrorBytes: 4096 });

  const files: ExtractedFile[] = [];
  const results: MechanismResult[] = [];
  for (const m of plan.mechanisms) {
    let url: URL;
    try {
      url = resolve(m.url);
    } catch (e) {
      results.push({ id: m.id, label: m.label, url: "(refusée)", status: "error", message: (e as Error).message });
      continue;
    }
    try {
      const res = await get(url);
      if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
        // Redirection jamais suivie : un 3xx sur un export vaut « session refusée ».
        const text = clean(res.body.toString("utf8").slice(0, 200));
        results.push({ id: m.id, label: m.label, url: url.pathname, status: res.status === 403 ? "forbidden" : "unauthorized", http: res.status, message: text || (res.status === 403 ? "accès refusé au compte fourni" : "session refusée") });
        continue;
      }
      if (res.status === 404) {
        results.push({ id: m.id, label: m.label, url: url.pathname, status: "not_found", http: 404, message: "mécanisme introuvable" });
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        results.push({ id: m.id, label: m.label, url: url.pathname, status: "error", http: res.status, message: `HTTP ${res.status}` });
        continue;
      }
      const data = res.body;
      const name = m.file ?? decodeURIComponent(url.pathname.split("/").pop() || m.id);
      const ct = res.headers["content-type"];
      files.push({ mechanism: m.id, name, url: url.pathname, data, content_type: typeof ct === "string" ? ct : null });
      results.push({ id: m.id, label: m.label, url: url.pathname, status: "ok", http: res.status, bytes: data.length, sha256: sha256(data), file: name });
    } catch (e) {
      const msg = e instanceof EgressError && e.code === "too_large" ? "fichier trop volumineux (200 Mo max)" : e instanceof EgressError && e.code === "timeout" ? "délai dépassé" : egressErrorMessage(e);
      results.push({ id: m.id, label: m.label, url: url.pathname, status: "error", message: clean(msg) });
    }
  }

  let manifest: ExtractionOutcome["manifest"] = null;
  if (plan.manifest) {
    try {
      const res = await get(resolve(plan.manifest), MAX_MANIFEST_BYTES);
      if (res.status >= 200 && res.status < 300) manifest = JSON.parse(res.body.toString("utf8")) as ExtractionOutcome["manifest"];
    } catch {}
  }
  return {
    at: new Date().toISOString(),
    system: plan.system,
    base_url: base.origin,
    account: opts.username ? maskUsername(opts.username) : "(aucun)",
    files,
    results,
    manifest,
    not_extractable: plan.not_extractable ?? [],
  };
}

/**
 * Test de connexion seul (aucun export téléchargé) pour un logiciel dont le plan décrit une
 * connexion par formulaire. Sans plan de connexion, REBORN ne peut pas tester lui-même : c'est
 * l'agent Computer Use (Mouss) qui établit la connexion et en rapporte l'état.
 */
export async function testHttpLogin(plan: ExtractionPlan, opts: { baseUrl?: string; username?: string; password?: string; timeoutMs?: number }): Promise<{ ok: true; detail: string }> {
  if (!plan.login) throw new Error("Ce plan ne décrit pas de connexion par formulaire : la connexion doit être établie par l'agent");
  const base = baseOf(opts.baseUrl ?? plan.base_url);
  if (!opts.username || !opts.password) throw new Error("Identifiants requis : confiez-les au projet");
  const res = await login(plan as ExtractionPlan & { login: NonNullable<ExtractionPlan["login"]> }, base, opts.username, opts.password, opts.timeoutMs ?? 15000);
  const ok = res.status < 400 && !!cookiesOf(res, plan.login.session_cookie);
  if (!ok) throw new Error(`Connexion refusée par le logiciel source (HTTP ${res.status})`);
  return { ok: true, detail: `Session ouverte sur ${safeOrigin(base.href) ?? base.origin} avec le compte ${maskUsername(opts.username)}` };
}
