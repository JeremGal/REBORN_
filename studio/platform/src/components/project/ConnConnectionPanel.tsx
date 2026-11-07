"use client";

import { useState } from "react";
import { Bot, CircleCheck, CircleDashed, PlugZap, TestTubeDiagonal, TriangleAlert } from "lucide-react";
import { Button, Panel, cx } from "@/components/ui";
import { useProject } from "./ProjectProvider";
import { CONN_STATE, CONN_WRAP_BTN, ConnFact, ConnLoading, ConnNotice, ConnTag, connByConnector, connDate, connExplain, useConnAction, type ConnTone } from "./ConnShared";

const BLOCK: Record<ConnTone, { box: string; text: string }> = {
  ok: { box: "bg-verdigris-soft", text: "text-[#0b6b5f]" },
  warn: { box: "bg-ochre-soft", text: "text-ochre" },
  bad: { box: "bg-rust-soft", text: "text-rust" },
  info: { box: "bg-[#e7eef8]", text: "text-[#2457a6]" },
  idle: { box: "bg-chalk", text: "text-ink" },
};

type Method = "agent" | "test";

/**
 * Étape 1 — état de connexion réel (details.connection) et préalables. Le test du connecteur HTTP
 * n'est proposé que si l'opérateur choisit explicitement le logiciel de test Relatio 2004.
 */
