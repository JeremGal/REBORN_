"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, CircleAlert, CircleCheck, CircleDashed, CircleX, ClipboardCheck, Copy, FlaskConical, Info, LoaderCircle, RefreshCw, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { useProject } from "./ProjectProvider";

/*
 * Socle commun des étapes « Reconstruction » et « Livraison » : types des réponses d'API
 * (sous-ensembles de src/lib/migration/*), libellés français, petits composants et hook d'action.
 * Aucun chiffre n'est produit ici : tout ce qui est affiché provient des réponses d'API.
 */

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

/* ------------------------------------------------------------------ */
/* Types des réponses d'API                                             */
/* ------------------------------------------------------------------ */

/** Exécution de migration (GET /api/migration → runs[]). */
export interface RunMeta {
  id: string;
  at: string;
  by: string;
  mapping_version: number;
  status: "completed" | "failed";
  error?: string;
  verification: "validated" | "review" | "blocked" | null;
  summary: { imported: number; rejected: number; source_rows: number; attachments: number; duration_ms: number };
}

/** Mise en service (GET /api/migration → deployments[]). */
export interface Deployment {
  id: string;
  at: string;
  by: string;
  run_id: string;
  app_dir: string;
  backup: string | null;
  status: "active" | "replaced" | "rolled_back";
}

/** GET /api/migration/app (lib/migration/generate.ts : appStatus). */
export interface AppStatus {
  deployment: Deployment | null;
  app_id: string | null;
  port: number;
  url: string;
  running: boolean;
  managed: boolean;
  pid: number | null;
  rules_version: number | null;
  port_used_by_other: boolean;
  credentials_file: string | null;
  start_command: string | null;
}

/** GET /api/migration (vue d'ensemble du projet). */
export interface MigrationOverview {
  project: { id: string; name: string; source_system: string | null };
  mapping: { version: number; origin: string; received_at: string; target: { id: string; name: string } } | null;
  runs: RunMeta[];
  acknowledgements: Record<string, { at: string; by: string; comment?: string }>;
  deployments: Deployment[];
  app: AppStatus;
}

export interface ReportCheck {
  id: string;
  group: string;
  label: string;
  status: "pass" | "fail" | "warn" | "info";
  blocking: boolean;
  summary: string;
}

/** Rapport de vérification (lib/migration/verify.ts : VerificationReport). */
export interface VerificationReport {
  run_id: string;
  verified_at: string;
  status: "validated" | "review" | "blocked";
  statement: string;
  checks: ReportCheck[];
  gaps: { kind: string; message: string; count: number }[];
}

/** GET /api/migration/runs/[id]. */
export interface RunDetail {
  meta: RunMeta;
  acknowledged: { at: string; by: string; comment?: string } | null;
  report: VerificationReport | null;
  reconciliation: VerificationReport | null;
}

/** Vérification d'une version du modèle métier sur l'historique migré (lib/migration/rules-history.ts). */
export interface HistoryCheck {
  version: number;
  run_id: string;
  at: string;
  bindings: {
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
  }[];
  statement: string;
}

export interface ModelIssue {
  level: "error" | "warning";
  path: string;
  message: string;
}

/** GET /api/migration/business-model → versions[] (lib/migration/project.ts : BusinessModelMeta). */
export interface BusinessModelMeta {
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
  issues: ModelIssue[];
  history_check?: HistoryCheck | null;
  published?: { app_id: string; at: string; by: string }[];
}

/** GET /api/migration/business-model?version=N (lib/engine/bindings.ts : RulePackage). */
export interface RulePackageContent {
  contract_version?: string;
  version: number;
  modules: Record<
    string,
    {
      module: string;
      application?: string;
      notes?: string;
      rules?: { id: string; type: string; description?: string; stage?: string; confidence?: number; validation_status?: string }[];
      inputs?: { name: string; label?: string; type: string }[];
      outputs?: { name: string; label?: string; format?: string }[];
    }
  >;
  bindings: {
    id: string;
    module: string;
    scope: "line" | "document";
    entity: string;
    document?: { entity: string; via: string };
    lines?: { entity: string; via: string };
    inputs: Record<string, unknown>;
    outputs: Record<string, string>;
    fields?: { name: string; label: string; type: string }[];
    note?: string;
  }[];
  source?: string;
  published_at?: string;
  published_by?: string;
  notes?: string;
}

/** Provenance d'un élément de la spécification (lib/migration/application-spec.ts). */
export interface SpecProvenance {
  status: "observed" | "deduced" | "validated";
  observed?: boolean;
  source?: string;
  basis?: string;
  confidence?: number;
  by?: string;
  at?: string;
}

