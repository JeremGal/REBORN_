"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { cx } from "@/components/ds/cx";
import { formatDateTime, formatInt, formatNumber, formatPercent } from "@/components/ds/format";
import { Callout } from "./Step";
import { projectCall, useProject } from "./ProjectProvider";

/*
 * Socle commun des étapes « Données » et « Correspondances » : types des réponses d'API
 * (sous-ensembles de src/lib/migration/*), libellés français, petits composants et hooks.
 * Aucun chiffre n'est produit ici : tout ce qui est affiché provient des réponses d'API.
 * Les blocs visuels (en-tête, chiffres, sections, messages, jeux de test) viennent de ./Step.
 */

/* ------------------------------------------------------------------ */
/* Types des réponses d'API                                             */
/* ------------------------------------------------------------------ */

export type SourceFormat = "csv" | "json" | "xlsx" | "sql" | "sqlite" | "zip";

/** GET /api/migration/sources (lib/migration/project.ts : SourceMeta). */
export interface SourceMeta {
  id: string;
  name: string;
  format: SourceFormat;
  size: number;
  sha256: string;
  received_at: string;
  origin: { kind: "upload" | "http_export" | "api"; mechanism?: string; url?: string; by?: string };
  tables: { name: string; rows: number; columns: number }[];
  archive_entries?: number;
  encoding?: string;
  warnings: string[];
}

/** lib/migration/connectors.ts : MechanismResult. */
export interface MechanismResult {
  id: string;
  label?: string;
  url: string;
  status: "ok" | "forbidden" | "unauthorized" | "not_found" | "error";
  http?: number;
  message?: string;
  bytes?: number;
  sha256?: string;
  file?: string;
}

/** GET /api/migration → extraction (dernière extraction, sans les fichiers). */
export interface ExtractionSummary {
  at: string;
  system: string;
  base_url: string;
  account: string;
  results: MechanismResult[];
  /** Manifeste publié par le logiciel source : nom de table d'origine, lignes et empreinte déclarées par fichier. */
  manifest: { exports: ManifestExport[] } | null;
  not_extractable?: { label: string; reason: string }[];
}
export interface ManifestExport {
  file: string;
  table?: string | null;
  format?: string;
  rows?: number;
  bytes?: number;
  sha256?: string;
}

/**
 * Nom de la table dans l'ancien logiciel (ex. T_CLIENT), d'après le manifeste de la dernière
 * extraction, pour chaque table lue d'un fichier mono-table (ex. « clients » lu de clients.csv).
 */
export function legacyTables(sources: SourceMeta[], ex: ExtractionSummary | null): Map<string, { legacy: string; file: string }> {
  const out = new Map<string, { legacy: string; file: string }>();
  for (const s of sources) {
    if (s.tables.length !== 1) continue;
    const m = ex?.manifest?.exports.find((x) => x.file === s.name);
    if (m?.table) out.set(s.tables[0].name, { legacy: m.table, file: s.name });
  }
  return out;
}

/** GET /api/migration/profile (lib/migration/profile.ts). */
export interface ColumnProfile {
  name: string;
  type: "empty" | "integer" | "decimal" | "money" | "boolean" | "date" | "email" | "phone" | "text";
  format?: string;
  conformity: number;
  nulls: number;
  distinct: number;
  unique: boolean;
  max_length: number;
  max_decimals?: number;
  samples: (string | number | boolean | null)[];
  anomalies: { count: number; samples: (string | number | boolean | null)[] };
  codes?: { value: string; count: number }[];
}
export interface TableProfile {
  name: string;
  source_file?: string;
  rows: number;
  columns: ColumnProfile[];
  primary_key: string | null;
  entity: string;
}
export interface RelationGuess {
  table: string;
  column: string;
  references: { table: string; column: string };
  coverage: number;
  orphans: number;
  orphan_samples: string[];
  confidence: number;
}
export interface SourceProfile {
  tables: TableProfile[];
  relations: RelationGuess[];
}

