"use client";

import { useMemo } from "react";
import { useReborn } from "@/components/RebornProvider";
import { useProject } from "./ProjectProvider";
import { cx } from "@/components/ds";
import type { AgentEvent } from "@/lib/types";
import { Callout } from "./Step";
import { Loading, ToneIcon, VERIFICATION_SHORT, duration, fmt, runTone, whenShort, type RunMeta } from "./RunCommon";
import { projectJournal } from "./view-rules";

/**
 * Historique des exécutions (GET /api/migration/runs), la plus récente en tête.
 * Choisir une exécution charge son détail (GET /api/migration/runs/[id]).
 */
export function RunHistoryList({ runs, selected, onSelect }: { runs: RunMeta[]; selected: string | null; onSelect: (id: string) => void }) {
  const list = [...runs].reverse();
  return (
    <ol aria-label="Exécutions de la migration" className="overflow-hidden rounded-panel ring-1 ring-line">
      {list.map((r, i) => {
        const on = r.id === selected;
        const failed = r.status === "failed";
        return (
          <li key={r.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={on}
              className={cx("relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-(--duration-fast)", on ? "bg-surface-sunken" : "hover:bg-canvas")}
            >
              {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
              <ToneIcon tone={runTone(r)} className="mt-[3px]" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-small font-semibold text-ink">{r.id}</span>
                    <span className="tabular text-small text-text-3">{whenShort(r.at)}</span>
                    {i === 0 && <span className="text-meta font-semibold text-text-2">la plus récente</span>}
                  </span>
                  <span className="block text-small text-text-2">
                    {failed ? "Non vérifiée" : r.verification ? `Vérification : ${VERIFICATION_SHORT[r.verification]}` : "Vérification absente"} · correspondances v{r.mapping_version} ·{" "}
                    {duration(r.summary.duration_ms)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-body text-ink">
                  {failed ? "Interrompue, aucune donnée conservée" : `${fmt(r.summary.imported)} transférées · ${fmt(r.summary.rejected)} rejetées`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const SOURCE: Record<AgentEvent["source"], string> = { platform: "REBORN", user: "Vous ou votre équipe", analyst: "Analyste", explorer: "Agent d'analyse" };

/**
 * Journal de migration : évènements « migration » du projet (flux du Studio), les plus récents en tête.
 * Seuls les évènements portant l'identifiant du projet sont retenus (lot C4) : plus aucun repli par date,
 * qui mêlait au journal d'un projet des évènements sans projet (atelier, ancien journal global) pour l'équipe.
 * `since` (création du projet) est conservé pour compatibilité, il ne sert plus au filtrage.
 */
export function RunJournal({ limit = 30 }: { since?: string; limit?: number }) {
  const { state, error } = useReborn();
  const { id: projectId } = useProject();
  const events = useMemo(() => projectJournal<AgentEvent>(state?.events ?? [], projectId, limit), [state?.events, limit, projectId]);

  if (!state)
    return error ? (
      <Callout tone="bad" title="Journal indisponible">
        {error}
      </Callout>
    ) : (
      <Loading label="Chargement du journal…" />
    );
  if (!events.length) return <p className="text-body text-text-2">Aucun évènement de migration depuis la création du projet.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col">
        {events.map((e) => (
          <li key={e.id} className="grid gap-x-4 gap-y-0.5 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0 sm:grid-cols-[150px_minmax(0,1fr)]">
            <p className="flex items-baseline gap-2 text-small sm:flex-col sm:gap-0">
              <time dateTime={e.ts} className="tabular text-text-3">
                {whenShort(e.ts)}
              </time>
              <span className="font-semibold text-text-2">{SOURCE[e.source] ?? e.source}</span>
            </p>
            <div className="min-w-0">
              <p className="text-body leading-snug font-semibold text-ink">{e.title}</p>
              {e.detail && <p className="mt-0.5 text-small leading-snug break-words text-text-2">{e.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-small text-text-3">{fmt(limit)} évènements au plus, ceux de ce projet uniquement.</p>
    </div>
  );
}
