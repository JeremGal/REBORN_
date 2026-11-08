"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LogOut, Monitor, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Field, PasswordInput } from "@/components/ds/Field";
import { Skeleton } from "@/components/ds/Progress";
import { useToast } from "@/components/ds/Toast";
import { formatDateTime } from "@/components/ds/format";
import { redirectToLogin } from "@/components/RebornProvider";
import { useShell } from "@/components/shell/context";
import { loginPath } from "@/components/shell/next-path";
import { checkConfirmation, checkNewPassword } from "@/app/(auth)/auth-errors";
import { SettingsSection } from "./Settings";

/**
 * Sécurité du compte REBORN (routes Better Auth) : changement de mot de passe (le serveur ferme
 * toujours les autres sessions), sessions ouvertes, déconnexion des autres appareils ou de tous.
 * Les jetons de session renvoyés par /list-sessions ne sont jamais conservés ni affichés.
 */

interface SessionView {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:05 »). */
const full = (iso: string) => formatDateTime(iso);

/** « Chrome sur macOS » à partir de l'agent utilisateur (indicatif). */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|node|undici|python/i.test(ua) ? "Programme" : "Navigateur";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} sur ${os}` : browser;
}

async function authPost(path: string, body: unknown = {}) {
  const r = await fetch(`/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const d = (await r.json().catch(() => null)) as { code?: string; message?: string } | null;
  return { r, d };
}

