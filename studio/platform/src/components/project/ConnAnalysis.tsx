"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Radar, RotateCcw, Upload, XCircle } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Skeleton } from "@/components/ds/Progress";
import { Stepper, type StepperStep } from "@/components/ds/Stepper";
import type { Tone } from "@/components/ds/styles";
import { Facts, Section } from "./Step";
import { ConnApiError, ConnResultCallout, connApi, connDate, connErrorText, connRelative, useConnAction, type ConnResult } from "./ConnShared";

/*
 * « ANALYSER MON LOGICIEL » (SPEC §6) : demande d'analyse du projet, prise en charge par
 * l'exécuteur de l'agent (Mouss). Contrat du lot B2 :
 *   POST | GET | DELETE /api/projects/[id]/analysis
 *     → { mission: { id, status, created_at, expires_at } | null, executor_available, message? }
 * Rien n'est simulé : l'état affiché est celui que renvoie le Studio, et le message exact
 * « Agent d'analyse non disponible pour le moment. » s'affiche tant qu'aucun agent n'est disponible.
 */

/** Message exact (SPEC §6, r7 §6.5) : affiché sans guillemets, sans indicateur de progression. */
export const AGENT_UNAVAILABLE = "Agent d'analyse non disponible pour le moment.";

export type MissionStatus = "queued" | "claimed" | "connecting" | "connected" | "exploring" | "needs_human" | "completed" | "failed" | "cancelled" | "expired";

export interface AnalysisMission {
  id: string;
  status: MissionStatus | (string & {});
  created_at: string;
  expires_at: string;
  /** Fin de la demande (annulée, expirée, terminée, en échec) et sa raison, telles qu'enregistrées par le Studio. */
  ended_at?: string | null;
  outcome_detail?: string | null;
}

export interface AnalysisState {
  mission: AnalysisMission | null;
  executor_available: boolean;
  message?: string;
}

/** Réponse de l'API, lue prudemment (le contrat est en cours d'écriture côté B2). */
export function normalizeAnalysis(raw: unknown): AnalysisState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const m = (r.mission ?? null) as Record<string, unknown> | null;
  const mission =
    m && typeof m === "object" && typeof m.id === "string"
      ? {
          id: m.id,
          status: String(m.status ?? r.state ?? "queued"),
          created_at: String(m.created_at ?? ""),
          expires_at: String(m.expires_at ?? ""),
          ended_at: typeof m.ended_at === "string" ? m.ended_at : null,
          outcome_detail: typeof m.outcome_detail === "string" && m.outcome_detail ? m.outcome_detail : null,
        }
      : null;
  return {
    mission,
    executor_available: r.executor_available === true || r.agent_available === true,
    message: typeof r.message === "string" && r.message ? r.message : undefined,
  };
}

interface MissionInfo {
  label: string;
  /** Libellé court (chiffre du haut de page). */
  short: string;
  tone: Tone;
  /** Demande encore en cours (en file, prise, connexion, exploration, intervention). */
  active: boolean;
  text: string;
  /** Position dans le déroulé (Stepper) ; null : déroulé non affiché. */
  stage: number | null;
  attention?: string;
}

