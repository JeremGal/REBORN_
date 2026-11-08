"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { StatusBadge } from "@/components/ds/Badge";
import { agreePlurals } from "@/components/ds/format";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ds/Progress";
import type { Tone } from "@/components/ds/styles";
import { Metric, Metrics, Section, StepHeader } from "@/components/project/Step";
import { projectCall, useProject } from "@/components/project/ProjectProvider";
import { STATUS_TONE } from "@/components/project/ProjectShell";
import { ConnAnalysisAction, ConnAnalysisPanel, agentAvailability, missionInfo, useAnalysis, useAnalysisControl } from "@/components/project/ConnAnalysis";
import { ConnConnectionReport, ConnSoftwareSection, ConnTestConnector, connConnectionMetric } from "@/components/project/ConnConnectionPanel";
import { ConnCredentialsSection } from "@/components/project/ConnCredentialsPanel";
import { ConnMissionTechnical } from "@/components/project/ConnMission";
import { ConnResultCallout, connCount, connDate, connRelative, useConnAction, useCredentialErasure } from "@/components/project/ConnShared";
import { journey, nextAction } from "@/components/shell/journey";
import { useReborn } from "@/components/RebornProvider";

/**
 * Étape 1 — Connexion à l'ancien logiciel : état réel de la demande d'analyse et de l'agent,
 * dernier rapport de connexion, identifiants (échéance, suppression immédiate), adresse du
 * logiciel, test réel du connecteur sur le logiciel de test Relatio 2004 (étiqueté).
 * Aucun bouton ne copie une mission ni un jeton.
 */
export default function ConnexionPage() {
  const { id, summary, details, refresh, tick } = useProject();
  const { state } = useReborn();
  const analysis = useAnalysis(id, tick);
  const creds = details?.credentials;
  const erased = useCredentialErasure(id, creds?.stored);
  // Projet déjà plus loin (données reçues, logiciel livré) : la suite du parcours est l'action principale,
  // pas une nouvelle analyse. Calculé comme la barre latérale (mêmes données de l'API).
  const investigations = state?.investigations?.filter((i) => i.project_id === id).length ?? 0;
  const ahead = summary && (summary.data.sources > 0 || !!summary.app) ? nextAction(summary, journey(summary, investigations, details)) : null;
  const next = ahead && ahead.slug !== "connexion" ? { href: `/projets/${id}/${ahead.slug}`, label: ahead.label } : null;
  const control = useAnalysisControl({ projectId: id, analysis, credentialsStored: !!creds?.stored, after: refresh });
  const paused = summary?.status === "PAUSED";
  const conn = connConnectionMetric(details);
  const agent = agentAvailability(analysis);
  const mission = analysis.data?.mission ?? null;
  const info = missionInfo(mission?.status);
  const legacyUrl = summary?.legacy_url ?? null;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step={1}
        title="Connexion à l'ancien logiciel"
        lead="L'agent d'analyse se connecte à votre logiciel avec le compte que vous confiez, puis rapporte ce qu'il fait réellement. Rien n'est affiché comme réussi sans son rapport."
        actions={
          summary ? (
            <ConnAnalysisAction analysis={analysis} control={control} legacyUrl={legacyUrl} paused={paused} importHref={`/projets/${id}/extraction#importer`} discoveryHref={`/projets/${id}/decouverte`} next={next} />
          ) : undefined
        }
      />

      <Metrics className="grid-cols-1! min-[480px]:grid-cols-2! lg:grid-cols-4!">
        <Metric label="Analyse" value={analysis.data ? info.short : analysis.error ? "Inconnue" : "—"} tone={!mission ? undefined : info.tone === "ok" ? "ok" : info.tone === "warn" ? "warn" : info.tone === "bad" ? "bad" : undefined} hint={mission ? `Demandée le ${connDate(mission.created_at)}` : analysis.data ? "Aucune demande" : undefined} />
        <Metric label="Agent d'analyse" value={agent.value} tone={agent.tone} hint={agent.hint} />
        <Metric label="Connexion" value={conn.value} tone={conn.tone} hint={conn.hint} />
        <Metric
          label="Identifiants"
          value={!creds ? "—" : creds.stored ? "Déposés" : erased ? "Effacés" : "Aucun"}
          tone={!creds ? undefined : creds.stored ? "ok" : "muted"}
          hint={!creds ? undefined : creds.stored ? `Supprimés ${connRelative(creds.expires_at) ?? `le ${connDate(creds.expires_at)}`}` : erased ? `Le ${connDate(erased.at)} — ${erased.reason}` : "Requis pour se connecter"}
        />
      </Metrics>

      <ConnAnalysisPanel analysis={analysis} control={control} legacyUrl={legacyUrl} paused={paused} importHref={`/projets/${id}/extraction#importer`} />
      <ConnConnectionReport />
      <ConnCredentialsSection />
      <ConnSoftwareSection />
      <ConnTestConnector />

      <div className="flex flex-col gap-3">
        {details?.authorization ? (
          <Section collapsible title="Autorisation d'accès" description={`Confirmée par ${details.authorization.by} le ${connDate(details.authorization.at)}`}>
            <blockquote className="rounded-control bg-canvas px-4 py-3 text-body leading-relaxed text-text-2 shadow-[inset_2px_0_0_var(--color-accent)]">« {details.authorization.statement} »</blockquote>
            <p className="mt-3 text-small text-text-3">Transmise à l&apos;agent avec sa mission : il agit dans la limite des accès fournis, sans contourner aucune permission.</p>
          </Section>
        ) : details ? (
          <Section collapsible title="Autorisation d'accès" description="Aucune autorisation enregistrée pour ce projet">
            <p className="text-body text-text-2">Projet créé avant cette exigence : l&apos;analyse ne peut pas être demandée sans autorisation enregistrée. Créez un nouveau projet pour la donner.</p>
          </Section>
        ) : null}
        <ProjectFollowUp />
        <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : mission remise à l'agent et protection des identifiants.">
          <ConnMissionTechnical />
        </Section>
      </div>
      {control.dialogs}
    </div>
  );
}

