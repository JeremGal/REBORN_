"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, CircleX, Download, FileUp, Info, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { post, useReborn } from "@/components/RebornProvider";
import { Button, Confidence, Empty, Field, Panel, cx, inputCls } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Types des réponses d'API (sous-ensemble utilisé par l'écran)          */
/* ------------------------------------------------------------------ */
interface Source { id: string; name: string; format: string; size: number; sha256: string; received_at: string; origin: { kind: string; mechanism?: string }; tables: { name: string; rows: number; columns: number }[]; archive_entries?: number; encoding?: string; warnings: string[] }
interface MechanismResult { id: string; label?: string; url: string; status: string; http?: number; message?: string; bytes?: number; sha256?: string }
interface ReviewItem { key: string; kind: string; label: string; confidence: number; detail: string; decision: { decision: string; by: string; at: string } | null }
interface FieldMap { name: string; label?: string; source: string; type: string; references?: string; transforms?: unknown[]; confidence?: number; accounting?: boolean; required?: boolean }
interface EntityMap { name: string; label?: string; source: { table: string; key: string }; fields: FieldMap[] }
interface RunMeta { id: string; at: string; by: string; mapping_version: number; status: string; error?: string; verification: "validated" | "review" | "blocked" | null; summary: { imported: number; rejected: number; source_rows: number; attachments: number; duration_ms: number } }
interface Deployment { id: string; at: string; run_id: string; app_dir: string; backup: string | null; status: string }
interface Overview {
  project: { id: string; name: string; source_system: string | null };
  sources: Source[];
  extraction: { at: string; system: string; base_url: string; account: string; results: MechanismResult[]; manifest: unknown } | null;
  mapping: { version: number; origin: string; received_at: string; target: { id: string; name: string }; entities: EntityMap[]; attachments: unknown[]; issues: { level: string; path: string; message: string }[] } | null;
  review: { items: ReviewItem[]; pending: number; can_run: boolean; blockers: string[] };
  runs: RunMeta[];
  acknowledgements: Record<string, { at: string; by: string; comment?: string }>;
  deployments: Deployment[];
  app: { deployment: Deployment | null; app_id: string | null; url: string; running: boolean; managed: boolean; port_used_by_other: boolean; credentials_file: string | null };
}
interface Check { id: string; group: string; label: string; status: "pass" | "fail" | "warn" | "info"; blocking: boolean; summary: string; details?: unknown[] }
interface Report { status: "validated" | "review" | "blocked"; statement: string; checks: Check[]; entities: { entity: string; label?: string; source_table: string; source_rows: number; target_rows: number; rejected: number; exact: number; mismatched: number; totals: { field: string; accounting: boolean; source_cents: number; target_cents: number; rejected_cents: number }[] }[]; gaps: { kind: string; entity?: string; source?: string; message: string; count: number; examples?: unknown[] }[]; database: { sha256: string; bytes: number } }
interface RunDetail { meta: RunMeta; acknowledged: { at: string; by: string; comment?: string } | null; rejections: { total: number; items: { entity: string; source_key: string | null; row: number; reasons: string[] }[] }; field_issues: { total: number }; attachments: { expected: number; stored: number; missing: number }; report: Report | null; reconciliation: Report | null; db_sha256?: string }
interface Profile { tables: { name: string; source_file?: string; rows: number; primary_key: string | null; entity: string; columns: { name: string; type: string; format?: string; conformity: number; nulls: number; distinct: number; anomalies: { count: number; samples: unknown[] }; codes?: { value: string; count: number }[] }[] }[]; relations: { table: string; column: string; references: { table: string; column: string }; orphans: number; coverage: number }[] }

const VERDICT = {
  validated: { label: "Migration validée", tone: "ok", text: "Tous les contrôles réussis, aucun écart." },
  review: { label: "Validation humaine requise", tone: "warn", text: "Aucun contrôle bloquant en échec ; des écarts documentés doivent être examinés et acceptés." },
  blocked: { label: "Intervention requise", tone: "bad", text: "Au moins un contrôle bloquant a échoué : la mise en service est refusée." },
} as const;

