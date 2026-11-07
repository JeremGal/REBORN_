"""Runs Elias's H Company explorer (h-explorer/) on a web application for ReBorn, without editing his files.

  <venv>/python -I tools/h_run.py <plan.json> [--workers 3]

The H Company key is read from HAI_API_KEY or, failing that, from the first "hk-..." value of the secrets file
(REBORN_SECRETS_FILE). The application login, when needed, comes from REBORN_AGENT_SECRETS (a KEY=VALUE file with
FRAPPE_AGENT_USER / FRAPPE_AGENT_PASSWORD) and the site address from FRAPPE_URL in the secrets file. Nothing is printed
or written except the experiment files the explorer itself writes (h-explorer/experiments, gitignored).
Then: node tools/reborn.mjs import-run <target> h-explorer/experiments --mission <M-xxx> --root h-explorer
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List, Optional

REPO = Path(__file__).resolve().parents[1]


def kv_file(path):
    out = {}
    if path and Path(path).exists():
        for line in Path(path).read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
            if m:
                out[m.group(1)] = m.group(2).strip().strip("'\"")
    return out


def main():
    plan_path = Path(sys.argv[1])
    workers = int(sys.argv[sys.argv.index("--workers") + 1]) if "--workers" in sys.argv else 3
    plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))  # tolerate a byte-order mark (PowerShell writes one)
    secrets_file = os.environ.get("REBORN_SECRETS_FILE")
    secrets = kv_file(secrets_file)
    if not os.environ.get("HAI_API_KEY") and secrets_file and Path(secrets_file).exists():
        m = re.search(r"\bhk-[A-Za-z0-9_\-]+", Path(secrets_file).read_text(encoding="utf-8", errors="ignore"))
        if m:
            os.environ["HAI_API_KEY"] = m.group(0)
    if not os.environ.get("HAI_API_KEY"):
        sys.exit("no H Company key: set HAI_API_KEY or REBORN_SECRETS_FILE")
    agent = kv_file(os.environ.get("REBORN_AGENT_SECRETS"))
    base = (secrets.get("FRAPPE_URL") or plan.get("url", "")).rstrip("/")
    if not base:
        sys.exit("no application address (FRAPPE_URL in the secrets file, or url in the plan)")
    os.environ.setdefault("REBORN_BROWSER", "cloud")
    os.environ.setdefault("REBORN_CONTEXT", "0")  # no web search: only the application itself is evidence
    sys.path.insert(0, str(REPO / "h-explorer"))
    from pydantic import BaseModel
    from explorer.explorer import run_ui_experiment

    class FormObservation(BaseModel):
        page_title: str
        section_labels: List[str] = []
        field_labels: List[str] = []
        buttons: List[str] = []
        notes: Optional[str] = None

    class NewFormReading(BaseModel):
        page_title: str
        field_labels: List[str] = []
        section_labels: List[str] = []
        prefilled: List[str] = []   # "Label: value", one entry per field that already shows a value
        notes: Optional[str] = None

    class InvoiceTotals(BaseModel):
        document_name: Optional[str] = None
        net_total: Optional[str] = None
        total_taxes_and_charges: Optional[str] = None
        grand_total: Optional[str] = None
        rounded_total: Optional[str] = None
        line_amounts: List[str] = []
        notes: Optional[str] = None

    login = ""
    if agent.get("FRAPPE_AGENT_USER"):
        login = (f"If a login page appears, sign in with the email {agent['FRAPPE_AGENT_USER']} and the password "
                 f"{agent['FRAPPE_AGENT_PASSWORD']}. ")
    rule = "Do not save, submit, delete or change anything. Do not open other websites. "

    def one(x):
        url = base + x["path"]
        if x["kind"] == "interact":
            instruction = (f"Open {base}/login. {login}Then go to {url}. {rule}Never click Save or Submit. "
                           f"{x['do']} Then scroll down to the end of the form and report the labels of the fields visible on "
                           "the form (up to 120, exactly as written), the section labels, and in 'prefilled' every field that "
                           "shows a value, written as 'Label: value' exactly as displayed (a ticked checkbox is 'Label: checked').")
            schema = NewFormReading
        elif x["kind"] == "defaults":
            instruction = (f"Open {base}/login. {login}Then go to {url}. {rule}"
                           "Report the page title, the labels of the sections, the labels of the fields visible on the form "
                           "(scroll down to the end; up to 80 labels, exactly as written), and in 'prefilled' every field that "
                           "already shows a value, written as 'Label: value' exactly as displayed (a ticked checkbox is "
                           "'Label: checked').")
            schema = NewFormReading
        elif x["kind"] == "form":
            instruction = (f"Open {base}/login. {login}Then go to {url}. {rule}"
                           "Report the page title, the labels of the sections, the labels of the fields visible on the form "
                           "(scroll down to the end; up to 80 labels, exactly as written), and the buttons shown.")
            schema = FormObservation
        else:
            instruction = (f"Open {base}/login. {login}Then go to {url}. {rule}"
                           "The form is long: scroll down step by step to the very bottom, past the item lines and past the "
                           "taxes table, until you see the grand total and the rounded total (in French: 'Total TTC' or "
                           "'Total général', 'Total arrondi'). The 'Total' just under the item lines is NOT the grand total. "
                           "Read exactly as displayed: the total under the item lines, each row of the taxes table (rate and "
                           "amount), the total taxes and charges, the grand total and the rounded total. Report them as text.")
            schema = InvoiceTotals
        res = run_ui_experiment(url, instruction, schema, {"doctype": x["doctype"], "path": x["path"], "kind": x["kind"], "mission": plan.get("mission"), **({"action": x["action"]} if x.get("action") else {})},
                                application=plan.get("application", "web application"), module=x.get("module", x["doctype"]),
                                timeout_s=x.get("timeout_s", 420))
        out = res.get("observed_output") or {}
        print(f"  {res['experiment_id']}  {res['status']:<7} {res.get('duration_s')} s  {x['doctype']}: "
              f"{len(out.get('field_labels', []) or [])} field label(s), {len(out.get('prefilled', []) or [])} prefilled"
              f"{(' | totals ' + str(out.get('grand_total'))) if x['kind'] == 'totals' else ''}"
              f"{('  ERROR ' + str(res.get('error'))[:120]) if res['status'] != 'success' else ''}", flush=True)
        return res

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(one, plan["experiments"]))
    ok = sum(1 for r in results if r["status"] == "success")
    print(f"OK  h_run  {ok}/{len(results)} experiment(s) succeeded. Next: node tools/reborn.mjs import-run <target> "
          f"h-explorer/experiments --mission {plan.get('mission', 'M-xxx')} --root h-explorer")


if __name__ == "__main__":
    main()
