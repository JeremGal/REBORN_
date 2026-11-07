"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReborn } from "./RebornProvider";
import { cx, pct } from "./ui";
import { MODE_INFO } from "@/lib/modes";

export function TopBar() {
  const path = usePathname();
  const { state, model, active, report, connected } = useReborn();

  const obsCount = active ? state?.observations.filter((o) => o.investigation_id === active.id).length ?? 0 : state?.observations.length ?? 0;
  const running = active?.status === "running";

  const steps = [
    {
      href: "/investigation",
      n: "01",
      verb: "Explorer",
      who: "Mouss",
      meta: obsCount ? `${obsCount} expérience${obsCount > 1 ? "s" : ""}` : "en attente",
      live: running,
    },
    {
      href: "/regles",
      n: "02",
      verb: "Comprendre",
      who: "Alan",
      meta: model ? `modèle v${model.version} · ${model.rules.length} règles` : "aucune règle",
    },
    {
      href: "/migration",
      n: "03",
      verb: "Migrer",
      who: "Jerem",
      meta: state?.migration?.last_run
        ? `${state.migration.last_run.imported.toLocaleString("fr-FR")} enreg. · ${state.migration.deployed ? "en service" : state.migration.last_run.verification === "validated" ? "validée" : state.migration.last_run.verification === "review" ? "à valider" : "intervention"}`
        : state?.migration?.sources
          ? `${state.migration.sources} source${state.migration.sources > 1 ? "s" : ""} extraite${state.migration.sources > 1 ? "s" : ""}`
          : "aucune donnée",
      tone: state?.migration?.last_run?.verification === "blocked" ? "bad" : state?.migration?.deployed ? "ok" : undefined,
    },
    {
      href: "/reconstruction",
      n: "04",
      verb: "Reconstruire",
      who: "Jerem",
      meta: model ? "application active" : "en attente du modèle",
    },
    {
      href: "/comparaison",
      n: "05",
      verb: "Comparer",
      who: "Équipe",
      meta: report?.equivalence != null ? `${pct(report.equivalence)} identique` : "—",
      tone: report?.equivalence == null ? undefined : report.equivalence === 1 ? "ok" : "bad",
    },
  ] as const;

  return (
    <header className="sticky top-0 z-30 bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-5">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2.5" aria-label="REBORN — accueil">
          <span className="text-[19px] font-black tracking-[-0.03em]">REBORN</span>
          <span className="hidden text-[11px] font-bold tracking-[0.08em] text-verdigris-bright uppercase xl:inline">Software Archaeologist</span>
        </Link>

        <nav className="-mx-1 flex min-w-0 flex-1 items-stretch overflow-x-auto" aria-label="Pipeline REBORN">
          {steps.map((s, i) => {
            const on = path.startsWith(s.href);
            return (
              <div key={s.href} className="flex items-center">
                {i > 0 && <span aria-hidden className="mx-1 text-[11px] text-white/25">→</span>}
                <Link
                  href={s.href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "relative flex h-14 flex-col justify-center rounded-none px-3 transition-colors duration-150",
                    on ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] leading-tight font-bold">
                    <span className="font-mono text-[10.5px] text-white/40">{s.n}</span>
                    {s.verb}
                    <span className="hidden font-normal text-white/45 2xl:inline">· {s.who}</span>
                    {"live" in s && s.live && <span className="live-dot ml-0.5 size-1.5 rounded-full bg-verdigris-bright" aria-label="en cours" />}
                  </span>
                  <span
                    className={cx(
                      "tabular text-[11px] leading-tight whitespace-nowrap",
                      "tone" in s && s.tone === "ok" ? "text-verdigris-bright" : "tone" in s && s.tone === "bad" ? "text-[#f0937d]" : "text-white/50",
                    )}
                  >
                    {s.meta}
                  </span>
                  {on && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-verdigris-bright" />}
                </Link>
              </div>
            );
          })}
        </nav>

        {active && !path.startsWith("/migration") && <ModeBadge mode={active.mode} />}

        <div className="flex shrink-0 items-center gap-2 text-[11px] text-white/60" title={connected ? "Flux temps réel connecté" : "Reconnexion…"}>
          <span className={cx("size-2 rounded-full", connected ? "live-dot bg-verdigris-bright" : "bg-white/30")} />
          <span className="hidden sm:inline">{connected ? "En direct" : "Hors ligne"}</span>
        </div>
      </div>
    </header>
  );
}

/** Parcours en cours : mode local (données de référence, aucun agent) ou agents réels. */
export function ModeBadge({ mode }: { mode: keyof typeof MODE_INFO }) {
  const info = MODE_INFO[mode];
  const real = info.group === "real";
  return (
    <span
      data-mode={info.group}
      title={info.detail}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-xs px-2 py-1 text-[11px] leading-none font-bold tracking-[0.04em] uppercase",
        real ? "bg-verdigris-bright/15 text-verdigris-bright" : "bg-[#f3c969]/15 text-[#f3c969]",
      )}
    >
      {info.badge}
      <span className="hidden font-medium tracking-normal normal-case opacity-80 lg:inline">· {info.label}</span>
    </span>
  );
}
