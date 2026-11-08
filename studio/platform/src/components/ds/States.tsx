import type { ReactNode } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { cx } from "./cx";
import { Button } from "./Button";

/** État vide : un titre, une phrase, une action (pas d'illustration décorative). */
export function EmptyState({
  title,
  children,
  action,
  icon,
  headingLevel,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** Niveau de titre si l'état vide ouvre une section (par défaut : paragraphe). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const H = headingLevel ? (`h${headingLevel}` as const) : "p";
  return (
    <div className={cx("flex flex-col items-center gap-2 rounded-panel bg-surface-sunken/60 px-6 py-9 text-center", className)}>
      {icon && (
        <span aria-hidden className="mb-1 inline-flex text-text-3">
          {icon}
        </span>
      )}
      <H className="text-lead font-semibold text-ink">{title}</H>
      {children && <div className="max-w-md text-body leading-relaxed text-text-2">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Échec de chargement : ce qui s'est passé, et une action de reprise. */
export function ErrorState({
  title = "Chargement impossible",
  message,
  onRetry,
  retryLabel = "Réessayer",
  className,
  children,
}: {
  title?: ReactNode;
  message: ReactNode;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className={cx("flex flex-col items-start gap-3 rounded-panel bg-danger-soft px-5 py-4 sm:flex-row sm:items-center", className)}>
      <CircleAlert size={20} aria-hidden className="shrink-0 text-danger max-sm:hidden" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-0.5 text-body leading-relaxed break-words text-text-2">{message}</div>
        {children}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
