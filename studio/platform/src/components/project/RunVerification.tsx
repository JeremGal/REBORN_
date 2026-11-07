"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ChevronRight, Link2, Paperclip, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, Field, Panel, cx, inputCls } from "@/components/ui";
import {
  CHECK_LABEL,
  CHECK_TONE,
  Cell,
  GAP_LABEL,
  GROUPS,
  HeaderRow,
  Metrics,
  Notice,
  StepLink,
  TONE_BORDER,
  TONE_TEXT,
  Tag,
  ToneIcon,
  VERDICT,
  bytes,
  count,
  describe,
  euros,
  fmt,
  pl,
  readableError,
  tally,
  when,
  worst,
  type BusinessModelVersion,
  type Check,
  type MappingIndex,
  type Report,
  type RunDetail,
  type Tone,
} from "./RunCommon";
import { CsvLink } from "./RunLedger";

/* ------------------------------------------------------------------ */
/* Verdict                                                              */
/* ------------------------------------------------------------------ */

const VERDICT_ICON = { validated: ShieldCheck, review: ShieldAlert, blocked: ShieldX } as const;

function Count({ value, label, tone }: { value: number; label: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="order-2 text-[12px] text-sediment">{label}</dt>
      <dd className={cx("tabular order-1 text-[20px] leading-none font-black", tone ? TONE_TEXT[tone] : "text-ink")}>{fmt(value)}</dd>
    </div>
  );
}

