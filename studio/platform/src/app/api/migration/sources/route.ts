import { addSource, getProject, removeSource } from "@/lib/migration/project";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Dépôt d'un fichier extrait (Explorer, opérateur) : { name, content_base64, mechanism? }.
 * Formats : CSV, JSON, Excel (.xlsx), export SQL, base SQLite, archive ZIP de pièces jointes.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { name?: unknown; content_base64?: unknown; mechanism?: unknown; by?: unknown };
    if (typeof b.name !== "string" || typeof b.content_base64 !== "string") throw new ApiError(400, "name et content_base64 requis");
    const data = Buffer.from(b.content_base64, "base64");
    if (!data.length) throw new ApiError(400, "Fichier vide");
    const meta = addSource(b.name, data, { kind: "api", mechanism: typeof b.mechanism === "string" ? b.mechanism : undefined, by: typeof b.by === "string" ? b.by.slice(0, 60) : "api" });
    return json({ ok: true, source: meta });
  },
  { write: true },
);

export const GET = handler(async () => json(getProject().sources));

/** ?id=… : retire une source du projet (le fichier reste dans le coffre). */
export const DELETE = handler(
  async (req) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "id requis");
    removeSource(id);
    return json({ ok: true });
  },
  { write: true },
);
