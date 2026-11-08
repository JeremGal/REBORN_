"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Building2, FileUp, KeyRound, Pencil, Radar, RotateCcw, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { Checkbox, Field, Input, PasswordInput, RadioGroup, Select } from "@/components/ds/Field";
import { Stepper, type StepperStep } from "@/components/ds/Stepper";
import { cx } from "@/components/ds/cx";
import { Facts } from "@/components/project/Step";
import { AGENT_UNAVAILABLE, missionInfo, requestAnalysis, type AnalysisState } from "@/components/project/ConnAnalysis";
import { CredentialsPromise, NO_PASSWORD_MANAGER } from "@/components/project/ConnCredentialsPanel";
import { connApi, connDate, connErrorText, legacyUrlProblem } from "@/components/project/ConnShared";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS, consentStatement } from "@/lib/legal";

/*
 * Nouvelle migration : assistant en trois temps (votre logiciel, accès, confidentialité et
 * autorisation), puis « Analyser mon logiciel » : création du projet (POST /api/projects, avec
 * les versions des textes acceptés) et demande d'analyse (POST /api/projects/[id]/analysis).
 * Le mot de passe ne quitte la mémoire de la page que pour être envoyé, n'est jamais écrit dans
 * le stockage du navigateur et le champ est vidé dès l'envoi. Les cases ne sont jamais pré-cochées.
 * Noms de champs stables (tests) : company, software, legacy_url, software_type, access_mode,
 * legacy_username, legacy_password, authorization, credentials_notice.
 */

const TYPES = ["CRM (gestion des clients)", "ERP", "Facturation et devis", "Gestion commerciale", "Comptabilité", "Logiciel métier spécifique", "Autre"];
const STEPS = ["Votre logiciel", "Accès", "Confidentialité et autorisation"] as const;
type StepIndex = 0 | 1 | 2;
type AccessMode = "account" | "none";
type Errors = Partial<Record<"company" | "software" | "legacy_url" | "legacy_username" | "legacy_password" | "authorization" | "credentials_notice", string>>;

interface Info {
  company: string;
  software: string;
  legacy_url: string;
  software_type: string;
  access: AccessMode;
  username: string;
}

interface Outcome {
  id: string;
  company: string;
  credentials: { stored: boolean; username_hint?: string; expires_at?: string } | null;
  /** null : pas d'adresse, aucune analyse demandée. */
  analysis: { ok: true; state: AnalysisState } | { ok: false; error: string } | null;
  withoutCredentials: boolean;
}

const EMPTY: Info = { company: "", software: "", legacy_url: "", software_type: "", access: "account", username: "" };
/** « 2026-11-07 » → « 07/11/2026 » (sans passer par un fuseau horaire). */
const isoDay = (d: string) => d.split("-").reverse().join("/");

