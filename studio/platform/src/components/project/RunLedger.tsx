"use client";

import { Fragment, useMemo } from "react";
import { Download, Paperclip } from "lucide-react";
import { Button, Panel, cx } from "@/components/ui";
import {
  Cell,
  HeaderRow,
  Notice,
  StepLink,
  TONE_TEXT,
  Tag,
  VERDICT,
  bytes,
  count,
  duration,
  fmt,
  maskRaw,
  tally,
  when,
  type FieldIssue,
  type Rejection,
  type RunDetail,
  type Tone,
} from "./RunCommon";

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

/** Lien de téléchargement du rapport d'écarts (CSV) d'une exécution. */
export function rejectsCsvHref(runId: string, projectId: string) {
  return `/api/migration/runs/${encodeURIComponent(runId)}/rejects?project=${encodeURIComponent(projectId)}`;
}

export function CsvLink({ runId, projectId, label = "CSV des écarts" }: { runId: string; projectId: string; label?: string }) {
  return (
    <a
      href={rejectsCsvHref(runId, projectId)}
      download
      className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-paper px-2.5 text-xs font-bold whitespace-nowrap text-ink shadow-[0_0_0_1px_var(--color-line-strong)] transition-colors duration-150 hover:bg-chalk"
    >
      <Download size={12} aria-hidden /> {label}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Synthèse d'une exécution                                             */
/* ------------------------------------------------------------------ */

function Term({ op, value, label, tone }: { op?: string; value: number; label: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        {op && <span className={cx("text-[22px] leading-none font-light", tone === "bad" && op === "≠" ? "text-rust" : "text-dust")}>{op}</span>}
        <span className={cx("tabular text-[28px] leading-none font-black", tone === "ok" ? "text-verdigris" : tone === "warn" ? "text-ochre" : "text-ink")}>{fmt(value)}</span>
      </div>
      <div className="mt-1 text-[12px] text-sediment">{label}</div>
    </div>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-silt">{label}</dt>
      <dd className={cx("tabular mt-0.5 text-[17px] leading-tight font-black", tone && tone !== "idle" ? TONE_TEXT[tone] : "text-ink")}>{value}</dd>
      {note && <dd className="mt-0.5 text-[11.5px] leading-snug text-sediment">{note}</dd>}
    </div>
  );
}

const ENTITY_COLS = "md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]";

/**
 * Exécution choisie : équilibre « lignes sources = importées + rejetées », volumes par entité,
 * pièces jointes, durée et résultat de la vérification. Une exécution interrompue n'affiche pas
 * de volumes : sa transaction a été annulée, rien n'a été conservé.
 */
export function RunOverview({
  detail,
  latestId,
  validationHref,
  onShowLatest,
}: {
  detail: RunDetail;
  latestId: string | null;
  /** Lien vers l'étape Validation, seulement si son rapport est celui de cette exécution. */
  validationHref: string | null;
  onShowLatest: () => void;
}) {
  const m = detail.meta;
  const failed = m.status === "failed";
  const s = m.summary;
  const balanced = s.source_rows === s.imported + s.rejected;
  const a = detail.attachments;
  const dups = detail.duplicates?.length ?? 0;
  const t = detail.report ? tally(detail.report.checks) : null;
  const verdict = m.verification ? VERDICT[m.verification] : null;
  const ack = m.verification === "review" ? detail.acknowledged : null;

  return (
    <Panel
      eyebrow={`Exécution ${m.id}`}
      title={failed ? "Exécution interrompue" : "Nouvelle base construite"}
      actions={failed ? <Tag tone="bad">Interrompue</Tag> : ack ? <Tag tone="ok">Écarts acceptés</Tag> : verdict ? <Tag tone={verdict.tone}>{verdict.label}</Tag> : null}
    >
      <p className="text-[12px] text-silt">
        Lancée le {when(m.at)} par {m.by} · correspondances v{m.mapping_version} · durée {duration(s.duration_ms)} (migration et vérification)
      </p>

      {latestId && latestId !== m.id && (
        <Notice tone="info" className="mt-3" title={`Exécution antérieure : la plus récente est ${latestId}`}>
          <div>
            <Button size="sm" variant="ghost" onClick={onShowLatest}>
              Afficher {latestId}
            </Button>
          </div>
        </Notice>
      )}

      {failed ? (
        <Notice tone="bad" className="mt-3" title="Transaction annulée : aucune donnée de cette exécution n'a été conservée">
          <p className="break-words">{m.error ?? "Cause non précisée par le moteur de migration."}</p>
          <p className="text-sediment">Corrigez la cause (correspondances ou fichiers sources), puis relancez : une nouvelle exécution repart d&apos;une base vide.</p>
        </Notice>
      ) : (
        <>
          <div className="mt-4">
            <p className="sr-only">
              {fmt(s.source_rows)} lignes sources lues, {fmt(s.imported)} importées, {fmt(s.rejected)} rejetées{balanced ? "" : " : le total ne correspond pas, voir la vérification"}.
            </p>
            <div aria-hidden className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <Term value={s.source_rows} label="lignes sources lues" />
              <Term op={balanced ? "=" : "≠"} value={s.imported} label="importées dans la nouvelle base" tone={balanced ? "ok" : "bad"} />
              <Term op="+" value={s.rejected} label={s.rejected ? "rejetées, motifs ci-dessous" : "rejetée"} tone={s.rejected ? "warn" : undefined} />
            </div>
            {!balanced && (
              <Notice tone="bad" className="mt-3" title="Le compte ne tombe pas juste">
                <p>
                  {fmt(s.source_rows)} lignes lues pour {fmt(s.imported + s.rejected)} importées ou rejetées : la vérification indépendante détaille l&apos;écart.
                </p>
              </Notice>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 sm:grid-cols-4">
            <Figure
              label="Pièces jointes"
              value={a.expected ? `${fmt(a.stored)} / ${fmt(a.expected)}` : "—"}
              note={a.expected ? (a.missing ? `${count(a.missing, "manquante", "manquantes")} · ${bytes(a.bytes)} copiés` : `toutes copiées · ${bytes(a.bytes)}`) : "aucune déclarée dans les correspondances"}
              tone={a.missing ? "warn" : undefined}
            />
            <Figure
              label="Valeurs signalées"
              value={fmt(detail.field_issues.total)}
              note="enregistrements migrés, valeur vide ou sans lien"
              tone={detail.field_issues.total ? "warn" : undefined}
            />
            <Figure label="Doublons potentiels" value={fmt(dups)} note={dups ? "groupes, migrés sans fusion" : "aucun groupe signalé"} tone={dups ? "warn" : undefined} />
            <Figure label="Durée" value={duration(s.duration_ms)} note="migration + vérification" />
          </dl>

          {detail.entities.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              <HeaderRow cols={ENTITY_COLS}>
                <span>Entité · table source</span>
                <span className="text-right">Lignes sources</span>
                <span className="text-right">Importées</span>
                <span className="text-right">Rejetées</span>
                <span className="text-right">Valeurs signalées</span>
              </HeaderRow>
              <ul>
                {detail.entities.map((e) => {
                  const flagged = e.conversion_issues + e.unlinked;
                  return (
                    <li key={e.entity} className={cx("grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:items-baseline", ENTITY_COLS)}>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <span className="text-[13px] font-bold">{e.label ?? e.entity}</span> <span className="font-mono text-[11px] break-all text-silt">{e.source_table}</span>
                      </div>
                      <Cell label="Lignes sources">{fmt(e.source_rows)}</Cell>
                      <Cell label="Importées">
                        <b className="font-bold">{fmt(e.imported)}</b>
                      </Cell>
                      <Cell label="Rejetées">
                        <span className={e.rejected ? cx("font-bold", TONE_TEXT.warn) : "text-silt"}>{fmt(e.rejected)}</span>
                      </Cell>
                      <Cell label="Valeurs signalées">
                        <span className={flagged ? cx("font-bold", TONE_TEXT.warn) : "text-silt"} title={flagged ? `${fmt(e.conversion_issues)} non convertie(s) · ${fmt(e.unlinked)} sans lien` : undefined}>
                          {fmt(flagged)}
                        </span>
                      </Cell>
                    </li>
                  );
                })}
              </ul>
              {a.expected > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-chalk/40 px-3 py-2 text-[12.5px]">
                  <Paperclip size={13} className="text-silt" aria-hidden />
                  <span className="font-bold">Pièces jointes (toutes entités)</span>
                  <span className="tabular text-sediment">
                    {fmt(a.stored)} copiées sur {fmt(a.expected)} référencées · {bytes(a.bytes)}
                    {a.missing ? <span className={cx("font-bold", TONE_TEXT.warn)}> · {count(a.missing, "manquante", "manquantes")}</span> : null}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
            <p className="min-w-0 text-[12.5px] text-sediment">
              {verdict && t ? (
                <>
                  <span className={cx("font-bold", TONE_TEXT[verdict.tone])}>Vérification indépendante : {verdict.label.toLowerCase()}</span> · {count(t.pass, "réussi", "réussis")},{" "}
                  {count(t.warn, "avertissement", "avertissements")}, {count(t.info, "information", "informations")}, {count(t.fail, "échec", "échecs")} sur{" "}
                  {count(t.total, "contrôle", "contrôles")}
                  {ack ? ` · écarts acceptés par ${ack.by} le ${when(ack.at)}` : ""}
                </>
              ) : (
                "Aucun rapport de vérification pour cette exécution."
              )}
            </p>
            {validationHref ? <StepLink href={validationHref}>Examiner la vérification</StepLink> : verdict ? <span className="text-[11.5px] text-silt">L&apos;étape Validation porte sur la dernière exécution terminée.</span> : null}
          </div>
          {detail.db_sha256 && (
            <p className="mt-2 font-mono text-[11px] break-all text-silt" title={detail.db_sha256}>
              Empreinte de la nouvelle base · SHA-256 {detail.db_sha256.slice(0, 24)}…
            </p>
          )}
        </>
      )}
    </Panel>
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
    <details className="mt-1">
      <summary className="cursor-pointer text-[11.5px] font-bold text-silt hover:text-ink">Ligne source complète</summary>
      <dl className="mt-1 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-sm bg-chalk px-2 py-1.5 font-mono text-[11px]">
        {maskRaw(raw).map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-silt">{k}</dt>
            <dd className="break-all text-ink">{v}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  );
}

export function RunRejections({ detail, projectId }: { detail: RunDetail; projectId: string }) {
  const { total, items } = detail.rejections;
  const entityLabel = labelOf(detail);
  const groups = useMemo(() => groupBy(items, (r) => r.entity), [items]);
  const partial = items.length < total;
  const csv = total + detail.field_issues.total + detail.attachments.missing > 0;

  return (
    <Panel
      eyebrow="Rejets"
      title={total ? `${count(total, "ligne rejetée", "lignes rejetées")}, non importée${total > 1 ? "s" : ""}` : "Aucune ligne rejetée"}
      actions={csv ? <CsvLink runId={detail.meta.id} projectId={projectId} /> : null}
    >
      <p className="text-[12.5px] text-sediment">
        {total
          ? "Une ligne rejetée n'entre pas dans la nouvelle base : elle reste intacte dans les fichiers extraits. Le CSV des écarts reprend chaque rejet avec ses motifs et la ligne source complète, ainsi que les valeurs signalées et les pièces jointes manquantes."
          : "Toutes les lignes lues ont été importées."}
      </p>
      {groups.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          {groups.map(([entity, list]) => {
            const { shown, others } = topReasons(list);
            return (
              <li key={entity} className="border-t border-line px-3 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 text-[13px] font-bold">
                    {entityLabel(entity)} <span className="font-mono text-[11px] font-normal break-all text-silt">{list[0].source_table}</span>
                  </span>
                  <span className={cx("tabular text-[12px] font-bold", TONE_TEXT.warn)}>
                    {count(list.length, "rejet", "rejets")}
                    {partial ? " affiché(s)" : ""}
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {shown.map(([reason, k]) => (
                    <li key={reason} className="flex items-start justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 break-words">{reason}</span>
                      <span className="tabular shrink-0 text-silt">× {fmt(k)}</span>
                    </li>
                  ))}
                  {others > 0 && <li className="text-[12px] text-silt">+ {count(others, "autre motif", "autres motifs")}</li>}
                </ul>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">Voir les lignes rejetées ({fmt(list.length)})</summary>
                  <ol className="mt-1.5 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                    {list.map((r) => (
                      <li key={`${r.row}-${r.source_key ?? ""}`} className="rounded-sm bg-chalk/60 px-2.5 py-1.5">
                        <div className="flex flex-wrap gap-x-3 text-[12px]">
                          <span className="font-mono font-bold">clé {r.source_key ?? "absente"}</span>
                          <span className="tabular text-silt">ligne {fmt(r.row)} du fichier</span>
                        </div>
                        <ul className="mt-0.5 text-[12px] text-ink">
                          {r.reasons.map((why, i) => (
                            <li key={i} className="break-words">
                              — {why}
                            </li>
                          ))}
                        </ul>
                        {r.raw && <SourceRow raw={r.raw} />}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {partial && (
        <p className="mt-2 text-[12px] text-silt">
          Les {fmt(items.length)} premiers rejets sur {fmt(total)} sont détaillés ici (les motifs ci-dessus portent sur eux) ; le CSV contient la liste complète.
        </p>
      )}
      <p className="mt-3 text-[12px] text-silt">
        Pour récupérer une ligne rejetée, corrigez la cause (donnée source, correspondance ou décision) puis relancez la migration : aucune correction n&apos;est faite à la main dans la base.
      </p>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Valeurs signalées (enregistrements migrés)                           */
/* ------------------------------------------------------------------ */

const ISSUE_KIND: Record<FieldIssue["kind"], string> = {
  conversion: "valeur non convertible, laissée vide",
  unlinked: "lien introuvable dans la source, enregistrement migré sans lien",
};

export function RunIssues({ detail }: { detail: RunDetail }) {
  const { total, items } = detail.field_issues;
  const entityLabel = labelOf(detail);
  const groups = useMemo(() => groupBy(items, (i) => `${i.entity}\u0000${i.field}\u0000${i.kind}`), [items]);
  return (
    <Panel eyebrow="Migrées avec signalement" title={total ? count(total, "valeur signalée", "valeurs signalées") : "Aucune valeur signalée"}>
      <p className="text-[12.5px] text-sediment">
        {total
          ? "Ces enregistrements sont dans la nouvelle base, mais une valeur n'a pas pu être reprise telle quelle. Elle n'est ni devinée ni complétée : la valeur d'origine reste dans la traçabilité de l'enregistrement."
          : "Chaque valeur lue a été convertie et chaque lien retrouvé."}
      </p>
      {groups.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          {groups.map(([key, list]) => {
            const first = list[0];
            return (
              <li key={key} className="border-t border-line px-3 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 text-[13px] font-bold">
                    {entityLabel(first.entity)} · <span className="font-mono text-[12px]">{first.field}</span>
                  </span>
                  <span className={cx("tabular text-[12px] font-bold", TONE_TEXT.warn)}>× {fmt(list.length)}</span>
                </div>
                <p className="text-[12px] text-sediment">{ISSUE_KIND[first.kind] ?? first.kind}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">Voir les enregistrements ({fmt(list.length)})</summary>
                  <ol className="mt-1.5 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
                    {list.map((i) => (
                      <li key={`${i.record_id}-${i.field}`} className="rounded-sm bg-chalk/60 px-2.5 py-1.5 text-[12px]">
                        <span className="font-mono font-bold">clé {i.source_key}</span>
                        <span className="text-silt"> · #{i.record_id} dans la nouvelle base</span>
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
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {items.length < total && <p className="mt-2 text-[12px] text-silt">Les {fmt(items.length)} premières sur {fmt(total)} sont détaillées ici ; le CSV des écarts contient la liste complète.</p>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Doublons signalés                                                    */
/* ------------------------------------------------------------------ */

export function RunDuplicates({ detail }: { detail: RunDetail }) {
  const groups = detail.duplicates ?? [];
  const entityLabel = labelOf(detail);
  return (
    <Panel eyebrow="Doublons signalés" title={groups.length ? count(groups.length, "groupe de doublons potentiels", "groupes de doublons potentiels") : "Aucun doublon signalé"}>
      <p className="text-[12.5px] text-sediment">
        {groups.length
          ? "Fiches qui partagent une même valeur selon les règles de détection des correspondances. Elles sont migrées séparément : aucune fusion automatique. L'arbitrage revient à un responsable ; le Studio ne propose pas d'action de fusion."
          : "Aucun groupe détecté selon les règles de détection déclarées dans les correspondances (sans règle, rien n'est recherché)."}
      </p>
      {groups.length > 0 && (
        <ul className="mt-3 flex max-h-96 flex-col overflow-y-auto rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          {groups.map((g, i) => (
            <li key={`${g.entity}-${g.rule}-${g.value}-${i}`} className="border-t border-line px-3 py-2 first:border-t-0">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-bold">{entityLabel(g.entity)}</span>
                <span className="text-sediment">{g.rule}</span>
                <span className="font-mono text-[12px] break-all">« {g.value} »</span>
              </div>
              <p className="text-[12px] text-sediment">
                {count(g.records.length, "fiche", "fiches")} :{" "}
                {g.records.map((r, k) => (
                  <span key={r.id} className="font-mono text-[11.5px]">
                    {k > 0 && ", "}clé {r.source_key} → #{r.id}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
