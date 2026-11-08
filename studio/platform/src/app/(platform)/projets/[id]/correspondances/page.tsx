"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCheck, ChevronsDownUp, ChevronsUpDown, FlaskConical, Inbox, Settings2, Sparkles, X, type LucideIcon } from "lucide-react";
import { Badge, Button, Textarea, cx, formatPercent } from "@/components/ds";
import { projectCall, useProject, useProjectData } from "@/components/project/ProjectProvider";
import { Callout, Facts, Metric, Metrics, Section, StepHeader, TestBadge } from "@/components/project/Step";
import { useViewer } from "@/components/project/AppKit";
import {
  AttachmentRow,
  BulkAcceptDialog,
  CorrectFieldDialog,
  DecidedList,
  EntityGroup,
  FocusLink,
  IssueList,
  MappingNotes,
  ORIGIN,
  PendingList,
  RejectFieldDialog,
  RelationsList,
  TEST_SYSTEM,
  anchorOf,
  blockerText,
  dt,
  entityOfKey,
  indexMapping,
  legacyTables,
  matchesFilter,
  modifiesValue,
  nf,
  plural,
  useMappingActions,
  type BulkAcceptResponse,
  type ExtractionSummary,
  type FieldFilter,
  type MappingIndex,
  type MappingPostResponse,
  type MappingResponse,
  type MappingVersion,
  type RemovedField,
  type ReviewItem,
  type SourceMeta,
  type SourceProfile,
} from "@/components/project/DataMapping";

/*
 * Étape « Correspondances » : chaque champ de l'ancien logiciel et le champ du nouveau logiciel qui
 * le reprend (« Ancien champ → Nouveau champ »), avec type, transformation, incertitude et statut.
 * - GET /api/migration/mapping : version en vigueur, problèmes, points à vérifier, bloquants.
 * - POST /api/migration/mapping?propose=auto | ?fixture=crm (jeu de test) ; envoi de l'Analyste par l'API.
 * - POST /api/migration/decisions : accepter / rejeter une proposition incertaine.
 * - POST /api/migration/decisions/bulk : accepter en bloc les propositions restantes (après confirmation : nombre de
 *   points, protections de l'historique comptable listées à part et décochables).
 * - POST /api/migration/mapping/fields : corriger, rejeter ou reprendre un champ (nouvelle version).
 * La migration reste impossible côté serveur tant qu'un point bloquant subsiste.
 */

const NO_ENTITY = new Set<string>();
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ADVANCED_KEY = "reborn:correspondances:avance";

const SOURCE_URL = { auto: "/api/migration/mapping?propose=auto", fixture: "/api/migration/mapping?fixture=crm", user: "/api/migration/mapping?source=user" } as const;
type SourceKind = keyof typeof SOURCE_URL;

/** Charge une ressource uniquement quand `key` change (ex. empreintes des sources) : la structure lue n'est pas recalculée à chaque évènement. */
function useKeyed<T>(url: string | null, key: string) {
  const { id } = useProject();
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    if (!url) return setState({ data: null, error: null });
    try {
      const data = await projectCall<T>(id, "GET", url);
      if (n === seq.current) setState({ data, error: null });
    } catch (e) {
      if (n === seq.current) setState((s) => ({ data: s.data, error: (e as Error).message }));
    }
  }, [id, url]);
  useEffect(() => {
    void load();
  }, [load, key]);
  return { ...state, reload: load };
}

function useAdvanced(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(ADVANCED_KEY) === "1");
    } catch {}
  }, []);
  return [
    on,
    (v: boolean) => {
      setOn(v);
      try {
        window.localStorage.setItem(ADVANCED_KEY, v ? "1" : "0");
      } catch {}
    },
  ];
}

