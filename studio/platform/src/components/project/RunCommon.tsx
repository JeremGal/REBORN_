"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronRight, CircleDashed, CircleX, Download, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge, StatusBadge, buttonClasses, cx, ErrorState, formatDateTime, formatNumber, formatPercent } from "@/components/ds";

/* ------------------------------------------------------------------ */
/* Types des réponses d'API utilisées par les étapes Migration et        */
/* Validation. Formes exactes : src/lib/migration/project.ts (RunMeta,   */
/* BusinessModelMeta), run.ts (RunResult), verify.ts                     */
/* (VerificationReport), rules-history.ts (HistoryCheck), generate.ts    */
/* (appStatus) et les routes /api/migration/…                            */
/* ------------------------------------------------------------------ */

export type Verdict = "validated" | "review" | "blocked";
export type CheckStatus = "pass" | "fail" | "warn" | "info";
export type Tone = "ok" | "warn" | "bad" | "info" | "idle" | "run";

export interface RunMeta {
  id: string;
  at: string;
  by: string;
  mapping_version: number;
  status: "completed" | "failed";
  error?: string;
  verification: Verdict | null;
  summary: { imported: number; rejected: number; source_rows: number; attachments: number; duration_ms: number };
}

/** POST /api/migration/runs */
export interface RunStart {
  ok: true;
  run: RunMeta;
  report: { status: Verdict; checks: number; failed: number } | null;
}

export interface EntityRun {
  entity: string;
  label?: string;
  source_table: string;
  source_rows: number;
  imported: number;
  rejected: number;
  conversion_issues: number;
  unlinked: number;
}
export interface Rejection {
  entity: string;
  source_table: string;
  source_key: string | null;
  row: number;
  reasons: string[];
  raw?: Record<string, unknown>;
}
export interface FieldIssue {
  entity: string;
  record_id: number;
  source_key: string;
  field: string;
  kind: "conversion" | "unlinked";
  message: string;
  raw: unknown;
}
export interface DuplicateGroup {
  entity: string;
  rule: string;
  value: string;
  records: { id: number; source_key: string }[];
}

export interface Check {
  id: string;
  group: string;
  label: string;
  status: CheckStatus;
  blocking: boolean;
  summary: string;
  metrics?: Record<string, number | string>;
  details?: unknown[];
}
export interface Gap {
  kind: string;
  entity?: string;
  source?: string;
  message: string;
  count: number;
  examples?: unknown[];
}
export interface EntityVerification {
  entity: string;
  label?: string;
  source_table: string;
  source_rows: number;
  target_rows: number;
  rejected: number;
  exact: number;
  mismatched: number;
  totals: { field: string; accounting: boolean; source_cents: number; target_cents: number; rejected_cents: number }[];
}
export interface Report {
  run_id: string;
  verified_at: string;
  target: string;
  status: Verdict;
  statement: string;
  checks: Check[];
  entities: EntityVerification[];
  gaps: Gap[];
  database: { sha256: string; bytes: number; integrity?: string };
}
export interface Acknowledgement {
  at: string;
  by: string;
  comment?: string;
}

/** GET /api/migration/runs/[id] */
export interface RunDetail {
  meta: RunMeta;
  acknowledged: Acknowledgement | null;
  entities: EntityRun[];
  attachments: { expected: number; stored: number; bytes: number; missing: number };
  rejections: { total: number; items: Rejection[] };
  field_issues: { total: number; items: FieldIssue[] };
  duplicates?: DuplicateGroup[];
  db_sha256?: string;
  report: Report | null;
  reconciliation: Report | null;
}

export interface MappingField {
  name: string;
  label?: string;
  source: string;
  type: string;
  references?: string;
  accounting?: boolean;
}
export interface MappingVersion {
  version: number;
  origin: "auto" | "analyst" | "user" | "fixture";
  received_at: string;
  mapping: { source_system?: string; target: { id: string; name: string }; entities: { name: string; label?: string; source: { table: string; key: string }; fields: MappingField[] }[]; attachments?: unknown[] };
  issues: { level: "error" | "warning"; path: string; message: string }[];
}
/** GET /api/migration/mapping */
export interface MappingState {
  current: MappingVersion | null;
  status: { pending: number; can_run: boolean; blockers: string[]; items?: { key: string; decision: { decision: "accepted" | "excluded"; by: string; at: string; comment?: string } | null; label: string }[] };
}

