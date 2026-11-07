import type { UnsupportedFeature } from "@/lib/types";

/** Distinction explicite entre ce qui est reconstruit et ce qui ne l'est pas. */
export function Unsupported({ items }: { items: UnsupportedFeature[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-dashed border-ga-line p-4">
      <h3 className="text-[13px] font-semibold text-ga-ink">Non repris de l&apos;application d&apos;origine</h3>
      <p className="mt-0.5 text-[12px] text-ga-faint">Ces éléments ont été observés mais ne sont pas reconstruits : ils ne sont ni simulés ni approximés.</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((u, i) => (
          <li key={i} className="text-[13px]">
            <span className="font-medium text-ga-ink">{u.label}</span>
            {u.reason && <span className="text-ga-muted"> — {u.reason}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
