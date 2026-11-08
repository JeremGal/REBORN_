"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Button } from "@/components/ds/Button";
import { Field, Input, PasswordInput } from "@/components/ds/Field";
import { DEFAULT_AFTER_LOGIN, withNext, type LoginReason } from "@/components/shell/next-path";
import { checkEmail, FORGOTTEN_PASSWORD, NETWORK_ERROR, signInError, type FormError } from "../auth-errors";

const REASON: Record<LoginReason, { tone: "info" | "ok"; text: string }> = {
  expiree: { tone: "info", text: "Votre session a expiré ou a été fermée. Reconnectez-vous pour continuer." },
  deconnexion: { tone: "ok", text: "Vous êtes déconnecté de REBORN." },
  reinitialise: { tone: "ok", text: "Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe." },
};

/**
 * Connexion à REBORN (compte REBORN, jamais l'accès à l'ancien logiciel). Envoi à
 * /api/auth/sign-in/email ; succès : rechargement complet vers l'adresse de retour validée par
 * le serveur (aucun état d'un autre compte ne reste en mémoire).
 */
export function LoginForm({ next, reason }: { next: string; reason: LoginReason | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const emailProblem = checkEmail(email);
    const passwordProblem = password ? null : "Saisissez votre mot de passe.";
    if (emailProblem || passwordProblem) {
      setError({
        title: "Formulaire incomplet",
        message: "Indiquez l'adresse e-mail et le mot de passe de votre compte REBORN.",
        fields: { ...(emailProblem ? { email: emailProblem } : {}), ...(passwordProblem ? { password: passwordProblem } : {}) },
      });
      (emailProblem ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        cache: "no-store",
      });
    } catch {
      setError(NETWORK_ERROR);
      setBusy(false);
      return;
    }
    if (res.ok) {
      // Le bouton reste en chargement pendant le changement de page.
      window.location.assign(next);
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    setError(signInError(res.status, body));
    setBusy(false);
    if (res.status === 401) {
      setPassword("");
      passwordRef.current?.focus();
    }
  }

  const notice = reason ? REASON[reason] : next !== DEFAULT_AFTER_LOGIN ? { tone: "info" as const, text: "Connectez-vous pour continuer vers la page demandée." } : null;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-h1 font-semibold text-ink">Se connecter à REBORN</h1>
        <p className="mt-2 text-body leading-relaxed text-text-2">Avec l&apos;adresse e-mail et le mot de passe de votre compte REBORN.</p>
      </div>

      {notice && !error && (
        <Alert tone={notice.tone} live="polite">
          {notice.text}
        </Alert>
      )}

      <form noValidate onSubmit={submit} aria-describedby={error ? "connexion-erreur" : undefined} className="flex flex-col gap-5">
        {error && (
          <div id="connexion-erreur">
            <Alert tone="bad" title={error.title}>
              {error.message}
            </Alert>
          </div>
        )}
        <Field label="Adresse e-mail" error={error?.fields?.email}>
          <Input
            ref={emailRef}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            size="lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Mot de passe" error={error?.fields?.password}>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            size="lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy} loadingText="Connexion…">
          Se connecter
        </Button>
        <p className="text-small leading-relaxed text-text-3">{FORGOTTEN_PASSWORD}</p>
      </form>

      <div className="border-t border-line pt-6">
        <p className="text-body text-text-2">
          Pas encore de compte ?{" "}
          <Link href={withNext("/inscription", next)} className="ds-link">
            Créer un compte
          </Link>
        </p>
      </div>

      <p className="flex gap-2.5 rounded-panel bg-surface-sunken px-3.5 py-3 text-small leading-relaxed text-text-2">
        <KeyRound size={16} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
        <span>
          Identifiants REBORN uniquement. Les accès à votre ancien logiciel se confient plus tard, dans un projet, à l&apos;étape «&nbsp;Accès à votre ancien logiciel&nbsp;» : jamais ici.
        </span>
      </p>
    </div>
  );
}
