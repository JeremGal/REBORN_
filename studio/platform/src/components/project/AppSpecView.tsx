"use client";

import type { ReactNode } from "react";
import { Calculator, ChevronRight, LayoutDashboard, Lock, Settings } from "lucide-react";
import { cx, formatPercent } from "@/components/ds";
import { Facts, Section, TestBadge } from "./Step";
import { ApiRoutes, SubHeading, Tag, fmtDate, plural, type AppSpecPreview, type SpecEntity, type SpecField, type SpecProvenance, type Tone } from "./AppKit";

/*
 * Spécification du nouveau logiciel (GET /api/migration/spec, ApplicationSpec) : tout ce qui est
 * affiché ici est lu dans la réponse de l'API, rien n'est calculé ni supposé côté navigateur.
 * Vue d'ensemble (modules, pages, liens, règles, fonctionnalités, limites) et vue avancée.
 */

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

const PROVENANCE: Record<SpecProvenance["status"], { label: string; tone: Tone; hint: string }> = {
  observed: { label: "Observé", tone: "info", hint: "Présent dans les données réellement extraites de l'ancien logiciel" },
  deduced: { label: "Déduit", tone: "warn", hint: "Proposé (par REBORN ou par l'Analyste) sans validation humaine explicite" },
  validated: { label: "Validé", tone: "ok", hint: "Validé par un humain (décision tracée) ou issu d'une version validée du modèle métier" },
};

const CLASSIFICATION: Record<string, { label: string; tone: Tone }> = {
  financial: { label: "Document comptable", tone: "info" },
  commercial: { label: "Document commercial", tone: "info" },
  line: { label: "Lignes de document", tone: "idle" },
  master: { label: "Référentiel", tone: "idle" },
  other: { label: "Montants datés", tone: "warn" },
};

const NOT_REBUILT_KIND: Record<string, string> = {
  table: "Table",
  field: "Champ",
  entity: "Table",
  workflow: "Workflow",
  rule: "Règles",
  attachment: "Pièces jointes",
};

export const ACTION_LABEL: Record<string, string> = {
  create: "Créer",
  update: "Modifier",
  delete: "Supprimer",
  export: "Exporter",
  attach: "Joindre des fichiers",
  reprice: "Recalculer",
};

export const entityLabel = (spec: AppSpecPreview | null, name: string) => spec?.entities.find((e) => e.name === name)?.label ?? name;
const fieldLabel = (e: SpecEntity, name: string) => e.fields.find((f) => f.name === name)?.label ?? name;

function ProvenanceTag({ p }: { p?: SpecProvenance }) {
  if (!p) return <Tag title="La spécification ne précise pas l'origine de cet élément">Origine non précisée</Tag>;
  const d = PROVENANCE[p.status] ?? { label: p.status, tone: "idle" as Tone, hint: "" };
  return (
    <Tag tone={d.tone} title={d.hint}>
      {d.label}
    </Tag>
  );
}

