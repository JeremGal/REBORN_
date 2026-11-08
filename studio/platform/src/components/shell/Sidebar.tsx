"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FlaskConical, FolderOpen, Gauge, History, LayoutGrid, Palette, Plus, Settings, WifiOff } from "lucide-react";
import { cx } from "@/components/ds/cx";
import { Wordmark } from "@/components/ds/Wordmark";
import { useReborn } from "@/components/RebornProvider";
import { isOperatorUser, useShell } from "./context";
import { ProjectNav } from "./ProjectNav";
import { AtelierNav, ATELIER_PATHS, DEMO_PATHS, OPERATIONS_PATH } from "./AtelierNav";
import { UserBlock } from "./UserBlock";

/**
 * Contenu de la barre latérale unique et contextuelle : navigation globale, section du projet
 * ouvert (ou de l'atelier pour l'équipe), puis Avancé (équipe REBORN), Paramètres et le compte.
 * Rendu dans la colonne fixe (ordinateur) et dans le tiroir (mobile).
 */

const PROJECT_PATH = /^\/projets\/(MIG_[a-f0-9]{8})(?:\/|$)/;

type Item = { href: string; label: string; icon: ReactNode; on: (p: string) => boolean };

const MAIN: Item[] = [
  { href: "/espace", label: "Vue d'ensemble", icon: <LayoutGrid size={17} />, on: (p) => p === "/espace" },
  { href: "/projets", label: "Mes projets", icon: <FolderOpen size={17} />, on: (p) => p === "/projets" || (p.startsWith("/projets/") && p !== "/projets/nouveau") },
  { href: "/projets/nouveau", label: "Nouvelle migration", icon: <Plus size={17} />, on: (p) => p === "/projets/nouveau" },
  { href: "/activite", label: "Activité", icon: <History size={17} />, on: (p) => p === "/activite" },
];

/** Équipe REBORN : la vue d'ensemble des opérations réelles d'abord, puis les outils de démonstration. */
const ADVANCED: Item[] = [
  { href: OPERATIONS_PATH, label: "Opérations", icon: <Gauge size={17} />, on: (p) => p === OPERATIONS_PATH },
  { href: "/atelier", label: "Outils de démonstration", icon: <FlaskConical size={17} />, on: (p) => DEMO_PATHS.some((a) => p === a || p.startsWith(`${a}/`)) },
  { href: "/design-system", label: "Design system", icon: <Palette size={17} />, on: (p) => p === "/design-system" },
];

const SETTINGS: Item = { href: "/parametres", label: "Paramètres", icon: <Settings size={17} />, on: (p) => p === "/parametres" };

function NavLink({ item, pathname, onNavigate }: { item: Item; pathname: string; onNavigate?: () => void }) {
  const on = item.on(pathname);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        className={cx(
          "relative flex min-h-9 items-center gap-2.5 rounded-control px-2.5 text-body transition-colors duration-(--duration-fast) max-lg:min-h-11",
          on ? "bg-surface font-semibold text-ink shadow-raised ring-1 ring-line" : "font-medium text-text-2 hover:bg-surface/70 hover:text-ink",
        )}
      >
        {on && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
        <span aria-hidden className={cx("inline-flex shrink-0", on ? "text-accent" : "text-text-3")}>
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}

export function Sidebar({ variant, onNavigate }: { variant: "desktop" | "drawer"; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const { user, project } = useShell();
  const { state, connected } = useReborn();
  const operator = isOperatorUser(user);
  const projectId = PROJECT_PATH.exec(pathname)?.[1] ?? null;
  const inAtelier = operator && ATELIER_PATHS.some((a) => pathname === a || pathname.startsWith(`${a}/`));
  const shown = projectId ? (project?.id === projectId ? project : { id: projectId, summary: null, details: null, investigations: 0, error: null }) : null;

  return (
    <div className="flex min-h-full flex-col gap-6">
      {variant === "desktop" && (
        <Link href="/espace" className="-mx-1 self-start rounded-control px-1 py-0.5">
          <Wordmark size="md" />
        </Link>
      )}

      <nav aria-label="Navigation principale">
        <ul className="flex flex-col gap-0.5">
          {MAIN.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>

      {shown && !(shown.error && !shown.summary) && (
        <div className="border-t border-line pt-5">
          <ProjectNav project={shown} pathname={pathname} onNavigate={onNavigate} />
        </div>
      )}

      {inAtelier && (
        <div className="border-t border-line pt-5">
          <AtelierNav pathname={pathname} onNavigate={onNavigate} />
        </div>
      )}

      {/*
        Ordinateur : Paramètres et le compte (Se déconnecter) restent visibles en bas de la barre, même quand le
        parcours d'un projet la rend plus haute que l'écran (le reste défile au-dessus). Même teinte que la barre.
      */}
      <div
        className={cx(
          "mt-auto flex flex-col gap-4 border-t border-line pt-4",
          variant === "desktop" && "sticky bottom-0 isolate -mx-3 -mb-4 bg-canvas px-3 pb-4 before:absolute before:inset-0 before:-z-10 before:bg-surface-sunken/50 before:content-['']",
        )}
      >
        {state && !connected && (
          <p role="status" className="flex items-start gap-2 rounded-control bg-warning-soft px-2.5 py-2 text-meta leading-snug text-warning-ink">
            <WifiOff size={14} aria-hidden className="mt-px shrink-0" />
            Studio injoignable : nouvelle tentative automatique…
          </p>
        )}
        {operator && (
          <nav aria-label="Avancé : équipe REBORN">
            <p className="mb-1 px-2.5 text-meta font-medium text-text-3">Avancé · équipe REBORN</p>
            <ul className="flex flex-col gap-0.5">
              {ADVANCED.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </ul>
          </nav>
        )}
        <ul>
          <NavLink item={SETTINGS} pathname={pathname} onNavigate={onNavigate} />
        </ul>
        <UserBlock />
      </div>
    </div>
  );
}
