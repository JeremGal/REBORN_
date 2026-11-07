"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { useReborn } from "@/components/RebornProvider";
import { ButtonLink, cx, Empty } from "@/components/ui";
import type { ProjectSummary } from "@/components/project/ProjectProvider";
import { StatusPill } from "@/components/project/ProjectShell";

/** Prochaine étape utile, déduite de l'état réel du projet. */
function nextStep(p: ProjectSummary): { slug: string; label: string } {
  const done = (id: string) => p.progress.steps.find((s) => s.id === id)?.done;
  if (p.status === "PUBLISHED" || p.app) return { slug: "livraison", label: "Ouvrir la livraison" };
  if (p.status === "FAILED") return { slug: p.data.imported ? "validation" : p.data.sources ? "migration" : "connexion", label: "Voir l'échec" };
  if (!done("connection") && !done("extraction")) return { slug: "connexion", label: "Établir la connexion" };
  if (!done("extraction")) return { slug: "extraction", label: "Récupérer les données" };
  if (!done("mapping")) return { slug: "correspondances", label: p.anomalies.pending_decisions ? `${p.anomalies.pending_decisions} point(s) à valider` : "Préparer les correspondances" };
  if (!p.data.imported) return { slug: "migration", label: "Lancer la migration" };
  if (!done("migration")) return { slug: "validation", label: "Examiner la vérification" };
  return { slug: "reconstruction", label: "Reconstruire le logiciel" };
}

const fmt = (n: number) => n.toLocaleString("fr-FR");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export default function ProjectsDashboard() {
  const { state } = useReborn();
  const lastEvent = state?.events?.at(-1)?.id;
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/projects", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setProjects(d.projects);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, lastEvent]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-black tracking-[-0.03em]">Projets de migration</h1>
          <p className="mt-1 max-w-[680px] text-[13.5px] text-sediment">
            Chaque projet part d'un ancien logiciel métier et aboutit à un nouveau logiciel autonome, avec les données historiques réellement migrées et vérifiées.
          </p>
        </div>
        <ButtonLink href="/projets/nouveau" variant="primary">
          <Plus size={15} /> Nouveau projet
        </ButtonLink>
      </header>

      {error && <p className="card border-l-2 border-rust p-3 text-[13px] text-rust">{error}</p>}

      {projects && !projects.length && (
        <Empty title="Aucun projet pour l'instant" hint="Créez un projet : nom de l'entreprise, ancien logiciel et accès autorisé.">
          <ButtonLink href="/projets/nouveau" variant="primary" className="mt-3">
            <Plus size={15} /> Créer le premier projet
          </ButtonLink>
        </Empty>
      )}

      {!!projects?.length && (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(220px,1.6fr)_minmax(150px,1fr)_minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,auto)] gap-4 border-b border-line bg-chalk/60 px-4 py-2 text-[11px] font-bold tracking-[0.05em] text-silt uppercase lg:grid">
            <span>Entreprise · ancien logiciel</span>
            <span>État</span>
            <span>Avancement réel</span>
            <span>Données migrées</span>
            <span>Anomalies</span>
            <span>Nouveau logiciel</span>
          </div>
          <ul>
            {projects.map((p) => {
              const next = nextStep(p);
              const pct = Math.round((p.progress.done / p.progress.total) * 100);
              const anomalies = p.anomalies.pending_decisions + p.anomalies.failed_checks + p.anomalies.gaps;
              return (
                <li key={p.id} className="border-b border-line last:border-b-0">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-150 hover:bg-chalk/40 lg:grid-cols-[minmax(220px,1.6fr)_minmax(150px,1fr)_minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(170px,auto)] lg:items-center">
                    <div className="min-w-0">
                      <Link href={`/projets/${p.id}/${next.slug}`} className="block truncate text-[14.5px] font-bold hover:text-verdigris">
                        {p.company ?? p.name}
                      </Link>
                      <div className="truncate text-[12px] text-silt">
                        {p.software ?? "Logiciel non précisé"} · mis à jour {when(p.updated_at)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <StatusPill status={p.status} label={p.status_label} />
                    </div>
                    <div title={p.progress.steps.map((s) => `${s.done ? "✓" : "·"} ${s.label}`).join("\n")}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-chalk">
                          <div className="h-full rounded-full bg-verdigris transition-[width] duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular w-16 text-right text-[12px] font-bold text-sediment">
                          {p.progress.done}/{p.progress.total} étapes
                        </span>
                      </div>
                    </div>
                    <div className="tabular text-[12.5px] text-sediment">
                      {p.data.imported ? (
                        <>
                          <b className="text-ink">{fmt(p.data.imported)}</b> enreg. {p.data.rejected ? <span className="text-ochre">· {fmt(p.data.rejected)} rejetés</span> : null}
                        </>
                      ) : p.data.source_rows ? (
                        <>{fmt(p.data.source_rows)} lignes reçues</>
                      ) : (
                        <span className="text-silt">—</span>
                      )}
                    </div>
                    <div className={cx("text-[12.5px]", anomalies ? "text-ochre" : "text-silt")}>
                      {anomalies ? [p.anomalies.pending_decisions && `${p.anomalies.pending_decisions} à valider`, p.anomalies.failed_checks && `${p.anomalies.failed_checks} contrôle(s) en échec`, p.anomalies.gaps && `${p.anomalies.gaps} écart(s)`].filter(Boolean).join(" · ") : "Aucune"}
                    </div>
                    <div className="flex items-center justify-between gap-2 lg:justify-end">
                      {p.app ? (
                        <span className="text-[12.5px]">
                          <span className="font-mono text-[12px] text-sediment">{p.app.id}</span>
                          <span className="text-silt"> · port {p.app.port}</span>
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-silt">Pas encore livré</span>
                      )}
                      <Link href={`/projets/${p.id}/${next.slug}`} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-verdigris hover:text-ink">
                        {next.label} <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-[12px] text-silt">
        Exploration et règles en mode atelier (agents de Mouss et d'Alan, ou explorateur de test) :{" "}
        <Link href="/atelier" className="font-bold text-sediment underline hover:text-ink">
          atelier découverte & règles
        </Link>
        .
      </p>
    </div>
  );
}
