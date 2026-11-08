"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ImageOff } from "lucide-react";
import { Badge, StatusBadge } from "@/components/ds/Badge";
import { EmptyState } from "@/components/ds/States";
import { cx } from "@/components/ds/cx";
import type { Tone } from "@/components/ds/styles";
import { STATUS_LABEL } from "@/lib/engine/describe";
import { MODE_INFO } from "@/lib/modes";
import type { AgentEvent, Investigation, Observation, RebornState, StoredRuleModel, StoredSchema } from "@/lib/types";
import { Section, TestBadge } from "./Step";
import type { ProjectDetails } from "./ProjectProvider";
import type { ExtractionSummary, SourceMeta } from "./DataKit";
import { TEST_SYSTEM, UPLOAD_BY } from "./DataKit";
import type { AnalysisMission } from "./ConnAnalysis";
import { CONN_STATE, connByConnector, connByTestPlan, connCount, connDate, connHour, connNum, connSafeShot, connValue } from "./ConnShared";

/*
 * Étape Découverte : uniquement ce qui a RÉELLEMENT été reçu pour ce projet (rapports de
 * connexion, explorations de l'agent, écrans décrits, exports déposés, refus). Aucune progression
 * n'est simulée ; sans rapport de l'agent, la page le dit.
 */

/** Module placeholder envoyé à l'ouverture d'une exploration : ce n'est pas un module découvert. */
const PLACEHOLDER_MODULES = new Set(["Modules à découvrir"]);
const SOURCE: Record<string, string> = { explorer: "Agent d'analyse", analyst: "Analyste", fixture: "Jeu de test", user: "Vous", platform: "REBORN" };
const sourceLabel = (s?: string) => (s ? (SOURCE[s] ?? s) : "source non précisée");
const OBS_LIMIT = 150;
const EVENT_LIMIT = 200;
const SHOT_LIMIT = 24;

/** Mode d'une exploration ; un mode inconnu est traité comme local (jamais présenté comme réel). */
export function connMode(mode: string): { local: boolean; label: string } {
  const m = MODE_INFO[mode as keyof typeof MODE_INFO];
  return m ? { local: m.group === "local", label: m.label } : { local: true, label: `mode « ${mode} »` };
}

interface Shot {
  key: string;
  url: string;
  caption: string;
  at: string;
}

/** Ce que les explorations du projet ont reçu, lu dans l'état de la plateforme (vue du compte). */
export interface DiscoveryData {
  investigations: Investigation[];
  observations: Observation[];
  events: AgentEvent[];
  schemas: StoredSchema[];
  models: StoredRuleModel[];
  shots: Shot[];
  /** Évènements émis par l'agent (Explorer) ou l'Analyste : seuls signes d'une exploration réelle. */
  fromAgents: number;
  counts: { success: number; error: number; failed: number };
}

function versionsFrom(events: AgentEvent[], type: AgentEvent["type"]): number[] {
  const out: number[] = [];
  for (const e of events) {
    if (e.type !== type) continue;
    const v = (e.data as { version?: unknown } | undefined)?.version;
    if (typeof v === "number" && !out.includes(v)) out.push(v);
  }
  return out;
}

export function discoveryData(state: RebornState, projectId: string): DiscoveryData {
  const investigations = state.investigations.filter((i) => i.project_id === projectId);
  const ids = new Set(investigations.map((i) => i.id));
  const mine = (x: { investigation_id?: string; project_id?: string }) => (!!x.investigation_id && ids.has(x.investigation_id)) || x.project_id === projectId;
  const events = state.events.filter((e) => mine(e as AgentEvent & { project_id?: string }) && e.type !== "migration");
  const observations = state.observations.filter((o) => mine(o as Observation & { project_id?: string }));
  const byVersion = <T extends { version: number }>(list: T[], versions: number[]) =>
    versions
      .map((v) => list.find((x) => x.version === v))
      .filter((x): x is T => !!x)
      .sort((a, b) => b.version - a.version);
  const schemas = byVersion(state.schemas, versionsFrom(events, "schema_updated"));
  const models = byVersion(state.models, versionsFrom(events, "rules_updated"));

  const seen = new Set<string>();
  const shots: Shot[] = [];
  for (const e of events) {
    const url = connSafeShot(e.screenshot_url);
    if (url && !seen.has(url)) {
      seen.add(url);
      shots.push({ key: e.id, url, caption: e.title, at: e.ts });
    }
  }
  observations.forEach((o, i) => {
    const url = connSafeShot(o.screenshot_url);
    if (url && !seen.has(url)) {
      seen.add(url);
      shots.push({ key: `${o.experiment_id}-${i}`, url, caption: o.experiment_id, at: o.received_at ?? "" });
    }
  });
  shots.sort((a, b) => b.at.localeCompare(a.at));
  const counts = { success: 0, error: 0, failed: 0 };
  for (const o of observations) {
    if (o.status === "success") counts.success++;
    else if (o.status === "error") counts.error++;
    else counts.failed++;
  }
  return { investigations, observations, events, schemas, models, shots, counts, fromAgents: events.filter((e) => e.source === "explorer" || e.source === "analyst").length };
}

