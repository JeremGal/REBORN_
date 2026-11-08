"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Badge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Skeleton } from "@/components/ds/Progress";
import { useToast } from "@/components/ds/Toast";
import { formatDateTime } from "@/components/ds/format";
import { redirectToLogin, useReborn } from "@/components/RebornProvider";
import { lastCredentialErasure } from "@/components/project/ConnShared";
import { projectName } from "@/components/shell/journey";
import { useProjectEntries } from "@/components/shell/useProjects";
import { CONSENT_NATURE, LEGAL_DOCUMENTS, type ConsentKind } from "@/lib/legal";
import { SettingsSection } from "./Settings";

/**
 * Confidentialité : historique des consentements (GET /api/me), identifiants de l'ancien logiciel
 * confiés à chaque projet avec effacement immédiat (DELETE /api/projects/[id]/credentials),
 * comment demander une suppression, documents juridiques.
 */

interface Consent {
  id: string;
  project_id: string | null;
  kind: ConsentKind;
  document: string;
  version: string;
  statement_sha256: string;
  accepted_at: string;
}

const KIND_LABEL: Record<ConsentKind, string> = {
  terms_acceptance: "Acceptation des conditions d'utilisation",
  privacy_acknowledgement: "Prise de connaissance de la politique de confidentialité",
  source_authorization: "Autorisation d'accès à l'ancien logiciel",
  credentials_notice: "Information sur le traitement des identifiants",
};
const NATURE_LABEL = { contrat: "Contrat", information: "Information", autorisation: "Autorisation" } as const;

/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:05 »). */
const full = (iso: string) => formatDateTime(iso);

