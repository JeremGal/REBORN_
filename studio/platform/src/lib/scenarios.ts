import { ApiError } from "./http";
import { SCENARIO_REGISTRY } from "../../scenarios";
import { ingestObservations, launchInvestigation, publishRules, publishSchema } from "./service";
import { resetState } from "./store";

/**
 * Scénarios de démonstration autonomes : chaque étape rejoue, via la même couche
 * de service que les API, ce que l'Explorer et l'Analyste enverront (mêmes
 * formats, mêmes validations). Fichiers : platform/scenarios/<id>/, enregistrés
 * dans platform/scenarios/index.ts.
 */

export interface ScenarioAction {
  do: "reset" | "investigation" | "schema" | "observations" | "rules";
  file?: string;
  kind?: "initial" | "blind_challenge" | "verification";
}
export interface ScenarioStep {
  id: string;
  label: string;
  description?: string;
  actions: ScenarioAction[];
}
export interface ScenarioManifest {
  id: string;
  title: string;
  description?: string;
  application: string;
  module: string;
  steps: ScenarioStep[];
}

export function listScenarios(): ScenarioManifest[] {
  return Object.values(SCENARIO_REGISTRY)
    .map((s) => s.manifest as ScenarioManifest)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readScenarioFile(id: string, file: string): unknown {
  const sc = SCENARIO_REGISTRY[id];
  if (!sc) throw new ApiError(404, `Scénario inconnu : ${id}`);
  if (!(file in sc.files)) throw new ApiError(404, `Fichier introuvable : ${id}/${file}`);
  // Copie profonde : le store ne doit jamais partager d'objets avec le registre
  return structuredClone(sc.files[file]);
}

export function runScenarioStep(id: string, stepId: string): { log: string[] } {
  const sc = listScenarios().find((s) => s.id === id);
  if (!sc) throw new ApiError(404, `Scénario inconnu : ${id}`);
  const step = sc.steps.find((s) => s.id === stepId);
  if (!step) throw new ApiError(404, `Étape inconnue : ${stepId}`);
  const log: string[] = [];
  for (const a of step.actions) {
    switch (a.do) {
      case "reset":
        resetState();
        log.push("État remis à zéro");
        break;
      case "investigation": {
        const inv = launchInvestigation({ application: sc.application, module: sc.module, mode: "replay", kind: a.kind ?? "initial", objective: `${sc.title} — ${step.label}` });
        log.push(`Investigation ${inv.id} créée`);
        break;
      }
      case "schema": {
        const { stored } = publishSchema(readScenarioFile(id, a.file!), "fixture");
        log.push(`Schéma v${stored.version} publié`);
        break;
      }
      case "observations": {
        const saved = ingestObservations(readScenarioFile(id, a.file!), "explorer");
        log.push(`${saved.length} observations importées`);
        break;
      }
      case "rules": {
        const r = publishRules(readScenarioFile(id, a.file!), { source: "fixture" });
        log.push(`Modèle v${r.version} publié (${r.validation.matched}/${r.validation.scored})`);
        break;
      }
    }
  }
  return { log };
}
