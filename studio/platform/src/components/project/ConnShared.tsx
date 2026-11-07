"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleX, Hand, Hourglass, Info, PlugZap, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";
import { MODE_INFO } from "@/lib/modes";
import type { ProjectDetails } from "./ProjectProvider";

/*
 * Outils communs aux étapes Connexion et Découverte : formats français, messages de résultat,
 * étiquettes d'état. Aucun chiffre n'est calculé ici : tout vient des réponses d'API.
 */

export type ConnTone = "ok" | "warn" | "bad" | "info" | "idle";

/** Bouton à libellé long : passe à la ligne sur mobile (390 px) au lieu de déborder. */
export const CONN_WRAP_BTN = "h-auto! min-h-9 py-2 whitespace-normal! text-left leading-snug";

/** Mode d'une investigation ; un mode inconnu est traité comme local (jamais présenté comme réel). */
export function connMode(mode: string): { group: "local" | "real"; label: string; detail: string } {
  return MODE_INFO[mode as keyof typeof MODE_INFO] ?? { group: "local", label: `mode « ${mode} »`, detail: "Mode non reconnu : traité comme un essai local, sans agent H Company." };
}

/* ------------------------------------------------------------------ */
/* Formats                                                              */
/* ------------------------------------------------------------------ */

/** Date et heure d'un horodatage renvoyé par l'API (« — » s'il manque). */
export function connDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Heure seule (hh:mm). */
export function connHour(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export const connNum = (n: number) => n.toLocaleString("fr-FR");

/** Accord en nombre à la française (0 et 1 au singulier) : connCount(3, "capture") → « 3 captures ». */
export const connCount = (n: number, one: string, many = `${one}s`) => `${connNum(n)} ${n > 1 ? many : one}`;

/** Valeur brute lisible (observations, codes…). */
export function connValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("fr-FR", { maximumFractionDigits: 6 });
  if (typeof v === "boolean") return v ? "oui" : "non";
  return String(v);
}

/** Seules les captures servies par REBORN (/api/shots/…) ou par une adresse http(s) sont affichées. */
export function connSafeShot(url: string | undefined | null): string | null {
  if (!url) return null;
  if (/^\/api\/shots\/[A-Za-z0-9._-]+$/.test(url)) return url;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url;
  return null;
}

/** Adresse de la plateforme (pour lire les adresses relatives d'une mission), sans écart serveur/navigateur. */
const noSubscribe = () => () => {};
export function useConnOrigin(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => null,
  );
}

/* ------------------------------------------------------------------ */
/* États de connexion (details.connection)                              */
/* ------------------------------------------------------------------ */

export type ConnConnectionStatus = NonNullable<ProjectDetails["connection"]>["status"];

export const CONN_STATE: Record<ConnConnectionStatus | "none", { label: string; tone: ConnTone; icon: LucideIcon; text: string }> = {
  none: {
    label: "En attente de l'agent",
    tone: "idle",
    icon: Hourglass,
    text: "Aucun rapport de connexion reçu. L'agent Computer Use de H Company (Mouss) se connectera avec le compte confié et rapportera ici le résultat.",
  },
  pending: {
    label: "En attente de l'agent",
    tone: "warn",
    icon: Hourglass,
    text: "L'agent a signalé que la connexion est en cours d'établissement. Le résultat s'affichera à son prochain rapport.",
  },
  connected: {
    label: "Connexion réussie",
    tone: "ok",
    icon: PlugZap,
    text: "L'accès à l'ancien logiciel a été confirmé.",
  },
  failed: {
    label: "Échec de la connexion",
    tone: "bad",
    icon: CircleX,
    text: "La connexion a été refusée ou n'a pas pu être établie. La cause rapportée est indiquée ci-dessous.",
  },
  mfa_required: {
    label: "Double authentification demandée",
    tone: "warn",
    icon: ShieldAlert,
    text: "Le logiciel exige un second facteur. Une personne habilitée doit le valider : l'agent ne le contourne jamais.",
  },
  human_needed: {
    label: "Intervention humaine nécessaire",
    tone: "warn",
    icon: Hand,
    text: "L'agent est bloqué et demande une action humaine (voir le détail rapporté).",
  },
};

/** Rapport émis par le test du connecteur HTTP de REBORN (et non par l'agent). */
export const connByConnector = (by: string | undefined) => !!by && by.startsWith("REBORN");

/** Explication en clair de quelques causes techniques fréquentes (le message d'origine reste affiché). */
export function connExplain(detail: string | undefined): string | null {
  if (!detail) return null;
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(detail)) return "Le logiciel ne répond pas à cette adresse : serveur arrêté, adresse incorrecte ou réseau inaccessible.";
  if (/timeout|aborted|ETIMEDOUT/i.test(detail)) return "Le logiciel n'a pas répondu à temps.";
  if (/HTTP (401|403)/.test(detail)) return "Le logiciel a refusé le compte : identifiant, mot de passe ou droits à vérifier.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Messages                                                             */
/* ------------------------------------------------------------------ */

