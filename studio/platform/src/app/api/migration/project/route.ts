import { newProject } from "@/lib/migration/project";
import { handler, json, readJson } from "@/lib/http";
import { currentPrincipal, displayName, isOperator } from "@/lib/auth/principal";

export const dynamic = "force-dynamic";

/**
 * Ancienne création de projet, SANS consentement : réservée à l'équipe (page historique /migration,
 * scripts de l'opérateur). { name, source_system? } ; le projet appartient à l'opérateur et devient
 * le projet de repli de ses pages historiques. Les clients passent par POST /api/projects.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { name?: unknown; source_system?: unknown };
    const who = currentPrincipal();
    const owner = isOperator(who) ? { id: who.userId, name: displayName(who) } : null;
    const p = newProject(typeof b.name === "string" ? b.name.slice(0, 80) : "Migration", typeof b.source_system === "string" ? b.source_system.slice(0, 80) : undefined, owner);
    return json({ ok: true, project: { id: p.id, name: p.name } });
  },
  { access: ["operator"], project: "none", write: true },
);
