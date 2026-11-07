"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Ban, Check, ChevronRight, CircleX, Link2, Lock, LockOpen, MessageSquareText, Paperclip, TriangleAlert } from "lucide-react";
import { Button, Confidence, cx, inputCls } from "@/components/ui";
import { useProject } from "./ProjectProvider";
import {
  Chip,
  CLASS_LABEL,
  dt,
  FIELD_TYPE,
  Notice,
  percent,
  plural,
  READ_FORMAT,
  READ_TYPE,
  Spinner,
  transformLabel,
  WRAP_BTN,
  type AttachmentMap,
  type Decision,
  type EntityMap,
  type FieldMap,
  type MappingIssue,
  type MappingOrigin,
  type MigrationMapping,
  type RelationGuess,
  type ReviewItem,
  type ReviewKind,
  type SourceProfile,
  type TableProfile,
} from "./DataKit";

/*
 * Rendu des correspondances (contrat migration_mapping) : chaque table / colonne ancienne et ce
 * qu'elle devient dans le nouveau logiciel. Les états (exclu, protection retirée…) reprennent
 * exactement les règles de l'API (lib/migration/mapping.ts : effectiveMapping).
 */

/* ------------------------------------------------------------------ */
/* Index des correspondances                                            */
/* ------------------------------------------------------------------ */

export interface MappingIndex {
  mapping: MigrationMapping;
  threshold: number;
  hasProfile: boolean;
  /** Au moins une entité porte une classification (document comptable, commercial, lignes, référentiel). */
  classified: boolean;
  entity: (name: string) => EntityMap | undefined;
  label: (name: string) => string;
  item: (key: string) => ReviewItem | undefined;
  /** Entités exclues par décision (retirées de la migration). */
  excludedEntities: Set<string>;
  /** Entités dont la protection de l'historique a été retirée par décision (et leurs lignes). */
  unprotected: Set<string>;
  lineParent: (e: EntityMap) => { entity: string; via: string } | null;
  table: (name: string) => TableProfile | undefined;
  /** Nom de la table dans l'ancien logiciel (manifeste de l'extraction), s'il est connu. */
  legacy: (table: string) => { legacy: string; file: string } | undefined;
  relation: (table: string, column: string, targetTable?: string) => RelationGuess | undefined;
  issuesOf: (entity: string) => MappingIssue[];
  pendingOf: (entity: string) => ReviewItem[];
}

export function indexMapping(
  m: MigrationMapping,
  items: ReviewItem[],
  issues: MappingIssue[],
  profile: SourceProfile | null,
  legacy: Map<string, { legacy: string; file: string }> = new Map(),
): MappingIndex {
  const byName = new Map(m.entities.map((e) => [e.name, e]));
  const byKey = new Map(items.map((i) => [i.key, i]));
  const excluded = (k: string) => byKey.get(k)?.decision?.decision === "excluded";
  const excludedEntities = new Set(m.entities.filter((e) => excluded(`entity:${e.name}`)).map((e) => e.name));
  // Même règle que l'API : protection retirée sur l'entité, et sur ses lignes (classification « line »)
  const removed = new Set(m.entities.filter((e) => excluded(`accounting:${e.name}`)).map((e) => e.name));
  const unprotected = new Set([...removed, ...m.entities.filter((e) => e.classification?.kind === "line" && removed.has(e.classification.parent ?? "")).map((e) => e.name)]);
  const tables = new Map((profile?.tables ?? []).map((t) => [t.name, t]));
  const issuesBy = new Map<string, MappingIssue[]>();
  for (const i of issues) {
    const p = parseIssuePath(i.path);
    if (p.entity) issuesBy.set(p.entity, [...(issuesBy.get(p.entity) ?? []), i]);
  }
  return {
    mapping: m,
    threshold: m.review_threshold,
    hasProfile: !!profile,
    classified: m.entities.some((e) => !!e.classification),
    entity: (n) => byName.get(n),
    label: (n) => byName.get(n)?.label ?? n,
    item: (k) => byKey.get(k),
    excludedEntities,
    unprotected,
    lineParent: (e) => {
      if (e.line_of) return e.line_of;
      for (const p of m.entities) {
        const a = p.aggregates?.find((x) => x.children === e.name);
        if (a) return { entity: p.name, via: a.via };
      }
      const parent = e.classification?.kind === "line" ? e.classification.parent : undefined;
      const via = parent ? e.fields.find((f) => f.type === "reference" && f.references === parent)?.name : undefined;
      return parent && via ? { entity: parent, via } : null;
    },
    table: (n) => tables.get(n),
    legacy: (n) => legacy.get(n),
    relation: (table, column, targetTable) => {
      const all = (profile?.relations ?? []).filter((r) => r.table === table && r.column === column);
      return all.find((r) => r.references.table === targetTable) ?? (targetTable ? undefined : all[0]);
    },
    issuesOf: (n) => issuesBy.get(n) ?? [],
    pendingOf: (n) => items.filter((i) => !i.decision && (i.key === `entity:${n}` || i.key === `accounting:${n}` || i.key.startsWith(`field:${n}.`))),
  };
}

/* ------------------------------------------------------------------ */
/* Chemins des problèmes et ancres                                      */
/* ------------------------------------------------------------------ */

