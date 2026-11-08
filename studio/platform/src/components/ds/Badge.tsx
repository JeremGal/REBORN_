import type { ReactNode } from "react";
import { Check, Circle, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cx } from "./cx";
import { TONE_ICON, TONE_SURFACE, type Tone } from "./styles";

/** Étiquette courte (catégorie, version, compteur). Pour un état, utiliser StatusBadge (icône + texte). */
export function Badge({ tone = "neutral", icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("ds-badge", TONE_SURFACE[tone], className)}>
      {icon && (
        <span aria-hidden className={cx("inline-flex", TONE_ICON[tone])}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

const STATUS_ICON: Record<Tone, ReactNode> = {
  ok: <Check size={13} strokeWidth={2.75} />,
  warn: <TriangleAlert size={13} strokeWidth={2.25} />,
  bad: <X size={13} strokeWidth={2.75} />,
  info: <Info size={13} strokeWidth={2.25} />,
  neutral: <Circle size={9} strokeWidth={3} />,
  running: <LoaderCircle size={13} strokeWidth={2.5} className="animate-spin" />,
};

/**
 * État : toujours une icône ET un texte (jamais la couleur seule).
 * Tons : ok (validé, vert-de-gris), warn (à vérifier, ocre), bad (échec, rouille), info, neutral, running (en cours).
 */
export function StatusBadge({ tone, children, className, title }: { tone: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("ds-badge", TONE_SURFACE[tone], className)}>
      <span aria-hidden className={cx("inline-flex", TONE_ICON[tone])}>
        {STATUS_ICON[tone]}
      </span>
      {children}
    </span>
  );
}
