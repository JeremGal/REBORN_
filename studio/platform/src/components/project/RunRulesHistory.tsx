"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Button, agreePlurals, cx } from "@/components/ds";
import { Callout, EmptyState, TestBadge } from "./Step";
import {
  BM_STATUS,
  LoadError,
  Loading,
  More,
  StepLink,
  TONE_TEXT,
  Tag,
  ZERO,
  count,
  fmt,
  formatStored,
  readableError,
  share,
  whenShort,
  type BusinessModelVersion,
  type HistoryBinding,
  type HistoryCheck,
  type MappingIndex,
  TableScroll,
} from "./RunCommon";

/** Origine d'une version (le jeu de test est signalé à part par <TestBadge>). */
const ORIGIN: Record<BusinessModelVersion["source"], string> = {
  analyst: "reçu de l'Analyste",
  fixture: "format de l'Analyste",
  investigation: "reconstruit par l'investigation",
  user: "saisi à la main",
};

/* Tableaux encadrés (dans un bloc de version) : texte à gauche, nombres à droite. */
const box = "overflow-x-auto rounded-panel ring-1 ring-line";
const thBase = "px-3 py-2 align-bottom text-small leading-snug font-semibold whitespace-nowrap text-text-2";
const tdBase = "px-3 py-2.5 align-top";
const thL = `${thBase} text-left`;
const thR = `${thBase} text-right`;
const tdL = `${tdBase} text-left`;
const tdR = `${tdBase} tabular text-right whitespace-nowrap`;

const bindingLabel = (b: HistoryBinding, index: MappingIndex) => `${index.entity(b.entity)} — ${b.scope === "document" ? "totaux du document" : "calcul des lignes"}`;

function Num({ value, tone, className }: { value: number; tone?: keyof typeof TONE_TEXT; className?: string }) {
  return <td className={cx(tdR, className, value && tone ? cx("font-semibold", TONE_TEXT[tone]) : value ? "text-ink" : ZERO)}>{fmt(value)}</td>;
}

