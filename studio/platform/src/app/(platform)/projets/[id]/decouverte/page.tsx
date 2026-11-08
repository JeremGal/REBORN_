"use client";

import { useMemo } from "react";
import { ArrowRight, Database, FileUp } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ds/Progress";
import { useReborn } from "@/components/RebornProvider";
import { Facts, Metric, Metrics, Section, StepHeader, TestBadge } from "@/components/project/Step";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { missionInfo, useAnalysis } from "@/components/project/ConnAnalysis";
import { DiscoveryAnomalies, DiscoveryDetails, DiscoveryModules, DiscoveryTimeline, buildTimeline, collectAnomalies, connMode, discoveryData, fromTestPlan, sourceOrigin } from "@/components/project/ConnDiscovery";
import { connByConnector, connCount, connDate, connNum } from "@/components/project/ConnShared";
import { journey, nextAction } from "@/components/shell/journey";
import type { ExtractionSummary, SourceMeta } from "@/components/project/DataKit";

/** Exploration indisponible tant qu'aucun rapport réel de l'agent n'est reçu (SPEC §6). */
const NO_AGENT = "Exploration indisponible — agent non connecté.";

/**
 * Étape 2 — Découverte : ce que l'agent d'analyse a réellement observé (chronologie des faits
 * reçus, modules et écrans, données accessibles, anomalies). Aucune progression simulée.
 */
