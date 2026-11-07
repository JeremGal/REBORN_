"use client";

import { Radar } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { useReborn } from "@/components/RebornProvider";
import type { Investigation } from "@/lib/types";
import { useProject } from "./ProjectProvider";
import { CONN_WRAP_BTN, ConnFact, ConnNotice, ConnTag, useConnAction } from "./ConnShared";

/**
 * Ouvre une investigation rattachée au projet, en mode « agents réels » (live) : elle attend l'agent
 * Computer Use et n'exécute rien d'elle-même. Une seule investigation peut être active à la fois.
 */
export function ConnDiscoveryLaunch({ onLaunched, again }: { onLaunched: (investigationId: string) => void; again?: boolean }) {
  const { id, summary, post } = useProject();
  const { state, refresh: reloadState } = useReborn();
  const { busy, result, run } = useConnAction();
  if (!summary) return null;

  const application = summary.software ?? summary.company ?? summary.name;
  const target = summary.legacy_url;
  const paused = summary.status === "PAUSED";
  const running = state?.investigations.find((i) => i.status === "running") ?? null;
  const runningWhere = running ? (running.project_id === id ? "ce projet" : running.project_id ? "un autre projet" : "l'atelier, sans projet") : "";

  async function launch() {
    await run(
      "launch",
      async () => {
        const r = await post<{ investigation: Investigation }>("/api/investigations", {
          application,
          // Les modules ne sont pas encore connus : c'est l'exploration qui les découvrira
          module: "Modules à découvrir",
          mode: "live",
          project_id: id,
          ...(target ? { target_url: target } : {}),
        });
        onLaunched(r.investigation.id);
        return {
          tone: "ok",
          title: `Investigation #${r.investigation.number} ouverte (${r.investigation.id})`,
          text: "Mode agents réels : elle attend les rapports de l'agent Computer Use. Rien n'est simulé ; ses résultats s'afficheront ici dès leur réception.",
        };
      },
      { errorTitle: "Investigation non lancée", after: reloadState },
    );
  }

  return (
    <Panel eyebrow="Exploration · agents réels" title={again ? "Nouvelle investigation rattachée à ce projet" : "Lancer une investigation rattachée à ce projet"} actions={<ConnTag tone="info" title="Mode « live » : l'investigation attend les agents réels">Agents réels</ConnTag>}>
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] leading-relaxed text-sediment">
          L&apos;investigation est ouverte en mode « agents réels » : elle attend l&apos;agent Computer Use de H Company (Mouss), qui la récupère et y rattache ses observations. Elle
          ne lance aucune exploration simulée.
        </p>
        <dl className="grid gap-3 rounded-sm bg-chalk p-3 sm:grid-cols-3">
          <ConnFact label="Logiciel">{application}</ConnFact>
          <ConnFact label="Module">Découverte</ConnFact>
          <ConnFact label="Cible" mono={!!target}>
            {target ?? <span className="font-sans text-sediment">Non renseignée</span>}
          </ConnFact>
        </dl>
        {running && (
          <ConnNotice tone="warn" title="Une seule investigation peut être active">
            L&apos;investigation #{running.number} en cours ({running.application}, {runningWhere}) sera clôturée au lancement.
          </ConnNotice>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant={again ? "ghost" : "primary"} onClick={launch} disabled={paused || !!busy} className={CONN_WRAP_BTN}>
            <Radar size={14} className="shrink-0" aria-hidden /> {busy ? "Ouverture…" : "Lancer une investigation rattachée à ce projet"}
          </Button>
          {paused && <span className="text-[12px] text-sediment">Projet en pause : reprenez-le (étape Connexion) pour lancer une exploration.</span>}
        </div>
        {result && <ConnNotice live tone={result.tone} title={result.title}>{result.text}</ConnNotice>}
      </div>
    </Panel>
  );
}