export interface SpecField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  unique: boolean;
  options?: { value: string; label?: string }[];
  references?: string;
  accounting: boolean;
  computed_by_rules?: boolean;
  provenance?: SpecProvenance;
}

export interface SpecEntity {
  name: string;
  label: string;
  label_singular: string;
  title_field: string | null;
  fields: SpecField[];
  list_fields: string[];
  search_fields: string[];
  children: { entity: string; via: string; label: string }[];
  computed: { field: string; expr: string }[];
  aggregates: { field: string; children: string; via: string; expr: string }[];
  classification?: { kind: "financial" | "commercial" | "line" | "master" | "other"; confidence: number; parent?: string; note?: string };
  line_of?: { entity: string; via: string };
  provenance?: SpecProvenance;
}

/** GET /api/migration/spec : aperçu de l'ApplicationSpec (app.json du logiciel livré). */
export interface AppSpecPreview {
  spec_version: string;
  app: {
    id: string;
    name: string;
    tagline: string;
    currency: string;
    locale: string;
    generated_at: string;
    generator: string;
    source_system?: string;
    migration_run: string;
    port: number;
    company?: string;
    branding?: { name: string; primary_color: string; logo_text: string };
  };
  entities: SpecEntity[];
  navigation: { entity: string }[];
  dashboard: { cards: { label: string; entity: string; kind: "count" | "sum"; field?: string }[]; breakdowns: { label: string; entity: string; field: string }[] };
  ddl: string[];
  screens?: { id: string; kind: "dashboard" | "list" | "detail" | "form" | "admin"; entity?: string; fields?: string[]; note?: string }[];
  actions?: { entity: string; action: "create" | "update" | "delete" | "export" | "attach" | "reprice"; available: boolean; note?: string }[];
  rules?: {
    versions: { version: number; source?: string; modules: string[]; history_check?: string | null }[];
    bindings: { id: string; entity: string; scope: "line" | "document"; module: string; outputs: string[] }[];
  };
  workflows?: Record<string, unknown>[];
  not_rebuilt?: { kind: "table" | "field" | "entity" | "workflow" | "rule" | "attachment"; name: string; reason: string }[];
  provenance?: { mapping_version: number; mapping_origin: string; migration_run: string; business_model_versions: number[]; statement: string };
}

/* ------------------------------------------------------------------ */
/* Libellés                                                             */
/* ------------------------------------------------------------------ */

export const VERDICT: Record<VerificationReport["status"], { label: string; tone: Tone }> = {
  validated: { label: "Migration validée", tone: "ok" },
  review: { label: "Validation humaine requise", tone: "warn" },
  blocked: { label: "Intervention requise", tone: "bad" },
};

export const BM_STATUS: Record<BusinessModelMeta["status"], { label: string; tone: Tone }> = {
  proposed: { label: "À valider", tone: "warn" },
  validated: { label: "Validée", tone: "ok" },
  rejected: { label: "Refusée", tone: "bad" },
};

/** Origine d'une version du modèle métier. Le jeu de test est toujours étiqueté comme tel. */
export const BM_SOURCE: Record<string, { label: string; test?: boolean }> = {
  analyst: { label: "Analyste" },
  fixture: { label: "Jeu de test — Relatio 2004", test: true },
  investigation: { label: "Règles de l'investigation" },
  user: { label: "Opérateur" },
};

export const DEPLOY_STATUS: Record<Deployment["status"], { label: string; tone: Tone }> = {
  active: { label: "En service", tone: "ok" },
  replaced: { label: "Remplacée", tone: "idle" },
  rolled_back: { label: "Annulée (retour arrière)", tone: "warn" },
};

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

export const fmtInt = (x: number) => x.toLocaleString("fr-FR");

