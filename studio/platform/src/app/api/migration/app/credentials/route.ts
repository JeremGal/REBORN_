import { ApiError, handler, json } from "@/lib/http";
import { currentPrincipal, displayName } from "@/lib/auth/principal";
import { issueAppCredentials } from "@/lib/migration/app-access";
import { deliveredApp, getProject, migrationLog } from "@/lib/migration/project";

export const dynamic = "force-dynamic";

/**
 * « Identifiant et mot de passe » du logiciel livré (étape Livraison), pour le propriétaire du projet :
 * compte administrateur à son adresse e-mail, mot de passe aléatoire lisible renvoyé UNE fois dans cette
 * réponse (cache-control: no-store). Le Studio ne le conserve ni ne le journalise ; une nouvelle demande
 * en génère un autre (le précédent cesse de fonctionner).
 */
export const POST = handler(
  async () => {
    const who = currentPrincipal();
    if (who.kind !== "user") throw new ApiError(403, "Réservé au compte propriétaire du projet");
    const p = getProject();
    const active = p.deployments.some((d) => d.status === "active");
    const app = active ? deliveredApp(p) : null;
    if (!app) throw new ApiError(409, "Aucun logiciel livré en service pour ce projet : mettez-le en service à l'étape Reconstruction.");
    const out = await issueAppCredentials(app.id, { email: who.email, by: `${displayName(who)} (REBORN Studio)` });
    migrationLog(
      `Identifiant et mot de passe du logiciel livré générés pour ${displayName(who)}`,
      "Compte administrateur du nouveau logiciel ; mot de passe affiché une seule fois au propriétaire, ni conservé ni journalisé par le Studio.",
    );
    return json({ ok: true, login: out.login, password: out.password, url: out.url, role: "admin", app_id: app.id }, 201, { "referrer-policy": "no-referrer" });
  },
  { access: ["owner"], write: true, project: "query" },
);
