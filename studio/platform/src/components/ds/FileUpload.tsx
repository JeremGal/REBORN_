"use client";

import { useId, useState, type DragEvent, type ReactNode } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cx } from "./cx";
import { formatBytes } from "./format";

function accepts(file: File, accept?: string) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? file.type.startsWith(a.slice(0, -1)) : file.type === a));
}

/**
 * Dépôt de fichiers : vrai champ `<input type="file">` (focalisable, libellé) présenté comme un
 * bouton, zone de glisser-déposer autour, liste des fichiers retenus (avec retrait) et erreurs
 * de format ou de taille annoncées. Les fichiers ne sont pas envoyés : `onFilesChange` les reçoit.
 */
export function FileUpload({
  label,
  hint,
  accept,
  multiple = true,
  maxSizeBytes,
  files,
  onFilesChange,
  error,
  disabled,
  buttonLabel = "Choisir des fichiers",
  className,
}: {
  label: string;
  hint?: ReactNode;
  /** Ex. « .csv,.xlsx,application/json » */
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Erreur externe (ex. refus du serveur). */
  error?: ReactNode;
  disabled?: boolean;
  buttonLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  function add(list: FileList | File[]) {
    const incoming = Array.from(list);
    const problems: string[] = [];
    const ok: File[] = [];
    for (const f of incoming) {
      if (!accepts(f, accept)) problems.push(`${f.name} : format non accepté${accept ? ` (attendu : ${accept.split(",").join(", ")})` : ""}.`);
      else if (maxSizeBytes && f.size > maxSizeBytes) problems.push(`${f.name} : ${formatBytes(f.size)}, au-delà de la limite de ${formatBytes(maxSizeBytes)}.`);
      else ok.push(f);
    }
    setRejected(problems);
    if (!ok.length) return;
    const base = multiple ? files.filter((f) => !ok.some((n) => n.name === f.name && n.size === f.size)) : [];
    onFilesChange(multiple ? [...base, ...ok] : ok.slice(0, 1));
  }

  const drag = {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setOver(true);
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer.files?.length) add(e.dataTransfer.files);
    },
  };

  const hintId = hint ? `${id}-aide` : undefined;
  const errId = error || rejected.length ? `${id}-erreur` : undefined;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <p id={`${id}-l`} className="ds-label">
        {label}
      </p>
      {hint && (
        <p id={hintId} className="ds-hint -mt-0.5">
          {hint}
        </p>
      )}
      <div
        {...drag}
        className={cx(
          "flex flex-col items-center gap-3 rounded-panel border border-dashed px-5 py-6 text-center transition-colors duration-(--duration-fast) sm:flex-row sm:text-left",
          over ? "border-accent bg-accent-soft" : "border-control-border bg-surface-sunken/50",
          disabled && "opacity-60",
        )}
      >
        <Upload size={22} aria-hidden className={cx("shrink-0", over ? "text-accent" : "text-text-3")} />
        <div className="min-w-0 flex-1 text-body text-text-2">{over ? "Déposez les fichiers ici." : "Glissez-déposez vos fichiers ici, ou :"}</div>
        <input
          id={`${id}-in`}
          type="file"
          className="peer sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-labelledby={`${id}-l ${id}-btn`}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          aria-invalid={errId ? true : undefined}
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files);
            e.target.value = ""; // permet de choisir à nouveau le même fichier
          }}
        />
        <label
          id={`${id}-btn`}
          htmlFor={`${id}-in`}
          className={cx(
            "btn btn-secondary shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-focus-visible:outline-solid",
            disabled && "cursor-not-allowed text-text-disabled",
          )}
        >
          {buttonLabel}
        </label>
      </div>

      {(error || rejected.length > 0) && (
        <div id={errId} role="alert" className="ds-error flex-col gap-1">
          {error && <p>{error}</p>}
          {rejected.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul aria-label="Fichiers retenus" className="mt-1 flex flex-col divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <FileText size={16} aria-hidden className="shrink-0 text-text-3" />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{f.name}</span>
              <span className="tabular shrink-0 text-small text-text-3">{formatBytes(f.size)}</span>
              <button
                type="button"
                aria-label={`Retirer ${f.name}`}
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => onFilesChange(files.filter((x) => x !== f))}
                disabled={disabled}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