/* ------------------------------------------------------------------ */
/* Origine des sources                                                  */
/* ------------------------------------------------------------------ */

export type SourceOrigin = "connector" | "agent" | "manual" | "api";

/** Qui a fourni le fichier : connecteur HTTP de REBORN, agent, import manuel, ou envoi par API. */
export function sourceOrigin(s: SourceMeta): SourceOrigin {
  if (s.origin.kind === "http_export") return "connector";
  if (s.origin.kind === "upload" || s.origin.by === UPLOAD_BY) return "manual";
  if (/explorer|agent|mouss|computer use/i.test(s.origin.by ?? "")) return "agent";
  return "api";
}

/** Fichier téléchargé par la dernière extraction, faite avec le plan de test Relatio 2004. */
export function fromTestPlan(s: SourceMeta, ex: ExtractionSummary | null): boolean {
  if (!ex || ex.system !== TEST_SYSTEM || s.origin.kind !== "http_export") return false;
  return ex.results.some((r) => r.status === "ok" && r.id === s.origin.mechanism && r.file === s.name);
}

/* ------------------------------------------------------------------ */
/* Chronologie                                                          */
/* ------------------------------------------------------------------ */

export interface Milestone {
  key: string;
  at: string;
  tone: Tone;
  status: string;
  title: string;
  detail?: ReactNode;
  test?: boolean;
  /** Faits regroupés sous le jalon (ex. chaque export d'une même extraction). */
  items?: { key: string; tone: "ok" | "warn" | "bad"; text: string }[];
}

/**
 * Jalons réellement reçus, du plus ancien au plus récent : demande d'analyse, rapport de
 * connexion, explorations, modules et écrans décrits, exports disponibles ou refusés.
 * Un jalon n'apparaît que s'il existe dans les données du Studio.
 */