function Samples({ b, index }: { b: HistoryBinding; index: MappingIndex }) {
  // Les exemples sont donnés champ par champ : un extrait couvre moins d'enregistrements que les écarts comptés
  const partial = b.rounding + b.different + b.not_computable > new Set(b.samples.map((s) => s.record)).size;
  return (
    <More label={`${bindingLabel(b, index)} : ${partial ? `${fmt(b.samples.length)} premiers exemples d'écart` : `exemples d'écart (${fmt(b.samples.length)})`}`}>
      <TableScroll label={`Exemples d'écart : ${bindingLabel(b, index)}`} className={box}>
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-line-strong bg-canvas">
              <th scope="col" className={thL}>
                Fiche
              </th>
              <th scope="col" className={thL}>
                Champ
              </th>
              <th scope="col" className={thR}>
                Ancien logiciel
              </th>
              <th scope="col" className={thR}>
                Modèle métier
              </th>
              <th scope="col" className={cx(thL, "hidden sm:table-cell")}>
                Motif
              </th>
            </tr>
          </thead>
          <tbody>
            {b.samples.map((s, i) => {
              const f = s.field && s.field !== "-" ? index.field(b.entity, s.field) : undefined;
              return (
                <tr key={`${s.record}-${s.field}-${i}`} className="border-b border-line last:border-b-0">
                  <th scope="row" className={cx(tdL, "font-mono text-small font-semibold whitespace-nowrap text-ink")}>
                    {s.record}
                  </th>
                  <td className={cx(tdL, "text-text-2")}>{s.field && s.field !== "-" ? (f?.label ?? s.field) : "—"}</td>
                  <td className={cx(tdR, "text-ink")}>{s.field === "-" ? "—" : formatStored(s.stored, f?.type)}</td>
                  <td className={cx(tdR, "text-ink")}>{s.field === "-" ? "—" : formatStored(s.computed, f?.type)}</td>
                  <td className={cx(tdL, "hidden text-text-2 sm:table-cell")}>{s.reason ?? "écart"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </More>
  );
}

function HistoryResult({ hc, index, lastCompleted }: { hc: HistoryCheck; index: MappingIndex; lastCompleted: string | null }) {
  const stale = !!lastCompleted && hc.run_id !== lastCompleted;
  const withSamples = hc.bindings.filter((b) => b.samples.length > 0);
  return (
    <div className="mt-3 flex flex-col gap-3">
      {stale && (
        <Callout tone="warn" title={`Mesure faite sur ${hc.run_id}.`}>
          La dernière migration terminée est {lastCompleted} : rejouez le modèle pour mettre la mesure à jour.
        </Callout>
      )}
      {hc.bindings.length ? (
        <TableScroll label="Calculs rejoués sur l'historique" className={box}>
          <table className="w-full border-collapse text-body">
            <caption className="sr-only">Calculs du modèle métier rejoués sur les fiches historiques migrées</caption>
            <thead>
              <tr className="border-b border-line-strong bg-canvas">
                <th scope="col" className={thL}>
                  Calcul
                </th>
                <th scope="col" className={cx(thR, "hidden sm:table-cell")}>
                  Rejoués
                </th>
                <th scope="col" className={thR}>
                  Identiques
                </th>
                <th scope="col" className={thR}>
                  Arrondis
                </th>
                <th scope="col" className={thR}>
                  Écarts
                </th>
                <th scope="col" className={cx(thR, "hidden sm:table-cell")}>
                  Non calculables
                </th>
              </tr>
            </thead>
            <tbody>
              {hc.bindings.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className={cx(tdL, "font-normal")}>
                    <span className="font-semibold text-ink">{bindingLabel(b, index)}</span>
                    <span className="hidden text-small text-text-3 sm:block">
                      comparé à : {b.compared_fields.map((f) => index.field(b.entity, f)?.label ?? f).join(", ") || "aucun champ enregistré"}
                      {b.checked > 0 ? ` · ${share(b.identical, b.checked)} identiques` : ""}
                    </span>
                  </th>
                  <Num value={b.checked} className="hidden sm:table-cell" />
                  <Num value={b.identical} tone="ok" />
                  <Num value={b.rounding} tone="warn" />
                  <Num value={b.different} tone="bad" />
                  <Num value={b.not_computable} tone="bad" className="hidden sm:table-cell" />
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <p className="text-body text-text-2">Aucun document historique lié à ce modèle : rien à comparer.</p>
      )}
      <p className="text-small text-text-3">
        Rejoué le {whenShort(hc.at)} sur {hc.run_id}, en lecture seule. Cette mesure ne garantit pas les cas absents de l&apos;historique.
      </p>
      {withSamples.map((b) => (
        <Samples key={b.id} b={b} index={index} />
      ))}
    </div>
  );
}

function VersionBlock({
  v,
  index,
  lastCompleted,
  busy,
  notice,
  onReplay,
}: {
  v: BusinessModelVersion;
  index: MappingIndex;
  lastCompleted: string | null;
  busy: number | null;
  notice: { tone: "ok" | "bad"; text: string } | null;
  onReplay: (version: number) => void;
}) {
  const st = BM_STATUS[v.status];
  const errors = v.issues.filter((i) => i.level === "error");
  const warnings = v.issues.filter((i) => i.level === "warning");
  const decided = v.decided_at ? `${v.status === "validated" ? "validé" : v.status === "rejected" ? "refusé" : "décidé"} par ${v.decided_by ?? "responsable"} le ${whenShort(v.decided_at)}` : null;
  const live = (v.published ?? []).map((p) => p.app_id);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-ink">Modèle métier v{v.version}</span>
            <Tag tone={st.tone}>{st.label}</Tag>
            {v.source === "fixture" && <TestBadge />}
          </p>
          <p className="mt-0.5 text-small text-text-3">
            {ORIGIN[v.source] ?? v.source} · reçu le {whenShort(v.received_at)}
            {decided ? ` · ${decided}` : ""}
            {live.length ? ` · publié dans ${[...new Set(live)].join(", ")}` : ""}
          </p>
          {v.comment && <p className="mt-0.5 text-small break-words text-text-2">« {v.comment} »</p>}
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!lastCompleted || (busy !== null && busy !== v.version)}
          loading={busy === v.version}
          loadingText="Rejeu en cours…"
          icon={<Repeat size={14} />}
          title={!lastCompleted ? "Aucune migration terminée à rejouer" : undefined}
          onClick={() => onReplay(v.version)}
        >
          Rejouer sur l&apos;historique
        </Button>
      </div>

      {errors.length > 0 && (
        <Callout tone="bad" className="mt-3" title={`${count(errors.length, "erreur bloquante", "erreurs bloquantes")} : cette version ne peut pas être validée.`}>
          <ul className="flex flex-col gap-0.5">
            {errors.map((i, k) => (
              <li key={k} className="break-words">
                {i.message}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {warnings.length > 0 && (
        <More className="mt-2" label={count(warnings.length, "avertissement de cohérence", "avertissements de cohérence")}>
          <ul className="flex flex-col gap-1 text-small text-text-2">
            {warnings.map((i, k) => (
              <li key={k} className="break-words">
                {i.message}
              </li>
            ))}
          </ul>
        </More>
      )}

      <div aria-live="polite">
        {notice && (
          <Callout tone={notice.tone} className="mt-3" title={notice.tone === "ok" ? "Rejeu terminé." : "Rejeu impossible."}>
            <p className="break-words">{notice.text}</p>
          </Callout>
        )}
      </div>

      {v.history_check ? (
        <HistoryResult hc={v.history_check} index={index} lastCompleted={lastCompleted} />
      ) : (
        <p className="mt-3 text-body text-text-2">Pas encore rejoué sur l&apos;historique : aucune mesure pour cette version.</p>
      )}
    </div>
  );
}

/**
 * Calculs de l'ancien logiciel rejoués sur l'historique : chaque version du modèle métier
 * (GET business-model) peut être rejouée sur les documents historiques migrés (POST
 * business-model/check) et comparée aux montants enregistrés. La plus récente est affichée.
 */
export function RulesHistory({
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
  const [current, ...older] = list;

  async function replay(version: number) {
    setBusy(version);
    setNotice(null);
    try {
      const r = await post<{ ok: true; check: HistoryCheck }>("/api/migration/business-model/check", { version });
      setNotice({ version, tone: "ok", text: agreePlurals(r.check.statement) });
    } catch (e) {
      setNotice({ version, tone: "bad", text: readableError(e) });
    } finally {
      setBusy(null);
      await onReload();
    }
  }

  const block = (v: BusinessModelVersion) => (
    <VersionBlock key={v.version} v={v} index={index} lastCompleted={lastCompleted} busy={busy} notice={notice?.version === v.version ? notice : null} onReplay={(n) => void replay(n)} />
  );

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-body font-semibold text-ink">Calculs de l&apos;ancien logiciel rejoués sur l&apos;historique</h3>
        <StepLink href={reconstructionHref}>Modèle métier</StepLink>
      </div>
      {loading && !versions ? (
        <Loading label="Chargement des versions du modèle métier…" />
      ) : error && !versions ? (
        <LoadError message={error} onRetry={() => void onReload()} />
      ) : !current ? (
        <EmptyState title="Aucun modèle métier reçu">Il se reçoit à l&apos;étape Reconstruction, puis se rejoue ici sur l&apos;historique migré.</EmptyState>
      ) : (
        <>
          {!lastCompleted && (
            <Callout tone="info" className="mb-4" title="Rejeu indisponible : aucune migration terminée.">
              Le modèle se rejoue sur les documents historiques de la nouvelle base.
            </Callout>
          )}
          {block(current)}
          {older.length > 0 && (
            <More className="mt-5 border-t border-line pt-4" label={`Versions précédentes (${fmt(older.length)})`}>
              <div className="flex flex-col gap-6 pt-2">{older.map(block)}</div>
            </More>
          )}
        </>
      )}
    </div>
  );
}