/** Libellés français des états de la demande (une valeur inconnue n'est jamais présentée comme réussie). */
export const MISSION_INFO: Record<MissionStatus, MissionInfo> = {
  queued: { label: "En file d'attente", short: "En file", tone: "neutral", active: true, stage: 0, text: "Votre demande attend qu'un agent d'analyse la prenne en charge. Aucune exploration n'a commencé." },
  claimed: { label: "Prise en charge par l'agent", short: "Prise en charge", tone: "running", active: true, stage: 1, text: "Un agent d'analyse a pris votre demande en charge et va se connecter à votre logiciel." },
  connecting: { label: "Connexion en cours", short: "Connexion", tone: "running", active: true, stage: 2, text: "L'agent se connecte à votre logiciel avec le compte que vous avez confié." },
  connected: { label: "Connecté", short: "Connecté", tone: "ok", active: true, stage: 3, text: "L'agent est connecté à votre logiciel. Ses observations s'afficheront à l'étape Découverte." },
  exploring: { label: "Exploration en cours", short: "Exploration", tone: "running", active: true, stage: 4, text: "L'agent explore votre logiciel. Ce qu'il observe s'affiche à l'étape Découverte, au fil de ses rapports." },
  needs_human: {
    label: "Intervention nécessaire",
    short: "Intervention",
    tone: "warn",
    active: true,
    stage: 2,
    attention: "Intervention nécessaire",
    text: "L'agent s'est arrêté : votre logiciel demande une action de votre part (par exemple une double authentification). L'agent ne contourne jamais une protection.",
  },
  completed: { label: "Terminée", short: "Terminée", tone: "ok", active: false, stage: 5, text: "L'agent a terminé l'analyse de votre logiciel." },
  failed: { label: "Échec", short: "Échec", tone: "bad", active: false, stage: null, text: "L'analyse n'a pas abouti. Vous pouvez la relancer, ou importer vos exports à l'étape Données." },
  cancelled: { label: "Annulée", short: "Annulée", tone: "neutral", active: false, stage: null, text: "Cette demande d'analyse a été annulée." },
  expired: { label: "Expirée", short: "Expirée", tone: "neutral", active: false, stage: null, text: "La demande a expiré avant d'aboutir : elle ne dure jamais plus longtemps que vos identifiants." },
};

export function missionInfo(status: string | undefined | null): MissionInfo {
  if (!status) return { label: "Aucune demande", short: "Aucune", tone: "neutral", active: false, stage: null, text: "Aucune analyse n'a été demandée pour ce projet." };
  return MISSION_INFO[status as MissionStatus] ?? { label: `État « ${status} »`, short: "Inconnu", tone: "neutral", active: false, stage: null, text: "État transmis par le Studio, non reconnu par cette page." };
}

/**
 * Raison de la fin d'une demande, en clair (motif enregistré par le Studio, lib/migration/analysis.ts) :
 * « annulée par Camille Morel » → « à la demande de Camille Morel ». Motif inconnu : repris tel quel.
 */
export function endReason(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const by = /^annulée par (.+)$/i.exec(detail.trim());
  if (by) return `à la demande de ${by[1]}`;
  if (/^identifiants retirés ou expirés$/i.test(detail.trim())) return "les identifiants confiés ont été effacés ou ont expiré";
  return detail.trim().replace(/\.$/, "");
}

/** Phrase d'état d'une demande terminée sans aboutir, avec sa date et sa raison quand le Studio les donne. */
export function endedText(mission: AnalysisMission | null, info: MissionInfo): string {
  if (!mission || info.active || (mission.status !== "cancelled" && mission.status !== "expired" && mission.status !== "failed")) return info.text;
  const why = endReason(mission.outcome_detail);
  const when = mission.ended_at ? ` le ${connDate(mission.ended_at)}` : "";
  if (mission.status === "cancelled") return `Cette demande d'analyse a été annulée${when}${why ? ` : ${why}` : ""}.`;
  if (mission.status === "expired") return `${info.text}${why ? ` Motif enregistré : ${why}.` : ""}`;
  return why ? `L'analyse n'a pas abouti${when} : ${why}. Vous pouvez la relancer, ou importer vos exports à l'étape Données.` : info.text;
}

const STAGES = ["En file d'attente", "Prise en charge", "Connexion", "Connecté", "Exploration", "Terminée"];

/** Déroulé de la demande : étapes déjà franchies d'après l'état actuel (aucune durée, aucun pourcentage). */
function missionSteps(info: MissionInfo): StepperStep[] {
  return STAGES.map((label, i) => {
    if (info.stage === null) return { label, status: "upcoming" };
    if (i < info.stage) return { label, status: "done" };
    if (i === info.stage) {
      if (info.attention) return { label, status: "attention", statusLabel: info.attention };
      if (i === STAGES.length - 1) return { label, status: "done" };
      return { label, status: "current" };
    }
    return { label, status: "upcoming" };
  });
}

/* ------------------------------------------------------------------ */
/* Lecture de l'état                                                    */
/* ------------------------------------------------------------------ */

export interface AnalysisHandle {
  data: AnalysisState | null;
  /** Erreur de lecture (service indisponible, refus…) ; `status` : code HTTP s'il est connu. */
  error: { message: string; status: number | null } | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Remplace l'état affiché par la réponse d'une écriture (POST, DELETE). */
  set: (s: AnalysisState) => void;
}

