"use client";

import Link from "next/link";
import { useId } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ds/cx";
import { agreePlurals } from "@/components/ds/format";
import { StatusPill } from "@/components/project/ProjectShell";
import { hostOf, journey, JOURNEY_LABEL, REQUIRED_STEPS, requiredDone, statusLabel, type JourneyState } from "./journey";
import type { ShellProject } from "./context";

/**
 * Section « Projet » de la barre latérale : entreprise, état réel (avec sa raison), et les 8 étapes
 * du parcours avec leur statut (fait / prochaine / intervention / à venir / facultative). L'étape affichée
 * porte aria-current="page". Tout vient de /api/projects/[id] (publié par ProjectShell).
 * Une ligne par étape sur ordinateur (statut court à droite, raison d'une intervention en dessous) : la barre
 * entière, compte compris, tient dans un écran de 900 px de haut. Projet introuvable : aucun parcours affiché.
 */

/** Statut court, sur la ligne de l'étape ; le statut complet est lu par les lecteurs d'écran. */
const SHORT: Record<JourneyState, string> = { done: "Fait", next: "Prochaine", attention: "À traiter", upcoming: "À venir", optional: "Facultative" };

function Marker({ n, state }: { n: number; state: JourneyState }) {
  return (
    <span
      aria-hidden
      className={cx(
        "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-meta font-semibold",
        state === "done" && "bg-accent text-white",
        state === "attention" && "bg-warning-soft text-warning-ink ring-1 ring-warning ring-inset",
        state === "next" && "bg-surface text-accent-ink ring-2 ring-accent ring-inset",
        state === "upcoming" && "bg-surface text-text-3 ring-1 ring-control-border ring-inset",
        state === "optional" && "border border-dashed border-control-border bg-surface text-text-3",
      )}
    >
      {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "attention" ? <TriangleAlert size={12} strokeWidth={2.5} /> : n}
    </span>
  );
}

export function ProjectNav({ project, pathname, onNavigate }: { project: ShellProject; pathname: string; onNavigate?: () => void }) {
  const titleId = useId();
  const s = project.summary;
  const steps = journey(s, project.investigations, project.details);
  const count = s ? requiredDone(steps) : 0;
  const host = hostOf(s?.legacy_url ?? null);
  // Projet introuvable (ou illisible) : rien à montrer, surtout pas un parcours fictif
  if (!s && project.error) return null;
  const name = s ? (s.company ?? s.name) : "Chargement du projet…";

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 px-2">
        <p className="text-meta font-medium text-text-3">Projet ouvert</p>
        <p id={titleId} className="mt-0.5 truncate text-lead leading-snug font-semibold text-ink" title={name}>
          {name}
        </p>
        {s && (
          <p className="truncate text-small text-text-2" title={[s.software, host].filter(Boolean).join(" · ") || undefined}>
            {s.software ?? "Logiciel historique"}
            {host && <span className="font-mono text-meta text-text-3"> {host}</span>}
          </p>
        )}
        {s && (
          <div className="mt-2 flex flex-col items-start gap-1">
            <StatusPill status={s.status} label={statusLabel(s)} />
            {s.status_reason && (s.status === "FAILED" || s.status === "NEEDS_HUMAN_REVIEW" || s.status === "PAUSED") && (
              <p className="line-clamp-3 text-meta leading-snug text-text-2" title={s.status_reason}>
                {agreePlurals(s.status_reason)}
              </p>
            )}
          </div>
        )}
      </div>

      <nav aria-label={`Étapes du projet ${s ? (s.company ?? s.name) : ""}`.trim()} className="min-w-0">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-2 text-meta text-text-3">
          <span className="font-medium">Parcours</span>
          <span className="tabular">{s ? `${count} sur ${REQUIRED_STEPS} étapes requises` : "…"}</span>
        </div>
        <div aria-hidden className="mx-2 mb-2 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-accent transition-[width] duration-(--duration-slow) ease-standard" style={{ width: `${(count / REQUIRED_STEPS) * 100}%` }} />
        </div>
        <ol className="flex flex-col gap-px">
          {steps.map((step, i) => {
            const href = `/projets/${project.id}/${step.slug}`;
            const on = pathname === href || pathname.startsWith(`${href}/`);
            const statusText = step.state === "attention" && step.reason ? step.reason : JOURNEY_LABEL[step.state];
            return (
              <li key={step.slug}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "group relative flex min-h-9 items-center gap-2.5 rounded-control px-2 py-1 transition-colors duration-(--duration-fast) max-lg:min-h-11",
                    on ? "bg-surface shadow-raised ring-1 ring-line" : "hover:bg-surface/70",
                  )}
                >
                  {on && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                  <Marker n={i + 1} state={step.state} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className={cx("truncate text-body leading-5", on ? "font-semibold text-ink" : "font-medium text-ink")}>{step.label}</span>
                      <span aria-hidden className={cx("shrink-0 text-meta", step.state === "attention" ? "font-medium text-warning-ink" : step.state === "next" ? "font-medium text-accent-ink" : "text-text-3")}>
                        {SHORT[step.state]}
                      </span>
                    </span>
                    {step.state === "attention" && step.reason && (
                      <span aria-hidden className="line-clamp-2 text-meta leading-snug font-medium text-warning-ink" title={step.reason}>
                        {step.reason}
                      </span>
                    )}
                  </span>
                  <span className="sr-only"> : {statusText}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}
