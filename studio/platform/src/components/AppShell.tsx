"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Drawer } from "@/components/ds/Dialog";
import { TopBar } from "@/components/TopBar";
import { ShellContext, type ShellCtx, type ShellProject, type ShellUser } from "@/components/shell/context";
import { Sidebar } from "@/components/shell/Sidebar";

/**
 * Cadre de l'espace connecté (SPEC §10.3) : UNE barre latérale contextuelle (≈ 248 px) sur ordinateur,
 * barre supérieure + tiroir (<dialog> natif : focus piégé, Échap, retour du focus) sur mobile.
 * Repères : <header> (barre latérale ou barre supérieure, une seule visible), <nav>, <main id="contenu">
 * (cible du lien « Aller au contenu » du layout racine).
 *
 * Le compte vient du layout serveur, qui a vérifié la session en base avant tout rendu.
 */
export function AppShell({ user, sessionId, children }: { user: ShellUser; sessionId: string; children: React.ReactNode }) {
  const [account, setAccount] = useState(user);
  const [project, setProject] = useState<ShellProject | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Le tiroir se ferme à chaque navigation, et quand l'écran passe au format ordinateur.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openNavigation = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo<ShellCtx>(() => ({ user: account, sessionId, setUser: setAccount, project, setProject, openNavigation }), [account, sessionId, project, openNavigation]);

  return (
    <ShellContext.Provider value={value}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <TopBar onOpenNavigation={openNavigation} navigationOpen={open} />

        <header className="hidden border-r border-line bg-surface-sunken/50 lg:block">
          <div className="sticky top-0 h-dvh overflow-y-auto px-3 pt-5 pb-4">
            <Sidebar variant="desktop" />
          </div>
        </header>

        <Drawer open={open} onClose={close} side="left" title="Navigation" closeLabel="Fermer la navigation" className="lg:hidden">
          <Sidebar variant="drawer" onNavigate={close} />
        </Drawer>

        <main id="contenu" tabIndex={-1} className="min-w-0 px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-9">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </ShellContext.Provider>
  );
}
