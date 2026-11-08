"""Reliability benchmark for the Explorer: N experiments, duration + success rate.

Ground truth below is for the TEST HARNESS ONLY (to score the agent); it is never sent to the agent.
Usage:  .venv/Scripts/python bench.py [N]
"""
import json
import os
import sys
import time
from pathlib import Path

from explorer.explorer import (AGENT_MODEL, AGENT_REASONING, AGENT_SETTLE_S, BROWSER_MODE,
                               run_experiment, run_experiments)

ROOT = Path(__file__).resolve().parent

# (inputs, expected total displayed by the legacy app with the default rules.js)
CASES = [
    ({"product": "A", "quantity": 10, "customer_type": "premium"}, 810.0),
    ({"product": "A", "quantity": 1, "customer_type": "standard"}, 125.0),
    ({"product": "B", "quantity": 2, "customer_type": "standard"}, 500.0),
    ({"product": "C", "quantity": 9, "customer_type": "distributeur"}, 331.0),
    ({"product": "B", "quantity": 10, "customer_type": "distributeur"}, 1912.5),
]


LABEL = f"browser={BROWSER_MODE} model={AGENT_MODEL or 'default'} reasoning={AGENT_REASONING or 'default'} settle_s={AGENT_SETTLE_S or 'default'}"


def main(n: int) -> None:
    workers = int(os.getenv("REBORN_WORKERS", "1"))
    batch = [CASES[i % len(CASES)] for i in range(n)]
    t0 = time.monotonic()
    if workers > 1:
        observations = run_experiments([inputs for inputs, _ in batch], workers=workers)
    else:
        observations = []
        for i, (inputs, _) in enumerate(batch):
            print(f"[{i + 1}/{n}] {inputs} ...", flush=True)
            observations.append(run_experiment(inputs))
    wall = time.monotonic() - t0
    rows = []
    for (inputs, expected), obs in zip(batch, observations):
        got = (obs.get("observed_output") or {}).get("total_price")
        correct = obs["status"] == "success" and got is not None and abs(got - expected) < 0.01
        rows.append({
            "id": obs["experiment_id"], "inputs": inputs, "expected": expected, "observed": got,
            "status": obs["status"], "correct": correct, "duration_s": obs["duration_s"],
            "attempts": obs["attempts"], "error": obs.get("error"),
            "steps": len(obs["evidence"].get("actions") or []),
        })

    ok = [r for r in rows if r["correct"]]
    durs = sorted(r["duration_s"] for r in rows)
    lines = [
        "| ID | Produit | Qté | Client | Attendu | Observé | Statut | Correct | Durée (s) | Étapes | Essais |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        i = r["inputs"]
        lines.append(f"| {r['id']} | {i['product']} | {i['quantity']} | {i['customer_type']} | {r['expected']} | "
                     f"{r['observed']} | {r['status']} | {'oui' if r['correct'] else 'NON'} | {r['duration_s']} | {r['steps']} | {r['attempts']} |")
    lines += [
        "",
        f"**Taux de réussite** : {len(ok)}/{len(rows)} ({100 * len(ok) / len(rows):.0f} %)",
        f"**Durée** : moyenne {sum(durs) / len(durs):.1f} s, médiane {durs[len(durs) // 2]:.1f} s, "
        f"min {durs[0]:.1f} s, max {durs[-1]:.1f} s",
        f"**Étapes agent** : moyenne {sum(r['steps'] for r in rows) / len(rows):.1f}",
        f"**Débit** : {n} expériences en {wall:.0f} s de temps réel ({wall / n:.1f} s/expérience, workers={workers})",
        f"**Config** : {LABEL}",
    ]
    errors = [f"- {r['id']}: {r['error']}" for r in rows if r["error"]]
    if errors:
        lines += ["", "**Erreurs**", *errors]
    report = "\n".join(lines)
    print("\n" + report)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    (ROOT / f"bench_{stamp}.md").write_text(report + "\n", encoding="utf-8")
    (ROOT / f"bench_{stamp}.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 5)
