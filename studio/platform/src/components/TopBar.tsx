"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { cx } from "@/components/ds/cx";
import { Wordmark } from "@/components/ds/Wordmark";
import { MODE_INFO } from "@/lib/modes";

/**
 * Barre supérieure de l'espace connecté sur mobile et tablette (< 1024 px) : bouton du tiroir de
 * navigation (même contenu que la barre latérale) et mot-symbole. Masquée sur ordinateur, où la
 * barre latérale est toujours visible.
 */
export function TopBar({ onOpenNavigation, navigationOpen }: { onOpenNavigation: () => void; navigationOpen: boolean }) {
  return (
    // Barre collante : la page réserve sa hauteur (scroll-padding) pour qu'un élément qui reçoit le focus ne
    // soit jamais caché dessous (WCAG 2.4.11).
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-canvas px-2 sm:px-4 lg:hidden max-lg:[:root:has(&)]:scroll-pt-16">
      <button
        type="button"
        onClick={onOpenNavigation}
        aria-haspopup="dialog"
        aria-expanded={navigationOpen}
        className="btn btn-ghost gap-2 px-2.5 text-ink"
      >
        <Menu size={20} aria-hidden />
        Menu
      </button>
      <Link href="/espace" className="ml-1 inline-flex min-h-11 items-center rounded-control px-1">
        <Wordmark size="sm" />
      </Link>
    </header>
  );
}

/** Parcours en cours : mode local (données de référence, aucun agent) ou agents réels. */
export function ModeBadge({ mode }: { mode: keyof typeof MODE_INFO }) {
  const info = MODE_INFO[mode];
  const real = info.group === "real";
  return (
    <span
      data-mode={info.group}
      title={info.detail}
      className={cx("ds-badge", real ? "bg-accent-soft text-accent-ink" : "bg-warning-soft text-warning-ink")}
    >
      {info.badge}
    </span>
  );
}