export default function CorrespondancesPage() {
  const { id, post } = useProject();
  const viewer = useViewer();
  const mapping = useProjectData<MappingResponse>("/api/migration/mapping");
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const fingerprint = useMemo(() => (sources.data ?? []).map((s) => s.sha256).join(","), [sources.data]);
  const profile = useKeyed<SourceProfile>(sources.data?.length ? "/api/migration/profile" : null, fingerprint);
  // Manifeste de la dernière extraction : noms des tables dans l'ancien logiciel (ex. T_CLIENT)
  const overview = useKeyed<{ extraction: ExtractionSummary | null }>(sources.data?.length ? "/api/migration" : null, fingerprint);
  const current = mapping.data?.current ?? null;
  const status = mapping.data?.status ?? null;
  const removedQ = useKeyed<{ removed: RemovedField[] }>(current ? "/api/migration/mapping/fields" : null, String(current?.version ?? 0));
  const legacy = useMemo(() => legacyTables(sources.data ?? [], overview.data?.extraction ?? null), [sources.data, overview.data]);
  const idx = useMemo(() => (current && status ? indexMapping(current, status.items, profile.data, legacy, removedQ.data?.removed ?? []) : null), [current, status, profile.data, legacy, removedQ.data]);
  const hasSources = !!sources.data?.length;
  const [advanced, setAdvanced] = useAdvanced();
  const [filter, setFilter] = useState<FieldFilter>("all");

  const reload = useCallback(async () => {
    await mapping.reload();
  }, [mapping]);
  const { actions, notice, setNotice, dialog, closeDialog, saved } = useMappingActions(current?.version ?? 0, reload);

  // Validation en bloc (« Accepter toutes les propositions restantes ») : le message de résultat reçoit le focus,
  // le bouton qui a ouvert la fenêtre disparaissant quand plus rien ne reste à vérifier.
  const [bulkOpen, setBulkOpen] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const bulkDone = useCallback(
    async (r: BulkAcceptResponse) => {
      const left = r.review.pending;
      const skipped = r.skipped ? ` (${plural(r.skipped, "point déjà tranché laissé", "points déjà tranchés laissés")} tel quel)` : "";
      const after = left ? `${plural(left, "point reste", "points restent")} à vérifier.` : r.review.can_run ? "Plus aucun point à vérifier : la migration est possible." : "Plus aucun point à vérifier.";
      setNotice({ tone: "ok", text: `${plural(r.accepted, "point accepté", "points acceptés")} en bloc à votre nom${skipped}. ${after}` });
      await mapping.reload();
      requestAnimationFrame(() => noticeRef.current?.focus());
    },
    [mapping, setNotice],
  );

  // Tables dépliées (repliées par défaut) : elles le restent d'une version à l'autre (une correction ne fait pas perdre sa place)
  const [openSet, setOpenSet] = useState<Set<string>>(NO_ENTITY);
  const updateOpen = (fn: (s: Set<string>) => Set<string>) => setOpenSet((prev) => fn(new Set(prev)));
  // Un filtre actif déplie les tables concernées
  const groupOpen = (name: string) => filter !== "all" || openSet.has(name);

  // Navigation interne : déplie la table visée, la met en évidence et y fait défiler la page
  const [highlight, setHighlight] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    const section = el?.closest("details");
    if (section && !section.open) section.open = true;
    el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    setScrollTo(null);
  }, [scrollTo]);
  const focus = (key: string) => {
    const ent = entityOfKey(key);
    if (ent) updateOpen((s) => s.add(ent));
    setHighlight(key);
    setScrollTo(anchorOf(key).slice(1));
  };

  const m = current?.mapping ?? null;
  const counts = useMemo(() => {
    if (!m || !idx) return null;
    const all = m.entities.flatMap((e) => e.fields.map((f) => ({ e, f })));
    return {
      fields: all.length,
      kept: all.filter(({ e, f }) => !idx.excludedEntities.has(e.name) && idx.item(`field:${e.name}.${f.name}`)?.decision?.decision !== "excluded").length,
      change: all.filter(({ f }) => modifiesValue(f)).length,
      locked: all.filter(({ e, f }) => matchesFilter(e, f, idx, "locked")).length,
      refs: all.filter(({ f }) => f.type === "reference").length,
      pendingFields: all.filter(({ e, f }) => matchesFilter(e, f, idx, "pending")).length,
    };
  }, [m, idx]);
  const decided = status?.items.filter((i) => i.decision) ?? [];
  const pendingItems = status?.items.filter((i) => !i.decision) ?? [];

  /* Source des correspondances ------------------------------------------- */
  const [confirm, setConfirm] = useState<null | "auto" | "fixture">(null);
  const [sourceBusy, setSourceBusy] = useState<SourceKind | null>(null);
  const [sourceNotice, setSourceNotice] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  async function create(kind: SourceKind, body?: unknown) {
    setSourceBusy(kind);
    setSourceNotice(null);
    try {
      const r = await post<MappingPostResponse>(SOURCE_URL[kind], body);
      setConfirm(null);
      const errors = r.issues.filter((i) => i.level === "error").length;
      setSourceNotice({ tone: errors ? "warn" : "ok", text: `Version ${r.version} créée : ${plural(r.review.pending, "point")} à vérifier${errors ? ` · ${plural(errors, "erreur bloquante", "erreurs bloquantes")}` : ""}.` });
      await mapping.reload();
    } catch (e) {
      setSourceNotice({ tone: "bad", text: (e as Error).message });
    } finally {
      setSourceBusy(null);
    }
  }
  const start = (kind: "auto" | "fixture") => (current ? setConfirm(kind) : void create(kind));

  const dlgEntity = dialog && m ? m.entities.find((e) => e.name === dialog.entity) : undefined;
  const dlgField = dialog && dlgEntity ? dlgEntity.fields.find((f) => f.name === dialog.field) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        step={4}
        title="Correspondances"
        lead="Correspondance des champs : chaque champ de votre ancien logiciel et celui qui le reprend dans le nouveau. Vérifiez les propositions incertaines : acceptez-les, corrigez-les ou rejetez-les."
        actions={
          status?.can_run && current ? (
            <Button href={`/projets/${id}/migration`} variant="primary" iconEnd={<ArrowRight size={16} />}>
              Passer à la migration
            </Button>
          ) : undefined
        }
        aside={current ? <VersionLine current={current} /> : undefined}
      />

      <Metrics>
        <Metric label="Champs repris" value={counts ? nf(counts.kept) : "—"} hint={counts && m ? `sur ${nf(counts.fields)}, dans ${plural(m.entities.length, "table")}` : undefined} />
        {/* Points = champs, tables, protections et pièces jointes à trancher ; le filtre du tableau ne compte que les champs */}
        <Metric
          label="Points à vérifier"
          value={current && status ? nf(status.pending) : "—"}
          hint={current && status ? (status.items.length ? pendingHint(pendingItems, decided.length, status.items.length) : "aucune proposition incertaine") : undefined}
          tone={current && status ? (status.pending ? "warn" : "ok") : undefined}
        />
        <Metric label="Valeurs transformées" value={counts ? nf(counts.change) : "—"} hint={counts ? (counts.change ? "transformations signalées dans le tableau" : "aucune valeur modifiée") : undefined} />
        <Metric label="Champs protégés" value={counts ? nf(counts.locked) : "—"} hint={counts ? "historique comptable, non modifiable" : undefined} />
      </Metrics>

      <div ref={noticeRef} tabIndex={-1} className="outline-none empty:hidden">
        {notice && (
          <Callout
            tone={notice.tone}
            action={
              <Button variant="ghost" size="sm" onClick={() => setNotice(null)} aria-label="Fermer le message" icon={<X size={14} />}>
                Fermer
              </Button>
            }
          >
            {notice.text}
          </Callout>
        )}
      </div>

      {mapping.loading && !mapping.data ? (
        <p role="status" className="py-6 text-body text-text-3">
          Chargement des correspondances…
        </p>
      ) : mapping.error && !mapping.data ? (
        <Callout tone="bad" title="Chargement impossible" action={<Button size="sm" variant="secondary" onClick={() => void mapping.reload()}>Réessayer</Button>}>
          {mapping.error}
        </Callout>
      ) : !current || !status || !idx || !m ? (
        <>
          <Section title="Obtenir les correspondances" description="Choisissez d'où vient la première version ; chaque proposition incertaine vous sera ensuite soumise.">
            <div className="flex flex-col gap-3">
              {sources.error && !sources.data && <Callout tone="bad" title="Données reçues indisponibles">{sources.error}</Callout>}
              {sources.data && !hasSources && (
                <Callout tone="warn" action={<Button href={`/projets/${id}/extraction`} size="sm" variant="secondary">Données</Button>}>
                  Aucune donnée reçue : récupérez d&apos;abord les données de l&apos;ancien logiciel à l&apos;étape Données.
                </Callout>
              )}
              <SourceOptions current={null} hasSources={hasSources} busy={sourceBusy} onStart={start} confirm={confirm} setConfirm={setConfirm} onCreate={create} notice={sourceNotice} onCloseNotice={() => setSourceNotice(null)} />
            </div>
          </Section>
          <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : envoi des correspondances par l'Analyste.">
            <MappingTechnical id={id} current={null} hasSources={hasSources} operator={viewer?.role === "operator"} busy={sourceBusy} onCreate={create} />
          </Section>
        </>
      ) : (
        <>
          {mapping.error && <Callout tone="bad">Actualisation impossible : {mapping.error}</Callout>}
          <Blockers status={status} idx={idx} id={id} onFocus={focus} />
          <StaleNotice current={current} sources={sources.data} profile={profile.data} />

          {pendingItems.length > 0 && (
            <Section
              id="a-verifier"
              className="scroll-mt-6"
              title="À vérifier"
              badge={<Badge tone="warn">{nf(pendingItems.length)}</Badge>}
              description="Propositions incertaines : rien n'est migré tant qu'une seule reste en attente."
              actions={
                <Button size="sm" variant="accent" icon={<CheckCheck size={14} />} disabled={!!actions.busy} onClick={() => setBulkOpen(true)}>
                  {pendingItems.length > 1 ? "Accepter toutes les propositions restantes" : "Accepter la proposition restante"}
                </Button>
              }
            >
              <PendingList items={pendingItems} idx={idx} actions={actions} onFocus={focus} advanced={advanced} />
            </Section>
          )}

          <Section
            title="Ancien champ → Nouveau champ"
            description="Chaque table de l'ancien logiciel, puis chacun de ses champs : type, transformation, incertitude et statut."
            actions={<ToggleAll allOpen={m.entities.every((e) => openSet.has(e.name))} onToggle={(open) => updateOpen(() => new Set(open ? m.entities.map((e) => e.name) : []))} />}
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <FilterBar value={filter} onChange={setFilter} counts={counts} />
              <AdvancedToggle on={advanced} onChange={setAdvanced} />
            </div>
            <ul className="-mx-5 -mb-5 flex flex-col divide-y divide-line overflow-hidden rounded-b-panel border-t border-line">
              {m.entities.map((e) => (
                <EntityGroup
                  key={e.name}
                  e={e}
                  idx={idx}
                  open={groupOpen(e.name)}
                  onToggle={() =>
                    updateOpen((s) => {
                      if (s.has(e.name)) s.delete(e.name);
                      else s.add(e.name);
                      return s;
                    })
                  }
                  highlight={highlight}
                  onFocus={focus}
                  filter={filter}
                  advanced={advanced}
                  actions={actions}
                />
              ))}
            </ul>
          </Section>

          {decided.length > 0 && (
            <Section collapsible title="Décisions prises" badge={<Badge>{nf(decided.length)}</Badge>} description="Consignées avec leur auteur et leur date ; chacune reste modifiable.">
              <DecidedList items={decided} idx={idx} actions={actions} onFocus={focus} />
            </Section>
          )}

          {current.issues.length > 0 && (
            <Section collapsible title="Problèmes détectés" badge={<IssueBadges current={current} />} description={`Contrôles faits à la réception de la version ${current.version}.`}>
              <IssueList issues={current.issues} idx={idx} onFocus={focus} />
            </Section>
          )}

          <Section collapsible title="Liens entre fiches" badge={<Badge>{nf(counts?.refs ?? 0)}</Badge>} description="Comment les fiches restent reliées (un devis à son client, une ligne à sa facture…).">
            <RelationsList idx={idx} onFocus={focus} />
          </Section>

          <Perimeter current={current} idx={idx} profile={profile.data} profileError={profile.error} sources={sources.data ?? []} highlight={highlight} actions={actions} />

          <Section collapsible title="Source des correspondances" description={`Version ${current.version} : ${ORIGIN[current.origin]?.label ?? current.origin}.`}>
            <SourceOptions current={current} hasSources={hasSources} busy={sourceBusy} onStart={start} confirm={confirm} setConfirm={setConfirm} onCreate={create} notice={sourceNotice} onCloseNotice={() => setSourceNotice(null)} />
          </Section>

          <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : envoi des correspondances par l'Analyste.">
            <MappingTechnical key={current.version} id={id} current={current} hasSources={hasSources} operator={viewer?.role === "operator"} busy={sourceBusy} onCreate={create} />
          </Section>
        </>
      )}

      {idx && <BulkAcceptDialog open={bulkOpen} onClose={() => setBulkOpen(false)} items={pendingItems} idx={idx} onDone={bulkDone} />}
      {dialog?.kind === "correct" && dlgEntity && dlgField && idx && (
        <CorrectFieldDialog key={`c-${dialog.seq}`} open={dialog.open} onClose={closeDialog} e={dlgEntity} f={dlgField} idx={idx} onSaved={saved} />
      )}
      {dialog?.kind === "reject" && dlgEntity && dlgField && idx && (
        <RejectFieldDialog key={`r-${dialog.seq}`} open={dialog.open} onClose={closeDialog} e={dlgEntity} f={dlgField} idx={idx} onSaved={saved} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* En-tête, bloquants, données modifiées                                */
/* ------------------------------------------------------------------ */

function VersionLine({ current }: { current: MappingVersion }) {
  const m = current.mapping;
  const origin = ORIGIN[current.origin] ?? { label: current.origin, test: false };
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-small text-text-3">
      <span className="font-semibold text-text-2">
        {m.source_system ?? "Ancien logiciel"} → {m.target.name}
      </span>
      <span aria-hidden>·</span>
      <span>
        Version {current.version} du {dt(current.received_at)}
      </span>
      {origin.test ? <TestBadge /> : <Badge>{current.on_arrival ? `${origin.label} · faite à la réception des données` : origin.label}</Badge>}
    </p>
  );
}

function Blockers({ status, idx, id, onFocus }: { status: MappingResponse["status"]; idx: MappingIndex; id: string; onFocus: (key: string) => void }) {
  if (status.can_run) return null;
  // Les propositions en attente ont leur propre section, juste en dessous
  const errors = status.blockers.filter((b) => !/incertaine/.test(b));
  if (errors.length)
    return (
      <Callout tone="bad" title={errors.length > 1 ? `${errors.length} erreurs bloquent la migration` : "Une erreur bloque la migration"}>
        <ul className="flex flex-col gap-0.5">
          {errors.map((b, i) => {
            const t = blockerText(b, idx);
            return (
              <li key={`${i}-${b}`} className="break-words">
                {t.focus ? (
                  <FocusLink to={t.focus} onFocus={onFocus}>
                    {t.text}
                  </FocusLink>
                ) : (
                  t.text
                )}
              </li>
            );
          })}
        </ul>
      </Callout>
    );
  if (!status.blockers.length)
    return (
      <Callout tone="warn" title="Aucune donnée reçue" action={<Button href={`/projets/${id}/extraction`} size="sm" variant="secondary">Données</Button>}>
        La migration lit les fichiers reçus à l&apos;étape Données.
      </Callout>
    );
  return null;
}

function StaleNotice({ current, sources, profile }: { current: MappingVersion; sources: SourceMeta[] | null; profile: SourceProfile | null }) {
  const late = sources ? sources.filter((s) => s.received_at > current.received_at) : [];
  const missing = profile ? [...new Set(current.mapping.entities.map((e) => e.source.table).filter((t) => !profile.tables.some((x) => x.name === t)))] : [];
  if (!late.length && !missing.length) return null;
  return (
    <Callout tone="warn" title={`Données modifiées depuis la version ${current.version}`}>
      {late.length > 0 && <span className="block break-words">Reçu ensuite : {late.map((s) => s.name).join(", ")}.</span>}
      {missing.length > 0 && <span className="block break-words">Introuvable dans les données actuelles : {missing.join(", ")}.</span>}
      <span className="block">Obtenez une nouvelle version pour recontrôler les correspondances.</span>
    </Callout>
  );
}

/** « 5 champs et 1 rattachement de pièces jointes · 0 tranché sur 6 » : ce que recouvre le nombre de points. */
function pendingHint(pending: ReviewItem[], decided: number, total: number): string {
  const kinds: Record<string, [string, string]> = { field: ["champ", "champs"], entity: ["table", "tables"], accounting: ["protection de l'historique", "protections de l'historique"], attachment: ["rattachement de pièces jointes", "rattachements de pièces jointes"] };
  const by = new Map<string, number>();
  for (const i of pending) by.set(i.kind, (by.get(i.kind) ?? 0) + 1);
  const parts = [...by.entries()].map(([k, n]) => plural(n, kinds[k]?.[0] ?? k, kinds[k]?.[1] ?? k));
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : (parts[0] ?? "");
  return `${what ? `${what} · ` : ""}${nf(decided)} tranché${decided > 1 ? "s" : ""} sur ${nf(total)}`;
}

function IssueBadges({ current }: { current: MappingVersion }) {
  const errors = current.issues.filter((i) => i.level === "error").length;
  const warnings = current.issues.length - errors;
  return (
    <span className="flex flex-wrap gap-1.5">
      {errors > 0 && <Badge tone="bad">{plural(errors, "erreur")}</Badge>}
      {warnings > 0 && <Badge tone="warn">{plural(warnings, "avertissement")}</Badge>}
    </span>
  );
}

function ToggleAll({ allOpen, onToggle }: { allOpen: boolean; onToggle: (open: boolean) => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => onToggle(!allOpen)} icon={allOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}>
      {allOpen ? "Tout replier" : "Tout déplier"}
    </Button>
  );
}

