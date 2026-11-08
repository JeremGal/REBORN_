import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cx } from "./cx";

export type BreadcrumbItem = { label: string; href?: string };

/** Fil d'Ariane : `nav` nommé, liste ordonnée, page courante marquée `aria-current="page"`. */
export function Breadcrumb({ items, label = "Fil d'Ariane", className }: { items: BreadcrumbItem[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-small text-text-3">
        {items.map((it, i) => {
          const current = i === items.length - 1;
          return (
            <li key={`${i}-${it.label}`} className="flex min-w-0 items-center gap-1">
              {it.href && !current ? (
                <Link href={it.href} className="inline-flex min-h-6 min-w-0 items-center rounded-xs font-medium text-text-2 underline decoration-line-strong underline-offset-4 transition-colors duration-(--duration-fast) hover:text-ink hover:decoration-current max-sm:min-h-11">
                  <span className="truncate">{it.label}</span>
                </Link>
              ) : (
                <span aria-current={current ? "page" : undefined} className={cx("truncate", current && "font-semibold text-ink")}>
                  {it.label}
                </span>
              )}
              {!current && <ChevronRight size={14} aria-hidden className="shrink-0 text-text-3" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
