"use client";

import { useState } from "react";
import { ArrowRight, Play, RotateCcw } from "lucide-react";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Button, ConfirmationDialog, Progress } from "@/components/ds";
import { Callout, EmptyState, Facts, Metric, Metrics, Section, StepHeader, TestBadge } from "@/components/project/Step";
import {
  LoadError,
  Loading,
  MAPPING_ORIGIN,
  StepLink,
  Tag,
  VERDICT,
  count,
  fmt,
  readableError,
  share,
  type MappingState,
  type MappingVersion,
  type RunDetail,
  type RunMeta,
  type RunStart,
} from "@/components/project/RunCommon";
import { RunHistoryList, RunJournal } from "@/components/project/RunHistory";
import { RESULT_ANCHOR, RunDuplicates, RunIssues, RunRejections, RunResult } from "@/components/project/RunLedger";

type Outcome = { kind: "done"; run: RunMeta; report: RunStart["report"] } | { kind: "error"; message: string };

/**
 * Lignes lues par l'exécution (tables reprises) et lignes reçues qui n'en font pas partie, d'après l'exécution
 * elle-même : index des pièces jointes (rattachées aux fiches comme documents) et tables sans correspondance
 * (écarts « table non reprise » du rapport). Explique l'écart avec les « lignes reçues » de l'étape (V17, PR-07).
 */
function sourceRowsHint(detail: RunDetail): string {
  const parts = [`lues dans ${count(detail.entities.length, "table reprise", "tables reprises")}`];
  const index = detail.attachments.expected;
  if (index) parts.push(`+ ${count(index, "ligne", "lignes")} d'index des pièces jointes (documents rattachés aux fiches)`);
  const left = (detail.report?.gaps ?? []).filter((g) => g.kind === "unmapped_table");
  const rows = left.reduce((n, g) => n + (g.count ?? 0), 0);
  if (rows) parts.push(`+ ${count(rows, "ligne", "lignes")} sans correspondance (${left.map((g) => g.source).filter(Boolean).join(", ")}), non migrées`);
  return parts.join(" ; ");
}

/** Origine des correspondances, en clair (le jeu de test est signalé à part par <TestBadge>). */
const ORIGIN_SHORT: Record<MappingVersion["origin"], string | null> = {
  fixture: null,
  analyst: "reçues de l'Analyste",
  auto: "proposition automatique",
  user: "corrigées à la main",
};

const code = "font-mono text-small text-ink";

/**
 * Étape 5 · Migration : construit la nouvelle base à partir des fichiers récupérés et des
 * correspondances validées (POST /api/migration/runs, appel synchrone : aucune progression n'est
 * inventée, l'attente est affichée comme telle), puis montre ce qui a réellement été transféré,
 * rejeté ou signalé pour chaque exécution.
 */
