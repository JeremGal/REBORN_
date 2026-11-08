"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, KeyRound, Play } from "lucide-react";
import { Button } from "@/components/ds";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Callout, EmptyState, StepHeader } from "@/components/project/Step";
import { ActionNotice, LoadError, Loading, StepLink, deployReadiness, fmtDay, fmtTime, hostOf, plural, useAction, useViewer, type AppSpecPreview, type AppStatus, type BusinessModelMeta, type MigrationOverview } from "@/components/project/AppKit";
import { AccessSection, AdminAccessSection, DeliveryStatus, DeliverySummary, DeliveryTechSection, DeploymentsSection, MaintenanceSection, MigrationReportSection, PublishedModelSection, StartSection, useAppAccess } from "@/components/project/AppDelivery";
import { ACTION_LABEL } from "@/components/project/AppSpecView";
import { unverifiedItems } from "@/components/project/RunVerification";
import type { RunDetail } from "@/components/project/RunCommon";
import { appProcessState } from "@/components/project/view-rules";

/**
 * Étape 8 · Livraison : le logiciel livré, tel que son processus le rapporte (GET /api/migration/app),
 * l'accès personnel du propriétaire (lien d'activation à usage unique), les premiers pas, le rapport de
 * migration, les calculs publiés, les versions et mises à jour, la maintenance.
 * Seule l'adresse locale renvoyée par l'API est proposée : aucun lien de déploiement public.
 * Premier écran : l'accès personnel (sans lui, impossible de se connecter au logiciel livré), puis la synthèse ;
 * l'accès de secours et les commandes de relance sont réservés à l'équipe REBORN.
 */
