"""REBORN Explorer (Mouss): run one experiment on the legacy app through an H Company agent.

Public entry point for Alan's engine:

    from explorer.explorer import run_experiment
    obs = run_experiment({"product": "A", "quantity": 10, "customer_type": "premium"})

`run_experiment` never raises: any problem ends up as status "failed" + an error message.
The experiment JSON goes to experiments/<id>.json, evidence (trace + screenshots) to artifacts/<id>/.
"""
from __future__ import annotations

import base64
import contextlib
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from explorer.browser import DEFAULT_PORT, ensure_chrome, fresh_tab
from explorer.context import get_context
from explorer.legacy_server import ensure_server

try:
    # Use the OS certificate store (needed when an antivirus like Avast intercepts HTTPS).
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

logging.getLogger("dotenv.main").setLevel(logging.ERROR)  # tolerate a free-form .env

ROOT = Path(__file__).resolve().parent.parent
EXPERIMENTS_DIR = ROOT / "experiments"
ARTIFACTS_DIR = ROOT / "artifacts"

load_dotenv(ROOT / ".env")


def _get_api_key() -> Optional[str]:
    """HAI_API_KEY from env/.env; fallback: any 'hk-...' token in a free-form .env line."""
    key = os.getenv("HAI_API_KEY")
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        m = re.search(r"\bhk-[A-Za-z0-9]+", env_file.read_text(encoding="utf-8", errors="ignore"))
        if m:
            return m.group(0)
    return None

APPLICATION = "Legacy ERP"
MODULE = "Devis"
DEFAULT_TIMEOUT_S = float(os.getenv("REBORN_TIMEOUT_S", "120"))  # a normal run takes ~45 s
DEFAULT_MAX_ATTEMPTS = int(os.getenv("REBORN_MAX_ATTEMPTS", "3"))
SLOT_WAIT_S = float(os.getenv("REBORN_SLOT_WAIT_S", "60"))
FORCE_ANSWER_WAIT_S = float(os.getenv("REBORN_FORCE_ANSWER_WAIT_S", "120"))
STALL_S = float(os.getenv("REBORN_STALL_S", "120"))  # 0 steps while running for this long = frozen session
PROGRESS_STALL_S = float(os.getenv("REBORN_PROGRESS_STALL_S", "180"))  # no new step for this long -> force_answer
WITH_CONTEXT = os.getenv("REBORN_CONTEXT", "1") == "1"         # Linkup enrichment (skipped without key)
CONTEXT_WAIT_S = float(os.getenv("REBORN_CONTEXT_WAIT_S", "15"))
_CTX_POOL = ThreadPoolExecutor(max_workers=2)


class QuoteObservation(BaseModel):
    """What the agent must report: only what is visible on screen, never a computed value."""

    total_price: Optional[float] = Field(
        description="Number displayed in the 'Total HT (EUR)' cell after clicking Calculer, "
        "converted to a number (e.g. '1912,50' -> 1912.5). null if no total is displayed."
    )
    displayed_total_text: Optional[str] = Field(
        description="Raw text of the 'Total HT (EUR)' cell copied character by character, "
        "keeping the original decimal separator (e.g. '1912,50' stays '1912,50', not '1912.50')."
    )
    status_message: Optional[str] = Field(
        description="Exact text of the status bar at the bottom of the window (may contain an error like ERR-102)."
    )


# ---------------------------------------------------------------- UI map (learned, never hand-written)
# Native <select> options must be given by their exact visible label. The explorer learns
# input value -> label from its own traces ("Selected 'B - Roulement 6204-2RS'.") and reuses it,
# which saves ~2 trial-and-error steps (~5 s each) per experiment.
UI_MAP_PATH = ROOT / "ui_map.json"
SELECT_FIELDS = {"product": "Article", "customer_type": "Type client"}  # input key -> field label on screen


