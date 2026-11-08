"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Button } from "@/components/ds";
import { Callout, EmptyState, Facts, Metric, Metrics, Section, StepHeader } from "@/components/project/Step";
import { LoadError, Loading, More, StepLink, bytes, count, fmt, mappingIndex, when, type AppState, type BusinessModelVersion, type MappingState, type RunDetail, type RunMeta } from "@/components/project/RunCommon";
import {
  COMMENT_ID,
  ChecksSection,
  DocumentsSection,
  FinancialSection,
  GapsSection,
  RecordsSection,
  RulesChecksSection,
  StateLegend,
  UnverifiedSection,
  VerdictCallout,
  checkState,
  stateCounts,
  unverifiedItems,
} from "@/components/project/RunVerification";
import { RulesHistory } from "@/components/project/RunRulesHistory";
import { ReconciliationSection } from "@/components/project/RunReconciliation";

const code = "font-mono text-small text-ink";

/**
 * Étape 6 · Validation : vérification des données de la dernière exécution terminée
 * (GET /api/migration/runs/[id] → report), présentée par thème avec quatre statuts (VALIDÉ,
 * ÉCART DÉTECTÉ, NON VÉRIFIÉ, INTERVENTION REQUISE), puis décision humaine sur les écarts
 * documentés, calculs rejoués sur l'historique et réconciliation avec le logiciel en service.
 * Rien n'est présenté comme garanti au-delà de ce que le rapport a réellement contrôlé.
 * `?run=RUN_…` (lien « Voir le rapport » de la Livraison) : rapport d'une exécution terminée précise,
 * par exemple celle dont les données sont installées, même si une exécution plus récente existe.
 */