export interface HistoryBinding {
  id: string;
  entity: string;
  scope: "line" | "document";
  checked: number;
  identical: number;
  rounding: number;
  different: number;
  not_computable: number;
  compared_fields: string[];
  samples: { record: string; field: string; stored: number | string | null; computed: number | string | null; reason?: string }[];
}
export interface HistoryCheck {
  version: number;
  run_id: string;
  at: string;
  bindings: HistoryBinding[];
  statement: string;
}
export interface BusinessModelVersion {
  version: number;
  received_at: string;
  source: "analyst" | "fixture" | "investigation" | "user";
  by: string;
  sha256: string;
  status: "proposed" | "validated" | "rejected";
  decided_at?: string;
  decided_by?: string;
  comment?: string;
  modules: string[];
  bindings: { id: string; entity: string; scope: string; module: string }[];
  issues: { level: "error" | "warning"; path: string; message: string }[];
  history_check?: HistoryCheck | null;
  published?: { app_id: string; at: string; by: string }[];
}

/** GET /api/migration/app */
export interface AppState {
  deployment: { id: string; at: string; by: string; run_id: string; app_dir: string; backup: string | null; status: string } | null;
  app_id: string | null;
  port: number;
  url: string;
  running: boolean;
  managed: boolean;
  rules_version: number | null;
  port_used_by_other: boolean;
}

/** POST /api/migration/reconcile */
export interface ReconcileResult {
  ok: true;
  status: Verdict;
  checks: number;
  failed: string[];
}

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

/** Nombre au format français, séparateur de milliers lisible (formatNumber du design system, partagé par tout le Studio). */
const fr = (x: number, o?: Intl.NumberFormatOptions): string => formatNumber(x, o);
export const fmt = (x: number | string | null | undefined): string => (typeof x === "number" && Number.isFinite(x) ? fr(x) : typeof x === "string" ? x : "—");
export const euros = (cents: number): string => `${fr(cents / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/**
 * Part de `total` en pourcentage, jamais arrondie à 100 % (ni à 0 %) si elle ne l'est pas :
 * 2 999 sur 3 000 donne « 99,97 % », pas « 100 % » (formatPercent du design system).
 */
export const share = (part: number, total: number): string => (total > 0 ? formatPercent(part / total) : "—");
/** Date et heure à la seconde (détails techniques). */
export const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" }) : "—");
/** Date et heure à la minute (vue principale) : format unique du Studio (« 8 nov. 2026, 02:09 »). */
export const whenShort = (iso: string | null | undefined): string => formatDateTime(iso);
export const bytes = (b: number): string => (b >= 1048576 ? `${fr(b / 1048576, { maximumFractionDigits: 1 })} Mo` : b < 1024 ? `${fr(b)} octet${b > 1 ? "s" : ""}` : `${fr(Math.round(b / 1024))} Ko`);
export function duration(ms: number): string {
  if (ms < 1000) return `${fmt(ms)} ms`;
  if (ms < 60000) return `${fr(ms / 1000, { maximumFractionDigits: 1 })} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}
/** Nom accordé au nombre (en français, 0 et 1 restent au singulier). */
export const pl = (x: number, one: string, many: string): string => (Math.abs(x) >= 2 ? many : one);
/** Nombre + nom accordé. */
export const count = (x: number, one: string, many: string): string => `${fmt(x)} ${pl(x, one, many)}`;

/** Message d'erreur affichable : celui de l'API, ou une explication en français si la connexion a coupé. */
export function readableError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m))
    return "La connexion au Studio s'est interrompue avant la réponse : l'opération a pu aboutir côté serveur. Les données affichées sont rechargées.";
  return m;
}

/** Valeur stockée dans la base migrée : les montants sont en centimes. */
export function formatStored(v: unknown, type?: string): string {
  if (v === null || v === undefined || v === "") return "vide";
  if (type === "money" && typeof v === "number") return euros(v);
  if (typeof v === "number") return fr(v);
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Nom de table source, affiché seulement s'il apporte une information (différent de l'entité). */
export function sourceHint(entity: string, table: string | undefined, label?: string): string | null {
  if (!table) return null;
  const t = table.toLowerCase();
  return t === entity.toLowerCase() || t === label?.toLowerCase() ? null : table;
}

/* ------------------------------------------------------------------ */
/* Libellés                                                             */
/* ------------------------------------------------------------------ */

/** Un jeu de test (format de l'Analyste ou de l'Explorer) est toujours présenté comme tel. */
export const TEST_DATASET = "Jeu de test — Relatio 2004";

