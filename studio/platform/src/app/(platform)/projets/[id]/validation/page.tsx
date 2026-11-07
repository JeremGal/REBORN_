"use client";

import { useMemo } from "react";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Empty, Panel } from "@/components/ui";
import {
  LoadError,
  Loading,
  Notice,
  StepLink,
  mappingIndex,
  type AppState,
  type BusinessModelVersion,
  type MappingState,
  type RunDetail,
  type RunMeta,
} from "@/components/project/RunCommon";
import { ChecksPanel, ComparisonPanel, FeaturesPanel, GapsPanel, VerdictPanel } from "@/components/project/RunVerification";
import { RulesHistoryPanel } from "@/components/project/RunRulesHistory";
import { ReconciliationPanel } from "@/components/project/RunReconciliation";

const GAPS_ANCHOR = "ecarts-documentes";

/**
 * Étape 6 · Validation : rapport de vérification indépendante de la dernière exécution terminée
 * (GET /api/migration/runs/[id] → report), acceptation des écarts documentés, règles métier
 * rejouées sur l'historique et réconciliation avec le logiciel en service.
 */
export default function ValidationStepPage() {
  const { id } = useProject();
  const runsQ = useProjectData<RunMeta[]>("/api/migration/runs");
  const mappingQ = useProjectData<MappingState>("/api/migration/mapping");
  const bmQ = useProjectData<{ versions: BusinessModelVersion[] }>("/api/migration/business-model");
  const appQ = useProjectData<AppState>("/api/migration/app");

  const runs = runsQ.data ?? [];
  const latest = runs.at(-1) ?? null;
  const reportRun = runs.findLast((r) => r.status === "completed") ?? null;
  const failedAfter = latest?.status === "failed" ? latest : null;

  const detailQ = useProjectData<RunDetail>(reportRun ? `/api/migration/runs/${reportRun.id}` : null);
  const detail = detailQ.data && detailQ.data.meta.id === reportRun?.id ? detailQ.data : null;
  const report = detail?.report ?? null;

  // La réconciliation est rangée avec l'exécution mise en service, qui n'est pas forcément la dernière
  const deployedRunId = appQ.data?.deployment?.run_id ?? null;
  const otherRunId = deployedRunId && deployedRunId !== reportRun?.id ? deployedRunId : null;
  const deployedQ = useProjectData<RunDetail>(otherRunId ? `/api/migration/runs/${otherRunId}` : null);
  const deployedDetail = !deployedRunId
    ? null
    : deployedRunId === reportRun?.id
      ? detail
      : deployedQ.data && deployedQ.data.meta.id === deployedRunId
        ? deployedQ.data
        : null;

  const index = useMemo(() => mappingIndex(mappingQ.data?.current ?? null, report?.entities ?? []), [mappingQ.data, report]);
  const versions = bmQ.data?.versions ?? null;
  const bmRef = useMemo(() => {
    const checked = (versions ?? []).filter((v) => v.history_check);
    return checked.findLast((v) => v.status === "validated") ?? checked.at(-1) ?? null;
  }, [versions]);

  const base = `/projets/${id}`;
  const reloadReport = async () => {
    await Promise.all([detailQ.reload(), runsQ.reload()]);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="min-w-0 max-w-[820px]">
        <p className="eyebrow">Étape 6 · Validation</p>
        <h2 className="mt-1 text-[20px] leading-tight font-black tracking-[-0.02em]">Contrôles indépendants sur les vraies données</h2>
        <p className="mt-1 text-[13px] text-sediment">
          À la fin de chaque migration, REBORN relit les fichiers extraits de l&apos;ancien logiciel et la nouvelle base, puis compare volumes, valeurs, relations, montants et pièces jointes. Aucun
          score n&apos;est déclaré : chaque contrôle compte ce qu&apos;il a réellement lu.
        </p>
      </header>

      {runsQ.loading && !runsQ.data ? (
        <Panel title="Rapport de vérification">
          <Loading label="Chargement des exécutions…" />
        </Panel>
      ) : runsQ.error && !runsQ.data ? (
        <LoadError message={runsQ.error} onRetry={() => void runsQ.reload()} />
      ) : !runs.length ? (
        <Empty title="Aucune migration exécutée" hint="La vérification indépendante démarre automatiquement à la fin de chaque migration ; son rapport apparaîtra ici.">
          <StepLink href={`${base}/migration`}>Aller à la migration</StepLink>
        </Empty>
      ) : (
        <>
          {failedAfter && (
            <Notice tone="bad" title={`La dernière exécution, ${failedAfter.id}, a été interrompue : rien n'a été vérifié pour elle`}>
              <p className="break-words">{failedAfter.error ?? "Cause non précisée par le moteur de migration."}</p>
              <p className="text-sediment">
                Sa transaction a été annulée : aucune donnée partielle n&apos;a été conservée.{" "}
                {reportRun ? `Le rapport ci-dessous est celui de ${reportRun.id}, la dernière exécution terminée.` : "Aucune exécution terminée n'a encore produit de rapport."}
              </p>
              <div>
                <StepLink href={`${base}/migration`}>Voir l&apos;exécution interrompue</StepLink>
              </div>
            </Notice>
          )}

          {!reportRun ? null : !detail ? (
            detailQ.error ? (
              <LoadError message={detailQ.error} onRetry={() => void detailQ.reload()} title={`Rapport de ${reportRun.id} illisible`} />
            ) : (
              <Panel eyebrow={`Vérification indépendante · ${reportRun.id}`} title="Chargement du rapport">
                <Loading label="Lecture du rapport de vérification…" />
              </Panel>
            )
          ) : !report ? (
            <Notice tone="bad" title={`Aucun rapport de vérification enregistré pour ${reportRun.id}`}>
              <p>L&apos;exécution est terminée mais son rapport est introuvable : relancez la migration pour produire une nouvelle vérification.</p>
            </Notice>
          ) : (
            <>
              <VerdictPanel report={report} detail={detail} gapsAnchor={GAPS_ANCHOR} />
              <ComparisonPanel report={report} detail={detail} index={index} projectId={id} migrationHref={`${base}/migration`} />
              <FeaturesPanel report={report} detail={detail} index={index} bm={bmRef} latestRunId={report.run_id} />
              <GapsPanel report={report} detail={detail} index={index} anchorId={GAPS_ANCHOR} migrationHref={`${base}/migration`} onChanged={reloadReport} />
              <ChecksPanel report={report} />
            </>
          )}
        </>
      )}

      <RulesHistoryPanel
        versions={versions}
        loading={bmQ.loading}
        error={bmQ.error}
        onReload={bmQ.reload}
        index={index}
        lastCompleted={reportRun?.id ?? null}
        reconstructionHref={`${base}/reconstruction`}
      />

      <ReconciliationPanel
        app={appQ.data}
        appLoading={appQ.loading}
        appError={appQ.error}
        onReloadApp={appQ.reload}
        deployed={deployedDetail}
        deployedError={otherRunId ? deployedQ.error : detailQ.error}
        onReloadDeployed={otherRunId ? deployedQ.reload : detailQ.reload}
        index={index}
        livraisonHref={`${base}/livraison`}
      />
    </div>
  );
}
