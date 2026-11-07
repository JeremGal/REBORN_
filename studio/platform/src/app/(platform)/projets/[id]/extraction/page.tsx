"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleX,
  Database,
  FileArchive,
  FileBraces,
  FileCode,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Plug,
  SearchX,
  Trash,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button, ButtonLink, Confidence, Empty, Panel, cx, inputCls } from "@/components/ui";
import { useProject, useProjectData, type ProjectDetails } from "@/components/project/ProjectProvider";
import { STEPS } from "@/components/project/ProjectShell";
import { DataUpload } from "@/components/project/DataUpload";
import {
  bytes,
  Chip,
  dt,
  FORMAT_LABEL,
  Kpi,
  LoadError,
  Loading,
  nf,
  Notice,
  percent,
  plural,
  READ_FORMAT,
  READ_TYPE,
  shortHash,
  Spinner,
  StepHeader,
  TEST_SYSTEM,
  TestBadge,
  UPLOAD_BY,
  useAction,
  useKeyedData,
  legacyTables,
  type ColumnProfile,
  type ExtractionSummary,
  type ManifestExport,
  type MechanismResult,
  type SourceMeta,
  type SourceProfile,
  type TableProfile,
} from "@/components/project/DataKit";

/*
 * Étape « Données » : ce qui a réellement été récupéré de l'ancien logiciel.
 * - GET /api/migration/sources : sources du coffre (empreintes, tables, avertissements) ; DELETE ?id= : retrait.
 * - GET /api/migration (vue d'ensemble) : dernière extraction (résultat de chaque mécanisme).
 * - POST /api/migration/extract : extraction avec le plan de test Relatio 2004 (jeu de test) ou un plan fourni.
 * - POST /api/migration/sources : import manuel (composant DataUpload).
 * - GET /api/migration/profile : structure lue (tables, colonnes, clés, relations, anomalies).
 */

interface Overview {
  extraction: ExtractionSummary | null;
  mapping: { version: number; origin: string; received_at: string } | null;
}

const STEP_INDEX = STEPS.findIndex((s) => s.slug === "extraction");

