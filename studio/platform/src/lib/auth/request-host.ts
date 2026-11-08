/**
 * Hôte de la requête, tel que le navigateur l'a demandé : en-tête Host, ou x-forwarded-host
 * UNIQUEMENT derrière un proxy de confiance (REBORN_TRUST_PROXY=1 ; sinon un client pourrait
 * l'inventer). Sert au contrôle d'hôte, au contrôle d'origine (CSRF) et aux origines de confiance
 * de Better Auth, qui doivent tous porter sur le même hôte. Module sans dépendance.
 */
export const VALID_HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i;

/**
 * Adresse publique du Studio : REBORN_PUBLIC_URL ; à défaut, sur Vercel, l'adresse de production du projet
 * fournie par Vercel lui-même (variable système VERCEL_PROJECT_PRODUCTION_URL). Chaîne vide sinon.
 */
export function configuredPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.REBORN_PUBLIC_URL?.trim();
  if (v) return v;
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return env.VERCEL && prod && VALID_HOST.test(prod) ? `https://${prod}` : "";
}

/**
 * Hôtes propres au déploiement Vercel (production, déploiement, branche), fournis par Vercel : servis comme
 * l'hôte de l'adresse publique. Vide hors de Vercel.
 */
export function platformHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!env.VERCEL) return [];
  return [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL]
    .map((h) => (h ?? "").trim().toLowerCase())
    .filter((h) => h && VALID_HOST.test(h));
}

export function requestHostOf(req: Request): string {
  if (process.env.REBORN_TRUST_PROXY === "1") {
    const fwd = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (fwd && VALID_HOST.test(fwd)) return fwd.toLowerCase();
  }
  const host = req.headers.get("host");
  if (host) return host.toLowerCase();
  try {
    return new URL(req.url).host.toLowerCase();
  } catch {
    return "";
  }
}