def _load_ui_map() -> dict:
    try:
        return json.loads(UI_MAP_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _learn_ui_map(inputs: dict, trace: list) -> None:
    ui_map = _load_ui_map()
    changed = False
    for ev in trace:
        data = ev.get("data") or {}
        if data.get("kind") != "tool_result":
            continue
        req = data.get("tool_req") or {}
        m = re.match(r"Selected '(.+)'\.$", str(data.get("result") or ""))
        if req.get("tool_name") != "select_option" or not m:
            continue
        element = str((req.get("args") or {}).get("element", ""))
        for key, field in SELECT_FIELDS.items():
            if field.lower() in element.lower():
                value = str(inputs[key])
                if ui_map.setdefault(key, {}).get(value) != m.group(1):
                    ui_map[key][value] = m.group(1)
                    changed = True
    if changed:
        UI_MAP_PATH.write_text(json.dumps(ui_map, indent=2, ensure_ascii=False), encoding="utf-8")


def _option_hint(key: str, value: str, fallback: str) -> str:
    label = _load_ui_map().get(key, {}).get(str(value))
    if label:
        return f"the option labelled exactly '{label}'"
    return (f"{fallback} (option labels are case-sensitive; if select_option fails, "
            "its error lists the valid labels: pick the matching one)")


def _instruction(inputs: dict) -> str:
    # Tool hints cut the trial-and-error steps observed in traces (native <select> opened with the
    # mouse, quantity cleared with click + ctrl-a + type). Each saved step is ~3-5 s.
    product = _option_hint("product", inputs["product"], f"the option whose label starts with '{inputs['product']} '")
    customer = _option_hint("customer_type", inputs["customer_type"], f"the option matching '{inputs['customer_type']}'")
    # Reading the page source is allowed (team decision 2026-11-07): it can help the agent find
    # labels or understand the page. The OBSERVATION reported stays what the app displays.
    source_hint = ("You may read the page source if it helps (web_fetch cannot reach this local page). "
                   if BROWSER_MODE == "local" else "You may read the page source (e.g. web_fetch) if it helps. ")
    return (
        "You are testing a legacy quote form (GESCOM, module DEVIS), already open on screen. "
        + source_hint + "Do not navigate away from the form. One action per field:\n"
        f"1. 'Article' is a native dropdown: use select_option directly (do not click it open) to choose {product}.\n"
        f"2. 'Quantite': use write with overwrite=true to set it to {inputs['quantity']}.\n"
        f"3. 'Type client' is a native dropdown: use select_option directly to choose {customer}.\n"
        "4. Click the 'Calculer' button.\n"
        "5. Once the status bar no longer says 'Calcul en cours', answer with the value displayed in the "
        "'Total HT (EUR)' cell and the status bar text.\n"
        "The answer must be the result DISPLAYED by the app after clicking Calculer: do not replace it with "
        "a value you computed yourself (from the source or otherwise), and do not guess. "
        "If an error is shown, report it in status_message and set total_price to null."
    )


# Speed knobs (see hub.hcompany.ai/agents-api/optimize-for-speed). Empty = platform default.
AGENT_MODEL = os.getenv("REBORN_MODEL", "holo4-35b-a3b")            # e.g. holo4-35b-a3b (faster) / holo4-27b
AGENT_REASONING = os.getenv("REBORN_REASONING", "disabled")    # disabled | low | medium | xhigh
AGENT_SETTLE_S = os.getenv("REBORN_SETTLE_S", "0.3")      # wait after each page action (default 1.0)


# Where the agent's browser runs:
#  - "local": a Chrome on this machine (reaches localhost). Costs 2 org session slots per experiment
#    (agent session + bridge channel) -> no parallelism on the free plan.
#  - "cloud": H's hosted browser on a PUBLIC copy of the app (GitHub Pages). 1 slot per experiment,
#    no local Chrome/bridge -> up to `limit` experiments in parallel.
BROWSER_MODE = os.getenv("REBORN_BROWSER", "local")
# Where the agent loop runs: "cloud" = H platform sessions; "local" = H local runtime on this machine
# (bypasses the platform's concurrent-session cap; generic sessions only, see explorer/local_runtime.py).
RUNTIME_MODE = os.getenv("REBORN_RUNTIME", "cloud")
CLOUD_APP_URL = os.getenv("REBORN_APP_URL", "https://eliasmoussouni.github.io/reborn-legacy-erp/index.html")


def _agent_spec(start_url: str, bridge_session_id: Optional[str]) -> dict:
    if bridge_session_id:
        # An explicit session_id makes the SDK skip its own auto-bridge: we serve it with our bridge.
        env = {"id": "browser", "kind": "web", "host": "user_device", "start_url": start_url,
               "session_id": bridge_session_id}
    else:
        env = {"id": "browser", "kind": "web", "host": "cloud", "start_url": start_url}
    if AGENT_SETTLE_S:
        env["settle_s"] = float(AGENT_SETTLE_S)
    spec = {
        "name": "reborn-explorer",
        "description": "Fills legacy business forms in a browser and reports the displayed results.",
        "environments": [env],
    }
    if AGENT_MODEL:
        spec["model"] = AGENT_MODEL
    if AGENT_REASONING:
        spec["reasoning_effort"] = AGENT_REASONING
    return spec


# ---------------------------------------------------------------- helpers

_ID_LOCK = threading.Lock()
_RESERVED_IDS: set[int] = set()


def next_experiment_id() -> str:
    """Next free EXP_xxx; thread-safe so parallel workers never share an id."""
    with _ID_LOCK:
        EXPERIMENTS_DIR.mkdir(exist_ok=True)
        nums = [int(m.group(1)) for p in EXPERIMENTS_DIR.glob("EXP_*.json")
                if (m := re.match(r"EXP_(\d+)\.json$", p.name))]
        n = max(nums + list(_RESERVED_IDS) + [0]) + 1
        _RESERVED_IDS.add(n)
        return f"EXP_{n:03d}"


def _json_from_text(text: str) -> Any:
    """Parse a JSON object from an agent text answer (tolerates ```json fences and surrounding prose)."""
    text = str(text).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fence:
        return json.loads(fence.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start:end + 1])
    raise ValueError("no JSON object found in the answer")


