"use client";

import { RefreshCw } from "lucide-react";
import { Button, Tabs } from "@/components/ds";
import { useProjectData } from "@/components/project/ProjectProvider";
import { Callout, EmptyState, Metric, Metrics, Section, StepHeader } from "@/components/project/Step";
import { Loading, StepLink, fmtDate, fmtInt, plural, sentence, type AppSpecPreview, type BusinessModelMeta, type MigrationOverview } from "@/components/project/AppKit";
import { DeployButton, DeployMessages, DeployReadyLine, useDeploy } from "@/components/project/AppGenerate";
import { NotRebuiltList, ReconstructionTechSection, SpecDetails, SpecOverview } from "@/components/project/AppSpecView";
import { BusinessModelSection, totals } from "@/components/project/AppBusinessModel";

/**
 * Étape 7 · Reconstruction : examen du logiciel qui sera généré (vue d'ensemble et vue avancée de
 * l'ApplicationSpec, GET /api/migration/spec : rien n'y est inventé), modèle métier (versions, rejeu
 * sur l'historique, décision), puis génération et mise en service.
 */
export default function ReconstructionPage() {
  const spec = useProjectData<AppSpecPreview>("/api/migration/spec");
  const models = useProjectData<{ versions: BusinessModelMeta[] }>("/api/migration/business-model");
  const overview = useProjectData<MigrationOverview>("/api/migration");

  const reloadAll = async () => {
    await Promise.all([spec.reload(), models.reload(), overview.reload()]);
  };
  const deploy = useDeploy({ overview: overview.data, reloadOverview: overview.reload, onDeployed: reloadAll });
  const completedRunId = overview.data ? ([...overview.data.runs].reverse().find((r) => r.status === "completed")?.id ?? null) : null;

  const s = spec.data;
  const versions = models.data?.versions ?? null;
  const sorted = versions ? [...versions].sort((a, b) => b.version - a.version) : [];
  const validated = sorted.find((v) => v.status === "validated") ?? null;
  const pending = sorted.filter((v) => v.status === "proposed");
  const modules = s ? s.navigation.length : 0;
  const pages = s?.screens?.length ?? 0;
  const notRebuilt = s?.not_rebuilt?.length ?? 0;
  const replay = validated?.history_check ? totals(validated.history_check) : null;
  const testMapping = overview.data?.mapping?.origin === "fixture";
  // Après la mise en service, la description n'annonce plus ce qui « sera » généré (PR-16)
  const deployment = overview.data?.app?.deployment ?? null;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        step={7}
        title="Reconstruction"
        lead="Votre nouveau logiciel est décrit à partir de vos données et de leurs correspondances : examinez-le, validez ses calculs, puis mettez-le en service."
        actions={<DeployButton d={deploy} />}
        aside={<DeployReadyLine d={deploy} />}
      />

      <Metrics>
        <Metric label="Modules" value={s ? fmtInt(modules) : "—"} hint={s ? plural(s.entities.length, "table reprise", "tables reprises") : undefined} tone={s ? undefined : "muted"} />
        <Metric label="Pages" value={s ? fmtInt(pages) : "—"} hint={s ? "listes, fiches, formulaires" : undefined} tone={s ? undefined : "muted"} />
        <Metric
          label="Modèle métier validé"
          value={validated ? `v${validated.version}` : "—"}
          tone={validated ? "ok" : "muted"}
          hint={
            pending.length
              ? `v${pending[0].version} à valider`
              : validated
                ? replay
                  ? `${plural(replay.identical, "identique", "identiques")} sur ${fmtInt(replay.checked)}`
                  : "pas rejoué sur l'historique"
                : versions
                  ? versions.length
                    ? "aucune version validée"
                    : "aucune version reçue"
                  : undefined
          }
        />
        <Metric label="Non reconstruits" value={s ? fmtInt(notRebuilt) : "—"} tone={!s ? "muted" : notRebuilt ? "warn" : undefined} hint={s ? "absents du nouveau logiciel" : undefined} />
      </Metrics>

      <DeployMessages d={deploy} overview={overview.data} overviewError={overview.error} reloadOverview={overview.reload} spec={s} />

      {s && spec.error && <Callout tone="warn">Actualisation de la spécification impossible : {sentence(spec.error)} Dernier aperçu affiché.</Callout>}

      {s ? (
        <Section
          title="Votre nouveau logiciel"
          description={
            deployment
              ? `Tel que le décrit sa spécification actuelle. Le logiciel en service a été généré le ${fmtDate(deployment.at)} ; une nouvelle mise en service appliquerait cette description.`
              : "Ce qui sera généré à la mise en service, tel que décrit par sa spécification. Rien n'est créé avant."
          }
        >
          <Tabs
            label="Présentation de la spécification"
            tabs={[
              { id: "ensemble", label: "Vue d'ensemble", content: <SpecOverview spec={s} testMapping={testMapping} /> },
              {
                id: "avance",
                label: "Vue avancée",
                content: (
                  <div className="flex flex-col gap-7">
                    <SpecDetails spec={s} />
                    <div>
                      <h3 className="mb-2 text-body font-semibold text-ink">Éléments non reconstruits</h3>
                      <NotRebuiltList items={s.not_rebuilt ?? []} />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Section>
      ) : spec.loading ? (
        <Loading label="Calcul de la spécification du nouveau logiciel…" />
      ) : (
        <Section title="Votre nouveau logiciel">
          <EmptyState
            title="Spécification indisponible"
            action={
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void spec.reload()}>
                Recalculer l&apos;aperçu
              </Button>
            }
          >
            {sentence(spec.error ?? "Le Studio n'a renvoyé aucune description")} Elle se déduit des correspondances : <StepLink step="correspondances">étape Correspondances</StepLink>.
          </EmptyState>
        </Section>
      )}

      <BusinessModelSection versions={versions} loading={models.loading} error={models.error} reload={models.reload} spec={s} completedRunId={completedRunId} onChanged={reloadAll} />

      <ReconstructionTechSection spec={s} />
    </div>
  );
}
