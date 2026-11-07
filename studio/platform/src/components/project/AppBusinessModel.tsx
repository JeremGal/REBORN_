"use client";

import { useState } from "react";
import { ChevronRight, FlaskConical, History } from "lucide-react";
import { Button, Empty, Panel, StatusBadge, cx, inputCls } from "@/components/ui";
import { useProject } from "./ProjectProvider";
import {
  BM_SOURCE,
  BM_STATUS,
  DANGER_DISABLED,
  LoadError,
  Loading,
  Notice,
  Pill,
  Spinner,
  StepLink,
  TestBadge,
  WRAP_BTN_SM,
  fmtDate,
  fmtInt,
  fmtMoney,
  plural,
  useAction,
  type AppSpecPreview,
  type BusinessModelMeta,
  type HistoryCheck,
  type ModelIssue,
  type RulePackageContent,
} from "./AppKit";
import { AppInstalledRules, entityLabel } from "./AppSpecView";

/*
 * Modèle métier (Analyste → REBORN) : versions reçues, vérification sur l'historique migré,
 * décision humaine. Chaque bouton appelle une route réelle de /api/migration/business-model.
 */

type Totals = { checked: number; identical: number; rounding: number; different: number; not_computable: number };

function totals(hc: HistoryCheck): Totals {
  return hc.bindings.reduce<Totals>(
    (t, b) => ({ checked: t.checked + b.checked, identical: t.identical + b.identical, rounding: t.rounding + b.rounding, different: t.different + b.different, not_computable: t.not_computable + b.not_computable }),
    { checked: 0, identical: 0, rounding: 0, different: 0, not_computable: 0 },
  );
}

