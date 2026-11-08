"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ClipboardCheck, Copy, LoaderCircle, X } from "lucide-react";
import { Badge, ErrorState, StatusBadge, cx, formatDateTime, formatDay, formatInt } from "@/components/ds";
import { Callout } from "./Step";
import { useProject } from "./ProjectProvider";

/*
 * Socle commun des étapes « Reconstruction » et « Livraison » : types des réponses d'API
 * (sous-ensembles de src/lib/migration/*), libellés français, formats, hook d'action et
 * quelques éléments propres à ces étapes. Les blocs de mise en page viennent de ./Step,
 * les composants du design system (components/ds).
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
  metrics?: Record<string, number | string>;
}

/** Rapport de vérification (lib/migration/verify.ts : VerificationReport). */
export interface VerificationReport {
  run_id: string;
  verified_at: string;
  status: "validated" | "review" | "blocked";
  statement: string;
  checks: ReportCheck[];
  gaps: { kind: string; message: string; count: number; entity?: string; source?: string }[];
  entities?: { entity: string; label?: string; source_rows: number; target_rows: number; rejected: number; exact: number; mismatched: number; totals: { field: string; accounting: boolean; source_cents: number; target_cents: number; rejected_cents: number }[] }[];
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
  form_fields?: string[];
  technical_fields?: string[];
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
  views?: { entity: string; kind: "planning"; name: string; label: string; start: string; end: string; resource: string; title: string; status?: string }[];
  ddl: string[];
  screens?: { id: string; kind: "dashboard" | "list" | "detail" | "form" | "admin" | "planning"; entity?: string; fields?: string[]; note?: string }[];
  actions?: { entity: string; action: "create" | "update" | "delete" | "export" | "attach" | "reprice"; available: boolean; note?: string }[];
  rules?: {
    versions: { version: number; source?: string; modules: string[]; history_check?: string | null }[];
    bindings: { id: string; entity: string; scope: "line" | "document"; module: string; outputs: string[] }[];
  };
  workflows?: Record<string, unknown>[];
  not_rebuilt?: { kind: "table" | "field" | "entity" | "workflow" | "rule" | "attachment" | "view"; name: string; reason: string }[];
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
  user: { label: "Saisie manuelle" },
};

export const DEPLOY_STATUS: Record<Deployment["status"], { label: string; tone: Tone }> = {
  active: { label: "En service", tone: "ok" },
  replaced: { label: "Remplacée", tone: "idle" },
  rolled_back: { label: "Annulée (retour arrière)", tone: "warn" },
};

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

/** Entier au format français, séparateur de milliers lisible (formatInt du design system). */
export const fmtInt = (x: number) => formatInt(x);

/** Accord à la française (0 et 1 au singulier). */
export const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n > 1 ? many : one}`;

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:09 »). */
export function fmtDate(iso: string | null | undefined): string {
  return toDate(iso) ? formatDateTime(iso) : (iso ?? "—");
}

/** Date seule, même format (« 8 nov. 2026 »). */
export function fmtDay(iso: string | null | undefined): string {
  return toDate(iso) ? formatDay(iso) : (iso ?? "—");
}

/** Date dans une phrase (« mis en service le 8 nov. 2026 ») : même format que partout ailleurs. */
export function fmtLongDay(iso: string | null | undefined): string {
  return fmtDay(iso);
}

/** Heure seule (hh:mm). */
export function fmtTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
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

/** Adresse sans protocole (127.0.0.1:5050). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
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
    return { run, newerFailed, ok: false, tone: "bad", title: "Aucune migration terminée", detail: "La génération installe la base migrée : exécutez d'abord la migration.", step: "migration" };
  const counts = `${plural(run.summary.imported, "fiche transférée", "fiches transférées")} · ${plural(run.summary.rejected, "ligne rejetée", "lignes rejetées")}`;
  const ack = o.acknowledgements[run.id];
  if (run.verification === "validated") return { run, newerFailed, ok: true, tone: "ok", title: `Migration ${run.id} vérifiée : aucun écart sur ce qui a été contrôlé`, detail: `${counts}. Contrôles détaillés à l'étape Validation.`, step: null };
  if (run.verification === "review" && ack)
    return { run, newerFailed, ok: true, tone: "ok", title: `Migration ${run.id} : écarts examinés et acceptés`, detail: `${counts}. Écarts acceptés par ${ack.by} le ${fmtDate(ack.at)}${ack.comment ? ` — « ${ack.comment} »` : ""}.`, step: null };
  if (run.verification === "review")
    return { run, newerFailed, ok: false, tone: "warn", title: `Migration ${run.id} : écarts à examiner`, detail: `${counts}. Un responsable doit examiner et accepter les écarts documentés avant toute mise en service.`, step: "validation" };
  if (run.verification === "blocked")
    return { run, newerFailed, ok: false, tone: "bad", title: `Migration ${run.id} : intervention requise`, detail: `${counts}. Au moins un contrôle bloquant a échoué : la mise en service est refusée.`, step: "validation" };
  return { run, newerFailed, ok: false, tone: "bad", title: `Migration ${run.id} sans rapport de vérification`, detail: "La mise en service exige un rapport de vérification de la migration.", step: "validation" };
}

