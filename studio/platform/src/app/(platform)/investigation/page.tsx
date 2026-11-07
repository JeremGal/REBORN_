"use client";

import { MODE_INFO } from "@/lib/modes";
import { useMemo, useState } from "react";
import { useReborn } from "@/components/RebornProvider";
import { EventFeed } from "@/components/EventFeed";
import { InvestigationTabs } from "@/components/InvestigationTabs";
import { Empty, LegacyValue, Panel, Specimen, cx } from "@/components/ui";
import { compareAll } from "@/lib/compare";
import type { AgentEvent } from "@/lib/types";

const FILTERS: { key: AgentEvent["source"] | "all"; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "explorer", label: "Explorer" },
  { key: "analyst", label: "Analyste" },
  { key: "platform", label: "REBORN" },
];

export default function InvestigationPage() {
  const { state, model, active, app } = useReborn();
  const form = app?.fields ?? [];
  const [invId, setInvId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AgentEvent["source"] | "all">("all");
  const selected = invId ?? active?.id ?? state?.investigations.at(-1)?.id ?? null;
  const inv = state?.investigations.find((i) => i.id === selected) ?? null;

  const events = useMemo(
    () => (state?.events ?? []).filter((e) => (!selected || e.investigation_id === selected || !e.investigation_id) && (filter === "all" || e.source === filter)),
    [state, selected, filter],
  );
  const report = useMemo(() => (state ? compareAll(model, state.observations, selected ?? "all", { fields: app?.fields }) : null), [state, model, selected, app]);
  const pending = useMemo(() => {
    const done = new Set(state?.observations.map((o) => o.request_id).filter(Boolean));
    return (state?.events ?? []).filter((e) => e.type === "experiment_request" && !done.has(e.id) && (!selected || e.investigation_id === selected));
  }, [state, selected]);

  if (!state) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">01 · Explorer — Computer Use</div>
          <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em]">Exploration du logiciel historique</h1>
          {inv && (
            <p className="mt-1 text-[13px] text-sediment">
              {inv.application} · module {inv.module} · <span className="font-mono text-[12px]">{inv.target_url}</span> ·{" "}
              <span className={cx("font-bold", MODE_INFO[inv.mode].group === "real" ? "text-verdigris" : "text-ochre")}>{MODE_INFO[inv.mode].group === "real" ? "agents réels" : `mode local · ${MODE_INFO[inv.mode].label}`}</span> ·{" "}
              <span className={cx("font-bold", inv.status === "running" ? "text-verdigris" : inv.status === "failed" ? "text-rust" : "text-ink")}>
                {inv.status === "running" ? "en cours" : inv.status === "failed" ? "échec" : "terminée"}
              </span>
            </p>
          )}
        </div>
        <InvestigationTabs value={selected} onChange={setInvId} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Panel
          eyebrow="Journal de fouille"
          title="Actions et observations des agents"
          actions={
            <div className="flex rounded-sm bg-chalk-2 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cx("h-6 rounded-xs px-2 text-[11.5px] font-bold", filter === f.key ? "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-sediment hover:text-ink")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
          bodyClassName="max-h-[calc(100vh-220px)] overflow-y-auto"
        >
          <EventFeed events={events} />
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel eyebrow={app?.schema_version ? `Écran analysé · interface v${app.schema_version}` : "Écran analysé"} title={form.length ? `${form.length} champs identifiés` : "Aucun écran analysé"}>
            {form.length ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {form.map((f) => (
                  <div key={f.name} className="rounded-sm bg-chalk p-2.5">
                    <div className="text-[12.5px] font-bold">{f.label ?? f.name}</div>
                    <div className="font-mono text-[11px] text-silt">
                      {f.name} · {f.kind === "enum" ? `${f.options?.length ?? 0} valeurs` : f.kind ?? `${f.type} (non pris en charge)`}
                    </div>
                    {f.options && <div className="mt-1 text-[11.5px] leading-snug text-sediment">{f.options.map((o) => o.value).join(", ")}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-silt">L&apos;agent publiera ici les champs, valeurs et actions détectés à l&apos;écran.</p>
            )}
          </Panel>

          {pending.length > 0 && (
            <Panel eyebrow="Boucle d'investigation" title={`${pending.length} expérience${pending.length > 1 ? "s" : ""} demandée${pending.length > 1 ? "s" : ""} par l'analyse`}>
              <ul className="flex flex-col gap-1.5 text-[12.5px]">
                {pending.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2">
                    <Specimen tone="warn">EN ATTENTE</Specimen>
                    <span>{e.title}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel eyebrow="Fiches d'expérience" title={`${report?.total ?? 0} expériences enregistrées`} bodyClassName="px-0 pb-1">
            {report && report.rows.length ? (
              <div className="max-h-[calc(100vh-420px)] min-h-[200px] overflow-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-paper text-left text-[11px] text-silt">
                    <tr className="border-b border-line">
                      <th className="py-2 pl-4 font-bold">Expérience</th>
                      <th className="py-2 font-bold">Entrées</th>
                      <th className="py-2 text-right font-bold">Écran historique</th>
                      <th className="py-2 pr-4 text-right font-bold">Modèle {model ? `v${model.version}` : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.rows].reverse().map((r) => (
                      <tr key={r.experiment_id} id={r.experiment_id} className="enter border-b border-line last:border-0">
                        <td className="py-1.5 pl-4">
                          <Specimen>{r.experiment_id}</Specimen>
                        </td>
                        <td className="py-1.5 text-sediment">
                          {Object.entries(r.inputs)
                            .map(([, v]) => v)
                            .join(" · ")}
                        </td>
                        <td className="py-1.5 text-right">
                          {r.exception ? (
                            <span className="legacy-value text-[11px] text-rust!">{state.observations.find((o) => o.experiment_id === r.experiment_id)?.error ?? "ERREUR"}</span>
                          ) : (
                            <LegacyValue value={r.observed.total_price ?? Object.values(r.observed)[0]} />
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-right">
                          {!model || r.status === "inconclusive" ? (
                            <span className="text-silt">{r.status === "inconclusive" ? "non abouti" : "—"}</span>
                          ) : r.status === "match" ? (
                            <span className="font-bold text-verdigris">{r.exception ? "✓ refus reproduit" : "✓ identique"}</span>
                          ) : (
                            <span className="font-bold text-rust">✕ écart {r.delta !== undefined ? `${r.delta > 0 ? "+" : ""}${r.delta}` : ""}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-4 pb-3">
                <Empty title="Aucune expérience" hint="Les observations envoyées par l'agent (POST /api/observations) apparaîtront ici en temps réel." />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
