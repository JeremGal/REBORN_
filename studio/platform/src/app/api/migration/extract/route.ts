import { extract } from "@/lib/migration/project";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Extraction autorisée : { plan (contrat extraction_plan, ou "test"), base_url?, username?, password? }.
 * Les identifiants servent uniquement à ouvrir la session dans le logiciel source : ils ne sont
 * ni stockés, ni journalisés, ni renvoyés.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { plan?: unknown; base_url?: unknown; username?: unknown; password?: unknown };
    const plan = b.plan === "test" || b.plan === undefined ? CRM_FIXTURES.extraction_plan : b.plan;
    const str = (v: unknown) => (typeof v === "string" && v.length ? v : undefined);
    if (b.base_url !== undefined && typeof b.base_url !== "string") throw new ApiError(400, "base_url invalide");
    const summary = await extract(plan, { base_url: str(b.base_url), username: str(b.username), password: str(b.password) });
    return json({ ok: true, extraction: summary });
  },
  { write: true },
);
