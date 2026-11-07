import plan from "../../scenarios/quote/plan.json";
import type { Inputs } from "./types";

/**
 * Plan d'expériences joué par l'explorateur local (mode « simulation ») contre Quotix 98.
 * Les sorties sont réellement lues sur l'écran du logiciel, jamais calculées ici.
 */
export interface PlannedExperiment {
  n: number;
  phase: string;
  inputs: Inputs;
}

export const DEMO_PLAN = plan as PlannedExperiment[];