export default function NewProject() {
  const [info, setInfo] = useState<Info>(EMPTY);
  // Le mot de passe vit à part, en mémoire de la page seulement (jamais dans le stockage du navigateur).
  const [password, setPassword] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [noticeRead, setNoticeRead] = useState(false);
  const [step, setStep] = useState<StepIndex>(0);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<"form" | "creating" | "requesting" | "done">("form");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const hasUrl = info.legacy_url.trim() !== "";
  const withAccount = hasUrl && info.access === "account";
  const set = (k: keyof Info) => (v: string) => {
    setInfo((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k === "username" ? "legacy_username" : k]: undefined }));
  };

  // À chaque changement d'étape, puis à l'affichage du résultat, le focus va au titre : il est annoncé.
  // Pendant l'envoi, le focus reste sur le bouton (en chargement).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (phase === "done") heading.current?.focus();
  }, [phase]);

  function validate(s: StepIndex): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (!info.company.trim()) e.company = "Indiquez le nom de votre entreprise.";
      else if (info.company.trim().length > 120) e.company = "120 caractères au plus.";
      if (info.software.trim().length > 120) e.software = "120 caractères au plus.";
      const p = legacyUrlProblem(info.legacy_url);
      if (p) e.legacy_url = p;
    }
    if (s === 1 && withAccount) {
      if (!info.username.trim()) e.legacy_username = "Indiquez l'identifiant du compte, ou choisissez « Je ne confie pas de compte ».";
      if (!password) e.legacy_password = "Indiquez le mot de passe du compte.";
    }
    if (s === 2) {
      if (!authorized) e.authorization = "Cochez cette case pour confirmer votre autorisation : sans elle, rien ne peut être analysé.";
      if (withAccount && password && !noticeRead) e.credentials_notice = "Confirmez avoir pris connaissance du traitement de vos identifiants.";
    }
    return e;
  }

  function focusFirst(e: Errors) {
    const name = Object.keys(e)[0];
    if (!name) return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`form [name="${name}"]`)?.focus());
  }

  function go(s: StepIndex) {
    moved.current = true;
    setErrors({});
    setStep(s);
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return focusFirst(e);
    if (step < 2) go((step + 1) as StepIndex);
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (phase !== "form") return;
    if (step < 2) return next();
    // Toutes les étapes sont revérifiées avant l'envoi
    for (const s of [0, 1, 2] as StepIndex[]) {
      const e = validate(s);
      if (Object.keys(e).length) {
        if (s !== step) go(s);
        setErrors(e);
        return focusFirst(e);
      }
    }
    await create();
  }

  async function create() {
    setSubmitError(null);
    setPhase("creating");
    const credentials = withAccount ? { username: info.username, password, ttl_hours: 24 } : undefined;
    const body = {
      company: info.company.trim(),
      software: info.software.trim() || undefined,
      legacy_url: info.legacy_url.trim() || undefined,
      software_type: info.software_type || undefined,
      authorized: true as const,
      authorization_version: AUTHORIZATION_DECLARATION.version,
      ...(credentials ? { credentials, credentials_notice_version: LEGAL_DOCUMENTS.identifiants.version } : {}),
    };
    // Envoyé une fois : le champ est vidé aussitôt, quel que soit le résultat.
    setPassword("");
    let project: { id: string; company: string | null; name: string };
    try {
      project = (await connApi<{ project: { id: string; company: string | null; name: string } }>("POST", "/api/projects", body)).project;
    } catch (e) {
      setPhase("form");
      setSubmitError(`${connErrorText(e)}${credentials ? " Par sécurité, le mot de passe saisi a été effacé : saisissez-le à nouveau à l'étape Accès." : ""}`);
      return;
    }

    let analysis: Outcome["analysis"] = null;
    if (body.legacy_url) {
      setPhase("requesting");
      try {
        analysis = { ok: true, state: await requestAnalysis(project.id, !credentials) };
      } catch (e) {
        analysis = { ok: false, error: connErrorText(e) };
      }
    }
    let creds: Outcome["credentials"] = null;
    try {
      creds = (await connApi<{ details: { credentials: Outcome["credentials"] } }>("GET", `/api/projects/${project.id}`)).details.credentials;
    } catch {
      /* état des identifiants relu à l'étape Connexion */
    }
    moved.current = true;
    setOutcome({ id: project.id, company: project.company ?? project.name, credentials: creds, analysis, withoutCredentials: !credentials });
    setPhase("done");
  }

  async function retryAnalysis() {
    if (!outcome) return;
    try {
      const state = await requestAnalysis(outcome.id, outcome.withoutCredentials);
      setOutcome({ ...outcome, analysis: { ok: true, state } });
    } catch (e) {
      setOutcome({ ...outcome, analysis: { ok: false, error: connErrorText(e) } });
    }
  }

  const stepper: StepperStep[] = STEPS.map((label, i) => ({
    label,
    status: phase === "done" || i < step ? "done" : i === step ? "current" : "upcoming",
  }));

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div>
        <Link href="/projets" className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-small font-semibold text-text-2 transition-colors hover:text-ink sm:min-h-8">
          <ArrowLeft size={14} aria-hidden /> Mes projets
        </Link>
        <h1 className="mt-1 text-h1 font-semibold text-ink">Nouvelle migration</h1>
        <p className="mt-2 max-w-[640px] text-lead leading-relaxed text-text-2">Trois étapes pour confier votre logiciel à REBORN. Rien n&apos;est lancé avant votre confirmation finale.</p>
      </div>

      <Stepper steps={stepper} orientation="horizontal" label="Étapes de la nouvelle migration" />

      {phase === "done" && outcome ? (
        <Result outcome={outcome} heading={heading} onRetry={retryAnalysis} />
      ) : (
        <form onSubmit={submit} noValidate autoComplete="off" className="rounded-panel bg-surface ring-1 ring-line" aria-labelledby="etape-titre">
          <header className="border-b border-line px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
            <p className="eyebrow">Étape {step + 1} sur 3</p>
            <h2 id="etape-titre" ref={heading} tabIndex={-1} className="mt-1 text-h2 font-semibold text-ink">
              {STEPS[step]}
            </h2>
            <p className="mt-1.5 max-w-[640px] text-body leading-relaxed text-text-2">
              {step === 0 && "Ces informations permettent à l'agent de trouver votre logiciel, et à vous de reconnaître votre projet."}
              {step === 1 && "Pour analyser votre logiciel, l'agent doit s'y connecter comme vous le feriez. Créez de préférence un compte dédié, en lecture seule."}
              {step === 2 && "Relisez vos informations, puis autorisez l'analyse. Rien n'est lancé avant votre clic."}
            </p>
          </header>

          <div className="flex flex-col gap-6 px-5 py-6 sm:px-7">
            {step === 0 && <StepSoftware info={info} set={set} errors={errors} />}
            {step === 1 && (
              <StepAccess
                info={info}
                set={set}
                password={password}
                setPassword={(v) => {
                  setPassword(v);
                  setErrors((e) => ({ ...e, legacy_password: undefined }));
                }}
                errors={errors}
                hasUrl={hasUrl}
              />
            )}
            {step === 2 && (
              <StepConsent
                info={info}
                withAccount={withAccount}
                authorized={authorized}
                setAuthorized={(v) => {
                  setAuthorized(v);
                  setErrors((e) => ({ ...e, authorization: undefined }));
                }}
                noticeRead={noticeRead}
                setNoticeRead={(v) => {
                  setNoticeRead(v);
                  setErrors((e) => ({ ...e, credentials_notice: undefined }));
                }}
                errors={errors}
                onEdit={go}
                passwordMissing={withAccount && !password}
              />
            )}
            {submitError && (
              <Alert tone="bad" title="Le projet n'a pas été créé">
                {submitError}
              </Alert>
            )}
          </div>

          <footer className="flex flex-col-reverse gap-3 rounded-b-panel border-t border-line bg-canvas px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              {step > 0 && (
                <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => go((step - 1) as StepIndex)} disabled={phase !== "form"} className="max-sm:w-full">
                  Retour
                </Button>
              )}
            </div>
            {step < 2 ? (
              <Button type="submit" variant="primary" iconEnd={<ArrowRight size={16} />} className="max-sm:w-full">
                Continuer
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="lg"
                icon={hasUrl ? <Radar size={18} /> : <Building2 size={18} />}
                loading={phase !== "form"}
                loadingText={phase === "requesting" ? "Demande d'analyse…" : "Création du projet…"}
                className="max-sm:w-full"
              >
                {hasUrl ? "Analyser mon logiciel" : "Créer le projet"}
              </Button>
            )}
          </footer>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 1 — Votre logiciel                                             */
