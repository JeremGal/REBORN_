"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./styles";

export type MenuItem =
  | { label: string; onSelect?: () => void; href?: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; separator?: false }
  | { separator: true };

type Action = Exclude<MenuItem, { separator: true }>;

/**
 * Menu déroulant (bouton + liste d'actions) : aria-haspopup/aria-expanded, flèches haut/bas,
 * Origine/Fin, recherche par première lettre, Échap (ferme et rend le focus au bouton), Tab (ferme).
 */
export function Menu({
  label,
  items,
  icon,
  iconOnly = false,
  align = "start",
  variant = "secondary",
  size = "md",
  className,
}: {
  /** Libellé du bouton (nom accessible quand `iconOnly`). */
  label: string;
  items: MenuItem[];
  icon?: ReactNode;
  iconOnly?: boolean;
  align?: "start" | "end";
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const actions = items.filter((i): i is Action => !i.separator);

  const focusItem = (index: number) => {
    const n = actions.length;
    if (!n) return;
    itemRefs.current[((index % n) + n) % n]?.focus();
  };
  // Élément à focaliser dès que le menu est affiché (après le rendu, sans dépendre d'une image).
  const pendingFocus = useRef<number | null>(null);
  const openAt = (index: number) => {
    pendingFocus.current = index;
    setOpen(true);
  };
  useEffect(() => {
    if (!open || pendingFocus.current === null) return;
    focusItem(pendingFocus.current);
    pendingFocus.current = null;
  });
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  // Clic à l'extérieur : ferme sans déplacer le focus
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openAt(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt(actions.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(actions.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLocaleLowerCase("fr");
      for (let k = 1; k <= actions.length; k++) {
        const j = (current + k) % actions.length;
        if (actions[j].label.toLocaleLowerCase("fr").startsWith(ch)) {
          focusItem(j);
          break;
        }
      }
    }
  };

  let ai = -1;
  return (
    <div ref={root} className={cx("relative inline-flex", className)}>
      <button
        ref={button}
        type="button"
        id={`${id}-b`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKey}
        className={buttonClasses({ variant, size, iconOnly })}
      >
        {icon && (
          <span aria-hidden className="inline-flex">
            {icon}
          </span>
        )}
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={15} aria-hidden className={cx("transition-transform duration-(--duration-fast)", open && "rotate-180")} />}
      </button>
      <div
        role="menu"
        id={`${id}-m`}
        aria-labelledby={`${id}-b`}
        hidden={!open}
        onKeyDown={onMenuKey}
        className={cx(
          "ds-popover absolute top-full z-50 mt-1.5 flex min-w-52 flex-col p-1",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {items.map((it, i) => {
          if (it.separator) return <div key={`s${i}`} role="separator" className="my-1 h-px bg-line" />;
          ai++;
          const index = ai;
          const cls = cx(
            "flex min-h-control-sm w-full items-center gap-2.5 rounded-xs px-2.5 text-left text-body whitespace-nowrap transition-colors duration-(--duration-fast) max-sm:min-h-control-lg",
            "focus-visible:outline-offset-0 hover:bg-surface-sunken focus:bg-surface-sunken",
            it.danger ? "text-danger-ink" : "text-ink",
            it.disabled && "cursor-not-allowed text-text-disabled hover:bg-transparent",
          );
          const content = (
            <>
              {it.icon && (
                <span aria-hidden className={cx("inline-flex", it.danger ? "text-danger" : "text-text-2")}>
                  {it.icon}
                </span>
              )}
              {it.label}
            </>
          );
          const ref = (el: HTMLElement | null) => {
            itemRefs.current[index] = el;
          };
          if (it.href && !it.disabled)
            return (
              <Link key={i} ref={ref} href={it.href} role="menuitem" tabIndex={-1} className={cls} onClick={() => setOpen(false)}>
                {content}
              </Link>
            );
          return (
            <button
              key={i}
              ref={ref}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={it.disabled || undefined}
              className={cls}
              onClick={() => {
                if (it.disabled) return;
                close(true);
                it.onSelect?.();
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
