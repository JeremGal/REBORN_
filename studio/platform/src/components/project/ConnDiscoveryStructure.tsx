"use client";

import { useEffect, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { ButtonLink, Confidence, Empty, Panel, Specimen, cx } from "@/components/ui";
import { projectCall, useProject, useProjectData } from "./ProjectProvider";
import { ConnHeading, ConnLoading, ConnNotice, ConnStat, ConnTag, connCount, connDate, connErrorText, connNum, connValue } from "./ConnShared";

/* Réponses de /api/migration/sources et /api/migration/profile (sous-ensemble affiché). */
interface SourceMeta {
  id: string;
  name: string;
  format: string;
  sha256: string;
  received_at: string;
  origin: { kind: string; mechanism?: string; url?: string; by?: string };
  tables: { name: string; rows: number; columns: number }[];
  archive_entries?: number;
  warnings: string[];
}
interface ColumnProfile {
  name: string;
  type: string;
  format?: string;
  conformity: number;
  nulls: number;
  distinct: number;
  unique: boolean;
  anomalies: { count: number; samples: unknown[] };
  codes?: { value: string; count: number }[];
}
interface TableProfile {
  name: string;
  source_file?: string;
  rows: number;
  columns: ColumnProfile[];
  primary_key: string | null;
  entity: string;
}
interface RelationGuess {
  table: string;
  column: string;
  references: { table: string; column: string };
  coverage: number;
  orphans: number;
  orphan_samples: string[];
  confidence: number;
}
export interface SourceProfile {
  tables: TableProfile[];
  relations: RelationGuess[];
}

const TYPE_LABEL: Record<string, string> = {
  empty: "vide",
  integer: "entier",
  decimal: "décimal",
  money: "montant",
  boolean: "oui / non",
  date: "date",
  email: "e-mail",
  phone: "téléphone",
  text: "texte",
};
const FORMAT_LABEL: Record<string, string> = { comma: "décimale « , »", dot: "décimale « . »" };

function originLabel(s: SourceMeta): string {
  const o = s.origin;
  const mech = o.mechanism ? ` · ${o.mechanism}` : "";
  if (o.kind === "http_export") return `Export récupéré par le connecteur${mech}`;
  if (o.kind === "api") return `Déposé par l'API${o.by && o.by !== "api" ? ` (${o.by})` : ""}${mech}`;
  if (o.kind === "upload") return `Fichier déposé${mech}`;
  return `${o.kind}${mech}`;
}

const rowsOf = (s: SourceMeta) => s.tables.reduce((n, t) => n + t.rows, 0);

/**
 * Structure découverte dans les exports déposés (et non à l'écran) : tables, colonnes, clés,
 * relations probables et valeurs non conformes. L'analyse n'est relue que si les fichiers changent.
 */
export function ConnDiscoveryStructure() {
  const { id } = useProject();
  const sources = useProjectData<SourceMeta[]>("/api/migration/sources");
  const list = sources.data;
  const key = list ? list.map((s) => s.sha256).join(",") : null;
  const [profile, setProfile] = useState<{ key: string; data: SourceProfile | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    projectCall<SourceProfile>(id, "GET", "/api/migration/profile").then(
      (data) => {
        if (live) setProfile({ key, data, error: null });
      },
      (e: unknown) => {
        if (live) setProfile({ key, data: null, error: connErrorText(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [id, key]);

  const stale = !!profile && profile.key !== key;

  return (
    <Panel
      eyebrow="D'après les exports déposés"
      title="Structure des données découverte"
      actions={
        <ConnTag title="Lue dans les fichiers reçus, et non observée à l'écran par l'agent">
          Données déposées
        </ConnTag>
      }
    >
      <p className="mb-4 max-w-[860px] text-[12.5px] leading-relaxed text-sediment">
        Lue directement dans les fichiers reçus à l&apos;étape Données (exports de l&apos;ancien logiciel), et non observée à l&apos;écran par l&apos;agent. Types, clés et relations sont
        déduits des valeurs : ce sont des propositions, à valider à l&apos;étape Correspondances.
      </p>

      {sources.loading && !list ? (
        <ConnLoading label="Lecture des fichiers déposés…" />
      ) : !list ? (
        <ConnNotice tone="bad" title="Fichiers déposés illisibles">
          {sources.error ?? "Réponse vide de l'API."}
        </ConnNotice>
      ) : list.length === 0 ? (
        <Empty title="Aucun export déposé pour l'instant" hint="La structure (tables, colonnes, relations) apparaîtra dès qu'un export de l'ancien logiciel aura été déposé ou récupéré.">
          <ButtonLink href={`/projets/${id}/extraction`} variant="ghost">
            Aller à l&apos;étape Données
          </ButtonLink>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <SourceList sources={list} />
          {!profile || (stale && !profile.data) ? (
            <ConnLoading label="Analyse de la structure des fichiers…" />
          ) : profile.error || !profile.data ? (
            <ConnNotice tone="bad" title="Structure non disponible">
              {profile.error ?? "Réponse vide de l'API."}
            </ConnNotice>
          ) : (
            <ConnStructureView p={profile.data} stale={stale} />
          )}
        </div>
      )}
    </Panel>
  );
}

function SourceList({ sources }: { sources: SourceMeta[] }) {
  const rows = sources.reduce((n, s) => n + rowsOf(s), 0);
  return (
    <section>
      <ConnHeading aside={`${connCount(sources.length, "fichier")} · ${connCount(rows, "ligne")}`}>Fichiers analysés</ConnHeading>
      <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
        {sources.map((s) => (
          <li key={s.id} className="grid gap-x-3 gap-y-0.5 px-3 py-2 text-[12px] sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto] sm:items-baseline">
            <span className="min-w-0 truncate font-bold text-ink" title={s.name}>
              {s.name}
            </span>
            <span className="min-w-0 text-sediment">
              {originLabel(s)} · {connDate(s.received_at)}
            </span>
            <span className="tabular text-sediment sm:text-right">
              {s.format.toUpperCase()} · {s.archive_entries !== undefined ? connCount(s.archive_entries, "fichier") : connCount(rowsOf(s), "ligne")}
            </span>
            {s.warnings.length > 0 && (
              <span className="flex items-start gap-1 text-ochre sm:col-span-3">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> {s.warnings.join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Vue de la structure analysée (sans chargement) : chiffres et listes tels que renvoyés par /api/migration/profile. */
export function ConnStructureView({ p, stale = false }: { p: SourceProfile; stale?: boolean }) {
  const rows = p.tables.reduce((n, t) => n + t.rows, 0);
  const anomalous = p.tables.reduce((n, t) => n + t.columns.filter((c) => c.anomalies.count > 0).length, 0);
  const noKey = p.tables.filter((t) => !t.primary_key).length;
  return (
    <div className="flex flex-col gap-5">
      {stale && <p className="text-[11.5px] text-silt">Nouveaux fichiers reçus : analyse en cours de mise à jour…</p>}
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <ConnStat label="Tables" value={connNum(p.tables.length)} />
        <ConnStat label="Lignes lues" value={connNum(rows)} />
        <ConnStat label="Relations probables" value={connNum(p.relations.length)} />
        <ConnStat label="Colonnes à valeurs non conformes" value={connNum(anomalous)} tone={anomalous ? "warn" : undefined} />
        {noKey > 0 && <ConnStat label="Tables sans clé détectée" value={connNum(noKey)} tone="bad" />}
      </dl>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <ConnHeading aside="Ouvrir une table pour le détail de ses colonnes">Tables</ConnHeading>
          {p.tables.length === 0 ? (
            <p className="text-[12.5px] text-sediment">Aucune table lisible dans les fichiers déposés.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              {p.tables.map((t, i) => (
                <TableItem key={`${t.source_file ?? ""}/${t.name}/${i}`} t={t} />
              ))}
            </ul>
          )}
        </section>
        <section className="min-w-0">
          <ConnHeading>Relations déduites des valeurs</ConnHeading>
          {p.relations.length === 0 ? (
            <p className="text-[12.5px] text-sediment">Aucune relation détectée entre les tables.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]">
              {p.relations.map((r, i) => (
                <RelationItem key={`${r.table}.${r.column}>${r.references.table}/${i}`} r={r} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11.5px] leading-snug text-silt">
            Clé étrangère → clé primaire, proposée lorsque le nom de la colonne l&apos;évoque et qu&apos;au moins 80 % de ses valeurs existent dans la table visée.
          </p>
        </section>
      </div>
    </div>
  );
}

function TableItem({ t }: { t: TableProfile }) {
  const flagged = t.columns.filter((c) => c.anomalies.count > 0).length;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-2 transition-colors duration-150 hover:bg-chalk/60 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-mono text-[12.5px] font-medium break-all text-ink">{t.name}</span>
              {t.source_file && t.source_file !== t.name && <span className="text-[11px] break-all text-silt">· {t.source_file}</span>}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-sediment">
              {connCount(t.rows, "ligne")} · {connCount(t.columns.length, "colonne")} · clé{" "}
              {t.primary_key ? <span className="font-mono">{t.primary_key}</span> : <span className="font-bold text-rust">non détectée</span>} · entité proposée{" "}
              <span className="font-mono">{t.entity}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {flagged > 0 && <ConnTag tone="warn">{connCount(flagged, "colonne")} à vérifier</ConnTag>}
            <ChevronDown size={15} className="text-silt transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[600px] text-[12px]">
            <thead>
              <tr className="bg-chalk text-left text-[11px] text-silt">
                <th scope="col" className="px-3 py-1.5 font-bold">
                  Colonne
                </th>
                <th scope="col" className="px-3 py-1.5 font-bold">
                  Type déduit
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">
                  Vides
                </th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">
                  Distinctes
                </th>
                <th scope="col" className="px-3 py-1.5 font-bold">
                  Remarques
                </th>
              </tr>
            </thead>
            <tbody>
              {t.columns.map((c, i) => {
                const filled = Math.max(0, t.rows - c.nulls);
                return (
                  <tr key={`${c.name}-${i}`} className="border-t border-line align-top">
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink">
                      {c.name}
                      {c.name === t.primary_key && <span className="ml-1.5 font-sans text-[10px] font-bold tracking-wide text-verdigris">CLÉ</span>}
                    </td>
                    <td className="px-3 py-1.5 text-sediment">
                      {TYPE_LABEL[c.type] ?? c.type}
                      {c.format ? ` (${FORMAT_LABEL[c.format] ?? c.format})` : ""}
                    </td>
                    <td className="tabular px-3 py-1.5 text-right">{connNum(c.nulls)}</td>
                    <td className="tabular px-3 py-1.5 text-right">
                      {connNum(c.distinct)}
                      {c.unique && c.distinct > 1 ? <span className="text-silt"> · toutes différentes</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-sediment">
                      <div className="flex flex-col gap-1">
                        {c.anomalies.count > 0 && (
                          <div className="text-ochre">
                            {connCount(c.anomalies.count, "valeur non conforme", "valeurs non conformes")} au type « {TYPE_LABEL[c.type] ?? c.type} » sur {connNum(filled)} renseignées
                            {c.anomalies.samples.length > 0 && (
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {c.anomalies.samples.slice(0, 3).map((v, j) => (
                                  <Specimen key={j} tone="warn">
                                    {connValue(v)}
                                  </Specimen>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {c.codes?.length ? (
                          <span>
                            Codes : {c.codes.slice(0, 6).map((x) => `${x.value} (${connNum(x.count)})`).join(", ")}
                            {c.codes.length > 6 ? "…" : ""}
                          </span>
                        ) : null}
                        {!c.anomalies.count && !c.codes?.length && <span className="text-silt">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}

function RelationItem({ r }: { r: RelationGuess }) {
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 font-mono text-[11.5px] break-all text-ink">
          {r.table}.{r.column} → {r.references.table}.{r.references.column}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-silt">
          confiance <Confidence value={r.confidence} />
        </span>
      </div>
      <p className={cx("mt-0.5 text-[11.5px] leading-snug", r.orphans ? "text-ochre" : "text-sediment")}>
        {r.orphans
          ? `${connCount(r.orphans, "valeur orpheline", "valeurs orphelines")} (absentes de ${r.references.table})${r.orphan_samples.length ? ` : ${r.orphan_samples.slice(0, 3).join(", ")}` : ""}`
          : `Toutes les valeurs renseignées existent dans ${r.references.table}.`}
      </p>
    </li>
  );
}
