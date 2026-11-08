"use client";

import Link from "next/link";
import { useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "./cx";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./styles";
import { Tooltip } from "./Tooltip";

type Own = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Opération en cours : `aria-busy`, indicateur, clics ignorés (pas de double soumission), le focus reste sur le bouton. */
  loading?: boolean;
  /** Libellé affiché pendant l'opération (ex. « Création… »). Par défaut : le libellé normal. */
  loadingText?: ReactNode;
  /** Icône avant le libellé (décorative : passer `aria-hidden` n'est pas nécessaire, elle est masquée). */
  icon?: ReactNode;
  /** Icône après le libellé. */
  iconEnd?: ReactNode;
  /** Pleine largeur. */
  block?: boolean;
};

type AsButton = Own & Omit<ComponentProps<"button">, keyof Own> & { href?: undefined };
type AsLink = Own & Omit<ComponentProps<typeof Link>, keyof Own> & { href: ComponentProps<typeof Link>["href"] };
export type ButtonProps = AsButton | AsLink;

function Spinner() {
  return <LoaderCircle size={16} strokeWidth={2.25} aria-hidden className="animate-spin" />;
}

function Decor({ children }: { children: ReactNode }) {
  return children ? (
    <span aria-hidden className="inline-flex shrink-0">
      {children}
    </span>
  ) : null;
}

/**
 * Bouton du design system. Rend un `<button type="button">` par défaut, ou un lien Next si `href` est fourni.
 * Si `onClick` renvoie une promesse, le bouton passe en chargement jusqu'à son règlement (pas de double soumission).
 */
export function Button(props: ButtonProps) {
  const [pending, setPending] = useState(false);
  const running = useRef(false);

  if (props.href !== undefined) {
    const { variant, size, loading: _loading, loadingText: _lt, icon, iconEnd, block, className, children, ...rest } = props;
    return (
      <Link {...rest} className={cx(buttonClasses({ variant, size, block }), className)}>
        <Decor>{icon}</Decor>
        {children}
        <Decor>{iconEnd}</Decor>
      </Link>
    );
  }

  const { variant, size, loading, loadingText, icon, iconEnd, block, className, children, onClick, type = "button", ...rest } = props;
  const busy = !!loading || pending;

  async function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (busy || running.current) {
      e.preventDefault(); // empêche aussi l'envoi du formulaire pour un bouton « submit »
      return;
    }
    const result = onClick?.(e) as unknown;
    if (result instanceof Promise) {
      running.current = true;
      setPending(true);
      try {
        await result;
      } finally {
        running.current = false;
        setPending(false);
      }
    }
  }

  return (
    <button
      {...rest}
      type={type}
      aria-busy={busy || undefined}
      aria-disabled={busy || rest["aria-disabled"] || undefined}
      onClick={handleClick}
      className={cx(buttonClasses({ variant, size, block }), className)}
    >
      {busy ? <Spinner /> : <Decor>{icon}</Decor>}
      {busy && loadingText ? loadingText : children}
      <Decor>{iconEnd}</Decor>
    </button>
  );
}

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  /** Nom accessible obligatoire (devient `aria-label`) ; affiché en info-bulle au survol et au focus. */
  label: string;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
  /** Info-bulle visuelle reprenant `label` (par défaut : oui). */
  tooltip?: boolean;
  tooltipAlign?: "center" | "start" | "end";
};

/** Bouton icône : le libellé est obligatoire (aria-label) et visible en info-bulle. */
export function IconButton({ label, icon, variant = "ghost", size = "md", tooltip = true, tooltipAlign, className, type = "button", ...rest }: IconButtonProps) {
  const button = (
    <button {...rest} type={type} aria-label={label} className={cx(buttonClasses({ variant, size, iconOnly: true }), className)}>
      <Decor>{icon}</Decor>
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} decorative align={tooltipAlign}>
      {button}
    </Tooltip>
  );
}
