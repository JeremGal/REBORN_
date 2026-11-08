import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cx } from "./cx";

export type AlertTone = "info" | "ok" | "warn" | "bad";

const ALERT: Record<AlertTone, { icon: ReactNode; box: string; iconCls: string }> = {
  info: { icon: <Info size={18} />, box: "bg-surface-sunken", iconCls: "text-text-2" },
  ok: { icon: <CircleCheck size={18} />, box: "bg-accent-soft", iconCls: "text-accent" },
  warn: { icon: <TriangleAlert size={18} />, box: "bg-warning-soft", iconCls: "text-warning" },
  bad: { icon: <CircleAlert size={18} />, box: "bg-danger-soft", iconCls: "text-danger" },
};

/**
 * Message contextuel (une ou deux phrases : ce qui s'est passé, quoi faire).
 * `live` : « polite » → role=status, « assertive » → role=alert, « off » → aucun rôle (message statique).
 * Par défaut : alert pour `bad`, status pour les autres tons.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  icon,
  live,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  live?: "polite" | "assertive" | "off";
  className?: string;
}) {
  const a = ALERT[tone];
  const mode = live ?? (tone === "bad" ? "assertive" : "polite");
  const role = mode === "assertive" ? "alert" : mode === "polite" ? "status" : undefined;
  return (
    <div role={role} className={cx("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-panel px-4 py-3 text-body text-ink", a.box, className)}>
      <span aria-hidden className={cx("mt-px inline-flex shrink-0", a.iconCls)}>
        {icon ?? a.icon}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cx("leading-relaxed text-text-2", !!title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 self-center max-sm:basis-full max-sm:pl-8">{action}</div>}
    </div>
  );
}
