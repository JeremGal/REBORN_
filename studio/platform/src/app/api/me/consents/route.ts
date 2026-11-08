import { z } from "zod";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { currentPrincipal, type UserPrincipal } from "@/lib/auth/principal";
import { recordConsents, requiredAccountConsents } from "@/lib/auth/consents";
import { LEGAL_DOCUMENTS } from "@/lib/legal";

export const dynamic = "force-dynamic";

const me = () => currentPrincipal() as UserPrincipal; // access ["user"] : toujours un compte connecté ici

/** Textes du compte à accepter de nouveau (versions en vigueur non encore acceptées) : { required: [...] }. */
export const GET = handler(async () => json({ required: await requiredAccountConsents(me().userId) }), { access: ["user"], project: "none" });

const Body = z
  .object({
    /** Version des conditions d'utilisation affichée et acceptée (case non pré-cochée). */
    termsVersion: z.string().trim().min(1).max(20).optional(),
    /** Version de la politique de confidentialité affichée et lue (case non pré-cochée). */
    privacyVersion: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

/**
 * Nouvelle acceptation des textes du compte (conditions d'utilisation : contrat ; politique de confidentialité :
 * information) après un changement de version : la version AFFICHÉE de chaque texte à accepter doit être annoncée
 * (jamais présumée : 400 sans elle) et être la version en vigueur (409 sinon). Enregistrée dans consents
 * (document, version, empreinte du texte exact, date). Seule écriture permise tant que les textes ne sont pas acceptés.
 */
export const POST = handler(
  async (req) => {
    const parsed = Body.safeParse(await readJson(req, 4 * 1024));
    if (!parsed.success) throw new ApiError(400, "Demande invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const required = await requiredAccountConsents(me().userId);
    const announced = { terms_acceptance: parsed.data.termsVersion, privacy_acknowledgement: parsed.data.privacyVersion };
    for (const r of required) {
      const v = announced[r.kind];
      if (v === undefined) throw new ApiError(400, `${r.kind === "terms_acceptance" ? "Acceptez les conditions d'utilisation" : "Confirmez avoir pris connaissance de la politique de confidentialité"} (version ${r.version}) pour continuer.`);
      if (v !== r.version) throw new ApiError(409, `${r.title} : une nouvelle version (${r.version}) est en vigueur ; relisez-la avant de l'accepter.`);
    }
    for (const [kind, v] of Object.entries(announced)) {
      const current = kind === "terms_acceptance" ? LEGAL_DOCUMENTS.conditions.version : LEGAL_DOCUMENTS.confidentialite.version;
      if (v !== undefined && v !== current) throw new ApiError(409, `Version périmée (${v}) : la version en vigueur est la ${current}.`);
    }
    const recorded = required.length ? await recordConsents({ userId: me().userId, kinds: required.map((r) => r.kind) }) : [];
    return json({ ok: true, recorded, required: [] });
  },
  { access: ["user"], project: "none", write: true, beforeConsents: true },
);