/** « entities.3(factures).fields.1(client) » → entité, champ ; « attachments.0 » → pièce jointe. */
export function parseIssuePath(path: string): { entity?: string; field?: string; attachment?: number; rest?: string } {
  const m = /^entities\.\d+\(([^)]*)\)(?:\.fields\.\d+\(([^)]*)\))?(?:\.(.+))?$/.exec(path);
  if (m) return { entity: m[1], field: m[2], rest: m[3] };
  const a = /^attachments\.(\d+)(?:\.(.+))?$/.exec(path);
  if (a) return { attachment: Number(a[1]), rest: a[2] };
  return { rest: path };
}

const REST_LABEL = (r: string) =>
  r === "source.key" ? "clé source" : r === "title_field" ? "champ titre" : r === "duplicates" ? "doublons" : r.startsWith("checks.") ? `contrôle « ${r.slice(7)} »` : r.startsWith("aggregates.") ? `agrégat « ${r.slice(11)} »` : r;

export function issueWhere(path: string, idx: MappingIndex): { where: string; focus: string | null } {
  const p = parseIssuePath(path);
  if (p.entity) {
    const e = idx.entity(p.entity);
    const el = e?.label ?? p.entity;
    if (p.field) return { where: `${el} · ${e?.fields.find((f) => f.name === p.field)?.label ?? p.field}`, focus: `field:${p.entity}.${p.field}` };
    return { where: p.rest ? `${el} · ${REST_LABEL(p.rest)}` : el, focus: `entity:${p.entity}` };
  }
  if (p.attachment !== undefined) return { where: `Pièces jointes n° ${p.attachment + 1}`, focus: `attachment:${p.attachment}` };
  return { where: p.rest === "entities" ? "Ensemble des entités" : (p.rest ?? path), focus: null };
}

/** Bloquant de l'API (« chemin : message » ou phrase) rendu lisible. */
export function blockerText(b: string, idx: MappingIndex): { text: string; focus: string | null } {
  const i = b.indexOf(" : ");
  if (i > 0) {
    const path = b.slice(0, i);
    const p = parseIssuePath(path);
    if (p.entity || p.attachment !== undefined || path === "entities") {
      const w = issueWhere(path, idx);
      return { text: `${w.where} : ${b.slice(i + 3)}`, focus: w.focus };
    }
  }
  return { text: b, focus: null };
}

/** Ancre d'un point (clé de validation ou de mise en évidence). */
export function anchorOf(key: string): string {
  const i = key.indexOf(":");
  const kind = key.slice(0, i);
  const rest = key.slice(i + 1);
  if (kind === "field") {
    const d = rest.indexOf(".");
    return `#champ-${rest.slice(0, d)}-${rest.slice(d + 1)}`;
  }
  if (kind === "attachment") return `#piece-${rest}`;
  return `#entite-${rest}`;
}
export function entityOfKey(key: string): string | null {
  const i = key.indexOf(":");
  const kind = key.slice(0, i);
  const rest = key.slice(i + 1);
  if (kind === "field") return rest.slice(0, rest.indexOf("."));
  if (kind === "entity" || kind === "accounting") return rest;
  return null;
}

/** Lien interne vers un élément des correspondances (déplie l'entité concernée puis y fait défiler la page). */
export function FocusLink({ to, onFocus, className, plain, children }: { to: string; onFocus: (key: string) => void; className?: string; plain?: boolean; children: ReactNode }) {
  return (
    <a
      href={anchorOf(to)}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        onFocus(to);
      }}
      className={cx(!plain && "underline-offset-2 hover:text-verdigris hover:underline", className)}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Atomes                                                               */
/* ------------------------------------------------------------------ */

/** Confiance : jamais « 100 % » pour une valeur qui ne l'est pas exactement. */
const cap = (v: number) => (v < 1 ? Math.min(v, 0.994) : 1);

export function ConfidenceCell({ value, threshold }: { value?: number; threshold: number }) {
  if (value === undefined)
    return (
      <span className="text-[11px] text-silt" title="Non précisée par l'émetteur : le contrat la considère comme sûre (aucune validation demandée).">
        non précisée
      </span>
    );
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Confidence value={cap(value)} />
      {value < threshold && <span className="text-[10.5px] font-bold text-ochre">sous le seuil</span>}
    </span>
  );
}

export const LOCK_TITLE =
  "Historique protégé : sur les enregistrements migrés, ce champ ne pourra pas être modifié dans le nouveau logiciel (toute tentative est refusée et tracée dans le journal d'audit).";

const SEVERITY: Record<string, string> = { info: "information", warning: "avertissement", blocking: "bloquant" };

