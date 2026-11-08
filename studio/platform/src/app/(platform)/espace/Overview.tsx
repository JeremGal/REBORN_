"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CircleAlert, ExternalLink, FileUp, Info, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ds/Progress";
import { ErrorState } from "@/components/ds/States";
import { agreePlurals, formatDateTime } from "@/components/ds/format";
import { StatusPill } from "@/components/project/ProjectShell";
import { useViewer } from "@/components/shell/context";
import { JourneyBar } from "@/components/shell/JourneyBar";
import { actionItems, deliveredUrl, hostOf, isDelivered, journey, nextAction, plural, projectName, statusLabel, type ActionItem, type ActionTone, type ProjectEntry } from "@/components/shell/journey";
import { useProjectEntries } from "@/components/shell/useProjects";

/*
 * Vue d'ensemble : centre de pilotage. Combien de projets, lesquels avancent, où en est chacun,
 * ce qui demande une action, les logiciels livrés. Tout vient de l'API (aucun score) ; un échec ou
 * une intervention est toujours expliqué par la raison enregistrée par le serveur.
 */

/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:09 »). */
const when = (iso: string | null | undefined) => formatDateTime(iso);

const TONE_ICON: Record<ActionTone, ReactNode> = {
  bad: <CircleAlert size={18} className="text-danger" />,
  warn: <TriangleAlert size={18} className="text-warning" />,
  info: <Info size={18} className="text-text-3" />,
};
const TONE_LABEL: Record<ActionTone, string> = { bad: "Bloquant", warn: "À traiter", info: "Information" };

function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-h3 font-semibold text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-line py-4 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span aria-hidden className="mt-0.5 inline-flex sm:mt-0">
        {TONE_ICON[item.tone]}
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink">
          <span className="sr-only">{TONE_LABEL[item.tone]} : </span>
          {item.title}
        </p>
        <p className="mt-0.5 text-small leading-relaxed text-text-2">
          <span className="font-medium text-ink">{item.projectName}</span>
          {item.detail ? ` · ${agreePlurals(item.detail)}` : ""}
        </p>
      </div>
      <Button href={`/projets/${item.projectId}/${item.slug}`} variant="secondary" size="sm" className="col-start-2 justify-self-start sm:col-start-3">
        {item.actionLabel}
        <span className="sr-only"> ({item.projectName})</span>
      </Button>
    </li>
  );
}

function ProjectRow({ e }: { e: ProjectEntry }) {
  const s = e.summary;
  const steps = journey(s, e.investigations, e.details);
  const next = nextAction(s, steps);
  const host = hostOf(s.legacy_url);
  const href = `/projets/${s.id}/${next.slug}`;
  return (
    <li className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 xl:grid xl:grid-cols-[minmax(0,1fr)_15rem_16rem] xl:items-center xl:gap-x-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link href={href} className="min-w-0 truncate text-lead font-semibold text-ink hover:underline">
            {projectName(s)}
          </Link>
          <StatusPill status={s.status} label={statusLabel(s)} />
        </div>
        <p className="mt-0.5 truncate text-small text-text-3">
          {s.software ?? "Logiciel non précisé"}
          {host && <span className="font-mono text-meta"> {host}</span>} · mis à jour le {when(s.updated_at ?? s.created_at)}
        </p>
        {(s.status === "FAILED" || s.status === "NEEDS_HUMAN_REVIEW") && s.status_reason && <p className="mt-1 text-small text-text-2">{agreePlurals(s.status_reason)}</p>}
      </div>
      <JourneyBar steps={steps} className="max-w-sm xl:max-w-none" />
      <Button href={href} variant={steps.some((x) => x.state === "attention") ? "primary" : "secondary"} size="sm" className="self-start xl:justify-self-end">
        {next.label}
        <span className="sr-only"> ({projectName(s)})</span>
      </Button>
    </li>
  );
}

function DeliveredRow({ e }: { e: ProjectEntry }) {
  const s = e.summary;
  const app = s.app!;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-ink">{projectName(s)}</p>
        <p className="mt-0.5 text-small text-text-3">
          <span className="font-mono text-meta text-text-2">{app.id}</span> · mis en service le {when(app.deployed_at)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={deliveredUrl(app.port)} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
          <ExternalLink size={15} aria-hidden />
          Ouvrir le logiciel
          <span className="sr-only"> {projectName(s)} (nouvel onglet)</span>
        </a>
        <Button href={`/projets/${s.id}/livraison`} variant="secondary" size="sm">
          Livraison
          <span className="sr-only"> ({projectName(s)})</span>
        </Button>
      </div>
    </li>
  );
}