export const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  validated: { label: "Migration validée", tone: "ok" },
  review: { label: "Validation humaine requise", tone: "warn" },
  blocked: { label: "Intervention requise", tone: "bad" },
};
export const VERIFICATION_SHORT: Record<Verdict, string> = { validated: "migration validée", review: "validation humaine requise", blocked: "intervention requise" };

export function runTone(r: Pick<RunMeta, "status" | "verification">): Tone {
  if (r.status === "failed") return "bad";
  return r.verification ? VERDICT[r.verification].tone : "idle";
}

export const CHECK_TONE: Record<CheckStatus, Tone> = { pass: "ok", warn: "warn", fail: "bad", info: "info" };
export const CHECK_LABEL: Record<CheckStatus, string> = { pass: "Réussi", warn: "Avertissement", fail: "Échec", info: "Information" };

export const GROUPS: { id: string; label: string }[] = [
  { id: "sources", label: "Fichiers extraits" },
  { id: "volumes", label: "Volumes" },
  { id: "enregistrements", label: "Enregistrements" },
  { id: "relations", label: "Relations" },
  { id: "montants", label: "Montants" },
  { id: "pieces_jointes", label: "Pièces jointes" },
  { id: "regles", label: "Règles métier sur les données historiques" },
  { id: "integrite", label: "Intégrité de la base" },
  { id: "couverture", label: "Périmètre" },
];

export const GAP_LABEL: Record<string, string> = {
  rejected: "Rejet",
  unlinked: "Sans lien",
  conversion: "Valeur non convertie",
  attachment: "Pièce jointe",
  unmapped_table: "Table non reprise",
  unmapped_column: "Colonnes non reprises",
  inaccessible: "Non extrait",
  excluded: "Exclu par décision",
  duplicate: "Doublons",
  historical: "Écart historique",
};

export const MAPPING_ORIGIN: Record<MappingVersion["origin"], string> = {
  analyst: "reçues de l'Analyste",
  fixture: `${TEST_DATASET} (format de l'Analyste)`,
  auto: "proposition automatique déduite de la structure lue",
  user: "corrigées à la main",
};

export const BM_SOURCE: Record<BusinessModelVersion["source"], string> = {
  analyst: "reçu de l'Analyste",
  fixture: `${TEST_DATASET} (format de l'Analyste)`,
  investigation: "règles reconstruites par l'investigation",
  user: "saisi à la main",
};

export const BM_STATUS: Record<BusinessModelVersion["status"], { label: string; tone: Tone }> = {
  proposed: { label: "À valider", tone: "warn" },
  validated: { label: "Validé", tone: "ok" },
  rejected: { label: "Refusé", tone: "bad" },
};

/* ------------------------------------------------------------------ */
/* Calculs sur les contrôles (aucune estimation : on compte)             */
/* ------------------------------------------------------------------ */

const RANK: Record<CheckStatus, number> = { pass: 0, info: 1, warn: 2, fail: 3 };
export function worst(list: CheckStatus[]): CheckStatus | null {
  return list.length ? list.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null;
}
export function tally(checks: Check[]) {
  const t = { pass: 0, warn: 0, fail: 0, info: 0, blocking_fail: 0, total: checks.length };
  for (const c of checks) {
    t[c.status]++;
    if (c.status === "fail" && c.blocking) t.blocking_fail++;
  }
  return t;
}

/** Libellés des entités et des champs du nouveau logiciel (correspondances courantes). */
export interface MappingIndex {
  entity: (name: string, fallback?: string) => string;
  field: (entity: string, field: string) => MappingField | undefined;
}
export function mappingIndex(m: MappingVersion | null, extra: { entity: string; label?: string }[] = []): MappingIndex {
  const entities = new Map<string, string>();
  const fields = new Map<string, MappingField>();
  for (const e of extra) if (e.label) entities.set(e.entity, e.label);
  for (const e of m?.mapping.entities ?? []) {
    entities.set(e.name, e.label ?? entities.get(e.name) ?? e.name);
    for (const f of e.fields) fields.set(`${e.name}.${f.name}`, f);
  }
  return { entity: (name, fallback) => entities.get(name) ?? fallback ?? name, field: (entity, field) => fields.get(`${entity}.${field}`) };
}

/* ------------------------------------------------------------------ */
/* Données sources affichées : jamais de secret en clair                 */
/* ------------------------------------------------------------------ */

