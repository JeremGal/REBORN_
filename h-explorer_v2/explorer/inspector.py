"""Code & site inspector: an H agent on a CLOUD WORKSTATION (Linux shell + Chrome) inventories a web app.

    from explorer.inspector import inspect_site
    insp = inspect_site("https://example.com/")   # -> dict (also saved in inspections/INSP_xxx.json)

Shell first: robots.txt + sitemap, crawl every public page, parse forms/controls, download the JS bundles
and read them (routes, API/backend calls, embedded data, hard-coded business rules). The agent writes
/workspace/inspection.json and shares it; we download and validate it (more robust than a long answer).

Guardrails (in the instruction): read-only GET requests, max ~2 req/s, no auth bypass, no write to any
backend, no personal-data extraction, robots "Disallow" areas skipped unless credentials are provided.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, BeforeValidator, Field

from explorer.explorer import ARTIFACTS_DIR, ROOT, _agent_session, _get_api_key, _json_from_text, _jsonable

INSPECTIONS_DIR = ROOT / "inspections"
INSPECT_OVERRIDES = {
    "model": os.getenv("REBORN_INSPECT_MODEL", "holo4-35b-a3b"),  # reading code needs the stronger model
    "environments": [{"id": "ws", "kind": "workstation", "storage": {"ephemeral": True}}],
    "free_answer": True,  # the inventory comes back as a shared file, see _session_on_client
}
INSPECT_TIMEOUT_S = float(os.getenv("REBORN_INSPECT_TIMEOUT_S", "600"))
MAX_PAGES = int(os.getenv("REBORN_INSPECT_MAX_PAGES", "300"))

L = lambda t: Annotated[list[t], BeforeValidator(lambda v: v or [])]  # noqa: E731  (null -> [])
S = Annotated[str, BeforeValidator(lambda v: "" if v is None else str(v))]


class PageInfo(BaseModel):
    url: S = ""
    template: S = ""
    title: S = ""
    forms: int = 0
    controls: int = 0


class Template(BaseModel):
    pattern: S = Field(default="", description="URL pattern, e.g. /subventions/{region}/{departement}")
    count: int = 0
    purpose: S = ""
    example_urls: L(str) = Field(default_factory=list)


class FormField(BaseModel):
    name: S = ""
    label: S = ""
    type: S = ""
    required: Optional[bool] = None
    options: L(str) = Field(default_factory=list)
    validation: S = ""


class Form(BaseModel):
    page: S = ""
    purpose: S = ""
    method: S = ""
    action_or_endpoint: S = ""
    fields: L(FormField) = Field(default_factory=list)
    submit_label: S = ""


class Control(BaseModel):
    page: S = Field(default="", description="URL (or template) where the control lives")
    kind: S = Field(default="", description="filter | select | tab | toggle | checkbox | search | map | slider | button")
    label: S = ""
    values: L(str) = Field(default_factory=list, description="All possible values/options")
    url_param: S = Field(default="", description="Query parameter it drives, if any")
    effect_hypothesis: S = Field(default="", description="What it seems to change (from code/HTML)")


class Backend(BaseModel):
    kind: S = Field(default="", description="REST API, GraphQL, Supabase, Firebase, CMS, analytics, payment...")
    endpoint_or_service: S = ""
    usage: S = ""
    evidence: S = ""


class DataSource(BaseModel):
    what: S = ""
    where: S = Field(default="", description="file / endpoint / bundle where the data lives")
    size: S = ""
    sample: S = ""


class CodeRule(BaseModel):
    rule: S = Field(default="", description="Business rule stated precisely")
    where: S = Field(default="", description="file + function/variable")
    evidence_snippet: S = ""
    confidence: S = ""


class Auth(BaseModel):
    login_urls: L(str) = Field(default_factory=list)
    signup_urls: L(str) = Field(default_factory=list)
    protected_routes: L(str) = Field(default_factory=list)
    roles_or_permissions: L(str) = Field(default_factory=list)
    provider: S = ""


class Coverage(BaseModel):
    sitemap_urls: int = 0
    crawled_urls: int = 0
    js_files_read: int = 0
    skipped: L(str) = Field(default_factory=list)


class Inspection(BaseModel):
    framework: S = ""
    pages: L(PageInfo) = Field(default_factory=list)
    templates: L(Template) = Field(default_factory=list)
    forms: L(Form) = Field(default_factory=list)
    controls: L(Control) = Field(default_factory=list)
    routes_in_code: L(str) = Field(default_factory=list)
    backend: L(Backend) = Field(default_factory=list)
    data_sources: L(DataSource) = Field(default_factory=list)
    business_rules_in_code: L(CodeRule) = Field(default_factory=list)
    auth: Auth = Field(default_factory=Auth)
    coverage: Coverage = Field(default_factory=Coverage)
    notes: L(str) = Field(default_factory=list)


def _instruction(url: str) -> str:
    schema = json.dumps(Inspection.model_json_schema(), ensure_ascii=False)
    return f"""You are a software archaeologist with a Linux shell (python3, curl) and Chrome. Target: {url}
Goal: a COMPLETE technical inventory of this web application, so it can be rebuilt. Work shell-first and
write Python scripts rather than typing many commands.

1. robots.txt and sitemap(s): list every public URL (cap {MAX_PAGES} pages). Group URLs into templates
   (e.g. /subventions/{{region}}/{{departement}}) with counts and example URLs.
