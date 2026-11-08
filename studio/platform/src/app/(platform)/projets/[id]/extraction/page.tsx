"use client";

import { useMemo } from "react";
import { ArrowRight, FileUp, Plug } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ds/Progress";
import { EmptyState } from "@/components/ds/States";
import { Callout, Facts, Metric, Metrics, Section, StepHeader, TestBadge } from "@/components/project/Step";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import { DataExplorer, DataRelations } from "@/components/project/DataExplorer";
import { DataSourcesList, sourceRows } from "@/components/project/DataSources";
import { DataUpload } from "@/components/project/DataUpload";
import { connByConnector, useCredentialErasure } from "@/components/project/ConnShared";
import { dt, LoadError, nf, NoticeCallout, plural, TEST_SYSTEM, useAction, useKeyedData, type ActionNotice, type ExtractionSummary, type SourceMeta, type SourceProfile } from "@/components/project/DataKit";

/*
 * Étape 3 — Données : ce qui a réellement été récupéré de l'ancien logiciel, consultable en détail.
 * - GET /api/migration/sources : sources du coffre ; DELETE ?id= : retrait du projet.
 * - GET /api/migration : dernière extraction (résultat de chaque export demandé, refus compris).
 * - GET /api/migration/profile : structure lue (types, vides, distinctes, anomalies, relations).
 * - GET /api/migration/sources/rows : lignes paginées (recherche, tri, filtre côté serveur).
 * - POST /api/migration/extract { plan: "test" } : extraction avec le plan de test Relatio 2004 (jeu de test).
 * - POST /api/migration/sources : import manuel (DataUpload).
 */

interface Overview {
  extraction: ExtractionSummary | null;
  mapping: { version: number; origin: string; received_at: string } | null;
}

/** Exports demandés par la dernière extraction, par résultat. */
function outcomeOf(ex: ExtractionSummary | null) {
  const c = { total: 0, ok: 0, refused: 0, missing: 0, error: 0 };
  for (const r of ex?.results ?? []) {
    c.total++;
    if (r.status === "ok") c.ok++;
    else if (r.status === "not_found") c.missing++;
    else if (r.status === "error") c.error++;
    else c.refused++;
  }
  return c;
}

/** Le connecteur rapporte tel quel l'échec réseau de Node (« fetch failed ») : on l'explique sans le masquer. */
function networkHint(text: string): string | null {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|délai dépassé/i.test(text) ? "L'ancien logiciel n'a pas répondu : serveur arrêté, adresse incorrecte ou réseau indisponible." : null;
}

