"use client";

import { Minus, Plus } from "lucide-react";
import type { ResolvedField } from "@/lib/appschema";
import type { Primitive } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const inputBase =
  "h-10 w-full rounded-md bg-ga-field px-3 text-[14px] text-ga-ink shadow-[inset_0_0_0_1px_var(--color-ga-line)] outline-none transition-shadow placeholder:text-ga-faint focus:bg-white focus:shadow-[inset_0_0_0_1.5px_var(--color-ga-accent)] disabled:cursor-not-allowed disabled:opacity-60";

export interface Threshold {
  value: number;
  /** true : condition stricte (>), sinon ≥ */
  strict?: boolean;
  label: string;
}

/**
 * Contrôle de saisie générique : le rendu dépend uniquement du type et des
 * contraintes déclarés dans le schéma (jamais du nom du champ).
 */
export function FieldControl({
  field,
  value,
  error,
  onChange,
  onBlur,
  thresholds = [],
}: {
  field: ResolvedField;
  value: Primitive | undefined;
  error?: string;
  onChange: (v: Primitive) => void;
  onBlur?: () => void;
  thresholds?: Threshold[];
}) {
  const id = `ga-${field.name}`;
  const label = field.label ?? field.name.replace(/_/g, " ");
  const describedBy = [field.help && `${id}-help`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;

  if (!field.supported) {
    return (
      <div className="rounded-md border border-dashed border-ga-line p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ga-muted">{label}</span>
          <span className="rounded-sm bg-ga-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-ga-warn">Non reconstruit</span>
        </div>
        <p className="mt-1 text-[12px] text-ga-faint">Champ de type « {field.type} » présent dans l&apos;application d&apos;origine, non pris en charge par le générateur.</p>
      </div>
    );
  }

  const header = (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-ga-ink">
        {label}
        {field.required && <span className="ml-0.5 text-ga-danger" aria-hidden>*</span>}
      </label>
      {field.kind === "number" && (field.min !== undefined || field.max !== undefined) && (
        <span className="text-[12px] text-ga-faint tabular-nums">
          {field.min !== undefined && field.max !== undefined ? `${field.min} – ${field.max}` : field.min !== undefined ? `min. ${field.min}` : `max. ${field.max}`}
          {field.unit ? ` ${field.unit}` : ""}
        </span>
      )}
    </div>
  );
  const footer = (
    <>
      {field.help && !error && (
        <p id={`${id}-help`} className="mt-1 text-[12px] text-ga-faint">
          {field.help}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-[12px] font-medium text-ga-danger">
          {error}
        </p>
      )}
    </>
  );
  const invalid = error ? "shadow-[inset_0_0_0_1.5px_var(--color-ga-danger)]!" : "";

  /* Case à cocher ------------------------------------------------------ */
  if (field.kind === "boolean") {
    const checked = value === true;
    return (
      <div>
        <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors", checked ? "bg-ga-accent-soft" : "bg-ga-field hover:bg-ga-field-hover")}>
          <input
            id={id}
            name={field.name}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
            aria-describedby={describedBy}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-ga-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ga-ink">{label}</span>
            {field.help && <span className="block text-[12px] text-ga-muted">{field.help}</span>}
          </span>
        </label>
        {error && <p className="mt-1 text-[12px] font-medium text-ga-danger">{error}</p>}
      </div>
    );
  }

  /* Liste ---------------------------------------------------------------- */
  if (field.kind === "enum") {
    const opts = field.options ?? [];
    const current = String(value ?? "");
    const display =
      field.display && field.display !== "auto"
        ? field.display
        : opts.some((o) => o.description) || (opts.length <= 4 && opts.some((o) => (o.label ?? o.value).length > 22))
          ? "cards"
          : opts.length <= 4
            ? "segmented"
            : "select";

    if (!opts.length) {
      return (
        <div>
          {header}
          <input id={id} name={field.name} className={cx(inputBase, invalid)} value={current} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-describedby={describedBy} />
          {footer}
        </div>
      );
    }
    if (display === "select") {
      return (
        <div>
          {header}
          <select id={id} name={field.name} className={cx(inputBase, "pr-8", invalid)} value={current} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-describedby={describedBy}>
            {!field.required && <option value="">—</option>}
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label ?? o.value}
              </option>
            ))}
          </select>
          {footer}
        </div>
      );
    }
    return (
      <fieldset aria-describedby={describedBy}>
        <legend className="mb-1.5 text-[13px] font-semibold text-ga-ink">
          {label}
          {field.required && <span className="ml-0.5 text-ga-danger" aria-hidden>*</span>}
        </legend>
        <div className={display === "cards" ? "grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" : "inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-ga-field p-1"}>
          {opts.map((o) => {
            const on = current.toLowerCase() === o.value.toLowerCase();
            return display === "cards" ? (
              <label
                key={o.value}
                className={cx(
                  "flex cursor-pointer flex-col gap-0.5 rounded-lg p-3 transition-shadow has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ga-accent",
                  on ? "bg-ga-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-ga-accent)]" : "bg-white shadow-[inset_0_0_0_1px_var(--color-ga-line)] hover:shadow-[inset_0_0_0_1px_var(--color-ga-muted)]",
                )}
              >
                <input type="radio" name={field.name} value={o.value} checked={on} onChange={() => onChange(o.value)} onBlur={onBlur} className="sr-only" />
                <span className="font-mono text-[11px] text-ga-faint">{o.value}</span>
                <span className="text-[14px] leading-snug font-semibold text-ga-ink">{o.label ?? o.value}</span>
                {o.description && <span className="text-[12px] text-ga-muted">{o.description}</span>}
              </label>
            ) : (
              <label
                key={o.value}
                className={cx(
                  "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ga-accent",
                  on ? "bg-white text-ga-ink shadow-[0_0_0_1px_var(--color-ga-line),0_1px_2px_rgb(0_0_0/0.06)]" : "text-ga-muted hover:text-ga-ink",
                )}
              >
                <input type="radio" name={field.name} value={o.value} checked={on} onChange={() => onChange(o.value)} onBlur={onBlur} className="sr-only" />
                {o.label ?? o.value}
              </label>
            );
          })}
        </div>
        {footer}
      </fieldset>
    );
  }

  /* Nombre ---------------------------------------------------------------- */
  if (field.kind === "number") {
    const step = field.step ?? (field.integer ? 1 : undefined);
    const num = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
    const bump = (dir: 1 | -1) => {
      const s = step ?? 1;
      let next = (Number.isFinite(num) ? num : 0) + dir * s;
      next = Math.round(next / s) * s;
      next = Number(next.toFixed(6));
      if (field.min !== undefined) next = Math.max(field.min, next);
      if (field.max !== undefined) next = Math.min(field.max, next);
      onChange(next);
    };
    return (
      <div>
        {header}
        <div className="flex flex-wrap items-center gap-2">
          {step !== undefined && (
            <button type="button" onClick={() => bump(-1)} aria-label={`Diminuer ${label}`} className="flex size-10 items-center justify-center rounded-md bg-ga-field text-ga-ink hover:bg-ga-field-hover">
              <Minus size={15} />
            </button>
          )}
          <div className="relative w-36">
            <input
              id={id}
              name={field.name}
              inputMode="decimal"
              autoComplete="off"
              className={cx(inputBase, "text-right font-semibold tabular-nums", field.unit && "pr-10", invalid)}
              value={value === undefined ? "" : String(value)}
              onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))}
              onBlur={onBlur}
              aria-invalid={!!error}
              aria-describedby={describedBy}
            />
            {field.unit && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ga-faint">{field.unit}</span>}
          </div>
          {step !== undefined && (
            <button type="button" onClick={() => bump(1)} aria-label={`Augmenter ${label}`} className="flex size-10 items-center justify-center rounded-md bg-ga-field text-ga-ink hover:bg-ga-field-hover">
              <Plus size={15} />
            </button>
          )}
          {thresholds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 sm:ml-2">
              {thresholds.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onChange(t.strict ? t.value + (step ?? 1) : t.value)}
                  title={t.label}
                  className={cx("h-7 rounded-md px-2 text-[12px] font-semibold tabular-nums transition-colors", (t.strict ? num > t.value : num >= t.value) ? "bg-ga-accent-soft text-ga-accent" : "text-ga-muted hover:bg-ga-field")}
                >
                  {t.strict ? ">" : "≥"} {t.value.toLocaleString("fr-FR")}
                </button>
              ))}
            </div>
          )}
        </div>
        {footer}
      </div>
    );
  }

  /* Texte ------------------------------------------------------------------ */
  const text = String(value ?? "");
  return (
    <div>
      {header}
      <input
        id={id}
        name={field.name}
        className={cx(inputBase, invalid)}
        value={text}
        placeholder={field.placeholder}
        maxLength={field.max_length ? field.max_length + 10 : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={describedBy}
      />
      <div className="flex justify-between gap-2">
        <div className="min-w-0">{footer}</div>
        {field.max_length && <span className={cx("mt-1 shrink-0 text-[11px] tabular-nums", text.length > field.max_length ? "text-ga-danger" : "text-ga-faint")}>{text.length}/{field.max_length}</span>}
      </div>
    </div>
  );
}