const SENSITIVE = /(pass|pwd|mdp|mot_?de_?passe|secret|token|jeton|api_?key|hash|salt)/i;
export function maskRaw(raw: Record<string, unknown>): [string, string][] {
  return Object.entries(raw).map(([k, v]) => [
    k,
    SENSITIVE.test(k)
      ? "•••• (masqué)"
      : v === null || v === undefined || v === ""
        ? "vide"
        : typeof v === "string"
          ? v.trim()
            ? v
            : `vide (${v.length} ${v.length > 1 ? "espaces" : "espace"})`
          : JSON.stringify(v),
  ]);
}

const EX_KEY: Record<string, string> = {
  source_key: "clé source",
  ligne: "ligne",
  motifs: "motifs",
  valeur_source: "valeur source",
  motif: "motif",
  path: "chemin",
  filename: "fichier",
  reason: "motif",
  entity: "entité",
  rule: "règle",
  value: "valeur",
  records: "clés",
};
/** Exemple joint à un écart ou à un contrôle, rendu lisible (texte, ou paires clé : valeur). */
export function describe(x: unknown): string {
  if (x === null || x === undefined) return "vide";
  if (typeof x !== "object") return String(x);
  if (Array.isArray(x)) return x.map(describe).join(", ");
  return Object.entries(x as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const label = SENSITIVE.test(k) ? `${k} : •••• (masqué)` : null;
      if (label) return label;
      const val = Array.isArray(v)
        ? v.map((i) => (i && typeof i === "object" && "source_key" in i ? String((i as { source_key: unknown }).source_key) : describe(i))).join(", ")
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
      return `${EX_KEY[k] ?? k} : ${val}`;
    })
    .join(" · ");
}

/* ------------------------------------------------------------------ */
/* Éléments d'interface (jetons du design system)                       */
/* ------------------------------------------------------------------ */

/** Couleurs de texte des tons (≥ 4,5:1 sur les surfaces du Studio). */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-accent-ink",
  warn: "text-warning-ink",
  bad: "text-danger-ink",
  info: "text-ink",
  idle: "text-text-2",
  run: "text-accent-ink",
};
const DS_TONE = { ok: "ok", warn: "warn", bad: "bad", info: "info", idle: "neutral", run: "running" } as const;

export function ToneIcon({ tone, size = 15, className }: { tone: Tone; size?: number; className?: string }) {
  const c = cx("shrink-0", className);
  switch (tone) {
    case "ok":
      return <Check size={size} strokeWidth={2.75} className={cx(c, "text-accent")} aria-hidden />;
    case "warn":
      return <TriangleAlert size={size} className={cx(c, "text-warning")} aria-hidden />;
    case "bad":
      return <CircleX size={size} className={cx(c, "text-danger")} aria-hidden />;
    case "info":
      return <Info size={size} className={cx(c, "text-text-2")} aria-hidden />;
    case "run":
      return <LoaderCircle size={size} className={cx(c, "animate-spin text-accent motion-reduce:animate-none")} aria-hidden />;
    default:
      return <CircleDashed size={size} className={cx(c, "text-text-3")} aria-hidden />;
  }
}

/** Étiquette d'état : icône ET texte (jamais la couleur seule). `plain` : étiquette sans icône (catégorie). */
export function Tag({ tone, children, className, title, plain }: { tone: Tone; children: ReactNode; className?: string; title?: string; plain?: boolean }) {
  return plain ? (
    <Badge tone={DS_TONE[tone]} className={className} title={title}>
      {children}
    </Badge>
  ) : (
    <StatusBadge tone={DS_TONE[tone]} className={className} title={title}>
      {children}
    </StatusBadge>
  );
}

export function Loading({ label = "Chargement…", className }: { label?: string; className?: string }) {
  return (
    <p role="status" className={cx("flex items-center gap-2 py-4 text-body text-text-3", className)}>
      <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> {label}
    </p>
  );
}

export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string; onRetry?: () => void; title?: string }) {
  return <ErrorState title={title} message={message} onRetry={onRetry} />;
}

export function StepLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("ds-link inline-flex items-center gap-1 text-body font-semibold max-sm:min-h-11", className)}>
      {children} <ArrowRight size={13} aria-hidden />
    </Link>
  );
}

/** Lien de téléchargement du rapport d'écarts (CSV) d'une exécution. */
export function rejectsCsvHref(runId: string, projectId: string) {
  return `/api/migration/runs/${encodeURIComponent(runId)}/rejects?project=${encodeURIComponent(projectId)}`;
}

