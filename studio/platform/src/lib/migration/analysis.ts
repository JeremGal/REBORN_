import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ApiError } from "../errors";
import { addEvent, completeInvestigation, createInvestigation, getState, type NewEvent } from "../store";
import { eventProject } from "../visibility";
import type { AgentEvent } from "../types";
import { getAuthDb } from "../auth/auth";
import { outsideTransaction } from "../auth/db";
import { listConsents, recordConsent } from "../auth/consents";
import { AUTHORIZATION_DECLARATION } from "../legal";
import { displayName, type Principal, type ServicePrincipal, type UserPrincipal } from "../auth/principal";
import { clockNow, credentialStatus, issueRedeemToken, registerCopyScrubber, releaseCredentials, revokeRedeemTokens, sweepCredentials, type SweepReport } from "./credentials";
import { redactFreeText, secretContext } from "./redact";
import { requiredNetwork } from "./egress";
import { loadProject, ownerOf, projectSummary, setStatus, updateProject, type MigrationProject, type ProjectStatus } from "./project";
import {
  CONNECTION_MISSION_CONTRACT_VERSION,
  CREDENTIAL_HANDLING,
  legacyUrlProblem,
  type ConnectionMission,
  type MissionStatus,
  type ConnectionReportSchema,
  type ExecutorHeartbeatSchema,
  type MissionCompleteSchema,
} from "./project-contracts";
import type { z } from "zod";

/**
 * « ANALYSER MON LOGICIEL » (SPEC §6, conception de référence r7.md §6) : file des missions d'analyse,
 * prise en charge par l'exécuteur de l'agent (Mouss), prêt renouvelé par battement de cœur, fin de mission.
 *
 * - Tables dans auth.db, par la connexion PARTAGÉE de lib/auth (jamais une seconde connexion) ;
 *   toute écriture passe par outsideTransaction() (transactions de Better Auth).
 * - Une seule mission active par projet (index unique partiel). Prise ATOMIQUE (BEGIN IMMEDIATE,
 *   UPDATE … WHERE status='queued' RETURNING) : deux exécuteurs, une seule prise.
 * - Prêt de 120 s renouvelé par le battement ; prêt expiré → jeton révoqué, mission remise en file ;
 *   3 prises au plus → « failed ». Jamais de « completed » implicite : seul l'exécuteur titulaire le déclare.
 * - Mission expirée au plus tôt à l'échéance des identifiants (et au plus tard 24 h après la demande).
 * - Disponibilité de l'agent : un exécuteur dont le dernier battement date de moins de 60 s, qui joint
 *   le réseau requis (« private » pour bouclage, réseau local, .local…), comprend connection_mission 1.x
 *   et, si la mission comporte des identifiants, sait les saisir hors du modèle (coffre H ou CDP).
 * - Sans exécuteur disponible : message exact « Agent d'analyse non disponible pour le moment. »,
 *   la demande reste en file. Rien n'est jamais simulé.
 *
 * Identité d'un exécuteur : jeton de service explorer (la frontière de sécurité) + nom d'instance
 * déclaré dans l'en-tête X-Reborn-Executor (plusieurs exécuteurs peuvent partager un jeton) ; le jeton
 * de remise est lié à cette identité et à la mission.
 */

export const AGENT_UNAVAILABLE_MESSAGE = "Agent d'analyse non disponible pour le moment.";
export const LEASE_MS = 120_000;
export const HEARTBEAT_FRESH_MS = 60_000;
export const RENEW_WITHIN_S = 20;
export const MAX_ATTEMPTS = 3;
export const MISSION_TTL_MS = 24 * 3600_000;
export const MISSION_MAX_DURATION_S = 3600;
export const EXECUTOR_HEADER = "x-reborn-executor";

const ACTIVE_SQL = "('queued','claimed','connecting','connected','exploring','needs_human')";
const LEASED_SQL = "('claimed','connecting','connected','exploring')";
const LEASED: ReadonlySet<MissionStatus> = new Set(["claimed", "connecting", "connected", "exploring"]);

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS analysis_missions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    requested_by_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    consent_id TEXT,
    authorization_version TEXT,
    consent_accepted_at TEXT,
    privacy_version TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued','claimed','connecting','connected','exploring','needs_human','completed','failed','cancelled','expired')),
    requires_network TEXT NOT NULL CHECK (requires_network IN ('public','private')),
    with_credentials INTEGER NOT NULL,
    target_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    executor_id TEXT,
    claimed_at TEXT,
    lease_expires_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    investigation_id TEXT,
    outcome_detail TEXT,
    disposal_json TEXT,
    ended_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS analysis_missions_one_active ON analysis_missions (project_id) WHERE status IN ${ACTIVE_SQL};
  CREATE INDEX IF NOT EXISTS analysis_missions_queue ON analysis_missions (status, requested_at);
  CREATE TABLE IF NOT EXISTS executors (
    id TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    instance TEXT NOT NULL,
    label TEXT,
    version TEXT NOT NULL,
    networks TEXT NOT NULL,
    login TEXT NOT NULL,
    max_concurrent INTEGER NOT NULL,
    active_json TEXT NOT NULL DEFAULT '[]',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    disabled_at TEXT
  );
