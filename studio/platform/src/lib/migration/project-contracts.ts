import { z } from "zod";

/**
 * Contrats des projets et de la connexion (Studio ↔ propriétaire ↔ agent Computer Use).
 * Utilisés par les routes /api/projects/* et exportés en JSON Schema dans contracts/.
 */

export const PROJECT_CONTRACT_VERSION = "1.0";

export const ProjectCreateSchema = z
  .object({
    company: z.string().trim().min(1, "Nom de l'entreprise requis").max(120),
    software: z.string().trim().max(120).optional(),
    legacy_url: z
      .string()
      .trim()
      .max(500)
      .refine((u) => /^https?:\/\/[^\s]+$/.test(u), "URL http(s) attendue")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    software_type: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
    /** Le propriétaire (ou son mandataire) confirme être autorisé : obligatoire. */
    authorized: z.literal(true, { error: "Confirmez être autorisé(e) à faire analyser et migrer ces données" }),
    authorized_by: z.string().trim().min(1, "Nom de la personne qui confirme l'autorisation").max(120),
    credentials: z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(500), ttl_hours: z.number().min(0.25).max(168).optional() }).strict().optional(),
  })
  .strict();

/** Rapport de connexion de l'agent Computer Use (Mouss). */
export const ConnectionReportSchema = z
  .object({
    status: z.enum(["pending", "connected", "failed", "mfa_required", "human_needed"]),
    detail: z.string().max(1000).optional(),
    by: z.string().max(60).optional(),
  })
  .strict();
