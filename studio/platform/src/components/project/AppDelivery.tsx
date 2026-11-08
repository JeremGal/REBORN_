"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Download, ExternalLink, KeyRound, RefreshCw, RotateCcw, Square, Upload, Wrench } from "lucide-react";
import { Button, ConfirmationDialog } from "@/components/ds";
import { useReborn } from "@/components/RebornProvider";
import { Callout, EmptyState, Facts, Section, TestBadge } from "./Step";
import { useProject } from "./ProjectProvider";
import { totals } from "./AppBusinessModel";
import { appProcessState } from "./view-rules";
import {
  ActionNotice,
  ApiRoutes,
  BM_SOURCE,
  Command,
  CopyField,
  DEPLOY_STATUS,
  LoadError,
  Loading,
  StepLink,
  SubHeading,
  Tag,
  VERDICT,
  fmtDate,
  fmtInt,
  fmtLongDay,
  fmtTime,
  hostOf,
  plural,
  type AppStatus,
  type BusinessModelMeta,
  type Deployment,
  type MigrationOverview,
  type RunDetail,
  type Tone,
  type VerificationReport,
  useAction,
} from "./AppKit";

/*
 * Sections de l'étape Livraison : logiciel livré (état réel lu par GET /api/migration/app), accès
 * personnel (POST /api/migration/app/access : lien d'activation à usage unique), démarrage, rapport,
 * modèle métier publié, versions et mises à jour, maintenance. Seule l'adresse locale renvoyée par
 * l'API est proposée : aucun lien de déploiement public.
 */

type Action = ReturnType<typeof useAction>;

const mono = "font-mono text-small break-all";

/* ------------------------------------------------------------------ */
/* État (sous le titre)                                                 */
/* ------------------------------------------------------------------ */

