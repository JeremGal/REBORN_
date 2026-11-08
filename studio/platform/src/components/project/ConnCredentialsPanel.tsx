"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Bot, ChevronDown, Clock3, KeyRound, LockKeyhole, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Field, Input, PasswordInput, Select } from "@/components/ds/Field";
import { Skeleton } from "@/components/ds/Progress";
import { cx } from "@/components/ds/cx";
import { LEGAL_DOCUMENTS } from "@/lib/legal";
import { Facts, Section } from "./Step";
import { useProject } from "./ProjectProvider";
import { ConnResultCallout, connApi, connDate, connRelative, useConnAction, useCredentialErasure } from "./ConnShared";

/** Durées proposées : 24 h au plus (SPEC §5). */
const TTL = [
  { value: "1", label: "1 heure" },
  { value: "4", label: "4 heures" },
  { value: "8", label: "8 heures" },
  { value: "24", label: "24 heures (maximum)" },
];

/** Attributs qui demandent aux gestionnaires de mots de passe de ne pas enregistrer ce compte tiers. */
export const NO_PASSWORD_MANAGER = { "data-1p-ignore": "true", "data-lpignore": "true", "data-bwignore": "true", "data-form-type": "other" } as const;

/**
 * Ce qu'il advient des identifiants confiés : mêmes engagements dans l'assistant et à l'étape Connexion.
 * Seulement ce que REBORN Studio fait réellement et que ses tests vérifient ; ce qui dépend de l'agent
 * (en cours d'intégration) et de son prestataire est annoncé comme prévu et non vérifié, jamais promis.
 */