def _jsonable(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if hasattr(obj, "dict"):
        return json.loads(json.dumps(obj.dict(), default=str))
    return obj


def _save_evidence(exp_dir: Path, events: list, api_key: str) -> tuple[list[str], list[str]]:
    """Write trace.json and screenshots; return (screenshot paths, action log)."""
    exp_dir.mkdir(parents=True, exist_ok=True)
    actions: list[str] = []
    trace = []
    jobs = []  # (image dict holder, path)
    for ev in events:
        ev = _jsonable(ev)
        data = ev.get("data") or {}
        if ev.get("type") == "AgentEvent":
            kind = data.get("kind")
            if kind == "observation_event" and isinstance(data.get("image"), dict):
                jobs.append((data, exp_dir / f"step_{len(jobs) + 1:02d}.png"))
            elif kind == "policy_event":
                for req in data.get("tool_reqs") or []:
                    actions.append(f"{req.get('tool_name')}({json.dumps(req.get('args'), ensure_ascii=False)})")
        trace.append(ev)

    def fetch(job) -> Optional[str]:
        data, path = job
        img = data["image"]
        try:
            if img.get("type") == "base64":
                path.write_bytes(base64.b64decode(img["source"]))
            else:
                r = httpx.get(img["source"], headers={"Authorization": f"Bearer {api_key}"},
                              follow_redirects=True, timeout=30)
                r.raise_for_status()
                path.write_bytes(r.content)
            data["image"] = {"saved_as": str(path.relative_to(ROOT))}  # keep trace small
            return data["image"]["saved_as"]
        except Exception as exc:  # evidence is best effort, never fatal
            data["image"] = {"download_error": str(exc)}
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:  # parallel downloads: ~5 s saved per run
        screenshots = [p for p in pool.map(fetch, jobs) if p]
    (exp_dir / "trace.json").write_text(json.dumps(trace, indent=2, ensure_ascii=False), encoding="utf-8")
    return screenshots, actions


def _download_shared_files(client, exp_dir: Path, events: list) -> list[str]:
    """Save the files the agent shared (AttachmentEvent, origin=agent) into exp_dir/files/. Never raises."""
    saved = []
    for ev in events:
        ev = _jsonable(ev)
        data = ev.get("data") or {}
        if ev.get("type") != "AttachmentEvent" or data.get("origin") != "agent":
            continue
        name = Path(str(data.get("name") or data.get("path") or "file")).name
        target = exp_dir / "files" / name
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            if data.get("file_id"):
                with open(target, "wb") as fh:
                    for chunk in client.session_files.download_file(data["file_id"]):
                        fh.write(chunk)
            elif data.get("url"):
                r = httpx.get(data["url"], follow_redirects=True, timeout=60)
                r.raise_for_status()
                target.write_bytes(r.content)
            else:
                continue
            saved.append(str(target.relative_to(ROOT)))
        except Exception:
            pass
    return saved


_V1_TRAJ = "https://agp.eu.hcompany.ai/api/v1/trajectories/"


def _delete_channel(api_key: str, channel_id: str) -> None:
    """Delete the bridge's command channel on the platform (its id is the bridge session id).

    The SDK never closes it itself; left 'pending' (e.g. after an interrupted run) it keeps holding
    one of the org's concurrent-session slots. Targeting the exact id is safe with parallel workers.
    """
    try:
        r = httpx.get(_V1_TRAJ + channel_id, headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
        if r.status_code == 200 and r.json().get("status") == "pending":
            httpx.delete(_V1_TRAJ + channel_id, headers={"Authorization": f"Bearer {api_key}"}, timeout=20)
    except Exception:
        pass  # best effort, never fatal


def _one_attempt(inputs: dict, app_url: str, exp_dir: Path, timeout_s: float, api_key: str,
                 port: int = DEFAULT_PORT) -> dict:
    """One session on the Chrome listening on `port`, served by a bridge owned by this attempt."""
    if BROWSER_MODE == "cloud":  # fresh hosted browser per session: no Chrome, no bridge, no cleanup
        return _run_session(inputs, app_url, exp_dir, timeout_s, api_key, None)

    from hai_agents_local.browser import SeleniumBrowserBridge
    from hai_agents_local.manager import BridgeManager

    ensure_chrome(port)
    try:
        fresh_tab(app_url, port)
        time.sleep(0.5)  # let the page load before the agent's first observation
    except Exception:
        pass  # best effort; the unique start URL still applies

    # Own bridge + own manager per attempt: the SDK's global manager serves one browser per process,
    # so this is what lets several workers run in parallel, each on its own Chrome/port.
    bridge = SeleniumBrowserBridge("browser", debugging_port=port, api_key=api_key)
    manager = BridgeManager()
    try:
        manager.ensure([bridge])
        return _run_session(inputs, app_url, exp_dir, timeout_s, api_key, bridge.session_id)
    finally:
        try:
            manager.stop_all()
        except Exception:
            pass
        _delete_channel(api_key, bridge.session_id)


def _agent_session(app_url: str, instruction: str, schema: type[BaseModel], exp_dir: Path, timeout_s: float,
                   api_key: str, bridge_session_id: Optional[str], agent_overrides: Optional[dict] = None) -> dict:
    """Generic H session: run `instruction` on `app_url`, answer validated against `schema`.

    Returns {"session_id", "timings", "agent_view_url", "screenshots", "actions", "session_status",
    "answer" (schema instance or raw), "error"?}. Never raises for agent-side problems.
    REBORN_RUNTIME=local runs it on H's local runtime (own Chrome + bridge per worker slot).
    """
    if RUNTIME_MODE == "local" and bridge_session_id is None:
        return _local_runtime_session(app_url, instruction, schema, exp_dir, timeout_s, api_key, agent_overrides)

    from hai_agents import Client  # imported here so a missing SDK becomes a "failed" result

    client = Client(api_key=api_key, max_retries=3, timeout=60)
    return _session_on_client(client, app_url, instruction, schema, exp_dir, timeout_s, api_key,
                              bridge_session_id, agent_overrides)


def _local_runtime_session(app_url, instruction, schema, exp_dir, timeout_s, api_key, agent_overrides) -> dict:
    from hai_agents_local.browser import SeleniumBrowserBridge
    from hai_agents_local.manager import BridgeManager

    from explorer.local_runtime import LOCAL_MODEL, local_slot

    with local_slot(api_key) as (client, chrome_port):
        ensure_chrome(chrome_port)
        try:
            fresh_tab(app_url, chrome_port)
            time.sleep(0.5)
        except Exception:
            pass
        rt = client.local_runtime
        bridge = SeleniumBrowserBridge("browser", debugging_port=chrome_port, api_key=rt.api_key, base_url=rt.base_url)
        bridge.verify_runtime = True
        manager = BridgeManager()
        try:
            manager.ensure([bridge])
            overrides = {**(agent_overrides or {}), "model": LOCAL_MODEL}
            out = _session_on_client(client, app_url, instruction, schema, exp_dir, timeout_s, rt.api_key,
                                     bridge.session_id, overrides, local=True)
            out["runtime"] = {"mode": "local", "model": LOCAL_MODEL, "chrome_port": chrome_port}
            return out
        finally:
            with contextlib.suppress(Exception):
                manager.stop_all()


def _session_on_client(client, app_url: str, instruction: str, schema: type[BaseModel], exp_dir: Path,
                       timeout_s: float, api_key: str, bridge_session_id: Optional[str],
                       agent_overrides: Optional[dict] = None, local: bool = False) -> dict:

    # Local mode only: fail fast when the org has no free slot (the bridge channel needs one and gets
    # rate-limited otherwise). Cloud mode: let H queue the session; H also ends our own sessions idle
    # >= 120 s to make room, which a client-side pre-check would prevent.
    deadline = time.monotonic() + SLOT_WAIT_S
    while bridge_session_id and not local:
        q = client.sessions.get_session_quota()
        if (q.available or 0) > 0:
            break
        if time.monotonic() > deadline:
            return {"error": f"no free H session slot ({q.active}/{q.limit} active in {q.scope}) "
                             f"after waiting {SLOT_WAIT_S:.0f}s"}
        time.sleep(5)

    spec = _agent_spec(app_url, bridge_session_id)
    overrides = dict(agent_overrides or {})
    vault_id = overrides.pop("vault_id", None)  # credentials vault for the cloud browser (see explorer/vault.py)
    # free_answer: no structured answer (the workstation agent loops on the answer tool; its real output
    # is a shared file). The answer is then kept as raw text and never fails validation.
    free_answer = bool(overrides.pop("free_answer", False))
    spec.update(overrides)
    if vault_id and not local:
        for env in spec.get("environments") or []:
            if isinstance(env, dict) and env.get("kind") == "web" and env.get("host", "cloud") == "cloud":
                env["vault_id"] = vault_id
    t0 = time.monotonic()
    if local:
        # H local runtime 0.1.23 cannot do structured answers (missing datamodel_code_generator): send the
        # JSON Schema in the instruction instead and parse/validate the text answer ourselves.
        instruction = (instruction + "\n\nFINAL ANSWER FORMAT: reply with ONLY one JSON object (no prose, no "
                       "markdown fence) that validates against this JSON Schema:\n"
                       + json.dumps(schema.model_json_schema(), ensure_ascii=False))
        handle = client.start_session(agent=spec, messages=instruction)
    elif free_answer:
        handle = client.start_session(agent=spec, messages=instruction)
    else:
        handle = client.start_session(agent=spec, messages=instruction, answer_schema=schema)
    out: dict = {"session_id": handle.id, "timings": {}}
    out["timings"]["start_session_s"] = round(time.monotonic() - t0, 1)

    # Supervisor (replaces a blind wait): polls the session and handles every failure mode seen so far.
    #  - frozen at start: 0 steps for STALL_S while running (platform freeze, deaf to cancel) -> give up
    #    this session and flag `stalled` so the caller retries with a fresh one;
    #  - frozen mid-run: no new step for PROGRESS_STALL_S -> force_answer (partial result);
    #  - overall timeout -> force_answer; still nothing FORCE_ANSWER_WAIT_S later -> cancel, `stalled`.
    settled = ("completed", "failed", "timed_out", "interrupted", "idle", "awaiting_tool_results")
    deadline = t0 + timeout_s
    last_steps, last_progress, running_since = -1, time.monotonic(), None
    forced_at, status_errors, give_up = None, 0, None
    while True:
        now = time.monotonic()
        try:
            st = client.sessions.get_session_status(handle.id)
            status_errors = 0
        except Exception:
            status_errors += 1
            if status_errors > 12:  # ~1 min of API errors in a row
                give_up = "status API unreachable for ~1 min"
                break
            time.sleep(5)
            continue
        status = getattr(st.status, "value", None) or str(st.status)
        steps = st.steps or 0
        if status in settled:
            break
        if status == "running" and running_since is None:
            running_since = now
        if steps != last_steps:
            last_steps, last_progress = steps, now
        if steps == 0 and running_since and STALL_S > 0 and now - running_since > STALL_S:
            give_up = f"frozen: 0 steps after {STALL_S:.0f}s running"
            break
        if forced_at is None and (now > deadline or (steps > 0 and now - last_progress > PROGRESS_STALL_S)):
            with contextlib.suppress(Exception):
                handle.force_answer()
            forced_at = now
            out["forced_answer"] = True
        if forced_at is not None and now - forced_at > FORCE_ANSWER_WAIT_S:
            give_up = f"no answer {FORCE_ANSWER_WAIT_S:.0f}s after force_answer (steps={steps})"
            break
        time.sleep(5)

    if give_up:
        for _ in range(3):
            with contextlib.suppress(Exception):
                handle.cancel()
                time.sleep(2)
                stx = client.sessions.get_session_status(handle.id).status
                if (getattr(stx, "value", None) or str(stx)) in settled:
                    break
        out.update(error=f"session abandoned: {give_up}", stalled=True)
        with contextlib.suppress(Exception):  # keep the evidence of what the agent did
            events = client.sessions.list_session_events(handle.id, size=200).items
            out["screenshots"], out["actions"] = _save_evidence(exp_dir, events, api_key)
        return out

    # Settled: fetch final answer + events (answer_schema=None: we validate ourselves below, so a format
    # slip never loses the raw answer and the evidence).
    try:
        res = handle.wait_for_completion(timeout_seconds=90, answer_schema=None)
    except Exception as exc:
        out.update(error=f"could not read the settled session: {type(exc).__name__}: {exc}"[:300], stalled=True)
        return out
    out["timings"].setdefault("agent_s", round(time.monotonic() - t0 - out["timings"]["start_session_s"], 1))
    out["agent_view_url"] = None if local else f"https://platform.hcompany.ai/agents/sessions/{handle.id}"

    t1 = time.monotonic()
    shots, actions = _save_evidence(exp_dir, res.events or [], api_key)
    out["files"] = _download_shared_files(client, exp_dir, res.events or [])
    out["timings"]["evidence_s"] = round(time.monotonic() - t1, 1)
    out.update(screenshots=shots, actions=actions, outcome=res.outcome)

    status = getattr(res.status, "value", None) or str(res.status)
    if status == "idle":
        # Inline agents stay 'idle' after answering (waiting for a follow-up): close it to free the slot.
        try:
            handle.cancel()
        except Exception:
            pass
    out["session_status"] = status

    ans = res.answer
    validation_error = None
    if free_answer:
        out["answer"] = ans
        if status not in ("completed", "idle"):
            out["error"] = f"session {res.status}: {res.error_code or ''} {res.error or ''}".strip()
        return out
    if ans is not None and not isinstance(ans, schema):
        try:
            ans = schema.model_validate(ans if isinstance(ans, dict) else _json_from_text(ans))
        except Exception as exc:
            validation_error = str(exc)[:500]
    out["answer"] = ans
    if status not in ("completed", "idle"):
        out["error"] = f"session {res.status}: {res.error_code or ''} {res.error or ''}".strip()
    elif not isinstance(ans, schema):
        out["error"] = "agent answer missing or not matching the schema" + (
            f": {validation_error}" if validation_error else "")
    return out


def _run_session(inputs: dict, app_url: str, exp_dir: Path, timeout_s: float, api_key: str,
                 bridge_session_id: Optional[str]) -> dict:
    """Quote experiment = generic session + quote-specific interpretation."""
    out = _agent_session(app_url, _instruction(inputs), QuoteObservation, exp_dir, timeout_s, api_key,
                         bridge_session_id)
    ans = out.pop("answer", None)
    if isinstance(ans, QuoteObservation):
        out["observed_output"] = ans.model_dump()
        if not out.get("error") and ans.total_price is None:
            # The app showed no total: this is a valid observation (e.g. ERR-102), not an agent failure.
            out["app_error"] = ans.status_message
    elif ans is not None:
        out["observed_output"] = {"raw_answer": _jsonable(ans)}
    if not out.get("error"):
        try:
            trace = json.loads((exp_dir / "trace.json").read_text(encoding="utf-8"))
            _learn_ui_map(inputs, trace)
        except Exception:
            pass
    return out


# ---------------------------------------------------------------- public API

def run_experiment(
    inputs: dict,
    experiment_id: Optional[str] = None,
    *,
    app_url: Optional[str] = None,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    port: int = DEFAULT_PORT,
) -> dict:
    """Run one experiment on the legacy app and return the Mouss -> Alan observation JSON.

    `port` selects the dedicated Chrome (one per parallel worker); see run_experiments().
    """
    experiment_id = experiment_id or next_experiment_id()
    exp_dir = ARTIFACTS_DIR / experiment_id
    started = time.monotonic()
    result: dict = {
        "experiment_id": experiment_id,
        "application": APPLICATION,
        "module": MODULE,
        "inputs": inputs,
        "observed_output": None,
        "status": "failed",
        # optional / extensible fields
        "error": None,
        "duration_s": None,
        "attempts": 0,
        "session_id": None,
        "agent_view_url": None,
        "evidence": {"trace_path": None, "screenshots": [], "final_screenshot": None, "actions": []},
        "agent_config": {"browser": BROWSER_MODE, "model": AGENT_MODEL or "default", "reasoning_effort": AGENT_REASONING or "default",
                         "settle_s": AGENT_SETTLE_S or "default"},
        "external_context": None,  # Linkup web context (optional, never validates a rule)
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    # Optional Linkup context, fetched in the background while the agent works (no added latency).
    ctx_future = _CTX_POOL.submit(get_context, MODULE) if WITH_CONTEXT else None

    api_key = _get_api_key()
    missing = [k for k in ("product", "quantity", "customer_type") if k not in inputs]
    if not api_key:
        result["error"] = "HAI_API_KEY missing (put it in .env)"
    elif missing:
        result["error"] = f"missing inputs: {missing}"
    else:
        app_url = app_url or (CLOUD_APP_URL if BROWSER_MODE == "cloud" else ensure_server())
        errors = []
        for attempt in range(1, max_attempts + 1):
            result["attempts"] = attempt
            # Unique URL per attempt => fresh document, no form values restored from a previous run.
            sep = "&" if "?" in app_url else "?"
            fresh_url = f"{app_url}{sep}exp={experiment_id}-{attempt}"
            try:
                out = _one_attempt(inputs, fresh_url, exp_dir, timeout_s, api_key, port)
            except Exception as exc:
                out = {"error": f"{type(exc).__name__}: {exc}"}
            for k in ("session_id", "agent_view_url", "observed_output", "timings"):
                if out.get(k) is not None:
                    result[k] = out[k]
            if out.get("screenshots") is not None:
                result["evidence"].update(
                    trace_path=str((exp_dir / "trace.json").relative_to(ROOT)),
                    screenshots=out["screenshots"],
                    final_screenshot=out["screenshots"][-1] if out["screenshots"] else None,
                    actions=out.get("actions", []),
                )
            if not out.get("error"):
                result["status"] = "success"
                result["error"] = None
                if errors:
                    result["attempt_errors"] = errors  # keep failed attempts visible
                if out.get("app_error"):
                    result["app_error"] = out["app_error"]
                break
            errors.append(f"attempt {attempt}: {out['error']}")
            result["error"] = " | ".join(errors)

    if ctx_future is not None:
        try:
            result["external_context"] = ctx_future.result(timeout=CONTEXT_WAIT_S)
        except Exception as exc:
            result["external_context"] = {"provider": "linkup", "status": "error",
                                          "error": f"not ready after {CONTEXT_WAIT_S:.0f}s: {exc}"[:200]}
    result["duration_s"] = round(time.monotonic() - started, 1)
    EXPERIMENTS_DIR.mkdir(exist_ok=True)
    (EXPERIMENTS_DIR / f"{experiment_id}.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return result


def run_ui_experiment(
    app_url: str,
    instruction: str,
    schema: type[BaseModel],
    inputs: dict,
    *,
    application: str,
    module: str,
    experiment_id: Optional[str] = None,
    timeout_s: float = 300,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    agent_overrides: Optional[dict] = None,
) -> dict:
    """Generic experiment on ANY public web app (cloud browser): same contract as run_experiment.

    `instruction` tells the agent what to do with `inputs`; `schema` is what it must observe and report.
    """
    experiment_id = experiment_id or next_experiment_id()
    exp_dir = ARTIFACTS_DIR / experiment_id
    started = time.monotonic()
    result: dict = {
        "experiment_id": experiment_id, "application": application, "module": module, "inputs": inputs,
        "observed_output": None, "status": "failed", "error": None, "duration_s": None, "attempts": 0,
        "session_id": None, "agent_view_url": None,
        "evidence": {"trace_path": None, "screenshots": [], "final_screenshot": None, "actions": []},
        "agent_config": {"browser": "cloud", **(agent_overrides or {})},
        "external_context": None,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    api_key = _get_api_key()
    errors = []
    for attempt in range(1, max_attempts + 1 if api_key else 1):
        result["attempts"] = attempt
        try:
            out = _agent_session(app_url, instruction, schema, exp_dir, timeout_s, api_key, None,
                                 agent_overrides=agent_overrides)
        except Exception as exc:
            out = {"error": f"{type(exc).__name__}: {exc}"}
        ans = out.get("answer")
        if ans is not None:
            result["observed_output"] = ans.model_dump() if isinstance(ans, BaseModel) else {"raw_answer": _jsonable(ans)}
        for k in ("session_id", "agent_view_url", "timings"):
            if out.get(k) is not None:
                result[k] = out[k]
        if out.get("screenshots") is not None:
            result["evidence"].update(
                trace_path=str((exp_dir / "trace.json").relative_to(ROOT)), screenshots=out["screenshots"],
                final_screenshot=out["screenshots"][-1] if out["screenshots"] else None,
                actions=out.get("actions", []))
        if not out.get("error"):
            result["status"], result["error"] = "success", None
            if errors:
                result["attempt_errors"] = errors
            break
        errors.append(f"attempt {attempt}: {out['error']}")
        result["error"] = " | ".join(errors)
    if not api_key:
        result["error"] = "HAI_API_KEY missing"
    result["duration_s"] = round(time.monotonic() - started, 1)
    EXPERIMENTS_DIR.mkdir(exist_ok=True)
    (EXPERIMENTS_DIR / f"{experiment_id}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False),
                                                           encoding="utf-8")
    return result


def run_experiments(inputs_list: list[dict], workers: int = 3, **kwargs: Any) -> list[dict]:
    """Run several experiments in parallel (one Chrome + one H session per worker).

    Results come back in the same order as `inputs_list`. Each local-browser experiment holds TWO
    of the org's concurrent-session slots (the agent session + the bridge's command channel), so
    `workers` is capped at limit // 2: 1 on the free plan (3 slots), 5 on Builder (10 slots).
    Beyond that, the extra channels get rate-limited and attempts fail.
    """
    import queue

    try:
        from hai_agents import Client

        limit = Client(api_key=_get_api_key()).sessions.get_session_quota().limit or 3
        per_experiment = 1 if BROWSER_MODE == "cloud" else 2
        workers = max(1, min(workers, limit // per_experiment))
    except Exception:
        workers = 1

    ports: "queue.Queue[int]" = queue.Queue()
    for i in range(max(1, workers)):
        ports.put(DEFAULT_PORT + i)

    def job(inputs: dict) -> dict:
        port = ports.get()
        try:
            return run_experiment(inputs, port=port, **kwargs)
        finally:
            ports.put(port)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(job, inputs_list))


if __name__ == "__main__":
    import sys

    args = sys.argv[1:] or ["A", "10", "premium"]
    obs = run_experiment({"product": args[0], "quantity": int(args[1]), "customer_type": args[2]})
    print(json.dumps(obs, indent=2, ensure_ascii=False))
