"use client";

import { useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import type { ComputeResult, OutputField, TraceStep } from "@/lib/types";
import { formatCurrency, formatOutput, isMoneyVar } from "./format";

const STATUS_TXT: Record<string, string> = { hypothesis: "hypothèse", tested: "testée", validated: "validée", rejected: "rejetée" };

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface Line {
  key: string;
  label: string;
  value: string;
  tone?: "minus" | "plus";
  step?: TraceStep;
}

/** Détail du calcul, construit uniquement à partir de la trace du moteur. */
function breakdown(result: ComputeResult, currency: string): Line[] {
  const lines: Line[] = [];
  for (const t of result.trace) {
    if (!t.applied || !t.target) continue;
    if (!isMoneyVar(t.target)) continue; // variables métier : affichées dans les sorties
    if (t.stage === "base") {
      lines.push({ key: `${t.rule_id}-${t.target}`, label: t.label, value: formatCurrency(t.after ?? 0, currency), step: t });
    } else if (t.delta) {
      const minus = t.delta < 0;
      lines.push({ key: `${t.rule_id}-${t.target}-${lines.length}`, label: t.label, value: `${minus ? "−" : "+"} ${formatCurrency(Math.abs(t.delta), currency)}`, tone: minus ? "minus" : "plus", step: t });
    }
  }
  return lines;
}

export function ResultPanel({
  result,
  outputs,
  currency,
  provenance,
  available,
}: {
  result: ComputeResult | null;
  outputs: OutputField[];
  currency: string;
  provenance?: boolean;
  available: boolean;
}) {
  const [showSkipped, setShowSkipped] = useState(false);

  if (!available || !result) {
    return (
      <aside className="rounded-xl bg-ga-panel p-5 text-[13px] text-ga-muted" aria-live="polite">
        Calcul indisponible : le modèle métier n&apos;a pas encore été publié.
      </aside>
    );
  }

  const primary = outputs.find((o) => o.primary) ?? outputs[0];
  const secondary = outputs.filter((o) => o !== primary);

  if (result.status === "invalid") {
    return (
      <aside className="rounded-xl bg-ga-panel p-5" aria-live="polite">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ga-ink">
          <AlertTriangle size={16} className="text-ga-warn" /> Saisie incomplète ou invalide
        </div>
        <ul className="mt-2 space-y-1 text-[13px] text-ga-muted">
          {result.errors.map((e, i) => (
            <li key={i}>• {e.message}</li>
          ))}
        </ul>
      </aside>
    );
  }

  if (result.status === "rejected") {
    return (
      <aside className="rounded-xl bg-ga-danger-soft p-5" aria-live="polite">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-ga-danger">
          <Ban size={16} /> Demande refusée par une règle métier
        </div>
        {result.errors.map((e, i) => (
          <p key={i} className="mt-2 font-mono text-[13px] text-ga-ink">
            {e.message}
          </p>
        ))}
        {provenance && result.errors[0]?.rule_id && <p className="mt-2 text-[12px] text-ga-muted">Règle {result.errors[0].rule_id}</p>}
      </aside>
    );
  }

  const lines = breakdown(result, currency);
  const skipped = result.trace.filter((t) => !t.applied);

  return (
    <aside className="flex flex-col rounded-xl bg-ga-panel-strong p-5 text-white" aria-live="polite">
      <div className="text-[12px] font-semibold tracking-wide text-white/60 uppercase">{primary?.label ?? "Résultat"}</div>
      <div className="mt-1 text-[32px] leading-tight font-bold tracking-tight tabular-nums">{formatOutput(result.outputs[primary?.name ?? "total_price"], primary, currency)}</div>

      {secondary.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-white/12 pt-3">
          {secondary.map((o) => (
            <div key={o.name}>
              <dt className="text-[12px] text-white/60">{o.label ?? o.name}</dt>
              <dd className="text-[16px] font-semibold tabular-nums">{formatOutput(result.outputs[o.name], o, currency)}</dd>
            </div>
          ))}
        </dl>
      )}

      {lines.length > 0 && (
        <details className="group mt-4 border-t border-white/12 pt-3" open={provenance}>
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-white/70 hover:text-white">
            <span className="group-open:hidden">Afficher le détail du calcul</span>
            <span className="hidden group-open:inline">Détail du calcul</span>
          </summary>
          <dl className="mt-2 flex flex-col gap-2 text-[13px]">
            {lines.map((l) => (
              <div key={l.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="min-w-0 text-white/80">{l.label}</dt>
                  <dd className={cx("shrink-0 font-semibold tabular-nums", l.tone === "minus" && "text-[#7fd8b4]")}>{l.value}</dd>
                </div>
                {provenance && l.step && l.step.rule_id !== "(calcul)" && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-white/50">
                    <span className="rounded-sm bg-white/10 px-1.5 font-mono text-white/75">{l.step.rule_id}</span>
                    {l.step.evidence?.length ? <span>{l.step.evidence.length} preuve{l.step.evidence.length > 1 ? "s" : ""}</span> : null}
                    {l.step.validation_status && <span>· {STATUS_TXT[l.step.validation_status] ?? l.step.validation_status}</span>}
                  </div>
                )}
              </div>
            ))}
          </dl>
        </details>
      )}

      {result.warnings.length > 0 && (
        <ul className="mt-3 rounded-md bg-white/8 px-3 py-2 text-[12px] text-[#ffd59a]">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {provenance && skipped.length > 0 && (
        <div className="mt-3 border-t border-white/12 pt-3">
          <button type="button" onClick={() => setShowSkipped((s) => !s)} className="text-[12px] font-semibold text-white/60 hover:text-white">
            {showSkipped ? "Masquer" : "Voir"} les {skipped.length} règle{skipped.length > 1 ? "s" : ""} non appliquée{skipped.length > 1 ? "s" : ""}
          </button>
          {showSkipped && (
            <ul className="mt-2 flex flex-col gap-1">
              {skipped.map((t) => (
                <li key={t.rule_id} className="text-[12px] leading-snug text-white/55">
                  <span className="font-mono text-[11px] text-white/40">{t.rule_id}</span> {t.label} — <i>{t.reason}</i>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
