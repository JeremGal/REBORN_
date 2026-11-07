"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Check, Pause } from "lucide-react";
import { cx } from "@/components/ui";
import { useReborn } from "@/components/RebornProvider";
import { projectCall, useProject, type ProjectStatus, type ProjectSummary } from "./ProjectProvider";

/**
 * Étapes du parcours, dans l'ordre des dépendances réelles : on ne peut pas vérifier une
 * migration qui n'a pas eu lieu, ni livrer un logiciel sans base migrée et vérifiée.
 */
export const STEPS = [
  { slug: "connexion", label: "Connexion", hint: "Accès autorisé à l'ancien logiciel" },
  { slug: "decouverte", label: "Découverte", hint: "Écrans, fonctions, règles observés" },
  { slug: "extraction", label: "Données", hint: "Exports et fichiers récupérés" },
  { slug: "correspondances", label: "Correspondances", hint: "Ancien schéma → nouveau" },
  { slug: "migration", label: "Migration", hint: "Nouvelle base construite" },
  { slug: "validation", label: "Validation", hint: "Contrôles sur les vraies données" },
  { slug: "reconstruction", label: "Reconstruction", hint: "Logiciel et règles métier" },
  { slug: "livraison", label: "Livraison", hint: "Logiciel autonome en service" },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"];

export const STATUS_TONE: Record<ProjectStatus, "ok" | "warn" | "bad" | "run" | "idle"> = {
  CREATED: "idle",
  CONNECTION_PENDING: "warn",
  CONNECTED: "ok",
  DISCOVERING: "run",
  EXTRACTING: "run",
  MAPPING: "run",
  RECONSTRUCTING: "run",
  MIGRATING: "run",
  VALIDATING: "run",
  READY_FOR_REVIEW: "ok",
  PUBLISHED: "ok",
  PAUSED: "idle",
  FAILED: "bad",
  NEEDS_HUMAN_REVIEW: "warn",
};

export function StatusPill({ status, label, className }: { status: ProjectStatus; label: string; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 text-[11.5px] leading-5 font-bold whitespace-nowrap",
        tone === "ok" && "bg-verdigris-soft text-[#0b6b5f]",
        tone === "warn" && "bg-ochre-soft text-ochre",
        tone === "bad" && "bg-rust-soft text-rust",
        tone === "run" && "bg-[#e7eef8] text-[#2457a6]",
        tone === "idle" && "bg-chalk text-sediment",
        className,
      )}
    >
      {status === "PAUSED" ? <Pause size={11} /> : tone === "bad" || tone === "warn" ? <AlertTriangle size={11} /> : tone === "ok" ? <Check size={11} /> : <span className={cx("size-1.5 rounded-full bg-current", tone === "run" && "live-dot")} />}
      {label}
    </span>
  );
}

/** Une étape est « faite » uniquement sur la base de faits renvoyés par l'API (pas d'estimation). */
function stepDone(slug: StepSlug, s: ProjectSummary, investigations: number): boolean {
  const done = (id: string) => s.progress.steps.find((x) => x.id === id)?.done ?? false;
  switch (slug) {
    case "connexion":
      return done("connection");
    case "decouverte":
      return investigations > 0;
    case "extraction":
      return done("extraction");
    case "correspondances":
      return done("mapping");
    case "migration":
      return s.data.imported > 0;
    case "validation":
      return done("migration");
    case "reconstruction":
      return done("rules") || !!s.app;
    case "livraison":
      return done("delivery");
  }
}

export function ProjectShell({ children }: { children: React.ReactNode }) {
  const { id, summary, error, refresh } = useProject();
  const { state } = useReborn();
  const path = usePathname();
  const investigations = state?.investigations?.filter((i) => i.project_id === id).length ?? 0;

  if (error && !summary) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-bold">Projet introuvable</h1>
        <p className="mt-1 text-[13px] text-sediment">{error}</p>
        <Link href="/" className="mt-3 inline-block text-[13px] font-bold text-verdigris underline">
          Retour aux projets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <Link href="/" className="text-[12px] font-bold text-silt hover:text-ink">
            ← Projets
          </Link>
          <h1 className="mt-1 truncate text-[24px] leading-tight font-black tracking-[-0.025em]">{summary?.company ?? summary?.name ?? "…"}</h1>
          <p className="mt-0.5 truncate text-[13px] text-sediment">
            {summary?.software ?? "Logiciel historique non précisé"}
            {summary?.legacy_url && <span className="font-mono text-[12px] text-silt"> · {summary.legacy_url}</span>}
          </p>
        </div>
        {summary && (
          <div className="flex min-w-0 flex-col items-end gap-1">
            <StatusPill status={summary.status} label={summary.status_label} />
            {summary.status_reason && <p className="max-w-[460px] truncate text-right text-[12px] text-silt" title={summary.status_reason}>{summary.status_reason}</p>}
          </div>
        )}
      </header>

      <nav aria-label="Étapes du projet" className="card overflow-x-auto">
        <ol className="flex min-w-max">
          {STEPS.map((step, i) => {
            const on = path.endsWith(`/${step.slug}`);
            const done = summary ? stepDone(step.slug, summary, investigations) : false;
            return (
              <li key={step.slug} className="flex-1">
                <Link
                  href={`/projets/${id}/${step.slug}`}
                  aria-current={on ? "step" : undefined}
                  className={cx("relative flex h-full min-w-[132px] items-start gap-2.5 px-3.5 py-3 transition-colors duration-150", on ? "bg-chalk" : "hover:bg-chalk/60", i > 0 && "border-l border-line")}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px] font-bold",
                      done ? "bg-verdigris text-white" : on ? "bg-ink text-white" : "bg-chalk text-silt shadow-[inset_0_0_0_1px_var(--color-line-strong)]",
                    )}
                  >
                    {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-[13px] leading-tight font-bold", on ? "text-ink" : "text-sediment")}>{step.label}</span>
                    <span className="block text-[11px] leading-tight text-silt">{step.hint}</span>
                  </span>
                  {on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-verdigris" />}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      {summary?.status === "PAUSED" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-chalk px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
          <p className="flex items-center gap-2 text-[13px] text-sediment">
            <Pause size={14} aria-hidden /> <b className="text-ink">Projet en pause.</b> Toutes les opérations d&apos;écriture sont bloquées par le serveur jusqu&apos;à la reprise.
          </p>
          <button
            type="button"
            className="rounded-sm bg-ink px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-ink-2"
            onClick={() => void projectCall(id, "PATCH", `/api/projects/${id}`, { action: "resume" }).then(() => refresh())}
          >
            Reprendre le projet
          </button>
        </div>
      )}

      <div>{children}</div>
    </div>
  );
}