/** Contrat migration_mapping v1.0 (lib/migration/mapping.ts). */
export type Transform =
  | "trim"
  | "lower"
  | "upper"
  | "collapse_spaces"
  | "digits"
  | { date: string }
  | { decimal: string }
  | { money: string }
  | { boolean: { true: string[]; false: string[] } }
  | { map: Record<string, string> }
  | { null_if: string[] };

export type FieldType = "text" | "integer" | "decimal" | "money" | "percent" | "date" | "boolean" | "enum" | "email" | "phone" | "reference";

export interface FieldMap {
  name: string;
  label?: string;
  source: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  transforms?: Transform[];
  options?: { value: string; label?: string }[];
  references?: string;
  on_missing?: "reject" | "keep_unlinked";
  accounting?: boolean;
  list?: boolean;
  confidence?: number;
  note?: string;
}

export type ClassKind = "financial" | "commercial" | "line" | "master" | "other";

export interface EntityMap {
  name: string;
  label?: string;
  label_singular?: string;
  source: { table: string; key: string };
  title_field?: string;
  fields: FieldMap[];
  duplicates?: { fields: string[]; label?: string }[];
  checks?: { id: string; description?: string; expr: string; severity?: "info" | "warning" | "blocking" }[];
  aggregates?: { id: string; description?: string; field: string; children: string; via: string; expr: string; severity?: "info" | "warning" | "blocking"; verify?: boolean }[];
  computed?: { field: string; expr: string }[];
  classification?: { kind: ClassKind; confidence: number; parent?: string; note?: string };
  line_of?: { entity: string; via: string };
  confidence?: number;
  note?: string;
}

export interface AttachmentMap {
  source: { table: string; key: string };
  archive: string;
  path: string;
  filename: string;
  owner: { type: string; id: string; map: Record<string, string> } | { entity: string; id: string };
  confidence?: number;
  note?: string;
}

export interface MigrationMapping {
  contract_version: string;
  source_system?: string;
  target: { id: string; name: string };
  review_threshold: number;
  entities: EntityMap[];
  attachments?: AttachmentMap[];
  excluded_sources?: { table: string; reason: string }[];
  notes?: string;
}

export interface MappingIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

export type MappingOrigin = "auto" | "analyst" | "user" | "fixture";

export interface MappingVersion {
  version: number;
  origin: MappingOrigin;
  received_at: string;
  sha256: string;
  mapping: MigrationMapping;
  issues: MappingIssue[];
}

export interface Decision {
  decision: "accepted" | "excluded";
  at: string;
  by: string;
  comment?: string;
}

export type ReviewKind = "entity" | "field" | "attachment" | "accounting";

export interface ReviewItem {
  key: string;
  kind: ReviewKind;
  label: string;
  confidence: number;
  detail: string;
  decision: Decision | null;
}

/** GET /api/migration/mapping → { current, status } (planStatus). */
export interface PlanStatus {
  items: ReviewItem[];
  pending: number;
  errors?: MappingIssue[];
  can_run: boolean;
  blockers: string[];
}
export interface MappingResponse {
  current: MappingVersion | null;
  status: PlanStatus;
}
/** POST /api/migration/mapping → version créée. */
export interface MappingPostResponse {
  ok: boolean;
  version: number;
  issues: MappingIssue[];
  review: PlanStatus;
}

/* ------------------------------------------------------------------ */
/* Constantes et libellés                                               */
/* ------------------------------------------------------------------ */

/**
 * Logiciel de test du hackathon : le plan d'extraction de test et les correspondances de test
 * (format de l'Explorer / de l'Analyste) le décrivent. Tout ce qui en provient est étiqueté « jeu de test ».
 */
export const TEST_SYSTEM = "Relatio 2004";

/** Auteur enregistré pour les fichiers déposés depuis cet écran (champ `by` de POST /api/migration/sources). */
export const UPLOAD_BY = "Studio (import manuel)";

export const FORMAT_LABEL: Record<string, string> = { csv: "CSV", json: "JSON", xlsx: "Excel", sql: "Export SQL", sqlite: "Base SQLite", zip: "Archive ZIP" };

