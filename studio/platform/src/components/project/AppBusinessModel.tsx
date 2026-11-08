"use client";

import { useId, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, FlaskConical, History, XCircle } from "lucide-react";
import { Button, Field, Textarea, agreePlurals, cx, formatNumber, formatPercent } from "@/components/ds";
import { STATUS_LABEL } from "@/lib/engine/describe";
import { Callout, EmptyState, Facts, Section, TestBadge } from "./Step";
import { useProject } from "./ProjectProvider";
import {
  ActionNotice,
  BM_SOURCE,
  BM_STATUS,
  LoadError,
  Loading,
  StepLink,
  SubHeading,
  Tag,
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
  type Tone,
} from "./AppKit";
import { entityLabel } from "./AppSpecView";

/*
 * Modèle métier (Analyste → REBORN) : versions reçues, rejeu sur l'historique migré, décision
 * humaine. Chaque bouton appelle une route réelle de /api/migration/business-model.
 */

type Totals = { checked: number; identical: number; rounding: number; different: number; not_computable: number };

export function totals(hc: HistoryCheck): Totals {
  return hc.bindings.reduce<Totals>(
    (t, b) => ({
      checked: t.checked + b.checked,
      identical: t.identical + b.identical,
      rounding: t.rounding + b.rounding,
      different: t.different + b.different,
      not_computable: t.not_computable + b.not_computable,
    }),
    { checked: 0, identical: 0, rounding: 0, different: 0, not_computable: 0 },
  );
}

const fieldLabelOf = (spec: AppSpecPreview | null, entity: string, field: string) => spec?.entities.find((e) => e.name === entity)?.fields.find((f) => f.name === field)?.label ?? field;