export function ConnConnectionPanel() {
  const { id, summary, details, post, refresh } = useProject();
  const [method, setMethod] = useState<Method>("agent");
  const { busy, result, run } = useConnAction();

  if (!summary || !details) {
    return (
      <Panel eyebrow="Connexion à l'ancien logiciel" title="État de la connexion">
        <ConnLoading label="Lecture de l'état du projet…" />
      </Panel>
    );
  }

  const c = details.connection;
  const s = CONN_STATE[c?.status ?? "none"];
  const tone = BLOCK[s.tone];
  const Icon = s.icon;
  const creds = details.credentials;
  const paused = summary.status === "PAUSED";
  const stepDone = summary.progress.steps.find((x) => x.id === "connection")?.done ?? false;
  const viaExports = stepDone && c?.status !== "connected";
  const explain = connExplain(c?.detail);
  const otherSoftware = !!summary.software && !/relatio/i.test(summary.software) ? summary.software : null;

  async function testConnection() {
    await run(
      "test",
      async () => {
        const r = await post<{ detail?: string }>(`/api/projects/${id}/connection/test`, { plan: "test" });
        return { tone: "ok", title: "Jeu de test — Relatio 2004 : connexion réussie", text: `${r.detail ?? "Session ouverte"} · connecteur HTTP REBORN, plan d'extraction de test.` };
      },
      { errorTitle: "Jeu de test — Relatio 2004 : test non abouti", after: refresh },
    );
  }

  return (
    <Panel eyebrow="Connexion à l'ancien logiciel" title="État de la connexion">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* État rapporté ---------------------------------------------------- */}
        <div className={cx("self-start rounded-md p-4", tone.box)}>
          <div className="flex items-start gap-3">
            <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-full bg-paper shadow-[0_0_0_1px_var(--color-line)]", tone.text)}>
              <Icon size={19} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={cx("text-[19px] leading-tight font-black tracking-[-0.015em]", tone.text)}>{s.label}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink/80">{s.text}</p>
              {c && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-sediment">
                  <span>
                    Rapporté par <b className="text-ink">{c.by}</b> · {connDate(c.at)}
                  </span>
                  {connByConnector(c.by) ? (
                    <ConnTag tone="warn" title="Test de connexion par formulaire, effectué par REBORN sans l'agent Computer Use">
                      Connecteur HTTP REBORN
                    </ConnTag>
                  ) : (
                    <ConnTag tone="info" title="État transmis par l'API de rapport de connexion">
                      Rapport d&apos;agent
                    </ConnTag>
                  )}
                </p>
              )}
              {c && connByConnector(c.by) && (
                <p className="mt-1 text-[12px] text-sediment">Établie par un test de formulaire du connecteur HTTP de REBORN, sans l&apos;agent Computer Use de H Company.</p>
              )}
            </div>
          </div>
          {c?.detail && (
            <div className="mt-3 rounded-sm bg-paper/75 px-3 py-2">
              <div className="eyebrow">Détail rapporté</div>
              <p className="mt-0.5 text-[12.5px] break-words text-ink">{c.detail}</p>
              {explain && <p className="mt-1 text-[12px] text-sediment">{explain}</p>}
            </div>
          )}
        </div>

        {/* Préalables -------------------------------------------------------- */}
        <div className="min-w-0">
          <div className="eyebrow mb-2">Préalables à la connexion</div>
          <ul className="flex flex-col gap-2.5">
            <Prerequisite
              state={details.authorization ? "ok" : "warn"}
              label="Autorisation du propriétaire"
              value={details.authorization ? `Confirmée par ${details.authorization.by}` : "Non enregistrée"}
            />
            <Prerequisite
              state={creds.stored ? "ok" : "missing"}
              label="Identifiants confiés"
              value={creds.stored ? `Compte ${creds.username_hint ?? "masqué"} · effacés le ${connDate(creds.expires_at)}` : "Aucun identifiant confié"}
            />
            <Prerequisite state={summary.legacy_url ? "ok" : "missing"} label="Adresse de l'ancien logiciel" value={summary.legacy_url ?? "Non renseignée"} mono={!!summary.legacy_url} />
          </ul>
          <dl className="mt-3 border-t border-line pt-3">
            <ConnFact label="Étape 1 du parcours">
              {stepDone ? (
                viaExports ? (
                  <span>Franchie sans connexion rapportée : des exports ont déjà été déposés (étape Données).</span>
                ) : (
                  <span className="text-[#0b6b5f]">Franchie : connexion confirmée.</span>
                )
              ) : (
                <span className="text-sediment">Non franchie : en attente d&apos;une connexion confirmée ou d&apos;exports déposés.</span>
              )}
            </ConnFact>
          </dl>
        </div>
      </div>

      {/* Qui établit la connexion ? ------------------------------------------ */}
      <fieldset className="mt-5 border-t border-line pt-4">
        <legend className="sr-only">Qui établit la connexion ?</legend>
        <div className="mb-2 text-[12.5px] font-bold text-ink" aria-hidden>
          Qui établit la connexion ?
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <MethodOption
            checked={method === "agent"}
            onChange={() => setMethod("agent")}
            icon={Bot}
            title="Agent Computer Use (Mouss)"
            text="Logiciel réel du client : l'agent de H Company se connecte avec le compte confié et rapporte l'état."
          />
          <MethodOption
            checked={method === "test"}
            onChange={() => setMethod("test")}
            icon={TestTubeDiagonal}
            title="Logiciel de test Relatio 2004 (plan d'extraction de test)"
            tag="Jeu de test"
            text="Test réel du connecteur HTTP de REBORN sur le formulaire de connexion décrit par le plan de test."
            test
          />
        </div>

        <div className="mt-3">
          {method === "agent" ? (
            <ConnNotice tone="idle" icon={Bot} title={c && !connByConnector(c.by) ? `Connexion suivie par l'agent : dernier rapport de ${c.by}` : "En attente de l'agent Computer Use"}>
              Pour un logiciel réel, REBORN ne dispose d&apos;aucun connecteur automatique : c&apos;est l&apos;agent qui se connecte, puis rapporte une réussite, un échec, une double
              authentification ou un besoin d&apos;intervention. Aucune connexion n&apos;est affichée comme réussie sans ce rapport.{" "}
              <a href="#mission" className="font-bold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                Préparer la mission de l&apos;agent
              </a>
            </ConnNotice>
          ) : (
            <div className="flex flex-col gap-3 rounded-md bg-ochre-soft/45 p-3 shadow-[inset_0_0_0_1px_rgb(168_107_18/0.25)]">
              <div className="flex flex-wrap items-center gap-2">
                <ConnTag tone="warn">Jeu de test — Relatio 2004</ConnTag>
                <span className="text-[12px] text-sediment">Ce test ne fait pas intervenir l&apos;agent de H Company.</span>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <ConnFact label="Adresse testée" mono={!!summary.legacy_url}>
                  {summary.legacy_url ?? "Celle décrite par le plan de test (aucune adresse renseignée pour ce projet)"}
                </ConnFact>
                <ConnFact label="Compte utilisé">{creds.stored ? <span className="font-mono text-[12px]">{creds.username_hint ?? "masqué"}</span> : <span className="text-rust">Aucun identifiant confié</span>}</ConnFact>
              </dl>
              {otherSoftware && (
                <ConnNotice tone="warn" title="Logiciel différent du jeu de test">
                  Ce projet vise « {otherSoftware} ». Le plan de test décrit Relatio 2004 : un résultat, même positif, ne prouverait rien pour ce logiciel.
                </ConnNotice>
              )}
              <p className="text-[12px] leading-relaxed text-sediment">
                Le résultat réel est enregistré dans le projet. Un refus fait passer le projet à l&apos;état « Échec — intervention requise ».
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button variant="primary" onClick={testConnection} disabled={!creds.stored || paused || !!busy || !!otherSoftware} title={otherSoftware ? "Le plan de test ne s'applique qu'à Relatio 2004" : undefined} className={CONN_WRAP_BTN}>
                  <PlugZap size={14} className="shrink-0" aria-hidden /> {busy === "test" ? "Test en cours…" : "Tester la connexion (connecteur HTTP REBORN)"}
                </Button>
                {!creds.stored && <span className="text-[12px] text-sediment">Confiez d&apos;abord des identifiants (panneau Identifiants).</span>}
                {paused && <span className="text-[12px] text-sediment">Projet en pause : reprenez-le pour lancer un test.</span>}
              </div>
            </div>
          )}
        </div>
      </fieldset>

      {result && <ConnNotice live tone={result.tone} title={result.title} className="mt-3">{result.text}</ConnNotice>}
    </Panel>
  );
}