const euros = (c: number) => `${(c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const n = (x: number) => x.toLocaleString("fr-FR");
const kb = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);
const dt = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });

export default function MigrationPage() {
  const { state } = useReborn();
  const [data, setData] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/migration", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(`Chargement impossible (${(e as Error).message})`);
    }
  }, []);
  useEffect(() => void load(), [load, state?.revision]);

  const lastRun = data?.runs.at(-1) ?? null;
  const sourcesKey = data?.sources.map((s) => s.sha256).join(",") ?? "";
  useEffect(() => {
    if (!lastRun) return setDetail(null);
    fetch(`/api/migration/runs/${lastRun.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [lastRun?.id, lastRun?.verification, state?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sourcesKey) return setProfile(null);
    fetch("/api/migration/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [sourcesKey]);

  async function act(id: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(id);
    setNotice(null);
    try {
      await fn();
      if (ok) setNotice({ ok: true, text: ok });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <div className="py-24 text-center text-silt">{error ?? "Chargement du projet de migration…"}</div>;

  const report = detail?.meta.id === lastRun?.id ? detail?.report ?? null : null;
  const active = data.app.deployment;
  const steps = [
    { n: "1", label: "Extraction", done: data.sources.length > 0, meta: data.sources.length ? `${data.sources.length} fichier(s)` : "—" },
    { n: "2", label: "Structure", done: !!profile?.tables.length, meta: profile ? `${profile.tables.length} table(s) · ${profile.relations.length} relation(s)` : "—" },
    { n: "3", label: "Correspondances", done: !!data.mapping && data.review.pending === 0, warn: !!data.mapping && data.review.pending > 0, meta: data.mapping ? (data.review.pending ? `${data.review.pending} à valider` : `v${data.mapping.version} validée`) : "—" },
    { n: "4", label: "Migration", done: lastRun?.status === "completed", meta: lastRun ? `${n(lastRun.summary.imported)} importé(s)` : "—" },
    { n: "5", label: "Vérification", done: report?.status === "validated" || (report?.status === "review" && !!detail?.acknowledged), warn: report?.status === "review" && !detail?.acknowledged, bad: report?.status === "blocked", meta: report ? VERDICT[report.status].label : "—" },
    { n: "6", label: "Mise en service", done: !!active && data.app.running, meta: active ? (data.app.running ? "en service" : "arrêté") : "—" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Data Migration Engine · Jerem</div>
          <h1 className="mt-1 text-[26px] leading-tight font-black tracking-[-0.025em]">
            {data.project.source_system ?? "Logiciel source"} <span className="font-normal text-sediment">→ {data.mapping?.target.name ?? "nouveau logiciel"}</span>
          </h1>
          <p className="mt-1 text-[13px] text-sediment">
            {data.project.name} · les données sont réellement transférées dans une nouvelle base ; chaque enregistrement garde la trace de son origine.
          </p>
        </div>
        <NewProject onDone={load} />
      </div>

      {notice && <div className={cx("rounded-md px-4 py-2 text-[13px]", notice.ok ? "bg-verdigris-soft text-verdigris" : "bg-rust-soft text-rust")}>{notice.text}</div>}

      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line sm:grid-cols-3 xl:grid-cols-6" aria-label="Étapes de la migration">
        {steps.map((s) => (
          <li key={s.n} className="flex items-center gap-2.5 bg-paper px-3 py-2.5">
            <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black", s.bad ? "bg-rust text-white" : s.warn ? "bg-ochre text-white" : s.done ? "bg-verdigris text-white" : "bg-chalk-2 text-silt")}>
              {s.done && !s.warn && !s.bad ? <Check size={13} strokeWidth={3} /> : s.n}
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] leading-tight font-bold">{s.label}</span>
              <span className="block truncate text-[11.5px] text-silt">{s.meta}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* 1 · Extraction ---------------------------------------------------- */}
      <Panel eyebrow="1 · Extraction autorisée" title="Données récupérées du logiciel source">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ExtractionForm busy={busy === "extract"} onSubmit={(body) => act("extract", () => post("/api/migration/extract", body), "Extraction terminée")} />
          <div className="min-w-0">
            {data.extraction ? (
              <>
                <p className="mb-2 text-[12px] text-sediment">
                  {data.extraction.system} · {data.extraction.base_url} · compte {data.extraction.account} · {dt(data.extraction.at)} · mot de passe non conservé
                </p>
                <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
                  {data.extraction.results.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12.5px]">
                      <span className="flex min-w-0 items-center gap-2">
                        {r.status === "ok" ? <Check size={13} className="shrink-0 text-verdigris" /> : r.status === "forbidden" || r.status === "unauthorized" ? <CircleX size={13} className="shrink-0 text-rust" /> : <CircleAlert size={13} className="shrink-0 text-ochre" />}
                        <span className="truncate">{r.label ?? r.id}</span>
                      </span>
                      <span className={cx("shrink-0 font-mono text-[11px]", r.status === "ok" ? "text-silt" : "text-rust")}>{r.status === "ok" ? `${kb(r.bytes ?? 0)} · ${r.sha256?.slice(0, 10)}` : `${r.http ?? ""} ${r.message ?? r.status}`.slice(0, 60)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty title="Aucune extraction" hint="Lancez le connecteur avec le compte confié par le propriétaire, ou déposez des fichiers exportés." />
            )}
            <SourcesList sources={data.sources} onUpload={(name, b64) => act("upload", () => post("/api/migration/sources", { name, content_base64: b64 }), `${name} reçu`)} />
          </div>
        </div>
      </Panel>

      {/* 2 · Structure ------------------------------------------------------ */}
      {profile && profile.tables.length > 0 && (
        <Panel eyebrow="2 · Structure analysée" title={`${profile.tables.length} tables · ${n(profile.tables.reduce((s, t) => s + t.rows, 0))} lignes · ${profile.relations.length} relations détectées`}>
          <StructureView profile={profile} />
        </Panel>
      )}

      {/* 3 · Correspondances -------------------------------------------------- */}
      {data.sources.length > 0 && (
        <Panel
          eyebrow="3 · Correspondances ancien → nouveau"
          title={data.mapping ? `Version ${data.mapping.version} · ${data.mapping.origin === "analyst" ? "reçue de l'Analyste" : data.mapping.origin === "fixture" ? "jeu de test au format de l'Analyste" : data.mapping.origin === "auto" ? "proposition automatique" : "saisie opérateur"}` : "En attente des correspondances"}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("auto", () => post("/api/migration/mapping?propose=auto", {}), "Proposition automatique générée")}>
                Proposition automatique
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("fixture", () => post("/api/migration/mapping?fixture=crm", {}), "Correspondances de test chargées")}>
                Jeu de test (format Alan)
              </Button>
            </div>
          }
        >
          {data.mapping ? <MappingView data={data} busy={busy} act={act} /> : <Empty title="Aucune correspondance" hint="Alan publie ses correspondances via POST /api/migration/mapping, ou générez une proposition automatique à partir de la structure lue." />}
        </Panel>
      )}

      {/* 4 · Migration -------------------------------------------------------- */}
      {data.mapping && (
        <Panel
          eyebrow="4 · Migration"
          title={lastRun ? `Dernière exécution ${lastRun.id} · ${dt(lastRun.at)}` : "Prête à être lancée"}
          actions={
            <Button variant="accent" disabled={!data.review.can_run || !!busy} onClick={() => act("run", () => post("/api/migration/runs", {}), "Migration exécutée et vérifiée")}>
              {busy === "run" ? "Migration en cours…" : lastRun ? "Relancer la migration" : "Lancer la migration"}
            </Button>
          }
        >
          {!data.review.can_run && (
            <ul className="mb-3 flex flex-col gap-1 rounded-md bg-ochre-soft px-3 py-2 text-[12.5px] text-ochre">
              {data.review.blockers.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
          )}
          {lastRun ? (
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <Stat label="Lignes sources lues" value={n(lastRun.summary.source_rows)} />
              <Stat label="Enregistrements importés" value={n(lastRun.summary.imported)} tone="ok" />
              <Stat label="Lignes rejetées" value={n(lastRun.summary.rejected)} tone={lastRun.summary.rejected ? "warn" : undefined} />
              <Stat label="Pièces jointes" value={n(lastRun.summary.attachments)} />
              <Stat label="Durée" value={`${(lastRun.summary.duration_ms / 1000).toFixed(1)} s`} />
              {lastRun.error && <p className="w-full text-rust">{lastRun.error}</p>}
            </div>
          ) : (
            <p className="text-[13px] text-sediment">La migration crée une nouvelle base, importe les enregistrements dans l&apos;ordre de leurs dépendances, puis lance aussitôt la vérification.</p>
          )}
        </Panel>
      )}

      {/* 5 · Vérification ----------------------------------------------------- */}
      {report && detail && <VerificationView report={report} detail={detail} busy={busy} act={act} />}

      {/* 6 · Mise en service ------------------------------------------------- */}
      {report && <DeployView data={data} report={report} detail={detail} busy={busy} act={act} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NewProject({ onDone }: { onDone: () => void }) {
  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={async () => {
        const name = window.prompt("Nom du nouveau projet de migration", "Migration");
        if (!name) return;
        await post("/api/migration/project", { name });
        onDone();
      }}
    >
      Nouveau projet
    </Button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <div>
      <div className="text-[11.5px] text-silt">{label}</div>
      <div className={cx("tabular text-[20px] font-black", tone === "ok" ? "text-verdigris" : tone === "warn" ? "text-ochre" : tone === "bad" ? "text-rust" : "text-ink")}>{value}</div>
    </div>
  );
}

function ExtractionForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [url, setUrl] = useState("http://127.0.0.1:4100");
  const [user, setUser] = useState("migration");
  const [pw, setPw] = useState("");
  const [plan, setPlan] = useState<"test" | "custom">("test");
  const [custom, setCustom] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        let p: unknown = "test";
        if (plan === "custom") {
          try {
            p = JSON.parse(custom);
          } catch {
            return window.alert("Plan d'extraction : JSON invalide");
          }
        }
        onSubmit({ plan: p, base_url: url, username: user, password: pw });
        setPw("");
      }}
    >
      <Field label="Adresse du logiciel source">
        <input className={cx(inputCls, "font-mono text-[12px]")} value={url} onChange={(e) => setUrl(e.target.value)} name="base_url" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Compte confié par le propriétaire">
          <input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} name="username" autoComplete="off" />
        </Field>
        <Field label="Mot de passe" hint="Utilisé pour la session, jamais conservé">
          <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} name="password" autoComplete="new-password" />
        </Field>
      </div>
      <Field label="Mécanismes d'extraction">
        <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value as "test" | "custom")}>
          <option value="test">Plan de test Relatio 2004 (format de l&apos;Explorer)</option>
          <option value="custom">Plan fourni par l&apos;Explorer (JSON)</option>
        </select>
      </Field>
      {plan === "custom" && <textarea className={cx(inputCls, "h-28 py-2 font-mono text-[11px]")} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder='{ "system": "…", "login": {…}, "mechanisms": [ … ] }' />}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-silt">Seuls les exports autorisés au compte sont récupérés ; les refus sont consignés.</span>
        <Button type="submit" disabled={busy || !pw}>
          {busy ? "Extraction…" : "Extraire"}
        </Button>
      </div>
    </form>
  );
}

