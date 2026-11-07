"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, Play, RefreshCw, RotateCcw, ShieldCheck, Square, Upload, Wrench } from "lucide-react";
import { Button, ButtonLink, Empty, Panel, cx, timeOf } from "@/components/ui";
import { useProject, useProjectData } from "@/components/project/ProjectProvider";
import {
  BM_SOURCE,
  Command,
  DANGER_DISABLED,
  DEPLOY_STATUS,
  Fact,
  LoadError,
  Loading,
  Notice,
  Pill,
  Spinner,
  StepLink,
  TestBadge,
  VERDICT,
  WRAP_BTN,
  deployReadiness,
  fmtDate,
  plural,
  useAction,
  type AppStatus,
  type BusinessModelMeta,
  type Deployment,
  type MigrationOverview,
  type RunDetail,
  type Tone,
  type VerificationReport,
} from "@/components/project/AppKit";

/**
 * Étape 8 · Livraison : état réel du logiciel livré (GET /api/migration/app), pilotage du processus,
 * publication du modèle métier validé, rapport de migration, historique et retour arrière.
 * Seule l'adresse locale renvoyée par l'API est proposée : aucun lien de déploiement public.
 */
export default function LivraisonPage() {
  const app = useProjectData<AppStatus>("/api/migration/app");
  const overview = useProjectData<MigrationOverview>("/api/migration");
  const models = useProjectData<{ versions: BusinessModelMeta[] }>("/api/migration/business-model");
  const runId = app.data?.deployment?.run_id ?? null;
  const detail = useProjectData<RunDetail>(runId ? `/api/migration/runs/${encodeURIComponent(runId)}` : null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  // Le logiciel livré peut être arrêté ou relancé hors du Studio (terminal) : son état réel est relu
  // auprès de l'API toutes les 10 s tant que la page est visible.
  const reloadApp = app.reload;
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reloadApp();
    }, 10000);
    return () => clearInterval(t);
  }, [reloadApp]);
  useEffect(() => {
    if (app.data) setCheckedAt(new Date().toISOString());
  }, [app.data]);

  const refreshAll = async () => {
    await Promise.all([app.reload(), overview.reload(), models.reload(), detail.reload()]);
  };

  const a = app.data;
  // Après un retour arrière, la mise en service active change d'exécution : on n'affiche jamais le rapport d'une autre exécution
  const runDetail = detail.data && detail.data.meta?.id === runId ? detail.data : null;
  const target = overview.data?.mapping?.target;
  const name = a?.app_id && target?.id === a.app_id ? target.name : (a?.app_id ?? "Nouveau logiciel");

  return (
    <div className="flex flex-col gap-5">
      <div className="min-w-0">
        <div className="eyebrow">Étape 8 · Livraison</div>
        <h2 className="mt-0.5 text-[19px] leading-tight font-black tracking-[-0.02em]">Livraison du nouveau logiciel</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-sediment">
          État réel du nouveau logiciel, relu auprès de son processus : adresse locale, version du modèle métier, accès administrateur, rapport de migration et historique des mises en service. Il fonctionne sans REBORN Studio ni l&apos;ancien logiciel.
        </p>
      </div>

      {!a ? (
        app.loading ? (
          <div className="card px-4">
            <Loading label="Lecture de l'état du logiciel livré…" />
          </div>
        ) : (
          <LoadError message={app.error} onRetry={app.reload} title="État du logiciel livré indisponible" />
        )
      ) : !a.app_id ? (
        <>
          <NoDelivery overview={overview.data} />
          {overview.data && overview.data.deployments.length > 0 && <HistoryPanel overview={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} onChanged={refreshAll} />}
        </>
      ) : (
        <>
          <StatusPanel app={a} name={name} checkedAt={checkedAt} error={app.error} onChanged={refreshAll} />
          <div className="grid gap-5 lg:grid-cols-2">
            <AdminAccessPanel app={a} />
            <AutonomyPanel app={a} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <RulesPanel app={a} versions={models.data?.versions ?? null} loading={models.loading} error={models.error} reload={models.reload} onChanged={refreshAll} />
            <ReportPanel runId={runId} detail={runDetail} error={detail.error} reload={detail.reload} onChanged={refreshAll} />
          </div>
          <HistoryPanel overview={overview.data} loading={overview.loading} error={overview.error} reload={overview.reload} onChanged={refreshAll} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aucun logiciel livré                                                 */
/* ------------------------------------------------------------------ */

function NoDelivery({ overview }: { overview: MigrationOverview | null }) {
  const { id } = useProject();
  const r = overview ? deployReadiness(overview) : null;
  return (
    <div className="card p-4">
      <Empty
        title="Aucun logiciel livré pour ce projet"
        hint={
          <>
            La mise en service se lance à l&apos;étape Reconstruction : elle génère le logiciel à partir de la spécification et y installe la base migrée et vérifiée.
            {r && <span className="mt-1.5 block font-bold text-ink">État de la migration : {r.title}.</span>}
          </>
        }
      >
        <ButtonLink href={`/projets/${id}/reconstruction`} variant="primary">
          Aller à l&apos;étape Reconstruction
        </ButtonLink>
      </Empty>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* État et pilotage du processus                                        */
/* ------------------------------------------------------------------ */

function StatusPanel({ app, name, checkedAt, error, onChanged }: { app: AppStatus; name: string; checkedAt: string | null; error: string | null; onChanged: () => Promise<void> }) {
  const { post } = useProject();
  const act = useAction();
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const d = app.deployment;

  async function start() {
    await act.run(
      "start",
      () => post<{ ok: boolean; app: AppStatus }>("/api/migration/app", { action: "start" }),
      (r) => (r.app.running ? { tone: "ok", text: `Logiciel démarré : il répond sur ${r.app.url}.` } : { tone: "warn", text: "Démarrage demandé, mais le logiciel ne répond pas encore à son adresse locale." }),
    );
    await onChanged();
  }

  async function stop() {
    await act.run(
      "stop",
      () => post<{ ok: boolean; app: AppStatus }>("/api/migration/app", { action: "stop" }),
      (r) =>
        r.app.running
          ? { tone: "warn", text: "Le logiciel répond toujours : son processus n'a pas été retrouvé par son fichier PID (lancé à la main ou par une version antérieure). Arrêtez-le depuis son terminal (Ctrl+C)." }
          : { tone: "ok", text: "Logiciel arrêté. Ses données sont conservées dans son dossier ; il peut être redémarré ici ou lancé seul." },
    );
    await onChanged();
  }

  async function upgrade() {
    const r = await act.run(
      "upgrade",
      () => post<{ ok: boolean; upgrade: { app_id: string; backup: string; rules_versions: number[]; url: string }; app: AppStatus }>("/api/migration/app", { action: "upgrade" }),
      (r) => ({
        tone: "ok",
        text: `Moteur et spécification mis à jour, données conservées. Sauvegarde préalable : ${r.upgrade.backup}. Modèle métier installé : ${r.upgrade.rules_versions.length ? r.upgrade.rules_versions.map((v) => `v${v}`).join(", ") : "aucun (aucune version validée)"}.${r.app.running ? "" : " Le logiciel ne répond pas encore à son adresse locale."}`,
      }),
    );
    if (r) setConfirmUpgrade(false);
    await onChanged();
  }

  const processFact = app.pid ? (
    app.running ? (
      <>
        PID <span className="tabular font-mono">{app.pid}</span>
        <span className="block text-[11.5px] text-silt">Retrouvé par son fichier run/server.pid : le Studio n&apos;en est pas le processus parent.</span>
      </>
    ) : (
      <span className="text-ochre">
        Processus <span className="tabular font-mono">{app.pid}</span> présent, mais le logiciel ne répond pas à son adresse locale (voir app.log dans son dossier).
      </span>
    )
  ) : app.running ? (
    <span className="text-ochre">En service sans fichier PID : arrêt et mise à jour impossibles depuis le Studio.</span>
  ) : (
    <span className="text-sediment">Aucun processus en cours.</span>
  );

  return (
    <section className="card min-w-0" aria-labelledby="logiciel-livre">
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="eyebrow">Nouveau logiciel</div>
          <h2 id="logiciel-livre" className="mt-0.5 text-[18px] leading-tight font-black tracking-[-0.02em] break-words">
            {name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cx("inline-flex items-center gap-1.5 text-[13px] font-bold", app.running ? "text-[#0b6b5f]" : "text-sediment")}>
              <span aria-hidden className={cx("size-2 rounded-full", app.running ? "bg-verdigris" : "bg-dust")} />
              {app.running ? "En service" : "Arrêté"}
            </span>
            {checkedAt && <span className="text-[12px] text-silt">état relu à {timeOf(checkedAt)}</span>}
            <Button size="sm" variant="quiet" disabled={!!act.busy} onClick={() => void act.run("refresh", onChanged)}>
              {act.busy === "refresh" ? <Spinner size={12} /> : <RefreshCw size={12} aria-hidden />} Actualiser
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:max-w-[52%] md:justify-end">
          {app.running && (
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-verdigris px-3.5 text-[13px] font-bold whitespace-nowrap text-white transition-colors duration-150 hover:bg-[#0e7f70]"
            >
              Ouvrir le logiciel <ArrowUpRight size={14} aria-hidden />
            </a>
          )}
          {app.running ? (
            <Button variant="ghost" disabled={!!act.busy} onClick={() => { if (window.confirm("Arrêter le logiciel livré ? Ses utilisateurs n'y auront plus accès jusqu'au redémarrage (aucune donnée n'est perdue).")) void stop(); }}>
              {act.busy === "stop" ? <Spinner /> : <Square size={13} aria-hidden />} Arrêter
            </Button>
          ) : (
            <Button variant="primary" disabled={!!act.busy || app.port_used_by_other} onClick={() => void start()} title={app.port_used_by_other ? `Le port ${app.port} est occupé par une autre application` : undefined}>
              {act.busy === "start" ? <Spinner /> : <Play size={13} aria-hidden />} Démarrer
            </Button>
          )}
          {!confirmUpgrade && (
            <Button variant="ghost" className={WRAP_BTN} disabled={!!act.busy} onClick={() => setConfirmUpgrade(true)}>
              <Wrench size={13} aria-hidden /> Mettre à jour le moteur sans toucher aux données
            </Button>
          )}
        </div>
      </div>

      {(confirmUpgrade || act.notice || app.port_used_by_other || (app.running && !app.pid) || error || !app.running) && (
        <div className="flex flex-col gap-2 px-4 pb-3">
          {confirmUpgrade && (
            <div className="rounded-md bg-chalk px-3.5 py-3 text-[12.5px] leading-relaxed shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
              <div className="font-bold">Mettre à jour le moteur et la spécification ?</div>
              <ul className="mt-1 list-disc pl-4 text-sediment">
                <li>Le logiciel est arrêté, puis sa base est sauvegardée (dossier backups/ du logiciel).</li>
                <li>Le runtime générique et la spécification sont réinstallés, avec les versions validées du modèle métier.</li>
                <li>Base, pièces jointes, sauvegardes et comptes sont conservés ; le schéma n&apos;évolue que par ajout de colonnes.</li>
                <li>Le logiciel redémarre aussitôt : il est indisponible pendant ce redémarrage.</li>
              </ul>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={!!act.busy} onClick={() => void upgrade()}>
                  {act.busy === "upgrade" && <Spinner size={12} />} {act.busy === "upgrade" ? "Mise à jour en cours…" : "Confirmer la mise à jour"}
                </Button>
                <Button size="sm" variant="quiet" disabled={!!act.busy} onClick={() => setConfirmUpgrade(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
          {act.notice && (
            <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)}>
              {act.notice.text}
            </Notice>
          )}
          {app.port_used_by_other && <Notice tone="bad">Le port {app.port} est utilisé par une autre application : le logiciel ne peut pas démarrer sur ce port.</Notice>}
          {app.running && !app.pid && (
            <Notice tone="warn">Processus sans fichier PID (lancé à la main ou par une version antérieure du Studio) : le Studio ne peut ni l&apos;arrêter ni le mettre à jour. Arrêtez-le depuis son terminal (Ctrl+C), puis redémarrez-le ici.</Notice>
          )}
          {!app.running && !app.port_used_by_other && <Notice tone="idle">Le logiciel est arrêté : ses données restent dans son dossier. Démarrez-le ici, ou lancez-le seul (voir « Fonctionnement autonome »).</Notice>}
          {error && (
            <Notice tone="warn">
              Actualisation impossible : {error}
              {checkedAt ? ` L'état affiché date de ${timeOf(checkedAt)}.` : ""}
            </Notice>
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 border-t border-line px-4 py-3.5 sm:grid-cols-2 xl:grid-cols-3">
        <Fact label="Adresse locale">
          <span className="font-mono text-[12.5px] break-all">{app.url}</span>
          <span className="block text-[11.5px] text-silt">Adresse de ce poste : rien n&apos;est publié sur Internet.</span>
        </Fact>
        <Fact label="Port">
          <span className="tabular">{app.port}</span>
        </Fact>
        <Fact label="Processus">{processFact}</Fact>
        <Fact label="Version active du modèle métier">
          {app.running ? (
            app.rules_version !== null ? (
              <span className="font-bold">v{app.rules_version}</span>
            ) : (
              <span className="text-ochre">Aucune : les nouveaux documents ne sont pas calculés automatiquement.</span>
            )
          ) : (
            <span className="text-silt">Inconnue tant que le logiciel est arrêté (lue à son démarrage).</span>
          )}
        </Fact>
        <Fact label="Données installées">
          {d ? (
            <>
              Migration <span className="font-mono text-[12.5px]">{d.run_id}</span>, mise en service le {fmtDate(d.at)} par {d.by}
            </>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Dossier du logiciel">{d ? <span className="font-mono text-[12.5px] break-all">{d.app_dir}</span> : "—"}</Fact>
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Accès administrateur et lancement autonome                           */
/* ------------------------------------------------------------------ */

function AdminAccessPanel({ app }: { app: AppStatus }) {
  return (
    <Panel eyebrow="Accès administrateur" title="Compte administrateur initial">
      <div className="flex flex-col gap-2.5 text-[12.5px] leading-relaxed text-sediment">
        <p>Le mot de passe n&apos;est jamais affiché par REBORN Studio. L&apos;identifiant (admin) et le mot de passe initiaux sont enregistrés dans ce fichier du logiciel livré, à protéger :</p>
        {app.credentials_file ? (
          <code className="block rounded-sm bg-chalk px-3 py-2 font-mono text-[12px] break-all text-ink">{app.credentials_file}</code>
        ) : (
          <p className="text-silt">Emplacement non communiqué par l&apos;API.</p>
        )}
        <p>Pour copier le mot de passe dans le presse-papiers sans l&apos;afficher, depuis le dossier REBORN :</p>
        <Command value="npm run crm:password" />
        <p className="text-[12px] text-silt">
          Cette commande lit le premier logiciel généré sur ce poste : si plusieurs ont été générés, ouvrez plutôt le fichier ci-dessus. Changez le mot de passe après la première connexion.
        </p>
      </div>
    </Panel>
  );
}

/** start_command renvoyé par l'API : « commande (ou : autre commande) ». */
function splitCommands(s: string): string[] {
  const m = /^(.*?)\s*\(ou\s*:\s*(.*)\)\s*$/.exec(s.trim());
  return m && m[1] && m[2] ? [m[1].trim(), m[2].trim()] : [s.trim()];
}

function AutonomyPanel({ app }: { app: AppStatus }) {
  const cmds = app.start_command ? splitCommands(app.start_command) : [];
  return (
    <Panel eyebrow="Fonctionnement autonome" title="Sans REBORN Studio ni l'ancien logiciel">
      <div className="flex flex-col gap-2.5 text-[12.5px] leading-relaxed text-sediment">
        <p>
          Le logiciel livré est un processus indépendant : lancé détaché, il continue de répondre si REBORN Studio s&apos;arrête, et il ne se connecte jamais à l&apos;ancien logiciel. Sa base SQLite, ses pièces jointes, ses sauvegardes et sa spécification (app.json) sont dans son propre dossier
          {app.deployment ? (
            <>
              {" "}
              (<code className="font-mono text-[11.5px] break-all text-ink">{app.deployment.app_dir}</code>)
            </>
          ) : null}
          . Il ne demande que Node.js, sans autre dépendance à installer.
        </p>
        <div>
          <div className="mb-1 text-[12px] font-bold text-ink">Le lancer seul, depuis le dossier REBORN</div>
          {cmds.length ? (
            <div className="flex flex-col">
              {cmds.map((c, i) => (
                <div key={c}>
                  {i > 0 && <div className="my-1 text-[11.5px] text-silt">ou</div>}
                  <Command value={c} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-silt">Commande non communiquée par l&apos;API.</p>
          )}
          {cmds.length > 1 && <p className="mt-1.5 text-[11.5px] text-silt">La seconde commande cible ce logiciel et son port, même si plusieurs logiciels ont été générés sur ce poste.</p>}
        </div>
        <p className="flex items-start gap-2 rounded-sm bg-chalk px-3 py-2 text-[12px]">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-verdigris" aria-hidden />
          <span>
            Testé par le scénario d&apos;acceptation de bout en bout (<code className="font-mono text-[11.5px]">scripts/acceptance.mjs</code>, test « Indépendance ») : Studio arrêté, le logiciel continue de répondre et d&apos;enregistrer des saisies, puis redémarre seul avec ses données. Ce test n&apos;est pas exécuté depuis cette page.
          </span>
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Modèle métier publié dans le logiciel                                */
/* ------------------------------------------------------------------ */

function RulesPanel({
  app,
  versions,
  loading,
  error,
  reload,
  onChanged,
}: {
  app: AppStatus;
  versions: BusinessModelMeta[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { post } = useProject();
  const act = useAction();
  const list = versions ?? [];
  const validated = list.filter((v) => v.status === "validated").reverse();
  const pending = list.filter((v) => v.status === "proposed").length;

  async function publish(version: number) {
    await act.run(
      `pub-${version}`,
      () => post<{ ok: boolean; version: number; file: string; running: boolean; active_version: number | null }>("/api/migration/app/rules", { version }),
      (r) =>
        !r.running
          ? { tone: "info", text: `v${r.version} déposée dans le logiciel (${r.file}). Logiciel arrêté : elle sera chargée à son prochain démarrage.` }
          : r.active_version === r.version
            ? { tone: "ok", text: `v${r.version} publiée et active, prise en compte à chaud : les nouveaux documents l'utilisent, les documents existants gardent la version avec laquelle ils ont été calculés.` }
            : {
                tone: "warn",
                text: `v${r.version} publiée, mais la version active reste ${r.active_version !== null ? `v${r.active_version}` : "inconnue"} : le logiciel active automatiquement la version publiée la plus récente. Pour revenir à une version antérieure, un administrateur du logiciel livré peut appeler POST /api/admin/rules/active { version } (pas encore d'écran dédié).`,
              },
    );
    await onChanged();
  }

  return (
    <Panel eyebrow="Modèle métier dans le logiciel" title={app.running ? (app.rules_version !== null ? `Version active : v${app.rules_version}` : "Aucune version active") : "Version active inconnue (logiciel arrêté)"}>
      <p className="text-[12.5px] leading-relaxed text-sediment">
        Publier une version validée la dépose dans le logiciel livré, qui la prend en compte à chaud : les nouveaux documents l&apos;utilisent, les documents existants gardent la version avec laquelle ils ont été calculés, et l&apos;historique migré n&apos;est jamais recalculé.
      </p>
      <div className="mt-3">
        {loading && !versions ? (
          <Loading label="Lecture des versions du modèle métier…" />
        ) : !versions ? (
          <LoadError message={error} onRetry={reload} />
        ) : validated.length === 0 ? (
          <Empty
            title="Aucune version validée du modèle métier"
            hint={
              <>
                {pending ? `${plural(pending, "version attend", "versions attendent")} une décision` : "Aucune version reçue pour l'instant"} à l&apos;<StepLink step="reconstruction">étape Reconstruction</StepLink>. Sans modèle métier, le logiciel fonctionne mais ne calcule pas automatiquement les nouveaux documents.
              </>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            {validated.map((v) => {
              const src = BM_SOURCE[v.source] ?? { label: v.source };
              const dropped = (v.published ?? []).filter((p) => p.app_id === app.app_id).at(-1);
              const active = app.running && app.rules_version === v.version;
              const state: { label: string; tone: Tone } = active
                ? { label: "Active dans le logiciel", tone: "ok" }
                : dropped
                  ? { label: app.running ? "Déposée, non active" : "Déposée", tone: "idle" }
                  : { label: "Non publiée", tone: "warn" };
              return (
                <li key={v.version} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="specimen">v{v.version}</span>
                      {src.test ? <TestBadge label={src.label} /> : <Pill>{src.label}</Pill>}
                      <Pill tone={state.tone}>{state.label}</Pill>
                    </div>
                    <p className="mt-1 text-[12px] break-words text-sediment">
                      Validée{v.decided_by ? ` par ${v.decided_by}` : ""}
                      {v.decided_at ? ` le ${fmtDate(v.decided_at)}` : ""} · {plural(v.modules.length, "module", "modules")} · {plural(v.bindings.length, "liaison", "liaisons")}
                      {dropped ? ` · déposée le ${fmtDate(dropped.at)}` : ""}
                    </p>
                    <p className={cx("mt-0.5 text-[11.5px] leading-snug", v.history_check ? "text-silt" : "text-ochre")}>{v.history_check?.statement ?? "Pas rejouée sur l'historique migré."}</p>
                  </div>
                  {!active && (
                    <Button size="sm" variant="ghost" className="self-start" disabled={!!act.busy} onClick={() => void publish(v.version)}>
                      {act.busy === `pub-${v.version}` ? <Spinner size={12} /> : <Upload size={12} aria-hidden />} Publier v{v.version}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {pending > 0 && validated.length > 0 && (
        <p className="mt-2 text-[12px] text-silt">
          {plural(pending, "autre version attend", "autres versions attendent")} une décision à l&apos;<StepLink step="reconstruction">étape Reconstruction</StepLink>.
        </p>
      )}
      {act.notice && (
        <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)} className="mt-3">
          {act.notice.text}
        </Notice>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Rapport de migration et réconciliation                               */
/* ------------------------------------------------------------------ */

function ReportSummary({ report }: { report: VerificationReport }) {
  const v = VERDICT[report.status] ?? { label: report.status, tone: "idle" as Tone };
  const passed = report.checks.filter((c) => c.status === "pass").length;
  const failed = report.checks.filter((c) => c.status === "fail").length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Pill tone={v.tone}>{v.label}</Pill>
        <span className="text-[12px] text-sediment">
          {passed}/{report.checks.length} contrôles réussis{failed ? ` · ${failed} en échec` : ""} · {plural(report.gaps.length, "écart documenté", "écarts documentés")}
        </span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink">{report.statement}</p>
      <p className="text-[11.5px] text-silt">Vérifié le {fmtDate(report.verified_at)}</p>
    </div>
  );
}

function ReportPanel({
  runId,
  detail,
  error,
  reload,
  onChanged,
}: {
  runId: string | null;
  /** Rapport de l'exécution installée (null tant qu'il n'est pas chargé pour cette exécution). */
  detail: RunDetail | null;
  error: string | null;
  reload: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { id, post } = useProject();
  const act = useAction();
  const rep = detail?.report ?? null;
  const rec = detail?.reconciliation ?? null;

  async function reconcile() {
    await act.run(
      "reconcile",
      () => post<{ ok: boolean; status: VerificationReport["status"]; checks: number; failed: string[] }>("/api/migration/reconcile", {}),
      (r) => ({
        tone: VERDICT[r.status]?.tone ?? "idle",
        text: `Réconciliation terminée : ${VERDICT[r.status]?.label ?? r.status} — ${plural(r.checks, "contrôle", "contrôles")}, ${r.failed.length} en échec${r.failed.length ? ` (${r.failed.join(", ")})` : ""}.`,
      }),
    );
    await onChanged();
  }

  return (
    <Panel eyebrow="Rapport de migration" title={runId ? `Données installées : ${runId}` : "Rapport de migration"}>
      {!runId ? (
        <p className="text-[12.5px] text-sediment">Aucune mise en service active : pas de données installées.</p>
      ) : !detail ? (
        error ? <LoadError message={error} onRetry={reload} /> : <Loading label="Lecture du rapport de vérification…" />
      ) : (
        <div className="flex flex-col gap-3">
          {rep ? <ReportSummary report={rep} /> : <p className="text-[12.5px] text-ochre">Aucun rapport de vérification enregistré pour {runId}.</p>}
          {detail.acknowledged && (
            <p className="text-[12px] text-sediment">
              Écarts acceptés par {detail.acknowledged.by} le {fmtDate(detail.acknowledged.at)}
              {detail.acknowledged.comment ? ` — « ${detail.acknowledged.comment} »` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
            <StepLink step="validation">Rapport complet : contrôles et écarts (étape Validation)</StepLink>
            <a href={`/api/migration/runs/${encodeURIComponent(runId)}/rejects?project=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 font-bold text-sediment hover:text-ink">
              <Download size={13} aria-hidden /> Rapport d&apos;écarts (CSV)
            </a>
          </div>

          <div className="border-t border-line pt-3">
            <h3 className="text-[12.5px] font-bold">Réconciliation de la base en service</h3>
            <p className="mt-0.5 text-[12px] leading-relaxed text-sediment">
              Relit la base du logiciel en service et la recompare aux fichiers sources ; les enregistrements modifiés depuis par ses utilisateurs (journal d&apos;audit) sont exclus de la comparaison champ à champ.
            </p>
            <div className="mt-2">{rec ? <ReportSummary report={rec} /> : <p className="text-[12px] text-silt">Aucune réconciliation enregistrée pour {runId}.</p>}</div>
            <Button size="sm" variant="ghost" className="mt-2.5" disabled={!!act.busy} onClick={() => void reconcile()}>
              {act.busy === "reconcile" ? <Spinner size={12} /> : <RefreshCw size={12} aria-hidden />} Relire et comparer
            </Button>
            {act.notice && (
              <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)} className="mt-2">
                {act.notice.text}
              </Notice>
            )}
          </div>
        </div>
      )}
      {error && detail && <Notice tone="warn" className="mt-2">Actualisation impossible : {error}</Notice>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Historique des mises en service et retour arrière                     */
/* ------------------------------------------------------------------ */

function HistoryPanel({
  overview,
  loading,
  error,
  reload,
  onChanged,
}: {
  overview: MigrationOverview | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { post } = useProject();
  const act = useAction();
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = overview ? [...overview.deployments].reverse() : [];

  async function rollback(d: Deployment) {
    const r = await act.run(
      `rb-${d.id}`,
      () => post<{ ok: boolean }>("/api/migration/rollback", { deployment_id: d.id }),
      () => ({ tone: "ok", text: `Retour arrière effectué : la base antérieure à la mise en service du ${fmtDate(d.at)} (${d.run_id}) est restaurée et le logiciel redémarré. La base remplacée reste disponible dans les sauvegardes du logiciel.` }),
    );
    if (r) setConfirm(null);
    await onChanged();
  }

  return (
    <Panel eyebrow="Historique des mises en service" title={overview ? plural(list.length, "mise en service", "mises en service") : "Mises en service"}>
      {loading && !overview ? (
        <Loading label="Lecture de l'historique…" />
      ) : !overview ? (
        <LoadError message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <p className="text-[12.5px] text-sediment">Aucune mise en service enregistrée.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          {list.map((d) => {
            const st = DEPLOY_STATUS[d.status] ?? { label: d.status, tone: "idle" as Tone };
            const busy = act.busy === `rb-${d.id}`;
            return (
              <li key={d.id} className="px-3 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-bold">{fmtDate(d.at)}</span>
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <span className="specimen">{d.id}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] break-words text-sediment">
                      Données de <span className="font-mono">{d.run_id}</span> · par {d.by} ·{" "}
                      {d.backup ? (
                        <>
                          base précédente sauvegardée : <span className="font-mono text-[11px] break-all">{d.backup}</span>
                        </>
                      ) : (
                        "première mise en service : aucune base antérieure"
                      )}
                    </p>
                  </div>
                  {d.status === "active" &&
                    (d.backup ? (
                      confirm !== d.id && (
                        <Button size="sm" variant="ghost" className="self-start" disabled={!!act.busy} onClick={() => setConfirm(d.id)}>
                          <RotateCcw size={12} aria-hidden /> Retour arrière
                        </Button>
                      )
                    ) : (
                      <span className="text-[11.5px] leading-snug text-silt sm:max-w-[220px] sm:text-right">Retour arrière impossible : aucune base antérieure à restaurer.</span>
                    ))}
                </div>
                {confirm === d.id && d.backup && (
                  <div role="alert" className="mt-2.5 rounded-md bg-ochre-soft px-3.5 py-3 text-[12.5px] leading-relaxed shadow-[inset_0_0_0_1px_rgb(168_107_18/0.3)]">
                    <div className="font-bold text-ochre">Restaurer la base antérieure à cette mise en service ?</div>
                    <ul className="mt-1 list-disc pl-4 text-ink/85">
                      <li>La base actuelle est d&apos;abord sauvegardée dans le dossier backups/ du logiciel.</li>
                      <li>
                        La base enregistrée juste avant cette mise en service (<span className="font-mono text-[11.5px] break-all">{d.backup}</span>) est restaurée, puis le logiciel redémarre.
                      </li>
                      <li>Les saisies faites depuis ne seront plus visibles dans le logiciel (elles restent dans la sauvegarde). Seule la base est restaurée : le moteur et la spécification installés ne changent pas.</li>
                    </ul>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button size="sm" variant="danger" className={DANGER_DISABLED} disabled={!!act.busy} onClick={() => void rollback(d)}>
                        {busy && <Spinner size={12} />} {busy ? "Retour arrière en cours…" : "Confirmer le retour arrière"}
                      </Button>
                      <Button size="sm" variant="quiet" disabled={!!act.busy} onClick={() => setConfirm(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {act.notice && (
        <Notice tone={act.notice.tone} onClose={() => act.setNotice(null)} className="mt-3">
          {act.notice.text}
        </Notice>
      )}
      {error && overview && (
        <Notice tone="warn" className="mt-2">
          Actualisation impossible : {error}
        </Notice>
      )}
    </Panel>
  );
}
