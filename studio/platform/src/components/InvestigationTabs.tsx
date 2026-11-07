"use client";

import { useReborn } from "./RebornProvider";
import { cx } from "./ui";

export function InvestigationTabs({ value, onChange, allowAll }: { value: string | null; onChange: (id: string) => void; allowAll?: boolean }) {
  const { state } = useReborn();
  const list = state?.investigations ?? [];
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap rounded-sm bg-chalk-2 p-0.5" role="tablist" aria-label="Investigations">
      {allowAll && (
        <button
          role="tab"
          aria-selected={value === "all"}
          onClick={() => onChange("all")}
          className={cx("h-7 rounded-xs px-2.5 text-[12px] font-bold", value === "all" ? "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-sediment hover:text-ink")}
        >
          Toutes
        </button>
      )}
      {list.map((i) => (
        <button
          key={i.id}
          role="tab"
          aria-selected={value === i.id}
          onClick={() => onChange(i.id)}
          className={cx(
            "flex h-7 items-center gap-1.5 rounded-xs px-2.5 text-[12px] font-bold",
            value === i.id ? "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-sediment hover:text-ink",
          )}
        >
          {i.status === "running" && <span className="live-dot size-1.5 rounded-full bg-verdigris" />}
          {i.kind === "blind_challenge" ? "Blind" : "Inv."} #{i.number}
        </button>
      ))}
    </div>
  );
}