/**
 * État de la demande d'analyse d'un projet : lu à l'ouverture, à chaque évènement du Studio
 * (`tick`) et toutes les 10 s tant que la page est visible (disponibilité de l'agent).
 */
export function useAnalysis(projectId: string, tick = 0): AnalysisHandle {
  const [data, setData] = useState<AnalysisState | null>(null);
  const [error, setError] = useState<AnalysisHandle["error"]>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = normalizeAnalysis(await connApi("GET", `/api/projects/${projectId}/analysis`));
      if (n !== seq.current) return;
      setData(r);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError({ message: connErrorText(e), status: e instanceof ConnApiError ? e.status : null });
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void reload();
  }, [reload, tick]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 10000);
    return () => clearInterval(t);
  }, [reload]);
  const set = useCallback((s: AnalysisState) => {
    seq.current++;
    setData(s);
    setError(null);
    setLoading(false);
  }, []);
  return { data, error, loading, reload, set };
}

/** Demande d'analyse (POST) : `withoutCredentials` doit être un choix explicite de la personne. */
export async function requestAnalysis(projectId: string, withoutCredentials: boolean): Promise<AnalysisState> {
  return normalizeAnalysis(await connApi("POST", `/api/projects/${projectId}/analysis`, withoutCredentials ? { without_credentials: true } : {}));
}

/* ------------------------------------------------------------------ */
/* Actions : demander, relancer, annuler                                */
/* ------------------------------------------------------------------ */

/**
 * Actions sur la demande d'analyse, avec leurs confirmations. Rendre `dialogs` une fois dans la page.
 * Sans identifiants déposés, la demande sans identifiants est confirmée explicitement.
 */
export function useAnalysisControl({ projectId, analysis, credentialsStored, after }: { projectId: string; analysis: AnalysisHandle; credentialsStored: boolean; after?: () => unknown }) {
  const action = useConnAction();
  const [askWithout, setAskWithout] = useState(false);
  const [askCancel, setAskCancel] = useState(false);

  // Résultat du clic : l'état réel (et le message exact d'indisponibilité) est affiché par le bloc d'analyse.
  const announce = (s: AnalysisState): ConnResult => {
    if (!s.mission) return { tone: "warn", title: "Aucune demande en file d'attente", text: s.message ?? "Le Studio n'a enregistré aucune demande d'analyse." };
    return { tone: "info", title: "Demande d'analyse enregistrée", text: `État : ${missionInfo(s.mission.status).label.toLowerCase()}. Rien n'est affiché comme lancé tant que l'agent ne l'a pas fait.` };
  };

  const send = async (without: boolean) => {
    const s = await requestAnalysis(projectId, without);
    analysis.set(s);
    return s;
  };

  const start = () => {
    if (!credentialsStored) {
      setAskWithout(true);
      return;
    }
    void action.run("start", async () => announce(await send(false)), { errorTitle: "Demande d'analyse non enregistrée", after });
  };

  const dialogs: ReactNode = (
    <>
      <ConfirmationDialog
        open={askWithout}
        onClose={() => setAskWithout(false)}
        title="Lancer l'analyse sans identifiants ?"
        confirmLabel="Lancer sans identifiants"
        pendingLabel="Demande en cours…"
        onConfirm={async () => {
          const s = await send(true);
          action.setResult(announce(s));
          await after?.();
        }}
      >
        Aucun identifiant n&apos;est déposé : l&apos;agent ne verra que les pages accessibles sans connexion. Pour une analyse complète, déposez d&apos;abord un accès dans la section « Vos identifiants ».
      </ConfirmationDialog>
      <ConfirmationDialog
        open={askCancel}
        onClose={() => setAskCancel(false)}
        title="Annuler la demande d'analyse ?"
        confirmLabel="Annuler l'analyse"
        cancelLabel="Garder la demande"
        pendingLabel="Annulation…"
        tone="danger"
        onConfirm={async () => {
          const s = normalizeAnalysis(await connApi("DELETE", `/api/projects/${projectId}/analysis`));
          analysis.set(s);
          action.setResult({ tone: "ok", title: "Demande d'analyse annulée", text: "Les informations déjà reçues restent consultables. Vos identifiants ne sont pas supprimés par cette action." });
          await after?.();
        }}
      >
        L&apos;agent ne traitera plus cette demande. Ce qu&apos;il a déjà rapporté reste consultable, et vos identifiants restent déposés jusqu&apos;à leur échéance, sauf si vous les supprimez.
      </ConfirmationDialog>
    </>
  );

  return { ...action, start, cancel: () => setAskCancel(true), dialogs };
}