export default function MigrationStepPage() {
  const { id, summary, post } = useProject();
  const mappingQ = useProjectData<MappingState>("/api/migration/mapping");
  const runsQ = useProjectData<RunMeta[]>("/api/migration/runs");
  const [picked, setPicked] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Logiciel déjà livré : relancer crée une exécution qui devra être revérifiée ; on le dit avant (PR-17)
  const [confirmRelaunch, setConfirmRelaunch] = useState(false);
  const deployed = summary?.app ?? null;

  const runs = runsQ.data ?? [];
  const latest = runs.at(-1) ?? null;
  const lastCompleted = runs.findLast((r) => r.status === "completed") ?? null;
  const selectedId = picked && runs.some((r) => r.id === picked) ? picked : (latest?.id ?? null);
  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const detailQ = useProjectData<RunDetail>(selectedId ? `/api/migration/runs/${selectedId}` : null);
  const detail = detailQ.data && detailQ.data.meta.id === selectedId ? detailQ.data : null;

  const plan = mappingQ.data;
  const mapping = plan?.current ?? null;
  const canRun = !!plan?.status.can_run;
  const blockers = plan ? (canRun ? [] : plan.status.blockers.length ? plan.status.blockers : ["Aucune donnée reçue : récupérez d'abord les données de l'ancien logiciel."]) : [];
  const base = `/projets/${id}`;

  async function launch() {
    setRunning(true);
    setOutcome(null);
    try {
      const r = await post<RunStart>("/api/migration/runs", {});
      setPicked(null);
      setOutcome({ kind: "done", run: r.run, report: r.report });
    } catch (e) {
      setOutcome({ kind: "error", message: readableError(e) });
    } finally {
      setRunning(false);
      await Promise.all([runsQ.reload(), mappingQ.reload()]);
    }
  }

  /** Choix d'une exécution dans l'historique : son résultat s'affiche en haut de page. */
  function select(rid: string) {
    setPicked(rid === latest?.id ? null : rid);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => document.getElementById(RESULT_ANCHOR)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }));
  }

  /* Action principale ------------------------------------------------- */
  const launchButton = (
    <Button
      variant={latest?.status === "completed" ? "secondary" : "primary"}
      onClick={() => (deployed && latest ? setConfirmRelaunch(true) : void launch())}
      disabled={!canRun || running || (runsQ.loading && !runsQ.data)}
      loading={running}
      loadingText="Migration en cours…"
      icon={latest ? <RotateCcw size={16} /> : <Play size={16} />}
      aria-describedby={blockers.length ? "migration-blockers" : undefined}
      title={latest ? "Chaque exécution repart d'une base neuve ; le logiciel déjà en service n'est pas modifié." : undefined}
    >
      {latest ? "Relancer la migration" : "Lancer la migration"}
    </Button>
  );
  const nextButton =
    latest?.status === "completed" && !running ? (
      <Button href={`${base}/validation`} variant="primary" iconEnd={<ArrowRight size={16} />}>
        Examiner la vérification
      </Button>
    ) : null;

  /* Contexte et retour de l'action (sous l'en-tête) ---------------------- */
  const done = outcome?.kind === "done" ? outcome : null;
  const doneTone = done?.report ? VERDICT[done.report.status].tone : "info";
  const hasAside = !!mapping || !!(mappingQ.error && !plan) || (!!plan && !canRun) || running || !!outcome;
  const aside = hasAside && (
    <div className="flex flex-col gap-3">
      {mapping && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-text-2">
          <span>
            Correspondances <b className="font-semibold text-ink">v{mapping.version}</b> vers <b className="font-semibold text-ink">{mapping.mapping.target.name}</b>
            {ORIGIN_SHORT[mapping.origin] ? ` · ${ORIGIN_SHORT[mapping.origin]}` : ""}
          </span>
          {mapping.origin === "fixture" && <TestBadge />}
        </p>
      )}

      {mappingQ.error && !plan && <LoadError message={mappingQ.error} onRetry={() => void mappingQ.reload()} title="Prérequis de la migration illisibles" />}

      {plan && !canRun && !running && (
        <Callout tone="warn" title="Migration impossible pour l'instant">
          <ul id="migration-blockers" className="flex flex-col gap-0.5">
            {blockers.map((b) => (
              <li key={b} className="break-words">
                {b}
              </li>
            ))}
          </ul>
          {summary?.data.sources ? (
            <StepLink className="mt-1.5" href={`${base}/correspondances`}>
              Ouvrir les correspondances
            </StepLink>
          ) : (
            <StepLink className="mt-1.5" href={`${base}/extraction`}>
              Récupérer les données
            </StepLink>
          )}
        </Callout>
      )}

      {running && (
        <div className="rounded-panel bg-surface px-4 py-3.5 ring-1 ring-line">
          <Progress label="Migration en cours" />
          <p className="mt-2 text-small leading-relaxed text-text-2">
            Copie des données dans une base neuve, puis vérification indépendante de chaque fiche. La durée dépend du volume ; aucune estimation n&apos;est affichée. Le résultat apparaît ici dès la
            fin, sans recharger la page.
          </p>
        </div>
      )}
      {outcome?.kind === "error" && (
        <Callout tone="bad" title="La migration n'a pas abouti.">
          <p className="break-words">{outcome.message}</p>
        </Callout>
      )}
      {done?.run.status === "failed" && (
        <Callout tone="bad" title={`${done.run.id} interrompue : aucune donnée partielle n'a été conservée.`}>
          <p className="break-words">{done.run.error ?? "Cause non précisée par le moteur de migration."}</p>
        </Callout>
      )}
      {done?.run.status === "completed" && (
        <Callout
          tone={doneTone === "ok" || doneTone === "warn" || doneTone === "bad" ? doneTone : "info"}
          title={`${done.run.id} terminée : ${count(done.run.summary.imported, "fiche transférée", "fiches transférées")}, ${count(done.run.summary.rejected, "ligne rejetée", "lignes rejetées")}.`}
        >
          <p>
            {done.report
              ? `Vérification : ${VERDICT[done.report.status].label.toLowerCase()} (${count(done.report.checks, "contrôle", "contrôles")}). Le détail, statut par statut, est à l'étape Validation.`
              : "Aucun rapport de vérification n'a été produit."}
          </p>
          <StepLink className="mt-1.5" href={`${base}/validation`}>
            Voir la vérification
          </StepLink>
        </Callout>
      )}
    </div>
  );

  /* Chiffres de l'exécution affichée --------------------------------- */
  const s = selected?.summary;
  const flagged = detail ? detail.entities.reduce((n, e) => n + e.conversion_issues + e.unlinked, 0) + (detail.duplicates?.length ?? 0) : null;
  const metrics = !selected ? (
    <Metrics>
      <Metric
        label="Lignes reçues"
        value={summary?.data.source_rows ? fmt(summary.data.source_rows) : "—"}
        hint={summary ? (summary.data.sources ? `dans ${count(summary.data.sources, "fichier récupéré", "fichiers récupérés")} ; seules les tables reprises dans les correspondances seront migrées` : "aucun fichier reçu") : undefined}
        tone={summary?.data.source_rows ? undefined : "muted"}
      />
      <Metric label="Transférées" value="—" tone="muted" hint="pas encore de migration" />
      <Metric label="Rejetées" value="—" tone="muted" />
      <Metric label="Anomalies" value="—" tone="muted" />
    </Metrics>
  ) : selected.status === "failed" || !s ? (
    <Metrics>
      <Metric label="Lignes sources" value="—" tone="muted" hint={`${selected.id} interrompue`} />
      <Metric label="Transférées" value="—" tone="muted" hint="aucune donnée conservée" />
      <Metric label="Rejetées" value="—" tone="muted" />
      <Metric label="Anomalies" value="—" tone="muted" />
    </Metrics>
  ) : (
    <Metrics>
      <Metric label="Lignes sources" value={fmt(s.source_rows)} hint={detail ? sourceRowsHint(detail) : selected.id} />
      <Metric label="Transférées" value={fmt(s.imported)} hint={s.source_rows ? `${share(s.imported, s.source_rows)} des lignes sources` : undefined} tone={s.imported === s.source_rows ? "ok" : undefined} />
      <Metric label="Rejetées" value={fmt(s.rejected)} tone={s.rejected ? "warn" : undefined} hint={s.rejected ? "motifs détaillés plus bas" : "aucun rejet"} />
      <Metric
        label="Anomalies"
        value={flagged === null ? "—" : fmt(flagged)}
        tone={flagged ? "warn" : undefined}
        hint={detail ? (flagged ? "valeurs signalées et doublons possibles" : "aucune valeur signalée") : undefined}
      />
    </Metrics>
  );

  /* Résultat de l'exécution affichée --------------------------------- */
  const result =
    runsQ.loading && !runsQ.data ? (
      <Section title="Résultat de la migration">
        <Loading label="Chargement des exécutions…" />
      </Section>
    ) : runsQ.error && !runsQ.data ? (
      <LoadError message={runsQ.error} onRetry={() => void runsQ.reload()} />
    ) : !runs.length ? (
      <EmptyState title="Aucune migration lancée">Le résultat par table, les rejets et leurs motifs apparaîtront ici.</EmptyState>
    ) : !detail ? (
      detailQ.error ? (
        <LoadError message={detailQ.error} onRetry={() => void detailQ.reload()} title={`Détail de ${selectedId} illisible`} />
      ) : (
        <Section id={RESULT_ANCHOR} className="scroll-mt-24" title="Résultat de la migration" description={selectedId ?? undefined}>
          <Loading label="Lecture du résultat de l'exécution…" />
        </Section>
      )
    ) : (
      <RunResult
        detail={detail}
        latestId={latest?.id ?? null}
        projectId={id}
        validationHref={detail.meta.id === lastCompleted?.id ? `${base}/validation` : null}
        onShowLatest={() => setPicked(null)}
      />
    );

  /* Annonce aux lecteurs d'écran (région toujours présente, pour être lue à chaque changement) */
  const announce = running
    ? "Migration en cours."
    : outcome?.kind === "error"
      ? `La migration n'a pas abouti : ${outcome.message}`
      : done
        ? done.run.status === "failed"
          ? `${done.run.id} interrompue : aucune donnée partielle n'a été conservée.`
          : `${done.run.id} terminée : ${count(done.run.summary.imported, "fiche transférée", "fiches transférées")}, ${count(done.run.summary.rejected, "ligne rejetée", "lignes rejetées")}.`
        : "";

  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <StepHeader
        step={5}
        title="Migration"
        lead="Vos données sont copiées dans une base neuve selon les correspondances validées, puis chaque fiche est revérifiée."
        aside={aside}
        actions={
          nextButton ? (
            <>
              {nextButton}
              {launchButton}
            </>
          ) : (
            launchButton
          )
        }
      />
      <ConfirmationDialog
        open={confirmRelaunch}
        onClose={() => setConfirmRelaunch(false)}
        onConfirm={async () => {
          setConfirmRelaunch(false);
          await launch();
        }}
        title="Relancer la migration ?"
        confirmLabel="Relancer la migration"
        pendingLabel="Migration en cours…"
      >
        Le logiciel en service garde ses données ({deployed?.run_id}) : rien n&apos;y change. La nouvelle exécution sera vérifiée, et ses écarts devront être examinés à
        nouveau avant toute nouvelle mise en service.
      </ConfirmationDialog>

      {metrics}

      {result}

      <div className="flex flex-col gap-3">
        {detail?.meta.status === "completed" && (
          <>
            <RunRejections detail={detail} />
            <RunIssues detail={detail} />
            <RunDuplicates detail={detail} />
          </>
        )}

        {runs.length > 1 && (
          <Section collapsible title="Historique des exécutions" badge={<Tag tone="idle" plain>{fmt(runs.length)}</Tag>}>
            <RunHistoryList runs={runs} selected={selectedId} onSelect={select} />
          </Section>
        )}

        <Section collapsible title="Journal de migration">
          {summary ? <RunJournal since={summary.created_at} /> : <Loading label="Chargement du journal…" />}
        </Section>

        <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : déroulement et empreinte de la base.">
          <Facts
            items={[
              {
                label: "Lancement",
                value: (
                  <>
                    <code className={code}>POST /api/migration/runs</code> — synchrone : import puis vérification indépendante
                  </>
                ),
              },
              { label: "Détail d'une exécution", value: <code className={code}>GET /api/migration/runs/{"{id}"}</code> },
              { label: "Rapport d'écarts (CSV)", value: <code className={code}>GET /api/migration/runs/{"{id}"}/rejects</code> },
              { label: "Transaction", value: "Une par exécution : en cas d'échec, rien n'est conservé ; le logiciel en service n'est pas modifié." },
              {
                label: "Correspondances",
                value: mapping ? `v${mapping.version} · ${MAPPING_ORIGIN[mapping.origin] ?? mapping.origin} · cible ${mapping.mapping.target.id}` : "Aucune correspondance reçue",
              },
              {
                label: "Empreinte de la base (SHA-256)",
                value: detail?.db_sha256 ? <code className={`${code} break-all`}>{detail.db_sha256}</code> : "—",
              },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
