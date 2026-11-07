"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { normalizeInputs } from "@/lib/engine/inputs";
import { compareOne } from "@/lib/compare";
import { formatOutput } from "./app/format";
import type { ResolvedApp } from "@/lib/appschema";
import type { ComputeResult, Inputs, RuleModel } from "@/lib/types";
import { post, useReborn } from "./RebornProvider";
import { Button, LegacyValue, cx } from "./ui";

function key(inputs: Inputs) {
  const n = normalizeInputs(inputs);
  return JSON.stringify(Object.keys(n).sort().map((k) => [k, typeof n[k] === "string" ? String(n[k]).toLowerCase() : n[k]]));
}

/**
 * Vérifie le cas saisi dans l'application reconstruite contre le logiciel historique.
 * Si ce cas a déjà été observé, le verdict utilise exactement le comparateur ;
 * sinon une demande d'expérience est publiée pour l'Explorer.
 */
export function VerifyCase({ inputs, result, model, app }: { inputs: Inputs | null; result: ComputeResult | null; model: RuleModel | null; app: ResolvedApp }) {
  const { state, active } = useReborn();
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!inputs || !model) return null;

  const primary = app.outputs.find((o) => o.primary) ?? app.outputs[0];
  const k = key(inputs);
  const match = [...(state?.observations ?? [])].reverse().find((o) => o.status !== "failed" && key(o.inputs) === k);
  const row = match ? compareOne(model, match, { fields: app.fields }) : null;
  const waiting = sent === k && !match;

  async function ask() {
    setErr(null);
    try {
      await post("/api/events", {
        source: "user",
        type: "experiment_request",
        title: `Vérifier sur l'original : ${Object.values(inputs!).join(" · ")}`,
        detail: "Cas saisi dans l'application reconstruite",
        data: { inputs },
      });
      setSent(k);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const rebuiltTxt = !result ? "—" : result.status === "ok" ? formatOutput(result.outputs[primary.name], primary, app.currency) : result.status === "rejected" ? "refus métier" : "saisie invalide";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-chalk px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <span>
          <span className="text-silt">Reconstruit </span>
          <b className="tabular">{rebuiltTxt}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-silt">Original </span>
          {match ? (
            match.status === "error" ? <span className="legacy-value text-[11px] text-rust!">{match.error ?? "refus"}</span> : <LegacyValue value={match.observed_output[primary.name]} />
          ) : (
            <span className="text-silt">{waiting ? "lecture à l'écran en cours…" : "cas jamais observé"}</span>
          )}
        </span>
        {row && <span className={cx("font-bold", row.status === "match" ? "text-verdigris" : "text-rust")}>{row.status === "match" ? "✓ comportement identique" : `✕ ${row.reason ?? "écart détecté"}`}</span>}
      </div>
      {!match && (
        <Button size="sm" variant="ghost" onClick={ask} disabled={waiting || !active} title={!active ? "Aucune investigation active" : undefined}>
          <Send size={12} /> {waiting ? "Demande envoyée" : "Vérifier sur le logiciel historique"}
        </Button>
      )}
      {err && <span className="w-full text-[12px] text-rust">{err}</span>}
    </div>
  );
}