`;

export interface MissionRow {
  id: string;
  project_id: string;
  requested_by_id: string;
  requested_by: string;
  consent_id: string | null;
  authorization_version: string | null;
  consent_accepted_at: string | null;
  privacy_version: string | null;
  status: MissionStatus;
  requires_network: "public" | "private";
  with_credentials: number;
  target_sha256: string;
  created_at: string;
  requested_at: string;
  expires_at: string;
  executor_id: string | null;
  claimed_at: string | null;
  lease_expires_at: string | null;
  attempts: number;
  investigation_id: string | null;
  outcome_detail: string | null;
  disposal_json: string | null;
  ended_at: string | null;
  updated_at: string;
}

interface ExecutorRow {
  id: string;
  token_id: string;
  instance: string;
  label: string | null;
  version: string;
  networks: string;
  login: "h_vault" | "cdp" | "none";
  max_concurrent: number;
  last_seen_at: string;
  disabled_at: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const row = <T,>(r: unknown): T | null => (r ? ({ ...(r as object) } as T) : null);
const rows = <T,>(list: unknown[]): T[] => list.map((r) => ({ ...(r as object) }) as T);

/* ------------------------------------------------------------------ */
/* Base (connexion partagée de lib/auth)                                */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __rebornAnalysisDbs?: WeakSet<DatabaseSync>; __rebornSweeper?: NodeJS.Timeout; __rebornLastSweep?: number; __rebornSweeping?: Promise<unknown> | null };

async function missionsDb(): Promise<DatabaseSync> {
  const db = await getAuthDb();
  const ready = (g.__rebornAnalysisDbs ??= new WeakSet());
  if (!ready.has(db)) {
    await outsideTransaction(db, () => db.exec(SCHEMA));
    ready.add(db);
  }
  return db;
}

/** Écriture synchrone hors transaction de Better Auth, verrou d'écriture pris d'emblée (BEGIN IMMEDIATE). */
function atomically<T>(db: DatabaseSync, fn: () => T): Promise<T> {
  return outsideTransaction(db, () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw e;
    }
  });
}

/**
 * Effacement des identifiants d'un projet (credentials.ts) : toute copie restée dans le détail de ses missions
 * (rapport ou fin enregistrés avant un masquage plus complet) est masquée tant que les valeurs sont connues.
 */
registerCopyScrubber("analysis_missions", async (projectId, redact) => {
  const db = await missionsDb();
  const list = rows<{ id: string; outcome_detail: string }>(db.prepare("SELECT id, outcome_detail FROM analysis_missions WHERE project_id = ? AND outcome_detail IS NOT NULL").all(projectId));
  const changed = list.map((r) => ({ id: r.id, detail: redact(r.outcome_detail) })).filter((x, k) => x.detail !== list[k].outcome_detail);
  if (!changed.length) return;
  await atomically(db, () => {
    for (const c of changed) db.prepare("UPDATE analysis_missions SET outcome_detail = ? WHERE id = ?").run(c.detail, c.id);
  });
});

/* ------------------------------------------------------------------ */
/* Évènements (sans aucune valeur secrète)                              */
/* ------------------------------------------------------------------ */

/** Évènement du journal d'un projet (project_id fixé par le serveur), sans aucune valeur secrète. */
export function projectEvent(projectId: string, title: string, detail?: string, source: NewEvent["source"] = "platform", data: Record<string, unknown> = {}) {
  try {
    addEvent({ source, type: "migration", title, detail, project_id: projectId, data: { ...data, project_id: projectId } } as NewEvent);
  } catch (e) {
    console.error("[reborn] analyse : évènement non enregistré :", (e as Error).message);
  }
}

function closeInvestigation(id: string | null, status: "completed" | "failed") {
  if (!id) return;
  try {
    completeInvestigation(id, status);
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Exécuteur                                                            */
/* ------------------------------------------------------------------ */

export interface ExecutorIdentity {
  id: string;
  tokenId: string;
  instance: string;
}

/** Identité de l'exécuteur : jeton de service explorer (ou « all ») + instance déclarée (X-Reborn-Executor). */
export function executorIdentity(p: Principal, req: Request): ExecutorIdentity {
  if (p.kind !== "service" || (p.service !== "explorer" && p.service !== "all")) throw new ApiError(403, "Réservé à l'exécuteur de l'agent (jeton de service explorer)");
  const instance = req.headers.get(EXECUTOR_HEADER)?.trim() || "default";
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(instance)) throw new ApiError(400, "En-tête X-Reborn-Executor invalide : 1 à 64 caractères (lettres, chiffres, . _ : -)");
  return { id: `EXE_${sha(`${p.tokenId}|${instance}`).slice(0, 12)}`, tokenId: p.tokenId, instance };
}

const parseNetworks = (s: string): string[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const compatible = (e: ExecutorRow, network: "public" | "private", withCredentials: boolean) =>
  !e.disabled_at && /^1\.\d+$/.test(e.version) && parseNetworks(e.networks).includes(network) && (!withCredentials || e.login !== "none");

/** Un exécuteur compatible a-t-il donné signe de vie il y a moins de 60 s ? */
export async function agentAvailable(network: "public" | "private", withCredentials: boolean): Promise<boolean> {
  const db = await missionsDb();
  const list = rows<ExecutorRow>(db.prepare("SELECT * FROM executors WHERE last_seen_at > ? AND disabled_at IS NULL").all(iso(clockNow() - HEARTBEAT_FRESH_MS)));
  return list.some((e) => compatible(e, network, withCredentials));
}

export type ExecutorHeartbeat = z.output<typeof ExecutorHeartbeatSchema>;

/** Battement de cœur : enregistre l'exécuteur et renouvelle le prêt (120 s) des missions qu'il déclare en cours. */
export async function heartbeat(ex: ExecutorIdentity, body: ExecutorHeartbeat) {
  const db = await missionsDb();
  const now = clockNow();
  const nowIso = iso(now);
  const leases = await atomically(db, () => {
    db.prepare(
      `INSERT INTO executors (id, token_id, instance, label, version, networks, login, max_concurrent, active_json, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, version = excluded.version, networks = excluded.networks, login = excluded.login,
         max_concurrent = excluded.max_concurrent, active_json = excluded.active_json, last_seen_at = excluded.last_seen_at`,
    ).run(ex.id, ex.tokenId, ex.instance, body.label ?? null, body.version, JSON.stringify([...new Set(body.networks)]), body.login, body.max_concurrent, JSON.stringify(body.active_missions), nowIso, nowIso);
    const renewed: { mission_id: string; lease_expires_at: string }[] = [];
    const renew = db.prepare(`UPDATE analysis_missions SET lease_expires_at = ?, updated_at = ? WHERE id = ? AND executor_id = ? AND status IN ${LEASED_SQL} AND lease_expires_at > ? RETURNING id, lease_expires_at`);
    for (const id of new Set(body.active_missions)) {
      const r = row<{ id: string; lease_expires_at: string }>(renew.get(iso(now + LEASE_MS), nowIso, id, ex.id, nowIso));
      if (r) renewed.push({ mission_id: r.id, lease_expires_at: r.lease_expires_at });
    }
    return renewed;
  });
  await sweepMissions(now);
  return { ok: true as const, server_time: nowIso, renew_within_s: RENEW_WITHIN_S, executor_id: ex.id, lease_s: LEASE_MS / 1000, leases };
}

/**
 * Compatibilité 1.0 (take_mission sans battement) : un exécuteur sans signe de vie récent est enregistré
 * avec les capacités du contrat 1.0 (identifiants saisis hors du modèle, réseaux non déclarés : les deux).
 * Un exécuteur 1.1 qui envoie ses battements garde les capacités qu'il a déclarées.
 */
export async function ensureExecutor(ex: ExecutorIdentity): Promise<void> {
  const db = await missionsDb();
  const e = row<{ last_seen_at: string }>(db.prepare("SELECT last_seen_at FROM executors WHERE id = ?").get(ex.id));
  if (e && e.last_seen_at > iso(clockNow() - HEARTBEAT_FRESH_MS)) return;
  await heartbeat(ex, { version: "1.0", networks: ["public", "private"], login: "cdp", max_concurrent: 1, active_missions: [], label: "compatibilité 1.0 (take_mission)" });
}

/* ------------------------------------------------------------------ */
/* Balayage des missions                                                */
/* ------------------------------------------------------------------ */

/** Missions échues → « expired » ; prêts expirés → jeton révoqué, remise en file, ou « failed » après 3 prises. */
export async function sweepMissions(now: number = clockNow()): Promise<{ expired: number; requeued: number; failed: number }> {
  const db = await missionsDb();
  const nowIso = iso(now);
  const out = await atomically(db, () => {
    const expired = rows<MissionRow>(
      db.prepare(`UPDATE analysis_missions SET status = 'expired', ended_at = ?, lease_expires_at = NULL, updated_at = ?, outcome_detail = COALESCE(outcome_detail, ?) WHERE status IN ${ACTIVE_SQL} AND expires_at <= ? RETURNING *`).all(nowIso, nowIso, "Échéance de la mission atteinte", nowIso),
    );
    const stale = rows<MissionRow>(db.prepare(`SELECT * FROM analysis_missions WHERE status IN ${LEASED_SQL} AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`).all(nowIso));
    const requeued: MissionRow[] = [];
    const failed: MissionRow[] = [];
    for (const r of stale) {
      if (r.attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE analysis_missions SET status = 'failed', ended_at = ?, lease_expires_at = NULL, updated_at = ?, outcome_detail = ? WHERE id = ?").run(nowIso, nowIso, `Prise en charge interrompue ${r.attempts} fois sans aboutir (prêt expiré)`, r.id);
        failed.push(r);
      } else {
        db.prepare("UPDATE analysis_missions SET status = 'queued', executor_id = NULL, claimed_at = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?").run(nowIso, r.id);
        requeued.push(r);
      }
    }
    return { expired, requeued, failed };
  });
  for (const r of out.expired) {
    revokeRedeemTokens(r.project_id, "mission expirée", { mission_id: r.id });
    closeInvestigation(r.investigation_id, "failed");
    projectEvent(r.project_id, "Analyse expirée : la demande n'a pas été menée à son terme avant son échéance", "Relancez l'analyse si besoin (de nouveaux identifiants peuvent être nécessaires).", "platform", { mission_id: r.id });
  }
  for (const r of out.requeued) {
    revokeRedeemTokens(r.project_id, "prise en charge expirée", { mission_id: r.id });
    projectEvent(r.project_id, "Prise en charge de l'analyse interrompue : demande remise en file d'attente", "L'agent n'a plus donné signe de vie ; son jeton de remise est révoqué.", "platform", { mission_id: r.id, step: "requeued" });
  }
  for (const r of out.failed) {
    revokeRedeemTokens(r.project_id, "mission en échec", { mission_id: r.id });
    closeInvestigation(r.investigation_id, "failed");
    projectEvent(r.project_id, "Analyse en échec : l'agent n'a pas pu la mener à son terme", `Prise en charge interrompue ${r.attempts} fois. Relancez l'analyse quand l'agent sera disponible.`, "platform", { mission_id: r.id });
  }
  return { expired: out.expired.length, requeued: out.requeued.length, failed: out.failed.length };
}

/** Balayage complet : identifiants, jetons, clés orphelines, missions. */
export async function sweepAll(now: number = clockNow()): Promise<SweepReport & { missions: { expired: number; requeued: number; failed: number } }> {
  const c = sweepCredentials(now);
  const m = await sweepMissions(now);
  return { ...c, missions: m };
}

/** Au plus une fois par minute depuis les routes (le démarrage et la minuterie : instrumentation.ts). */
export async function sweepIfDue(): Promise<void> {
  const now = clockNow();
  const last = g.__rebornLastSweep;
  if (last !== undefined && now >= last && now - last < 60_000) return;
  g.__rebornLastSweep = now;
  try {
    await sweepAll(now);
  } catch (e) {
    console.error("[reborn] balayage :", (e as Error).message);
  }
}

/** Minuterie de balayage : au démarrage puis toutes les 60 s, une seule par processus (garde globalThis). */
export function startSweeper(everyMs = 60_000) {
  if (g.__rebornSweeper) return;
  const tick = () => {
    if (g.__rebornSweeping) return;
    g.__rebornSweeping = sweepAll()
      .then(() => {
        g.__rebornLastSweep = clockNow();
      })
      .catch((e) => console.error("[reborn] balayage :", (e as Error).message))
      .finally(() => {
        g.__rebornSweeping = null;
      });
  };
  setTimeout(tick, 0).unref?.();
  g.__rebornSweeper = setInterval(tick, everyMs);
  g.__rebornSweeper.unref?.();
}

/* ------------------------------------------------------------------ */
/* Mission (contrat connection_mission 1.1)                             */
/* ------------------------------------------------------------------ */

const OBJECTIVES = [
  "Se connecter à l'ancien logiciel avec le compte fourni et rapporter l'état de connexion",
  "Explorer les modules, écrans, menus, formulaires et fonctions accessibles à ce compte",
  "Repérer les mécanismes d'export autorisés (exports CSV/Excel, API, impression) et les données accessibles",
  "Déposer les exports obtenus et rapporter les observations avec leurs preuves (captures)",
];
const CONSTRAINTS = [
  "Ne jamais contourner une permission, un contrôle d'accès ou une limite du compte fourni",
  "Ne jamais modifier ni supprimer de données dans l'ancien logiciel",
  "Ne jamais transmettre les identifiants à un modèle de langage : seul le code technique de l'exécuteur les utilise",
  "Signaler toute double authentification ou intervention nécessaire au lieu de la contourner",
];

function reportEndpoints(projectId: string, missionId: string | null, investigationId: string | null) {
  const q = `?project=${projectId}`;
  const mid = missionId ?? "MIS_…";
  return {
    connection_status: { method: "POST", url: `/api/projects/${projectId}/connection`, body: `{ "status": "pending|connected|failed|mfa_required|human_needed", "detail": "…", "mission_id": "${mid}" }` },
    investigation: investigationId
      ? { method: "POST", url: "/api/investigations", body: `déjà créée par le Studio : investigation_id ${investigationId} (ne pas en créer une autre)` }
      : { method: "POST", url: "/api/investigations", body: `{ "application": "…", "module": "…", "mode": "live", "project_id": "${projectId}" }` },
    events: { method: "POST", url: `/api/events${q}` },
    screens: { method: "POST", url: `/api/schema${q}` },
    observations: { method: "POST", url: `/api/observations${q}` },
    exports: { method: "POST", url: `/api/migration/sources${q}`, body: '{ "name": "clients.csv", "content_base64": "…", "mechanism": "export CSV" }' },
    heartbeat: { method: "POST", url: "/api/executor/heartbeat", body: `{ "version": "${CONNECTION_MISSION_CONTRACT_VERSION}", "networks": ["public"|"private"], "login": "h_vault|cdp|none", "max_concurrent": 1, "active_missions": ["${mid}"] } — au moins toutes les ${RENEW_WITHIN_S} s` },
    complete: { method: "POST", url: `/api/executor/missions/${mid}/complete`, body: '{ "outcome": "completed|failed", "detail": "…", "disposal": { "h_vault_item_deleted": true, "local_artifacts_purged": true } }' },
  };
}

function buildMission(r: MissionRow, p: MigrationProject, token?: { token: string; expires_at: string } | null): ConnectionMission {
  const cred = r.with_credentials ? credentialStatus(p.id) : { stored: false as const };
  const remaining = Math.floor((Date.parse(r.expires_at) - clockNow()) / 1000);
  return {
    contract: "connection_mission",
    contract_version: CONNECTION_MISSION_CONTRACT_VERSION,
    mission_id: r.id,
    project_id: p.id,
    status: r.status,
    created_at: r.created_at,
    expires_at: r.expires_at,
    requires_network: r.requires_network,
    investigation_id: r.investigation_id,
    executor: r.executor_id ? { id: r.executor_id, lease_expires_at: r.lease_expires_at } : null,
    target: { url: p.legacy_url ?? null, software: p.source_system ?? null, software_type: p.software_type ?? null, company: p.company ?? p.name },
    authorization: p.authorization ?? null,
    consent: { privacy_notice_version: r.privacy_version, authorization_version: r.authorization_version, accepted_at: r.consent_accepted_at },
    objectives: [...OBJECTIVES],
    constraints: [...CONSTRAINTS],
    credential:
      cred.stored && cred.expires_at
        ? {
            username_hint: cred.username_hint ?? "",
            // Sens 1.0 conservé (déprécié) : échéance du jeton s'il est présent, sinon des identifiants.
            expires_at: token?.expires_at ?? cred.expires_at,
            credentials_expires_at: cred.expires_at,
            handling: CREDENTIAL_HANDLING,
            ...(token ? { redeem_url: `/api/projects/${p.id}/credentials/redeem`, token: token.token, token_expires_at: token.expires_at } : {}),
          }
        : null,
    limits: { read_only: true, login_screenshots: false, max_duration_s: Math.max(1, Math.min(MISSION_MAX_DURATION_S, remaining)) },
    report: reportEndpoints(p.id, r.id, r.investigation_id),
  };
}

/** Aperçu (GET …/mission) : la mission en cours ou la dernière, SANS jeton ; sinon ce qu'elle contiendrait. */
export async function missionPreview(projectId: string): Promise<Record<string, unknown>> {
  const p = loadProject(projectId);
  if (!p) throw new ApiError(404, "Projet introuvable");
  const r = await latestMission(projectId);
  if (r) return buildMission(r, p, null);
  const cred = credentialStatus(projectId);
  return {
    contract: "connection_mission",
    contract_version: CONNECTION_MISSION_CONTRACT_VERSION,
    mission_id: null,
    project_id: projectId,
    status: null,
    target: { url: p.legacy_url ?? null, software: p.source_system ?? null, software_type: p.software_type ?? null, company: p.company ?? p.name },
    authorization: p.authorization ?? null,
    objectives: [...OBJECTIVES],
    constraints: [...CONSTRAINTS],
    credential: cred.stored && cred.expires_at ? { username_hint: cred.username_hint ?? "", expires_at: cred.expires_at, credentials_expires_at: cred.expires_at, handling: CREDENTIAL_HANDLING } : null,
    limits: { read_only: true, login_screenshots: false, max_duration_s: MISSION_MAX_DURATION_S },
    report: reportEndpoints(projectId, null, null),
    note: "Aperçu : aucune analyse demandée pour ce projet. La mission est créée par « Analyser mon logiciel », puis prise par l'exécuteur.",
  };
}

/* ------------------------------------------------------------------ */
/* Demande d'analyse (propriétaire)                                     */
/* ------------------------------------------------------------------ */

export interface MissionSummary {
  id: string;
  status: MissionStatus;
  created_at: string;
  expires_at: string;
  requested_at: string;
  requested_by: string;
  requires_network: "public" | "private";
  with_credentials: boolean;
  attempts: number;
  claimed_at: string | null;
  ended_at: string | null;
  outcome_detail: string | null;
}

export interface AnalysisView {
  ok: true;
  state: MissionStatus | null;
  agent_available: boolean;
  executor_available: boolean;
  message?: string;
  requested_at: string | null;
  requested_by: string | null;
  mission: MissionSummary | null;
  /** Avancement réel de la mission (évènements reçus), dès sa première prise par un exécuteur ; null avant. */
  progress: MissionProgress | null;
}

/* ------------------------------------------------------------------ */
/* Avancement réel d'une mission (évènements reçus, jamais estimé)      */
/* ------------------------------------------------------------------ */

export type ProgressStepId = "claimed" | "connection" | "screens" | "export" | "end";
/**
 * done : constaté · current : en cours (rapport « en attente » reçu) · failed : échec rapporté · attention : à
 * vérifier (intervention, prise interrompue) · waiting : rien reçu pour l'instant · none : rien reçu, mission close.
 */
export type ProgressState = "done" | "current" | "failed" | "attention" | "waiting" | "none";
export interface ProgressStep {
  id: ProgressStepId;
  label: string;
  state: ProgressState;
  /** Date du fait constaté (évènement ou mission), null s'il n'a pas eu lieu. */
  at: string | null;
  detail: string | null;
}
export interface MissionProgress {
  steps: ProgressStep[];
  /** Écrans distincts rapportés par l'agent pour CETTE mission. */
  screens: number;
  /** Exports déposés par l'exécuteur titulaire pendant CETTE mission. */
  exports: number;
  /** Dernier rapport reçu de l'agent pour cette mission. */
  last_report_at: string | null;
}

const dataOf = (e: AgentEvent): Record<string, unknown> => (e.data && typeof e.data === "object" ? (e.data as Record<string, unknown>) : {});
const CLAIM_TITLE = "Analyse prise en charge par l'agent d'analyse";
const CONNECTION_TITLE = "Connexion à l'ancien logiciel : ";
const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const list6 = (names: string[]) => `${names.slice(0, 6).join(" · ")}${names.length > 6 ? ` · et ${names.length - 6} autre(s)` : ""}`;

/**
 * Évènements d'une mission : ceux qui la citent (data.mission_id, posé par le Studio et par l'exécuteur) dans SON
 * projet, et ceux de l'investigation ouverte pour elle par le Studio à la prise.
 */
function missionEvents(r: MissionRow): AgentEvent[] {
  const s = getState();
  return s.events.filter((e) => {
    if (dataOf(e).mission_id === r.id) return eventProject(s, e) === r.project_id;
    return !!r.investigation_id && e.investigation_id === r.investigation_id;
  });
}

/**
 * Déroulé réel d'une mission (prise, connexion, écrans découverts, export récupéré, fin), uniquement à partir de ce que
 * le Studio a reçu ou enregistré : null tant qu'aucun exécuteur ne l'a prise. Une étape sans fait reçu est « waiting »
 * (mission en cours) ou « none » (mission close), jamais présentée comme faite.
 */
export function missionProgress(r: MissionRow): MissionProgress | null {
  const events = missionEvents(r);
  const claims = events.filter((e) => dataOf(e).step === "claimed" || e.title === CLAIM_TITLE);
  if (!claims.length && !r.claimed_at && r.attempts === 0) return null;
  const active = r.status === "queued" || LEASED.has(r.status) || r.status === "needs_human";
  const agent = events.filter((e) => e.source === "explorer");
  const steps: ProgressStep[] = [];

  // 1. Prise en charge (une prise interrompue remet la demande en file : signalé, jamais caché)
  const requeued = r.status === "queued";
  steps.push({
    id: "claimed",
    label: requeued ? "Prise en charge interrompue" : "Prise en charge par l'agent d'analyse",
    state: requeued ? "attention" : "done",
    at: claims.at(-1)?.ts ?? r.claimed_at ?? null,
    detail: requeued
      ? r.attempts > 0
        ? `Demande remise en file d'attente (prise ${r.attempts} sur ${MAX_ATTEMPTS})`
        : "Demande relancée : en attente d'une nouvelle prise en charge"
      : r.attempts > 1
        ? `Prise ${r.attempts} sur ${MAX_ATTEMPTS}`
        : null,
  });

  // 2. Connexion : dernier rapport de connexion de la mission
  const conn = events.filter((e) => dataOf(e).step === "connection" || (e.source === "explorer" && e.title.startsWith(CONNECTION_TITLE))).at(-1);
  const byLabel = Object.fromEntries(Object.entries(CONNECTION_LABEL).map(([k, v]) => [`${CONNECTION_TITLE}${v}`, k]));
  const cs = conn ? String(dataOf(conn).status ?? byLabel[conn.title] ?? "") : "";
  const CONN: Record<string, { label: string; state: ProgressState }> = {
    connected: { label: "Connexion à votre logiciel réussie", state: "done" },
    pending: { label: "Connexion à votre logiciel en cours", state: "current" },
    failed: { label: "Connexion à votre logiciel échouée", state: "failed" },
    mfa_required: { label: "Double authentification demandée", state: "attention" },
    human_needed: { label: "Intervention humaine nécessaire", state: "attention" },
  };
  steps.push(
    conn && CONN[cs]
      ? { id: "connection", ...CONN[cs], at: conn.ts, detail: conn.detail ?? null }
      : { id: "connection", label: "Connexion à votre logiciel", state: active ? "waiting" : "none", at: null, detail: active ? "Aucun rapport de connexion reçu pour l'instant" : "Aucun rapport de connexion reçu" },
  );

  // 3. Écrans découverts : pages distinctes rapportées (data.page), sinon le nombre annoncé par la carte (data.pages)
  const pages = new Map<string, string>();
  let announced = 0;
  let announcedAt: string | null = null;
  for (const e of agent) {
    const d = dataOf(e);
    if (typeof d.page === "string" && d.page.trim()) pages.set(d.page.trim().slice(0, 120), e.ts);
    else if (typeof d.pages === "number" && Number.isInteger(d.pages) && d.pages > announced) {
      announced = d.pages;
      announcedAt = e.ts;
    }
  }
  const screens = pages.size || announced;
  const screensAt = pages.size ? [...pages.values()].sort().at(-1)! : announcedAt;
  steps.push(
    screens
      ? { id: "screens", label: count(screens, "écran découvert", "écrans découverts"), state: "done", at: screensAt, detail: pages.size ? list6([...pages.keys()]) : null }
      : { id: "screens", label: "Écrans découverts", state: active ? "waiting" : "none", at: null, detail: active ? "Aucun écran rapporté pour l'instant" : "Aucun écran rapporté" },
  );

  // 4. Export récupéré : dépôts de l'exécuteur titulaire inscrits par le Studio (recordAgentExport)
  const deposits = new Map<string, { name: string; at: string; rows: number | null }>();
  for (const e of events) {
    const d = dataOf(e);
    if (d.step !== "export") continue;
    const key = String(d.source_id ?? e.id);
    deposits.set(key, { name: String(d.source_name ?? "export"), at: e.ts, rows: typeof d.rows === "number" ? d.rows : null });
  }
  const exp = [...deposits.values()];
  steps.push(
    exp.length
      ? {
          id: "export",
          label: count(exp.length, "export récupéré par l'agent", "exports récupérés par l'agent"),
          state: "done",
          at: exp.map((x) => x.at).sort().at(-1)!,
          detail: list6(exp.map((x) => (x.rows !== null ? `${x.name} (${x.rows} ligne${x.rows > 1 ? "s" : ""})` : x.name))),
        }
      : { id: "export", label: "Export des données", state: active ? "waiting" : "none", at: null, detail: active ? "Aucun export déposé pour l'instant" : "Aucun export déposé par l'agent : vous pouvez importer vos exports à l'étape Données" },
  );

  // 5. Fin : déclarée par l'exécuteur (ou constatée par le Studio : annulation, échéance), jamais supposée
  const END: Partial<Record<MissionStatus, { label: string; state: ProgressState }>> = {
    completed: { label: "Analyse terminée", state: "done" },
    failed: { label: "Analyse en échec", state: "failed" },
    cancelled: { label: "Analyse annulée", state: "none" },
    expired: { label: "Analyse expirée", state: "none" },
    needs_human: { label: "En attente de votre intervention", state: "attention" },
  };
  const end = END[r.status];
  steps.push(end ? { id: "end", ...end, at: r.status === "needs_human" ? null : r.ended_at, detail: r.outcome_detail } : { id: "end", label: "Fin de l'analyse", state: "waiting", at: null, detail: "Déclarée par l'agent lui-même à la fin de sa mission" });

  return { steps, screens, exports: exp.length, last_report_at: agent.at(-1)?.ts ?? null };
}

