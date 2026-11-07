"use client";

import { useMemo } from "react";
import { useReborn } from "@/components/RebornProvider";
import { useProject } from "./ProjectProvider";
import { cx } from "@/components/ui";
import type { AgentEvent } from "@/lib/types";
import { Loading, Notice, ToneIcon, VERIFICATION_SHORT, duration, fmt, runTone, when, type RunMeta } from "./RunCommon";

/**
 * Historique des exécutions (GET /api/migration/runs), la plus récente en tête.
 * Choisir une exécution charge son détail (GET /api/migration/runs/[id]).
 */
export function RunHistoryList({ runs, selected, onSelect }: { runs: RunMeta[]; selected: string | null; onSelect: (id: string) => void }) {
  const list = [...runs].reverse();
  return (
    <ol aria-label="Exécutions de la migration">
      {list.map((r, i) => {
        const on = r.id === selected;
        const failed = r.status === "failed";
        return (
          <li key={r.id} className={cx(i > 0 && "border-t border-line")}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={on}
              className={cx(
                "relative flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors duration-150",
                on ? "bg-chalk" : "hover:bg-chalk/60",
              )}
            >
              {on && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-verdigris" />}
              <ToneIcon tone={runTone(r)} className="mt-[3px]" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[12px] font-bold text-ink">{r.id}</span>
                  <span className="tabular text-[11.5px] text-silt">{when(r.at)}</span>
                  {i === 0 && <span className="text-[11px] font-bold text-sediment">dernière</span>}
                </span>
                <span className="tabular block text-[12.5px] text-ink">
                  {failed ? "Interrompue · aucune donnée conservée" : `${fmt(r.summary.imported)} importés · ${fmt(r.summary.rejected)} rejetés`}
                </span>
                <span className="block text-[11.5px] text-silt">
                  {failed ? "Non vérifiée" : r.verification ? `Vérification : ${VERIFICATION_SHORT[r.verification]}` : "Vérification absente"} · correspondances v{r.mapping_version} ·{" "}
                  {duration(r.summary.duration_ms)} · {r.by}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const SOURCE: Record<AgentEvent["source"], string> = { platform: "REBORN", user: "Opérateur", analyst: "Analyste", explorer: "Explorer" };

/**
 * Journal d'exécution : évènements « migration » du Studio (GET /api/state), les plus récents en tête.
 * Les évènements ne portent pas l'identifiant du projet : seuls ceux enregistrés depuis la
 * création de ce projet sont retenus, et la page le dit.
 */
export function RunJournal({ since, limit = 30 }: { since: string; limit?: number }) {
  const { state, error } = useReborn();
  const { id: projectId } = useProject();
  const events = useMemo(() => {
    const all = state?.events ?? [];
    const out: AgentEvent[] = [];
    for (let i = all.length - 1; i >= 0 && out.length < limit; i--) {
      const e = all[i];
      // Évènements de ce projet (identifiant porté par l'évènement) ; anciens évènements sans identifiant : filtrés par date
      const pid = (e.data as { project_id?: string } | undefined)?.project_id;
      if (e.type === "migration" && (pid ? pid === projectId : e.ts >= since)) out.push(e);
    }
    return out;
  }, [state?.events, since, limit]);

  if (!state) return error ? <Notice tone="bad" title="Journal indisponible">{error}</Notice> : <Loading label="Chargement du journal…" />;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11.5px] text-silt">
        Journal commun du Studio : les évènements ne portent pas l&apos;identifiant du projet. Seuls ceux enregistrés depuis la création de ce projet sont affichés ({limit} au plus).
      </p>
      {events.length ? (
        <ol className="flex flex-col">
          {events.map((e, i) => (
            <li key={e.id} className={cx("py-2", i > 0 && "border-t border-line")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold tracking-[0.04em] text-sediment uppercase">{SOURCE[e.source] ?? e.source}</span>
                <time dateTime={e.ts} className="tabular shrink-0 text-[11px] text-silt">
                  {when(e.ts)}
                </time>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug font-bold text-ink">{e.title}</p>
              {e.detail && <p className="mt-0.5 text-[12px] leading-snug break-words text-sediment">{e.detail}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-3 text-[12.5px] text-sediment">Aucun évènement de migration depuis la création du projet.</p>
      )}
    </div>
  );
}
