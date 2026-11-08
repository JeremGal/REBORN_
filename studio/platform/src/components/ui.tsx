import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatMoney, STATUS_LABEL } from "@/lib/engine/describe";
import { StatusBadge as DsStatusBadge } from "./ds/Badge";
import { buttonClasses, controlClasses, type ButtonVariant, type Tone } from "./ds/styles";

/*
 * Kit historique des pages du Studio. Exports et signatures inchangés ; le rendu s'appuie
 * désormais sur le design system (components/ds, jetons dans app/globals.css).
 * Nouveaux écrans : importer directement depuis "@/components/ds".
 */

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "accent" | "ghost" | "quiet" | "danger";

/** Variantes historiques → variantes du design system. */
const VARIANT: Record<BtnVariant, ButtonVariant> = {
  primary: "primary",
  accent: "accent",
  ghost: "secondary",
  quiet: "ghost",
  danger: "danger-subtle",
};

export function Button({ variant = "primary", className, size = "md", ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return <button {...p} className={cx(buttonClasses({ variant: VARIANT[variant], size }), className)} />;
}

export function ButtonLink({ variant = "ghost", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link {...p} className={cx(buttonClasses({ variant: VARIANT[variant] }), className)} />;
}

/* ------------------------------------------------------------------ */

export function Panel({
  eyebrow,
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("card flex min-w-0 flex-col", className)}>
      {(title || eyebrow || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="text-lead font-semibold text-ink">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx("min-w-0 flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Specimen({ children, tone, className, title }: { children: ReactNode; tone?: "ok" | "bad" | "warn"; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "specimen inline-block",
        tone === "ok" && "border-accent/35 bg-accent-soft text-accent-ink",
        tone === "bad" && "border-danger/35 bg-danger-soft text-danger-ink",
        tone === "warn" && "border-warning/40 bg-warning-soft text-warning-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Statut d'une règle (hypothèse, testée, validée, rejetée) : icône + texte, jamais la couleur seule. */
const STATUS_TONE: Record<string, Tone> = {
  hypothesis: "warn",
  tested: "info",
  validated: "ok",
  rejected: "bad",
};

export function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "hypothesis";
  return <DsStatusBadge tone={STATUS_TONE[s] ?? "neutral"}>{STATUS_LABEL[s] ?? s}</DsStatusBadge>;
}

/** Pourcentage entier qui n'affiche jamais 100 % (ni 0 %) pour une valeur qui ne l'est pas. */
function wholePct(value: number) {
  const raw = value * 100;
  const n = Math.round(raw);
  if (n >= 100 && raw < 100) return Math.floor(raw * 10) / 10 >= 100 ? 99.9 : Math.floor(raw * 10) / 10;
  if (n <= 0 && raw > 0) return Math.ceil(raw * 10) / 10;
  return n;
}

export function Confidence({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-meta text-text-3">—</span>;
  const pct = wholePct(value);
  const label = `${pct.toLocaleString("fr-FR")}%`;
  const tone = value >= 0.95 ? "bg-accent" : value >= 0.8 ? "bg-ink-3" : "bg-warning";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Confiance ${pct.toLocaleString("fr-FR")} %`}>
      <span aria-hidden className="relative h-1.5 w-12 overflow-hidden rounded-full bg-surface-sunken">
        <span className={cx("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </span>
      <span className="tabular font-mono text-meta text-text-2">{label}</span>
    </span>
  );
}

export function Money({ value, className }: { value?: number | string | null; className?: string }) {
  return <span className={cx("tabular", className)}>{typeof value === "number" ? formatMoney(value) : value ?? "—"}</span>;
}

export function LegacyValue({ value }: { value?: unknown }) {
  return (
    <span className="legacy-value tabular text-[12px]" title="Valeur lue sur l'écran du logiciel historique">
      {typeof value === "number" ? value.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : String(value ?? "—")}
    </span>
  );
}

export function Empty({ title, hint, children }: { title: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="text-body font-semibold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-small leading-relaxed text-text-2">{hint}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * Part (0..1) → « 12,5 % ». Jamais « 100 % » pour une valeur inférieure à 1 (ni « 0 % » pour une
 * valeur positive) : la précision augmente au besoin (99,96 % reste 99,96 %).
 */
export function pct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  const raw = v * 100;
  let d = digits;
  let n = Math.round(raw * 10 ** d) / 10 ** d;
  while (d < 4 && ((n >= 100 && raw < 100) || (n <= 0 && raw > 0))) {
    d++;
    n = Math.round(raw * 10 ** d) / 10 ** d;
  }
  if (n >= 100 && raw < 100) n = Math.floor(raw * 10 ** d) / 10 ** d;
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: d })} %`;
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Champ historique : le libellé enveloppe le contrôle (association implicite) ; l'aide fait partie du libellé. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="ds-label">{label}</span>
      {children}
      {hint && <span className="ds-hint">{hint}</span>}
    </label>
  );
}

/** Classes d'un champ historique (input, select, textarea) : jetons du design system ; les utilitaires ajoutés surchargent. */
export const inputCls = controlClasses("md");
