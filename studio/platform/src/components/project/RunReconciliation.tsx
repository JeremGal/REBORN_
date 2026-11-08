"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, cx } from "@/components/ds";
import { Callout, EmptyState, Section } from "./Step";
import {
  CHECK_LABEL,
  CHECK_TONE,
  LoadError,
  Loading,
  StepLink,
  T,
  TONE_TEXT,
  Tag,
  ToneIcon,
  ZERO,
  count,
  fmt,
  pl,
  readableError,
  tally,
  whenShort,
  type AppState,
  type MappingIndex,
  type ReconcileResult,
  type Report,
  type RunDetail,
  type Tone,
  type Verdict,
  TableScroll,
} from "./RunCommon";

const REC_VERDICT: Record<Verdict, { label: string; short: string; tone: "ok" | "warn" | "bad" }> = {
  validated: { label: "Base en service conforme aux sources", short: "Conforme", tone: "ok" },
  review: { label: "Écarts à examiner", short: "Écarts à examiner", tone: "warn" },
  blocked: { label: "Divergence bloquante", short: "Divergence bloquante", tone: "bad" },
};

function metric(rec: Report, id: string, key: string): number {
  const v = rec.checks.find((c) => c.id === id)?.metrics?.[key];
  return typeof v === "number" ? v : 0;
}