2. Crawl every listed page politely (max 2 requests/second, GET only). For each page: title, forms, and every
   interactive control (filters, selects with ALL their options, tabs, toggles, checkboxes, search, maps,
   sliders) with the URL parameter it drives if any. If pages are rendered by JavaScript, render a few with
   Chrome (the `web` command) to see the real controls.
3. Download the JS/CSS bundles and lazy-loaded chunks (look for import maps, __vite__mapDeps, webpack chunks).
   Read them for: client routes, API/backend calls (REST, GraphQL, Supabase, Firebase...), embedded data
   (JSON catalogs, lists), and HARD-CODED BUSINESS RULES (eligibility filters, price/discount formulas,
   thresholds, conditions, validations). Quote the evidence (file + function/variable + short snippet).
   The main bundle is minified: grep it for keywords (function names, 'eligib', 'prix', 'tarif', route
   strings) rather than printing it; read each bundle AT MOST TWICE. If a command gives no new result,
   change approach instead of repeating it — never run the same command more than twice.
4. Auth: login/signup pages, protected routes, roles/permissions visible in the code. Do not log in.

Efficiency: about 40 shell commands maximum, then write the file, share it, and finish.

Strict rules: read-only GET requests only; never POST/PUT/DELETE or write to any backend or database;
never try to bypass authentication or access protected data; do not extract personal data; skip URLs
disallowed by robots.txt (just list them in coverage.skipped); stay on this site's domain and its own
asset/backend hosts.

Write the result to /workspace/inspection.json as ONE JSON object matching this JSON Schema (validate it with
python -m json.tool), share that file with the share_files tool, then finish with one short sentence.
{schema}"""


def _next_id() -> str:
    INSPECTIONS_DIR.mkdir(exist_ok=True)
    nums = [int(m.group(1)) for p in INSPECTIONS_DIR.glob("INSP_*.json") if (m := re.match(r"INSP_(\d+)\.json$", p.name))]
    return f"INSP_{(max(nums) + 1) if nums else 1:03d}"


class _Summary(BaseModel):
    """Short final answer (the full inventory is in the shared /workspace/inspection.json).
    A concrete schema matters: an empty one made H sessions fail with 'internal error'."""
    inspection_file_shared: bool = Field(default=False, description="True if /workspace/inspection.json was shared")
    pages: int = 0
    templates: int = 0
    forms: int = 0
    controls: int = 0
    business_rules_in_code: int = 0
    notes: S = ""


def inspect_site(url: str, *, timeout_s: float = INSPECT_TIMEOUT_S) -> dict:
    """Run the workstation inspector. Never raises; returns {status, inspection, files, ...}."""
    insp_id = _next_id()
    exp_dir = ARTIFACTS_DIR / insp_id
    started = time.monotonic()
    result: dict[str, Any] = {"inspection_id": insp_id, "url": url, "status": "failed", "inspection": None,
                              "error": None, "agent_config": {k: v for k, v in INSPECT_OVERRIDES.items()},
                              "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    try:
        out = _agent_session(url, _instruction(url), _Summary, exp_dir, timeout_s, _get_api_key(), None,
                             agent_overrides=INSPECT_OVERRIDES)
    except Exception as exc:
        out = {"error": f"{type(exc).__name__}: {exc}"}
    data = None
    for f in out.get("files") or []:  # preferred: the shared inspection.json
        if f.endswith(".json"):
            try:
                data = json.loads((ROOT / f).read_text(encoding="utf-8"))
                break
            except Exception:
                pass
    if data is None and out.get("answer") is not None:  # fallback: the answer itself
        ans = out["answer"]
        try:
            data = ans.model_dump() if isinstance(ans, BaseModel) else (ans if isinstance(ans, dict) else _json_from_text(ans))
        except Exception:
            data = None
    if isinstance(data, dict) and any(k in data for k in ("pages", "templates", "forms", "controls", "backend")):
        try:
            result["inspection"] = Inspection.model_validate(data).model_dump()
            result["status"] = "success"
        except Exception as exc:
            result["error"] = f"inspection.json invalid: {exc}"[:400]
            result["inspection_raw"] = data
    else:
        result["error"] = out.get("error") or "no inspection.json shared and no usable answer"
    result.update({k: out.get(k) for k in ("session_id", "agent_view_url", "timings", "files")})
    result["actions"] = len(out.get("actions") or [])
    result["duration_s"] = round(time.monotonic() - started, 1)
    INSPECTIONS_DIR.mkdir(exist_ok=True)
    (INSPECTIONS_DIR / f"{insp_id}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result


# ---------------------------------------------------------------- helpers for the reporter

def controls_for(inspection: Optional[dict], page_url: str) -> list[dict]:
    """Controls whose page/template matches `page_url` (same path, or same first path segment)."""
    if not inspection:
        return []
    path = urlparse(page_url).path.rstrip("/") or "/"
    first = "/" + path.strip("/").split("/")[0] if path != "/" else "/"
    hits = []
    for c in inspection.get("controls", []):
        cp = urlparse(c.get("page") or "").path.rstrip("/") or (c.get("page") or "")
        if cp == path or (first != "/" and (cp.startswith(first) or first in cp)):
            hits.append(c)
    return hits[:25]


if __name__ == "__main__":
    import sys

    r = inspect_site(sys.argv[1] if len(sys.argv) > 1 else "https://www.cerclai.fr/")
    i = r.get("inspection") or {}
    print(r["status"], r["duration_s"], r.get("error"))
    print({k: (len(v) if isinstance(v, list) else v) for k, v in i.items() if k != "auth"})
