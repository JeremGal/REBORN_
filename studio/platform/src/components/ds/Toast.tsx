"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cx } from "./cx";

export type ToastTone = "info" | "ok" | "warn" | "bad";
export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Durée d'affichage (ms) pour info/ok/warn ; ignorée pour les erreurs, qui restent jusqu'à fermeture. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};
type Toast = ToastInput & { id: number; tone: ToastTone };

type Ctx = { toast: (t: ToastInput) => number; dismiss: (id: number) => void };
const ToastContext = createContext<Ctx | null>(null);

/** Notifications : `const { toast } = useToast(); toast({ tone: "ok", title: "Projet créé" })`. */
export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé sous <ToastProvider>.");
  return ctx;
}

const ICON: Record<ToastTone, ReactNode> = {
  info: <Info size={18} className="text-text-2" />,
  ok: <CircleCheck size={18} className="text-accent" />,
  warn: <TriangleAlert size={18} className="text-warning" />,
  bad: <CircleAlert size={18} className="text-danger" />,
};
const MAX = 4;

/**
 * Pile de notifications. Deux régions vivantes présentes dès le chargement : « polite » (info,
 * succès, avertissement) et « assertive » (erreurs). Les erreurs ne disparaissent jamais seules ;
 * les autres s'effacent après `duration` (6 s), en pause au survol ou au focus.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setToasts((l) => {
      const next = [...l, { ...t, id, tone: t.tone ?? "info" }];
      // au-delà de MAX, on retire d'abord les plus anciennes notifications qui ne sont pas des erreurs
      while (next.length > MAX) {
        const i = next.findIndex((x) => x.tone !== "bad");
        next.splice(i >= 0 ? i : 0, 1);
      }
      return next;
    });
    return id;
  }, []);
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  const polite = toasts.filter((t) => t.tone !== "bad");
  const assertive = toasts.filter((t) => t.tone === "bad");

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={toasts.length ? "Notifications" : undefined}
        className="pointer-events-none fixed inset-x-4 bottom-4 z-70 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
      >
        <div role="alert" aria-live="assertive" aria-atomic="false" className="flex flex-col gap-2">
          {assertive.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
          {polite.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </section>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const persistent = t.tone === "bad";
  useEffect(() => {
    if (persistent || paused) return;
    const timer = setTimeout(() => onDismiss(t.id), t.duration ?? 6000);
    return () => clearTimeout(timer);
  }, [persistent, paused, t.duration, t.id, onDismiss]);

  return (
    <div
      className={cx("pointer-events-auto flex items-start gap-3 rounded-panel bg-surface py-3 pr-2 pl-4 shadow-overlay ring-1 ring-line enter", t.tone === "bad" && "ring-danger/40")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden className="mt-px inline-flex shrink-0">
        {ICON[t.tone]}
      </span>
      <div className="min-w-0 flex-1 py-px">
        <p className="text-body font-semibold text-ink">{t.title}</p>
        {t.description && <p className="mt-0.5 text-small leading-relaxed text-text-2">{t.description}</p>}
        {t.action && (
          <button
            type="button"
            className="ds-link mt-1.5 text-small"
            onClick={() => {
              t.action?.onClick();
              onDismiss(t.id);
            }}
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Fermer la notification" onClick={() => onDismiss(t.id)} className="btn btn-ghost btn-icon btn-sm shrink-0">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
