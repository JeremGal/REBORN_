"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, CircleX, FlaskConical, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cx } from "@/components/ui";
import { projectCall, useProject } from "./ProjectProvider";

/*
 * Socle commun des étapes « Données » et « Correspondances » : types des réponses d'API
 * (sous-ensembles de src/lib/migration/*), libellés français, petits composants et hooks.
 * Aucun chiffre n'est produit ici : tout ce qui est affiché provient des réponses d'API.
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
export const TEST_LABEL = `Jeu de test — ${TEST_SYSTEM}`;

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
    hint: `Correspondances de test écrites pour le logiciel de test ${TEST_SYSTEM}, au format que l'Analyste enverra. Ce n'est pas un envoi de l'Analyste.`,
    test: true,
  },
  auto: { label: "Proposition automatique", hint: "Déduite uniquement de la structure lue (types, clés, relations) : aucune connaissance du logiciel source.", test: false },
  user: { label: "Saisie opérateur", hint: "Correspondances fournies à la main par un opérateur.", test: false },
};

const TRANSFORM_WORD: Record<string, string> = {
  trim: "espaces de début et de fin retirés",
  lower: "en minuscules",
  upper: "en majuscules",
  collapse_spaces: "espaces multiples réduits",
  digits: "chiffres uniquement",
};
const SEP: Record<string, string> = { comma: "virgule décimale", dot: "point décimal", auto: "séparateur détecté" };

/** Libellé lisible d'une transformation déclarée dans le contrat. */
export function transformLabel(t: Transform): { label: string; title?: string } {
  if (typeof t === "string") return { label: TRANSFORM_WORD[t] ?? t };
  if ("date" in t) return { label: t.date === "excel" ? "date Excel (numéro de série)" : `date ${READ_FORMAT[t.date] ?? t.date}` };
  if ("decimal" in t) return { label: `décimal, ${SEP[t.decimal] ?? t.decimal}` };
  if ("money" in t) return { label: `montant, ${SEP[t.money] ?? t.money}` };
  if ("boolean" in t) return { label: `oui = ${t.boolean.true.join(" / ") || "—"} · non = ${t.boolean.false.join(" / ") || "—"}` };
  if ("map" in t) {
    const pairs = Object.entries(t.map).map(([k, v]) => `${k} → ${v}`);
    return { label: `codes : ${pairs.slice(0, 3).join(", ")}${pairs.length > 3 ? ` (+${pairs.length - 3})` : ""}`, title: pairs.join("\n") };
  }
  if ("null_if" in t) return { label: `vide si ${t.null_if.map((v) => `« ${v} »`).join(", ")}` };
  return { label: JSON.stringify(t) };
}

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

export const nf = (x: number) => x.toLocaleString("fr-FR");
/** Pluriel français : 0 et 1 au singulier. */
export const plural = (count: number, one: string, many = `${one}s`) => `${nf(count)} ${count > 1 ? many : one}`;
export const bytes = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : b >= 1024 ? `${Math.round(b / 1024).toLocaleString("fr-FR")} Ko` : `${nf(b)} o`;
export const dt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const shortHash = (h: string | undefined, len = 12) => (h ? `${h.slice(0, len)}…` : "—");
/** Pourcentage arrondi (sans jamais arrondir à 100 % une valeur qui ne l'est pas). */
export const percent = (v: number) => {
  const p = Math.round(v * 1000) / 10;
  const shown = p >= 100 && v < 1 ? 99.9 : p;
  return `${shown.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
};

/* ------------------------------------------------------------------ */
/* Composants                                                           */
/* ------------------------------------------------------------------ */

/** Étiquette obligatoire de tout ce qui provient d'un jeu de test. */
export function TestBadge({ children = TEST_LABEL, className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex max-w-full items-start gap-1 rounded-xs bg-ochre-soft px-1.5 py-0.5 text-[11px] leading-4 font-bold text-ochre", className)}>
      <FlaskConical size={11} className="mt-[2.5px] shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** Libellé long d'un bouton : peut passer à la ligne sur mobile au lieu de déborder. */
export const WRAP_BTN = "h-auto! min-h-7 whitespace-normal! py-1 text-left";

export type Tone = "ok" | "bad" | "warn" | "info";

export function Notice({ tone = "info", title, children, onClose, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; onClose?: () => void; className?: string }) {
  const Icon = tone === "ok" ? CircleCheck : tone === "bad" ? CircleX : tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px] leading-relaxed",
        tone === "ok" && "bg-verdigris-soft text-[#0b6b5f]",
        tone === "bad" && "bg-rust-soft text-rust",
        tone === "warn" && "bg-ochre-soft text-ochre",
        tone === "info" && "bg-chalk text-sediment",
        className,
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 break-words">
        {title && <div className="font-bold">{title}</div>}
        {children}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fermer le message" className="-mr-1 shrink-0 rounded-xs p-0.5 opacity-70 hover:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cx("shrink-0 animate-spin", className)} aria-hidden />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-silt" role="status">
      <Spinner /> {label}
    </div>
  );
}

/** Erreur de chargement : message renvoyé par l'API + nouvel essai (vrai GET). */
export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="bad" title={title}>
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-1 font-bold underline underline-offset-2 hover:no-underline">
          Réessayer
        </button>
      )}
    </Notice>
  );
}

export function StepHeader({ step, title, children, aside }: { step: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-[780px]">
        <div className="eyebrow">{step}</div>
        <h2 className="mt-0.5 text-[20px] leading-tight font-black tracking-[-0.02em]">{title}</h2>
        {children && <p className="mt-1 text-[13px] text-sediment">{children}</p>}
      </div>
      {aside}
    </header>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-silt">{label}</dt>
      <dd className={cx("tabular text-[19px] leading-tight font-black", tone === "ok" ? "text-verdigris" : tone === "warn" ? "text-ochre" : tone === "bad" ? "text-rust" : "text-ink")}>{value}</dd>
      {hint && <dd className="text-[11px] leading-tight text-silt">{hint}</dd>}
    </div>
  );
}

/** Pastille compacte (méta-information). */
export function Chip({ children, tone, title, className }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "ref" | "lock"; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-xs px-1.5 py-px text-[11px] leading-[18px] font-bold",
        !tone && "bg-chalk-2 text-sediment",
        tone === "ok" && "bg-verdigris-soft text-[#0b6b5f]",
        tone === "warn" && "bg-ochre-soft text-ochre",
        tone === "bad" && "bg-rust-soft text-rust",
        tone === "ref" && "bg-[#e7eef8] text-[#2457a6]",
        tone === "lock" && "bg-ink text-white",
        className,
      )}
    >
      {children}
    </span>
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