export function CredentialsPromise({ className, compact }: { className?: string; compact?: boolean }) {
  const items = [
    { icon: <LockKeyhole size={16} />, title: "Chiffrés dès réception", text: "Avec une clé propre à ce dépôt ; REBORN Studio ne les réaffiche jamais, ni à vous ni à l'équipe." },
    { icon: <Clock3 size={16} />, title: "24 heures au maximum", text: "Puis supprimés automatiquement, même si personne ne revient sur le projet." },
    { icon: <Trash2 size={16} />, title: "Supprimés plus tôt dès qu'ils ne servent plus", text: "Fin de l'extraction ou de l'analyse, changement d'adresse, ou à tout moment depuis votre projet." },
    {
      icon: <Bot size={16} />,
      title: "Remis au seul agent d'analyse habilité",
      text: "Par un jeton à usage unique de 15 minutes, pour une mission en lecture seule. Prévu : l'agent les saisira hors du modèle d'IA, par le coffre de son prestataire H Company. Intégration en cours, non vérifiée à ce jour.",
    },
  ];
  return (
    <ul className={cx("grid gap-3", !compact && "sm:grid-cols-2", className)} aria-label="Ce qu'il advient de vos identifiants">
      {items.map((i) => (
        <li key={i.title} className="flex min-w-0 gap-3">
          <span aria-hidden className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
            {i.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-ink">{i.title}</span>
            <span className="block text-small leading-relaxed text-text-2">{i.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Identifiants de l'ancien logiciel : état (déposés, échéance), suppression immédiate (avec
 * confirmation), dépôt ou remplacement. Seuls l'indice masqué et l'échéance renvoyés par l'API
 * sont affichés ; les champs sont vidés après chaque envoi.
 */
export function ConnCredentialsSection() {
  const { id, details, refresh } = useProject();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("24");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [missing, setMissing] = useState<{ username?: string; password?: string }>({});
  const { busy, result, setResult, run } = useConnAction();
  const creds = details?.credentials;
  const spaced = username.length > 0 && username.trim() !== username;
  const erased = useCredentialErasure(id, creds?.stored);
  // L'avis d'une opération ne vaut que pour l'état qu'elle a produit : des identifiants « déposés » puis supprimés
  // ailleurs (changement d'adresse, échéance, fin d'extraction) ne gardent pas l'avis « Identifiants déposés ».
  const [expect, setExpect] = useState<"stored" | "none" | null>(null);
  const credState = creds ? (creds.stored ? "stored" : "none") : null;
  const notice = result && (expect === null || expect === credState) ? result : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = { username: username.trim() ? undefined : "Indiquez l'identifiant du compte.", password: password ? undefined : "Indiquez le mot de passe du compte." };
    setMissing(m);
    if (m.username || m.password) return;
    const body = { username, password, ttl_hours: Number(ttl) };
    // Le mot de passe ne reste pas dans la page : champs vidés dès l'envoi, quel que soit le résultat.
    setPassword("");
    setExpect(null);
    await run(
      "store",
      async () => {
        const r = await connApi<{ username_hint?: string; expires_at?: string }>("POST", `/api/projects/${id}/credentials`, body);
        setUsername("");
        setExpect("stored");
        return { tone: "ok", title: "Identifiants chiffrés et déposés", text: `${r.username_hint ? `Compte ${r.username_hint} · ` : ""}suppression automatique le ${connDate(r.expires_at)}.` };
      },
      { errorTitle: "Identifiants non enregistrés", after: refresh },
    );
  }

  async function remove() {
    const r = await connApi<{ revoked_at?: string }>("DELETE", `/api/projects/${id}/credentials`);
    setExpect("none");
    setResult({ tone: "ok", title: "Identifiants supprimés", text: `Ils ont été effacés${r.revoked_at ? ` le ${connDate(r.revoked_at)}` : ""}. Les données déjà récupérées sont conservées.` });
    await refresh();
  }

  if (!creds) {
    return (
      <Section title="Vos identifiants de l'ancien logiciel">
        <Skeleton lines={2} label="Lecture de l'état des identifiants…" />
      </Section>
    );
  }

  const form = (
    <form onSubmit={submit} className="flex flex-col gap-4" autoComplete="off" noValidate aria-label={creds.stored ? "Remplacer les identifiants" : "Déposer des identifiants"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Identifiant" hint="Le nom du compte dans votre logiciel." error={missing.username}>
          <Input name="legacy_username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} {...NO_PASSWORD_MANAGER} />
        </Field>
        <Field label="Mot de passe" hint="Masqué ; affichez-le un instant pour vérifier la saisie." error={missing.password}>
          <PasswordInput name="legacy_password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={500} autoComplete="off" {...NO_PASSWORD_MANAGER} />
        </Field>
      </div>
      {spaced && <p className="text-small text-warning-ink">L&apos;identifiant commence ou se termine par une espace : il sera transmis tel quel.</p>}
      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Suppression automatique après" hint="Vos identifiants sont effacés à cette échéance, même si l'analyse n'a pas eu lieu.">
          <Select name="legacy_ttl" value={ttl} onChange={(e) => setTtl(e.target.value)}>
            {TTL.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant={creds.stored ? "secondary" : "primary"} icon={<KeyRound size={16} />} loading={busy === "store"} loadingText="Chiffrement…">
          {creds.stored ? "Remplacer les identifiants" : "Chiffrer et déposer"}
        </Button>
      </div>
      <p className="text-small text-text-3">
        Détail du traitement :{" "}
        <Link href={LEGAL_DOCUMENTS.identifiants.path} target="_blank" rel="noopener" className="ds-link">
          {LEGAL_DOCUMENTS.identifiants.title} (version {LEGAL_DOCUMENTS.identifiants.version})
          <span className="sr-only"> (nouvel onglet)</span>
        </Link>
        .
      </p>
    </form>
  );

  return (
    <Section
      title="Vos identifiants de l'ancien logiciel"
      badge={creds.stored ? <StatusBadge tone="ok">Déposés et chiffrés</StatusBadge> : <StatusBadge tone="neutral">{erased ? "Effacés" : "Aucun identifiant déposé"}</StatusBadge>}
      description={
        creds.stored
          ? "L'agent les utilise pour se connecter à votre logiciel, et uniquement à l'adresse déclarée."
          : erased
            ? `Les derniers identifiants confiés ont été effacés le ${connDate(erased.at)} — ${erased.reason}. Les données déjà récupérées sont conservées ; déposez-en de nouveaux seulement si une nouvelle connexion est nécessaire.`
            : "Sans compte, l'agent ne peut pas se connecter. Vous pouvez aussi importer vos exports à l'étape Données."
      }
    >
      <div className="flex flex-col gap-5">
        {creds.stored ? (
          <>
            <Facts
              items={[
                { label: "Compte", value: <span className="font-mono text-small">{creds.username_hint ?? "masqué"}</span> },
                {
                  label: "Suppression automatique",
                  value: (
                    <>
                      {connDate(creds.expires_at)}
                      {connRelative(creds.expires_at) && <span className="text-text-3"> · {connRelative(creds.expires_at)}</span>}
                    </>
                  ),
                },
              ]}
            />
            <div>
              <Button variant="danger-subtle" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)} disabled={!!busy}>
                Supprimer mes identifiants maintenant
              </Button>
            </div>
            <ConnResultCallout result={notice} onClose={() => setResult(null)} />
            <details className="group rounded-panel ring-1 ring-line">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-4 py-2.5 text-body font-semibold text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
                Remplacer les identifiants
                <ChevronDown size={18} aria-hidden className="shrink-0 text-text-3 transition-transform duration-(--duration-base) group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-4">{form}</div>
            </details>
          </>
        ) : (
          <>
            <CredentialsPromise />
            {form}
            <ConnResultCallout result={notice} onClose={() => setResult(null)} />
          </>
        )}
      </div>
      <ConfirmationDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Supprimer vos identifiants maintenant ?"
        confirmLabel="Supprimer maintenant"
        pendingLabel="Suppression…"
        tone="danger"
      >
        Ils seront effacés immédiatement et définitivement. L&apos;agent ne pourra plus se connecter à votre logiciel tant que vous n&apos;en aurez pas déposé de nouveaux. Les données déjà récupérées sont conservées.
      </ConfirmationDialog>
    </Section>
  );
}