/** Rapport d'écarts (rejets, valeurs signalées, pièces jointes manquantes) au format CSV. */
export function CsvLink({ runId, projectId }: { runId: string; projectId: string }) {
  return (
    <a href={rejectsCsvHref(runId, projectId)} download title={`Rapport d'écarts de ${runId} : rejets, valeurs signalées et pièces jointes manquantes`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Download size={14} aria-hidden />
      <span>Rapport d&apos;écarts (CSV)</span>
    </a>
  );
}

/** Détail replié à l'intérieur d'une section (groupe nommé : indépendant de la section parente). */
export function More({ label, children, open, className }: { label: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details open={open} className={cx("group/more", className)}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-xs text-small font-semibold text-text-2 transition-colors duration-(--duration-fast) select-none hover:text-ink max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform duration-(--duration-fast) group-open/more:rotate-90" />
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/**
 * Tableaux de données : pleine largeur dans une <Section> (débord de son padding horizontal),
 * nombres alignés à droite en chiffres tabulaires, libellés de colonnes ≥ 12 px.
 */
export const T = {
  wrap: "-mx-5 overflow-x-auto",
  table: "w-full border-collapse text-body",
  head: "border-b border-line-strong bg-canvas",
  th: "px-3 py-2 text-right align-bottom text-small leading-snug font-semibold whitespace-nowrap text-text-2 first:pl-5 first:text-left last:pr-5",
  row: "border-b border-line last:border-b-0",
  td: "tabular px-3 py-2.5 text-right align-top whitespace-nowrap first:pl-5 first:text-left first:whitespace-normal last:pr-5",
  foot: "border-t border-line-strong bg-canvas",
};
/**
 * Conteneur d'un tableau qui peut défiler horizontalement : il devient une région focalisable et
 * nommée seulement quand il défile réellement (accessible au clavier, WCAG 2.1.1), et l'indique aussi à
 * l'écran (« Faites défiler le tableau → ») : sur mobile, des colonnes coupées ne doivent pas passer inaperçues.
 */
export function TableScroll({ label, children, className = T.wrap }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div ref={ref} className={className} {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": `${label} (faites défiler horizontalement)` } : {})}>
        {children}
      </div>
      {scrolls && (
        <p aria-hidden className="mt-1.5 text-meta text-text-3">
          Faites défiler le tableau horizontalement →
        </p>
      )}
    </>
  );
}

/**
 * Liste à hauteur limitée qui peut défiler : focalisable et nommée (clavier). Posé sur <ul>/<ol> : on
 * garde le rôle natif de liste (un rôle « region » l'écraserait et les <li> perdraient leur liste).
 */
export const scrollRegion = (label: string) => ({ tabIndex: 0, "aria-label": label });

/** Valeur nulle d'un tableau : lisible (text-3), pas « désactivée ». */
export const ZERO = "text-text-3";

const METRIC: Record<string, { label: string; money?: boolean; alarm?: boolean }> = {
  source: { label: "lignes sources" },
  target: { label: "en base" },
  rejected: { label: "rejetées" },
  deleted_after_migration: { label: "supprimées depuis la mise en service" },
  lost: { label: "perdues", alarm: true },
  phantom: { label: "sans origine", alarm: true },
  compared: { label: "comparés" },
  exact: { label: "identiques" },
  mismatched: { label: "différents", alarm: true },
  modified_after_migration: { label: "modifiés depuis la mise en service" },
  source_cents: { label: "total source", money: true },
  target_cents: { label: "total migré", money: true },
  rejected_cents: { label: "dans des lignes rejetées", money: true },
};

/** Mesures brutes d'un contrôle, telles que renvoyées par le moteur de vérification. */
export function CheckMetrics({ metrics, className }: { metrics?: Record<string, number | string>; className?: string }) {
  const list = Object.entries(metrics ?? {});
  if (!list.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-1", className)}>
      {list.map(([k, v]) => {
        const m = METRIC[k];
        const alarm = !!m?.alarm && typeof v === "number" && v > 0;
        return (
          <li key={k} className={cx("tabular rounded-xs px-1.5 py-0.5 text-meta", alarm ? "bg-danger-soft text-danger-ink" : "bg-surface-sunken text-text-2")}>
            {m?.label ?? k} <b className={cx("font-semibold", alarm ? "text-danger-ink" : "text-ink")}>{m?.money && typeof v === "number" ? euros(v) : fmt(v)}</b>
          </li>
        );
      })}
    </ul>
  );
}
