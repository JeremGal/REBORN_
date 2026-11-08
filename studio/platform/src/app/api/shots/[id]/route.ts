import fs from "node:fs";
import { ATELIER_SHOTS, shotPath, type ShotFolder } from "@/lib/store";
import { canSeeProject, ownedProjectIds, ownerOf } from "@/lib/migration/project";
import { projectScope } from "@/lib/migration/context";
import { currentPrincipal, type Principal } from "@/lib/auth/principal";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * Dossiers de captures lisibles par l'appelant. Les captures sont rangées par projet (shots/<projet>/),
 * celles de l'atelier dans shots/_atelier/, les plus anciennes (avant ce rangement) à la racine de shots/.
 * - client : ses projets uniquement ;
 * - équipe (opérateur) : atelier, anciennes captures, et ses projets ou ceux sans propriétaire ;
 * - agents : toutes ;
 * - ?project= (déjà contrôlé par handler()) : ce seul projet, pour tout le monde.
 */
function readableFolders(who: Principal, designated: string | null): (f: ShotFolder) => boolean {
  if (designated) return (f) => f === designated;
  if (who.kind === "service") return () => true;
  if (who.kind !== "user") return () => false;
  if (who.role === "operator") return (f) => f === null || f === ATELIER_SHOTS || canSeeProject(who, ownerOf(f));
  const mine = ownedProjectIds(who.userId);
  return (f) => f !== null && mine.has(f);
}

/**
 * Captures d'écran de l'ancien logiciel envoyées par l'agent, servies à qui peut lire leur projet.
 * Capture d'un autre compte, ou inexistante : même réponse 404 (rien ne révèle son existence).
 * Jamais mises en cache partagé : la réponse dépend de la session (private, no-store).
 */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const p = id ? shotPath(id, readableFolders(currentPrincipal(), projectScope.getStore() ?? null)) : null;
    if (!p) return json({ ok: false, error: "Capture introuvable" }, 404);
    const ext = id.split(".").pop() ?? "png";
    return new Response(fs.readFileSync(p), {
      headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
