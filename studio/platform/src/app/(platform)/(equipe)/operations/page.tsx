"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Badge, StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { DataTable, type Column } from "@/components/ds/DataTable";
import { Skeleton } from "@/components/ds/Progress";
import type { Tone } from "@/components/ds/styles";
import { Metric, Metrics, Section } from "@/components/project/Step";
import { missionInfo } from "@/components/project/ConnAnalysis";
import { ConnApiError, connApi, connCount, connDate, connErrorText, connHour, connNum, connRelative } from "@/components/project/ConnShared";
import { useReborn } from "@/components/RebornProvider";
import type { AgentOverview, OperationsOverview, ProjectOverview, QueueEntry } from "@/lib/migration/operations";

/*
 * Vue d'ensemble de l'équipe REBORN (rôle opérateur ; le layout (equipe) renvoie 404 à un client).
 * GET /api/operations : agents d'analyse connectés, file des demandes d'analyse, avancement de chaque projet.
 * Métadonnées seulement : aucune donnée des clients, aucun identifiant d'ancien logiciel, aucun secret.
 * Actualisée à chaque évènement du Studio et toutes les 10 s tant que la page est visible.
 */

const NETWORK: Record<string, string> = { public: "Internet", private: "Réseau local" };
const LOGIN: Record<string, string> = { h_vault: "Coffre H, hors du modèle", cdp: "Navigateur piloté, hors du modèle", none: "Sans identifiants" };
const STEP_BADGE: Record<ProjectOverview["step"]["state"], { tone: Tone; text: string }> = {
  attention: { tone: "warn", text: "Intervention" },
  next: { tone: "neutral", text: "En cours" },
  done: { tone: "ok", text: "Terminé" },
};

const TOOLS: { href: string; label: string; text: string }[] = [
  { href: "/atelier", label: "Tableau de l'atelier", text: "Démonstration sur le logiciel de test Quotix 98 : exploration, règles de calcul et comparaison avec l'original." },
  { href: "/investigation", label: "Explorer", text: "Journal en direct d'une investigation de l'atelier (essais et captures)." },
  { href: "/regles", label: "Comprendre", text: "Règles métier proposées par l'Analyste pour l'atelier." },
  { href: "/reconstruction", label: "Reconstruire", text: "Application générée à partir des règles de l'atelier." },
  { href: "/comparaison", label: "Comparer", text: "Preuve d'équivalence entre l'ancien calcul et le nouveau." },
  { href: "/migration", label: "Migrer", text: "Vue technique de la migration du projet interne de l'équipe." },
  { href: "/design-system", label: "Design system", text: "Composants de l'interface du Studio." },
];

function MissionBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-3">Aucune</span>;
  const info = missionInfo(status);
  return (
    <StatusBadge tone={info.tone} className="whitespace-nowrap">
      {info.label}
    </StatusBadge>
  );
}

function When({ iso, relative = false }: { iso: string | null; relative?: boolean }) {
  if (!iso) return <span className="text-text-3">—</span>;
  const rel = relative ? connRelative(iso) : null;
  return (
    <span className="flex flex-col">
      <time dateTime={iso} className="tabular">
        {rel ?? connDate(iso)}
      </time>
      {rel && <span className="tabular text-meta text-text-3">{connDate(iso)}</span>}
    </span>
  );
}

const ProjectRef = ({ company, id, software }: { company: string | null; id: string; software?: string | null }) => (
  <span className="flex min-w-0 flex-col">
    <span className="font-semibold break-words text-ink">{company ?? "Projet sans nom"}</span>
    {software && <span className="text-small break-words text-text-2">{software}</span>}
    <span className="font-mono text-meta text-text-3">{id}</span>
  </span>
);

