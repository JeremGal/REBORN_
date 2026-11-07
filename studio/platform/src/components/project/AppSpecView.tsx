"use client";

import type { ReactNode } from "react";
import { Ban, Calculator, ChevronRight, Database, FileText, LayoutDashboard, List, Lock, Settings, SquarePen, Workflow } from "lucide-react";
import { Panel, cx } from "@/components/ui";
import { BM_SOURCE, Fact, Pill, TestBadge, fmtDate, fmtInt, plural, type AppSpecPreview, type SpecEntity, type SpecField, type SpecProvenance, type Tone } from "./AppKit";

/*
 * Aperçu de la spécification du nouveau logiciel (GET /api/migration/spec) : tout ce qui est
 * affiché ici est lu dans la réponse de l'API, rien n'est calculé ni supposé côté navigateur.
 */

export const FIELD_TYPE: Record<string, string> = {
  text: "Texte",
  integer: "Entier",
  decimal: "Décimal",
  money: "Montant",
  percent: "Pourcentage",
  date: "Date",
  boolean: "Oui / non",
  enum: "Liste de valeurs",
  email: "E-mail",
  phone: "Téléphone",
  reference: "Référence",
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
  entity: "Entité",
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

export function ProvenancePill({ p }: { p?: SpecProvenance }) {
  if (!p) return <Pill title="La spécification ne précise pas l'origine de cet élément">Origine non précisée</Pill>;
  const d = PROVENANCE[p.status] ?? { label: p.status, tone: "idle" as Tone, hint: "" };
  return (
    <Pill tone={d.tone} title={d.hint}>
      {d.label}
    </Pill>
  );
}

/** Confiance déclarée avec la correspondance : une estimation, jamais une vérification. */
function DeclaredConfidence({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-[11.5px] text-silt">—</span>;
  return (
    <span className={cx("tabular font-mono text-[11.5px]", value < 0.8 ? "font-bold text-ochre" : "text-sediment")} title="Confiance déclarée avec la correspondance (estimation de son auteur, pas une vérification)">
      {Math.round(value * 100)} %
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Synthèse                                                             */
/* ------------------------------------------------------------------ */

export function AppSpecSummary({ spec, testMapping }: { spec: AppSpecPreview; testMapping: boolean }) {
  const fields = spec.entities.flatMap((e) => e.fields);
  const count = (s: SpecProvenance["status"]) => fields.filter((f) => f.provenance?.status === s).length;
  const computed = fields.filter((f) => f.computed_by_rules).length;
  const locked = fields.filter((f) => f.accounting).length;
  const notRebuilt = spec.not_rebuilt?.length ?? 0;
  const b = spec.app.branding;
  const pv = spec.provenance;
  const observed = count("observed");
  const tiles: { label: string; value: number; sub?: string; tone?: Tone }[] = [
    { label: "Entités", value: spec.entities.length, sub: `${fmtInt(spec.navigation.length)} au menu` },
    { label: "Champs", value: fields.length, sub: `${fmtInt(count("validated"))} validés · ${fmtInt(count("deduced"))} déduits${observed ? ` · ${fmtInt(observed)} observés` : ""}` },
    { label: "Calculés par le modèle", value: computed },
    { label: "Protégés (historique)", value: locked },
    { label: "Écrans", value: spec.screens?.length ?? 0 },
    { label: "Non reconstruits", value: notRebuilt, tone: notRebuilt ? "warn" : undefined },
  ];
  return (
    <Panel eyebrow="Spécification du nouveau logiciel (app.json)" title={spec.app.name}>
      <div className="flex items-start gap-3">
        {b && (
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md text-[14px] font-black text-white" style={{ background: b.primary_color }}>
            {b.logo_text}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[13px] text-sediment">
            {spec.app.tagline}
            {spec.app.company ? ` · ${spec.app.company}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[11px] break-words text-silt">
            {spec.app.id} · spécification {spec.spec_version} · aperçu calculé le {fmtDate(spec.app.generated_at)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-paper px-3 py-2.5">
            <dt className="text-[11.5px] text-silt">{t.label}</dt>
            <dd className={cx("tabular text-[20px] leading-tight font-black", t.tone === "warn" ? "text-ochre" : "text-ink")}>{fmtInt(t.value)}</dd>
            {t.sub && <dd className="text-[11px] leading-snug text-silt">{t.sub}</dd>}
          </div>
        ))}
      </dl>

      {pv && (
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Correspondances">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              v{pv.mapping_version} · {pv.mapping_origin}
              {testMapping && <TestBadge />}
            </span>
          </Fact>
          <Fact label="Migration de référence">
            <span className="font-mono text-[12.5px]">{pv.migration_run}</span>
          </Fact>
          <Fact label="Modèle métier installable">{pv.business_model_versions.length ? pv.business_model_versions.map((v) => `v${v}`).join(", ") : <span className="text-ochre">aucune version validée</span>}</Fact>
          <Fact label="Port local prévu">
            <span className="tabular">{spec.app.port}</span>
          </Fact>
        </dl>
      )}
      {pv?.statement && <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-sediment">{pv.statement}</p>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Éléments non reconstruits                                            */
/* ------------------------------------------------------------------ */

export function AppNotRebuilt({ items }: { items: NonNullable<AppSpecPreview["not_rebuilt"]> }) {
  const has = items.length > 0;
  return (
    <section aria-labelledby="non-reconstruits" className={cx("card flex min-w-0 flex-col overflow-hidden", has && "shadow-[0_0_0_1px_rgb(168_107_18/0.35)]")}>
      <header className={cx("px-4 pt-3.5 pb-3", has ? "bg-ochre-soft" : "")}>
        <div className="flex flex-wrap items-center gap-2">
          <Ban size={15} className={has ? "text-ochre" : "text-silt"} aria-hidden />
          <h2 id="non-reconstruits" className="text-[15px] leading-snug font-bold tracking-[-0.01em]">
            Éléments non reconstruits
          </h2>
          <Pill tone={has ? "warn" : "ok"}>{fmtInt(items.length)}</Pill>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-sediment">Identifiés dans les données ou les envois, mais absents du nouveau logiciel — chacun avec sa raison.</p>
      </header>
      {has ? (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((x, i) => (
            <li key={`${x.kind}-${x.name}-${i}`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <Pill tone="warn" className="self-start sm:mt-px sm:w-[104px] sm:shrink-0 sm:justify-center">
                {NOT_REBUILT_KIND[x.kind] ?? x.kind}
              </Pill>
              <div className="min-w-0">
                <div className="font-mono text-[12.5px] font-bold break-all">{x.name}</div>
                <div className="text-[12.5px] leading-relaxed text-sediment">{x.reason}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[12.5px] leading-relaxed text-sediment">
          La spécification ne liste aucun élément non reconstruit : aucune table extraite sans correspondance, aucun export refusé, aucune exclusion et aucune version du modèle métier en attente n&apos;ont été relevés.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Entités et champs                                                    */
/* ------------------------------------------------------------------ */

export function AppEntities({ spec }: { spec: AppSpecPreview }) {
  const nav = new Set(spec.navigation.map((n) => n.entity));
  const fields = spec.entities.reduce((n, e) => n + e.fields.length, 0);
  const origin = spec.provenance?.mapping_origin;
  return (
    <Panel eyebrow="Entités reconstruites" title={`${plural(spec.entities.length, "entité", "entités")} · ${plural(fields, "champ", "champs")}`}>
      <div className="mb-3 flex flex-col gap-1.5 rounded-sm bg-chalk px-3 py-2.5 text-[12px] leading-relaxed text-sediment">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-bold text-ink">Origine de chaque élément&nbsp;:</span>
          <span className="inline-flex items-baseline gap-1">
            <Pill tone="info">Observé</Pill> présent dans les données extraites
          </span>
          <span className="inline-flex items-baseline gap-1">
            <Pill tone="warn">Déduit</Pill> proposé{origin ? ` (${origin})` : ""}, sans validation humaine
          </span>
          <span className="inline-flex items-baseline gap-1">
            <Pill tone="ok">Validé</Pill> décision humaine tracée
          </span>
        </div>
        <p>
          La confiance indiquée est celle déclarée avec la correspondance (proposition automatique ou Analyste)&nbsp;: c&apos;est une estimation, pas une vérification. Les valeurs migrées sont, elles, contrôlées sur les vraies données à l&apos;étape Validation.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        {spec.entities.map((e) => (
          <EntityItem key={e.name} e={e} spec={spec} inNav={nav.has(e.name)} />
        ))}
      </ul>
      {spec.ddl.length > 0 && (
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] font-bold text-sediment hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight size={13} className="transition-transform duration-150 group-open:rotate-90" aria-hidden />
            <Database size={13} aria-hidden /> Schéma de la base générée ({plural(spec.ddl.length, "instruction SQL", "instructions SQL")})
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-sm bg-chalk p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-sediment">{spec.ddl.join(";\n\n")};</pre>
        </details>
      )}
    </Panel>
  );
}

function EntityItem({ e, spec, inNav }: { e: SpecEntity; spec: AppSpecPreview; inNav: boolean }) {
  const refs = e.fields.filter((f) => f.type === "reference").length;
  const computed = e.fields.filter((f) => f.computed_by_rules).length;
  const locked = e.fields.filter((f) => f.accounting);
  const cl = e.classification ? CLASSIFICATION[e.classification.kind] : null;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 hover:bg-chalk/70 [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="mt-[3px] shrink-0 text-silt transition-transform duration-150 group-open:rotate-90" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13.5px] font-bold">{e.label}</span>
              <span className="font-mono text-[11px] text-silt">{e.name}</span>
              <ProvenancePill p={e.provenance} />
              {cl && (
                <Pill tone={cl.tone} title={e.classification?.note}>
                  {cl.label}
                </Pill>
              )}
              {locked.length > 0 && (
                <Pill tone="info" icon={<Lock size={10} aria-hidden />} title={`Champs protégés pour les enregistrements migrés : ${locked.map((f) => f.label).join(", ")}`}>
                  Historique protégé
                </Pill>
              )}
              {!inNav && <Pill title="Entité absente du menu principal">Hors menu</Pill>}
            </div>
            <div className="mt-0.5 text-[12px] break-words text-sediment">
              ← <span className="font-mono">{e.provenance?.source ?? "source non précisée"}</span> · {plural(e.fields.length, "champ", "champs")} · {plural(refs, "relation", "relations")}
              {computed ? ` · ${plural(computed, "calculé", "calculés")} par le modèle métier` : ""}
            </div>
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
  if (e.children.length) facts.push({ label: "Enregistrements liés affichés dans la fiche", value: e.children.map((c) => `${c.label} (via ${c.via})`).join(" · ") });
  if (e.list_fields.length) facts.push({ label: "Colonnes de la liste", value: e.list_fields.map((n) => fieldLabel(e, n)).join(", ") });
  if (e.search_fields.length) facts.push({ label: "Recherche sur", value: e.search_fields.map((n) => fieldLabel(e, n)).join(", ") });
  if (e.line_of) facts.push({ label: "Lignes de", value: `${entityLabel(spec, e.line_of.entity)} (via ${e.line_of.via}) : pas d'ajout de ligne à un document historique protégé` });
  if (e.classification)
    facts.push({
      label: "Classement de l'entité",
      value: `${CLASSIFICATION[e.classification.kind]?.label ?? e.classification.kind} · confiance déclarée ${Math.round(e.classification.confidence * 100)} %${e.classification.note ? ` · ${e.classification.note}` : ""}`,
    });
  if (e.computed.length)
    facts.push({
      label: "Formules (enregistrements créés dans le nouveau logiciel)",
      value: (
        <span className="flex flex-col gap-0.5">
          {e.computed.map((c) => (
            <code key={c.field} className="font-mono text-[11.5px] break-all">
              {c.field} = {c.expr}
            </code>
          ))}
        </span>
      ),
    });
  if (e.aggregates.length)
    facts.push({
      label: "Totaux sur les lignes (enregistrements créés dans le nouveau logiciel)",
      value: (
        <span className="flex flex-col gap-0.5">
          {e.aggregates.map((a) => (
            <code key={a.field} className="font-mono text-[11.5px] break-all">
              {a.field} = somme de ({a.expr}) sur {entityLabel(spec, a.children)} via {a.via}
            </code>
          ))}
        </span>
      ),
    });
  return (
    <div className="border-t border-line bg-chalk/50 px-3 pt-2.5 pb-3">
      <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_56px] gap-x-4 px-3 pb-1 text-[11px] font-bold text-silt sm:grid">
        <span>Champ</span>
        <span>Type et règles</span>
        <span>Origine (ancienne table.colonne)</span>
        <span className="text-right">Confiance</span>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md bg-paper shadow-[0_0_0_1px_var(--color-line)]">
        {e.fields.map((f) => (
          <FieldRow key={f.name} f={f} spec={spec} defaultBasis={spec.provenance?.mapping_origin} />
        ))}
      </ul>
      {facts.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {facts.map((x) => (
            <Fact key={x.label} label={x.label} className="[&_dd]:text-[12.5px]">
              {x.value}
            </Fact>
          ))}
        </dl>
      )}
    </div>
  );
}

function FieldRow({ f, spec, defaultBasis }: { f: SpecField; spec: AppSpecPreview; defaultBasis?: string }) {
  const p = f.provenance;
  // L'origine commune (auteur des correspondances) est rappelée dans la légende ; seule une origine différente est répétée ici.
  const detail = p?.status === "validated" && p.by ? `validé par ${p.by}${p.at ? ` le ${fmtDate(p.at)}` : ""}` : p?.basis && p.basis !== defaultBasis ? p.basis : undefined;
  return (
    <li className="grid gap-x-4 gap-y-1.5 px-3 py-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_56px]">
      <div className="min-w-0">
        <div className="text-[13px] leading-snug font-bold break-words">{f.label}</div>
        <div className="font-mono text-[11px] break-all text-silt">{f.name}</div>
      </div>
      <div className="min-w-0 text-[12px] text-sediment">
        <div>
          {FIELD_TYPE[f.type] ?? f.type}
          {f.references ? ` → ${entityLabel(spec, f.references)}` : ""}
        </div>
        {(f.required || f.unique || f.accounting || f.computed_by_rules) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {f.required && <Pill>obligatoire</Pill>}
            {f.unique && <Pill>unique</Pill>}
            {f.accounting && (
              <Pill tone="info" icon={<Lock size={10} aria-hidden />} title="Non modifiable pour les enregistrements migrés">
                protégé
              </Pill>
            )}
            {f.computed_by_rules && (
              <Pill tone="ok" icon={<Calculator size={10} aria-hidden />} title="Valeur calculée par le modèle métier pour les nouveaux documents">
                calculé par le modèle
              </Pill>
            )}
          </div>
        )}
        {f.options?.length ? <div className="mt-1 text-[11px] break-words text-silt">Valeurs : {f.options.map((o) => o.label ?? o.value).join(", ")}</div> : null}
      </div>
      <div className="min-w-0 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenancePill p={p} />
          {p?.source && <span className="font-mono text-[11.5px] break-all text-ink">{p.source}</span>}
        </div>
        {(detail || p?.observed === false) && (
          <div className="mt-0.5 text-[11.5px] leading-snug text-silt">
            {detail}
            {p?.observed === false ? `${detail ? " · " : ""}absent de l'ancien logiciel` : ""}
          </div>
        )}
      </div>
      <div className="text-[12px] sm:text-right">
        <span className="mr-1 text-[11px] text-silt sm:hidden">Confiance déclarée :</span>
        <DeclaredConfidence value={p?.confidence} />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Écrans et actions                                                    */
/* ------------------------------------------------------------------ */

export function AppScreens({ spec }: { spec: AppSpecPreview }) {
  const screens = spec.screens ?? [];
  const dashboards = screens.filter((s) => s.kind === "dashboard");
  const admins = screens.filter((s) => s.kind === "admin");
  const nav = new Set(spec.navigation.map((n) => n.entity));
  const fieldsOf = (e: SpecEntity, names?: string[]) => (names ?? []).map((n) => fieldLabel(e, n)).join(", ");
  return (
    <Panel eyebrow="Écrans générés" title={plural(screens.length, "écran", "écrans")}>
      {screens.length === 0 ? (
        <p className="text-[12.5px] text-sediment">La spécification ne décrit aucun écran.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {dashboards.map((s) => (
            <li key={s.id} className="flex items-start gap-2.5 py-2.5 first:pt-0">
              <LayoutDashboard size={15} className="mt-0.5 shrink-0 text-silt" aria-hidden />
              <div className="min-w-0 text-[12.5px]">
                <div className="font-bold">Tableau de bord</div>
                {s.note && <div className="text-sediment">{s.note}</div>}
                {spec.dashboard.cards.length > 0 && (
                  <div className="mt-0.5 text-[12px] break-words text-silt">
                    Indicateurs :{" "}
                    {spec.dashboard.cards
                      .map((c) => {
                        const e = spec.entities.find((x) => x.name === c.entity);
                        return c.kind === "sum" && c.field ? `${c.label} (somme de ${e ? fieldLabel(e, c.field) : c.field})` : `${c.label} (nombre)`;
                      })
                      .join(" · ")}
                  </div>
                )}
                {spec.dashboard.breakdowns.length > 0 && <div className="text-[12px] break-words text-silt">Répartitions : {spec.dashboard.breakdowns.map((x) => x.label).join(" · ")}</div>}
              </div>
            </li>
          ))}
          {spec.entities.map((e) => {
            const own = screens.filter((s) => s.entity === e.name);
            if (!own.length) return null;
            const list = own.find((s) => s.kind === "list");
            const detail = own.find((s) => s.kind === "detail");
            const form = own.find((s) => s.kind === "form");
            return (
              <li key={e.name} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold">{e.label}</span>
                  {!nav.has(e.name) && <span className="text-[11.5px] text-silt">hors menu</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {list && (
                    <Pill icon={<List size={11} aria-hidden />} title={fieldsOf(e, list.fields)}>
                      Liste · {plural(list.fields?.length ?? 0, "colonne", "colonnes")}
                    </Pill>
                  )}
                  {detail && (
                    <Pill icon={<FileText size={11} aria-hidden />} title={fieldsOf(e, detail.fields)}>
                      Fiche · {plural(detail.fields?.length ?? 0, "champ", "champs")}
                    </Pill>
                  )}
                  {form && (
                    <Pill icon={<SquarePen size={11} aria-hidden />} title={fieldsOf(e, form.fields)}>
                      Formulaire · {plural(form.fields?.length ?? 0, "champ saisi", "champs saisis")}
                    </Pill>
                  )}
                </div>
              </li>
            );
          })}
          {admins.map((s) => (
            <li key={s.id} className="flex items-start gap-2.5 py-2.5 last:pb-0">
              <Settings size={15} className="mt-0.5 shrink-0 text-silt" aria-hidden />
              <div className="min-w-0 text-[12.5px]">
                <div className="font-bold">Administration</div>
                {s.note && <div className="text-sediment">{s.note}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function AppActions({ spec }: { spec: AppSpecPreview }) {
  const actions = spec.actions ?? [];
  return (
    <Panel eyebrow="Actions disponibles" title="Ce que les utilisateurs pourront faire">
      {actions.length === 0 ? (
        <p className="text-[12.5px] text-sediment">La spécification ne décrit aucune action.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {spec.entities.map((e) => {
            const own = actions.filter((a) => a.entity === e.name);
            if (!own.length) return null;
            const notes = own.filter((a) => a.note);
            return (
              <li key={e.name} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[13px] font-bold">{e.label}</span>
                  {own.map((a) => (
                    <Pill key={a.action} tone={!a.available ? "bad" : a.note ? "info" : "idle"} icon={a.note ? <Lock size={10} aria-hidden /> : undefined} title={a.note}>
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.available ? "" : " — indisponible"}
                    </Pill>
                  ))}
                </div>
                {notes.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {notes.map((a) => (
                      <li key={a.action} className="text-[12px] leading-snug text-sediment">
                        <span className="font-bold text-ink">{ACTION_LABEL[a.action] ?? a.action}</span> : {a.note}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Règles installables (ce que la génération installerait maintenant)     */
/* ------------------------------------------------------------------ */

export function AppInstalledRules({ spec }: { spec: AppSpecPreview }) {
  const versions = spec.rules?.versions ?? [];
  const bindings = spec.rules?.bindings ?? [];
  const computed = spec.entities.flatMap((e) => e.fields.filter((f) => f.computed_by_rules).map((f) => ({ e, f })));
  const workflows = spec.workflows ?? [];
  return (
    <div className="rounded-md bg-chalk px-3.5 py-3">
      <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold">
        <Calculator size={13} aria-hidden /> Installé à la génération
      </h3>
      {versions.length === 0 ? (
        <p className="mt-1 text-[12.5px] leading-relaxed text-ochre">
          Aucune version validée et cohérente avec les correspondances : aucune règle de calcul ne serait installée. Le logiciel resterait utilisable, sans calcul automatique des nouveaux documents.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {versions.map((v) => {
            const src = v.source ? BM_SOURCE[v.source] : undefined;
            return (
              <li key={v.version} className="text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="specimen">v{v.version}</span>
                  {src?.test ? <TestBadge label={src.label} /> : <Pill>{src?.label ?? v.source ?? "origine non précisée"}</Pill>}
                  <span className="text-sediment">modules : {v.modules.join(", ") || "—"}</span>
                </div>
                <p className={cx("mt-0.5 text-[12px] leading-snug", v.history_check ? "text-sediment" : "text-ochre")}>{v.history_check ?? "Pas encore rejouée sur l'historique migré."}</p>
              </li>
            );
          })}
        </ul>
      )}
      {bindings.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11.5px] font-bold text-silt">Liaisons de la version la plus récente</div>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-[12px]">
            {bindings.map((b) => (
              <li key={b.id} className="break-words">
                <span className="font-mono text-[11.5px]">{b.id}</span> : module <span className="font-mono text-[11.5px]">{b.module}</span> → {entityLabel(spec, b.entity)}{" "}
                <span className="text-silt">({b.scope === "line" ? "par ligne" : "par document"})</span> → {b.outputs.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {computed.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11.5px] font-bold text-silt">Champs calculés par le modèle métier</div>
          <p className="mt-0.5 text-[12px] break-words">{computed.map(({ e, f }) => `${e.label} · ${f.label}`).join(" — ")}</p>
        </div>
      )}
      <div className="mt-2.5 flex items-start gap-1.5 text-[12px] text-sediment">
        <Workflow size={13} className="mt-0.5 shrink-0 text-silt" aria-hidden />
        {workflows.length ? (
          <span>
            Workflows décrits : {workflows.map((w, i) => String(w.name ?? w.id ?? `workflow ${i + 1}`)).join(", ")} (voir « Éléments non reconstruits »).
          </span>
        ) : (
          <span>Aucun workflow n&apos;a été transmis par l&apos;analyse.</span>
        )}
      </div>
    </div>
  );
}
