"use client";

import { useState } from "react";
import { ArrowUpRight, Rocket, TriangleAlert } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { useProject } from "./ProjectProvider";
import {
  CheckRow,
  DANGER_DISABLED,
  LoadError,
  Loading,
  Notice,
  Spinner,
  StepLink,
  WRAP_BTN,
  WRAP_BTN_SM,
  deployReadiness,
  fmtDate,
  plural,
  sentence,
  type AppSpecPreview,
  type Deployment,
  type MigrationOverview,
  type NoticeState,
} from "./AppKit";

/*
 * Génération et mise en service (POST /api/migration/deploy { run_id, force? }).
 * La base installée est celle de la dernière exécution terminée ; la route refuse elle-même
 * une migration non vérifiée (409). Le 409 « modifications des utilisateurs » demande une
 * confirmation explicite (force), après sauvegarde de la base en service.
 */

/** Message du 409 renvoyé quand le logiciel en service contient des saisies de ses utilisateurs. */
const USER_CHANGES = /par ses utilisateurs/i;

const STEP_LABEL: Record<string, string> = { migration: "Ouvrir l'étape Migration", validation: "Ouvrir l'étape Validation" };

export function AppGeneratePanel({
  overview,
  overviewError,
  reloadOverview,
  spec,
  specError,
  specLoading,
  onDeployed,
}: {
  overview: MigrationOverview | null;
  overviewError: string | null;
  reloadOverview: () => Promise<void>;
  spec: AppSpecPreview | null;
  specError: string | null;
  specLoading: boolean;
  onDeployed: () => Promise<unknown>;
}) {
  const { post } = useProject();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  if (!overview) {
    return (
      <Panel eyebrow="Génération et mise en service" title="Générer le nouveau logiciel">
        {overviewError ? <LoadError message={overviewError} onRetry={reloadOverview} /> : <Loading label="Lecture de l'état de la migration…" />}
      </Panel>
    );
  }

  const r = deployReadiness(overview);
  const run = r.run;
  const active = overview.app.deployment;
  const installed = spec?.rules?.versions ?? [];
  const fields = spec ? spec.entities.reduce((n, e) => n + e.fields.length, 0) : 0;
  const drift = spec?.provenance && run && run.mapping_version !== spec.provenance.mapping_version ? { run: run.mapping_version, preview: spec.provenance.mapping_version } : null;
  const canDeploy = r.ok && !!run && !busy;

  async function deploy(force: boolean) {
    if (!run) return;
    setBusy(true);
    setNotice(null);
    try {
      const out = await post<{ ok: boolean; deployment: Deployment; url: string }>("/api/migration/deploy", force ? { run_id: run.id, force: true } : { run_id: run.id });
      setConfirm(null);
      setNotice({
        tone: "ok",
        text: (
          <>
            Logiciel généré et mis en service ({out.deployment.id}, données de {out.deployment.run_id}
            {out.deployment.backup ? ", base précédente sauvegardée" : ", première mise en service"}).{" "}
            <a href={out.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-ink underline underline-offset-2">
              Ouvrir {out.url} <ArrowUpRight size={12} aria-hidden />
            </a>{" "}
            · <StepLink step="livraison">Voir la livraison</StepLink>
          </>
        ),
      });
      await onDeployed();
    } catch (e) {
      const msg = (e as Error).message;
      if (!force && USER_CHANGES.test(msg)) setConfirm(msg);
      else {
        setConfirm(null);
        setNotice({ tone: "bad", text: msg });
      }
      await reloadOverview();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel eyebrow="Génération et mise en service" title="Générer le nouveau logiciel">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Sur téléphone : prérequis et bouton d'abord, explication ensuite */}
        <div className="order-2 flex flex-col gap-2.5 text-[12.5px] leading-relaxed text-sediment lg:order-1">
          <p>
            <span className="font-bold text-ink">Aucun code spécifique au client.</span> Le logiciel livré est le runtime générique REBORN — serveur autonome, base SQLite, comptes et rôles, journal d&apos;audit, sauvegardes — configuré par la spécification décrite plus bas (app.json).
          </p>
          <p>
            La génération copie ce runtime, écrit la spécification et les versions validées du modèle métier, installe la base migrée et ses pièces jointes, crée le compte administrateur initial s&apos;il n&apos;existe pas, puis démarre le logiciel. Si un logiciel est déjà en service, sa base est sauvegardée avant d&apos;être remplacée.
          </p>
          <p className="text-[12px] text-silt">
            Pour changer de moteur ou de modèle métier sans remplacer la base, utilisez « Mettre à jour » à l&apos;<StepLink step="livraison">étape Livraison</StepLink>.
          </p>
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <ul className="flex flex-col divide-y divide-line">
            {spec ? (
              <CheckRow tone="ok" title="Spécification calculée">
                {plural(spec.entities.length, "entité", "entités")} · {plural(fields, "champ", "champs")}
                {spec.provenance ? ` · correspondances v${spec.provenance.mapping_version}` : ""}
                {spec.not_rebuilt?.length ? (
                  <>
                    {" · "}
                    <a href="#non-reconstruits" className="font-bold text-ochre underline decoration-ochre/40 underline-offset-2 hover:text-ink">
                      {plural(spec.not_rebuilt.length, "élément non reconstruit", "éléments non reconstruits")}
                    </a>
                  </>
                ) : (
                  ""
                )}
              </CheckRow>
            ) : specLoading ? (
              <CheckRow tone="idle" title="Calcul de la spécification…" />
            ) : (
              <CheckRow tone="bad" title="Spécification indisponible">
                {sentence(specError ?? "Réponse vide de l'API")} <StepLink step="correspondances">Ouvrir l&apos;étape Correspondances</StepLink>
              </CheckRow>
            )}

            <CheckRow tone={r.tone} title={r.title}>
              {r.detail}
              {r.step && (
                <>
                  {" "}
                  <StepLink step={r.step}>{STEP_LABEL[r.step]}</StepLink>
                </>
              )}
            </CheckRow>

            {r.newerFailed && run && (
              <CheckRow tone="warn" title={`La dernière exécution, ${r.newerFailed.id}, a échoué`}>
                {r.newerFailed.error ? `${r.newerFailed.error}. ` : ""}La génération installerait la base de {run.id}, la dernière exécution terminée.
              </CheckRow>
            )}

            {drift && (
              <CheckRow tone="warn" title="Correspondances modifiées depuis la migration">
                {run?.id} a été exécutée avec les correspondances v{drift.run} ; l&apos;aperçu ci-dessous reflète la v{drift.preview}. La génération utilise les correspondances de la migration installée : relancez la migration pour appliquer la v{drift.preview}.
              </CheckRow>
            )}

            {spec &&
              (installed.length ? (
                <CheckRow tone="ok" title={`Modèle métier : ${installed.map((v) => `v${v.version}`).join(", ")} installé`}>
                  Versions validées et cohérentes avec les correspondances. <a href="#modele-metier" className="font-bold text-ink underline decoration-line-strong underline-offset-2 hover:text-verdigris">Voir le modèle métier</a>
                </CheckRow>
              ) : (
                <CheckRow tone="warn" title="Aucun modèle métier installable">
                  Sans version validée, les nouveaux documents ne seront pas calculés automatiquement ; le logiciel reste utilisable.{" "}
                  <a href="#modele-metier" className="font-bold text-ink underline decoration-line-strong underline-offset-2 hover:text-verdigris">Valider une version</a>
                </CheckRow>
              ))}

            {active ? (
              <CheckRow tone="info" title={`Logiciel en service depuis le ${fmtDate(active.at)} (${active.run_id})`}>
                {run ? `Sa base sera remplacée par celle de ${run.id}, après sauvegarde.` : "Sa base serait remplacée par la base migrée, après sauvegarde."} {overview.app.running ? `En service sur ${overview.app.url}.` : "Actuellement arrêté."}
              </CheckRow>
            ) : (
              <CheckRow tone="idle" title="Première mise en service">
                Un port local libre est attribué au logiciel ; il sera accessible depuis ce poste.
              </CheckRow>
            )}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="accent" className={WRAP_BTN} disabled={!canDeploy} onClick={() => void deploy(false)}>
              {busy ? <Spinner size={14} /> : <Rocket size={14} aria-hidden />}
              {busy ? "Génération et démarrage en cours…" : active ? "Régénérer et remettre en service" : "Générer et mettre en service"}
            </Button>
            {!r.ok && (
              <span className="text-[12px] leading-snug text-sediment">
                {run ? "Désactivé : la base migrée doit d'abord être vérifiée (voir ci-dessus)." : "Désactivé : aucune migration terminée à installer — la génération installe la base migrée."}
              </span>
            )}
          </div>

          {confirm && run && (
            <div role="alert" className="mt-3 rounded-md bg-ochre-soft px-3.5 py-3 text-[12.5px] leading-relaxed shadow-[inset_0_0_0_1px_rgb(168_107_18/0.3)]">
              <div className="flex items-center gap-1.5 font-bold text-ochre">
                <TriangleAlert size={14} aria-hidden /> Confirmation explicite requise
              </div>
              <p className="mt-1 break-words text-ink">{confirm}</p>
              <p className="mt-1 text-sediment">
                En confirmant, la base actuelle du logiciel en service — avec ces modifications — est d&apos;abord copiée dans son dossier de sauvegardes (backups/), puis remplacée par la base migrée de {run.id}. Un retour arrière vers cette sauvegarde reste possible depuis l&apos;étape Livraison.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" className={`${DANGER_DISABLED} ${WRAP_BTN_SM}`} disabled={busy} onClick={() => void deploy(true)}>
                  {busy && <Spinner size={12} />} Remplacer la base (sauvegarde faite)
                </Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => setConfirm(null)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {notice && (
            <Notice tone={notice.tone} onClose={() => setNotice(null)} className="mt-3">
              {notice.text}
            </Notice>
          )}
        </div>
      </div>
    </Panel>
  );
}
