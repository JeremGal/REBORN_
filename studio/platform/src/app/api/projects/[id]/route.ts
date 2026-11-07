import { z } from "zod";
import { loadProject, projectRoot, projectSummary, setStatus, STATUS_LABEL, updateProject } from "@/lib/migration/project";
import { credentialStatus } from "@/lib/migration/credentials";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Détail d'un projet (sans aucun secret : seul un indice masqué de l'identifiant est renvoyé). */
export const GET = handler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const p = loadProject(id);
  if (!p) throw new ApiError(404, `Projet inconnu : ${id}`);
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
});

const PatchSchema = z
  .object({
    company: z.string().trim().min(1).max(120).optional(),
    software: z.string().trim().max(120).optional(),
    legacy_url: z.string().trim().max(500).refine((u) => u === "" || /^https?:\/\/[^\s]+$/.test(u), "URL http(s) attendue").optional(),
    software_type: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
    action: z.enum(["pause", "resume"]).optional(),
  })
  .strict();

/** Mise à jour des informations, mise en pause / reprise (l'état précédent est restauré). */
export const PATCH = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const parsed = PatchSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Modification invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const b = parsed.data;
    updateProject(id, (p) => {
      if (b.company !== undefined) Object.assign(p, { company: b.company, name: b.company });
      if (b.software !== undefined) p.source_system = b.software || undefined;
      if (b.legacy_url !== undefined) p.legacy_url = b.legacy_url || undefined;
      if (b.software_type !== undefined) p.software_type = b.software_type || undefined;
      if (b.notes !== undefined) p.notes = b.notes || undefined;
      if (b.action === "pause" && p.status !== "PAUSED") {
        p.paused_from = p.status ?? "CREATED";
        setStatus(p, "PAUSED", "Projet mis en pause par l'opérateur");
      }
      if (b.action === "resume" && p.status === "PAUSED") setStatus(p, p.paused_from ?? "CREATED", "Projet repris par l'opérateur", { resume: true });
    });
    return json({ ok: true, project: projectSummary(id) });
  },
  { write: true },
);
