import { cx } from "./cx";

/*
 * Classes partagées du design system (définies dans app/globals.css, couche « components »).
 * Fonctions pures, sans « use client » : utilisables depuis un composant serveur.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "danger-subtle";
export type ButtonSize = "sm" | "md" | "lg";
export type ControlSize = "sm" | "md" | "lg";

/** Classes d'un bouton : `primary` anthracite, `accent` réservé aux validations, `danger` décisif, `danger-subtle` dans le contenu. */
export function buttonClasses({ variant = "primary", size = "md", iconOnly = false, block = false }: { variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; block?: boolean } = {}) {
  return cx("btn", size !== "md" && `btn-${size}`, `btn-${variant}`, iconOnly && "btn-icon", block && "w-full");
}

/** Classes d'un champ de saisie (input, select, textarea). */
export function controlClasses(size: ControlSize = "md") {
  return cx("ds-control", size === "sm" && "ds-control-sm", size === "lg" && "ds-control-lg");
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "running";

/** Fond + texte d'un ton (contrastes ≥ 4,5:1, voir globals.css). */
export const TONE_SURFACE: Record<Tone, string> = {
  ok: "bg-accent-soft text-accent-ink",
  warn: "bg-warning-soft text-warning-ink",
  bad: "bg-danger-soft text-danger-ink",
  info: "bg-surface-sunken text-ink",
  neutral: "bg-surface-sunken text-text-2",
  running: "bg-accent-soft text-accent-ink",
};

/** Couleur d'icône d'un ton (≥ 3:1 sur son fond). */
export const TONE_ICON: Record<Tone, string> = {
  ok: "text-accent",
  warn: "text-warning",
  bad: "text-danger",
  info: "text-text-2",
  neutral: "text-text-3",
  running: "text-accent",
};
