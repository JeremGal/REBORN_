import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "./cx";

/** Pages à afficher : 1 … 4 5 6 … 12 */
export function pageList(page: number, count: number, siblings = 1): (number | "…")[] {
  const out: (number | "…")[] = [];
  const from = Math.max(2, page - siblings);
  const to = Math.min(count - 1, page + siblings);
  out.push(1);
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < count - 1) out.push("…");
  if (count > 1) out.push(count);
  return out;
}

/**
 * Pagination : `nav` nommé, page courante `aria-current="page"`, précédent/suivant réellement
 * désactivés aux bornes. Sous 640 px : « Page x sur y » et les deux flèches.
 */
export function Pagination({ page, pageCount, onPageChange, label = "Pagination", className }: { page: number; pageCount: number; onPageChange: (page: number) => void; label?: string; className?: string }) {
  if (pageCount <= 1) return null;
  const item = "btn btn-ghost btn-sm min-w-control-sm px-2 tabular max-sm:min-w-control-lg";
  return (
    <nav aria-label={label} className={cx("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-small text-text-2 tabular">
        Page {page} sur {pageCount}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <button type="button" className={cx(item, "gap-1 px-2.5")} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft size={16} aria-hidden />
            <span className="max-sm:sr-only">Précédent</span>
          </button>
        </li>
        {pageList(page, pageCount).map((p, i) =>
          p === "…" ? (
            <li key={`e${i}`} aria-hidden className="px-1 text-text-3 max-sm:hidden">
              …
            </li>
          ) : (
            <li key={p} className="max-sm:hidden">
              <button
                type="button"
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPageChange(p)}
                className={cx(item, p === page && "bg-ink text-white hover:bg-ink-2 hover:text-white")}
              >
                {p}
              </button>
            </li>
          ),
        )}
        <li>
          <button type="button" className={cx(item, "gap-1 px-2.5")} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            <span className="max-sm:sr-only">Suivant</span>
            <ChevronRight size={16} aria-hidden />
          </button>
        </li>
      </ul>
    </nav>
  );
}
