"use client";

import { ClipboardCopy, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { useProject, useProjectData } from "./ProjectProvider";
import { CONN_WRAP_BTN, ConnFact, ConnHeading, ConnLoading, ConnNotice, connCopyJson, connDate, connHour, useConnAction, useConnOrigin } from "./ConnShared";

/* Contrat « connection_mission » renvoyé par /api/projects/[id]/mission (le jeton n'existe que dans la réponse du POST). */
export interface ConnMissionEndpoint {
  method: string;
  url: string;
  body?: string;
}

export interface ConnMissionData {
  contract: string;
  contract_version: string;
  mission_id: string;
  project_id: string;
  target: { url: string | null; software: string | null; software_type: string | null; company: string | null };
  authorization: { by: string; at: string; statement: string } | null;
  objectives: string[];
  constraints: string[];
  credential: { username_hint?: string; expires_at?: string; redeem_url?: string; token?: string } | null;
  report: Record<string, ConnMissionEndpoint>;
}

const REPORT_LABEL: Record<string, { label: string; hint: string }> = {
  connection_status: { label: "État de connexion", hint: "Réussite, échec, double authentification ou intervention nécessaire" },
  investigation: { label: "Ouverture de l'exploration", hint: "Investigation rattachée à ce projet, en mode agents réels" },
  events: { label: "Actions et captures", hint: "Clics, saisies, navigation, captures d'écran" },
  screens: { label: "Écrans et formulaires", hint: "Champs, valeurs possibles, sorties affichées" },
  observations: { label: "Observations", hint: "Essais menés à l'écran et résultats affichés" },
  exports: { label: "Exports obtenus", hint: "Fichiers produits par les mécanismes d'export autorisés" },
};

/** Ce que l'agent doit rapporter, et où (points de rapport de la mission). */
export function ConnMissionReportList({ report }: { report: Record<string, ConnMissionEndpoint> }) {
  const origin = useConnOrigin();
  const entries = Object.entries(report);
  return (
    <div>
      <ul className="flex flex-col divide-y divide-line rounded-md bg-paper shadow-[0_0_0_1px_var(--color-line)]">
        {entries.map(([key, ep]) => {
          const meta = REPORT_LABEL[key] ?? { label: key, hint: "" };
          return (
            <li key={key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-3">
              <div className="min-w-0">
                <div className="text-[12.5px] leading-tight font-bold text-ink">{meta.label}</div>
                {meta.hint && <div className="text-[11.5px] leading-snug text-sediment">{meta.hint}</div>}
              </div>
              <div className="min-w-0">
                <code className="block font-mono text-[11.5px] leading-snug break-all text-ink-2">
                  <span className="font-medium text-verdigris">{ep.method}</span> {ep.url}
                </code>
                {ep.body && (
                  <details className="group mt-1">
                    <summary className="cursor-pointer list-none text-[11.5px] font-bold text-silt hover:text-ink [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Voir le format attendu</span>
                      <span className="hidden group-open:inline">Masquer le format</span>
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded-xs bg-chalk px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap text-sediment">{ep.body}</pre>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {origin && entries.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-silt">
          Adresses relatives à cette plateforme : <span className="font-mono">{origin}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Mission de l'agent Computer Use : aperçu (GET, sans jeton) et préparation (POST, jeton de remise
 * à usage unique). La mission préparée est copiée dans le presse-papiers sans jamais être affichée.
 */
export function ConnMissionPanel() {
  const { id, summary, post, refresh } = useProject();
  const mission = useProjectData<ConnMissionData>(`/api/projects/${id}/mission`);
  const { busy, result, run } = useConnAction();
  const paused = summary?.status === "PAUSED";
  const m = mission.data;

  async function prepare() {
    await run(
      "prepare",
      async () => {
        const pending = post<ConnMissionData>(`/api/projects/${id}/mission`);
        const copied = await connCopyJson(pending);
        const prepared = await pending;
        // Seules des informations non secrètes sont conservées pour le message : jamais le jeton.
        const missionId = prepared.mission_id;
        const withToken = typeof prepared.credential?.token === "string";
        const until = withToken ? prepared.credential?.expires_at : undefined;
        if (!copied) {
          return {
            tone: "bad",
            title: "Copie refusée par le navigateur",
            text: `La mission ${missionId} a été préparée mais n'a pas pu être copiée. ${withToken ? "Son jeton n'est pas affiché et ne pourra pas être récupéré : autorisez l'accès au presse-papiers puis préparez une nouvelle mission (le nouveau jeton remplace le précédent)." : "Autorisez l'accès au presse-papiers puis recommencez."}`,
          };
        }
        return withToken
          ? {
              tone: "ok",
              title: `Mission ${missionId} copiée dans le presse-papiers`,
              text: `Jeton de remise à usage unique inclus, valable jusqu'à ${connHour(until)}. Collez la mission uniquement dans l'exécuteur de l'agent, jamais dans une conversation avec un modèle de langage.`,
            }
          : {
              tone: "warn",
              title: `Mission ${missionId} copiée, sans jeton de remise`,
              text: "Aucun identifiant n'est confié au projet : l'agent recevra ses objectifs et ses contraintes, mais pas de compte pour se connecter.",
            };
      },
      { errorTitle: "Mission non préparée", after: refresh },
    );
  }

  return (
    <div id="mission" className="scroll-mt-20">
      <Panel eyebrow="Agent Computer Use · H Company" title="Mission pour l'agent Computer Use (Mouss)">
        {mission.loading && !m ? (
          <ConnLoading label="Chargement de la mission…" lines={4} />
        ) : !m ? (
          <ConnNotice tone="bad" title="Mission indisponible">
            {mission.error ?? "Réponse vide de l'API."}
          </ConnNotice>
        ) : (
          <div className="flex flex-col gap-5">
            {mission.error && (
              <ConnNotice tone="warn" title="Dernière mise à jour impossible">
                {mission.error} — l&apos;aperçu affiché est le dernier reçu.
              </ConnNotice>
            )}
            <p className="text-[12.5px] leading-relaxed text-sediment">
              Générée par REBORN à partir du projet : ce que l&apos;agent doit faire, ce qu&apos;il ne doit jamais faire, et où rapporter chaque résultat.
            </p>

            <dl className="grid gap-3 sm:grid-cols-2">
              <ConnFact label="Cible" mono={!!m.target.url}>
                {m.target.url ?? <span className="font-sans text-rust">Aucune adresse renseignée pour l&apos;ancien logiciel</span>}
              </ConnFact>
              <ConnFact label="Logiciel">{[m.target.software, m.target.software_type].filter(Boolean).join(" · ") || "Non précisé"}</ConnFact>
              <ConnFact label="Compte remis à l'agent">
                {m.credential ? (
                  <>
                    <span className="font-mono text-[12px]">{m.credential.username_hint ?? "masqué"}</span> · identifiants effacés le {connDate(m.credential.expires_at)}
                  </>
                ) : (
                  <span className="text-ochre">Aucun identifiant confié : pas de jeton de remise</span>
                )}
              </ConnFact>
              <ConnFact label="Autorisation transmise">
                {m.authorization ? `Confirmée par ${m.authorization.by} le ${connDate(m.authorization.at)}` : <span className="text-ochre">Aucune autorisation enregistrée</span>}
              </ConnFact>
            </dl>

            <div className="grid gap-5 lg:grid-cols-2">
              <section>
                <ConnHeading>Objectifs</ConnHeading>
                <ol className="flex flex-col gap-1.5">
                  {m.objectives.map((o, i) => (
                    <li key={o} className="grid grid-cols-[20px_minmax(0,1fr)] gap-1.5 text-[12.5px] leading-snug text-ink">
                      <span className="tabular font-mono text-[11px] leading-[18px] text-silt">{String(i + 1).padStart(2, "0")}</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <ConnHeading>Contraintes</ConnHeading>
                <ul className="flex flex-col gap-1.5">
                  {m.constraints.map((c) => (
                    <li key={c} className="grid grid-cols-[20px_minmax(0,1fr)] gap-1.5 text-[12.5px] leading-snug text-ink">
                      <ShieldCheck size={13} className="mt-0.5 text-verdigris" aria-hidden />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section>
              <ConnHeading aside={`Contrat ${m.contract} v${m.contract_version}`}>Points de rapport</ConnHeading>
              <ConnMissionReportList report={m.report} />
            </section>

            {/* Préparation ------------------------------------------------- */}
            <div className="rounded-md bg-chalk p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
              <div className="flex items-start gap-2.5">
                <LockKeyhole size={16} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-ink">Remise à l&apos;exécuteur de l&apos;agent</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-sediment">
                    {m.credential
                      ? "La mission préparée contient un jeton de remise des identifiants à usage unique, valable 15 minutes. Il n'est jamais affiché : la mission complète est copiée dans votre presse-papiers, à coller uniquement dans le code technique de l'exécuteur, jamais dans une conversation avec un modèle de langage. Préparer une nouvelle mission invalide le jeton précédent."
                      : "Aucun identifiant n'est confié : la mission sera copiée sans jeton de remise. Confiez d'abord des identifiants si l'agent doit se connecter."}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button variant="primary" onClick={prepare} disabled={paused || !!busy} className={CONN_WRAP_BTN}>
                  <ClipboardCopy size={14} className="shrink-0" aria-hidden /> {busy === "prepare" ? "Préparation…" : "Préparer la mission pour l'exécuteur de l'agent"}
                </Button>
                {paused && <span className="text-[12px] text-sediment">Projet en pause : reprenez-le pour préparer une mission.</span>}
              </div>
              {result && <ConnNotice live tone={result.tone} title={result.title} className="mt-3">{result.text}</ConnNotice>}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
