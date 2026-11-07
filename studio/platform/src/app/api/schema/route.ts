import { currentSchema, getState } from "@/lib/store";
import { publishSchema } from "@/lib/service";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Description structurée de l'interface (champs, sections, sorties, éléments non reconstruits).
 * Chaque envoi crée une nouvelle version ; l'application reconstruite se régénère.
 */
export const POST = handler(
  async (req) => {
    const source = new URL(req.url).searchParams.get("source") ?? "explorer";
    const { stored, issues } = publishSchema(await readJson(req), source);
    return json({ ok: true, version: stored.version, issues });
  },
  { write: true },
);

export const GET = handler(async (req) => {
  if (new URL(req.url).searchParams.get("all")) return json(getState().schemas);
  const s = currentSchema();
  return s ? json(s) : json({ ok: false, error: "Aucun schéma" }, 404);
});
