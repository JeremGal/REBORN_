"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Ban, Check, CheckCheck, ChevronRight, CircleX, Link2, Lock, LockOpen, MessageSquareText, Paperclip, PencilLine, TriangleAlert, Undo2 } from "lucide-react";
import { Badge, Button, Checkbox, Dialog, Field, Input, Select, Textarea, cx, formatDateTime, formatInt, formatNumber, formatPercent } from "@/components/ds";
import type { AttachmentMap, Decision, EntityMap, FieldMap, MappingIssue, MigrationMapping, ReviewItem as ReviewItemBase } from "@/lib/migration/mapping";
import type { ColumnProfile, RelationGuess, SourceProfile, TableProfile } from "@/lib/migration/profile";
import type { Transform } from "@/lib/migration/transforms";
import { Callout, EmptyState } from "./Step";
import { projectCall, useProject } from "./ProjectProvider";

/*
 * Correspondance des champs (contrat migration_mapping) : chaque champ de l'ancien logiciel et le
 * champ du nouveau logiciel qui le reprend, avec son type, sa transformation, son degré
 * d'incertitude et son statut ; actions Accepter (confirme la proposition) / Corriger / Rejeter.
 * Les états (rejeté, protection retirée…) reprennent exactement les règles de l'API
 * (lib/migration/mapping.ts : effectiveMapping). Rien n'est calculé ici qui ne vienne des réponses d'API.
 */

/* ------------------------------------------------------------------ */
/* Types des réponses d'API (formes de lib/migration/*)                 */
/* ------------------------------------------------------------------ */

export type { EntityMap, FieldMap, MigrationMapping, SourceProfile, TableProfile };
export type ReviewItem = ReviewItemBase & { decision: Decision | null };
export interface MappingVersion {
  version: number;
  origin: "auto" | "analyst" | "user" | "fixture";
  received_at: string;
  sha256: string;
  mapping: MigrationMapping;
  issues: MappingIssue[];
  /** Proposition faite d'office par le Studio à l'arrivée des données (personne ne l'a demandée). */
  on_arrival?: boolean;
}
export interface PlanStatus {
  items: ReviewItem[];
  pending: number;
  can_run: boolean;
  blockers: string[];
}
/** GET /api/migration/mapping */
export interface MappingResponse {
  current: MappingVersion | null;
  status: PlanStatus;
}
/** POST /api/migration/mapping (proposition, jeu de test, saisie) */
export interface MappingPostResponse {
  ok: boolean;
  version: number;
  issues: MappingIssue[];
  review: PlanStatus;
}
export interface SourceMeta {
  id: string;
  name: string;
  format: string;
  size: number;
  sha256: string;
  received_at: string;
  tables: { name: string; rows: number; columns: number }[];
}
export interface ExtractionSummary {
  manifest: { exports: { file: string; table?: string | null }[] } | null;
}
/** Aperçu de conversion (POST /api/migration/mapping/fields, dry_run). */
export interface ConversionPreview {
  column: string;
  total: number;
  converted: number;
  empty: number;
  failed: number;
  rejected: number;
  examples: { raw: string | number | boolean | null; stored: string | number | null; error?: string }[];
  masked: boolean;
}
export interface FieldsDryRun {
  ok: true;
  dry_run: true;
  summary: string[];
  consequences: string[];
  warnings: string[];
  review: boolean;
  field: FieldMap | null;
  current: ConversionPreview | null;
  candidate: ConversionPreview | null;
  changed: number | null;
}
export interface RemovedField {
  entity: string;
  field: string;
  label: string;
  source: string;
  type: string;
  from_version: number;
}

/* ------------------------------------------------------------------ */
/* Libellés et formats                                                  */
/* ------------------------------------------------------------------ */

export const TEST_SYSTEM = "Relatio 2004";

export const ORIGIN: Record<MappingVersion["origin"], { label: string; test: boolean }> = {
  analyst: { label: "Reçue de l'Analyste", test: false },
  fixture: { label: `Jeu de test au format de l'Analyste — ${TEST_SYSTEM}`, test: true },
  auto: { label: "Proposition automatique", test: false },
  user: { label: "Corrigée à la main", test: false },
};

export const FIELD_TYPE: Record<string, string> = {
  text: "Texte",
  integer: "Nombre entier",
  decimal: "Nombre décimal",
  money: "Montant",
  percent: "Pourcentage",
  date: "Date",
  boolean: "Oui / non",
  enum: "Liste de valeurs",
  email: "E-mail",
  phone: "Téléphone",
  reference: "Lien vers une autre fiche",
};
export const READ_TYPE: Record<string, string> = { empty: "vide", integer: "entier", decimal: "décimal", money: "montant", boolean: "oui/non", date: "date", email: "e-mail", phone: "téléphone", text: "texte" };
const DATE_FMT: Record<string, string> = { "DD/MM/YYYY": "JJ/MM/AAAA", "YYYY-MM-DD": "AAAA-MM-JJ", "MM/DD/YYYY": "MM/JJ/AAAA", excel: "numéro de série Excel" };
const SEP: Record<string, string> = { comma: "virgule décimale", dot: "point décimal", auto: "séparateur détecté" };
const CLASS_LABEL: Record<string, string> = { financial: "document comptable", commercial: "document commercial", line: "lignes de document", master: "référentiel", other: "montants datés" };

export const nf = (x: number) => formatInt(x);
/** Pluriel français : 0 et 1 au singulier. */
export const plural = (count: number, one: string, many = `${one}s`) => `${nf(count)} ${count > 1 ? many : one}`;
/** Date et heure au format unique du Studio (« 8 nov. 2026, 02:09 »). */
export const dt = (iso: string) => formatDateTime(iso);
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Effet d'une transformation sur la valeur d'origine : rien n'est masqué, ce qui la modifie est signalé. */
export type TransformEffect = "clean" | "read" | "change";
export function transformInfo(t: Transform): { label: string; effect: TransformEffect; detail?: string } {
  if (typeof t === "string") {
    if (t === "trim") return { label: "espaces retirés au début et à la fin", effect: "clean" };
    if (t === "collapse_spaces") return { label: "espaces multiples réduits à un seul", effect: "change", detail: "les espaces intérieurs d'origine ne sont pas conservés dans la valeur enregistrée" };
    if (t === "lower") return { label: "mis en minuscules", effect: "change", detail: "la casse d'origine n'est pas conservée dans la valeur enregistrée" };
    if (t === "upper") return { label: "mis en majuscules", effect: "change", detail: "la casse d'origine n'est pas conservée dans la valeur enregistrée" };
    if (t === "digits") return { label: "chiffres seulement", effect: "change", detail: "tout caractère autre qu'un chiffre est supprimé de la valeur enregistrée" };
    return { label: t, effect: "change" };
  }
  if ("date" in t) return { label: `lue comme une date ${DATE_FMT[t.date] ?? t.date}`, effect: "read", detail: "une date illisible ou inexistante n'est jamais approchée : elle est laissée vide et signalée" };
  if ("decimal" in t) return { label: `nombre, ${SEP[t.decimal] ?? t.decimal}`, effect: "read" };
  if ("money" in t) return { label: `montant, ${SEP[t.money] ?? t.money}`, effect: "read", detail: "repris au centime exact, sans arrondi" };
  if ("boolean" in t) return { label: `oui = ${t.boolean.true.join(" / ") || "—"} ; non = ${t.boolean.false.join(" / ") || "—"}`, effect: "read" };
  if ("map" in t) {
    const pairs = Object.entries(t.map).map(([k, v]) => `${k} → ${v}`);
    return { label: `codes remplacés : ${pairs.slice(0, 4).join(", ")}${pairs.length > 4 ? ` (+${pairs.length - 4})` : ""}`, effect: "change", detail: `${pairs.join(", ")} ; un code absent de cette liste n'est pas converti (valeur laissée vide et signalée)` };
  }
  if ("null_if" in t) return { label: `vidé si ${t.null_if.map((v) => `« ${v} »`).join(", ")}`, effect: "change", detail: "ces valeurs d'origine sont enregistrées comme vides" };
  return { label: JSON.stringify(t), effect: "change" };
}
export const modifiesValue = (f: Pick<FieldMap, "transforms">) => (f.transforms ?? []).some((t) => transformInfo(t).effect === "change");

/** Degré d'incertitude d'une proposition, d'après la confiance déclarée (jamais arrondie à 100 %). */
export function uncertainty(confidence: number | undefined, threshold: number): { label: string; level: "high" | "medium" | "low" | "none"; pct: string | null } {
  if (confidence === undefined) return { label: "Non précisée", level: "none", pct: null };
  const pct = formatPercent(confidence, 0);
  if (confidence < Math.min(0.8, threshold)) return { label: "Forte", level: "high", pct };
  if (confidence < threshold) return { label: "Moyenne", level: "medium", pct };
  return { label: "Faible", level: "low", pct };
}

/** Correction faite par le Studio : trace écrite dans la note du champ (route mapping/fields). */
const CORRECTION = /^Corrigé le ([^:]+?) par (.+?) : (.*?)\.(?: Note d'origine : ([\s\S]*))?$/;
export function correctionOf(f: Pick<FieldMap, "note">): { at: string; by: string; what: string; original: string | null } | null {
  const m = f.note ? CORRECTION.exec(f.note) : null;
  return m ? { at: m[1], by: m[2], what: m[3], original: m[4] ?? null } : null;
}

/* ------------------------------------------------------------------ */
/* Index des correspondances                                            */
/* ------------------------------------------------------------------ */

export interface MappingIndex {
  mapping: MigrationMapping;
  version: number;
  threshold: number;
  hasProfile: boolean;
  entity: (name: string) => EntityMap | undefined;
  label: (name: string) => string;
  item: (key: string) => ReviewItem | undefined;
  /** Entités rejetées par décision (retirées de la migration). */
  excludedEntities: Set<string>;
  /** Entités dont la protection de l'historique a été retirée par décision (et leurs lignes). */
  unprotected: Set<string>;
  lineParent: (e: EntityMap) => { entity: string; via: string } | null;
  table: (name: string) => TableProfile | undefined;
  column: (table: string, column: string) => ColumnProfile | undefined;
  /** Nom de la table dans l'ancien logiciel (manifeste de l'extraction), s'il est connu. */
  legacy: (table: string) => string;
  relation: (table: string, column: string, targetTable?: string) => RelationGuess | undefined;
  issuesOf: (entity: string) => MappingIssue[];
  pendingOf: (entity: string) => ReviewItem[];
  removedOf: (entity: string) => RemovedField[];
}

/** Nom de la table dans l'ancien logiciel (ex. T_CLIENT), d'après le manifeste de la dernière extraction. */
export function legacyTables(sources: SourceMeta[], ex: ExtractionSummary | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of sources) {
    if (s.tables.length !== 1) continue;
    const m = ex?.manifest?.exports.find((x) => x.file === s.name);
    if (m?.table) out.set(s.tables[0].name, m.table);
  }
  return out;
}