export function buildTimeline({
  details,
  mission,
  data,
  sources,
  extraction,
}: {
  details: ProjectDetails | null;
  mission: AnalysisMission | null;
  data: DiscoveryData | null;
  sources: SourceMeta[] | null;
  extraction: ExtractionSummary | null;
}): Milestone[] {
  const out: Milestone[] = [];
  if (mission?.created_at) out.push({ key: `mission-${mission.id}`, at: mission.created_at, tone: "neutral", status: "Demande", title: "Analyse demandée", detail: `Référence ${mission.id}` });

  const c = details?.connection;
  if (c) {
    const s = CONN_STATE[c.status] ?? CONN_STATE.none;
    const who = connByConnector(c.by) ? "connecteur de REBORN, sans l'agent" : `rapport de ${c.by}`;
    const detail = c.detail ? `${c.detail}${connByConnector(c.by) && /connecteur/i.test(c.detail) ? "" : ` · ${who}`}` : who;
    if (c.status === "connected") out.push({ key: "conn", at: c.at, tone: "ok", status: "Connecté", title: "Connexion au logiciel établie", detail, test: connByTestPlan(c.by) });
    else if (c.status === "mfa_required" || c.status === "human_needed")
      out.push({ key: "conn", at: c.at, tone: "warn", status: "Intervention", title: "Intervention nécessaire", detail: `${c.status === "mfa_required" ? "Double authentification demandée : à vous d'intervenir." : s.text}${c.detail ? ` ${c.detail}` : ""} · ${who}` });
    else if (c.status === "failed") out.push({ key: "conn", at: c.at, tone: "bad", status: "Échec", title: "Échec de la connexion", detail, test: connByTestPlan(c.by) });
    else out.push({ key: "conn", at: c.at, tone: "running", status: "En cours", title: "Connexion en cours d'établissement", detail });
  }

  for (const i of data?.investigations ?? []) {
    const mode = connMode(i.mode);
    out.push({ key: `inv-${i.id}`, at: i.created_at, tone: "neutral", status: "Exploration", title: `Exploration n° ${i.number} ouverte`, detail: mode.local ? `Essai local (${mode.label}), sans agent` : `${i.application}${PLACEHOLDER_MODULES.has(i.module) ? "" : ` — ${i.module}`}`, test: mode.local });
    if (i.completed_at) out.push({ key: `inv-end-${i.id}`, at: i.completed_at, tone: i.status === "failed" ? "bad" : "neutral", status: i.status === "failed" ? "Échec" : "Terminée", title: `Exploration n° ${i.number} ${i.status === "failed" ? "en échec" : "terminée"}`, test: mode.local });
  }

  // Modules : premier écran reçu pour chaque module ; écrans sans module : un jalon par écran
  const firstByModule = new Map<string, StoredSchema[]>();
  for (const s of [...(data?.schemas ?? [])].sort((a, b) => a.received_at.localeCompare(b.received_at))) {
    const m = s.module && !PLACEHOLDER_MODULES.has(s.module) ? s.module : "";
    firstByModule.set(m, [...(firstByModule.get(m) ?? []), s]);
  }
  for (const [m, list] of firstByModule) {
    if (m) out.push({ key: `mod-${m}`, at: list[0].received_at, tone: "ok", status: "Découvert", title: `Module « ${m} » découvert`, detail: connCount(list.length, "écran décrit", "écrans décrits"), test: list.every((s) => s.source === "fixture") });
    else for (const s of list) out.push({ key: `scr-${s.version}`, at: s.received_at, tone: "ok", status: "Décrit", title: `Écran « ${s.title ?? `v${s.version}`} » décrit`, detail: connCount(s.fields.length, "champ"), test: s.source === "fixture" });
  }

  // Dernière extraction : un jalon qui regroupe chacun de ses exports (disponibles, refusés, introuvables)
  const grouped = new Set<string>();
  if (extraction?.results.length) {
    const items: NonNullable<Milestone["items"]> = [];
    let ok = 0;
    let refused = 0;
    for (const r of extraction.results) {
      const label = r.label ?? r.id;
      if (r.status === "ok") {
        const src = (sources ?? []).find((x) => x.origin.kind === "http_export" && x.origin.mechanism === r.id && x.name === r.file);
        if (src) grouped.add(src.id);
        const rows = src ? src.tables.reduce((n, t) => n + t.rows, 0) : null;
        const what = src?.archive_entries !== undefined ? connCount(src.archive_entries, "fichier") : rows !== null ? connCount(rows, "ligne") : null;
        items.push({ key: `ok-${r.id}`, tone: "ok", text: `Export « ${r.file ?? label} » disponible${what ? ` — ${what}` : ""}` });
        ok++;
      } else if (r.status === "forbidden" || r.status === "unauthorized") {
        items.unshift({ key: `ref-${r.id}`, tone: "warn", text: `Export « ${label} » refusé au compte` });
        refused++;
      } else items.unshift({ key: `ko-${r.id}`, tone: "bad", text: `Export « ${label} » ${r.status === "not_found" ? "introuvable" : "en erreur"}` });
    }
    const failed = extraction.results.length - ok - refused;
    out.push({
      key: "extraction",
      at: extraction.at,
      tone: refused || failed ? "warn" : "ok",
      status: "Extraction",
      title: `Extraction : ${connCount(ok, "export disponible", "exports disponibles")}${refused ? `, ${connCount(refused, "refusé", "refusés")} au compte` : ""}${failed ? `, ${connCount(failed, "en échec", "en échec")}` : ""}`,
      detail: `Récupérés par le connecteur de REBORN avec le compte ${extraction.account} ; un refus n'est jamais contourné.`,
      test: extraction.system === TEST_SYSTEM,
      items,
    });
  }

  for (const s of sources ?? []) {
    const o = sourceOrigin(s);
    if (o === "manual" || grouped.has(s.id)) continue;
    const rows = s.tables.reduce((n, t) => n + t.rows, 0);
    const what = s.archive_entries !== undefined ? connCount(s.archive_entries, "fichier") : connCount(rows, "ligne");
    out.push({
      key: `src-${s.id}`,
      at: s.received_at,
      tone: "ok",
      status: "Disponible",
      title: `Export « ${s.name} » disponible`,
      detail: `${what} · ${o === "connector" ? "récupéré par le connecteur de REBORN" : o === "agent" ? "déposé par l'agent" : `envoyé par ${s.origin.by ?? "API"}`}`,
      test: fromTestPlan(s, extraction),
    });
  }
  return out.filter((m) => !Number.isNaN(new Date(m.at).getTime())).sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}