/**
 * Dépôt d'un export par l'exécuteur titulaire (POST /api/migration/sources) : inscrit à l'avancement de SA mission
 * (nom du fichier et volumes seulement, jamais de contenu). Ne lève jamais : le dépôt est déjà enregistré.
 */
export async function recordAgentExport(projectId: string, meta: { id: string; name: string; tables: { rows: number }[]; archive_entries?: number }) {
  let missionId: string | null = null;
  try {
    missionId = (await activeMission(projectId))?.id ?? null;
  } catch {}
  const rows = meta.tables.reduce((n, t) => n + t.rows, 0);
  projectEvent(
    projectId,
    `Export déposé par l'agent d'analyse : ${meta.name}`,
    meta.archive_entries !== undefined ? count(meta.archive_entries, "fichier", "fichiers") : `${count(meta.tables.length, "table", "tables")} · ${count(rows, "ligne", "lignes")}`,
    "explorer",
    { ...(missionId ? { mission_id: missionId } : {}), step: "export", source_id: meta.id, source_name: meta.name, rows },
  );
}

/* ------------------------------------------------------------------ */
/* Vue d'ensemble de l'équipe (métadonnées seulement)                   */
/* ------------------------------------------------------------------ */

export interface ExecutorOverview {
  id: string;
  /** Nom d'instance déclaré (X-Reborn-Executor) et libellé facultatif du battement. */
  name: string;
  label: string | null;
  version: string;
  networks: string[];
  login: "h_vault" | "cdp" | "none";
  max_concurrent: number;
  first_seen_at: string;
  last_seen_at: string;
  /** Battement de moins de 60 s et exécuteur non désactivé. */
  online: boolean;
  disabled: boolean;
}

