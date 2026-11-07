import { z } from "zod";
import { sha256 } from "./transforms";

/**
 * Connecteur d'extraction HTTP générique : ouvre une session avec le compte confié par le
 * propriétaire, puis télécharge les exports que ce compte est autorisé à obtenir.
 *
 * Le plan d'extraction (mécanismes, URL, droits requis) est produit par l'Explorer (Mouss)
 * pendant la découverte ; REBORN ne devine rien et ne tente aucun contournement : un refus
 * (401/403) est consigné comme donnée inaccessible.
 *
 * Identifiants : utilisés en mémoire le temps de l'extraction, jamais stockés ni journalisés.
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

export const maskAccount = (u: string) => (u.length <= 2 ? "**" : `${u.slice(0, 2)}${"*".repeat(Math.max(2, u.length - 2))}`);

export async function runHttpExtraction(plan: ExtractionPlan, opts: { baseUrl?: string; username?: string; password?: string; timeoutMs?: number }): Promise<ExtractionOutcome> {
  const base = new URL(opts.baseUrl ?? plan.base_url ?? "");
  if (!/^https?:$/.test(base.protocol)) throw new Error("Adresse du logiciel source invalide (http ou https)");
  const timeout = opts.timeoutMs ?? 30000;
  // Toutes les requêtes restent sur l'origine du logiciel source : le cookie de session n'est jamais envoyé ailleurs
  const resolve = (u: string) => {
    const url = new URL(u, base);
    if (url.origin !== base.origin) throw new Error(`URL hors du logiciel source refusée : ${url.origin}`);
    return url;
  };
  let cookie = "";
  if (plan.login) {
    if (!opts.username || !opts.password) throw new Error("Identifiants du compte de migration requis pour ce logiciel");
    const body = new URLSearchParams({ [plan.login.username_field]: opts.username, [plan.login.password_field]: opts.password });
    const res = await fetch(resolve(plan.login.url), { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(timeout) });
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    const wanted = plan.login.session_cookie;
    cookie = (wanted ? cookies.filter((c) => c.startsWith(`${wanted}=`)) : cookies).join("; ");
    if (res.status >= 400 || !cookie) throw new Error(`Connexion refusée par le logiciel source (HTTP ${res.status}) : vérifiez les identifiants fournis par le propriétaire`);
  }
  const get = (u: URL) => fetch(u, { headers: cookie ? { cookie } : {}, redirect: "manual", signal: AbortSignal.timeout(timeout) });

  const files: ExtractedFile[] = [];
  const results: MechanismResult[] = [];
  for (const m of plan.mechanisms) {
    let url: URL;
    try {
      url = resolve(m.url);
    } catch (e) {
      results.push({ id: m.id, label: m.label, url: m.url, status: "error", message: (e as Error).message });
      continue;
    }
    try {
      const res = await get(url);
      if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
        const text = (await res.text().catch(() => "")).slice(0, 200);
        results.push({ id: m.id, label: m.label, url: url.pathname, status: res.status === 403 ? "forbidden" : "unauthorized", http: res.status, message: text || (res.status === 403 ? "accès refusé au compte fourni" : "session refusée") });
        continue;
      }
      if (res.status === 404) {
        results.push({ id: m.id, label: m.label, url: url.pathname, status: "not_found", http: 404, message: "mécanisme introuvable" });
        continue;
      }
      if (!res.ok) {
        results.push({ id: m.id, label: m.label, url: url.pathname, status: "error", http: res.status, message: `HTTP ${res.status}` });
        continue;
      }
      const data = Buffer.from(await res.arrayBuffer());
      if (data.length > MAX_BYTES) {
        results.push({ id: m.id, label: m.label, url: url.pathname, status: "error", message: "fichier trop volumineux (200 Mo max)" });
        continue;
      }
      const name = m.file ?? decodeURIComponent(url.pathname.split("/").pop() || m.id);
      files.push({ mechanism: m.id, name, url: url.pathname, data, content_type: res.headers.get("content-type") });
      results.push({ id: m.id, label: m.label, url: url.pathname, status: "ok", http: res.status, bytes: data.length, sha256: sha256(data), file: name });
    } catch (e) {
      results.push({ id: m.id, label: m.label, url: url.pathname, status: "error", message: (e as Error).name === "TimeoutError" ? "délai dépassé" : (e as Error).message });
    }
  }

  let manifest: ExtractionOutcome["manifest"] = null;
  if (plan.manifest) {
    try {
      const res = await get(resolve(plan.manifest));
      if (res.ok) manifest = (await res.json()) as ExtractionOutcome["manifest"];
    } catch {}
  }
  return {
    at: new Date().toISOString(),
    system: plan.system,
    base_url: base.origin,
    account: opts.username ? maskAccount(opts.username) : "(aucun)",
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
  const base = new URL(opts.baseUrl ?? plan.base_url ?? "");
  if (!/^https?:$/.test(base.protocol)) throw new Error("Adresse du logiciel source invalide (http ou https)");
  if (!opts.username || !opts.password) throw new Error("Identifiants requis : confiez-les au projet");
  const url = new URL(plan.login.url, base);
  if (url.origin !== base.origin) throw new Error(`URL hors du logiciel source refusée : ${url.origin}`);
  const body = new URLSearchParams({ [plan.login.username_field]: opts.username, [plan.login.password_field]: opts.password });
  const res = await fetch(url, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 15000) });
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  const wanted = plan.login.session_cookie;
  const ok = res.status < 400 && (wanted ? cookies.some((c) => c.startsWith(`${wanted}=`)) : cookies.length > 0);
  if (!ok) throw new Error(`Connexion refusée par le logiciel source (HTTP ${res.status})`);
  return { ok: true, detail: `Session ouverte sur ${base.origin} avec le compte ${maskAccount(opts.username)}` };
}