export default function LivraisonPage() {
  const { post } = useProject();
  const viewer = useViewer();
  const app = useProjectData<AppStatus>("/api/migration/app");
  const overview = useProjectData<MigrationOverview>("/api/migration");
  const models = useProjectData<{ versions: BusinessModelMeta[] }>("/api/migration/business-model");
  const runId = app.data?.deployment?.run_id ?? null;
  const detail = useProjectData<RunDetail>(runId ? `/api/migration/runs/${encodeURIComponent(runId)}` : null);
  const spec = useProjectData<AppSpecPreview>(app.data?.app_id ? "/api/migration/spec" : null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const proc = useAction(); // démarrage, actualisation (en-tête)
  const maint = useAction(); // arrêt, mise à jour du moteur (section Maintenance)
  const access = useAppAccess(app.data?.app_id ?? null);
  const operator = viewer?.role === "operator";

  // Le logiciel livré peut être arrêté ou relancé hors du Studio (terminal) : son état réel est relu
  // auprès de l'API toutes les 10 s tant que la page est visible.
  const reloadApp = app.reload;
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reloadApp();
    }, 10000);
    return () => clearInterval(t);
  }, [reloadApp]);
  useEffect(() => {
    if (app.data) setCheckedAt(new Date().toISOString());
  }, [app.data]);

  const refreshAll = async () => {
    await Promise.all([app.reload(), overview.reload(), models.reload(), detail.reload()]);
  };

  async function start() {
    await proc.run(
      "start",
      () => post<{ ok: boolean; app: AppStatus }>("/api/migration/app", { action: "start" }),
      (r) => (r.app.running ? { tone: "ok", text: `Logiciel démarré : il répond sur ${hostOf(r.app.url)}.` } : { tone: "warn", text: "Démarrage demandé, mais le logiciel ne répond pas encore à son adresse locale." }),
    );
    await refreshAll();
  }

  const a = app.data;
  // État du processus d'après `managed` : le pid n'est servi qu'à l'équipe (lot B1), jamais à un client.
  const procState = a ? appProcessState(a) : "stopped";
  // Après un retour arrière, la mise en service active change d'exécution : on n'affiche jamais le rapport d'une autre exécution
  const runDetail = detail.data && detail.data.meta?.id === runId ? detail.data : null;
  const target = overview.data?.mapping?.target;
  const name = a?.app_id && target?.id === a.app_id ? target.name : (a?.app_id ?? "Le nouveau logiciel");
  const versions = models.data?.versions ?? [];
  const run = overview.data?.runs.find((r) => r.id === runId) ?? null;

  const summary = useMemo(() => {
    if (!a?.deployment) return null;
    const d = a.deployment;
    const deps = overview.data?.deployments ?? [];
    const rank = deps.findIndex((x) => x.id === d.id);
    const report = runDetail?.report ?? null;
    const reserves: { label: string; detail: string }[] = [];
    if (report?.status === "review" && runDetail?.acknowledged) {
      const ack = runDetail.acknowledged;
      reserves.push({ label: "Écarts acceptés", detail: `${plural(report.gaps.length, "écart documenté accepté", "écarts documentés acceptés")} par ${ack.by} le ${fmtDay(ack.at)}${ack.comment ? ` : « ${ack.comment} »` : ""}.` });
    }
    if (run?.summary.rejected) reserves.push({ label: "Lignes non migrées", detail: `${plural(run.summary.rejected, "ligne rejetée", "lignes rejetées")}, avec leur motif, au rapport d'écarts.` });
    if (report) {
      const hasAttachments = report.checks.some((c) => c.group === "pieces_jointes");
      const unverified = unverifiedItems(report, { hasAttachments, models: models.data ? versions : null, runId: report.run_id });
      if (unverified.length) reserves.push({ label: "Non vérifié", detail: `${plural(unverified.length, "élément n'a pas pu être vérifié", "éléments n'ont pas pu être vérifiés")} : ${unverified.map((u) => u.title).join(", ")}.` });
    }
    const s = spec.data;
    const matches = !!s && s.app.migration_run === d.run_id && (!run || s.provenance?.mapping_version === run.mapping_version);
    const notRebuilt = matches ? (s!.not_rebuilt ?? []) : [];
    if (notRebuilt.length) reserves.push({ label: "Non reconstruits", detail: notRebuilt.map((x) => x.name).join(", ") + "." });
    if (a.running && a.rules_version === null) reserves.push({ label: "Calculs", detail: "aucun modèle métier actif : les nouveaux documents ne sont pas calculés automatiquement." });
    const kinds = matches ? [...new Set((s!.actions ?? []).filter((x) => x.available).map((x) => x.action))] : [];
    const features = matches ? (
      kinds.length ? (
        <>
          {kinds.map((k) => ACTION_LABEL[k] ?? k).join(", ")} dans {plural(s!.navigation.length, "module", "modules")} ({s!.navigation.map((n) => s!.entities.find((e) => e.name === n.entity)?.label ?? n.entity).join(", ")}) ; tableau de bord ; administration des accès. <StepLink step="reconstruction">Détail</StepLink>
        </>
      ) : (
        "Aucune action décrite par la spécification."
      )
    ) : (
      <>
        Décrites à l&apos;étape <StepLink step="reconstruction">Reconstruction</StepLink>
        {s ? " (la spécification a évolué depuis cette mise en service)" : ""}.
      </>
    );
    const test = overview.data?.mapping?.origin === "fixture";
    return { app: a, name, rank: rank >= 0 ? rank + 1 : null, run, report, acknowledged: runDetail?.acknowledged ?? null, reserves, features, test };
  }, [a, overview.data, runDetail, run, spec.data, models.data, versions, name]);

  if (!a)
    return (
      <div className="flex flex-col gap-6">
        <StepHeader step={8} title="Livraison" lead="Votre nouveau logiciel, tel que son processus le rapporte." />
        {app.loading ? <Loading label="Lecture de l'état du logiciel livré…" /> : <LoadError title="État du logiciel livré indisponible" message={app.error} onRetry={app.reload} />}
      </div>
    );

  if (!a.app_id)
    return (
      <div className="flex flex-col gap-6">
        <StepHeader step={8} title="Livraison" lead="Votre nouveau logiciel apparaîtra ici dès sa mise en service." />
        <NoDelivery overview={overview.data} />
        {overview.data && overview.data.deployments.length > 0 && <DeploymentsSection overview={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} onChanged={refreshAll} />}
      </div>
    );

  const busy = !!proc.busy || !!maint.busy;
  // Tant qu'aucun lien d'activation n'a été créé depuis ce navigateur, créer son accès est l'action principale :
  // sans compte dans le nouveau logiciel, l'ouvrir mène à un écran de connexion où l'on ne peut rien faire.
  const needsAccess = !access.created && !access.access;
  const openButton = (
    <Button href={a.url} target="_blank" rel="noreferrer" variant={needsAccess ? "secondary" : "primary"} iconEnd={<ArrowUpRight size={16} />}>
      Ouvrir mon nouveau logiciel
      <span className="sr-only"> (nouvel onglet)</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        step={8}
        title="Livraison"
        lead={a.running ? `${name} est en service : ouvrez-le et créez votre accès personnel pour vous connecter.` : `${name} est arrêté ; ses données sont conservées et il peut être redémarré à tout moment.`}
        actions={
          a.running ? (
            needsAccess ? (
              <>
                <Button variant="primary" icon={<KeyRound size={16} />} loading={access.busy} loadingText="Création du lien…" onClick={() => void access.create()}>
                  Créer mon accès au logiciel
                </Button>
                {openButton}
              </>
            ) : (
              openButton
            )
          ) : (
            <Button variant="primary" disabled={(busy && proc.busy !== "start") || a.port_used_by_other} loading={proc.busy === "start"} loadingText="Démarrage…" icon={<Play size={16} />} onClick={() => void start()} title={a.port_used_by_other ? `Le port ${a.port} est occupé par une autre application` : undefined}>
              Démarrer le logiciel
            </Button>
          )
        }
        aside={<DeliveryStatus app={a} checkedAt={checkedAt} busy={busy} refreshing={proc.busy === "refresh"} onRefresh={() => void proc.run("refresh", refreshAll)} />}
      />

      {(proc.notice || a.port_used_by_other || procState === "external" || procState === "unresponsive" || app.error) && (
        <div className="flex flex-col gap-2.5">
          {proc.notice && <ActionNotice notice={proc.notice} onClose={() => proc.setNotice(null)} />}
          {a.port_used_by_other && (
            <Callout tone="bad" title={`Port ${a.port} occupé`}>
              Une autre application l&apos;utilise : le logiciel ne peut pas démarrer sur ce port.
            </Callout>
          )}
          {procState === "external" && (
            <Callout tone="warn" title="Processus lancé hors du Studio">
              Le Studio ne peut ni l&apos;arrêter ni le mettre à jour : arrêtez-le depuis son terminal (Ctrl+C), puis redémarrez-le ici.
            </Callout>
          )}
          {procState === "unresponsive" && (
            <Callout tone="warn" title="Le logiciel ne répond pas">
              Son processus{a.pid ? ` (${a.pid})` : ""} existe mais ne répond pas à son adresse locale : consultez app.log dans son dossier.
            </Callout>
          )}
          {app.error && (
            <Callout tone="warn">
              Actualisation impossible : {app.error}
              {checkedAt ? ` État affiché : ${fmtTime(checkedAt)}.` : ""}
            </Callout>
          )}
        </div>
      )}

      <AccessSection app={a} email={viewer?.email ?? null} access={access} />
      {summary && <DeliverySummary s={summary} />}

      <div className="flex flex-col gap-3">
        <StartSection app={a} operator={operator} />
        <MigrationReportSection runId={runId} detail={runDetail} error={detail.error} reload={detail.reload} onChanged={refreshAll} />
        <PublishedModelSection app={a} versions={models.data?.versions ?? null} loading={models.loading} error={models.error} reload={models.reload} onChanged={refreshAll} />
        <DeploymentsSection overview={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} onChanged={refreshAll} />
        <MaintenanceSection app={a} act={maint} blocked={!!proc.busy} onChanged={refreshAll} operator={operator} />
        {operator && <AdminAccessSection app={a} />}
        <DeliveryTechSection app={a} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aucun logiciel livré                                                 */
/* ------------------------------------------------------------------ */

function NoDelivery({ overview }: { overview: MigrationOverview | null }) {
  const { id } = useProject();
  const r = overview ? deployReadiness(overview) : null;
  return (
    <EmptyState
      title="Aucun logiciel livré"
      action={
        <Button href={`/projets/${id}/reconstruction`} variant="primary">
          Aller à l&apos;étape Reconstruction
        </Button>
      }
    >
      {r ? (r.ok ? "La migration est vérifiée : lancez la mise en service à l'étape Reconstruction." : `${r.title} : la mise en service n'est pas encore possible.`) : "La mise en service se lance à l'étape Reconstruction."}
    </EmptyState>
  );
}