function ReconciliationReport({ rec, stale, index }: { rec: Report; stale: boolean; index: MappingIndex }) {
  const v = REC_VERDICT[rec.status];
  const t = tally(rec.checks);
  const issues = rec.checks.filter((c) => c.status === "fail" || c.status === "warn");
  return (
    <div className="mt-5 flex flex-col gap-4">
      {stale && (
        <Callout tone="warn" title="Réconciliation antérieure à la mise en service actuelle.">
          Relancez-la pour relire la base telle qu&apos;elle est aujourd&apos;hui.
        </Callout>
      )}
      <div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ToneIcon tone={v.tone} size={16} />
          <span className={cx("text-lead font-semibold", TONE_TEXT[v.tone])}>{v.label}</span>
          <span className="text-small text-text-3">· base relue le {whenShort(rec.verified_at)}</span>
        </p>
        <p className="tabular mt-1 text-body text-text-2">
          {count(t.pass, "contrôle réussi", "contrôles réussis")} sur {fmt(t.total)} · {count(t.warn, "avertissement", "avertissements")} · {count(t.fail, "échec", "échecs")}
          {t.blocking_fail ? ` (dont ${fmt(t.blocking_fail)} ${pl(t.blocking_fail, "bloquant", "bloquants")})` : ""}
        </p>
        <p className="mt-1 text-small text-text-3">{rec.statement}</p>
      </div>

      {rec.entities.length > 0 && (
        <TableScroll label="Réconciliation par table">
          <table className={T.table}>
            <caption className="sr-only">Réconciliation par entité entre les fichiers sources et la base du logiciel en service</caption>
            <thead>
              <tr className={T.head}>
                <th scope="col" className={T.th}>
                  Entité
                </th>
                <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                  Lignes sources
                </th>
                <th scope="col" className={T.th}>
                  En service
                </th>
                <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                  Rejetées
                </th>
                <th scope="col" className={cx(T.th, "max-sm:pr-5")}>
                  Identiques
                </th>
                <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                  Modifiées depuis
                </th>
              </tr>
            </thead>
            <tbody>
              {rec.entities.map((e) => {
                const modified = metric(rec, `enregistrements.${e.entity}`, "modified_after_migration");
                const deleted = metric(rec, `volumes.${e.entity}`, "deleted_after_migration");
                return (
                  <tr key={e.entity} className={T.row}>
                    <th scope="row" className={cx(T.td, "font-semibold text-ink")}>
                      {e.label ?? index.entity(e.entity)}
                    </th>
                    <td className={cx(T.td, "hidden text-text-2 sm:table-cell")}>{fmt(e.source_rows)}</td>
                    <td className={cx(T.td, "font-semibold text-ink")}>{fmt(e.target_rows)}</td>
                    <td className={cx(T.td, "hidden sm:table-cell", e.rejected ? TONE_TEXT.warn : ZERO)}>{fmt(e.rejected)}</td>
                    <td className={cx(T.td, "max-sm:pr-5", e.mismatched ? cx("font-semibold", TONE_TEXT.bad) : TONE_TEXT.ok)}>
                      {fmt(e.exact)} / {fmt(e.exact + e.mismatched)}
                    </td>
                    <td className={cx(T.td, "hidden sm:table-cell", modified ? "text-ink" : ZERO)}>
                      {fmt(modified)}
                      {deleted ? ` (dont ${fmt(deleted)} ${pl(deleted, "supprimée", "supprimées")})` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}

      {issues.length > 0 ? (
        <div>
          <h3 className="mb-2 text-body font-semibold text-ink">Contrôles en échec ou en avertissement</h3>
          <ul className="flex flex-col gap-2">
            {issues.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-body">
                <ToneIcon tone={CHECK_TONE[c.status]} className="mt-[3px]" />
                <span className="min-w-0 break-words">
                  <span className="font-semibold text-ink">{c.label}</span>
                  <span className="sr-only"> — {CHECK_LABEL[c.status]}</span>
                  {c.blocking && c.status === "fail" && (
                    <Tag tone="bad" className="ml-2">
                      Bloquant
                    </Tag>
                  )}
                  <span className="block text-small text-text-2">{c.summary}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-body text-text-2">Aucun contrôle en échec ni en avertissement sur la base en service.</p>
      )}
    </div>
  );
}

/**
 * Réconciliation (POST /api/migration/reconcile) : la base du logiciel livré est relue et recomparée
 * aux fichiers sources ; le rapport complet est celui de l'exécution mise en service
 * (GET /api/migration/runs/[id] → reconciliation). Section repliée.
 */
export function ReconciliationSection({
  app,
  appLoading,
  appError,
  onReloadApp,
  deployed,
  deployedError,
  onReloadDeployed,
  index,
  livraisonHref,
}: {
  app: AppState | null;
  appLoading: boolean;
  appError: string | null;
  onReloadApp: () => Promise<void>;
  /** Détail de l'exécution actuellement en service (porte la réconciliation). */
  deployed: RunDetail | null;
  deployedError: string | null;
  onReloadDeployed: () => Promise<void>;
  index: MappingIndex;
  livraisonHref: string;
}) {
  const { post } = useProject();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dep = app?.deployment ?? null;
  const rec = deployed && deployed.meta.id === dep?.run_id ? deployed.reconciliation : null;
  const stale = !!rec && !!dep && rec.verified_at < dep.at;

  async function reconcile() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await post<ReconcileResult>("/api/migration/reconcile", {}));
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
      await Promise.all([onReloadDeployed(), onReloadApp()]);
    }
  }

  const badge: { tone: Tone; text: string } = !dep
    ? { tone: "idle", text: "Après la mise en service" }
    : rec
      ? { tone: stale ? "warn" : REC_VERDICT[rec.status].tone, text: stale ? "À refaire" : REC_VERDICT[rec.status].short }
      : { tone: "idle", text: "Pas encore faite" };

  return (
    <Section
      collapsible
      title="Réconciliation avec le logiciel en service"
      badge={<Tag tone={badge.tone}>{badge.text}</Tag>}
      description={dep ? `Données de ${dep.run_id}, en service depuis le ${whenShort(dep.at)}.` : undefined}
    >
      {appLoading && !app ? (
        <Loading label="Lecture de l'état du logiciel livré…" />
      ) : appError && !app ? (
        <LoadError message={appError} onRetry={() => void onReloadApp()} title="État du logiciel livré illisible" />
      ) : !dep || !app ? (
        <EmptyState title="Aucun logiciel en service pour ce projet" action={<StepLink href={livraisonHref}>Aller à la livraison</StepLink>}>
          Une fois la base migrée mise en service, la réconciliation relit la base du nouveau logiciel et la recompare aux fichiers extraits.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="flex min-w-0 flex-wrap items-center gap-2 text-body">
              <span className="font-mono font-semibold text-ink">{app.app_id}</span>
              <Tag tone={app.running ? "ok" : "idle"}>{app.running ? "En service" : "Arrêté"}</Tag>
              {app.port_used_by_other && <Tag tone="bad">Port occupé par une autre application</Tag>}
              <span className="text-text-3">mis en service par {dep.by}</span>
            </p>
            <Button variant="secondary" onClick={() => void reconcile()} loading={busy} loadingText="Réconciliation en cours…" icon={<RefreshCw size={16} />} className="max-sm:w-full max-sm:whitespace-normal">
              Réconcilier avec le logiciel en service
            </Button>
          </div>
          <p className="mt-2 text-small text-text-3">
            La base du logiciel livré est relue directement, même arrêté. Les fiches modifiées ou supprimées depuis la mise en service sont comptées à part.
          </p>

          <div aria-live="polite">
            {error && (
              <Callout tone="bad" className="mt-4" title="Réconciliation impossible">
                <p className="break-words">{error}</p>
              </Callout>
            )}
            {result && (
              <Callout tone={REC_VERDICT[result.status].tone} className="mt-4" title={`Réconciliation terminée : ${REC_VERDICT[result.status].label.toLowerCase()}.`}>
                {count(result.failed.length, "contrôle en échec", "contrôles en échec")} sur {fmt(result.checks)} ; le détail ci-dessous vient du rapport enregistré.
              </Callout>
            )}
          </div>

          {rec ? (
            <ReconciliationReport rec={rec} stale={stale} index={index} />
          ) : deployedError && !deployed ? (
            <div className="mt-4">
              <LoadError message={deployedError} onRetry={() => void onReloadDeployed()} title={`Rapport de ${dep.run_id} illisible`} />
            </div>
          ) : !deployed ? (
            <Loading label="Lecture du dernier rapport de réconciliation…" />
          ) : (
            <p className="mt-4 text-body text-text-2">Aucune réconciliation n&apos;a encore été faite pour cette mise en service.</p>
          )}
        </>
      )}
    </Section>
  );
}
