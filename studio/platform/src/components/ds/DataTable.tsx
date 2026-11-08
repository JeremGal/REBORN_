"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoveHorizontal } from "lucide-react";
import { cx } from "./cx";
import { Select } from "./Field";

export type SortDirection = "ascending" | "descending";
export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Valeur de tri : rend la colonne triable (bouton dans l'en-tête, aria-sort). */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "start" | "end";
  /** La cellule de cette colonne identifie la ligne (th scope=row). */
  rowHeader?: boolean;
  /** Masquée dans la présentation empilée (mobile). */
  hideWhenStacked?: boolean;
  className?: string;
};

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
function compare(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1; // valeurs absentes en dernier
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Tableau de données : légende (caption), en-têtes `th scope`, tri par boutons dans les en-têtes
 * (aria-sort + annonce), défilement horizontal signalé et focalisable quand il est nécessaire,
 * présentation empilée sous 640 px (liste de fiches), état vide.
 */
export function DataTable<T>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  initialSort,
  sort: controlledSort,
  onSortChange,
  manualSort = false,
  empty = "Aucune ligne à afficher.",
  stackOnMobile = true,
  className,
}: {
  caption: string;
  captionHidden?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSort?: { key: string; direction: SortDirection };
  /** Tri contrôlé (ex. données paginées ou triées par le serveur). */
  sort?: { key: string; direction: SortDirection } | null;
  onSortChange?: (sort: { key: string; direction: SortDirection } | null) => void;
  /** Les lignes arrivent déjà triées (le tableau n'applique pas le tri lui-même). */
  manualSort?: boolean;
  empty?: ReactNode;
  stackOnMobile?: boolean;
  className?: string;
}) {
  const id = useId();
  const [innerSort, setInnerSort] = useState(initialSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : innerSort;
  const setSort = (next: { key: string; direction: SortDirection } | null) => {
    if (controlledSort === undefined) setInnerSort(next);
    onSortChange?.(next);
  };
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key && c.sortValue);
    if (manualSort || !sort || !col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort.direction === "ascending" ? 1 : -1;
    return rows
      .map((r, i) => ({ r, i }))
      .sort((x, y) => compare(get(x.r), get(y.r)) * dir || x.i - y.i)
      .map((x) => x.r);
  }, [rows, columns, sort, manualSort]);

  // Défilement horizontal : détecté réellement (largeur du contenu > largeur visible)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [sorted.length, columns.length]);

  const toggle = (key: string) =>
    setSort(sort?.key === key ? { key, direction: sort.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" });

  const sortable = columns.some((c) => c.sortValue);
  const sortedCol = sort && columns.find((c) => c.key === sort.key);
  const announce = sortedCol ? `Trié par ${sortedCol.header}, ordre ${sort.direction === "ascending" ? "croissant" : "décroissant"}.` : "";
  const captionId = `${id}-cap`;

  const cellAlign = (c: Column<T>) => (c.align === "end" ? "text-right tabular" : "text-left");

  return (
    <div className={cx("min-w-0", className)}>
      <p className="sr-only" role="status">
        {announce}
      </p>
      {overflow && (
        <p className={cx("mb-2 flex items-center gap-1.5 text-meta text-text-3", stackOnMobile && "max-sm:hidden")}>
          <MoveHorizontal size={14} aria-hidden /> Tableau plus large que l&apos;écran : faites-le défiler horizontalement.
        </p>
      )}
      <div
        ref={scroller}
        role={overflow ? "region" : undefined}
        aria-labelledby={overflow ? captionId : undefined}
        tabIndex={overflow ? 0 : undefined}
        className={cx("overflow-x-auto rounded-panel bg-surface ring-1 ring-line", stackOnMobile && "max-sm:hidden")}
      >
        <table className="w-full border-collapse text-body">
          <caption id={captionId} className={cx("px-4 pt-3 pb-2 text-left text-small font-semibold text-ink", captionHidden && "sr-only")}>
            {caption}
            {sortable && <span className="sr-only"> — les en-têtes avec un bouton permettent de trier.</span>}
          </caption>
          <thead>
            <tr className="border-b border-line-strong">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.sortValue && active ? sort.direction : undefined}
                    className={cx("px-4 py-2.5 align-bottom text-small font-semibold whitespace-nowrap text-text-2", cellAlign(c), c.className)}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className={cx(
                          "-mx-1.5 inline-flex min-h-8 items-center max-sm:min-h-11 gap-1.5 rounded-xs px-1.5 font-semibold transition-colors duration-(--duration-fast) hover:bg-surface-sunken hover:text-ink",
                          active ? "text-ink" : "text-text-2",
                          c.align === "end" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        <span aria-hidden className={cx("inline-flex", active ? "text-accent" : "text-text-3")}>
                          {!active ? <ArrowUpDown size={14} /> : sort.direction === "ascending" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-text-2">
                  {empty}
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr key={rowKey(r, i)} className="border-b border-line last:border-b-0 hover:bg-canvas">
                  {columns.map((c) => {
                    const Cell = c.rowHeader ? "th" : "td";
                    return (
                      <Cell key={c.key} scope={c.rowHeader ? "row" : undefined} className={cx("px-4 py-2.5 align-top", c.rowHeader ? "font-semibold text-ink" : "text-ink", cellAlign(c), c.className)}>
                        {c.cell(r)}
                      </Cell>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {stackOnMobile && <Stacked id={id} caption={caption} columns={columns} rows={sorted} rowKey={rowKey} empty={empty} sort={sort} onSort={setSort} />}
    </div>
  );
}

/** Présentation empilée (< 640 px) : une fiche par ligne, chaque valeur précédée de son en-tête. */
function Stacked<T>({
  id,
  caption,
  columns,
  rows,
  rowKey,
  empty,
  sort,
  onSort,
}: {
  id: string;
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty: ReactNode;
  sort: { key: string; direction: SortDirection } | null;
  onSort: (s: { key: string; direction: SortDirection } | null) => void;
}) {
  const sortable = columns.filter((c) => c.sortValue);
  const head = columns.find((c) => c.rowHeader) ?? columns[0];
  const rest = columns.filter((c) => c !== head && !c.hideWhenStacked);
  return (
    <div className="sm:hidden">
      <p id={`${id}-st`} className="mb-2 text-small font-semibold text-ink">
        {caption}
      </p>
      {sortable.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          <label htmlFor={`${id}-tri`} className="ds-label">
            Trier par
          </label>
          <Select
            id={`${id}-tri`}
            value={sort ? `${sort.key}:${sort.direction}` : ""}
            onChange={(e) => {
              const [key, direction] = e.target.value.split(":");
              onSort(key ? { key, direction: direction as SortDirection } : null);
            }}
          >
            <option value="">Ordre d&apos;origine</option>
            {sortable.flatMap((c) => [
              <option key={`${c.key}:a`} value={`${c.key}:ascending`}>
                {c.header} (croissant)
              </option>,
              <option key={`${c.key}:d`} value={`${c.key}:descending`}>
                {c.header} (décroissant)
              </option>,
            ])}
          </Select>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-panel bg-surface px-4 py-6 text-center text-text-2 ring-1 ring-line">{empty}</p>
      ) : (
        <ul aria-labelledby={`${id}-st`} className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={rowKey(r, i)} className="rounded-panel bg-surface px-4 py-3 ring-1 ring-line">
              <div className="font-semibold text-ink">{head.cell(r)}</div>
              <dl className="mt-2 grid grid-cols-5 gap-x-3 gap-y-1.5 text-body">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="col-span-2 text-small text-text-3">{c.header}</dt>
                    <dd className={cx("col-span-3 min-w-0 break-words text-ink", c.align === "end" && "tabular")}>{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