/** Aucun projet : ce qui va se passer, en trois temps réels, et l'action pour commencer. */
function FirstSteps() {
  const steps = [
    { icon: <Plus size={18} />, title: "Créer le projet", text: "Le nom de l'entreprise, l'ancien logiciel et l'autorisation du propriétaire des données." },
    { icon: <FileUp size={18} />, title: "Récupérer les données", text: "Importez ses exports (CSV, Excel, JSON, SQL, SQLite, ZIP). L'exploration par un agent est en cours d'intégration." },
    { icon: <ShieldCheck size={18} />, title: "Vérifier, puis livrer", text: "Correspondance des champs, migration vérifiée sur les vraies données, mise en service du nouveau logiciel." },
  ];
  return (
    <section aria-labelledby="premiere-titre" className="rounded-panel bg-surface px-6 py-8 ring-1 ring-line sm:px-8">
      <h2 id="premiere-titre" className="text-h2 font-semibold text-ink">
        Votre première migration
      </h2>
      <p className="mt-2 max-w-2xl text-body leading-relaxed text-text-2">
        Un projet part d&apos;un ancien logiciel métier. Vous pouvez commencer sans donner aucun accès : déposez simplement ses exports.
      </p>
      <ol className="mt-6 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 border-t border-line pt-4">
            <span aria-hidden className="inline-flex items-center gap-2 text-text-3">
              {s.icon}
              <span className="tabular font-mono text-meta">{i + 1}</span>
            </span>
            <h3 className="text-lead font-semibold text-ink">{s.title}</h3>
            <p className="text-small leading-relaxed text-text-2">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8">
        <Button href="/projets/nouveau" size="lg" icon={<Plus size={17} />}>
          Nouvelle migration
        </Button>
      </div>
    </section>
  );
}

const MAX_ROWS = 6;

export function Overview() {
  const user = useViewer();
  const { entries, error, reload } = useProjectEntries({ details: true, analysis: true });

  const items = entries ? actionItems(entries) : [];
  const delivered = entries?.filter((e) => isDelivered(e.summary) && e.summary.app) ?? [];
  const inProgress = entries?.filter((e) => !isDelivered(e.summary)) ?? [];
  const running = inProgress.filter((e) => e.summary.status !== "PAUSED");
  const projectsToHandle = new Set(items.map((i) => i.projectId)).size;

  // Une phrase plutôt qu'un bandeau de quatre chiffres (V08) : mêmes faits, sans « 0 » en grand
  let line = "";
  if (entries && entries.length) {
    const paused = inProgress.length - running.length;
    line = `${plural(entries.length, "projet", "projets")} : ${running.length} en cours${paused ? `, ${paused} en pause` : ""}, ${plural(delivered.length, "logiciel livré", "logiciels livrés")}${projectsToHandle ? ` ; ${plural(projectsToHandle, "projet demande", "projets demandent")} une action` : ""}.`;
  } else if (entries) {
    line = "Aucun projet pour l'instant.";
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold text-ink">Vue d&apos;ensemble</h1>
          <p className="mt-1.5 text-body text-text-2">
            {user ? `Bonjour ${user.firstName}. ` : ""}
            {line}
          </p>
        </div>
        {!!entries?.length && (
          <Button href="/projets/nouveau" icon={<Plus size={16} />}>
            Nouvelle migration
          </Button>
        )}
      </header>

      {error && <ErrorState title="Lecture des projets impossible" message={error} onRetry={reload} />}

      {!entries && !error && <Skeleton lines={5} label="Chargement de vos projets…" />}

      {entries && entries.length === 0 && <FirstSteps />}

      {entries && entries.length > 0 && (
        <>
          <section aria-labelledby="a-traiter" className="flex flex-col gap-2">
            <SectionHead id="a-traiter" title="À traiter">
              {items.length > 0 && <span className="text-small text-text-3">{plural(items.length, "point", "points")}, du plus urgent au moins urgent</span>}
            </SectionHead>
            {items.length ? (
              <ul className="rounded-panel bg-surface px-4 ring-1 ring-line">
                {items.map((it) => (
                  <ActionRow key={it.key} item={it} />
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-panel bg-accent-soft px-4 py-3 text-body text-accent-ink">
                <ShieldCheck size={17} aria-hidden className="text-accent" />
                Rien ne demande votre attention pour l&apos;instant.
              </p>
            )}
          </section>

          {inProgress.length > 0 && (
            <section aria-labelledby="en-cours" className="flex flex-col gap-2">
              <SectionHead id="en-cours" title="Projets en cours">
                {inProgress.length > MAX_ROWS && (
                  <Link href="/projets" className="ds-link text-small">
                    Voir les {inProgress.length} projets
                  </Link>
                )}
              </SectionHead>
              <ul className="rounded-panel bg-surface px-4 ring-1 ring-line">
                {inProgress.slice(0, MAX_ROWS).map((e) => (
                  <ProjectRow key={e.summary.id} e={e} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="livres" className="flex flex-col gap-2">
            <SectionHead id="livres" title="Logiciels livrés" />
            {delivered.length ? (
              <ul className="rounded-panel bg-surface px-4 ring-1 ring-line">
                {delivered.map((e) => (
                  <DeliveredRow key={e.summary.id} e={e} />
                ))}
              </ul>
            ) : (
              <p className="text-body text-text-2">Aucun logiciel livré pour l&apos;instant : la livraison est la dernière étape d&apos;un projet, après la migration vérifiée.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