function PasswordForm({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Après une erreur : focus sur le premier champ en erreur (son message lui est relié par aria-describedby).
  const focusFirstError = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const local = {
      current: v.current ? undefined : "Saisissez votre mot de passe actuel.",
      next: checkNewPassword(v.next) ?? (v.next && v.next === v.current ? "Choisissez un mot de passe différent de l'actuel." : undefined),
      confirm: checkConfirmation(v.next, v.confirm) ?? undefined,
    };
    setErrors(local);
    if (local.current || local.next || local.confirm) {
      focusFirstError();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const { r, d } = await authPost("/change-password", { currentPassword: v.current, newPassword: v.next });
      if (r.ok) {
        setV({ current: "", next: "", confirm: "" });
        toast({ tone: "ok", title: "Mot de passe modifié", description: "Vos autres sessions ont été fermées ; celle-ci reste ouverte." });
        onChanged();
        return;
      }
      if (r.status === 401 && d?.code !== "INVALID_PASSWORD") return redirectToLogin();
      if (d?.code === "INVALID_PASSWORD") setErrors({ current: "Mot de passe actuel incorrect." });
      else if (d?.code === "PASSWORD_TOO_SHORT") setErrors({ next: "10 caractères au minimum." });
      else if (d?.code === "PASSWORD_TOO_LONG") setErrors({ next: "128 caractères au maximum." });
      else setFailure(d?.message ?? `Modification impossible (erreur ${r.status}). Réessayez.`);
      focusFirstError();
    } catch {
      setFailure("REBORN ne répond pas. Vérifiez votre connexion, puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex max-w-xl flex-col gap-5" aria-labelledby="mdp-titre">
      <div>
        <h3 id="mdp-titre" className="text-lead font-semibold text-ink">
          Changer de mot de passe
        </h3>
        <p className="mt-1 text-small text-text-2">Les autres sessions de votre compte sont fermées au changement ; celle-ci reste ouverte.</p>
      </div>
      {failure && (
        <Alert tone="bad" title="Mot de passe inchangé">
          {failure}
        </Alert>
      )}
      <Field label="Mot de passe actuel" required error={errors.current}>
        <PasswordInput autoComplete="current-password" maxLength={128} value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nouveau mot de passe" hint="10 caractères au minimum." required error={errors.next}>
          <PasswordInput autoComplete="new-password" maxLength={128} value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} />
        </Field>
        <Field label="Confirmation" required error={errors.confirm}>
          <PasswordInput autoComplete="new-password" maxLength={128} value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
        </Field>
      </div>
      <Button type="submit" className="self-start" loading={busy} loadingText="Modification…">
        Changer le mot de passe
      </Button>
    </form>
  );
}

function Sessions({ reloadKey }: { reloadKey: number }) {
  const { sessionId: initialSessionId } = useShell();
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [problem, setProblem] = useState<{ stale: boolean; message: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyOthers, setBusyOthers] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, cur] = await Promise.all([fetch("/api/auth/list-sessions", { cache: "no-store" }), fetch("/api/auth/get-session", { cache: "no-store" })]);
      const d = (await r.json().catch(() => null)) as unknown;
      const me = (await cur.json().catch(() => null)) as { session?: { id?: unknown } } | null;
      if (r.status === 401 || (cur.ok && me === null)) return redirectToLogin();
      // Le changement de mot de passe ouvre une nouvelle session : « cette session » est relue à chaque fois.
      if (typeof me?.session?.id === "string") setSessionId(me.session.id);
      if (!r.ok || !Array.isArray(d)) {
        const code = (d as { code?: string } | null)?.code;
        setProblem(
          code === "SESSION_NOT_FRESH"
            ? { stale: true, message: "Par sécurité, la liste des sessions n'est affichée que dans les 24 heures qui suivent la connexion. Reconnectez-vous pour la consulter." }
            : { stale: false, message: `Lecture des sessions impossible (erreur ${r.status}).` },
        );
        setSessions(null);
        return;
      }
      // Seuls les champs d'affichage sont gardés : le jeton de chaque session est écarté aussitôt.
      setSessions(
        (d as Record<string, unknown>[]).map((s) => ({
          id: String(s.id),
          createdAt: String(s.createdAt),
          updatedAt: String(s.updatedAt),
          expiresAt: String(s.expiresAt),
          ipAddress: typeof s.ipAddress === "string" && s.ipAddress ? s.ipAddress : null,
          userAgent: typeof s.userAgent === "string" && s.userAgent ? s.userAgent : null,
        })),
      );
      setProblem(null);
    } catch {
      setProblem({ stale: false, message: "REBORN ne répond pas. Vérifiez votre connexion, puis réessayez." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function revokeOthers() {
    setBusyOthers(true);
    try {
      const { r } = await authPost("/revoke-other-sessions");
      if (r.status === 401) return redirectToLogin();
      if (!r.ok) throw new Error(`erreur ${r.status}`);
      toast({ tone: "ok", title: "Autres appareils déconnectés", description: "Seule cette session reste ouverte." });
      await load();
    } catch (e) {
      toast({ tone: "bad", title: "Déconnexion des autres appareils impossible", description: e instanceof TypeError ? "REBORN ne répond pas." : `Le serveur a refusé la demande (${(e as Error).message}).` });
    } finally {
      setBusyOthers(false);
    }
  }

  async function reconnect() {
    try {
      await authPost("/sign-out");
    } finally {
      window.location.assign(loginPath("/parametres#securite"));
    }
  }

  async function revokeAll() {
    const { r } = await authPost("/revoke-sessions");
    if (!r.ok && r.status !== 401) throw new Error(`Le serveur a refusé la demande (erreur ${r.status}). Réessayez.`);
    window.location.assign(loginPath(null, "deconnexion"));
  }

  const sorted = sessions ? [...sessions].sort((a, b) => (a.id === sessionId ? -1 : b.id === sessionId ? 1 : b.updatedAt.localeCompare(a.updatedAt))) : null;
  const others = sorted ? sorted.filter((s) => s.id !== sessionId).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lead font-semibold text-ink">Sessions ouvertes</h3>
        <p className="mt-1 text-small text-text-2">Chaque navigateur connecté à votre compte. Une session dure 7 jours et se prolonge à l&apos;usage.</p>
      </div>

      {problem && (
        <Alert
          tone={problem.stale ? "info" : "bad"}
          action={
            problem.stale ? (
              <Button variant="secondary" size="sm" onClick={reconnect}>
                Se reconnecter
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={load}>
                Réessayer
              </Button>
            )
          }
        >
          {problem.message}
        </Alert>
      )}

      {!sessions && !problem && <Skeleton lines={3} label="Chargement des sessions…" />}

      {sorted && (
        <ul className="divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
          {sorted.map((s) => {
            const current = s.id === sessionId;
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3.5">
                <Monitor size={18} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                    {deviceLabel(s.userAgent)}
                    {current && <Badge tone="ok">Cette session</Badge>}
                  </p>
                  {/* updatedAt n'est pas la dernière activité : la session n'est prolongée qu'une fois par jour au plus (updateAge) */}
                  <p className="mt-0.5 text-small text-text-2">
                    Ouverte le {full(s.createdAt)}
                    {s.updatedAt !== s.createdAt ? ` · prolongée le ${full(s.updatedAt)}` : ""}
                    {s.ipAddress ? ` · adresse ${s.ipAddress}` : ""}
                  </p>
                  <p className="text-meta text-text-3">Expire le {full(s.expiresAt)} si elle ne sert plus ; utilisée, elle est prolongée de 7 jours, au plus une fois par jour.</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={revokeOthers} loading={busyOthers} loadingText="Déconnexion…" disabled={!!sorted && others === 0}>
          Déconnecter les autres appareils{sorted ? ` (${others})` : ""}
        </Button>
        <Button variant="danger-subtle" icon={<LogOut size={15} />} onClick={() => setConfirmAll(true)}>
          Se déconnecter de tous les appareils
        </Button>
      </div>

      <ConfirmationDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={revokeAll}
        title="Se déconnecter de tous les appareils ?"
        confirmLabel="Tout déconnecter"
        pendingLabel="Déconnexion…"
        tone="danger"
      >
        Toutes les sessions de votre compte REBORN seront fermées, y compris celle-ci. Vous devrez vous reconnecter sur chaque appareil.
      </ConfirmationDialog>
    </div>
  );
}

export function SecuritySection() {
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <SettingsSection id="securite" title="Sécurité" description="Votre mot de passe REBORN et les appareils connectés à votre compte. Les accès à votre ancien logiciel se gèrent dans Confidentialité.">
      <PasswordForm onChanged={() => setReloadKey((k) => k + 1)} />
      <Sessions reloadKey={reloadKey} />
    </SettingsSection>
  );
}
