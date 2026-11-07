"use client";

import { useState } from "react";
import { CircleDashed, LoaderCircle, RefreshCw, Server } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, Panel, cx } from "@/components/ui";
import {
  CHECK_LABEL,
  CHECK_TONE,
  Cell,
  HeaderRow,
  LoadError,
  Loading,
  Notice,
  StepLink,
  TONE_TEXT,
  Tag,
  ToneIcon,
  count,
  fmt,
  pl,
  readableError,
  tally,
  when,
  type AppState,
  type MappingIndex,
  type ReconcileResult,
  type Report,
  type RunDetail,
  type Tone,
  type Verdict,
} from "./RunCommon";

const REC_VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  validated: { label: "Base en service conforme aux sources", tone: "ok" },
  review: { label: "Écarts à examiner", tone: "warn" },
  blocked: { label: "Divergence bloquante", tone: "bad" },
};
const REC_COLS = "md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]";

function metric(rec: Report, id: string, key: string): number {
  const v = rec.checks.find((c) => c.id === id)?.metrics?.[key];
  return typeof v === "number" ? v : 0;
}

function ReconciliationReport({ rec, stale, index }: { rec: Report; stale: boolean; index: MappingIndex }) {
  const v = REC_VERDICT[rec.status];
  const t = tally(rec.checks);
  const issues = rec.checks.filter((c) => c.status === "fail" || c.status === "warn");
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
      {stale && (
        <Notice tone="warn" title="Réconciliation antérieure à la mise en service actuelle">
          <p>Relancez-la pour relire la base telle qu&apos;elle est aujourd&apos;hui dans le logiciel en service.</p>
        </Notice>
      )}
      <div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ToneIcon tone={v.tone} size={16} />
          <span className={cx("text-[15px] font-black", TONE_TEXT[v.tone])}>{v.label}</span>
          <span className="text-[12px] text-silt">· base relue le {when(rec.verified_at)}</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ink">
          {count(t.pass, "contrôle réussi", "contrôles réussis")} · {count(t.warn, "avertissement", "avertissements")} · {count(t.info, "information", "informations")} ·{" "}
          {count(t.fail, "échec", "échecs")}
          {t.blocking_fail ? ` (dont ${fmt(t.blocking_fail)} ${pl(t.blocking_fail, "bloquant", "bloquants")})` : ""} — sur {count(t.total, "contrôle", "contrôles")}.
        </p>
      </div>
      <div className="border-l-2 border-line-strong pl-3">
        <p className="eyebrow">Ce que la réconciliation établit</p>
        <p className="mt-0.5 text-[12.5px] text-sediment">{rec.statement}</p>
      </div>

      {rec.entities.length > 0 && (
        <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          <HeaderRow cols={REC_COLS}>
            <span>Entité</span>
            <span className="text-right">Lignes sources</span>
            <span className="text-right">Migrées, en service</span>
            <span className="text-right">Rejetées</span>
            <span className="text-right">Identiques, relues</span>
            <span className="text-right">Modifiées depuis</span>
          </HeaderRow>
          <ul>
            {rec.entities.map((e) => {
              const modified = metric(rec, `enregistrements.${e.entity}`, "modified_after_migration");
              const deleted = metric(rec, `volumes.${e.entity}`, "deleted_after_migration");
              return (
                <li key={e.entity} className={cx("grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:items-baseline", REC_COLS)}>
                  <div className="col-span-2 min-w-0 text-[13px] font-bold md:col-span-1">{e.label ?? index.entity(e.entity)}</div>
                  <Cell label="Lignes sources">{fmt(e.source_rows)}</Cell>
                  <Cell label="Migrées, en service">
                    <b className="font-bold">{fmt(e.target_rows)}</b>
                  </Cell>
                  <Cell label="Rejetées">
                    <span className={e.rejected ? TONE_TEXT.warn : "text-silt"}>{fmt(e.rejected)}</span>
                  </Cell>
                  <Cell label="Identiques, relues">
                    <span className={e.mismatched ? cx("font-bold", TONE_TEXT.bad) : TONE_TEXT.ok}>
                      {fmt(e.exact)} / {fmt(e.exact + e.mismatched)}
                    </span>
                  </Cell>
                  <Cell label="Modifiées depuis">
                    <span className={modified ? "text-ink" : "text-silt"}>
                      {fmt(modified)}
                      {deleted ? ` (dont ${fmt(deleted)} ${pl(deleted, "supprimée", "supprimées")})` : ""}
                    </span>
                  </Cell>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {issues.length > 0 ? (
        <div>
          <h3 className="mb-1 text-[12px] font-bold text-sediment">Contrôles en échec ou en avertissement</h3>
          <ul className="flex flex-col gap-1">
            {issues.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-[12px]">
                <ToneIcon tone={CHECK_TONE[c.status]} size={12} className="mt-[3px]" />
                <span className="min-w-0 break-words">
                  <span className="font-bold text-ink">{c.label}</span>
                  <span className="sr-only"> — {CHECK_LABEL[c.status]}</span>
                  {c.blocking && c.status === "fail" && <span className={cx("ml-1.5 text-[11px] font-bold", TONE_TEXT.bad)}>bloquant</span>}
                  <span className="block text-sediment">{c.summary}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12.5px] text-sediment">Aucun contrôle en échec ni en avertissement sur la base en service.</p>
      )}
    </div>
  );
}

/**
 * Réconciliation (POST /api/migration/reconcile) : la base du logiciel livré est relue et recomparée
 * aux fichiers sources ; le rapport complet est celui de l'exécution mise en service
 * (GET /api/migration/runs/[id] → reconciliation).
 */
export function ReconciliationPanel({
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

  return (
    <Panel eyebrow="Après la mise en service" title="Réconciliation avec le logiciel en service">
      {appLoading && !app ? (
        <Loading label="Lecture de l'état du logiciel livré…" />
      ) : appError && !app ? (
        <LoadError message={appError} onRetry={() => void onReloadApp()} title="État du logiciel livré illisible" />
      ) : !dep || !app ? (
        <div className="flex items-start gap-2.5 rounded-md bg-chalk px-3 py-3">
          <CircleDashed size={15} className="mt-0.5 shrink-0 text-silt" aria-hidden />
          <div className="min-w-0 text-[12.5px]">
            <p className="font-bold text-ink">Disponible après la mise en service</p>
            <p className="mt-0.5 text-sediment">
              Aucun logiciel n&apos;est encore en service pour ce projet. Une fois la base migrée mise en service, la réconciliation relira la base du nouveau logiciel et la recomparera aux
              fichiers extraits de l&apos;ancien.
            </p>
            <div className="mt-1.5">
              <StepLink href={livraisonHref}>Aller à la livraison</StepLink>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 text-[12.5px]">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Server size={13} className="text-silt" aria-hidden />
                <span className="font-mono font-bold">{app.app_id}</span>
                <Tag tone={app.running ? "ok" : "idle"}>{app.running ? "En service" : "Arrêté"}</Tag>
                {app.port_used_by_other && <Tag tone="bad">Port occupé par une autre application</Tag>}
              </p>
              <p className="mt-0.5 text-sediment">
                Données de {dep.run_id}, mises en service le {when(dep.at)} par {dep.by}.
              </p>
            </div>
            <Button variant="primary" onClick={() => void reconcile()} disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> Réconciliation en cours…
                </>
              ) : (
                <>
                  <RefreshCw size={14} aria-hidden /> Réconcilier avec le logiciel en service
                </>
              )}
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-silt">
            La base du logiciel livré est relue directement (il n&apos;a pas besoin d&apos;être démarré), puis recomparée aux fichiers extraits de l&apos;ancien logiciel. Les enregistrements modifiés
            ou supprimés par ses utilisateurs depuis la mise en service, tracés dans son journal d&apos;audit, sont exclus de la comparaison champ à champ et comptés à part.
          </p>

          <div className="mt-3 flex flex-col gap-2" aria-live="polite">
            {error && (
              <Notice tone="bad" title="Réconciliation impossible">
                <p className="break-words">{error}</p>
              </Notice>
            )}
            {result && (
              <Notice tone={REC_VERDICT[result.status].tone === "ok" ? "ok" : REC_VERDICT[result.status].tone === "warn" ? "warn" : "bad"} title={`Réconciliation terminée : ${REC_VERDICT[result.status].label.toLowerCase()}`}>
                <p>
                  {count(result.failed.length, "contrôle en échec", "contrôles en échec")} sur {fmt(result.checks)}. Le détail ci-dessous provient du rapport enregistré.
                </p>
              </Notice>
            )}
          </div>

          {rec ? (
            <ReconciliationReport rec={rec} stale={stale} index={index} />
          ) : deployedError && !deployed ? (
            <div className="mt-3">
              <LoadError message={deployedError} onRetry={() => void onReloadDeployed()} title={`Rapport de ${dep.run_id} illisible`} />
            </div>
          ) : !deployed ? (
            <Loading label="Lecture du dernier rapport de réconciliation…" />
          ) : (
            <p className="mt-3 text-[12.5px] text-sediment">Aucune réconciliation n&apos;a encore été faite pour cette mise en service.</p>
          )}
        </>
      )}
    </Panel>
  );
}
