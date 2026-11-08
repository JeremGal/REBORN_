"use client";

import { useState, type FormEvent } from "react";
import { Pencil, PlugZap } from "lucide-react";
import { Alert, type AlertTone } from "@/components/ds/Alert";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Field, Input, RadioGroup } from "@/components/ds/Field";
import { Facts, Section, TestBadge } from "./Step";
import { useProject, type ProjectDetails, type ProjectSummary } from "./ProjectProvider";
import { CONN_STATE, ConnResultCallout, connApi, connByConnector, connByTestPlan, connDate, connErrorText, connExplain, legacyUrlProblem, useConnAction } from "./ConnShared";

/** Logiciel visé par le projet s'il diffère du jeu de test : le plan de test ne décrit que Relatio 2004. */
export function connOtherSoftware(summary: ProjectSummary | null): string | null {
  return summary?.software && !/relatio/i.test(summary.software) ? summary.software : null;
}

/**
 * Le logiciel de test (jeu de test Relatio 2004) n'est proposé qu'à un projet qui le nomme : un nom de logiciel
 * laissé vide (champ facultatif) ne fait jamais tester l'adresse d'un vrai client avec le plan de test.
 */
export const connTestApplies = (summary: ProjectSummary | null): boolean => /relatio/i.test(summary?.software ?? "");

/** Chiffre « Connexion » du haut de page, lu dans le dernier rapport reçu. */
export function connConnectionMetric(details: ProjectDetails | null): { value: string; tone?: "ok" | "warn" | "bad"; hint?: string } {
  if (!details) return { value: "—" };
  const c = details.connection;
  const s = CONN_STATE[c?.status ?? "none"];
  return { value: s.metric, tone: s.metricTone, hint: c ? `${connByConnector(c.by) ? "Test du connecteur" : "Rapport de l'agent"} · ${connDate(c.at)}` : "Aucune connexion rapportée" };
}

const TONE: Record<string, AlertTone> = { ok: "ok", warn: "warn", bad: "bad", info: "info" };

/**
 * Dernier rapport de connexion réellement reçu (agent, ou test réel du connecteur HTTP).
 * Rien n'est présenté comme réussi sans lui ; les changements sont annoncés poliment.
 */
export function ConnConnectionReport() {
  const { details } = useProject();
  const c = details?.connection;
  if (!c) return null;
  const s = CONN_STATE[c.status] ?? CONN_STATE.none;
  const explain = connExplain(c.detail);
  const humanAction = c.status === "mfa_required" || c.status === "human_needed";
  return (
    <Alert
      tone={TONE[s.tone]}
      live="polite"
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          Dernier rapport de connexion : {s.title.charAt(0).toLowerCase() + s.title.slice(1)}
          {connByTestPlan(c.by) && <TestBadge />}
        </span>
      }
    >
      {c.detail && <p className="break-words">{c.detail}</p>}
      {explain && <p className="mt-1">{explain}</p>}
      {(humanAction || !c.detail) && <p className="mt-1">{s.text}</p>}
      <p className="mt-1 text-small text-text-3">
        {connByConnector(c.by) ? "Test du connecteur HTTP de REBORN, sans l'agent" : `Rapporté par ${c.by}`} · {connDate(c.at)}
      </p>
    </Alert>
  );
}

/**
 * « Votre logiciel » : informations déclarées, et l'adresse de connexion modifiable. Changer
 * l'adresse supprime les identifiants déposés (ils ne partent jamais vers une autre adresse).
 */