const AGENT_COLUMNS: Column<AgentOverview>[] = [
  {
    key: "agent",
    header: "Agent",
    rowHeader: true,
    sortValue: (a) => a.name,
    cell: (a) => (
      <span className="flex min-w-0 flex-col">
        <span className="break-words">{a.name}</span>
        {a.label && <span className="text-small font-normal break-words text-text-2">{a.label}</span>}
        <span className="font-mono text-meta font-normal text-text-3">{a.id}</span>
      </span>
    ),
  },
  { key: "state", header: "État", sortValue: (a) => (a.disabled ? 2 : a.online ? 0 : 1), cell: (a) => (a.disabled ? <StatusBadge tone="bad" className="whitespace-nowrap">Désactivé</StatusBadge> : a.online ? <StatusBadge tone="ok" className="whitespace-nowrap">En ligne</StatusBadge> : <StatusBadge tone="neutral" className="whitespace-nowrap">Hors ligne</StatusBadge>) },
  { key: "seen", header: "Dernier signe de vie", sortValue: (a) => a.last_seen_at, cell: (a) => <When iso={a.last_seen_at} relative /> },
  { key: "networks", header: "Réseaux joignables", cell: (a) => a.networks.map((n) => NETWORK[n] ?? n).join(" · ") || "—" },
  { key: "login", header: "Identifiants", cell: (a) => LOGIN[a.login] ?? a.login },
  {
    key: "mission",
    header: "Mission en cours",
    cell: (a) =>
      a.missions.length ? (
        <ul className="flex flex-col gap-1.5">
          {a.missions.map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-small">{m.id}</span>
                <MissionBadge status={m.status} />
              </span>
              <span className="text-small text-text-2">{m.company ?? m.project_id}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-text-3">Aucune</span>
      ),
  },
];

const QUEUE_COLUMNS: Column<QueueEntry>[] = [
  { key: "id", header: "Demande", rowHeader: true, cell: (m) => <span className="font-mono text-small">{m.id}</span> },
  { key: "project", header: "Projet", sortValue: (m) => m.company ?? "", cell: (m) => <ProjectRef company={m.company} id={m.project_id} software={m.software} /> },
  { key: "status", header: "État", sortValue: (m) => missionInfo(m.status).label, cell: (m) => <MissionBadge status={m.status} /> },
  { key: "requested", header: "Demandée le", sortValue: (m) => m.requested_at, cell: (m) => <When iso={m.requested_at} /> },
  {
    key: "executor",
    header: "Prise par",
    sortValue: (m) => m.executor_name ?? "",
    cell: (m) =>
      m.executor_id ? (
        <span className="flex flex-col">
          <span className="break-words">{m.executor_name ?? m.executor_id}</span>
          {m.claimed_at && <span className="tabular text-meta text-text-3">le {connDate(m.claimed_at)}</span>}
        </span>
      ) : (
        <span className="text-text-3">Personne</span>
      ),
  },
  { key: "attempts", header: "Prises", align: "end", sortValue: (m) => m.attempts, cell: (m) => `${m.attempts} sur 3` },
  { key: "ended", header: "Fin", sortValue: (m) => m.ended_at ?? "", cell: (m) => <When iso={m.ended_at} /> },
];

const PROJECT_COLUMNS: Column<ProjectOverview>[] = [
  { key: "project", header: "Projet", rowHeader: true, sortValue: (p) => p.company ?? "", cell: (p) => <ProjectRef company={p.company} id={p.id} /> },
  { key: "software", header: "Logiciel", sortValue: (p) => p.software ?? "", cell: (p) => (p.software ? <span className="break-words">{p.software}</span> : <span className="text-text-3">—</span>) },
  {
    key: "step",
    header: "Étape du parcours",
    sortValue: (p) => (p.step.state === "attention" ? 0 : p.step.state === "next" ? 1 : 2),
    cell: (p) => (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{p.step.label}</span>
          <StatusBadge tone={STEP_BADGE[p.step.state].tone}>{STEP_BADGE[p.step.state].text}</StatusBadge>
        </span>
        <span className="text-small text-text-2">
          {p.step.text} · {p.steps_done} sur {p.steps_total} étapes faites
        </span>
      </span>
    ),
  },
  { key: "status", header: "État", sortValue: (p) => p.status_label, cell: (p) => p.status_label },
  { key: "analysis", header: "Analyse", cell: (p) => <MissionBadge status={p.analysis} /> },
  { key: "records", header: "Enregistrements migrés", align: "end", sortValue: (p) => p.records_migrated, cell: (p) => (p.records_migrated ? connNum(p.records_migrated) : <span className="text-text-3">0</span>) },
  { key: "delivered", header: "Logiciel livré", sortValue: (p) => (p.delivered ? 0 : 1), cell: (p) => (p.delivered ? <StatusBadge tone="ok">Oui</StatusBadge> : <StatusBadge tone="neutral">Non</StatusBadge>) },
  { key: "updated", header: "Mis à jour", sortValue: (p) => p.updated_at ?? p.created_at, cell: (p) => <When iso={p.updated_at ?? p.created_at} relative /> },
];

export default function OperationsPage() {
  const { state } = useReborn();
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // État « en cours » du bouton : seulement après un clic (les actualisations automatiques restent silencieuses)
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const lastEvent = state?.events?.at(-1)?.id ?? "";

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await connApi<OperationsOverview>("GET", "/api/operations");
      if (n !== seq.current) return;
      setData(r);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e instanceof ConnApiError && e.status === 403 ? "Cette vue est réservée à l'équipe REBORN." : connErrorText(e));
    }
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // À l'ouverture, à chaque évènement réel du Studio, et toutes les 10 s tant que la page est visible
  useEffect(() => {
    void load();
  }, [load, lastEvent]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => clearInterval(t);
  }, [load]);

  const a = data?.agents;
  const m = data?.missions;
  const p = data?.projects;
  const waiting = !!a && !!m && a.online === 0 && m.queued > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="max-w-[720px] min-w-0">
          <p className="eyebrow">Équipe REBORN</p>
          <h1 className="mt-1.5 text-h1 font-semibold text-ink">Vue d&apos;ensemble des opérations</h1>
          <p className="mt-2 text-lead leading-relaxed text-text-2">
            Ce qui se passe réellement : les agents d&apos;analyse connectés, les demandes d&apos;analyse des clients et l&apos;avancement de chaque projet. Seules des informations de suivi sont affichées : aucune donnée des clients, aucun identifiant
            d&apos;ancien logiciel, aucun secret.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => void refresh()} loading={refreshing} loadingText="Actualisation…">
            Actualiser
          </Button>
          {data && <span className="tabular text-meta text-text-3">Mis à jour à {connHour(data.generated_at)}</span>}
        </div>
      </header>

      {error && (
        <Alert tone="bad" live="off" title="Vue d'ensemble indisponible">
          {error} {data ? "Les informations affichées sont les dernières reçues." : ""}
        </Alert>
      )}

      <Metrics>
        <Metric label="Agents en ligne" value={a ? connNum(a.online) : "—"} tone={a ? (a.online ? "ok" : "warn") : undefined} hint={a ? `sur ${connCount(a.total, "agent connu", "agents connus")}` : undefined} />
        <Metric label="Demandes en file" value={m ? connNum(m.queued) : "—"} tone={waiting ? "warn" : undefined} hint={m ? (m.queued ? "attendent qu'un agent les prenne" : "aucune en attente") : undefined} />
        <Metric label="Analyses en cours" value={m ? connNum(m.running) : "—"} hint={m ? (m.needs_human ? `${connCount(m.needs_human, "attend", "attendent")} une intervention du client` : "prises par un agent") : undefined} />
        <Metric label="Projets" value={p ? connNum(p.total) : "—"} hint={p ? `${connCount(p.delivered, "livré", "livrés")} · ${connCount(p.attention, "à débloquer", "à débloquer")}` : undefined} tone={p?.attention ? "warn" : undefined} />
      </Metrics>

      {waiting && (
        <Alert tone="warn" live="off" title="Aucun agent d'analyse en ligne">
          {connCount(m!.queued, "demande attend", "demandes attendent")} : les clients voient « Agent d&apos;analyse non disponible pour le moment. ». Lancez l&apos;exécuteur de l&apos;agent (studio/clients/h_executor.py) avec le jeton explorer de ce Studio : il apparaîtra ci-dessous dès son
          premier battement de cœur et prendra la plus ancienne demande.
        </Alert>
      )}

      {!data && !error ? (
        <Skeleton lines={6} label="Lecture des agents, des demandes et des projets…" />
      ) : data ? (
        <>
          <Section title="Agents d'analyse" badge={<Badge tone={data.agents.online ? "ok" : "neutral"}>{`${connNum(data.agents.online)} en ligne`}</Badge>} description="Exécuteurs qui se sont signalés au Studio. Un agent est en ligne si son dernier battement de cœur a moins d'une minute.">
            <DataTable
              caption="Agents d'analyse : état, dernier signe de vie, réseaux, mission en cours"
              captionHidden
              columns={AGENT_COLUMNS}
              rows={data.agents.list}
              rowKey={(x) => x.id}
              empty="Aucun agent ne s'est encore signalé. Lancez l'exécuteur de l'agent avec le jeton explorer : il apparaîtra ici dès son premier battement de cœur."
            />
          </Section>

          <Section title="File des demandes d'analyse" badge={<Badge>{connNum(data.missions.list.length)}</Badge>} description="Chaque « Analyser mon logiciel » d'un client : en file, prise par un agent, terminée. Les demandes en cours sont en tête.">
            <DataTable caption="Demandes d'analyse : projet, état, dates, agent qui l'a prise" captionHidden columns={QUEUE_COLUMNS} rows={data.missions.list} rowKey={(x) => x.id} empty="Aucune demande d'analyse pour l'instant." />
          </Section>

          <Section title="Projets" badge={<Badge>{connNum(data.projects.total)}</Badge>} description="Étape du parcours calculée comme pour le client, état, volume réellement migré et logiciel livré. Les pages des projets des clients restent fermées à l'équipe.">
            <DataTable caption="Projets : entreprise, logiciel, étape du parcours, état, enregistrements migrés, logiciel livré" captionHidden columns={PROJECT_COLUMNS} rows={data.projects.list} rowKey={(x) => x.id} empty="Aucun projet pour l'instant." />
          </Section>
        </>
      ) : null}

      <Section collapsible title="Outils de démonstration" description="Anciens écrans de l'atelier, utiles pour les démonstrations : ils ne servent pas aux projets des clients.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="group flex h-full flex-col gap-0.5 rounded-control px-3 py-2.5 ring-1 ring-line transition-colors duration-(--duration-fast) hover:bg-canvas">
                <span className="flex items-center gap-1.5 text-body font-semibold text-ink">
                  {t.label}
                  <ArrowRight size={14} aria-hidden className="text-text-3 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5" />
                </span>
                <span className="text-small text-text-2">{t.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
