# REBORN — Explorer (Mouss)

> **h-explorer_v2** — Explorer v2 (code inspector on H workstation, vault login, Linkup legal frame, session supervisor). v1 is kept untouched in `h-explorer/`. Run commands from this folder; read `HANDOFF.md` first.

Runs experiments on the legacy app through an H Company agent and returns structured observations
(contract Mouss → Alan). The agent may read the page source if it helps, but the reported observation is
always what the app displays after the action; a rule is only validated by experiments.

## Setup

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

`.env` must contain the H API key (`hk-...`). For `--publish` (cloud Blind Challenge), a GitHub token (`ghp_...`).

## Use (Alan)

```python
from explorer.explorer import run_experiment, run_experiments

obs = run_experiment({"product": "A", "quantity": 10, "customer_type": "premium"})
# -> {"experiment_id": "EXP_001", "inputs": {...}, "observed_output": {"total_price": 810.0, ...},
#     "status": "success" | "failed", "error": ..., "evidence": {...}, "agent_view_url": ...}

batch = run_experiments([{...}, {...}, {...}], workers=3)  # parallel, same order as input
```

- Never raises: problems give `"status": "failed"` + `error`.
- An error displayed by the app (e.g. ERR-102) is a valid observation: `status: success`,
  `total_price: null`, message in `app_error` / `observed_output.status_message`.
- JSON in `experiments/EXP_xxx.json`, evidence (trace + screenshots) in `artifacts/EXP_xxx/`.
- `agent_view_url`: live view / replay of the session on the H platform (good for the demo).

## Modes (env vars)

| Variable | Default | Meaning |
|---|---|---|
| `REBORN_BROWSER` | `local` | `local` = Chrome on this machine on `localhost:8765`; `cloud` = H hosted browser on the GitHub Pages copy |
| `REBORN_APP_URL` | Pages URL | app URL used in cloud mode |
| `REBORN_MODEL` | `holo4-35b-a3b` | H model (`holo4-27b` = slower, stronger) |
| `REBORN_REASONING` | `disabled` | `disabled` / `low` / `medium` / `xhigh` |
| `REBORN_SETTLE_S` | `0.3` | wait after each page action |
| `REBORN_TIMEOUT_S` / `REBORN_MAX_ATTEMPTS` | `120` / `2` | per attempt timeout, retries |
| `REBORN_HEADLESS` | `1` | local mode: `0` shows the Chrome window (do not minimize it) |

**Parallelism** — free plan = 3 concurrent sessions. Local mode uses 2 per experiment (session + bridge
channel) → 1 at a time. Cloud mode uses 1 → 3 in parallel. `run_experiments` caps workers automatically.

Measured (see `bench_*.md`): local 32.6 s/experiment; cloud, 3 workers: 7.8 s/experiment, 9/9 correct.

## Linkup (optional web context)

`explorer/context.py` adds `external_context` to each observation: a sourced answer from Linkup on the
module's business practices (discounts, shipping, VAT, rounding). Depth `standard`, `sourcedAnswer`
($0.006/call), one query per module cached in `context_cache.json`, fetched in the background while the
agent works (no added latency).

- Active only if `LINKUP_API_KEY=...` is in `.env` (else `status: "skipped"`); errors give `status: "error"`.
- **Never a proof**: it can inspire hypotheses for Alan, only an experiment in the app validates a rule.
- `REBORN_CONTEXT=0` disables it. New module → add its question to `MODULE_QUERIES`.

## Reverse-engineering report (+ legal frame)

```bash
PYTHONIOENCODING=utf-8 .venv/Scripts/python -m explorer.reporter https://app.example/   # full report
.venv/Scripts/python -m explorer.reporter --legal reports/<dir>     # add/refresh the Linkup legal frame
.venv/Scripts/python -m explorer.reporter --repair reports/<dir>    # re-run only failed features
```

`REPORT.md` starts with **§0 Cadre légal et normes** (Linkup deep research per legal domain: references,
obligations, impact on the ERP, sources, compliance checklist — not legal advice), then the H agents'
findings per feature.

## Authenticated report (you sign in, the agent never sees the password)

```bash
.venv/Scripts/python login_report.py https://app.example/ user@example.com   # password typed (hidden)
.venv/Scripts/python login_report.py https://app.example/ --env              # REBORN_LOGIN_USERNAME / _PASSWORD in .env
```
Credentials go to the H vault `reborn-logins`; the map and the dives sign in with `fill_secret_at`, explore read-only,
log out. See HANDOFF §5.5 and §6.

## Blind Challenge

```bash
.venv/Scripts/python set_rule.py QTY_DISCOUNT_PCT 15 --publish   # --publish only for cloud mode
.venv/Scripts/python blind_challenge.py                          # observations vs current model -> DRIFT
.venv/Scripts/python set_rule.py QTY_DISCOUNT_PCT 10 --publish   # restore
```

## Files

- `legacy_app/` — the fake legacy ERP (`rules.js` = hidden rules, changed by `set_rule.py`)
- `explorer/explorer.py` — `run_experiment`, `run_experiments`
- `explorer/browser.py` — dedicated Chrome instances (local mode)
- `explorer/legacy_server.py` — serves `legacy_app/` on `localhost:8765`
- `ui_map.json` — option labels learned from traces (speeds up dropdowns)
- `bench.py`, `blind_challenge.py`, `set_rule.py`
