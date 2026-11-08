"use client";

import Link from "next/link";
import { cx } from "@/components/ds/cx";
import { useReborn } from "@/components/RebornProvider";
import { ModeBadge } from "@/components/TopBar";
import { formatPercent } from "@/components/ds/format";

/**
 * Section « Équipe REBORN » de la barre latérale (opérateur) : d'abord la vue d'ensemble des opérations réelles
 * (/operations : agents, demandes d'analyse, projets), puis, regroupés sous « Outils de démonstration », les anciens
 * écrans de l'atelier (chaîne découverte → règles → migration → reconstruction → comparaison, sur le logiciel de
 * test), avec l'état réel de chaque maillon.
 */

/** Vue d'ensemble des opérations : la première page de l'équipe. */
export const OPERATIONS_PATH = "/operations";
/** Anciens écrans de l'atelier (démonstration). */
export const DEMO_PATHS = ["/atelier", "/investigation", "/regles", "/reconstruction", "/comparaison", "/migration"];
/** Pages où la barre latérale affiche cette section. */
export const ATELIER_PATHS = [OPERATIONS_PATH, ...DEMO_PATHS];

type NavLinkItem = { href: string; label: string; meta: string; tone?: "ok" | "bad"; live?: boolean };

function NavItem({ l, pathname, onNavigate }: { l: NavLinkItem; pathname: string; onNavigate?: () => void }) {
  const on = pathname === l.href;
  return (
    <li>
      <Link
        href={l.href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        className={cx(
          "relative flex min-h-10 flex-col justify-center rounded-control px-2.5 py-1 transition-colors duration-(--duration-fast) max-lg:min-h-11",
          on ? "bg-surface shadow-raised ring-1 ring-line" : "hover:bg-surface/70",
        )}
      >
        {on && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
        <span className={cx("flex items-center gap-1.5 text-body leading-5", on ? "font-semibold text-ink" : "font-medium text-ink")}>
          {l.label}
          {l.live && <span className="live-dot size-1.5 rounded-full bg-accent" role="img" aria-label="exploration en cours" />}
        </span>
        <span className={cx("tabular truncate text-meta", l.tone === "ok" ? "text-accent-ink" : l.tone === "bad" ? "font-medium text-danger-ink" : "text-text-3")}>{l.meta}</span>
      </Link>
    </li>
  );
}

export function AtelierNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { state, model, active, report } = useReborn();
  const obsCount = active ? (state?.observations.filter((o) => o.investigation_id === active.id).length ?? 0) : (state?.observations.length ?? 0);
  const lastRun = state?.migration?.last_run;

  const demo: NavLinkItem[] = [
    { href: "/atelier", label: "Tableau de l'atelier", meta: active ? `Investigation n° ${active.number}` : "Aucune investigation" },
    { href: "/investigation", label: "Explorer", meta: obsCount ? `${obsCount} expérience${obsCount > 1 ? "s" : ""}` : "En attente", live: active?.status === "running" },
    { href: "/regles", label: "Comprendre", meta: model ? `Modèle v${model.version} · ${model.rules.length} règle${model.rules.length > 1 ? "s" : ""}` : "Aucune règle" },
    {
      href: "/migration",
      label: "Migrer",
      meta: lastRun
        ? `${lastRun.imported.toLocaleString("fr-FR")} enreg. · ${state?.migration?.deployed ? "en service" : lastRun.verification === "validated" ? "validée" : lastRun.verification === "review" ? "à valider" : "intervention"}`
        : state?.migration?.sources
          ? `${state.migration.sources} source${state.migration.sources > 1 ? "s" : ""} extraite${state.migration.sources > 1 ? "s" : ""}`
          : "Aucune donnée",
      tone: lastRun?.verification === "blocked" ? "bad" : state?.migration?.deployed ? "ok" : undefined,
    },
    { href: "/reconstruction", label: "Reconstruire", meta: model ? "Application active" : "En attente du modèle" },
    {
      href: "/comparaison",
      label: "Comparer",
      meta: report?.equivalence != null ? `${formatPercent(report.equivalence)} identique` : "Pas encore de comparaison",
      tone: report?.equivalence == null ? undefined : report.equivalence === 1 ? "ok" : "bad",
    },
  ];

  return (
    <nav aria-label="Équipe REBORN : vue d'ensemble et outils de démonstration" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="px-2 text-meta font-medium text-text-3">Équipe REBORN</p>
        <ul className="flex flex-col gap-px">
          <NavItem l={{ href: OPERATIONS_PATH, label: "Vue d'ensemble des opérations", meta: "Agents, demandes, projets" }} pathname={pathname} onNavigate={onNavigate} />
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-2">
          <p className="text-meta font-medium text-text-3">Outils de démonstration</p>
          {active && <ModeBadge mode={active.mode} />}
        </div>
        <ol className="flex flex-col gap-px">
          {demo.map((l) => (
            <NavItem key={l.href} l={l} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ol>
      </div>
    </nav>
  );
}
