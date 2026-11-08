"use client";

import { createContext, useContext, useId, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, Search, X } from "lucide-react";
import { cx } from "./cx";
import { controlClasses, type ControlSize } from "./styles";

/* ------------------------------------------------------------------ */
/* Field : libellé, aide, erreur, succès — reliés au champ               */
/* ------------------------------------------------------------------ */

type FieldCtx = { id: string; describedBy?: string; invalid: boolean; required: boolean; disabled: boolean };
const FieldContext = createContext<FieldCtx | null>(null);

/** Lit le contexte du Field parent (id, aria-describedby, aria-invalid, required). */
export function useField() {
  return useContext(FieldContext);
}

const merge = (...ids: (string | undefined | false | null)[]) => ids.filter(Boolean).join(" ") || undefined;

export type FieldProps = {
  label: ReactNode;
  /** Aide affichée sous le libellé, annoncée avec le champ (aria-describedby). */
  hint?: ReactNode;
  /** Message d'erreur : bordure rouille, `aria-invalid`, message relié. Dire ce qui s'est passé et quoi faire. */
  error?: ReactNode;
  /** Confirmation (ex. « Adresse vérifiée »), reliée au champ. */
  success?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Libellé visuellement masqué (toujours lu par les lecteurs d'écran). */
  labelHidden?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Champ de formulaire. L'enfant (Input, Select, Textarea, PasswordInput…) reçoit automatiquement
 * `id`, `aria-describedby`, `aria-invalid` et `required` par contexte.
 */
export function Field({ label, hint, error, success, required = false, disabled = false, labelHidden, id, className, children }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? `f${auto}`;
  const hintId = hint ? `${fieldId}-aide` : undefined;
  const msgId = error || success ? `${fieldId}-message` : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={fieldId} className={labelHidden ? "sr-only" : "ds-label"}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-ink">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="ds-hint -mt-0.5">
          {hint}
        </p>
      )}
      <FieldContext.Provider value={{ id: fieldId, describedBy: merge(hintId, msgId), invalid: !!error, required, disabled }}>{children}</FieldContext.Provider>
      {error ? (
        <p id={msgId} className="ds-error">
          <CircleAlert size={15} aria-hidden />
          <span>{error}</span>
        </p>
      ) : success ? (
        <p id={msgId} className="ds-success">
          <CircleCheck size={15} aria-hidden />
          <span>{success}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fusionne les attributs du Field parent avec ceux passés au champ. Dans un Field, l'identifiant
 * est celui du Field (passer `id` au Field, pas au champ) : le libellé reste toujours associé.
 */
function useControlProps<P extends { id?: string; required?: boolean; disabled?: boolean; "aria-describedby"?: string; "aria-invalid"?: ComponentProps<"input">["aria-invalid"] }>(p: P) {
  const f = useField();
  return {
    ...p,
    id: f?.id ?? p.id,
    required: p.required ?? (f?.required || undefined),
    disabled: p.disabled ?? (f?.disabled || undefined),
    "aria-describedby": merge(f?.describedBy, p["aria-describedby"]),
    "aria-invalid": p["aria-invalid"] ?? (f?.invalid ? true : undefined),
  };
}

/* ------------------------------------------------------------------ */
/* Champs                                                               */
/* ------------------------------------------------------------------ */

export type InputProps = Omit<ComponentProps<"input">, "size"> & { size?: ControlSize };

export function Input({ size = "md", className, ...rest }: InputProps) {
  const p = useControlProps(rest);
  return <input {...p} className={cx(controlClasses(size), className)} />;
}

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  const p = useControlProps(rest);
  return <textarea rows={rows} {...p} className={cx(controlClasses("md"), className)} />;
}

export type SelectProps = Omit<ComponentProps<"select">, "size"> & { size?: ControlSize };

/** Liste déroulante native, stylée ; chevron décoratif posé par-dessus (le fond reste uni, contraste mesurable). */
export function Select({ size = "md", className, children, ...rest }: SelectProps) {
  const p = useControlProps(rest);
  return (
    <div className="relative min-w-0">
      <select {...p} className={cx(controlClasses(size), "ds-select-plain", className)}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden className={cx("pointer-events-none absolute top-1/2 right-3 -translate-y-1/2", p.disabled ? "text-text-disabled" : "text-text-2")} />
    </div>
  );
}

export type PasswordInputProps = Omit<InputProps, "type"> & {
  /** `current-password` (connexion) ou `new-password` (création) : transmis tel quel au navigateur. */
  autoComplete?: "current-password" | "new-password" | "off";
  showLabel?: string;
};

/**
 * Mot de passe avec bouton « Afficher » (aria-pressed, aria-controls). En clair, la correction
 * orthographique est coupée (aucun envoi du texte à un service de correction du navigateur).
 */
export function PasswordInput({ size = "md", className, autoComplete = "current-password", showLabel = "Afficher le mot de passe", ...rest }: PasswordInputProps) {
  const p = useControlProps(rest);
  const auto = useId();
  const id = p.id ?? `pw${auto}`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...p}
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cx(controlClasses(size), "pr-12", className)}
      />
      <button
        type="button"
        aria-label={showLabel}
        aria-pressed={visible}
        aria-controls={id}
        disabled={p.disabled}
        onClick={() => setVisible((v) => !v)}
        className="btn btn-ghost btn-icon btn-sm absolute top-1/2 right-1 -translate-y-1/2 max-sm:right-0 pointer-coarse:right-0"
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}