/** Accord à la française (0 et 1 au singulier). */
export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n > 1 ? many : one}`;

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Message d'API terminé par une ponctuation (pour l'enchaîner avec un lien ou une phrase). */
export function sentence(s: string): string {
  const t = s.trim();
  return /[.!?…»)]$/.test(t) ? t : `${t}.`;
}

/** Montant stocké en centimes (convention de la base migrée). */
export function fmtMoney(cents: number, currency = "EUR"): string {
  try {
    return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency });
  } catch {
    return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

/* ------------------------------------------------------------------ */
/* Préparation de la mise en service (faits renvoyés par l'API)          */
/* ------------------------------------------------------------------ */

export interface Readiness {
  /** Dernière exécution terminée : c'est sa base que la génération installerait. */
  run: RunMeta | null;
  /** Exécution plus récente, non terminée (échec), si elle existe. */
  newerFailed: RunMeta | null;
  ok: boolean;
  tone: Tone;
  title: string;
  detail: string;
  /** Étape où agir si la mise en service est impossible. */
  step: "migration" | "validation" | null;
}

export function deployReadiness(o: MigrationOverview): Readiness {
  const run = [...o.runs].reverse().find((r) => r.status === "completed") ?? null;
  const last = o.runs.at(-1) ?? null;
  const newerFailed = last && last.id !== run?.id ? last : null;
  if (!run)
    return {
      run,
      newerFailed,
      ok: false,
      tone: "bad",
      title: "Aucune migration terminée",
      detail: "La génération installe la base migrée : exécutez d'abord la migration.",
      step: "migration",
    };
  const counts = `${plural(run.summary.imported, "enregistrement importé", "enregistrements importés")} · ${plural(run.summary.rejected, "ligne rejetée", "lignes rejetées")}`;
  const ack = o.acknowledgements[run.id];
  if (run.verification === "validated")
    return { run, newerFailed, ok: true, tone: "ok", title: `Migration ${run.id} vérifiée : migration validée`, detail: `${counts}. Contrôles et écarts détaillés à l'étape Validation.`, step: null };
  if (run.verification === "review" && ack)
    return {
      run,
      newerFailed,
      ok: true,
      tone: "ok",
      title: `Migration ${run.id} : écarts examinés et acceptés`,
      detail: `${counts}. Écarts acceptés par ${ack.by} le ${fmtDate(ack.at)}${ack.comment ? ` — « ${ack.comment} »` : ""}.`,
      step: null,
    };
  if (run.verification === "review")
    return { run, newerFailed, ok: false, tone: "warn", title: `Migration ${run.id} : écarts à examiner`, detail: `${counts}. Un responsable doit examiner et accepter les écarts documentés avant toute mise en service.`, step: "validation" };
  if (run.verification === "blocked")
    return { run, newerFailed, ok: false, tone: "bad", title: `Migration ${run.id} : intervention requise`, detail: `${counts}. Au moins un contrôle bloquant a échoué : la mise en service est refusée.`, step: "validation" };
  return { run, newerFailed, ok: false, tone: "bad", title: `Migration ${run.id} sans rapport de vérification`, detail: "La mise en service exige un rapport de vérification de la migration.", step: "validation" };
}

/* ------------------------------------------------------------------ */
/* Composants                                                           */
/* ------------------------------------------------------------------ */

const TONE_TAG: Record<Tone, string> = {
  ok: "bg-verdigris-soft text-[#0b6b5f]",
  warn: "bg-ochre-soft text-ochre",
  bad: "bg-rust-soft text-rust",
  info: "bg-[#e7eef8] text-[#2457a6]",
  idle: "bg-chalk-2 text-sediment",
};

