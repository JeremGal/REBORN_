import { newProject } from "@/lib/migration/project";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Nouveau projet de migration : { name, source_system? }. Les fichiers précédents restent sur disque. */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { name?: unknown; source_system?: unknown };
    const p = newProject(typeof b.name === "string" ? b.name.slice(0, 80) : "Migration", typeof b.source_system === "string" ? b.source_system.slice(0, 80) : undefined);
    return json({ ok: true, project: { id: p.id, name: p.name } });
  },
  { write: true },
);
