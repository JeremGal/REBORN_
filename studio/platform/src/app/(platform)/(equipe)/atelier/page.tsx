"use client";

import Link from "next/link";
import { ArrowUpRight, CircleStop } from "lucide-react";
import { useReborn } from "@/components/RebornProvider";
import { LaunchPanel } from "@/components/LaunchPanel";
import { EventFeed } from "@/components/EventFeed";
import { CoreSample } from "@/components/CoreSample";
import { ScenarioPanel } from "@/components/ScenarioPanel";
import { Button, ButtonLink, Panel, pct, cx, timeOf } from "@/components/ui";
import { MODE_INFO } from "@/lib/modes";
import type { RebornState } from "@/lib/types";

export default function MissionControl() {
  const { state, error, model, active, report, app } = useReborn();
  if (!state) return <div className="py-24 text-center text-silt">{error ?? "Chargement…"}</div>;

  const hasRun = state.investigations.length > 0;
  const obs = active ? state.observations.filter((o) => o.investigation_id === active.id) : state.observations;
  const refusals = obs.filter((o) => o.status === "error").length;
  const lastAction = [...state.events].reverse().find((e) => e.source === "explorer");
  const byStatus = (s: string) => model?.rules.filter((r) => (r.validation_status ?? "hypothesis") === s).length ?? 0;
  const avgConf = model?.rules.length ? model.rules.reduce((a, r) => a + (r.confidence ?? 0), 0) / model.rules.length : null;
  const running = active?.status === "running";
  const drifts = active ? state.events.filter((e) => e.type === "drift" && e.investigation_id === active.id).length : 0;
  const local = active ? MODE_INFO[active.mode].group === "local" : false;

  async function stop() {
    if (!active) return;
    const r = await fetch("/api/investigations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: active.id }) });
    if (!r.ok) window.alert(r.status === 401 ? "Session expirée : reconnectez-vous à REBORN." : `Arrêt impossible (HTTP ${r.status})`);
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <div className="rounded-md bg-rust-soft px-4 py-2 text-[13px] text-rust">{error}</div>}

      {/* Contexte : quel logiciel, quel statut, quelle version -------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">
            {active ? (
              <>
                {active.kind === "blind_challenge" ? "Blind Challenge" : "Investigation"} #{active.number} ·{" "}
                <span className={local ? "text-ochre" : "text-verdigris"}>{local ? `mode local · ${MODE_INFO[active.mode].label}` : "agents réels"}</span>
              </>
            ) : (
              "Aucune investigation"
            )}
          </div>
          <h1 className="mt-1 text-[26px] leading-tight font-black tracking-[-0.025em]">
            {active ? (
              <>
                {active.application} <span className="font-normal text-sediment">· {active.module}</span>
              </>
            ) : (
              "Retrouver l'intelligence métier enfermée dans un logiciel historique"
            )}
          </h1>
          {active && (
            <p className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-sediment">
              <span className={cx("font-bold", running ? "text-verdigris" : active.status === "failed" ? "text-rust" : "text-ink")}>
                {running ? (local ? "Données locales en cours de réception" : "Exploration en cours") : active.status === "failed" ? "Investigation en échec" : "Investigation terminée"}
              </span>
              <span>· modèle métier {model ? `v${model.version}` : "non publié"}</span>
              <span>· interface {app?.schema_version ? `v${app.schema_version}` : "non décrite"}</span>
              {drifts > 0 && <span className="font-bold text-rust">· {drifts} écart{drifts > 1 ? "s" : ""} détecté{drifts > 1 ? "s" : ""}</span>}
            </p>
          )}
        </div>
        {running && (
          <Button variant="quiet" size="sm" onClick={stop}>
            <CircleStop size={13} /> Arrêter l&apos;exploration
          </Button>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Point focal : la preuve -------------------------------------------- */}
          {hasRun ? (
            <section className="card p-5">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div>
                  <div className="eyebrow">Équivalence comportementale</div>
                  <div
                    className={cx(
                      "tabular mt-1 text-[56px] leading-none font-black tracking-[-0.04em]",
                      report?.equivalence == null ? "text-dust" : report.equivalence === 1 ? "text-verdigris" : "text-rust",
                    )}
                  >
                    {pct(report?.equivalence ?? null)}
                  </div>
                  <p className="mt-2 max-w-md text-[13px] text-sediment">
                    {report?.equivalence == null
                      ? model
                        ? "En attente d'observations du logiciel historique."
                        : "En attente du modèle métier pour reconstruire le calcul."
                      : `${report.matched} comportements identiques sur ${report.scored} expériences comparées (modèle v${model?.version}).`}
                  </p>
                </div>
                <dl className="grid grid-cols-3 gap-x-7 gap-y-1 text-[12px]">
                  <Stat label="Construction" value={report?.construction_total ? `${report.construction_matched}/${report.construction_total}` : "—"} hint="cas ayant servi de preuve aux règles" />
                  <Stat label="Validation" value={report?.independent_total ? `${report.independent_matched}/${report.independent_total}` : "—"} hint="cas indépendants, jamais utilisés comme preuve" />
                  <Stat label="Écarts" value={String(report?.mismatched ?? 0)} tone={report?.mismatched ? "bad" : undefined} />
                </dl>
              </div>
              <div className="mt-5">
                <CoreSample rows={report?.rows ?? []} />
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-silt">
                  <span>Une tranche par expérience · foncé : construction · clair : validation · rouge : écart</span>
                  <Link href="/comparaison" className="font-bold text-ink hover:text-verdigris">
                    Preuve détaillée et limites →
                  </Link>
                </div>
              </div>
              {report?.limitations.length ? <p className="mt-3 border-t border-line pt-3 text-[12px] text-sediment">{report.limitations.slice(1, 3).join(" ")}</p> : null}
            </section>
          ) : (
            <Panel eyebrow="Étape 1" title="Lancer une investigation">
              <p className="mb-4 max-w-2xl text-[13px] text-sediment">
                Donnez accès à l&apos;interface d&apos;un logiciel autorisé. Avec les agents réels, l&apos;agent H Company de Mouss l&apos;explore comme un opérateur, l&apos;analyste
                d&apos;Alan en déduit les règles métier, et REBORN génère une application moderne dont chaque sortie est comparée à l&apos;original. En mode local, aucun agent
                n&apos;intervient : rejouez un scénario de référence (colonne de droite) ou une répétition.
              </p>
              <LaunchPanel />
            </Panel>
          )}

          {/* Pipeline ------------------------------------------------------------ */}
          <div className="grid gap-5 md:grid-cols-3">
            <Stage n="01" verb="Explorer" who={!active || !local ? "Mouss · Computer Use (H Company)" : `Mode local · ${MODE_INFO[active.mode].label}`} href="/investigation" cta="Exploration en direct">
              <Big value={obs.length} unit={`expérience${obs.length > 1 ? "s" : ""}`} />
              <ul className="mt-2 space-y-0.5 text-[12px] text-sediment">
                <li>{app?.schema_version ? `Interface v${app.schema_version} : ${app.stats.fields_total} champs` : "Écran non encore décrit"}</li>
                <li>{refusals ? `${refusals} refus métier observé${refusals > 1 ? "s" : ""}` : "Aucun refus métier observé"}</li>
              </ul>
              {lastAction && (
                <p className="mt-2 truncate border-t border-line pt-2 text-[12px] text-silt" title={lastAction.title}>
                  Dernière action : {lastAction.title}
                </p>
              )}
            </Stage>
            <Stage n="02" verb="Comprendre" who={model?.source === "fixture" ? "Mode local · modèle de référence" : "Alan · Rétro-ingénierie"} href="/regles" cta="Modèle métier">
              <Big value={model?.rules.length ?? 0} unit={model ? `règles · v${model.version}` : "règle"} />
              <ul className="mt-2 space-y-0.5 text-[12px] text-sediment">
                <li>
                  {byStatus("validated")} validées · {byStatus("tested")} testées · {byStatus("hypothesis")} hypothèses
                </li>
                <li>Confiance moyenne {avgConf === null ? "—" : `${Math.round(avgConf * 100)} %`}</li>
              </ul>
            </Stage>
            <Stage n="03" verb="Reconstruire" who="Jerem · Application générée" href="/reconstruction" cta="Chaîne de reconstruction">
              <Big value={app ? `${app.stats.fields_supported}/${app.stats.fields_total}` : "—"} unit="champs reconstruits" />
              <ul className="mt-2 space-y-0.5 text-[12px] text-sediment">
                <li>
                  {app?.stats.rules_executable ?? 0} règles exécutées · {app?.stats.outputs ?? 0} sortie{(app?.stats.outputs ?? 0) > 1 ? "s" : ""}
                </li>
                <li>{app?.unsupported.length ? `${app.unsupported.length} élément${app.unsupported.length > 1 ? "s" : ""} non repris (signalé${app.unsupported.length > 1 ? "s" : ""})` : "Aucun élément non repris"}</li>
              </ul>
              {model && app?.fields.length ? (
                <ButtonLink href="/app" target="_blank" variant="accent" className="mt-3 h-8 w-full text-[12px]">
                  Ouvrir l&apos;application <ArrowUpRight size={13} />
                </ButtonLink>
              ) : null}
            </Stage>
          </div>
        </div>

        {/* Colonne droite ------------------------------------------------------ */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel eyebrow="Parcours 1 · agents réels" title="Investigation avec Mouss et Alan">
            <AgentLinks state={state} />
            {hasRun && !(running && !local) && (
              <div className="mt-3 border-t border-line pt-3">
                <LaunchPanel compact only="live" />
              </div>
            )}
          </Panel>
          <Panel eyebrow="Parcours 2 · mode local, sans agent" title="Scénarios de référence">
            <p className="mb-3 text-[12px] leading-snug text-sediment">
              Données au format exact des envois de Mouss et d&apos;Alan, rejouées par les mêmes API. Elles valident la plateforme ; elles ne proviennent d&apos;aucun agent.
            </p>
            <ScenarioPanel />
            {hasRun && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">Répétition avec l&apos;explorateur intégré</summary>
                <div className="mt-3">
                  <LaunchPanel compact only="simulation" />
                </div>
              </details>
            )}
          </Panel>
          <Panel
            eyebrow="Journal de fouille"
            title="En direct"
            actions={
              <Link href="/investigation" className="text-[12px] font-bold text-sediment hover:text-ink">
                Tout voir
              </Link>
            }
          >
            <EventFeed events={state.events} limit={12} dense />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "bad"; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="text-silt">{label}</dt>
      <dd className={cx("tabular text-[18px] font-bold", tone === "bad" ? "text-rust" : "text-ink")}>{value}</dd>
    </div>
  );
}

