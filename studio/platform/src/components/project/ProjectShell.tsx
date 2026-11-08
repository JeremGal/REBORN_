"use client";

import Link from "next/link";
import { useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Check, ListChecks, Pause } from "lucide-react";
import { cx } from "@/components/ds/cx";
import { Button } from "@/components/ds/Button";
import { useReborn } from "@/components/RebornProvider";
import { ShellContext, usePublishProject } from "@/components/shell/context";
import { currentStep, journey, REQUIRED_STEPS, requiredDone, STATUS_TONE } from "@/components/shell/journey";
import { projectCall, useProject, type ProjectStatus } from "./ProjectProvider";

/*
 * Cadre d'un projet. Le parcours (8 étapes, état réel) est affiché dans la barre latérale unique de
 * l'espace connecté (AppShell) : ProjectShell lui publie le projet ouvert et n'affiche ici que le
 * contenu de l'étape, l'avis de pause et, sur mobile, un repère qui ouvre le parcours.
 * Exports historiques conservés (STEPS, StepSlug, STATUS_TONE, StatusPill, stepDone, hostOf, ProjectShell).
 */
export { STEPS, STATUS_TONE, stepDone, hostOf } from "@/components/shell/journey";
export type { StepSlug } from "@/components/shell/journey";

const PILL: Record<(typeof STATUS_TONE)[ProjectStatus], string> = {
  ok: "bg-accent-soft text-accent-ink",
  warn: "bg-warning-soft text-warning-ink",
  bad: "bg-danger-soft text-danger-ink",
  run: "bg-surface-sunken text-ink",
  idle: "bg-surface-sunken text-text-2",
};

/** État du projet : toujours une icône ET un texte (jamais la couleur seule). */
export function StatusPill({ status, label, className }: { status: ProjectStatus; label: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "idle";
  return (
    <span className={cx("ds-badge", PILL[tone], className)}>
      <span aria-hidden className="inline-flex">
        {status === "PAUSED" ? (
          <Pause size={12} strokeWidth={2.5} />
        ) : tone === "bad" ? (
          <AlertTriangle size={12} strokeWidth={2.5} className="text-danger" />
        ) : tone === "warn" ? (
          <AlertTriangle size={12} strokeWidth={2.5} className="text-warning" />
        ) : tone === "ok" ? (
          <Check size={12} strokeWidth={3} className="text-accent" />
        ) : (
          <span className={cx("size-1.5 rounded-full", tone === "run" ? "bg-accent" : "bg-text-3")} />
        )}
      </span>
      {label}
    </span>
  );
}

function PausedNotice({ id, onResumed }: { id: string; onResumed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resume() {
    setBusy(true);
    setError(null);
    try {
      await projectCall(id, "PATCH", `/api/projects/${id}`, { action: "resume" });
      onResumed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-surface px-4 py-3 ring-1 ring-line-strong">
      <p className="flex min-w-0 items-center gap-2 text-body text-text-2">
        <Pause size={15} aria-hidden className="shrink-0 text-text-3" />
        <span>
          <b className="font-semibold text-ink">Projet en pause.</b> Les opérations sont bloquées jusqu&apos;à la reprise.
        </span>
      </p>
      <Button size="sm" loading={busy} loadingText="Reprise…" onClick={resume}>
        Reprendre le projet
      </Button>
      {error && <p className="ds-error basis-full">{error}</p>}
    </div>
  );
}

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { id, summary, details, error, refresh } = useProject();
  const { state } = useReborn();
  const shell = useContext(ShellContext);
  const pathname = usePathname() ?? "";
  const investigations = state?.investigations?.filter((i) => i.project_id === id).length ?? 0;

  const published = useMemo(() => ({ id, summary, details, investigations, error }), [id, summary, details, investigations, error]);
  usePublishProject(published);

  if (error && !summary) {
    // 404 de l'API (« Projet introuvable ») : même réponse pour un projet inexistant ou d'un autre compte.
    // Toute autre erreur (réseau, serveur) est dite telle quelle : le projet n'est pas présenté comme inexistant.
    const notFound = /introuvable/i.test(error);
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 rounded-panel bg-surface p-6 ring-1 ring-line">
        <h1 className="text-h2 font-semibold text-ink">{notFound ? "Projet introuvable" : "Projet indisponible pour le moment"}</h1>
        <p className="text-body text-text-2">{notFound ? "Ce projet n'existe pas ou n'est pas rattaché à votre compte." : `Le projet n'a pas pu être lu : ${error}`}</p>
        <div className="flex flex-wrap items-center gap-4">
          {!notFound && (
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Réessayer
            </Button>
          )}
          <Link href="/projets" className="ds-link text-body">
            Retour à mes projets
          </Link>
        </div>
      </div>
    );
  }

  const steps = journey(summary, investigations, details);
  const step = currentStep(pathname, id);
  const stepIndex = step ? steps.findIndex((s) => s.slug === step) : -1;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Mobile et tablette : la barre latérale est dans le menu ; ce repère y donne accès. */}
      {shell && (
        <div className="flex items-center justify-between gap-3 rounded-panel bg-surface py-2.5 pr-2.5 pl-4 ring-1 ring-line lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold text-ink">{summary ? (summary.company ?? summary.name) : "Chargement du projet…"}</p>
            {summary && (
              <p className="tabular truncate text-meta text-text-3">
                {stepIndex >= 0 ? `${steps[stepIndex].label} · ` : ""}
                {requiredDone(steps)} sur {REQUIRED_STEPS} étapes requises faites
              </p>
            )}
          </div>
          <Button variant="secondary" size="sm" icon={<ListChecks size={15} />} onClick={shell.openNavigation} aria-haspopup="dialog">
            Parcours
          </Button>
        </div>
      )}
      {summary?.status === "PAUSED" && <PausedNotice id={id} onResumed={() => void refresh()} />}
      {children}
    </div>
  );
}
