"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { Button, cx } from "@/components/ds";
import { Callout, Section } from "./Step";
import {
  CsvLink,
  More,
  StepLink,
  T,
  TONE_TEXT,
  Tag,
  VERDICT,
  ZERO,
  count,
  duration,
  fmt,
  maskRaw,
  pl,
  share,
  sourceHint,
  whenShort,
  type Check,
  type FieldIssue,
  type Rejection,
  type RunDetail,
  type Tone,
  TableScroll,
  scrollRegion,
} from "./RunCommon";
import { checkState, stateCounts } from "./RunVerification";

/** Ancre de la section « Résultat » (on y revient quand on choisit une autre exécution). */
export const RESULT_ANCHOR = "resultat-execution";

const labelOf = (detail: RunDetail) => {
  const m = new Map(detail.entities.map((e) => [e.entity, e.label ?? e.entity]));
  return (entity: string) => m.get(entity) ?? entity;
};

function groupBy<T>(list: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return [...m.entries()];
}

const listCls = "overflow-hidden rounded-panel ring-1 ring-line";

/* ------------------------------------------------------------------ */
/* Bilan d'une exécution : relations, contrôles, statut                  */
/* ------------------------------------------------------------------ */

/** Relations préservées, d'après les contrôles réellement faits sur la nouvelle base. */
export function relationsState(detail: RunDetail): { tone: Tone; label: string; text: string } {
  const integrity = detail.report?.checks.find((c) => c.id === "relations.integrite");
  const links = detail.report?.checks.find((c) => c.id === "relations.rattachements");
  const unlinked = detail.entities.reduce((n, e) => n + e.unlinked, 0);
  if (!integrity || !links) return { tone: "idle", label: "Non vérifiées", text: "Aucun rapport de vérification pour cette exécution." };
  if (integrity.status === "fail") return { tone: "bad", label: "Références cassées", text: integrity.summary };
  if (links.status === "fail") return { tone: "bad", label: "Relations faussées", text: links.summary };
  if (unlinked) return { tone: "warn", label: "Préservées, avec des fiches sans lien", text: `${count(unlinked, "fiche migrée sans lien", "fiches migrées sans lien")} : la fiche liée n'existait pas dans l'ancien logiciel (signalé, jamais deviné).` };
  return { tone: "ok", label: "Préservées", text: "Chaque lien lu dans l'ancien logiciel pointe vers la bonne fiche migrée ; aucune référence cassée." };
}

function Fact({ label, tone, title, children }: { label: string; tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-3 sm:px-4 sm:first:pl-0">
      <dt className="text-small font-medium text-text-3">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1">
        <span>
          <Tag tone={tone}>{title}</Tag>
        </span>
        <span className="text-small leading-snug text-text-2">{children}</span>
      </dd>
    </div>
  );
}

function checksTone(checks: Check[]): Tone {
  const states = new Set(checks.map(checkState));
  return states.has("intervention") ? "bad" : states.has("gap") ? "warn" : states.has("unverified") ? "info" : "ok";
}

/* ------------------------------------------------------------------ */
/* Résultat d'une exécution                                             */
/* ------------------------------------------------------------------ */

/**
 * Exécution choisie : volumes par entité (lignes sources = transférées + rejetées), relations et
 * contrôles de la vérification indépendante. Une exécution interrompue n'affiche pas de volumes : sa
 * transaction a été annulée, rien n'a été conservé.
 */
