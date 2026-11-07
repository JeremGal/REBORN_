"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, CircleDashed, CircleX, Info, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, cx } from "@/components/ui";

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
  mapping: { source_system?: string; target: { id: string; name: string }; entities: { name: string; label?: string; fields: MappingField[] }[] };
  issues: { level: "error" | "warning"; path: string; message: string }[];
}
/** GET /api/migration/mapping */
export interface MappingState {
  current: MappingVersion | null;
  status: { pending: number; can_run: boolean; blockers: string[] };
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

export const fmt = (x: number | string | null | undefined): string => (typeof x === "number" && Number.isFinite(x) ? x.toLocaleString("fr-FR") : typeof x === "string" ? x : "—");
export const euros = (cents: number): string => `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" }) : "—");
export const bytes = (b: number): string =>
  b >= 1048576 ? `${(b / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : b < 1024 ? `${b.toLocaleString("fr-FR")} octet${b > 1 ? "s" : ""}` : `${Math.round(b / 1024).toLocaleString("fr-FR")} Ko`;
export function duration(ms: number): string {
  if (ms < 1000) return `${fmt(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
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
    return "La connexion au Studio s'est interrompue avant la réponse : l'opération a pu aboutir côté serveur. Les données affichées sont rechargées depuis l'API.";
  return m;
}

/** Valeur stockée dans la base migrée : les montants sont en centimes. */
export function formatStored(v: unknown, type?: string): string {
  if (v === null || v === undefined || v === "") return "vide";
  if (type === "money" && typeof v === "number") return euros(v);
  if (typeof v === "number") return v.toLocaleString("fr-FR");
  return typeof v === "string" ? v : JSON.stringify(v);
}

/* ------------------------------------------------------------------ */
/* Libellés                                                             */
/* ------------------------------------------------------------------ */

/** Un jeu de test (format de l'Analyste ou de l'Explorer) est toujours présenté comme tel. */
export const TEST_DATASET = "Jeu de test — Relatio 2004";

export const VERDICT: Record<Verdict, { label: string; tone: Tone; text: string }> = {
  validated: { label: "Migration validée", tone: "ok", text: "Tous les contrôles ont réussi sur les données relues, sans écart documenté." },
  review: {
    label: "Validation humaine requise",
    tone: "warn",
    text: "Aucun contrôle bloquant n'a échoué, mais des écarts documentés doivent être examinés et acceptés par un responsable avant la mise en service.",
  },
  blocked: {
    label: "Intervention requise",
    tone: "bad",
    text: "Au moins un contrôle bloquant a échoué : la mise en service est refusée tant que la cause n'est pas corrigée et la migration relancée.",
  },
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
  user: "saisies par l'opérateur",
};

export const BM_SOURCE: Record<BusinessModelVersion["source"], string> = {
  analyst: "reçu de l'Analyste",
  fixture: `${TEST_DATASET} (format de l'Analyste)`,
  investigation: "règles reconstruites par l'investigation",
  user: "saisi par l'opérateur",
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
/* Éléments d'interface                                                 */
/* ------------------------------------------------------------------ */

/** Couleurs de texte contrastées (≥ 4,5:1 sur blanc et sur les fonds teintés). */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-[#0b6b5f]",
  warn: "text-[#8a5a10]",
  bad: "text-[#9c3a24]",
  info: "text-ink-3",
  idle: "text-sediment",
  run: "text-[#2457a6]",
};
const TONE_BG: Record<Tone, string> = {
  ok: "bg-verdigris-soft",
  warn: "bg-ochre-soft",
  bad: "bg-rust-soft",
  info: "bg-[#e6ecf5]",
  idle: "bg-chalk-2",
  run: "bg-[#e7eef8]",
};
export const TONE_BORDER: Record<Tone, string> = {
  ok: "border-verdigris",
  warn: "border-ochre",
  bad: "border-rust",
  info: "border-ink-3",
  idle: "border-line-strong",
  run: "border-[#2457a6]",
};

export function ToneIcon({ tone, size = 14, className }: { tone: Tone; size?: number; className?: string }) {
  const c = cx("shrink-0", className);
  switch (tone) {
    case "ok":
      return <Check size={size} strokeWidth={2.75} className={cx(c, "text-verdigris")} aria-hidden />;
    case "warn":
      return <TriangleAlert size={size} className={cx(c, "text-ochre")} aria-hidden />;
    case "bad":
      return <CircleX size={size} className={cx(c, "text-rust")} aria-hidden />;
    case "info":
      return <Info size={size} className={cx(c, "text-ink-3")} aria-hidden />;
    case "run":
      return <LoaderCircle size={size} className={cx(c, "animate-spin text-[#2457a6] motion-reduce:animate-none")} aria-hidden />;
    default:
      return <CircleDashed size={size} className={cx(c, "text-silt")} aria-hidden />;
  }
}

export function Tag({ tone, children, className, title }: { tone: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-xs px-1.5 text-[11px] leading-[19px] font-bold whitespace-nowrap", TONE_BG[tone], TONE_TEXT[tone], className)}>
      {children}
    </span>
  );
}

/** Message d'état : titre teinté, texte à l'encre (lisible), icône du ton. */
export function Notice({ tone, title, children, className }: { tone: Exclude<Tone, "idle">; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[12.5px] text-ink", TONE_BG[tone], className)}>
      <ToneIcon tone={tone} size={15} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title && <p className={cx("font-bold", TONE_TEXT[tone])}>{title}</p>}
        {children && <div className={cx("flex flex-col gap-1", title ? "mt-0.5" : undefined)}>{children}</div>}
      </div>
    </div>
  );
}

export function Loading({ label = "Chargement…", className }: { label?: string; className?: string }) {
  return (
    <p role="status" className={cx("flex items-center gap-2 py-5 text-[13px] text-silt", className)}>
      <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> {label}
    </p>
  );
}

export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="bad" title={title}>
      <p>{message}</p>
      {onRetry && (
        <div>
          <Button size="sm" variant="ghost" className="mt-1" onClick={onRetry}>
            <RefreshCw size={12} aria-hidden /> Réessayer
          </Button>
        </div>
      )}
    </Notice>
  );
}

export function StepLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-1 text-[12.5px] font-bold text-ink underline decoration-line-strong underline-offset-[3px] transition-colors duration-150 hover:decoration-ink", className)}>
      {children} <ArrowRight size={12} aria-hidden />
    </Link>
  );
}