export function AppBusinessModelPanel({
  versions,
  loading,
  error,
  reload,
  spec,
  completedRunId,
  onChanged,
}: {
  versions: BusinessModelMeta[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  spec: AppSpecPreview | null;
  /** Dernière migration terminée (la vérification sur l'historique rejoue sa base). */
  completedRunId: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const { post } = useProject();
  const act = useAction();
  const list = versions ? [...versions].reverse() : [];
  const pending = list.filter((v) => v.status === "proposed").length;

  async function receiveFixture() {
    const r = await act.run(
      "fixture",
      () => post<{ ok: boolean; version: number; status: string; issues: ModelIssue[] }>("/api/migration/business-model?fixture=crm", {}),
      (r) => {
        const errors = r.issues.filter((i) => i.level === "error").length;
        return {
          tone: errors ? "warn" : "ok",
          text: `Jeu de test reçu : version v${r.version}, à valider${errors ? ` — ${plural(errors, "erreur bloquante", "erreurs bloquantes")} (voir ci-dessous)` : ""}. Rejouez-la sur l'historique avant de décider.`,
        };
      },
    );
    if (r) await onChanged();
  }

  return (
    <section id="modele-metier" className="scroll-mt-4">
      <Panel eyebrow="Modèle métier" title={versions ? `${plural(versions.length, "version reçue", "versions reçues")}${pending ? ` · ${pending} à valider` : ""}` : "Versions reçues"}>
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-sediment">
          Le modèle métier reproduit les calculs de l&apos;ancien logiciel : des modules de règles exécutés par le moteur REBORN, et leurs liaisons aux entités du nouveau logiciel. Chaque envoi crée une version « à valider ». Seule une version validée et cohérente avec les correspondances est installée ; les montants historiques migrés ne sont jamais recalculés.
        </p>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {spec ? <AppInstalledRules spec={spec} /> : <div className="rounded-md bg-chalk px-3.5 py-3 text-[12.5px] text-sediment">Règles installables : disponibles dès que la spécification peut être calculée (correspondances reçues).</div>}
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-ochre/45 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <TestBadge label="Jeu de test — Relatio 2004" />
              <span className="text-[12px] font-bold">Mode test</span>
            </div>
            <p className="text-[12px] leading-relaxed text-sediment">
              Modèle écrit à la main au format du contrat de l&apos;Analyste, pour le logiciel de test Relatio 2004, en attendant son module. Il ne provient d&apos;aucun agent et suit le même parcours qu&apos;un envoi réel : version à valider, rejouée sur l&apos;historique.
            </p>
            <Button size="sm" variant="ghost" className={cx("self-start", WRAP_BTN_SM)} disabled={!!act.busy} onClick={() => { if (window.confirm("Recevoir le jeu de test Relatio crée une NOUVELLE version du modèle métier (à valider). Continuer ?")) void receiveFixture(); }}>
              {act.busy === "fixture" ? <Spinner size={12} /> : <FlaskConical size={12} aria-hidden />} Recevoir le jeu de test Relatio (format de l&apos;Analyste)
            </Button>
            {act.notice && (
              <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)}>
                {act.notice.text}
              </Notice>
            )}
          </div>
        </div>

        <div className="mt-4">
          {loading && !versions ? (
            <Loading label="Lecture des versions du modèle métier…" />
          ) : !versions ? (
            <LoadError message={error} onRetry={reload} />
          ) : list.length === 0 ? (
            <Empty
              title="En attente de l'Analyste"
              hint={
                <>
                  Aucune version du modèle métier n&apos;a été reçue pour ce projet. L&apos;agent d&apos;analyse la publie via <code className="font-mono text-[11.5px]">POST /api/migration/business-model</code>. Sans modèle validé, le logiciel livré fonctionne mais ne calcule pas automatiquement les nouveaux documents.
                </>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {error && <Notice tone="warn">Actualisation impossible : {error}</Notice>}
              {list.map((v) => (
                <VersionCard key={v.version} meta={v} spec={spec} completedRunId={completedRunId} onChanged={onChanged} />
              ))}
            </div>
          )}
        </div>
      </Panel>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function VersionCard({ meta, spec, completedRunId, onChanged }: { meta: BusinessModelMeta; spec: AppSpecPreview | null; completedRunId: string | null; onChanged: () => Promise<unknown> }) {
  const { get, post } = useProject();
  const act = useAction();
  const [comment, setComment] = useState("");
  const [content, setContent] = useState<RulePackageContent | null>(null);
  const [contentState, setContentState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const st = BM_STATUS[meta.status] ?? { label: meta.status, tone: "idle" as const };
  const src = BM_SOURCE[meta.source] ?? { label: meta.source };
  const errors = meta.issues.filter((i) => i.level === "error");
  const warnings = meta.issues.filter((i) => i.level !== "error");
  const hc = meta.history_check ?? null;
  const sum = hc ? totals(hc) : null;
  const doubtful = !hc || !!(sum && (sum.different > 0 || sum.not_computable > 0));
  const needComment = meta.status === "proposed" && doubtful;
  const ent = (name: string) => entityLabel(spec, name);
  // Une entrée par logiciel livré, avec la date de la dernière installation
  const published = Object.values(
    (meta.published ?? []).reduce<Record<string, { app_id: string; at: string }>>((m, p) => {
      m[p.app_id] = { app_id: p.app_id, at: p.at };
      return m;
    }, {}),
  );

  async function loadContent() {
    if (content || contentState.loading) return;
    setContentState({ loading: true, error: null });
    try {
      setContent(await get<RulePackageContent>(`/api/migration/business-model?version=${meta.version}`));
      setContentState({ loading: false, error: null });
    } catch (e) {
      setContentState({ loading: false, error: (e as Error).message });
    }
  }

  async function check() {
    const r = await act.run(
      "check",
      () => post<{ ok: boolean; check: HistoryCheck }>("/api/migration/business-model/check", { version: meta.version }),
      (r) => {
        const t = totals(r.check);
        return { tone: t.different || t.not_computable ? "warn" : "ok", text: <>Rejouée sur l&apos;historique : {r.check.statement}</> };
      },
    );
    if (r) await onChanged();
  }

  async function decide(decision: "validated" | "rejected") {
    const text = comment.trim();
    const r = await act.run(
      decision,
      () => post<{ ok: boolean; version: number; status: string }>("/api/migration/business-model/decision", { version: meta.version, decision, ...(text ? { comment: text } : {}) }),
      (r) =>
        decision === "validated"
          ? { tone: "ok", text: `Version v${r.version} validée : elle sera installée à la prochaine génération ou mise à jour du logiciel si elle reste cohérente avec les correspondances, et peut être publiée dès maintenant dans le logiciel en service (étape Livraison).` }
          : { tone: "info", text: `Version v${r.version} refusée : elle ne sera pas installée.` },
    );
    if (r) {
      setComment("");
      await onChanged();
    }
  }

  return (
    <article className="rounded-md bg-paper shadow-[0_0_0_1px_var(--color-line-strong)]">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3.5 pt-3">
        <span className="specimen">v{meta.version}</span>
        <Pill tone={st.tone}>{st.label}</Pill>
        {src.test ? <TestBadge label={src.label} /> : <Pill>{src.label}</Pill>}
        <span className="text-[12px] text-silt">
          reçue le {fmtDate(meta.received_at)} · {meta.by}
        </span>
        <span className="font-mono text-[11px] text-silt" title={`Empreinte SHA-256 du paquet reçu : ${meta.sha256}`}>
          #{meta.sha256.slice(0, 10)}
        </span>
      </header>

      <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-[11.5px] font-bold text-silt">Modules de règles ({fmtInt(meta.modules.length)})</h4>
          <div className="mt-1 flex flex-wrap gap-1">
            {meta.modules.length ? (
              meta.modules.map((m) => (
                <span key={m} className="specimen">
                  {m}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-silt">—</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="text-[11.5px] font-bold text-silt">Liaisons au nouveau logiciel ({fmtInt(meta.bindings.length)})</h4>
          {meta.bindings.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-[12px]">
              {meta.bindings.map((b) => (
                <li key={b.id} className="break-words">
                  <span className="font-mono text-[11.5px]">{b.id}</span> : {b.module} → {ent(b.entity)} <span className="text-silt">({b.scope === "line" ? "par ligne" : "par document"})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-ochre">Aucune liaison : ce modèle ne calculerait rien dans le nouveau logiciel.</p>
          )}
        </div>
      </div>

      {meta.issues.length > 0 && (
        <div className="mx-3.5 mb-3 rounded-sm bg-chalk px-3 py-2">
          <h4 className="text-[11.5px] font-bold text-sediment">
            Problèmes détectés à la réception : {plural(errors.length, "erreur bloquante", "erreurs bloquantes")} · {plural(warnings.length, "avertissement", "avertissements")}
          </h4>
          <ul className="mt-1 flex max-h-44 flex-col gap-0.5 overflow-y-auto text-[12px]">
            {[...errors, ...warnings].map((i, n) => (
              <li key={`${i.path}-${n}`} className={cx("break-words", i.level === "error" ? "text-rust" : "text-ochre")}>
                <span className="font-mono text-[11px]">{i.path}</span> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="border-t border-line px-3.5 py-3">
        <h4 className="flex items-center gap-1.5 text-[12.5px] font-bold">
          <History size={13} aria-hidden /> Vérification sur l&apos;historique migré
        </h4>
        {hc ? (
          <HistoryCheckView hc={hc} spec={spec} completedRunId={completedRunId} bindings={meta.bindings} />
        ) : (
          <p className="mt-1 text-[12px] leading-relaxed text-ochre">Pas encore rejouée : on ne sait pas encore si cette version reproduit les montants enregistrés dans l&apos;ancien logiciel.</p>
        )}
      </section>

      {published.length > 0 && (
        <p className="border-t border-line px-3.5 py-2 text-[12px] text-sediment">
          Installée dans le logiciel livré :{" "}
          {published.map((p) => (
            <span key={p.app_id} className="mr-2 inline-block">
              <span className="font-mono text-[11.5px]">{p.app_id}</span> (dernière fois le {fmtDate(p.at)})
            </span>
          ))}
        </p>
      )}

      <details
        className="group border-t border-line"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) void loadContent();
        }}
      >
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold text-sediment hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight size={13} className="transition-transform duration-150 group-open:rotate-90" aria-hidden /> Contenu de la version : règles, entrées, sorties
        </summary>
        <div className="px-3.5 pb-3">
          {contentState.loading ? <Loading label="Lecture de la version…" /> : contentState.error ? <LoadError message={contentState.error} onRetry={loadContent} /> : content ? <PackageView pkg={content} ent={ent} /> : null}
        </div>
      </details>

      <section className="border-t border-line px-3.5 py-3">
        {meta.status === "proposed" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-sediment">
                Commentaire{" "}
                <span className="font-normal text-silt">{needComment ? "(requis pour valider : version non rejouée ou avec des écarts ; requis pour refuser)" : "(requis pour refuser)"}</span>
              </span>
              <textarea
                className={cx(inputCls, "h-auto min-h-16 py-2 leading-snug")}
                rows={2}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ex. écarts d'arrondi acceptés ; cas absents de l'historique à surveiller…"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={!!act.busy || !completedRunId} onClick={() => void check()}>
                {act.busy === "check" ? <Spinner size={12} /> : <History size={12} aria-hidden />} Rejouer sur l&apos;historique
              </Button>
              <Button size="sm" variant="accent" disabled={!!act.busy || errors.length > 0 || (needComment && !comment.trim())} onClick={() => void decide("validated")}>
                {act.busy === "validated" && <Spinner size={12} />} Valider cette version
              </Button>
              <Button size="sm" variant="danger" className={DANGER_DISABLED} disabled={!!act.busy || !comment.trim()} onClick={() => void decide("rejected")}>
                {act.busy === "rejected" && <Spinner size={12} />} Refuser
              </Button>
            </div>
            <div className="flex flex-col gap-0.5 text-[11.5px] leading-snug">
              {errors.length > 0 && <p className="text-rust">Validation impossible : {plural(errors.length, "erreur bloquante", "erreurs bloquantes")}. L&apos;Analyste doit publier une version corrigée.</p>}
              {!completedRunId && (
                <p className="text-silt">
                  Rejouer sur l&apos;historique nécessite une migration terminée (<StepLink step="migration">étape Migration</StepLink>).
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-[12.5px] break-words">
              <span className={cx("font-bold", meta.status === "validated" ? "text-[#0b6b5f]" : "text-rust")}>{meta.status === "validated" ? "Validée" : "Refusée"}</span> par {meta.decided_by ?? "—"}
              {meta.decided_at ? ` le ${fmtDate(meta.decided_at)}` : ""}
              {meta.comment ? <span className="text-sediment"> — « {meta.comment} »</span> : null}
            </p>
            <Button size="sm" variant="ghost" disabled={!!act.busy || !completedRunId} onClick={() => void check()} title={completedRunId ? undefined : "Nécessite une migration terminée"}>
              {act.busy === "check" ? <Spinner size={12} /> : <History size={12} aria-hidden />} Rejouer sur l&apos;historique
            </Button>
          </div>
        )}
        {act.notice && (
          <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)} className="mt-2">
            {act.notice.text}
          </Notice>
        )}
      </section>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function HistoryCheckView({ hc, spec, completedRunId, bindings }: { hc: HistoryCheck; spec: AppSpecPreview | null; completedRunId: string | null; bindings: BusinessModelMeta["bindings"] }) {
  const t = totals(hc);
  const notCompared = bindings.filter((b) => !hc.bindings.some((x) => x.id === b.id));
  const samples = hc.bindings.flatMap((b) => b.samples.map((s) => ({ ...s, binding: b.id, entity: b.entity })));
  const fmt = (entity: string, field: string, v: number | string | null) => {
    if (v === null || v === undefined) return "—";
    if (typeof v !== "number") return String(v);
    const type = spec?.entities.find((e) => e.name === entity)?.fields.find((f) => f.name === field)?.type;
    return type === "money" ? fmtMoney(v, spec?.app.currency) : v.toLocaleString("fr-FR");
  };
  const fieldName = (entity: string, field: string) => spec?.entities.find((e) => e.name === entity)?.fields.find((f) => f.name === field)?.label ?? field;
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {completedRunId && hc.run_id !== completedRunId && (
        <Notice tone="warn">
          Rejouée sur la base de {hc.run_id} ; la migration terminée la plus récente est {completedRunId} : rejouez cette version pour la mesurer sur les données actuelles.
        </Notice>
      )}
      {hc.bindings.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-sm shadow-[0_0_0_1px_var(--color-line)]">
          {hc.bindings.map((b) => {
            const cells: { label: string; value: number; cls: string; title?: string }[] = [
              { label: "Rejoués", value: b.checked, cls: "text-ink" },
              { label: "Identiques", value: b.identical, cls: "text-[#0b6b5f]" },
              { label: "Écart d'arrondi", value: b.rounding, cls: b.rounding ? "text-ochre" : "text-silt", title: "Écart dans la tolérance d'arrondi indiquée dans la synthèse ci-dessous" },
              { label: "Différents", value: b.different, cls: b.different ? "text-rust" : "text-silt" },
              { label: "Non calculables", value: b.not_computable, cls: b.not_computable ? "text-ochre" : "text-silt" },
            ];
            return (
              <li key={b.id} className="px-2.5 py-2">
                <div className="text-[12px] break-words">
                  <span className="font-mono text-[11.5px] font-bold">{b.id}</span> <span className="text-silt">· {entityLabel(spec, b.entity)} ({b.scope === "line" ? "lignes" : "documents"})</span>
                </div>
                <div className="text-[11px] break-words text-silt">Comparé&nbsp;: {b.compared_fields.length ? b.compared_fields.map((f) => fieldName(b.entity, f)).join(", ") : "—"}</div>
                <dl className="mt-1.5 grid grid-cols-3 gap-1 sm:grid-cols-5">
                  {cells.map((c) => (
                    <div key={c.label} className="rounded-xs bg-chalk px-2 py-1" title={c.title}>
                      <dt className="text-[10.5px] leading-tight text-silt">{c.label}</dt>
                      <dd className={cx("tabular text-[14px] leading-tight font-bold", c.cls)}>{fmtInt(c.value)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className={cx("text-[12px] leading-relaxed", t.different || t.not_computable ? "text-ink" : "text-sediment")}>{hc.statement}</p>
      {notCompared.length > 0 && (
        <p className="text-[11.5px] leading-snug text-sediment">
          <span className="font-bold">Non comparées : {notCompared.map((b) => b.id).join(", ")}.</span> Aucune valeur enregistrée dans l&apos;ancien logiciel ne permet de les vérifier (sortie absente de l&apos;historique ou identique à une entrée), ou leur entité n&apos;a pas été migrée.
        </p>
      )}
      <p className="text-[11px] text-silt">
        Rejouée le {fmtDate(hc.at)} sur la base migrée de {hc.run_id}, en lecture seule.
      </p>
      {samples.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-bold text-sediment hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight size={12} className="transition-transform duration-150 group-open:rotate-90" aria-hidden /> Exemples d&apos;écarts relevés ({fmtInt(samples.length)})
          </summary>
          <ul className="mt-1.5 flex max-h-56 flex-col gap-1 overflow-y-auto text-[12px]">
            {samples.map((s, i) => (
              <li key={`${s.binding}-${s.record}-${s.field}-${i}`} className="rounded-xs bg-chalk px-2.5 py-1.5 break-words">
                <span className="font-bold">{s.record}</span> <span className="text-silt">· {s.binding}</span>
                {s.field === "-" ? (
                  <span className="text-ochre"> — non calculable : {s.reason ?? "raison non précisée"}</span>
                ) : (
                  <>
                    {" "}
                    — {fieldName(s.entity, s.field)} : enregistré <span className="tabular font-mono">{fmt(s.entity, s.field, s.stored)}</span> · recalculé <span className="tabular font-mono">{fmt(s.entity, s.field, s.computed)}</span>
                    {s.reason && <span className={s.reason.includes("arrondi") ? "text-ochre" : "text-rust"}> ({s.reason})</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function describeSource(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(String).join(", sinon ");
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.sum === "string") return `somme de ${o.sum}`;
    if (typeof o.date_number === "string") return `date ${o.date_number} (AAAAMMJJ)`;
    if ("value" in o) return `valeur fixe ${String(o.value)}`;
  }
  return JSON.stringify(v);
}

function PackageView({ pkg, ent }: { pkg: RulePackageContent; ent: (name: string) => string }) {
  const modules = Object.entries(pkg.modules ?? {});
  return (
    <div className="flex flex-col gap-3 pt-1">
      {pkg.notes && <p className="rounded-sm bg-chalk px-3 py-2 text-[12px] leading-relaxed whitespace-pre-line text-sediment">{pkg.notes}</p>}
      {pkg.published_at && (
        <p className="text-[11.5px] text-silt">
          Publiée le {fmtDate(pkg.published_at)}
          {pkg.published_by ? ` par ${pkg.published_by}` : ""}
          {pkg.contract_version ? ` · contrat ${pkg.contract_version}` : ""}
        </p>
      )}
      {modules.map(([name, m]) => {
        const rules = m.rules ?? [];
        return (
          <div key={name} className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="specimen">{name}</span>
              <span className="text-[12px] text-sediment">{plural(rules.length, "règle", "règles")}</span>
            </div>
            {!!(m.inputs?.length || m.outputs?.length) && (
              <p className="mt-1 text-[12px] break-words text-sediment">
                {m.inputs?.length ? `Entrées : ${m.inputs.map((i) => i.label ?? i.name).join(", ")}` : ""}
                {m.inputs?.length && m.outputs?.length ? " · " : ""}
                {m.outputs?.length ? `Sorties : ${m.outputs.map((o) => o.label ?? o.name).join(", ")}` : ""}
              </p>
            )}
            {rules.length > 0 && (
              <ul className="mt-1 flex flex-col divide-y divide-line rounded-sm shadow-[0_0_0_1px_var(--color-line)]">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-[12px]">
                    <span className="font-mono text-[11px] text-silt">{r.id}</span>
                    <span className="min-w-0 break-words">{r.description ?? r.type}</span>
                    {r.validation_status && <StatusBadge status={r.validation_status} />}
                    {r.confidence !== undefined && <span className="text-[11px] text-silt">confiance déclarée {Math.round(r.confidence * 100)} %</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {pkg.bindings.map((b) => (
        <div key={b.id} className="rounded-sm bg-chalk px-3 py-2 text-[12px]">
          <div className="break-words">
            <span className="font-mono font-bold">{b.id}</span>
            <span className="text-sediment">
              {" "}
              — module {b.module} → {ent(b.entity)} ({b.scope === "line" ? "par ligne" : "par document"}
              {b.document ? ` ; document : ${ent(b.document.entity)} via ${b.document.via}` : ""}
              {b.lines ? ` ; lignes : ${ent(b.lines.entity)} via ${b.lines.via}` : ""})
            </span>
          </div>
          <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-silt">Entrées lues</div>
              <ul>
                {Object.entries(b.inputs).map(([k, v]) => (
                  <li key={k} className="break-words">
                    <span className="font-mono text-[11.5px]">{k}</span> ← {describeSource(v)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-silt">Sorties écrites</div>
              <ul>
                {Object.entries(b.outputs).map(([k, v]) => (
                  <li key={k} className="break-words">
                    <span className="font-mono text-[11.5px]">{k}</span> → {v}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {b.fields?.length ? <p className="mt-1 break-words text-sediment">Champs ajoutés au nouveau logiciel (vides pour l&apos;historique) : {b.fields.map((f) => `${f.label} (${f.name})`).join(", ")}</p> : null}
          {b.note && <p className="mt-1 text-sediment">{b.note}</p>}
        </div>
      ))}
    </div>
  );
}
