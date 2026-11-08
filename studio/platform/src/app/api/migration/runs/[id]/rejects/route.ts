import { runArtifacts } from "@/lib/migration/project";
import { handler } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Rapport d'écarts téléchargeable (CSV) : chaque ligne non migrée avec ses motifs et sa ligne source complète.
 * Propriétaire et Analyste. [id] = exécution du projet de la requête (?project=).
 */
export const GET = handler(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const { result } = runArtifacts(id);
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      "type;entite;table_source;cle_source;ligne;motif;donnees_source",
      ...result.rejections.map((r) => ["rejet", r.entity, r.source_table, r.source_key, r.row, r.reasons.join(" | "), r.raw].map(cell).join(";")),
      ...result.field_issues.map((i) => [i.kind === "unlinked" ? "sans_lien" : "valeur_non_convertie", i.entity, "", i.source_key, "", `${i.field} : ${i.message}`, i.raw].map(cell).join(";")),
      ...result.attachments.missing.map((m) => ["piece_jointe", "", "", m.source_key, "", m.reason, m.path].map(cell).join(";")),
    ];
    return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ecarts-${id}.csv"`, "cache-control": "no-store" } });
  },
  { access: ["owner", "analyst"], project: "query" },
);