/** Exécuteurs connus (le plus récent d'abord) : aucune empreinte de jeton, aucun identifiant confié. */
export async function listExecutors(limit = 100): Promise<ExecutorOverview[]> {
  const db = await missionsDb();
  const fresh = iso(clockNow() - HEARTBEAT_FRESH_MS);
  return rows<ExecutorRow & { first_seen_at: string }>(db.prepare("SELECT * FROM executors ORDER BY last_seen_at DESC LIMIT ?").all(limit)).map((e) => ({
    id: e.id,
    name: e.instance,
    label: e.label,
    version: e.version,
    networks: parseNetworks(e.networks),
    login: e.login,
    max_concurrent: e.max_concurrent,
    first_seen_at: e.first_seen_at,
    last_seen_at: e.last_seen_at,
    online: !e.disabled_at && e.last_seen_at > fresh,
    disabled: !!e.disabled_at,
  }));
}

export interface MissionOverview {
  id: string;
  project_id: string;
  status: MissionStatus;
  requires_network: "public" | "private";
  with_credentials: boolean;
  created_at: string;
  requested_at: string;
  claimed_at: string | null;
  ended_at: string | null;
  attempts: number;
  executor_id: string | null;
  updated_at: string;
}

/**
 * Missions (actives d'abord, puis les plus récentes) : états et dates seulement — ni demandeur, ni consentement, ni
 * détail libre de l'agent, ni empreinte de l'adresse, ni jeton.
 */
