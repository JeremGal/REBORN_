"""Autonomous exploration (step 0 of REBORN on an unknown app): let the H agent map the app.

    from explorer.mapper import explore_app
    app_map = explore_app("https://example.com/")

Output (explorations/EXPL_xxx.json): pages, interactive elements (fields + options), visible outputs,
workflows, and candidate experiments for Alan. Evidence in artifacts/EXPL_xxx/ like experiments.
Safety: read-only exploration - the agent never submits forms, sends messages, logs in or leaves the site.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, Field

# Agents often answer null instead of [] for empty lists: accept both.
StrList = Annotated[list[str], BeforeValidator(lambda v: v or [])]

from explorer.explorer import (ARTIFACTS_DIR, BROWSER_MODE, ROOT, _agent_session, _get_api_key, _jsonable)

EXPLORATIONS_DIR = ROOT / "explorations"
# Exploration is open-ended: stronger model + thinking + normal settle (speed matters less than coverage).
EXPLORE_OVERRIDES = {
    "model": os.getenv("REBORN_EXPLORE_MODEL", "holo4-35b-a3b"),
    "reasoning_effort": os.getenv("REBORN_EXPLORE_REASONING", "disabled"),
}


class UIElement(BaseModel):
    kind: str = Field(description="button | link | text_input | number_input | select | checkbox | radio | "
                                  "textarea | menu | tab | slider | other")
    label: str = Field(description="Visible label or text of the element")
    options: StrList = Field(default_factory=list, description="Visible options/values for select, radio, tabs, menus")
    effect: Optional[str] = Field(default=None, description="What happened when interacting with it (if tried)")
    external_target: Optional[str] = Field(default=None, description="Destination if it leaves the site (not followed)")


class Page(BaseModel):
    name: str = Field(description="Short name of the page / section / view")
    url: Optional[str] = Field(default=None, description="URL or anchor when it changes")
    purpose: str = Field(description="What this page is for, in one sentence")
    elements: Annotated[list[UIElement], BeforeValidator(lambda v: v or [])] = Field(default_factory=list)
    outputs: StrList = Field(default_factory=list, description="Visible results, data, computed values, messages")


class AppMap(BaseModel):
    app_summary: str = Field(description="What the application is and who it is for, in 1-2 sentences")
    pages: list[Page]
    workflows: StrList = Field(description="Things a user can do, as short verb phrases")
    candidate_experiments: StrList = Field(
        description="Inputs worth varying to discover hidden behaviour or business rules (empty if none)")
    oddities: StrList = Field(default_factory=list, description="Errors, broken things, surprising behaviour seen")


INSTRUCTION = """You are a software archaeologist mapping an UNKNOWN web application, as a careful QA tester.
Goal: build a complete map of what the app shows and what a user can do with it.

Do:
- Wait for any intro/splash animation to finish (or click through it) before judging the page.
- Visit every section reachable from the navigation (menus, tabs, anchors, buttons that open views), and scroll
  each page to the bottom.
- For each page, list the interactive elements (with visible options) and the visible outputs/data.
- Try harmless interactions (open menus, switch tabs, expand items, change filters) and note their effect.

Never (strict, this is a real site):
- never submit a form, send a message or email, sign up, log in, or type personal data;
- never follow links that leave the site's domain: just record their target in external_target;
- never download files.

Be efficient: about 25 actions maximum, then answer with the map."""


def _next_id() -> str:
    EXPLORATIONS_DIR.mkdir(exist_ok=True)
    nums = [int(m.group(1)) for p in EXPLORATIONS_DIR.glob("EXPL_*.json")
            if (m := re.match(r"EXPL_(\d+)\.json$", p.name))]
    return f"EXPL_{(max(nums) + 1) if nums else 1:03d}"


def explore_app(url: str, *, timeout_s: float = 600, extra_instruction: str = "") -> dict:
    """Map an unknown app with the H agent (cloud browser). Never raises; returns the exploration JSON."""
    expl_id = _next_id()
    exp_dir = ARTIFACTS_DIR / expl_id
    started = time.monotonic()
    result: dict = {
        "exploration_id": expl_id, "application_url": url, "status": "failed", "app_map": None, "error": None,
        "agent_config": {"browser": "cloud", **EXPLORE_OVERRIDES},
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    api_key = _get_api_key()
    if not api_key:
        result["error"] = "HAI_API_KEY missing"
    else:
        try:
            # Always cloud: an unknown public app needs no local Chrome/bridge (and costs 1 slot).
            import explorer.explorer as ex

            saved, ex.BROWSER_MODE = ex.BROWSER_MODE, "cloud"
            try:
                instruction = INSTRUCTION + (f"\n\nAdditional focus: {extra_instruction}" if extra_instruction else "")
                out = _agent_session(url, instruction, AppMap, exp_dir, timeout_s, api_key, None,
                                     agent_overrides=EXPLORE_OVERRIDES)
            finally:
                ex.BROWSER_MODE = saved
            ans = out.pop("answer", None)
            result["app_map"] = ans.model_dump() if isinstance(ans, AppMap) else (_jsonable(ans) if ans else None)
            result.update({k: out.get(k) for k in ("session_id", "agent_view_url", "timings", "session_status")})
            result["evidence"] = {
                "trace_path": str((exp_dir / "trace.json").relative_to(ROOT)) if (exp_dir / "trace.json").exists() else None,
                "screenshots": out.get("screenshots", []),
                "actions": out.get("actions", []),
            }
            result["error"] = out.get("error")
            result["status"] = "success" if not out.get("error") else "failed"
        except Exception as exc:
            result["error"] = f"{type(exc).__name__}: {exc}"
    result["duration_s"] = round(time.monotonic() - started, 1)
    EXPLORATIONS_DIR.mkdir(exist_ok=True)
    (EXPLORATIONS_DIR / f"{expl_id}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


if __name__ == "__main__":
    import sys

    r = explore_app(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/index.html")
    print(json.dumps(r, indent=2, ensure_ascii=False))
