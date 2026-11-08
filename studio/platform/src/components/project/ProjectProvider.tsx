"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { redirectToLogin, useReborn } from "@/components/RebornProvider";

/* Types renvoyés par /api/projects (voir src/lib/migration/project.ts : ProjectSummary). */
export type ProjectStatus =
  | "CREATED"
  | "CONNECTION_PENDING"
  | "CONNECTED"
  | "DISCOVERING"
  | "EXTRACTING"
  | "MAPPING"
  | "RECONSTRUCTING"
  | "MIGRATING"
  | "VALIDATING"
  | "READY_FOR_REVIEW"
  | "PUBLISHED"
  | "PAUSED"
  | "FAILED"
  | "NEEDS_HUMAN_REVIEW";

export interface ProjectSummary {
  id: string;
  name: string;
  company: string | null;
  software: string | null;
  legacy_url: string | null;
  status: ProjectStatus;
  status_label: string;
  status_reason: string | null;
  created_at: string;
  updated_at: string | null;
  current: boolean;
  progress: { done: number; total: number; steps: { id: string; label: string; done: boolean }[] };
  data: { sources: number; source_rows: number; imported: number; rejected: number };
  anomalies: { pending_decisions: number; gaps: number; failed_checks: number };
  business_model: { version: number; status: string } | null;
  app: { id: string; port: number; deployed_at: string; run_id: string } | null;
}

export interface ProjectDetails {
  notes: string | null;
  software_type: string | null;
  authorization: { by: string; at: string; statement: string } | null;
  connection: { status: "pending" | "connected" | "failed" | "mfa_required" | "human_needed"; detail?: string; at: string; by: string } | null;
  credentials: { stored: boolean; username_hint?: string; expires_at?: string };
  status_history: { status: ProjectStatus; label: string; at: string; reason: string }[];
}

/** Message de l'erreur levée quand la session a expiré ou a été révoquée (la page part vers la connexion). */
export const SESSION_LOST_MESSAGE = "Session expirée : reconnectez-vous pour continuer.";

/**
 * Appel d'API sur un projet : ajoute ?project=… et remonte un message d'erreur lisible.
 * 401 (session expirée ou révoquée, demande du lot B3) : retour à la page de connexion avec la page en cours
 * comme adresse de retour (redirectToLogin, une seule redirection) ; l'appel échoue, rien n'est affiché comme réussi.
 */
export async function projectCall<T = unknown>(projectId: string, method: string, url: string, body?: unknown): Promise<T> {
  const u = new URL(url, window.location.origin);
  if (!u.pathname.startsWith("/api/projects/")) u.searchParams.set("project", projectId);
  const r = await fetch(u.pathname + u.search, { method, cache: "no-store", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) {
    redirectToLogin();
    throw new Error(SESSION_LOST_MESSAGE);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const issues = Array.isArray(data?.issues)
      ? data.issues
          .slice(0, 5)
          .map((i: { path?: string; message?: string }) => `${i.path ? `${i.path} : ` : ""}${i.message}`)
          .join(" · ")
      : "";
    throw new Error(`${data?.error ?? `Erreur HTTP ${r.status}`}${issues ? ` — ${issues}` : ""}`);
  }
  return data as T;
}

interface Ctx {
  id: string;
  summary: ProjectSummary | null;
  details: ProjectDetails | null;
  error: string | null;
  /** Recharge le résumé du projet (appelé automatiquement à chaque évènement du Studio). */
  refresh: () => Promise<void>;
  get: <T = unknown>(url: string) => Promise<T>;
  post: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  del: <T = unknown>(url: string) => Promise<T>;
  /** Compteur qui change à chaque évènement du Studio : à utiliser comme dépendance de rechargement. */
  tick: number;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function ProjectProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const { state } = useReborn();
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastEvent = state?.events?.at(-1)?.id ?? "";
  const [tick, setTick] = useState(0);
  const seen = useRef("");

  const refresh = useCallback(async () => {
    try {
      const r = await projectCall<{ project: ProjectSummary; details: ProjectDetails }>(id, "GET", `/api/projects/${id}`);
      setSummary(r.project);
      setDetails(r.details);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Rechargement sur évènement réel du Studio (flux SSE), et filet de sécurité toutes les 10 s
  useEffect(() => {
    if (lastEvent === seen.current) return;
    seen.current = lastEvent;
    setTick((t) => t + 1);
    void refresh();
  }, [lastEvent, refresh]);
  useEffect(() => {
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({
      id,
      summary,
      details,
      error,
      refresh,
      tick,
      get: (url) => projectCall(id, "GET", url),
      post: async (url, body) => {
        const out = await projectCall(id, "POST", url, body ?? {});
        void refresh();
        return out as never;
      },
      del: async (url) => {
        const out = await projectCall(id, "DELETE", url);
        void refresh();
        return out as never;
      },
    }),
    [id, summary, details, error, refresh, tick],
  );
  return <ProjectCtx.Provider value={value}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error("useProject hors de ProjectProvider");
  return c;
}

/** Charge une ressource d'API du projet et la recharge à chaque évènement du Studio. */
export function useProjectData<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> } {
  const { id, tick } = useProject();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await projectCall<T>(id, "GET", url));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, url]);
  useEffect(() => {
    void reload();
  }, [reload, tick]);
  return { data, error, loading, reload };
}