/** Confiance déclarée avec la correspondance : une estimation, jamais une vérification (jamais arrondie à 100 %). */
function DeclaredConfidence({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-small text-text-3">—</span>;
  return (
    <span className={cx("tabular text-small", value < 0.8 ? "font-semibold text-warning-ink" : "text-text-2")} title="Confiance déclarée avec la correspondance (estimation de son auteur, pas une vérification)">
      {formatPercent(value, 0)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Vue d'ensemble (examen avant mise en service)                        */
/* ------------------------------------------------------------------ */

function Block({ title, count, children, className }: { title: string; count?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0 border-t border-line pt-4", className)}>
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-body font-semibold text-ink">
        {title}
        {count !== undefined && <span className="tabular text-small font-normal text-text-3">{count}</span>}
      </h3>
      <div className="mt-2 text-body text-text-2">{children}</div>
    </div>
  );
}

/** Vue synthétique du logiciel qui serait généré : uniquement ce que décrit l'ApplicationSpec. */
export function SpecOverview({ spec, testMapping }: { spec: AppSpecPreview; testMapping: boolean }) {
  const nav = new Set(spec.navigation.map((n) => n.entity));
  const modules = spec.entities.filter((e) => nav.has(e.name));
  const inner = spec.entities.filter((e) => !nav.has(e.name));
  const screens = spec.screens ?? [];
  const byKind = (k: string) => screens.filter((s) => s.kind === k).length;
  const links = spec.entities.flatMap((e) => e.fields.filter((f) => f.type === "reference" && f.references).map((f) => ({ from: e, f })));
  const protectedEntities = spec.entities.filter((e) => e.fields.some((f) => f.accounting));
  const actions = spec.actions ?? [];
  const actionKinds = [...new Set(actions.map((a) => a.action))];
  const rules = spec.rules;
  const workflows = (spec.not_rebuilt ?? []).filter((x) => x.kind === "workflow");
  const limits = (spec.not_rebuilt ?? []).filter((x) => x.kind !== "workflow");
  const b = spec.app.branding;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {b && (
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-panel text-lead font-semibold text-white" style={{ background: b.primary_color }}>
            {b.logo_text}
          </span>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lead font-semibold text-ink">
            {spec.app.name}
            {testMapping && <TestBadge />}
          </p>
          <p className="text-small text-text-2">
            {spec.app.tagline}
            {spec.app.company ? ` · ${spec.app.company}` : ""} · aperçu calculé le {fmtDate(spec.app.generated_at)} ; rien n&apos;est généré avant la mise en service.
          </p>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <Block title="Modules" count={plural(modules.length, "module", "modules")}>
          <ul className="flex flex-col gap-1">
            {modules.map((e) => (
              <li key={e.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-ink">{e.label}</span>
                <span className="tabular text-small text-text-3">
                  {plural(e.fields.length, "champ", "champs")}
                  {e.children.length ? ` · ${plural(e.children.length, "liste liée", "listes liées")}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {inner.length > 0 && <p className="mt-2 text-small text-text-3">Accessibles depuis leur fiche : {inner.map((e) => e.label).join(", ")}.</p>}
        </Block>

        <Block title="Pages" count={plural(screens.length, "page", "pages")}>
          {screens.length ? (
            <p>
              {[
                byKind("dashboard") ? plural(byKind("dashboard"), "tableau de bord", "tableaux de bord") : null,
                byKind("list") ? plural(byKind("list"), "liste", "listes") : null,
                byKind("detail") ? plural(byKind("detail"), "fiche détaillée", "fiches détaillées") : null,
                byKind("form") ? plural(byKind("form"), "formulaire", "formulaires") : null,
                byKind("admin") ? plural(byKind("admin"), "page d'administration", "pages d'administration") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          ) : (
            <p>La spécification ne décrit aucune page.</p>
          )}
          {spec.dashboard.cards.length > 0 && <p className="mt-1 text-small text-text-3">Tableau de bord : {spec.dashboard.cards.map((c) => c.label).join(" · ")}.</p>}
        </Block>

        <Block title="Liens entre fiches" count={plural(links.length, "lien", "liens")}>
          {links.length ? (
            <ul className="flex flex-col gap-0.5">
              {links.slice(0, 12).map(({ from, f }) => (
                <li key={`${from.name}.${f.name}`}>
                  <span className="text-ink">{from.label}</span> → {entityLabel(spec, f.references!)}
                  <span className="text-text-3"> ({f.label})</span>
                </li>
              ))}
              {links.length > 12 && <li className="text-small text-text-3">+ {plural(links.length - 12, "autre lien", "autres liens")} (vue avancée)</li>}
            </ul>
          ) : (
            <p>Aucun lien entre fiches.</p>
          )}
        </Block>

        <Block title="Règles et calculs">
          {rules?.bindings.length ? (
            <>
              <p>
                Modèle métier installé : {rules.versions.map((v) => `v${v.version}`).join(", ")}. Calcule :{" "}
                {[...new Set(rules.bindings.map((x) => `${entityLabel(spec, x.entity)} (${x.scope === "line" ? "calcul des lignes" : "totaux du document"})`))].join(", ")}.
              </p>
              {rules.versions.at(-1)?.history_check ? (
                <p className="mt-1 text-small text-text-3">{rules.versions.at(-1)!.history_check}</p>
              ) : (
                <p className="mt-1 text-small text-warning-ink">Pas encore rejoué sur l&apos;historique migré.</p>
              )}
            </>
          ) : (
            <p className="text-warning-ink">Aucun modèle métier validé : les nouveaux documents ne seront pas calculés automatiquement.</p>
          )}
          {protectedEntities.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-small">
              <Lock size={14} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
              <span>
                Historique protégé : {protectedEntities.map((e) => `${e.label} (${e.fields.filter((f) => f.accounting).map((f) => f.label.toLowerCase()).join(", ")})`).join(" ; ")}.
              </span>
            </p>
          )}
        </Block>

        <Block title="Fonctionnalités prises en charge" className="md:col-span-2">
          {actionKinds.length ? (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {actionKinds.map((k) => {
                const list = actions.filter((a) => a.action === k);
                const ok = list.filter((a) => a.available);
                const noted = list.filter((a) => a.note);
                return (
                  <li key={k} className="min-w-0">
                    <span className="font-semibold text-ink">{ACTION_LABEL[k] ?? k}</span>
                    <span className="text-text-2"> — {ok.length === modules.length + inner.length ? "toutes les tables" : ok.map((a) => entityLabel(spec, a.entity)).join(", ")}</span>
                    {noted.length > 0 && <span className="block text-small text-text-3">{[...new Set(noted.map((a) => a.note))].join(" · ")}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>La spécification ne décrit aucune action des utilisateurs.</p>
          )}
        </Block>

        <Block title="Workflows" count={workflows.length ? plural(workflows.length, "non reconstruit", "non reconstruits") : undefined}>
          {workflows.length ? (
            <ul className="flex flex-col gap-1">
              {workflows.map((w) => (
                <li key={w.name}>
                  <span className="font-semibold text-ink">{w.name}</span> — {w.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucun workflow n&apos;a été transmis par l&apos;analyse : aucun enchaînement automatique (validation, relance…) n&apos;est reconstruit.</p>
          )}
        </Block>

        <Block title="Limites" count={plural(limits.length, "élément non reconstruit", "éléments non reconstruits")}>
          {limits.length ? (
            <ul className="flex flex-col gap-1.5">
              {limits.map((x, i) => (
                <li key={`${x.kind}-${x.name}-${i}`} className="min-w-0">
                  <Tag tone="warn" plain className="mr-1.5">
                    {NOT_REBUILT_KIND[x.kind] ?? x.kind}
                  </Tag>
                  <span className="font-semibold break-words text-ink">{x.name}</span>
                  <span className="block text-small text-text-2">{x.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Aucun élément non reconstruit : pas de table reçue sans correspondance, d&apos;export refusé, d&apos;exclusion ni de version du modèle métier en attente.</p>
          )}
          <p className="mt-2 text-small text-text-3">Tout ce qui figure ici vient des données réellement récupérées, des correspondances et du modèle métier validés : rien n&apos;est ajouté.</p>
        </Block>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vue avancée : spécification détaillée                                */
/* ------------------------------------------------------------------ */

export function SpecDetails({ spec }: { spec: AppSpecPreview }) {
  const pv = spec.provenance;
  return (
    <div className="flex flex-col gap-7">
      {pv && (
        <Facts
          items={[
            { label: "Correspondances", value: `v${pv.mapping_version} · ${pv.mapping_origin}` },
            { label: "Migration de référence", value: <span className="font-mono text-small">{pv.migration_run}</span> },
            { label: "Modèle métier installé", value: pv.business_model_versions.length ? pv.business_model_versions.map((v) => `v${v}`).join(", ") : <span className="text-warning-ink">aucune version validée</span> },
            { label: "Port local prévu", value: <span className="tabular">{spec.app.port}</span> },
          ]}
        />
      )}
      {pv?.statement && <p className="-mt-3 text-small leading-relaxed text-text-2">{pv.statement}</p>}
      <div>
        <SubHeading>Tables et champs</SubHeading>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small text-text-2">
          <span className="inline-flex items-center gap-1.5">
            <Tag tone="info">Observé</Tag> dans les données extraites
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Tag tone="warn">Déduit</Tag> proposé, sans validation humaine
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Tag tone="ok">Validé</Tag> décision humaine tracée
          </span>
        </p>
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
          {spec.entities.map((e) => (
            <EntityItem key={e.name} e={e} spec={spec} inNav={spec.navigation.some((n) => n.entity === e.name)} />
          ))}
        </ul>
        <p className="mt-2 text-small text-text-3">Pourcentage : confiance déclarée avec la correspondance, une estimation et non une vérification.</p>
      </div>
      <div>
        <SubHeading>Pages et actions</SubHeading>
        <ScreensAndActions spec={spec} />
      </div>
    </div>
  );
}

function EntityItem({ e, spec, inNav }: { e: SpecEntity; spec: AppSpecPreview; inNav: boolean }) {
  const refs = e.fields.filter((f) => f.type === "reference").length;
  const computed = e.fields.filter((f) => f.computed_by_rules).length;
  const locked = e.fields.filter((f) => f.accounting);
  const cl = e.classification ? CLASSIFICATION[e.classification.kind] : null;
  return (
    <li>
      <details className="group/ent">
        <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3.5 py-3 transition-colors duration-(--duration-fast) hover:bg-canvas [&::-webkit-details-marker]:hidden">
          <ChevronRight size={15} aria-hidden className="mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-fast) group-open/ent:rotate-90" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body font-semibold text-ink">{e.label}</span>
              <span className="font-mono text-meta text-text-3">{e.name}</span>
              <ProvenanceTag p={e.provenance} />
              {cl && (
                <Tag tone={cl.tone} plain title={e.classification?.note}>
                  {cl.label}
                </Tag>
              )}
              {locked.length > 0 && (
                <Tag tone="info" icon={<Lock size={12} />} title={`Champs protégés pour les fiches migrées : ${locked.map((f) => f.label).join(", ")}`}>
                  Historique protégé
                </Tag>
              )}
              {!inNav && (
                <Tag plain title="Table absente du menu principal">
                  Hors menu
                </Tag>
              )}
            </div>
            <p className="mt-0.5 text-small break-words text-text-2">
              Source <span className="font-mono text-meta text-ink">{e.provenance?.source ?? "non précisée"}</span> · {plural(e.fields.length, "champ", "champs")} · {plural(refs, "lien", "liens")}
              {computed ? ` · ${plural(computed, "calculé", "calculés")} par le modèle métier` : ""}
            </p>
          </div>
          <span className="hidden shrink-0 pt-0.5 sm:block">
            <DeclaredConfidence value={e.provenance?.confidence} />
          </span>
        </summary>
        <EntityDetail e={e} spec={spec} />
      </details>
    </li>
  );
}

function EntityDetail({ e, spec }: { e: SpecEntity; spec: AppSpecPreview }) {
  const facts: { label: string; value: ReactNode }[] = [];
  if (e.children.length) facts.push({ label: "Fiches liées affichées", value: e.children.map((c) => `${c.label} (via ${c.via})`).join(" · ") });
  if (e.list_fields.length) facts.push({ label: "Colonnes de la liste", value: e.list_fields.map((n) => fieldLabel(e, n)).join(", ") });
  if (e.search_fields.length) facts.push({ label: "Recherche sur", value: e.search_fields.map((n) => fieldLabel(e, n)).join(", ") });
  if (e.line_of) facts.push({ label: "Lignes de", value: `${entityLabel(spec, e.line_of.entity)} (via ${e.line_of.via}) : pas d'ajout de ligne à un document historique protégé` });
  if (e.classification)
    facts.push({
      label: "Classement de la table",
      value: `${CLASSIFICATION[e.classification.kind]?.label ?? e.classification.kind} · confiance déclarée ${formatPercent(e.classification.confidence, 0)}${e.classification.note ? ` · ${e.classification.note}` : ""}`,
    });
  if (e.computed.length)
    facts.push({
      label: "Formules (fiches créées dans le nouveau logiciel)",
      value: (
        <span className="flex flex-col gap-0.5">
          {e.computed.map((c) => (
            <code key={c.field} className="font-mono text-small break-all">
              {c.field} = {c.expr}
            </code>
          ))}
        </span>
      ),
    });
  if (e.aggregates.length)
    facts.push({
      label: "Totaux sur les lignes (fiches créées dans le nouveau logiciel)",
      value: (
        <span className="flex flex-col gap-0.5">
          {e.aggregates.map((a) => (
            <code key={a.field} className="font-mono text-small break-all">
              {a.field} = somme de ({a.expr}) sur {entityLabel(spec, a.children)} via {a.via}
            </code>
          ))}
        </span>
      ),
    });
  return (
    <div className="border-t border-line bg-canvas px-3.5 pt-3 pb-4">
      <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_60px] gap-x-4 px-3.5 pb-1.5 text-meta font-semibold text-text-3 sm:grid">
        <span>Champ</span>
        <span>Type et règles</span>
        <span>Origine (ancienne table.colonne)</span>
        <span className="text-right">Confiance</span>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-panel bg-surface ring-1 ring-line">
        {e.fields.map((f) => (
          <FieldRow key={f.name} f={f} spec={spec} defaultBasis={spec.provenance?.mapping_origin} />
        ))}
      </ul>
      {facts.length > 0 && <Facts className="mt-4" items={facts} />}
    </div>
  );
}

function FieldRow({ f, spec, defaultBasis }: { f: SpecField; spec: AppSpecPreview; defaultBasis?: string }) {
  const p = f.provenance;
  // L'origine commune (auteur des correspondances) est rappelée en tête ; seule une origine différente est répétée ici.
  const detail = p?.status === "validated" && p.by ? `validé par ${p.by}${p.at ? ` le ${fmtDate(p.at)}` : ""}` : p?.basis && p.basis !== defaultBasis ? p.basis : undefined;
  return (
    <li className="grid gap-x-4 gap-y-1.5 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_60px]">
      <div className="min-w-0">
        <p className="text-body leading-snug font-semibold break-words text-ink">{f.label}</p>
        <p className="font-mono text-meta break-all text-text-3">{f.name}</p>
      </div>
      <div className="min-w-0 text-small text-text-2">
        <p>
          {FIELD_TYPE[f.type] ?? f.type}
          {f.references ? ` → ${entityLabel(spec, f.references)}` : ""}
        </p>
        {(f.required || f.unique || f.accounting || f.computed_by_rules) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {f.required && <Tag plain>obligatoire</Tag>}
            {f.unique && <Tag plain>unique</Tag>}
            {f.accounting && (
              <Tag tone="info" icon={<Lock size={12} />} title="Non modifiable pour les fiches migrées">
                protégé
              </Tag>
            )}
            {f.computed_by_rules && (
              <Tag tone="ok" icon={<Calculator size={12} />} title="Valeur calculée par le modèle métier pour les nouveaux documents">
                calculé par le modèle
              </Tag>
            )}
          </div>
        )}
        {f.options?.length ? <p className="mt-1 text-small break-words text-text-3">Valeurs : {f.options.map((o) => o.label ?? o.value).join(", ")}</p> : null}
      </div>
      <div className="min-w-0 text-small">
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceTag p={p} />
          {p?.source && <span className="font-mono text-small break-all text-ink">{p.source}</span>}
        </div>
        {(detail || p?.observed === false) && (
          <p className="mt-0.5 text-small leading-snug text-text-3">
            {detail}
            {p?.observed === false ? `${detail ? " · " : ""}absent de l'ancien logiciel` : ""}
          </p>
        )}
      </div>
      <div className="text-small sm:text-right">
        <span className="mr-1 text-meta text-text-3 sm:hidden">Confiance déclarée :</span>
        <DeclaredConfidence value={p?.confidence} />
      </div>
    </li>
  );
}

function ScreensAndActions({ spec }: { spec: AppSpecPreview }) {
  const screens = spec.screens ?? [];
  const actions = spec.actions ?? [];
  const nav = new Set(spec.navigation.map((n) => n.entity));
  const dashboards = screens.filter((s) => s.kind === "dashboard");
  const admins = screens.filter((s) => s.kind === "admin");
  const fieldsOf = (e: SpecEntity, names?: string[]) => (names ?? []).map((n) => fieldLabel(e, n)).join(", ");
  const rows = spec.entities.filter((e) => screens.some((s) => s.entity === e.name) || actions.some((a) => a.entity === e.name));

  if (!screens.length && !actions.length) return <p className="mt-1.5 text-body text-text-2">La spécification ne décrit ni page ni action.</p>;

  return (
    <ul className="mt-3 flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
      {dashboards.map((s) => (
        <li key={s.id} className="flex items-start gap-2.5 px-3.5 py-3">
          <LayoutDashboard size={15} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
          <div className="min-w-0 text-small">
            <p className="font-semibold text-ink">Tableau de bord</p>
            {spec.dashboard.cards.length > 0 && (
              <p className="mt-0.5 break-words text-text-2">
                {spec.dashboard.cards
                  .map((c) => {
                    const e = spec.entities.find((x) => x.name === c.entity);
                    return c.kind === "sum" && c.field ? `${c.label} (somme de ${e ? fieldLabel(e, c.field) : c.field})` : c.label;
                  })
                  .join(" · ")}
              </p>
            )}
            {spec.dashboard.breakdowns.length > 0 && <p className="mt-0.5 break-words text-text-3">Répartitions : {spec.dashboard.breakdowns.map((x) => x.label).join(" · ")}</p>}
          </div>
        </li>
      ))}
      <li aria-hidden className="hidden grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1.4fr)] gap-x-4 bg-canvas px-3.5 py-2 text-meta font-semibold text-text-3 md:grid">
        <span>Table</span>
        <span>Pages</span>
        <span>Actions des utilisateurs</span>
      </li>
      {rows.map((e) => {
        const own = screens.filter((s) => s.entity === e.name);
        const list = own.find((s) => s.kind === "list");
        const detail = own.find((s) => s.kind === "detail");
        const form = own.find((s) => s.kind === "form");
        const acts = actions.filter((a) => a.entity === e.name);
        const notes = acts.filter((a) => a.note);
        return (
          <li key={e.name} className="grid gap-x-4 gap-y-2 px-3.5 py-3 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,1.4fr)]">
            <p className="text-body font-semibold text-ink">
              {e.label}
              {!nav.has(e.name) && <span className="ml-1.5 text-meta font-normal text-text-3">hors menu</span>}
            </p>
            <div className="flex flex-wrap content-start gap-1.5">
              {list && (
                <Tag plain title={fieldsOf(e, list.fields)}>
                  Liste · {plural(list.fields?.length ?? 0, "colonne", "colonnes")}
                </Tag>
              )}
              {detail && (
                <Tag plain title={fieldsOf(e, detail.fields)}>
                  Fiche · {plural(detail.fields?.length ?? 0, "champ", "champs")}
                </Tag>
              )}
              {form && (
                <Tag plain title={fieldsOf(e, form.fields)}>
                  Formulaire · {plural(form.fields?.length ?? 0, "champ", "champs")}
                </Tag>
              )}
              {!list && !detail && !form && <span className="text-small text-text-3">—</span>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                {acts.map((a) => (
                  <Tag key={a.action} tone={!a.available ? "bad" : a.note ? "info" : "idle"} plain={!a.note && a.available} icon={a.note ? <Lock size={12} /> : undefined} title={a.note}>
                    {ACTION_LABEL[a.action] ?? a.action}
                    {a.available ? "" : " — indisponible"}
                  </Tag>
                ))}
              </div>
              {notes.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {notes.map((a) => (
                    <li key={a.action} className="text-small leading-snug text-text-2">
                      <span className="font-semibold text-ink">{ACTION_LABEL[a.action] ?? a.action}</span> : {a.note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
      {admins.map((s) => (
        <li key={s.id} className="flex items-start gap-2.5 px-3.5 py-3">
          <Settings size={15} aria-hidden className="mt-0.5 shrink-0 text-text-3" />
          <div className="min-w-0 text-small">
            <p className="font-semibold text-ink">Administration</p>
            {s.note && <p className="mt-0.5 text-text-2">{s.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Éléments non reconstruits (vue avancée)                              */
/* ------------------------------------------------------------------ */

export function NotRebuiltList({ items }: { items: NonNullable<AppSpecPreview["not_rebuilt"]> }) {
  if (!items.length) return <p className="text-body leading-relaxed text-text-2">Aucun élément non reconstruit.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
      {items.map((x, i) => (
        <li key={`${x.kind}-${x.name}-${i}`} className="flex flex-col gap-1.5 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-4">
          <Tag tone="warn" plain className="self-start sm:mt-px sm:w-[112px] sm:shrink-0 sm:justify-center">
            {NOT_REBUILT_KIND[x.kind] ?? x.kind}
          </Tag>
          <div className="min-w-0">
            <p className="text-body font-semibold break-words text-ink">{x.name}</p>
            <p className="mt-0.5 text-small leading-relaxed text-text-2">{x.reason}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Intégration technique (section repliable, en bas de page)             */
/* ------------------------------------------------------------------ */

export function ReconstructionTechSection({ spec }: { spec: AppSpecPreview | null }) {
  const versions = spec?.rules?.versions ?? [];
  const bindings = spec?.rules?.bindings ?? [];
  const workflows = spec?.workflows ?? [];
  return (
    <Section collapsible title="Intégration technique" description="Détails pour l'équipe technique : spécification, liaisons, base de données et routes.">
      <div className="flex flex-col gap-6">
        {spec && (
          <>
            <Facts
              items={[
                { label: "Spécification (app.json)", value: <span className="font-mono text-small">{`${spec.app.id} · ApplicationSpec ${spec.spec_version}`}</span> },
                { label: "Aperçu calculé le", value: fmtDate(spec.app.generated_at) },
                { label: "Générateur", value: spec.app.generator },
                { label: "Migration de référence", value: <span className="font-mono text-small">{spec.app.migration_run}</span> },
              ]}
            />
            <div>
              <SubHeading>Modèle métier installé à la génération</SubHeading>
              {versions.length ? (
                <ul className="mt-1.5 flex flex-col gap-2 text-small">
                  {versions.map((v) => (
                    <li key={v.version} className="min-w-0">
                      <p className="break-words text-ink">
                        <span className="font-mono font-semibold">v{v.version}</span> <span className="text-text-2">· modules {v.modules.join(", ") || "—"}</span>
                      </p>
                      <p className={cx("mt-0.5 leading-relaxed", v.history_check ? "text-text-2" : "text-warning-ink")}>{v.history_check ?? "Pas encore rejouée sur l'historique migré."}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-small text-warning-ink">Aucune version validée et cohérente avec les correspondances : aucune règle de calcul ne serait installée.</p>
              )}
              {bindings.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-small text-text-2">
                  {bindings.map((b) => (
                    <li key={b.id} className="break-words">
                      <span className="font-mono text-small text-ink">{b.id}</span> : {b.module} → {entityLabel(spec, b.entity)} ({b.scope === "line" ? "par ligne" : "par document"}) → {b.outputs.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-small text-text-2">{workflows.length ? `Workflows décrits : ${workflows.map((w, i) => String(w.name ?? w.id ?? `workflow ${i + 1}`)).join(", ")}.` : "Aucun workflow transmis par l'analyse."}</p>
            </div>
            {spec.ddl.length > 0 && (
              <div>
                <SubHeading aside={plural(spec.ddl.length, "instruction SQL", "instructions SQL")}>Schéma de la base générée</SubHeading>
                <pre tabIndex={0} role="region" aria-label="Schéma de la base générée" className="mt-2 max-h-80 overflow-auto rounded-panel bg-surface-sunken px-3.5 py-3 font-mono text-meta leading-relaxed whitespace-pre-wrap text-text-2">
                  {spec.ddl.join(";\n\n")};
                </pre>
              </div>
            )}
          </>
        )}
        <div>
          <SubHeading>Routes d&apos;API</SubHeading>
          <div className="mt-2">
            <ApiRoutes
              routes={[
                { method: "GET", path: "/api/migration/spec", label: "Aperçu de la spécification (app.json)" },
                { method: "GET", path: "/api/migration/business-model", label: "Versions reçues du modèle métier ; ?version=N pour leur contenu" },
                { method: "POST", path: "/api/migration/business-model", label: "Envoi d'une version par l'Analyste (contrat business_model)" },
                { method: "POST", path: "/api/migration/business-model/check", label: "Rejeu d'une version sur l'historique migré { version }" },
                { method: "POST", path: "/api/migration/business-model/decision", label: "Validation ou refus { version, decision, comment? }" },
                { method: "POST", path: "/api/migration/deploy", label: "Génération et mise en service { run_id, force? }" },
              ]}
            />
          </div>
          <p className="mt-2 text-small text-text-3">Chaque route prend le paramètre ?project=&lt;identifiant du projet&gt;.</p>
        </div>
      </div>
    </Section>
  );
}

