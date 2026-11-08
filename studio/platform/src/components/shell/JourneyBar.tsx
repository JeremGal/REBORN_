import { cx } from "@/components/ds/cx";
import { JOURNEY_LABEL, REQUIRED_STEPS, requiredDone, type JourneyStep } from "./journey";

/**
 * Parcours compact d'un projet (8 segments) : le texte dit tout (étapes requises faites, prochaine étape ou
 * point à traiter) ; les segments ne font que le répéter visuellement (jamais la couleur seule). La Découverte,
 * facultative, n'est pas comptée tant qu'aucune exploration n'a eu lieu : un projet livré est à 7 sur 7.
 */
export function JourneyBar({ steps, className }: { steps: JourneyStep[]; className?: string }) {
  const count = requiredDone(steps);
  const attention = steps.find((s) => s.state === "attention");
  const next = steps.find((s) => s.state === "next");
  return (
    <div className={cx("min-w-0", className)}>
      <div aria-hidden className="flex gap-1">
        {steps.map((s) => (
          <span
            key={s.slug}
            title={`${s.label} : ${s.state === "attention" && s.reason ? s.reason : JOURNEY_LABEL[s.state]}`}
            className={cx(
              "h-1.5 flex-1 rounded-full",
              s.state === "done" && "bg-accent",
              s.state === "attention" && "bg-warning",
              s.state === "next" && "bg-ink",
              (s.state === "upcoming" || s.state === "optional") && "bg-surface-sunken ring-1 ring-line ring-inset",
            )}
          />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-2 text-small text-text-3">
        <span className="whitespace-nowrap">
          <span className="tabular font-semibold text-text-2">
            {count} sur {REQUIRED_STEPS}
          </span>{" "}
          étapes requises faites
        </span>
        {(attention || next) && <span className="sr-only">. </span>}
        {attention ? (
          <span className="whitespace-nowrap">
            À traiter : <span className="font-semibold text-warning-ink">{attention.label}</span>
          </span>
        ) : next ? (
          <span className="whitespace-nowrap">
            Prochaine : <span className="font-semibold text-ink">{next.label}</span>
          </span>
        ) : count === REQUIRED_STEPS ? (
          <span className="whitespace-nowrap">Parcours terminé</span>
        ) : null}
      </p>
    </div>
  );
}
