"""Blind Challenge rehearsal (Mouss side): detect that a hidden rule changed.

1. Someone edits legacy_app/rules.js (e.g. QTY_DISCOUNT_PCT 10 -> 15) without telling the system.
2. We re-run experiments and compare each observation with the CURRENT model's prediction.
3. Any mismatch = DRIFT -> Alan's engine must re-investigate (more targeted experiments).

The "current model" below stands in for Alan's rules (the ones discovered before the change).
Usage:  .venv/Scripts/python blind_challenge.py
"""
import json
import time
from pathlib import Path

from explorer.explorer import BROWSER_MODE, run_experiments

ROOT = Path(__file__).resolve().parent


def current_model(inputs: dict) -> float:
    """Rules as known BEFORE the change (stand-in for Alan's model)."""
    price = {"A": 100, "B": 250, "C": 40}[inputs["product"]] * inputs["quantity"]
    if inputs["quantity"] >= 10:
        price *= 0.90
    price *= 1 - {"standard": 0, "premium": 0.10, "distributeur": 0.15}[inputs["customer_type"]]
    price = round(price, 2)
    return price + 25 if price < 500 else price


CASES = [
    {"product": "A", "quantity": 10, "customer_type": "premium"},       # discount threshold: should move
    {"product": "C", "quantity": 10, "customer_type": "standard"},      # discount + shipping fee
    {"product": "B", "quantity": 10, "customer_type": "distributeur"},  # discount + customer discount
    {"product": "A", "quantity": 9, "customer_type": "premium"},        # below threshold: should NOT move
    {"product": "B", "quantity": 2, "customer_type": "standard"},       # control case
    {"product": "A", "quantity": 0, "customer_type": "standard"},       # invalid input: expect ERR-102
]


def main() -> None:
    rows = []
    t0 = time.monotonic()
    observations = run_experiments(CASES, workers=3)  # parallel in cloud mode, sequential in local
    wall = time.monotonic() - t0
    for inputs, obs in zip(CASES, observations):
        out = obs.get("observed_output") or {}
        observed = out.get("total_price")
        predicted = current_model(inputs) if inputs["quantity"] > 0 else None
        if obs["status"] != "success":
            verdict = "ECHEC EXPLORER"
        elif observed is None:
            verdict = f"ERREUR APP ({out.get('status_message')})"
        elif predicted is not None and abs(observed - predicted) > 0.01:
            verdict = "DRIFT"
        else:
            verdict = "conforme"
        rows.append((obs["experiment_id"], inputs, predicted, observed, verdict, obs["duration_s"]))
        print(f"   -> observed={observed} model={predicted} {verdict} ({obs['duration_s']}s)", flush=True)

    lines = ["| ID | Produit | Qté | Client | Modèle actuel | Observé | Verdict | Durée (s) |",
             "|---|---|---|---|---|---|---|---|"]
    for eid, i, pred, obsv, verdict, dur in rows:
        lines.append(f"| {eid} | {i['product']} | {i['quantity']} | {i['customer_type']} | {pred} | {obsv} | "
                     f"{'**' + verdict + '**' if verdict == 'DRIFT' else verdict} | {dur} |")
    drift = [r for r in rows if r[4] == "DRIFT"]
    lines += ["", f"**Écarts détectés** : {len(drift)}/{len(rows)} expériences -> "
              + ("le modèle doit être réinvestigué." if drift else "modèle toujours valide."),
              f"**Temps réel** : {wall:.0f} s pour {len(rows)} expériences (navigateur {BROWSER_MODE})"]
    report = "\n".join(lines)
    print("\n" + report)
    (ROOT / f"blind_challenge_{time.strftime('%Y%m%d_%H%M%S')}.md").write_text(report + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