/** Résultat de la vérification indépendante : verdict, décompte des contrôles, portée exacte (statement). */
export function VerdictPanel({ report, detail, gapsAnchor }: { report: Report; detail: RunDetail; gapsAnchor: string }) {
  const v = VERDICT[report.status];
  const Icon = VERDICT_ICON[report.status];
  const t = tally(report.checks);
  const ack = report.status === "review" ? detail.acknowledged : null;
  return (
    <section aria-labelledby="verdict-title" className={cx("card border-l-[3px] px-4 py-4 sm:px-5", TONE_BORDER[v.tone])}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[780px]">
          <p className="eyebrow">Vérification indépendante · {report.run_id}</p>
          <h2 id="verdict-title" className={cx("mt-1 flex items-center gap-2 text-[21px] leading-tight font-black tracking-[-0.02em]", TONE_TEXT[v.tone])}>
            <Icon size={20} className="shrink-0" aria-hidden /> {v.label}
          </h2>
          <p className="mt-1 text-[13px] text-ink">{v.text}</p>
        </div>
        {report.status === "review" && !ack && report.gaps.length > 0 && (
          <a
            href={`#${gapsAnchor}`}
            className="inline-flex items-center gap-1 pt-1 text-[13px] font-bold whitespace-nowrap text-ink underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-ink"
          >
            Examiner les {count(report.gaps.length, "écart documenté", "écarts documentés")} <ArrowDown size={13} aria-hidden />
          </a>
        )}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
        <Count value={t.pass} label={pl(t.pass, "réussi", "réussis")} tone="ok" />
        <Count value={t.warn} label={pl(t.warn, "avertissement", "avertissements")} tone={t.warn ? "warn" : undefined} />
        <Count value={t.info} label={pl(t.info, "information", "informations")} tone={t.info ? "info" : undefined} />
        <Count value={t.fail} label={t.blocking_fail ? `${pl(t.fail, "échec", "échecs")}, dont ${fmt(t.blocking_fail)} ${pl(t.blocking_fail, "bloquant", "bloquants")}` : pl(t.fail, "échec", "échecs")} tone={t.fail ? "bad" : undefined} />
        <Count value={t.total} label={`${pl(t.total, "contrôle", "contrôles")} au total`} />
      </dl>

      <div className="mt-4 border-l-2 border-line-strong pl-3">
        <p className="eyebrow">Ce que ces contrôles établissent</p>
        <p className="mt-0.5 text-[12.5px] text-sediment">{report.statement}</p>
      </div>

      {ack && (
        <Notice tone="ok" className="mt-4" title={`Écarts acceptés par ${ack.by} le ${when(ack.at)}`}>
          {ack.comment ? <p className="break-words">« {ack.comment} »</p> : null}
        </Notice>
      )}

      <p className="mt-3 font-mono text-[11px] break-all text-silt" title={report.database.sha256}>
        Vérifiée le {when(report.verified_at)} · base {report.target} · SHA-256 {report.database.sha256.slice(0, 16)}… · {bytes(report.database.bytes)}
        {report.database.integrity ? ` · ${report.database.integrity}` : ""}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Ancien logiciel → nouveau logiciel                                   */
/* ------------------------------------------------------------------ */

const LEDGER_COLS = "md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]";
const MONEY_COLS = "md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]";

function CheckLines({ checks, empty }: { checks: Check[]; empty: string }) {
  if (!checks.length)
    return (
      <p className="flex items-start gap-1.5 text-[12px] text-sediment">
        <ToneIcon tone="idle" size={12} className="mt-[3px]" /> {empty}
      </p>
    );
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-1.5 text-[12px]">
          <ToneIcon tone={CHECK_TONE[c.status]} size={12} className="mt-[3px]" />
          <span className="min-w-0 break-words">
            <span className="font-bold text-ink">{c.label}</span>
            <span className="sr-only"> — {CHECK_LABEL[c.status]}</span>
            <span className="block text-sediment">{c.summary}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonPanel({ report, detail, index, projectId, migrationHref }: { report: Report; detail: RunDetail; index: MappingIndex; projectId: string; migrationHref: string }) {
  const sum = report.entities.reduce(
    (a, e) => ({ source: a.source + e.source_rows, target: a.target + e.target_rows, rejected: a.rejected + e.rejected, exact: a.exact + e.exact, mismatched: a.mismatched + e.mismatched }),
    { source: 0, target: 0, rejected: 0, exact: 0, mismatched: 0 },
  );
  const amounts = report.entities.flatMap((e) => e.totals.map((t) => ({ e, t })));
  const relations = report.checks.filter((c) => c.group === "relations");
  const attachmentChecks = report.checks.filter((c) => c.group === "pieces_jointes");
  const a = detail.attachments;
  const t = tally(report.checks);

  return (
    <Panel eyebrow="Comparaison sur les données relues" title="Ancien logiciel → nouveau logiciel">
      <p className="text-[12.5px] text-sediment">
        Côté ancien logiciel : les fichiers extraits, réanalysés. Côté nouveau : la base construite, relue par requêtes. Chaque enregistrement migré est recomparé champ par champ à sa ligne d&apos;origine.
      </p>

      {/* Enregistrements */}
      <h3 className="mt-4 mb-1.5 text-[12px] font-bold text-sediment">Enregistrements attendus et migrés</h3>
      <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        <HeaderRow cols={LEDGER_COLS}>
          <span>Entité · table source</span>
          <span className="text-right">Attendus (ancien)</span>
          <span className="text-right">Migrés (nouveau)</span>
          <span className="text-right">Rejetés</span>
          <span className="text-right">Identiques, relus</span>
          <span className="text-right">Différents</span>
        </HeaderRow>
        <ul>
          {report.entities.map((e) => (
            <li key={e.entity} className={cx("grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:items-baseline", LEDGER_COLS)}>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <span className="text-[13px] font-bold">{e.label ?? index.entity(e.entity)}</span> <span className="font-mono text-[11px] break-all text-silt">{e.source_table}</span>
              </div>
              <Cell label="Attendus (ancien)">{fmt(e.source_rows)}</Cell>
              <Cell label="Migrés (nouveau)">
                <b className="font-bold">{fmt(e.target_rows)}</b>
              </Cell>
              <Cell label="Rejetés">
                <span className={e.rejected ? cx("font-bold", TONE_TEXT.warn) : "text-silt"}>{fmt(e.rejected)}</span>
              </Cell>
              <Cell label="Identiques, relus">
                <span className={e.mismatched ? "text-ink" : TONE_TEXT.ok}>
                  {fmt(e.exact)} / {fmt(e.exact + e.mismatched)}
                </span>
              </Cell>
              <Cell label="Différents">
                <span className={e.mismatched ? cx("font-bold", TONE_TEXT.bad) : "text-silt"}>{fmt(e.mismatched)}</span>
              </Cell>
            </li>
          ))}
          <li className={cx("grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line-strong bg-chalk/50 px-3 py-2 md:items-baseline", LEDGER_COLS)}>
            <div className="col-span-2 text-[13px] font-black md:col-span-1">Total</div>
            <Cell label="Attendus (ancien)">
              <b className="font-black">{fmt(sum.source)}</b>
            </Cell>
            <Cell label="Migrés (nouveau)">
              <b className="font-black">{fmt(sum.target)}</b>
            </Cell>
            <Cell label="Rejetés">
              <b className={cx("font-black", sum.rejected ? TONE_TEXT.warn : "text-silt")}>{fmt(sum.rejected)}</b>
            </Cell>
            <Cell label="Identiques, relus">
              <b className="font-black">
                {fmt(sum.exact)} / {fmt(sum.exact + sum.mismatched)}
              </b>
            </Cell>
            <Cell label="Différents">
              <b className={cx("font-black", sum.mismatched ? TONE_TEXT.bad : "text-silt")}>{fmt(sum.mismatched)}</b>
            </Cell>
          </li>
        </ul>
      </div>
      <p className="mt-1.5 text-[11.5px] text-silt">
        « Identiques, relus » : enregistrements dont tous les champs, relations comprises, et l&apos;empreinte de ligne correspondent à la source ; les rejetés n&apos;y figurent pas, ils sont décomptés à part.
      </p>

      {/* Montants */}
      <h3 className="mt-5 mb-1.5 text-[12px] font-bold text-sediment">Montants additionnés au centime</h3>
      {amounts.length ? (
        <>
          <div className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            <HeaderRow cols={MONEY_COLS}>
              <span>Entité · montant</span>
              <span className="text-right">Ancien (lignes importées)</span>
              <span className="text-right">Nouveau logiciel</span>
              <span className="text-right">Écart</span>
              <span className="text-right">Dans des lignes rejetées</span>
            </HeaderRow>
            <ul>
              {amounts.map(({ e, t: m }) => {
                const diff = m.target_cents - m.source_cents;
                return (
                  <li key={`${e.entity}.${m.field}`} className={cx("grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:items-baseline", MONEY_COLS)}>
                    <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 md:col-span-1">
                      <span className="text-[13px] font-bold">{e.label ?? index.entity(e.entity)}</span>
                      <span className="text-[12.5px] text-sediment">· {index.field(e.entity, m.field)?.label ?? m.field}</span>
                      {m.accounting && (
                        <Tag tone="info" title="Donnée comptable : protégée en lecture seule dans le nouveau logiciel">
                          comptable
                        </Tag>
                      )}
                    </div>
                    <Cell label="Ancien (lignes importées)">{euros(m.source_cents)}</Cell>
                    <Cell label="Nouveau logiciel">{euros(m.target_cents)}</Cell>
                    <Cell label="Écart">{diff === 0 ? <span className={TONE_TEXT.ok}>aucun</span> : <b className={cx("font-bold", TONE_TEXT.bad)}>{euros(diff)}</b>}</Cell>
                    <Cell label="Dans des lignes rejetées">{m.rejected_cents ? <span className={TONE_TEXT.warn}>{euros(m.rejected_cents)}</span> : <span className="text-silt">—</span>}</Cell>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-1.5 text-[11.5px] text-silt">Les montants des lignes rejetées ne sont pas dans le nouveau logiciel : ils sont comptés à part, jamais recalculés ni réintégrés.</p>
        </>
      ) : (
        <p className="text-[12.5px] text-sediment">Aucun champ de type montant dans les correspondances : pas de total comparé.</p>
      )}

      {/* Relations, pièces jointes, erreurs */}
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-line)]">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-sediment">
            <Link2 size={13} aria-hidden /> Relations
          </h3>
          <CheckLines checks={relations} empty="Non contrôlées : aucun contrôle de relation dans le rapport." />
        </div>
        <div className="rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-line)]">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-sediment">
            <Paperclip size={13} aria-hidden /> Pièces jointes
          </h3>
          {a.expected > 0 && (
            <p className="tabular mb-1.5 text-[12.5px] text-ink">
              <b>{fmt(a.expected)}</b> référencées dans l&apos;ancien → <b>{fmt(a.stored)}</b> copiées dans le nouveau
              {a.missing ? <span className={cx("font-bold", TONE_TEXT.warn)}> · {count(a.missing, "manquante", "manquantes")}</span> : null}
            </p>
          )}
          <CheckLines checks={attachmentChecks} empty="Aucune pièce jointe déclarée dans les correspondances : non contrôlées." />
        </div>
        <div className="rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-line)]">
          <h3 className="mb-1.5 text-[12px] font-bold text-sediment">Erreurs et signalements</h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[12.5px]">
            <dt className="text-sediment">Lignes rejetées</dt>
            <dd className={cx("tabular text-right font-bold", detail.rejections.total ? TONE_TEXT.warn : "text-ink")}>{fmt(detail.rejections.total)}</dd>
            <dt className="text-sediment">Valeurs signalées (vides ou sans lien)</dt>
            <dd className={cx("tabular text-right font-bold", detail.field_issues.total ? TONE_TEXT.warn : "text-ink")}>{fmt(detail.field_issues.total)}</dd>
            <dt className="text-sediment">Écarts documentés</dt>
            <dd className={cx("tabular text-right font-bold", report.gaps.length ? TONE_TEXT.warn : "text-ink")}>{fmt(report.gaps.length)}</dd>
            <dt className="text-sediment">Contrôles en échec{t.blocking_fail ? ` (dont ${fmt(t.blocking_fail)} ${pl(t.blocking_fail, "bloquant", "bloquants")})` : ""}</dt>
            <dd className={cx("tabular text-right font-bold", t.fail ? TONE_TEXT.bad : "text-ink")}>{fmt(t.fail)}</dd>
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {detail.rejections.total + detail.field_issues.total + a.missing > 0 && <CsvLink runId={report.run_id} projectId={projectId} />}
            <StepLink href={migrationHref}>Détail des rejets</StepLink>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Fonctionnalités validées / non validées                              */
/* ------------------------------------------------------------------ */

interface Feature {
  key: string;
  label: string;
  meta?: string;
  tone: Tone;
  status: string;
  lines: { tone: Tone; text: string }[];
  notes: string[];
}

const statusOf = (tone: Tone, accepted: boolean) =>
  tone === "ok" ? "Validée" : tone === "bad" ? "Non validée" : tone === "warn" ? (accepted ? "Validée, écarts acceptés" : "Écarts documentés") : "Non contrôlée";

function domainFeatures(report: Report, detail: RunDetail, index: MappingIndex, accepted: boolean): Feature[] {
  return report.entities.map((e) => {
    const vol = report.checks.find((c) => c.id === `volumes.${e.entity}`);
    const rec = report.checks.find((c) => c.id === `enregistrements.${e.entity}`);
    const money = report.checks.filter((c) => c.id.startsWith(`montants.${e.entity}.`));
    const rules = report.checks.filter((c) => c.id.startsWith(`regles.${e.entity}.`));
    const gaps = report.gaps.filter((g) => g.entity === e.entity);
    const dups = (detail.duplicates ?? []).filter((d) => d.entity === e.entity).length;
    const own = [vol, rec, ...money, ...rules].filter((c): c is Check => !!c);
    const w = worst(own.map((c) => c.status));
    const tone: Tone = !own.length ? "idle" : w === "fail" ? "bad" : w === "warn" || w === "info" || gaps.length > 0 || dups > 0 ? "warn" : "ok";

    const lines: Feature["lines"] = [];
    if (vol)
      lines.push({
        tone: CHECK_TONE[vol.status],
        text:
          vol.status === "pass"
            ? `Volumes : ${count(e.source_rows, "lue", "lues")} = ${count(e.target_rows, "migrée", "migrées")} + ${count(e.rejected, "rejetée", "rejetées")}`
            : `Volumes : ${vol.summary}`,
      });
    else lines.push({ tone: "idle", text: "Volumes : non contrôlés" });
    if (rec) {
      const exact = typeof rec.metrics?.exact === "number" ? rec.metrics.exact : e.exact;
      const compared = typeof rec.metrics?.compared === "number" ? rec.metrics.compared : e.exact + e.mismatched;
      lines.push({ tone: CHECK_TONE[rec.status], text: `Valeurs : ${fmt(exact)} / ${fmt(compared)} enregistrements identiques champ par champ, relations comprises` });
    } else lines.push({ tone: "idle", text: "Valeurs : non contrôlées" });
    if (money.length) {
      const fails = money.filter((c) => c.status === "fail").length;
      const warns = money.filter((c) => c.status === "warn").length;
      lines.push({
        tone: CHECK_TONE[worst(money.map((c) => c.status)) ?? "pass"],
        text: `Montants : ${count(money.length, "total comparé", "totaux comparés")} au centime${fails ? ` · ${fmt(fails)} en écart` : warns ? ` · ${fmt(warns)} avec des montants dans des lignes rejetées` : ", identiques"}`,
      });
    }
    if (rules.length) {
      const off = rules.filter((c) => c.status !== "pass").length;
      lines.push({
        tone: CHECK_TONE[worst(rules.map((c) => c.status)) ?? "pass"],
        text: `Règles sur les données historiques : ${count(rules.length, "règle contrôlée", "règles contrôlées")}${off ? ` · ${fmt(off)} avec des écarts historiques, conservés tels quels` : ", toutes respectées"}`,
      });
    }
    const notes = [...gaps.map((g) => `${GAP_LABEL[g.kind] ?? g.kind} — ${g.message}`), ...(dups ? [`Doublons — ${count(dups, "groupe potentiel", "groupes potentiels")}, migrés sans fusion`] : [])];
    return { key: e.entity, label: e.label ?? index.entity(e.entity), meta: e.source_table, tone, status: statusOf(tone, accepted), lines, notes };
  });
}

const TRANSVERSAL: { key: string; label: string; match: (c: Check) => boolean; none: string; noneStatus?: string; warnStatus?: string }[] = [
  { key: "sources", label: "Fichiers extraits de l'ancien logiciel", match: (c) => c.group === "sources", none: "Aucun contrôle des fichiers extraits dans le rapport." },
  { key: "relations", label: "Relations entre enregistrements", match: (c) => c.group === "relations", none: "Aucun contrôle de relation dans le rapport." },
  { key: "pieces_jointes", label: "Pièces jointes", match: (c) => c.group === "pieces_jointes", none: "Aucune pièce jointe déclarée dans les correspondances." },
  {
    key: "doublons",
    label: "Doublons potentiels",
    match: (c) => c.id === "enregistrements.doublons",
    none: "Aucun groupe signalé selon les règles de détection déclarées dans les correspondances.",
    noneStatus: "Rien à signaler",
    warnStatus: "À arbitrer",
  },
  { key: "integrite", label: "Intégrité physique de la nouvelle base", match: (c) => c.group === "integrite", none: "Non contrôlée." },
  { key: "couverture", label: "Périmètre : non extrait, non repris, exclu", match: (c) => c.group === "couverture", none: "Non contrôlé." },
];

function transversalFeatures(report: Report, accepted: boolean): Feature[] {
  return TRANSVERSAL.map((x) => {
    const checks = report.checks.filter(x.match);
    if (!checks.length) return { key: x.key, label: x.label, tone: "idle" as Tone, status: x.noneStatus ?? "Non contrôlée", lines: [{ tone: "idle" as Tone, text: x.none }], notes: [] };
    const w = worst(checks.map((c) => c.status));
    const tone: Tone = w === "fail" ? "bad" : w === "pass" ? "ok" : "warn";
    const status = tone === "warn" && x.warnStatus ? x.warnStatus : statusOf(tone, accepted);
    return { key: x.key, label: x.label, tone, status, lines: checks.map((c) => ({ tone: CHECK_TONE[c.status], text: `${c.label} — ${c.summary}` })), notes: [] };
  });
}

function calcFeatures(bm: BusinessModelVersion, index: MappingIndex): Feature[] {
  return (bm.history_check?.bindings ?? []).map((b) => {
    const tone: Tone = b.checked === 0 ? "idle" : b.different || b.not_computable ? "bad" : b.rounding ? "warn" : "ok";
    const status = b.checked === 0 ? "Rien à comparer" : tone === "bad" ? "Non validée" : tone === "warn" ? "Écarts d'arrondi" : "Validée sur l'historique";
    const fields = b.compared_fields.map((f) => index.field(b.entity, f)?.label ?? f).join(", ");
    return {
      key: b.id,
      label: `${index.entity(b.entity)} — ${b.scope === "document" ? "calcul des totaux du document" : "calcul des lignes"}`,
      meta: `liaison ${b.id}`,
      tone,
      status,
      lines: [
        {
          tone,
          text: `${count(b.identical, "identique", "identiques")} · ${count(b.rounding, "écart d'arrondi", "écarts d'arrondi")} · ${count(b.different, "écart", "écarts")} · ${count(b.not_computable, "non calculable", "non calculables")}, sur ${count(b.checked, "enregistrement historique", "enregistrements historiques")}`,
        },
        { tone: "idle", text: `Comparé aux montants enregistrés dans l'ancien logiciel : ${fields || "aucun champ stocké"}` },
      ],
      notes: [],
    };
  });
}

function FeatureList({ items }: { items: Feature[] }) {
  return (
    <ul className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
      {items.map((f) => (
        <li key={f.key} className="border-t border-line px-3 py-2.5 first:border-t-0">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-start gap-2">
              <ToneIcon tone={f.tone} className="mt-[3px]" />
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug font-bold">{f.label}</span>
                {f.meta && <span className="block font-mono text-[11px] break-all text-silt">{f.meta}</span>}
              </span>
            </span>
            <Tag tone={f.tone}>{f.status}</Tag>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5 pl-6">
            {f.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12px] text-sediment">
                <ToneIcon tone={l.tone} size={11} className="mt-[3px]" />
                <span className="min-w-0 break-words">{l.text}</span>
              </li>
            ))}
          </ul>
          {f.notes.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 pl-6">
              {f.notes.map((note, i) => (
                <li key={i} className={cx("text-[12px] break-words", TONE_TEXT.warn)}>
                  {note}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FeaturesPanel({
  report,
  detail,
  index,
  bm,
  latestRunId,
}: {
  report: Report;
  detail: RunDetail;
  index: MappingIndex;
  /** Version du modèle métier dont la vérification sur l'historique sert de référence (ou null). */
  bm: BusinessModelVersion | null;
  latestRunId: string;
}) {
  const accepted = report.status === "review" && !!detail.acknowledged;
  const domains = useMemo(() => domainFeatures(report, detail, index, accepted), [report, detail, index, accepted]);
  const transversal = useMemo(() => transversalFeatures(report, accepted), [report, accepted]);
  const calc = useMemo(() => (bm ? calcFeatures(bm, index) : []), [bm, index]);
  const n = { ok: 0, warn: 0, bad: 0 };
  for (const f of domains) if (f.tone === "ok" || f.tone === "warn" || f.tone === "bad") n[f.tone]++;

  return (
    <Panel
      eyebrow="Synthèse fondée sur les contrôles réels"
      title="Fonctionnalités validées / non validées"
      actions={
        <span className="hidden text-[12px] text-sediment sm:inline">
          {fmt(n.ok)} {pl(n.ok, "validée", "validées")} · {fmt(n.warn)} avec écarts · {fmt(n.bad)} non {pl(n.bad, "validée", "validées")}
        </span>
      }
    >
      <p className="text-[12px] text-silt">
        <b className="text-sediment">Validée</b> : tous ses contrôles ont réussi, sans écart. <b className="text-sediment">Écarts documentés</b> : aucun échec, mais des avertissements ou des écarts listés
        ci-dessous. <b className="text-sediment">Non validée</b> : au moins un contrôle en échec. <b className="text-sediment">Non contrôlée</b> : aucun contrôle ne porte dessus.
      </p>
      <p className="mt-1 text-[12px] text-sediment sm:hidden">
        {fmt(n.ok)} {pl(n.ok, "validée", "validées")} · {fmt(n.warn)} avec écarts · {fmt(n.bad)} non {pl(n.bad, "validée", "validées")}
      </p>
      <div className="mt-3 grid gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-1.5 text-[12px] font-bold text-sediment">Données migrées, par domaine</h3>
          <FeatureList items={domains} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h3 className="mb-1.5 text-[12px] font-bold text-sediment">Contrôles transverses</h3>
            <FeatureList items={transversal} />
          </div>
          <div>
            <h3 className="mb-1.5 text-[12px] font-bold text-sediment">Calculs métier rejoués sur l&apos;historique</h3>
            {bm?.history_check ? (
              <>
                <p className="mb-1.5 text-[12px] text-silt">
                  Modèle métier v{bm.version} ({bm.status === "validated" ? "validé" : bm.status === "rejected" ? "refusé" : "à valider"}), rejoué le {when(bm.history_check.at)} sur{" "}
                  {bm.history_check.run_id}
                  {bm.history_check.run_id !== latestRunId ? ` — mesure antérieure à ${latestRunId}, à rejouer` : ""}.
                </p>
                {calc.length ? <FeatureList items={calc} /> : <p className="text-[12.5px] text-sediment">Aucun document historique lié à ce modèle : rien à comparer.</p>}
                <p className="mt-1.5 text-[11.5px] text-silt">Un calcul reproduit sur l&apos;historique ne garantit pas son comportement dans des cas absents de cet historique.</p>
              </>
            ) : (
              <p className="flex items-start gap-1.5 text-[12.5px] text-sediment">
                <ToneIcon tone="idle" size={12} className="mt-[4px]" /> Non contrôlés : aucun modèle métier n&apos;a encore été rejoué sur l&apos;historique (section « Règles métier vérifiées sur
                l&apos;historique »).
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Écarts documentés + acceptation humaine                              */
/* ------------------------------------------------------------------ */

const GAP_TONE: Record<string, Tone> = { unmapped_column: "info", historical: "info" };
const textareaCls = `${inputCls.replace("h-9 ", "")} min-h-[84px] py-2 leading-snug`;

export function GapsPanel({
  report,
  detail,
  index,
  anchorId,
  migrationHref,
  onChanged,
}: {
  report: Report;
  detail: RunDetail;
  index: MappingIndex;
  anchorId: string;
  migrationHref: string;
  onChanged: () => Promise<void>;
}) {
  const { post } = useProject();
  const [comment, setComment] = useState("");
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ack = detail.acknowledged;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/migration/runs/${encodeURIComponent(report.run_id)}/acknowledge`, { comment: text, ...(by.trim() ? { by: by.trim() } : {}) });
      setComment("");
      await onChanged();
    } catch (x) {
      setError(readableError(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id={anchorId} className="scroll-mt-[72px]">
      <Panel
        eyebrow="Écarts documentés"
        title={report.gaps.length ? `${count(report.gaps.length, "écart", "écarts")} : ce qui n'a pas été transféré tel quel, et pourquoi` : "Aucun écart documenté"}
      >
        {report.gaps.length > 0 ? (
          <ul className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            {report.gaps.map((g, i) => (
              <li key={`${g.kind}-${i}`} className="border-t border-line px-3 py-2.5 first:border-t-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tag tone={GAP_TONE[g.kind] ?? "warn"}>{GAP_LABEL[g.kind] ?? g.kind}</Tag>
                  {g.entity && <span className="text-[12px] font-bold text-sediment">{index.entity(g.entity)}</span>}
                  {g.source && <span className="font-mono text-[11px] break-all text-silt">{g.source}</span>}
                </div>
                <p className="mt-1 text-[12.5px] break-words text-ink">{g.message}</p>
                {g.examples?.length ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">
                      {g.examples.length < g.count ? `${fmt(g.examples.length)} premiers exemples sur ${fmt(g.count)}` : `Voir ${pl(g.examples.length, "l'exemple", `les ${fmt(g.examples.length)} exemples`)}`}
                    </summary>
                    <ul className="mt-1 flex max-h-60 flex-col gap-0.5 overflow-y-auto rounded-sm bg-chalk px-2 py-1.5 font-mono text-[11px] text-sediment">
                      {g.examples.map((x, k) => (
                        <li key={k} className="break-words">
                          {describe(x)}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-sediment">Tout ce qui a été lu dans les fichiers extraits a été transféré tel quel : aucun rejet, aucune valeur signalée, aucun élément hors périmètre.</p>
        )}

        {report.status === "validated" && <p className="mt-3 text-[12.5px] text-sediment">Aucun écart à accepter : la mise en service est possible à l&apos;étape Livraison.</p>}

        {report.status === "blocked" && (
          <Notice tone="bad" className="mt-3" title="Acceptation impossible : des contrôles bloquants ont échoué">
            <p>Corrigez la cause (correspondances, décisions ou fichiers sources), puis relancez la migration. Une exécution qui échoue ne laisse aucune donnée partielle.</p>
            <div>
              <StepLink href={migrationHref}>Aller à la migration</StepLink>
            </div>
          </Notice>
        )}

        {report.status === "review" &&
          (ack ? (
            <Notice tone="ok" className="mt-3" title={`Écarts acceptés par ${ack.by} le ${when(ack.at)}`}>
              {ack.comment ? <p className="break-words">« {ack.comment} »</p> : null}
              <p className="text-sediment">La mise en service de {report.run_id} est autorisée (étape Livraison).</p>
            </Notice>
          ) : (
            <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-md bg-ochre-soft/60 px-3 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <div>
                <p className={cx("text-[13px] font-bold", TONE_TEXT.warn)}>Validation humaine : j&apos;ai examiné les {count(report.gaps.length, "écart", "écarts")} ci-dessus</p>
                <p className="mt-0.5 text-[12px] text-ink">
                  L&apos;acceptation est consignée (nom, date, commentaire) dans le journal et autorise la mise en service de {report.run_id}. Elle ne modifie aucune donnée.
                </p>
              </div>
              <Field label="Commentaire (obligatoire)" hint="Ex. : pièces jointes perdues confirmées par le client ; dates invalides à ressaisir dans le nouveau logiciel.">
                <textarea required maxLength={1000} rows={3} className={textareaCls} value={comment} onChange={(e) => setComment(e.target.value)} name="comment" />
              </Field>
              <Field label="Nom du responsable (facultatif)" hint="Consigné avec l'acceptation ; à défaut : « responsable ».">
                <input maxLength={60} className={inputCls} value={by} onChange={(e) => setBy(e.target.value)} name="by" autoComplete="name" />
              </Field>
              {error && (
                <Notice tone="bad" title="Acceptation refusée">
                  <p className="break-words">{error}</p>
                </Notice>
              )}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={busy || !comment.trim()}>
                  {busy ? "Enregistrement…" : "Accepter les écarts documentés"}
                </Button>
              </div>
            </form>
          ))}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contrôles détaillés                                                  */
/* ------------------------------------------------------------------ */

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="border-t border-line px-3 py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        <ToneIcon tone={CHECK_TONE[c.status]} className="mt-[3px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold break-words">
            {c.label}
            <span className="sr-only"> — {CHECK_LABEL[c.status]}</span>
            {c.blocking && <span className={cx("ml-1.5 text-[11px]", c.status === "fail" ? cx("font-bold", TONE_TEXT.bad) : "font-normal text-silt")}>{c.status === "fail" ? "bloquant" : "bloquant si échec"}</span>}
          </p>
          <p className="text-[12px] break-words text-sediment">{c.summary}</p>
          <Metrics metrics={c.metrics} className="mt-1" />
          {c.details?.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11.5px] font-bold text-sediment hover:text-ink">
                {c.details.length >= 25 ? `Détails (extrait : ${fmt(c.details.length)} premiers)` : `Détails (${fmt(c.details.length)})`}
              </summary>
              <ul className="mt-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-sm bg-chalk px-2 py-1.5 font-mono text-[11px] text-sediment">
                {c.details.map((d, i) => (
                  <li key={i} className="break-words">
                    {describe(d)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function ChecksPanel({ report }: { report: Report }) {
  const groups = useMemo(() => {
    const known = GROUPS.map((g) => ({ ...g, checks: report.checks.filter((c) => c.group === g.id) }));
    const other = report.checks.filter((c) => !GROUPS.some((g) => g.id === c.group));
    return [...known, { id: "autres", label: "Autres contrôles", checks: other }].filter((g) => g.checks.length);
  }, [report.checks]);
  return (
    <Panel eyebrow="Contrôles détaillés" title={`${count(report.checks.length, "contrôle", "contrôles")}, par nature`}>
      <p className="mb-3 text-[12px] text-silt">
        Chaque contrôle compte ce qu&apos;il a réellement lu. « Bloquant » : un échec interdit la mise en service. Les groupes comportant un échec ou un avertissement sont ouverts.
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const t = tally(g.checks);
          return (
            <details key={g.id} open={t.fail + t.warn > 0} className="group rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 hover:bg-chalk/50 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  <ChevronRight size={14} className="text-silt transition-transform duration-150 group-open:rotate-90" aria-hidden /> {g.label}
                </span>
                <span className="flex flex-wrap gap-1">
                  {t.pass > 0 && <Tag tone="ok">{count(t.pass, "réussi", "réussis")}</Tag>}
                  {t.warn > 0 && <Tag tone="warn">{count(t.warn, "avertissement", "avertissements")}</Tag>}
                  {t.info > 0 && <Tag tone="info">{count(t.info, "information", "informations")}</Tag>}
                  {t.fail > 0 && <Tag tone="bad">{count(t.fail, "échec", "échecs")}</Tag>}
                </span>
              </summary>
              <ul className="border-t border-line">
                {g.checks.map((c) => (
                  <CheckRow key={c.id} c={c} />
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </Panel>
  );
}
