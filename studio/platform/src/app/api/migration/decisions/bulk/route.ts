import { z } from "zod";
import { acceptMany, planStatus } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { handler, json, parseWith, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    /** Version des correspondances affichée au moment de la confirmation (409 si elle a changé depuis). */
    version: z.number().int().positive(),
    /** Points acceptés : exactement ceux que la personne a vus et confirmés (protections comptables exclues si elle les a décochées). */
    keys: z.array(z.string().min(1).max(300)).min(1, "au moins un point à accepter").max(5000),
    comment: z.string().trim().max(500).optional(),
    /** Ignoré, comme partout : l'auteur est l'identité authentifiée. */
    by: z.unknown().optional(),
  })
  .strict();

/**
 * Validation en bloc des propositions restantes (étape Correspondances) : { version, keys[], comment? }.
 * Propriétaire du projet seulement (contrôles d'hôte, d'origine, de projet et de propriété de handler(), comme la
 * décision unitaire /api/migration/decisions) ; l'auteur est l'identité authentifiée, jamais un champ du corps.
 * Même logique que la décision unitaire (lib/migration/project.ts : acceptMany) ; un seul évènement
 * « N points acceptés en bloc par <nom> ». Réponses : 200 · 400 format · 404 point inconnu · 409 version changée ou projet en pause.
 */
export const POST = handler(
  async (req) => {
    const b = parseWith(BodySchema, await readJson(req, 512 * 1024));
    const r = acceptMany(b.version, b.keys, actorName(), b.comment || undefined);
    const st = planStatus();
    return json({
      ok: true,
      version: r.version,
      accepted: r.accepted.length,
      skipped: r.skipped.length,
      accounting: r.accounting,
      review: { items: st.items, pending: st.pending, can_run: st.can_run, blockers: st.blockers },
    });
  },
  { access: ["owner"], write: true, project: "query" },
);
