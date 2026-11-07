"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { compareAll } from "@/lib/compare";
import { resolveApp, type ResolvedApp } from "@/lib/appschema";
import type { ComparisonReport, Investigation, RebornState, StoredRuleModel, StoredSchema } from "@/lib/types";

interface Ctx {
  state: RebornState | null;
  /** Erreur de chargement (serveur injoignable…). */
  error: string | null;
  connected: boolean;
  refresh: () => void;
  model: StoredRuleModel | null;
  schema: StoredSchema | null;
  active: Investigation | null;
  /** Application reconstruite résolue (schéma × modèle courants). */
  app: ResolvedApp | null;
  /** Comparaison du modèle courant sur l'investigation active. */
  report: ComparisonReport | null;
}

const RebornContext = createContext<Ctx | null>(null);

export function RebornProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RebornState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const inflight = useRef(false);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) {
      dirty.current = true;
      return;
    }
    inflight.current = true;
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setState(await r.json());
      setError(null);
    } catch (e) {
      setError(`Plateforme injoignable (${(e as Error).message}). Nouvelle tentative automatique…`);
    } finally {
      inflight.current = false;
      if (dirty.current) {
        dirty.current = false;
        void load();
      }
    }
  }, []);

  // Synchronisation : polling d'un compteur de révision (≈ 0,7 s, ralenti si l'onglet est masqué).
  // Aucun flux persistant : plusieurs onglets ouverts ne saturent pas les connexions du navigateur.
  const lastRevision = useRef<number | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch("/api/revision", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const { revision } = (await r.json()) as { revision: number };
        setConnected(true);
        if (revision !== lastRevision.current) {
          lastRevision.current = revision;
          await load();
        }
      } catch {
        setConnected(false);
      }
      if (!stopped) timer = setTimeout(tick, document.visibilityState === "visible" ? 700 : 4000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const value = useMemo<Ctx>(() => {
    const model = state?.models.at(-1) ?? null;
    const schema = state?.schemas.at(-1) ?? null;
    const active = state?.investigations.find((i) => i.id === state.active_investigation_id) ?? null;
    const app = state ? resolveApp(model, schema, state.observations) : null;
    const report = state && model ? compareAll(model, state.observations, active?.id ?? "all", { fields: app?.fields }) : null;
    return { state, error, connected, refresh: load, model, schema, active, app, report };
  }, [state, error, connected, load]);

  return <RebornContext.Provider value={value}>{children}</RebornContext.Provider>;
}

export function useReborn(): Ctx {
  const c = useContext(RebornContext);
  if (!c) throw new Error("useReborn hors RebornProvider");
  return c;
}

export async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const details = Array.isArray(data?.issues)
      ? data.issues
          .slice(0, 6)
          .map((i: { message?: string; path?: string; rule_id?: string }) => `${i.rule_id ? `${i.rule_id} : ` : i.path ? `${i.path} : ` : ""}${i.message}`)
          .join(" · ")
      : "";
    const hint = r.status === 401 ? " Ouvrez /connexion pour autoriser ce navigateur." : "";
    throw new Error(`${data?.error ?? `HTTP ${r.status}`}${details ? ` — ${details}` : ""}${hint}`);
  }
  return data;
}
