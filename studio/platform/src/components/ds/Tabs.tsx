"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export type TabItem = { id: string; label: ReactNode; content: ReactNode; badge?: ReactNode; disabled?: boolean };

/**
 * Onglets (motif ARIA tablist complet) : flèches gauche/droite, Origine/Fin, activation au focus,
 * un seul onglet dans l'ordre de tabulation (tabindex mobile), panneaux reliés par aria-controls/labelledby.
 */
export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onChange,
  className,
  panelClassName,
}: {
  tabs: TabItem[];
  /** Nom accessible de la liste d'onglets. */
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
  panelClassName?: string;
}) {
  const base = useId();
  const [inner, setInner] = useState(defaultValue ?? tabs[0]?.id);
  const selected = value ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((t) => t.id === selected);
    const pos = enabled.indexOf(current);
    let next: number | undefined;
    if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className={cx("min-w-0", className)}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex max-w-full gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const on = t.id === selected;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${i}`}
              tabIndex={on ? 0 : -1}
              disabled={t.disabled}
              onClick={() => select(t.id)}
              className={cx(
                // Anneau de focus à l'intérieur de l'onglet : la liste défile (overflow-x-auto) et couperait un anneau extérieur.
                "relative -mb-px inline-flex h-control-md shrink-0 items-center gap-2 rounded-t-control border-b-2 px-3 text-body font-medium whitespace-nowrap transition-colors duration-(--duration-fast) focus-visible:-outline-offset-2 max-sm:h-control-lg",
                on ? "border-accent text-ink" : "border-transparent text-text-2 hover:border-line-strong hover:text-ink",
                t.disabled && "cursor-not-allowed text-text-disabled hover:border-transparent hover:text-text-disabled",
              )}
            >
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </div>
      {tabs.map((t, i) => {
        const on = t.id === selected;
        return (
          <div key={t.id} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} tabIndex={0} hidden={!on} className={cx("pt-4", panelClassName)}>
            {on ? t.content : null}
          </div>
        );
      })}
    </div>
  );
}
