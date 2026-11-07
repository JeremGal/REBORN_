import { ApiError, checkHost, checkOrigin, handler, isValidToken, json, TOKEN_COOKIE } from "@/lib/http";


export const dynamic = "force-dynamic";

/**
 * Mode réseau : ouvre une session navigateur. Le jeton est envoyé dans le corps (POST),
 * jamais dans l'URL : il n'apparaît ni dans les journaux du serveur ni dans l'historique.
 * Page associée : /connexion.
 */
export const POST = handler(async (req) => {
  const denied = checkOrigin(req);
  if (denied) return denied;
  let token: unknown = null;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) token = ((await req.json().catch(() => ({}))) as { token?: unknown }).token;
  else token = (await req.formData().catch(() => null))?.get("token");
  if (typeof token !== "string" || !isValidToken(token.trim())) throw new ApiError(401, "Jeton invalide");
  return json({ ok: true }, 200, {
    "set-cookie": `${TOKEN_COOKIE}=${encodeURIComponent(token.trim())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`,
  });
});

/** Ferme la session navigateur. */
export async function DELETE(req: Request) {
  const denied = checkHost(req) ?? checkOrigin(req);
  if (denied) return denied;
  return json({ ok: true }, 200, { "set-cookie": `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
}

/** L'ancienne ouverture par ?token=… est retirée : le jeton finissait dans les journaux. */
export async function GET() {
  return json({ ok: false, error: "Ouvrez /connexion (le jeton n'est plus accepté dans l'URL)" }, 410);
}
