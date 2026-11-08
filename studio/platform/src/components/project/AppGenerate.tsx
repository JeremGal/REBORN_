"use client";

import { useState, type ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, Rocket } from "lucide-react";
import { Button } from "@/components/ds";
import { Callout } from "./Step";
import { useProject } from "./ProjectProvider";
import {
  ActionNotice,
  LoadError,
  StepLink,
  announceAction,
  deployReadiness,
  fmtDay,
  hostOf,
  useSupersededNotice,
  type AppSpecPreview,
  type Deployment,
  type MigrationOverview,
  type NoticeState,
  type Readiness,
} from "./AppKit";

/*
 * Génération et mise en service (POST /api/migration/deploy { run_id, force? }).
 * La base installée est celle de la dernière exécution terminée ; la route refuse elle-même
 * une migration non vérifiée (409). Le 409 « modifications des utilisateurs » demande une
 * confirmation explicite (force), après sauvegarde de la base en service.
 */

/** Message du 409 renvoyé quand le logiciel en service contient des saisies de ses utilisateurs. */
const USER_CHANGES = /par ses utilisateurs/i;

export function useDeploy({ overview, reloadOverview, onDeployed }: { overview: MigrationOverview | null; reloadOverview: () => Promise<void>; onDeployed: () => Promise<unknown> }) {
  const { post } = useProject();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  useSupersededNotice("deploy", setNotice);

  const readiness: Readiness | null = overview ? deployReadiness(overview) : null;
  const run = readiness?.run ?? null;
  const active = overview?.app.deployment ?? null;
  const canDeploy = !!readiness?.ok && !!run && !busy;

  async function deploy(force: boolean) {
    if (!run) return;
    announceAction("deploy");
    setBusy(true);
    setNotice(null);
    try {
      const out = await post<{ ok: boolean; deployment: Deployment; url: string }>("/api/migration/deploy", force ? { run_id: run.id, force: true } : { run_id: run.id });
      setConfirm(null);
      setNotice({
        tone: "ok",
        title: "Logiciel généré et mis en service",
        text: (
          <>
            {/* La référence DEP_… reste dans « Intégration technique » de la Livraison (V07) */}
            Données de {out.deployment.run_id} · {out.deployment.backup ? "base précédente sauvegardée" : "première mise en service"}.{" "}
            <a href={out.url} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-0.5">
              Ouvrir {hostOf(out.url)} <ArrowUpRight size={13} aria-hidden />
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
            {" · "}
            <StepLink step="livraison">Voir la livraison</StepLink>
          </>
        ),
      });
      await onDeployed();
    } catch (e) {
      const msg = (e as Error).message;
      if (!force && USER_CHANGES.test(msg)) setConfirm(msg);
      else {
        setConfirm(null);
        setNotice({ tone: "bad", title: "Mise en service impossible", text: msg });
      }
      await reloadOverview();
    } finally {
      setBusy(false);
    }
  }

  return { readiness, run, active, busy, confirm, setConfirm, notice, setNotice, canDeploy, deploy };
}

export type DeployState = ReturnType<typeof useDeploy>;

/** Action principale de l'étape Reconstruction. */
export function DeployButton({ d }: { d: DeployState }) {
  const why = !d.readiness ? "Lecture de l'état de la migration…" : !d.readiness.ok ? d.readiness.title : undefined;
  return (
    <Button variant="accent" disabled={!d.canDeploy && !d.busy} loading={d.busy} loadingText="Génération et démarrage en cours…" icon={<Rocket size={16} />} onClick={() => void d.deploy(false)} title={d.busy ? undefined : why}>
      {d.active ? "Régénérer et remettre en service" : "Générer et mettre en service"}
    </Button>
  );
}

/** Base qui sera installée, quand la mise en service est possible (sous l'en-tête). */
export function DeployReadyLine({ d }: { d: DeployState }) {
  if (!d.readiness?.ok) return null;
  return (
    <p className="flex items-start gap-1.5 text-small leading-snug text-text-2">
      <CheckCircle2 size={15} aria-hidden className="mt-px shrink-0 text-accent" />
      <span>{d.readiness.title}</span>
    </p>
  );
}