type Counts = { fields: number; pendingFields: number; change: number; locked: number };
const FILTERS: { id: FieldFilter; label: string; count: (c: Counts) => number }[] = [
  { id: "all", label: "Tous les champs", count: (c) => c.fields },
  { id: "pending", label: "Champs à vérifier", count: (c) => c.pendingFields },
  { id: "change", label: "Valeurs transformées", count: (c) => c.change },
  { id: "locked", label: "Protégés", count: (c) => c.locked },
];

function FilterBar({ value, onChange, counts }: { value: FieldFilter; onChange: (f: FieldFilter) => void; counts: Counts | null }) {
  return (
    <div role="group" aria-label="Afficher" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={value === f.id}
          onClick={() => onChange(f.id)}
          className={cx(
            "inline-flex h-control-sm items-center gap-1.5 rounded-control px-3 text-small font-medium transition-colors duration-(--duration-fast) max-sm:h-control-lg",
            value === f.id ? "bg-ink text-white" : "bg-surface text-text-2 ring-1 ring-line-strong hover:bg-surface-sunken hover:text-ink",
          )}
        >
          {f.label}
          {counts && <span className={cx("tabular", value === f.id ? "text-white/80" : "text-text-3")}>{nf(f.count(counts))}</span>}
        </button>
      ))}
    </div>
  );
}

function AdvancedToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cx(
        "inline-flex h-control-sm items-center gap-2 self-start rounded-control px-3 text-small font-medium transition-colors duration-(--duration-fast) max-sm:h-control-lg md:self-auto",
        on ? "bg-surface-sunken text-ink ring-1 ring-line-strong" : "text-text-2 hover:bg-surface-sunken hover:text-ink",
      )}
    >
      <Settings2 size={14} aria-hidden />
      Détails techniques {on ? "affichés" : "masqués"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Source des correspondances : Analyste, proposition, jeu de test      */
/* ------------------------------------------------------------------ */

function SourceOptions({
  current,
  hasSources,
  busy,
  onStart,
  confirm,
  setConfirm,
  onCreate,
  notice,
  onCloseNotice,
}: {
  current: MappingVersion | null;
  hasSources: boolean;
  busy: SourceKind | null;
  onStart: (k: "auto" | "fixture") => void;
  confirm: null | "auto" | "fixture";
  setConfirm: (c: null | "auto" | "fixture") => void;
  onCreate: (k: SourceKind) => Promise<void>;
  notice: { tone: "ok" | "warn" | "bad"; text: string } | null;
  onCloseNotice: () => void;
}) {
  const next = (current?.version ?? 0) + 1;
  const analyst = current?.origin === "analyst";
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-panel ring-1 ring-line">
        <li className="flex items-start gap-3.5 px-4 py-3.5">
          <Inbox size={18} className="mt-0.5 shrink-0 text-text-3" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold text-ink">Envoi de l&apos;Analyste</span>
            <span className="block text-small text-text-2">
              {analyst && current ? `Version en vigueur reçue le ${dt(current.received_at)}.` : "Envoyé directement par l'agent d'analyse au Studio, sans passer par cet écran."}
            </span>
          </span>
          {analyst ? <Badge tone="ok">Reçu</Badge> : <Badge>En attente de l&apos;agent</Badge>}
        </li>
        <li>
          <OptionButton Icon={Sparkles} title="Proposition automatique" text="Déduite de la structure lue : une table devient une fiche, une colonne un champ, sans connaissance du logiciel." disabled={!hasSources || !!busy} busy={busy === "auto"} onClick={() => onStart("auto")} />
        </li>
        <li>
          <OptionButton
            Icon={FlaskConical}
            iconCls="text-warning"
            title="Jeu de test au format de l'Analyste — Relatio"
            text={`Écrit à la main pour le logiciel de test ${TEST_SYSTEM} : ce n'est pas un envoi de l'Analyste.`}
            disabled={!hasSources || !!busy}
            busy={busy === "fixture"}
            onClick={() => onStart("fixture")}
          />
        </li>
      </ul>
      {confirm && current && (
        <Callout tone="warn" title={`Créer la version ${next} ?`}>
          Elle remplacera la version {current.version} ; les décisions déjà prises restent acquises pour les propositions conservées.
          <span className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={!!busy} onClick={() => onCreate(confirm)}>
              Créer la version {next}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirm(null)}>
              Annuler
            </Button>
          </span>
        </Callout>
      )}
      {notice && (
        <Callout tone={notice.tone} action={<Button variant="ghost" size="sm" onClick={onCloseNotice} icon={<X size={14} />}>Fermer</Button>}>
          {notice.text}
        </Callout>
      )}
    </div>
  );
}