export function BusinessModelSection({
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
  /** Dernière migration terminée (le rejeu sur l'historique utilise sa base). */
  completedRunId: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const { post } = useProject();
  const act = useAction();
  const [confirmFixture, setConfirmFixture] = useState(false);
  const list = versions ? [...versions].sort((a, b) => b.version - a.version) : [];
  const pending = list.filter((v) => v.status === "proposed");
  const latestValidated = list.find((v) => v.status === "validated") ?? null;
  // Au premier plan : les versions à valider et la version validée la plus récente (sinon la plus récente).
  const front = (v: BusinessModelMeta) => v.status === "proposed" || v === latestValidated || (!pending.length && !latestValidated && v === list[0]);
  // Une seule liste à clés stables : une carte garde son état (commentaire, message) quand elle change de rang.
  const ordered = [...list.filter(front), ...list.filter((v) => !front(v))];
  // Installables = validées et cohérentes avec les correspondances (spec.rules), si l'aperçu est postérieur à la décision.
  const installable = spec?.rules ? new Set(spec.rules.versions.map((v) => v.version)) : null;
  const fresh = !!(spec && latestValidated?.decided_at && spec.app.generated_at >= latestValidated.decided_at);
  const notInstallable = latestValidated && installable && fresh && !installable.has(latestValidated.version) ? latestValidated : null;

  async function receiveFixture() {
    const r = await act.run(
      "fixture",
      () => post<{ ok: boolean; version: number; status: string; issues: ModelIssue[] }>("/api/migration/business-model?fixture=crm", {}),
      (r) => {
        const errors = r.issues.filter((i) => i.level === "error").length;
        return {
          tone: errors ? "warn" : "ok",
          text: errors
            ? `Jeu de test reçu : version v${r.version}, ${plural(errors, "erreur bloquante", "erreurs bloquantes")} à corriger.`
            : `Jeu de test reçu : version v${r.version} à valider. Rejouez-la sur l'historique avant de décider.`,
        };
      },
    );
    setConfirmFixture(false);
    if (r) await onChanged();
  }

  return (
    <Section
      id="modele-metier"
      className="scroll-mt-4"
      title="Modèle métier"
      description="Les calculs de l'ancien logiciel, rejoués sur l'historique migré avant d'être validés."
      badge={pending.length ? <Tag tone="warn">{plural(pending.length, "version à valider", "versions à valider")}</Tag> : null}
    >
      {loading && !versions ? (
        <Loading label="Lecture des versions du modèle métier…" />
      ) : !versions ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-3">
          {error && <Callout tone="warn">Actualisation impossible : {error}</Callout>}
          {notInstallable && <Callout tone="warn">La version v{notInstallable.version} est validée mais ne correspond plus aux correspondances actuelles : elle ne serait pas installée.</Callout>}
          {ordered.length === 0 ? (
            <EmptyState title="En attente de l'Analyste">Sans modèle validé, le logiciel livré fonctionne mais ne calcule pas les nouveaux documents.</EmptyState>
          ) : (
            <ul className="flex flex-col">
              {ordered.map((v, i) => {
                const firstOld = !front(v) && (i === 0 || front(ordered[i - 1]));
                return (
                  <li key={v.version} className={cx(i > 0 && (front(v) || firstOld ? "mt-5 border-t border-line pt-5" : "mt-2"))}>
                    {firstOld && <p className="mb-2.5 text-small font-semibold text-text-3">Versions précédentes</p>}
                    <VersionCard meta={v} compact={!front(v)} spec={spec} completedRunId={completedRunId} onChanged={onChanged} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small leading-snug text-text-2">
          <TestBadge />
          <span>Modèle écrit à la main au format de l&apos;Analyste, en attendant son envoi.</span>
        </p>
        <Button
          variant="secondary"
          className="self-start sm:self-auto"
          disabled={!!act.busy || confirmFixture}
          loading={act.busy === "fixture"}
          icon={<FlaskConical size={16} />}
          // Une première version se reçoit directement ; ensuite, la création d'une nouvelle version est confirmée
          onClick={() => (list.length ? setConfirmFixture(true) : void receiveFixture())}
        >
          Recevoir le jeu de test Relatio
        </Button>
      </div>
      {confirmFixture && (
        <Callout tone="warn" className="mt-3" title={`Créer la version v${(list[0]?.version ?? 0) + 1} du modèle métier ?`}>
          Le jeu de test sera reçu comme une nouvelle version, à rejouer puis à valider ; les versions existantes ne changent pas.
          <span className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={act.busy === "fixture"} onClick={() => receiveFixture()}>
              Créer la version v{(list[0]?.version ?? 0) + 1}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!act.busy} onClick={() => setConfirmFixture(false)}>
              Annuler
            </Button>
          </span>
        </Callout>
      )}
      {act.notice && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Une version                                                          */
/* ------------------------------------------------------------------ */

function SourceTag({ source }: { source: string }) {
  const src = BM_SOURCE[source] ?? { label: source };
  return src.test ? <TestBadge /> : <Tag>{src.label}</Tag>;
}

function VersionCard({
  meta,
  compact,
  spec,
  completedRunId,
  onChanged,
}: {
  meta: BusinessModelMeta;
  compact: boolean;
  spec: AppSpecPreview | null;
  completedRunId: string | null;
  onChanged: () => Promise<unknown>;
}) {
  const { post } = useProject();
  const act = useAction();
  const commentId = useId();
  const [comment, setComment] = useState("");

  const st = BM_STATUS[meta.status] ?? { label: meta.status, tone: "idle" as const };
  const errors = meta.issues.filter((i) => i.level === "error");
  const hc = meta.history_check ?? null;
  const sum = hc ? totals(hc) : null;
  const doubtful = !hc || !!(sum && (sum.different > 0 || sum.not_computable > 0));
  const needComment = meta.status === "proposed" && doubtful;
  const computes = [...new Set(meta.bindings.map((b) => entityLabel(spec, b.entity)))];

  async function check() {
    const r = await act.run(
      "check",
      () => post<{ ok: boolean; check: HistoryCheck }>("/api/migration/business-model/check", { version: meta.version }),
      (r) => {
        const t = totals(r.check);
        const gaps = t.different + t.not_computable;
        return gaps
          ? { tone: "warn", text: `Rejeu terminé : ${plural(gaps, "écart à examiner", "écarts à examiner")} avant de décider.` }
          : { tone: "ok", text: t.rounding ? "Rejeu terminé : aucun écart au-delà de l'arrondi." : "Rejeu terminé : tous les montants sont identiques." };
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
          ? { tone: "ok", text: `Version v${r.version} validée : elle sera installée à la prochaine mise en service, ou publiée dès maintenant depuis l'étape Livraison.` }
          : { tone: "info", text: `Version v${r.version} refusée : elle ne sera pas installée.` },
    );
    if (r) {
      setComment("");
      await onChanged();
    }
  }

  const replayButton = (
    <Button
      size="sm"
      variant="secondary"
      disabled={(!!act.busy && act.busy !== "check") || !completedRunId}
      loading={act.busy === "check"}
      loadingText="Rejeu en cours…"
      icon={<History size={14} />}
      title={completedRunId ? undefined : "Nécessite une migration terminée"}
      onClick={() => void check()}
    >
      Rejouer sur l&apos;historique
    </Button>
  );

  const body = (
    <>
      {errors.length > 0 && (
        <Callout tone="bad" className="mb-3" title={plural(errors.length, "erreur bloquante", "erreurs bloquantes")}>
          Validation impossible : l&apos;Analyste doit publier une version corrigée (détail ci-dessous).
        </Callout>
      )}

      <div className="rounded-panel bg-canvas px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className="text-body font-semibold text-ink">Comparaison avec l&apos;ancien logiciel</h3>
          {replayButton}
        </div>
        {hc ? (
          <Replay hc={hc} spec={spec} completedRunId={completedRunId} />
        ) : (
          <p className="mt-1.5 text-body leading-relaxed text-text-2">Pas encore rejouée : on ignore si elle reproduit les montants de l&apos;ancien logiciel.</p>
        )}
        {!completedRunId && (
          <p className="mt-2 text-small text-text-3">
            Le rejeu nécessite une migration terminée (<StepLink step="migration">étape Migration</StepLink>).
          </p>
        )}
        {act.notice && act.last === "check" && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
      </div>

      {meta.status === "proposed" ? (
        <div className="mt-4 flex flex-col gap-3">
          <Field id={commentId} label="Commentaire" hint={needComment ? "Requis pour valider : version non rejouée ou avec des écarts. Toujours requis pour refuser." : "Requis pour refuser ; facultatif pour valider."}>
            <Textarea rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. écarts d'arrondi acceptés ; cas absents de l'historique à surveiller…" />
          </Field>
          <p className="text-small text-text-2">
            Valider : cette version sera installée dans le logiciel livré et calculera les nouveaux documents ; l&apos;historique migré n&apos;est jamais recalculé. Votre décision est consignée à votre nom.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" disabled={(!!act.busy && act.busy !== "validated") || errors.length > 0 || (needComment && !comment.trim())} loading={act.busy === "validated"} icon={<CheckCircle2 size={16} />} onClick={() => void decide("validated")}>
              Valider cette version
            </Button>
            <Button variant="danger-subtle" disabled={(!!act.busy && act.busy !== "rejected") || !comment.trim()} loading={act.busy === "rejected"} onClick={() => void decide("rejected")}>
              Refuser
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-body leading-relaxed break-words text-ink">
          {meta.status === "validated" ? <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" /> : <XCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-danger-ink" />}
          <span className="min-w-0">
            Version {meta.status === "validated" ? "validée" : "refusée"} par <b>{meta.decided_by ?? "—"}</b>
            {meta.decided_at ? ` le ${fmtDate(meta.decided_at)}` : ""}
            {meta.comment ? <span className="text-text-2"> — « {meta.comment} »</span> : null}
          </span>
        </p>
      )}

      {act.notice && act.last !== "check" && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}

      <VersionDetails meta={meta} spec={spec} />
    </>
  );

  if (compact)
    return (
      <details className="group/old rounded-panel bg-surface ring-1 ring-line-strong">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-panel px-4 py-3 transition-colors hover:bg-canvas [&::-webkit-details-marker]:hidden">
          <ChevronRight size={15} aria-hidden className="shrink-0 text-text-3 transition-transform duration-150 group-open/old:rotate-90" />
          <span className="font-mono text-body font-semibold text-ink">v{meta.version}</span>
          <Tag tone={st.tone}>{st.label}</Tag>
          <SourceTag source={meta.source} />
          <span className="text-small text-text-3">{meta.decided_at ? `décision le ${fmtDate(meta.decided_at)}` : `reçue le ${fmtDate(meta.received_at)}`}</span>
        </summary>
        <div className="border-t border-line px-4 py-4">{body}</div>
      </details>
    );

  return (
    <article className="min-w-0">
      <header className="mb-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="font-mono text-lead font-semibold  text-ink">v{meta.version}</span>
          <Tag tone={st.tone}>{st.label}</Tag>
          <SourceTag source={meta.source} />
          <span className="text-small text-text-3 sm:ml-auto">reçue le {fmtDate(meta.received_at)}</span>
        </div>
        <p className={cx("mt-1 text-body leading-snug", computes.length ? "text-text-2" : "text-warning-ink")}>
          {computes.length ? `Calcule : ${computes.join(", ")}` : "Aucune liaison : ce modèle ne calculerait rien dans le nouveau logiciel."}
        </p>
      </header>
      {body}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Rejeu sur l'historique                                               */
/* ------------------------------------------------------------------ */

const PARTS = [
  { key: "identical", bar: "bg-accent", one: "identique", many: "identiques", hint: "Identique au centime au montant enregistré dans l'ancien logiciel" },
  { key: "rounding", bar: "bg-warning", one: "écart d'arrondi", many: "écarts d'arrondi", hint: "Écart dans la tolérance d'arrondi" },
  { key: "different", bar: "bg-danger", one: "différent", many: "différents", hint: "Montant recalculé différent du montant enregistré" },
  { key: "not_computable", bar: "bg-text-3", one: "non calculable", many: "non calculables", hint: "Données insuffisantes pour recalculer" },
] as const;

function Replay({ hc, spec, completedRunId }: { hc: HistoryCheck; spec: AppSpecPreview | null; completedRunId: string | null }) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      {completedRunId && hc.run_id !== completedRunId && (
        <Callout tone="warn">
          Rejouée sur {hc.run_id} ; la migration la plus récente est {completedRunId} : rejouez-la pour la mesurer sur les données actuelles.
        </Callout>
      )}
      {hc.bindings.length ? (
        hc.bindings.map((b) => {
          const fields = b.compared_fields.map((f) => fieldLabelOf(spec, b.entity, f)).join(", ");
          return (
            <div key={b.id} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="min-w-0 text-body break-words">
                  <span className="font-semibold text-ink">{entityLabel(spec, b.entity)}</span>
                  {fields && <span className="text-text-3"> · {fields}</span>}
                </p>
                <p className="tabular shrink-0 text-small text-text-3">{plural(b.checked, "enregistrement rejoué", "enregistrements rejoués")}</p>
              </div>
              {/* Barre segmentée : la part de chaque résultat ; les nombres sont dans la légende. */}
              <div aria-hidden className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
                {b.checked > 0 &&
                  PARTS.map((p) => (b[p.key] > 0 ? <span key={p.key} className={cx("h-full min-w-1 rounded-full", p.bar)} style={{ width: `${(b[p.key] / b.checked) * 100}%` }} /> : null))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small">
                {PARTS.map((p) => (
                  <li key={p.key} title={p.hint} className={cx("tabular inline-flex items-center gap-1.5", b[p.key] ? "text-ink" : "text-text-3")}>
                    <span aria-hidden className={cx("size-2 rounded-[2px]", b[p.key] ? p.bar : "bg-surface-sunken")} />
                    {plural(b[p.key], p.one, p.many)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      ) : (
        <p className="text-body text-text-2">Aucune liaison n&apos;a pu être comparée à l&apos;historique (détail ci-dessous).</p>
      )}
      <p className="text-small text-text-3">
        Rejouée le {fmtDate(hc.at)} sur {hc.run_id}, en lecture seule : l&apos;historique n&apos;est pas modifié.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Détails d'une version (repliés)                                       */
/* ------------------------------------------------------------------ */

function VersionDetails({ meta, spec }: { meta: BusinessModelMeta; spec: AppSpecPreview | null }) {
  const { get } = useProject();
  const [content, setContent] = useState<RulePackageContent | null>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const errors = meta.issues.filter((i) => i.level === "error");
  const warnings = meta.issues.filter((i) => i.level !== "error");
  const hc = meta.history_check ?? null;
  const ent = (name: string) => entityLabel(spec, name);
  const notCompared = hc ? meta.bindings.filter((b) => !hc.bindings.some((x) => x.id === b.id)) : [];
  const samples = hc ? hc.bindings.flatMap((b) => b.samples.map((s) => ({ ...s, binding: b.id, entity: b.entity }))) : [];
  // Une entrée par logiciel livré, avec la date de la dernière installation
  const published = Object.values(
    (meta.published ?? []).reduce<Record<string, { app_id: string; at: string }>>((m, p) => {
      m[p.app_id] = { app_id: p.app_id, at: p.at };
      return m;
    }, {}),
  );
  const fmtValue = (entity: string, field: string, v: number | string | null) => {
    if (v === null || v === undefined) return "—";
    if (typeof v !== "number") return String(v);
    const type = spec?.entities.find((e) => e.name === entity)?.fields.find((f) => f.name === field)?.type;
    return type === "money" ? fmtMoney(v, spec?.app.currency) : formatNumber(v);
  };

  async function loadContent() {
    if (content || state.loading) return;
    setState({ loading: true, error: null });
    try {
      setContent(await get<RulePackageContent>(`/api/migration/business-model?version=${meta.version}`));
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return (
    <details
      className="group/vd mt-3"
      onToggle={(e) => {
        if (e.currentTarget.open) void loadContent();
      }}
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xs text-small font-semibold text-text-2 transition-colors hover:text-ink max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="transition-transform duration-150 group-open/vd:rotate-90" /> Détails de la version
      </summary>

      <div className="mt-4 flex flex-col gap-5">
        <Facts
          items={[
            { label: "Reçue", value: `le ${fmtDate(meta.received_at)} · ${meta.by}` },
            { label: "Empreinte SHA-256", value: <span className="font-mono text-small break-all">{meta.sha256}</span> },
            { label: "Modules de règles", value: meta.modules.length ? <span className="font-mono text-small">{meta.modules.join(", ")}</span> : "—" },
            {
              label: "Installée dans",
              value: published.length ? published.map((p) => `${p.app_id} (dernière fois le ${fmtDate(p.at)})`).join(" · ") : "Aucun logiciel livré",
            },
          ]}
        />

        <div>
          <SubHeading>Liaisons au nouveau logiciel</SubHeading>
          {meta.bindings.length ? (
            <ul className="mt-1.5 flex flex-col gap-1 text-small">
              {meta.bindings.map((b) => (
                <li key={b.id} className="break-words text-text-2">
                  <span className="font-mono text-small text-ink">{b.id}</span> : {b.module} → {ent(b.entity)} ({b.scope === "line" ? "par ligne" : "par document"})
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-small text-warning-ink">Aucune liaison : ce modèle ne calculerait rien dans le nouveau logiciel.</p>
          )}
        </div>

        {meta.issues.length > 0 && (
          <div>
            <SubHeading>
              Problèmes détectés à la réception : {plural(errors.length, "erreur bloquante", "erreurs bloquantes")} · {plural(warnings.length, "avertissement", "avertissements")}
            </SubHeading>
            <ul tabIndex={0} aria-label="Problèmes détectés à la réception" className="mt-1.5 flex max-h-48 flex-col gap-1 overflow-y-auto text-small">
              {[...errors, ...warnings].map((i, n) => (
                <li key={`${i.path}-${n}`} className={cx("break-words", i.level === "error" ? "text-danger-ink" : "text-warning-ink")}>
                  <span className="font-mono text-meta">{i.path}</span> — {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hc && (
          <div>
            <SubHeading>Rejeu détaillé</SubHeading>
            <p className="mt-1.5 text-small leading-relaxed text-text-2">{agreePlurals(hc.statement)}</p>
            {notCompared.length > 0 && (
              <p className="mt-1.5 text-small leading-relaxed text-text-2">
                <b className="text-ink">Non comparées : {notCompared.map((b) => ent(b.entity)).join(", ")}.</b> Aucune valeur de l&apos;ancien logiciel ne permet de les vérifier, ou leur entité
                n&apos;a pas été migrée.
              </p>
            )}
            {samples.length > 0 && (
              <>
                <p className="mt-3 text-small font-semibold text-text-3">Exemples d&apos;écarts relevés ({fmtInt(samples.length)})</p>
                <ul tabIndex={0} aria-label="Exemples d'écarts relevés" className="mt-1.5 flex max-h-60 flex-col divide-y divide-line overflow-y-auto rounded-panel text-small ring-1 ring-line">
                  {samples.map((s, i) => (
                    <li key={`${s.binding}-${s.record}-${s.field}-${i}`} className="px-3 py-2 break-words">
                      <span className="font-mono text-small font-semibold text-ink">{s.record}</span>
                      {s.field === "-" ? (
                        <span className="text-warning-ink"> — non calculable : {s.reason ?? "raison non précisée"}</span>
                      ) : (
                        <span className="text-text-2">
                          {" "}
                          — {fieldLabelOf(spec, s.entity, s.field)} : enregistré <span className="tabular text-ink">{fmtValue(s.entity, s.field, s.stored)}</span>, recalculé{" "}
                          <span className="tabular text-ink">{fmtValue(s.entity, s.field, s.computed)}</span>
                          {s.reason && <span className={s.reason.includes("arrondi") ? "text-warning-ink" : "text-danger-ink"}> ({s.reason})</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div>
          <SubHeading>Règles, entrées et sorties</SubHeading>
          <div className="mt-1.5">
            {state.loading ? (
              <Loading label="Lecture de la version…" />
            ) : state.error ? (
              <LoadError message={state.error} onRetry={loadContent} />
            ) : content ? (
              <PackageView pkg={content} ent={ent} />
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */

const RULE_STATUS_TONE: Record<string, Tone> = { hypothesis: "warn", tested: "info", validated: "ok", rejected: "bad" };

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
  const line = (k: string, v: ReactNode) => (
    <li key={k} className="break-words">
      <span className="font-mono text-small text-ink">{k}</span> {v}
    </li>
  );
  return (
    <div className="flex flex-col gap-4">
      {pkg.notes && <p className="rounded-panel bg-surface-sunken px-3.5 py-2.5 text-small leading-relaxed whitespace-pre-line text-text-2">{pkg.notes}</p>}
      {pkg.published_at && (
        <p className="text-small text-text-3">
          Publiée le {fmtDate(pkg.published_at)}
          {pkg.published_by ? ` par ${pkg.published_by}` : ""}
        </p>
      )}
      {modules.map(([name, m]) => {
        const rules = m.rules ?? [];
        return (
          <div key={name} className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-small">
              <span className="font-mono text-small font-semibold text-ink">{name}</span>
              <span className="text-text-3">{plural(rules.length, "règle", "règles")}</span>
            </p>
            {!!(m.inputs?.length || m.outputs?.length) && (
              <p className="mt-1 text-small break-words text-text-2">
                {m.inputs?.length ? `Entrées : ${m.inputs.map((i) => i.label ?? i.name).join(", ")}` : ""}
                {m.inputs?.length && m.outputs?.length ? " · " : ""}
                {m.outputs?.length ? `Sorties : ${m.outputs.map((o) => o.label ?? o.name).join(", ")}` : ""}
              </p>
            )}
            {rules.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-small">
                    <span className="font-mono text-meta text-text-3">{r.id}</span>
                    <span className="min-w-0 flex-1 break-words text-ink">{r.description ?? r.type}</span>
                    {r.validation_status && <Tag tone={RULE_STATUS_TONE[r.validation_status] ?? "idle"}>{STATUS_LABEL[r.validation_status] ?? r.validation_status}</Tag>}
                    {r.confidence !== undefined && <span className="tabular text-meta text-text-3">confiance déclarée {formatPercent(r.confidence, 0)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {pkg.bindings.map((b) => (
        <div key={b.id} className="rounded-panel bg-canvas px-3.5 py-3 text-small">
          <p className="break-words text-text-2">
            <span className="font-mono text-small font-semibold text-ink">{b.id}</span> — module {b.module} → {ent(b.entity)} ({b.scope === "line" ? "par ligne" : "par document"}
            {b.document ? ` ; document : ${ent(b.document.entity)} via ${b.document.via}` : ""}
            {b.lines ? ` ; lignes : ${ent(b.lines.entity)} via ${b.lines.via}` : ""})
          </p>
          <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-meta font-semibold text-text-3">Entrées lues</p>
              <ul className="mt-0.5 text-text-2">{Object.entries(b.inputs).map(([k, v]) => line(k, <>← {describeSource(v)}</>))}</ul>
            </div>
            <div className="min-w-0">
              <p className="text-meta font-semibold text-text-3">Sorties écrites</p>
              <ul className="mt-0.5 text-text-2">{Object.entries(b.outputs).map(([k, v]) => line(k, <>→ {v}</>))}</ul>
            </div>
          </div>
          {b.fields?.length ? (
            <p className="mt-2 break-words text-text-2">Champs ajoutés au nouveau logiciel (vides pour l&apos;historique) : {b.fields.map((f) => `${f.label} (${f.name})`).join(", ")}</p>
          ) : null}
          {b.note && <p className="mt-1 text-text-2">{b.note}</p>}
        </div>
      ))}
    </div>
  );
}