/* ------------------------------------------------------------------ */

function StepSoftware({ info, set, errors }: { info: Info; set: (k: keyof Info) => (v: string) => void; errors: Errors }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Nom de votre entreprise" required hint="Pour nommer le projet et le logiciel qui vous sera livré." error={errors.company} className="sm:col-span-2">
        <Input name="company" value={info.company} onChange={(e) => set("company")(e.target.value)} maxLength={120} autoComplete="organization" placeholder="Ex. Morel Équipements" />
      </Field>
      <Field label="Nom de votre logiciel" hint="Tel qu'il apparaît à l'écran, par exemple sur sa page de connexion." error={errors.software}>
        <Input name="software" value={info.software} onChange={(e) => set("software")(e.target.value)} maxLength={120} autoComplete="off" placeholder="Ex. Relatio 2004" />
      </Field>
      <Field label="Type de logiciel" hint="Facultatif : aide l'agent à repérer les modules habituels.">
        <Select name="software_type" value={info.software_type} onChange={(e) => set("software_type")(e.target.value)}>
          <option value="">Je ne sais pas</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Adresse de connexion"
        hint="L'adresse où vous vous connectez à votre logiciel : c'est la seule que l'agent ouvrira. Laissez vide si vous n'avez que des fichiers exportés."
        error={errors.legacy_url}
        className="sm:col-span-2"
      >
        <Input name="legacy_url" type="url" inputMode="url" value={info.legacy_url} onChange={(e) => set("legacy_url")(e.target.value)} maxLength={500} autoComplete="off" spellCheck={false} placeholder="https://logiciel.exemple.fr" />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 2 — Accès                                                      */
/* ------------------------------------------------------------------ */

function StepAccess({
  info,
  set,
  password,
  setPassword,
  errors,
  hasUrl,
}: {
  info: Info;
  set: (k: keyof Info) => (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  errors: Errors;
  hasUrl: boolean;
}) {
  if (!hasUrl) {
    return (
      <Alert tone="info" live="off" title="Aucun accès à confier">
        Vous n&apos;avez pas indiqué d&apos;adresse de connexion : l&apos;agent ne se connectera pas à votre logiciel. Après la création du projet, vous importerez vos exports (CSV, Excel, JSON, SQL…) à l&apos;étape Données.
      </Alert>
    );
  }
  return (
    <>
      <RadioGroup
        legend="Comment l'agent accède-t-il à votre logiciel ?"
        name="access_mode"
        value={info.access}
        onChange={(v) => set("access")(v)}
        options={[
          { value: "account", label: "Je confie un compte de connexion (recommandé)", hint: "L'agent pourra ouvrir les écrans et les exports auxquels ce compte a droit, et rien de plus." },
          { value: "none", label: "Je ne confie pas de compte pour l'instant", hint: "L'agent ne verra que les pages accessibles sans connexion. Vous pourrez confier un compte plus tard." },
        ]}
      />
      {info.access === "account" && (
        <div className="flex flex-col gap-5 rounded-panel bg-canvas px-4 py-5 ring-1 ring-line sm:px-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Identifiant" required hint="Le nom du compte dans votre logiciel." error={errors.legacy_username}>
              <Input name="legacy_username" value={info.username} onChange={(e) => set("username")(e.target.value)} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} {...NO_PASSWORD_MANAGER} />
            </Field>
            <Field label="Mot de passe" required hint="Masqué ; affichez-le un instant pour vérifier la saisie." error={errors.legacy_password}>
              <PasswordInput name="legacy_password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={500} autoComplete="off" {...NO_PASSWORD_MANAGER} />
            </Field>
          </div>
          <p className="flex items-start gap-2 text-small leading-relaxed text-text-2">
            <ShieldCheck size={16} aria-hidden className="mt-px shrink-0 text-accent" />
            <span>Consigne donnée à l&apos;agent : consulter seulement, sans jamais modifier vos données ni contourner une protection (double authentification comprise).</span>
          </p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-ink">Ce qu&apos;il advient de vos identifiants</h3>
        <CredentialsPromise />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Étape 3 — Confidentialité et autorisation                            */
/* ------------------------------------------------------------------ */

function StepConsent({
  info,
  withAccount,
  authorized,
  setAuthorized,
  noticeRead,
  setNoticeRead,
  errors,
  onEdit,
  passwordMissing,
}: {
  info: Info;
  withAccount: boolean;
  authorized: boolean;
  setAuthorized: (v: boolean) => void;
  noticeRead: boolean;
  setNoticeRead: (v: boolean) => void;
  errors: Errors;
  onEdit: (s: StepIndex) => void;
  passwordMissing: boolean;
}) {
  const notice = consentStatement("credentials_notice");
  const doc = LEGAL_DOCUMENTS.identifiants;
  return (
    <>
      <section aria-labelledby="recap" className="border-b border-line pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <h3 id="recap" className="text-body font-semibold text-ink">
            Récapitulatif
          </h3>
          <span className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(0)}>
              Modifier le logiciel
            </Button>
            <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => onEdit(1)}>
              Modifier l&apos;accès
            </Button>
          </span>
        </div>
        <div>
          <Facts
            items={[
              { label: "Entreprise", value: info.company.trim() },
              { label: "Logiciel", value: [info.software.trim(), info.software_type].filter(Boolean).join(" · ") || "Non précisé" },
              { label: "Adresse de connexion", value: info.legacy_url.trim() ? <span className="font-mono text-small break-all">{info.legacy_url.trim()}</span> : "Aucune : import de fichiers seulement" },
              { label: "Accès", value: withAccount ? <>Compte <span className="font-mono text-small">{info.username}</span>, mot de passe masqué</> : info.legacy_url.trim() ? "Aucun compte confié" : "Sans objet" },
            ]}
          />
          {passwordMissing && (
            <Alert tone="warn" className="mt-4" live="off" title="Mot de passe à saisir à nouveau">
              Le mot de passe a été effacé par sécurité.{" "}
              <button type="button" className="ds-link" onClick={() => onEdit(1)}>
                Revenir à l&apos;étape Accès
              </button>
            </Alert>
          )}
        </div>
      </section>

      <section aria-labelledby="confidentialite" className="flex flex-col gap-3">
        <h3 id="confidentialite" className="text-body font-semibold text-ink">
          Confidentialité, en résumé
        </h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed text-text-2 marker:text-text-3">
          <li>Les informations de votre logiciel servent uniquement à mener l&apos;analyse et la migration de ce projet.</li>
          {withAccount && (
            <li>
              Vos identifiants servent uniquement à se connecter à l&apos;adresse indiquée : chiffrés, supprimés au plus tard 24 heures après leur dépôt, remis au seul agent d&apos;analyse
              habilité. Prévu : l&apos;agent les saisira hors du modèle d&apos;IA ; cette intégration est en cours et n&apos;est pas vérifiée à ce jour.
            </li>
          )}
          <li>Les données récupérées de votre logiciel restent dans votre projet, séparées de vos identifiants ; aucun autre client de REBORN n&apos;y a accès.</li>
          <li>
            Les traitements sont faits par REBORN Studio, son connecteur, l&apos;agent d&apos;analyse habilité et son prestataire H Company (navigateur et coffre hébergés, durée de
            conservation non documentée à ce jour), ainsi que par l&apos;Analyste de REBORN, qui lit les données récupérées pour proposer les correspondances.
          </li>
        </ul>
        <p className="text-small text-text-3">
          {/* Nouvel onglet : ouvrir le texte ne doit pas faire perdre la saisie de l'assistant (PR-03) */}
          <Link href={doc.path} target="_blank" rel="noopener" className="ds-link">
            Lire la politique de confidentialité — {doc.title.toLowerCase()}
            <span className="sr-only"> (nouvel onglet)</span>
          </Link>{" "}
          (version {doc.version}, s&apos;ouvre dans un nouvel onglet).
        </p>
      </section>

      <fieldset className="flex flex-col gap-4 rounded-panel bg-canvas px-4 py-4 ring-1 ring-line sm:px-5">
        <legend className="sr-only">Autorisation et information</legend>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">Autorisation · obligatoire</span>
          <Checkbox
            name="authorization"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
            label={AUTHORIZATION_DECLARATION.text}
            hint={`Déclaration d'autorisation, version ${AUTHORIZATION_DECLARATION.version} du ${isoDay(AUTHORIZATION_DECLARATION.effective)}. Elle est enregistrée à votre nom avec ce projet.`}
            error={errors.authorization}
          />
        </div>
        {withAccount && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <span className="eyebrow">Information · obligatoire avec un compte</span>
            <Checkbox name="credentials_notice" checked={noticeRead} onChange={(e) => setNoticeRead(e.target.checked)} label={notice.text} hint={
                <>
                  Le texte est consultable ici :{" "}
                  <Link href={doc.path} target="_blank" rel="noopener" className="ds-link">
                    {doc.title}
                    <span className="sr-only"> (nouvel onglet)</span>
                  </Link>{" "}
                  (nouvel onglet : votre saisie est conservée).
                </>
              } error={errors.credentials_notice} />
          </div>
        )}
      </fieldset>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Résultat                                                             */
/* ------------------------------------------------------------------ */

function Result({ outcome, heading, onRetry }: { outcome: Outcome; heading: React.RefObject<HTMLHeadingElement | null>; onRetry: () => Promise<void> }) {
  const base = `/projets/${outcome.id}`;
  const a = outcome.analysis;
  const state = a?.ok ? a.state : null;
  const unavailable = !!state && !state.executor_available && (!state.mission || state.mission.status === "queued");
  const importBtn = (primary: boolean) => (
    <Button href={`${base}/extraction#importer`} variant={primary ? "primary" : "secondary"} icon={<FileUp size={16} />} className="max-sm:w-full">
      Importer mes fichiers
    </Button>
  );
  const followBtn = (primary: boolean, label = "Suivre l'analyse") => (
    <Button href={`${base}/connexion`} variant={primary ? "primary" : "secondary"} iconEnd={<ArrowRight size={16} />} className="max-sm:w-full">
      {label}
    </Button>
  );

  let block: ReactNode;
  let actions: ReactNode;
  if (!a) {
    block = (
      <Alert tone="info" live="off" title="Aucune analyse automatique">
        Sans adresse de connexion, l&apos;agent ne peut pas explorer votre logiciel. Importez vos exports pour commencer ; vous pourrez renseigner l&apos;adresse plus tard à l&apos;étape Connexion.
      </Alert>
    );
    actions = (
      <>
        {followBtn(false, "Ouvrir le projet")}
        {importBtn(true)}
      </>
    );
  } else if (!a.ok) {
    block = (
      <Alert
        tone="bad"
        title="La demande d'analyse n'a pas été enregistrée"
        action={
          <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={onRetry}>
            Réessayer
          </Button>
        }
      >
        {a.error} Votre projet, lui, est bien créé : vous pouvez réessayer, ou importer vos exports dès maintenant.
      </Alert>
    );
    actions = (
      <>
        {followBtn(false, "Ouvrir le projet")}
        {importBtn(true)}
      </>
    );
  } else if (unavailable) {
    block = (
      <Alert tone="warn" title={AGENT_UNAVAILABLE}>
        Votre projet est conservé et votre demande attend en file d&apos;attente{state?.mission?.expires_at ? ` jusqu'au ${connDate(state.mission.expires_at)}` : ""}. Aucune exploration n&apos;a commencé. En attendant, vous pouvez importer les exports de votre logiciel.
      </Alert>
    );
    actions = (
      <>
        {followBtn(false, "Suivre la demande")}
        {importBtn(true)}
      </>
    );
  } else {
    const info = missionInfo(state?.mission?.status);
    block = (
      <Alert tone="info" title="Demande d'analyse transmise">
        État : {info.label.toLowerCase()}. {info.text} {state?.message && state.message !== AGENT_UNAVAILABLE ? state.message : ""}
      </Alert>
    );
    actions = (
      <>
        {importBtn(false)}
        {followBtn(true)}
      </>
    );
  }

  const creds = outcome.credentials;
  return (
    <section aria-labelledby="resultat-titre" className="rounded-panel bg-surface ring-1 ring-line">
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-7">
        <StatusBadge tone="ok" className="self-start">
          Projet créé
        </StatusBadge>
        <div>
          <h2 id="resultat-titre" ref={heading} tabIndex={-1} className="text-h2 font-semibold text-ink">
            Le projet « {outcome.company} » est enregistré
          </h2>
          <p className="mt-1.5 text-body leading-relaxed text-text-2">Il apparaît dans « Mes projets ». Vous pouvez fermer cette page : rien n&apos;est perdu.</p>
        </div>
        {block}
        <Facts
          items={[
            {
              label: "Identifiants",
              value: creds?.stored ? (
                <>
                  Chiffrés · supprimés automatiquement le {connDate(creds.expires_at)}
                </>
              ) : outcome.withoutCredentials ? (
                "Aucun identifiant confié"
              ) : (
                "État consultable à l'étape Connexion"
              ),
            },
            { label: "Demande d'analyse", value: state?.mission ? `${missionInfo(state.mission.status).label} · demandée le ${connDate(state.mission.created_at)}` : a && !a.ok ? "Non enregistrée" : "Aucune" },
          ]}
        />
      </div>
      <footer className={cx("flex flex-col gap-3 rounded-b-panel border-t border-line bg-canvas px-5 py-4 sm:flex-row sm:justify-end sm:px-7")}>{actions}</footer>
    </section>
  );
}