export default function ValidationStepPage() {
  const { id, summary } = useProject();
  const runsQ = useProjectData<RunMeta[]>("/api/migration/runs");
  const mappingQ = useProjectData<MappingState>("/api/migration/mapping");
  const bmQ = useProjectData<{ versions: BusinessModelVersion[] }>("/api/migration/business-model");
  const appQ = useProjectData<AppState>("/api/migration/app");

  const runs = runsQ.data ?? [];
  const latest = runs.at(-1) ?? null;
  const latestCompleted = runs.findLast((r) => r.status === "completed") ?? null;
  // Exécution demandée par l'adresse (?run=), lue dans le navigateur (et à chaque retour arrière)
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setAsked(new URLSearchParams(window.location.search).get("run"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const requested = asked ? (runs.find((r) => r.id === asked && r.status === "completed") ?? null) : null;
  const reportRun = requested ?? latestCompleted;
  const olderReport = !!requested && !!latestCompleted && requested.id !== latestCompleted.id;
  const showLatest = () => {
    setAsked(null);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  };
  const failedAfter = latest?.status === "failed" && !olderReport ? latest : null;

  const detailQ = useProjectData<RunDetail>(reportRun ? `/api/migration/runs/${reportRun.id}` : null);
  const detail = detailQ.data && detailQ.data.meta.id === reportRun?.id ? detailQ.data : null;
  const report = detail?.report ?? null;

  // La réconciliation est rangée avec l'exécution mise en service, qui n'est pas forcément la dernière
  const deployedRunId = appQ.data?.deployment?.run_id ?? null;
  const otherRunId = deployedRunId && deployedRunId !== reportRun?.id ? deployedRunId : null;
  const deployedQ = useProjectData<RunDetail>(otherRunId ? `/api/migration/runs/${otherRunId}` : null);
  const deployedDetail = !deployedRunId ? null : deployedRunId === reportRun?.id ? detail : deployedQ.data && deployedQ.data.meta.id === deployedRunId ? deployedQ.data : null;

  const index = useMemo(() => mappingIndex(mappingQ.data?.current ?? null, report?.entities ?? []), [mappingQ.data, report]);
  const versions = bmQ.data?.versions ?? null;
  // Les pièces jointes ne sont vérifiées que si les correspondances de l'exécution en déclarent
  const hasAttachments = !!report?.checks.some((c) => c.group === "pieces_jointes");
  const unverified = useMemo(() => (report && reportRun ? unverifiedItems(report, { hasAttachments, models: versions, runId: reportRun.id }) : []), [report, reportRun, hasAttachments, versions]);
  const counts = report ? stateCounts(report, unverified.length) : null;

  const base = `/projets/${id}`;
  const reloadReport = async () => {
    await Promise.all([detailQ.reload(), runsQ.reload()]);
  };

  const ack = report?.status === "review" ? (detail?.acknowledged ?? null) : null;
  const pending = report?.status === "review" && !ack;

  /** L'action principale amène à la décision, commentaire prêt à saisir. */
  function goToDecision() {
    const field = document.getElementById(COMMENT_ID);
    if (!field) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
    field.focus({ preventScroll: true });
  }

  // Une seule action principale : la décision à prendre, sinon la suite du parcours (SPEC §10, Step.tsx)
  const accepted = !!report && !olderReport && (report.status === "validated" || !!ack);
  const action = pending ? (
    <Button variant="primary" onClick={goToDecision}>
      Examiner les écarts et décider
    </Button>
  ) : report?.status === "blocked" || (runsQ.data && !runs.length) ? (
    <Button href={`${base}/migration`} variant="primary" icon={<ArrowLeft size={16} />}>
      {runs.length ? "Revenir à la migration" : "Aller à la migration"}
    </Button>
  ) : accepted ? (
    <Button href={summary?.app ? `${base}/livraison` : `${base}/reconstruction`} variant="primary" iconEnd={<ArrowRight size={16} />}>
      {summary?.app ? "Voir la livraison" : "Passer à la reconstruction"}
    </Button>
  ) : null;

  /* Verdict (et exécution interrompue) sous l'en-tête --------------------- */
  const aside =
    failedAfter || report ? (
      <div className="flex flex-col gap-3">
        {olderReport && reportRun && latestCompleted && (
          <Callout
            tone="info"
            title={`Rapport de ${reportRun.id}${deployedRunId === reportRun.id ? ", dont les données sont installées dans le logiciel en service" : ""}.`}
            action={
              <Button size="sm" variant="secondary" onClick={showLatest}>
                Voir le rapport de {latestCompleted.id}
              </Button>
            }
          >
            Une exécution plus récente existe : {latestCompleted.id}.
          </Callout>
        )}
        {failedAfter && (
          <Callout tone="bad" title={`${failedAfter.id} interrompue : rien n'a été vérifié pour elle.`}>
            <p className="break-words">{failedAfter.error ?? "Cause non précisée par le moteur de migration."}</p>
            <p>{reportRun ? `Le rapport ci-dessous porte sur ${reportRun.id}, la dernière exécution terminée.` : "Aucune exécution terminée n'a encore produit de rapport."}</p>
            <StepLink className="mt-1.5" href={`${base}/migration`}>
              Voir la migration
            </StepLink>
          </Callout>
        )}
        {report && detail && <VerdictCallout report={report} detail={detail} unverified={unverified.length} />}
      </div>
    ) : undefined;

  const blocking = report ? report.checks.filter((c) => checkState(c) === "intervention") : [];

  /* Rapport ---------------------------------------------------------------- */
  const main =
    runsQ.loading && !runsQ.data ? (
      <Section title="Vérification des données">
        <Loading label="Chargement des exécutions…" />
      </Section>
    ) : runsQ.error && !runsQ.data ? (
      <LoadError message={runsQ.error} onRetry={() => void runsQ.reload()} />
    ) : !runs.length ? (
      <EmptyState title="Aucune migration exécutée">La vérification démarre à la fin de chaque migration ; son rapport apparaîtra ici.</EmptyState>
    ) : !reportRun ? null : !detail ? (
      detailQ.error ? (
        <LoadError message={detailQ.error} onRetry={() => void detailQ.reload()} title={`Rapport de ${reportRun.id} illisible`} />
      ) : (
        <Section title="Vérification des données" description={reportRun.id}>
          <Loading label="Lecture du rapport de vérification…" />
        </Section>
      )
    ) : !report ? (
      <Callout tone="bad" title={`Aucun rapport de vérification enregistré pour ${reportRun.id}.`}>
        Relancez la migration pour produire une nouvelle vérification.
      </Callout>
    ) : (
      <>
        {blocking.length > 0 && (
          <Callout tone="bad" title={`À corriger avant toute mise en service : ${blocking.map((c) => c.label).join(" · ")}`}>
            Corrigez la cause (données récupérées ou correspondances), puis relancez la migration : une nouvelle vérification sera faite.
          </Callout>
        )}
        <FinancialSection report={report} index={index} />
        <RecordsSection report={report} detail={detail} index={index} />
        <DocumentsSection report={report} />
        <RulesChecksSection report={report}>
          <RulesHistory versions={versions} loading={bmQ.loading} error={bmQ.error} onReload={bmQ.reload} index={index} lastCompleted={reportRun.id} reconstructionHref={`${base}/reconstruction`} />
        </RulesChecksSection>
        <UnverifiedSection items={unverified} />
        <GapsSection report={report} detail={detail} index={index} projectId={id} onChanged={reloadReport} />
      </>
    );

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        step={6}
        title="Validation"
        lead="Vérification des données : chaque fiche migrée est relue et comparée à l'ancien logiciel. Seul ce qui a été réellement contrôlé est déclaré conforme."
        aside={aside}
        actions={action}
      />

      <div className="flex flex-col gap-2">
        {/* Les quatre chiffres s'additionnent au nombre de contrôles du rapport ; les écarts documentés sont une autre liste. */}
        <Metrics>
          <Metric label="Contrôles validés" value={counts ? fmt(counts.validated) : "—"} tone={!counts ? "muted" : counts.validated ? "ok" : undefined} hint={counts ? `sur ${count(counts.total, "contrôle", "contrôles")}` : undefined} />
          <Metric
            label="Contrôles avec écart"
            value={counts ? fmt(counts.gap) : "—"}
            tone={!counts ? "muted" : counts.gap && !ack ? "warn" : undefined}
            hint={counts && report ? `${count(report.gaps.length, "écart documenté", "écarts documentés")}${ack ? ", acceptés" : report.gaps.length ? ", à examiner" : ""}` : undefined}
          />
          <Metric
            label="Contrôles non vérifiés"
            value={counts ? fmt(counts.unverified) : "—"}
            tone={!counts ? "muted" : undefined}
            hint={counts ? (counts.others ? `+ ${count(counts.others, "autre élément non vérifié", "autres éléments non vérifiés")}, hors contrôles` : counts.unverified ? "ni garantis ni infirmés" : "tout a été comparé") : undefined}
          />
          <Metric label="Contrôles bloquants en échec" value={counts ? fmt(counts.intervention) : "—"} tone={!counts ? "muted" : counts.intervention ? "bad" : "ok"} hint={counts ? (counts.intervention ? "mise en service refusée" : "aucun") : undefined} />
        </Metrics>
        {report && (
          <More label="Que signifient ces statuts ?">
            <StateLegend />
          </More>
        )}
      </div>

      {main}

      <div className="flex flex-col gap-3">
        {report && <ChecksSection report={report} />}

        <ReconciliationSection
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

        <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : base vérifiée et portée exacte du rapport.">
          <Facts
            items={[
              { label: "Rapport de vérification", value: <code className={code}>GET /api/migration/runs/{report?.run_id ?? "{id}"}</code> },
              { label: "Acceptation des écarts", value: <code className={code}>POST /api/migration/runs/{report?.run_id ?? "{id}"}/acknowledge</code> },
              { label: "Rejeu du modèle métier", value: <code className={code}>POST /api/migration/business-model/check</code> },
              { label: "Réconciliation", value: <code className={code}>POST /api/migration/reconcile</code> },
              { label: "Base vérifiée", value: report ? [report.target, bytes(report.database.bytes), report.database.integrity].filter(Boolean).join(" · ") : "—" },
              { label: "Vérifiée le", value: report ? when(report.verified_at) : "—" },
              { label: "Portée enregistrée dans le rapport", value: report ? report.statement : "—" },
              { label: "Empreinte SHA-256", value: report ? <code className={`${code} break-all`}>{report.database.sha256}</code> : "—" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
