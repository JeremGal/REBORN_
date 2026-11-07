import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { ExtractionPlanSchema, testHttpLogin } from "@/lib/migration/connectors";
import { readCredentials } from "@/lib/migration/credentials";
import { loadProject, projectRoot, projectSummary, setStatus, updateProject } from "@/lib/migration/project";
import { addEvent } from "@/lib/store";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Test RÉEL de connexion par le connecteur HTTP de REBORN : { plan } (contrat extraction_plan,
 * ou "test" pour le plan de test Relatio 2004). Utilise l'URL et les identifiants confiés au projet.
 * Un logiciel sans connexion par formulaire décrite dans un plan → 409 : c'est l'agent qui se connecte.
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const p = loadProject(id);
    if (!p) throw new ApiError(404, `Projet inconnu : ${id}`);
    if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant toute opération");
    const b = ((await readJson(req).catch(() => ({}))) ?? {}) as { plan?: unknown };
    if (b.plan === undefined) throw new ApiError(409, "Aucun connecteur automatique pour ce logiciel : la connexion sera établie par l'agent Computer Use (en attente)");
    // Le plan de test décrit Relatio 2004 : l'appliquer à un autre logiciel enverrait ses identifiants à un formulaire supposé
    if (b.plan === "test" && p.source_system && !/relatio/i.test(p.source_system)) throw new ApiError(409, `Le plan de test décrit Relatio 2004 : il ne s'applique pas à « ${p.source_system} »`);
    const parsed = ExtractionPlanSchema.safeParse(b.plan === "test" ? CRM_FIXTURES.extraction_plan : b.plan);
    if (!parsed.success) throw new ApiError(400, "Plan d'extraction non conforme au contrat");
    const creds = readCredentials(projectRoot(id));
    if (!creds) throw new ApiError(409, "Aucun identifiant confié au projet (ou identifiants expirés)");
    try {
      const out = await testHttpLogin(parsed.data, { baseUrl: p.legacy_url, username: creds.username, password: creds.password });
      updateProject(id, (x) => {
        x.connection = { status: "connected", detail: out.detail, at: new Date().toISOString(), by: b.plan === "test" ? "REBORN (connecteur HTTP · plan de test Relatio 2004)" : "REBORN (connecteur HTTP)" };
        if (["CREATED", "CONNECTION_PENDING", "FAILED", "NEEDS_HUMAN_REVIEW"].includes(x.status ?? "CREATED")) setStatus(x, "CONNECTED", out.detail);
      });
      addEvent({ source: "platform", type: "migration", title: "Connexion à l'ancien logiciel réussie", detail: out.detail });
      return json({ ok: true, connection: "connected", detail: out.detail, project: projectSummary(id) });
    } catch (e) {
      const msg = (e as Error).message;
      updateProject(id, (x) => {
        x.connection = { status: "failed", detail: msg, at: new Date().toISOString(), by: b.plan === "test" ? "REBORN (connecteur HTTP · plan de test Relatio 2004)" : "REBORN (connecteur HTTP)" };
        setStatus(x, "FAILED", `Connexion échouée : ${msg}`);
      });
      addEvent({ source: "platform", type: "migration", title: "Connexion à l'ancien logiciel refusée", detail: msg });
      return json({ ok: false, connection: "failed", error: msg, project: projectSummary(id) }, 502);
    }
  },
  { write: true },
);