/* ------------------------------------------------------------------ */
/* Compte connecté (rôle : actions réservées à l'équipe REBORN)          */
/* ------------------------------------------------------------------ */

export interface Viewer {
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  role: "client" | "operator";
}
let viewerCache: Promise<Viewer | null> | null = null;
/** Compte connecté (GET /api/me), lu une fois par chargement de page ; null si indisponible. */
export function useViewer(): Viewer | null {
  const [v, setV] = useState<Viewer | null>(null);
  useEffect(() => {
    viewerCache ??= fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { user?: Viewer } | null) => d?.user ?? null)
      .catch(() => null);
    let live = true;
    void viewerCache.then((x) => {
      if (live) setV(x);
      if (!x) viewerCache = null;
    });
    return () => {
      live = false;
    };
  }, []);
  return v;
}

/* ------------------------------------------------------------------ */
/* Éléments propres à ces étapes                                        */
/* ------------------------------------------------------------------ */

const DS_TONE = { ok: "ok", warn: "warn", bad: "bad", info: "info", idle: "neutral" } as const;

/** Étiquette d'état (À valider, Validée, En service…) : icône et texte. `plain` : étiquette sans icône. */
export function Tag({ tone = "idle", icon, children, title, className, plain }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string; className?: string; plain?: boolean }) {
  if (plain || icon)
    return (
      <Badge tone={DS_TONE[tone]} icon={icon} title={title} className={cx("max-w-full", className)}>
        <span className="min-w-0 truncate">{children}</span>
      </Badge>
    );
  return (
    <StatusBadge tone={DS_TONE[tone]} title={title} className={cx("max-w-full", className)}>
      <span className="min-w-0 truncate">{children}</span>
    </StatusBadge>
  );
}

/** Ton d'un <Callout> pour un ton d'état. */
export const calloutTone = (t: Tone): "info" | "ok" | "warn" | "bad" => (t === "idle" ? "info" : t);

export interface NoticeState {
  tone: Tone;
  title?: ReactNode;
  text?: ReactNode;
}

