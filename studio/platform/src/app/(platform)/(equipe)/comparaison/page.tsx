"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Upload } from "lucide-react";
import { post, useReborn } from "@/components/RebornProvider";
import { InvestigationTabs } from "@/components/InvestigationTabs";
import { CoreSample } from "@/components/CoreSample";
import { BlindChallenge } from "@/components/BlindChallenge";
import { Button, Empty, LegacyValue, Panel, Specimen, cx, inputCls, pct } from "@/components/ui";
import { compareAll } from "@/lib/compare";
import { resolveApp } from "@/lib/appschema";
import { formatOutput } from "@/components/app/format";

export default function ComparisonPage() {
  const { state, active, model: current, app } = useReborn();
  const [invId, setInvId] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

  const scope = invId ?? active?.id ?? "all";
  const model = state?.models.find((m) => m.version === version) ?? current;
  // Les champs dépendent du modèle comparé (contraintes fusionnées) : on les résout pour cette version
  const fields = useMemo(() => (state && model ? resolveApp(model, state.schemas.at(-1), state.observations).fields : app?.fields), [state, model, app]);
  const report = useMemo(() => (state ? compareAll(model, state.observations, scope, { fields }) : null), [state, model, scope, fields]);

  const matrix = useMemo(() => {
    if (!state) return [];
    return state.models.map((m) => {
      const f = resolveApp(m, state.schemas.at(-1), state.observations).fields;
      return { version: m.version, cells: state.investigations.map((inv) => ({ inv, r: compareAll(m, state.observations, inv.id, { fields: f }) })) };
    });
  }, [state]);

  if (!state) return null;
  const rows = (report?.rows ?? []).filter((r) => !onlyIssues || r.status === "mismatch" || r.status === "not_covered");
  const primary = app?.outputs.find((o) => o.primary) ?? app?.outputs[0];
  const currency = app?.currency ?? "EUR";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">04 · Comparer — Logiciel historique ↔ application reconstruite</div>
          <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em]">Preuve d&apos;équivalence</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-sediment">
            Chaque expérience menée sur l&apos;original est rejouée dans l&apos;application reconstruite, validation des entrées comprise. Le logiciel historique reste une
            boîte noire : ses sorties, y compris ses refus, sont la source de vérité.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InvestigationTabs value={scope} onChange={setInvId} allowAll />
          {state.models.length > 0 && (
            <select
              className="h-8 rounded-sm bg-chalk-2 px-2 text-[12px] font-bold outline-none"
              value={model?.version ?? ""}
              onChange={(e) => setVersion(Number(e.target.value))}
              aria-label="Version du modèle"
            >
              {state.models.map((m) => (
                <option key={m.version} value={m.version}>
                  Modèle v{m.version}
                  {m.version === current?.version ? " (actuel)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <BlindChallenge />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Score -------------------------------------------------------------- */}
          <section className="card p-5">
            <div className="flex flex-wrap items-end gap-x-9 gap-y-3">
              <div>
                <div className="eyebrow">Comportements identiques{model ? ` · modèle v${model.version}` : ""}</div>
                <div className={cx("tabular mt-1 text-[44px] leading-none font-black tracking-[-0.04em]", report?.equivalence == null ? "text-dust" : report.equivalence === 1 ? "text-verdigris" : "text-rust")}>
                  {pct(report?.equivalence ?? null)}
                </div>
                <div className="mt-1 text-[12px] text-sediment">
                  sur {report?.scored ?? 0} expérience{(report?.scored ?? 0) > 1 ? "s" : ""} comparée{(report?.scored ?? 0) > 1 ? "s" : ""}
                </div>
              </div>
              <Metric label="Construction" value={report?.construction_total ? `${report.construction_matched}/${report.construction_total}` : "—"} hint="Cas ayant servi de preuve aux règles" />
              <Metric label="Validation indépendante" value={report?.independent_total ? `${report.independent_matched}/${report.independent_total}` : "—"} hint="Cas jamais utilisés comme preuve : mesurent la généralisation" />
              <Metric label="Refus reproduits" value={String(report?.exceptions_matched ?? 0)} hint="Exceptions métier de l'original reproduites à l'identique" />
              <Metric label="Écarts" value={String(report?.mismatched ?? 0)} bad={!!report?.mismatched} />
              <Metric label="Δ max" value={report ? formatOutput(report.max_abs_delta, primary, currency) : "—"} bad={!!report?.max_abs_delta} />
            </div>
            <div className="mt-4">
              <CoreSample rows={report?.rows ?? []} height={22} />
            </div>
          </section>

          {/* Détail ------------------------------------------------------------- */}
          <Panel
            eyebrow="Détail"
            title="Expérience par expérience"
            actions={
              <label className="flex items-center gap-1.5 text-[12px] font-bold text-sediment">
                <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-verdigris" />
                Écarts uniquement
              </label>
            }
            bodyClassName="px-0 pb-1"
          >
            {!rows.length ? (
              <div className="px-4 pb-3">
                <Empty title={onlyIssues ? "Aucun écart" : "Aucune expérience à comparer"} hint={onlyIssues ? "Toutes les expériences comparées sont identiques." : "Importez des observations ou lancez une investigation."} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[12.5px]">
                  <thead className="text-left text-[11px] text-silt">
                    <tr className="border-b border-line">
                      <th className="w-8" />
                      <th className="py-2 font-bold">Expérience</th>
                      <th className="py-2 font-bold">Entrées</th>
                      <th className="py-2 text-right font-bold">Original</th>
                      <th className="py-2 text-right font-bold">Reconstruit</th>
                      <th className="py-2 text-right font-bold">Δ</th>
                      <th className="py-2 pr-4 text-right font-bold">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isOpen = open === r.experiment_id;
                      const bad = r.status === "mismatch";
                      const pv = primary ? r.observed[primary.name] : undefined;
                      const cv = primary ? r.computed[primary.name] : undefined;
                      return (
                        <Fragment key={r.experiment_id}>
                          <tr
                            id={r.experiment_id}
                            onClick={() => setOpen(isOpen ? null : r.experiment_id)}
                            className={cx("cursor-pointer border-b border-line hover:bg-chalk/70", bad && "bg-rust-soft/50", isOpen && "bg-chalk")}
                          >
                            <td className="pl-3 text-silt">
                              <ChevronRight size={13} className={cx("transition-transform duration-150", isOpen && "rotate-90")} />
                            </td>
                            <td className="py-1.5">
                              <span className="flex items-center gap-1.5">
                                <Specimen tone={bad ? "bad" : undefined}>{r.experiment_id}</Specimen>
                                <span className={cx("text-[10.5px] font-bold uppercase", r.independent ? "text-verdigris" : "text-silt")} title={r.independent ? "Cas jamais utilisé comme preuve" : "Cas ayant servi de preuve"}>
                                  {r.independent ? "valid." : "constr."}
                                </span>
                              </span>
                            </td>
                            <td className="max-w-[260px] truncate py-1.5 text-sediment" title={Object.entries(r.inputs).map(([k, v]) => `${k}=${v}`).join(", ")}>
                              {Object.values(r.inputs).join(" · ")}
                            </td>
                            <td className="py-1.5 text-right">
                              {r.exception ? <span className="legacy-value text-[11px] text-rust!">refus</span> : r.status === "inconclusive" ? <span className="text-silt">non abouti</span> : <LegacyValue value={pv} />}
                            </td>
                            <td className="tabular py-1.5 text-right font-bold">
                              {r.computed_status === "rejected" ? "refus" : r.computed_status === "invalid" ? "invalide" : r.status === "inconclusive" ? "—" : formatOutput(cv, primary, currency)}
                            </td>
                            <td className={cx("tabular py-1.5 text-right", bad ? "font-bold text-rust" : "text-silt")}>{r.delta ? `${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString("fr-FR")}` : "0"}</td>
                            <td className="py-1.5 pr-4 text-right">
                              {r.status === "match" && <span className="font-bold text-verdigris">{r.exception ? "✓ refus reproduit" : "✓ identique"}</span>}
                              {r.status === "mismatch" && <span className="font-bold text-rust">✕ écart</span>}
                              {r.status === "inconclusive" && <span className="text-silt">exclu</span>}
                              {r.status === "not_covered" && <span className="font-bold text-ochre">non couvert</span>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="border-b border-line bg-chalk">
                              <td />
                              <td colSpan={6} className="py-3 pr-4">
                                {r.reason && <p className={cx("mb-2 text-[12.5px] font-bold", bad ? "text-rust" : "text-sediment")}>{r.reason}</p>}
                                {r.mismatched_fields.length > 0 && (
                                  <p className="mb-2 text-[12px] text-sediment">
                                    Sorties en écart : {r.mismatched_fields.map((f) => `${f} (original ${String(r.observed[f] ?? "—")}, reconstruit ${String(r.computed[f] ?? "—")})`).join(" · ")}
                                  </p>
                                )}
                                <div className="eyebrow mb-1.5">Calcul reconstruit</div>
                                <ol className="flex flex-col gap-1">
                                  {r.trace.map((t, i) => (
                                    <li key={`${t.rule_id}-${i}`} className={cx("flex flex-wrap items-baseline gap-2 text-[12px]", !t.applied && "text-silt")}>
                                      <span className="specimen">{t.rule_id}</span>
                                      <span className={cx(t.applied && "font-bold")}>{t.label}</span>
                                      {t.applied && t.after !== undefined && (
                                        <span className="tabular text-sediment">
                                          {t.before !== undefined ? `${t.before.toLocaleString("fr-FR")} → ` : ""}
                                          {t.after.toLocaleString("fr-FR")}
                                        </span>
                                      )}
                                      {!t.applied && <span className="italic">— {t.reason}</span>}
                                    </li>
                                  ))}
                                </ol>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel eyebrow="Honnêteté du score" title="Limites de la vérification">
            {report?.limitations.length ? (
              <ul className="flex flex-col gap-1.5 text-[12.5px] leading-snug text-sediment">
                {report.limitations.map((l, i) => (
                  <li key={i} className="border-l-2 border-line pl-2.5">
                    {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-silt">—</p>
            )}
          </Panel>

          {report && report.rule_coverage.length > 0 && (
            <Panel eyebrow="Couverture" title="Règles exercées par les expériences">
              <ul className="flex flex-col gap-1">
                {report.rule_coverage.map((c) => (
                  <li key={c.rule_id} className="flex items-center justify-between gap-2 text-[12px]">
                    <Specimen tone={c.applied === 0 ? "warn" : c.matched < c.applied ? "bad" : undefined}>{c.rule_id}</Specimen>
                    <span className={cx("tabular", c.applied === 0 ? "font-bold text-ochre" : "text-sediment")}>
                      {c.applied === 0 ? "jamais exercée" : `${c.matched}/${c.applied} identiques`}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel eyebrow="Matrice d'équivalence" title="Versions du modèle × investigations">
            {matrix.length && state.investigations.length ? (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-silt">
                    <th className="pb-1.5 text-left font-bold" />
                    {state.investigations.map((i) => (
                      <th key={i.id} className="pb-1.5 text-right font-bold">
                        {i.kind === "blind_challenge" ? "Blind" : "Inv."} #{i.number}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...matrix].reverse().map((row) => (
                    <tr key={row.version} className="border-t border-line">
                      <td className="py-1.5 font-mono text-[11px] font-medium">v{row.version}</td>
                      {row.cells.map(({ inv, r }) => (
                        <td key={inv.id} className="py-1.5 text-right">
                          <button
                            onClick={() => {
                              setInvId(inv.id);
                              setVersion(row.version);
                            }}
                            title={`${r.matched}/${r.scored} expériences`}
                            className={cx(
                              "tabular rounded-xs px-1.5 py-0.5 font-bold",
                              r.equivalence == null ? "text-dust" : r.equivalence === 1 ? "bg-verdigris-soft text-verdigris" : "bg-rust-soft text-rust",
                              scope === inv.id && model?.version === row.version && "ring-1 ring-ink",
                            )}
                          >
                            {r.scored ? pct(r.equivalence, 0) : "—"}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12.5px] text-silt">Apparaît dès qu&apos;un modèle et une investigation existent.</p>
            )}
          </Panel>

          <ImportObservations />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div title={hint}>
      <div className="text-[11.5px] text-silt">{label}</div>
      <div className={cx("tabular text-[20px] font-bold", bad ? "text-rust" : "text-ink")}>{value}</div>
    </div>
  );
}

/** Import manuel d'observations au format de l'Explorer (même API que l'agent). */
function ImportObservations() {
  const { active } = useReborn();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(raw: string) {
    setMsg(null);
    try {
      // Import délibéré de l'opérateur : rattaché explicitement à l'investigation affichée
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.observations) ? parsed.observations : [parsed];
      const r = await post("/api/observations", active ? list.map((o: Record<string, unknown>) => ({ investigation_id: active.id, ...o })) : list);
      setMsg({ ok: true, text: `${r.count} observation${r.count > 1 ? "s" : ""} importée${r.count > 1 ? "s" : ""} dans ${r.investigation_id}.` });
      setText("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? "JSON invalide" : (e as Error).message });
    }
  }

  return (
    <Panel eyebrow="Intégration" title="Importer des observations">
      <p className="mb-2 text-[12px] text-sediment">Format de l&apos;Explorer : une observation, une liste, ou {"{ observations: [...] }"}.</p>
      <textarea
        name="observations"
        aria-label="Observations (JSON)"
        className={cx(inputCls, "h-28 py-2 font-mono text-[11px] leading-snug")}
        placeholder='[{ "experiment_id": "EXP_201", "inputs": { … }, "observed_output": { "total_price": 810 }, "status": "success" }]'
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-bold text-sediment hover:text-ink">
          <Upload size={13} /> Fichier .json
          <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => e.target.files?.[0] && send(await e.target.files[0].text())} />
        </label>
        <Button size="sm" onClick={() => send(text)} disabled={!text.trim()}>
          Importer
        </Button>
      </div>
      {msg && <p className={cx("mt-2 text-[12px]", msg.ok ? "text-verdigris" : "text-rust")}>{msg.text}</p>}
    </Panel>
  );
}
