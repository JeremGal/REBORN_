"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type FocusEvent, type ReactElement, type ReactNode } from "react";
import { cx } from "./cx";

type TriggerProps = {
  "aria-describedby"?: string;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
};

/**
 * Info-bulle (WCAG 1.4.13) : s'ouvre au survol ET au focus clavier, reste ouverte quand le pointeur
 * passe dessus, se ferme avec Échap sans déplacer le focus. Le texte est relié au déclencheur par
 * `aria-describedby` (sauf `decorative`, quand il répète déjà le nom accessible, ex. IconButton).
 * L'enfant doit être un élément focalisable (bouton, lien…) qui transmet ses props au DOM.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  decorative = false,
  delay = 250,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  decorative?: boolean;
  delay?: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (ms: number) => {
    clear();
    if (ms <= 0) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), ms);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // Échap ferme d'abord l'info-bulle (pas la fenêtre qui la contient)
      e.stopPropagation();
      hide();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => clear, []);

  const child = Children.only(children);
  if (!isValidElement<TriggerProps>(child)) return child;
  const p = child.props;
  const trigger = cloneElement(child, {
    "aria-describedby": decorative ? p["aria-describedby"] : cx(p["aria-describedby"], id) || undefined,
    onFocus: (e: FocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      if (e.currentTarget.matches(":focus-visible")) show(0);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      hide();
    },
  });

  return (
    <span className="relative inline-flex max-w-full" onMouseEnter={() => show(delay)} onMouseLeave={hide}>
      {trigger}
      <span
        id={id}
        role={decorative ? undefined : "tooltip"}
        aria-hidden={decorative || undefined}
        hidden={!open}
        className={cx(
          "ds-tooltip",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
