"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Hourglass, TestTubeDiagonal } from "lucide-react";
import { ButtonLink, Panel, cx } from "@/components/ui";
import { useReborn } from "@/components/RebornProvider";
import type { Investigation } from "@/lib/types";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { ConnDiscoveryInvestigation } from "@/components/project/ConnDiscoveryInvestigation";
import { ConnDiscoveryLaunch } from "@/components/project/ConnDiscoveryLaunch";
import { ConnDiscoveryStructure } from "@/components/project/ConnDiscoveryStructure";
import { ConnMissionReportList, type ConnMissionData } from "@/components/project/ConnMission";
import { CONN_STATE, CONN_WRAP_BTN, ConnFact, ConnLoading, ConnNotice, ConnTag, connDate, connMode } from "@/components/project/ConnShared";

/**
 * Étape 2 — Découverte : résultats réels des investigations rattachées au projet (project_id),
 * avec leurs preuves, et structure des données lue dans les exports déposés.
 */
export default function DecouvertePage() {
  const { id } = useProject();
  const { state, error } = useReborn();
  const [selected, setSelected] = useState<string | null>(null);
  const mine = useMemo(() => (state?.investigations ?? []).filter((i) => i.project_id === id), [state, id]);
  const current = mine.find((i) => i.id === selected) ?? mine.find((i) => i.status === "running") ?? mine.at(-1) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[780px]">
          <div className="eyebrow">Étape 2 · Découverte</div>
          <h2 className="mt-1 text-[20px] leading-tight font-black tracking-[-0.02em]">Écrans, fonctions et règles observés</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-sediment">
            Résultats réels de l&apos;exploration de l&apos;ancien logiciel par l&apos;agent Computer Use de H Company (Mouss), avec leurs preuves. Seules les investigations rattachées à ce
            projet sont présentées.
          </p>
        </div>
        <ButtonLink href={`/projets/${id}/extraction`} variant="ghost">
          Étape suivante : Données <ArrowRight size={14} aria-hidden />
        </ButtonLink>
      </div>

      {!state ? (
        error ? (
          <ConnNotice live tone="bad" title="Explorations indisponibles">
            {error}
          </ConnNotice>
        ) : (
          <Panel eyebrow="Explorations du projet">
            <ConnLoading label="Chargement des explorations rattachées au projet…" />
          </Panel>
        )
      ) : (
        <>
          {error && (
            <ConnNotice live tone="warn" title="Synchronisation interrompue">
              {error} Les informations affichées sont les dernières reçues.
            </ConnNotice>
          )}
          {!current ? (
            <>
              <Waiting />
              <ConnDiscoveryLaunch onLaunched={setSelected} />
            </>
          ) : (
            <>
              {mine.length > 1 && <InvestigationPicker list={mine} value={current.id} onChange={setSelected} />}
              <ConnDiscoveryInvestigation key={current.id} inv={current} state={state} />
              <ConnDiscoveryLaunch again onLaunched={setSelected} />
            </>
          )}
        </>
      )}

      <ConnDiscoveryStructure />

      <aside className="card flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4" aria-label="Mode de test local">
        <div className="flex min-w-0 max-w-[820px] items-start gap-3">
          <TestTubeDiagonal size={17} className="mt-0.5 shrink-0 text-ochre" aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-ink">Mode de test local</span>
              <ConnTag tone="warn">Test</ConnTag>
            </div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-sediment">
              L&apos;atelier rejoue des scénarios de référence ou un explorateur de répétition intégré, sans agent H Company. Ses investigations ne sont pas rattachées à ce projet et
              n&apos;apparaissent pas sur cette page.
            </p>
          </div>
        </div>
        <ButtonLink href="/atelier" variant="ghost">
          Ouvrir l&apos;atelier (test) <ArrowRight size={14} aria-hidden />
        </ButtonLink>
      </aside>
    </div>
  );
}

