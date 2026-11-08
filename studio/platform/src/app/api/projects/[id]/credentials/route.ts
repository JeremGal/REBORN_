import { loadProject } from "@/lib/migration/project";
import { credentialStatus, releaseCredentials, storeCredentials } from "@/lib/migration/credentials";
import { onCredentialsReplaced, onCredentialsWithdrawn, projectEvent, sweepIfDue } from "@/lib/migration/analysis";
import { CredentialsDepositSchema } from "@/lib/migration/project-contracts";
import { recordConsent } from "@/lib/auth/consents";
import { currentPrincipal, displayName, type UserPrincipal } from "@/lib/auth/principal";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/*
 * Identifiants de l'ancien logiciel d'un projet (SPEC §5, lot B2) — propriétaire du projet uniquement.
 * Jamais de valeur en réponse : seul un indice masqué et l'échéance (24 h au plus).
 */

function project(id: string) {
  const p = loadProject(id);
  if (!p) throw new ApiError(404, "Projet introuvable");
  return p;
}

const dateFr = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

/** État : { stored, username_hint?, created_at?, expires_at? } (identifiants expirés : effacés, stored false). */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    await sweepIfDue();
    project(id);
    return json(credentialStatus(id));
  },
  { access: ["owner"], project: "param" },
);

/**
 * Confie (ou remplace) les identifiants : { username, password, ttl_hours? ≤ 24, credentials_notice_version? }.
 * Chiffrés (une clé par identifiant), effacés automatiquement à l'échéance ; le jeton de remise en cours
 * est révoqué et une analyse en cours repart en file (l'agent recevra les nouveaux à sa prochaine prise).
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    await sweepIfDue();
    const p = project(id);
    if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant toute opération");
    const parsed = CredentialsDepositSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      const ttl = issues.find((i) => i.path === "ttl_hours");
      throw new ApiError(400, ttl ? ttl.message : "Identifiant et mot de passe requis", issues);
    }
    const b = parsed.data;
    if (b.credentials_notice_version !== undefined && b.credentials_notice_version !== LEGAL_DOCUMENTS.identifiants.version) {
      throw new ApiError(409, `Le traitement des identifiants a été mis à jour (version ${LEGAL_DOCUMENTS.identifiants.version}) : relisez-le avant de confier vos accès.`);
    }
    const who = currentPrincipal() as UserPrincipal; // access ["owner"] : compte connecté
    const out = storeCredentials(id, b.username, b.password, b.ttl_hours ?? 24);
    // Prise de connaissance enregistrée seulement si l'interface annonce la version affichée (jamais présumée).
    if (b.credentials_notice_version !== undefined) await recordConsent({ userId: who.userId, projectId: id, kind: "credentials_notice" });
    await onCredentialsReplaced(id, out.expires_at);
    projectEvent(id, "Identifiants de l'ancien logiciel confiés au projet", `Compte ${out.username_hint} · chiffrés, effacés automatiquement le ${dateFr(out.expires_at)} au plus tard`, "user");
    return json({ ok: true, stored: true, username_hint: out.username_hint, created_at: out.created_at, expires_at: out.expires_at });
  },
  { access: ["owner"], project: "param", write: true },
);

/**
 * Suppression demandée par le client : jetons révoqués, clé de l'identifiant supprimée en premier,
 * puis le fichier chiffré ; une analyse qui en dépendait est annulée. Les données déjà récupérées
 * (sources, correspondances, exécutions) ne sont jamais touchées. Réponse : { revoked_at }.
 */
export const DELETE = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    project(id);
    const who = currentPrincipal();
    const out = releaseCredentials(id, `suppression demandée par ${displayName(who)}`);
    await onCredentialsWithdrawn(id, "identifiants supprimés à la demande du client");
    return json({ ok: true, stored: false, revoked_at: out.revoked_at, erased: out.erased });
  },
  { access: ["owner"], project: "param", write: true },
);