/* ------------------------------------------------------------------ */
/* Affichage                                                            */
/* ------------------------------------------------------------------ */

/** Libellé et ton courts de la disponibilité de l'agent (chiffre du haut de page). */
export function agentAvailability(analysis: AnalysisHandle): { value: string; tone?: "ok" | "warn"; hint?: string } {
  if (analysis.data) return analysis.data.executor_available ? { value: "Disponible", tone: "ok", hint: "Un agent d'analyse est en ligne" } : { value: "Non disponible", tone: "warn", hint: "Aucun agent d'analyse en ligne" };
  if (analysis.error) return { value: "Inconnue", hint: "État de l'analyse illisible" };
  return { value: "—" };
}

/**
 * Bloc « Analyse de votre logiciel » : état réel de la demande, disponibilité de l'agent,
 * intervention nécessaire, relance et annulation.
 */
export function ConnAnalysisPanel({
  analysis,
  control,
  legacyUrl,
  paused,
  importHref,
}: {
  analysis: AnalysisHandle;
  control: AnalysisControl;
  legacyUrl: string | null;
  paused: boolean;
  importHref: string;
}) {
  const { data, error, loading } = analysis;
  const mission = data?.mission ?? null;
  const info = missionInfo(mission?.status);
  const unavailable = !!data && !data.executor_available && (!mission || mission.status === "queued");

  let body: ReactNode;
  if (loading && !data && !error) body = <Skeleton lines={3} label="Lecture de l'état de l'analyse…" />;
  else if (!data && error)
    body = (
      <Alert
        tone="warn"
        title="État de l'analyse indisponible"
        live="off"
        action={
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={() => analysis.reload()}>
            Réessayer
          </Button>
        }
      >
        {error.status === 404 ? "Le service d'analyse ne répond pas pour ce projet." : error.message} Aucune analyse n&apos;est présentée comme lancée tant que le Studio ne la confirme pas.
      </Alert>
    );
  else if (data && !mission)
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body leading-relaxed text-text-2">
          Aucune analyse n&apos;a été demandée pour ce projet. Quand vous la demandez, un agent d&apos;analyse se connecte à votre logiciel avec le compte confié, explore ses écrans et rapporte ce qu&apos;il observe.
        </p>
        {unavailable && (
          <Alert tone="warn" title={AGENT_UNAVAILABLE} live="off">
            Vous pouvez quand même enregistrer votre demande : elle restera en file d&apos;attente. En attendant, l&apos;import de vos exports reste possible.
          </Alert>
        )}
      </div>
    );
  else if (data && mission)
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone={info.tone}>{info.label}</StatusBadge>
          <span className="text-small text-text-3">Mise à jour automatique</span>
        </div>
        <p className="max-w-[720px] text-body leading-relaxed text-text-2">{endedText(mission, info)}</p>
        {info.stage !== null && <Stepper steps={missionSteps(info)} orientation="horizontal" label="Déroulé de la demande d'analyse" />}
        {unavailable && (
          <Alert
            tone="warn"
            live="off"
            title={AGENT_UNAVAILABLE}
            action={
              <Button href={importHref} variant="secondary" size="sm" icon={<Upload size={14} />}>
                Importer des fichiers
              </Button>
            }
          >
            Votre demande reste en file d&apos;attente{mission.expires_at ? ` jusqu'au ${connDate(mission.expires_at)}` : ""} ; aucune exploration n&apos;a commencé. En attendant, vous pouvez importer les exports de votre logiciel.
          </Alert>
        )}
        {mission.status === "needs_human" && (
          <Alert tone="warn" title="Intervention nécessaire : à vous d'agir">
            Pour continuer : confiez un compte qui n&apos;exige pas de double authentification, puis relancez l&apos;analyse ; ou importez directement les exports de votre logiciel.
          </Alert>
        )}
        {data.message && data.message !== AGENT_UNAVAILABLE && (
          <p className="text-body text-text-2">
            <span className="font-semibold text-ink">Message du Studio :</span> {data.message}
          </p>
        )}
        <Facts
          items={[
            { label: "Demandée le", value: connDate(mission.created_at) },
            {
              label: info.active ? "Échéance de la demande" : "Échéance prévue",
              value: (
                <>
                  {connDate(mission.expires_at)}
                  {info.active && connRelative(mission.expires_at) ? <span className="text-text-3"> · {connRelative(mission.expires_at)}</span> : null}
                </>
              ),
            },
          ]}
        />
        {info.active && (
          <div>
            <Button variant="ghost" size="sm" icon={<XCircle size={15} />} onClick={control.cancel} disabled={!!control.busy}>
              Annuler l&apos;analyse
            </Button>
          </div>
        )}
      </div>
    );

  return (
    <Section
      title="Analyse de votre logiciel"
      description={mission ? `Demande du ${connDate(mission.created_at)}` : "Exploration de votre logiciel par l'agent d'analyse"}
    >
      <div className="flex flex-col gap-4">
        {/* Seul l'état de la demande est annoncé à son changement (pas l'échéance relative, qui défile). */}
        <p className="sr-only" role="status">
          {data ? `Analyse : ${info.label}${unavailable ? `. ${AGENT_UNAVAILABLE}` : ""}` : ""}
        </p>
        {body}
        {!legacyUrl && data && !info.active && (
          <Alert tone="info" live="off">
            Aucune adresse de connexion n&apos;est renseignée : l&apos;analyse ne peut pas être demandée. Ajoutez l&apos;adresse de votre logiciel ci-dessous, ou importez vos exports à l&apos;étape Données.
          </Alert>
        )}
        {paused && <Alert tone="info" live="off">Projet en pause : reprenez-le pour demander une analyse.</Alert>}
        <ConnResultCallout result={control.result} onClose={() => control.setResult(null)} />
      </div>
    </Section>
  );
}

