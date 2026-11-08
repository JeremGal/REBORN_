"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, Field, Textarea, agreePlurals, cx } from "@/components/ds";
import { Callout, Section } from "./Step";
import {
  CheckMetrics,
  CsvLink,
  GAP_LABEL,
  GROUPS,
  More,
  T,
  TONE_TEXT,
  Tag,
  ZERO,
  count,
  describe,
  euros,
  fmt,
  readableError,
  sourceHint,
  whenShort,
  type Acknowledgement,
  type BusinessModelVersion,
  type Check,
  type MappingIndex,
  type Report,
  type RunDetail,
  type Tone,
  TableScroll,
  scrollRegion,
} from "./RunCommon";

export const GAPS_ANCHOR = "ecarts-documentes";
export const COMMENT_ID = "ecarts-commentaire";

const listCls = "overflow-hidden rounded-panel ring-1 ring-line";

/* ------------------------------------------------------------------ */
/* Quatre statuts, calculés à partir de ce que le rapport a réellement lu */
/* ------------------------------------------------------------------ */

export type CheckState = "validated" | "gap" | "unverified" | "intervention";
export const STATE: Record<CheckState, { label: string; tone: Tone; hint: string }> = {
  validated: { label: "VALIDÉ", tone: "ok", hint: "Contrôlé sur les données relues : aucun écart." },
  gap: { label: "ÉCART DÉTECTÉ", tone: "warn", hint: "Un écart a été mesuré et documenté : il doit être examiné." },
  unverified: { label: "NON VÉRIFIÉ", tone: "idle", hint: "Rien n'a pu être comparé : ni garanti ni infirmé." },
  intervention: { label: "INTERVENTION REQUISE", tone: "bad", hint: "Un contrôle bloquant a échoué : la mise en service est refusée." },
};
const ORDER: CheckState[] = ["intervention", "gap", "unverified", "validated"];

/** Contrôle réussi sans rien avoir comparé (0 fiche, 0 enregistrement évalué) : non vérifié, pas validé. */
function vacuous(c: Check): boolean {
  const m = c.metrics ?? {};
  if (c.group === "enregistrements" && m.compared === 0) return true;
  if (c.group === "volumes" && m.source === 0) return true;
  if (c.group === "regles" && /^0 enregistrement/.test(c.summary)) return true;
  if (c.group === "pieces_jointes" && /^0\/0 /.test(c.summary)) return true;
  return false;
}

export function checkState(c: Check): CheckState {
  if (c.status === "fail") return c.blocking ? "intervention" : "gap";
  if (c.status === "warn" || c.status === "info") return "gap";
  return vacuous(c) ? "unverified" : "validated";
}

/**
 * Libellés destinés au client, par identifiant de contrôle (SPEC §10.4 : la méthode — empreintes SHA-256,
 * clés étrangères, requêtes SQL — reste dans « Détail des contrôles »). Les règles de verify.ts ne changent pas.
 */
const PLAIN_LABEL: Record<string, string> = {
  "sources.empreintes": "Fichiers reçus intacts",
  "sources.manifeste": "Nombre de lignes annoncé par l'ancien logiciel",
  "relations.integrite": "Liens entre fiches intacts",
  "relations.rattachements": "Liens de l'ancien logiciel reproduits",
  "pieces_jointes.empreintes": "Pièces jointes identiques à l'original",
  "pieces_jointes.couverture": "Pièces jointes référencées et récupérées",
  "integrite.base": "Nouvelle base de données intacte",
};
/** Libellé lisible d'un contrôle (le libellé technique d'origine reste affiché dans le détail des contrôles). */
export const checkLabel = (c: Pick<Check, "id" | "label">): string => PLAIN_LABEL[c.id] ?? c.label;
/** Message sans code technique (« accès refusé au compte fourni (HTTP 403) » → « accès refusé au compte fourni »). */
export const plainText = (s: string): string => agreePlurals(s.replace(/\s*\(HTTP \d{3}\)/g, ""));

export function StateBadge({ state, className }: { state: CheckState; className?: string }) {
  const s = STATE[state];
  return (
    <Tag tone={s.tone} title={s.hint} className={cx("tracking-[0.02em]", className)}>
      {s.label}
    </Tag>
  );
}