/** Choix de l'investigation affichée (projet ayant plusieurs explorations). */
function InvestigationPicker({ list, value, onChange }: { list: Investigation[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="group" aria-label="Investigations rattachées au projet" className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-sm bg-chalk-2 p-0.5">
      {list.map((i) => {
        const on = i.id === value;
        const mode = connMode(i.mode);
        const local = mode.group === "local";
        return (
          <button
            key={i.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(i.id)}
            title={`${i.id} · ouverte le ${connDate(i.created_at)}${local ? ` · mode local (${mode.label})` : " · agents réels"}`}
            className={cx("flex h-8 items-center gap-1.5 rounded-xs px-2.5 text-[12px] font-bold transition-colors duration-150", on ? "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-sediment hover:text-ink")}
          >
            {i.status === "running" && <span className="live-dot size-1.5 rounded-full bg-verdigris" aria-hidden />}
            Inv. #{i.number}
            {local && <span className="font-mono text-[9.5px] tracking-wider text-ochre uppercase">local</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Aucune investigation rattachée : état d'attente explicite, rappel de la mission et de ce qui sera rapporté. */
function Waiting() {
  const { id, summary, details } = useProject();
  const mission = useProjectData<ConnMissionData>(`/api/projects/${id}/mission`);
  const c = details?.connection;
  const s = CONN_STATE[c?.status ?? "none"];
  return (
    <section className="card overflow-hidden" aria-labelledby="discovery-waiting">
      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-chalk text-ink shadow-[0_0_0_1px_var(--color-line)]">
              <Hourglass size={15} aria-hidden />
            </span>
            <span className="eyebrow">Découverte non commencée</span>
          </div>
          <h3 id="discovery-waiting" className="mt-3 text-[18px] leading-tight font-black tracking-[-0.015em] text-ink">
            En attente de l&apos;exploration par l&apos;agent Computer Use (Mouss)
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-sediment">
            Aucune exploration n&apos;est encore rattachée à ce projet. L&apos;agent de H Company se connecte à l&apos;ancien logiciel avec le compte confié, parcourt les écrans
            accessibles et rapporte ce qu&apos;il observe, captures à l&apos;appui. Aucun résultat n&apos;est affiché tant qu&apos;il n&apos;a rien transmis.
          </p>

          <div className="mt-4 rounded-md bg-chalk p-3.5">
            <div className="eyebrow mb-2">Rappel de la mission</div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <ConnFact label="Connexion">
                {s.label}
                {c ? <span className="text-silt"> · {connDate(c.at)}</span> : null}
              </ConnFact>
              <ConnFact label="Identifiants">
                {!details ? "…" : details.credentials.stored ? <span className="font-mono text-[12px]">{details.credentials.username_hint ?? "masqué"}</span> : <span className="text-ochre">Aucun identifiant confié</span>}
              </ConnFact>
              <ConnFact label="Cible" mono={!!summary?.legacy_url} className="sm:col-span-2">
                {summary?.legacy_url ?? <span className="font-sans text-ochre">Adresse de l&apos;ancien logiciel non renseignée</span>}
              </ConnFact>
            </dl>
            <ButtonLink href={`/projets/${id}/connexion#mission`} variant="ghost" className={`mt-3 ${CONN_WRAP_BTN}`}>
              Préparer la mission (étape Connexion) <ArrowRight size={14} className="shrink-0" aria-hidden />
            </ButtonLink>
          </div>
        </div>

        <div className="border-t border-line bg-chalk/40 p-5 lg:border-t-0 lg:border-l">
          <div className="eyebrow">Ce que l&apos;agent devra rapporter</div>
          <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-sediment">Points de rapport de sa mission : chaque envoi apparaîtra sur cette page, ou à l&apos;étape Données pour les exports.</p>
          {mission.loading && !mission.data ? (
            <ConnLoading label="Chargement de la mission…" lines={4} />
          ) : mission.data ? (
            <ConnMissionReportList report={mission.data.report} />
          ) : (
            <ConnNotice tone="bad" title="Mission indisponible">
              {mission.error ?? "Réponse vide de l'API."}
            </ConnNotice>
          )}
        </div>
      </div>
    </section>
  );
}