export async function listMissions(limit = 100): Promise<MissionOverview[]> {
  const db = await missionsDb();
  return rows<MissionRow>(db.prepare(`SELECT * FROM analysis_missions ORDER BY CASE WHEN status IN ${ACTIVE_SQL} THEN 0 ELSE 1 END, updated_at DESC, rowid DESC LIMIT ?`).all(limit)).map((r) => ({
    id: r.id,
    project_id: r.project_id,
    status: r.status,
    requires_network: r.requires_network,
    with_credentials: !!r.with_credentials,
    created_at: r.created_at,
    requested_at: r.requested_at,
    claimed_at: r.claimed_at,
    ended_at: r.ended_at,
    attempts: r.attempts,
    executor_id: r.executor_id,
    updated_at: r.updated_at,
  }));
}

const summaryOf = (r: MissionRow): MissionSummary => ({
  id: r.id,
  status: r.status,
  created_at: r.created_at,
  expires_at: r.expires_at,
  requested_at: r.requested_at,
  requested_by: r.requested_by,
  requires_network: r.requires_network,
  with_credentials: !!r.with_credentials,
  attempts: r.attempts,
  claimed_at: r.claimed_at,
  ended_at: r.ended_at,
  outcome_detail: r.outcome_detail,
});

async function latestMission(projectId: string): Promise<MissionRow | null> {
  const db = await missionsDb();
  return (
    row<MissionRow>(db.prepare(`SELECT * FROM analysis_missions WHERE project_id = ? AND status IN ${ACTIVE_SQL}`).get(projectId)) ??
    row<MissionRow>(db.prepare("SELECT * FROM analysis_missions WHERE project_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(projectId))
  );
}

/** Mission active d'un projet, ou null. */
export async function activeMission(projectId: string): Promise<MissionRow | null> {
  const db = await missionsDb();
  return row<MissionRow>(db.prepare(`SELECT * FROM analysis_missions WHERE project_id = ? AND status IN ${ACTIVE_SQL}`).get(projectId));
}

export async function getMission(missionId: string): Promise<MissionRow | null> {
  const db = await missionsDb();
  return row<MissionRow>(db.prepare("SELECT * FROM analysis_missions WHERE id = ?").get(missionId));
}

/** Fin d'une mission (sans exécuteur) : état terminal, jetons révoqués, investigation close, évènement. */
async function endMission(r: MissionRow, status: "cancelled" | "expired" | "failed", detail: string, title?: string) {
  const db = await missionsDb();
  const nowIso = iso(clockNow());
  const changed = await atomically(db, () => db.prepare(`UPDATE analysis_missions SET status = ?, ended_at = ?, lease_expires_at = NULL, outcome_detail = ?, updated_at = ? WHERE id = ? AND status IN ${ACTIVE_SQL}`).run(status, nowIso, detail, nowIso, r.id).changes);
  if (!changed) return;
  revokeRedeemTokens(r.project_id, detail, { mission_id: r.id });
  closeInvestigation(r.investigation_id, "failed");
  if (title) projectEvent(r.project_id, title, detail, "platform", { mission_id: r.id });
}

const ACTIVE: ReadonlySet<MissionStatus> = new Set(["queued", "claimed", "connecting", "connected", "exploring", "needs_human"]);
/** Motif d'annulation d'une mission dont la cible a changé (réponse 409 explicite à l'exécuteur). */
const URL_CHANGED = "adresse de l'ancien logiciel modifiée depuis la demande";

/** L'adresse de l'ancien logiciel a-t-elle changé depuis la demande ? */
function targetChanged(r: MissionRow): boolean {
  const p = loadProject(r.project_id);
  return !p?.legacy_url || sha(p.legacy_url) !== r.target_sha256;
}

/**
 * Demande qui ne peut plus aboutir, annulée tout de suite : adresse de l'ancien logiciel modifiée depuis la
 * demande (l'agent ne doit jamais poursuivre sur une autre cible), ou identifiants retirés / expirés alors
 * que la demande en file en dépend.
 */
async function settle(r: MissionRow | null): Promise<MissionRow | null> {
  if (!r || !ACTIVE.has(r.status)) return r;
  if (targetChanged(r)) {
    await endMission(r, "cancelled", URL_CHANGED, "Analyse annulée : l'adresse de l'ancien logiciel a changé depuis la demande");
    return getMission(r.id);
  }
  if (r.status === "queued" && r.with_credentials && !credentialStatus(r.project_id).stored) {
    await endMission(r, "cancelled", "identifiants retirés ou expirés", "Analyse annulée : les identifiants confiés ne sont plus disponibles");
    return getMission(r.id);
  }
  return r;
}

async function viewOf(projectId: string, r: MissionRow | null, mode: "post" | "get" | "delete"): Promise<AnalysisView> {
  let available: boolean;
  if (r && (r.status === "queued" || LEASED.has(r.status) || r.status === "needs_human")) available = await agentAvailable(r.requires_network, !!r.with_credentials);
  else {
    const p = loadProject(projectId);
    const net = p?.legacy_url && !legacyUrlProblem(p.legacy_url) ? await requiredNetwork(p.legacy_url, { resolve: false }) : "public";
    available = await agentAvailable(net, credentialStatus(projectId).stored);
  }
  const showMessage = !available && (mode === "post" || (mode === "get" && r?.status === "queued"));
  return {
    ok: true,
    state: r?.status ?? null,
    agent_available: available,
    executor_available: available,
    ...(showMessage ? { message: AGENT_UNAVAILABLE_MESSAGE } : {}),
    requested_at: r?.requested_at ?? null,
    requested_by: r?.requested_by ?? null,
    mission: r ? summaryOf(r) : null,
    progress: r ? missionProgress(r) : null,
  };
}

/** État de la demande d'analyse d'un projet (jamais d'indice d'identifiant). */
export async function analysisState(projectId: string): Promise<AnalysisView> {
  await sweepIfDue();
  const r = await settle(await latestMission(projectId));
  return viewOf(projectId, r, "get");
}

/** Autorisation d'accès à la version courante (consentement enregistré ET déclaration du projet) ; nouvelle confirmation possible. */
async function authorizationFor(p: MigrationProject, who: UserPrincipal, announced: string | undefined) {
  const current = AUTHORIZATION_DECLARATION.version;
  const owner = ownerOf(p.id);
  const account = owner ?? who.userId;
  const find = async () => [...(await listConsents(account, p.id))].reverse().find((c) => c.kind === "source_authorization" && c.version === current);
  let consent = await find();
  let projectOk = p.authorization?.version === current;
  if (!consent || !projectOk) {
    if (announced === undefined) throw new ApiError(409, `Autorisation d'accès requise : confirmez la déclaration d'autorisation (version ${current}) avant de lancer l'analyse.`);
    if (announced !== current) throw new ApiError(409, `La déclaration d'autorisation a changé (version ${current}) : relisez-la et confirmez à nouveau.`);
    const recorded = await recordConsent({ userId: who.userId, projectId: p.id, kind: "source_authorization" });
    updateProject(p.id, (x) => {
      x.authorization = { by: displayName(who), at: recorded.accepted_at, statement: AUTHORIZATION_DECLARATION.text, version: current };
    });
    consent = { ...recorded };
    projectOk = true;
  }
  const privacy = [...(await listConsents(account))].reverse().find((c) => c.kind === "privacy_acknowledgement");
  return { consent_id: consent.id, authorization_version: consent.version, accepted_at: consent.accepted_at, privacy_version: privacy?.version ?? null };
}

/**
 * « Analyser mon logiciel » : autorisation d'accès (version courante), adresse valide, identifiants non
 * expirés ou { without_credentials: true } explicite ; crée ou renouvelle la demande (une seule active).
 */
export async function requestAnalysis(projectId: string, who: UserPrincipal, body: { without_credentials?: boolean; authorization_version?: string }): Promise<{ status: number; view: AnalysisView }> {
  await sweepIfDue();
  const p = loadProject(projectId);
  if (!p) throw new ApiError(404, "Projet introuvable");
  if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant de lancer l'analyse");
  const urlProblem = p.legacy_url ? legacyUrlProblem(p.legacy_url) : "Adresse de l'ancien logiciel manquante";
  if (urlProblem) throw new ApiError(409, `${urlProblem} : indiquez l'adresse de connexion de l'ancien logiciel (http ou https, sans identifiant) dans le projet.`);
  const auth = await authorizationFor(p, who, body.authorization_version);
  const cred = credentialStatus(projectId);
  if (!cred.stored && body.without_credentials !== true) {
    throw new ApiError(409, "Identifiants requis : confiez l'identifiant et le mot de passe du compte à utiliser, ou confirmez explicitement une analyse sans identifiants.");
  }
  const withCredentials = cred.stored && body.without_credentials !== true;
  const network = await requiredNetwork(p.legacy_url!);
  const now = clockNow();
  const nowIso = iso(now);
  const expires = iso(Math.min(now + MISSION_TTL_MS, withCredentials && cred.expires_at ? Date.parse(cred.expires_at) : Infinity));
  const by = displayName(who);
  const target = sha(p.legacy_url!);
  const db = await missionsDb();
  const result = await atomically(db, () => {
    const active = row<MissionRow>(db.prepare(`SELECT * FROM analysis_missions WHERE project_id = ? AND status IN ${ACTIVE_SQL}`).get(projectId));
    const fields = [by, who.userId, auth.consent_id, auth.authorization_version, auth.accepted_at, auth.privacy_version, network, withCredentials ? 1 : 0, target, nowIso, expires, nowIso] as const;
    if (active && LEASED.has(active.status)) return { kind: "busy" as const, id: active.id };
    if (active) {
      // En file : demande renouvelée ; intervention nécessaire : relancée (prises remises à zéro).
      db.prepare(
        `UPDATE analysis_missions SET requested_by = ?, requested_by_id = ?, consent_id = ?, authorization_version = ?, consent_accepted_at = ?, privacy_version = ?, requires_network = ?,
           with_credentials = ?, target_sha256 = ?, requested_at = ?, expires_at = ?, updated_at = ?, status = 'queued', executor_id = NULL, claimed_at = NULL, lease_expires_at = NULL,
           attempts = CASE WHEN status = 'needs_human' THEN 0 ELSE attempts END WHERE id = ?`,
      ).run(...fields, active.id);
      return { kind: active.status === "needs_human" ? ("relaunched" as const) : ("renewed" as const), id: active.id };
    }
    const id = `MIS_${randomBytes(5).toString("hex")}`;
    db.prepare(
      `INSERT INTO analysis_missions (requested_by, requested_by_id, consent_id, authorization_version, consent_accepted_at, privacy_version, requires_network, with_credentials, target_sha256,
         requested_at, expires_at, updated_at, id, project_id, status, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, 0)`,
    ).run(...fields, id, projectId, nowIso);
    return { kind: "created" as const, id };
  });
  if (result.kind === "busy") {
    const r = await getMission(result.id);
    const view = await viewOf(projectId, r, "get");
    throw Object.assign(new ApiError(409, "Une analyse est déjà en cours : l'agent l'a prise en charge."), { issues: [{ path: "mission", message: view.mission?.status ?? "en cours" }] });
  }
  if (result.kind === "relaunched") revokeRedeemTokens(projectId, "analyse relancée", { mission_id: result.id });
  const r = (await getMission(result.id))!;
  const view = await viewOf(projectId, r, "post");
  projectEvent(
    projectId,
    result.kind === "created" ? `Analyse de l'ancien logiciel demandée par ${by}` : result.kind === "renewed" ? `Demande d'analyse renouvelée par ${by}` : `Analyse relancée par ${by} après une intervention`,
    view.agent_available ? "En file d'attente : un agent d'analyse est en ligne et la prendra en charge." : `En file d'attente. ${AGENT_UNAVAILABLE_MESSAGE}`,
    "user",
    { mission_id: r.id },
  );
  return { status: 202, view };
}

/** Annulation par le propriétaire (jetons révoqués ; effacement des identifiants sur demande). */
export async function cancelAnalysis(projectId: string, who: UserPrincipal, opts: { erase_credentials?: boolean } = {}): Promise<AnalysisView & { credentials?: { revoked_at: string; erased: boolean } }> {
  const r = await activeMission(projectId);
  if (r) await endMission(r, "cancelled", `annulée par ${displayName(who)}`, `Analyse annulée par ${displayName(who)}`);
  const credentials = opts.erase_credentials ? releaseCredentials(projectId, "demande du client (annulation de l'analyse)") : undefined;
  const view = await viewOf(projectId, r ? await getMission(r.id) : await latestMission(projectId), "delete");
  return { ...view, ...(credentials ? { credentials } : {}) };
}

/* ------------------------------------------------------------------ */
/* Prise de mission (exécuteur)                                         */
/* ------------------------------------------------------------------ */

async function freshExecutor(ex: ExecutorIdentity): Promise<ExecutorRow> {
  const db = await missionsDb();
  const e = row<ExecutorRow>(db.prepare("SELECT * FROM executors WHERE id = ?").get(ex.id));
  if (!e || !(e.last_seen_at > iso(clockNow() - HEARTBEAT_FRESH_MS))) throw new ApiError(409, `Battement de cœur requis avant toute prise de mission : POST /api/executor/heartbeat (au moins toutes les ${RENEW_WITHIN_S} s)`);
  if (e.disabled_at) throw new ApiError(403, "Exécuteur désactivé par l'équipe REBORN");
  if (!/^1\.\d+$/.test(e.version)) throw new ApiError(409, "Version de contrat non prise en charge : connection_mission 1.x attendue");
  return e;
}

/**
 * Prise atomique de la plus ancienne mission en file compatible (réseau, saisie des identifiants hors du
 * modèle, capacité) ; projectId : compatibilité 1.0 (take_mission d'un projet). Renvoie null s'il n'y a rien.
 */
export async function claimMission(ex: ExecutorIdentity, opts: { projectId?: string } = {}): Promise<ConnectionMission | null> {
  await sweepMissions();
  const e = await freshExecutor(ex);
  const db = await missionsDb();
  const now = clockNow();
  const nowIso = iso(now);
  const networks = parseNetworks(e.networks);
  const cancelled: { r: MissionRow; reason: string }[] = [];
  const claimed = await atomically(db, () => {
    const held = (db.prepare(`SELECT COUNT(*) AS n FROM analysis_missions WHERE executor_id = ? AND status IN ${LEASED_SQL}`).get(ex.id) as { n: number }).n;
    if (held >= e.max_concurrent) return null;
    const candidates = rows<MissionRow>(
      opts.projectId
        ? db.prepare("SELECT * FROM analysis_missions WHERE status = 'queued' AND expires_at > ? AND project_id = ? ORDER BY requested_at, created_at LIMIT 50").all(nowIso, opts.projectId)
        : db.prepare("SELECT * FROM analysis_missions WHERE status = 'queued' AND expires_at > ? ORDER BY requested_at, created_at LIMIT 50").all(nowIso),
    );
    const cancel = (r: MissionRow, reason: string) => {
      if (db.prepare("UPDATE analysis_missions SET status = 'cancelled', ended_at = ?, outcome_detail = ?, updated_at = ? WHERE id = ? AND status = 'queued'").run(nowIso, reason, nowIso, r.id).changes) cancelled.push({ r, reason });
    };
    for (const c of candidates) {
      if (!networks.includes(c.requires_network)) continue;
      if (c.with_credentials && e.login === "none") continue;
      const p = loadProject(c.project_id);
      if (!p) {
        cancel(c, "projet introuvable");
        continue;
      }
      if (p.status === "PAUSED") continue;
      if (!p.legacy_url || sha(p.legacy_url) !== c.target_sha256) {
        cancel(c, "adresse de l'ancien logiciel modifiée depuis la demande");
        continue;
      }
      if (c.with_credentials && !credentialStatus(c.project_id).stored) {
        cancel(c, "identifiants retirés ou expirés");
        continue;
      }
      const got = row<MissionRow>(
        db.prepare("UPDATE analysis_missions SET status = 'claimed', executor_id = ?, claimed_at = ?, lease_expires_at = ?, attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued' RETURNING *").get(ex.id, nowIso, iso(now + LEASE_MS), nowIso, c.id),
      );
      if (got) return got;
    }
    return null;
  });
  for (const { r, reason } of cancelled) {
    revokeRedeemTokens(r.project_id, reason, { mission_id: r.id });
    closeInvestigation(r.investigation_id, "failed");
    projectEvent(r.project_id, "Analyse annulée avant sa prise en charge", `Motif : ${reason}. Relancez l'analyse après correction.`, "platform", { mission_id: r.id });
  }
  if (!claimed) return null;
  const p = loadProject(claimed.project_id)!;
  // Investigation rattachée au projet, créée par le Studio (une prise suivante reprend la même si elle court encore).
  let investigationId = claimed.investigation_id;
  const running = investigationId ? getState().investigations.find((i) => i.id === investigationId && i.status === "running") : undefined;
  if (!running) {
    const inv = createInvestigation({
      application: p.source_system || p.company || p.name,
      module: "Découverte",
      mode: "live",
      kind: "initial",
      project_id: p.id,
      objective: `Mission ${claimed.id} : connexion et exploration de l'ancien logiciel, en lecture seule`,
    });
    investigationId = inv.id;
    await outsideTransaction(db, () => db.prepare("UPDATE analysis_missions SET investigation_id = ?, updated_at = ? WHERE id = ?").run(investigationId, nowIso, claimed.id));
  }
  let token: { token: string; expires_at: string } | null = null;
  if (claimed.with_credentials) {
    try {
      token = issueRedeemToken(p.id, { mission_id: claimed.id, executor_id: ex.id });
    } catch {
      await endMission({ ...claimed, investigation_id: investigationId }, "cancelled", "identifiants retirés ou expirés", "Analyse annulée : les identifiants confiés ne sont plus disponibles");
      return null;
    }
  }
  projectEvent(p.id, "Analyse prise en charge par l'agent d'analyse", `Mission ${claimed.id} · prise ${claimed.attempts}/${MAX_ATTEMPTS}${token ? " · jeton de remise des identifiants à usage unique (15 min)" : " · sans identifiants"}`, "explorer", { mission_id: claimed.id, step: "claimed", attempt: claimed.attempts });
  return buildMission({ ...claimed, investigation_id: investigationId }, p, token);
}

/* ------------------------------------------------------------------ */
/* Titulaire du prêt                                                    */
/* ------------------------------------------------------------------ */

/** Mission en cours du projet tenue par cet exécuteur (prêt valide), sinon 403. */
export async function requireLeaseHolder(projectId: string, ex: ExecutorIdentity, missionId?: string, opts: { allowNeedsHuman?: boolean } = {}): Promise<MissionRow> {
  await sweepMissions();
  const found = await activeMission(projectId);
  // Cible modifiée depuis la demande : la mission est annulée, l'agent doit s'arrêter.
  if (found && found.executor_id === ex.id && targetChanged(found)) {
    await settle(found);
    throw new ApiError(409, "Mission annulée : l'adresse de l'ancien logiciel a changé depuis la demande ; arrêtez-vous (une nouvelle demande du propriétaire sera nécessaire)");
  }
  const r = found;
  const nowIso = iso(clockNow());
  const leased = !!r && LEASED.has(r.status) && !!r.lease_expires_at && r.lease_expires_at > nowIso;
  const waiting = !!r && opts.allowNeedsHuman === true && r.status === "needs_human";
  if (!r || r.executor_id !== ex.id || (missionId !== undefined && missionId !== r.id) || !(leased || waiting)) {
    // Mission de CET exécuteur déjà annulée parce que l'adresse a changé (PATCH du projet : onLegacyUrlChanged,
    // lot C4) : même réponse explicite que ci-dessus, pour que l'agent s'arrête au lieu de réessayer.
    const last = r ? null : await latestMission(projectId);
    if (last && last.executor_id === ex.id && last.status === "cancelled" && last.outcome_detail === URL_CHANGED && (missionId === undefined || missionId === last.id)) {
      throw new ApiError(409, "Mission annulée : l'adresse de l'ancien logiciel a changé depuis la demande ; arrêtez-vous (une nouvelle demande du propriétaire sera nécessaire)");
    }
    throw new ApiError(403, "Refusé : seul l'exécuteur titulaire de la mission en cours de ce projet peut agir pour elle (prenez d'abord la mission)");
  }
  return r;
}

/** Rang des états « avant extraction » : un rapport de connexion ne fait jamais reculer un projet avancé. */
const EARLY: ProjectStatus[] = ["CREATED", "CONNECTION_PENDING", "CONNECTED", "FAILED", "NEEDS_HUMAN_REVIEW"];
const CONNECTION_LABEL = { pending: "en attente", connected: "réussie", failed: "échec", mfa_required: "double authentification demandée", human_needed: "intervention humaine nécessaire" } as const;

export type ConnectionReport = z.output<typeof ConnectionReportSchema>;

/**
 * Rapport de connexion du TITULAIRE de la mission (sinon 403) : pending → connecting, connected →
 * connected, failed → failed (fin), mfa_required / human_needed → needs_human (intervention du
 * propriétaire, plus de prêt). Le texte libre est débarrassé des identifiants confiés.
 */
export async function reportConnection(projectId: string, ex: ExecutorIdentity, who: ServicePrincipal, report: ConnectionReport) {
  const p = loadProject(projectId);
  if (!p) throw new ApiError(404, "Projet introuvable");
  if (p.status === "PAUSED") throw new ApiError(409, "Projet en pause : reprenez-le avant toute opération");
  const r = await requireLeaseHolder(projectId, ex, report.mission_id, { allowNeedsHuman: true });
  // Texte libre de l'agent : saisies de mot de passe (« motdepasse=… ») et secrets connus, sous toutes leurs formes, masqués.
  const detail = report.detail === undefined ? undefined : redactFreeText(report.detail, secretContext([projectId]), true).slice(0, 1000);
  const db = await missionsDb();
  const nowIso = iso(clockNow());
  const next: MissionStatus = report.status === "pending" ? "connecting" : report.status === "connected" ? "connected" : report.status === "failed" ? "failed" : "needs_human";
  const terminal = next === "failed";
  await atomically(db, () => {
    if (terminal) db.prepare("UPDATE analysis_missions SET status = 'failed', ended_at = ?, lease_expires_at = NULL, outcome_detail = ?, updated_at = ? WHERE id = ?").run(nowIso, detail ? `connexion échouée : ${detail}` : "connexion échouée", nowIso, r.id);
    else if (next === "needs_human") db.prepare("UPDATE analysis_missions SET status = 'needs_human', lease_expires_at = NULL, outcome_detail = ?, updated_at = ? WHERE id = ?").run(detail ?? CONNECTION_LABEL[report.status], nowIso, r.id);
    else db.prepare(`UPDATE analysis_missions SET status = ?, lease_expires_at = COALESCE(lease_expires_at, ?), updated_at = ? WHERE id = ?`).run(next, iso(clockNow() + LEASE_MS), nowIso, r.id);
  });
  if (terminal || next === "needs_human") revokeRedeemTokens(projectId, terminal ? "connexion échouée" : "intervention nécessaire", { mission_id: r.id });
  if (terminal) closeInvestigation(r.investigation_id, "failed");
  const by = displayName(who);
  updateProject(projectId, (x) => {
    x.connection = { status: report.status, detail, at: nowIso, by };
    const early = EARLY.includes(x.status ?? "CREATED");
    const reason = detail ? `${by} : ${detail}` : `Rapport de ${by}`;
    if (report.status === "connected" && early) setStatus(x, "CONNECTED", reason);
    else if (report.status === "failed") setStatus(x, "FAILED", `Connexion échouée — ${reason}`);
    else if (report.status === "mfa_required") setStatus(x, "NEEDS_HUMAN_REVIEW", `Double authentification demandée — intervention du propriétaire nécessaire — ${reason}`);
    else if (report.status === "human_needed") setStatus(x, "NEEDS_HUMAN_REVIEW", `Intervention humaine nécessaire — ${reason}`);
    else if (report.status === "pending" && early) setStatus(x, "CONNECTION_PENDING", reason);
  });
  projectEvent(projectId, `Connexion à l'ancien logiciel : ${CONNECTION_LABEL[report.status]}`, detail, "explorer", { mission_id: r.id, step: "connection", status: report.status });
  return { ok: true as const, project: projectSummary(projectId), mission: summaryOf((await getMission(r.id))!) };
}

export type MissionComplete = z.output<typeof MissionCompleteSchema>;

/**
 * Une mission DÉJÀ TERMINÉE (rapport « failed », trois prises expirées…) peut-elle encore effacer les
 * identifiants confiés au projet ? Seulement s'ils sont bien ceux qu'elle a servis : aucune demande plus
 * récente pour ce projet, et identifiants déposés avant la fin de la mission. Sinon (identifiants confiés à
 * nouveau, nouvelle demande prise par un autre exécuteur), l'ancien titulaire, qui ne détient plus aucun
 * prêt, ne touche à rien (SPEC §6 : seul le titulaire du prêt agit).
 */
async function endedMissionOwnsCredentials(r: MissionRow): Promise<boolean> {
  const db = await missionsDb();
  const newer = db.prepare(`SELECT 1 FROM analysis_missions WHERE project_id = ? AND id <> ? AND (status IN ${ACTIVE_SQL} OR created_at >= ?) LIMIT 1`).get(r.project_id, r.id, r.created_at);
  if (newer) return false;
  const cred = credentialStatus(r.project_id);
  return cred.stored && !!cred.created_at && !!r.ended_at && cred.created_at <= r.ended_at;
}

/**
 * Fin de mission déclarée par l'exécuteur titulaire : état final (jamais implicite), prêt libéré,
 * jetons révoqués, investigation close, IDENTIFIANTS EFFACÉS.
 * Mission déjà terminée (nouvel essai après une coupure réseau, ou fin déclarée après un rapport « failed ») :
 * l'état enregistré est renvoyé tel quel, sans rien réécrire ; seuls les identifiants qu'ELLE a servis sont
 * encore effacés (endedMissionOwnsCredentials) — jamais ceux confiés ensuite pour une autre mission.
 */
export async function completeMission(missionId: string, ex: ExecutorIdentity, body: MissionComplete) {
  await sweepMissions();
  const r = await getMission(missionId);
  if (!r) throw new ApiError(404, "Mission introuvable");
  if (r.executor_id !== ex.id) throw new ApiError(403, "Refusé : seul l'exécuteur titulaire de la mission peut la terminer");
  if (r.status === "cancelled" || r.status === "expired") throw new ApiError(409, `Mission déjà close (${r.status === "cancelled" ? "annulée" : "expirée"}) : rien n'a été enregistré`);
  const db = await missionsDb();
  // Mission encore en cours : son état final est celui déclaré.
  const active = LEASED.has(r.status) || r.status === "needs_human";
  if (!active) {
    let credentials: { erased: boolean; revoked_at: string | null } = { erased: false, revoked_at: null };
    if (await endedMissionOwnsCredentials(r)) {
      // Première fin déclarée après un rapport « failed » : l'effacement côté agent est consigné une seule fois.
      if (body.disposal && !r.disposal_json) await atomically(db, () => db.prepare("UPDATE analysis_missions SET disposal_json = ? WHERE id = ? AND disposal_json IS NULL").run(JSON.stringify(body.disposal), r.id));
      revokeRedeemTokens(r.project_id, "mission terminée", { mission_id: r.id });
      credentials = releaseCredentials(r.project_id, "mission terminée par l'agent d'analyse");
    }
    return { ok: true as const, mission: summaryOf((await getMission(r.id))!), credentials };
  }
  const detail = body.detail === undefined ? null : redactFreeText(body.detail, secretContext([r.project_id]), true).slice(0, 1000);
  const nowIso = iso(clockNow());
  const status: MissionStatus = body.outcome;
  await atomically(db, () =>
    db
      .prepare("UPDATE analysis_missions SET status = ?, ended_at = COALESCE(ended_at, ?), lease_expires_at = NULL, outcome_detail = COALESCE(?, outcome_detail), disposal_json = ?, updated_at = ? WHERE id = ?")
      .run(status, nowIso, detail, body.disposal ? JSON.stringify(body.disposal) : r.disposal_json, nowIso, r.id),
  );
  revokeRedeemTokens(r.project_id, "mission terminée", { mission_id: r.id });
  closeInvestigation(r.investigation_id, body.outcome === "completed" ? "completed" : "failed");
  // Mission déclarée terminée par son titulaire : les identifiants ne servent plus (SPEC §5).
  const credentials: { erased: boolean; revoked_at: string | null } = releaseCredentials(r.project_id, "mission terminée par l'agent d'analyse");
  if (body.outcome === "failed") {
    updateProject(r.project_id, (x) => {
      if (["CREATED", "CONNECTION_PENDING", "CONNECTED", "DISCOVERING"].includes(x.status ?? "CREATED")) setStatus(x, "FAILED", `Analyse terminée en échec par l'agent${detail ? ` : ${detail}` : ""}`);
    });
  }
  const disposal = body.disposal
    ? ` · coffre H : ${body.disposal.h_vault_item_deleted === undefined ? "non indiqué" : body.disposal.h_vault_item_deleted ? "élément supprimé" : "élément NON supprimé"} · fichiers locaux : ${body.disposal.local_artifacts_purged === undefined ? "non indiqué" : body.disposal.local_artifacts_purged ? "purgés" : "NON purgés"}`
    : " · effacement côté agent non indiqué";
  projectEvent(r.project_id, body.outcome === "completed" ? "Analyse terminée par l'agent" : "Analyse terminée en échec par l'agent", `${detail ?? `Mission ${r.id}`}${disposal}`, "explorer", { mission_id: r.id, step: "end", outcome: body.outcome });
  return { ok: true as const, mission: summaryOf((await getMission(r.id))!), credentials };
}

/**
 * Premières observations du titulaire (à appeler par POST /api/observations, lot B1) : mission
 * « connected » → « exploring », projet « Connecté » → « Découverte en cours ». Sans effet sinon.
 */
export async function markExploring(projectId: string, ex: ExecutorIdentity): Promise<boolean> {
  const r = await activeMission(projectId);
  if (!r || r.executor_id !== ex.id || r.status !== "connected") return false;
  const db = await missionsDb();
  const nowIso = iso(clockNow());
  const changed = await atomically(db, () => db.prepare("UPDATE analysis_missions SET status = 'exploring', updated_at = ? WHERE id = ? AND status = 'connected'").run(nowIso, r.id).changes);
  if (!changed) return false;
  updateProject(projectId, (x) => {
    if (x.status === "CONNECTED") setStatus(x, "DISCOVERING", "Premières observations reçues de l'agent d'analyse");
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Identifiants remplacés ou retirés (routes …/credentials)             */
/* ------------------------------------------------------------------ */

/** Nouveaux identifiants : la mission en cours repart en file (nouvelle prise = nouveau jeton). */
export async function onCredentialsReplaced(projectId: string, credentialsExpiresAt: string) {
  const r = await activeMission(projectId);
  if (!r) return;
  const db = await missionsDb();
  const nowIso = iso(clockNow());
  const expires = iso(Math.min(Date.parse(r.requested_at) + MISSION_TTL_MS, Date.parse(credentialsExpiresAt)));
  await atomically(db, () =>
    db.prepare("UPDATE analysis_missions SET status = 'queued', with_credentials = 1, executor_id = NULL, claimed_at = NULL, lease_expires_at = NULL, attempts = 0, expires_at = ?, updated_at = ? WHERE id = ?").run(expires, nowIso, r.id),
  );
  if (r.status !== "queued") projectEvent(projectId, "Nouveaux identifiants : l'analyse est remise en file d'attente", "Le jeton de remise précédent est révoqué ; l'agent recevra les nouveaux identifiants à sa prochaine prise.", "platform", { mission_id: r.id });
}

/** Suppression d'un projet demandée (lib/migration/erase.ts) : ses missions sont retirées de la base (jetons compris, avec ses fichiers). */
export async function deleteProjectMissions(projectId: string): Promise<number> {
  const db = await missionsDb();
  return Number(await atomically(db, () => db.prepare("DELETE FROM analysis_missions WHERE project_id = ?").run(projectId).changes));
}

/** Adresse de l'ancien logiciel modifiée (PATCH du projet) : toute mission en cours est annulée tout de suite. */
export async function onLegacyUrlChanged(projectId: string) {
  await settle(await activeMission(projectId));
}

/** Identifiants retirés (demande du client) : une mission qui en dépendait est annulée. */
export async function onCredentialsWithdrawn(projectId: string, reason: string) {
  const r = await activeMission(projectId);
  if (r && r.with_credentials) await endMission(r, "cancelled", reason, "Analyse annulée : identifiants supprimés à la demande du client");
}
