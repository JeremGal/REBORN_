"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { post, useReborn } from "@/components/RebornProvider";
import { Button, Confidence, Empty, Panel, Specimen, StatusBadge, cx, inputCls, timeOf } from "@/components/ui";
import { describeAction, describeCondition, STAGE_LABEL } from "@/lib/engine/describe";
import { stageOf } from "@/lib/engine/engine";
import { STAGES, type Observation, type Rule, type RuleDiff } from "@/lib/types";

export default function RulesPage() {
  const { state, model: current, app } = useReborn();
  const labels = useMemo(() => Object.fromEntries((app?.fields ?? []).filter((f) => f.label).map((f) => [f.name, f.label as string])), [app]);
  const [picked, setPicked] = useState<number | null>(null);
  const models = state?.models ?? [];
  const model = models.find((m) => m.version === picked) ?? current;
  const obsById = useMemo(() => new Map((state?.observations ?? []).map((o) => [o.experiment_id, o])), [state]);
  const hypotheses = (state?.events ?? []).filter((e) => e.type === "hypothesis").slice(-6).reverse();

  if (!state) return null;

  const diffs = new Map((model?.diff ?? []).map((d) => [d.rule_id, d]));
  const isFirst = model?.version === 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">02 · Comprendre — Rétro-ingénierie</div>
          <h1 className="mt-1 text-[24px] font-black tracking-[-0.025em]">{model ? `Modèle métier v${model.version}` : "Modèle métier"}</h1>
          {model && (
            <p className="mt-1 text-[13px] text-sediment">
              {model.application ?? "—"} · module {model.module} · reçu à {timeOf(model.received_at)} ·{" "}
              {model.source === "fixture" ? "scénario de référence (mode local)" : model.source === "analyst" ? "analyste (API)" : model.source === "user" ? "import manuel" : model.source}
            </p>
          )}
        </div>
        {models.length > 1 && <Strata versions={models.map((m) => m.version)} value={model?.version ?? null} onChange={setPicked} />}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {!model ? (
            <Panel>
              <Empty
                title="Aucune règle reçue"
                hint="Le moteur d'Alan publie son modèle via POST /api/rules. Chaque envoi crée une nouvelle version, aussitôt exécutée et comparée au logiciel historique."
              />
            </Panel>
          ) : (
            <>
              {!isFirst && (model.diff?.length ?? 0) > 0 && <DiffBanner diff={model.diff!} version={model.version} labels={labels} />}

              {(model.issues?.length ?? 0) > 0 && (
                <section className="rounded-md bg-chalk-2 px-4 py-3">
                  <div className="eyebrow">Avertissements de validation (modèle accepté)</div>
                  <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-sediment">
                    {model.issues!.map((i, k) => (
                      <li key={k}>
                        {i.rule_id && <span className="specimen mr-1.5">{i.rule_id}</span>}
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <Panel eyebrow="Paramètres d'exécution" title="Ordre, cumul et arrondis">
                <div className="flex flex-wrap gap-2 text-[12.5px]">
                  <Chip k="Ordre" v={STAGES.map((s) => STAGE_LABEL[s]).join(" → ")} />
                  <Chip k="Cumul des remises" v={model.settings?.discount_stacking === "additive" ? "additif (somme des %)" : model.settings?.discount_stacking === "max" ? "meilleure remise seule" : "successif (× chaque remise)"} />
                  <Chip k="Arrondi" v={`${model.settings?.rounding?.decimals ?? 2} déc. · ${model.settings?.rounding?.mode ?? "half_up"} · ${model.settings?.rounding?.at === "each_step" ? "à chaque étape" : "en fin de calcul"}`} />
                  <Chip k="Tolérance" v={`± ${model.settings?.tolerance ?? 0.01}`} />
                </div>
                {model.notes && <p className="mt-3 text-[12.5px] text-sediment">{model.notes}</p>}
              </Panel>

              {STAGES.map((stage) => {
                const rules = model.rules.filter((r) => stageOf(r) === stage).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
                if (!rules.length) return null;
                return (
                  <section key={stage}>
                    <div className="mb-2 flex items-baseline gap-2 px-1">
                      <span className="font-mono text-[11px] text-silt">{String(STAGES.indexOf(stage) + 1).padStart(2, "0")}</span>
                      <h2 className="text-[13px] font-black tracking-[0.04em] uppercase">{STAGE_LABEL[stage]}</h2>
                      <span className="text-[12px] text-silt">
                        {rules.length} règle{rules.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="card divide-y divide-line">
                      {rules.map((r) => (
                        <RuleRow key={r.id} rule={r} diff={isFirst ? undefined : diffs.get(r.id)} obsById={obsById} labels={labels} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {hypotheses.length > 0 && (
            <Panel eyebrow="Analyse en cours" title="Dernières hypothèses">
              <ul className="flex flex-col gap-2 text-[12.5px]">
                {hypotheses.map((h) => (
                  <li key={h.id} className="border-l-2 border-ochre/50 pl-2.5">
                    <div className="font-bold">{h.title}</div>
                    {h.detail && <div className="text-sediment">{h.detail}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <ImportPanel version={model?.version} />
        </div>
      </div>
    </div>
  );
}

function Strata({ versions, value, onChange }: { versions: number[]; value: number | null; onChange: (v: number) => void }) {
  // Les versions s'empilent comme des couches : la plus récente en haut
  return (
    <div className="flex flex-col-reverse gap-[3px]" role="tablist" aria-label="Versions du modèle">
      {versions.map((v, i) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx(
            "h-5 rounded-xs px-2 text-left font-mono text-[11px] font-medium transition-colors",
            value === v ? "bg-ink text-white" : "bg-chalk-2 text-sediment hover:bg-[#e2e5df]",
          )}
          style={{ width: 120 + i * 14 }}
        >
          v{v}
          {i === versions.length - 1 ? " · actuelle" : ""}
        </button>
      ))}
    </div>
  );
}

function DiffBanner({ diff, version, labels }: { diff: RuleDiff[]; version: number; labels: Record<string, string> }) {
  return (
    <section className="rounded-md bg-ochre-soft px-4 py-3 shadow-[inset_3px_0_0_var(--color-ochre)]">
      <div className="eyebrow text-ochre!">Changements depuis v{version - 1}</div>
      <ul className="mt-1.5 flex flex-col gap-1 text-[13px]">
        {diff.map((d) => (
          <li key={d.rule_id} className="flex flex-wrap items-baseline gap-2">
            <Specimen tone="warn">{d.rule_id}</Specimen>
            {d.kind === "changed" && d.before && d.after && (
              <span>
                <span className="text-sediment line-through">{describeAction(d.before.action, undefined, labels)}</span> → <b>{describeAction(d.after.action, undefined, labels)}</b>
                {JSON.stringify(d.before.condition) !== JSON.stringify(d.after.condition) && (
                  <span className="text-sediment"> · condition : {describeCondition(d.after.condition, labels)}</span>
                )}
              </span>
            )}
            {d.kind === "added" && d.after && <span>Nouvelle règle : {describeAction(d.after.action, undefined, labels)} si {describeCondition(d.after.condition, labels)}</span>}
            {d.kind === "removed" && <span className="text-sediment">Règle retirée</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuleRow({ rule, diff, obsById, labels }: { rule: Rule; diff?: RuleDiff; obsById: Map<string, Observation>; labels: Record<string, string> }) {
  const changed = diff?.kind === "changed" || diff?.kind === "added";
  return (
    <div className={cx("grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]", changed && "bg-ochre-soft/50 shadow-[inset_3px_0_0_var(--color-ochre)]", rule.validation_status === "rejected" && "opacity-60")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Specimen>{rule.id}</Specimen>
          <span className="font-mono text-[11px] text-silt">{rule.type}</span>
          {rule.group && <span className="text-[11px] text-silt">· exclusif « {rule.group} »</span>}
          {rule.priority !== undefined && <span className="text-[11px] text-silt">· priorité {rule.priority}</span>}
          {rule.depends_on?.length ? <span className="text-[11px] text-silt">· dépend de {rule.depends_on.join(", ")}</span> : null}
        </div>
        <p className="mt-1.5 text-[14px] leading-snug">
          <span className="text-sediment">Si </span>
          <span className="font-bold">{describeCondition(rule.condition, labels)}</span>
          <span className="text-sediment"> → </span>
          <span className="font-bold text-ink">{describeAction(rule.action, undefined, labels)}</span>
          {diff?.kind === "changed" && diff.before && <span className="ml-2 text-[12px] text-ochre line-through">{describeAction(diff.before.action)}</span>}
        </p>
        {rule.description && <p className="mt-0.5 text-[12px] text-silt">{rule.description}</p>}
        {rule.evidence && rule.evidence.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] text-silt">Preuves</span>
            {rule.evidence.map((id) => {
              const o = obsById.get(id);
              return (
                <Specimen key={id} title={o ? `${Object.values(o.inputs).join(" · ")} → ${Object.values(o.observed_output).join(" · ")}` : "Observation non reçue par la plateforme"} className={cx(!o && "opacity-50")}>
                  {id}
                </Specimen>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-start gap-3 md:flex-col md:items-end">
        <StatusBadge status={rule.validation_status} />
        <Confidence value={rule.confidence} />
      </div>
    </div>
  );
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="rounded-sm bg-chalk px-2.5 py-1">
      <span className="text-silt">{k} · </span>
      <span className="font-bold">{v}</span>
    </span>
  );
}

function ImportPanel({ version }: { version?: number }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(dryRun: boolean) {
    setMsg(null);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      setMsg({ ok: false, text: "JSON invalide" });
      return;
    }
    try {
      const r = await post(`/api/rules?source=user${dryRun ? "&dry_run=1" : ""}`, body);
      const v = r.validation;
      const score = `${v.matched}/${v.scored} comportements identiques${r.issues.length ? ` · ${r.issues.length} avertissement(s)` : ""}`;
      setMsg({ ok: true, text: dryRun ? `Modèle valide (non publié) — ${score}.` : `Version v${r.version} publiée — ${score}.` });
      if (!dryRun) setText("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <Panel eyebrow="Intégration" title="Publier un modèle">
      <p className="mb-2 text-[12.5px] text-sediment">
        Format du contrat Analyste → REBORN. Le modèle est validé avant exécution : un modèle non exécutable est refusé avec la liste des erreurs.
      </p>
      <textarea
        name="model"
        aria-label="Modèle de règles (JSON)"
        className={cx(inputCls, "h-36 py-2 font-mono text-[11.5px] leading-snug")}
        placeholder={'{\n  "module": "Devis",\n  "rules": [{ "id": "RULE_001", "type": "quantity_discount",\n    "condition": { "quantity_gte": 10 },\n    "action": { "discount_percent": 10 } }]\n}'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {version ? (
          <a href={`/api/rules?version=${version}`} download={`reborn-model-v${version}.json`} className="inline-flex items-center gap-1 text-[12px] font-bold text-sediment hover:text-ink">
            <Download size={13} /> Exporter v{version}
          </a>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => send(true)} disabled={!text.trim()}>
            Valider sans publier
          </Button>
          <Button size="sm" onClick={() => send(false)} disabled={!text.trim()}>
            Publier
          </Button>
        </div>
      </div>
      {msg && <p className={cx("mt-2 text-[12px] leading-snug", msg.ok ? "text-verdigris" : "text-rust")}>{msg.text}</p>}
    </Panel>
  );
}
