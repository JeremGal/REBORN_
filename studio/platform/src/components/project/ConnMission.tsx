"use client";

import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Skeleton } from "@/components/ds/Progress";
import { Facts } from "./Step";
import { useProject, useProjectData } from "./ProjectProvider";
import { connDate } from "./ConnShared";
import { missionInfo } from "./ConnAnalysis";
import { missionPreviewLine } from "./view-rules";

/*
 * Détail technique de la mission de l'agent (aperçu GET de /api/projects/[id]/mission, SANS jeton).
 * Aucun bouton ne copie la mission ni un jeton : seul l'exécuteur habilité de l'agent obtient la
 * mission avec son jeton de remise, directement auprès du Studio.
 */

export interface ConnMissionEndpoint {
  method: string;
  url: string;
  body?: string;
}

export interface ConnMissionData {
  contract: string;
  contract_version: string;
  /** null : aucune analyse demandée (aperçu de ce que contiendrait la mission, avec une note). */
  mission_id: string | null;
  status?: string | null;
  note?: string;
  project_id: string;
  target: { url: string | null; software: string | null; software_type: string | null; company: string | null };
  authorization: { by: string; at: string; statement: string } | null;
  objectives: string[];
  constraints: string[];
  credential: { username_hint?: string; expires_at?: string; credentials_expires_at?: string; handling?: string } | null;
  report: Record<string, ConnMissionEndpoint>;
}

const REPORT_LABEL: Record<string, { label: string; hint: string }> = {
  connection_status: { label: "État de connexion", hint: "Réussite, échec, double authentification ou intervention nécessaire" },
  investigation: { label: "Ouverture de l'exploration", hint: "Exploration rattachée à ce projet" },
  events: { label: "Actions et captures", hint: "Navigation, saisies, captures d'écran" },
  screens: { label: "Écrans et formulaires", hint: "Champs, valeurs possibles, sorties affichées" },
  observations: { label: "Observations", hint: "Essais menés à l'écran et résultats affichés" },
  exports: { label: "Exports obtenus", hint: "Fichiers produits par les exports autorisés" },
  heartbeat: { label: "Signe de vie de l'agent", hint: "Disponibilité et renouvellement de la prise en charge" },
  complete: { label: "Fin de mission", hint: "Résultat final et effacement des identifiants" },
};

const Sub = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <h3 className="text-body font-semibold text-ink">{children}</h3>
    {aside && <span className="text-small text-text-3">{aside}</span>}
  </div>
);

/** Contenu de la section repliée « Intégration technique » de l'étape Connexion. */
export function ConnMissionTechnical() {
  const { id } = useProject();
  const mission = useProjectData<ConnMissionData>(`/api/projects/${id}/mission`);
  const m = mission.data;

  if (mission.loading && !m) return <Skeleton lines={4} label="Chargement du détail technique…" />;
  if (!m) {
    return (
      <Alert tone="info" live="off" title="Détail technique non disponible pour ce compte">
        La mission complète est remise directement à l&apos;agent habilité, jamais au navigateur. {mission.error ? `(${mission.error})` : ""}
      </Alert>
    );
  }

  const preview = missionPreviewLine(m, (s) => missionInfo(s).label);
  return (
    <div className="flex flex-col gap-7">
      <section>
        <Sub aside={`Contrat ${m.contract} v${m.contract_version} · aperçu sans jeton`}>Mission de l&apos;agent</Sub>
        <Facts
          items={[
            // Sans demande d'analyse, le Studio renvoie un aperçu (mission_id null) accompagné d'une note : affichée telle quelle.
            { label: "Mission", value: preview.kind === "preview" ? <span className="text-text-2">{preview.text}</span> : <span className="font-mono text-small">{preview.text}</span> },
            { label: "Cible", value: m.target.url ? <span className="font-mono text-small break-all">{m.target.url}</span> : <span className="text-danger-ink">Aucune adresse renseignée</span> },
            { label: "Logiciel", value: [m.target.software, m.target.software_type].filter(Boolean).join(" · ") || "Non précisé" },
            {
              label: "Compte remis à l'agent",
              value: m.credential ? (
                <>
                  <span className="font-mono">{m.credential.username_hint ?? "masqué"}</span> · effacé le {connDate(m.credential.credentials_expires_at ?? m.credential.expires_at)}
                </>
              ) : (
                <span className="text-warning-ink">Aucun identifiant déposé</span>
              ),
            },
            { label: "Autorisation transmise", value: m.authorization ? `Confirmée par ${m.authorization.by} le ${connDate(m.authorization.at)}` : <span className="text-warning-ink">Aucune autorisation enregistrée</span> },
          ]}
        />
      </section>

      <div className="grid gap-7 lg:grid-cols-2">
        <section>
          <Sub>Objectifs</Sub>
          <ol className="flex flex-col gap-2">
            {m.objectives.map((o, i) => (
              <li key={o} className="grid grid-cols-[24px_minmax(0,1fr)] gap-1.5 text-body leading-snug text-ink">
                <span className="tabular font-mono text-meta leading-5 text-text-3">{String(i + 1).padStart(2, "0")}</span>
                <span>{o}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <Sub>Contraintes</Sub>
          <ul className="flex flex-col gap-2">
            {m.constraints.map((c) => (
              <li key={c} className="grid grid-cols-[24px_minmax(0,1fr)] gap-1.5 text-body leading-snug text-ink">
                <ShieldCheck size={15} className="mt-0.5 text-accent" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <Sub>Points de rapport de l&apos;agent</Sub>
        <ul className="divide-y divide-line rounded-panel ring-1 ring-line">
          {Object.entries(m.report).map(([key, ep]) => {
            const meta = REPORT_LABEL[key] ?? { label: key, hint: "" };
            return (
              <li key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4">
                <div className="min-w-0">
                  <div className="text-body leading-snug font-semibold text-ink">{meta.label}</div>
                  {meta.hint && <div className="text-small leading-snug text-text-2">{meta.hint}</div>}
                </div>
                <code className="block min-w-0 font-mono text-meta leading-snug break-all text-ink-2">
                  <span className="font-semibold text-accent-ink">{ep.method}</span> {ep.url}
                </code>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <Sub>Protection des identifiants</Sub>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body leading-snug text-text-2 marker:text-text-3">
          <li>Le navigateur ne reçoit jamais de jeton : seul l&apos;agent habilité obtient la mission, directement auprès du Studio.</li>
          <li>Les identifiants sont chiffrés au repos et jamais renvoyés par l&apos;API : seul un indice masqué du compte apparaît.</li>
          <li>Ils servent uniquement à l&apos;adresse déclarée et sont effacés au plus tard 24 heures après leur dépôt.</li>
        </ul>
      </section>
    </div>
  );
}
