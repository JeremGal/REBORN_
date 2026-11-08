"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ds/Alert";
import { Button } from "@/components/ds/Button";
import { Checkbox, Field, Input, PasswordInput } from "@/components/ds/Field";
import { withNext } from "@/components/shell/next-path";
import { checkConfirmation, checkEmail, checkNewPassword, NETWORK_ERROR, signUpError, type FieldName, type FormError } from "../auth-errors";

/** Texte exact d'une case (consentStatement), page du document et nom du document à mettre en lien. */
export interface Statement {
  text: string;
  version: string;
  path: string;
  title: string;
}

type Values = { firstName: string; lastName: string; company: string; email: string; password: string; confirm: string; terms: boolean; privacy: boolean };
type Errors = Partial<Record<FieldName, string>>;

const ORDER: FieldName[] = ["firstName", "lastName", "company", "email", "password", "confirm", "terms", "privacy"];

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.firstName.trim()) e.firstName = "Indiquez votre prénom.";
  else if (v.firstName.trim().length > 80) e.firstName = "80 caractères au maximum.";
  if (!v.lastName.trim()) e.lastName = "Indiquez votre nom.";
  else if (v.lastName.trim().length > 80) e.lastName = "80 caractères au maximum.";
  if (!v.company.trim()) e.company = "Indiquez le nom de votre entreprise.";
  else if (v.company.trim().length > 120) e.company = "120 caractères au maximum.";
  const mail = checkEmail(v.email);
  if (mail) e.email = mail;
  const pw = checkNewPassword(v.password);
  if (pw) e.password = pw;
  const confirm = checkConfirmation(v.password, v.confirm);
  if (confirm) e.confirm = confirm;
  if (!v.terms) e.terms = "Acceptez les conditions d'utilisation pour créer un compte.";
  if (!v.privacy) e.privacy = "Confirmez avoir pris connaissance de la politique de confidentialité.";
  return e;
}

/** Libellé d'une case : le texte exact enregistré, avec le nom du document en lien (nouvel onglet). */
function StatementLabel({ s }: { s: Statement }) {
  const i = s.text.indexOf(s.title);
  // Le libellé reste exactement le texte enregistré ; « nouvel onglet » est annoncé comme description.
  const link = (
    <a href={s.path} target="_blank" rel="noopener" aria-describedby="nouvel-onglet" className="ds-link">
      {s.title}
    </a>
  );
  if (i < 0) {
    return (
      <>
        {s.text} {link}
      </>
    );
  }
  return (
    <>
      {s.text.slice(0, i)}
      {link}
      {s.text.slice(i + s.title.length)}
    </>
  );
}

/**
 * Création d'un compte client : prénom, nom, entreprise, e-mail professionnel, mot de passe (+ confirmation),
 * deux cases NON cochées (acceptation des conditions = contrat ; politique de confidentialité = information).
 * Le serveur refuse si l'une manque et enregistre les deux consentements avec leur version.
 */
export function SignUpForm({ next, terms, privacy }: { next: string; terms: Statement; privacy: Statement }) {
  const [v, setV] = useState<Values>({ firstName: "", lastName: "", company: "", email: "", password: "", confirm: "", terms: false, privacy: false });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<FormError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    const nextValues = { ...v, [k]: value };
    setV(nextValues);
    if (submitted) setErrors(validate(nextValues));
  };
  const focusFirst = (e: Errors) => {
    const f = ORDER.find((k) => e[k]);
    if (f) refs.current[f]?.focus();
  };

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    setSubmitted(true);
    const local = validate(v);
    setErrors(local);
    if (Object.keys(local).length) {
      const n = Object.keys(local).length;
      setFailure({ title: "Formulaire à corriger", message: `${n} champ${n > 1 ? "s sont" : " est"} à compléter ou à corriger : voir les messages sous chaque champ.` });
      focusFirst(local);
      return;
    }
    setBusy(true);
    setFailure(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: v.firstName.trim(),
          lastName: v.lastName.trim(),
          company: v.company.trim(),
          email: v.email.trim(),
          password: v.password,
          termsVersion: terms.version,
          privacyVersion: privacy.version,
        }),
        cache: "no-store",
      });
    } catch {
      setFailure(NETWORK_ERROR);
      setBusy(false);
      return;
    }
    if (res.ok) {
      // Compte créé et session ouverte par le serveur : rechargement complet vers la suite prévue.
      window.location.assign(next);
      return;
    }
    const err = signUpError(res.status, await res.json().catch(() => null));
    setFailure(err);
    if (err.fields) {
      setErrors(err.fields);
      focusFirst(err.fields);
    }
    setBusy(false);
  }

  const bind = (k: FieldName) => (el: HTMLInputElement | null) => {
    refs.current[k] = el;
  };

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-h1 font-semibold text-ink">Créer un compte REBORN</h1>
        <p className="mt-2 text-body leading-relaxed text-text-2">Votre compte vous permet de créer des projets de migration et d&apos;en suivre chaque étape.</p>
      </div>

      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {failure && (
          <Alert tone="bad" title={failure.title}>
            {failure.message}
          </Alert>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prénom" required error={errors.firstName}>
            <Input ref={bind("firstName")} name="firstName" autoComplete="given-name" size="lg" maxLength={80} value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
          </Field>
          <Field label="Nom" required error={errors.lastName}>
            <Input ref={bind("lastName")} name="lastName" autoComplete="family-name" size="lg" maxLength={80} value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
          </Field>
        </div>
        <Field label="Entreprise" required error={errors.company}>
          <Input ref={bind("company")} name="company" autoComplete="organization" size="lg" maxLength={120} value={v.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="E-mail professionnel" hint="Il vous servira à vous connecter." required error={errors.email}>
          <Input
            ref={bind("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            size="lg"
            maxLength={254}
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Mot de passe" hint="10 caractères au minimum. Une courte phrase est plus facile à retenir et plus sûre." required error={errors.password}>
          <PasswordInput ref={bind("password")} name="password" autoComplete="new-password" size="lg" maxLength={128} value={v.password} onChange={(e) => set("password", e.target.value)} />
        </Field>
        <Field label="Confirmation du mot de passe" required error={errors.confirm}>
          <PasswordInput ref={bind("confirm")} name="confirm" autoComplete="new-password" size="lg" maxLength={128} value={v.confirm} onChange={(e) => set("confirm", e.target.value)} />
        </Field>

        <fieldset className="flex flex-col gap-3 border-t border-line pt-5">
          <legend className="sr-only">Conditions et confidentialité</legend>
          <span id="nouvel-onglet" hidden>
            S&apos;ouvre dans un nouvel onglet
          </span>
          <Checkbox ref={bind("terms")} name="terms" checked={v.terms} onChange={(e) => set("terms", e.target.checked)} label={<StatementLabel s={terms} />} error={errors.terms} />
          <Checkbox ref={bind("privacy")} name="privacy" checked={v.privacy} onChange={(e) => set("privacy", e.target.checked)} label={<StatementLabel s={privacy} />} error={errors.privacy} />
        </fieldset>

        <Button type="submit" size="lg" block loading={busy} loadingText="Création du compte…">
          Créer mon compte
        </Button>
      </form>

      <div className="border-t border-line pt-6">
        <p className="text-body text-text-2">
          Déjà un compte ?{" "}
          <Link href={withNext("/connexion", next)} className="ds-link">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