/** Résultat d'une opération (message renvoyé par l'API en cas d'erreur), refermable. */
export function ActionNotice({ notice, onClose, className }: { notice: NoticeState; onClose?: () => void; className?: string }) {
  return (
    <div role={notice.tone === "bad" ? undefined : "status"} className={className}>
      <Callout
        tone={calloutTone(notice.tone)}
        title={notice.title}
        action={
          onClose && (
            <button type="button" onClick={onClose} aria-label="Fermer le message" className="btn btn-ghost btn-icon btn-sm">
              <X size={16} aria-hidden />
            </button>
          )
        }
      >
        {notice.text && <span className="break-words">{notice.text}</span>}
      </Callout>
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-4 text-body text-text-3">
      <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />
      {label}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin motion-reduce:animate-none" aria-hidden />;
}

/** Erreur de chargement : message renvoyé par l'API et nouvelle tentative (vraie relecture). */
export function LoadError({ message, onRetry, title = "Chargement impossible" }: { message: string | null; onRetry?: () => Promise<void> | void; title?: string }) {
  return <ErrorState title={title} message={message ?? "Le Studio n'a renvoyé aucune donnée."} onRetry={onRetry} />;
}

/** Lien vers une autre étape du projet. */
export function StepLink({ step, children, className }: { step: string; children: ReactNode; className?: string }) {
  const { id } = useProject();
  return (
    <Link href={`/projets/${id}/${step}`} className={cx("ds-link font-semibold", className)}>
      {children}
    </Link>
  );
}

/** Texte à copier (commande, lien) avec confirmation de copie ; jamais un secret journalisé. */
export function CopyField({ value, label, mono = true, prefix }: { value: string; label: string; mono?: boolean; prefix?: string }) {
  const [copied, setCopied] = useState<"ok" | "ko" | null>(null);
  const id = useId();
  return (
    <div className="flex min-w-0 items-stretch overflow-hidden rounded-control bg-ink text-white" data-surface="dark">
      <code id={id} className={cx("min-w-0 flex-1 px-3.5 py-2.5 text-small leading-5 break-all whitespace-pre-wrap", mono && "font-mono")}>
        {prefix && (
          <span aria-hidden className="mr-2 text-white/50 select-none">
            {prefix}
          </span>
        )}
        {value}
      </code>
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
        className="flex min-h-11 shrink-0 items-center gap-1.5 border-l border-white/20 px-3.5 text-small font-semibold text-white transition-colors duration-(--duration-fast) hover:bg-white/10"
        aria-describedby={id}
        aria-label={copied === "ok" ? `${label} : copié` : `Copier ${label.toLowerCase()}`}
      >
        {copied === "ok" ? <ClipboardCheck size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        <span>{copied === "ok" ? "Copié" : copied === "ko" ? "Copie impossible" : "Copier"}</span>
      </button>
      <span role="status" className="sr-only">
        {/* Tournure neutre : « Le lien d'activation », « La commande »… sans accord fautif (« La commande copié ») */}
        {copied === "ok" ? `Copie faite : ${label.charAt(0).toLowerCase()}${label.slice(1)} est dans le presse-papiers.` : copied === "ko" ? "Copie impossible : sélectionnez le texte pour le copier." : ""}
      </span>
    </div>
  );
}

/** Commande à exécuter dans un terminal, avec copie dans le presse-papiers (jamais un secret). */
export function Command({ value }: { value: string }) {
  return <CopyField value={value} label="La commande" prefix="$" />;
}

/** Routes d'API (section « Intégration technique »). */
export function ApiRoutes({ routes }: { routes: { method: "GET" | "POST"; path: string; label: string }[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
      {routes.map((r) => (
        <li key={`${r.method} ${r.path} ${r.label}`} className="flex flex-col gap-0.5 px-3.5 py-2.5 md:flex-row md:items-baseline md:gap-4">
          <code className="min-w-0 font-mono text-small break-all text-ink md:w-[360px] md:shrink-0">
            <span className="mr-1.5 font-semibold text-accent-ink">{r.method}</span>
            {r.path}
          </code>
          <span className="text-small leading-snug text-text-2">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Sous-titre à l'intérieur d'une section. */
export function SubHeading({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <h3 className="text-body font-semibold text-ink">{children}</h3>
      {aside && <div className="text-small text-text-3">{aside}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hook d'action : occupation, message de résultat ou d'erreur            */
/* ------------------------------------------------------------------ */

/** Une nouvelle opération remplace les messages de réussite précédents de la page (erreurs et alertes restent). */
const SUPERSEDE = "reborn:app-action";

export function announceAction(source: string) {
  window.dispatchEvent(new CustomEvent(SUPERSEDE, { detail: source }));
}

export function useSupersededNotice(source: string, setNotice: (f: (n: NoticeState | null) => NoticeState | null) => void) {
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== source) setNotice((n) => (n && (n.tone === "ok" || n.tone === "info") ? null : n));
    };
    window.addEventListener(SUPERSEDE, h);
    return () => window.removeEventListener(SUPERSEDE, h);
  }, [source, setNotice]);
}

export function useAction() {
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  /** Clé de la dernière opération : son message s'affiche à côté du bouton qui l'a lancée. */
  const [last, setLast] = useState<string | null>(null);
  useSupersededNotice(id, setNotice);
  async function run<T>(key: string, fn: () => Promise<T>, done?: (r: T) => NoticeState | null): Promise<T | undefined> {
    announceAction(id);
    setBusy(key);
    setLast(key);
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
  return { busy, notice, setNotice, last, run };
}