export function ConnSoftwareSection() {
  const { id, summary, details, refresh } = useProject();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const action = useConnAction();
  if (!summary) return null;
  const stored = !!details?.credentials?.stored;

  const save = async () => {
    await connApi("PATCH", `/api/projects/${id}`, { legacy_url: url.trim() });
    setEditing(false);
    action.setResult({ tone: "ok", title: url.trim() ? "Adresse de connexion enregistrée" : "Adresse de connexion retirée", text: stored ? "Vos identifiants ont été supprimés : déposez-en de nouveaux pour cette adresse." : undefined });
    await refresh();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = legacyUrlProblem(url);
    setProblem(p);
    if (p) return;
    if (url.trim() === (summary?.legacy_url ?? "")) {
      setEditing(false);
      return;
    }
    if (stored) {
      setConfirm(true);
      return;
    }
    await action.run("save", save, { errorTitle: "Adresse non enregistrée" });
  }

  return (
    <Section title="Votre logiciel" description="Ce que vous avez déclaré à la création du projet.">
      <div className="flex flex-col gap-4">
        <Facts
          items={[
            { label: "Entreprise", value: summary.company ?? summary.name },
            { label: "Logiciel", value: [summary.software, details?.software_type].filter(Boolean).join(" · ") || "Non précisé" },
            {
              label: "Adresse de connexion",
              value: summary.legacy_url ? <span className="font-mono text-small break-all">{summary.legacy_url}</span> : <span className="text-text-3">Non renseignée</span>,
            },
          ]}
        />
        {editing ? (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3" aria-label="Modifier l'adresse de connexion">
            <Field label="Nouvelle adresse de connexion" hint="La seule adresse que l'agent ouvrira. Laissez vide pour la retirer." error={problem}>
              <Input name="legacy_url" type="url" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://logiciel.exemple.fr" />
            </Field>
            {stored && <p className="text-small text-warning-ink">Changer l&apos;adresse supprimera les identifiants déposés.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" loading={action.busy === "save"} loadingText="Enregistrement…">
                Enregistrer l&apos;adresse
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil size={14} />}
              onClick={() => {
                setUrl(summary.legacy_url ?? "");
                setProblem(null);
                setEditing(true);
              }}
            >
              {summary.legacy_url ? "Modifier l'adresse" : "Renseigner l'adresse"}
            </Button>
          </div>
        )}
        <ConnResultCallout result={action.result} onClose={() => action.setResult(null)} />
      </div>
      <ConfirmationDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={save}
        title="Changer l'adresse de connexion ?"
        confirmLabel="Changer et supprimer les identifiants"
        pendingLabel="Enregistrement…"
        tone="danger"
      >
        Vos identifiants ont été confiés pour l&apos;adresse actuelle : ils seront supprimés immédiatement. Vous en déposerez de nouveaux pour la nouvelle adresse.
      </ConfirmationDialog>
    </Section>
  );
}

/**
 * Qui établit la connexion : l'agent d'analyse (logiciel réel) ou le connecteur HTTP de REBORN
 * sur le logiciel de test Relatio 2004 (jeu de test, test RÉEL de connexion). Proposé seulement
 * si le projet nomme Relatio 2004 (connTestApplies).
 */
export function ConnTestConnector() {
  const { id, summary, details, post, refresh } = useProject();
  const [method, setMethod] = useState<"agent" | "test">("agent");
  const action = useConnAction();
  if (!summary || !details || !connTestApplies(summary)) return null;
  const creds = details.credentials;
  const paused = summary.status === "PAUSED";

  async function test() {
    await action.run(
      "test",
      async () => {
        const r = await post<{ detail?: string }>(`/api/projects/${id}/connection/test`, { plan: "test" });
        return { tone: "ok", title: "Connecté — jeu de test Relatio 2004", text: r.detail ?? "Connexion établie par le connecteur HTTP de REBORN." };
      },
      { errorTitle: "Test non abouti — jeu de test Relatio 2004", after: refresh },
    );
  }

  return (
    <Section title="Qui établit la connexion ?" description="Votre logiciel réel est toujours analysé par l'agent ; le logiciel de test sert à vérifier le connecteur de REBORN.">
      <div className="flex flex-col gap-4">
        <RadioGroup
          legend="Qui établit la connexion ?"
          legendHidden
          name="connection_method"
          value={method}
          onChange={(v) => setMethod(v as "agent" | "test")}
          options={[
            { value: "agent", label: "L'agent d'analyse, sur votre logiciel", hint: "Il se connecte avec le compte déposé quand vous demandez l'analyse." },
            { value: "test", label: "Logiciel de test Relatio 2004", hint: "Test réel du connecteur HTTP de REBORN, sans l'agent (jeu de test)." },
          ]}
        />
        {method === "test" && (
          <div className="flex flex-col gap-4 rounded-panel bg-warning-soft/50 px-4 py-4 ring-1 ring-warning/30">
            <TestBadge className="self-start" />
            <Facts
              items={[
                { label: "Adresse testée", value: summary.legacy_url ? <span className="font-mono text-small break-all">{summary.legacy_url}</span> : "Celle du plan de test (aucune adresse renseignée)" },
                { label: "Compte utilisé", value: creds.stored ? <span className="font-mono text-small">{creds.username_hint ?? "masqué"}</span> : <span className="text-danger-ink">Aucun identifiant déposé</span> },
              ]}
            />
            {!creds.stored && <p className="text-small text-text-2">Déposez d&apos;abord des identifiants : le test utilise le compte du projet.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={<PlugZap size={16} />} onClick={test} loading={action.busy === "test"} loadingText="Test en cours…" disabled={!creds.stored || paused}>
                Tester la connexion
              </Button>
              <span className="text-small text-text-3">Un refus fait passer le projet à l&apos;état « Échec — intervention requise ».</span>
            </div>
            {action.result && <ConnResultCallout result={action.result.tone === "bad" ? { ...action.result, text: <TestError text={action.result.text} /> } : action.result} />}
          </div>
        )}
      </div>
    </Section>
  );
}

function TestError({ text }: { text: unknown }) {
  const msg = typeof text === "string" ? text : connErrorText(text);
  const explain = connExplain(msg);
  return (
    <>
      <span className="block break-words">{msg}</span>
      {explain && <span className="mt-1 block">{explain}</span>}
    </>
  );
}
