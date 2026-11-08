"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Alert, type AlertTone } from "@/components/ds/Alert";
import { formatDateTime, formatDay, formatInt, formatNumber } from "@/components/ds/format";
import { redirectToLogin, useReborn } from "@/components/RebornProvider";
import { lastCredentialErasure } from "@/components/shell/timeline";
import { SESSION_LOST_MESSAGE, type ProjectDetails } from "./ProjectProvider";
import { safeShotUrl } from "./view-rules";

/*
 * Outils communs aux étapes Connexion et Découverte : formats français, appels d'API déclenchés
 * par un bouton, états de connexion rapportés. Aucun chiffre n'est calculé ici : tout vient des
 * réponses d'API. Rendu : composants du design system (components/ds).
 */

export type ConnTone = "ok" | "warn" | "bad" | "info";

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

const valid = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Date et heure au format unique du Studio (« 7 nov. 2026, 23:10 ») ; « — » si absente ou illisible. */
export function connDate(iso: string | null | undefined): string {
  return formatDateTime(iso);
}

/** Date seule, même format (« 7 nov. 2026 »). */
export function connDay(iso: string | null | undefined): string {
  return formatDay(iso);
}

/** Heure seule (hh:mm). */
export function connHour(iso: string | null | undefined): string {
  const d = valid(iso);
  return d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Date relative courte (« dans 23 h », « il y a 5 min ») pour une échéance ; null si illisible. */
export function connRelative(iso: string | null | undefined, now = Date.now()): string | null {
  const d = valid(iso);
  if (!d) return null;
  const min = Math.round((d.getTime() - now) / 60000);
  const abs = Math.abs(min);
  const span = abs < 1 ? "moins d'une minute" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h${abs % 60 ? ` ${String(abs % 60).padStart(2, "0")}` : ""}` : `${Math.round(abs / 1440)} jours`;
  return min >= 0 ? `dans ${span}` : `il y a ${span}`;
}

/** Nombre entier au format français, séparateur de milliers lisible (formatInt du design system). */
export const connNum = (n: number) => formatInt(n);

/** Accord en nombre à la française (0 et 1 au singulier) : connCount(3, "capture") → « 3 captures ». */
export const connCount = (n: number, one: string, many = `${one}s`) => `${connNum(n)} ${n > 1 ? many : one}`;

/** Valeur brute lisible (observations, codes…). */
export function connValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return formatNumber(v, { maximumFractionDigits: 6 });
  if (typeof v === "boolean") return v ? "oui" : "non";
  return String(v);
}

/**
 * Seules les captures servies par REBORN (/api/shots/<nom>, accès contrôlé, cache privé) sont affichées :
 * jamais une image externe (http…), que le navigateur du client chargerait chez un tiers (lot C4).
 */
export function connSafeShot(url: string | undefined | null): string | null {
  return safeShotUrl(url);
}

/* ------------------------------------------------------------------ */
/* Adresse de l'ancien logiciel                                         */
/* ------------------------------------------------------------------ */

/**
 * Contrôle de l'adresse de connexion saisie (le serveur refait ses propres contrôles, SPEC §7) :
 * http(s) seulement, sans identifiant ni mot de passe, hôte non vide, 500 caractères au plus.
 * Le message ne recopie jamais l'adresse. Vide → null (l'appelant décide si elle est obligatoire).
 */
export function legacyUrlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 500) return "Adresse trop longue : 500 caractères au plus.";
  if (/\s/.test(v)) return "L'adresse ne doit pas contenir d'espace.";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "Adresse incomplète : saisissez l'adresse entière, par exemple https://logiciel.exemple.fr";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Seules les adresses qui commencent par http:// ou https:// sont acceptées.";
  if (u.username || u.password) return "Retirez l'identifiant et le mot de passe de l'adresse : confiez-les dans la partie « Accès », où ils sont chiffrés.";
  if (!u.hostname) return "Adresse incomplète : le nom du serveur manque.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Appels d'API                                                         */
/* ------------------------------------------------------------------ */

/** Message lisible d'une réponse d'erreur de l'API (message + premiers détails de validation). */
function apiMessage(status: number, data: { error?: unknown; issues?: unknown } | null): string {
  const issues = Array.isArray(data?.issues)
    ? (data.issues as { path?: string; message?: string }[])
        .slice(0, 4)
        .map((i) => i.message)
        .filter(Boolean)
        .join(" · ")
    : "";
  const base = typeof data?.error === "string" && data.error ? data.error : status === 404 ? "Service introuvable (HTTP 404)." : `Le Studio a répondu par une erreur (HTTP ${status}).`;
  return issues ? `${base} — ${issues}` : base;
}

/** Erreur d'API avec son statut HTTP (404 : service ou ressource introuvable, 409 : conflit d'état…). */
export class ConnApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Appel JSON vers le Studio (même origine : le navigateur joint le cookie de session et l'en-tête
 * Origin exigé pour les écritures). Lève une ConnApiError lisible en cas de refus. Session expirée ou
 * révoquée (401) : retour à la page de connexion, comme projectCall (lot C4).
 */
export async function connApi<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) {
    redirectToLogin();
    throw new ConnApiError(401, SESSION_LOST_MESSAGE);
  }
  const data = (await r.json().catch(() => null)) as T | null;
  if (!r.ok) throw new ConnApiError(r.status, apiMessage(r.status, data as { error?: unknown; issues?: unknown } | null));
  return (data ?? ({} as T)) as T;
}

/** Message d'erreur compréhensible : celui de l'API, ou une panne réseau expliquée en français. */
export function connErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError && /fetch|network|load failed/i.test(msg)) return "Le Studio REBORN ne répond pas : vérifiez votre connexion, puis réessayez.";
  return msg;
}

/* ------------------------------------------------------------------ */
/* États de connexion rapportés (details.connection)                    */
/* ------------------------------------------------------------------ */

export type ConnConnectionStatus = NonNullable<ProjectDetails["connection"]>["status"];

/** `metric` : valeur courte du haut de page ; `title` et `text` : message d'état détaillé. */
export const CONN_STATE: Record<ConnConnectionStatus | "none", { metric: string; metricTone?: "ok" | "warn" | "bad"; tone: ConnTone; title: string; text: string }> = {
  none: {
    metric: "Aucun rapport",
    tone: "info",
    title: "Aucun rapport de connexion",
    text: "Aucune connexion n'est affichée comme réussie sans un rapport réel de l'agent ou un test réel du connecteur.",
  },
  pending: {
    metric: "En cours",
    tone: "info",
    title: "Connexion en cours d'établissement",
    text: "Le résultat s'affichera au prochain rapport de l'agent.",
  },
  connected: {
    metric: "Connecté",
    metricTone: "ok",
    tone: "ok",
    title: "Connexion établie",
    text: "L'accès à l'ancien logiciel est confirmé.",
  },
  failed: {
    metric: "Échec",
    metricTone: "bad",
    tone: "bad",
    title: "Échec de la connexion",
    text: "La connexion a été refusée ou n'a pas pu être établie.",
  },
  mfa_required: {
    metric: "Intervention",
    metricTone: "warn",
    tone: "warn",
    title: "Intervention nécessaire : double authentification",
    text: "Votre logiciel demande un code de vérification. L'agent ne contourne jamais cette protection : c'est à vous d'intervenir.",
  },
  human_needed: {
    metric: "Intervention",
    metricTone: "warn",
    tone: "warn",
    title: "Intervention nécessaire",
    text: "L'agent est bloqué et attend une action de votre part.",
  },
};

/** Rapport émis par le test du connecteur HTTP de REBORN (et non par l'agent). */
export const connByConnector = (by: string | undefined) => !!by && by.startsWith("REBORN");
/** Rapport du connecteur émis avec le plan de test Relatio 2004 (jeu de test). */
export const connByTestPlan = (by: string | undefined) => connByConnector(by) && /plan de test/i.test(by ?? "");

/** Explication en clair de quelques causes techniques fréquentes (le message d'origine reste affiché). */
export function connExplain(detail: string | undefined): string | null {
  if (!detail) return null;
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(detail)) return "Le logiciel ne répond pas à cette adresse : serveur arrêté, adresse incorrecte ou réseau inaccessible.";
  if (/timeout|aborted|ETIMEDOUT/i.test(detail)) return "Le logiciel n'a pas répondu à temps.";
  if (/HTTP (401|403)/.test(detail)) return "Le logiciel a refusé le compte : identifiant, mot de passe ou droits à vérifier.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Opérations déclenchées par un bouton                                 */
/* ------------------------------------------------------------------ */

export interface ConnResult {
  tone: ConnTone;
  title: string;
  text?: ReactNode;
}

const ALERT_TONE: Record<ConnTone, AlertTone> = { ok: "ok", warn: "warn", bad: "bad", info: "info" };

/** Résultat d'une opération : annoncé poliment (alerte immédiate si échec). */
export function ConnResultCallout({ result, className, onClose }: { result: ConnResult | null; className?: string; onClose?: () => void }) {
  if (!result) return null;
  return (
    <Alert
      tone={ALERT_TONE[result.tone]}
      title={result.title}
      className={className}
      action={
        onClose ? (
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Fermer
          </button>
        ) : undefined
      }
    >
      {result.text}
    </Alert>
  );
}

/**
 * Une opération à la fois par bloc : état « en cours », résultat lisible. `after` est toujours
 * appelé (succès ou échec) pour relire l'état réel renvoyé par l'API.
 */
export function useConnAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ConnResult | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<ConnResult | void>, opts: { errorTitle?: string; after?: () => unknown } = {}) => {
    setBusy(key);
    setResult(null);
    try {
      const r = await fn();
      setResult(r ?? null);
      return true;
    } catch (e) {
      setResult({ tone: "bad", title: opts.errorTitle ?? "L'opération n'a pas abouti", text: connErrorText(e) });
      return false;
    } finally {
      setBusy(null);
      try {
        await opts.after?.();
      } catch {
        /* le rechargement signale lui-même ses erreurs */
      }
    }
  }, []);
  return { busy, result, setResult, run };
}

/* ------------------------------------------------------------------ */
/* Dernier effacement des identifiants                                  */
/* ------------------------------------------------------------------ */

export { lastCredentialErasure };

/** Effacement le plus récent, quand aucun identifiant n'est déposé (sinon null). */
export function useCredentialErasure(projectId: string, stored: boolean | undefined): { at: string; reason: string } | null {
  const { state } = useReborn();
  const events = state?.events;
  const investigations = state?.investigations;
  return useMemo(() => (stored === false ? lastCredentialErasure(events, projectId, investigations ?? []) : null), [stored, events, projectId, investigations]);
}