export function indexMapping(v: MappingVersion, items: ReviewItem[], profile: SourceProfile | null, legacy: Map<string, string>, removed: RemovedField[]): MappingIndex {
  const m = v.mapping;
  const byName = new Map(m.entities.map((e) => [e.name, e]));
  const byKey = new Map(items.map((i) => [i.key, i]));
  const excluded = (k: string) => byKey.get(k)?.decision?.decision === "excluded";
  const excludedEntities = new Set(m.entities.filter((e) => excluded(`entity:${e.name}`)).map((e) => e.name));
  // Même règle que l'API : protection retirée sur l'entité, et sur ses lignes (classification « line »)
  const removedProt = new Set(m.entities.filter((e) => excluded(`accounting:${e.name}`)).map((e) => e.name));
  const unprotected = new Set([...removedProt, ...m.entities.filter((e) => e.classification?.kind === "line" && removedProt.has(e.classification.parent ?? "")).map((e) => e.name)]);
  const tables = new Map((profile?.tables ?? []).map((t) => [t.name, t]));
  const issuesBy = new Map<string, MappingIssue[]>();
  for (const i of v.issues) {
    const p = parseIssuePath(i.path);
    if (p.entity) issuesBy.set(p.entity, [...(issuesBy.get(p.entity) ?? []), i]);
  }
  return {
    mapping: m,
    version: v.version,
    threshold: m.review_threshold,
    hasProfile: !!profile,
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
    column: (t, c) => tables.get(t)?.columns.find((x) => x.name === c),
    legacy: (n) => legacy.get(n) ?? n,
    relation: (table, column, targetTable) => {
      const all = (profile?.relations ?? []).filter((r) => r.table === table && r.column === column);
      return all.find((r) => r.references.table === targetTable) ?? (targetTable ? undefined : all[0]);
    },
    issuesOf: (n) => issuesBy.get(n) ?? [],
    pendingOf: (n) => items.filter((i) => !i.decision && (i.key === `entity:${n}` || i.key === `accounting:${n}` || i.key.startsWith(`field:${n}.`))),
    removedOf: (n) => removed.filter((r) => r.entity === n),
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
  r === "source.key" ? "clé de la table" : r === "title_field" ? "titre des fiches" : r === "duplicates" ? "doublons" : r.startsWith("checks.") ? `contrôle « ${r.slice(7)} »` : r.startsWith("aggregates.") ? `total « ${r.slice(11)} »` : r;

export function issueWhere(path: string, idx: MappingIndex): { where: string; focus: string | null } {
  const p = parseIssuePath(path);
  if (p.entity) {
    const e = idx.entity(p.entity);
    const el = e?.label ?? p.entity;
    if (p.field) return { where: `${el} · ${e?.fields.find((f) => f.name === p.field)?.label ?? p.field}`, focus: `field:${p.entity}.${p.field}` };
    return { where: p.rest ? `${el} · ${REST_LABEL(p.rest)}` : el, focus: `entity:${p.entity}` };
  }
  if (p.attachment !== undefined) return { where: `Pièces jointes n° ${p.attachment + 1}`, focus: `attachment:${p.attachment}` };
  return { where: p.rest === "entities" ? "Ensemble des tables" : (p.rest ?? path), focus: null };
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

/** Lien interne vers un élément des correspondances (déplie la table concernée puis y fait défiler la page). */
export function FocusLink({ to, onFocus, className, children }: { to: string; onFocus: (key: string) => void; className?: string; children: ReactNode }) {
  return (
    <a
      href={anchorOf(to)}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        onFocus(to);
      }}
      className={cx("rounded-xs underline decoration-line-strong underline-offset-[3px] hover:text-accent-ink hover:decoration-current", className)}
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Atomes                                                               */
/* ------------------------------------------------------------------ */

const PANEL = "rounded-panel ring-1 ring-line";

export const LOCK_TITLE = "Historique protégé : sur les fiches migrées, ce champ ne pourra pas être modifié dans le nouveau logiciel (toute tentative est refusée et tracée).";

/** Degré d'incertitude : mis en évidence sous le seuil de validation. */
export function UncertaintyText({ value, threshold, advanced }: { value?: number; threshold: number; advanced?: boolean }) {
  const u = uncertainty(value, threshold);
  if (u.level === "none")
    return (
      <span className="text-small text-text-3" title="Confiance non précisée par l'émetteur : le contrat la considère comme sûre.">
        Non précisée
      </span>
    );
  return (
    <span className={cx("inline-flex flex-wrap items-baseline gap-x-1 text-small whitespace-nowrap", u.level === "low" ? "text-text-2" : "font-semibold text-warning-ink")} title={`Confiance déclarée ${u.pct} · seuil de validation ${formatPercent(threshold, 0)}`}>
      {u.level !== "low" && <TriangleAlert size={13} aria-hidden className="self-center text-warning" />}
      {u.label}
      {(advanced || u.level !== "low") && <span className="tabular font-normal text-text-3">({u.pct})</span>}
    </span>
  );
}

/** Transformations d'un champ : toutes visibles ; celles qui modifient la valeur d'origine sont signalées. */
export function TransformList({ f, advanced }: { f: FieldMap; advanced?: boolean }) {
  const list = f.transforms ?? [];
  if (!list.length) return <span className="text-small text-text-3">Reprise telle quelle</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {list.map((t, i) => {
        const info = transformInfo(t);
        return (
          <li key={i} className={cx("flex items-start gap-1.5 text-small", info.effect === "change" ? "text-warning-ink" : "text-text-2")} title={info.detail}>
            {info.effect === "change" ? <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0 text-warning" /> : <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-text-3" />}
            <span className="min-w-0 break-words">
              {info.label}
              {info.effect === "change" && <span className="sr-only"> (modifie la valeur d&apos;origine)</span>}
              {advanced && <code className="ml-1 font-mono text-meta text-text-3">{typeof t === "string" ? t : JSON.stringify(t)}</code>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Statut d'un champ                                                    */
/* ------------------------------------------------------------------ */

export type FieldStatusKind = "pending" | "accepted" | "rejected" | "corrected" | "proposed" | "dropped";
export function fieldStatus(e: EntityMap, f: FieldMap, idx: MappingIndex): { kind: FieldStatusKind; label: string; tone: "ok" | "warn" | "bad" | "neutral" | "info"; detail?: string } {
  if (idx.excludedEntities.has(e.name)) return { kind: "dropped", label: "Non repris", tone: "bad", detail: "table rejetée par décision" };
  const item = idx.item(`field:${e.name}.${f.name}`);
  const fix = correctionOf(f);
  if (item?.decision?.decision === "excluded") return { kind: "rejected", label: "Rejeté", tone: "bad", detail: `par ${item.decision.by} le ${day(item.decision.at)}` };
  if (item && !item.decision) return { kind: "pending", label: "À vérifier", tone: "warn", detail: "sous le seuil de confiance" };
  if (fix) return { kind: "corrected", label: "Corrigé", tone: "ok", detail: `par ${fix.by} le ${fix.at}` };
  if (item?.decision?.decision === "accepted") return { kind: "accepted", label: "Accepté", tone: "ok", detail: `par ${item.decision.by} le ${day(item.decision.at)}` };
  return { kind: "proposed", label: "Proposé", tone: "neutral", detail: f.confidence === undefined ? "aucune incertitude déclarée" : "confiance suffisante" };
}

function StatusCell({ s }: { s: ReturnType<typeof fieldStatus> }) {
  const icon = s.kind === "pending" ? <TriangleAlert size={12} /> : s.kind === "rejected" || s.kind === "dropped" ? <Ban size={12} /> : s.kind === "corrected" ? <PencilLine size={12} /> : s.kind === "accepted" ? <Check size={12} /> : undefined;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge tone={s.tone} icon={icon}>
        {s.label}
      </Badge>
      {s.detail && <span className="text-meta text-text-3">{s.detail}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Actions : décisions, corrections                                     */
/* ------------------------------------------------------------------ */

export interface MappingActions {
  version: number;
  decide: (key: string, decision: Decision["decision"], comment?: string) => Promise<void>;
  openCorrect: (entity: string, field: string) => void;
  openReject: (entity: string, field: string) => void;
  restore: (entity: string, field: string) => Promise<void>;
  busy: string | null;
}

/** Accepter / Rejeter une proposition incertaine (décision tracée au nom du compte connecté). */
function DecisionButtons({ item, actions, onCorrect, compact }: { item: ReviewItem; actions: MappingActions; onCorrect?: () => void; compact?: boolean }) {
  const ico = (node: ReactNode) => (compact ? undefined : node);
  const acc = item.kind === "accounting";
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = actions.busy === item.key;
  const decide = async (d: Decision["decision"]) => {
    await actions.decide(item.key, d, note?.trim() || undefined);
    setConfirmUnlock(false);
    setNote(null);
  };
  if (confirmUnlock)
    return (
      <Callout tone="warn" title="Retirer la protection de l'historique ?">
        Les fiches migrées et leurs lignes deviendront modifiables dans le nouveau logiciel ; chaque modification sera tracée.
        <span className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" variant="danger" loading={busy} onClick={() => decide("excluded")} icon={<LockOpen size={14} />}>
            Confirmer : autoriser les modifications
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmUnlock(false)}>
            Annuler
          </Button>
        </span>
      </Callout>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className={cx("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
        <Button size="sm" variant="accent" disabled={!!actions.busy && !busy} loading={busy} onClick={() => decide("accepted")} icon={ico(acc ? <Lock size={14} /> : <Check size={14} />)}>
          {acc ? "Garder la protection" : "Accepter"}
        </Button>
        {onCorrect && (
          <Button size="sm" variant="secondary" disabled={!!actions.busy} onClick={onCorrect} icon={ico(<PencilLine size={14} />)}>
            Corriger
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={!!actions.busy} onClick={() => (acc ? setConfirmUnlock(true) : void decide("excluded"))} icon={ico(acc ? <LockOpen size={14} /> : <Ban size={14} />)}>
          {acc ? "Autoriser les modifications" : "Rejeter"}
        </Button>
        {note === null && !compact && (
          <Button size="sm" variant="ghost" onClick={() => setNote("")} icon={<MessageSquareText size={14} />}>
            Commenter
          </Button>
        )}
      </div>
      {note !== null && (
        <Field label="Commentaire (facultatif, consigné avec la décision)" className="max-w-[560px]">
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. codes confirmés par l'entreprise le 7 novembre" />
        </Field>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* À vérifier : propositions incertaines                                */
/* ------------------------------------------------------------------ */

/** Conséquence d'une décision. `corrected` : le champ a été corrigé dans le Studio (sa note en garde la trace). */
function consequence(kind: ReviewItem["kind"], decision: Decision["decision"], corrected?: { version: number } | null): string {
  if (kind === "accounting") return decision === "accepted" ? "Les champs protégés resteront non modifiables." : "Fiches migrées et lignes modifiables, modifications tracées.";
  if (decision === "accepted" && kind === "field" && corrected) return `Champ repris avec votre correction (correspondances v${corrected.version}).`;
  if (decision === "accepted") return kind === "entity" ? "Table reprise telle que proposée." : kind === "field" ? "Champ repris tel que proposé." : "Pièces jointes rattachées telles que proposées.";
  if (kind === "entity") return "Non migrée, liens vers elle retirés ; signalée au rapport d'écarts.";
  if (kind === "field") return "Non repris ; la valeur d'origine reste dans la traçabilité et le champ figure au rapport d'écarts.";
  return "Pièces jointes non rattachées ; signalé au rapport d'écarts.";
}

/** Ancien champ → nouveau champ d'un point à vérifier (lisible sans connaître les bases de données). */
function ItemTitle({ item, idx }: { item: ReviewItem; idx: MappingIndex }) {
  const ent = entityOfKey(item.key);
  const e = ent ? idx.entity(ent) : undefined;
  if (item.kind === "field" && e) {
    const fname = item.key.slice(item.key.indexOf(".") + 1);
    const f = e.fields.find((x) => x.name === fname);
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono text-small text-text-2 [overflow-wrap:anywhere]">
          {idx.legacy(e.source.table)}.<wbr />
          {f?.source ?? "?"}
        </span>
        <ArrowRight size={14} aria-hidden className="shrink-0 text-text-3" />
        <span className="sr-only"> devient </span>
        <span className="font-semibold text-ink">
          {e.label ?? e.name} / {f?.label ?? fname}
        </span>
      </span>
    );
  }
  if ((item.kind === "entity" || item.kind === "accounting") && e)
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono text-small break-all text-text-2">{idx.legacy(e.source.table)}</span>
        <ArrowRight size={14} aria-hidden className="shrink-0 text-text-3" />
        <span className="sr-only"> devient </span>
        <span className="font-semibold text-ink">{e.label ?? e.name}</span>
        {item.kind === "accounting" && <span className="text-text-2">· protection de l&apos;historique</span>}
      </span>
    );
  if (item.kind === "attachment") {
    const a = idx.mapping.attachments?.[Number(item.key.slice(item.key.indexOf(":") + 1))];
    if (a)
      return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-small break-all text-text-2">
            {idx.legacy(a.source.table)} + {a.archive}
          </span>
          <ArrowRight size={14} aria-hidden className="shrink-0 text-text-3" />
          <span className="sr-only"> devient </span>
          <span className="font-semibold text-ink">Pièces jointes des fiches</span>
        </span>
      );
  }
  return <span className="font-semibold text-ink">{item.label}</span>;
}

/** Valeurs réellement lues dans la colonne (profil des données reçues). */
function ReadValues({ col }: { col: ColumnProfile | undefined }) {
  if (!col) return null;
  const vals = col.codes?.length ? col.codes.slice(0, 8).map((c) => `${c.value} (${nf(c.count)})`) : col.samples.filter((s) => s !== null && s !== "").slice(0, 5).map((s) => String(s));
  if (!vals.length) return null;
  return (
    <p className="text-small text-text-2">
      <span className="text-text-3">{col.codes?.length ? "Codes lus : " : "Exemples lus : "}</span>
      <span className="font-mono text-meta break-words text-ink">{vals.join(" · ")}</span>
      {col.anomalies.count > 0 && <span className="text-warning-ink"> · {plural(col.anomalies.count, "valeur non conforme", "valeurs non conformes")}</span>}
    </p>
  );
}

export function PendingList({ items, idx, actions, onFocus, advanced }: { items: ReviewItem[]; idx: MappingIndex; actions: MappingActions; onFocus: (key: string) => void; advanced: boolean }) {
  return (
    <ul className="-mx-5 -mb-5 flex flex-col divide-y divide-line border-t border-line">
      {items.map((item) => {
        const ent = entityOfKey(item.key);
        const e = ent ? idx.entity(ent) : undefined;
        const fname = item.kind === "field" ? item.key.slice(item.key.indexOf(".") + 1) : null;
        const f = e && fname ? e.fields.find((x) => x.name === fname) : undefined;
        const col = e && f ? idx.column(e.source.table, f.source) : undefined;
        const editable = item.kind === "field" && !!e && !!f;
        return (
          <li key={item.key} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-body leading-snug break-words">
                <FocusLink to={item.key} onFocus={onFocus} className="no-underline hover:underline">
                  <ItemTitle item={item} idx={idx} />
                </FocusLink>
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                <span className="text-text-3">Incertitude :</span> <UncertaintyText value={item.confidence} threshold={idx.threshold} advanced />
                {f && <span className="text-text-2">· {FIELD_TYPE[f.type] ?? f.type}</span>}
              </p>
              <p className="text-small leading-relaxed text-text-2">{f?.note ? (correctionOf(f)?.original ?? f.note) : item.detail}</p>
              {f && (
                <div className="text-small">
                  <span className="text-text-3">Transformation :</span> <TransformList f={f} advanced={advanced} />
                </div>
              )}
              <ReadValues col={col} />
              <p className="text-meta text-text-3">Si vous rejetez : {consequence(item.kind, "excluded")}</p>
            </div>
            <div className="shrink-0 lg:w-[22rem] lg:pt-0.5">
              <DecisionButtons item={item} actions={actions} onCorrect={editable ? () => actions.openCorrect(e!.name, f!.name) : undefined} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Validation en bloc des propositions restantes                        */
/* ------------------------------------------------------------------ */

/** POST /api/migration/decisions/bulk */
export interface BulkAcceptResponse {
  ok: boolean;
  version: number;
  accepted: number;
  skipped: number;
  accounting: number;
  review: PlanStatus;
}

const KIND_WORDS: Record<ReviewItem["kind"], [string, string]> = {
  field: ["champ", "champs"],
  entity: ["table", "tables"],
  attachment: ["rattachement de pièces jointes", "rattachements de pièces jointes"],
  accounting: ["protection de l'historique comptable", "protections de l'historique comptable"],
};

/** « 160 champs, 8 tables et 4 protections de l'historique comptable » */
function kindSummary(items: ReviewItem[]): string {
  const by = new Map<ReviewItem["kind"], number>();
  for (const i of items) by.set(i.kind, (by.get(i.kind) ?? 0) + 1);
  const parts = (["field", "entity", "attachment", "accounting"] as const).filter((k) => by.get(k)).map((k) => plural(by.get(k)!, KIND_WORDS[k][0], KIND_WORDS[k][1]));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : (parts[0] ?? "aucun point");
}

/**
 * Confirmation de « Accepter toutes les propositions restantes » : dit combien de points seront acceptés et lesquels
 * sont sensibles (protection de l'historique comptable), listés à part et décochables (le point reste alors à
 * trancher). Envoie EXACTEMENT les points affichés avec la version affichée : si les correspondances ont changé
 * entre-temps, le serveur refuse (409) et rien n'est enregistré.
 */
export function BulkAcceptDialog({ open, onClose, items, idx, onDone }: { open: boolean; onClose: () => void; items: ReviewItem[]; idx: MappingIndex; onDone: (r: BulkAcceptResponse) => Promise<void> }) {
  const { post } = useProject();
  const cancel = useRef<HTMLButtonElement>(null);
  const sensitive = useMemo(() => items.filter((i) => i.kind === "accounting"), [items]);
  const others = useMemo(() => items.filter((i) => i.kind !== "accounting"), [items]);
  // Clé stable (la page recalcule la liste à chaque rendu) : les cases ne sont remises à zéro qu'à l'ouverture,
  // ou si la liste des protections à trancher change réellement pendant que la fenêtre est ouverte.
  const sensitiveKey = sensitive.map((i) => i.key).join("\n");
  const [keep, setKeep] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // À chaque ouverture : toutes les protections incluses (accepter = garder la protection, le choix prudent)
  useEffect(() => {
    if (!open) return;
    setKeep(new Set(sensitiveKey ? sensitiveKey.split("\n") : []));
    setError(null);
  }, [open, sensitiveKey]);
  const chosen = [...others, ...sensitive.filter((i) => keep.has(i.key))];
  const left = sensitive.length - sensitive.filter((i) => keep.has(i.key)).length;

  async function confirm() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<BulkAcceptResponse>("/api/migration/decisions/bulk", { version: idx.version, keys: chosen.map((i) => i.key) });
      await onDone(r);
      onClose();
    } catch (e) {
      setError((e as Error).message || "L'enregistrement n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={items.length > 1 ? `Accepter les ${nf(items.length)} propositions restantes ?` : "Accepter la proposition restante ?"}
      description={`Correspondances version ${idx.version} : ${kindSummary(items)}.`}
      size="lg"
      initialFocus={cancel}
      closeOnBackdrop={false}
      footer={
        <>
          <Button ref={cancel} variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" icon={<CheckCheck size={16} />} loading={busy} loadingText="Enregistrement…" disabled={!chosen.length} onClick={() => void confirm()}>
            {chosen.length ? `Accepter ${plural(chosen.length, "point")}` : "Aucun point choisi"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-body leading-relaxed text-text-2">
        <p>
          Chaque point sera enregistré comme <strong className="font-semibold text-ink">accepté à votre nom</strong>, avec la date, exactement comme si vous l&apos;acceptiez un par un. Chaque décision reste modifiable ensuite dans « Décisions prises ». Rien n&apos;est migré tant que vous ne lancez pas la migration.
        </p>
        {sensitive.length > 0 ? (
          <fieldset className="flex flex-col gap-3 rounded-panel bg-canvas px-4 pt-1 pb-4 ring-1 ring-line">
            <legend className="px-1 text-body font-semibold text-ink">Points sensibles : {plural(sensitive.length, "protection de l'historique comptable", "protections de l'historique comptable")}</legend>
            <p className="text-small text-text-2">
              Accepter <strong className="font-semibold text-ink">garde la protection</strong> : sur les fiches migrées de ces documents, montants, dates et numéros ne pourront pas être modifiés dans le nouveau logiciel. Décochez un point pour le trancher vous-même plus tard : il restera à vérifier.
            </p>
            <ul className="flex flex-col gap-2.5">
              {sensitive.map((i) => (
                <li key={i.key}>
                  <Checkbox
                    checked={keep.has(i.key)}
                    disabled={busy}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setKeep((s) => {
                        const n = new Set(s);
                        if (on) n.add(i.key);
                        else n.delete(i.key);
                        return n;
                      });
                    }}
                    label={
                      <span className="flex flex-col gap-0.5">
                        <span>Inclure dans l&apos;acceptation (garder la protection)</span>
                        <span className="text-small">
                          <ItemTitle item={i} idx={idx} />
                        </span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
            {left > 0 && (
              <p className="text-small font-medium text-warning-ink" role="status">
                {plural(left, "protection restera", "protections resteront")} à trancher après cette acceptation.
              </p>
            )}
          </fieldset>
        ) : (
          <p className="text-small text-text-3">Aucun point sensible (protection de l&apos;historique comptable) parmi ces propositions.</p>
        )}
        {error && <Callout tone="bad" title="Rien n'a été enregistré">{error}</Callout>}
      </div>
    </Dialog>
  );
}

/** Décisions déjà prises (modifiables). */
export function DecidedList({ items, idx, actions, onFocus }: { items: ReviewItem[]; idx: MappingIndex; actions: MappingActions; onFocus: (key: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className={cx("flex flex-col divide-y divide-line", PANEL)}>
      {items.map((item) => {
        const d = item.decision!;
        const acc = item.kind === "accounting";
        const ent = item.kind === "field" ? entityOfKey(item.key) : null;
        const e = ent ? idx.entity(ent) : undefined;
        const f = e ? e.fields.find((x) => x.name === item.key.slice(item.key.indexOf(".") + 1)) : undefined;
        const corrected = f && correctionOf(f) ? { version: idx.version } : null;
        return (
          <li key={item.key} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 text-body break-words">
                <FocusLink to={item.key} onFocus={onFocus} className="no-underline hover:underline">
                  <ItemTitle item={item} idx={idx} />
                </FocusLink>
              </p>
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={d.decision === "accepted" ? "ok" : acc ? "warn" : "bad"} icon={acc ? d.decision === "accepted" ? <Lock size={12} /> : <LockOpen size={12} /> : d.decision === "accepted" ? <Check size={12} /> : <Ban size={12} />}>
                  {acc ? (d.decision === "accepted" ? "Protection gardée" : "Modifications autorisées") : d.decision === "accepted" ? "Accepté" : "Rejeté"}
                </Badge>
                <span className="text-small text-text-3">
                  {d.by} · {dt(d.at)}
                </span>
              </span>
            </div>
            {d.comment && <p className="text-small break-words text-text-2">« {d.comment} »</p>}
            <p className="text-meta text-text-3">{consequence(item.kind, d.decision, corrected)}</p>
            {editing === item.key ? (
              <div className="flex flex-col gap-2">
                <DecisionButtons item={item} actions={{ ...actions, decide: async (k, dd, c) => (await actions.decide(k, dd, c), setEditing(null)) }} compact />
                <span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Annuler
                  </Button>
                </span>
              </div>
            ) : (
              <span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(item.key)} icon={<Undo2 size={14} />}>
                  Modifier la décision
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Table : ancien champ → nouveau champ                                 */
/* ------------------------------------------------------------------ */

export type FieldFilter = "all" | "pending" | "change" | "locked";
export function matchesFilter(e: EntityMap, f: FieldMap, idx: MappingIndex, filter: FieldFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return fieldStatus(e, f, idx).kind === "pending";
  if (filter === "change") return modifiesValue(f);
  return !!f.accounting && !idx.unprotected.has(e.name);
}

export function EntityGroup({
  e,
  idx,
  open,
  onToggle,
  highlight,
  onFocus,
  filter,
  advanced,
  actions,
}: {
  e: EntityMap;
  idx: MappingIndex;
  open: boolean;
  onToggle: () => void;
  highlight: string | null;
  onFocus: (key: string) => void;
  filter: FieldFilter;
  advanced: boolean;
  actions: MappingActions;
}) {
  const t = idx.table(e.source.table);
  const locked = e.fields.filter((f) => f.accounting);
  const accItem = idx.item(`accounting:${e.name}`);
  const entItem = idx.item(`entity:${e.name}`);
  const excluded = idx.excludedEntities.has(e.name);
  const removedProt = idx.unprotected.has(e.name);
  const protection = !locked.length ? null : removedProt ? "removed" : accItem && !accItem.decision ? "pending" : "on";
  const pending = idx.pendingOf(e.name);
  const issues = idx.issuesOf(e.name);
  const errors = issues.filter((i) => i.level === "error").length;
  const changing = e.fields.filter(modifiesValue).length;
  const used = new Set([e.source.key, ...e.fields.map((f) => f.source)]);
  const unmapped = t ? t.columns.filter((c) => !used.has(c.name)) : [];
  const removed = idx.removedOf(e.name);
  const visible = e.fields.filter((f) => matchesFilter(e, f, idx, filter));
  const hl = highlight === `entity:${e.name}` || highlight === `accounting:${e.name}`;
  const body = `entite-${e.name}-champs`;
  const parent = idx.lineParent(e);
  if (filter !== "all" && !visible.length) return null;

  return (
    <li id={`entite-${e.name}`} className={cx("scroll-mt-6 transition-colors duration-(--duration-slow)", hl && "bg-warning-soft/60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? body : undefined}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors duration-(--duration-fast) hover:bg-canvas focus-visible:-outline-offset-2 sm:items-center sm:px-5"
      >
        <ChevronRight size={16} className={cx("mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-fast) sm:mt-0", open && "rotate-90")} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cx("font-mono text-small break-all text-text-2", excluded && "line-through")} title={`Table ${idx.legacy(e.source.table)} de l'ancien logiciel`}>
              {idx.legacy(e.source.table)}
            </span>
            <ArrowRight size={14} className="shrink-0 text-text-3" aria-hidden />
            <span className="sr-only"> devient </span>
            <span className={cx("text-body leading-snug font-semibold text-ink", excluded && "line-through")}>{e.label ?? e.name}</span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
            {pending.length > 0 && (
              <Badge tone="warn" icon={<TriangleAlert size={12} />}>
                {plural(pending.length, "à vérifier", "à vérifier")}
              </Badge>
            )}
            {errors > 0 && (
              <Badge tone="bad" icon={<CircleX size={12} />}>
                {plural(errors, "erreur")}
              </Badge>
            )}
            {excluded && <Badge tone="bad">Rejetée</Badge>}
            {!excluded && protection === "on" && (
              <Badge tone="info" icon={<Lock size={12} />} title={LOCK_TITLE}>
                Historique protégé
              </Badge>
            )}
            {protection === "removed" && (
              <Badge tone="warn" icon={<LockOpen size={12} />}>
                Protection retirée
              </Badge>
            )}
            {changing > 0 && <Badge tone="neutral">{plural(changing, "valeur transformée", "valeurs transformées")}</Badge>}
            <span className="tabular text-small whitespace-nowrap text-text-3">
              {plural(e.fields.length, "champ")}
              {t ? ` · ${plural(t.rows, "ligne")}` : ""}
            </span>
          </span>
        </span>
      </button>

      {open && (
        <div id={body} className="flex flex-col gap-3 border-t border-line bg-canvas px-4 pt-3.5 pb-4 sm:pr-5 sm:pl-12">
          <EntityNotes e={e} idx={idx} locked={locked} protection={protection} parent={parent} excluded={excluded} accItem={accItem} entItem={entItem} missingTable={!t && idx.hasProfile} advanced={advanced} />
          {issues.length > 0 && <IssueList issues={issues} idx={idx} onFocus={onFocus} />}
          <FieldTable e={e} fields={visible} idx={idx} highlight={highlight} advanced={advanced} actions={actions} />
          {(unmapped.length > 0 || removed.length > 0) && (
            <div className="flex flex-col gap-1.5 text-small text-text-2">
              {unmapped.length > 0 && (
                <p>
                  <span className="font-semibold text-warning-ink">Colonnes non reprises : </span>
                  <span className="font-mono break-words text-ink">{unmapped.map((c) => c.name).join(", ")}</span> — gardées dans la traçabilité de chaque fiche, signalées au rapport d&apos;écarts.
                </p>
              )}
              {removed.map((r) => (
                <p key={r.field} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    Champ retiré par une correction : <b className="font-semibold text-ink">{r.label}</b> (colonne <span className="font-mono">{r.source}</span>)
                  </span>
                  <Button size="sm" variant="ghost" loading={actions.busy === `restore:${e.name}.${r.field}`} disabled={!!actions.busy && actions.busy !== `restore:${e.name}.${r.field}`} onClick={() => actions.restore(e.name, r.field)} icon={<Undo2 size={14} />}>
                    Reprendre ce champ
                  </Button>
                </p>
              ))}
            </div>
          )}
          <EntityRules e={e} />
        </div>
      )}
    </li>
  );
}

function EntityRules({ e }: { e: EntityMap }) {
  const fieldLabel = (n: string) => e.fields.find((f) => f.name === n)?.label ?? n;
  const checked = [...(e.checks ?? []).map((c) => ({ k: c.id, label: c.description ?? c.id, title: c.expr })), ...(e.aggregates ?? []).filter((a) => a.verify !== false).map((a) => ({ k: a.id, label: a.description ?? a.id, title: a.expr }))];
  const computed = [...(e.computed ?? []).map((c) => ({ k: `c-${c.field}`, label: fieldLabel(c.field), title: `${c.field} = ${c.expr}` })), ...(e.aggregates ?? []).filter((a) => a.verify === false).map((a) => ({ k: `a-${a.id}`, label: a.description ?? fieldLabel(a.field), title: a.expr }))];
  if (!checked.length && !computed.length && !e.duplicates?.length) return null;
  return (
    <dl className="flex flex-col gap-1 text-small text-text-2">
      {checked.length > 0 && (
        <div>
          <dt className="inline font-semibold text-ink">Contrôlé sur l&apos;historique : </dt>
          <dd className="inline">{checked.map((c) => c.label).join(" · ")}</dd>
        </div>
      )}
      {computed.length > 0 && (
        <div>
          <dt className="inline font-semibold text-ink">Calculé pour les nouvelles fiches : </dt>
          <dd className="inline">
            {computed.map((c) => c.label).join(" · ")} <span className="text-text-3">(l&apos;historique n&apos;est jamais recalculé)</span>
          </dd>
        </div>
      )}
      {!!e.duplicates?.length && (
        <div>
          <dt className="inline font-semibold text-ink">Doublons recherchés : </dt>
          <dd className="inline">{e.duplicates.map((d) => d.label ?? d.fields.map(fieldLabel).join(" + ")).join(" · ")}</dd>
        </div>
      )}
    </dl>
  );
}

function EntityNotes({
  e,
  idx,
  locked,
  protection,
  parent,
  excluded,
  accItem,
  entItem,
  missingTable,
  advanced,
}: {
  e: EntityMap;
  idx: MappingIndex;
  locked: FieldMap[];
  protection: "on" | "pending" | "removed" | null;
  parent: { entity: string; via: string } | null;
  excluded: boolean;
  accItem: ReviewItem | undefined;
  entItem: ReviewItem | undefined;
  missingTable: boolean;
  advanced: boolean;
}) {
  const lines: ReactNode[] = [];
  if (missingTable) lines.push(<p className="font-semibold text-danger-ink">Table {idx.legacy(e.source.table)} absente des données reçues.</p>);
  if (e.note) lines.push(<p>{e.note}</p>);
  if (e.classification)
    lines.push(
      <p className="text-text-3">
        Classée « {e.classification.kind === "line" && e.classification.parent ? `lignes de ${idx.label(e.classification.parent)}` : (CLASS_LABEL[e.classification.kind] ?? e.classification.kind)} » (confiance {formatPercent(e.classification.confidence, 0)})
        {e.classification.note ? ` : ${e.classification.note}` : "."}
      </p>,
    );
  if (protection === "on")
    lines.push(
      <p className="flex gap-2 text-ink">
        <Lock size={14} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          Historique protégé : {locked.map((f) => f.label ?? f.name).join(", ")} ne seront pas modifiables sur les fiches migrées.
          {accItem?.decision ? ` Confirmé par ${accItem.decision.by} le ${dt(accItem.decision.at)}.` : ""}
        </span>
      </p>,
    );
  if (protection === "pending")
    lines.push(
      <p className="flex gap-2 text-warning-ink">
        <Lock size={14} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          Protégé par défaut en attendant votre décision (
          <a href="#a-verifier" className="ds-link">
            À vérifier
          </a>
          ).
        </span>
      </p>,
    );
  if (protection === "removed")
    lines.push(
      <p className="flex gap-2 text-warning-ink">
        <LockOpen size={14} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          Protection retirée{accItem?.decision ? ` par ${accItem.decision.by} le ${dt(accItem.decision.at)}` : e.classification?.parent ? ` sur ${idx.label(e.classification.parent)}` : ""} : fiches migrées modifiables, modifications tracées.
        </span>
      </p>,
    );
  if (parent) lines.push(<p>Lignes de <b className="font-semibold text-ink">{idx.label(parent.entity)}</b>.</p>);
  if (excluded)
    lines.push(
      <Callout tone="bad">
        Rejetée par décision{entItem?.decision ? ` (${entItem.decision.by}, ${dt(entItem.decision.at)})` : ""} : non migrée, signalée au rapport d&apos;écarts.
      </Callout>,
    );
  if (advanced)
    lines.push(
      <p className="font-mono text-meta text-text-3">
        entité {e.name} · table lue {e.source.table} · clé {e.source.key}
        {e.title_field ? ` · titre ${e.title_field}` : ""}
      </p>,
    );
  if (!lines.length) return null;
  return (
    <div className="flex max-w-[760px] flex-col gap-1.5 text-small leading-relaxed text-text-2">
      {lines.map((l, i) => (
        <Fragment key={i}>{l}</Fragment>
      ))}
    </div>
  );
}

/*
 * Tableau des champs : vrai tableau à partir de 768 px ; en dessous, chaque champ devient une fiche
 * (ancien champ, nouveau champ, puis type, transformation, incertitude, statut et actions).
 */
function FieldTable({ e, fields, idx, highlight, advanced, actions }: { e: EntityMap; fields: FieldMap[]; idx: MappingIndex; highlight: string | null; advanced: boolean; actions: MappingActions }) {
  if (!fields.length) return <p className="text-small text-text-3">Aucun champ ne correspond au filtre choisi dans cette table.</p>;
  return (
    <div className={cx("rounded-panel bg-surface", "ring-1 ring-line")}>
      <table className="block w-full border-collapse text-left text-body md:table">
        <caption className="sr-only">
          Champs de {idx.legacy(e.source.table)} repris dans {e.label ?? e.name} : ancien champ, nouveau champ, type, transformation, incertitude, statut
        </caption>
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-line-strong text-small text-text-2">
            <th scope="col" className="w-[16%] px-3.5 pt-2.5 pb-2 font-semibold">
              Ancien champ
            </th>
            <th scope="col" className="w-[19%] px-3.5 pt-2.5 pb-2 font-semibold">
              Nouveau champ
            </th>
            <th scope="col" className="px-3.5 pt-2.5 pb-2 font-semibold">
              Transformation
            </th>
            <th scope="col" className="w-[10%] px-3.5 pt-2.5 pb-2 font-semibold">
              Incertitude
            </th>
            <th scope="col" className="w-[11%] px-3.5 pt-2.5 pb-2 font-semibold">
              Statut
            </th>
            <th scope="col" className="w-[20%] px-3.5 pt-2.5 pb-2 font-semibold">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {fields.map((f) => (
            <FieldRows key={f.name} e={e} f={f} idx={idx} highlight={highlight} advanced={advanced} actions={actions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CELL = "md:px-3.5 md:py-3 md:align-top";

function FieldRows({ e, f, idx, highlight, advanced, actions }: { e: EntityMap; f: FieldMap; idx: MappingIndex; highlight: string | null; advanced: boolean; actions: MappingActions }) {
  const key = `field:${e.name}.${f.name}`;
  const item = idx.item(key);
  const status = fieldStatus(e, f, idx);
  const off = status.kind === "rejected" || status.kind === "dropped";
  const col = idx.column(e.source.table, f.source);
  const table = idx.table(e.source.table);
  const target = f.references ? idx.entity(f.references) : undefined;
  const rel = f.type === "reference" ? idx.relation(e.source.table, f.source, target?.source.table) : undefined;
  const locked = !!f.accounting && !idx.unprotected.has(e.name);
  const unlocked = !!f.accounting && idx.unprotected.has(e.name);
  const refDropped = f.type === "reference" && !!f.references && idx.excludedEntities.has(f.references) && f.references !== e.name;
  const fix = correctionOf(f);
  const note = fix ? fix.original : f.note;
  const hl = highlight === key ? "bg-warning-soft/70" : status.kind === "pending" ? "bg-warning-soft/30" : undefined;
  const canReject = status.kind !== "dropped" && !locked && (!item || !item.decision ? true : false);

  return (
    <>
      <tr
        id={`champ-${e.name}-${f.name}`}
        className={cx("grid scroll-mt-28 grid-cols-1 gap-y-2 border-t border-line px-3.5 py-3 first:border-t-0 md:table-row md:p-0 md:first:border-t-0", hl)}
      >
        <td className={CELL}>
          <span className="sr-only md:hidden">Ancien champ : </span>
          <span className={cx("font-mono text-small font-semibold [overflow-wrap:anywhere]", off ? "text-text-3 line-through" : "text-ink")}>
            {idx.legacy(e.source.table)}.<wbr />
            {f.source}
          </span>
          {col ? (
            <span className="mt-0.5 block text-meta text-text-3">
              lu : {READ_TYPE[col.type] ?? col.type}
              {col.format ? ` · ${DATE_FMT[col.format] ?? SEP[col.format] ?? col.format}` : ""}
              {col.nulls ? ` · ${plural(col.nulls, "vide")}` : ""}
              {col.anomalies.count ? <span className="text-warning-ink"> · {plural(col.anomalies.count, "non conforme", "non conformes")}</span> : null}
            </span>
          ) : table ? (
            <span className="mt-0.5 block text-meta font-semibold text-danger-ink">absente des données reçues</span>
          ) : null}
        </td>
        <td className={CELL}>
          <span className="flex items-start gap-1.5">
            <ArrowRight size={14} aria-hidden className="mt-1 shrink-0 text-text-3 md:hidden" />
            <span className="min-w-0">
              <span className="sr-only">Nouveau champ : </span>
              <span className={cx("font-semibold", off ? "text-text-3 line-through" : "text-ink")}>
                {e.label ?? e.name} / {f.label ?? f.name}
              </span>
              <span className="mt-0.5 block text-small text-text-2">
                {f.type === "reference" ? (
                  <span className="inline-flex items-center gap-1">
                    <Link2 size={13} aria-hidden className="text-text-3" /> Lien vers {target ? (target.label ?? target.name) : (f.references ?? "?")}
                  </span>
                ) : (
                  (FIELD_TYPE[f.type] ?? f.type)
                )}
                {f.type === "enum" && f.options?.length ? <span className="text-text-3"> · {f.options.slice(0, 4).map((o) => o.label ?? o.value).join(", ")}{f.options.length > 4 ? ` (+${f.options.length - 4})` : ""}</span> : null}
              </span>
              {advanced && <span className="mt-0.5 block font-mono text-meta break-all text-text-3">{e.name}.{f.name}</span>}
              {(locked || unlocked || f.required || f.unique) && (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {locked && (
                    <Badge tone="info" icon={<Lock size={12} />} title={LOCK_TITLE}>
                      Protégé
                    </Badge>
                  )}
                  {unlocked && (
                    <Badge tone="warn" icon={<LockOpen size={12} />} title="Protection retirée par décision : modifiable sur les fiches migrées (modifications tracées).">
                      Modifiable
                    </Badge>
                  )}
                  {f.required && <Badge title="Une ligne sans valeur exploitable pour ce champ est rejetée et listée au rapport.">Obligatoire</Badge>}
                  {f.unique && <Badge>Unique</Badge>}
                </span>
              )}
            </span>
          </span>
        </td>
        <td className={CELL}>
          <span className="mb-0.5 block text-meta text-text-3 md:hidden">Transformation</span>
          {f.type === "reference" ? (
            <span className="flex flex-col gap-0.5 text-small text-text-2">
              <span>si la fiche liée est introuvable : {f.on_missing === "keep_unlinked" && !f.required ? "gardée sans lien" : "ligne rejetée"}</span>
              {rel && <span className={rel.orphans ? "text-warning-ink" : "text-text-3"}>{rel.orphans ? `${plural(rel.orphans, "lien orphelin", "liens orphelins")}${rel.orphan_samples.length ? ` (ex. ${rel.orphan_samples.slice(0, 3).join(", ")})` : ""}` : "aucun lien orphelin"}</span>}
              {!target && <span className="font-semibold text-danger-ink">table liée absente</span>}
              {refDropped && <span className="font-semibold text-danger-ink">table liée rejetée : lien retiré</span>}
            </span>
          ) : (
            <TransformList f={f} advanced={advanced} />
          )}
        </td>
        <td className={CELL}>
          <span className="mb-0.5 block text-meta text-text-3 md:hidden">Incertitude</span>
          <UncertaintyText value={f.confidence} threshold={idx.threshold} advanced={advanced} />
        </td>
        <td className={CELL}>
          <span className="mb-0.5 block text-meta text-text-3 md:hidden">Statut</span>
          <StatusCell s={status} />
        </td>
        <td className={CELL}>
          {status.kind === "pending" && item ? (
            <DecisionButtons item={item} actions={actions} onCorrect={() => actions.openCorrect(e.name, f.name)} compact />
          ) : status.kind !== "dropped" ? (
            <span className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" disabled={!!actions.busy} onClick={() => actions.openCorrect(e.name, f.name)}>
                Corriger
              </Button>
              {canReject && (
                <Button size="sm" variant="ghost" disabled={!!actions.busy} onClick={() => actions.openReject(e.name, f.name)}>
                  Rejeter
                </Button>
              )}
            </span>
          ) : null}
        </td>
      </tr>
      {(note || fix) && (
        <tr className={cx("block md:table-row", hl)}>
          <td colSpan={6} className="block px-3.5 pb-3 md:table-cell md:pt-0">
            {fix && (
              <p className="max-w-[760px] text-small leading-relaxed text-accent-ink">
                <PencilLine size={13} aria-hidden className="mr-1 inline align-[-2px]" />
                Corrigé le {fix.at} par {fix.by} : {fix.what}.
              </p>
            )}
            {note && <p className="max-w-[760px] text-small leading-relaxed text-text-2">{fix ? "Note d'origine : " : "Pourquoi : "}{note}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Corriger un champ                                                    */
/* ------------------------------------------------------------------ */

const TYPES = ["text", "integer", "decimal", "money", "percent", "date", "boolean", "enum", "email", "phone"] as const;
type Case = "keep" | "upper" | "lower";
interface Draft {
  label: string;
  source: string;
  type: string;
  required: boolean;
  trim: boolean;
  collapse: boolean;
  letterCase: Case;
  digits: boolean;
  nullIf: string;
  dateFormat: string;
  separator: string;
  boolTrue: string;
  boolFalse: string;
  options: { value: string; label: string }[];
}

function draftOf(f: FieldMap): Draft {
  const t = f.transforms ?? [];
  const has = (x: string) => t.some((y) => y === x);
  const obj = <K extends string>(k: K) => t.find((y): y is Extract<Transform, Record<K, unknown>> => typeof y === "object" && k in y) as Record<string, unknown> | undefined;
  const bool = obj("boolean")?.boolean as { true: string[]; false: string[] } | undefined;
  return {
    label: f.label ?? f.name,
    source: f.source,
    type: f.type,
    required: !!f.required,
    trim: has("trim"),
    collapse: has("collapse_spaces"),
    letterCase: has("upper") ? "upper" : has("lower") ? "lower" : "keep",
    digits: has("digits"),
    nullIf: ((obj("null_if")?.null_if as string[] | undefined) ?? []).join(", "),
    dateFormat: (obj("date")?.date as string | undefined) ?? "",
    separator: ((obj("money")?.money ?? obj("decimal")?.decimal) as string | undefined) ?? "",
    boolTrue: (bool?.true ?? []).join(", "),
    boolFalse: (bool?.false ?? []).join(", "),
    options: (f.options ?? []).map((o) => ({ value: o.value, label: o.label ?? "" })),
  };
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Transformations reconstruites dans un ordre fixe ; la table de codes d'origine est conservée telle quelle. */
function transformsOf(d: Draft, original: FieldMap): Transform[] {
  const out: Transform[] = [];
  if (list(d.nullIf).length) out.push({ null_if: list(d.nullIf) });
  if (d.trim) out.push("trim");
  if (d.collapse) out.push("collapse_spaces");
  if (d.letterCase === "upper") out.push("upper");
  if (d.letterCase === "lower") out.push("lower");
  if (d.digits) out.push("digits");
  const map = (original.transforms ?? []).find((t) => typeof t === "object" && "map" in t);
  if (map && (d.type === "enum" || d.type === "text")) out.push(map);
  if (d.type === "date" && d.dateFormat) out.push({ date: d.dateFormat as "DD/MM/YYYY" });
  if ((d.type === "money" || d.type === "decimal" || d.type === "percent") && d.separator) out.push(d.type === "money" ? { money: d.separator as "comma" } : { decimal: d.separator as "comma" });
  if (d.type === "boolean" && (list(d.boolTrue).length || list(d.boolFalse).length)) out.push({ boolean: { true: list(d.boolTrue), false: list(d.boolFalse) } });
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function changesOf(d: Draft, f: FieldMap, convDirty: boolean, structural: boolean): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (d.label.trim() && d.label.trim() !== (f.label ?? f.name)) c.label = d.label.trim();
  if (!structural) return c;
  if (d.source !== f.source) c.source = d.source;
  if (d.type !== f.type) c.type = d.type;
  if (d.required !== !!f.required) c.required = d.required;
  if (convDirty) {
    const t = transformsOf(d, f);
    if (!same(t, f.transforms ?? [])) c.transforms = t;
  }
  if (d.type === "enum") {
    const opts = d.options.map((o) => (o.label.trim() ? { value: o.value, label: o.label.trim() } : { value: o.value }));
    if (!same(opts, f.options ?? [])) c.options = opts;
  }
  return c;
}

function storedText(v: string | number | null, type: string): string {
  if (v === null) return "vide";
  if (type === "money" && typeof v === "number") return `${formatNumber(v / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  if (type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  if (type === "boolean") return v === 1 ? "oui" : v === 0 ? "non" : String(v);
  if (typeof v === "number") return formatNumber(v);
  return v;
}

function PreviewBlock({ p, type, title }: { p: ConversionPreview; type: string; title: string }) {
  return (
    <div className="min-w-0">
      <p className="text-small font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-small text-text-2">
        Sur {plural(p.total, "valeur", "valeurs")} de la colonne <span className="font-mono">{p.column}</span> : {plural(p.converted, "convertie", "converties")}, {plural(p.empty, "vide", "vides")}
        {p.failed ? (
          <span className="font-semibold text-danger-ink">
            , {plural(p.failed, "non convertible", "non convertibles")}
            {p.rejected ? ` (${plural(p.rejected, "ligne serait rejetée", "lignes seraient rejetées")} : champ obligatoire)` : " (laissées vides et signalées)"}
          </span>
        ) : p.rejected ? (
          <span className="font-semibold text-danger-ink"> ; {plural(p.rejected, "ligne serait rejetée", "lignes seraient rejetées")} (valeur vide d&apos;un champ obligatoire)</span>
        ) : null}
        .
      </p>
      {p.examples.length > 0 && (
        <table className="mt-2 w-full border-collapse text-small">
          <caption className="sr-only">Exemples réels : valeur d&apos;origine et valeur enregistrée</caption>
          <thead>
            <tr className="border-b border-line text-meta text-text-3">
              <th scope="col" className="py-1 pr-3 text-left font-semibold">
                Valeur d&apos;origine
              </th>
              <th scope="col" className="py-1 text-left font-semibold">
                Valeur enregistrée
              </th>
            </tr>
          </thead>
          <tbody>
            {p.examples.map((x, i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                <td className="py-1 pr-3 font-mono text-meta break-all text-ink">{x.raw === null ? "vide" : String(x.raw)}</td>
                <td className={cx("py-1 break-words", x.error ? "text-danger-ink" : "text-ink")}>{x.error ? `non convertible : ${x.error}` : storedText(x.stored, type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Formulaire de correction d'un champ, avec aperçu réel de la conversion avant enregistrement. */
export function CorrectFieldDialog({ open, onClose, e, f, idx, onSaved }: { open: boolean; onClose: () => void; e: EntityMap; f: FieldMap; idx: MappingIndex; onSaved: (text: string) => Promise<void> }) {
  const { id } = useProject();
  const [d, setD] = useState<Draft>(() => draftOf(f));
  const [convDirty, setConvDirty] = useState(false);
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<FieldsDryRun | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const locked = !!f.accounting;
  const isRef = f.type === "reference";
  const structural = !locked && !isRef;
  const table = idx.table(e.source.table);
  const changes = useMemo(() => changesOf(d, f, convDirty, structural), [d, f, convDirty, structural]);
  const changed = Object.keys(changes).length > 0;
  const body = useMemo(() => ({ version: idx.version, entity: e.name, field: f.name, op: "update", changes }), [idx.version, e.name, f.name, changes]);

  // Aperçu réel (dry_run), relancé à chaque modification (après une courte pause de saisie)
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const r = await projectCall<FieldsDryRun>(id, "POST", "/api/migration/mapping/fields", { ...body, dry_run: true });
        if (n !== seq.current) return;
        setPreview(r);
        setProblem(null);
      } catch (x) {
        if (n !== seq.current) return;
        setProblem((x as Error).message);
      } finally {
        if (n === seq.current) setChecking(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [open, id, body]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K], conv = false) => {
    setD((x) => ({ ...x, [k]: v }));
    if (conv) setConvDirty(true);
  };

  async function save() {
    setSaving(true);
    try {
      const r = await projectCall<{ version: number; summary: string[] }>(id, "POST", "/api/migration/mapping/fields", { ...body, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      await onSaved(`Correction enregistrée (version ${r.version}) : ${r.summary.join(" ; ")}.`);
      onClose();
    } catch (x) {
      setProblem((x as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const candidateT = convDirty ? transformsOf(d, f) : (f.transforms ?? []);
  const lossy = candidateT.filter((t) => transformInfo(t).effect === "change");
  const reviewItem = idx.item(`field:${e.name}.${f.name}`);

  return (
    <Dialog
      open={open}
      onClose={saving ? () => undefined : onClose}
      size="lg"
      title={`Corriger « ${f.label ?? f.name} »`}
      description={
        <>
          <span className="font-mono">
            {idx.legacy(e.source.table)}.{f.source}
          </span>{" "}
          → {e.label ?? e.name} / {f.label ?? f.name}. Une nouvelle version des correspondances (v{idx.version + 1}) sera créée ; le nom interne du champ et le logiciel visé ne changent pas.
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button variant="accent" onClick={() => void save()} loading={saving} loadingText="Enregistrement…" disabled={!changed || checking || !!problem}>
            Enregistrer la correction
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {locked && (
          <Callout tone="info" title="Champ de l'historique protégé">
            Seul son nom affiché peut être corrigé ici : sa lecture (type, conversion) engage des valeurs comptables historiques. Une nouvelle version des correspondances doit venir de l&apos;Analyste ou de
            l&apos;équipe REBORN.
          </Callout>
        )}
        {isRef && <Callout tone="info">Lien entre fiches : seul son nom affiché peut être corrigé ici.</Callout>}
        <Field label="Nom dans le nouveau logiciel" required>
          <Input value={d.label} maxLength={80} onChange={(x) => set("label", x.target.value)} />
        </Field>

        {structural && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ancien champ (colonne lue)" hint={`Colonnes de ${idx.legacy(e.source.table)} dans les données reçues.`}>
                <Select value={d.source} onChange={(x) => set("source", x.target.value)}>
                  {(table?.columns ?? [{ name: f.source } as ColumnProfile]).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                      {c.type ? ` — ${READ_TYPE[c.type] ?? c.type}${c.nulls ? `, ${plural(c.nulls, "vide")}` : ""}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type dans le nouveau logiciel">
                <Select value={d.type} onChange={(x) => set("type", x.target.value, true)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <fieldset className="flex flex-col gap-3 rounded-panel px-4 py-3.5 ring-1 ring-line">
              <legend className="px-1 text-small font-semibold text-ink">Transformation</legend>
              {d.type === "date" && (
                <Field label="Format des dates dans l'ancien logiciel" hint="Une date illisible ou inexistante n'est jamais approchée : elle est laissée vide et signalée.">
                  <Select value={d.dateFormat} onChange={(x) => set("dateFormat", x.target.value, true)}>
                    <option value="">Non précisé (AAAA-MM-JJ attendu)</option>
                    <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
                    <option value="MM/DD/YYYY">MM/JJ/AAAA (américain)</option>
                    <option value="YYYY-MM-DD">AAAA-MM-JJ (déclaré)</option>
                    <option value="excel">Numéro de série Excel</option>
                  </Select>
                </Field>
              )}
              {(d.type === "money" || d.type === "decimal" || d.type === "percent") && (
                <Field label="Séparateur décimal dans l'ancien logiciel" hint={d.type === "money" ? "Les montants sont repris au centime exact ; plus de deux décimales non nulles sont refusées, jamais arrondies." : undefined}>
                  <Select value={d.separator} onChange={(x) => set("separator", x.target.value, true)}>
                    <option value="">Non précisé (détecté valeur par valeur)</option>
                    <option value="comma">Virgule (1 234,56)</option>
                    <option value="dot">Point (1,234.56)</option>
                    <option value="auto">Détecté valeur par valeur (déclaré)</option>
                  </Select>
                </Field>
              )}
              {d.type === "boolean" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Valeurs qui signifient « oui »" hint="Séparées par des virgules.">
                    <Input value={d.boolTrue} onChange={(x) => set("boolTrue", x.target.value, true)} />
                  </Field>
                  <Field label="Valeurs qui signifient « non »" hint="Séparées par des virgules.">
                    <Input value={d.boolFalse} onChange={(x) => set("boolFalse", x.target.value, true)} />
                  </Field>
                </div>
              )}
              <Checkbox label="Retirer les espaces au début et à la fin" checked={d.trim} onChange={(x) => set("trim", x.target.checked, true)} />
              <Checkbox label="Réduire les espaces multiples à un seul" hint="Modifie la valeur d'origine." checked={d.collapse} onChange={(x) => set("collapse", x.target.checked, true)} />
              <Checkbox label="Ne garder que les chiffres" hint="Supprime tout autre caractère de la valeur enregistrée." checked={d.digits} onChange={(x) => set("digits", x.target.checked, true)} />
              <Field label="Majuscules et minuscules">
                <Select value={d.letterCase} onChange={(x) => set("letterCase", x.target.value as Case, true)}>
                  <option value="keep">Inchangées</option>
                  <option value="upper">Tout en majuscules (modifie la valeur)</option>
                  <option value="lower">Tout en minuscules (modifie la valeur)</option>
                </Select>
              </Field>
              <Field label="Valeurs à enregistrer comme vides" hint="Séparées par des virgules (ex. N/A, -). Ces valeurs d'origine seront effacées de la valeur enregistrée.">
                <Input value={d.nullIf} onChange={(x) => set("nullIf", x.target.value, true)} />
              </Field>
              {lossy.length > 0 && (
                <Callout tone="warn" title="Cette transformation modifie la valeur d'origine">
                  {lossy.map((t) => transformInfo(t).label).join(" ; ")}. La valeur d&apos;origine reste consultable dans la traçabilité de chaque fiche.
                </Callout>
              )}
            </fieldset>

            {d.type === "enum" && d.options.length > 0 && (
              <fieldset className="flex flex-col gap-2 rounded-panel px-4 py-3.5 ring-1 ring-line">
                <legend className="px-1 text-small font-semibold text-ink">Libellés affichés des valeurs</legend>
                <p className="text-small text-text-2">La valeur enregistrée ne change pas ; seul son libellé dans le nouveau logiciel change.</p>
                {d.options.map((o, i) => (
                  <Field key={o.value} label={`Valeur « ${o.value} »`}>
                    <Input
                      value={o.label}
                      maxLength={80}
                      placeholder={o.value}
                      onChange={(x) => {
                        const opts = d.options.map((y, k) => (k === i ? { ...y, label: x.target.value } : y));
                        set("options", opts);
                      }}
                    />
                  </Field>
                ))}
              </fieldset>
            )}

            <Checkbox label="Champ obligatoire" hint="Une ligne sans valeur exploitable pour ce champ sera rejetée (et listée au rapport d'écarts)." checked={d.required} onChange={(x) => set("required", x.target.checked)} />
          </>
        )}

        <div aria-live="polite" className="flex flex-col gap-3 rounded-panel bg-canvas px-4 py-3.5 ring-1 ring-line">
          <p className="text-small font-semibold text-ink">{checking ? "Aperçu en cours de calcul sur les données réelles…" : "Aperçu sur les données réelles"}</p>
          {problem ? (
            <Callout tone="bad" title="Correction impossible">
              <p className="break-words">{problem}</p>
            </Callout>
          ) : preview ? (
            <>
              {preview.candidate || preview.current ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {preview.current && <PreviewBlock p={preview.current} type={f.type} title="Aujourd'hui" />}
                  {changed && preview.candidate && <PreviewBlock p={preview.candidate} type={d.type} title="Après correction" />}
                </div>
              ) : (
                <p className="text-small text-text-2">Aucun aperçu de conversion pour un lien entre fiches.</p>
              )}
              {changed && preview.changed !== null && (
                <p className={cx("text-small", preview.changed ? "font-semibold text-warning-ink" : "text-text-2")}>
                  {preview.changed ? `${plural(preview.changed, "valeur serait enregistrée", "valeurs seraient enregistrées")} différemment de la version actuelle.` : "Aucune valeur enregistrée ne change : seule la présentation change."}
                </p>
              )}
              {preview.warnings.map((w) => (
                <p key={w} className="text-small text-warning-ink">
                  {w}
                </p>
              ))}
            </>
          ) : (
            <p className="text-small text-text-3">Calcul de l&apos;aperçu…</p>
          )}
        </div>

        <Field label="Commentaire (facultatif)" hint={reviewItem && !reviewItem.decision ? "Corriger cette proposition incertaine vaut confirmation : elle ne sera plus « à vérifier »." : "Consigné avec la correction."}>
          <Textarea rows={2} maxLength={500} value={comment} onChange={(x) => setComment(x.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Rejeter un champ sûr                                                 */
/* ------------------------------------------------------------------ */

/** Retrait d'un champ (proposition non incertaine) : conséquences calculées par l'API avant de confirmer. */
export function RejectFieldDialog({ open, onClose, e, f, idx, onSaved }: { open: boolean; onClose: () => void; e: EntityMap; f: FieldMap; idx: MappingIndex; onSaved: (text: string) => Promise<void> }) {
  const { id } = useProject();
  const [plan, setPlan] = useState<FieldsDryRun | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const body = useMemo(() => ({ version: idx.version, entity: e.name, field: f.name, op: "exclude" }), [idx.version, e.name, f.name]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlan(null);
    setProblem(null);
    projectCall<FieldsDryRun>(id, "POST", "/api/migration/mapping/fields", { ...body, dry_run: true })
      .then((r) => live && setPlan(r))
      .catch((x: Error) => live && setProblem(x.message));
    return () => {
      live = false;
    };
  }, [open, id, body]);

  async function confirm() {
    setSaving(true);
    try {
      const r = await projectCall<{ version: number }>(id, "POST", "/api/migration/mapping/fields", body);
      await onSaved(`« ${f.label ?? f.name} » n'est plus repris (version ${r.version}). Il peut être repris depuis la table ${e.label ?? e.name}.`);
      onClose();
    } catch (x) {
      setProblem((x as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={`Rejeter « ${f.label ?? f.name} » ?`}
      description={
        <>
          <span className="font-mono">
            {idx.legacy(e.source.table)}.{f.source}
          </span>{" "}
          ne sera plus repris dans {e.label ?? e.name}. Une nouvelle version des correspondances (v{idx.version + 1}) sera créée.
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={saving} loadingText="Enregistrement…" disabled={!plan || !!problem}>
            Rejeter ce champ
          </Button>
        </>
      }
    >
      {problem ? (
        <Callout tone="bad" title="Rejet impossible">
          <p className="break-words">{problem}</p>
        </Callout>
      ) : plan ? (
        <div className="flex flex-col gap-2 text-body text-text-2">
          <p className="font-semibold text-ink">Conséquences :</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {plan.consequences.map((c) => (
              <li key={c}>{c}.</li>
            ))}
            <li>la décision est réversible : le champ peut être repris tel qu&apos;il était.</li>
          </ul>
        </div>
      ) : (
        <p role="status" className="text-body text-text-3">
          Calcul des conséquences…
        </p>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Problèmes, relations, pièces jointes, repères                        */
/* ------------------------------------------------------------------ */

export function IssueList({ issues, idx, onFocus }: { issues: MappingIssue[]; idx: MappingIndex; onFocus: (key: string) => void }) {
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return (
    <ul className={cx("flex flex-col divide-y divide-line bg-surface", PANEL)}>
      {sorted.map((i, n) => {
        const w = issueWhere(i.path, idx);
        const err = i.level === "error";
        return (
          <li key={`${i.path}-${n}`} className="flex items-start gap-2.5 px-3.5 py-2.5 text-body">
            {err ? <CircleX size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {err ? <Badge tone="bad">Bloquant</Badge> : <span className="sr-only">Avertissement :</span>}
                {w.focus ? (
                  <FocusLink to={w.focus} onFocus={onFocus} className="font-semibold text-ink">
                    {w.where}
                  </FocusLink>
                ) : (
                  <span className="font-semibold text-ink">{w.where}</span>
                )}
              </p>
              <p className="mt-0.5 break-words text-text-2">{i.message}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RelationsList({ idx, onFocus }: { idx: MappingIndex; onFocus: (key: string) => void }) {
  const refs = idx.mapping.entities.flatMap((e) => e.fields.filter((f) => f.type === "reference").map((f) => ({ e, f })));
  if (!refs.length) return <EmptyState title="Aucun lien déclaré">Les tables de cette version ne sont pas reliées entre elles.</EmptyState>;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {refs.map(({ e, f }) => {
        const target = f.references ? idx.entity(f.references) : undefined;
        const rel = idx.relation(e.source.table, f.source, target?.source.table);
        const off = idx.excludedEntities.has(e.name) || (!!f.references && idx.excludedEntities.has(f.references)) || idx.item(`field:${e.name}.${f.name}`)?.decision?.decision === "excluded";
        return (
          <li key={`${e.name}.${f.name}`} className="min-w-0">
            <a
              href={anchorOf(`field:${e.name}.${f.name}`)}
              onClick={(ev) => {
                ev.preventDefault();
                onFocus(`field:${e.name}.${f.name}`);
              }}
              className={cx("block h-full rounded-panel px-3.5 py-2.5 transition-colors duration-(--duration-fast) hover:bg-canvas", PANEL)}
            >
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body">
                <b className={cx("font-semibold text-ink", off && "line-through")}>{e.label ?? e.name}</b>
                <span className="text-text-2">{f.label ?? f.name}</span>
                <ArrowRight size={13} className="shrink-0 text-text-3" aria-hidden />
                <b className="font-semibold text-ink">{target ? (target.label ?? target.name) : (f.references ?? "?")}</b>
                {off && <Badge tone="bad">Retiré par décision</Badge>}
              </span>
              <span className="mt-0.5 block text-small text-text-3">
                <span className="font-mono break-all">
                  {idx.legacy(e.source.table)}.{f.source}
                </span>{" "}
                · si introuvable : {f.on_missing === "keep_unlinked" && !f.required ? "gardé sans lien" : "ligne rejetée"}
                {rel ? <span className={rel.orphans ? "text-warning-ink" : undefined}> · {rel.orphans ? plural(rel.orphans, "lien orphelin", "liens orphelins") : "aucun lien orphelin"}</span> : null}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function AttachmentRow({ a, i, idx, highlight, actions }: { a: AttachmentMap; i: number; idx: MappingIndex; highlight: string | null; actions: MappingActions }) {
  const key = `attachment:${i}`;
  const item = idx.item(key);
  const d = item?.decision ?? null;
  const owners = "map" in a.owner ? Object.entries(a.owner.map).map(([code, ent]) => `${idx.label(ent)} (${code})`) : [idx.label(a.owner.entity)];
  return (
    <li id={`piece-${i}`} className={cx("flex scroll-mt-24 flex-col gap-1 px-3.5 py-3", PANEL, highlight === key && "bg-warning-soft/70")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-body font-semibold text-ink">
          <Paperclip size={14} className="text-text-3" aria-hidden />
          <span className={cx("font-mono break-all", d?.decision === "excluded" && "line-through")}>{idx.legacy(a.source.table)}</span>
          <span className="font-normal text-text-3">+</span>
          <span className="font-mono break-all">{a.archive}</span>
          {item && !d && (
            <Badge tone="warn" icon={<TriangleAlert size={12} />}>
              À vérifier
            </Badge>
          )}
          {d?.decision === "accepted" && <Badge tone="ok">Accepté</Badge>}
          {d?.decision === "excluded" && <Badge tone="bad">Rejeté</Badge>}
        </p>
        <span className="text-small">
          <span className="text-text-3">Incertitude : </span>
          <UncertaintyText value={a.confidence} threshold={idx.threshold} advanced />
        </span>
      </div>
      <p className="text-small text-text-2">
        Rattachées à {owners.join(", ")}
        {"map" in a.owner ? (
          <>
            {" "}
            selon <code className="font-mono">{a.owner.type}</code> et <code className="font-mono">{a.owner.id}</code>
          </>
        ) : (
          <>
            {" "}
            par <code className="font-mono">{a.owner.id}</code>
          </>
        )}
        .
      </p>
      <p className="text-meta text-text-3">
        Chemin <code className="font-mono">{a.path}</code> · nom <code className="font-mono">{a.filename}</code> · clé <code className="font-mono">{a.source.key}</code>
      </p>
      {a.note && <p className="text-small text-text-3">{a.note}</p>}
      {item && !d && (
        <div className="mt-1">
          <DecisionButtons item={item} actions={actions} compact />
        </div>
      )}
    </li>
  );
}

/** Explication des repères du tableau (section technique). */
export function MappingNotes({ threshold, auto }: { threshold: number; auto: boolean }) {
  return (
    <ul className="flex flex-col gap-1.5 text-small leading-relaxed text-text-2">
      <li>
        <b className="font-semibold text-ink">Incertitude.</b> {auto ? "Mesurée sur les données lues (le sens métier n'est pas confirmé)." : "Déduite de la confiance déclarée par l'émetteur, non mesurée par REBORN."} Sous{" "}
        {formatPercent(threshold, 0)} de confiance, un humain tranche avant la migration ; « non précisée » signifie que l&apos;émetteur la considère comme sûre.
      </li>
      <li>
        <b className="font-semibold text-ink">Protégé.</b> Sur les fiches migrées, le champ n&apos;est pas modifiable ; toute tentative est refusée et tracée.
      </li>
      <li>
        <b className="font-semibold text-ink">Transformations.</b> Toutes sont affichées ; celles qui modifient la valeur d&apos;origine sont signalées. Une valeur vide reste vide, une valeur non convertible n&apos;est
        jamais approchée, les montants sont repris au centime exact.
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Hook : actions de la page                                            */
/* ------------------------------------------------------------------ */

export function useMappingActions(version: number, reload: () => Promise<void>) {
  const { post } = useProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  // La fenêtre reste montée après fermeture (open=false) : le design system rend alors le focus au bouton d'origine
  const [dialog, setDialog] = useState<{ kind: "correct" | "reject"; entity: string; field: string; open: boolean; seq: number } | null>(null);

  const decide = useCallback(
    async (key: string, decision: Decision["decision"], comment?: string) => {
      setBusy(key);
      setNotice(null);
      try {
        await post("/api/migration/decisions", comment ? { key, decision, comment } : { key, decision });
        setNotice({ tone: "ok", text: `Décision enregistrée : ${decision === "accepted" ? (key.startsWith("accounting:") ? "protection gardée" : "proposition acceptée") : key.startsWith("accounting:") ? "modifications autorisées" : "proposition rejetée"}.` });
        await reload();
      } catch (e) {
        setNotice({ tone: "bad", text: (e as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [post, reload],
  );

  const restore = useCallback(
    async (entity: string, field: string) => {
      setBusy(`restore:${entity}.${field}`);
      setNotice(null);
      try {
        const r = await post<{ version: number; summary: string[] }>("/api/migration/mapping/fields", { version, entity, field, op: "restore" });
        setNotice({ tone: "ok", text: `${r.summary.join(" ; ")} — version ${r.version}.` });
        await reload();
      } catch (e) {
        setNotice({ tone: "bad", text: (e as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [post, reload, version],
  );

  const saved = useCallback(
    async (text: string) => {
      setNotice({ tone: "ok", text });
      await reload();
    },
    [reload],
  );

  const actions: MappingActions = {
    version,
    decide,
    restore,
    busy,
    openCorrect: (entity, field) => setDialog((d) => ({ kind: "correct", entity, field, open: true, seq: (d?.seq ?? 0) + 1 })),
    openReject: (entity, field) => setDialog((d) => ({ kind: "reject", entity, field, open: true, seq: (d?.seq ?? 0) + 1 })),
  };
  return { actions, notice, setNotice, dialog, closeDialog: () => setDialog((d) => (d ? { ...d, open: false } : d)), saved };
}
