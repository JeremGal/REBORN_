"use client";

import { createContext, useContext, useEffect } from "react";
import type { ProjectDetails, ProjectSummary } from "@/components/project/ProjectProvider";

/**
 * Contexte de l'espace connecté (AppShell) : compte connecté (fourni par le layout serveur après
 * vérification de la session), projet ouvert (publié par ProjectShell pour la barre latérale) et
 * ouverture du tiroir de navigation sur mobile.
 */

export interface ShellUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  role: "client" | "operator";
}

export interface ShellProject {
  id: string;
  summary: ProjectSummary | null;
  details: ProjectDetails | null;
  investigations: number;
  error: string | null;
}

export interface ShellCtx {
  user: ShellUser;
  /** Session en cours (identifiant, pas le jeton) : « cet appareil » dans Paramètres. */
  sessionId: string;
  /** Après une modification du profil (PATCH /api/me). */
  setUser: (u: ShellUser) => void;
  project: ShellProject | null;
  setProject: (p: ShellProject | null) => void;
  openNavigation: () => void;
}

export const ShellContext = createContext<ShellCtx | null>(null);

export function useShell(): ShellCtx {
  const c = useContext(ShellContext);
  if (!c) throw new Error("useShell hors de l'espace connecté (AppShell)");
  return c;
}

/** Compte connecté (null hors de l'espace connecté). */
export function useViewer(): ShellUser | null {
  return useContext(ShellContext)?.user ?? null;
}

export const isOperatorUser = (u: ShellUser | null | undefined) => u?.role === "operator";

export const displayName = (u: Pick<ShellUser, "firstName" | "lastName" | "email">) => `${u.firstName} ${u.lastName}`.trim() || u.email;

/**
 * Publie le projet ouvert dans la barre latérale (section « Projet »). `project` doit être mémorisé
 * par l'appelant (useMemo) ; retiré quand le composant disparaît. Sans AppShell : sans effet.
 */
export function usePublishProject(project: ShellProject | null) {
  const set = useContext(ShellContext)?.setProject;
  useEffect(() => {
    set?.(project);
  }, [set, project]);
  useEffect(() => () => set?.(null), [set]);
}