export default function DonneesPage() {
  const { id, refresh } = useProject();
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const overview = useProjectData<Overview>("/api/migration");
  const list = sources.data;
  const fingerprint = useMemo(() => (list ?? []).map((s) => s.sha256).join(","), [list]);
  const profile = useKeyedData<SourceProfile>(list?.length ? "/api/migration/profile" : null, fingerprint);
  const totals = useMemo(() => {
    const l = list ?? [];
    return {
      files: l.length,
      tables: l.reduce((n, s) => n + s.tables.length, 0),
      rows: l.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows, 0), 0),
      attachments: l.reduce((n, s) => n + (s.archive_entries ?? 0), 0),
      warnings: l.reduce((n, s) => n + s.warnings.length, 0),
    };
  }, [list]);
  const reloadAll = () => {
    void sources.reload();
    void overview.reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step={`Étape ${STEP_INDEX + 1} · ${STEPS[STEP_INDEX].label}`}
        title="Données de l'ancien logiciel"
        aside={
          list && list.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-8">
              <Kpi label="Fichiers reçus" value={nf(totals.files)} />
              <Kpi label="Tables lues" value={nf(totals.tables)} />
              <Kpi label="Lignes lues" value={nf(totals.rows)} />
              {totals.attachments > 0 && <Kpi label="Pièces jointes" value={nf(totals.attachments)} hint="fichiers dans les archives" />}
            </dl>
          ) : undefined
        }
      >
        Exports récupérés par extraction autorisée ou déposés à la main. Chaque fichier est conservé tel quel dans le coffre du projet, avec son empreinte SHA-256 : la migration et la vérification relisent exactement ces fichiers.
      </StepHeader>

      <ExtractionPanel overview={overview} onDone={reloadAll} />

      <Panel eyebrow="Import manuel" title="Déposer des fichiers exportés">
        <DataUpload
          projectId={id}
          existing={list ?? []}
          onUploaded={() => {
            void sources.reload();
            void refresh();
          }}
        />
      </Panel>

      <Panel eyebrow="Coffre du projet" title={list ? `Sources reçues (${list.length})` : "Sources reçues"} actions={totals.warnings > 0 ? <Chip tone="warn">{plural(totals.warnings, "avertissement")} de lecture</Chip> : undefined}>
        {sources.loading && !list ? (
          <Loading label="Chargement des sources…" />
        ) : sources.error && !list ? (
          <LoadError message={sources.error} onRetry={() => void sources.reload()} />
        ) : !list?.length ? (
          <Empty title="Aucune source pour l'instant" hint="Lancez l'extraction automatique ou déposez des fichiers exportés : chacun apparaîtra ici avec son empreinte, ses tables et ses avertissements de lecture." />
        ) : (
          <>
            {sources.error && <p className="mb-2 text-[12px] text-rust">Actualisation impossible : {sources.error}</p>}
            <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              {list.map((s) => (
                <SourceRow
                  key={s.id}
                  s={s}
                  mechanism={overview.data?.extraction?.results.find((r) => r.id === s.origin.mechanism)?.label}
                  fromTest={fromTestPlan(s, overview.data?.extraction ?? null)}
                  manifest={overview.data?.extraction?.manifest?.exports.find((x) => x.file === s.name)}
                  mapping={overview.data?.mapping ?? null}
                  onRemoved={() => {
                    void sources.reload();
                    void overview.reload();
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </Panel>

      {!!list?.length && <StructurePanel profile={profile} legacy={legacyTables(list, overview.data?.extraction ?? null)} />}

      {!!list?.length && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="max-w-[640px] text-[13px] text-sediment">Étape suivante : établir comment chaque table et chaque colonne lues seront reprises dans le nouveau logiciel.</p>
          <ButtonLink href={`/projets/${id}/correspondances`} variant="primary">
            Correspondances <ArrowRight size={14} aria-hidden />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extraction automatique                                               */
/* ------------------------------------------------------------------ */

const CONNECTION_LABEL: Record<NonNullable<ProjectDetails["connection"]>["status"], string> = {
  pending: "en attente",
  connected: "établie",
  failed: "échec",
  mfa_required: "double authentification requise",
  human_needed: "intervention humaine requise",
};

/** Le connecteur rapporte tel quel l'échec réseau de Node (« fetch failed ») : on l'explique sans le masquer. */
function networkHint(text: string): string | null {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|délai dépassé/i.test(text) ? "Le logiciel source n'a pas répondu à cette adresse : serveur arrêté, adresse incorrecte ou réseau indisponible." : null;
}

function ExtractionPanel({ overview, onDone }: { overview: { data: Overview | null; error: string | null; loading: boolean; reload: () => Promise<void> }; onDone: () => void }) {
  const { id, summary, details, post } = useProject();
  const { busy, notice, setNotice, run } = useAction();
  const [plan, setPlan] = useState("");
  const creds = details?.credentials;
  const ex = overview.data?.extraction ?? null;
  const conn = details?.connection ?? null;

  const extract = (kind: "test" | "plan", body: { plan: unknown }) =>
    run(
      kind,
      () => post<{ ok: boolean; extraction: ExtractionSummary }>("/api/migration/extract", body),
      (r) => {
        onDone();
        const total = r.extraction.results.length;
        const ok = r.extraction.results.filter((x) => x.status === "ok").length;
        return {
          tone: ok === total ? "ok" : "warn",
          text: `Extraction terminée : ${ok}/${total} export(s) récupéré(s)${ok < total ? ` — ${total - ok} non récupéré(s), voir le détail de la dernière extraction` : ""}.`,
        };
      },
    );

  const hint = notice?.tone === "bad" && typeof notice.text === "string" ? networkHint(notice.text) : null;

  return (
    <Panel eyebrow="Extraction autorisée" title="Récupérer les exports de l'ancien logiciel">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-md px-3.5 py-3 shadow-[0_0_0_1px_var(--color-line-strong)]">
            <TestBadge>Jeu de test — plan d&apos;extraction au format de l&apos;Explorer</TestBadge>
            <p className="mt-2 text-[12.5px] text-sediment">
              Plan écrit pour le logiciel de test <b className="text-ink">{TEST_SYSTEM}</b>, au format du plan que produira l&apos;Explorer (agent Computer Use de Mouss) pendant la découverte. Ce n&apos;est pas une exploration
              réelle : il liste les exports connus du logiciel de test. Seuls les exports autorisés au compte sont téléchargés ; les refus sont consignés, aucun contournement n&apos;est tenté.
            </p>
            <dl className="mt-3 grid gap-1.5 text-[12.5px]">
              <InfoRow label="Compte">
                {!details ? (
                  <span className="text-silt">chargement…</span>
                ) : creds?.stored ? (
                  <>
                    <span className="font-mono">{creds.username_hint}</span>
                    {creds.expires_at && <span className="text-silt"> · effacé automatiquement le {dt(creds.expires_at)}</span>}
                  </>
                ) : (
                  <span className="font-bold text-ochre">aucun identifiant confié au projet</span>
                )}
              </InfoRow>
              <InfoRow label="Adresse">
                {!summary ? (
                  <span className="text-silt">chargement…</span>
                ) : summary.legacy_url ? (
                  <span className="font-mono break-all">{summary.legacy_url}</span>
                ) : (
                  <span className="text-sediment">celle du plan de test (aucune adresse enregistrée pour ce projet)</span>
                )}
              </InfoRow>
              {conn && (
                <InfoRow label="Connexion">
                  <span className={cx("font-bold", conn.status === "connected" ? "text-verdigris" : conn.status === "pending" ? "text-sediment" : "text-rust")}>{CONNECTION_LABEL[conn.status] ?? conn.status}</span>
                  <span className="text-silt">
                    {" "}
                    · {conn.by} · {dt(conn.at)}
                  </span>
                  {conn.detail && <span className="block text-[12px] break-words text-sediment">{conn.detail}</span>}
                </InfoRow>
              )}
            </dl>
            {details && !creds?.stored && (
              <Notice tone="warn" className="mt-3">
                Le plan de test ouvre une session avec le compte confié par le propriétaire. Confiez d&apos;abord les identifiants au projet.{" "}
                <Link href={`/projets/${id}/connexion`} className="inline-flex items-center gap-1 font-bold underline underline-offset-2">
                  <KeyRound size={12} aria-hidden /> Étape Connexion
                </Link>
              </Notice>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="accent" className="h-auto! min-h-9 whitespace-normal! py-2 text-left" disabled={!creds?.stored || !!busy || (!!summary?.software && !/relatio/i.test(summary.software))} title={summary?.software && !/relatio/i.test(summary.software) ? `Le plan de test décrit Relatio 2004 : il ne s'applique pas à « ${summary.software} »` : undefined} onClick={() => void extract("test", { plan: "test" })}>
                {busy === "test" ? <Spinner /> : <Plug size={14} aria-hidden />}
                {busy === "test" ? "Extraction en cours…" : `Extraire avec le plan de test ${TEST_SYSTEM}`}
              </Button>
              {busy === "test" && <span className="text-[12px] text-silt">Ouverture de session, puis téléchargement des exports un par un.</span>}
            </div>
          </div>

          <details className="group rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px] font-bold text-sediment hover:text-ink [&::-webkit-details-marker]:hidden">
              Plan d&apos;extraction fourni par l&apos;Explorer (JSON)
              <ChevronDown size={14} className="shrink-0 transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
              <p className="text-[12px] text-sediment">
                L&apos;Explorer envoie normalement son plan directement à l&apos;API (<code className="font-mono text-[11px]">POST /api/migration/extract</code>) : en attente de l&apos;agent tant qu&apos;aucun plan réel n&apos;est
                reçu. Vous pouvez aussi coller ici un plan au contrat <code className="font-mono text-[11px]">extraction_plan</code> : l&apos;API le contrôle avant toute requête et utilise les identifiants confiés au projet s&apos;il
                décrit une connexion.{" "}
                <a href="/api/migration/contracts" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2 hover:text-ink">
                  Contrat (JSON Schema)
                </a>
              </p>
              <textarea
                className={cx(inputCls, "h-32 resize-y py-2 font-mono text-[11.5px]")}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder='{ "system": "…", "login": { … }, "mechanisms": [ … ] }'
                spellCheck={false}
                aria-label="Plan d'extraction (JSON)"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!plan.trim() || !!busy}
                  onClick={() => {
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(plan);
                    } catch (e) {
                      setNotice({ tone: "bad", text: `Plan illisible : JSON invalide (${(e as Error).message}).` });
                      return;
                    }
                    void extract("plan", { plan: parsed });
                  }}
                >
                  {busy === "plan" ? <Spinner size={12} /> : null}
                  {busy === "plan" ? "Extraction en cours…" : "Extraire avec ce plan"}
                </Button>
              </div>
            </div>
          </details>

          {notice && (
            <Notice tone={notice.tone} onClose={() => setNotice(null)}>
              {notice.text}
              {hint && <span className="mt-0.5 block text-[12px] text-ink">{hint}</span>}
            </Notice>
          )}
        </div>

        <div className="min-w-0">
          {overview.loading && !overview.data ? (
            <Loading label="Chargement de la dernière extraction…" />
          ) : overview.error && !overview.data ? (
            <LoadError message={overview.error} onRetry={() => void overview.reload()} />
          ) : ex ? (
            <ExtractionResult ex={ex} />
          ) : (
            <Empty title="Aucune extraction automatique pour ce projet" hint="Le résultat de chaque export (récupéré, refusé au compte, introuvable, en erreur) s'affichera ici." />
          )}
        </div>
      </div>
    </Panel>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <dt className="text-silt">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const RESULT: Record<MechanismResult["status"], { label: string; tone: "ok" | "bad" | "warn"; Icon: LucideIcon }> = {
  ok: { label: "Récupéré", tone: "ok", Icon: Check },
  forbidden: { label: "Refusé au compte", tone: "bad", Icon: Ban },
  unauthorized: { label: "Refusé au compte", tone: "bad", Icon: Ban },
  not_found: { label: "Introuvable", tone: "warn", Icon: SearchX },
  error: { label: "Erreur", tone: "bad", Icon: CircleX },
};
const TONE_TEXT = { ok: "text-verdigris", bad: "text-rust", warn: "text-ochre" } as const;
/** Les refus renvoient parfois une page HTML : on n'en garde que le texte. */
const plainText = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function ExtractionResult({ ex }: { ex: ExtractionSummary }) {
  const c = { ok: 0, refused: 0, missing: 0, error: 0 };
  for (const r of ex.results) {
    if (r.status === "ok") c.ok++;
    else if (r.status === "not_found") c.missing++;
    else if (r.status === "error") c.error++;
    else c.refused++;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-bold text-sediment">Dernière extraction · {dt(ex.at)}</div>
        {ex.system === TEST_SYSTEM && <TestBadge />}
      </div>
      <p className="text-[12.5px] text-sediment">
        <b className="text-ink">{ex.system}</b> · <span className="font-mono text-[12px] break-all">{ex.base_url}</span> · compte <span className="font-mono">{ex.account}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={c.ok === ex.results.length ? "ok" : undefined}>
          {c.ok}/{ex.results.length} récupéré(s)
        </Chip>
        {c.refused > 0 && <Chip tone="bad">{plural(c.refused, "refusé")} au compte</Chip>}
        {c.missing > 0 && <Chip tone="warn">{plural(c.missing, "introuvable")}</Chip>}
        {c.error > 0 && <Chip tone="bad">{plural(c.error, "erreur")}</Chip>}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        {ex.results.map((r) => {
          const s = RESULT[r.status] ?? RESULT.error;
          const msg = r.message ? plainText(r.message) : "";
          return (
            <li key={r.id} className="flex items-start gap-2.5 px-3 py-2">
              <s.Icon size={14} className={cx("mt-0.5 shrink-0", TONE_TEXT[s.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[12.5px] font-bold">{r.label ?? r.id}</span>
                  <span className={cx("text-[11.5px] font-bold", TONE_TEXT[s.tone])}>
                    {s.label}
                    {r.http && r.status !== "ok" ? ` · HTTP ${r.http}` : ""}
                  </span>
                </div>
                <div className="truncate font-mono text-[11px] text-silt" title={r.url}>
                  {r.url}
                  {r.status === "ok" ? ` · ${bytes(r.bytes ?? 0)} · ${shortHash(r.sha256, 10)}` : ""}
                </div>
                {r.status !== "ok" && msg && <div className="text-[12px] break-words text-sediment">{msg}</div>}
              </div>
            </li>
          );
        })}
      </ul>
      {!!ex.not_extractable?.length && (
        <div className="text-[12px]">
          <div className="font-bold text-sediment">Déclarés non extractibles par le plan</div>
          <ul className="mt-1 flex flex-col gap-0.5 text-sediment">
            {ex.not_extractable.map((n) => (
              <li key={n.label}>
                <b className="text-ink">{n.label}</b> — {n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[12px] text-silt">
        {ex.manifest
          ? `Manifeste du logiciel source reçu : ${plural(ex.manifest.exports.length, "export déclaré", "exports déclarés")} — nombres de lignes et empreintes recomparés à l'étape Validation.`
          : "Aucun manifeste fourni par le logiciel source : les volumes ne pourront pas être recomparés à une déclaration du logiciel."}{" "}
        Les exports non récupérés figureront au rapport d&apos;écarts.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sources du coffre                                                    */
/* ------------------------------------------------------------------ */

const FORMAT_ICON: Record<string, LucideIcon> = { csv: FileSpreadsheet, xlsx: FileSpreadsheet, json: FileBraces, sql: FileCode, sqlite: Database, zip: FileArchive };

/** Fichier téléchargé par la dernière extraction, faite avec le plan de test (logiciel de test Relatio 2004). */
function fromTestPlan(s: SourceMeta, ex: ExtractionSummary | null): boolean {
  if (!ex || ex.system !== TEST_SYSTEM || s.origin.kind !== "http_export") return false;
  return ex.results.some((r) => r.status === "ok" && r.id === s.origin.mechanism && r.file === s.name);
}

function originLabel(s: SourceMeta, mechanism?: string): string {
  const o = s.origin;
  if (o.kind === "http_export") return `Extraction HTTP · ${mechanism ?? o.mechanism ?? "export"}${o.url ? ` (${o.url})` : ""}`;
  if (o.kind === "upload") return "Import manuel";
  if (o.by === UPLOAD_BY) return "Import manuel depuis le Studio";
  return `Envoi par API${o.by && o.by !== "api" ? ` · ${o.by}` : ""}${o.mechanism ? ` · mécanisme ${o.mechanism}` : ""}`;
}

/** Comparaison du fichier reçu avec ce que le logiciel source a déclaré dans son manifeste (lignes, empreinte). */
function ManifestCheck({ s, m, rows }: { s: SourceMeta; m: ManifestExport; rows: number }) {
  const files = s.archive_entries !== undefined;
  const read = files ? (s.archive_entries ?? 0) : rows;
  const rowsOk = m.rows === undefined ? null : m.rows === read;
  const shaOk = m.sha256 ? m.sha256 === s.sha256 : null;
  if (!m.table && rowsOk === null && shaOk === null) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {m.table && (
        <Chip title="Nom de la table dans l'ancien logiciel, d'après le manifeste de l'extraction">
          table d&apos;origine <span className="font-mono">{m.table}</span>
        </Chip>
      )}
      {rowsOk !== null && m.rows !== undefined && (
        <Chip tone={rowsOk ? "ok" : "warn"} title="Nombre déclaré par le logiciel source dans son manifeste, comparé au nombre réellement lu dans le fichier">
          {files ? plural(m.rows, "fichier déclaré", "fichiers déclarés") : plural(m.rows, "ligne déclarée", "lignes déclarées")} au manifeste · {files ? plural(read, "lu", "lus") : plural(read, "lue", "lues")}
        </Chip>
      )}
      {shaOk !== null && <Chip tone={shaOk ? "ok" : "warn"}>{shaOk ? "empreinte identique au manifeste" : "empreinte différente du manifeste"}</Chip>}
    </div>
  );
}

function SourceRow({
  s,
  mechanism,
  fromTest,
  manifest,
  mapping,
  onRemoved,
}: {
  s: SourceMeta;
  mechanism?: string;
  fromTest: boolean;
  manifest?: ManifestExport;
  mapping: Overview["mapping"];
  onRemoved: () => void;
}) {
  const { del } = useProject();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = s.tables.reduce((n, t) => n + t.rows, 0);
  const Icon = FORMAT_ICON[s.format] ?? FileText;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await del(`/api/migration/sources?id=${encodeURIComponent(s.id)}`);
      onRemoved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-0.5 hidden shrink-0 text-silt sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="min-w-0 text-[13.5px] font-bold break-all">{s.name}</span>
            <span className="tabular text-[12px] text-sediment">
              {s.archive_entries !== undefined
                ? `${plural(s.archive_entries, "fichier")} dans l'archive`
                : s.tables.length === 1
                  ? `${plural(rows, "ligne")} · ${plural(s.tables[0].columns, "colonne")}`
                  : `${plural(s.tables.length, "table")} · ${plural(rows, "ligne")}`}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-sediment">
            <span>
              {FORMAT_LABEL[s.format] ?? s.format}
              {s.encoding ? ` · ${s.encoding}` : ""} · {bytes(s.size)}
            </span>
            <span className="break-all">{originLabel(s, mechanism)}</span>
            <span>reçu le {dt(s.received_at)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[11px] text-silt" title={`SHA-256 ${s.sha256}`}>
              SHA-256 {shortHash(s.sha256, 16)}
            </span>
            {fromTest && <TestBadge />}
          </div>
          {manifest && <ManifestCheck s={s} m={manifest} rows={rows} />}
          {s.tables.length > 1 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {s.tables.map((t) => (
                <li key={t.name}>
                  <Chip>
                    <span className="font-mono">{t.name}</span> · {plural(t.rows, "ligne")} · {plural(t.columns, "colonne")}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          {s.warnings.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-ochre">
              {s.warnings.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> <span className="break-words">{w}</span>
                </li>
              ))}
            </ul>
          )}
          {confirm && (
            <div className="mt-2.5 rounded-md bg-rust-soft/60 px-3 py-2.5 text-[12.5px]">
              <p className="text-ink">
                Retirer <b>{s.name}</b> du projet ? Le fichier reste conservé dans le coffre (empreinte {shortHash(s.sha256, 12)}) mais ne sera plus lu par la migration.
                {mapping ? ` Les correspondances v${mapping.version} ne sont pas recalculées : générez ou recevez une nouvelle version ensuite.` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void remove()}>
                  {busy ? <Spinner size={12} /> : <Trash size={12} aria-hidden />} {busy ? "Retrait…" : "Retirer la source"}
                </Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => setConfirm(false)}>
                  Annuler
                </Button>
              </div>
              {error && (
                <p className="mt-1.5 break-words text-rust" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
        {!confirm && (
          <Button size="sm" variant="quiet" className="shrink-0" aria-label={`Retirer ${s.name} du projet`} onClick={() => setConfirm(true)}>
            <Trash size={13} aria-hidden /> <span className="hidden sm:inline">Retirer</span>
          </Button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Structure lue                                                        */
/* ------------------------------------------------------------------ */

function StructurePanel({
  profile,
  legacy,
}: {
  profile: { data: SourceProfile | null; error: string | null; loading: boolean; reload: () => Promise<void> };
  legacy: Map<string, { legacy: string; file: string }>;
}) {
  const p = profile.data;
  const stats = useMemo(() => {
    if (!p) return null;
    return {
      rows: p.tables.reduce((n, t) => n + t.rows, 0),
      anomalies: p.tables.reduce((n, t) => n + t.columns.filter((c) => c.anomalies.count > 0).length, 0),
      noKey: p.tables.filter((t) => !t.primary_key).length,
      empty: p.tables.filter((t) => !t.rows).length,
    };
  }, [p]);

  return (
    <Panel eyebrow="Structure lue" title="Tables et entités proposées" actions={profile.loading && p ? <Spinner className="text-silt" /> : undefined}>
      {profile.loading && !p ? (
        <Loading label="Analyse de la structure des fichiers reçus…" />
      ) : profile.error && !p ? (
        <LoadError message={profile.error} onRetry={() => void profile.reload()} />
      ) : !p || !p.tables.length ? (
        <Empty title="Aucune table lisible" hint="Les fichiers reçus ne contiennent pas de table (par exemple une archive de pièces jointes seule)." />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-sediment">
            Analyse générique des fichiers reçus, sans connaissance du logiciel source : types de colonnes, clés, relations probables. Chaque table devient une entité proposée ; les correspondances définitives viennent de
            l&apos;Analyste ou d&apos;une validation humaine (étape suivante).
          </p>
          {stats && (
            <div className="flex flex-wrap gap-1.5">
              <Chip>{plural(p.tables.length, "table")}</Chip>
              <Chip>{plural(stats.rows, "ligne")}</Chip>
              <Chip tone="ref">{plural(p.relations.length, "relation déduite", "relations déduites")}</Chip>
              {stats.anomalies > 0 && <Chip tone="warn">{plural(stats.anomalies, "colonne")} avec valeurs non conformes</Chip>}
              {stats.noKey > 0 && <Chip tone="bad">{plural(stats.noKey, "table")} sans clé unique</Chip>}
              {stats.empty > 0 && <Chip tone="warn">{plural(stats.empty, "table vide", "tables vides")}</Chip>}
            </div>
          )}
          {profile.error && <p className="text-[12px] text-rust">Actualisation impossible : {profile.error}</p>}
          <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            {p.tables.map((t) => (
              <TableRow key={t.name} t={t} legacy={legacy.get(t.name)?.legacy} />
            ))}
          </ul>
          <div>
            <div className="mb-1.5 text-[12px] font-bold text-sediment">Relations déduites des valeurs (colonne → clé d&apos;une autre table)</div>
            {p.relations.length ? (
              <ul className="flex flex-col gap-1.5">
                {p.relations.map((r) => (
                  <li key={`${r.table}.${r.column}>${r.references.table}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-md px-3 py-1.5 text-[12.5px] shadow-[0_0_0_1px_var(--color-line)]">
                    <span className="min-w-0 font-mono text-[12px] break-all">
                      {r.table}.{r.column} <span className="text-silt">→</span> {r.references.table}.{r.references.column}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {r.orphans ? (
                        <span className="text-ochre">
                          {plural(r.orphans, "valeur orpheline", "valeurs orphelines")} · couverture {percent(r.coverage)}
                          {r.orphan_samples.length ? ` (ex. ${r.orphan_samples.slice(0, 3).join(", ")})` : ""}
                        </span>
                      ) : (
                        <span className="text-verdigris">aucune valeur orpheline</span>
                      )}
                      <Confidence value={r.confidence < 1 ? Math.min(r.confidence, 0.994) : 1} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-silt">Aucune relation détectée entre les tables (aucune colonne dont les valeurs correspondent à la clé d&apos;une autre table).</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function TableRow({ t, legacy }: { t: TableProfile; legacy?: string }) {
  const [open, setOpen] = useState(false);
  const bad = t.columns.filter((c) => c.anomalies.count > 0);
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-chalk/60">
        <ChevronRight size={14} className={cx("mt-1 shrink-0 text-silt transition-transform duration-150", open && "rotate-90")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-[12.5px] font-bold break-all">{t.name}</span>
            {legacy && (
              <span className="text-[12px] text-silt" title="Nom de la table dans l'ancien logiciel, d'après le manifeste de l'extraction">
                table d&apos;origine <span className="font-mono">{legacy}</span>
              </span>
            )}
            <span className="text-[12px] text-sediment">
              → entité proposée <b className="font-mono text-ink">{t.entity}</b>
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-sediment">
            <span className="tabular">{plural(t.rows, "ligne")}</span>
            <span>{plural(t.columns.length, "colonne")}</span>
            {t.primary_key ? (
              <span>
                clé <span className="font-mono">{t.primary_key}</span>
              </span>
            ) : (
              <span className="font-bold text-rust">aucune clé unique : pas de proposition automatique</span>
            )}
            {!t.rows && <span className="text-ochre">table vide : pas de proposition automatique</span>}
            {bad.length > 0 && <span className="text-ochre">{plural(bad.length, "colonne")} avec valeurs non conformes</span>}
            {t.source_file && <span className="text-silt">fichier {t.source_file}</span>}
          </span>
        </span>
      </button>
      {open && <ColumnsTable t={t} />}
    </li>
  );
}

function ColumnsTable({ t }: { t: TableProfile }) {
  return (
    <div className="border-t border-line bg-chalk/40 px-3 py-2.5">
      <div className="overflow-x-auto rounded-md bg-paper shadow-[0_0_0_1px_var(--color-line)]">
        <table className="w-full min-w-[620px] text-[12px]">
          <caption className="px-3 pt-2 pb-1 text-left text-[11.5px] text-silt">
            Conformité : part des valeurs non vides conformes au type lu (sans objet pour le texte, qui accepte toute valeur).
          </caption>
          <thead>
            <tr className="bg-chalk text-left text-[11px] text-silt">
              <th className="px-3 py-1.5 font-bold">Colonne</th>
              <th className="px-3 py-1.5 font-bold">Type lu</th>
              <th className="px-3 py-1.5 text-right font-bold">Conformité</th>
              <th className="px-3 py-1.5 text-right font-bold">Vides</th>
              <th className="px-3 py-1.5 text-right font-bold">Distinctes</th>
              <th className="px-3 py-1.5 font-bold">Observations</th>
            </tr>
          </thead>
          <tbody>
            {t.columns.map((c) => (
              <ColumnLine key={c.name} c={c} isKey={c.name === t.primary_key} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnLine({ c, isKey }: { c: ColumnProfile; isKey: boolean }) {
  const meaningful = c.type !== "text" && c.type !== "empty";
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-1.5 font-mono font-bold break-all">
        {c.name}
        {isKey && <span className="ml-1.5 font-sans text-[10.5px] font-bold text-verdigris">clé</span>}
      </td>
      <td className="px-3 py-1.5">
        {READ_TYPE[c.type] ?? c.type}
        {c.format ? <span className="text-silt"> · {READ_FORMAT[c.format] ?? c.format}</span> : null}
      </td>
      <td className={cx("tabular px-3 py-1.5 text-right", meaningful && c.conformity < 1 ? "font-bold text-ochre" : "text-sediment")}>{meaningful ? percent(c.conformity) : "—"}</td>
      <td className="tabular px-3 py-1.5 text-right text-sediment">{nf(c.nulls)}</td>
      <td className="tabular px-3 py-1.5 text-right text-sediment">{nf(c.distinct)}</td>
      <td className="px-3 py-1.5 text-sediment">
        {[
          c.unique && !isKey ? "valeurs uniques" : null,
          c.type === "empty" ? "toujours vide" : null,
          c.codes?.length ? `codes : ${c.codes.slice(0, 6).map((x) => `${x.value} (${nf(x.count)})`).join(", ")}${c.codes.length > 6 ? ` (+${c.codes.length - 6})` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || (c.anomalies.count ? "" : "—")}
        {c.anomalies.count > 0 && (
          <span className="block text-ochre">
            {plural(c.anomalies.count, "valeur non conforme", "valeurs non conformes")}
            {c.anomalies.samples.length ? ` (ex. ${c.anomalies.samples.slice(0, 3).map((v) => `« ${String(v)} »`).join(", ")})` : ""}
          </span>
        )}
      </td>
    </tr>
  );
}
