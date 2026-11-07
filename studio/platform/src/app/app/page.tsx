"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useReborn } from "@/components/RebornProvider";
import { GeneratedApp } from "@/components/app/GeneratedApp";
import { Unsupported } from "@/components/app/Unsupported";
import { ENGINE_ID } from "@/lib/engine/engine";

/** L'application métier livrée : générée depuis le schéma et le modèle courants, sans l'habillage REBORN. */
export default function DeliveredApp() {
  const { state, error, app, model } = useReborn();
  const [notice, setNotice] = useState<string | null>(null);
  const seen = useRef<{ m: number | null; s: number | null } | null>(null);

  // Mise à jour à chaud : le modèle ou le schéma a changé pendant l'utilisation
  useEffect(() => {
    if (!app) return;
    const cur = { m: app.model_version, s: app.schema_version };
    const prev = seen.current;
    seen.current = cur;
    if (!prev || (prev.m === cur.m && prev.s === cur.s)) return;
    const parts = [prev.m !== cur.m && cur.m && `règles métier v${cur.m}`, prev.s !== cur.s && cur.s && `interface v${cur.s}`].filter(Boolean);
    setNotice(`Application mise à jour : ${parts.join(" et ")}.`);
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [app]);

  return (
    <>
      <header className="border-b border-ga-line bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[16px] font-bold tracking-tight">{app?.application ?? "Application"}</span>
            {app?.module && <span className="truncate text-[13px] text-ga-muted">{app.module}</span>}
          </div>
          {app && (app.model_version || app.schema_version) && (
            <span className="shrink-0 rounded-md bg-ga-field px-2 py-1 font-mono text-[11px] text-ga-muted">
              interface v{app.schema_version ?? "—"} · règles v{app.model_version ?? "—"}
            </span>
          )}
        </div>
      </header>

      {notice && (
        <div role="status" className="enter mx-auto mt-4 flex max-w-6xl items-center gap-2 px-5">
          <span className="flex items-center gap-2 rounded-md bg-ga-accent-soft px-3 py-2 text-[13px] font-medium text-ga-accent">
            <RefreshCw size={14} /> {notice}
          </span>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-5 py-8">
        {error && (
          <div role="alert" className="mb-5 rounded-md bg-ga-danger-soft px-4 py-3 text-[13px] text-ga-danger">
            {error}
          </div>
        )}

        {!state ? (
          <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
              <div className="h-8 w-64 animate-pulse rounded-md bg-ga-field" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-ga-field" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-xl bg-ga-field" />
          </div>
        ) : !app || app.fields.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-[0_0_0_1px_var(--color-ga-line)]">
            <h1 className="text-[18px] font-bold">Application non disponible</h1>
            <p className="mt-1 text-[13px] text-ga-muted">Aucune interface n&apos;a encore été décrite. Elle sera générée dès réception du schéma ou du modèle métier.</p>
          </div>
        ) : (
          <>
            <h1 className="text-[26px] font-bold tracking-tight">{app.title}</h1>
            {app.description && <p className="mt-1 mb-7 max-w-2xl text-[14px] text-ga-muted">{app.description}</p>}
            {!app.description && <div className="mb-7" />}
            <GeneratedApp app={app} model={model} />
            <div className="mt-10">
              <Unsupported items={app.unsupported} />
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-10 text-[11px] text-ga-faint">
        Application reconstruite par REBORN à partir du comportement observé · moteur {ENGINE_ID}
        {model ? ` · modèle publié le ${new Date(model.received_at).toLocaleString("fr-FR")}` : ""}
        {model?.source === "fixture" ? " · données de référence (mode local, sans agent)" : ""}
      </footer>
    </>
  );
}
