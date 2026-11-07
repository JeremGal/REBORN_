import { createProject, listProjects, projectRoot, projectSummary } from "@/lib/migration/project";
import { storeCredentials } from "@/lib/migration/credentials";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { ProjectCreateSchema } from "@/lib/migration/project-contracts";

export const dynamic = "force-dynamic";

/** Projets de migration (isolés) : état, avancement réel, données, anomalies, logiciel livré. */
export const GET = handler(async () => json({ projects: listProjects() }));

const CreateSchema = ProjectCreateSchema;

/**
 * Nouveau projet : { company, software?, legacy_url?, software_type?, notes?, authorized: true,
 * authorized_by, credentials?: { username, password, ttl_hours? } }. Les identifiants sont chiffrés
 * (durée limitée) et ne sont jamais renvoyés. Le nouveau projet devient le projet courant.
 */
export const POST = handler(
  async (req) => {
    const parsed = CreateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Projet invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const { credentials, ...rest } = parsed.data;
    const p = createProject(rest);
    if (credentials) storeCredentials(projectRoot(p.id), credentials.username, credentials.password, credentials.ttl_hours);
    return json({ ok: true, project: projectSummary(p.id) }, 201);
  },
  { write: true },
);