/** Légende : ce que signifient la confiance, le cadenas et les conversions. */
export function MappingLegend({ origin, threshold, classified }: { origin: MappingOrigin; threshold: number; classified: boolean }) {
  return (
    <div className="grid gap-x-6 gap-y-2 rounded-md bg-paper px-4 py-3 text-[12px] leading-relaxed text-sediment shadow-[0_0_0_1px_var(--color-line)] md:grid-cols-3">
      {!classified && (
        <p className="md:col-span-3">
          <b className="text-ink">Classification.</b> Cette version ne classe pas les entités (document comptable, commercial, lignes, référentiel) : la protection de l&apos;historique y est déclarée champ par champ.
        </p>
      )}
      <p>
        <b className="text-ink">Confiance.</b>{" "}
        {origin === "auto"
          ? "Proposition automatique : issue des données lues (part des valeurs conformes au type retenu, couverture des relations), ou plafonnée quand le sens est inconnu (codes sans libellé, colonnes vides, références orphelines). 100 % signifie que toutes les valeurs lues sont conformes, pas que le sens métier est confirmé."
          : "Déclarée par l'émetteur des correspondances, non mesurée par REBORN. « Non précisée » : le contrat la considère comme sûre."}{" "}
        Sous {Math.round(threshold * 100)} %, un humain doit trancher avant l&apos;import.
      </p>
      <p>
        <b className="text-ink">
          <Lock size={11} className="mr-0.5 inline align-[-1px]" aria-hidden />
          Protégé.
        </b>{" "}
        Sur les enregistrements migrés, le champ ne pourra pas être modifié dans le nouveau logiciel ; les tentatives sont refusées et tracées. Un enregistrement migré comportant des champs protégés ne peut pas être supprimé, et les
        lignes d&apos;un document protégé ne peuvent être ni ajoutées, ni modifiées, ni supprimées.
      </p>
      <p>
        <b className="text-ink">Conversions.</b> Une valeur vide reste vide : rien n&apos;est inventé. Une valeur non convertible n&apos;est jamais approchée : elle est laissée vide et signalée, ou la ligne est rejetée si le champ est
        obligatoire. Les montants sont convertis au centime exact, sans arrondi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entité                                                               */
/* ------------------------------------------------------------------ */

const FIELD_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_14px_minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,1.3fr)_92px] md:items-start md:gap-x-3";

