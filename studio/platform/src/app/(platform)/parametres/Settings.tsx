"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ds/Alert";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { Field, Input } from "@/components/ds/Field";
import { useToast } from "@/components/ds/Toast";
import { redirectToLogin } from "@/components/RebornProvider";
import { useShell, type ShellUser } from "@/components/shell/context";
import { SecuritySection } from "./SecuritySection";
import { PrivacySection } from "./PrivacySection";

/**
 * Paramètres : Profil (PATCH /api/me), Sécurité (mot de passe, sessions : routes Better Auth),
 * Confidentialité (consentements, identifiants confiés, demandes de suppression).
 */

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-20 border-t border-line pt-8 lg:scroll-mt-8">
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div>
          <h2 id={`${id}-titre`} className="text-h3 font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1.5 text-small leading-relaxed text-text-2">{description}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
      </div>
    </section>
  );
}

type ProfileErrors = Partial<Record<"firstName" | "lastName" | "company", string>>;

function ProfileForm() {
  const { user, setUser } = useShell();
  const { toast } = useToast();
  const [v, setV] = useState({ firstName: user.firstName, lastName: user.lastName, company: user.company ?? "" });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = v.firstName !== user.firstName || v.lastName !== user.lastName || v.company !== (user.company ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  // Après une erreur : focus sur le premier champ en erreur (son message lui est relié par aria-describedby).
  const focusFirstError = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const local: ProfileErrors = {};
    if (!v.firstName.trim()) local.firstName = "Indiquez votre prénom.";
    if (!v.lastName.trim()) local.lastName = "Indiquez votre nom.";
    if (!v.company.trim()) local.company = "Indiquez le nom de votre entreprise.";
    setErrors(local);
    if (Object.keys(local).length) {
      focusFirstError();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: v.firstName.trim(), lastName: v.lastName.trim(), company: v.company.trim() }),
      });
      if (r.status === 401) return redirectToLogin();
      const d = (await r.json().catch(() => null)) as { user?: ShellUser; error?: string; issues?: { path?: string; message?: string }[] } | null;
      if (!r.ok || !d?.user) {
        const fieldErrors: ProfileErrors = {};
        for (const i of d?.issues ?? []) if (i.path === "firstName" || i.path === "lastName" || i.path === "company") fieldErrors[i.path] = i.message ?? "Valeur refusée.";
        setErrors(fieldErrors);
        setFailure(d?.error ?? `Enregistrement impossible (erreur ${r.status}). Réessayez.`);
        focusFirstError();
        return;
      }
      setUser(d.user);
      setV({ firstName: d.user.firstName, lastName: d.user.lastName, company: d.user.company ?? "" });
      toast({ tone: "ok", title: "Profil enregistré" });
    } catch {
      setFailure("REBORN ne répond pas. Vérifiez votre connexion, puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={save} className="flex max-w-xl flex-col gap-5">
      {failure && (
        <Alert tone="bad" title="Profil non enregistré">
          {failure}
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prénom" required error={errors.firstName}>
          <Input autoComplete="given-name" maxLength={80} value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
        </Field>
        <Field label="Nom" required error={errors.lastName}>
          <Input autoComplete="family-name" maxLength={80} value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Entreprise" required error={errors.company}>
        <Input autoComplete="organization" maxLength={120} value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} />
      </Field>
      <Field label="Adresse e-mail" hint="Elle sert d'identifiant de connexion et ne peut pas être modifiée ici.">
        <Input type="email" value={user.email} readOnly />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} loadingText="Enregistrement…" disabled={!dirty && !busy}>
          Enregistrer le profil
        </Button>
        <Badge tone="neutral">{user.role === "operator" ? "Rôle : équipe REBORN" : "Rôle : client"}</Badge>
      </div>
    </form>
  );
}

export function Settings({ privacyContact, contactMissing }: { privacyContact: string | null; contactMissing: string }) {
  const links = [
    { href: "#profil", label: "Profil" },
    { href: "#securite", label: "Sécurité" },
    { href: "#confidentialite", label: "Confidentialité" },
  ];
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-h1 font-semibold text-ink">Paramètres</h1>
        <p className="mt-1.5 text-body text-text-2">Votre profil, la sécurité de votre compte REBORN et vos données.</p>
        <nav aria-label="Rubriques des paramètres" className="mt-4">
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="btn btn-secondary btn-sm">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <SettingsSection id="profil" title="Profil" description="Votre nom et votre entreprise apparaissent dans vos projets et dans leur historique.">
        <ProfileForm />
      </SettingsSection>

      <SecuritySection />

      <PrivacySection privacyContact={privacyContact} contactMissing={contactMissing} />
    </div>
  );
}
