"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { ArrowRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, CircleCheck, Database, FlaskConical, Inbox, Sparkles, TriangleAlert } from "lucide-react";
import { Button, ButtonLink, Empty, Panel, cx, inputCls } from "@/components/ui";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { STEPS } from "@/components/project/ProjectShell";
import { anchorOf, AttachmentRow, blockerText, EntityCard, entityOfKey, FocusLink, IssueList, indexMapping, MappingLegend, RelationsList, ReviewList, type MappingIndex } from "@/components/project/DataMapping";
import {
  Chip,
  dt,
  Kpi,
  LoadError,
  Loading,
  nf,
  Notice,
  ORIGIN,
  plural,
  shortHash,
  Spinner,
  StepHeader,
  TEST_SYSTEM,
  TestBadge,
  useAction,
  useKeyedData,
  legacyTables,
  WRAP_BTN,
  type ExtractionSummary,
  type MappingPostResponse,
  type MappingResponse,
  type MappingVersion,
  type PlanStatus,
  type SourceMeta,
  type SourceProfile,
} from "@/components/project/DataKit";

/*
 * Étape « Correspondances » : comment chaque table / colonne ancienne devient une entité / un champ
 * du nouveau logiciel.
 * - GET /api/migration/mapping : version en vigueur, problèmes du contrat, points à valider, bloquants.
 * - POST /api/migration/mapping?propose=auto | ?fixture=crm (jeu de test) | ?source=user (corps contrat).
 *   Les envois de l'Analyste arrivent par POST /api/migration/mapping (sans passer par cet écran).
 * - POST /api/migration/decisions : accepter / exclure un point incertain (protection de l'historique incluse).
 * - GET /api/migration/sources et /api/migration/profile : données lues, pour situer chaque colonne.
 */

