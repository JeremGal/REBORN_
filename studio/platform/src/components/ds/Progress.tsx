import { useId, type ReactNode } from "react";
import { cx } from "./cx";
import { formatPercent } from "./format";

/**
 * Progression. Déterminée : `value` et `max` RÉELS (role=progressbar, aria-valuenow exact,
 * pourcentage jamais arrondi à 100 % s'il ne l'est pas). Indéterminée (`value` absent) :
 * le libellé dit explicitement ce qui est en cours.
 */
export function Progress({
  label,
  value,
  max = 100,
  detail,
  showValue = true,
  tone = "accent",
  labelHidden,
  className,
}: {
  label: string;
  value?: number | null;
  max?: number;
  /** Texte complémentaire (ex. « 3 étapes sur 8 »), annoncé comme valeur. */
  detail?: string;
  showValue?: boolean;
  tone?: "accent" | "warn" | "bad" | "ink";
  labelHidden?: boolean;
  className?: string;
}) {
  const id = useId();
  const determinate = typeof value === "number" && Number.isFinite(value) && max > 0;
  const clamped = determinate ? Math.min(Math.max(value, 0), max) : 0;
  const part = determinate ? clamped / max : 0;
  const pct = formatPercent(part);
  const fill = tone === "warn" ? "bg-warning" : tone === "bad" ? "bg-danger" : tone === "ink" ? "bg-ink" : "bg-accent";
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <div className={cx("flex items-baseline justify-between gap-3 text-small", labelHidden && "sr-only")}>
        <span id={`${id}-l`} className="font-semibold text-ink">
          {label}
        </span>
        {determinate && showValue && (
          <span aria-hidden className="tabular text-text-2">
            {detail ? `${detail} · ${pct}` : pct}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-labelledby={`${id}-l`}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? max : undefined}
        aria-valuenow={determinate ? clamped : undefined}
        aria-valuetext={determinate ? (detail ? `${detail} (${pct})` : pct) : undefined}
        aria-busy={determinate ? undefined : true}
        className={cx("relative h-2 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-line ring-inset", !determinate && "ds-progress-indeterminate")}
      >
        {determinate && <div className={cx("h-full rounded-full transition-[width] duration-(--duration-slow) ease-standard", fill)} style={{ width: `${part * 100}%` }} />}
      </div>
    </div>
  );
}

/**
 * Bloc d'attente : formes masquées aux technologies d'assistance, texte « Chargement… » annoncé.
 */
export function Skeleton({ lines = 3, label = "Chargement…", className, children }: { lines?: number; label?: string; className?: string; children?: ReactNode }) {
  return (
    <div role="status" className={cx("min-w-0", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="flex flex-col gap-2.5">
        {children ??
          Array.from({ length: lines }, (_, i) => <span key={i} className="ds-skeleton h-3.5" style={{ width: `${[92, 76, 84, 58, 70][i % 5]}%` }} />)}
      </div>
    </div>
  );
}
