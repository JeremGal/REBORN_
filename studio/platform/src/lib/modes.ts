import type { Investigation } from "./types";

/**
 * Deux parcours séparés, identifiables partout dans l'interface :
 *  - local : données de référence (scénarios, scripts de test) ou explorateur de répétition intégré.
 *    Aucune action d'un agent H Company.
 *  - real  : investigation alimentée par les vrais modules de Mouss (Explorer) et d'Alan (Analyste).
 */
export type ModeGroup = "local" | "real";

export const MODE_INFO: Record<Investigation["mode"], { group: ModeGroup; badge: string; label: string; detail: string }> = {
  live: {
    group: "real",
    badge: "Agents réels",
    label: "agents réels",
    detail: "Observations et règles reçues des modules de Mouss (Explorer) et d'Alan (Analyste).",
  },
  simulation: {
    group: "local",
    badge: "Mode local",
    label: "explorateur de répétition",
    detail: "Explorateur intégré à REBORN, qui pilote le logiciel par son interface HTML. Aucun agent H Company.",
  },
  replay: {
    group: "local",
    badge: "Mode local",
    label: "données de référence",
    detail: "Scénario de référence ou script de test rejoué par l'API. Aucun agent H Company.",
  },
};

export const modeGroup = (mode: Investigation["mode"]): ModeGroup => MODE_INFO[mode]?.group ?? "local";
