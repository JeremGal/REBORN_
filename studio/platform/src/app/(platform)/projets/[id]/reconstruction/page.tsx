"use client";

import { RefreshCw } from "lucide-react";
import { Button, Empty } from "@/components/ui";
import { useProjectData } from "@/components/project/ProjectProvider";
import { Loading, Notice, StepLink, sentence, type AppSpecPreview, type BusinessModelMeta, type MigrationOverview } from "@/components/project/AppKit";
import { AppGeneratePanel } from "@/components/project/AppGenerate";
import { AppActions, AppEntities, AppNotRebuilt, AppScreens, AppSpecSummary } from "@/components/project/AppSpecView";
import { AppBusinessModelPanel } from "@/components/project/AppBusinessModel";

/**
 * Étape 7 · Reconstruction : aperçu de la spécification du nouveau logiciel (GET /api/migration/spec),
 * modèle métier (versions, vérification sur l'historique, décision) et génération / mise en service.
 */
export default function ReconstructionPage() {
  const spec = useProjectData<AppSpecPreview>("/api/migration/spec");
  const models = useProjectData<{ versions: BusinessModelMeta[] }>("/api/migration/business-model");
  const overview = useProjectData<MigrationOverview>("/api/migration");

  const reloadAll = async () => {
    await Promise.all([spec.reload(), models.reload(), overview.reload()]);
  };
  const completedRunId = overview.data ? ([...overview.data.runs].reverse().find((r) => r.status === "completed")?.id ?? null) : null;
  const s = spec.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <div className="eyebrow">Étape 7 · Reconstruction</div>
        <h2 className="mt-0.5 text-[19px] leading-tight font-black tracking-[-0.02em]">Structure du nouveau logiciel et modèle métier</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-sediment">
          Aperçu de la spécification que REBORN déduit des données réellement extraites, des correspondances et des décisions validées : entités, provenance de chaque champ, écrans, actions, règles installables et éléments non reconstruits. Rien n&apos;est généré ni démarré avant votre demande.
        </p>
      </div>

      <AppGeneratePanel overview={overview.data} overviewError={overview.error} reloadOverview={overview.reload} spec={s} specError={spec.error} specLoading={spec.loading} onDeployed={reloadAll} />

      {spec.loading && !s ? (
        <div className="card px-4">
          <Loading label="Calcul de la spécification du nouveau logiciel…" />
        </div>
      ) : !s ? (
        <div className="card p-4">
          <Empty
            title="Structure du nouveau logiciel non disponible"
            hint={
              <>
                {sentence(spec.error ?? "Réponse vide de l'API")} La spécification se déduit des correspondances ancien → nouveau : <StepLink step="correspondances">étape Correspondances</StepLink>.
              </>
            }
          >
            <Button size="sm" variant="ghost" onClick={() => void spec.reload()}>
              <RefreshCw size={12} aria-hidden /> Recalculer l&apos;aperçu
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          {spec.error && <Notice tone="warn">Actualisation de la spécification impossible : {sentence(spec.error)} Dernier aperçu reçu affiché.</Notice>}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <AppSpecSummary spec={s} testMapping={overview.data?.mapping?.origin === "fixture"} />
            <AppNotRebuilt items={s.not_rebuilt ?? []} />
          </div>
          <AppEntities spec={s} />
          <div className="grid gap-5 lg:grid-cols-2">
            <AppScreens spec={s} />
            <AppActions spec={s} />
          </div>
        </>
      )}

      <AppBusinessModelPanel versions={models.data?.versions ?? null} loading={models.loading} error={models.error} reload={models.reload} spec={s} completedRunId={completedRunId} onChanged={reloadAll} />
    </div>
  );
}