export type SearchInputProps = Omit<InputProps, "type" | "value" | "onChange"> & {
  label: string;
  /** Libellé visible au-dessus du champ (par défaut : masqué visuellement, lu par les lecteurs d'écran). */
  labelVisible?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  /** Ajoute le repère ARIA `search` (une seule recherche principale par page). */
  landmark?: boolean;
  clearLabel?: string;
};

/** Champ de recherche : `type=search`, libellé obligatoire, bouton d'effacement. */
export function SearchInput({ label, labelVisible, value, onValueChange, landmark, clearLabel = "Effacer la recherche", size = "md", className, id, ...rest }: SearchInputProps) {
  const auto = useId();
  const inputId = id ?? `s${auto}`;
  const body = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className={labelVisible ? "ds-label" : "sr-only"}>
        {label}
      </label>
      <div className="relative">
        <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3" />
        <input
          {...rest}
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            rest.onKeyDown?.(e);
            if (e.key === "Escape" && value) {
              e.preventDefault();
              onValueChange("");
            }
          }}
          className={cx(controlClasses(size), "pl-9", value && "pr-11", className)}
        />
        {value && (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => onValueChange("")}
            className="btn btn-ghost btn-icon btn-sm absolute top-1/2 right-1 -translate-y-1/2 max-sm:right-0 pointer-coarse:right-0"
          >
            <X size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
  return landmark ? (
    <div role="search" aria-label={label}>
      {body}
    </div>
  ) : (
    body
  );
}

/* ------------------------------------------------------------------ */
/* Cases à cocher et boutons radio                                      */
/* ------------------------------------------------------------------ */

export type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** État mixte (aria : « partiellement coché »). */
  indeterminate?: boolean;
};

/** Case à cocher native (jamais pré-cochée par le design system), libellé cliquable ≥ 44 px de haut sur mobile. */
export function Checkbox({ label, hint, error, indeterminate, className, id, ...rest }: CheckboxProps) {
  const auto = useId();
  const boxId = id ?? `c${auto}`;
  const hintId = hint ? `${boxId}-aide` : undefined;
  const errId = error ? `${boxId}-erreur` : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={boxId} className={cx("flex min-h-6 cursor-pointer items-start gap-2.5 py-0.5 text-body text-ink max-sm:min-h-11 max-sm:py-2.5", rest.disabled && "cursor-not-allowed text-text-disabled")}>
        <input
          {...rest}
          id={boxId}
          type="checkbox"
          ref={(el) => {
            if (el) el.indeterminate = !!indeterminate;
            const r = rest.ref;
            if (typeof r === "function") r(el);
            else if (r) r.current = el;
          }}
          aria-describedby={merge(hintId, errId, rest["aria-describedby"])}
          aria-invalid={error ? true : rest["aria-invalid"]}
          className="ds-check"
        />
        <span className="min-w-0">{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="ds-hint pl-7">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="ds-error pl-7">
          <CircleAlert size={15} aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export type RadioOption = { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

/** Groupe de boutons radio : `fieldset` + `legend`, aide et erreur reliées au groupe. */
export function RadioGroup({
  legend,
  name,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  disabled,
  orientation = "vertical",
  legendHidden,
  className,
}: {
  legend: ReactNode;
  name: string;
  value: string | null;
  onChange: (value: string) => void;
  options: RadioOption[];
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  orientation?: "vertical" | "horizontal";
  legendHidden?: boolean;
  className?: string;
}) {
  const auto = useId();
  const hintId = hint ? `r${auto}-aide` : undefined;
  const errId = error ? `r${auto}-erreur` : undefined;
  return (
    <fieldset className={cx("min-w-0", className)} aria-describedby={merge(hintId, errId)} disabled={disabled}>
      <legend className={legendHidden ? "sr-only" : "ds-label mb-1.5"}>
        {legend}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger-ink">
            *
          </span>
        )}
      </legend>
      {hint && (
        <p id={hintId} className="ds-hint mb-2">
          {hint}
        </p>
      )}
      <div className={cx("flex", orientation === "vertical" ? "flex-col gap-1" : "flex-wrap gap-x-6 gap-y-1")}>
        {options.map((o, i) => {
          const optId = `r${auto}-${i}`;
          const optHint = o.hint ? `${optId}-aide` : undefined;
          const off = disabled || o.disabled;
          return (
            <div key={o.value} className="flex min-w-0 flex-col">
              <label htmlFor={optId} className={cx("flex min-h-6 cursor-pointer items-start gap-2.5 py-0.5 text-body text-ink max-sm:min-h-11 max-sm:py-2.5", off && "cursor-not-allowed text-text-disabled")}>
                <input
                  id={optId}
                  type="radio"
                  name={name}
                  value={o.value}
                  checked={value === o.value}
                  onChange={() => onChange(o.value)}
                  disabled={o.disabled}
                  required={required}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={optHint}
                  className="ds-radio"
                />
                <span className="min-w-0">{o.label}</span>
              </label>
              {o.hint && (
                <p id={optHint} className="ds-hint pl-7">
                  {o.hint}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errId} className="ds-error mt-1.5">
          <CircleAlert size={15} aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
