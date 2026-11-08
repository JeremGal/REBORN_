import { ApiError, handler, json } from "@/lib/http";
import { currentPrincipal, displayName } from "@/lib/auth/principal";
import { APP_INVITE_DEFAULT_TTL_HOURS, issueAppInvite } from "@/lib/migration/app-access";
import { deliveredApp, getProject, migrationLog } from "@/lib/migration/project";
import { requireAppPublicUrl } from "@/lib/migration/public-urls";

export const dynamic = "force-dynamic";

/**
 * « Créer mon accès au logiciel » (étape Livraison) : invitation à usage unique dans le logiciel livré,
 * pour l'adresse e-mail du compte connecté (rôle administrateur), valable 72 h. La personne choisit
 * ensuite SON mot de passe sur l'écran d'activation du logiciel livré : ni le Studio ni l'ancien
 * logiciel ne le connaissent.
 *
 * Le lien n'est renvoyé qu'une fois, dans cette réponse (cache-control: no-store) : il n'est ni
 * conservé par le Studio, ni journalisé (le journal du projet note seulement qu'un accès a été préparé).
 * Le jeton est dans le fragment # du lien : il ne part jamais vers un serveur dans l'adresse.
 * Une nouvelle demande remplace le lien précédent (le logiciel livré révoque l'ancien).
 */
export const POST = handler(
  async () => {
    const who = currentPrincipal();
    if (who.kind !== "user") throw new ApiError(403, "Réservé au compte propriétaire du projet");
    const p = getProject();
    const active = p.deployments.some((d) => d.status === "active");
    const app = active ? deliveredApp(p) : null;
    if (!app) throw new ApiError(409, "Aucun logiciel livré en service pour ce projet : mettez-le en service à l'étape Reconstruction.");
    await requireAppPublicUrl(app.port); // mode tunnels : jamais de lien vers 127.0.0.1 ; vérifié AVANT d'émettre (le lien valide n'est pas révoqué)
    const out = issueAppInvite(app.id, { email: who.email, role: "admin", by: `${displayName(who)} (REBORN Studio)`, ttlHours: APP_INVITE_DEFAULT_TTL_HOURS });
    migrationLog(
      `Accès au logiciel livré préparé pour ${displayName(who)}`,
      `Lien d'activation à usage unique (rôle administrateur), valable jusqu'au ${new Date(out.expires_at).toLocaleString("fr-FR")} : il n'est ni conservé ni journalisé par le Studio.`,
    );
    return json({ ok: true, link: out.link, expires_at: out.expires_at, email: who.email, role: "admin", app_id: app.id }, 201, { "referrer-policy": "no-referrer" });
  },
  { access: ["owner"], write: true, project: "query" },
);
