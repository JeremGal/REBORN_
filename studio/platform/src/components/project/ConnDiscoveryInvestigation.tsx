"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CircleStop, ImageOff } from "lucide-react";
import { Button, Confidence, Empty, Panel, Specimen, StatusBadge, cx } from "@/components/ui";
import { EventFeed } from "@/components/EventFeed";
import { useReborn } from "@/components/RebornProvider";
import type { AgentEvent, Investigation, Observation, RebornState, StoredRuleModel, StoredSchema } from "@/lib/types";
import { projectCall, useProject } from "./ProjectProvider";
import { ConnFact, ConnHeading, ConnNotice, ConnStat, ConnTag, connCount, connDate, connHour, connMode, connNum, connSafeShot, connValue, useConnAction } from "./ConnShared";

const SOURCE: Record<string, string> = { explorer: "Explorer", analyst: "Analyste", fixture: "Jeu de test", user: "Opérateur", platform: "REBORN" };
const sourceLabel = (s?: string) => (s ? (SOURCE[s] ?? s) : "source non précisée");

const OBS_LIMIT = 150;
const EVENT_LIMIT = 200;
const SHOT_LIMIT = 24;

interface Shot {
  key: string;
  url: string;
  caption: string;
  at: string;
}

/** Versions (schéma d'écran, modèle de règles) annoncées par les évènements d'une investigation. */
function versionsFrom(events: AgentEvent[], type: AgentEvent["type"]): number[] {
  const out: number[] = [];
  for (const e of events) {
    if (e.type !== type) continue;
    const v = (e.data as { version?: unknown } | undefined)?.version;
    if (typeof v === "number" && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Résultats réels d'une investigation rattachée au projet : tout est lu dans l'état de la plateforme
 * (/api/state) — observations, évènements, écrans et règles reçus pendant cette investigation.
 */
export function ConnDiscoveryInvestigation({ inv, state }: { inv: Investigation; state: RebornState }) {
  const { id } = useProject();
  const { refresh: reloadState } = useReborn();
  const { busy, result, run } = useConnAction();
  const mode = connMode(inv.mode);
  const local = mode.group === "local";
  const running = inv.status === "running";

  const d = useMemo(() => {
    const observations = state.observations.filter((o) => o.investigation_id === inv.id);
    const events = state.events.filter((e) => e.investigation_id === inv.id);
    const schemas = versionsFrom(events, "schema_updated")
      .map((v) => state.schemas.find((s) => s.version === v))
      .filter((s): s is StoredSchema => !!s)
      .reverse();
    const models = versionsFrom(events, "rules_updated")
      .map((v) => state.models.find((m) => m.version === v))
      .filter((m): m is StoredRuleModel => !!m)
      .reverse();

    const seen = new Set<string>();
    const shots: Shot[] = [];
    for (const e of events) {
      const url = connSafeShot(e.screenshot_url);
      if (url && !seen.has(url)) {
        seen.add(url);
        shots.push({ key: e.id, url, caption: e.title, at: e.ts });
      }
    }
    observations.forEach((o, i) => {
      const url = connSafeShot(o.screenshot_url);
      if (url && !seen.has(url)) {
        seen.add(url);
        shots.push({ key: `${o.experiment_id}-${i}`, url, caption: o.experiment_id, at: o.received_at ?? "" });
      }
    });
    shots.sort((a, b) => b.at.localeCompare(a.at));

    const answered = new Set(state.observations.map((o) => o.request_id).filter(Boolean));
    const pending = events.filter((e) => e.type === "experiment_request" && !answered.has(e.id));
    const counts = { success: 0, error: 0, failed: 0 };
    for (const o of observations) {
      if (o.status === "success") counts.success++;
      else if (o.status === "error") counts.error++;
      else counts.failed++;
    }
    return {
      observations,
      events,
      // Journal : seules les captures d'adresse sûre sont transmises à l'affichage.
      journal: events.map((e) => (e.screenshot_url && !connSafeShot(e.screenshot_url) ? { ...e, screenshot_url: undefined } : e)),
      schemas,
      models,
      shots,
      pending,
      counts,
      experiments: new Set(observations.map((o) => o.experiment_id)).size,
      fromAgents: events.filter((e) => e.source === "explorer" || e.source === "analyst").length,
    };
  }, [state, inv.id]);

  async function close() {
    await run(
      "close",
      async () => {
        await projectCall(id, "PATCH", "/api/investigations", { id: inv.id, status: "completed" });
        return { tone: "ok", title: `Investigation #${inv.number} clôturée`, text: "Elle n'est plus proposée à l'agent comme investigation active ; ses résultats restent consultables ici." };
      },
      { errorTitle: "Clôture impossible", after: reloadState },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel
        eyebrow={`Investigation #${inv.number} · ${inv.id}`}
        title={`${inv.application} — ${inv.module}`}
        actions={
          running ? (
            <Button size="sm" variant="quiet" onClick={() => { if (window.confirm("Clore cette investigation ? Si l'agent y travaille encore, ses prochains envois seront refusés.")) void close(); }} disabled={!!busy}>
              <CircleStop size={13} aria-hidden /> {busy === "close" ? "Clôture…" : "Clore l'investigation"}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {local ? (
            <ConnTag tone="warn" title={mode.detail}>
              Mode local · {mode.label}
            </ConnTag>
          ) : (
            <ConnTag tone="ok" title={mode.detail}>
              Agents réels
            </ConnTag>
          )}
          {running ? (
            <ConnTag tone="info" dot>
              En cours
            </ConnTag>
          ) : inv.status === "failed" ? (
            <ConnTag tone="bad">En échec</ConnTag>
          ) : (
            <ConnTag>Terminée</ConnTag>
          )}
          {inv.kind !== "initial" && <ConnTag>{inv.kind === "blind_challenge" ? "Blind Challenge" : "Vérification"}</ConnTag>}
        </div>

        {local && (
          <ConnNotice tone="warn" className="mt-3" title="Mode local — pas une exploration par H Company">
            {mode.detail} Ces résultats servent de test : ils ne proviennent pas de l&apos;agent Computer Use.
          </ConnNotice>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ConnFact label="Ouverte le">{connDate(inv.created_at)}</ConnFact>
          <ConnFact label="Clôture">
            {running ? "Investigation en cours" : inv.completed_at ? `${connDate(inv.completed_at)}${inv.status === "failed" ? " · en échec" : ""}` : inv.status === "failed" ? "En échec" : "—"}
          </ConnFact>
          <ConnFact label="Cible" mono={!!inv.target_url} className="col-span-2 sm:col-span-1">
            {inv.target_url ?? "Non précisée"}
          </ConnFact>
          <ConnFact label="Objectif" className="col-span-2 sm:col-span-1">
            {inv.objective ?? "Non précisé"}
          </ConnFact>
        </dl>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-3">
          <ConnStat
            label="Observations reçues"
            value={connNum(d.observations.length)}
            hint={d.observations.length ? `${connCount(d.counts.error, "refus affiché", "refus affichés")} · ${connCount(d.counts.failed, "non aboutie", "non abouties")}` : undefined}
          />
          <ConnStat label="Expériences distinctes" value={connNum(d.experiments)} />
          <ConnStat label="Écrans décrits" value={connNum(d.schemas.length)} />
          <ConnStat label="Captures" value={connNum(d.shots.length)} />
          <ConnStat label="Versions de règles" value={connNum(d.models.length)} />
        </dl>

        {running && !local && d.fromAgents === 0 && d.observations.length === 0 && (
          <ConnNotice tone="idle" className="mt-3" title="En attente des premiers rapports de l'agent">
            L&apos;investigation est ouverte, mais l&apos;agent Computer Use n&apos;a encore rien transmis. Rien n&apos;est affiché tant qu&apos;il n&apos;a rien envoyé.
          </ConnNotice>
        )}
        {result && <ConnNotice live tone={result.tone} title={result.title} className="mt-3">{result.text}</ConnNotice>}
      </Panel>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ScreensPanel schemas={d.schemas} />
          <ObservationsPanel observations={d.observations} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <ShotsPanel shots={d.shots} />
          <RulesPanel models={d.models} />
          {d.pending.length > 0 && <PendingPanel pending={d.pending} />}
          <Panel eyebrow="Journal de l'exploration" title={connCount(d.events.length, "évènement")} bodyClassName="max-h-[560px] overflow-y-auto">
            <EventFeed events={d.journal} limit={EVENT_LIMIT} emptyHint="Aucun évènement enregistré pour cette investigation." />
            {d.events.length > EVENT_LIMIT && (
              <p className="pt-2 text-[11.5px] text-silt">
                {EVENT_LIMIT} plus récents affichés sur {connNum(d.events.length)}.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Écrans et formulaires                                                */
/* ------------------------------------------------------------------ */

function ScreensPanel({ schemas }: { schemas: StoredSchema[] }) {
  return (
    <Panel eyebrow="Écrans et formulaires" title={schemas.length ? `${connCount(schemas.length, "description d'écran", "descriptions d'écran")} reçue${schemas.length > 1 ? "s" : ""}` : "Aucun écran décrit"}>
      {schemas.length === 0 ? (
        <Empty title="Aucun écran décrit pour l'instant" hint="L'agent publie la description de chaque écran exploré : champs, valeurs possibles, sorties affichées et éléments non reconstituables." />
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {schemas.map((s, i) => (
            <SchemaItem key={s.version} s={s} open={i === 0} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-silt">Rattachement : descriptions reçues pendant que cette investigation était active.</p>
    </Panel>
  );
}

function SchemaItem({ s, open }: { s: StoredSchema; open: boolean }) {
  const name = s.title ?? s.module ?? s.application ?? `Écran v${s.version}`;
  return (
    <details open={open} className="group py-2.5 first:pt-0 last:pb-0">
      <Summary>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-bold text-ink">{name}</span>
          <Specimen>v{s.version}</Specimen>
          {s.source === "fixture" && <ConnTag tone="warn">Jeu de test</ConnTag>}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-silt">
          {connCount(s.fields.length, "champ")} · {sourceLabel(s.source)} · reçue le {connDate(s.received_at)}
        </span>
      </Summary>
      <div className="mt-2 flex flex-col gap-3">
        {s.description && <p className="text-[12.5px] leading-relaxed text-sediment">{s.description}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {s.fields.map((f, i) => (
            <li key={`${f.name}-${i}`} className="min-w-0 rounded-sm bg-chalk px-2.5 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-[12.5px] font-bold text-ink">{f.label ?? f.name}</span>
                {f.required && <span className="text-[10.5px] font-bold tracking-wide text-ochre uppercase">obligatoire</span>}
              </div>
              <div className="font-mono text-[11px] break-all text-silt">
                {f.name} · {String(f.type)}
                {f.unit ? ` · ${f.unit}` : ""}
                {typeof f.min === "number" || typeof f.max === "number" ? ` · ${f.min ?? "…"} à ${f.max ?? "…"}` : ""}
              </div>
              {f.options?.length ? (
                <div className="mt-1 text-[11.5px] leading-snug break-words text-sediment">{f.options.map((o) => (o.label && o.label !== o.value ? `${o.value} (${o.label})` : o.value)).join(" · ")}</div>
              ) : null}
              {f.help && <div className="mt-1 text-[11.5px] text-silt">{f.help}</div>}
            </li>
          ))}
        </ul>
        {s.outputs?.length ? (
          <div>
            <ConnHeading>Sorties affichées</ConnHeading>
            <ul className="flex flex-wrap gap-1.5">
              {s.outputs.map((o, i) => (
                <li key={`${o.name}-${i}`} className="rounded-xs bg-chalk px-2 py-1 text-[11.5px]">
                  <span className="font-bold text-ink">{o.label ?? o.name}</span>
                  {o.format || o.unit ? <span className="text-silt"> · {[o.format, o.unit].filter(Boolean).join(" · ")}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {s.tables?.length ? (
          <div>
            <ConnHeading>Tableaux observés</ConnHeading>
            <ul className="flex flex-col gap-1 text-[12px] text-sediment">
              {s.tables.map((t) => (
                <li key={t.id}>
                  <b className="text-ink">{t.title}</b> · fait varier <span className="font-mono text-[11px]">{t.vary}</span> sur {connCount(t.values.length, "valeur")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {s.unsupported?.length ? (
          <ConnNotice tone="warn" title={`${connCount(s.unsupported.length, "élément observé", "éléments observés")} mais non reconstruit${s.unsupported.length > 1 ? "s" : ""}`}>
            <ul className="flex flex-col gap-0.5">
              {s.unsupported.map((u, i) => (
                <li key={`${u.label}-${i}`}>
                  • <b>{u.label}</b>
                  {u.reason ? ` — ${u.reason}` : ""}
                </li>
              ))}
            </ul>
          </ConnNotice>
        ) : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Observations                                                         */
/* ------------------------------------------------------------------ */

function ObservationsPanel({ observations }: { observations: Observation[] }) {
  const list = observations.slice(-OBS_LIMIT).reverse();
  return (
    <Panel eyebrow="Essais menés à l'écran" title={observations.length ? connCount(observations.length, "observation") : "Aucune observation"} bodyClassName="px-0 pb-0">
      {observations.length === 0 ? (
        <div className="px-4 pb-4">
          <Empty title="Aucune observation reçue" hint="Chaque essai de l'agent (valeurs saisies, résultat ou refus affiché, capture) apparaîtra ici dès sa réception." />
        </div>
      ) : (
        <>
          <ol className="max-h-[640px] overflow-y-auto border-t border-line">
            {list.map((o, i) => (
              <ObservationRow key={`${o.experiment_id}-${o.received_at ?? ""}-${i}`} o={o} />
            ))}
          </ol>
          {observations.length > OBS_LIMIT && (
            <p className="border-t border-line px-4 py-2 text-[11.5px] text-silt">
              Affichage des {OBS_LIMIT} plus récentes sur {connNum(observations.length)}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function ObservationRow({ o }: { o: Observation }) {
  const shot = connSafeShot(o.screenshot_url);
  return (
    <li className="grid gap-3 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_112px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Specimen>{o.experiment_id}</Specimen>
          {o.status === "success" ? <ConnTag tone="ok">Résultat affiché</ConnTag> : o.status === "error" ? <ConnTag tone="warn">Refus affiché</ConnTag> : <ConnTag>Non aboutie</ConnTag>}
          {o.received_at && (
            <time dateTime={o.received_at} className="tabular font-mono text-[11px] text-silt">
              {connHour(o.received_at)}
            </time>
          )}
        </div>
        <div className="mt-1.5 flex flex-col gap-1 text-[12px]">
          <Line label="Saisi">
            <Pairs values={o.inputs} />
          </Line>
          {o.status === "success" && (
            <Line label="Affiché">
              <Pairs values={o.observed_output} legacy />
            </Line>
          )}
          {o.status === "error" && (
            <Line label="Message">
              <span className="legacy-value text-[12px] break-words text-rust!">{o.error ?? "refus sans message transmis"}</span>
            </Line>
          )}
          {o.status !== "success" && o.status !== "error" && (
            <p className="text-sediment">
              Expérience non menée à terme{o.error ? ` : ${o.error}` : ""} — exclue des comparaisons.
            </p>
          )}
        </div>
      </div>
      {shot ? (
        <div className="w-28 sm:w-auto">
          <ConnShot url={shot} alt={`Capture de l'essai ${o.experiment_id}`} />
        </div>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
    </li>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-2 sm:grid-cols-[60px_minmax(0,1fr)]">
      <span className="text-[11.5px] text-silt">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Valeurs telles que reçues ; `legacy` : valeur lue sur l'écran de l'ancien logiciel. */
function Pairs({ values, legacy }: { values: Record<string, unknown>; legacy?: boolean }) {
  const entries = Object.entries(values ?? {});
  if (!entries.length) return <span className="text-silt">—</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(([k, v]) => (
        <span key={k} className="inline-flex min-w-0 items-baseline gap-1">
          <span className="font-mono text-[11px] text-silt">{k}</span>
          {legacy ? (
            <span className="legacy-value tabular text-[12px]" title="Valeur lue sur l'écran de l'ancien logiciel">
              {connValue(v)}
            </span>
          ) : (
            <span className="text-ink">{connValue(v)}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Captures                                                             */
/* ------------------------------------------------------------------ */

function ConnShot({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex aspect-[4/3] w-full items-center justify-center gap-1 rounded-xs bg-chalk px-2 text-center text-[11px] text-silt">
        <ImageOff size={13} aria-hidden /> Capture indisponible
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xs bg-chalk" title="Ouvrir la capture en taille réelle">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="aspect-[4/3] w-full object-cover object-top outline outline-1 -outline-offset-1 outline-black/10"
      />
    </a>
  );
}

function ShotsPanel({ shots }: { shots: Shot[] }) {
  const list = shots.slice(0, SHOT_LIMIT);
  return (
    <Panel eyebrow="Preuves" title={shots.length ? connCount(shots.length, "capture d'écran", "captures d'écran") : "Aucune capture d'écran"}>
      {shots.length === 0 ? (
        <Empty title="Aucune capture reçue" hint="Les captures jointes par l'agent à ses actions et à ses observations apparaîtront ici comme preuves." />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((s) => (
              <li key={s.key} className="min-w-0">
                <figure>
                  <ConnShot url={s.url} alt={`Capture — ${s.caption}`} />
                  <figcaption className="mt-1 line-clamp-2 text-[11.5px] leading-snug break-words text-sediment" title={s.caption}>
                    {s.caption}
                  </figcaption>
                  {s.at && (
                    <time dateTime={s.at} className="tabular block font-mono text-[10.5px] text-silt">
                      {connDate(s.at)}
                    </time>
                  )}
                </figure>
              </li>
            ))}
          </ul>
          {shots.length > SHOT_LIMIT && (
            <p className="mt-2 text-[11.5px] text-silt">
              {SHOT_LIMIT} plus récentes affichées sur {connNum(shots.length)}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Règles                                                               */
/* ------------------------------------------------------------------ */

function RulesPanel({ models }: { models: StoredRuleModel[] }) {
  return (
    <Panel eyebrow="Règles déduites" title={models.length ? `${connCount(models.length, "version")} du modèle de règles` : "Aucune règle reçue"}>
      {models.length === 0 ? (
        <Empty title="Aucune règle reçue pendant cette exploration" hint="L'Analyste (Alan) déduit les règles métier des observations ; elles apparaîtront ici avec leur statut, leur confiance déclarée et leurs preuves." />
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {models.map((m, i) => (
            <ModelItem key={m.version} m={m} open={i === 0} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[11.5px] leading-snug text-silt">
        Statuts et confiance déclarés par l&apos;Analyste : ce sont des hypothèses tant qu&apos;elles n&apos;ont pas été vérifiées sur l&apos;historique migré (étape Reconstruction).
        Rattachement : versions reçues pendant que cette investigation était active.
      </p>
    </Panel>
  );
}

function ModelItem({ m, open }: { m: StoredRuleModel; open: boolean }) {
  const count = (s: string) => m.rules.filter((r) => (r.validation_status ?? "hypothesis") === s).length;
  const warnings = m.issues?.length ?? 0;
  return (
    <details open={open} className="group py-2.5 first:pt-0 last:pb-0">
      <Summary>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-bold text-ink">Modèle v{m.version}</span>
          <span className="text-[12.5px] text-sediment">{m.module}</span>
          {m.source === "fixture" && <ConnTag tone="warn">Jeu de test</ConnTag>}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-silt">
          {connCount(m.rules.length, "règle")} · {sourceLabel(m.source)} · reçu le {connDate(m.received_at)}
        </span>
      </Summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-sediment">
          <span>
            <b className="text-verdigris">{connNum(count("validated"))}</b> {count("validated") > 1 ? "validées" : "validée"}
          </span>
          <span>
            <b className="text-ink-3">{connNum(count("tested"))}</b> {count("tested") > 1 ? "testées" : "testée"}
          </span>
          <span>
            <b className="text-ochre">{connNum(count("hypothesis"))}</b> {count("hypothesis") > 1 ? "hypothèses" : "hypothèse"}
          </span>
          {count("rejected") > 0 && (
            <span>
              <b className="text-rust">{connNum(count("rejected"))}</b> {count("rejected") > 1 ? "rejetées" : "rejetée"}
            </span>
          )}
          {warnings > 0 && <span className="text-ochre">{connCount(warnings, "avertissement")} de validation</span>}
        </p>
        <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
          {m.rules.map((r, i) => (
            <li key={`${r.id}-${i}`} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Specimen>{r.id}</Specimen>
                <StatusBadge status={r.validation_status} />
                {typeof r.confidence === "number" && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-silt">
                    confiance déclarée <Confidence value={r.confidence} />
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug break-words text-ink">{r.description ?? r.type}</p>
              {r.evidence?.length ? (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-silt">
                  Preuves :
                  {r.evidence.slice(0, 6).map((e) => (
                    <Specimen key={e}>{e}</Specimen>
                  ))}
                  {r.evidence.length > 6 && <span>+{r.evidence.length - 6}</span>}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-ochre">Aucune preuve citée</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Divers                                                               */
/* ------------------------------------------------------------------ */

function PendingPanel({ pending }: { pending: AgentEvent[] }) {
  return (
    <Panel eyebrow="Boucle d'investigation" title={`${connCount(pending.length, "essai demandé", "essais demandés")} par l'Analyste, en attente`}>
      <ul className="flex flex-col gap-1.5">
        {pending
          .slice(-20)
          .reverse()
          .map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-[12.5px]">
              <Specimen tone="warn">EN ATTENTE</Specimen>
              <span className="min-w-0 break-words">
                <span className="text-ink">{e.title}</span>{" "}
                <time dateTime={e.ts} className="font-mono text-[11px] text-silt">
                  {connHour(e.ts)}
                </time>
              </span>
            </li>
          ))}
      </ul>
      {pending.length > 20 && <p className="mt-2 text-[11.5px] text-silt">20 plus récentes affichées sur {connNum(pending.length)}.</p>}
    </Panel>
  );
}

/** En-tête repliable d'un élément <details> (clavier et lecteurs d'écran natifs). */
function Summary({ children }: { children: React.ReactNode }) {
  return (
    <summary className={cx("flex cursor-pointer list-none items-start justify-between gap-3 rounded-xs py-0.5 [&::-webkit-details-marker]:hidden")}>
      <span className="min-w-0">{children}</span>
      <ChevronDown size={15} className="mt-1 shrink-0 text-silt transition-transform duration-150 group-open:rotate-180" aria-hidden />
    </summary>
  );
}
