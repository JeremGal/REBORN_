import Link from "next/link";
import type { ReactNode } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

export type StepStatus = "done" | "current" | "attention" | "upcoming";
export type StepperStep = { label: string; status: StepStatus; description?: ReactNode; href?: string; statusLabel?: string };

/** Libellés textuels des statuts (le statut n'est jamais porté par la seule couleur). */
export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  done: "Fait",
  current: "Étape en cours",
  attention: "Intervention nécessaire",
  upcoming: "À venir",
};

function Marker({ n, status }: { n: number; status: StepStatus }) {
  return (
    <span
      aria-hidden
      className={cx(
        "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-meta font-semibold",
        status === "done" && "bg-accent text-white",
        status === "current" && "bg-ink text-white ring-2 ring-accent ring-offset-2 ring-offset-surface",
        status === "attention" && "bg-warning-soft text-warning-ink ring-1 ring-warning ring-inset",
        status === "upcoming" && "bg-surface text-text-3 ring-1 ring-control-border ring-inset",
      )}
    >
      {status === "done" ? <Check size={13} strokeWidth={3} /> : status === "attention" ? <TriangleAlert size={12} strokeWidth={2.5} /> : n}
    </span>
  );
}

/**
 * Parcours par étapes : liste ordonnée, étape active `aria-current="step"`, statut textuel par étape.
 * Vertical (barre latérale) ou horizontal (en-tête de page ; statut lu mais visuellement discret).
 */
export function Stepper({ steps, label = "Étapes", orientation = "vertical", className }: { steps: StepperStep[]; label?: string; orientation?: "vertical" | "horizontal"; className?: string }) {
  const navigable = steps.some((s) => s.href);
  const list = (
    <ol aria-label={navigable ? undefined : label} className={cx(orientation === "vertical" ? "flex flex-col" : "flex flex-wrap gap-x-2 gap-y-3", className)}>
      {steps.map((s, i) => {
        const statusText = s.statusLabel ?? STEP_STATUS_LABEL[s.status];
        const body = (
          <>
            <Marker n={i + 1} status={s.status} />
            <span className="flex min-w-0 flex-col">
              <span className={cx("text-body leading-5", s.status === "current" ? "font-semibold text-ink" : s.status === "upcoming" ? "text-text-2" : "font-medium text-ink")}>{s.label}</span>
              <span className={cx("text-meta", s.status === "attention" ? "font-medium text-warning-ink" : s.status === "current" ? "text-accent-ink" : "text-text-3", orientation === "horizontal" && "sr-only")}>
                {orientation === "horizontal" ? ` (${statusText})` : statusText}
              </span>
              {s.description && orientation === "vertical" && <span className="mt-0.5 text-meta text-text-3">{s.description}</span>}
            </span>
          </>
        );
        const row = "flex min-w-0 items-start gap-3 rounded-control px-2 py-2";
        return (
          <li key={`${i}-${s.label}`} aria-current={s.status === "current" && !s.href ? "step" : undefined} className={cx("relative min-w-0", orientation === "horizontal" && "flex items-center gap-2")}>
            {s.href ? (
              <Link href={s.href} aria-current={s.status === "current" ? "step" : undefined} className={cx(row, "transition-colors duration-(--duration-fast) hover:bg-surface-sunken", s.status === "current" && "bg-surface-sunken")}>
                {body}
              </Link>
            ) : (
              <div className={row}>{body}</div>
            )}
            {orientation === "horizontal" && i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-line-strong max-sm:hidden" />}
          </li>
        );
      })}
    </ol>
  );
  return navigable ? (
    <nav aria-label={label} className="min-w-0">
      {list}
    </nav>
  ) : (
    list
  );
}
