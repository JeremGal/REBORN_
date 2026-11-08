"use client";

import type { ReactNode } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { cx } from "@/components/ui";
import { Alert } from "@/components/ds/Alert";
import { Badge } from "@/components/ds/Badge";
import { EmptyState as DsEmptyState } from "@/components/ds/States";

/**
 * Kit commun des pages d'étape. Règles de mise en page (à respecter sur toutes les étapes) :
 *  1. <StepHeader> : titre, UNE phrase d'explication, l'action principale à droite (une seule).
 *  2. <Metrics> : 2 à 4 chiffres réels qui disent où en est l'étape.
 *  3. Le reste dans des <Section> ; ce qui est secondaire est repliable et fermé par défaut.
 *  4. Les détails techniques (routes d'API, contrats) : une seule <Section title="Intégration technique"> fermée.
 *  5. Messages : <Callout>, une ou deux phrases au plus. Jeux de test : <TestBadge>.
 * Rendu : jetons et composants du design system (components/ds).
 */

export function StepHeader({ step, title, lead, actions, aside }: { step: number; title: string; lead?: ReactNode; actions?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="max-w-[680px] min-w-0">
        <p className="eyebrow">Étape {step} sur 8</p>
        <h1 className="mt-1.5 text-h1 font-semibold text-ink">{title}</h1>
        {lead && <p className="mt-2 text-lead leading-relaxed text-text-2">{lead}</p>}
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>}
    </header>
  );
}

export function Metrics({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx("grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-line ring-1 ring-line md:grid-cols-4", className)}>{children}</dl>;
}

export function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5">
      <dt className="text-small font-medium text-text-3">{label}</dt>
      {/* Jamais tronquée (« Non disponi… ») : la valeur passe à la ligne, en plus petit tant que l'écran est étroit. */}
      <dd
        className={cx(
          "tabular text-h3 font-semibold break-words xl:text-h2",
          tone === "ok" && "text-accent-ink",
          tone === "warn" && "text-warning-ink",
          tone === "bad" && "text-danger-ink",
          tone === "muted" ? "text-text-3" : !tone && "text-ink",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-meta leading-snug text-text-3">{hint}</dd>}
    </div>
  );
}

/** Bloc de contenu. `collapsible` : repliable (fermé par défaut sauf `defaultOpen`). */
export function Section({
  title,
  description,
  actions,
  children,
  collapsible,
  defaultOpen,
  badge,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: ReactNode;
  id?: string;
  className?: string;
}) {
  const head = (
    <>
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-lead font-semibold text-ink">
          {title}
          {badge}
        </h2>
        {description && <p className="mt-0.5 text-body leading-relaxed text-text-3">{description}</p>}
      </div>
      {actions && !collapsible && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </>
  );
  if (collapsible) {
    return (
      <details id={id} open={defaultOpen} className={cx("group rounded-panel bg-surface ring-1 ring-line", className)}>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-panel px-5 py-4 transition-colors duration-(--duration-fast) select-none hover:bg-canvas/70 [&::-webkit-details-marker]:hidden">
          {head}
          <ChevronDown size={18} aria-hidden className="mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-base) group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-5 py-4">{children}</div>
      </details>
    );
  }
  return (
    <section id={id} className={cx("rounded-panel bg-surface ring-1 ring-line", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">{head}</div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

const CALLOUT_TONE = { info: "info", ok: "ok", warn: "warn", bad: "bad", test: "warn" } as const;

export function Callout({ tone = "info", title, children, action, className }: { tone?: keyof typeof CALLOUT_TONE; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <Alert
      tone={CALLOUT_TONE[tone]}
      title={title}
      action={action}
      icon={tone === "test" ? <FlaskConical size={18} /> : undefined}
      live={tone === "bad" ? "assertive" : "off"}
      className={className}
    >
      {children}
    </Alert>
  );
}

/** Étiquette unique des jeux de test (jamais présentés comme une exploration réelle). */
export function TestBadge({ children = "Jeu de test — Relatio 2004", className }: { children?: ReactNode; className?: string }) {
  return (
    <Badge tone="warn" icon={<FlaskConical size={12} />} className={className}>
      {children}
    </Badge>
  );
}

/** Liste clé → valeur compacte. */
export function Facts({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-small font-medium text-text-3">{i.label}</dt>
          <dd className="mt-0.5 text-body break-words text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** État vide : une phrase, une action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <DsEmptyState title={title} action={action}>
      {children}
    </DsEmptyState>
  );
}
