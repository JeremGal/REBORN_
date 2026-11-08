"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { redirectToLogin, useReborn } from "@/components/RebornProvider";
import type { ProjectDetails, ProjectSummary } from "@/components/project/ProjectProvider";
import { parseAnalysis, type AnalysisInfo, type ProjectEntry } from "./journey";

/**
 * Projets du compte connecté, tels que les renvoie l'API (aucune donnée inventée) :
 * GET /api/projects, puis au besoin GET /api/projects/[id] (identifiants, connexion, historique)
 * et GET /api/projects/[id]/analysis (demande d'analyse, lot B2 ; ignorée si la route n'existe pas).
 * Rechargés à chaque évènement réel du Studio (au plus toutes les 3 s) et toutes les 30 s.
 */

class Unauthorized extends Error {}

async function getJson(url: string): Promise<{ ok: boolean; status: number; json: boolean; body: unknown }> {
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 401) throw new Unauthorized();
  const json = (r.headers.get("content-type") ?? "").includes("json");
  const body = json ? await r.json().catch(() => null) : null;
  return { ok: r.ok, status: r.status, json, body };
}

export function useProjectEntries({ details = false, analysis = false }: { details?: boolean; analysis?: boolean } = {}) {
  const { state } = useReborn();
  const lastEvent = state?.events?.at(-1)?.id ?? null;
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [detailsById, setDetails] = useState<Record<string, ProjectDetails | null>>({});
  const [analysisById, setAnalysis] = useState<Record<string, AnalysisInfo | null>>({});
  const [error, setError] = useState<string | null>(null);
  const analysisRoute = useRef<"unknown" | "present" | "absent">("unknown");
  const lastLoad = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const list = await getJson("/api/projects");
      if (!list.ok) throw new Error((list.body as { error?: string } | null)?.error ?? `Erreur ${list.status} en lisant vos projets.`);
      const projects = ((list.body as { projects?: ProjectSummary[] } | null)?.projects ?? []) as ProjectSummary[];
      setSummaries(projects);
      setError(null);
      if (details) {
        const rows = await Promise.all(
          projects.map(async (p) => {
            const r = await getJson(`/api/projects/${p.id}`);
            return [p.id, r.ok ? ((r.body as { details?: ProjectDetails } | null)?.details ?? null) : null] as const;
          }),
        );
        setDetails(Object.fromEntries(rows));
      }
      if (analysis && analysisRoute.current !== "absent") {
        const rows = await Promise.all(
          projects.map(async (p) => {
            const r = await getJson(`/api/projects/${p.id}/analysis`);
            // Route absente (page 404 HTML, lot B2 non livré) : on n'interroge plus.
            if (!r.json && r.status === 404) analysisRoute.current = "absent";
            else if (r.json) analysisRoute.current = "present";
            return [p.id, r.ok ? parseAnalysis(r.body) : null] as const;
          }),
        );
        setAnalysis(Object.fromEntries(rows));
      }
    } catch (e) {
      if (e instanceof Unauthorized) {
        redirectToLogin();
        return;
      }
      setError(e instanceof TypeError ? "REBORN ne répond pas. Vérifiez votre connexion, puis réessayez." : (e as Error).message);
    }
  }, [details, analysis]);

  // Premier chargement, puis à chaque évènement réel (regroupés : au plus un rechargement toutes les 3 s)
  useEffect(() => {
    const wait = Math.max(0, 3000 - (Date.now() - lastLoad.current));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), lastLoad.current ? wait : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, lastEvent]);

  // Filet de sécurité (échéance des identifiants, état d'une demande d'analyse)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const investigationsOf = useCallback((id: string) => state?.investigations?.filter((i) => i.project_id === id).length ?? 0, [state]);

  const entries: ProjectEntry[] | null = summaries
    ? summaries.map((s) => ({ summary: s, details: detailsById[s.id] ?? null, analysis: analysisById[s.id] ?? null, investigations: investigationsOf(s.id) }))
    : null;

  return { entries, error, reload: load };
}
