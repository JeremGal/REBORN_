import { z } from "zod";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { currentPrincipal, type UserPrincipal } from "@/lib/auth/principal";
import { getAuth } from "@/lib/auth/auth";
import { listConsents, requiredAccountConsents } from "@/lib/auth/consents";
import { userDto } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const me = () => currentPrincipal() as UserPrincipal; // access ["user"] : toujours un compte connecté ici

/**
 * Mon compte : identité (DTO minimal), consentements enregistrés, et textes à accepter de nouveau
 * (`consents_required` : nouvelle version des conditions ou de la politique ; vide si tout est à jour —
 * tant qu'il ne l'est pas, les écritures sont refusées : POST /api/me/consents).
 */
export const GET = handler(
  async () => {
    const p = me();
    return json({ user: userDto(p), consents: await listConsents(p.userId), consents_required: await requiredAccountConsents(p.userId) });
  },
  { access: ["user"], project: "none" },
);

const PatchSchema = z
  .object({
    firstName: z.string().trim().min(1, "Prénom requis.").max(80, "Prénom trop long (80 caractères au maximum).").optional(),
    lastName: z.string().trim().min(1, "Nom requis.").max(80, "Nom trop long (80 caractères au maximum).").optional(),
    company: z.string().trim().max(120, "Nom de l'entreprise trop long (120 caractères au maximum).").optional(),
  })
  .strict();

/** Prénom, nom, entreprise. Le rôle et l'e-mail ne se modifient pas ici. */
export const PATCH = handler(
  async (req) => {
    const parsed = PatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Modification refusée", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const p = me();
    const b = parsed.data;
    const firstName = b.firstName ?? p.firstName;
    const lastName = b.lastName ?? p.lastName;
    const company = b.company ?? p.company ?? "";
    const ctx = await (await getAuth()).$context;
    const updated = await ctx.internalAdapter.updateUser(p.userId, { firstName, lastName, company, name: `${firstName} ${lastName}` });
    if (!updated) throw new ApiError(409, "Modification impossible pour le moment : réessayez");
    return json({ ok: true, user: userDto({ ...p, firstName, lastName, company: company || null }) });
  },
  { access: ["user"], project: "none", write: true },
);