export default function DecouvertePage() {
  const { id, summary, details, tick } = useProject();
  const { state, error } = useReborn();
  const analysis = useAnalysis(id, tick);
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const overview = useProjectData<{ extraction: ExtractionSummary | null }>("/api/migration");
  const extraction = overview.data?.extraction ?? null;
  const data = useMemo(() => (state ? discoveryData(state, id) : null), [state, id]);
  const mission = analysis.data?.mission ?? null;
  const timeline = useMemo(() => buildTimeline({ details, mission, data, sources: sources.data, extraction }), [details, mission, data, sources.data, extraction]);
  const anomalies = useMemo(() => collectAnomalies(data, sources.data, extraction), [data, sources.data, extraction]);
  const fromAgent = (sources.data ?? []).filter((s) => sourceOrigin(s) !== "manual");
  const testFlags = (sources.data ?? []).map((s) => fromTestPlan(s, extraction));
  const anyTest = testFlags.some(Boolean);
  const mixedTest = anyTest && testFlags.some((t) => !t);
  const realAgent = !!data && (data.fromAgents > 0 || data.schemas.some((s) => s.source !== "fixture") || data.observations.length > 0 || (!!details?.connection && !connByConnector(details.connection.by)));
  const available = analysis.data?.executor_available ?? false;
  const info = missionInfo(mission?.status);
  const loading = !state || !details || analysis.loading;
  // Une seule action principale : la suite du parcours si des données sont déjà là, sinon l'import de fichiers
  // tant qu'aucun agent n'a rien rapporté (la Découverte est facultative, jamais un préalable).
  const investigations = data?.investigations.length ?? 0;
  const ahead = summary && summary.data.sources > 0 ? nextAction(summary, journey(summary, investigations, details)) : null;
  const next = ahead && ahead.slug !== "decouverte" && ahead.slug !== "connexion" ? ahead : null;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step={2}
        title="Découverte de l'ancien logiciel"
        lead="Ce que l'agent d'analyse a réellement observé dans votre logiciel : modules, écrans, données accessibles et anomalies, au fil de ses rapports."
        actions={
          <>
            {next ? (
              <Button href={`/projets/${id}/${next.slug}`} variant="primary" iconEnd={<ArrowRight size={16} />}>
                {next.label}
              </Button>
            ) : !realAgent ? (
              <Button href={`/projets/${id}/extraction#importer`} variant="primary" icon={<FileUp size={16} />}>
                Importer mes fichiers
              </Button>
            ) : null}
            <Button href={`/projets/${id}/connexion`} variant="secondary" iconEnd={<ArrowRight size={16} />}>
              Suivre l&apos;analyse
            </Button>
          </>
        }
      />

      <Metrics className="grid-cols-1! min-[480px]:grid-cols-2! lg:grid-cols-4!">
        <Metric label="Explorations" value={data ? connNum(data.investigations.length) : "—"} hint={data ? (data.investigations.some((i) => i.status === "running") ? "Une exploration en cours" : data.investigations.length ? "Aucune en cours" : "Aucune ouverte") : undefined} />
        <Metric label="Écrans décrits" value={data ? connNum(data.schemas.length) : "—"} hint={data?.schemas.length ? connCount(new Set(data.schemas.map((s) => s.module ?? "")).size, "module") : undefined} />
        <Metric label="Exports reçus" value={sources.data ? connNum(fromAgent.length) : "—"} hint={sources.data ? `${connCount(sources.data.length - fromAgent.length, "fichier importé", "fichiers importés")} à la main` : undefined} />
        <Metric label="Anomalies relevées" value={data && sources.data ? connNum(anomalies.length) : "—"} tone={anomalies.length ? "warn" : undefined} />
      </Metrics>

      {loading && !state ? (
        <Skeleton lines={3} label="Lecture des rapports reçus pour ce projet…" />
      ) : !realAgent ? (
        available ? (
          <Alert tone="info" title="L'agent d'analyse est disponible">
            Aucun rapport n&apos;a encore été reçu pour ce projet. {mission && info.active ? `Demande : ${info.label.toLowerCase()}.` : "Demandez l'analyse à l'étape Connexion."} Les résultats s&apos;afficheront ici dès ses premiers rapports.
          </Alert>
        ) : (
          <Alert
            tone="warn"
            title={NO_AGENT}
            action={
              <Button href={`/projets/${id}/extraction#importer`} variant="secondary" size="sm" icon={<FileUp size={14} />}>
                Importer des fichiers
              </Button>
            }
          >
            Aucun rapport de l&apos;agent d&apos;analyse n&apos;a été reçu pour ce projet : rien n&apos;est affiché tant qu&apos;il n&apos;a rien transmis. {mission && info.active ? `Votre demande est ${info.label.toLowerCase()}.` : ""} En attendant, vous pouvez importer les exports de votre logiciel.
          </Alert>
        )
      ) : null}
      {error && state && (
        <Alert tone="warn" live="off" title="Synchronisation interrompue">
          {error} Les informations affichées sont les dernières reçues.
        </Alert>
      )}

      <Section title="Chronologie" description="Faits réellement reçus pour ce projet, du plus ancien au plus récent.">
        {!state || !details ? <Skeleton lines={3} label="Lecture de la chronologie…" /> : <DiscoveryTimeline items={timeline} />}
      </Section>

      {data && data.schemas.length > 0 && (
        <Section title="Modules et écrans identifiés" badge={<Badge>{connNum(data.schemas.length)}</Badge>} description="Champs, valeurs possibles et sorties relevés à l'écran par l'agent.">
          <DiscoveryModules schemas={data.schemas} />
        </Section>
      )}

      {sources.data && sources.data.length > 0 && (
        <Section
          title="Données accessibles"
          badge={anyTest && !mixedTest ? <TestBadge /> : undefined}
          description="Fichiers reçus pour ce projet : ils sont consultables en détail à l'étape Données."
          actions={
            <Button href={`/projets/${id}/extraction`} variant="secondary" size="sm" icon={<Database size={14} />}>
              Consulter les données
            </Button>
          }
        >
          <p className="mb-3 text-small text-text-2">
            {connCount(sources.data.length, "fichier")} · {connCount(sources.data.reduce((n, s) => n + s.tables.length, 0), "table")} ·{" "}
            {connCount(sources.data.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows, 0), 0), "ligne")}
            {sources.data.some((s) => s.archive_entries !== undefined) ? ` · ${connCount(sources.data.reduce((n, s) => n + (s.archive_entries ?? 0), 0), "pièce jointe", "pièces jointes")}` : ""}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sources.data.map((s) => {
              const rows = s.tables.reduce((n, t) => n + t.rows, 0);
              const o = sourceOrigin(s);
              return (
                <li key={s.id} className="flex min-w-0 flex-col gap-0.5 rounded-control px-3 py-2.5 ring-1 ring-line">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 text-body font-semibold break-words text-ink">{s.name}</span>
                    {mixedTest && fromTestPlan(s, extraction) && <TestBadge />}
                  </span>
                  <span className="tabular text-small text-text-2">{s.archive_entries !== undefined ? connCount(s.archive_entries, "fichier") : s.tables.length > 1 ? `${connCount(s.tables.length, "table")} · ${connCount(rows, "ligne")}` : connCount(rows, "ligne")}</span>
                  <span className="text-meta text-text-3">
                    {o === "connector" ? "Connecteur de REBORN" : o === "agent" ? "Agent d'analyse" : o === "manual" ? "Import manuel" : `Envoyé par ${s.origin.by ?? "API"}`} · {connDate(s.received_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {anomalies.length > 0 && (
        <Section title="Anomalies relevées" badge={<Badge tone="warn">{connNum(anomalies.length)}</Badge>} description="Refus, éléments non reconstruits, essais non aboutis et avertissements, tels que rapportés.">
          <DiscoveryAnomalies items={anomalies} />
        </Section>
      )}

      <div className="flex flex-col gap-3">
        {data && <DiscoveryDetails data={data} />}
        <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : explorations rattachées au projet.">
          {!data || data.investigations.length === 0 ? (
            <p className="text-body text-text-2">Aucune exploration n&apos;est rattachée à ce projet. Elles sont ouvertes par l&apos;agent quand il prend en charge la demande d&apos;analyse.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {data.investigations.map((i) => {
                const mode = connMode(i.mode);
                return (
                  <li key={i.id}>
                    <Facts
                      items={[
                        { label: "Exploration", value: <span className="font-mono text-small">{`${i.id} · n° ${i.number}`}</span> },
                        { label: "Mode", value: mode.local ? <TestBadge>{`Essai local — ${mode.label}`}</TestBadge> : "Agent réel" },
                        { label: "Ouverte le", value: connDate(i.created_at) },
                        { label: "État", value: i.status === "running" ? "En cours" : i.status === "failed" ? "En échec" : `Terminée${i.completed_at ? ` le ${connDate(i.completed_at)}` : ""}` },
                      ]}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
