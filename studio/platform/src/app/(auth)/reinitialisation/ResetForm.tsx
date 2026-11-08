"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ds/Alert";
import { Button } from "@/components/ds/Button";
import { Field, PasswordInput } from "@/components/ds/Field";
import { Skeleton } from "@/components/ds/Progress";
import { loginPath } from "@/components/shell/next-path";
import { checkConfirmation, checkNewPassword, NETWORK_ERROR, resetError, type FormError } from "../auth-errors";

type Phase = "reading" | "missing" | "ready" | "done";

/** Jeton du fragment (#token=…). Format de Better Auth : lettres, chiffres, - et _. */
function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)token=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const t = decodeURIComponent(m[1]);
    return /^[A-Za-z0-9_-]{8,200}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

export function ResetForm() {
  const [phase, setPhase] = useState<Phase>("reading");
  const token = useRef<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    token.current = tokenFromHash(window.location.hash);
    // Le jeton disparaît aussitôt de la barre d'adresse et de l'historique.
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setPhase(token.current ? "ready" : "missing");
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !token.current) return;
    const local = { password: checkNewPassword(password) ?? undefined, confirm: checkConfirmation(password, confirm) ?? undefined };
    setErrors(local);
    if (local.password || local.confirm) {
      setFailure(null);
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.current, newPassword: password }),
        cache: "no-store",
      });
    } catch {
      setFailure(NETWORK_ERROR);
      setBusy(false);
      return;
    }
    if (res.ok) {
      token.current = null;
      setPassword("");
      setConfirm("");
      setPhase("done");
      setBusy(false);
      return;
    }
    const err = resetError(res.status, await res.json().catch(() => null));
    setFailure(err);
    if (err.fields?.password) setErrors({ password: err.fields.password });
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-h1 font-semibold text-ink">Nouveau mot de passe</h1>
        <p className="mt-2 text-body leading-relaxed text-text-2">Pour votre compte REBORN, à partir du lien transmis par un administrateur REBORN.</p>
      </div>

      {phase === "reading" && <Skeleton lines={3} label="Lecture du lien…" />}

      {phase === "missing" && (
        <>
          <Alert tone="warn" title="Lien incomplet">
            Ouvrez le lien complet reçu de l&apos;administrateur REBORN. Chaque lien ne sert qu&apos;une fois et expire au bout d&apos;une heure : s&apos;il a déjà servi, demandez-en un nouveau.
          </Alert>
          <Link href="/connexion" className="ds-link inline-flex min-h-6 items-center self-start text-body max-sm:min-h-11">
            Retour à la connexion
          </Link>
        </>
      )}

      {phase === "ready" && (
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          {failure && (
            <Alert tone="bad" title={failure.title}>
              {failure.message}
            </Alert>
          )}
          <Field label="Nouveau mot de passe" hint="10 caractères au minimum. Une courte phrase est plus facile à retenir et plus sûre." required error={errors.password}>
            <PasswordInput ref={passwordRef} name="password" autoComplete="new-password" size="lg" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirmation" required error={errors.confirm}>
            <PasswordInput name="confirm" autoComplete="new-password" size="lg" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" block loading={busy} loadingText="Enregistrement…">
            Enregistrer le nouveau mot de passe
          </Button>
          <p className="text-small leading-relaxed text-text-3">Après le changement, toutes les sessions ouvertes sur ce compte sont fermées.</p>
        </form>
      )}

      {phase === "done" && (
        <>
          <Alert tone="ok" title="Mot de passe modifié">
            Par sécurité, toutes les sessions ouvertes sur votre compte ont été fermées. Connectez-vous avec le nouveau mot de passe.
          </Alert>
          <Button href={loginPath(null, "reinitialise")} size="lg" block>
            Se connecter
          </Button>
        </>
      )}
    </div>
  );
}