function Big({ value, unit }: { value: number | string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="tabular text-[28px] leading-none font-black tracking-[-0.02em]">{value}</span>
      <span className="text-[12px] font-bold text-sediment">{unit}</span>
    </div>
  );
}

function Stage({ n, verb, who, href, cta, children }: { n: string; verb: string; who: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <section className="card relative flex flex-col overflow-hidden p-4 pt-5">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-verdigris" />
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-silt">{n}</span>
        <h2 className="text-[14px] font-black tracking-[0.02em] uppercase">{verb}</h2>
      </div>
      <div className="mb-3 text-[12px] text-silt">{who}</div>
      <div className="flex-1">{children}</div>
      <Link href={href} className="mt-3 text-[12px] font-bold text-ink hover:text-verdigris">
        {cta} →
      </Link>
    </section>
  );
}

/** État des liaisons avec les modules réels (uniquement les envois rattachés à des investigations « agents réels »). */
function AgentLinks({ state }: { state: RebornState }) {
  const live = new Set(state.investigations.filter((i) => i.mode === "live").map((i) => i.id));
  const lastExplorer = [...state.events].reverse().find((e) => e.source === "explorer" && live.has(e.investigation_id ?? ""));
  const lastAnalystModel = [...state.models].reverse().find((m) => m.source === "analyst");
  const lastAnalystEvent = [...state.events].reverse().find((e) => e.source === "analyst" && live.has(e.investigation_id ?? ""));
  const rows = [
    { who: "Explorer · Mouss", ok: !!lastExplorer, text: lastExplorer ? `dernier envoi à ${timeOf(lastExplorer.ts)}` : "aucun envoi reçu" },
    {
      who: "Analyste · Alan",
      ok: !!(lastAnalystModel || lastAnalystEvent),
      text: lastAnalystModel ? `modèle v${lastAnalystModel.version} reçu à ${timeOf(lastAnalystModel.received_at)}` : lastAnalystEvent ? `dernier envoi à ${timeOf(lastAnalystEvent.ts)}` : "aucun modèle reçu",
    },
  ];
  return (
    <div>
      <ul className="flex flex-col gap-1.5 text-[12.5px]">
        {rows.map((r) => (
          <li key={r.who} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-bold">
              <span className={cx("size-2 rounded-full", r.ok ? "bg-verdigris" : "bg-dust")} aria-hidden />
              {r.who}
            </span>
            <span className="text-silt">{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] leading-snug text-silt">
        Connexion des modules : <code className="font-mono">clients/reborn_client.py</code> et <code className="font-mono">contracts/</code> (REBORN_URL, REBORN_TOKEN).
      </p>
    </div>
  );
}