export function EntityCard({ e, idx, open, onToggle, highlight, onFocus }: { e: EntityMap; idx: MappingIndex; open: boolean; onToggle: () => void; highlight: string | null; onFocus: (key: string) => void }) {
  const t = idx.table(e.source.table);
  const refs = e.fields.filter((f) => f.type === "reference");
  const locked = e.fields.filter((f) => f.accounting);
  const accItem = idx.item(`accounting:${e.name}`);
  const entItem = idx.item(`entity:${e.name}`);
  const excluded = idx.excludedEntities.has(e.name);
  const removed = idx.unprotected.has(e.name);
  const protection = !locked.length ? null : removed ? "removed" : accItem && !accItem.decision ? "pending" : "on";
  const pending = idx.pendingOf(e.name);
  const issues = idx.issuesOf(e.name);
  const errors = issues.filter((i) => i.level === "error").length;
  const parent = idx.lineParent(e);
  const parentEntity = parent ? idx.entity(parent.entity) : undefined;
  const parentLocked = !!parentEntity && parentEntity.fields.some((f) => f.accounting) && !idx.unprotected.has(parentEntity.name) && !idx.excludedEntities.has(parentEntity.name);
  const used = new Set([e.source.key, ...e.fields.map((f) => f.source)]);
  const unmapped = t ? t.columns.filter((c) => !used.has(c.name)) : [];
  const declared = (e.checks?.length ?? 0) + (e.aggregates?.length ?? 0) + (e.computed?.length ?? 0) + (e.duplicates?.length ?? 0);
  const hl = highlight === `entity:${e.name}` || highlight === `accounting:${e.name}`;
  const origin = idx.legacy(e.source.table);

  return (
    <article id={`entite-${e.name}`} className={cx("card scroll-mt-4 overflow-hidden", hl && "ring-2 ring-ochre/60")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-chalk/50">
        <ChevronRight size={16} className={cx("mt-0.5 shrink-0 text-silt transition-transform duration-150", open && "rotate-90")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10.5px] font-bold tracking-[0.07em] text-silt uppercase">Ancien</span>
            <span className={cx("font-mono text-[13px] font-bold break-all", excluded && "line-through")} title={origin ? `Table ${origin.legacy} de l'ancien logiciel (manifeste de l'extraction), exportée dans ${origin.file}` : undefined}>
              {origin?.legacy ?? e.source.table}
            </span>
            {origin && <span className="font-mono text-[11px] text-silt">export {origin.file}</span>}
            <ArrowRight size={14} className="shrink-0 text-verdigris" aria-hidden />
            <span className="text-[10.5px] font-bold tracking-[0.07em] text-silt uppercase">Nouveau</span>
            <span className={cx("text-[14.5px] leading-tight font-black", excluded && "line-through")}>{e.label ?? e.name}</span>
            <span className="font-mono text-[11.5px] text-silt">{e.name}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-sediment">
            <span>
              clé <span className="font-mono">{e.source.key}</span>
            </span>
            {t ? <span className="tabular">{plural(t.rows, "ligne")} dans la source</span> : idx.hasProfile ? <span className="font-bold text-rust">table absente des données lues</span> : null}
            <span>{plural(e.fields.length, "champ")}</span>
            {refs.length > 0 && <span>{plural(refs.length, "référence")}</span>}
            {unmapped.length > 0 && <span className="text-ochre">{plural(unmapped.length, "colonne non reprise", "colonnes non reprises")}</span>}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {e.classification ? (
              <Chip title={`Classification proposée (confiance ${percent(e.classification.confidence)})${e.classification.note ? ` — ${e.classification.note}` : ""}`}>
                {e.classification.kind === "line" && e.classification.parent ? `Lignes de ${idx.label(e.classification.parent)}` : (CLASS_LABEL[e.classification.kind] ?? e.classification.kind)} · {percent(e.classification.confidence)}
              </Chip>
            ) : idx.classified ? (
              <Chip title="Le contrat reçu ne classe pas cette entité ; la protection éventuelle est déclarée champ par champ.">non classée</Chip>
            ) : null}
            {protection === "on" && (
              <Chip tone="lock" title={LOCK_TITLE}>
                <Lock size={10} aria-hidden /> historique protégé · {plural(locked.length, "champ")}
              </Chip>
            )}
            {protection === "pending" && (
              <Chip tone="warn" title="Protégé par défaut tant que la décision n'est pas prise.">
                <Lock size={10} aria-hidden /> protégé par défaut · décision attendue
              </Chip>
            )}
            {protection === "removed" && (
              <Chip tone="warn">
                <LockOpen size={10} aria-hidden /> protection retirée par décision
              </Chip>
            )}
            {parentLocked && (
              <Chip tone="lock" title="Lignes d'un document protégé : sur les documents migrés, aucune ligne ne peut être ajoutée, modifiée ou supprimée.">
                <Lock size={10} aria-hidden /> lignes d&apos;un document protégé
              </Chip>
            )}
            {pending.length > 0 && <Chip tone="warn">{plural(pending.length, "point")} à valider</Chip>}
            {errors > 0 && <Chip tone="bad">{plural(errors, "erreur bloquante", "erreurs bloquantes")}</Chip>}
            {excluded && <Chip tone="bad">exclue par décision</Chip>}
            {e.confidence !== undefined && (
              <span className="inline-flex items-center gap-1 text-[11px] text-silt">
                entité <Confidence value={cap(e.confidence)} />
              </span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-line">
          {(e.note || e.classification?.note || protection || parent || excluded || entItem || issues.length > 0) && (
            <div className="flex flex-col gap-2 px-4 py-3 text-[12.5px]">
              {e.note && <p className="text-sediment">{e.note}</p>}
              {e.classification?.note && (
                <p className="text-silt">
                  Classification « {CLASS_LABEL[e.classification.kind] ?? e.classification.kind} » ({percent(e.classification.confidence)}) : {e.classification.note}
                </p>
              )}
              {protection === "on" && (
                <p className="flex gap-2 text-ink">
                  <Lock size={14} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                  <span>
                    Historique protégé : sur les enregistrements migrés, {locked.map((f) => f.label ?? f.name).join(", ")} ne pourront pas être modifiés dans le nouveau logiciel, et ces enregistrements ne pourront pas être supprimés.
                    {accItem?.decision ? ` Protection confirmée par ${accItem.decision.by} le ${dt(accItem.decision.at)}.` : ""}
                  </span>
                </p>
              )}
              {protection === "pending" && (
                <p className="flex gap-2 text-ochre">
                  <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Protégé par défaut ({locked.map((f) => f.label ?? f.name).join(", ")}) : la classification est incertaine, décidez dans les points à valider.{" "}
                    <a href="#points-a-valider" className="font-bold underline-offset-2 hover:underline">
                      Voir les points à valider
                    </a>
                  </span>
                </p>
              )}
              {protection === "removed" && (
                <p className="flex gap-2 text-ochre">
                  <LockOpen size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Protection retirée par décision
                    {accItem?.decision ? ` (${accItem.decision.by}, ${dt(accItem.decision.at)})` : e.classification?.parent ? ` sur ${idx.label(e.classification.parent)}` : ""} : les enregistrements migrés seront modifiables (modifications
                    tracées).
                  </span>
                </p>
              )}
              {parent && (
                <p className="text-sediment">
                  Lignes de <b>{idx.label(parent.entity)}</b> (via <span className="font-mono">{parent.via}</span>)
                  {parentLocked ? " : sur les documents migrés, aucune ligne ne peut être ajoutée, modifiée ou supprimée ; leurs montants d'origine sont conservés." : "."}
                </p>
              )}
              {excluded && (
                <Notice tone="bad">
                  Entité exclue par décision{entItem?.decision ? ` (${entItem.decision.by}, ${dt(entItem.decision.at)})` : ""} : ses lignes ne seront pas migrées et les références vers elle sont retirées. L&apos;exclusion figurera au rapport
                  d&apos;écarts.
                </Notice>
              )}
              {entItem?.decision?.decision === "accepted" && (
                <p className="flex gap-2 text-[#0b6b5f]">
                  <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Entité acceptée par {entItem.decision.by} le {dt(entItem.decision.at)}
                    {entItem.decision.comment ? ` — « ${entItem.decision.comment} »` : ""}.
                  </span>
                </p>
              )}
              {entItem && !entItem.decision && (
                <p className="text-ochre">
                  Entité proposée avec une confiance limitée : à accepter ou exclure.{" "}
                  <a href="#points-a-valider" className="font-bold underline-offset-2 hover:underline">
                    Voir les points à valider
                  </a>
                </p>
              )}
              {issues.length > 0 && <IssueList issues={issues} idx={idx} onFocus={onFocus} />}
            </div>
          )}

          <div className={cx("hidden border-y border-line bg-chalk/70 px-4 py-1.5 text-[10.5px] font-bold tracking-[0.06em] text-silt uppercase", FIELD_GRID)}>
            <span>Ancienne colonne</span>
            <span />
            <span>Nouveau champ</span>
            <span>Type</span>
            <span>Transformations</span>
            <span>Confiance</span>
          </div>
          <ul className="divide-y divide-line md:border-t-0">
            {e.fields.map((f) => (
              <FieldRow key={f.name} e={e} f={f} idx={idx} highlight={highlight} />
            ))}
          </ul>

          {(t || declared > 0) && (
            <div className="flex flex-col gap-2.5 border-t border-line bg-chalk/40 px-4 py-3 text-[12px] text-sediment">
              {t &&
                (unmapped.length ? (
                  <p>
                    <b className="text-ochre">Colonnes anciennes non reprises ({unmapped.length}) :</b> <span className="font-mono text-[11.5px] break-words text-ink">{unmapped.map((c) => c.name).join(", ")}</span> — non migrées
                    comme champs ; leurs valeurs restent dans la traçabilité de chaque enregistrement et figureront au rapport d&apos;écarts.
                  </p>
                ) : (
                  <p className="text-silt">Toutes les colonnes lues de {origin?.legacy ?? e.source.table} sont reprises (ou servent de clé).</p>
                ))}
              {declared > 0 && (
                <div>
                  <div className="font-bold text-ink">Contrôles et calculs déclarés</div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {e.checks?.map((c) => (
                      <li key={`c-${c.id}`}>
                        Contrôle « {c.description ?? c.id} » ({SEVERITY[c.severity ?? "warning"] ?? c.severity}) : <code className="font-mono text-[11px] break-all text-silt">{c.expr}</code> — vérifié sur l&apos;historique
                        migré à l&apos;étape Validation
                      </li>
                    ))}
                    {e.aggregates?.map((a) => (
                      <li key={`a-${a.id}`}>
                        Agrégat « {a.description ?? a.id} » : {a.field} = somme de <code className="font-mono text-[11px] text-silt">{a.expr}</code> sur {idx.label(a.children)} (via {a.via})
                        {a.verify === false ? " · sert au calcul des nouveaux enregistrements, non contrôlé sur l'historique" : " · contrôlé sur l'historique migré"}
                      </li>
                    ))}
                    {e.computed?.map((c) => (
                      <li key={`k-${c.field}`}>
                        Calcul dans le nouveau logiciel : <code className="font-mono text-[11px] break-all text-silt">{`${c.field} = ${c.expr}`}</code> (les valeurs historiques ne sont jamais recalculées)
                      </li>
                    ))}
                    {e.duplicates?.map((d, i) => (
                      <li key={`d-${i}`}>Doublons recherchés : {d.label ?? d.fields.join(" + ")}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function FieldRow({ e, f, idx, highlight }: { e: EntityMap; f: FieldMap; idx: MappingIndex; highlight: string | null }) {
  const key = `field:${e.name}.${f.name}`;
  const item = idx.item(key);
  const d = item?.decision ?? null;
  const excluded = d?.decision === "excluded" || idx.excludedEntities.has(e.name);
  const table = idx.table(e.source.table);
  const col = table?.columns.find((c) => c.name === f.source);
  const target = f.references ? idx.entity(f.references) : undefined;
  const rel = f.type === "reference" ? idx.relation(e.source.table, f.source, target?.source.table) : undefined;
  const locked = !!f.accounting && !idx.unprotected.has(e.name);
  const unlocked = !!f.accounting && idx.unprotected.has(e.name);
  const refDropped = f.type === "reference" && !!f.references && idx.excludedEntities.has(f.references) && f.references !== e.name;
  const origin = idx.legacy(e.source.table)?.legacy;

  return (
    <li id={`champ-${e.name}-${f.name}`} className={cx("scroll-mt-24 px-4 py-2.5", FIELD_GRID, highlight === key && "bg-ochre-soft/60", excluded && "bg-chalk/40")}>
      {/* Ancien */}
      <div className="min-w-0">
        <span className={cx("font-mono text-[12px] font-bold break-all", excluded && "text-silt")}>
          {origin && <span className="font-normal text-silt">{origin}.</span>}
          {f.source}
        </span>
        {col ? (
          <span className="block text-[11px] text-silt">
            lu : {READ_TYPE[col.type] ?? col.type}
            {col.format ? ` · ${READ_FORMAT[col.format] ?? col.format}` : ""}
            {col.nulls ? ` · ${plural(col.nulls, "vide")}` : ""}
            {col.anomalies.count ? <span className="text-ochre"> · {plural(col.anomalies.count, "non conforme", "non conformes")}</span> : null}
          </span>
        ) : table ? (
          <span className="block text-[11px] font-bold text-rust">colonne absente des données lues</span>
        ) : null}
      </div>
      <ArrowRight size={13} className="mt-0.5 hidden text-silt md:block" aria-hidden />
      {/* Nouveau */}
      <div className="mt-1 min-w-0 md:mt-0">
        <span className="text-silt md:hidden" aria-hidden>
          →{" "}
        </span>
        <span className={cx("text-[12.5px] font-bold", excluded && "line-through decoration-rust/70")}>{f.label ?? f.name}</span> <span className="font-mono text-[11px] break-all text-silt">{`${e.name}.${f.name}`}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {locked && (
            <Chip tone="lock" title={LOCK_TITLE}>
              <Lock size={10} aria-hidden /> protégé
            </Chip>
          )}
          {unlocked && (
            <Chip tone="warn" title="Protection de l'historique retirée par décision : modifiable sur les enregistrements migrés (modifications tracées).">
              <LockOpen size={10} aria-hidden /> modifiable par décision
            </Chip>
          )}
          {f.required && <Chip title="Une ligne sans valeur exploitable pour ce champ est rejetée (et listée au rapport).">obligatoire</Chip>}
          {f.unique && <Chip>unique</Chip>}
          {e.title_field === f.name && <Chip title="Champ affiché comme titre des fiches dans le nouveau logiciel.">titre des fiches</Chip>}
          {item && !d && <Chip tone="warn">à valider</Chip>}
          {d?.decision === "accepted" && (
            <Chip tone="ok">
              <Check size={10} aria-hidden /> validé
            </Chip>
          )}
          {d?.decision === "excluded" && (
            <Chip tone="bad">
              <Ban size={10} aria-hidden /> exclu
            </Chip>
          )}
        </span>
      </div>
      {/* Type */}
      <div className="mt-1.5 min-w-0 text-[12px] md:mt-0">
        {f.type === "reference" ? (
          <>
            <span className="inline-flex flex-wrap items-center gap-1">
              <span className="text-sediment">Référence</span>
              <Chip tone="ref">
                <Link2 size={10} aria-hidden /> {target ? (target.label ?? target.name) : (f.references ?? "?")}
              </Chip>
            </span>
            <span className="block text-[11px] text-silt">si introuvable : {f.on_missing === "keep_unlinked" && !f.required ? "gardé sans lien, signalé" : "ligne rejetée, signalée"}</span>
            {rel ? (
              <span className={cx("block text-[11px]", rel.orphans ? "text-ochre" : "text-silt")}>
                {rel.orphans ? `${plural(rel.orphans, "valeur orpheline", "valeurs orphelines")} dans la source${rel.orphan_samples.length ? ` (ex. ${rel.orphan_samples.slice(0, 3).join(", ")})` : ""}` : "aucune valeur orpheline dans la source"}
              </span>
            ) : idx.hasProfile && table ? (
              <span className="block text-[11px] text-silt">relation non mesurée par l&apos;analyse de structure</span>
            ) : null}
            {!target && <span className="block text-[11px] font-bold text-rust">entité cible absente des correspondances</span>}
            {refDropped && <span className="block text-[11px] font-bold text-rust">entité cible exclue : référence retirée</span>}
          </>
        ) : (
          <>
            <span className="text-ink">{FIELD_TYPE[f.type] ?? f.type}</span>
            {f.type === "enum" &&
              (f.options?.length ? (
                <span className="block text-[11px] text-silt" title={f.options.map((o) => (o.label ? `${o.value} : ${o.label}` : o.value)).join("\n")}>
                  {f.options
                    .slice(0, 6)
                    .map((o) => o.label ?? o.value)
                    .join(", ")}
                  {f.options.length > 6 ? ` (+${f.options.length - 6})` : ""}
                </span>
              ) : (
                <span className="block text-[11px] text-ochre">aucune valeur autorisée déclarée</span>
              ))}
          </>
        )}
      </div>
      {/* Transformations */}
      <div className="mt-1.5 min-w-0 md:mt-0">
        {f.transforms?.length ? (
          <span className="flex flex-wrap gap-1">
            {f.transforms.map((t, i) => {
              const l = transformLabel(t);
              return (
                <Chip key={i} title={l.title}>
                  {l.label}
                </Chip>
              );
            })}
          </span>
        ) : (
          <span className="text-[11.5px] text-silt">aucune transformation déclarée</span>
        )}
      </div>
      {/* Confiance */}
      <div className="mt-1.5 md:mt-0">
        <ConfidenceCell value={f.confidence} threshold={idx.threshold} />
      </div>
      {f.note && <p className="mt-1.5 text-[11.5px] text-sediment md:col-span-6 md:mt-1">{f.note}</p>}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Problèmes du contrat                                                 */
/* ------------------------------------------------------------------ */

export function IssueList({ issues, idx, onFocus }: { issues: MappingIssue[]; idx: MappingIndex; onFocus: (key: string) => void }) {
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((i, n) => {
        const w = issueWhere(i.path, idx);
        const err = i.level === "error";
        return (
          <li key={`${i.path}-${n}`} className={cx("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[12.5px]", err ? "bg-rust-soft/70" : "bg-ochre-soft/60")}>
            {err ? <CircleX size={14} className="mt-0.5 shrink-0 text-rust" aria-hidden /> : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ochre" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cx("text-[10.5px] font-bold tracking-[0.05em] uppercase", err ? "text-rust" : "text-ochre")}>{err ? "Erreur bloquante" : "Avertissement"}</span>
                {w.focus ? (
                  <FocusLink to={w.focus} onFocus={onFocus} className="font-bold">
                    {w.where}
                  </FocusLink>
                ) : (
                  <span className="font-bold">{w.where}</span>
                )}
              </div>
              <p className="break-words text-ink">{i.message}</p>
              <p className="font-mono text-[10.5px] break-all text-silt">{i.path}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

export function RelationsList({ idx, onFocus }: { idx: MappingIndex; onFocus: (key: string) => void }) {
  const refs = idx.mapping.entities.flatMap((e) => e.fields.filter((f) => f.type === "reference").map((f) => ({ e, f })));
  if (!refs.length) return <p className="text-[12.5px] text-silt">Aucune référence déclarée : les entités du nouveau logiciel ne sont pas reliées entre elles.</p>;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {refs.map(({ e, f }) => {
        const target = f.references ? idx.entity(f.references) : undefined;
        const rel = idx.relation(e.source.table, f.source, target?.source.table);
        const off = idx.excludedEntities.has(e.name) || (!!f.references && idx.excludedEntities.has(f.references)) || idx.item(`field:${e.name}.${f.name}`)?.decision?.decision === "excluded";
        return (
          <li key={`${e.name}.${f.name}`}>
            <FocusLink plain to={`field:${e.name}.${f.name}`} onFocus={onFocus} className="block rounded-md px-3 py-2 shadow-[0_0_0_1px_var(--color-line)] transition-colors duration-150 hover:bg-chalk">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <b className={cx("text-[12.5px]", off && "line-through")}>{e.label ?? e.name}</b>
                <span className="font-mono text-[11px] text-silt">.{f.name}</span>
                <ArrowRight size={12} className="text-[#2457a6]" aria-hidden />
                <Chip tone="ref">
                  <Link2 size={10} aria-hidden /> {target ? (target.label ?? target.name) : (f.references ?? "?")}
                </Chip>
                {off && <Chip tone="bad">retirée par décision</Chip>}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-sediment">
                <span className="font-mono break-all">
                  {idx.legacy(e.source.table)?.legacy ?? e.source.table}.{f.source}
                </span>{" "}
                · si introuvable : {f.on_missing === "keep_unlinked" && !f.required ? "gardé sans lien" : "ligne rejetée"}
                {rel ? (
                  <span className={rel.orphans ? "text-ochre" : "text-silt"}> · {rel.orphans ? plural(rel.orphans, "valeur orpheline", "valeurs orphelines") : "aucune valeur orpheline"} dans la source</span>
                ) : null}
              </span>
            </FocusLink>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Pièces jointes                                                       */
/* ------------------------------------------------------------------ */

export function AttachmentRow({ a, i, idx, highlight }: { a: AttachmentMap; i: number; idx: MappingIndex; highlight: string | null }) {
  const key = `attachment:${i}`;
  const item = idx.item(key);
  const d = item?.decision ?? null;
  const owners = "map" in a.owner ? Object.entries(a.owner.map).map(([code, ent]) => `${code} = ${idx.label(ent)}`) : [idx.label(a.owner.entity)];
  return (
    <li id={`piece-${i}`} className={cx("scroll-mt-24 rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-line)]", highlight === key && "bg-ochre-soft/60")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold">
            <Paperclip size={13} className="text-silt" aria-hidden />
            <span className={cx("font-mono", d?.decision === "excluded" && "line-through")}>{a.source.table}</span>
            <span className="font-normal text-silt">+ archive</span>
            <span className="font-mono">{a.archive}</span>
            {item && !d && <Chip tone="warn">à valider</Chip>}
            {d?.decision === "accepted" && <Chip tone="ok">validé</Chip>}
            {d?.decision === "excluded" && <Chip tone="bad">exclu</Chip>}
          </div>
          <p className="mt-0.5 text-[12px] text-sediment">
            Fichier : colonne <code className="font-mono">{a.path}</code> (chemin dans l&apos;archive) · nom : <code className="font-mono">{a.filename}</code> · clé <code className="font-mono">{a.source.key}</code>
          </p>
          <p className="text-[12px] text-sediment">
            Rattachement :{" "}
            {"map" in a.owner ? (
              <>
                selon <code className="font-mono">{a.owner.type}</code> ({owners.join(", ")}) et l&apos;identifiant <code className="font-mono">{a.owner.id}</code>
              </>
            ) : (
              <>
                à {owners[0]} par <code className="font-mono">{a.owner.id}</code>
              </>
            )}
          </p>
          {a.note && <p className="mt-0.5 text-[11.5px] text-silt">{a.note}</p>}
        </div>
        <ConfidenceCell value={a.confidence} threshold={idx.threshold} />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Points à valider                                                     */
/* ------------------------------------------------------------------ */

const KIND: Record<ReviewKind, string> = { entity: "Entité", field: "Champ", attachment: "Pièces jointes", accounting: "Protection de l'historique" };

function consequence(kind: ReviewKind, decision: Decision["decision"]): string {
  if (kind === "accounting") return decision === "accepted" ? "Les champs protégés des enregistrements migrés resteront non modifiables." : "Les enregistrements migrés et leurs lignes seront modifiables (modifications tracées).";
  if (decision === "accepted") return kind === "entity" ? "Entité reprise telle que proposée." : kind === "field" ? "Champ repris tel que proposé." : "Rattachement des pièces jointes repris tel que proposé.";
  if (kind === "entity") return "Non migrée ; les références vers elle sont retirées. L'exclusion figurera au rapport d'écarts.";
  if (kind === "field") return "Non importé ; la valeur d'origine reste dans la traçabilité. L'exclusion figurera au rapport d'écarts.";
  return "Pièces jointes non rattachées. L'exclusion figurera au rapport d'écarts.";
}

export function ReviewList({ items, threshold, onDecided, onFocus }: { items: ReviewItem[]; threshold: number; onDecided: () => Promise<void>; onFocus: (key: string) => void }) {
  const pending = items.filter((i) => !i.decision);
  const decided = items.filter((i) => i.decision);
  const [tab, setTab] = useState<"pending" | "decided" | "all">(pending.length ? "pending" : "all");
  const [last, setLast] = useState<string | null>(null);
  const recorded = async (text: string) => {
    setLast(text);
    await onDecided();
  };
  const shown = tab === "pending" ? pending : tab === "decided" ? decided : [...pending, ...decided];
  const tabs = [
    { id: "pending" as const, label: `En attente (${pending.length})` },
    { id: "decided" as const, label: `Tranchés (${decided.length})` },
    { id: "all" as const, label: `Tous (${items.length})` },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" aria-label="Filtrer les points à valider">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx("rounded-sm px-2.5 py-1 text-[12px] font-bold transition-colors duration-150", tab === t.id ? "bg-ink text-white" : "text-sediment hover:bg-chalk-2 hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {last && (
        <Notice tone="ok" onClose={() => setLast(null)}>
          {last}
        </Notice>
      )}
      {shown.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((i) => (
            <ReviewItemRow key={i.key} item={i} threshold={threshold} onDecided={recorded} onFocus={onFocus} />
          ))}
        </ul>
      ) : tab === "pending" ? (
        <Notice tone="ok">Tous les points ont été tranchés.</Notice>
      ) : (
        <p className="text-[12.5px] text-silt">Aucun point tranché pour l&apos;instant.</p>
      )}
    </div>
  );
}

function ReviewItemRow({ item, threshold, onDecided, onFocus }: { item: ReviewItem; threshold: number; onDecided: (recorded: string) => Promise<void>; onFocus: (key: string) => void }) {
  const { post } = useProject();
  const acc = item.kind === "accounting";
  const [editing, setEditing] = useState(false);
  const [withNote, setWithNote] = useState(false);
  const [comment, setComment] = useState("");
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [busy, setBusy] = useState<Decision["decision"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = !item.decision || editing;
  const yes = acc ? "Garder la protection" : "Accepter";
  const no = acc ? "Autoriser les modifications" : "Exclure";

  async function decide(decision: Decision["decision"]) {
    setBusy(decision);
    setError(null);
    try {
      const c = comment.trim();
      await post("/api/migration/decisions", c ? { key: item.key, decision, comment: c } : { key: item.key, decision });
      setEditing(false);
      setConfirmUnlock(false);
      setWithNote(false);
      setComment("");
      const verb = acc ? (decision === "accepted" ? "protection gardée" : "modifications autorisées") : decision === "accepted" ? "accepté" : "exclu";
      await onDecided(`Décision enregistrée : « ${item.label} » — ${verb}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={cx("rounded-md px-3 py-2.5 shadow-[0_0_0_1px_var(--color-line)]", !item.decision ? "bg-ochre-soft/30" : "bg-paper")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={acc ? "lock" : undefined}>
              {acc && <Lock size={10} aria-hidden />}
              {KIND[item.kind] ?? item.kind}
            </Chip>
            <FocusLink to={item.key} onFocus={onFocus} className="text-[13px] font-bold break-words">
              {item.label}
            </FocusLink>
          </div>
          <p className="mt-1 text-[12.5px] text-sediment">{item.detail}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Confidence value={cap(item.confidence)} />
          <span className="text-[10.5px] text-silt">seuil {Math.round(threshold * 100)} %</span>
        </div>
      </div>

      {item.decision && !editing && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tone={item.decision.decision === "accepted" ? "ok" : acc ? "warn" : "bad"}>
              {acc ? item.decision.decision === "accepted" ? <Lock size={10} aria-hidden /> : <LockOpen size={10} aria-hidden /> : item.decision.decision === "accepted" ? <Check size={10} aria-hidden /> : <Ban size={10} aria-hidden />}
              {acc ? (item.decision.decision === "accepted" ? "Protection gardée" : "Modifications autorisées") : item.decision.decision === "accepted" ? "Accepté" : "Exclu"}
            </Chip>
            <span className="text-silt">
              par {item.decision.by} · {dt(item.decision.at)}
            </span>
            <button
              type="button"
              onClick={() => {
                setComment(item.decision?.comment ?? "");
                setWithNote(!!item.decision?.comment);
                setEditing(true);
              }}
              className="ml-auto text-[12px] font-bold text-sediment underline-offset-2 hover:text-ink hover:underline"
            >
              Modifier la décision
            </button>
          </div>
          {item.decision.comment && <p className="break-words text-sediment">« {item.decision.comment} »</p>}
          <p className="text-silt">{consequence(item.kind, item.decision.decision)}</p>
        </div>
      )}

      {open && (
        <div className="mt-2.5 flex flex-col gap-2">
          {withNote ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-bold text-sediment">Commentaire (facultatif) — consigné avec la décision{acc ? "" : ", et repris au rapport d'écarts en cas d'exclusion"}</span>
              <textarea className={cx(inputCls, "h-16 resize-y py-1.5")} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="Ex. codes confirmés par le client le 7 novembre" />
            </label>
          ) : (
            <button type="button" onClick={() => setWithNote(true)} className="inline-flex items-center gap-1 self-start text-[12px] font-bold text-sediment underline-offset-2 hover:text-ink hover:underline">
              <MessageSquareText size={12} aria-hidden /> Ajouter un commentaire
            </button>
          )}
          {confirmUnlock ? (
            <div className="rounded-md bg-rust-soft/70 px-3 py-2 text-[12.5px]">
              <p className="font-bold text-rust">Retirer la protection de l&apos;historique ?</p>
              <p className="text-ink">Les champs protégés des enregistrements migrés deviendront modifiables dans le nouveau logiciel, ainsi que leurs lignes (modifications tracées). La décision est consignée au journal.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" className={WRAP_BTN} disabled={!!busy} onClick={() => void decide("excluded")}>
                  {busy === "excluded" ? <Spinner size={12} /> : <LockOpen size={12} aria-hidden />} Confirmer : autoriser les modifications
                </Button>
                <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => setConfirmUnlock(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="accent" disabled={!!busy} onClick={() => void decide("accepted")}>
                {busy === "accepted" ? <Spinner size={12} /> : acc ? <Lock size={12} aria-hidden /> : <Check size={12} aria-hidden />} {yes}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => (acc ? setConfirmUnlock(true) : void decide("excluded"))}>
                {busy === "excluded" ? <Spinner size={12} /> : acc ? <LockOpen size={12} aria-hidden /> : <Ban size={12} aria-hidden />} {no}
              </Button>
              {editing && (
                <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              )}
            </div>
          )}
          {error && (
            <p className="text-[12px] break-words text-rust" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
