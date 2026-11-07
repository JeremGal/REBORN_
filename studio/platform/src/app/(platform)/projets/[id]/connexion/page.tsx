"use client";

import { ArrowRight, Pause, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, ButtonLink, Empty, Panel } from "@/components/ui";
import { projectCall, useProject } from "@/components/project/ProjectProvider";
import { StatusPill } from "@/components/project/ProjectShell";
import { ConnConnectionPanel } from "@/components/project/ConnConnectionPanel";
import { ConnCredentialsPanel } from "@/components/project/ConnCredentialsPanel";
import { ConnMissionPanel } from "@/components/project/ConnMission";
import { ConnLoading, ConnNotice, connCount, connDate, useConnAction } from "@/components/project/ConnShared";

/**
 * Étape 1 — Connexion : état de connexion réellement rapporté, identifiants confiés (indice masqué),
 * mission de l'agent Computer Use, autorisation du propriétaire et historique des états du projet.
 */
export default function ConnexionPage() {
  const { id, summary, details, refresh } = useProject();
  const pause = useConnAction();
  const paused = summary?.status === "PAUSED";
  const history = details?.status_history ?? [];

  // Mise en pause : dernière entrée « PAUSED » et état qui sera restauré (entrée précédente).
  const pausedAt = paused ? history.findLastIndex((h) => h.status === "PAUSED") : -1;
  const pauseEntry = pausedAt >= 0 ? history[pausedAt] : null;
  const restored = pausedAt > 0 ? history[pausedAt - 1] : null;

  async function togglePause() {
    const action = paused ? "resume" : "pause";
    await pause.run(
      action,
      async () => {
        await projectCall(id, "PATCH", `/api/projects/${id}`, { action });
      },
      { errorTitle: action === "pause" ? "Mise en pause impossible" : "Reprise impossible", after: refresh },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[760px]">
          <div className="eyebrow">Étape 1 · Connexion</div>
          <h2 className="mt-1 text-[20px] leading-tight font-black tracking-[-0.02em]">Accès autorisé à l&apos;ancien logiciel</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-sediment">
            L&apos;agent Computer Use de H Company (Mouss) se connecte avec le compte confié par le propriétaire, puis rapporte l&apos;état de la connexion. REBORN n&apos;affiche une
            connexion réussie qu&apos;après ce rapport, ou après un test réel de son connecteur HTTP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={paused ? "accent" : "ghost"} onClick={togglePause} disabled={!summary || !!pause.busy}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {pause.busy ? (paused ? "Reprise…" : "Mise en pause…") : paused ? "Reprendre le projet" : "Mettre en pause"}
          </Button>
          <ButtonLink href={`/projets/${id}/decouverte`} variant="ghost">
            Étape suivante : Découverte <ArrowRight size={14} aria-hidden />
          </ButtonLink>
        </div>
      </div>

      {pause.result && <ConnNotice live tone={pause.result.tone} title={pause.result.title}>{pause.result.text}</ConnNotice>}

      {paused && (
        <ConnNotice tone="warn" icon={Pause} title={`Projet en pause${pauseEntry ? ` depuis le ${connDate(pauseEntry.at)}` : ""}`}>
          Dans le Studio, le test de connexion, la préparation de mission et le lancement d&apos;une exploration sont suspendus. La pause n&apos;arrête pas un agent déjà en
          route : ses rapports restent enregistrés. {restored ? `À la reprise, l'état « ${restored.label} » sera restauré.` : "À la reprise, l'état précédent sera restauré."}
        </ConnNotice>
      )}

      <ConnConnectionPanel />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ConnCredentialsPanel />

          <Panel eyebrow="Préalable" title="Autorisation du propriétaire">
            {!details ? (
              <ConnLoading label="Lecture de l'autorisation…" lines={2} />
            ) : details.authorization ? (
              <div className="flex flex-col gap-3">
                <p className="flex items-start gap-2 text-[13px] text-ink">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-verdigris" aria-hidden />
                  <span>
                    Confirmée par <b>{details.authorization.by}</b> le {connDate(details.authorization.at)}.
                  </span>
                </p>
                <blockquote className="rounded-sm bg-chalk px-3 py-2.5 text-[12.5px] leading-relaxed text-sediment shadow-[inset_2px_0_0_var(--color-verdigris)]">
                  « {details.authorization.statement} »
                </blockquote>
                <p className="text-[12px] text-silt">Transmise à l&apos;agent avec sa mission : il agit dans la limite des accès fournis, sans contourner aucune permission.</p>
              </div>
            ) : (
              <ConnNotice tone="warn" icon={TriangleAlert} title="Aucune autorisation enregistrée">
                Ce projet a été créé sans confirmation du propriétaire (projet antérieur à cette exigence). Elle ne peut pas être ajoutée depuis le Studio pour l&apos;instant :
                obtenez-la par écrit avant toute exploration.
              </ConnNotice>
            )}
          </Panel>
        </div>

        <ConnMissionPanel />
      </div>

      <Panel eyebrow="Traçabilité" title="Historique des états du projet" actions={history.length > 0 && <span className="text-[11.5px] text-silt">{connCount(history.length, "changement")}</span>}>
        {!details ? (
          <ConnLoading label="Lecture de l'historique…" lines={3} />
        ) : history.length === 0 ? (
          <Empty title="Aucun changement d'état enregistré" hint="Chaque changement d'état du projet (connexion, données reçues, migration…) sera consigné ici avec sa raison." />
        ) : (
          <ol className="max-h-[420px] overflow-y-auto" aria-label="Changements d'état, du plus récent au plus ancien">
            {history
              .map((h, i) => ({ ...h, key: `${h.at}-${i}` }))
              .reverse()
              .map((h) => (
                <li key={h.key} className="grid gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <time dateTime={h.at} className="tabular pt-0.5 font-mono text-[11.5px] text-silt">
                    {connDate(h.at)}
                  </time>
                  <div className="min-w-0">
                    <StatusPill status={h.status} label={h.label} />
                    <p className="mt-1 text-[12.5px] leading-snug break-words text-sediment">{h.reason}</p>
                  </div>
                </li>
              ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