const BLOCKER: Record<string, string> = {
  migration: "La mise en service installe la base migrée : exécutez d'abord la migration.",
  review: "Les écarts documentés de cette migration doivent être acceptés avant la mise en service.",
  blocked: "Un contrôle bloquant a échoué : la mise en service est refusée.",
  none: "La mise en service exige un rapport de vérification de la migration.",
};

/** Messages de la mise en service : prérequis manquant, confirmation, résultat. Rien quand tout va bien. */
export function DeployMessages({
  d,
  overview,
  overviewError,
  reloadOverview,
  spec,
}: {
  d: DeployState;
  overview: MigrationOverview | null;
  overviewError: string | null;
  reloadOverview: () => Promise<void>;
  spec: AppSpecPreview | null;
}) {
  const r = d.readiness;
  const run = d.run;
  const items: ReactNode[] = [];

  if (!overview && overviewError) items.push(<LoadError key="err" title="État de la migration indisponible" message={overviewError} onRetry={reloadOverview} />);

  if (d.confirm && run)
    items.push(
      <div key="confirm" role="alert">
        <Callout tone="warn" title="Le logiciel en service contient des saisies de ses utilisateurs">
          <p className="break-words">{d.confirm}</p>
          <p className="mt-1">Sa base actuelle sera d&apos;abord sauvegardée, puis remplacée par celle de {run.id} ; un retour arrière restera possible à l&apos;étape Livraison.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" loading={d.busy} onClick={() => void d.deploy(true)}>
              Remplacer la base (sauvegarde faite)
            </Button>
            <Button variant="ghost" disabled={d.busy} onClick={() => d.setConfirm(null)}>
              Annuler
            </Button>
          </div>
        </Callout>
      </div>,
    );

  if (d.notice) items.push(<ActionNotice key="notice" notice={d.notice} onClose={() => d.setNotice(null)} />);

  if (r && !r.ok) {
    const kind = !run ? "migration" : run.verification === "review" ? "review" : run.verification === "blocked" ? "blocked" : "none";
    items.push(
      <Callout key="blocker" tone={kind === "blocked" ? "bad" : kind === "migration" ? "info" : "warn"} title={r.title}>
        {BLOCKER[kind]} {r.step && <StepLink step={r.step}>{r.step === "migration" ? "Ouvrir l'étape Migration" : "Ouvrir l'étape Validation"}</StepLink>}
      </Callout>,
    );
  }

  if (r?.newerFailed && run)
    items.push(
      <Callout key="failed" tone="warn" title={`La dernière migration, ${r.newerFailed.id}, a échoué`}>
        {r.newerFailed.error ? `${r.newerFailed.error.replace(/[.\s]+$/, "")}. ` : ""}La mise en service installerait la base de {run.id}, la dernière migration terminée.
      </Callout>,
    );

  const drift = spec?.provenance && run && run.mapping_version !== spec.provenance.mapping_version ? { run: run.mapping_version, preview: spec.provenance.mapping_version } : null;
  if (drift && run)
    items.push(
      <Callout key="drift" tone="warn" title="Correspondances modifiées depuis la migration">
        {run.id} utilise les correspondances v{drift.run}, l&apos;aperçu la v{drift.preview} : relancez la migration pour l&apos;appliquer.{" "}
        <StepLink step="migration">Ouvrir l&apos;étape Migration</StepLink>
      </Callout>,
    );

  if (r?.ok && d.active && !d.notice && !d.confirm && overview)
    items.push(
      <Callout key="active" tone="info">
        {overview.mapping?.target.name ?? "Le logiciel"} est en service depuis le {fmtDay(d.active.at)} : le remettre en service sauvegarde puis remplace sa base.{" "}
        <StepLink step="livraison">Voir la livraison</StepLink>
      </Callout>,
    );

  if (!items.length) return null;
  return <div className="flex flex-col gap-2.5">{items}</div>;
}