/** Cellule d'une ligne « tableau » responsive : libellé visible sur mobile, réservé aux lecteurs d'écran au-delà. */
export function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 md:text-right", className)}>
      <span className="block text-[11px] leading-tight text-silt md:sr-only">{label}</span>
      <span className="tabular block text-[13px]">{children}</span>
    </div>
  );
}

/** En-tête de colonnes (masqué aux lecteurs d'écran : chaque cellule porte son libellé). */
export function HeaderRow({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div aria-hidden className={cx("hidden gap-3 border-b border-line bg-chalk/60 px-3 py-1.5 text-[11px] font-bold text-silt md:grid", cols)}>
      {children}
    </div>
  );
}

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
export function Metrics({ metrics, className }: { metrics?: Record<string, number | string>; className?: string }) {
  const list = Object.entries(metrics ?? {});
  if (!list.length) return null;
  return (
    <ul className={cx("flex flex-wrap gap-1", className)}>
      {list.map(([k, v]) => {
        const m = METRIC[k];
        const alarm = !!m?.alarm && typeof v === "number" && v > 0;
        return (
          <li key={k} className={cx("tabular rounded-xs px-1.5 text-[11px] leading-[19px]", alarm ? "bg-rust-soft text-[#9c3a24]" : "bg-chalk text-sediment")}>
            {m?.label ?? k} <b className={cx("font-bold", alarm ? "text-[#9c3a24]" : "text-ink")}>{m?.money && typeof v === "number" ? euros(v) : fmt(v)}</b>
          </li>
        );
      })}
    </ul>
  );
}