/** Types déduits à la lecture (profile.ts). */
export const READ_TYPE: Record<string, string> = {
  empty: "vide",
  integer: "entier",
  decimal: "décimal",
  money: "montant",
  boolean: "oui/non",
  date: "date",
  email: "e-mail",
  phone: "téléphone",
  text: "texte",
};
export const READ_FORMAT: Record<string, string> = { "DD/MM/YYYY": "JJ/MM/AAAA", "YYYY-MM-DD": "AAAA-MM-JJ", "MM/DD/YYYY": "MM/JJ/AAAA", comma: "virgule décimale", dot: "point décimal", excel: "numéro de série Excel" };

/** Types du nouveau logiciel (contrat). */
export const FIELD_TYPE: Record<FieldType, string> = {
  text: "Texte",
  integer: "Entier",
  decimal: "Décimal",
  money: "Montant",
  percent: "Pourcentage",
  date: "Date",
  boolean: "Oui / non",
  enum: "Liste de valeurs",
  email: "E-mail",
  phone: "Téléphone",
  reference: "Référence",
};

export const CLASS_LABEL: Record<ClassKind, string> = {
  financial: "Document comptable",
  commercial: "Document commercial",
  line: "Lignes de document",
  master: "Référentiel",
  other: "Autre — montants datés",
};

export const ORIGIN: Record<MappingOrigin, { label: string; hint: string; test: boolean }> = {
  analyst: { label: "Reçue de l'Analyste", hint: "Envoyée par l'agent d'Alan via l'API.", test: false },
  fixture: {
    label: `Jeu de test au format de l'Analyste — ${TEST_SYSTEM}`,
    hint: `Écrite à la main pour le logiciel de test ${TEST_SYSTEM} : ce n'est pas un envoi de l'Analyste.`,
    test: true,
  },
  auto: { label: "Proposition automatique", hint: "Déduite uniquement de la structure lue, sans connaissance du logiciel source.", test: false },
  user: { label: "Saisie opérateur", hint: "Correspondances fournies à la main par un opérateur.", test: false },
};

const TRANSFORM_WORD: Record<string, string> = {
  trim: "espaces début/fin retirés",
  lower: "en minuscules",
  upper: "en majuscules",
  collapse_spaces: "espaces multiples réduits",
  digits: "chiffres seulement",
};
/** Nettoyages de forme, sans effet sur le sens de la valeur : affichés en retrait. */
const MINOR_TRANSFORMS = new Set(["trim", "lower", "upper", "collapse_spaces"]);
const SEP: Record<string, string> = { comma: "virgule décimale", dot: "point décimal", auto: "séparateur détecté" };

/** Libellé lisible d'une transformation déclarée dans le contrat (`minor` : simple nettoyage de forme). */
export function transformLabel(t: Transform): { label: string; title?: string; minor?: boolean } {
  if (typeof t === "string") return { label: TRANSFORM_WORD[t] ?? t, minor: MINOR_TRANSFORMS.has(t) };
  if ("date" in t) return { label: t.date === "excel" ? "date Excel (numéro de série)" : `date ${READ_FORMAT[t.date] ?? t.date}` };
  if ("decimal" in t) return { label: `décimal, ${SEP[t.decimal] ?? t.decimal}` };
  if ("money" in t) return { label: `montant, ${SEP[t.money] ?? t.money}` };
  if ("boolean" in t) return { label: `oui = ${t.boolean.true.join(" / ") || "—"}, non = ${t.boolean.false.join(" / ") || "—"}` };
  if ("map" in t) {
    const pairs = Object.entries(t.map).map(([k, v]) => `${k} → ${v}`);
    return { label: `codes ${pairs.slice(0, 3).join(", ")}${pairs.length > 3 ? ` (+${pairs.length - 3})` : ""}`, title: pairs.join("\n") };
  }
  if ("null_if" in t) return { label: `vide si ${t.null_if.map((v) => `« ${v} »`).join(", ")}` };
  return { label: JSON.stringify(t) };
}

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