/** Pire statut d'une liste de contrôles. */
function worstState(checks: Check[]): CheckState {
  const states = new Set(checks.map(checkState));
  return ORDER.find((s) => states.has(s)) ?? "unverified";
}

/** Éléments que le rapport désigne comme non vérifiés (périmètre), en plus des contrôles vides. */
export interface Unverified {
  key: string;
  title: string;
  text: string;
}

export function unverifiedItems(report: Report, ctx: { hasAttachments: boolean; models: BusinessModelVersion[] | null; runId: string }): Unverified[] {
  const out: Unverified[] = [];
  if (!report.checks.some((c) => c.id === "sources.manifeste"))
    out.push({ key: "manifeste", title: "Nombre de lignes annoncé par l'ancien logiciel", text: "L'ancien logiciel n'a publié aucun manifeste : le nombre de lignes de chaque fichier n'a pas pu être confirmé à la source." });
  for (const g of report.gaps) {
    if (g.kind === "inaccessible") out.push({ key: `inacc-${g.source ?? g.message}`, title: g.source ?? "Données non récupérées", text: plainText(g.message) });
    if (g.kind === "unmapped_table") out.push({ key: `table-${g.source ?? g.message}`, title: `Table ${g.source ?? ""}`.trim(), text: `${count(g.count, "ligne récupérée", "lignes récupérées")} sans correspondance : non migrées, donc non vérifiées.` });
  }
  if (!ctx.hasAttachments) out.push({ key: "documents", title: "Documents (pièces jointes)", text: "Aucun rattachement de documents dans les correspondances : aucun document n'a été copié ni vérifié." });
  if (!report.entities.some((e) => e.totals.length)) out.push({ key: "montants", title: "Totaux financiers", text: "Aucun champ de type montant dans les correspondances : aucun total n'a été comparé." });
  const replayed = (ctx.models ?? []).some((m) => m.status !== "rejected" && m.history_check?.run_id === ctx.runId);
  if (ctx.models && !replayed)
    out.push({
      key: "calculs",
      title: "Calculs de l'ancien logiciel",
      text: ctx.models.length ? `Aucune version du modèle métier n'a été rejouée sur les données de ${ctx.runId} : on ignore si les calculs reproduisent l'ancien logiciel.` : "Aucun modèle métier reçu : les calculs de l'ancien logiciel n'ont pas été comparés.",
    });
  for (const c of report.checks) if (checkState(c) === "unverified") out.push({ key: `check-${c.id}`, title: checkLabel(c), text: `${plainText(c.summary)} : rien n'a pu être comparé.` });
  return out;
}

/**
 * Décompte des contrôles du rapport par statut : les quatre valeurs s'additionnent au nombre de contrôles
 * (« Détail des 41 contrôles »), comme à l'étape Migration. Les éléments non vérifiés qui ne sont pas des
 * contrôles (manifeste absent, tables non reprises, calculs non rejoués…) sont comptés à part (`others`).
 */
export function stateCounts(report: Report, unverifiedItems: number) {
  const n = { validated: 0, gap: 0, unverified: 0, intervention: 0 };
  for (const c of report.checks) n[checkState(c)]++;
  return { ...n, total: report.checks.length, others: Math.max(0, unverifiedItems - n.unverified) };
}

/* ------------------------------------------------------------------ */
/* Verdict                                                              */
/* ------------------------------------------------------------------ */

/** Ton et titre du verdict, d'après le rapport, l'acceptation éventuelle et les éléments non vérifiés. */
export function verdictOf(report: Report, ack: Acknowledgement | null, unverified: number): { tone: "ok" | "warn" | "bad" | "info"; title: string } {
  const blocking = report.checks.filter((c) => checkState(c) === "intervention").length;
  if (report.status === "blocked") return { tone: "bad", title: `Intervention requise : ${count(blocking, "contrôle bloquant", "contrôles bloquants")} en échec. La mise en service est refusée.` };
  if (report.status === "review" && ack) return { tone: "ok", title: `Écarts acceptés par ${ack.by} le ${whenShort(ack.at)} : mise en service autorisée.` };
  if (report.status === "review") {
    const n = report.gaps.length;
    const g = report.checks.filter((c) => checkState(c) === "gap").length;
    const signal = g ? ` ; ${count(g, "contrôle signale", "contrôles signalent")} un écart` : "";
    return { tone: "warn", title: n ? `À examiner avant la mise en service : ${count(n, "écart documenté", "écarts documentés")}${signal}.` : `À examiner avant la mise en service${signal || " : des contrôles signalent un écart"}.` };
  }
  return unverified
    ? { tone: "info", title: `Aucun écart sur ce qui a été contrôlé, mais ${count(unverified, "élément n'a pas pu être vérifié", "éléments n'ont pas pu être vérifiés")}.` }
    : { tone: "ok", title: "Aucun écart sur ce qui a été contrôlé." };
}

