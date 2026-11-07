"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { post } from "./RebornProvider";
import { Button, cx } from "./ui";

interface Manifest {
  id: string;
  title: string;
  description?: string;
  steps: { id: string; label: string; description?: string; actions: { do: string }[] }[];
}

/**
 * Démonstration autonome : rejoue, étape par étape, des envois au format exact
 * de l'Explorer et de l'Analyste (mêmes API, mêmes validations).
 */
export function ScenarioPanel() {
  const [list, setList] = useState<Manifest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/scenarios", { cache: "no-store" })
      .then((r) => r.json())
      .then(setList)
      .catch(() => setList([]));
  }, []);

  async function run(sc: Manifest, step: Manifest["steps"][number]) {
    if (step.actions.some((a) => a.do === "reset") && !window.confirm("Cette étape remet la plateforme à zéro (investigations, observations, modèles). Continuer ?")) return;
    setBusy(`${sc.id}/${step.id}`);
    setMsg(null);
    try {
      const r = await post("/api/scenarios", { scenario: sc.id, step: step.id });
      setMsg({ ok: true, text: r.log.join(" · ") });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (!list) return <p className="text-[12.5px] text-silt">Chargement des scénarios…</p>;
  if (!list.length) return <p className="text-[12.5px] text-silt">Aucun scénario dans platform/scenarios/.</p>;

  return (
    <div className="flex flex-col gap-4">
      {list.map((sc) => (
        <div key={sc.id}>
          <div className="text-[13px] font-bold">{sc.title}</div>
          {sc.description && <p className="mt-0.5 text-[12px] leading-snug text-sediment">{sc.description}</p>}
          <div className="mt-2 flex flex-col gap-1">
            {sc.steps.map((st) => (
              <Button
                key={st.id}
                variant="ghost"
                size="sm"
                className="h-auto min-h-7 justify-start py-1.5 text-left whitespace-normal"
                disabled={!!busy}
                onClick={() => run(sc, st)}
                title={st.description}
              >
                <Play size={11} className="shrink-0" />
                {busy === `${sc.id}/${st.id}` ? "En cours…" : st.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {msg && <p className={cx("text-[12px] leading-snug", msg.ok ? "text-verdigris" : "text-rust")}>{msg.text}</p>}
    </div>
  );
}
