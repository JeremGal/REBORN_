import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatMoney, STATUS_LABEL } from "@/lib/engine/describe";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "accent" | "ghost" | "quiet" | "danger";

const BTN: Record<BtnVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 disabled:bg-dust",
  accent: "bg-verdigris text-white hover:bg-[#0e7f70] disabled:bg-dust",
  ghost: "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line-strong)] hover:bg-chalk disabled:text-dust",
  quiet: "text-sediment hover:text-ink hover:bg-chalk-2 disabled:text-dust",
  danger: "bg-paper text-rust shadow-[0_0_0_1px_var(--color-line-strong)] hover:bg-rust-soft",
};

export function Button({ variant = "primary", className, size = "md", ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-sm font-bold whitespace-nowrap transition-[background-color,color,transform] duration-150 ease-out-quint disabled:cursor-not-allowed",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
        BTN[variant],
        className,
      )}
    />
  );
}

export function ButtonLink({ variant = "ghost", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return (
    <Link
      {...p}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-sm px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-150",
        BTN[variant],
        className,
      )}
    />
  );
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
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="text-[15px] leading-snug font-bold tracking-[-0.01em]">{title}</h2>}
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
        tone === "ok" && "border-verdigris/30! bg-verdigris-soft! text-verdigris!",
        tone === "bad" && "border-rust/30! bg-rust-soft! text-rust!",
        tone === "warn" && "border-ochre/30! bg-ochre-soft! text-ochre!",
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  hypothesis: "bg-ochre-soft text-ochre",
  tested: "bg-[#e6ecf5] text-ink-3",
  validated: "bg-verdigris-soft text-verdigris",
  rejected: "bg-rust-soft text-rust line-through",
};

export function StatusBadge({ status }: { status?: string }) {
  const s = status ?? "hypothesis";
  return (
    <span className={cx("inline-flex h-5 items-center rounded-xs px-1.5 text-[11px] font-bold tracking-wide uppercase", STATUS_STYLE[s] ?? "bg-chalk-2 text-sediment")}>
      {STATUS_LABEL[s] ?? s}
    </span>
  );
}

export function Confidence({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-xs text-silt">—</span>;
  const pct = Math.round(value * 100);
  const tone = value >= 0.95 ? "bg-verdigris" : value >= 0.8 ? "bg-ink-3" : "bg-ochre";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Confiance ${pct} %`}>
      <span className="relative h-1 w-12 overflow-hidden rounded-full bg-chalk-2">
        <span className={cx("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular font-mono text-[11px] text-sediment">{pct}%</span>
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="text-[13px] font-bold text-ink">{title}</div>
      {hint && <div className="max-w-sm text-[13px] text-sediment">{hint}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function pct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  const n = Math.round(v * 100 * 10 ** digits) / 10 ** digits;
  return `${n.toLocaleString("fr-FR")} %`;
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-sediment">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-silt">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-9 w-full rounded-sm bg-chalk px-2.5 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none transition-shadow placeholder:text-silt focus:bg-paper focus:shadow-[inset_0_0_0_1.5px_var(--color-verdigris)]";