export type AnalysisControl = ReturnType<typeof useAnalysisControl>;

/**
 * Actions de l'en-tête de l'étape, une seule principale :
 *  - demande en cours : « Importer mes fichiers » si aucun agent n'est disponible (la demande attend), sinon
 *    « Suivre l'exploration » ; l'annulation est dans le bloc « Analyse de votre logiciel » ;
 *  - projet déjà plus loin (`next` : données reçues, logiciel livré…) : la suite du parcours, et
 *    « Analyser / Relancer l'analyse » en secondaire ;
 *  - sinon « Analyser mon logiciel » (ou « Relancer l'analyse »).
 */
export function ConnAnalysisAction({
  analysis,
  control,
  legacyUrl,
  paused,
  importHref,
  discoveryHref,
  next,
}: {
  analysis: AnalysisHandle;
  control: AnalysisControl;
  legacyUrl: string | null;
  paused: boolean;
  importHref: string;
  discoveryHref: string;
  next?: { href: string; label: string } | null;
}) {
  const { data } = analysis;
  if (!data) return null;
  const mission = data.mission;
  const info = missionInfo(mission?.status);
  const nextButton = next ? (
    <Button href={next.href} variant="primary" iconEnd={<ArrowRight size={16} />}>
      {next.label}
    </Button>
  ) : null;
  if (info.active)
    return (
      nextButton ??
      (data.executor_available ? (
        <Button href={discoveryHref} variant="primary" iconEnd={<ArrowRight size={16} />}>
          Suivre l&apos;exploration
        </Button>
      ) : (
        <Button href={importHref} variant="primary" icon={<Upload size={16} />}>
          Importer mes fichiers
        </Button>
      ))
    );
  const blocked = !legacyUrl ? "Renseignez d'abord l'adresse de votre logiciel" : paused ? "Projet en pause" : undefined;
  const analyse = (
    <Button variant={nextButton ? "secondary" : "primary"} icon={mission ? <RotateCcw size={16} /> : <Radar size={16} />} onClick={control.start} loading={control.busy === "start"} loadingText="Demande en cours…" disabled={!!blocked} title={blocked}>
      {mission ? "Relancer l'analyse" : "Analyser mon logiciel"}
    </Button>
  );
  return nextButton ? (
    <>
      {nextButton}
      {analyse}
    </>
  ) : (
    analyse
  );
}
