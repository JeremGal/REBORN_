import { z } from "zod";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { isOperatorKey, OPERATOR_KEY_HEADER } from "@/lib/auth/auth";
import { eraseAccount, eraseProject } from "@/lib/migration/erase";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    project_id: z.string().regex(/^MIG_[a-f0-9]{8}$/).optional(),
    email: z.string().trim().toLowerCase().min(3).max(254).optional(),
    dry_run: z.boolean().optional(),
  })
  .strict()
  .refine((b) => (b.project_id === undefined) !== (b.email === undefined), { message: "project_id OU email" });

/**
 * Suppression demandée par la personne concernée, traitée par l'opérateur en ligne de commande
 * (`npm run account -- delete <email>` / `delete-project <MIG_id>`) : { project_id | email, dry_run? }.
 * Aucun navigateur ni agent : seule la clé de l'opérateur (<données>/operator.key, lisible de ce poste
 * seulement) l'autorise, comme la demande de lien de réinitialisation ; une requête portant un en-tête Origin
 * (page web) est refusée. Détail de ce qui est supprimé et conservé : lib/migration/erase.ts.
 */
export const POST = handler(
  async (req) => {
    if (req.headers.get("origin")) throw new ApiError(403, "Réservé à la ligne de commande de l'opérateur (npm run account)");
    if (!(await isOperatorKey(req.headers.get(OPERATOR_KEY_HEADER)))) throw new ApiError(401, "Clé de l'opérateur requise : npm run account -- delete <email> | delete-project <MIG_id>");
    const parsed = Body.safeParse(await readJson(req, 16 * 1024));
    if (!parsed.success) throw new ApiError(400, "Demande invalide : { project_id } ou { email }, et dry_run facultatif", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const b = parsed.data;
    const dryRun = b.dry_run === true;
    return json({ ok: true, dry_run: dryRun, ...(b.project_id ? { project: await eraseProject(b.project_id, { dryRun }) } : { account: await eraseAccount(b.email!, { dryRun }) }) });
  },
  { access: ["public"], write: true, project: "none" },
);