const NOTICE: Record<ConnTone, { box: string; title: string; icon: LucideIcon }> = {
  ok: { box: "bg-verdigris-soft", title: "text-[#0b6b5f]", icon: CircleCheck },
  warn: { box: "bg-ochre-soft", title: "text-ochre", icon: TriangleAlert },
  bad: { box: "bg-rust-soft", title: "text-rust", icon: CircleAlert },
  info: { box: "bg-[#e7eef8]", title: "text-[#2457a6]", icon: Info },
  idle: { box: "bg-chalk", title: "text-ink", icon: Info },
};

/** Encadré d'information ou de résultat. `live` : annoncé aux lecteurs d'écran (résultat d'une opération). */
export function ConnNotice({ tone, title, children, live, icon, className }: { tone: ConnTone; title?: ReactNode; children?: ReactNode; live?: boolean; icon?: LucideIcon; className?: string }) {
  const s = NOTICE[tone];
  const Icon = icon ?? s.icon;
  return (
    <div role={live ? (tone === "bad" ? "alert" : "status") : undefined} className={cx("flex gap-2.5 rounded-sm px-3 py-2.5 text-[12.5px] leading-relaxed", s.box, className)}>
      <Icon size={15} className={cx("mt-0.5 shrink-0", s.title)} aria-hidden />
      <div className="min-w-0 break-words">
        {title && <div className={cx("font-bold", s.title)}>{title}</div>}
        {children && <div className={cx("text-ink/80", title ? "mt-0.5" : undefined)}>{children}</div>}
      </div>
    </div>
  );
}

const TAG: Record<ConnTone, string> = {
  ok: "bg-verdigris-soft text-[#0b6b5f]",
  warn: "bg-ochre-soft text-ochre",
  bad: "bg-rust-soft text-rust",
  info: "bg-[#e7eef8] text-[#2457a6]",
  idle: "bg-chalk-2 text-sediment",
};

/** Petite étiquette (« Jeu de test », « Agents réels », « En cours »…). */
export function ConnTag({ tone = "idle", children, title, dot }: { tone?: ConnTone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={cx("inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-[10.5px] font-bold tracking-[0.06em] whitespace-nowrap uppercase", TAG[tone])}>
      {dot && <span className="live-dot size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Ligne libellé / valeur d'une fiche (à placer dans un <dl>). */
export function ConnFact({ label, children, mono, className }: { label: string; children: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-[11px] font-bold text-silt">{label}</dt>
      <dd className={cx("mt-0.5 text-[13px] leading-snug text-ink", mono ? "font-mono text-[12px] break-all" : "break-words")}>{children}</dd>
    </div>
  );
}

/** Chiffre clé issu de l'API (jamais estimé). */
export function ConnStat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: ConnTone; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-silt">{label}</dt>
      <dd className={cx("tabular text-[22px] leading-tight font-black tracking-[-0.01em]", tone === "ok" ? "text-verdigris" : tone === "warn" ? "text-ochre" : tone === "bad" ? "text-rust" : "text-ink")}>{value}</dd>
      {hint && <dd className="text-[11.5px] leading-snug text-sediment">{hint}</dd>}
    </div>
  );
}

/** Intertitre de section à l'intérieur d'un panneau. */
export function ConnHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-[12.5px] font-bold tracking-[-0.005em] text-ink">{children}</h3>
      {aside && <span className="text-[11.5px] text-silt">{aside}</span>}
    </div>
  );
}

/** Chargement : libellé visible + lignes neutres (pas de faux contenu). */
export function ConnLoading({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 py-1">
      <span className="text-[12px] text-silt">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="h-2.5 rounded-xs bg-chalk-2 motion-safe:animate-pulse" style={{ width: `${88 - i * 17}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Opérations d'API déclenchées par un bouton                           */
/* ------------------------------------------------------------------ */

export interface ConnResult {
  tone: ConnTone;
  title: string;
  text?: ReactNode;
}

/** Message d'erreur compréhensible : celui de l'API, ou une panne réseau expliquée en français. */
export function connErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof TypeError && /fetch|network|load failed/i.test(msg)) return "Plateforme REBORN injoignable : vérifiez que le serveur est démarré, puis réessayez.";
  return msg;
}

/**
 * Une opération à la fois par panneau : état « en cours », résultat lisible. `after` est toujours
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

/**
 * Copie un JSON obtenu par une requête en cours, sans jamais l'afficher. Le presse-papiers est
 * réservé pendant le clic (ClipboardItem + promesse, exigé par Safari), avec repli sur writeText
 * puis sur la copie système. L'erreur éventuelle de l'API est propagée à l'appelant.
 */
export async function connCopyJson(pending: Promise<unknown>): Promise<boolean> {
  const text = (v: unknown) => JSON.stringify(v, null, 2);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = pending.then((v) => new Blob([text(v)], { type: "text/plain" }));
    blob.catch(() => {});
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      /* navigateur sans prise en charge : nouvel essai une fois la réponse reçue */
    }
  }
  const value = await pending;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text(value));
      return true;
    } catch {
      /* repli ci-dessous */
    }
  }
  // Contexte non sécurisé (accès réseau en http) : copie système, zone de texte hors écran et retirée aussitôt.
  const area = document.createElement("textarea");
  area.value = text(value);
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "-10000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.value = "";
    area.remove();
  }
}
