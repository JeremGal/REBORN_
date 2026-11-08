"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { SearchInput, Select } from "@/components/ds/Field";
import { Skeleton } from "@/components/ds/Progress";
import { EmptyState, ErrorState } from "@/components/ds/States";
import { cx } from "@/components/ds/cx";
import { StatusPill } from "@/components/project/ProjectShell";
import type { ProjectSummary } from "@/components/project/ProjectProvider";
import { JourneyBar } from "./JourneyBar";
import { agreePlurals, formatDay } from "@/components/ds/format";
import { categoryOf, doneCount, fmtNumber, hostOf, journey, nextAction, openPoints, plural, projectName, statusLabel, type JourneyStep, type ProjectCategory, type ProjectEntry } from "./journey";
import { useProjectEntries } from "./useProjects";

/**
 * « Mes projets » : titre « Projets de migration », lien « Nouveau projet », recherche, filtre par état,
 * tri. Chaque projet : état réel, parcours, données migrées, points ouverts, logiciel livré.
 */

type Filter = "tous" | ProjectCategory;
type Sort = "activite" | "nom" | "creation" | "avancement";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "tous", label: "Tous les états" },
  { value: "attention", label: "Demandent une action" },
  { value: "active", label: "En cours" },
  { value: "delivered", label: "Livrés" },
  { value: "paused", label: "En pause" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "activite", label: "Dernière activité" },
  { value: "nom", label: "Nom (A à Z)" },
  { value: "creation", label: "Date de création (récents d'abord)" },
  { value: "avancement", label: "Avancement (le plus avancé d'abord)" },
];

/** Date au format unique du Studio (« 8 nov. 2026 »). */
const when = (iso: string | null) => formatDay(iso);
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const haystack = (s: ProjectSummary) => normalize([s.company, s.name, s.software, hostOf(s.legacy_url), s.id, s.status_label].filter(Boolean).join(" "));

interface Row {
  e: ProjectEntry;
  steps: JourneyStep[];
  cat: ProjectCategory;
}

function Fact({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta font-medium text-text-3">{label}</dt>
      <dd className={cx("mt-0.5 text-body leading-snug break-words", tone === "warn" ? "font-semibold text-warning-ink" : tone === "bad" ? "font-semibold text-danger-ink" : tone === "muted" ? "text-text-2" : "text-ink")}>
        {children}
      </dd>
    </div>
  );
}

function ProjectCard({ row }: { row: Row }) {
  const { e, steps } = row;
  const s = e.summary;
  const next = nextAction(s, steps);
  const points = openPoints(s);
  const host = hostOf(s.legacy_url);
  const href = `/projets/${s.id}/${next.slug}`;
  const urgent = steps.some((x) => x.state === "attention");
  return (
    <li className="rounded-panel bg-surface ring-1 ring-line">
      <div className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* La coupure du titre trop long est portée par le lien (et non par le titre) : l'anneau de focus du lien reste entier. */}
            <h2 className="min-w-0 text-h3 font-semibold text-ink">
              <Link href={href} className="block truncate hover:underline">
                {projectName(s)}
              </Link>
            </h2>
            <StatusPill status={s.status} label={statusLabel(s)} />
          </div>
          <p className="mt-1 truncate text-small text-text-3">
            {s.software ?? "Logiciel non précisé"}
            {host && <span className="font-mono text-meta"> {host}</span>} · mis à jour le {when(s.updated_at ?? s.created_at)}
          </p>
          {(s.status === "FAILED" || s.status === "NEEDS_HUMAN_REVIEW" || s.status === "PAUSED") && s.status_reason && (
            <p className="mt-1.5 text-small leading-relaxed text-text-2">{agreePlurals(s.status_reason)}</p>
          )}
        </div>
        <Button href={href} variant={urgent ? "primary" : "secondary"} className="justify-self-start max-md:w-full md:justify-self-end">
          {next.label}
          <span className="sr-only"> ({projectName(s)})</span>
        </Button>
      </div>
      <div className="grid gap-x-8 gap-y-4 border-t border-line px-5 py-4 md:grid-cols-[minmax(14rem,1.2fr)_minmax(0,2fr)] md:items-center">
        <JourneyBar steps={steps} />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact label="Données migrées">
            {s.data.imported ? (
              <>
                <b className="tabular font-semibold">{fmtNumber(s.data.imported)}</b> enregistrements
                {s.data.rejected ? <span className="text-warning-ink"> · {fmtNumber(s.data.rejected)} rejetés</span> : null}
              </>
            ) : s.data.source_rows ? (
              <span className="text-text-2">
                <span className="tabular">{fmtNumber(s.data.source_rows)}</span> lignes reçues
              </span>
            ) : (
              <span className="text-text-3">Aucune pour l&apos;instant</span>
            )}
          </Fact>
          <Fact label="Points ouverts" tone={points.tone === "ok" ? undefined : points.tone}>
            {points.text}
          </Fact>
          <Fact label="Nouveau logiciel">
            {s.app ? (
              <>
                <span className="font-mono text-small">{s.app.id}</span>
                <span className="text-text-3"> · livré le {when(s.app.deployed_at)}</span>
              </>
            ) : (
              <span className="text-text-3">Pas encore livré</span>
            )}
          </Fact>
        </dl>
      </div>
    </li>
  );
}

