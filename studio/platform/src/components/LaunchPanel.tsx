"use client";

import { useState } from "react";
import { Bot, MonitorPlay } from "lucide-react";
import { post, useReborn } from "./RebornProvider";
import { Button, Field, cx, inputCls } from "./ui";
import type { Investigation } from "@/lib/types";

const DEFAULT_OBJECTIVE =
  "Découvrir les règles de calcul du devis : prix unitaires, remises par quantité, catégorie client, frais de livraison et exceptions.";

export function LaunchPanel({
  kind = "initial",
  onLaunched,
  compact,
  only,
}: {
  kind?: Investigation["kind"];
  onLaunched?: () => void;
  compact?: boolean;
  /** Limite le choix à un parcours (Mission control sépare agents réels et mode local). */
  only?: "live" | "simulation";
}) {
  const { active, state } = useReborn();
  const last = state?.investigations.at(-1);
  const [application, setApplication] = useState(last?.application ?? "Quotix 98");
  const [target, setTarget] = useState(last?.target_url ?? "http://localhost:4000");
  const [module, setModule] = useState(last?.module ?? "Devis");
  const [objective, setObjective] = useState(kind === "blind_challenge" ? "Une règle cachée a peut-être changé. Rejouer le plan d'expériences et détecter les écarts." : DEFAULT_OBJECTIVE);
  const [mode, setMode] = useState<"live" | "simulation">(only ?? (last?.mode === "live" ? "live" : "simulation"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const running = active?.status === "running";

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await post("/api/investigations", { application, target_url: target, module, objective, mode, kind });
      onLaunched?.();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={launch} className="flex flex-col gap-3">
      <div className={cx("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-[1fr_1fr_120px]")}>
        <Field label="Logiciel historique">
          <input name="application" className={inputCls} value={application} onChange={(e) => setApplication(e.target.value)} required />
        </Field>
        <Field label="Adresse de l'interface">
          <input name="target_url" className={cx(inputCls, "font-mono text-[12px]")} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Module">
          <input name="module" className={inputCls} value={module} onChange={(e) => setModule(e.target.value)} required />
        </Field>
      </div>
      {!compact && (
        <Field label="Objectif de l'investigation">
          <textarea name="objective" className={cx(inputCls, "h-auto min-h-[60px] py-2 leading-snug")} value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} />
        </Field>
      )}

      <fieldset className={cx("grid gap-2", only ? "grid-cols-1" : "grid-cols-2")}>
        <legend className="mb-1 text-xs font-bold text-sediment">Opérateur d'exploration</legend>
        {(
          [
            { v: "live", icon: Bot, t: "Agents réels", d: "Attend l'agent H Company de Mouss et l'analyste d'Alan (API)" },
            { v: "simulation", icon: MonitorPlay, t: "Mode local · répétition", d: "Explorateur intégré, interface HTML. Aucun appel à H Company" },
          ] as const
        )
          .filter((o) => !only || o.v === only)
          .map((o) => (
          <label
            key={o.v}
            className={cx(
              "flex cursor-pointer items-start gap-2.5 rounded-sm p-2.5 transition-shadow",
              mode === o.v ? "bg-verdigris-soft shadow-[inset_0_0_0_1.5px_var(--color-verdigris)]" : "bg-chalk shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-chalk-2",
            )}
          >
            <input type="radio" name="mode" value={o.v} checked={mode === o.v} onChange={() => setMode(o.v)} className="sr-only" />
            <o.icon size={16} className={cx("mt-0.5 shrink-0", mode === o.v ? "text-verdigris" : "text-silt")} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] leading-tight font-bold">{o.t}</span>
              <span className="block text-[11.5px] leading-snug text-sediment">{o.d}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-rust">{err}</span>
        <Button type="submit" variant={kind === "blind_challenge" ? "accent" : "primary"} disabled={busy}>
          {busy
            ? "Lancement…"
            : kind === "blind_challenge"
              ? "Lancer la réinvestigation"
              : mode === "live"
                ? running
                  ? "Nouvelle investigation agents réels"
                  : "Lancer avec les agents réels"
                : "Lancer la répétition locale"}
        </Button>
      </div>
    </form>
  );
}