function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "effacement en cours";
  const min = Math.round(ms / 60_000);
  return min < 60 ? `dans ${min} min` : `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

function Consents({ names }: { names: Map<string, string> }) {
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.status === 401) return redirectToLogin();
      const d = (await r.json().catch(() => null)) as { consents?: Consent[]; error?: string } | null;
      if (!r.ok || !Array.isArray(d?.consents)) throw new Error(d?.error ?? `erreur ${r.status}`);
      setConsents(d.consents);
      setError(null);
    } catch (e) {
      setError(e instanceof TypeError ? "REBORN ne répond pas." : `Lecture impossible (${(e as Error).message}).`);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-lead font-semibold text-ink">Historique des consentements</h3>
        <p className="mt-1 text-small text-text-2">Chaque acceptation est enregistrée avec la version du texte, sa date et l&apos;empreinte du texte exact.</p>
      </div>
      {error && (
        <Alert tone="bad" action={<Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={load}>Réessayer</Button>}>
          {error}
        </Alert>
      )}
      {!consents && !error && <Skeleton lines={3} label="Chargement des consentements…" />}
      {consents && consents.length === 0 && <p className="text-body text-text-2">Aucun consentement enregistré.</p>}
      {consents && consents.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
            {[...consents].reverse().map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-ink">{KIND_LABEL[c.kind] ?? c.kind}</p>
                  <p className="mt-0.5 text-small text-text-2">
                    Version {c.version} · le {full(c.accepted_at)}
                    {c.project_id ? ` · projet ${names.get(c.project_id) ?? c.project_id}` : " · compte"}
                  </p>
                </div>
                <Badge tone="neutral">{NATURE_LABEL[CONSENT_NATURE[c.kind]] ?? "—"}</Badge>
              </li>
            ))}
          </ul>
          <details className="text-small text-text-2">
            <summary className="inline-flex min-h-6 cursor-pointer items-center font-medium text-text-2 hover:text-ink max-sm:min-h-11">Avancé : empreintes des textes acceptés (SHA-256)</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {[...consents].reverse().map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span>{KIND_LABEL[c.kind] ?? c.kind} :</span>
                  <code className="font-mono text-meta break-all text-text-3">{c.statement_sha256}</code>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function Credentials({ entries, error, reload }: ReturnType<typeof useProjectEntries>) {
  const { toast } = useToast();
  const { state } = useReborn();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);

  async function erase() {
    if (!target) return;
    const r = await fetch(`/api/projects/${target.id}/credentials`, { method: "DELETE", cache: "no-store" });
    if (r.status === 401) {
      redirectToLogin();
      return;
    }
    const d = (await r.json().catch(() => null)) as { error?: string; revoked_at?: string } | null;
    if (!r.ok) throw new Error(d?.error ?? `Effacement refusé (erreur ${r.status}). Réessayez.`);
    toast({ tone: "ok", title: "Identifiants effacés", description: `${target.name} : ${d?.revoked_at ? `effacés le ${full(d.revoked_at)}.` : "effacés."} Les données déjà récupérées sont conservées.` });
    await reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-lead font-semibold text-ink">Accès à votre ancien logiciel</h3>
        <p className="mt-1 text-small text-text-2">
          Identifiants confiés à vos projets : chiffrés, jamais affichés, effacés automatiquement au plus tard 24 heures après leur dépôt. Vous pouvez les effacer dès maintenant ; les
          données déjà récupérées sont conservées.
        </p>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      {!entries && !error && <Skeleton lines={2} label="Chargement des projets…" />}
      {entries && entries.length === 0 && <p className="text-body text-text-2">Aucun projet : aucun identifiant confié.</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
          {entries.map((e) => {
            const c = e.details?.credentials;
            const name = projectName(e.summary);
            // Effacés (fin d'extraction, échéance, demande…) : date et raison lues dans le journal du projet
            const erased = c && !c.stored ? lastCredentialErasure(state?.events, e.summary.id, state?.investigations ?? []) : null;
            return (
              <li key={e.summary.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <KeyRound size={17} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink">{name}</p>
                    <p className="mt-0.5 text-small text-text-2">
                      {!e.details
                        ? "État des identifiants indisponible."
                        : c?.stored
                          ? `Confiés${c.username_hint ? ` (compte ${c.username_hint})` : ""} · effacement automatique le ${c.expires_at ? `${full(c.expires_at)} (${remaining(c.expires_at)})` : "—"}`
                          : erased
                            ? `Identifiants effacés le ${full(erased.at)} — ${erased.reason}.`
                            : "Aucun identifiant confié."}
                    </p>
                  </div>
                </div>
                {c?.stored && (
                  <Button variant="danger-subtle" size="sm" onClick={() => setTarget({ id: e.summary.id, name })}>
                    Effacer maintenant
                    <span className="sr-only"> ({name})</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmationDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={erase}
        title="Effacer les identifiants maintenant ?"
        confirmLabel="Effacer les identifiants"
        pendingLabel="Effacement…"
        tone="danger"
      >
        Les identifiants confiés au projet {target?.name} seront effacés immédiatement et ne pourront plus servir. Les données déjà récupérées sont conservées. Pour une nouvelle
        analyse, il faudra confier un nouvel accès.
      </ConfirmationDialog>
    </div>
  );
}

export function PrivacySection({ privacyContact, contactMissing }: { privacyContact: string | null; contactMissing: string }) {
  const projects = useProjectEntries({ details: true });
  const names = new Map((projects.entries ?? []).map((e) => [e.summary.id, projectName(e.summary)]));
  return (
    <SettingsSection id="confidentialite" title="Confidentialité" description="Ce que vous avez accepté, les accès confiés à vos projets, et comment demander une suppression.">
      <Consents names={names} />
      <Credentials {...projects} />
      <div className="flex flex-col gap-3">
        <h3 className="text-lead font-semibold text-ink">Demander une suppression</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed text-text-2">
          <li>Identifiants de l&apos;ancien logiciel : bouton « Effacer maintenant » ci-dessus, ou dans le projet.</li>
          <li>
            Compte, projet ou données d&apos;un projet :{" "}
            {privacyContact ? (
              <>
                écrivez à <strong className="font-semibold text-ink">{privacyContact}</strong>.
              </>
            ) : (
              <>
                demande auprès de l&apos;équipe REBORN. <strong className="font-semibold text-ink">{contactMissing}</strong>
              </>
            )}
          </li>
        </ul>
        <p className="text-body text-text-2">
          Documents :{" "}
          <Link href={LEGAL_DOCUMENTS.conditions.path} className="ds-link">
            {LEGAL_DOCUMENTS.conditions.title} (version {LEGAL_DOCUMENTS.conditions.version})
          </Link>{" "}
          ·{" "}
          <Link href={LEGAL_DOCUMENTS.confidentialite.path} className="ds-link">
            {LEGAL_DOCUMENTS.confidentialite.title} (version {LEGAL_DOCUMENTS.confidentialite.version})
          </Link>
        </p>
      </div>
    </SettingsSection>
  );
}
