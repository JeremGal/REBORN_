"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownUp, Eye, FilterX, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ds/Alert";
import { Badge, StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { DataTable, type Column, type SortDirection } from "@/components/ds/DataTable";
import { Drawer } from "@/components/ds/Dialog";
import { Field, Input, SearchInput, Select } from "@/components/ds/Field";
import { Pagination } from "@/components/ds/Pagination";
import { Skeleton } from "@/components/ds/Progress";
import { EmptyState } from "@/components/ds/States";
import { Tabs } from "@/components/ds/Tabs";
import { cx } from "@/components/ds/cx";
import { formatPercent } from "@/components/ds/format";
import { confidencePct, nf, percent, plural, READ_FORMAT, READ_TYPE, type ColumnProfile, type RelationGuess, type SourceProfile, type TableProfile } from "./DataKit";

/*
 * Consultation des données reçues (étape Données) : une table à la fois, colonnes et indicateurs
 * de qualité RÉELS (profil : taux de vides, valeurs distinctes, conformité, anomalies), lignes
 * paginées par le serveur (GET /api/migration/sources/rows : recherche, tri, filtre côté serveur,
 * 100 lignes au plus par page), inspection d'une ligne complète. Aucune valeur n'est modifiée.
 */

type RawValue = string | number | boolean | null;
type FilterOp = "empty" | "filled" | "equals" | "contains";
interface RowsPage {
  table: string;
  file: string;
  columns: string[];
  total: number;
  matched: number;
  page: number;
  per: number;
  pages: number;
  q: string | null;
  sort: { column: string; dir: "asc" | "desc" } | null;
  filter: { column: string; op: FilterOp; value?: string } | null;
  rows: { n: number; values: RawValue[]; truncated?: number[] }[];
}
interface OneRow {
  table: string;
  file: string;
  columns: string[];
  row: { n: number; values: RawValue[]; truncated?: number[] };
}

const OPS: { value: FilterOp; label: string; needsValue: boolean }[] = [
  { value: "contains", label: "contient", needsValue: true },
  { value: "equals", label: "est égale à", needsValue: true },
  { value: "empty", label: "est vide", needsValue: false },
  { value: "filled", label: "est renseignée", needsValue: false },
];
const opLabel = (op: FilterOp) => OPS.find((o) => o.value === op)?.label ?? op;
const PER = [25, 50, 100];

const isBlank = (v: RawValue | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const typeLabel = (c: ColumnProfile) => `${READ_TYPE[c.type] ?? c.type}${c.format ? ` · ${READ_FORMAT[c.format] ?? c.format}` : ""}`;

/** Erreur lisible d'une réponse de l'API (message + détails de validation). */
async function readJson<T>(r: Response): Promise<T> {
  const d = (await r.json().catch(() => null)) as (T & { error?: string; issues?: { message?: string }[] }) | null;
  if (!r.ok) {
    const issues = Array.isArray(d?.issues) ? d.issues.map((i) => i.message).filter(Boolean).slice(0, 3).join(" · ") : "";
    throw new Error(`${d?.error ?? `Le Studio a répondu par une erreur (HTTP ${r.status}).`}${issues ? ` — ${issues}` : ""}`);
  }
  return d as T;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface Query {
  table: string;
  page: number;
  per: number;
  q: string;
  sort: { key: string; direction: SortDirection } | null;
  filter: { column: string; op: FilterOp; value: string } | null;
}

function rowsUrl(projectId: string, p: Query): string {
  const u = new URLSearchParams({ project: projectId, table: p.table, page: String(p.page), per: String(p.per) });
  if (p.q.trim()) u.set("q", p.q.trim());
  if (p.sort) {
    u.set("sort", p.sort.key);
    u.set("dir", p.sort.direction === "descending" ? "desc" : "asc");
  }
  if (p.filter) {
    u.set("col", p.filter.column);
    u.set("op", p.filter.op);
    if (OPS.find((o) => o.value === p.filter!.op)?.needsValue) u.set("value", p.filter.value);
  }
  return `/api/migration/sources/rows?${u}`;
}

/** Page de lignes : requête annulée si les paramètres changent avant la réponse ; la page précédente reste affichée pendant le chargement. */
function useRows(projectId: string, query: Query, version: string) {
  const [state, setState] = useState<{ data: RowsPage | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const url = query.table ? rowsUrl(projectId, query) : null;
  useEffect(() => {
    if (!url) return;
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fetch(url, { cache: "no-store", signal: ctl.signal })
      .then((r) => readJson<RowsPage>(r))
      .then((data) => {
        if (!ctl.signal.aborted) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setState((s) => ({ data: s.data, error: e instanceof TypeError ? "Le Studio ne répond pas : vérifiez votre connexion, puis réessayez." : (e as Error).message, loading: false }));
      });
    return () => ctl.abort();
  }, [url, version, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/* ------------------------------------------------------------------ */
/* Valeurs                                                              */
/* ------------------------------------------------------------------ */

function Value({ v, cut, full }: { v: RawValue | undefined; cut?: boolean; full?: boolean }) {
  // Marqueur visible (et lu) : une valeur vide est une information de qualité, pas un trou d'affichage.
  if (isBlank(v)) return <span className="text-small text-text-3 italic">vide</span>;
  const s = typeof v === "boolean" ? (v ? "vrai" : "faux") : String(v);
  if (full) return <span className="break-words whitespace-pre-wrap">{s}</span>;
  return (
    <span className={cx("block max-w-[22rem] truncate", typeof v === "number" && "tabular")} title={s.length > 40 ? s : undefined}>
      {s}
      {cut && <span className="text-text-3">…</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Explorateur                                                          */
/* ------------------------------------------------------------------ */

export function DataExplorer({ projectId, profile, version }: { projectId: string; profile: SourceProfile; version: string }) {
  const tables = profile.tables;
  const [table, setTable] = useState(() => tables.find((t) => t.rows > 0)?.name ?? tables[0]?.name ?? "");
  const [tab, setTab] = useState("rows");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [sort, setSort] = useState<Query["sort"]>(null);
  const [filter, setFilter] = useState<Query["filter"]>(null);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(25);
  const [inspect, setInspect] = useState<number | null>(null);

  // La table choisie a disparu (source retirée) : retour à la première table lisible
  const current = tables.find((t) => t.name === table) ?? null;
  useEffect(() => {
    if (!current && tables.length) setTable(tables.find((t) => t.rows > 0)?.name ?? tables[0].name);
  }, [current, tables]);

  const reset = () => setPage(1);
  const chooseTable = (name: string) => {
    setTable(name);
    setQ("");
    setSort(null);
    setFilter(null);
    setPage(1);
  };
  const query: Query = { table: current?.name ?? "", page, per, q: dq, sort, filter };
  const rows = useRows(projectId, query, version);

  if (!tables.length) return <EmptyState title="Aucune table lisible">Les fichiers reçus ne contiennent pas de table : par exemple une archive de pièces jointes seule.</EmptyState>;

  const groups = new Map<string, TableProfile[]>();
  for (const t of tables) groups.set(t.source_file ?? "Autres", [...(groups.get(t.source_file ?? "Autres") ?? []), t]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-end">
        <Field label="Table consultée" hint="Classées par fichier reçu.">
          <Select name="data_table" value={current?.name ?? ""} onChange={(e) => chooseTable(e.target.value)}>
            {[...groups].map(([file, list]) => (
              <optgroup key={file} label={file}>
                {list.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} — {plural(t.rows, "ligne")}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {current && <TableFacts t={current} />}
      </div>

      {current && (
        <Tabs
          label={`Contenu de la table ${current.name}`}
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "rows",
              label: "Lignes",
              badge: <Badge>{nf(current.rows)}</Badge>,
              content: (
                <RowsView
                  t={current}
                  rows={rows}
                  q={q}
                  setQ={(v) => {
                    setQ(v);
                    reset();
                  }}
                  sort={sort}
                  setSort={(s) => {
                    setSort(s);
                    reset();
                  }}
                  filter={filter}
                  setFilter={(f) => {
                    setFilter(f);
                    reset();
                  }}
                  setPage={setPage}
                  per={per}
                  setPer={(n) => {
                    setPer(n);
                    reset();
                  }}
                  onInspect={setInspect}
                />
              ),
            },
            {
              id: "columns",
              label: (
                <>
                  <span className="sm:hidden">Qualité</span>
                  <span className="max-sm:hidden">Colonnes et qualité</span>
                </>
              ),
              badge: current.columns.some((c) => c.anomalies.count > 0) ? <Badge tone="warn">{current.columns.filter((c) => c.anomalies.count > 0).length}</Badge> : undefined,
              content: (
                <ColumnsView
                  t={current}
                  onShowRows={(f) => {
                    setFilter(f);
                    setQ("");
                    setPage(1);
                    setTab("rows");
                  }}
                />
              ),
            },
          ]}
        />
      )}
      {current && <RowDrawer projectId={projectId} t={current} n={inspect} onClose={() => setInspect(null)} version={version} />}
    </div>
  );
}

function TableFacts({ t }: { t: TableProfile }) {
  const flagged = t.columns.filter((c) => c.anomalies.count > 0).length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-text-2">
      <span className="tabular">
        {plural(t.rows, "ligne")} · {plural(t.columns.length, "colonne")}
      </span>
      {t.primary_key ? (
        <span>
          Clé unique <span className="font-mono text-ink">{t.primary_key}</span>
        </span>
      ) : (
        <StatusBadge tone="bad">Aucune clé unique détectée</StatusBadge>
      )}
      <span>
        Entité proposée <span className="font-mono text-ink">{t.entity}</span>
      </span>
      {flagged > 0 && <StatusBadge tone="warn">{plural(flagged, "colonne non conforme", "colonnes non conformes")}</StatusBadge>}
      {!t.rows && <StatusBadge tone="warn">Table vide</StatusBadge>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lignes                                                               */
/* ------------------------------------------------------------------ */

function RowsView({
  t,
  rows,
  q,
  setQ,
  sort,
  setSort,
  filter,
  setFilter,
  setPage,
  per,
  setPer,
  onInspect,
}: {
  t: TableProfile;
  rows: ReturnType<typeof useRows>;
  q: string;
  setQ: (v: string) => void;
  sort: Query["sort"];
  setSort: (s: Query["sort"]) => void;
  filter: Query["filter"];
  setFilter: (f: Query["filter"]) => void;
  setPage: (n: number) => void;
  per: number;
  setPer: (n: number) => void;
  onInspect: (n: number) => void;
}) {
  const data = rows.data && rows.data.table === t.name ? rows.data : null;
  const columns = data?.columns ?? t.columns.map((c) => c.name);

  const cols: Column<RowsPage["rows"][number]>[] = useMemo(
    () => [
      {
        key: "__n",
        header: "N°",
        rowHeader: true,
        align: "end",
        cell: (r) => (
          <>
            <span className="sm:hidden">Ligne </span>
            {nf(r.n)}
          </>
        ),
      },
      ...columns.map(
        (name, i): Column<RowsPage["rows"][number]> => ({
          key: name,
          header: name,
          cell: (r) => <Value v={r.values[i]} cut={r.truncated?.includes(i)} />,
          sortValue: () => null,
          hideWhenStacked: i >= 3,
        }),
      ),
      {
        key: "__inspect",
        header: "Détail",
        cell: (r) => (
          <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => onInspect(r.n)} aria-label={`Inspecter la ligne ${r.n}`}>
            Inspecter
          </Button>
        ),
      },
    ],
    [columns, onInspect],
  );

  const from = data && data.matched ? (data.page - 1) * data.per + 1 : 0;
  const to = data ? Math.min(data.page * data.per, data.matched) : 0;
  const summary = data
    ? [
        data.matched === data.total ? plural(data.total, "ligne") : `${plural(data.matched, "ligne trouvée", "lignes trouvées")} sur ${nf(data.total)}`,
        data.q ? `contenant « ${data.q} »` : null,
        data.filter ? `filtre : ${data.filter.column} ${opLabel(data.filter.op)}${data.filter.value !== undefined ? ` « ${data.filter.value} »` : ""}` : null,
        data.sort ? `triées par ${data.sort.column} (${data.sort.dir === "asc" ? "croissant" : "décroissant"})` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <SearchInput label="Rechercher dans toute la table" labelVisible value={q} onValueChange={setQ} placeholder="Nom, code, ville…" name="data_search" />
        <Field label="Lignes par page">
          <Select name="data_per" value={String(per)} onChange={(e) => setPer(Number(e.target.value))}>
            {PER.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FilterBar columns={columns} filter={filter} setFilter={setFilter} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-small text-text-2">
          {rows.loading && !data ? "Chargement des lignes…" : summary}
          {rows.loading && data ? <span className="text-text-3"> · mise à jour…</span> : null}
        </p>
        {sort && (
          <Button variant="ghost" size="sm" icon={<ArrowDownUp size={14} />} onClick={() => setSort(null)}>
            Ordre d&apos;origine
          </Button>
        )}
      </div>

      {rows.error && (
        <Alert
          tone="bad"
          title="Lecture des lignes impossible"
          action={
            <Button variant="secondary" size="sm" icon={<RotateCcw size={14} />} onClick={rows.reload}>
              Réessayer
            </Button>
          }
        >
          {rows.error}
        </Alert>
      )}
      {!data && rows.loading ? (
        <Skeleton lines={6} label="Chargement des lignes…" />
      ) : data ? (
        <div aria-busy={rows.loading || undefined} className={cx("transition-opacity duration-(--duration-fast)", rows.loading && "opacity-60")}>
          <DataTable
            caption={data.matched ? `Table ${data.table} — lignes ${nf(from)} à ${nf(to)} sur ${nf(data.matched)}` : `Table ${data.table}`}
            columns={cols}
            rows={data.rows}
            rowKey={(r) => String(r.n)}
            sort={sort}
            onSortChange={setSort}
            manualSort
            empty={data.total === 0 ? "Cette table ne contient aucune ligne." : "Aucune ligne ne correspond à la recherche ou au filtre."}
          />
        </div>
      ) : null}
      {data && <Pagination page={data.page} pageCount={data.pages} onPageChange={setPage} label={`Pages de la table ${data.table}`} />}
    </div>
  );
}

function FilterBar({ columns, filter, setFilter }: { columns: string[]; filter: Query["filter"]; setFilter: (f: Query["filter"]) => void }) {
  const [col, setCol] = useState(filter?.column ?? columns[0] ?? "");
  const [op, setOp] = useState<FilterOp>(filter?.op ?? "contains");
  const [value, setValue] = useState(filter?.value ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const needsValue = OPS.find((o) => o.value === op)?.needsValue ?? false;
  const last = useRef(filter);
  // Filtre posé ailleurs (ex. « Voir les lignes » d'une anomalie) : les champs le reprennent
  useEffect(() => {
    if (filter === last.current) return;
    last.current = filter;
    if (filter) {
      setCol(filter.column);
      setOp(filter.op);
      setValue(filter.value);
    }
  }, [filter]);
  useEffect(() => {
    if (!columns.includes(col)) setCol(columns[0] ?? "");
  }, [columns, col]);

  function apply(e: FormEvent) {
    e.preventDefault();
    if (needsValue && !value.trim()) {
      setProblem("Indiquez la valeur recherchée.");
      return;
    }
    setProblem(null);
    const f = { column: col, op, value: needsValue ? value.trim() : "" };
    last.current = f;
    setFilter(f);
  }

  return (
    <form onSubmit={apply} noValidate className="flex flex-col gap-3 rounded-panel bg-canvas px-4 py-3 ring-1 ring-line" aria-label="Filtrer une colonne">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,1fr)_auto] lg:items-end">
        <Field label="Colonne">
          <Select name="filter_column" value={col} onChange={(e) => setCol(e.target.value)} size="sm">
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Condition">
          <Select name="filter_op" value={op} onChange={(e) => setOp(e.target.value as FilterOp)} size="sm">
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valeur" error={problem} disabled={!needsValue}>
          <Input name="filter_value" size="sm" value={needsValue ? value : ""} onChange={(e) => setValue(e.target.value)} maxLength={200} placeholder={needsValue ? "Texte recherché" : "Sans objet"} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" size="sm">
            Filtrer
          </Button>
          {filter && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX size={14} />}
              onClick={() => {
                last.current = null;
                setFilter(null);
              }}
            >
              Retirer le filtre
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Colonnes et qualité                                                  */
/* ------------------------------------------------------------------ */

function ColumnsView({ t, onShowRows }: { t: TableProfile; onShowRows: (f: NonNullable<Query["filter"]>) => void }) {
  const cols: Column<ColumnProfile>[] = [
    {
      key: "name",
      header: "Colonne",
      rowHeader: true,
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-small break-all">{c.name}</span>
          {c.name === t.primary_key && <Badge tone="ok">clé</Badge>}
          {c.unique && c.name !== t.primary_key && <Badge>valeurs uniques</Badge>}
        </span>
      ),
    },
    { key: "type", header: "Type lu", sortValue: (c) => typeLabel(c), cell: (c) => <span className="text-text-2">{typeLabel(c)}</span> },
    {
      key: "filled",
      header: "Remplissage",
      align: "end",
      sortValue: (c) => (t.rows ? (t.rows - c.nulls) / t.rows : 0),
      cell: (c) =>
        t.rows ? (
          <span className="inline-flex flex-col items-end">
            <span className="tabular">{formatPercent((t.rows - c.nulls) / t.rows, 1)}</span>
            <span className="text-meta whitespace-nowrap text-text-3">{c.nulls ? `${plural(c.nulls, "vide")} (${formatPercent(c.nulls / t.rows, 1)})` : "aucun vide"}</span>
          </span>
        ) : (
          "—"
        ),
    },
    { key: "distinct", header: "Distinctes", align: "end", sortValue: (c) => c.distinct, cell: (c) => nf(c.distinct) },
    {
      key: "conformity",
      header: "Conformité",
      align: "end",
      sortValue: (c) => (c.type === "text" || c.type === "empty" ? null : c.conformity),
      cell: (c) => (c.type === "text" || c.type === "empty" ? <span className="text-text-3">sans objet</span> : <span className={cx("tabular", c.conformity < 1 && "font-semibold text-warning-ink")}>{percent(c.conformity)}</span>),
    },
    {
      key: "anomalies",
      header: "Anomalies",
      sortValue: (c) => c.anomalies.count,
      cell: (c) =>
        c.anomalies.count ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-warning-ink">{plural(c.anomalies.count, "valeur non conforme", "valeurs non conformes")}</span>
            {c.anomalies.samples.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {c.anomalies.samples.slice(0, 3).map((v, i) => (
                  <button
                    key={`${String(v)}-${i}`}
                    type="button"
                    className="btn btn-ghost btn-sm h-auto! min-h-7 px-1.5! font-mono text-meta"
                    onClick={() => onShowRows({ column: c.name, op: "equals", value: String(v) })}
                    aria-label={`Voir les lignes où ${c.name} vaut « ${String(v)} »`}
                  >
                    « {String(v)} »
                  </button>
                ))}
              </span>
            )}
          </div>
        ) : (
          <span className="text-text-3">aucune</span>
        ),
    },
    {
      key: "codes",
      header: "Valeurs fréquentes",
      hideWhenStacked: true,
      cell: (c) =>
        c.codes?.length ? (
          <span className="text-small text-text-2">
            {c.codes
              .slice(0, 4)
              .map((x) => `${x.value} (${nf(x.count)})`)
              .join(", ")}
            {c.codes.length > 4 ? ` (+${c.codes.length - 4})` : ""}
          </span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[760px] text-small leading-relaxed text-text-3">
        Indicateurs calculés sur toutes les lignes reçues. Le type est déduit des valeurs (aucune conversion n&apos;est faite à ce stade) ; une valeur « non conforme » ne correspond pas au type le plus probable de sa colonne.
      </p>
      <DataTable caption={`Colonnes de la table ${t.name}`} columns={cols} rows={t.columns} rowKey={(c) => c.name} empty="Aucune colonne." />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inspection d'une ligne                                               */
/* ------------------------------------------------------------------ */

function RowDrawer({ projectId, t, n, onClose, version }: { projectId: string; t: TableProfile; n: number | null; onClose: () => void; version: string }) {
  const [state, setState] = useState<{ data: OneRow | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    if (n === null) return;
    const ctl = new AbortController();
    setState({ data: null, error: null });
    fetch(`/api/migration/sources/rows?${new URLSearchParams({ project: projectId, table: t.name, row: String(n) })}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => readJson<OneRow>(r))
      .then((data) => {
        if (!ctl.signal.aborted) setState({ data, error: null });
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setState({ data: null, error: (e as Error).message });
      });
    return () => ctl.abort();
  }, [projectId, t.name, n, version]);

  const byName = new Map(t.columns.map((c) => [c.name, c]));
  let body: ReactNode;
  if (state.error) body = <Alert tone="bad" title="Ligne illisible">{state.error}</Alert>;
  else if (!state.data) body = <Skeleton lines={6} label="Lecture de la ligne…" />;
  else
    body = (
      // Zone focalisable et nommée : le contenu se fait défiler au clavier, et la lecture commence par les valeurs.
      <dl tabIndex={0} aria-label={`Valeurs de la ligne n° ${nf(state.data.row.n)}`} className="-mx-1 flex flex-col divide-y divide-line rounded-control px-1">
        {state.data.columns.map((name, i) => {
          const v = state.data!.row.values[i];
          const prof = byName.get(name);
          const flagged = !!prof && !isBlank(v) && prof.anomalies.samples.some((s) => String(s) === String(v));
          return (
            <div key={name} className="flex flex-col gap-1 py-3">
              <dt className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-small font-semibold break-all text-ink">{name}</span>
                {prof && <span className="text-meta text-text-3">{typeLabel(prof)}</span>}
                {flagged && <StatusBadge tone="warn">{`Non conforme au type « ${READ_TYPE[prof!.type] ?? prof!.type} »`}</StatusBadge>}
              </dt>
              <dd className="text-body text-ink">
                <Value v={v} full />
                {state.data!.row.truncated?.includes(i) && <span className="mt-1 block text-small text-text-3">Valeur très longue : seuls les 100 000 premiers caractères sont affichés.</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    );

  return (
    <Drawer open={n !== null} onClose={onClose} title={n !== null ? `Ligne n° ${nf(n)}` : "Ligne"} description={`Table ${t.name}${t.source_file ? ` · fichier ${t.source_file}` : ""} · valeurs telles que reçues`}>
      {body}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

/** Relations déduites des valeurs (profil) : couverture, valeurs orphelines, confiance. */
export function DataRelations({ relations }: { relations: RelationGuess[] }) {
  if (!relations.length) return <p className="text-body text-text-2">Aucune relation détectée entre les tables.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line">
        {relations.map((r) => (
          <li key={`${r.table}.${r.column}>${r.references.table}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="min-w-0 font-mono text-small break-all text-ink">
              {r.table}.{r.column} <span className="text-text-3">→</span> {r.references.table}.{r.references.column}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
              <span className="tabular text-text-2">couverture {percent(r.coverage)}</span>
              {r.orphans ? (
                // Texte long (exemples de valeurs) : retour à la ligne permis, pas de débordement à 320 px.
                <StatusBadge tone="warn" className="h-auto max-w-full py-0.5 whitespace-normal">
                  {plural(r.orphans, "valeur orpheline", "valeurs orphelines")}
                  {r.orphan_samples.length ? ` (ex. ${r.orphan_samples.slice(0, 3).join(", ")})` : ""}
                </StatusBadge>
              ) : (
                <StatusBadge tone="ok">aucune valeur orpheline</StatusBadge>
              )}
              <span className="tabular text-text-3">confiance {confidencePct(r.confidence)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-small text-text-3">Proposée quand le nom de la colonne l&apos;évoque et qu&apos;au moins 80 % de ses valeurs existent dans la table visée. À confirmer à l&apos;étape Correspondances.</p>
    </div>
  );
}