const PILL: Record<string, Tone> = { ok: "ok", warn: "warn", bad: "bad", run: "running", idle: "neutral" };

/** Mise en pause du projet et historique de ses états (traçabilité). */
function ProjectFollowUp() {
  const { id, summary, details, refresh } = useProject();
  const pause = useConnAction();
  const [open, setOpen] = useState(false);
  const paused = summary?.status === "PAUSED";
  const history = details?.status_history ?? [];
  const pausedAt = paused ? history.findLastIndex((h) => h.status === "PAUSED") : -1;
  const pauseEntry = pausedAt >= 0 ? history[pausedAt] : null;
  const restored = pausedAt > 0 ? history[pausedAt - 1] : null;

  async function togglePause() {
    const act = paused ? "resume" : "pause";
    await pause.run(
      act,
      async () => {
        await projectCall(id, "PATCH", `/api/projects/${id}`, { action: act });
      },
      { errorTitle: act === "pause" ? "Mise en pause impossible" : "Reprise impossible", after: refresh },
    );
  }

  const shown = open ? history : history.slice(-8);
  return (
    <Section collapsible title="Suivi du projet" description={details ? `${connCount(history.length, "changement d'état", "changements d'état")} · ${paused ? "projet en pause" : "mise en pause possible"}` : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-[560px] text-body leading-relaxed text-text-2">
          {paused ? `En pause depuis le ${connDate(pauseEntry?.at)}. À la reprise, l'état « ${restored?.label ?? "précédent"} » sera restauré.` : "La pause bloque les opérations du Studio sur ce projet ; un agent déjà en route garde ses rapports."}
        </p>
        <Button variant="secondary" size="sm" icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={togglePause} loading={!!pause.busy} loadingText={paused ? "Reprise…" : "Mise en pause…"} disabled={!summary}>
          {paused ? "Reprendre le projet" : "Mettre en pause"}
        </Button>
      </div>
      <ConnResultCallout result={pause.result} className="mt-3" onClose={() => pause.setResult(null)} />
      <div className="mt-4 border-t border-line pt-1">
        {!details ? (
          <Skeleton lines={3} label="Lecture de l'historique…" />
        ) : history.length === 0 ? (
          <p className="py-3 text-body text-text-3">Aucun changement d&apos;état enregistré.</p>
        ) : (
          <>
            <ol aria-label="Changements d'état, du plus récent au plus ancien">
              {shown
                .map((h, i) => ({ ...h, key: `${h.at}-${i}` }))
                .reverse()
                .map((h) => (
                  <li key={h.key} className="grid gap-x-4 gap-y-1 border-b border-line py-3 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <time dateTime={h.at} className="tabular pt-0.5 text-small text-text-3">
                      {connDate(h.at)}
                    </time>
                    <div className="min-w-0">
                      <StatusBadge tone={PILL[STATUS_TONE[h.status] ?? "idle"]}>{h.label}</StatusBadge>
                      <p className="mt-1 text-body leading-snug break-words text-text-2">{agreePlurals(h.reason)}</p>
                    </div>
                  </li>
                ))}
            </ol>
            {history.length > 8 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                {open ? "Afficher les 8 plus récents" : `Afficher les ${history.length} changements`}
              </Button>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
