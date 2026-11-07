"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleDashed, TriangleAlert } from "lucide-react";
import { useReborn } from "@/components/RebornProvider";
import { GeneratedApp } from "@/components/app/GeneratedApp";
import { Unsupported } from "@/components/app/Unsupported";
import { VerifyCase } from "@/components/VerifyCase";
import { ButtonLink, Empty, Panel, cx, pct, timeOf } from "@/components/ui";
import type { ComputeResult, Inputs } from "@/lib/types";

type Tone = "ok" | "warn" | "wait";

export default function ReconstructionPage() {
  const { state, model, schema, app, report } = useReborn();
  const [current, setCurrent] = useState<{ inputs: Inputs; result: ComputeResult | null } | null>(null);
  const onChange = useCallback((inputs: Inputs, result: ComputeResult | null) => setCurrent({ inputs, result }), []);

  const history = useMemo(() => {
    if (!state) return [];
    const items = [
      ...state.schemas.map((s) => ({ ts: s.received_at, kind: "Interface" as const, version: s.version, text: `${s.fields.length} champs · ${s.source === "explorer" ? "écran découvert" : s.source === "fixture" ? "scénario de référence" : s.source}` })),
      ...state.models.map((m) => ({
        ts: m.received_at,
        kind: "Règles" as const,
        version: m.version,
        text: m.version === 1 ? `${m.rules.length} règles` : m.diff?.length ? m.diff.map((d) => `${d.rule_id} ${d.kind === "changed" ? "modifiée" : d.kind === "added" ? "ajoutée" : "retirée"}`).join(", ") : "sans changement",
      })),
    ];
    return items.sort((a, b) => b.ts.localeCompare(a.ts));
  }, [state]);

  if (!state || !app) return null;

  const warnings = [...app.issues, ...(model?.issues ?? [])];
  const chain: { n: string; title: string; tone: Tone; lines: string[] }[] = [
    {
      n: "01",
      title: "Écran d'origine",
      tone: schema ? "ok" : app.fields.length ? "warn" : "wait",
      lines: schema
        ? [`Interface v${schema.version} · ${schema.fields.length} champs`, `${schema.sections?.length ?? 0} sections · ${schema.source === "explorer" ? "lue par l'Explorer" : schema.source === "fixture" ? "scénario de référence (mode local)" : `source : ${schema.source}`}`]
        : app.fields.length
          ? ["Aucun écran décrit", "Champs déduits des observations"]
          : ["En attente de l'Explorer"],
    },
    {
      n: "02",
      title: "Modèle métier",
      tone: model ? (model.issues?.length ? "warn" : "ok") : "wait",
      lines: model ? [`Règles v${model.version} · ${app.stats.rules_executable}/${app.stats.rules_total} exécutables`, `${model.issues?.length ?? 0} avertissement${(model.issues?.length ?? 0) > 1 ? "s" : ""} de validation`] : ["En attente de l'Analyste"],
    },
    {
      n: "03",
      title: "Application générée",
      tone: !app.fields.length ? "wait" : app.unsupported.length || app.stats.fields_supported < app.stats.fields_total ? "warn" : "ok",
      lines: [`${app.stats.fields_supported}/${app.stats.fields_total} champs reconstruits · ${app.stats.outputs} sortie${app.stats.outputs > 1 ? "s" : ""}`, `${app.stats.tables} tableau${app.stats.tables > 1 ? "x" : ""} · ${app.unsupported.length} élément${app.unsupported.length > 1 ? "s" : ""} non repris`],
    },
    {
      n: "04",
      title: "Vérification",
      tone: !report?.scored ? "wait" : report.equivalence === 1 ? "ok" : "warn",
      lines: report?.scored ? [`${pct(report.equivalence)} identique sur ${report.scored} cas`, `dont ${report.independent_matched}/${report.independent_total} cas indépendants`] : ["Aucune comparaison"],
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">03 · Reconstruire — Génération de l&apos;application</div>
          <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em]">Du logiciel historique à l&apos;application reconstruite</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-sediment">
            L&apos;interface est générée depuis la description de l&apos;écran, les calculs sont exécutés par le moteur de règles, et chaque résultat renvoie à la règle et aux
            expériences qui le justifient.
          </p>
        </div>
        {app.fields.length > 0 && (
          <ButtonLink href="/app" target="_blank" variant="primary">
            Ouvrir l&apos;application livrée <ArrowUpRight size={14} />
          </ButtonLink>
        )}
      </div>

      {/* Chaîne de reconstruction --------------------------------------------- */}
      <ol className="grid gap-px overflow-hidden rounded-md bg-line md:grid-cols-4" aria-label="Chaîne de reconstruction">
        {chain.map((c) => (
          <li key={c.n} className="relative bg-paper px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  "flex size-5 items-center justify-center rounded-full",
                  c.tone === "ok" ? "bg-verdigris text-white" : c.tone === "warn" ? "bg-ochre-soft text-ochre" : "bg-chalk-2 text-silt",
                )}
              >
                {c.tone === "ok" ? <Check size={12} strokeWidth={3} /> : c.tone === "warn" ? <TriangleAlert size={11} /> : <CircleDashed size={12} />}
              </span>
              <span className="font-mono text-[11px] text-silt">{c.n}</span>
              <span className="text-[13px] font-black tracking-[0.02em] uppercase">{c.title}</span>
            </div>
            {c.lines.map((l, i) => (
              <p key={i} className={cx("tabular mt-1 text-[12.5px] leading-snug", i === 0 ? "font-bold text-ink" : "text-sediment")}>
                {l}
              </p>
            ))}
          </li>
        ))}
      </ol>

      {warnings.length > 0 && (
        <section className="rounded-md bg-ochre-soft px-4 py-3 shadow-[inset_3px_0_0_var(--color-ochre)]">
          <div className="eyebrow text-ochre!">Points d&apos;attention de la reconstruction</div>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px]">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={i}>
                {w.rule_id && <span className="specimen mr-1.5">{w.rule_id}</span>}
                {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {app.fields.length === 0 ? (
        <Panel>
          <Empty title="Rien à reconstruire pour l'instant" hint="Publiez un schéma d'interface (POST /api/schema) ou lancez une investigation : l'application se génère automatiquement." />
        </Panel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line bg-chalk px-4 py-2">
                <span className="flex gap-1">
                  <span className="size-2.5 rounded-full bg-dust/60" />
                  <span className="size-2.5 rounded-full bg-dust/60" />
                  <span className="size-2.5 rounded-full bg-dust/60" />
                </span>
                <span className="mx-auto truncate font-mono text-[11px] text-silt">
                  {app.title} — interface v{app.schema_version ?? "—"} · règles v{app.model_version ?? "—"}
                </span>
              </div>
              <div className="bg-ga-bg p-5 font-app text-ga-ink sm:p-6">
                <GeneratedApp app={app} model={model} provenance onChange={onChange} />
                <div className="mt-6">
                  <Unsupported items={app.unsupported} />
                </div>
              </div>
            </section>
            <VerifyCase inputs={current?.inputs ?? null} result={current?.result ?? null} model={model} app={app} />
          </div>

          <Panel eyebrow="Historique" title="Versions de l'application" bodyClassName="pb-3">
            {history.length ? (
              <ol className="flex flex-col">
                {history.map((h, i) => (
                  <li key={`${h.kind}-${h.version}`} className={cx("border-l-2 py-1.5 pl-3", i === 0 ? "border-verdigris" : "border-line")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-bold">
                        {h.kind} v{h.version}
                      </span>
                      <time className="font-mono text-[10.5px] text-silt">{timeOf(h.ts)}</time>
                    </div>
                    <p className="text-[12px] leading-snug text-sediment">{h.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[12.5px] text-silt">Aucune version publiée.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