export function ProjectList() {
  const { entries, error, reload } = useProjectEntries({ details: true });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("tous");
  const [sort, setSort] = useState<Sort>("activite");

  const all = useMemo<Row[] | null>(
    () =>
      entries?.map((e) => {
        const steps = journey(e.summary, e.investigations, e.details);
        return { e, steps, cat: categoryOf(e.summary, steps) };
      }) ?? null,
    [entries],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { tous: all?.length ?? 0, attention: 0, active: 0, delivered: 0, paused: 0 };
    for (const r of all ?? []) c[r.cat]++;
    return c;
  }, [all]);

  const shown = useMemo(() => {
    if (!all) return null;
    const needle = normalize(query);
    const rows = all.filter((r) => (filter === "tous" || r.cat === filter) && (!needle || haystack(r.e.summary).includes(needle)));
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      activite: (a, b) => (b.e.summary.updated_at ?? b.e.summary.created_at).localeCompare(a.e.summary.updated_at ?? a.e.summary.created_at),
      nom: (a, b) => projectName(a.e.summary).localeCompare(projectName(b.e.summary), "fr", { sensitivity: "base" }),
      creation: (a, b) => b.e.summary.created_at.localeCompare(a.e.summary.created_at),
      avancement: (a, b) => doneCount(b.steps) - doneCount(a.steps) || projectName(a.e.summary).localeCompare(projectName(b.e.summary), "fr"),
    };
    return [...rows].sort(by[sort]);
  }, [all, query, filter, sort]);

  const delivered = counts.delivered;
  const filtered = query.trim() !== "" || filter !== "tous";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold text-ink">Projets de migration</h1>
          <p className="mt-1.5 text-body text-text-2">
            {all?.length
              ? `${plural(all.length, "projet", "projets")} · ${delivered ? plural(delivered, "logiciel livré", "logiciels livrés") : "aucun logiciel livré"}`
              : "De l'ancien logiciel métier au nouveau, avec les données historiques migrées et vérifiées."}
          </p>
        </div>
        {/* Liste vide : l'action est dans l'état vide, une seule fois */}
        {!!all?.length && (
          <Button href="/projets/nouveau" icon={<Plus size={16} />}>
            Nouvelle migration
          </Button>
        )}
      </header>

      {error && <ErrorState title="Lecture des projets impossible" message={error} onRetry={reload} />}

      {!all && !error && <Skeleton lines={5} label="Chargement de vos projets…" />}

      {all && all.length === 0 && (
        <EmptyState
          title="Aucun projet pour l'instant"
          headingLevel={2}
          action={
            <Button href="/projets/nouveau" icon={<Plus size={16} />}>
              Nouvelle migration
            </Button>
          }
        >
          Un projet part d&apos;un ancien logiciel et d&apos;un accès autorisé par son propriétaire. Vous pouvez aussi commencer par importer ses exports.
        </EmptyState>
      )}

      {all && all.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2 md:items-end xl:grid-cols-[minmax(0,1fr)_14rem_16rem]">
            <div className="min-w-0 md:col-span-2 xl:col-span-1">
              <SearchInput label="Rechercher un projet" labelVisible landmark value={query} onValueChange={setQuery} placeholder="Entreprise, logiciel, adresse…" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="filtre-etat" className="ds-label">
                État
              </label>
              <Select id="filtre-etat" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label} ({counts[f.value]})
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="tri" className="ds-label">
                Trier par
              </label>
              <Select id="tri" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <p role="status" className="text-small text-text-3">
            {filtered ? `${plural(shown?.length ?? 0, "projet affiché", "projets affichés")} sur ${all.length}` : `${plural(all.length, "projet", "projets")}`}
          </p>

          {shown && shown.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {shown.map((r) => (
                <ProjectCard key={r.e.summary.id} row={r} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="Aucun projet ne correspond"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("tous");
                  }}
                >
                  Effacer la recherche et le filtre
                </Button>
              }
            >
              {query.trim() ? `Aucun projet ne contient « ${query.trim()} »` : "Aucun projet dans cet état"}
              {filter !== "tous" && query.trim() ? ` avec l'état « ${FILTERS.find((f) => f.value === filter)?.label} »` : ""}.
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