function OptionButton({ Icon, iconCls, title, text, disabled, busy, onClick }: { Icon: LucideIcon; iconCls?: string; title: string; text: string; disabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      className="group/opt flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors duration-(--duration-fast) hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <Icon size={18} className={cx("mt-0.5 shrink-0", busy ? "animate-pulse text-accent motion-reduce:animate-none" : (iconCls ?? "text-text-3"))} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-ink">{title}</span>
        <span className="block text-small text-text-2">{busy ? "Création de la version en cours…" : text}</span>
      </span>
      <ArrowRight size={16} className="mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-fast) group-hover/opt:translate-x-0.5" aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Périmètre : pièces jointes, tables non reprises, tables écartées     */
/* ------------------------------------------------------------------ */

function Perimeter({
  current,
  idx,
  profile,
  profileError,
  sources,
  highlight,
  actions,
}: {
  current: MappingVersion;
  idx: MappingIndex;
  profile: SourceProfile | null;
  profileError: string | null;
  sources: SourceMeta[];
  highlight: string | null;
  actions: ReturnType<typeof useMappingActions>["actions"];
}) {
  const m = current.mapping;
  const attachments = m.attachments ?? [];
  const used = new Set([...m.entities.map((e) => e.source.table), ...attachments.map((a) => a.source.table), ...(m.excluded_sources ?? []).map((x) => x.table)]);
  const unmapped = profile ? profile.tables.filter((t) => !used.has(t.name)) : null;
  const unusedArchives = sources.filter((s) => s.format === "zip" && !attachments.some((a) => a.archive === s.name));
  const summary = [plural(attachments.length, "rattachement de pièces jointes", "rattachements de pièces jointes"), unmapped ? plural(unmapped.length, "table non reprise", "tables non reprises") : null, m.excluded_sources?.length ? plural(m.excluded_sources.length, "table écartée", "tables écartées") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Section collapsible title="Documents et données non reprises" description={summary} badge={unmapped?.length || unusedArchives.length ? <Badge tone="warn">À connaître</Badge> : undefined}>
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-2 text-body font-semibold text-ink">Pièces jointes</h3>
          {attachments.length ? (
            <ul className="flex flex-col gap-2">
              {attachments.map((a, i) => (
                <AttachmentRow key={i} a={a} i={i} idx={idx} highlight={highlight} actions={actions} />
              ))}
            </ul>
          ) : (
            <p className="text-small text-text-3">Aucun rattachement de pièces jointes dans cette version.</p>
          )}
          {unusedArchives.length > 0 && <p className="mt-2 text-small text-warning-ink">Archive sans rattachement : {unusedArchives.map((s) => s.name).join(", ")} ; ses fichiers ne seront rattachés à aucune fiche.</p>}
        </div>
        <div>
          <h3 className="mb-2 text-body font-semibold text-ink">Tables reçues sans correspondance</h3>
          {unmapped === null ? (
            <p className="text-small text-text-3">{profileError ? `Structure lue indisponible (${profileError}).` : "Structure lue en cours de chargement…"}</p>
          ) : unmapped.length ? (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {unmapped.map((t) => (
                  <li key={t.name}>
                    <Badge tone="warn">
                      <span className="font-mono">{idx.legacy(t.name)}</span> · {plural(t.rows, "ligne")}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-small text-text-2">Non migrées : elles figureront au rapport d&apos;écarts.</p>
            </>
          ) : (
            <p className="text-small text-accent-ink">Toutes les tables reçues sont reprises, rattachées ou écartées.</p>
          )}
        </div>
        {!!m.excluded_sources?.length && (
          <div>
            <h3 className="mb-2 text-body font-semibold text-ink">Tables écartées volontairement</h3>
            <ul className="flex flex-col gap-1 text-small text-text-2">
              {m.excluded_sources.map((x) => (
                <li key={x.table}>
                  <span className="font-mono font-semibold text-ink">{idx.legacy(x.table)}</span> — {x.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Intégration technique                                                */
/* ------------------------------------------------------------------ */

function MappingTechnical({ id, current, hasSources, operator, busy, onCreate }: { id: string; current: MappingVersion | null; hasSources: boolean; operator: boolean; busy: SourceKind | null; onCreate: (k: SourceKind, body?: unknown) => Promise<void> }) {
  const [json, setJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const next = (current?.version ?? 0) + 1;
  const m = current?.mapping;
  return (
    <div className="flex flex-col gap-5">
      <Facts
        items={[
          { label: "Envoi de l'Analyste", value: <code className="font-mono text-small break-all">POST /api/migration/mapping?project={id}</code> },
          { label: "Correction d'un champ", value: <code className="font-mono text-small break-all">POST /api/migration/mapping/fields?project={id}</code> },
          {
            label: "Contrat",
            value: (
              <a href="/api/migration/contracts" target="_blank" rel="noreferrer" className="ds-link">
                migration_mapping v{m?.contract_version ?? "1.0"} (JSON Schema)
              </a>
            ),
          },
          ...(current && m
            ? [
                { label: "Version en vigueur", value: `v${current.version} · ${ORIGIN[current.origin]?.label ?? current.origin} · ${dt(current.received_at)}` },
                { label: "Empreinte", value: <span className="font-mono text-small">{current.sha256.slice(0, 16)}…</span> },
                { label: "Seuil de validation", value: `${formatPercent(m.review_threshold, 0)} de confiance` },
                { label: "Identifiant du nouveau logiciel", value: <span className="font-mono text-small">{m.target.id}</span> },
                ...(m.notes ? [{ label: "Note de l'émetteur", value: `« ${m.notes} »` }] : []),
              ]
            : []),
        ]}
      />
      {current && m && (
        <div>
          <h3 className="mb-1.5 text-body font-semibold text-ink">Repères du tableau</h3>
          <MappingNotes threshold={m.review_threshold} auto={current.origin === "auto"} />
        </div>
      )}
      {operator && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body font-semibold text-ink">Saisie du contrat complet (équipe REBORN)</h3>
          <p className="max-w-[720px] text-small text-text-2">Contrôlée par l&apos;API comme tout envoi, et enregistrée comme correction manuelle, jamais comme un envoi de l&apos;Analyste.</p>
          {current && !json && (
            <div>
              <Button size="sm" variant="secondary" onClick={() => setJson(JSON.stringify(current.mapping, null, 2))}>
                Partir de la version {current.version}
              </Button>
            </div>
          )}
          <Textarea className="h-56 resize-y font-mono text-small leading-relaxed" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} placeholder='{ "target": { "id": "…", "name": "…" }, "entities": [ … ] }' aria-label="Contrat de correspondances (JSON)" />
          {parseError && <p className="text-small text-danger-ink">Contrat illisible : {parseError}</p>}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!json.trim() || !hasSources || !!busy}
              loading={busy === "user"}
              onClick={() => {
                let body: unknown;
                try {
                  body = JSON.parse(json);
                } catch (e) {
                  setParseError((e as Error).message);
                  return;
                }
                setParseError(null);
                void onCreate("user", body);
              }}
            >
              Enregistrer comme correction manuelle (v{next})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
