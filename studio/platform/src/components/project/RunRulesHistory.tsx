"use client";

import { useState } from "react";
import { LoaderCircle, Repeat } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, Empty, Panel, cx } from "@/components/ui";
import {
  BM_SOURCE,
  BM_STATUS,
  Cell,
  HeaderRow,
  LoadError,
  Loading,
  Notice,
  StepLink,
  TONE_TEXT,
  Tag,
  count,
  fmt,
  formatStored,
  readableError,
  when,
  type BusinessModelVersion,
  type HistoryBinding,
  type HistoryCheck,
  type MappingIndex,
  type Tone,
} from "./RunCommon";

const SAMPLE_COLS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]";

function Stat({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-silt">{label}</dt>
      <dd className={cx("tabular text-[16px] leading-tight font-black", tone && value ? TONE_TEXT[tone] : "text-ink")}>{fmt(value)}</dd>
    </div>
  );
}

function BindingResult({ b, index }: { b: HistoryBinding; index: MappingIndex }) {
  const fields = b.compared_fields.map((f) => index.field(b.entity, f)?.label ?? f);
  // Les exemples sont donnés champ par champ : un extrait couvre moins d'enregistrements que les écarts comptés
  const partial = b.rounding + b.different + b.not_computable > new Set(b.samples.map((s) => s.record)).size;
  return (
    <div className="border-t border-line px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-bold">
          {index.entity(b.entity)} — {b.scope === "document" ? "totaux du document" : "calcul des lignes"}
        </span>
        <span className="font-mono text-[11px] text-silt">{b.id}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
        <Stat label="Rejoués" value={b.checked} />
        <Stat label="Identiques" value={b.identical} tone="ok" />
        <Stat label="Écarts d'arrondi" value={b.rounding} tone="warn" />
        <Stat label="Écarts" value={b.different} tone="bad" />
        <Stat label="Non calculables" value={b.not_computable} tone="bad" />
      </dl>
      <p className="mt-1.5 text-[12px] text-sediment">Comparé aux valeurs enregistrées dans l&apos;ancien logiciel : {fields.length ? fields.join(", ") : "aucun champ stocké"}.</p>
      {b.samples.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">
            {partial ? `Extrait : ${fmt(b.samples.length)} premiers exemples d'écart` : `Exemples d'écart (${fmt(b.samples.length)})`}
          </summary>
          <div className="mt-1.5 overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
            <HeaderRow cols={SAMPLE_COLS}>
              <span>Enregistrement</span>
              <span className="text-right">Champ</span>
              <span className="text-right">Ancien logiciel</span>
              <span className="text-right">Modèle métier</span>
              <span className="text-right">Motif</span>
            </HeaderRow>
            <ul>
              {b.samples.map((s, i) => {
                const f = s.field && s.field !== "-" ? index.field(b.entity, s.field) : undefined;
                return (
                  <li key={`${s.record}-${s.field}-${i}`} className={cx("grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line px-3 py-1.5 first:border-t-0 md:items-baseline", SAMPLE_COLS)}>
                    <div className="col-span-2 min-w-0 font-mono text-[12px] font-bold break-all md:col-span-1">{s.record}</div>
                    <Cell label="Champ">{s.field && s.field !== "-" ? (f?.label ?? s.field) : "—"}</Cell>
                    <Cell label="Ancien logiciel">{s.field === "-" ? "—" : formatStored(s.stored, f?.type)}</Cell>
                    <Cell label="Modèle métier">{s.field === "-" ? "—" : formatStored(s.computed, f?.type)}</Cell>
                    <Cell label="Motif" className="col-span-2 md:col-span-1">
                      <span className="text-[12px] break-words text-sediment">{s.reason ?? "écart"}</span>
                    </Cell>
                  </li>
                );
              })}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}

function HistoryResult({ hc, index, lastCompleted }: { hc: HistoryCheck; index: MappingIndex; lastCompleted: string | null }) {
  const stale = !!lastCompleted && hc.run_id !== lastCompleted;
  return (
    <div className="border-t border-line">
      <div className="px-3 py-2.5">
        <p className="text-[11.5px] text-silt">
          Rejoué le {when(hc.at)} sur la base migrée de {hc.run_id}, en lecture seule : les montants historiques ne sont pas modifiés.
        </p>
        {stale && (
          <Notice tone="warn" className="mt-1.5" title={`Mesure faite sur ${hc.run_id}`}>
            <p>La dernière migration terminée est {lastCompleted} : rejouez le modèle pour mettre la mesure à jour.</p>
          </Notice>
        )}
        <p className="mt-1.5 text-[12.5px] text-ink">{hc.statement}</p>
      </div>
      {hc.bindings.map((b) => (
        <BindingResult key={b.id} b={b} index={index} />
      ))}
    </div>
  );
}

/**
 * Règles métier vérifiées sur l'historique : chaque version du modèle métier (GET business-model)
 * peut être rejouée sur les documents historiques migrés (POST business-model/check) et comparée
 * aux montants enregistrés dans l'ancien logiciel.
 */
export function RulesHistoryPanel({
  versions,
  loading,
  error,
  onReload,
  index,
  lastCompleted,
  reconstructionHref,
}: {
  versions: BusinessModelVersion[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
  index: MappingIndex;
  /** Dernière exécution terminée : le rejeu porte sur sa base migrée. */
  lastCompleted: string | null;
  reconstructionHref: string;
}) {
  const { post } = useProject();
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ version: number; tone: "ok" | "bad"; text: string } | null>(null);
  const list = [...(versions ?? [])].reverse();

  async function replay(version: number) {
    setBusy(version);
    setNotice(null);
    try {
      const r = await post<{ ok: true; check: HistoryCheck }>("/api/migration/business-model/check", { version });
      setNotice({ version, tone: "ok", text: r.check.statement });
    } catch (e) {
      setNotice({ version, tone: "bad", text: readableError(e) });
    } finally {
      setBusy(null);
      await onReload();
    }
  }

  return (
    <Panel
      eyebrow="Règles métier vérifiées sur l'historique"
      title={list.length ? `${count(list.length, "version", "versions")} du modèle métier` : "Modèle métier"}
      actions={<StepLink href={reconstructionHref}>Reconstruction</StepLink>}
    >
      <p className="text-[12.5px] text-sediment">
        Les règles de calcul reconstruites (modèle métier) sont rejouées sur les documents historiques migrés, puis comparées aux montants que l&apos;ancien logiciel avait enregistrés. La
        validation ou le refus d&apos;une version se fait à l&apos;étape Reconstruction.
      </p>

      {!lastCompleted && list.length > 0 && (
        <Notice tone="info" className="mt-3" title="Rejeu indisponible pour l'instant">
          <p>Aucune migration terminée : le modèle métier se rejoue sur les documents historiques de la nouvelle base. Lancez d&apos;abord la migration.</p>
        </Notice>
      )}

      <div className="mt-3">
        {loading && !versions ? (
          <Loading label="Chargement des versions du modèle métier…" />
        ) : error && !versions ? (
          <LoadError message={error} onRetry={() => void onReload()} />
        ) : !list.length ? (
          <Empty
            title="Aucun modèle métier reçu"
            hint="Il est publié par l'Analyste, ou chargé à l'étape Reconstruction (jeu de test étiqueté comme tel). Il pourra ensuite être rejoué ici sur l'historique migré."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((v) => {
              const st = BM_STATUS[v.status];
              const errors = v.issues.filter((i) => i.level === "error");
              const warnings = v.issues.filter((i) => i.level === "warning");
              const mine = notice?.version === v.version ? notice : null;
              return (
                <li key={v.version} className="overflow-hidden rounded-md shadow-[0_0_0_1px_var(--color-line)]">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14px] font-black">Modèle métier v{v.version}</span>
                        <Tag tone={st.tone}>{st.label}</Tag>
                        {v.source === "fixture" && <Tag tone="info">Jeu de test</Tag>}
                      </div>
                      <p className="mt-0.5 text-[12px] text-sediment">
                        {BM_SOURCE[v.source] ?? v.source} · reçu le {when(v.received_at)} par {v.by}
                      </p>
                      <p className="text-[12px] text-silt">
                        {count(v.modules.length, "module de règles", "modules de règles")} · {count(v.bindings.length, "liaison", "liaisons")}
                        {v.bindings.length ? ` : ${v.bindings.map((b) => `${index.entity(b.entity)} (${b.scope === "document" ? "document" : b.scope === "line" ? "lignes" : b.scope})`).join(", ")}` : ""}
                      </p>
                      {v.decided_at && (
                        <p className="text-[12px] text-silt">
                          {v.status === "validated" ? "Validé" : v.status === "rejected" ? "Refusé" : "Décidé"} par {v.decided_by ?? "responsable"} le {when(v.decided_at)}
                          {v.comment ? ` — « ${v.comment} »` : ""}
                        </p>
                      )}
                      {!!v.published?.length && (
                        <p className="text-[12px] text-silt">
                          Publié dans le logiciel livré : {v.published.map((p) => `${p.app_id} le ${when(p.at)}`).join(", ")}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!lastCompleted || busy !== null}
                      title={!lastCompleted ? "Aucune migration terminée à rejouer" : undefined}
                      onClick={() => void replay(v.version)}
                    >
                      {busy === v.version ? (
                        <>
                          <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden /> Rejeu en cours…
                        </>
                      ) : (
                        <>
                          <Repeat size={12} aria-hidden /> Rejouer sur l&apos;historique
                        </>
                      )}
                    </Button>
                  </div>

                  {(errors.length > 0 || warnings.length > 0) && (
                    <div className="flex flex-col gap-1.5 px-3 pb-2.5">
                      {errors.length > 0 && (
                        <Notice tone="bad" title={`${count(errors.length, "erreur bloquante", "erreurs bloquantes")} : cette version ne peut pas être validée`}>
                          <ul className="flex flex-col gap-0.5">
                            {errors.map((i, k) => (
                              <li key={k} className="break-words">
                                <span className="font-mono text-[11.5px]">{i.path}</span> : {i.message}
                              </li>
                            ))}
                          </ul>
                        </Notice>
                      )}
                      {warnings.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-[12px] font-bold text-sediment hover:text-ink">{count(warnings.length, "avertissement de cohérence", "avertissements de cohérence")}</summary>
                          <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-sediment">
                            {warnings.map((i, k) => (
                              <li key={k} className="break-words">
                                <span className="font-mono text-[11.5px]">{i.path}</span> : {i.message}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {mine && (
                    <div className="px-3 pb-2.5" aria-live="polite">
                      <Notice tone={mine.tone} title={mine.tone === "ok" ? "Rejeu terminé" : "Rejeu impossible"}>
                        <p className="break-words">{mine.text}</p>
                      </Notice>
                    </div>
                  )}

                  {v.history_check ? (
                    <HistoryResult hc={v.history_check} index={index} lastCompleted={lastCompleted} />
                  ) : (
                    <p className="border-t border-line px-3 py-2.5 text-[12.5px] text-sediment">Pas encore rejoué sur l&apos;historique : aucune mesure pour cette version.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
