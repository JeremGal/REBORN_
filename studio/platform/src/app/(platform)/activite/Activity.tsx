"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Checkbox, Select } from "@/components/ds/Field";
import { Skeleton } from "@/components/ds/Progress";
import { EmptyState, ErrorState } from "@/components/ds/States";
import { cx } from "@/components/ds/cx";
import { useReborn } from "@/components/RebornProvider";
import { projectName } from "@/components/shell/journey";
import { buildTimeline, dayKey, dayLabel, isRoutineStatus, type TimelineCategory, type TimelineEntry } from "@/components/shell/timeline";
import { formatInt } from "@/components/ds/format";
import { useProjectEntries } from "@/components/shell/useProjects";

/**
 * Activité : évènements RÉELS des projets du compte (journal du Studio, déjà filtré par le serveur
 * selon le compte) et changements d'état enregistrés dans chaque projet. Filtre par projet et par
 * origine ; affichage par jour, du plus récent au plus ancien.
 */

const PAGE = 60;
const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const DOT: Record<TimelineEntry["tone"], string> = {
  ok: "bg-accent",
  warn: "bg-warning",
  bad: "bg-danger",
  neutral: "bg-control-border",
};
const TONE_TEXT: Record<TimelineEntry["tone"], string> = { ok: "Réussite", warn: "À examiner", bad: "Échec", neutral: "" };

export function Activity() {
  const { state, error: syncError } = useReborn();
  const { entries, error, reload } = useProjectEntries({ details: true });
  const [project, setProject] = useState("tous");
  const [category, setCategory] = useState<"toutes" | TimelineCategory>("toutes");
  // Changements d'état de routine (« État : Migration en cours »…) : masqués par défaut, ils doublent les faits
  const [states, setStates] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const names = useMemo(() => new Map((entries ?? []).map((e) => [e.summary.id, projectName(e.summary)])), [entries]);

  const timeline = useMemo(() => {
    if (!entries || !state) return null;
    return buildTimeline({
      events: state.events,
      investigations: state.investigations,
      projects: entries.map((e) => ({ id: e.summary.id, history: e.details?.status_history ?? [] })),
    });
  }, [entries, state]);

  const shown = useMemo(
    () => timeline?.filter((t) => (project === "tous" || t.projectId === project) && (category === "toutes" || t.category === category) && (states || !isRoutineStatus(t))) ?? null,
    [timeline, project, category, states],
  );
  const hiddenStates = useMemo(() => (states ? 0 : (timeline?.filter((t) => (project === "tous" || t.projectId === project) && isRoutineStatus(t)).length ?? 0)), [timeline, project, states]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: TimelineEntry[] }[] = [];
    for (const t of (shown ?? []).slice(0, limit)) {
      const k = dayKey(t.at);
      const last = out.at(-1);
      if (last?.key === k) last.items.push(t);
      else out.push({ key: k, label: dayLabel(t.at), items: [t] });
    }
    return out;
  }, [shown, limit]);

  const loading = (!entries || !state) && !error;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold text-ink">Activité</h1>
          <p className="mt-1.5 text-body text-text-2">Ce qui s&apos;est réellement passé dans vos projets, du plus récent au plus ancien.</p>
        </div>
      </header>

      {error && <ErrorState title="Lecture de l'activité impossible" message={error} onRetry={reload} />}
      {!error && syncError && !state && <ErrorState title="Journal indisponible" message={syncError} />}
      {loading && !syncError && <Skeleton lines={6} label="Chargement de l'activité…" />}

      {entries && entries.length === 0 && (
        <EmptyState
          icon={<History size={28} />}
          title="Aucune activité pour l'instant"
          headingLevel={2}
          action={
            <Button href="/projets/nouveau" variant="secondary">
              Nouvelle migration
            </Button>
          }
        >
          La création d&apos;un projet, les imports, les migrations et leurs vérifications apparaîtront ici.
        </EmptyState>
      )}

      {timeline && entries && entries.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="activite-projet" className="ds-label">
                Projet
              </label>
              <Select
                id="activite-projet"
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  setLimit(PAGE);
                }}
              >
                <option value="tous">Tous mes projets</option>
                {entries.map((e) => (
                  <option key={e.summary.id} value={e.summary.id}>
                    {projectName(e.summary)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="activite-type" className="ds-label">
                Origine
              </label>
              <Select
                id="activite-type"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as typeof category);
                  setLimit(PAGE);
                }}
              >
                <option value="toutes">Toutes</option>
                <option value="projet">Projet : étapes, imports, migrations</option>
                <option value="agents">Agents : exploration et analyse</option>
              </Select>
            </div>
          </div>

          <Checkbox
            name="etats"
            checked={states}
            onChange={(e) => {
              setStates(e.target.checked);
              setLimit(PAGE);
            }}
            label="Afficher les changements d'état du projet"
            hint={hiddenStates ? `${formatInt(hiddenStates)} masqué${hiddenStates > 1 ? "s" : ""} : ils répètent les évènements ci-dessous. Les échecs et les demandes d'intervention restent toujours affichés.` : undefined}
          />

          <p role="status" className="text-small text-text-3">
            {shown?.length ? `${formatInt(shown.length)} évènement${shown.length > 1 ? "s" : ""}` : "Aucun évènement"}
          </p>

          {shown && shown.length === 0 && <p className="text-body text-text-2">Aucun évènement ne correspond à ces filtres.</p>}

          <div className="flex flex-col gap-8">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`jour-${g.key}`}>
                <h2 id={`jour-${g.key}`} className="text-small font-semibold text-text-2 first-letter:uppercase">
                  {g.label}
                </h2>
                <ol className="mt-3 flex flex-col">
                  {g.items.map((t) => (
                    <li key={t.id} className="grid grid-cols-[3.25rem_0.75rem_minmax(0,1fr)] gap-x-3">
                      <time dateTime={t.at} className="tabular pt-0.5 text-small text-text-3">
                        {time(t.at)}
                      </time>
                      <span aria-hidden className="relative flex justify-center">
                        <span className="absolute inset-y-0 w-px bg-line" />
                        <span className={cx("relative mt-1.5 size-2.5 rounded-full ring-2 ring-canvas", DOT[t.tone])} />
                      </span>
                      <div className="min-w-0 pb-5">
                        <p className="text-body font-medium text-ink">
                          {TONE_TEXT[t.tone] && <span className="sr-only">{TONE_TEXT[t.tone]} : </span>}
                          {t.title}
                        </p>
                        {t.detail && <p className="mt-0.5 text-small leading-relaxed break-words text-text-2">{t.detail}</p>}
                        <p className="mt-1 text-meta text-text-3">
                          <Link href={`/projets/${t.projectId}`} className="font-medium text-text-2 hover:text-ink hover:underline">
                            {names.get(t.projectId) ?? t.projectId}
                          </Link>
                          {" · "}
                          {t.origin}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {shown && shown.length > limit && (
            <Button variant="secondary" className="self-start" onClick={() => setLimit((l) => l + PAGE)}>
              Afficher {Math.min(PAGE, shown.length - limit)} évènements de plus
            </Button>
          )}
        </>
      )}
    </div>
  );
}
