import { loadProject, projectSummary, setStatus, updateProject, type ProjectStatus } from "@/lib/migration/project";
import { addEvent } from "@/lib/store";
import { ApiError, handler, json, readJson } from "@/lib/http";
import { ConnectionReportSchema } from "@/lib/migration/project-contracts";

export const dynamic = "force-dynamic";

/** Rang des états « avant extraction » : un rapport de connexion ne fait jamais reculer un projet avancé. */
const EARLY: ProjectStatus[] = ["CREATED", "CONNECTION_PENDING", "CONNECTED", "FAILED", "NEEDS_HUMAN_REVIEW"];

const Schema = ConnectionReportSchema;

/**
 * État de connexion rapporté par l'agent Computer Use (Mouss) : { status, detail?, by? }.
 * pending · connected · failed · mfa_required (double authentification) · human_needed (intervention).
 * REBORN ne simule jamais une connexion réussie : seul un rapport de l'agent (ou le test du
 * connecteur HTTP, /connection/test) fait passer le projet à « Connecté ».
 */
export const POST = handler(
  async (req, ctx) => {
    const { id } = await ctx.params;
    if (!loadProject(id)) throw new ApiError(404, `Projet inconnu : ${id}`);
    const parsed = Schema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "Rapport de connexion invalide", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const { status, detail } = parsed.data;
    const by = parsed.data.by ?? "Explorer";
    updateProject(id, (p) => {
      p.connection = { status, detail, at: new Date().toISOString(), by };
      const early = EARLY.includes(p.status ?? "CREATED");
      const reason = detail ? `${by} : ${detail}` : `Rapport de ${by}`;
      if (status === "connected" && early) setStatus(p, "CONNECTED", reason);
      else if (status === "failed") setStatus(p, "FAILED", `Connexion échouée — ${reason}`);
      else if (status === "mfa_required") setStatus(p, "NEEDS_HUMAN_REVIEW", `Double authentification demandée — ${reason}`);
      else if (status === "human_needed") setStatus(p, "NEEDS_HUMAN_REVIEW", `Intervention humaine nécessaire — ${reason}`);
      else if (status === "pending" && early) setStatus(p, "CONNECTION_PENDING", reason);
    });
    addEvent({ source: "explorer", type: "migration", title: `Connexion à l'ancien logiciel : ${{ pending: "en attente", connected: "réussie", failed: "échec", mfa_required: "double authentification demandée", human_needed: "intervention humaine nécessaire" }[status]}`, detail });
    return json({ ok: true, project: projectSummary(id) });
  },
  { write: true },
);