/** Entier au format français, séparateur de milliers lisible (formatInt du design system). */
export const nf = (x: number) => formatInt(x);
/** Pluriel français : 0 et 1 au singulier. */
export const plural = (count: number, one: string, many = `${one}s`) => `${nf(count)} ${count > 1 ? many : one}`;
export const bytes = (b: number) => (b >= 1048576 ? `${formatNumber(b / 1048576, { maximumFractionDigits: 1 })} Mo` : b >= 1024 ? `${formatInt(Math.round(b / 1024))} Ko` : `${nf(b)} o`);
/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:09 »). */
export const dt = (iso: string) => formatDateTime(iso);
export const shortHash = (h: string | undefined, len = 12) => (h ? `${h.slice(0, len)}…` : "—");
/**
 * Pourcentage (une décimale au plus) qui n'est jamais arrondi à 100 % ni à 0 % s'il ne l'est pas :
 * la précision augmente près des bornes (0,9996 → « 99,96 % »), voir formatPercent du design system.
 */
export const percent = (v: number) => formatPercent(v, 1);
/** Confiance en pourcentage entier, jamais « 100 % » pour une valeur qui ne l'est pas exactement. */
export const confidencePct = (v: number) => `${v < 1 ? Math.min(Math.round(v * 100), 99) : 100} %`;

/* ------------------------------------------------------------------ */
/* Composants                                                           */
/* ------------------------------------------------------------------ */

/** Libellé long d'un bouton : peut passer à la ligne sur mobile au lieu de déborder. */
export const WRAP_BTN = "h-auto! min-h-7 whitespace-normal! py-1 text-left";

export type Tone = "ok" | "bad" | "warn" | "info";

/** Tons des pastilles : jetons du design system (contrastes ≥ 4,5:1, voir globals.css). */
const CHIP_TONE = {
  neutral: "bg-surface-sunken text-text-2",
  ok: "bg-accent-soft text-accent-ink",
  warn: "bg-warning-soft text-warning-ink",
  bad: "bg-danger-soft text-danger-ink",
  ref: "bg-surface text-ink ring-1 ring-inset ring-line-strong",
  lock: "bg-ink text-white",
} as const;

/** Pastille compacte (état, drapeau). */
export function Chip({ children, tone = "neutral", title, className }: { children: ReactNode; tone?: keyof typeof CHIP_TONE; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1 rounded-xs px-1.5 py-0.5 text-meta leading-4 font-semibold", CHIP_TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cx("shrink-0 animate-spin", className)} aria-hidden />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-body text-text-3" role="status">
      <Spinner /> {label}
    </div>
  );
}

/** Erreur de chargement : message renvoyé par l'API + nouvel essai (vrai GET). */
export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Callout
      tone="bad"
      title={title}
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Réessayer
          </Button>
        ) : undefined
      }
    >
      {message}
    </Callout>
  );
}

/** Message d'une opération (réussite, avertissement, erreur), refermable. */
export function NoticeCallout({ notice, onClose, className }: { notice: ActionNotice; onClose?: () => void; className?: string }) {
  return (
    <Callout
      tone={notice.tone}
      title={notice.title}
      className={className}
      action={
        onClose ? (
          <button type="button" onClick={onClose} aria-label="Fermer le message" className="btn btn-ghost btn-icon btn-sm -mr-1">
            <X size={16} aria-hidden />
          </button>
        ) : undefined
      }
    >
      {notice.text}
    </Callout>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

/**
 * Charge une ressource du projet uniquement quand `key` change (ex. empreintes des sources) :
 * évite de recalculer la structure lue à chaque évènement du Studio.
 */
export function useKeyedData<T>(url: string | null, key: string): { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> } {
  const { id } = useProject();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await projectCall<T>(id, "GET", url);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [id, url]);
  useEffect(() => {
    void reload();
  }, [reload, key]);
  return { data, error, loading, reload };
}

export interface ActionNotice {
  tone: Tone;
  title?: ReactNode;
  text: ReactNode;
}

/** Exécute une opération d'API : un seul envoi à la fois, message de réussite ou erreur lisible de l'API. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const run = useCallback(async <T,>(id: string, fn: () => Promise<T>, done?: (r: T) => ActionNotice | string | null): Promise<T | undefined> => {
    setBusy(id);
    setNotice(null);
    try {
      const r = await fn();
      const m = done?.(r) ?? null;
      if (m) setNotice(typeof m === "string" ? { tone: "ok", text: m } : m);
      return r;
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, notice, setNotice, run };
}