export function DeliveryStatus({ app, checkedAt, busy, refreshing, onRefresh }: { app: AppStatus; checkedAt: string | null; busy: boolean; refreshing: boolean; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Tag tone={app.running ? "ok" : "idle"}>{app.running ? "En service" : "Arrêté"}</Tag>
      {app.running ? (
        <a href={app.url} target="_blank" rel="noreferrer" className="ds-link font-mono text-small">
          {hostOf(app.url)}
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      ) : (
        <span className="font-mono text-small text-text-3">{hostOf(app.url)}</span>
      )}
      {checkedAt && <span className="text-small text-text-3">état relu à {fmtTime(checkedAt)}</span>}
      <Button size="sm" variant="ghost" disabled={busy && !refreshing} loading={refreshing} onClick={onRefresh} icon={<RefreshCw size={14} />}>
        Actualiser
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Logiciel livré : synthèse                                            */
/* ------------------------------------------------------------------ */

export interface DeliverySummaryInput {
  app: AppStatus;
  name: string;
  /** Rang de la mise en service active parmi toutes les mises en service du projet (1 = première). */
  rank: number | null;
  run: MigrationOverview["runs"][number] | null;
  report: VerificationReport | null;
  acknowledged: RunDetail["acknowledged"];
  reserves: { label: string; detail: string }[];
  features: ReactNode;
  test: boolean;
}

/** Synthèse sobre du logiciel livré : chaque valeur vient de l'API (aucune estimation). */
export function DeliverySummary({ s }: { s: DeliverySummaryInput }) {
  const { id } = useProject();
  const d = s.app.deployment;
  const v = s.report ? (s.report.status === "review" && s.acknowledged ? { label: "Écarts acceptés", tone: "ok" as Tone } : VERDICT[s.report.status]) : null;
  return (
    <Section title="Logiciel livré" badge={s.test ? <TestBadge /> : undefined} description={d ? `Mis en service le ${fmtLongDay(d.at)} à ${fmtTime(d.at)} par ${d.by}.` : undefined}>
      <div className="flex flex-col gap-5">
        <p className="flex items-start gap-2.5 text-body text-ink">
          <CheckCircle2 size={20} aria-hidden className="mt-px shrink-0 text-accent" />
          <span>
            <b className="font-semibold">{s.name}</b> reprend les données de votre ancien logiciel
            {s.run ? ` (${plural(s.run.summary.imported, "fiche transférée", "fiches transférées")})` : ""} et fonctionne indépendamment de REBORN.
          </span>
        </p>
        <Facts
          items={[
            { label: "Nom", value: s.name },
            { label: "Statut", value: <Tag tone={s.app.running ? "ok" : "idle"}>{s.app.running ? "En service" : "Arrêté (données conservées)"}</Tag> },
            {
              label: "Version installée",
              value: d ? `Mise en service n° ${s.rank ?? "?"} · données de ${d.run_id}${s.app.running ? ` · modèle métier ${s.app.rules_version !== null ? `v${s.app.rules_version}` : "aucun"}` : ""}` : "—",
            },
            {
              label: "Adresse",
              value: (
                <a href={s.app.url} target="_blank" rel="noreferrer" className="ds-link font-mono">
                  {s.app.url}
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              ),
            },
            {
              label: "Données migrées",
              value: s.run ? `${plural(s.run.summary.imported, "fiche transférée", "fiches transférées")} sur ${plural(s.run.summary.source_rows, "ligne source", "lignes sources")} · ${plural(s.run.summary.rejected, "ligne rejetée", "lignes rejetées")}` : "—",
            },
            {
              label: "Rapport de migration",
              value: v ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Tag tone={v.tone}>{v.label}</Tag>
                  {/* Rapport des données installées, même si une exécution plus récente existe */}
                  <StepLink step={d ? `validation?run=${encodeURIComponent(d.run_id)}` : "validation"}>Voir le rapport</StepLink>
                </span>
              ) : (
                "Aucun rapport pour les données installées"
              ),
            },
            { label: "Fonctionnalités", value: s.features },
          ]}
        />
        <div>
          <SubHeading>Réserves</SubHeading>
          {s.reserves.length ? (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {s.reserves.map((r) => (
                <li key={r.label} className="text-body text-text-2">
                  <b className="font-semibold text-ink">{r.label}</b> — {r.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-body text-text-2">Aucune réserve enregistrée pour les données installées.</p>
          )}
          {d && (
            <p className="mt-2 text-small text-text-3">
              Le rapport complet et le rapport d&apos;écarts (CSV) restent consultables :{" "}
              <a href={`/api/migration/runs/${encodeURIComponent(d.run_id)}/rejects?project=${encodeURIComponent(id)}`} className="ds-link">
                télécharger le rapport d&apos;écarts
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Accès personnel au logiciel livré                                    */
/* ------------------------------------------------------------------ */

interface AccessLink {
  link: string;
  expires_at: string;
  email: string;
}

/** Souvenir, dans ce navigateur seulement, qu'un lien d'activation a déjà été créé pour ce logiciel (aucun secret). */
const accessKey = (projectId: string, appId: string) => `reborn.acces-cree.${projectId}.${appId}`;
function readCreated(key: string): boolean {
  try {
    return !!window.localStorage.getItem(key);
  } catch {
    return false;
  }
}

/**
 * État de « Créer mon accès au logiciel », partagé entre l'en-tête de la Livraison (action principale tant
 * qu'aucun lien n'a été créé depuis ce navigateur) et la section « Votre accès au logiciel ». Le lien n'est
 * gardé qu'en mémoire de la page, le temps de l'afficher ; seul le fait qu'un lien a été créé est retenu.
 */
export function useAppAccess(appId: string | null) {
  const { id, post } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessLink | null>(null);
  const [created, setCreated] = useState(false);
  const key = appId ? accessKey(id, appId) : null;
  useEffect(() => {
    if (key) setCreated(readCreated(key));
  }, [key]);
  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    setAccess(null);
    try {
      setAccess(await post<AccessLink>("/api/migration/app/access", {}));
      setCreated(true);
      if (key) {
        try {
          window.localStorage.setItem(key, new Date().toISOString());
        } catch {}
      }
      requestAnimationFrame(() => document.getElementById("mon-acces")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [post, key]);
  return { busy, error, access, created, create, hide: () => setAccess(null) };
}
export type AppAccess = ReturnType<typeof useAppAccess>;

interface AppCredentials {
  login: string;
  password: string;
  url: string;
}

/**
 * « Identifiant et mot de passe » : le Studio génère un mot de passe lisible et active le compte administrateur
 * du propriétaire dans le logiciel livré. Le mot de passe n'est gardé qu'en mémoire de la page, le temps de
 * l'afficher ; une nouvelle génération annule le précédent.
 */
function useAppCredentials() {
  const { post } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<AppCredentials | null>(null);
  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setCreds(await post<AppCredentials>("/api/migration/app/credentials", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [post]);
  return { busy, error, creds, generate, hide: () => setCreds(null) };
}

function CredentialsBlock({ app, email }: { app: AppStatus; email: string | null }) {
  const { busy, error, creds, generate, hide } = useAppCredentials();
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-body font-semibold text-ink">Identifiant et mot de passe</p>
          <p className="text-small text-text-2">
            Pour vous connecter tout de suite au nouveau logiciel, avec votre adresse{email ? <b className="font-semibold text-ink"> {email}</b> : " e-mail"} (rôle administrateur).
          </p>
        </div>
        <Button variant={creds ? "secondary" : "accent"} loading={busy} loadingText="Génération…" icon={<KeyRound size={16} />} onClick={() => void generate()} disabled={!app.running}>
          {creds ? "Générer un autre mot de passe" : "Générer mon identifiant et mon mot de passe"}
        </Button>
      </div>
      {!app.running && <Callout tone="info">Le logiciel est arrêté : démarrez-le pour générer vos identifiants.</Callout>}
      {error && (
        <Callout tone="bad" title="Identifiants non générés">
          <p className="break-words">{error}</p>
        </Callout>
      )}
      {creds && (
        <div role="status" className="flex flex-col gap-3 rounded-panel bg-accent-soft px-4 py-4">
          <p className="text-body font-semibold text-ink">Vos identifiants du nouveau logiciel. Notez le mot de passe : il ne sera plus affiché.</p>
          {[
            ["Adresse du logiciel", creds.url],
            ["Identifiant", creds.login],
            ["Mot de passe", creds.password],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <p className="text-small font-semibold text-ink">{label}</p>
              <CopyField value={value} label={label} />
            </div>
          ))}
          <p className="text-small text-text-2">REBORN ne conserve pas ce mot de passe. Vous pouvez en générer un autre à tout moment (l&apos;ancien cesse alors de fonctionner) ou le changer dans le logiciel.</p>
          <div className="flex flex-wrap gap-2">
            <Button href={creds.url} target="_blank" rel="noreferrer" variant="accent" iconEnd={<ExternalLink size={16} />}>
              Ouvrir le nouveau logiciel
            </Button>
            <Button variant="ghost" onClick={hide}>
              Masquer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * « Créer mon accès au logiciel » : lien d'activation à usage unique pour l'adresse du compte. Le lien
 * n'est affiché qu'une fois (il n'est conservé ni ici ni par le Studio) ; la personne y choisit son
 * propre mot de passe, que REBORN ne connaît pas. Le bouton de création est dans l'en-tête de la page tant
 * qu'aucun lien n'a été créé depuis ce navigateur ; ensuite, la section propose d'en créer un nouveau.
 */
export function AccessSection({ app, email, access: a }: { app: AppStatus; email: string | null; access: AppAccess }) {
  const { busy, error, access } = a;
  return (
    <Section
      id="mon-acces"
      title="Votre accès au logiciel"
      description="Le nouveau logiciel a ses propres comptes, indépendants de REBORN et de l'ancien logiciel."
      actions={
        !access && a.created ? (
          <Button variant="secondary" loading={busy} loadingText="Création du lien…" icon={<KeyRound size={16} />} onClick={() => void a.create()}>
            Créer un nouveau lien d&apos;activation
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <CredentialsBlock app={app} email={email} />
        <p className="text-small font-semibold text-text-2">Ou choisissez vous-même votre mot de passe, par un lien d&apos;activation :</p>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-text-2">
          <li>
            REBORN crée un lien d&apos;activation personnel pour votre adresse{email ? <b className="font-semibold text-ink"> {email}</b> : " e-mail"}, avec le rôle administrateur.
          </li>
          <li>
            En l&apos;ouvrant, <b className="font-semibold text-ink">vous choisirez votre propre mot de passe</b> (12 caractères au moins). REBORN ne le connaît pas et ne le conserve pas ; celui de votre ancien logiciel n&apos;y sert pas.
          </li>
          <li>Le lien ne sert qu&apos;une fois et expire après 72 heures. Si vous avez déjà un accès, il vous permet d&apos;en choisir un nouveau ; un nouveau lien annule le précédent.</li>
        </ol>
        <p className="text-small leading-relaxed text-text-3">
          L&apos;équipe REBORN dispose d&apos;un accès de secours à ce logiciel (compte « admin »), pour l&apos;assistance. Une fois votre accès activé, vous pouvez le désactiver depuis
          l&apos;administration des accès du logiciel.
        </p>
        {!app.running && !access && <Callout tone="info">Le logiciel est arrêté : le lien sera pris en compte à son prochain démarrage.</Callout>}
        {error && (
          <Callout tone="bad" title="Lien non créé">
            <p className="break-words">{error}</p>
          </Callout>
        )}
        {access && (
          <div role="status" className="flex flex-col gap-3 rounded-panel bg-accent-soft px-4 py-4">
            <p className="text-body font-semibold text-ink">Votre lien d&apos;activation est prêt. Il ne sera plus affiché : copiez-le ou ouvrez-le maintenant.</p>
            <CopyField value={access.link} label="Le lien d'activation" />
            <p className="text-small text-text-2">
              Pour {access.email} · valable jusqu&apos;au {fmtDate(access.expires_at)} · utilisable une seule fois. Ne le transmettez pas : il donne accès au logiciel.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button href={access.link} target="_blank" rel="noreferrer" variant="accent" iconEnd={<ExternalLink size={16} />}>
                Ouvrir le lien et choisir mon mot de passe
              </Button>
              <Button variant="ghost" onClick={a.hide}>
                Masquer le lien
              </Button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Pour commencer                                                       */
/* ------------------------------------------------------------------ */

/** start_command renvoyé par l'API : « commande (ou : autre commande) ». */
function splitCommands(s: string): string[] {
  const m = /^(.*?)\s*\(ou\s*:\s*(.*)\)\s*$/.exec(s.trim());
  return m && m[1] && m[2] ? [m[1].trim(), m[2].trim()] : [s.trim()];
}

export function StartSection({ app, operator }: { app: AppStatus; operator: boolean }) {
  const cmds = operator && app.start_command ? splitCommands(app.start_command) : [];
  return (
    <Section collapsible defaultOpen title="Pour commencer" description="Les premiers pas dans votre nouveau logiciel.">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-text-2">
        <li>
          Créez votre accès personnel (<a href="#mon-acces" className="ds-link">Votre accès au logiciel</a>) et choisissez votre mot de passe.
        </li>
        <li>
          Ouvrez le logiciel à son adresse <span className="font-mono text-ink">{app.url}</span>, puis connectez-vous avec votre adresse e-mail et ce mot de passe.
        </li>
        <li>Vos fiches, documents et historiques sont dans les modules du menu ; les montants et documents historiques protégés ne sont pas modifiables.</li>
        <li>Pour donner accès à vos collègues, invitez-les depuis l&apos;administration des accès du logiciel : chacun choisira son mot de passe.</li>
      </ol>
      <div className="mt-5 border-t border-line pt-4">
        <SubHeading>Le logiciel fonctionne seul</SubHeading>
        <p className="mt-1 text-body leading-relaxed text-text-2">
          C&apos;est un processus indépendant : il continue de répondre si REBORN Studio s&apos;arrête et ne se connecte jamais à l&apos;ancien logiciel. S&apos;il est arrêté, redémarrez-le depuis cette
          page.
        </p>
        {cmds.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="text-small text-text-3">Équipe REBORN : pour le relancer sur le poste qui l&apos;héberge, depuis le dossier REBORN :</p>
            {cmds.map((c, i) => (
              <div key={c} className="flex flex-col gap-1.5">
                {i > 0 && <span className="text-small text-text-3">ou</span>}
                <Command value={c} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Accès de secours (équipe technique)                                  */
/* ------------------------------------------------------------------ */

export function AdminAccessSection({ app }: { app: AppStatus }) {
  return (
    <Section
      collapsible
      title="Accès de secours (équipe technique)"
      description={
        <>
          Compte « admin » initial ; mot de passe à copier avec <code className="font-mono text-small text-ink">npm run crm:password</code>.
        </>
      }
    >
      <p className="text-body leading-relaxed text-text-2">
        Réservé à la personne qui administre le poste où tourne le logiciel. REBORN Studio n&apos;affiche jamais ce mot de passe : la commande le copie dans le presse-papiers, depuis le dossier REBORN.
        Pour votre usage quotidien, préférez votre accès personnel.
      </p>
      <div className="mt-3">
        <Command value="npm run crm:password" />
      </div>
      <Facts
        className="mt-5"
        items={[
          { label: "Identifiant", value: <span className="font-mono text-small">admin</span> },
          { label: "Fichier des identifiants initiaux", value: app.credentials_file ? <span className={mono}>{app.credentials_file}</span> : "Non communiqué par l'API" },
        ]}
      />
      <p className="mt-4 text-small leading-relaxed text-text-3">Si plusieurs logiciels ont été générés sur ce poste, la commande lit le premier : utilisez plutôt ce fichier.</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Modèle métier publié dans le logiciel                                */
/* ------------------------------------------------------------------ */

export function PublishedModelSection({
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
  const validated = list.filter((v) => v.status === "validated").sort((a, b) => b.version - a.version);
  const pending = list.filter((v) => v.status === "proposed").length;
  const latest = validated[0] ?? null;
  const toPublish = app.running && latest && app.rules_version !== latest.version ? latest : null;

  async function publish(version: number) {
    await act.run(
      `pub-${version}`,
      () => post<{ ok: boolean; version: number; file: string; running: boolean; active_version: number | null }>("/api/migration/app/rules", { version }),
      (r) =>
        !r.running
          ? { tone: "info", text: `v${r.version} déposée dans le logiciel : elle sera chargée à son prochain démarrage.` }
          : r.active_version === r.version
            ? { tone: "ok", text: `v${r.version} publiée et active : les nouveaux documents l'utilisent, les documents existants gardent leur version.` }
            : { tone: "warn", text: `v${r.version} publiée, mais la version active reste ${r.active_version !== null ? `v${r.active_version}` : "inconnue"} : le logiciel active la version publiée la plus récente.` },
    );
    await onChanged();
  }

  return (
    <Section
      collapsible
      title="Calculs (modèle métier)"
      description={app.running ? (app.rules_version !== null ? `Version active : v${app.rules_version}.` : "Aucune version active : les nouveaux documents ne sont pas calculés.") : "Version active lue au démarrage du logiciel."}
      badge={toPublish ? <Tag tone="warn">v{toPublish.version} à publier</Tag> : null}
    >
      <p className="text-body leading-relaxed text-text-2">Publier une version validée l&apos;active à chaud ; les documents existants et l&apos;historique migré ne sont jamais recalculés.</p>
      <div className="mt-3">
        {loading && !versions ? (
          <Loading label="Lecture des versions du modèle métier…" />
        ) : !versions ? (
          <LoadError message={error} onRetry={reload} />
        ) : validated.length === 0 ? (
          <EmptyState title="Aucune version validée">
            {pending ? `${plural(pending, "version attend", "versions attendent")} une décision` : "Aucune version reçue pour l'instant"} : <StepLink step="reconstruction">étape Reconstruction</StepLink>.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
            {validated.map((v) => {
              const src = BM_SOURCE[v.source] ?? { label: v.source };
              const dropped = (v.published ?? []).filter((p) => p.app_id === app.app_id).at(-1);
              const active = app.running && app.rules_version === v.version;
              const state: { label: string; tone: Tone } = active ? { label: "Active", tone: "ok" } : dropped ? { label: app.running ? "Déposée, non active" : "Déposée", tone: "idle" } : { label: "Non publiée", tone: "warn" };
              const t = v.history_check ? totals(v.history_check) : null;
              return (
                <li key={v.version} className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-body font-semibold text-ink">v{v.version}</span>
                      <Tag tone={state.tone}>{state.label}</Tag>
                      {src.test ? <TestBadge /> : <Tag plain>{src.label}</Tag>}
                    </div>
                    <p className="mt-1 text-small break-words text-text-2">
                      Validée{v.decided_by ? ` par ${v.decided_by}` : ""}
                      {v.decided_at ? ` le ${fmtDate(v.decided_at)}` : ""}
                      {dropped ? ` · déposée le ${fmtDate(dropped.at)}` : ""}
                      {" · "}
                      <span className={t ? undefined : "text-warning-ink"}>{t ? `rejeu : ${plural(t.identical, "identique", "identiques")} sur ${fmtInt(t.checked)}` : "pas rejouée sur l'historique"}</span>
                    </p>
                  </div>
                  {!active && (
                    <Button size="sm" variant="secondary" className="self-start sm:self-auto" disabled={!!act.busy && act.busy !== `pub-${v.version}`} loading={act.busy === `pub-${v.version}`} icon={<Upload size={14} />} onClick={() => void publish(v.version)}>
                      Publier v{v.version}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {pending > 0 && validated.length > 0 && (
        <p className="mt-2 text-small text-text-3">
          {plural(pending, "autre version attend", "autres versions attendent")} une décision : <StepLink step="reconstruction">étape Reconstruction</StepLink>.
        </p>
      )}
      {act.notice && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Rapport de migration et réconciliation                               */
/* ------------------------------------------------------------------ */

function verdictOf(report: VerificationReport, acknowledged: boolean): { label: string; tone: Tone } {
  if (report.status === "review" && acknowledged) return { label: "Écarts acceptés", tone: "ok" };
  return VERDICT[report.status] ?? { label: report.status, tone: "idle" };
}

function ReportSummary({ report, acknowledged = false }: { report: VerificationReport; acknowledged?: boolean }) {
  const v = verdictOf(report, acknowledged);
  const passed = report.checks.filter((c) => c.status === "pass").length;
  const failed = report.checks.filter((c) => c.status === "fail").length;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Tag tone={v.tone}>{v.label}</Tag>
        <span className="tabular text-small text-text-2">
          {passed}/{report.checks.length} contrôles réussis{failed ? ` · ${failed} en échec` : ""} · {plural(report.gaps.length, "écart documenté", "écarts documentés")}
        </span>
      </div>
      <p className="mt-2 text-small leading-relaxed text-ink">{report.statement}</p>
      <p className="mt-1 text-small text-text-3">Vérifié le {fmtDate(report.verified_at)}</p>
    </div>
  );
}

export function MigrationReportSection({ runId, detail, error, reload, onChanged }: { runId: string | null; detail: RunDetail | null; error: string | null; reload: () => Promise<void>; onChanged: () => Promise<void> }) {
  const { id, post } = useProject();
  const act = useAction();
  const rep = detail?.report ?? null;
  const rec = detail?.reconciliation ?? null;
  const verdict = rep ? verdictOf(rep, !!detail?.acknowledged) : null;

  async function reconcile() {
    await act.run(
      "reconcile",
      () => post<{ ok: boolean; status: VerificationReport["status"]; checks: number; failed: string[] }>("/api/migration/reconcile", {}),
      (r) => ({ tone: VERDICT[r.status]?.tone ?? "idle", text: `Réconciliation terminée : ${VERDICT[r.status]?.label ?? r.status} — ${plural(r.checks, "contrôle", "contrôles")}, ${r.failed.length} en échec${r.failed.length ? ` (${r.failed.join(", ")})` : ""}.` }),
    );
    await onChanged();
  }

  return (
    <Section collapsible title="Rapport de migration" description={runId ? `Contrôles des données installées (${runId}).` : "Aucune donnée installée."} badge={verdict ? <Tag tone={verdict.tone}>{verdict.label}</Tag> : null}>
      {!runId ? (
        <p className="text-body text-text-2">Aucune mise en service active : pas de données installées.</p>
      ) : !detail ? (
        error ? (
          <LoadError message={error} onRetry={reload} />
        ) : (
          <Loading label="Lecture du rapport de vérification…" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {rep ? <ReportSummary report={rep} acknowledged={!!detail.acknowledged} /> : <Callout tone="warn">Aucun rapport de vérification enregistré pour {runId}.</Callout>}
          {detail.acknowledged && (
            <p className="text-small text-text-2">
              Écarts acceptés par <b className="font-semibold text-ink">{detail.acknowledged.by}</b> le {fmtDate(detail.acknowledged.at)}
              {detail.acknowledged.comment ? ` — « ${detail.acknowledged.comment} »` : ""}
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-small">
            <StepLink step="validation">Rapport complet à l&apos;étape Validation</StepLink>
            <a href={`/api/migration/runs/${encodeURIComponent(runId)}/rejects?project=${encodeURIComponent(id)}`} className="ds-link inline-flex items-center gap-1.5">
              <Download size={14} aria-hidden /> Rapport d&apos;écarts (CSV)
            </a>
          </div>
          <div className="mt-1 border-t border-line pt-4">
            <SubHeading>Réconciliation de la base en service</SubHeading>
            <p className="mt-1 text-small leading-relaxed text-text-2">Relit la base du logiciel en service et la recompare aux fichiers sources ; les fiches modifiées depuis par ses utilisateurs sont exclues de la comparaison champ à champ.</p>
            <div className="mt-3">{rec ? <ReportSummary report={rec} /> : <p className="text-small text-text-3">Aucune réconciliation enregistrée pour {runId}.</p>}</div>
            <Button size="sm" variant="secondary" className="mt-3" disabled={!!act.busy && act.busy !== "reconcile"} loading={act.busy === "reconcile"} icon={<RefreshCw size={14} />} onClick={() => void reconcile()}>
              Relire et comparer
            </Button>
            {act.notice && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
          </div>
        </div>
      )}
      {error && detail && (
        <Callout tone="warn" className="mt-3">
          Actualisation impossible : {error}
        </Callout>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Versions, mises à jour et retour arrière                             */
/* ------------------------------------------------------------------ */

const UPDATE_EVENT = /mis en service|mis à jour|publié dans le logiciel livré|Retour arrière|Accès au logiciel livré/;

/** Mises à jour déjà faites (journal réel du projet : mises en service, moteur, calculs, accès). */
function UpdatesJournal() {
  const { state } = useReborn();
  const { id } = useProject();
  const events = useMemo(
    () =>
      (state?.events ?? [])
        .filter((e) => {
          const pid = (e as { project_id?: string }).project_id ?? (e.data as { project_id?: string } | undefined)?.project_id;
          return e.type === "migration" && pid === id && UPDATE_EVENT.test(e.title);
        })
        .slice(-12)
        .reverse(),
    [state?.events, id],
  );
  if (!state) return <Loading label="Lecture du journal…" />;
  if (!events.length) return <p className="text-small text-text-3">Aucune mise à jour enregistrée dans le journal du projet.</p>;
  return (
    <ol className="flex flex-col">
      {events.map((e) => (
        <li key={e.id} className="grid gap-x-4 gap-y-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[140px_minmax(0,1fr)]">
          <time dateTime={e.ts} className="tabular text-small text-text-3">
            {fmtDate(e.ts)}
          </time>
          <div className="min-w-0">
            <p className="text-small font-semibold break-words text-ink">{e.title}</p>
            {e.detail && <p className="text-small break-words text-text-2">{e.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DeploymentsSection({ overview, loading, error, reload, onChanged }: { overview: MigrationOverview | null; loading: boolean; error: string | null; reload: () => Promise<void>; onChanged: () => Promise<void> }) {
  const { post } = useProject();
  const act = useAction();
  const [confirm, setConfirm] = useState<Deployment | null>(null);
  const list = overview ? [...overview.deployments].reverse() : [];
  const canRollback = list.some((d) => d.status === "active" && !!d.backup);
  const total = overview?.deployments.length ?? 0;

  async function rollback(d: Deployment) {
    await act.run(
      `rb-${d.id}`,
      () => post<{ ok: boolean }>("/api/migration/rollback", { deployment_id: d.id }),
      () => ({ tone: "ok", text: `Retour arrière effectué : la base antérieure au ${fmtDate(d.at)} (${d.run_id}) est restaurée et le logiciel redémarré. La base remplacée reste dans ses sauvegardes.` }),
    );
    await onChanged();
  }

  return (
    <Section collapsible title="Versions et mises à jour" description={overview ? `${plural(list.length, "mise en service", "mises en service")}${canRollback ? " ; la base précédente peut être restaurée." : "."}` : "Historique des mises en service."}>
      {loading && !overview ? (
        <Loading label="Lecture de l'historique…" />
      ) : !overview ? (
        <LoadError message={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <p className="text-body text-text-2">Aucune mise en service enregistrée.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
          {list.map((d, i) => {
            const st = DEPLOY_STATUS[d.status] ?? { label: d.status, tone: "idle" as Tone };
            return (
              <li key={d.id} className="px-3.5 py-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-ink">Mise en service n° {total - i}</span>
                      <Tag tone={st.tone}>{st.label}</Tag>
                      <span className="tabular text-small text-text-3">{fmtDate(d.at)}</span>
                    </div>
                    <p className="mt-1 text-small break-words text-text-2">
                      Données de <span className="font-mono text-ink">{d.run_id}</span> · par {d.by} ·{" "}
                      {d.backup ? (
                        <>
                          base précédente sauvegardée : <span className="font-mono text-meta break-all">{d.backup}</span>
                        </>
                      ) : (
                        "première mise en service, aucune base antérieure"
                      )}
                    </p>
                  </div>
                  {d.status === "active" &&
                    (d.backup ? (
                      <Button size="sm" variant="secondary" className="self-start" disabled={!!act.busy} icon={<RotateCcw size={14} />} onClick={() => setConfirm(d)}>
                        Retour arrière
                      </Button>
                    ) : (
                      <span className="text-small leading-snug text-text-3 sm:max-w-[220px] sm:text-right">Retour arrière impossible : aucune base antérieure.</span>
                    ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-5">
        <SubHeading>Mises à jour enregistrées</SubHeading>
        <div className="mt-2">
          <UpdatesJournal />
        </div>
      </div>
      {act.notice && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
      {error && overview && (
        <Callout tone="warn" className="mt-3">
          Actualisation impossible : {error}
        </Callout>
      )}
      <ConfirmationDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm) await rollback(confirm);
        }}
        title="Restaurer la base antérieure à cette mise en service ?"
        confirmLabel="Confirmer le retour arrière"
        pendingLabel="Retour arrière en cours…"
        tone="danger"
      >
        <p>La base actuelle est d&apos;abord sauvegardée, puis celle d&apos;avant cette mise en service est restaurée et le logiciel redémarré.</p>
        <p className="mt-1">Les saisies faites depuis ne seront plus visibles (elles restent dans la sauvegarde) ; le moteur et la spécification ne changent pas.</p>
      </ConfirmationDialog>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Maintenance : arrêt et mise à jour du moteur                          */
/* ------------------------------------------------------------------ */

export function MaintenanceSection({ app, act, blocked, onChanged, operator }: { app: AppStatus; act: Action; blocked: boolean; onChanged: () => Promise<void>; operator: boolean }) {
  const { post } = useProject();
  const [confirm, setConfirm] = useState<"stop" | "upgrade" | null>(null);
  const busy = !!act.busy || blocked;

  async function stop() {
    await act.run(
      "stop",
      () => post<{ ok: boolean; app: AppStatus }>("/api/migration/app", { action: "stop" }),
      (r) =>
        r.app.running
          ? { tone: "warn", text: "Le logiciel répond toujours : son processus n'a pas été retrouvé par son fichier PID (lancé à la main ou par une version antérieure). Arrêtez-le depuis son terminal (Ctrl+C)." }
          : { tone: "ok", text: "Logiciel arrêté. Ses données sont conservées ; il peut être redémarré ici ou lancé seul." },
    );
    await onChanged();
  }

  async function upgrade() {
    await act.run(
      "upgrade",
      () => post<{ ok: boolean; upgrade: { app_id: string; backup: string; rules_versions: number[]; url: string }; app: AppStatus }>("/api/migration/app", { action: "upgrade" }),
      (r) => ({
        tone: "ok",
        text: `Moteur et spécification mis à jour, données conservées (sauvegarde : ${r.upgrade.backup}). Modèle métier installé : ${r.upgrade.rules_versions.length ? r.upgrade.rules_versions.map((v) => `v${v}`).join(", ") : "aucun"}.${r.app.running ? "" : " Le logiciel ne répond pas encore à son adresse locale."}`,
      }),
    );
    await onChanged();
  }

  const row = "flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between";
  return (
    <Section collapsible title="Maintenance" description="Arrêter le logiciel ou mettre à jour son moteur sans toucher aux données.">
      <ul className="-my-3.5 flex flex-col divide-y divide-line">
        <li className={row}>
          <div className="min-w-0">
            <p className="text-body font-semibold text-ink">Arrêter le logiciel</p>
            <p className="mt-0.5 text-small leading-relaxed text-text-2">Ses utilisateurs n&apos;y ont plus accès jusqu&apos;au redémarrage ; aucune donnée n&apos;est perdue.</p>
          </div>
          {app.running ? (
            <Button variant="secondary" className="self-start sm:self-auto" disabled={busy && act.busy !== "stop"} loading={act.busy === "stop"} icon={<Square size={14} />} onClick={() => setConfirm("stop")}>
              Arrêter
            </Button>
          ) : (
            <span className="text-small text-text-3">Déjà arrêté</span>
          )}
        </li>
        <li className={row}>
          <div className="min-w-0">
            <p className="text-body font-semibold text-ink">Mettre à jour le moteur</p>
            <p className="mt-0.5 text-small leading-relaxed text-text-2">
              Réinstalle le moteur, la spécification et les versions validées du modèle métier ; la base, les pièces jointes et les comptes sont conservés.
              {!operator && " Réservé à l'équipe REBORN."}
            </p>
          </div>
          {operator && (
            <Button variant="secondary" className="self-start sm:self-auto" disabled={busy && act.busy !== "upgrade"} loading={act.busy === "upgrade"} icon={<Wrench size={14} />} onClick={() => setConfirm("upgrade")}>
              Mettre à jour
            </Button>
          )}
        </li>
      </ul>
      {act.notice && <ActionNotice className="mt-3" notice={act.notice} onClose={() => act.setNotice(null)} />}
      <ConfirmationDialog
        open={confirm === "stop"}
        onClose={() => setConfirm(null)}
        onConfirm={stop}
        title="Arrêter le logiciel livré ?"
        confirmLabel="Arrêter le logiciel"
        pendingLabel="Arrêt en cours…"
        tone="danger"
      >
        Ses utilisateurs n&apos;y auront plus accès jusqu&apos;au redémarrage. Aucune donnée n&apos;est perdue.
      </ConfirmationDialog>
      <ConfirmationDialog open={confirm === "upgrade"} onClose={() => setConfirm(null)} onConfirm={upgrade} title="Mettre à jour le moteur et la spécification ?" confirmLabel="Confirmer la mise à jour" pendingLabel="Mise à jour en cours…">
        <p>Le logiciel est arrêté, sa base sauvegardée (dossier backups/), puis le moteur générique et la spécification sont réinstallés avec les versions validées du modèle métier.</p>
        <p className="mt-1">Le schéma n&apos;évolue que par ajout de colonnes ; le logiciel est indisponible pendant son redémarrage.</p>
      </ConfirmationDialog>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Intégration technique                                                */
/* ------------------------------------------------------------------ */

export function DeliveryTechSection({ app }: { app: AppStatus }) {
  const d = app.deployment;
  // D'après `managed` : le numéro de processus n'est servi qu'à l'équipe REBORN (lot B1).
  const state = appProcessState(app);
  const process =
    state === "managed" || state === "unresponsive" ? (
      <>
        {app.pid ? (
          <>
            PID <span className="tabular font-mono">{app.pid}</span>
          </>
        ) : (
          "Géré par le Studio"
        )}
        {state === "managed" ? " · retrouvé par son fichier run/server.pid, le Studio n'en est pas le processus parent" : " · ne répond pas à son adresse locale (voir app.log dans son dossier)"}
      </>
    ) : state === "external" ? (
      "En service sans fichier PID : arrêt et mise à jour impossibles depuis le Studio"
    ) : (
      "Aucun processus en cours"
    );
  return (
    <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : processus et dossiers du logiciel livré.">
      <Facts
        items={[
          { label: "Processus", value: process },
          { label: "Adresse locale", value: <span className={mono}>{app.url}</span> },
          { label: "Dossier du logiciel", value: d ? <span className={mono}>{d.app_dir}</span> : "—" },
          { label: "Fichier des identifiants initiaux", value: app.credentials_file ? <span className={mono}>{app.credentials_file}</span> : "—" },
          { label: "Mise en service active", value: d ? <span className={mono}>{d.id}</span> : "—" },
          { label: "Commande de lancement", value: app.start_command ? <span className={mono}>{app.start_command}</span> : "—" },
        ]}
      />
      <SubHeading className="mt-6">Routes d&apos;API</SubHeading>
      <div className="mt-2">
        <ApiRoutes
          routes={[
            { method: "GET", path: "/api/migration/app", label: "État réel du logiciel livré (relu toutes les 10 s sur cette page)" },
            { method: "POST", path: "/api/migration/app", label: "Pilotage du processus { action: start | stop | upgrade }" },
            { method: "POST", path: "/api/migration/app/access", label: "Lien d'activation à usage unique pour le compte connecté (renvoyé une fois, non journalisé)" },
            { method: "POST", path: "/api/migration/app/rules", label: "Publication d'une version validée du modèle métier { version }" },
            { method: "POST", path: "/api/migration/reconcile", label: "Réconciliation de la base en service" },
            { method: "POST", path: "/api/migration/rollback", label: "Retour arrière { deployment_id }" },
            { method: "GET", path: "/api/migration/runs/{id}/rejects", label: "Rapport d'écarts (CSV)" },
          ]}
        />
      </div>
      <p className="mt-3 text-small leading-relaxed text-text-3">
        Activer une version antérieure du modèle métier : un administrateur du logiciel livré appelle <code className="font-mono">POST /api/admin/rules/active {"{ version }"}</code> (pas encore d&apos;écran).
        Indépendance vérifiée par <code className="font-mono">scripts/acceptance.mjs</code> (test « Indépendance »), non exécuté depuis cette page.
      </p>
    </Section>
  );
}

