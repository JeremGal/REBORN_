import { createProject, listProjects, newProjectId, projectRoot, projectSummary } from "@/lib/migration/project";
import { storeCredentials } from "@/lib/migration/credentials";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { ProjectCreateSchema } from "@/lib/migration/project-contracts";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS, type ConsentKind } from "@/lib/legal";
import { currentPrincipal, displayName, type UserPrincipal } from "@/lib/auth/principal";
import { deleteProjectConsents, recordConsents } from "@/lib/auth/consents";

export const dynamic = "force-dynamic";

/**
 * Projets visibles par l'appelant : client → les siens ; opérateur → les siens et ceux sans
 * propriétaire ; agents (jetons de service) → tous. État, avancement réel, données, anomalies.
 */
export const GET = handler(async () => json({ projects: listProjects(currentPrincipal()) }), { access: ["user", "explorer", "analyst"], project: "none" });

/**
 * Nouveau projet : { company, software?, legacy_url?, software_type?, notes?, authorized: true,
 * authorization_version, credentials?: { username, password, ttl_hours? }, credentials_notice_version }.
 * Propriétaire = compte connecté. `authorized_by` est ignoré : l'autorisation est enregistrée au nom
 * du compte (« Prénom Nom »), avec la version de la déclaration, et consignée dans ses consentements
 * (source_authorization, plus credentials_notice si des identifiants sont confiés). Un consentement n'est
 * JAMAIS présumé : la version du texte affiché doit être annoncée (authorization_version toujours,
 * credentials_notice_version avec des identifiants), sinon 400 et rien n'est enregistré ; une version
 * périmée : 409. Les identifiants sont chiffrés (durée limitée) et jamais renvoyés. Le projet de repli
 * (index.current) ne change pas.
 */
export const POST = handler(
  async (req) => {
    const parsed = ProjectCreateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Projet invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const { credentials, authorization_version, credentials_notice_version, authorized_by: _ignored, ...rest } = parsed.data;
    if (authorization_version === undefined) {
      throw new ApiError(400, `Confirmez la déclaration d'autorisation d'accès (version ${AUTHORIZATION_DECLARATION.version}) avant de créer le projet.`, [{ path: "authorization_version", message: "version de la déclaration affichée requise" }]);
    }
    if (authorization_version !== AUTHORIZATION_DECLARATION.version) {
      throw new ApiError(409, `La déclaration d'autorisation a changé (version ${AUTHORIZATION_DECLARATION.version}) : relisez-la et confirmez à nouveau.`);
    }
    if (credentials && credentials_notice_version === undefined) {
      throw new ApiError(400, `Confirmez avoir pris connaissance du traitement de vos identifiants (version ${LEGAL_DOCUMENTS.identifiants.version}) avant de les confier.`, [{ path: "credentials_notice_version", message: "version du texte affiché requise" }]);
    }
    if (credentials && credentials_notice_version !== LEGAL_DOCUMENTS.identifiants.version) {
      throw new ApiError(409, `Le traitement des identifiants a été mis à jour (version ${LEGAL_DOCUMENTS.identifiants.version}) : relisez-le avant de confier vos accès.`);
    }
    const who = currentPrincipal() as UserPrincipal; // access ["user"]
    const id = newProjectId();
    const kinds: ConsentKind[] = credentials ? ["source_authorization", "credentials_notice"] : ["source_authorization"];
    await recordConsents({ userId: who.userId, projectId: id, kinds });
    let p;
    try {
      p = createProject(rest, { id: who.userId, name: displayName(who) }, { id });
    } catch (e) {
      await deleteProjectConsents(id).catch(() => {});
      throw e;
    }
    if (credentials) storeCredentials(projectRoot(p.id), credentials.username, credentials.password, credentials.ttl_hours);
    return json({ ok: true, project: projectSummary(p.id) }, 201);
  },
  { access: ["user"], project: "none", write: true },
);