export function RunResult({
  detail,
  latestId,
  projectId,
  validationHref,
  onShowLatest,
}: {
  detail: RunDetail;
  latestId: string | null;
  projectId: string;
  /** Lien vers l'étape Validation, seulement si son rapport est celui de cette exécution. */
  validationHref: string | null;
  onShowLatest: () => void;
}) {
  const m = detail.meta;
  const older =
    latestId && latestId !== m.id ? (
      <Callout
        tone="info"
        className="mb-4"
        title={`Exécution antérieure : la plus récente est ${latestId}.`}
        action={
          <Button size="sm" variant="secondary" onClick={onShowLatest}>
            Afficher {latestId}
          </Button>
        }
      />
    ) : null;

  if (m.status === "failed") {
    return (
      <Section id={RESULT_ANCHOR} className="scroll-mt-24" title={`${m.id} interrompue`} description={`Lancée le ${whenShort(m.at)} par ${m.by} · correspondances v${m.mapping_version}`}>
        {older}
        <Callout tone="bad" title="Transaction annulée : aucune donnée n'a été conservée.">
          <p className="break-words">{m.error ?? "Cause non précisée par le moteur de migration."}</p>
        </Callout>
      </Section>
    );
  }

  const s = m.summary;
  const balanced = s.source_rows === s.imported + s.rejected;
  const sum = detail.entities.reduce(
    (a, e) => ({ source: a.source + e.source_rows, imported: a.imported + e.imported, rejected: a.rejected + e.rejected, flagged: a.flagged + e.conversion_issues + e.unlinked }),
    { source: 0, imported: 0, rejected: 0, flagged: 0 },
  );
  const csv = detail.rejections.total + detail.field_issues.total + detail.attachments.missing > 0;
  const verdict = m.verification ? VERDICT[m.verification] : null;
  const ack = m.verification === "review" ? detail.acknowledged : null;
  const report = detail.report;
  const t = report ? stateCounts(report, 0) : null;
  const rel = relationsState(detail);

  return (
    <Section
      id={RESULT_ANCHOR}
      className="scroll-mt-24"
      title="Résultat de la migration"
      description={`${m.id} · lancée le ${whenShort(m.at)} par ${m.by} · durée ${duration(s.duration_ms)} · correspondances v${m.mapping_version}`}
      actions={csv ? <CsvLink runId={m.id} projectId={projectId} /> : undefined}
    >
      {older}
      {!balanced && (
        <Callout tone="bad" className="mb-4" title="Le compte ne tombe pas juste.">
          {fmt(s.source_rows)} lignes lues pour {fmt(s.imported + s.rejected)} transférées ou rejetées : la vérification détaille l&apos;écart.
        </Callout>
      )}

      <dl className="mb-5 grid border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        <Fact label="Statut" tone={ack ? "ok" : (verdict?.tone ?? "idle")} title={ack ? "Écarts acceptés" : (verdict?.label ?? "Non vérifiée")}>
          {verdict ? (ack ? `Acceptés par ${ack.by} le ${whenShort(ack.at)}.` : m.verification === "validated" ? "Aucun contrôle en échec, aucun écart documenté." : m.verification === "review" ? "Des écarts documentés attendent votre examen." : "Un contrôle bloquant a échoué.") : "Aucun rapport de vérification pour cette exécution."}
        </Fact>
        <Fact label="Relations" tone={rel.tone} title={rel.label}>
          {rel.text}
        </Fact>
        <Fact label="Contrôles" tone={report ? checksTone(report.checks) : "idle"} title={t ? `${fmt(t.validated)} / ${fmt(t.total)} ${pl(t.validated, "validé", "validés")}` : "Aucun"}>
          {t && report
            ? [
                t.gap ? `${fmt(t.gap)} avec écart` : "",
                t.unverified ? `${fmt(t.unverified)} non ${pl(t.unverified, "vérifié", "vérifiés")}` : "",
                t.intervention ? `${fmt(t.intervention)} ${pl(t.intervention, "bloquant", "bloquants")} en échec` : "",
                !t.gap && !t.unverified && !t.intervention ? "aucun écart" : "",
                report.gaps.length ? count(report.gaps.length, "écart documenté", "écarts documentés") : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : "Relancez la migration pour produire une vérification."}
        </Fact>
      </dl>

      {detail.entities.length > 0 ? (
        <TableScroll label={`Résultat de ${m.id} par table`}>
          <table className={T.table}>
            <caption className="sr-only">
              Résultat de {m.id} par table : lignes sources, transférées, rejetées et valeurs signalées
            </caption>
            <thead>
              <tr className={T.head}>
                <th scope="col" className={T.th}>
                  Table
                </th>
                <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                  Lignes sources
                </th>
                <th scope="col" className={T.th}>
                  Transférées
                </th>
                <th scope="col" className={cx(T.th, "max-sm:pr-5")}>
                  Rejetées
                </th>
                <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                  Signalées
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.entities.map((e) => {
                const flagged = e.conversion_issues + e.unlinked;
                const table = sourceHint(e.entity, e.source_table, e.label);
                return (
                  <tr key={e.entity} className={T.row}>
                    <th scope="row" className={cx(T.td, "font-normal")}>
                      <span className="font-semibold text-ink">{e.label ?? e.entity}</span>
                      {table && <span className="block font-mono text-meta break-all text-text-3 sm:ml-2 sm:inline">{table}</span>}
                    </th>
                    <td className={cx(T.td, "hidden text-text-2 sm:table-cell")}>{fmt(e.source_rows)}</td>
                    <td className={cx(T.td, "text-ink")}>
                      <span className="font-semibold">{fmt(e.imported)}</span>
                      {e.source_rows > 0 && <span className="ml-1.5 text-meta text-text-3">{share(e.imported, e.source_rows)}</span>}
                    </td>
                    <td className={cx(T.td, "max-sm:pr-5", e.rejected ? cx("font-semibold", TONE_TEXT.warn) : ZERO)}>{fmt(e.rejected)}</td>
                    <td
                      className={cx(T.td, "hidden sm:table-cell", flagged ? cx("font-semibold", TONE_TEXT.warn) : ZERO)}
                      title={flagged ? `${count(e.conversion_issues, "valeur non convertie", "valeurs non converties")} · ${fmt(e.unlinked)} sans lien` : undefined}
                    >
                      {fmt(flagged)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {detail.entities.length > 1 && (
              <tfoot>
                <tr className={T.foot}>
                  <th scope="row" className={cx(T.td, "font-semibold text-ink")}>
                    Total
                  </th>
                  <td className={cx(T.td, "hidden font-semibold sm:table-cell")}>{fmt(sum.source)}</td>
                  <td className={cx(T.td, "font-semibold")}>
                    {fmt(sum.imported)}
                    {sum.source > 0 && <span className="ml-1.5 text-meta font-normal text-text-3">{share(sum.imported, sum.source)}</span>}
                  </td>
                  <td className={cx(T.td, "max-sm:pr-5 font-semibold", sum.rejected ? TONE_TEXT.warn : ZERO)}>{fmt(sum.rejected)}</td>
                  <td className={cx(T.td, "hidden font-semibold sm:table-cell", sum.flagged ? TONE_TEXT.warn : ZERO)}>{fmt(sum.flagged)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableScroll>
      ) : (
        <p className="text-body text-text-2">Aucune table dans cette exécution.</p>
      )}
      <p className="mt-3 text-small text-text-3">
        Transférées : copiées dans la nouvelle base. Rejetées : non copiées, avec leur motif ; elles restent intactes dans les fichiers récupérés. Signalées : copiées avec une valeur laissée vide ou sans lien,
        jamais devinée.
      </p>

      {verdict && validationHref && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="text-text-2">Le détail de chaque contrôle est à l&apos;étape Validation.</span>
          <StepLink href={validationHref}>Voir la vérification</StepLink>
        </p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Rejets                                                               */
/* ------------------------------------------------------------------ */

function topReasons(list: Rejection[], max = 6): { shown: [string, number][]; others: number } {
  const m = new Map<string, number>();
  for (const r of list) for (const why of r.reasons) m.set(why, (m.get(why) ?? 0) + 1);
  const all = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { shown: all.slice(0, max), others: Math.max(0, all.length - max) };
}

function SourceRow({ raw }: { raw: Record<string, unknown> }) {
  return (
    <More label="Ligne source complète" className="mt-1.5">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-control bg-surface px-3 py-2 font-mono text-meta ring-1 ring-line">
        {maskRaw(raw).map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-text-3">{k}</dt>
            <dd className="break-all text-ink">{v}</dd>
          </Fragment>
        ))}
      </dl>
    </More>
  );
}

/** Lignes rejetées (non transférées), regroupées par table avec leurs motifs. Section repliée. */
export function RunRejections({ detail }: { detail: RunDetail }) {
  const { total, items } = detail.rejections;
  const entityLabel = labelOf(detail);
  const groups = useMemo(() => groupBy(items, (r) => r.entity), [items]);
  if (!total) return null;
  const partial = items.length < total;

  return (
    <Section collapsible title={count(total, "ligne rejetée", "lignes rejetées")} badge={<Tag tone="warn">À connaître</Tag>} description="Non transférées, avec leur motif ; elles restent intactes dans les fichiers récupérés.">
      <div className="flex flex-col gap-5">
        {groups.map(([entity, list]) => {
          const { shown, others } = topReasons(list);
          const table = sourceHint(entity, list[0].source_table, entityLabel(entity));
          return (
            <div key={entity} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3 className="min-w-0 text-body font-semibold text-ink">
                  {entityLabel(entity)} {table && <span className="font-mono text-meta font-normal break-all text-text-3">{table}</span>}
                </h3>
                <span className={cx("tabular text-small font-semibold", TONE_TEXT.warn)}>{count(list.length, "rejet", "rejets")}</span>
              </div>
              <ul className={cx("mt-2", listCls)}>
                {shown.map(([reason, k]) => (
                  <li key={reason} className="flex items-start justify-between gap-3 border-b border-line px-3 py-2 text-body last:border-b-0">
                    <span className="min-w-0 break-words text-ink">{reason}</span>
                    <span className="tabular shrink-0 text-text-3">× {fmt(k)}</span>
                  </li>
                ))}
                {others > 0 && <li className="px-3 py-2 text-small text-text-3">+ {count(others, "autre motif", "autres motifs")}</li>}
              </ul>
              <More label={`Voir les lignes (${fmt(list.length)})`} className="mt-2">
                <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1" {...scrollRegion(`Lignes rejetées : ${entityLabel(entity)}`)}>
                  {list.map((r) => (
                    <li key={`${r.row}-${r.source_key ?? ""}`} className="rounded-control bg-surface-sunken px-3 py-2">
                      <p className="flex flex-wrap gap-x-3 text-small">
                        <span className="font-mono font-semibold text-ink">clé {r.source_key ?? "absente"}</span>
                        <span className="tabular text-text-3">ligne {fmt(r.row)} du fichier</span>
                      </p>
                      <ul className="mt-0.5 text-small text-ink">
                        {r.reasons.map((why, i) => (
                          <li key={i} className="break-words">
                            {why}
                          </li>
                        ))}
                      </ul>
                      {r.raw && <SourceRow raw={r.raw} />}
                    </li>
                  ))}
                </ol>
              </More>
            </div>
          );
        })}
        <p className="text-small text-text-3">
          {partial ? `Les ${fmt(items.length)} premiers rejets sur ${fmt(total)} sont détaillés ici ; le rapport d'écarts (CSV) les contient tous. ` : ""}
          Pour récupérer une ligne, corrigez sa cause (données ou correspondances) puis relancez la migration.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Valeurs signalées (enregistrements migrés)                           */
/* ------------------------------------------------------------------ */

const ISSUE_KIND: Record<FieldIssue["kind"], string> = {
  conversion: "Valeur non convertible, laissée vide",
  unlinked: "Fiche liée introuvable dans l'ancien logiciel, migrée sans lien",
};

/** Enregistrements migrés dont une valeur n'a pas pu être reprise telle quelle. Section repliée. */
export function RunIssues({ detail }: { detail: RunDetail }) {
  const { total, items } = detail.field_issues;
  const entityLabel = labelOf(detail);
  const groups = useMemo(() => groupBy(items, (i) => `${i.entity}\u0000${i.field}\u0000${i.kind}`), [items]);
  if (!total) return null;
  return (
    <Section collapsible title={count(total, "valeur signalée", "valeurs signalées")} description="Fiches transférées avec une valeur vide ou sans lien : rien n'est deviné.">
      <p className="mb-3 text-small text-text-3">La valeur d&apos;origine reste dans la traçabilité de chaque fiche.</p>
      <ul className={listCls}>
        {groups.map(([key, list]) => {
          const first = list[0];
          return (
            <li key={key} className="border-b border-line px-3 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 text-body font-semibold text-ink">
                  {entityLabel(first.entity)} · <span className="font-mono text-small font-normal">{first.field}</span>
                </span>
                <span className={cx("tabular text-small font-semibold", TONE_TEXT.warn)}>× {fmt(list.length)}</span>
              </div>
              <p className="text-small text-text-2">{ISSUE_KIND[first.kind] ?? first.kind}</p>
              <More label={`Voir les fiches (${fmt(list.length)})`} className="mt-1.5">
                <ol className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1" {...scrollRegion(`Fiches signalées : ${entityLabel(first.entity)} · ${first.field}`)}>
                  {list.map((i) => (
                    <li key={`${i.record_id}-${i.field}`} className="rounded-control bg-surface-sunken px-3 py-2 text-small">
                      <span className="font-mono font-semibold text-ink">clé {i.source_key}</span>
                      <span className="text-text-3"> · n° {i.record_id} dans la nouvelle base</span>
                      <span className="block break-words text-ink">
                        {i.message}
                        {i.raw !== null && i.raw !== undefined && i.raw !== "" && (
                          <>
                            {" "}
                            · valeur source <span className="font-mono">{typeof i.raw === "string" ? i.raw : JSON.stringify(i.raw)}</span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </More>
            </li>
          );
        })}
      </ul>
      {items.length < total && <p className="mt-3 text-small text-text-3">Les {fmt(items.length)} premières sur {fmt(total)} sont détaillées ici ; le rapport d&apos;écarts (CSV) les contient toutes.</p>}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Doublons signalés                                                    */
/* ------------------------------------------------------------------ */

/** Fiches partageant une même valeur selon les règles de détection des correspondances. Section repliée. */
export function RunDuplicates({ detail }: { detail: RunDetail }) {
  const groups = detail.duplicates ?? [];
  const entityLabel = labelOf(detail);
  if (!groups.length) return null;
  return (
    <Section collapsible title={count(groups.length, "groupe de doublons possibles", "groupes de doublons possibles")} description="Transférés séparément, sans fusion automatique.">
      <p className="mb-3 text-small text-text-3">Fiches partageant une même valeur selon les règles des correspondances ; l&apos;arbitrage revient à un responsable.</p>
      <ul className={cx("flex max-h-[28rem] flex-col overflow-y-auto", listCls)} {...scrollRegion("Groupes de doublons possibles")}>
        {groups.map((g, i) => (
          <li key={`${g.entity}-${g.rule}-${g.value}-${i}`} className="border-b border-line px-3 py-2.5 last:border-b-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-body">
              <span className="font-semibold text-ink">{entityLabel(g.entity)}</span>
              <span className="text-text-2">{g.rule}</span>
              <span className="font-mono text-small break-all text-ink">« {g.value} »</span>
            </p>
            <p className="mt-0.5 text-small text-text-2">
              {count(g.records.length, "fiche", "fiches")} :{" "}
              {g.records.map((r, k) => (
                <span key={r.id} className="font-mono text-small">
                  {k > 0 && ", "}clé {r.source_key} → n° {r.id}
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
