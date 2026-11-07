"use client";

import { useEffect, useMemo, useState } from "react";
import { compute, stageOf } from "@/lib/engine/engine";
import { defaultValues, thresholdsFor, type ResolvedApp, type ResolvedField } from "@/lib/appschema";
import { describeAction } from "@/lib/engine/describe";
import type { ComputeResult, Inputs, Primitive, RuleModel } from "@/lib/types";
import { FieldControl } from "./FieldControl";
import { ResultPanel } from "./ResultPanel";
import { formatOutput } from "./format";

/**
 * Application générée : formulaire, résultat et tableaux sont produits à partir
 * de la description résolue (ResolvedApp) et exécutés par le moteur de règles.
 * Ajouter un champ d'un type pris en charge dans la description le fait
 * apparaître ici, sans modification de code.
 */
export function GeneratedApp({
  app,
  model,
  provenance = false,
  onChange,
}: {
  app: ResolvedApp;
  model: RuleModel | null;
  provenance?: boolean;
  onChange?: (values: Inputs, result: ComputeResult | null) => void;
}) {
  const shape = app.fields.map((f) => `${f.name}:${f.kind}`).join("|");
  const [values, setValues] = useState<Record<string, Primitive>>(() => defaultValues(app.fields));
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // Nouveau schéma : nouveaux champs initialisés, saisie existante conservée
  useEffect(() => {
    setValues((v) => {
      const next = defaultValues(app.fields);
      for (const f of app.fields) if (f.name in v) next[f.name] = v[f.name];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  const result = useMemo(() => (model ? compute(model, values, { fields: app.fields }) : null), [model, values, app.fields]);
  useEffect(() => onChange?.(values, result), [values, result, onChange]);

  const fieldErrors = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of result?.errors ?? []) if (e.field && !m.has(e.field)) m.set(e.field, e.message.replace(/^[^:]+ : /, ""));
    return m;
  }, [result]);

  const set = (name: string, v: Primitive) => {
    setValues((x) => ({ ...x, [name]: v }));
    setTouched((t) => (t.has(name) ? t : new Set(t).add(name)));
  };

  // Regroupement par section déclarée ; champs sans section en tête
  const groups = useMemo(() => {
    const bySection = new Map<string, ResolvedField[]>();
    for (const f of app.fields) {
      const key = f.section && app.sections.some((s) => s.id === f.section) ? f.section : "";
      bySection.set(key, [...(bySection.get(key) ?? []), f]);
    }
    const out: { id: string; title?: string; description?: string; fields: ResolvedField[] }[] = [];
    if (bySection.get("")?.length) out.push({ id: "", fields: bySection.get("")! });
    for (const s of app.sections) if (bySection.get(s.id)?.length) out.push({ ...s, fields: bySection.get(s.id)! });
    return out;
  }, [app.fields, app.sections]);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form className="flex min-w-0 flex-col gap-6" onSubmit={(e) => e.preventDefault()} noValidate aria-label={app.title}>
        {groups.map((g) => (
          <fieldset key={g.id || "_"} className="min-w-0">
            {g.title && (
              <legend className="mb-3 w-full border-b border-ga-line pb-2">
                <span className="text-[12px] font-semibold tracking-wide text-ga-muted uppercase">{g.title}</span>
                {g.description && <span className="mt-0.5 block text-[12px] text-ga-faint">{g.description}</span>}
              </legend>
            )}
            <div className="flex flex-col gap-4">
              {g.fields.map((f) => (
                <FieldControl
                  key={f.name}
                  field={f}
                  value={values[f.name]}
                  error={touched.has(f.name) || values[f.name] !== undefined ? fieldErrors.get(f.name) : undefined}
                  onChange={(v) => set(f.name, v)}
                  onBlur={() => setTouched((t) => new Set(t).add(f.name))}
                  thresholds={
                    f.kind === "number"
                      ? dedupe(thresholdsFor(f.name, model).filter((t) => (t.op === "gte" || t.op === "gt") && t.value > 0 && stageOf(t.rule) !== "validation")).map((t) => ({
                          value: t.value,
                          strict: t.op === "gt",
                          label: `${t.rule.id} : ${t.rule.description ?? describeAction(t.rule.action)}`,
                        }))
                      : []
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </form>

      <div className="flex h-fit flex-col gap-4 lg:sticky lg:top-6">
        <ResultPanel result={result} outputs={app.outputs} currency={app.currency} provenance={provenance} available={!!model} />
        {app.tables.map((t) => (
          <SimulationTable key={t.id} app={app} model={model} values={values} table={t} />
        ))}
      </div>
    </div>
  );
}

function dedupe<T extends { value: number }>(list: T[]): T[] {
  const seen = new Set<number>();
  return list.filter((x) => (seen.has(x.value) ? false : (seen.add(x.value), true)));
}

/** Tableau calculé : le champ `vary` prend chaque valeur, les autres restent ceux du formulaire. */
function SimulationTable({ app, model, values, table }: { app: ResolvedApp; model: RuleModel | null; values: Record<string, Primitive>; table: ResolvedApp["tables"][number] }) {
  if (!model) return null;
  const field = app.fields.find((f) => f.name === table.vary);
  const cols = (table.outputs?.length ? table.outputs : [app.outputs.find((o) => o.primary)?.name ?? "total_price"]).map((name) => app.outputs.find((o) => o.name === name) ?? { name, label: name });
  return (
    <section className="rounded-xl bg-white p-4 shadow-[0_0_0_1px_var(--color-ga-line)]">
      <h3 className="mb-2 text-[13px] font-semibold text-ga-ink">{table.title}</h3>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-ga-faint">
            <th className="pb-1 font-semibold">{field?.label ?? table.vary}</th>
            {cols.map((c) => (
              <th key={c.name} className="pb-1 text-right font-semibold">
                {c.label ?? c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.values.map((v) => {
            const r = compute(model, { ...values, [table.vary]: v }, { fields: app.fields });
            const current = String(values[table.vary]) === String(v);
            return (
              <tr key={String(v)} className={current ? "bg-ga-accent-soft font-semibold" : "border-t border-ga-line"}>
                <td className="py-1.5 pl-1 tabular-nums">
                  {typeof v === "number" ? v.toLocaleString("fr-FR") : String(v)}
                  {field?.unit ? ` ${field.unit}` : ""}
                </td>
                {cols.map((c) => (
                  <td key={c.name} className="py-1.5 pr-1 text-right tabular-nums">
                    {r.status === "ok" ? formatOutput(r.outputs[c.name], c, app.currency) : r.status === "rejected" ? "refusé" : "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
