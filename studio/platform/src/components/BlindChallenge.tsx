"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { compareAll } from "@/lib/compare";
import { resolveApp } from "@/lib/appschema";
import { describeAction } from "@/lib/engine/describe";
import { useReborn } from "./RebornProvider";
import { LaunchPanel } from "./LaunchPanel";
import { Button, cx, pct } from "./ui";

/**
 * Blind Challenge : une règle cachée change sans que les agents connaissent sa
 * nouvelle valeur. Chaque étape est validée sur l'état réel ; chaque score est
 * recalculé par le comparateur, avec le nombre de cas sur lequel il porte.
 */
export function BlindChallenge() {
  const { state } = useReborn();
  const [launching, setLaunching] = useState(false);
  if (!state) return null;

  const bc = [...state.investigations].reverse().find((i) => i.kind === "blind_challenge") ?? null;
  const obs = bc ? state.observations.filter((o) => o.investigation_id === bc.id) : [];
  const drifts = bc ? state.events.filter((e) => e.type === "drift" && e.investigation_id === bc.id).length : 0;
  const startModel = bc?.model_version_at_start ? state.models.find((m) => m.version === bc.model_version_at_start) ?? null : null;
  const newModel = bc ? [...state.models].reverse().find((m) => m.version > (bc.model_version_at_start ?? 0)) ?? null : null;
  const schema = state.schemas.at(-1);
  const measure = (m: typeof newModel) => (bc && m ? compareAll(m, state.observations, bc.id, { fields: resolveApp(m, schema, state.observations).fields }) : null);
  const before = measure(startModel);
  const after = measure(newModel);
  const changed = newModel?.diff?.filter((d) => d.kind !== "removed") ?? [];

  const steps = [
    {
      title: "Introduire le changement",
      text: "Une règle cachée change dans le logiciel historique, sans que les agents connaissent sa nouvelle valeur.",
      done: !!bc,
      status: bc ? `Réinvestigation #${bc.number} · modèle en place v${bc.model_version_at_start ?? "—"}` : "En attente",
    },
    {
      title: "Réinvestiguer et détecter",
      text: "Nouvelles observations ; le comparateur rejoue chacune dans l'application en place.",
      done: !!bc && obs.length > 0 && (drifts > 0 || bc.status !== "running"),
      status: bc
        ? before?.scored
          ? `${drifts} écart${drifts > 1 ? "s" : ""} · v${startModel?.version} : ${pct(before.equivalence)} sur ${before.scored} cas`
          : `${obs.length} observation${obs.length > 1 ? "s" : ""}`
        : "—",
      alert: drifts > 0 && !newModel,
    },
    {
      title: "Publier le modèle corrigé",
      text: "L'analyse corrige les règles à partir des seules observations, sans lire le code caché.",
      done: !!newModel,
      status: newModel
        ? changed.length
          ? changed.map((d) => (d.kind === "added" ? `${d.rule_id} ajoutée` : `${d.rule_id} : ${d.before ? describeAction(d.before.action) : ""} → ${d.after ? describeAction(d.after.action) : ""}`)).join(" · ")
          : `Modèle v${newModel.version} reçu`
        : "—",
    },
    {
      title: "Régénérer et vérifier",
      text: "L'application se met à jour sans code ; nouvelle comparaison, cas indépendants inclus.",
      done: !!after && after.scored > 0 && after.equivalence === 1,
      status: after?.scored
        ? `v${newModel?.version} : ${pct(after.equivalence)} sur ${after.scored} cas · validation ${after.independent_matched}/${after.independent_total}`
        : "—",
    },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  const allDone = currentIdx === -1;

  return (
    <section className={cx("card overflow-hidden", allDone && "shadow-[0_0_0_1.5px_var(--color-verdigris)]")}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <div className="eyebrow text-verdigris!">Test imposé au système</div>
          <h2 className="text-[17px] font-black tracking-[-0.015em]">Blind Challenge</h2>
        </div>
        {allDone ? (
          <span className="rounded-full bg-verdigris px-3 py-1 text-[12px] font-bold text-white">Comportement redécouvert ✓</span>
        ) : !bc || bc.status !== "running" ? (
          <Button variant={bc ? "ghost" : "accent"} size="sm" onClick={() => setLaunching((v) => !v)}>
            {launching ? "Annuler" : bc ? "Relancer un Blind Challenge" : "Démarrer le Blind Challenge"}
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-verdigris">
            <span className="live-dot size-1.5 rounded-full bg-verdigris" /> Réinvestigation en cours
          </span>
        )}
      </header>

      {launching && (
        <div className="border-t border-line bg-chalk px-5 py-4">
          <p className="mb-3 text-[12.5px] text-sediment">
            Le jury modifie une règle dans la console de maintenance du logiciel historique (locale, protégée, hors de portée des agents), puis on relance
            l&apos;exploration à l&apos;aveugle.
          </p>
          <LaunchPanel kind="blind_challenge" compact onLaunched={() => setLaunching(false)} />
        </div>
      )}

      <ol className="grid border-t border-line md:grid-cols-4">
        {steps.map((s, i) => {
          const current = i === currentIdx;
          return (
            <li key={s.title} className={cx("relative flex gap-3 px-5 py-4 md:border-l md:border-line md:first:border-l-0", current && "bg-chalk")}>
              <span
                className={cx(
                  "flex size-8 shrink-0 items-center justify-center rounded-sm font-mono text-[13px] font-medium",
                  s.done ? "bg-verdigris text-white" : current ? "bg-ink text-white" : "bg-verdigris-soft text-verdigris",
                )}
              >
                {s.done ? <Check size={15} strokeWidth={3} /> : String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-tight font-bold">{s.title}</div>
                <p className="mt-0.5 text-[12px] leading-snug text-sediment">{s.text}</p>
                <p className={cx("tabular mt-1.5 text-[12px] leading-snug font-bold", "alert" in s && s.alert ? "text-rust" : s.done ? "text-verdigris" : "text-silt")}>{s.status}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