export function DiscoveryTimeline({ items }: { items: Milestone[] }) {
  if (!items.length) return <EmptyState title="Aucun évènement reçu pour l'instant">Chaque fait réel (connexion, module découvert, export disponible, intervention nécessaire) s&apos;inscrira ici, à sa date.</EmptyState>;
  return (
    <ol className="relative flex flex-col" aria-label="Chronologie, du plus ancien au plus récent">
      {items.map((m, i) => (
        <li key={m.key} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
          <span aria-hidden className="relative flex justify-center">
            <span className={cx("mt-1.5 size-2.5 rounded-full ring-4 ring-surface", m.tone === "ok" ? "bg-accent" : m.tone === "warn" ? "bg-warning" : m.tone === "bad" ? "bg-danger" : "bg-text-3")} />
            {i < items.length - 1 && <span className="absolute top-5 bottom-[-6px] w-px bg-line-strong" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body font-semibold text-ink">{m.title}</span>
              <StatusBadge tone={m.tone}>{m.status}</StatusBadge>
              {m.test && <TestBadge />}
            </div>
            <p className="mt-0.5 text-small break-words text-text-2">
              <time dateTime={m.at} className="tabular text-text-3">
                {connDate(m.at)}
              </time>
              {m.detail ? <> · {m.detail}</> : null}
            </p>
            {m.items && m.items.length > 0 && (
              <ul className="mt-2 grid gap-x-6 gap-y-1 rounded-control bg-canvas px-3 py-2.5 ring-1 ring-line md:grid-cols-2">
                {m.items.map((it) => (
                  <li key={it.key} className="flex min-w-0 items-start gap-2 text-small text-text-2">
                    <span aria-hidden className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", it.tone === "ok" ? "bg-accent" : it.tone === "warn" ? "bg-warning" : "bg-danger")} />
                    <span className={cx("min-w-0 break-words", it.tone !== "ok" && "font-medium text-ink")}>{it.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Modules et écrans                                                    */
/* ------------------------------------------------------------------ */

function Summary({ children }: { children: ReactNode }) {
  return (
    <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">{children}</span>
      <ChevronDown size={16} className="mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-base) group-open:rotate-180" aria-hidden />
    </summary>
  );
}

/** Écrans décrits, regroupés par module. */
export function DiscoveryModules({ schemas }: { schemas: StoredSchema[] }) {
  if (!schemas.length) return <EmptyState title="Aucun écran décrit pour l'instant">Chaque écran exploré apparaîtra ici avec ses champs, ses valeurs possibles et ses sorties.</EmptyState>;
  const groups = new Map<string, StoredSchema[]>();
  for (const s of schemas) {
    const m = s.module && !PLACEHOLDER_MODULES.has(s.module) ? s.module : "Module non précisé";
    groups.set(m, [...(groups.get(m) ?? []), s]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups].map(([m, list]) => (
        <section key={m} aria-label={`Module ${m}`}>
          <h3 className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
            {m} <Badge>{connCount(list.length, "écran")}</Badge>
          </h3>
          <ul className="mt-1 divide-y divide-line border-t border-line">
            {list.map((s) => (
              <SchemaItem key={s.version} s={s} open={schemas.length === 1} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SchemaItem({ s, open }: { s: StoredSchema; open: boolean }) {
  const name = s.title ?? s.module ?? s.application ?? `Écran v${s.version}`;
  const unsupported = s.unsupported?.length ?? 0;
  return (
    <li>
      <details open={open} className="group">
        <Summary>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">{name}</span>
            <Badge>v{s.version}</Badge>
            {s.source === "fixture" && <TestBadge>Jeu de test</TestBadge>}
          </span>
          <span className="mt-0.5 block text-small text-text-3">
            {connCount(s.fields.length, "champ")}
            {s.outputs?.length ? ` · ${connCount(s.outputs.length, "sortie")}` : ""}
            {unsupported ? ` · ${unsupported} non reconstruit${unsupported > 1 ? "s" : ""}` : ""} · {sourceLabel(s.source)} · {connDate(s.received_at)}
          </span>
        </Summary>
        <div className="flex flex-col gap-4 pb-4">
          {s.description && <p className="text-body leading-relaxed text-text-2">{s.description}</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {s.fields.map((f, i) => (
              <li key={`${f.name}-${i}`} className="min-w-0 rounded-control bg-canvas px-3 py-2.5 ring-1 ring-line">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-body font-semibold text-ink">{f.label ?? f.name}</span>
                  {f.required && <span className="text-meta font-semibold text-warning-ink">Obligatoire</span>}
                </div>
                <div className="font-mono text-meta break-all text-text-3">
                  {f.name} · {String(f.type)}
                  {f.unit ? ` · ${f.unit}` : ""}
                  {typeof f.min === "number" || typeof f.max === "number" ? ` · ${f.min ?? "…"} à ${f.max ?? "…"}` : ""}
                </div>
                {f.options?.length ? <div className="mt-1 text-small leading-snug break-words text-text-2">{f.options.map((o) => (o.label && o.label !== o.value ? `${o.value} (${o.label})` : o.value)).join(" · ")}</div> : null}
                {f.help && <div className="mt-1 text-small text-text-3">{f.help}</div>}
              </li>
            ))}
          </ul>
          {s.outputs?.length ? (
            <div>
              <h4 className="mb-2 text-small font-semibold text-ink">Sorties affichées</h4>
              <ul className="flex flex-wrap gap-1.5">
                {s.outputs.map((o, i) => (
                  <li key={`${o.name}-${i}`} className="rounded-xs bg-canvas px-2.5 py-1 text-small ring-1 ring-line">
                    <span className="font-semibold text-ink">{o.label ?? o.name}</span>
                    {o.format || o.unit ? <span className="text-text-3"> · {[o.format, o.unit].filter(Boolean).join(" · ")}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Anomalies                                                            */
/* ------------------------------------------------------------------ */

export interface Anomaly {
  key: string;
  tone: "warn" | "bad";
  title: string;
  detail?: string;
  test?: boolean;
}

/** Anomalies réellement relevées : exports refusés, éléments non reconstruits, essais non aboutis, erreurs signalées, avertissements de lecture. */
export function collectAnomalies(data: DiscoveryData | null, sources: SourceMeta[] | null, extraction: ExtractionSummary | null): Anomaly[] {
  const out: Anomaly[] = [];
  for (const r of extraction?.results ?? []) {
    if (r.status === "ok") continue;
    const label = r.label ?? r.id;
    const refused = r.status === "forbidden" || r.status === "unauthorized";
    out.push({ key: `ex-${r.id}`, tone: refused ? "warn" : "bad", title: refused ? `Export refusé au compte : ${label}` : r.status === "not_found" ? `Export introuvable : ${label}` : `Export en erreur : ${label}`, detail: r.message?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || undefined, test: extraction?.system === TEST_SYSTEM });
  }
  for (const s of data?.schemas ?? []) for (const u of s.unsupported ?? []) out.push({ key: `un-${s.version}-${u.label}`, tone: "warn", title: `Élément observé mais non reconstruit : ${u.label}`, detail: [s.title ?? s.module, u.reason].filter(Boolean).join(" — "), test: s.source === "fixture" });
  if (data?.counts.failed) out.push({ key: "obs-failed", tone: "warn", title: connCount(data.counts.failed, "essai non abouti", "essais non aboutis"), detail: "Menés par l'agent mais sans résultat lisible : exclus des comparaisons." });
  for (const e of data?.events ?? []) if (e.type === "error" && (e.source === "explorer" || e.source === "analyst")) out.push({ key: `err-${e.id}`, tone: "bad", title: e.title, detail: `${sourceLabel(e.source)} · ${connDate(e.ts)}${e.detail ? ` · ${e.detail}` : ""}` });
  for (const s of sources ?? []) for (const w of s.warnings) out.push({ key: `w-${s.id}-${w}`, tone: "warn", title: `Avertissement de lecture : ${s.name}`, detail: w });
  return out;
}

export function DiscoveryAnomalies({ items }: { items: Anomaly[] }) {
  return (
    <ul className="divide-y divide-line rounded-panel ring-1 ring-line">
      {items.map((a) => (
        <li key={a.key} className="flex flex-col gap-1 px-4 py-3">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={a.tone}>{a.tone === "bad" ? "Erreur" : "À vérifier"}</StatusBadge>
            <span className="text-body font-semibold break-words text-ink">{a.title}</span>
            {a.test && <TestBadge />}
          </span>
          {a.detail && <span className="text-small break-words text-text-2">{a.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Détails repliés : règles, observations, captures, journal            */
/* ------------------------------------------------------------------ */

export function DiscoveryDetails({ data: d }: { data: DiscoveryData }) {
  const latest = d.models[0] ?? null;
  const obs = d.observations.length;
  return (
    <>
      {d.models.length > 0 && (
        <Section collapsible title="Règles proposées" badge={latest ? <Badge>{connNum(latest.rules.length)}</Badge> : undefined} description={latest ? `Modèle v${latest.version} · propositions de l'Analyste, à vérifier à l'étape Reconstruction` : undefined}>
          <ul className="divide-y divide-line">
            {d.models.map((m, i) => (
              <ModelItem key={m.version} m={m} open={i === 0} />
            ))}
          </ul>
        </Section>
      )}
      {obs > 0 && (
        <Section
          collapsible
          title="Observations"
          badge={<Badge>{connNum(obs)}</Badge>}
          description={[d.counts.error ? connCount(d.counts.error, "refus affiché", "refus affichés") : null, d.counts.failed ? connCount(d.counts.failed, "essai non abouti", "essais non aboutis") : null].filter(Boolean).join(" · ") || "Essais menés à l'écran, tous avec un résultat affiché"}
        >
          <ObservationList observations={d.observations} />
        </Section>
      )}
      {d.shots.length > 0 && (
        <Section collapsible title="Captures d'écran" badge={<Badge>{connNum(d.shots.length)}</Badge>} description="Preuves jointes aux actions et aux observations">
          <ShotGrid shots={d.shots} />
        </Section>
      )}
      {d.events.length > 0 && (
        <Section collapsible title="Journal de l'exploration" badge={<Badge>{connNum(d.events.length)}</Badge>} description="Actions rapportées, dans l'ordre">
          <Journal events={d.events} />
        </Section>
      )}
    </>
  );
}

const RULE_TONE: Record<string, Tone> = { hypothesis: "warn", tested: "info", validated: "ok", rejected: "bad" };

function ModelItem({ m, open }: { m: StoredRuleModel; open: boolean }) {
  return (
    <li>
      <details open={open} className="group">
        <Summary>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">Modèle v{m.version}</span>
            <span className="text-small text-text-2">{m.module}</span>
            {m.source === "fixture" && <TestBadge>Jeu de test</TestBadge>}
          </span>
          <span className="mt-0.5 block text-small text-text-3">
            {connCount(m.rules.length, "règle")} · {sourceLabel(m.source)} · reçu le {connDate(m.received_at)}
          </span>
        </Summary>
        <ul className="mb-4 divide-y divide-line rounded-panel ring-1 ring-line">
          {m.rules.map((r, i) => {
            const status = r.validation_status ?? "hypothesis";
            return (
              <li key={`${r.id}-${i}`} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge className="font-mono">{r.id}</Badge>
                  <StatusBadge tone={RULE_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</StatusBadge>
                </div>
                <p className="mt-1 text-body leading-snug break-words text-ink">{r.description ?? r.type}</p>
                {r.evidence?.length ? (
                  <p className="mt-1.5 text-small text-text-3">Preuves : {r.evidence.slice(0, 6).join(", ")}{r.evidence.length > 6 ? ` (+${r.evidence.length - 6})` : ""}</p>
                ) : (
                  <p className="mt-1 text-small text-warning-ink">Aucune preuve citée</p>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

function ObservationList({ observations }: { observations: Observation[] }) {
  const list = observations.slice(-OBS_LIMIT).reverse();
  return (
    <>
      <ol className="max-h-[640px] divide-y divide-line overflow-y-auto">
        {list.map((o, i) => {
          const shot = connSafeShot(o.screenshot_url);
          return (
            <li key={`${o.experiment_id}-${o.received_at ?? ""}-${i}`} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_112px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="font-mono">{o.experiment_id}</Badge>
                  {o.status === "success" ? <StatusBadge tone="ok">Résultat affiché</StatusBadge> : o.status === "error" ? <StatusBadge tone="warn">Refus affiché</StatusBadge> : <StatusBadge tone="neutral">Non abouti</StatusBadge>}
                  {o.received_at && (
                    <time dateTime={o.received_at} className="tabular text-meta text-text-3">
                      {connHour(o.received_at)}
                    </time>
                  )}
                </div>
                <p className="mt-2 text-small text-text-2">
                  <span className="text-text-3">Saisi : </span>
                  {Object.entries(o.inputs ?? {}).map(([k, v]) => `${k} = ${connValue(v)}`).join(" · ") || "—"}
                </p>
                {o.status === "success" && (
                  <p className="text-small text-text-2">
                    <span className="text-text-3">Affiché : </span>
                    {Object.entries(o.observed_output ?? {}).map(([k, v]) => `${k} = ${connValue(v)}`).join(" · ") || "—"}
                  </p>
                )}
                {o.status === "error" && <p className="text-small break-words text-danger-ink">Message : {o.error ?? "refus sans message transmis"}</p>}
              </div>
              {shot ? <ShotImage url={shot} alt={`Capture de l'essai ${o.experiment_id}`} /> : <span className="hidden sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {observations.length > OBS_LIMIT && (
        <p className="mt-2 text-small text-text-3">
          Les {OBS_LIMIT} plus récentes sur {connNum(observations.length)}.
        </p>
      )}
    </>
  );
}

function ShotImage({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <span className="flex aspect-[4/3] w-full items-center justify-center gap-1 rounded-xs bg-canvas px-2 text-center text-meta text-text-3">
        <ImageOff size={13} aria-hidden /> Capture indisponible
      </span>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xs bg-canvas" title="Ouvrir la capture en taille réelle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="aspect-[4/3] w-full object-cover object-top outline outline-1 -outline-offset-1 outline-black/10" />
    </a>
  );
}

function ShotGrid({ shots }: { shots: Shot[] }) {
  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shots.slice(0, SHOT_LIMIT).map((s) => (
          <li key={s.key} className="min-w-0">
            <figure>
              <ShotImage url={s.url} alt={`Capture — ${s.caption}`} />
              <figcaption className="mt-1.5 line-clamp-2 text-small leading-snug break-words text-text-2">{s.caption}</figcaption>
              {s.at && (
                <time dateTime={s.at} className="tabular block text-meta text-text-3">
                  {connDate(s.at)}
                </time>
              )}
            </figure>
          </li>
        ))}
      </ul>
      {shots.length > SHOT_LIMIT && (
        <p className="mt-3 text-small text-text-3">
          Les {SHOT_LIMIT} plus récentes sur {connNum(shots.length)}.
        </p>
      )}
    </>
  );
}

function Journal({ events }: { events: AgentEvent[] }) {
  const list = events.slice(-EVENT_LIMIT).reverse();
  return (
    <div className="flex flex-col gap-3">
      <ol className="max-h-[560px] divide-y divide-line overflow-y-auto">
        {list.map((e) => (
          <li key={e.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 py-2.5">
            <time dateTime={e.ts} className="tabular pt-px text-small text-text-3">
              {connHour(e.ts)}
            </time>
            <div className="min-w-0">
              <p className={cx("text-body leading-snug break-words", e.type === "error" || e.type === "drift" ? "font-semibold text-danger-ink" : "text-ink")}>
                <span className="mr-1.5 text-meta font-semibold text-text-3">{sourceLabel(e.source)}</span>
                {e.title}
              </p>
              {e.detail && <p className="mt-0.5 text-small leading-snug break-words text-text-2">{e.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      {events.length > EVENT_LIMIT && (
        <p className="text-small text-text-3">
          Les {EVENT_LIMIT} plus récents sur {connNum(events.length)}.
        </p>
      )}
    </div>
  );
}
