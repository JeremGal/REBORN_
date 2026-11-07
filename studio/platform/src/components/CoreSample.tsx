import Link from "next/link";
import type { ComparisonRow } from "@/lib/types";
import { cx } from "./ui";

/**
 * « Carotte » : une tranche par expérience, colorée selon que le logiciel
 * reconstruit reproduit ou non la sortie du logiciel historique.
 */
export function CoreSample({ rows, height = 28, href = "/comparaison" }: { rows: ComparisonRow[]; height?: number; href?: string }) {
  if (!rows.length) return <div className="rounded-xs bg-chalk-2" style={{ height }} />;
  return (
    <div className="flex w-full gap-[2px]" style={{ height }} role="img" aria-label={`${rows.filter((r) => r.status === "match").length} expériences identiques sur ${rows.length}`}>
      {rows.map((r) => (
        <Link
          key={r.experiment_id}
          href={`${href}#${r.experiment_id}`}
          title={`${r.experiment_id} · ${r.status === "match" ? (r.exception ? "refus reproduit" : "identique") : r.status === "mismatch" ? r.reason ?? `écart ${r.delta ?? ""}` : r.status === "inconclusive" ? "expérience non aboutie (exclue)" : "non couvert"}${r.independent ? " · validation" : " · construction"}`}
          className={cx(
            "min-w-[3px] flex-1 transition-opacity duration-150 first:rounded-l-xs last:rounded-r-xs hover:opacity-70",
            r.status === "match" && (r.independent ? "bg-verdigris-bright" : "bg-verdigris"),
            r.status === "mismatch" && "bg-rust",
            r.status === "inconclusive" && "bg-dust",
            r.status === "not_covered" && "bg-ochre",
          )}
        />
      ))}
    </div>
  );
}