/**
 * Portée de la vérification, en clair : même sens que `report.statement` (verify.ts), sans le vocabulaire
 * technique ; l'énoncé exact enregistré dans le rapport reste affiché dans « Intégration technique ».
 */
export const SCOPE_TEXT =
  "Ces contrôles portent sur les données réellement relues : les fichiers récupérés de votre ancien logiciel, analysés à nouveau, et la nouvelle base. Ils confirment les volumes, les fiches, les liens, les montants et les fichiers listés ci-dessous ; ils ne prouvent pas l'absence de données que l'ancien logiciel n'a pas exportées.";

/** Verdict de la vérification indépendante, avec sa portée exacte (jamais une garantie). */
export function VerdictCallout({ report, detail, unverified }: { report: Report; detail: RunDetail; unverified: number }) {
  const v = verdictOf(report, report.status === "review" ? detail.acknowledged : null, unverified);
  return (
    <Callout tone={v.tone} title={v.title}>
      <p>{SCOPE_TEXT}</p>
      {unverified > 0 && <p className="mt-1">Les éléments non vérifiés sont listés plus bas ; ils ne sont ni garantis ni infirmés par cette vérification.</p>}
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Contrôle (ligne) et thème                                            */
/* ------------------------------------------------------------------ */

/** Un contrôle. `technical` (détail des contrôles) : le libellé d'origine du moteur, méthode comprise, est ajouté. */
function CheckRow({ c, technical }: { c: Check; technical?: boolean }) {
  const st = checkState(c);
  const label = checkLabel(c);
  return (
    <li className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="shrink-0 sm:w-[11.5rem]">
        <StateBadge state={st} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold break-words text-ink">{label}</p>
        {technical && label !== c.label && <p className="font-mono text-meta break-words text-text-3">{c.label}</p>}
        <p className="text-small break-words text-text-2">{technical ? c.summary : plainText(c.summary)}</p>
        <CheckMetrics metrics={c.metrics} className="mt-1.5" />
        {c.details?.length ? (
          <More className="mt-1" label={c.details.length >= 25 ? `Détails (extrait : ${fmt(c.details.length)} premiers)` : `Détails (${fmt(c.details.length)})`}>
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-control bg-surface-sunken px-3 py-2 font-mono text-meta text-text-2" {...scrollRegion(`Détails : ${c.label}`)}>
              {c.details.map((d, i) => (
                <li key={i} className="break-words">
                  {describe(d)}
                </li>
              ))}
            </ul>
          </More>
        ) : null}
      </div>
    </li>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  const sorted = [...checks].sort((a, b) => ORDER.indexOf(checkState(a)) - ORDER.indexOf(checkState(b)));
  return (
    <ul className={listCls}>
      {sorted.map((c) => (
        <CheckRow key={c.id} c={c} />
      ))}
    </ul>
  );
}

/** Synthèse des quatre statuts (lecture en un coup d'œil, chiffres réels). */
export function StateLegend() {
  return (
    <ul className="flex flex-col gap-1.5 text-small text-text-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
      {(["validated", "gap", "unverified", "intervention"] as CheckState[]).map((s) => (
        <li key={s} className="flex items-center gap-2">
          <StateBadge state={s} />
          <span>{STATE[s].hint}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Totaux financiers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Différence entre le nouveau logiciel et l'ancien sur les lignes migrées. « aucune » seulement si rien n'est
 * resté dans des lignes rejetées : sinon la valeur exacte (0,00 €), le montant rejeté étant affiché à côté.
 */
function AmountDiff({ diff, rejected }: { diff: number; rejected: number }) {
  if (diff !== 0) return <b className={cx("font-semibold", TONE_TEXT.bad)}>{euros(diff)}</b>;
  return rejected ? <span className="text-text-2">{euros(0)}</span> : <span className={TONE_TEXT.ok}>aucune</span>;
}
const Rejected = ({ cents }: { cents: number }) => (cents ? <span className={cx("font-semibold", TONE_TEXT.warn)}>{euros(cents)}</span> : <span className={ZERO}>—</span>);

/**
 * Totaux financiers. Colonnes exactes : « Ancien logiciel (lignes migrées) » = total source des lignes migrées,
 * « Lignes rejetées » = montant resté dans les lignes non migrées (compté à part, à toutes les largeurs : sur
 * mobile, présentation empilée au lieu de colonnes masquées). Jamais « aucune » différence à côté d'un montant rejeté.
 */
export function FinancialSection({ report, index }: { report: Report; index: MappingIndex }) {
  const amounts = report.entities.flatMap((e) => e.totals.map((t) => ({ e, t, check: report.checks.find((c) => c.id === `montants.${e.entity}.${t.field}`) })));
  const state = amounts.length ? worstState(amounts.flatMap((a) => (a.check ? [a.check] : []))) : "unverified";
  const name = (e: (typeof amounts)[number]["e"], field: string) => ({ entity: e.label ?? index.entity(e.entity), field: index.field(e.entity, field)?.label ?? field });
  const accountingTag = (
    <Tag tone="info" plain className="ml-2" title="Donnée comptable : protégée en lecture seule dans le nouveau logiciel">
      comptable
    </Tag>
  );
  return (
    <Section title="Totaux financiers" badge={<StateBadge state={state} />} description="Chaque montant additionné au centime près : dans l'ancien logiciel (lignes migrées), dans le nouveau, et dans les lignes rejetées, comptées à part.">
      {amounts.length ? (
        <>
          {/* Écran étroit : une fiche par montant, toutes les valeurs visibles */}
          <ul className={cx(listCls, "sm:hidden")} aria-label="Totaux des montants dans l'ancien et le nouveau logiciel, au centime">
            {amounts.map(({ e, t: m, check }) => {
              const n = name(e, m.field);
              return (
                <li key={`${e.entity}.${m.field}`} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 text-body break-words">
                      <span className="font-semibold text-ink">{n.entity}</span>
                      <span className="text-text-2"> · {n.field}</span>
                      {m.accounting && accountingTag}
                    </p>
                    {check ? <StateBadge state={checkState(check)} /> : <StateBadge state="unverified" />}
                  </div>
                  <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-1.5 text-small">
                    <div className="min-w-0">
                      <dt className="text-text-3">Ancien logiciel (lignes migrées)</dt>
                      <dd className="text-text-2">{euros(m.source_cents)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-text-3">Nouveau logiciel</dt>
                      <dd className="text-ink">{euros(m.target_cents)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-text-3">Différence</dt>
                      <dd>
                        <AmountDiff diff={m.target_cents - m.source_cents} rejected={m.rejected_cents} />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-text-3">Lignes rejetées (non migrées)</dt>
                      <dd>
                        <Rejected cents={m.rejected_cents} />
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <TableScroll label="Totaux financiers" className={cx(T.wrap, "hidden sm:block")}>
            <table className={T.table}>
              <caption className="sr-only">Totaux des montants dans l&apos;ancien et le nouveau logiciel, au centime</caption>
              <thead>
                <tr className={T.head}>
                  <th scope="col" className={T.th}>
                    Montant
                  </th>
                  <th scope="col" className={T.th}>
                    Ancien logiciel
                    <span className="block font-normal">lignes migrées</span>
                  </th>
                  <th scope="col" className={T.th}>
                    Nouveau logiciel
                  </th>
                  <th scope="col" className={T.th}>
                    Différence
                  </th>
                  <th scope="col" className={T.th}>
                    Lignes rejetées
                    <span className="block font-normal">non migrées</span>
                  </th>
                  <th scope="col" className={T.th}>
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {amounts.map(({ e, t: m, check }) => {
                  const n = name(e, m.field);
                  return (
                    <tr key={`${e.entity}.${m.field}`} className={T.row}>
                      <th scope="row" className={cx(T.td, "font-normal")}>
                        <span className="font-semibold text-ink">{n.entity}</span>
                        <span className="text-text-2"> · {n.field}</span>
                        {m.accounting && accountingTag}
                      </th>
                      <td className={cx(T.td, "text-text-2")}>{euros(m.source_cents)}</td>
                      <td className={cx(T.td, "text-ink")}>{euros(m.target_cents)}</td>
                      <td className={T.td}>
                        <AmountDiff diff={m.target_cents - m.source_cents} rejected={m.rejected_cents} />
                      </td>
                      <td className={T.td}>
                        <Rejected cents={m.rejected_cents} />
                      </td>
                      <td className={T.td}>{check ? <StateBadge state={checkState(check)} /> : <StateBadge state="unverified" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <p className="mt-3 text-small text-text-3">
            Les montants des lignes rejetées ne sont pas dans le nouveau logiciel : comptés à part, jamais réintégrés ni recalculés ; ces lignes sont détaillées à l&apos;étape Migration et dans le
            rapport d&apos;écarts. Un montant comptable rejeté demande une intervention.
          </p>
        </>
      ) : (
        <p className="text-body text-text-2">Aucun champ de type montant dans les correspondances : aucun total n&apos;a été comparé.</p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Fiches, champs manquants et relations                                */
/* ------------------------------------------------------------------ */

function entityState(report: Report, entity: string): CheckState {
  const own = report.checks.filter((c) => c.id === `volumes.${entity}` || c.id === `enregistrements.${entity}`);
  return own.length ? worstState(own) : "unverified";
}

export function RecordsSection({ report, detail, index }: { report: Report; detail: RunDetail; index: MappingIndex }) {
  const sum = report.entities.reduce(
    (a, e) => ({ source: a.source + e.source_rows, target: a.target + e.target_rows, rejected: a.rejected + e.rejected, exact: a.exact + e.exact, mismatched: a.mismatched + e.mismatched }),
    { source: 0, target: 0, rejected: 0, exact: 0, mismatched: 0 },
  );
  const missing = report.gaps.filter((g) => g.kind === "unmapped_column" || g.kind === "conversion" || (g.kind === "excluded" && /champ|·/.test(g.message)));
  const relations = report.checks.filter((c) => c.group === "relations");
  const all = report.checks.filter((c) => c.group === "volumes" || c.group === "enregistrements");
  return (
    <Section title="Fiches et champs" badge={<StateBadge state={worstState([...all, ...relations])} />} description="Chaque fiche relue dans la nouvelle base et comparée, champ par champ, à sa ligne d'origine.">
      <TableScroll label="Fiches par table">
        <table className={T.table}>
          <caption className="sr-only">Fiches attendues, migrées, rejetées et identiques, par table</caption>
          <thead>
            <tr className={T.head}>
              <th scope="col" className={T.th}>
                Table
              </th>
              <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                Attendues
              </th>
              <th scope="col" className={cx(T.th, "hidden sm:table-cell")}>
                Migrées
              </th>
              <th scope="col" className={cx(T.th, "hidden md:table-cell")}>
                Rejetées
              </th>
              <th scope="col" className={T.th}>
                Identiques
              </th>
              <th scope="col" className={T.th}>
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {report.entities.map((e) => {
              const table = sourceHint(e.entity, e.source_table, e.label);
              return (
                <tr key={e.entity} className={T.row}>
                  <th scope="row" className={cx(T.td, "font-normal")}>
                    <span className="font-semibold text-ink">{e.label ?? index.entity(e.entity)}</span>
                    {table && <span className="block font-mono text-meta break-all text-text-3">{table}</span>}
                  </th>
                  <td className={cx(T.td, "hidden text-text-2 sm:table-cell")}>{fmt(e.source_rows)}</td>
                  <td className={cx(T.td, "hidden font-semibold text-ink sm:table-cell")}>{fmt(e.target_rows)}</td>
                  <td className={cx(T.td, "hidden md:table-cell", e.rejected ? cx("font-semibold", TONE_TEXT.warn) : ZERO)}>{fmt(e.rejected)}</td>
                  <td className={cx(T.td, e.mismatched ? cx("font-semibold", TONE_TEXT.bad) : "text-ink")}>
                    {fmt(e.exact)} / {fmt(e.exact + e.mismatched)}
                  </td>
                  <td className={T.td}>
                    <StateBadge state={entityState(report, e.entity)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {report.entities.length > 1 && (
            <tfoot>
              <tr className={T.foot}>
                <th scope="row" className={cx(T.td, "font-semibold text-ink")}>
                  Total
                </th>
                <td className={cx(T.td, "hidden font-semibold sm:table-cell")}>{fmt(sum.source)}</td>
                <td className={cx(T.td, "hidden font-semibold sm:table-cell")}>{fmt(sum.target)}</td>
                <td className={cx(T.td, "hidden font-semibold md:table-cell", sum.rejected ? TONE_TEXT.warn : ZERO)}>{fmt(sum.rejected)}</td>
                <td className={cx(T.td, "font-semibold")}>
                  {fmt(sum.exact)} / {fmt(sum.exact + sum.mismatched)}
                </td>
                <td className={T.td} />
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
      <p className="mt-3 text-small text-text-3">Identique : tous les champs, liens compris, correspondent à la ligne d&apos;origine. Les lignes rejetées sont comptées à part.</p>

      <h3 className="mt-6 mb-2 text-body font-semibold text-ink">Champs manquants ou incomplets</h3>
      {missing.length ? (
        <GapList gaps={missing} index={index} />
      ) : (
        <p className="text-body text-text-2">Toutes les colonnes des tables reprises sont migrées, et chaque valeur a été convertie.</p>
      )}

      {relations.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-body font-semibold text-ink">Relations entre fiches</h3>
          <CheckList checks={relations} />
        </>
      )}
      {(detail.duplicates?.length ?? 0) > 0 && (
        <p className="mt-3 text-small text-text-2">{count(detail.duplicates!.length, "groupe de doublons possibles est signalé", "groupes de doublons possibles sont signalés")} à l&apos;étape Migration : aucune fusion automatique.</p>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Documents et règles métier                                           */
/* ------------------------------------------------------------------ */

export function DocumentsSection({ report }: { report: Report }) {
  const checks = report.checks.filter((c) => c.group === "pieces_jointes");
  return (
    <Section title="Documents" badge={<StateBadge state={checks.length ? worstState(checks) : "unverified"} />} description="Pièces jointes copiées de l'ancien logiciel, comparées par empreinte.">
      {checks.length ? <CheckList checks={checks} /> : <p className="text-body text-text-2">Aucun rattachement de documents dans les correspondances : aucun document n&apos;a été copié ni vérifié.</p>}
    </Section>
  );
}

export function RulesChecksSection({ report, children }: { report: Report; children?: ReactNode }) {
  const checks = report.checks.filter((c) => c.group === "regles");
  return (
    <Section title="Règles métier" badge={<StateBadge state={checks.length ? worstState(checks) : "unverified"} />} description="Cohérence des données historiques et calculs de l'ancien logiciel rejoués sur la nouvelle base.">
      <h3 className="mb-2 text-body font-semibold text-ink">Règles de cohérence sur l&apos;historique</h3>
      {checks.length ? (
        <>
          <CheckList checks={checks} />
          <p className="mt-2 text-small text-text-3">Un écart n&apos;est jamais corrigé : les valeurs historiques sont conservées telles qu&apos;elles ont été enregistrées.</p>
        </>
      ) : (
        <p className="text-body text-text-2">Aucune règle de cohérence déclarée dans les correspondances : rien n&apos;a été contrôlé à ce titre.</p>
      )}
      {children}
    </Section>
  );
}

export function UnverifiedSection({ items }: { items: Unverified[] }) {
  if (!items.length) return null;
  return (
    <Section title="Ce qui n'a pas pu être vérifié" badge={<StateBadge state="unverified" />} description="Ces éléments ne sont ni garantis ni infirmés par la vérification : à connaître avant de décider.">
      <ul className={listCls}>
        {items.map((u) => (
          <li key={u.key} className="flex flex-col gap-0.5 border-b border-line px-4 py-3 last:border-b-0">
            <p className="text-body font-semibold break-words text-ink">{u.title}</p>
            <p className="text-small break-words text-text-2">{u.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Écarts documentés + décision humaine                                 */
/* ------------------------------------------------------------------ */

const GAP_TONE: Record<string, Tone> = { unmapped_column: "info", historical: "info", inaccessible: "idle", unmapped_table: "idle" };

/** Ligne « nature · message » d'un écart ; les exemples s'ouvrent depuis la ligne elle-même. */
const GAP_ROW = "grid items-start gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[164px_minmax(0,1fr)_auto]";

function GapList({ gaps, index }: { gaps: Report["gaps"]; index: MappingIndex }) {
  return (
    <ul className={listCls}>
      {gaps.map((g, i) => {
        const src = g.source && !g.message.includes(g.source) ? sourceHint(g.entity ?? "", g.source) : null;
        const head = (
          <>
            <span>
              <Tag tone={GAP_TONE[g.kind] ?? "warn"} plain>
                {GAP_LABEL[g.kind] ?? g.kind}
              </Tag>
            </span>
            <span className="min-w-0 text-body break-words text-ink">
              {g.entity && <b className="font-semibold">{index.entity(g.entity)} · </b>}
              {plainText(g.message)}
              {src && <span className="ml-1.5 font-mono text-meta break-all text-text-3">{src}</span>}
            </span>
          </>
        );
        const n = g.examples?.length ?? 0;
        return (
          <li key={`${g.kind}-${i}`} className="border-b border-line last:border-b-0">
            {n ? (
              <details className="group/gap">
                <summary className={cx(GAP_ROW, "cursor-pointer list-none transition-colors duration-(--duration-fast) select-none hover:bg-canvas focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden")}>
                  {head}
                  <span className="inline-flex items-center gap-1 text-small font-semibold whitespace-nowrap text-text-2">
                    {n < g.count ? `${fmt(n)} exemples sur ${fmt(g.count)}` : `${fmt(n)} ${n > 1 ? "exemples" : "exemple"}`}
                    <ChevronRight size={14} aria-hidden className="transition-transform duration-(--duration-fast) group-open/gap:rotate-90" />
                  </span>
                </summary>
                <ul className="mx-4 mb-3 flex max-h-60 flex-col gap-1 overflow-y-auto rounded-control bg-surface-sunken px-3 py-2 font-mono text-meta text-text-2 sm:ml-[196px]" {...scrollRegion(`Exemples : ${g.message}`)}>
                  {g.examples!.map((x, k) => (
                    <li key={k} className="break-words">
                      {describe(x)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <div className={GAP_ROW}>{head}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Écarts documentés du rapport. Tant qu'ils attendent une décision, la section est ouverte et porte
 * le formulaire (POST /api/migration/runs/[id]/acknowledge, au nom du compte connecté) avec ses
 * conséquences ; sinon (acceptés, ou acceptation impossible car un contrôle bloquant a échoué) elle est repliée.
 */
export function GapsSection({ report, detail, index, projectId, onChanged }: { report: Report; detail: RunDetail; index: MappingIndex; projectId: string; onChanged: () => Promise<void> }) {
  const { post } = useProject();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ack = report.status === "review" ? detail.acknowledged : null;
  const pending = report.status === "review" && !ack;
  const n = report.gaps.length;
  const csv = detail.rejections.total + detail.field_issues.total + detail.attachments.missing > 0;
  if (!n && !pending) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/migration/runs/${encodeURIComponent(report.run_id)}/acknowledge`, { comment: text });
      setComment("");
      await onChanged();
    } catch (x) {
      setError(readableError(x));
    } finally {
      setBusy(false);
    }
  }

  const title = n ? count(n, "écart documenté", "écarts documentés") : "Écarts documentés";
  const list = n ? <GapList gaps={report.gaps} index={index} /> : <p className="text-body text-text-2">Aucun écart documenté : les contrôles signalés sont détaillés plus haut.</p>;

  if (!pending) {
    return (
      <Section
        id={GAPS_ANCHOR}
        collapsible
        title={title}
        badge={ack ? <Tag tone="ok">Écarts acceptés</Tag> : undefined}
        description={ack ? `Acceptés par ${ack.by} le ${whenShort(ack.at)}${ack.comment ? ` : « ${ack.comment} »` : "."}` : "Ce qui n'a pas été transféré tel quel, et pourquoi."}
      >
        {csv && (
          <div className="mb-3 flex justify-end">
            <CsvLink runId={report.run_id} projectId={projectId} />
          </div>
        )}
        {list}
      </Section>
    );
  }

  return (
    <Section id={GAPS_ANCHOR} className="scroll-mt-24" title={title} badge={<StateBadge state="gap" />} description="Ce qui n'a pas été transféré tel quel, et pourquoi." actions={csv ? <CsvLink runId={report.run_id} projectId={projectId} /> : undefined}>
      {list}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 rounded-panel bg-canvas px-4 py-4 ring-1 ring-line sm:px-5">
        <div>
          <h3 className="text-lead font-semibold text-ink">Votre décision</h3>
          <p className="mt-1 text-body text-text-2">Lisez les écarts ci-dessus, puis acceptez-les si vous les jugez acceptables pour l&apos;entreprise.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-small font-semibold text-ink">Si vous acceptez</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small leading-relaxed text-text-2">
              <li>la mise en service du nouveau logiciel devient possible avec les données de {report.run_id} ;</li>
              <li>aucune donnée n&apos;est modifiée : les écarts restent tels quels et figurent au rapport de migration livré ;</li>
              <li>votre nom, la date et votre commentaire sont consignés avec la décision.</li>
            </ul>
          </div>
          <div>
            <p className="text-small font-semibold text-ink">Si vous n&apos;acceptez pas</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small leading-relaxed text-text-2">
              <li>rien n&apos;est mis en service ;</li>
              <li>corrigez la cause (correspondances ou données récupérées), puis relancez la migration : une nouvelle vérification sera faite.</li>
            </ul>
          </div>
        </div>
        <Field id={COMMENT_ID} label="Commentaire" hint="Obligatoire : pourquoi ces écarts sont acceptables (ex. pièces jointes perdues confirmées par l'entreprise)." required>
          <Textarea name="comment" maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {error && (
          <Callout tone="bad" title="Acceptation refusée">
            <p className="break-words">{error}</p>
          </Callout>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={!comment.trim()} loading={busy} loadingText="Enregistrement…">
            Accepter les écarts documentés
          </Button>
          <span className="text-small text-text-3">Décision consignée au nom du compte connecté.</span>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Tous les contrôles                                                   */
/* ------------------------------------------------------------------ */

/** Tous les contrôles du rapport, regroupés par nature (groupes à examiner ouverts). Section repliée. */
export function ChecksSection({ report }: { report: Report }) {
  const groups = useMemo(() => {
    const known = GROUPS.map((g) => ({ ...g, checks: report.checks.filter((c) => c.group === g.id) }));
    const other = report.checks.filter((c) => !GROUPS.some((g) => g.id === c.group));
    return [...known, { id: "autres", label: "Autres contrôles", checks: other }].filter((g) => g.checks.length);
  }, [report.checks]);
  return (
    <Section collapsible title={`Détail des ${count(report.checks.length, "contrôle", "contrôles")}`} description="Fichiers récupérés, volumes, valeurs, relations, montants, documents, intégrité.">
      <p className="mb-3 text-small text-text-3">Chaque contrôle compte ce qu&apos;il a réellement lu. Un contrôle bloquant en échec interdit la mise en service.</p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const w = worstState(g.checks);
          const n = { validated: 0, gap: 0, unverified: 0, intervention: 0 };
          for (const c of g.checks) n[checkState(c)]++;
          return (
            <details key={g.id} open={w === "intervention"} className="group/grp rounded-panel ring-1 ring-line">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-panel px-4 py-2.5 transition-colors duration-(--duration-fast) select-none hover:bg-canvas [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2 text-body font-semibold text-ink">
                  <ChevronRight size={14} aria-hidden className="shrink-0 text-text-3 transition-transform duration-(--duration-fast) group-open/grp:rotate-90" />
                  {g.label}
                </span>
                <span className="flex flex-wrap gap-1 pl-[22px] sm:pl-0">
                  {ORDER.filter((s) => n[s] > 0).map((s) => (
                    <Tag key={s} tone={STATE[s].tone}>
                      {fmt(n[s])} {STATE[s].label}
                    </Tag>
                  ))}
                </span>
              </summary>
              <div className="border-t border-line">
                <ul>
                  {[...g.checks]
                    .sort((a, b) => ORDER.indexOf(checkState(a)) - ORDER.indexOf(checkState(b)))
                    .map((c) => (
                      <CheckRow key={c.id} c={c} technical />
                    ))}
                </ul>
              </div>
            </details>
          );
        })}
      </div>
    </Section>
  );
}