function Prerequisite({ state, label, value, mono }: { state: "ok" | "missing" | "warn"; label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      {state === "ok" ? (
        <CircleCheck size={15} className="mt-0.5 shrink-0 text-verdigris" aria-label="Fait" />
      ) : state === "warn" ? (
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ochre" aria-label="À vérifier" />
      ) : (
        <CircleDashed size={15} className="mt-0.5 shrink-0 text-silt" aria-label="Manquant" />
      )}
      <span className="min-w-0">
        <span className="block text-[12.5px] leading-tight font-bold text-ink">{label}</span>
        <span className={cx("block text-[12px] leading-snug text-sediment", mono ? "font-mono text-[11.5px] break-all" : "break-words")}>{value}</span>
      </span>
    </li>
  );
}

function MethodOption({
  checked,
  onChange,
  icon: Icon,
  title,
  text,
  tag,
  test,
}: {
  checked: boolean;
  onChange: () => void;
  icon: typeof Bot;
  title: string;
  text: string;
  tag?: string;
  test?: boolean;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-2.5 rounded-sm p-3 transition-[background-color,box-shadow] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-verdigris",
        checked
          ? test
            ? "bg-ochre-soft shadow-[inset_0_0_0_1.5px_var(--color-ochre)]"
            : "bg-verdigris-soft shadow-[inset_0_0_0_1.5px_var(--color-verdigris)]"
          : "bg-chalk shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-chalk-2",
      )}
    >
      <input type="radio" name="connection-method" checked={checked} onChange={onChange} className="sr-only" />
      <Icon size={16} className={cx("mt-0.5 shrink-0", checked ? (test ? "text-ochre" : "text-verdigris") : "text-silt")} aria-hidden />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] leading-tight font-bold text-ink">{title}</span>
          {tag && <ConnTag tone="warn">{tag}</ConnTag>}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-sediment">{text}</span>
      </span>
    </label>
  );
}