/** Étiquette courte (état, origine, nature). */
export function Pill({ tone = "idle", icon, children, title, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1 rounded-xs px-1.5 text-[11px] leading-[18px] font-bold", TONE_TAG[tone], className)}>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Étiquette obligatoire de tout ce qui vient d'un jeu de test (jamais présenté comme un envoi réel). */
export function TestBadge({ label = "Jeu de test" }: { label?: string }) {
  return (
    <Pill tone="warn" icon={<FlaskConical size={11} aria-hidden />} title="Données de test écrites à la main au format des agents : elles ne proviennent d'aucun agent">
      {label}
    </Pill>
  );
}

const NOTICE: Record<Tone, { box: string; text: string; icon: LucideIcon }> = {
  ok: { box: "bg-verdigris-soft", text: "text-[#0b6b5f]", icon: CircleCheck },
  warn: { box: "bg-ochre-soft", text: "text-ochre", icon: TriangleAlert },
  bad: { box: "bg-rust-soft", text: "text-rust", icon: CircleAlert },
  info: { box: "bg-[#e7eef8]", text: "text-[#2457a6]", icon: Info },
  idle: { box: "bg-chalk", text: "text-ink", icon: Info },
};

export interface NoticeState {
  tone: Tone;
  text: ReactNode;
}

/** Résultat d'une opération (message renvoyé par l'API en cas d'erreur). */
export function Notice({ tone, children, onClose, className }: { tone: Tone; children: ReactNode; onClose?: () => void; className?: string }) {
  const s = NOTICE[tone];
  const Icon = s.icon;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex items-start gap-2 rounded-sm px-3 py-2 text-[12.5px] leading-relaxed", s.box, className)}>
      <Icon size={14} className={cx("mt-[3px] shrink-0", s.text)} aria-hidden />
      <div className="min-w-0 flex-1 break-words text-ink/85">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fermer le message" className={cx("-mr-1 shrink-0 rounded-xs p-1 opacity-70 hover:opacity-100", s.text)}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** Ligne d'une liste de prérequis, avec son état. */
export function CheckRow({ tone, title, children, action }: { tone: Tone; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "ok" ? Check : tone === "warn" ? TriangleAlert : tone === "bad" ? CircleX : tone === "info" ? Info : CircleDashed;
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <span
        aria-hidden
        className={cx(
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-full",
          tone === "ok" && "bg-verdigris text-white",
          tone === "warn" && "bg-ochre-soft text-ochre",
          tone === "bad" && "bg-rust-soft text-rust",
          tone === "info" && "bg-[#e7eef8] text-[#2457a6]",
          tone === "idle" && "bg-chalk-2 text-silt",
        )}
      >
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug font-bold break-words">{title}</div>
        {children && <div className="mt-0.5 text-[12px] leading-relaxed break-words text-sediment">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

/** Paire libellé / valeur (à placer dans un <dl>). */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-[11.5px] text-silt">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] break-words text-ink">{children}</dd>
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-[13px] text-silt">
      <LoaderCircle size={14} className="animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Spinner({ size = 13 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin" aria-hidden />;
}

/** Erreur de chargement : message renvoyé par l'API et nouvelle tentative (vraie relecture). */
export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string | null; onRetry?: () => Promise<void> | void; title?: string }) {
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-sm bg-rust-soft px-3.5 py-3 text-[12.5px]">
      <div className="min-w-0">
        <div className="font-bold text-rust">{title}</div>
        <div className="mt-0.5 break-words text-ink/80">{message ?? "Réponse vide de l'API."}</div>
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={() => void onRetry()}>
          <RefreshCw size={12} aria-hidden /> Réessayer
        </Button>
      )}
    </div>
  );
}

/** Lien vers une autre étape du projet. */
export function StepLink({ step, children, className }: { step: string; children: ReactNode; className?: string }) {
  const { id } = useProject();
  return (
    <Link href={`/projets/${id}/${step}`} className={cx("font-bold text-ink underline decoration-line-strong underline-offset-2 hover:text-verdigris", className)}>
      {children}
    </Link>
  );
}

/** Commande à exécuter dans un terminal, avec copie dans le presse-papiers (jamais un secret). */
export function Command({ value }: { value: string }) {
  const [copied, setCopied] = useState<"ok" | "ko" | null>(null);
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-sm bg-ink text-white">
      <code className="min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-[12px] leading-5 whitespace-pre">{value}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied("ok");
          } catch {
            setCopied("ko");
          }
        }}
        onBlur={() => setCopied(null)}
        className="flex shrink-0 items-center gap-1 border-l border-white/15 px-2.5 text-[11.5px] font-bold text-white/80 hover:bg-white/10 hover:text-white"
        aria-label={copied === "ok" ? "Commande copiée" : "Copier la commande"}
      >
        {copied === "ok" ? <ClipboardCheck size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        <span className="hidden sm:inline">{copied === "ok" ? "Copiée" : copied === "ko" ? "Copie impossible" : "Copier"}</span>
      </button>
    </div>
  );
}

/** Bouton dont le libellé peut passer à la ligne sur petit écran. */
export const WRAP_BTN = "h-auto! min-h-9 whitespace-normal! py-1.5 text-left";
export const WRAP_BTN_SM = "h-auto! min-h-7 whitespace-normal! py-1 text-left";
/** Le variant « danger » de ui.tsx n'a pas d'état désactivé visible. */
export const DANGER_DISABLED = "disabled:text-dust disabled:hover:bg-paper";

/* ------------------------------------------------------------------ */
/* Hook d'action : occupation, message de résultat ou d'erreur            */
/* ------------------------------------------------------------------ */

export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  async function run<T>(key: string, fn: () => Promise<T>, done?: (r: T) => NoticeState | null): Promise<T | undefined> {
    setBusy(key);
    setNotice(null);
    try {
      const r = await fn();
      const n = done ? done(r) : null;
      if (n) setNotice(n);
      return r;
    } catch (e) {
      setNotice({ tone: "bad", text: (e as Error).message });
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, notice, setNotice, run };
}
