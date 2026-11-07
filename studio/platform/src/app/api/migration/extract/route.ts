import { extract, getProject, projectRoot } from "@/lib/migration/project";
import { readCredentials } from "@/lib/migration/credentials";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Extraction autorisée : { plan (contrat extraction_plan, ou "test"), base_url?, username?, password? }.
 * Sans identifiants dans la requête, ceux confiés au projet (chiffrés, durée limitée) sont utilisés.
 * Les identifiants servent uniquement à ouvrir la session dans le logiciel source : ils ne sont
 * ni journalisés, ni renvoyés.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { plan?: unknown; base_url?: unknown; username?: unknown; password?: unknown };
    const plan = b.plan === "test" || b.plan === undefined ? CRM_FIXTURES.extraction_plan : b.plan;
    const software = getProject().source_system;
    if ((b.plan === "test" || b.plan === undefined) && software && !/relatio/i.test(software)) throw new ApiError(409, `Le plan de test décrit Relatio 2004 : il ne s'applique pas à « ${software} » (fournissez le plan d'extraction de ce logiciel)`);
    const str = (v: unknown) => (typeof v === "string" && v.length ? v : undefined);
    if (b.base_url !== undefined && typeof b.base_url !== "string") throw new ApiError(400, "base_url invalide");
    const stored = !str(b.password) ? readCredentials(projectRoot()) : null;
    const base_url = str(b.base_url) ?? (getProject().legacy_url || undefined);
    const summary = await extract(plan, { base_url, username: str(b.username) ?? stored?.username, password: str(b.password) ?? stored?.password });
    return json({ ok: true, extraction: summary });
  },
  { write: true },
);