export default function DonneesPage() {
  const { id, summary, details, refresh, post } = useProject();
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const overview = useProjectData<Overview>("/api/migration");
  const list = sources.data;
  const ex = overview.data?.extraction ?? null;
  const fingerprint = useMemo(() => (list ?? []).map((s) => s.sha256).join(","), [list]);
  const profile = useKeyedData<SourceProfile>(list?.some((s) => s.tables.length) ? "/api/migration/profile" : null, fingerprint);
  const { busy, notice, setNotice, run } = useAction();

  const totals = useMemo(() => {
    const l = list ?? [];
    return {
      files: l.length,
      tables: l.reduce((n, s) => n + s.tables.length, 0),
      rows: l.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.rows, 0), 0),
      attachments: l.reduce((n, s) => n + (s.archive_entries ?? 0), 0),
      archives: l.filter((s) => s.archive_entries !== undefined).length,
    };
  }, [list]);
  const outcome = useMemo(() => outcomeOf(ex), [ex]);
  const rows = useMemo(() => sourceRows(list ?? [], ex), [list, ex]);
  const hasTest = rows.some((r) => r.kind === "file" && r.fromTest);

  // Le plan de test décrit le logiciel de test Relatio 2004 : il n'est proposé qu'à un projet qui le nomme.
  // Un nom de logiciel laissé vide (champ facultatif) ne fait jamais du jeu de test l'action d'un vrai projet.
  const planApplies = summary ? /relatio/i.test(summary.software ?? "") : null;
  const creds = details?.credentials;
  const hasData = (list?.length ?? 0) > 0;
  const erased = useCredentialErasure(id, creds?.stored);

  const reloadAll = () => {
    void sources.reload();
    void overview.reload();
  };

  const extract = () =>
    run(
      "test",
      () => post<{ ok: boolean; extraction: ExtractionSummary }>("/api/migration/extract", { plan: "test" }),
      (r): ActionNotice => {
        reloadAll();
        const c = outcomeOf(r.extraction);
        const failed = [c.refused ? `${plural(c.refused, "refusé")} au compte` : null, c.missing ? plural(c.missing, "introuvable") : null, c.error ? plural(c.error, "en erreur", "en erreur") : null].filter(Boolean);
        return {
          tone: c.ok === c.total ? "ok" : "warn",
          title: `Extraction terminée — jeu de test ${TEST_SYSTEM}`,
          text: `${plural(c.ok, "export récupéré", "exports récupérés")} sur ${nf(c.total)}${failed.length ? ` · ${failed.join(" · ")}` : ""}. ${c.refused ? "Les refus sont consignés ci-dessous : rien n'a été contourné." : ""}`,
        };
      },
    );

  const shownNotice: ActionNotice | null = notice
    ? notice.tone === "bad"
      ? {
          ...notice,
          title: notice.title ?? "Extraction impossible",
          text: (
            <>
              {notice.text}
              {typeof notice.text === "string" && networkHint(notice.text) && <span className="mt-0.5 block">{networkHint(notice.text)}</span>}
            </>
          ),
        }
      : notice
    : null;

  const onUploaded = () => {
    void sources.reload();
    void refresh();
  };
  const conn = details?.connection ?? null;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader
        step={3}
        title="Données"
        lead="Les exports de votre ancien logiciel, conservés tels quels pour la migration et sa vérification : consultez-les, vérifiez leur qualité, complétez-les."
        actions={
          planApplies === null ? undefined : (
            <>
              {/* Données reçues : la suite du parcours devient l'action principale (une seule) */}
              {hasData && (
                <Button href={`/projets/${id}/correspondances`} variant="primary" iconEnd={<ArrowRight size={16} />}>
                  Passer aux correspondances
                </Button>
              )}
              {planApplies ? (
                <Button
                  variant={hasData ? "secondary" : "primary"}
                  icon={<Plug size={16} />}
                  disabled={!creds?.stored}
                  title={!creds?.stored ? "Déposez d'abord les identifiants du logiciel de test (étape Connexion)" : undefined}
                  loading={busy === "test"}
                  loadingText="Extraction en cours…"
                  onClick={() => void extract()}
                >
                  Extraire avec le plan de test
                </Button>
              ) : (
                <Button href="#importer" variant={hasData ? "secondary" : "primary"} icon={<FileUp size={16} />}>
                  Importer des fichiers
                </Button>
              )}
            </>
          )
        }
        aside={
          planApplies && !hasTest ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small text-text-3">
              <TestBadge />
              <span>L&apos;extraction de test suit le plan d&apos;export du logiciel de test {TEST_SYSTEM} ; seuls les exports autorisés au compte sont récupérés.</span>
            </div>
          ) : undefined
        }
      />

      <Metrics className="grid-cols-1! min-[480px]:grid-cols-2! lg:grid-cols-4!">
        <Metric label="Sources" value={list ? nf(totals.files) : "—"} hint={list ? (totals.files ? plural(totals.tables, "table lue", "tables lues") : "aucun fichier reçu") : undefined} />
        <Metric label="Lignes reçues" value={list ? nf(totals.rows) : "—"} />
        <Metric label="Pièces jointes" value={list ? nf(totals.attachments) : "—"} hint={list ? (totals.archives ? `dans ${plural(totals.archives, "archive")}` : "aucune archive") : undefined} tone={list && !totals.attachments ? "muted" : undefined} />
        <Metric label="Exports refusés" value={ex ? nf(outcome.refused) : "—"} hint={ex ? `sur ${nf(outcome.total)} demandés` : overview.data ? "aucune extraction" : undefined} tone={ex ? (outcome.refused ? "warn" : "ok") : undefined} />
      </Metrics>

      {/* Avant toute extraction seulement : après une extraction réussie, les identifiants sont effacés comme prévu (SPEC §5) */}
      {planApplies && details && !creds?.stored && !ex && !hasData && (
        <Callout tone="warn" title="Identifiants manquants pour l'extraction de test" action={<Button href={`/projets/${id}/connexion`} variant="secondary" size="sm">Étape Connexion</Button>}>
          Déposez le compte du logiciel de test à l&apos;étape Connexion pour lancer l&apos;extraction, ou importez vos fichiers ci-dessous.
        </Callout>
      )}
      {planApplies && erased && (ex || hasData) && (
        <p className="text-small text-text-3">
          Identifiants effacés le {dt(erased.at)} — {erased.reason}. Pour une nouvelle extraction de test, déposez-en de nouveaux à l&apos;étape Connexion.
        </p>
      )}
      {shownNotice && <NoticeCallout notice={shownNotice} onClose={() => setNotice(null)} />}

      <Section
        title="Sources reçues"
        badge={hasTest ? <TestBadge /> : undefined}
        description={
          ex ? (
            <>
              Dernière extraction le {dt(ex.at)} · compte <span className="font-mono">{ex.account}</span>
            </>
          ) : (
            "Fichiers déposés par l'agent, récupérés par le connecteur ou importés à la main."
          )
        }
      >
        {sources.loading && !list ? (
          <Skeleton lines={3} label="Chargement des sources…" />
        ) : sources.error && !list ? (
          <LoadError message={sources.error} onRetry={() => void sources.reload()} />
        ) : rows.length ? (
          <div className="flex flex-col gap-3">
            {sources.error && <Callout tone="bad">Actualisation impossible : {sources.error}</Callout>}
            <DataSourcesList rows={rows} mapping={overview.data?.mapping ?? null} onRemoved={reloadAll} />
          </div>
        ) : (
          <EmptyState
            title="Aucune donnée pour l'instant"
            action={
              <Button href="#importer" variant="secondary" icon={<FileUp size={16} />}>
                Importer des fichiers
              </Button>
            }
          >
            {planApplies ? "Lancez l'extraction avec le plan de test, ou importez les exports de votre logiciel." : "Importez les exports de votre logiciel : ils apparaîtront ici, consultables ligne par ligne."}
          </EmptyState>
        )}
      </Section>

      {!!list?.some((s) => s.tables.length) && (
        <Section title="Consulter les données" description="Une table à la fois : colonnes, qualité et valeurs, telles que reçues." id="consulter">
          {profile.loading && !profile.data ? (
            <Skeleton lines={4} label="Analyse de la structure des fichiers reçus…" />
          ) : profile.error && !profile.data ? (
            <LoadError message={profile.error} onRetry={() => void profile.reload()} />
          ) : profile.data ? (
            <DataExplorer projectId={id} profile={profile.data} version={fingerprint} />
          ) : null}
        </Section>
      )}

      {profile.data && profile.data.tables.length > 1 && (
        <Section collapsible title="Relations entre les tables" description={`${plural(profile.data.relations.length, "relation déduite", "relations déduites")} des valeurs, à confirmer à l'étape Correspondances`}>
          <DataRelations relations={profile.data.relations} />
        </Section>
      )}

      <Section title="Importer des fichiers" id="importer" description="Complétez ou remplacez les données reçues avec vos propres exports. Ils sont conservés tels quels, avec leur empreinte.">
        <DataUpload projectId={id} existing={list ?? []} onUploaded={onUploaded} />
      </Section>

      <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : compte utilisé, connexion et liste des exports.">
        <div className="flex flex-col gap-5">
          <Facts
            items={[
              { label: "Adresse de l'ancien logiciel", value: summary?.legacy_url ? <span className="font-mono text-small break-all">{summary.legacy_url}</span> : "Non renseignée" },
              { label: "Compte", value: creds?.stored ? <span className="font-mono text-small">{creds.username_hint ?? "masqué"}</span> : "Aucun identifiant déposé" },
              { label: "Dernière connexion rapportée", value: conn ? `${conn.status === "connected" ? "établie" : conn.status === "failed" ? "échec" : conn.status === "pending" ? "en attente" : "intervention nécessaire"} · ${connByConnector(conn.by) ? "connecteur de REBORN" : conn.by} · ${dt(conn.at)}` : "Aucune" },
              { label: "Manifeste du logiciel source", value: ex ? (ex.manifest ? `${plural(ex.manifest.exports.length, "export déclaré", "exports déclarés")}, recomparés à l'étape Validation` : "non fourni : volumes non recomparables") : "—" },
            ]}
          />
          <ul className="flex flex-col gap-1.5 text-small">
            {[
              ["GET /api/migration/sources", "sources du coffre"],
              ["GET /api/migration/sources/rows", "lignes paginées (100 au plus par page)"],
              ["GET /api/migration/profile", "structure lue et qualité"],
              ["POST /api/migration/sources", "import d'un fichier { name, content_base64 }"],
              ["POST /api/migration/extract", "extraction (plan de test ou plan de l'agent)"],
            ].map(([route, what]) => (
              <li key={route} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <code className="font-mono text-meta break-all text-ink">{route}</code>
                <span className="text-text-3">{what}</span>
              </li>
            ))}
          </ul>
          <p className="text-small text-text-3">
            Contrat du plan d&apos;extraction de l&apos;agent :{" "}
            <a href="/api/migration/contracts" target="_blank" rel="noreferrer" className="ds-link">
              extraction_plan (JSON Schema)
            </a>
            .
          </p>
        </div>
      </Section>
    </div>
  );
}