const STEP_INDEX = STEPS.findIndex((s) => s.slug === "correspondances");
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function CorrespondancesPage() {
  const { id } = useProject();
  const mapping = useProjectData<MappingResponse>("/api/migration/mapping");
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const fingerprint = useMemo(() => (sources.data ?? []).map((s) => s.sha256).join(","), [sources.data]);
  const profile = useKeyedData<SourceProfile>(sources.data?.length ? "/api/migration/profile" : null, fingerprint);
  // Manifeste de la dernière extraction (vue d'ensemble) : noms des tables dans l'ancien logiciel
  const overview = useKeyedData<{ extraction: ExtractionSummary | null }>(sources.data?.length ? "/api/migration" : null, fingerprint);
  const legacy = useMemo(() => legacyTables(sources.data ?? [], overview.data?.extraction ?? null), [sources.data, overview.data]);
  const current = mapping.data?.current ?? null;
  const status = mapping.data?.status ?? null;
  const idx = useMemo(() => (current && status ? indexMapping(current.mapping, status.items, current.issues, profile.data, legacy) : null), [current, status, profile.data, legacy]);

  // Entités dépliées : par défaut toutes (≤ 12), sinon celles qui demandent une action ; mémorisé par version
  const [openState, setOpenState] = useState<{ version: number; names: Set<string> } | null>(null);
  const defaultOpen = useMemo(() => {
    if (!current || !idx) return new Set<string>();
    const ents = current.mapping.entities;
    return new Set((ents.length <= 12 ? ents : ents.filter((e) => idx.pendingOf(e.name).length > 0 || idx.issuesOf(e.name).some((i) => i.level === "error"))).map((e) => e.name));
  }, [current, idx]);
  const openSet = openState && current && openState.version === current.version ? openState.names : defaultOpen;
  const updateOpen = (fn: (s: Set<string>) => Set<string>) => {
    if (current) setOpenState({ version: current.version, names: fn(new Set(openSet)) });
  };

  // Navigation interne : déplie l'entité visée, la met en évidence et y fait défiler la page
  const [highlight, setHighlight] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(scrollTo)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    setScrollTo(null);
  }, [scrollTo]);
  const focus = (key: string) => {
    const ent = entityOfKey(key);
    if (ent) updateOpen((s) => s.add(ent));
    setHighlight(key);
    setScrollTo(anchorOf(key).slice(1));
  };

  const late = current && sources.data ? sources.data.filter((s) => s.received_at > current.received_at) : [];
  const missing = current && profile.data ? [...new Set(current.mapping.entities.map((e) => e.source.table).filter((t) => !profile.data!.tables.some((x) => x.name === t)))] : [];
  const refs = current ? current.mapping.entities.reduce((n, e) => n + e.fields.filter((f) => f.type === "reference").length, 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader step={`Étape ${STEP_INDEX + 1} · ${STEPS[STEP_INDEX].label}`} title="Correspondances ancien → nouveau">
        Comment chaque table et chaque colonne de l&apos;ancien logiciel sont reprises dans le nouveau : type, transformations, références, protection de l&apos;historique. Rien n&apos;est importé tant que les points incertains ne sont
        pas tranchés par un humain.
      </StepHeader>

      {mapping.loading && !mapping.data ? (
        <Loading label="Chargement des correspondances…" />
      ) : mapping.error && !mapping.data ? (
        <LoadError message={mapping.error} onRetry={() => void mapping.reload()} />
      ) : !current || !status || !idx ? (
        <NoMapping id={id} sourcesLoaded={!!sources.data} hasSources={!!sources.data?.length} sourcesError={sources.error} onCreated={mapping.reload} />
      ) : (
        <>
          {mapping.error && <Notice tone="bad">Actualisation impossible : {mapping.error}</Notice>}

          <VersionBand current={current} status={status} idx={idx} id={id} onFocus={focus} />

          {(late.length > 0 || missing.length > 0) && (
            <Notice tone="warn" title="Les données ont changé depuis la réception de cette version">
              {late.length > 0 && (
                <span className="block">
                  Reçu(s) après la v{current.version} : {late.map((s) => s.name).join(", ")}. La cohérence de cette version a été contrôlée sur la structure lue le {dt(current.received_at)}.
                </span>
              )}
              {missing.length > 0 && <span className="block">Table(s) source introuvable(s) dans les données actuelles : {missing.join(", ")}.</span>}
              <span className="block">Recevez ou générez une nouvelle version pour recontrôler les correspondances.</span>
            </Notice>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:items-start">
            <div id="points-a-valider" className="min-w-0 scroll-mt-4">
              <Panel
                eyebrow="Validation humaine"
                title="Points à valider"
                actions={status.items.length ? <Chip tone={status.pending ? "warn" : "ok"}>{status.pending ? `${status.pending} en attente` : "tous tranchés"}</Chip> : undefined}
              >
                <p className="mb-3 text-[12.5px] text-sediment">
                  Correspondances dont la confiance est sous le seuil de {Math.round(current.mapping.review_threshold * 100)} %, et classements incertains de documents historiques : chacun doit être accepté ou exclu avant
                  l&apos;import. Chaque décision est consignée (auteur, date, commentaire) ; une exclusion figure au rapport d&apos;écarts.
                </p>
                {status.items.length ? (
                  <ReviewList key={current.version} items={status.items} threshold={current.mapping.review_threshold} onDecided={mapping.reload} onFocus={focus} />
                ) : (
                  <Empty
                    title="Aucun point à valider"
                    hint={`Toutes les correspondances de la v${current.version} ont une confiance d'au moins ${Math.round(current.mapping.review_threshold * 100)} %, ou non précisée (considérée comme sûre par le contrat).`}
                  />
                )}
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <IssuesPanel current={current} idx={idx} onFocus={focus} />
              <SourcePanel current={current} hasSources={!!sources.data?.length} onCreated={mapping.reload} />
            </div>
          </div>

          <Panel eyebrow="Schéma du nouveau logiciel" title={`Relations entre entités (${refs})`}>
            <p className="mb-3 text-[12.5px] text-sediment">
              Chaque référence relie un enregistrement à un autre (une facture à son client, une ligne à sa facture). Elle est résolue pendant la migration à partir de la clé d&apos;origine ; une référence introuvable est
              rejetée ou conservée sans lien selon la règle déclarée, et toujours signalée.
            </p>
            <RelationsList idx={idx} onFocus={focus} />
          </Panel>

          <section className="flex flex-col gap-3" aria-labelledby="entites-titre">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow">Correspondances détaillées</div>
                <h3 id="entites-titre" className="text-[16px] leading-snug font-bold tracking-[-0.01em]">
                  Entité par entité : ancienne table → nouvelle entité
                </h3>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => updateOpen(() => new Set(current.mapping.entities.map((e) => e.name)))}
                  className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px] font-bold text-sediment hover:bg-chalk-2 hover:text-ink"
                >
                  <ChevronsUpDown size={13} aria-hidden /> Tout déplier
                </button>
                <button type="button" onClick={() => updateOpen(() => new Set())} className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12px] font-bold text-sediment hover:bg-chalk-2 hover:text-ink">
                  <ChevronsDownUp size={13} aria-hidden /> Tout replier
                </button>
              </div>
            </div>
            <nav aria-label="Entités du nouveau logiciel" className="flex flex-wrap gap-1.5">
              {current.mapping.entities.map((e) => {
                const p = idx.pendingOf(e.name).length;
                return (
                  <a
                    key={e.name}
                    href={`#entite-${e.name}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      focus(`entity:${e.name}`);
                    }}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-sm bg-paper px-2 py-1 text-[12px] font-bold shadow-[0_0_0_1px_var(--color-line)] transition-colors duration-150 hover:bg-chalk",
                      idx.excludedEntities.has(e.name) && "text-silt line-through",
                    )}
                  >
                    {e.label ?? e.name}
                    <span className="tabular font-normal text-silt">{e.fields.length}</span>
                    {p > 0 && (
                      <span className="size-1.5 rounded-full bg-ochre" title={`${p} point(s) à valider`}>
                        <span className="sr-only">{p} point(s) à valider</span>
                      </span>
                    )}
                  </a>
                );
              })}
            </nav>
            <MappingLegend origin={current.origin} threshold={current.mapping.review_threshold} classified={idx.classified} />
            <div className="flex flex-col gap-3">
              {current.mapping.entities.map((e) => (
                <EntityCard
                  key={e.name}
                  e={e}
                  idx={idx}
                  open={openSet.has(e.name)}
                  onToggle={() =>
                    updateOpen((s) => {
                      if (s.has(e.name)) s.delete(e.name);
                      else s.add(e.name);
                      return s;
                    })
                  }
                  highlight={highlight}
                  onFocus={focus}
                />
              ))}
            </div>
          </section>

          <PerimeterPanel current={current} idx={idx} profile={profile.data} profileError={profile.error} sources={sources.data ?? []} highlight={highlight} />

          {status.can_run && (
            <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="max-w-[680px] text-[13px] text-sediment">Correspondances prêtes : aucun point en attente et aucune erreur bloquante. La migration construira la nouvelle base à partir des fichiers du coffre.</p>
              <ButtonLink href={`/projets/${id}/migration`} variant="accent">
                Passer à la migration <ArrowRight size={14} aria-hidden />
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Version en vigueur et état « prêt / bloqué »                         */
/* ------------------------------------------------------------------ */

function VersionBand({ current, status, idx, id, onFocus }: { current: MappingVersion; status: PlanStatus; idx: MappingIndex; id: string; onFocus: (key: string) => void }) {
  const m = current.mapping;
  const origin = ORIGIN[current.origin] ?? { label: current.origin, hint: "", test: false };
  const fields = m.entities.reduce((n, e) => n + e.fields.length, 0);
  const refs = m.entities.reduce((n, e) => n + e.fields.filter((f) => f.type === "reference").length, 0);
  const locked = m.entities.reduce((n, e) => n + e.fields.filter((f) => f.accounting).length, 0);
  const errors = current.issues.filter((i) => i.level === "error").length;
  const warnings = current.issues.length - errors;
  const decided = status.items.length - status.pending;

  return (
    <section className="card overflow-hidden" aria-label="Version des correspondances en vigueur">
      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Version en vigueur</span>
            {origin.test ? <TestBadge>{origin.label}</TestBadge> : <Chip>{origin.label}</Chip>}
          </div>
          <h3 className="mt-1.5 text-[17px] leading-snug font-black tracking-[-0.01em] break-words">
            v{current.version} · {m.source_system ?? "Ancien logiciel"} <span className="text-verdigris">→</span> {m.target.name} <span className="font-mono text-[12px] font-normal text-silt">{m.target.id}</span>
          </h3>
          <p className="mt-0.5 text-[12px] text-silt">
            Reçue le {dt(current.received_at)} · contrat v{m.contract_version} · empreinte {shortHash(current.sha256, 12)}
          </p>
          {origin.hint && <p className="mt-1.5 text-[12.5px] text-sediment">{origin.hint}</p>}
          {m.notes && <p className="mt-1 text-[12px] break-words text-sediment">Note de l&apos;émetteur : « {m.notes} »</p>}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Kpi label="Entités" value={nf(m.entities.length)} />
            <Kpi label="Champs" value={nf(fields)} />
            <Kpi label="Références" value={nf(refs)} />
            <Kpi label="Champs protégés" value={nf(locked)} />
          </dl>
        </div>
        <div className={cx("min-w-0 border-t border-line px-4 py-4 lg:border-t-0 lg:border-l", status.can_run ? "bg-verdigris-soft/50" : "bg-ochre-soft/40")}>
          {status.can_run ? (
            <>
              <div className="flex items-center gap-2 text-[14.5px] font-black text-[#0b6b5f]">
                <CircleCheck size={17} aria-hidden /> Prêt pour la migration
              </div>
              <p className="mt-1 text-[12.5px] text-ink">
                Constaté par l&apos;API : aucun point incertain en attente, aucune erreur bloquante dans le contrat, données présentes dans le coffre.
                {warnings ? ` ${plural(warnings, "avertissement")} à connaître (voir « Problèmes détectés »).` : ""}
              </p>
              <p className="mt-1 text-[12px] text-sediment">Les résultats de la migration seront contrôlés sur les vraies données à l&apos;étape Validation.</p>
              <ButtonLink href={`/projets/${id}/migration`} variant="accent" className="mt-3">
                Passer à la migration <ArrowRight size={14} aria-hidden />
              </ButtonLink>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[14.5px] font-black text-ochre">
                <TriangleAlert size={17} aria-hidden /> Migration pas encore possible
              </div>
              <p className="mt-1 text-[12px] text-sediment">Bloquants relevés par l&apos;API :</p>
              <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-ink">
                {status.blockers.map((b, i) => {
                  const t = blockerText(b, idx);
                  return (
                    <li key={`${i}-${b}`} className="flex gap-1.5">
                      <span className="text-ochre" aria-hidden>
                        •
                      </span>
                      <span className="min-w-0 break-words">
                        {t.focus ? (
                          <FocusLink to={t.focus} onFocus={onFocus}>
                            {t.text}
                          </FocusLink>
                        ) : /incertaine/.test(b) ? (
                          <a href="#points-a-valider" className="underline-offset-2 hover:text-verdigris hover:underline">
                            {t.text}
                          </a>
                        ) : (
                          t.text
                        )}
                      </span>
                    </li>
                  );
                })}
                {!status.blockers.length && (
                  <li className="flex gap-1.5">
                    <span className="text-ochre" aria-hidden>
                      •
                    </span>
                    <span>
                      Aucune donnée dans le coffre du projet :{" "}
                      <Link href={`/projets/${id}/extraction`} className="font-bold underline underline-offset-2">
                        étape Données
                      </Link>
                      .
                    </span>
                  </li>
                )}
              </ul>
            </>
          )}
          <p className="mt-3 text-[11.5px] text-silt">
            Points à valider : {decided}/{status.items.length} tranché(s) · seuil {Math.round(m.review_threshold * 100)} % · {plural(errors, "erreur bloquante", "erreurs bloquantes")} · {plural(warnings, "avertissement")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Problèmes du contrat                                                 */
/* ------------------------------------------------------------------ */

function IssuesPanel({ current, idx, onFocus }: { current: MappingVersion; idx: MappingIndex; onFocus: (key: string) => void }) {
  const errors = current.issues.filter((i) => i.level === "error").length;
  const warnings = current.issues.length - errors;
  return (
    <Panel
      eyebrow="Contrôle du contrat"
      title="Problèmes détectés"
      actions={
        current.issues.length ? (
          <span className="flex flex-wrap justify-end gap-1">
            {errors > 0 && <Chip tone="bad">{plural(errors, "erreur")}</Chip>}
            {warnings > 0 && <Chip tone="warn">{plural(warnings, "avertissement")}</Chip>}
          </span>
        ) : undefined
      }
    >
      <p className="mb-2.5 text-[12px] text-silt">
        Contrôles faits par l&apos;API à la réception de la v{current.version} ({dt(current.received_at)}), sur la structure lue à ce moment-là : tables et colonnes existantes, unicité des clés, références, types déclarés et lus,
        champs obligatoires vides, expressions, ordre d&apos;import. Une erreur bloque la migration ; un avertissement est à connaître.
      </p>
      {current.issues.length ? (
        <div className="max-h-[420px] overflow-y-auto pr-0.5">
          <IssueList issues={current.issues} idx={idx} onFocus={onFocus} />
        </div>
      ) : (
        <Notice tone="ok">Aucun problème détecté par ces contrôles.</Notice>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Sources des correspondances : Analyste, proposition, jeu de test     */
/* ------------------------------------------------------------------ */

function SourcePanel({ current, hasSources, onCreated }: { current: MappingVersion | null; hasSources: boolean; onCreated: () => Promise<void> }) {
  const { id, post } = useProject();
  const { busy, notice, setNotice, run } = useAction();
  const [confirm, setConfirm] = useState<null | "auto" | "fixture">(null);
  const [json, setJson] = useState("");
  const next = (current?.version ?? 0) + 1;

  const create = (kind: "auto" | "fixture" | "user", url: string, body?: unknown) =>
    run(
      kind,
      () => post<MappingPostResponse>(url, body),
      (r) => {
        setConfirm(null);
        void onCreated();
        const errors = r.issues.filter((i) => i.level === "error").length;
        const warnings = r.issues.length - errors;
        return {
          tone: errors ? "warn" : "ok",
          text: `Version ${r.version} créée : ${plural(r.review.pending, "point")} en attente de décision · ${plural(errors, "erreur bloquante", "erreurs bloquantes")} · ${plural(warnings, "avertissement")}.`,
        };
      },
    );
  const AUTO = "/api/migration/mapping?propose=auto";
  const FIXTURE = "/api/migration/mapping?fixture=crm";
  const start = (kind: "auto" | "fixture") => {
    if (current) setConfirm(kind);
    else void create(kind, kind === "auto" ? AUTO : FIXTURE);
  };

  return (
    <Panel eyebrow="Source des correspondances" title={current ? "Recevoir ou générer une nouvelle version" : "Obtenir une première version"}>
      <div className="flex flex-col gap-3">
        <div className="rounded-md px-3.5 py-3 shadow-[0_0_0_1px_var(--color-line-strong)]">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <Inbox size={14} className="text-verdigris" aria-hidden /> Envoi de l&apos;Analyste (agent d&apos;Alan)
          </div>
          <p className="mt-1 text-[12.5px] text-sediment">
            L&apos;Analyste publie ses correspondances directement par l&apos;API, sans passer par cet écran. Chaque envoi crée une nouvelle version, contrôlée contre la structure lue ; les décisions déjà prises sont conservées pour
            les points qui figurent encore dans la nouvelle version.
          </p>
          <code className="mt-2 block rounded-sm bg-chalk px-2.5 py-1.5 font-mono text-[11.5px] break-all text-ink">POST /api/migration/mapping?project={id}</code>
          <p className="mt-2 text-[12px]">
            {current?.origin === "analyst" ? (
              <span className="font-bold text-verdigris">Version en vigueur reçue de l&apos;Analyste le {dt(current.received_at)}.</span>
            ) : (
              <span className="font-bold text-ochre">En attente de l&apos;agent : {current ? "la version en vigueur ne provient pas de l'Analyste." : "aucun envoi de l'Analyste reçu."}</span>
            )}{" "}
            <a href="/api/migration/contracts" target="_blank" rel="noreferrer" className="font-bold whitespace-nowrap text-sediment underline underline-offset-2 hover:text-ink">
              Contrat (JSON Schema)
            </a>
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-md px-3.5 py-3 shadow-[0_0_0_1px_var(--color-line)]">
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <Sparkles size={14} className="text-ink-3" aria-hidden /> Proposition automatique
          </div>
          <p className="text-[12.5px] text-sediment">
            Déduite uniquement de la structure lue : une entité par table dotée d&apos;une clé unique, un champ par colonne, types et relations détectés, documents historiques protégés par défaut. Les codes sans signification
            connue, les colonnes vides et les relations incomplètes sont marqués « à valider ».
          </p>
          <Button size="sm" variant="ghost" className="self-start" disabled={!hasSources || !!busy} onClick={() => start("auto")}>
            {busy === "auto" ? <Spinner size={12} /> : <Sparkles size={12} aria-hidden />} Proposition automatique
          </Button>
        </div>

        <div className="flex flex-col gap-2 rounded-md bg-ochre-soft/25 px-3.5 py-3 shadow-[0_0_0_1px_var(--color-line)]">
          <TestBadge className="self-start">Jeu de test au format de l&apos;Analyste — Relatio</TestBadge>
          <p className="text-[12.5px] text-sediment">
            Correspondances écrites à la main pour les données du logiciel de test {TEST_SYSTEM}, au format que l&apos;Analyste enverra. Ce n&apos;est pas un envoi de l&apos;Analyste ; sur d&apos;autres données, les tables
            attendues seront signalées introuvables.
          </p>
          <Button size="sm" variant="ghost" className={cx("self-start", WRAP_BTN)} disabled={!hasSources || !!busy} onClick={() => start("fixture")}>
            {busy === "fixture" ? <Spinner size={12} /> : <FlaskConical size={12} aria-hidden />} Jeu de test au format de l&apos;Analyste — Relatio
          </Button>
        </div>

        {!hasSources && (
          <Notice tone="warn">
            Aucune donnée reçue : les correspondances se construisent et se contrôlent sur les données réellement lues.{" "}
            <Link href={`/projets/${id}/extraction`} className="inline-flex items-center gap-1 font-bold underline underline-offset-2">
              <Database size={12} aria-hidden /> Étape Données
            </Link>
          </Notice>
        )}

        {confirm && current && (
          <div className="rounded-md bg-ochre-soft/60 px-3 py-2.5 text-[12.5px]" role="group" aria-label="Confirmer la nouvelle version">
            <p className="text-ink">
              Créer la v{next} {confirm === "auto" ? "par proposition automatique" : `à partir du jeu de test ${TEST_SYSTEM}`} ? Elle remplacera la v{current.version} ({ORIGIN[current.origin]?.label ?? current.origin}) ; les
              décisions déjà prises sont conservées pour les points qui figurent encore dans la nouvelle version.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void create(confirm, confirm === "auto" ? AUTO : FIXTURE)}>
                {busy ? <Spinner size={12} /> : null} Créer la v{next}
              </Button>
              <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => setConfirm(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        <details
          className="group rounded-md shadow-[0_0_0_1px_var(--color-line)]"
          onToggle={(e: SyntheticEvent<HTMLDetailsElement>) => {
            if (e.currentTarget.open && !json && current) setJson(JSON.stringify(current.mapping, null, 2));
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px] font-bold text-sediment hover:text-ink [&::-webkit-details-marker]:hidden">
            Correction manuelle du contrat (JSON, avancé)
            <ChevronDown size={14} className="shrink-0 transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
            <p className="text-[12px] text-sediment">
              Pour corriger une correspondance sans attendre un nouvel envoi{current ? " : le contrat ci-dessous est pré-rempli avec la version en vigueur" : ""}. Il est contrôlé par l&apos;API comme tout envoi et enregistré comme
              « saisie opérateur », jamais comme un envoi de l&apos;Analyste.
            </p>
            <textarea
              className={cx(inputCls, "h-56 resize-y py-2 font-mono text-[11.5px] leading-relaxed")}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
              placeholder='{ "target": { "id": "…", "name": "…" }, "entities": [ … ] }'
              aria-label="Contrat de correspondances (JSON)"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className={WRAP_BTN}
                disabled={!json.trim() || !hasSources || !!busy}
                onClick={() => {
                  let body: unknown;
                  try {
                    body = JSON.parse(json);
                  } catch (e) {
                    setNotice({ tone: "bad", text: `Contrat illisible : JSON invalide (${(e as Error).message}).` });
                    return;
                  }
                  void create("user", "/api/migration/mapping?source=user", body);
                }}
              >
                {busy === "user" ? <Spinner size={12} /> : null} Enregistrer comme saisie opérateur (v{next})
              </Button>
            </div>
          </div>
        </details>

        {notice && (
          <Notice tone={notice.tone} onClose={() => setNotice(null)}>
            {notice.text}
          </Notice>
        )}
      </div>
    </Panel>
  );
}

function NoMapping({ id, sourcesLoaded, hasSources, sourcesError, onCreated }: { id: string; sourcesLoaded: boolean; hasSources: boolean; sourcesError: string | null; onCreated: () => Promise<void> }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
      <Panel eyebrow="Aucune version" title="Aucune correspondance pour ce projet">
        <div className="flex flex-col gap-3 text-[13px] text-sediment">
          <p>
            Les correspondances décrivent, entité par entité, d&apos;où vient chaque champ du nouveau logiciel : colonne d&apos;origine, type, transformations explicites, références vers les autres entités et protection de
            l&apos;historique comptable.
          </p>
          <p>Elles sont contrôlées par l&apos;API contre la structure réellement lue, et chaque point incertain doit être tranché par un humain avant la migration.</p>
          {sourcesError && <LoadError title="Sources indisponibles" message={sourcesError} />}
          {sourcesLoaded && !hasSources && (
            <Notice tone="warn">
              Aucune donnée reçue pour l&apos;instant.{" "}
              <Link href={`/projets/${id}/extraction`} className="font-bold underline underline-offset-2">
                Récupérer les données (étape Données)
              </Link>
            </Notice>
          )}
        </div>
      </Panel>
      <SourcePanel current={null} hasSources={hasSources} onCreated={onCreated} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Périmètre : pièces jointes, tables non reprises, tables écartées     */
/* ------------------------------------------------------------------ */

function PerimeterPanel({
  current,
  idx,
  profile,
  profileError,
  sources,
  highlight,
}: {
  current: MappingVersion;
  idx: MappingIndex;
  profile: SourceProfile | null;
  profileError: string | null;
  sources: SourceMeta[];
  highlight: string | null;
}) {
  const m = current.mapping;
  const attachments = m.attachments ?? [];
  const used = new Set([...m.entities.map((e) => e.source.table), ...attachments.map((a) => a.source.table), ...(m.excluded_sources ?? []).map((x) => x.table)]);
  const unmapped = profile ? profile.tables.filter((t) => !used.has(t.name)) : null;
  const unusedArchives = sources.filter((s) => s.format === "zip" && !attachments.some((a) => a.archive === s.name));

  return (
    <Panel eyebrow="Périmètre" title="Pièces jointes et données non reprises">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-1.5 text-[12.5px] font-bold text-sediment">Pièces jointes ({attachments.length})</h4>
          {attachments.length ? (
            <ul className="flex flex-col gap-2">
              {attachments.map((a, i) => (
                <AttachmentRow key={i} a={a} i={i} idx={idx} highlight={highlight} />
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-silt">Aucun rattachement de pièces jointes déclaré dans cette version.</p>
          )}
          {unusedArchives.length > 0 && (
            <p className="mt-2 text-[12px] text-ochre">
              Archive(s) reçue(s) sans rattachement : {unusedArchives.map((s) => s.name).join(", ")} — leurs fichiers ne seront pas rattachés aux enregistrements.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h4 className="mb-1.5 text-[12.5px] font-bold text-sediment">Tables lues sans correspondance{unmapped ? ` (${unmapped.length})` : ""}</h4>
            {unmapped === null ? (
              <p className="text-[12.5px] text-silt">{profileError ? `Structure lue indisponible (${profileError}) : impossible de lister les tables non reprises.` : "Structure lue en cours de chargement…"}</p>
            ) : unmapped.length ? (
              <>
                <ul className="flex flex-wrap gap-1.5">
                  {unmapped.map((t) => (
                    <li key={t.name}>
                      <Chip tone="warn">
                        <span className="font-mono">{t.name}</span> · {plural(t.rows, "ligne")}
                      </Chip>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[12px] text-sediment">Non migrées : elles figureront au rapport d&apos;écarts. Pour les reprendre, il faut une nouvelle version des correspondances.</p>
              </>
            ) : (
              <p className="text-[12.5px] text-verdigris">Toutes les tables lues sont reprises, rattachées ou écartées explicitement.</p>
            )}
          </div>
          {!!m.excluded_sources?.length && (
            <div>
              <h4 className="mb-1.5 text-[12.5px] font-bold text-sediment">Tables écartées volontairement ({m.excluded_sources.length})</h4>
              <ul className="flex flex-col gap-1 text-[12.5px] text-sediment">
                {m.excluded_sources.map((x) => (
                  <li key={x.table}>
                    <span className="font-mono font-bold text-ink">{x.table}</span> — {x.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
