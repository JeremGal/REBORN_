import path from "node:path";
import fs from "node:fs";
import { businessModelPackage, getProject, recordBusinessModel, runArtifacts, runDir } from "@/lib/migration/project";
import { checkRulesOnHistory } from "@/lib/migration/rules-history";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Rejoue une version du modèle métier sur les documents historiques de la dernière migration
 * (base migrée, lecture seule) et compare aux montants enregistrés : { version }.
 * Propriétaire du projet et Analyste.
 */
export const POST = handler(
  async (req) => {
    const b = (await readJson(req)) as { version?: unknown };
    if (typeof b.version !== "number") throw new ApiError(400, "version (nombre) requise");
    const run = [...getProject().runs].reverse().find((r) => r.status === "completed");
    if (!run) throw new ApiError(409, "Aucune migration terminée : lancez une migration avant de vérifier le modèle sur l'historique");
    const dbPath = path.join(runDir(run.id), "target.db");
    if (!fs.existsSync(dbPath)) throw new ApiError(404, `Base migrée de ${run.id} introuvable`);
    const { mapping } = runArtifacts(run.id);
    const check = checkRulesOnHistory(businessModelPackage(b.version), mapping, dbPath, run.id);
    recordBusinessModel(b.version, { history_check: check });
    return json({ ok: true, check });
  },
  { access: ["owner", "analyst"], write: true, project: "query" },
);