function SourcesList({ sources, onUpload }: { sources: Source[]; onUpload: (name: string, b64: string) => void }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold text-sediment">Coffre des sources ({sources.length})</span>
        <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-bold text-sediment hover:text-ink">
          <FileUp size={13} /> Déposer un fichier
          <input
            type="file"
            className="sr-only"
            accept=".csv,.txt,.json,.ndjson,.xlsx,.sql,.db,.sqlite,.zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const buf = new Uint8Array(await f.arrayBuffer());
              let bin = "";
              for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              onUpload(f.name, btoa(bin));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {sources.length > 0 && (
        <div className="overflow-x-auto rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-chalk text-left text-[11px] text-silt">
                <th className="px-2.5 py-1.5 font-bold">Fichier</th>
                <th className="px-2.5 py-1.5 font-bold">Format</th>
                <th className="px-2.5 py-1.5 text-right font-bold">Lignes</th>
                <th className="px-2.5 py-1.5 font-bold">Empreinte SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-2.5 py-1.5 font-bold" title={s.warnings.join("\n")}>
                    {s.name}
                    {s.warnings.length > 0 && <TriangleAlert size={11} className="ml-1 inline text-ochre" />}
                  </td>
                  <td className="px-2.5 py-1.5 text-sediment">
                    {s.format.toUpperCase()}
                    {s.encoding ? ` · ${s.encoding}` : ""}
                  </td>
                  <td className="tabular px-2.5 py-1.5 text-right">{s.archive_entries !== undefined ? `${n(s.archive_entries)} fichiers` : n(s.tables.reduce((a, t) => a + t.rows, 0))}</td>
                  <td className="px-2.5 py-1.5 font-mono text-[11px] text-silt">{s.sha256.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StructureView({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="overflow-x-auto rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-chalk text-left text-[11px] text-silt">
              <th className="px-3 py-1.5 font-bold">Table source</th>
              <th className="px-3 py-1.5 text-right font-bold">Lignes</th>
              <th className="px-3 py-1.5 font-bold">Clé</th>
              <th className="px-3 py-1.5 font-bold">Colonnes et anomalies</th>
            </tr>
          </thead>
          <tbody>
            {profile.tables.map((t) => {
              const anomalies = t.columns.filter((c) => c.anomalies.count);
              return (
                <tr key={t.name} className="cursor-pointer border-t border-line align-top hover:bg-chalk" onClick={() => setOpen(open === t.name ? null : t.name)}>
                  <td className="px-3 py-1.5 font-bold">{t.name}</td>
                  <td className="tabular px-3 py-1.5 text-right">{n(t.rows)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{t.primary_key ?? <span className="text-rust">aucune</span>}</td>
                  <td className="px-3 py-1.5 text-sediment">
                    {t.columns.length} colonnes
                    {anomalies.length > 0 && <span className="text-ochre"> · {anomalies.map((c) => `${c.name} : ${c.anomalies.count} valeur(s) non conforme(s)`).join(" · ")}</span>}
                    {open === t.name && (
                      <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[11.5px] sm:grid-cols-2">
                        {t.columns.map((c) => (
                          <li key={c.name}>
                            <span className="font-mono text-ink">{c.name}</span> · {c.type}
                            {c.format ? ` (${c.format})` : ""}
                            {c.nulls ? ` · ${c.nulls} vide(s)` : ""}
                            {c.codes ? ` · codes ${c.codes.map((x) => x.value).join("/")}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-bold text-sediment">Relations déduites des valeurs (clé étrangère → clé primaire)</div>
        <ul className="flex flex-col gap-1 text-[12px]">
          {profile.relations.map((r) => (
            <li key={`${r.table}.${r.column}`} className="flex justify-between gap-2">
              <span className="font-mono">
                {r.table}.{r.column} → {r.references.table}
              </span>
              <span className={r.orphans ? "text-ochre" : "text-silt"}>{r.orphans ? `${r.orphans} orpheline(s)` : "complète"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MappingView({ data, busy, act }: { data: Overview; busy: string | null; act: (id: string, fn: () => Promise<unknown>, ok?: string) => void }) {
  const m = data.mapping!;
  const [open, setOpen] = useState<string | null>(null);
  const errors = m.issues.filter((i) => i.level === "error");
  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 && (
        <ul className="rounded-md bg-rust-soft px-3 py-2 text-[12.5px] text-rust">
          {errors.map((e) => (
            <li key={e.path + e.message}>
              • {e.path} : {e.message}
            </li>
          ))}
        </ul>
      )}
      {data.review.items.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-sediment">
            Correspondances incertaines — validation humaine avant import
            <span className={cx("rounded-xs px-1.5 py-0.5 text-[11px]", data.review.pending ? "bg-ochre-soft text-ochre" : "bg-verdigris-soft text-verdigris")}>{data.review.pending ? `${data.review.pending} en attente` : "toutes traitées"}</span>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            {data.review.items.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold">
                    {i.label} <Confidence value={i.confidence} />
                  </div>
                  <div className="text-[12px] text-sediment">{i.detail}</div>
                </div>
                {i.decision ? (
                  <span className={cx("text-[12px] font-bold", i.decision.decision === "accepted" ? "text-verdigris" : "text-rust")}>
                    {i.decision.decision === "accepted" ? "Validée" : "Exclue"} par {i.decision.by}
                  </span>
                ) : (
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="accent" disabled={!!busy} onClick={() => act(`d-${i.key}`, () => post("/api/migration/decisions", { key: i.key, decision: "accepted", by: "Jerem" }))}>
                      Valider
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(`d-${i.key}`, () => post("/api/migration/decisions", { key: i.key, decision: "excluded", by: "Jerem", comment: window.prompt("Motif de l'exclusion (rapport d'écarts)") ?? undefined }))}>
                      Exclure
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-chalk text-left text-[11px] text-silt">
              <th className="px-3 py-1.5 font-bold">Entité du nouveau logiciel</th>
              <th className="px-3 py-1.5 font-bold">Source</th>
              <th className="px-3 py-1.5 font-bold">Champs</th>
            </tr>
          </thead>
          <tbody>
            {m.entities.map((e) => (
              <tr key={e.name} className="cursor-pointer border-t border-line align-top hover:bg-chalk" onClick={() => setOpen(open === e.name ? null : e.name)}>
                <td className="px-3 py-1.5 font-bold">{e.label ?? e.name}</td>
                <td className="px-3 py-1.5 font-mono text-[11.5px]">
                  {e.source.table} · clé {e.source.key}
                </td>
                <td className="px-3 py-1.5 text-sediment">
                  {e.fields.length} champs · {e.fields.filter((f) => f.type === "reference").length} relation(s){e.fields.some((f) => f.accounting) ? " · données comptables" : ""}
                  {open === e.name && (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-[11.5px]">
                      {e.fields.map((f) => (
                        <li key={f.name}>
                          <span className="font-bold text-ink">{f.label ?? f.name}</span> ← <span className="font-mono">{f.source}</span> · {f.type}
                          {f.references ? ` → ${f.references}` : ""}
                          {f.transforms?.length ? ` · ${f.transforms.map((t) => (typeof t === "string" ? t : Object.keys(t as object)[0])).join(" → ")}` : ""}
                          {f.accounting ? " · comptable (lecture seule)" : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CHECK_ICON = { pass: <Check size={14} className="text-verdigris" />, fail: <CircleX size={14} className="text-rust" />, warn: <TriangleAlert size={14} className="text-ochre" />, info: <Info size={14} className="text-ink-3" /> };
const GROUP_LABEL: Record<string, string> = { sources: "Sources extraites", volumes: "Volumes", enregistrements: "Enregistrements", relations: "Relations", montants: "Montants", pieces_jointes: "Pièces jointes", regles: "Règles métier (historique)", integrite: "Intégrité", couverture: "Périmètre" };

function VerificationView({ report, detail, busy, act }: { report: Report; detail: RunDetail; busy: string | null; act: (id: string, fn: () => Promise<unknown>, ok?: string) => void }) {
  const v = VERDICT[report.status];
  const groups = useMemo(() => {
    const m = new Map<string, Check[]>();
    for (const c of report.checks) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m.entries()];
  }, [report]);
  const passed = report.checks.filter((c) => c.status === "pass").length;
  const [comment, setComment] = useState("");
  return (
    <Panel eyebrow="5 · Vérification (données relues des deux côtés)" title={`Rapport de ${detail.meta.id}`} actions={<a className="inline-flex items-center gap-1 text-[12px] font-bold text-sediment hover:text-ink" href={`/api/migration/runs/${detail.meta.id}/rejects`}><Download size={13} /> Rapport d&apos;écarts (CSV)</a>}>
      <div className={cx("mb-4 flex flex-wrap items-start justify-between gap-4 rounded-md px-4 py-3", v.tone === "ok" ? "bg-verdigris-soft" : v.tone === "warn" ? "bg-ochre-soft" : "bg-rust-soft")}>
        <div className="min-w-0">
          <div className={cx("flex items-center gap-2 text-[16px] font-black", v.tone === "ok" ? "text-verdigris" : v.tone === "warn" ? "text-ochre" : "text-rust")}>
            {v.tone === "ok" ? <ShieldCheck size={18} /> : v.tone === "warn" ? <TriangleAlert size={18} /> : <CircleX size={18} />} {v.label}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink">
            {v.text} {passed}/{report.checks.length} contrôles réussis.
          </p>
          <p className="mt-1 max-w-3xl text-[11.5px] text-sediment">{report.statement}</p>
        </div>
        <div className="font-mono text-[11px] text-sediment">base {report.database.sha256.slice(0, 16)}… · {kb(report.database.bytes)}</div>
      </div>

      {/* Registre de réconciliation : source = importés + rejetés, par entité */}
      <div className="overflow-x-auto rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-chalk text-left text-[11px] text-silt">
              <th className="px-3 py-1.5 font-bold">Entité</th>
              <th className="px-3 py-1.5 text-right font-bold">Lignes sources</th>
              <th className="px-3 py-1.5 text-right font-bold">= importées</th>
              <th className="px-3 py-1.5 text-right font-bold">+ rejetées</th>
              <th className="px-3 py-1.5 text-right font-bold">Identiques (relues)</th>
              <th className="px-3 py-1.5 text-right font-bold">Montants source → destination</th>
            </tr>
          </thead>
          <tbody>
            {report.entities.map((e) => (
              <tr key={e.entity} className="border-t border-line">
                <td className="px-3 py-1.5">
                  <span className="font-bold">{e.label ?? e.entity}</span> <span className="font-mono text-[11px] text-silt">{e.source_table}</span>
                </td>
                <td className="tabular px-3 py-1.5 text-right">{n(e.source_rows)}</td>
                <td className="tabular px-3 py-1.5 text-right font-bold">{n(e.target_rows)}</td>
                <td className={cx("tabular px-3 py-1.5 text-right", e.rejected ? "font-bold text-ochre" : "text-silt")}>{n(e.rejected)}</td>
                <td className={cx("tabular px-3 py-1.5 text-right", e.mismatched ? "font-bold text-rust" : "text-verdigris")}>
                  {n(e.exact)}/{n(e.target_rows)}
                </td>
                <td className="tabular px-3 py-1.5 text-right text-[11.5px]">
                  {e.totals
                    .filter((t) => t.accounting || e.totals.length === 1)
                    .slice(-1)
                    .map((t) => (
                      <span key={t.field} className={t.source_cents === t.target_cents ? "text-ink" : "font-bold text-rust"} title={`${t.field}${t.rejected_cents ? ` · ${euros(t.rejected_cents)} dans des lignes rejetées` : ""}`}>
                        {euros(t.source_cents)} → {euros(t.target_cents)}
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {groups.map(([g, list]) => (
            <div key={g}>
              <div className="mb-1 text-xs font-bold text-sediment">{GROUP_LABEL[g] ?? g}</div>
              <ul className="flex flex-col gap-1">
                {list.map((c) => (
                  <li key={c.id} className="text-[12.5px]">
                    <details>
                      <summary className="flex cursor-pointer list-none items-start gap-2">
                        <span className="mt-0.5 shrink-0">{CHECK_ICON[c.status]}</span>
                        <span className="min-w-0">
                          <span className="font-bold">{c.label}</span>
                          {c.blocking && c.status === "fail" && <span className="ml-1 text-[11px] font-bold text-rust">bloquant</span>}
                          <span className="block text-[12px] text-sediment">{c.summary}</span>
                        </span>
                      </summary>
                      {c.details?.length ? (
                        <ul className="mt-1 ml-6 max-h-40 overflow-y-auto font-mono text-[11px] text-silt">
                          {c.details.map((d, i) => (
                            <li key={i}>{typeof d === "string" ? d : JSON.stringify(d)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-xs font-bold text-sediment">Rapport d&apos;écarts — ce qui n&apos;a pas été transféré tel quel, et pourquoi</div>
            <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              {report.gaps.map((g, i) => (
                <li key={i} className="px-3 py-2 text-[12.5px]">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="mr-1.5 rounded-xs bg-chalk-2 px-1.5 py-0.5 font-mono text-[10.5px] text-sediment">{GAP[g.kind] ?? g.kind}</span>
                      {g.message}
                    </summary>
                    {g.examples?.length ? <pre className="mt-1 max-h-48 overflow-auto rounded-sm bg-chalk p-2 font-mono text-[10.5px] whitespace-pre-wrap text-sediment">{JSON.stringify(g.examples, null, 1)}</pre> : null}
                  </details>
                </li>
              ))}
              {!report.gaps.length && <li className="px-3 py-2 text-[12.5px] text-verdigris">Aucun écart.</li>}
            </ul>
          </div>
          {report.status === "review" &&
            (detail.acknowledged ? (
              <p className="rounded-md bg-verdigris-soft px-3 py-2 text-[12.5px] text-verdigris">
                Écarts acceptés par {detail.acknowledged.by} le {dt(detail.acknowledged.at)}
                {detail.acknowledged.comment ? ` — « ${detail.acknowledged.comment} »` : ""}
              </p>
            ) : (
              <form
                className="flex flex-col gap-2 rounded-md bg-ochre-soft px-3 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  act("ack", () => post(`/api/migration/runs/${detail.meta.id}/acknowledge`, { comment, by: "Jerem" }), "Écarts acceptés");
                }}
              >
                <span className="text-[12.5px] font-bold text-ochre">Validation humaine : j&apos;ai examiné les {report.gaps.length} écarts ci-dessus</span>
                <input className={inputCls} placeholder="Commentaire (ex. pièces perdues confirmées par le client)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button type="submit" variant="primary" disabled={!!busy || !comment.trim()} className="self-end">
                  Accepter les écarts
                </Button>
              </form>
            ))}
        </div>
      </div>
    </Panel>
  );
}
const GAP: Record<string, string> = { rejected: "rejet", unlinked: "sans lien", conversion: "valeur", attachment: "fichier", unmapped_table: "non repris", unmapped_column: "colonnes", inaccessible: "inaccessible", excluded: "exclu", duplicate: "doublons", historical: "historique" };

function DeployView({ data, report, detail, busy, act }: { data: Overview; report: Report; detail: RunDetail | null; busy: string | null; act: (id: string, fn: () => Promise<unknown>, ok?: string) => void }) {
  const run = data.runs.at(-1)!;
  const allowed = report.status === "validated" || (report.status === "review" && !!detail?.acknowledged);
  const active = data.app.deployment;
  const deployedThis = active?.run_id === run.id;
  const rec = detail?.reconciliation;
  return (
    <Panel
      eyebrow="6 · Nouveau logiciel"
      title={data.mapping?.target.name ?? "Logiciel livré"}
      actions={
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("app", () => post("/api/migration/app", { action: data.app.running ? "stop" : "start" }))}>
              {data.app.running ? "Arrêter" : "Démarrer"}
            </Button>
          )}
          <Button
            variant="accent"
            disabled={!allowed || !!busy}
            title={allowed ? undefined : "Vérification validée (ou écarts acceptés) requise"}
            onClick={() =>
              act(
                "deploy",
                async () => {
                  try {
                    await post("/api/migration/deploy", { run_id: run.id });
                  } catch (e) {
                    if (/modification/.test((e as Error).message) && window.confirm(`${(e as Error).message}\n\nRemplacer quand même (une sauvegarde est faite) ?`)) await post("/api/migration/deploy", { run_id: run.id, force: true });
                    else throw e;
                  }
                },
                "Logiciel généré et mis en service",
              )
            }
          >
            {busy === "deploy" ? "Génération…" : deployedThis ? "Régénérer et remettre en service" : "Générer et mettre en service"}
          </Button>
        </div>
      }
    >
      {!allowed && <p className="mb-3 rounded-md bg-ochre-soft px-3 py-2 text-[12.5px] text-ochre">{report.status === "blocked" ? "Mise en service refusée : des contrôles bloquants ont échoué." : "Acceptez les écarts du rapport (étape 5) avant la mise en service."}</p>}
      {active ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cx("inline-flex items-center gap-1.5 font-bold", data.app.running ? "text-verdigris" : "text-silt")}>
                <span className={cx("size-2 rounded-full", data.app.running ? "bg-verdigris" : "bg-dust")} /> {data.app.running ? "En service" : "Arrêté"}
              </span>
              {data.app.running && (
                <a href={data.app.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-ink hover:text-verdigris">
                  Ouvrir {data.mapping?.target.name} <ArrowUpRight size={13} />
                </a>
              )}
            </div>
            <p className="text-sediment">
              Données de {active.run_id}, mises en service le {dt(active.at)}. Dossier <code className="font-mono text-[12px]">{active.app_dir}</code> : serveur autonome (Node, sans dépendance), base SQLite propre, pièces jointes, sauvegardes.
            </p>
            <p className="text-[12px] text-silt">
              Connexion : compte <b>admin</b>, mot de passe initial dans <code className="font-mono">{data.app.credentials_file}</code> (<code className="font-mono">npm run crm:password</code> le copie sans l&apos;afficher). Lancement sans le Studio : <code className="font-mono">npm run crm</code>.
            </p>
            {data.app.port_used_by_other && <p className="text-rust">Le port est utilisé par une autre application.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-sediment">Réconciliation après mise en service</span>
              <Button size="sm" variant="ghost" disabled={!!busy || !deployedThis} onClick={() => act("reconcile", () => post("/api/migration/reconcile", {}), "Réconciliation terminée")}>
                Relire et comparer
              </Button>
            </div>
            {rec ? (
              <p className={cx("text-[12.5px]", rec.status === "blocked" ? "text-rust" : "text-sediment")}>
                {VERDICT[rec.status].label} · {rec.checks.filter((c) => c.status === "pass").length}/{rec.checks.length} contrôles réussis · base en service relue ; les enregistrements modifiés par les utilisateurs (journal d&apos;audit) sont exclus de la comparaison champ à champ.
              </p>
            ) : (
              <p className="text-[12px] text-silt">Relit la base du logiciel en service et la recompare aux fichiers sources.</p>
            )}
            <div className="mt-1 text-xs font-bold text-sediment">Historique des mises en service</div>
            <ul className="flex flex-col gap-1 text-[12px]">
              {[...data.deployments].reverse().map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>
                    {dt(d.at)} · {d.run_id} · <span className={d.status === "active" ? "font-bold text-verdigris" : "text-silt"}>{d.status === "active" ? "active" : d.status === "rolled_back" ? "annulée" : "remplacée"}</span>
                  </span>
                  {d.status === "active" && d.backup && (
                    <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => window.confirm("Restaurer la base antérieure à cette mise en service ?") && act("rollback", () => post("/api/migration/rollback", { deployment_id: d.id }), "Retour arrière effectué")}>
                      <RotateCcw size={12} /> Retour arrière
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-sediment">
          La génération produit un logiciel autonome (interface, API, base de données, authentification, rôles, journal d&apos;audit, sauvegardes), y installe la base migrée et le démarre. La base précédente est sauvegardée à chaque mise en service.
        </p>
      )}
    </Panel>
  );
}
