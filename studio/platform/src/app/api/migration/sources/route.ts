import { addSource, getProject, removeSource } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { currentScope } from "@/lib/store";
import { requireExecutorLease } from "@/lib/migration/agent-writes";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Dépôt d'un fichier extrait (propriétaire du projet, exécuteur de l'agent) : { name, content_base64, mechanism? }.
 * Formats : CSV, JSON, Excel (.xlsx), export SQL, base SQLite, archive ZIP de pièces jointes.
 * L'auteur enregistré est l'identité authentifiée (un champ `by` du corps est ignoré).
 * Exécuteur de l'agent : seulement s'il tient le prêt de la mission en cours du projet (SPEC §6 ; 403 sinon).
 */
export const POST = handler(
  async (req) => {
    await requireExecutorLease(req, [currentScope()]);
    const b = (await readJson(req)) as { name?: unknown; content_base64?: unknown; mechanism?: unknown };
    if (typeof b.name !== "string" || typeof b.content_base64 !== "string") throw new ApiError(400, "name et content_base64 requis");
    const data = Buffer.from(b.content_base64, "base64");
    if (!data.length) throw new ApiError(400, "Fichier vide");
    const meta = addSource(b.name, data, { kind: "api", mechanism: typeof b.mechanism === "string" ? b.mechanism.slice(0, 120) : undefined, by: actorName() });
    return json({ ok: true, source: meta });
  },
  { access: ["owner", "explorer"], write: true, project: "query" },
);

/** Sources du projet (métadonnées : noms, tailles, empreintes, tables). Propriétaire, exécuteur de l'agent (qui les dépose) et Analyste. */
export const GET = handler(async () => json(getProject().sources), { access: ["owner", "explorer", "analyst"], project: "query" });

/** ?id=… : retire une source du projet (le fichier reste dans le coffre). Propriétaire du projet. */
export const DELETE = handler(
  async (req) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "id requis");
    removeSource(id);
    return json({ ok: true });
  },
  { access: ["owner"], write: true, project: "query" },
);
