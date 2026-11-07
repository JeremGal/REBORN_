"use client";

import { useState } from "react";
import { LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Button, Empty, Panel, cx } from "@/components/ui";
import {
  LoadError,
  Loading,
  MAPPING_ORIGIN,
  Notice,
  StepLink,
  VERDICT,
  count,
  fmt,
  readableError,
  type MappingState,
  type RunDetail,
  type RunMeta,
  type RunStart,
} from "@/components/project/RunCommon";
import { RunHistoryList, RunJournal } from "@/components/project/RunHistory";
import { RunDuplicates, RunIssues, RunOverview, RunRejections } from "@/components/project/RunLedger";

type Outcome = { kind: "done"; run: RunMeta; report: RunStart["report"] } | { kind: "error"; message: string };

/**
 * Étape 5 · Migration : construit la nouvelle base à partir des fichiers extraits et des
 * correspondances validées (POST /api/migration/runs, appel synchrone), puis montre ce qui a
 * réellement été importé, rejeté ou signalé pour chaque exécution.
 */
export default function MigrationStepPage() {
  const { id, summary, post } = useProject();
  const mappingQ = useProjectData<MappingState>("/api/migration/mapping");
  const runsQ = useProjectData<RunMeta[]>("/api/migration/runs");
  const [picked, setPicked] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const runs = runsQ.data ?? [];
  const latest = runs.at(-1) ?? null;
  const lastCompleted = runs.findLast((r) => r.status === "completed") ?? null;
  const selectedId = picked && runs.some((r) => r.id === picked) ? picked : (latest?.id ?? null);
  const detailQ = useProjectData<RunDetail>(selectedId ? `/api/migration/runs/${selectedId}` : null);
  const detail = detailQ.data && detailQ.data.meta.id === selectedId ? detailQ.data : null;

  const plan = mappingQ.data;
  const mapping = plan?.current ?? null;
  const canRun = !!plan?.status.can_run;
  const blockers = plan ? (canRun ? [] : plan.status.blockers.length ? plan.status.blockers : ["Aucune source de données reçue : récupérez d'abord les données de l'ancien logiciel."]) : [];
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

  return (
    <div className="flex flex-col gap-5">
      {/* Lancement ------------------------------------------------------- */}
      <section className="card px-4 py-4 sm:px-5" aria-labelledby="migration-title">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-[760px]">
            <p className="eyebrow">Étape 5 · Migration</p>
            <h2 id="migration-title" className="mt-1 text-[20px] leading-tight font-black tracking-[-0.02em]">
              Construire la nouvelle base avec les données historiques
            </h2>
            <p className="mt-1 text-[13px] text-sediment">
              Les fichiers extraits de l&apos;ancien logiciel sont relus, transformés selon les correspondances validées et importés dans une base neuve, dans l&apos;ordre de leurs dépendances.
              Chaque enregistrement garde la trace de sa ligne d&apos;origine ; la vérification indépendante démarre automatiquement à la fin de l&apos;import.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <Button
              variant="accent"
              onClick={() => void launch()}
              disabled={!canRun || running || (runsQ.loading && !runsQ.data)}
              aria-describedby={blockers.length ? "migration-blockers" : undefined}
            >
              {running ? (
                <>
                  <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> Migration en cours…
                </>
              ) : latest ? (
                <>
                  <RotateCcw size={14} aria-hidden /> Relancer la migration
                </>
              ) : (
                <>
                  <Play size={14} aria-hidden /> Lancer la migration
                </>
              )}
            </Button>
            {mappingQ.loading && !plan && <span className="text-[11.5px] text-silt">Vérification des prérequis…</span>}
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line pt-3 text-[12.5px] sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11.5px] text-silt">Correspondances appliquées</dt>
            <dd className="text-ink">
              {mapping ? (
                <>
                  <b>v{mapping.version}</b> · {MAPPING_ORIGIN[mapping.origin] ?? mapping.origin} · vers <b>{mapping.mapping.target.name}</b>
                </>
              ) : plan ? (
                "Aucune correspondance reçue"
              ) : (
                "…"
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11.5px] text-silt">Données sources</dt>
            <dd className="tabular text-ink">
              {summary ? (summary.data.sources ? `${count(summary.data.sources, "fichier source", "fichiers sources")} · ${count(summary.data.source_rows, "ligne reçue", "lignes reçues")}` : "Aucun fichier reçu") : "…"}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-col gap-2.5" aria-live="polite">
          {mappingQ.error && !plan && <LoadError message={mappingQ.error} onRetry={() => void mappingQ.reload()} title="Prérequis de la migration illisibles" />}

          {plan && !canRun && !running && (
            <div id="migration-blockers">
              <Notice tone="warn" title="Migration impossible pour l'instant">
                <ul className="flex flex-col gap-0.5">
                  {blockers.map((b) => (
                    <li key={b} className="break-words">
                      — {b}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {summary?.data.sources ? <StepLink href={`${base}/correspondances`}>Ouvrir les correspondances</StepLink> : <StepLink href={`${base}/extraction`}>Récupérer les données</StepLink>}
                </div>
              </Notice>
            </div>
          )}

          {running && (
            <div role="status" className="flex items-start gap-2.5 rounded-md bg-[#e7eef8] px-3 py-2.5 text-[12.5px] text-ink">
              <span aria-hidden className="live-dot mt-[5px] size-2 shrink-0 rounded-full bg-[#2457a6]" />
              <div className="min-w-0">
                <p className="font-bold text-[#2457a6]">Migration en cours</p>
                <p>
                  REBORN relit les fichiers extraits, importe les enregistrements dans une nouvelle base (une seule transaction), puis lance la vérification indépendante. L&apos;opération est
                  synchrone : le résultat s&apos;affiche dès qu&apos;elle est terminée.
                </p>
              </div>
            </div>
          )}

          {outcome?.kind === "error" && (
            <Notice tone="bad" title="La migration n'a pas abouti">
              <p className="break-words">{outcome.message}</p>
            </Notice>
          )}
          {outcome?.kind === "done" && outcome.run.status === "failed" && (
            <Notice tone="bad" title={`${outcome.run.id} interrompue : transaction annulée, aucune donnée partielle conservée`}>
              <p className="break-words">{outcome.run.error ?? "Cause non précisée par le moteur de migration."}</p>
              <p className="text-sediment">Corrigez la cause puis relancez : la prochaine exécution repartira d&apos;une base vide.</p>
            </Notice>
          )}
          {outcome?.kind === "done" && outcome.run.status === "completed" && (
            <Notice
              tone={outcome.report ? (VERDICT[outcome.report.status].tone === "ok" ? "ok" : VERDICT[outcome.report.status].tone === "warn" ? "warn" : "bad") : "info"}
              title={`${outcome.run.id} terminée : ${count(outcome.run.summary.imported, "enregistrement importé", "enregistrements importés")}, ${count(outcome.run.summary.rejected, "ligne rejetée", "lignes rejetées")}`}
            >
              <p>
                {outcome.report
                  ? `Vérification indépendante : ${VERDICT[outcome.report.status].label.toLowerCase()} · ${count(outcome.report.failed, "contrôle en échec", "contrôles en échec")} sur ${fmt(outcome.report.checks)}.`
                  : "Aucun rapport de vérification n'a été produit."}
              </p>
              <div>
                <StepLink href={`${base}/validation`}>Examiner la vérification</StepLink>
              </div>
            </Notice>
          )}

          <p className="text-[12px] text-silt">
            {latest && <b className="font-bold text-sediment">Relancer après correction. </b>}
            Chaque exécution reconstruit une base neuve en une seule transaction. Si elle échoue, rien n&apos;est conservé : jamais de données partielles. Les exécutions précédentes restent
            consultables et le logiciel déjà en service n&apos;est pas modifié (la mise en service se fait à l&apos;étape Livraison).
          </p>
        </div>
      </section>

      {/* Détail + historique -------------------------------------------- */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {runsQ.loading && !runsQ.data ? (
            <Panel title="Dernière exécution">
              <Loading label="Chargement des exécutions…" />
            </Panel>
          ) : runsQ.error && !runsQ.data ? (
            <LoadError message={runsQ.error} onRetry={() => void runsQ.reload()} />
          ) : !runs.length ? (
            <Empty
              title="Aucune exécution pour l'instant"
              hint="Lancez la migration une fois les correspondances validées : le détail par entité, les rejets et leurs motifs, les valeurs signalées et les doublons apparaîtront ici."
            />
          ) : !detail ? (
            detailQ.error ? (
              <LoadError message={detailQ.error} onRetry={() => void detailQ.reload()} title={`Détail de ${selectedId} illisible`} />
            ) : (
              <Panel eyebrow={selectedId ? `Exécution ${selectedId}` : undefined} title="Chargement du détail">
                <Loading label="Lecture du résultat de l'exécution…" />
              </Panel>
            )
          ) : (
            <>
              <RunOverview
                detail={detail}
                latestId={latest?.id ?? null}
                validationHref={detail.meta.id === lastCompleted?.id ? `${base}/validation` : null}
                onShowLatest={() => setPicked(null)}
              />
              {detail.meta.status === "completed" && (
                <>
                  <RunRejections detail={detail} projectId={id} />
                  <div className="grid gap-5 xl:grid-cols-2">
                    <RunIssues detail={detail} />
                    <RunDuplicates detail={detail} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5" aria-label="Historique et journal">
          <Panel eyebrow="Historique" title={runs.length ? count(runs.length, "exécution", "exécutions") : "Exécutions"} bodyClassName={cx(runs.length ? "px-0 pb-1" : undefined)}>
            {runs.length ? (
              <>
                <RunHistoryList runs={runs} selected={selectedId} onSelect={(rid) => setPicked(rid === latest?.id ? null : rid)} />
              </>
            ) : runsQ.loading ? (
              <Loading />
            ) : (
              <p className="text-[12.5px] text-sediment">Les exécutions apparaîtront ici, avec leur résultat et leur vérification.</p>
            )}
          </Panel>
          <Panel eyebrow="Journal d'exécution" title="Évènements de migration">
            {summary ? <RunJournal since={summary.created_at} /> : <Loading label="Chargement du journal…" />}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
