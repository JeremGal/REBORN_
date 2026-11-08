import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { ExtractionPlanSchema, testHttpLogin } from "@/lib/migration/connectors";
import { readCredentials, redactText } from "@/lib/migration/credentials";
import { legacyUrlProblem } from "@/lib/migration/project-contracts";
import { loadProject, projectSummary, setStatus, updateProject } from "@/lib/migration/project";
import { projectEvent } from "@/lib/migration/analysis";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Test RÉEL de connexion par le connecteur HTTP de REBORN : { plan } — "test" (plan de test du logiciel
 * Relatio 2004, jeu de test) ou, pour l'équipe REBORN seulement, un plan extraction_plan.
 * Uniquement l'adresse DÉCLARÉE du projet (jamais celle d'un plan) et les identifiants confiés ; sorties
 * réseau contrôlées (egress.ts : adresses internes refusées hors liste blanche, redirections non suivies).
 * Un logiciel sans connexion par formulaire décrite dans un plan → 409 : c'est l'agent qui se connecte.
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const p = loadProject(id);
    if (!p) throw new ApiError(404, "Projet introuvable");
    if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant toute opération");
    const b = ((await readJson(req).catch(() => ({}))) ?? {}) as { plan?: unknown };
    if (b.plan === undefined) throw new ApiError(409, "Aucun connecteur automatique pour ce logiciel : la connexion sera établie par l'agent Computer Use (en attente)");
    const isTest = b.plan === "test";
    if (!isTest && !isOperator(currentPrincipal())) throw new ApiError(403, "Plan de connexion libre réservé à l'équipe REBORN : utilisez le plan de test (logiciel Relatio) ou l'analyse par l'agent");
    // Le plan de test décrit Relatio 2004 : l'appliquer à un autre logiciel enverrait ses identifiants à un formulaire supposé
    if (isTest && p.source_system && !/relatio/i.test(p.source_system)) throw new ApiError(409, `Le plan de test décrit Relatio 2004 : il ne s'applique pas à « ${p.source_system} »`);
    const parsed = ExtractionPlanSchema.safeParse(isTest ? CRM_FIXTURES.extraction_plan : b.plan);
    if (!parsed.success) throw new ApiError(400, "Plan d'extraction non conforme au contrat");
    const urlProblem = p.legacy_url ? legacyUrlProblem(p.legacy_url) : "Adresse de l'ancien logiciel non déclarée";
    if (urlProblem) throw new ApiError(409, `${urlProblem} : corrigez l'adresse du projet avant de tester la connexion`);
    const creds = readCredentials(id);
    if (!creds) throw new ApiError(409, "Aucun identifiant confié au projet (ou identifiants expirés)");
    const by = isTest ? "REBORN (connecteur HTTP · plan de test Relatio 2004)" : "REBORN (connecteur HTTP)";
    try {
      const out = await testHttpLogin(parsed.data, { baseUrl: p.legacy_url, username: creds.username, password: creds.password });
      updateProject(id, (x) => {
        x.connection = { status: "connected", detail: out.detail, at: new Date().toISOString(), by };
        if (["CREATED", "CONNECTION_PENDING", "FAILED", "NEEDS_HUMAN_REVIEW"].includes(x.status ?? "CREATED")) setStatus(x, "CONNECTED", out.detail);
      });
      projectEvent(id, "Connexion à l'ancien logiciel réussie", out.detail);
      return json({ ok: true, connection: "connected", detail: out.detail, project: projectSummary(id) });
    } catch (e) {
      const msg = redactText((e as Error).message, [creds.password, creds.username]);
      updateProject(id, (x) => {
        x.connection = { status: "failed", detail: msg, at: new Date().toISOString(), by };
        setStatus(x, "FAILED", `Connexion échouée : ${msg}`);
      });
      projectEvent(id, "Connexion à l'ancien logiciel refusée", msg);
      return json({ ok: false, connection: "failed", error: msg, project: projectSummary(id) }, 502);
    }
  },
  { access: ["owner", "operator"], project: "param", write: true },
);
