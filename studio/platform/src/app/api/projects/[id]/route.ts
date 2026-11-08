import { z } from "zod";
import { loadProject, projectRoot, projectSummary, setStatus, STATUS_LABEL, updateProject } from "@/lib/migration/project";
import { credentialStatus, releaseCredentials } from "@/lib/migration/credentials";
import { onLegacyUrlChanged } from "@/lib/migration/analysis";
import { LegacyUrlSchema } from "@/lib/migration/project-contracts";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { currentPrincipal, displayName } from "@/lib/auth/principal";

export const dynamic = "force-dynamic";

/** Détail d'un projet (sans aucun secret : seul un indice masqué de l'identifiant est renvoyé). */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const p = loadProject(id);
    if (!p) throw new ApiError(404, "Projet introuvable");
    return json({
      project: projectSummary(id),
      details: {
        notes: p.notes ?? null,
        software_type: p.software_type ?? null,
        authorization: p.authorization ?? null,
        connection: p.connection ?? null,
        credentials: credentialStatus(projectRoot(id)),
        status_history: (p.status_history ?? []).map((h) => ({ ...h, label: STATUS_LABEL[h.status] })),
      },
    });
  },
  { access: ["owner", "explorer", "analyst"], project: "param" },
);

const PatchSchema = z
  .object({
    company: z.string().trim().min(1).max(120).optional(),
    software: z.string().trim().max(120).optional(),
    // Même contrôle qu'à la création (SPEC §7, LegacyUrlSchema) : http(s), sans identifiant (user:pass@), hôte non
    // vide, 500 caractères au plus ; "" efface l'adresse. Le message d'erreur ne recopie jamais l'adresse.
    legacy_url: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        if (v === "") return;
        const r = LegacyUrlSchema.safeParse(v);
        if (!r.success) ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "Adresse invalide" });
      })
      .optional(),
    software_type: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
    action: z.enum(["pause", "resume"]).optional(),
  })
  .strict();

/**
 * Mise à jour des informations, mise en pause / reprise (l'état précédent est restauré).
 * Changer l'adresse de l'ancien logiciel (SPEC §3, §5) efface les identifiants confiés (clé d'abord, jetons
 * de remise révoqués, effacement tracé) et annule toute analyse en cours : ni les identifiants ni l'agent ne
 * doivent jamais partir vers une autre adresse que celle déclarée au dépôt et à la demande.
 * L'adresse est contrôlée comme à la création (LegacyUrlSchema) ; un refus ne la recopie jamais.
 */
export const PATCH = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const parsed = PatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Modification invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const b = parsed.data;
    const who = displayName(currentPrincipal());
    let urlChanged = false;
    updateProject(id, (p) => {
      if (b.company !== undefined) Object.assign(p, { company: b.company, name: b.company });
      if (b.software !== undefined) p.source_system = b.software || undefined;
      if (b.legacy_url !== undefined) {
        const next = b.legacy_url || undefined;
        urlChanged = next !== p.legacy_url;
        p.legacy_url = next;
      }
      if (b.software_type !== undefined) p.software_type = b.software_type || undefined;
      if (b.notes !== undefined) p.notes = b.notes || undefined;
      if (b.action === "pause" && p.status !== "PAUSED") {
        p.paused_from = p.status ?? "CREATED";
        setStatus(p, "PAUSED", `Projet mis en pause par ${who}`);
      }
      if (b.action === "resume" && p.status === "PAUSED") setStatus(p, p.paused_from ?? "CREATED", `Projet repris par ${who}`, { resume: true });
    });
    if (urlChanged) {
      releaseCredentials(id, "adresse de l'ancien logiciel modifiée (confiez à nouveau un accès pour la nouvelle adresse)");
      await onLegacyUrlChanged(id);
    }
    return json({ ok: true, project: projectSummary(id), ...(urlChanged ? { credentials: credentialStatus(projectRoot(id)) } : {}) });
  },
  { access: ["owner"], project: "param", write: true },
);
