/**
 * Hôte de la requête, tel que le navigateur l'a demandé : en-tête Host, ou x-forwarded-host
 * UNIQUEMENT derrière un proxy de confiance (REBORN_TRUST_PROXY=1 ; sinon un client pourrait
 * l'inventer). Sert au contrôle d'hôte, au contrôle d'origine (CSRF) et aux origines de confiance
 * de Better Auth, qui doivent tous porter sur le même hôte. Module sans dépendance.
 */
export const VALID_HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i;

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
