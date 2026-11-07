"""Blind Challenge operator tool: change one hidden rule of the legacy app.

    .venv/Scripts/python set_rule.py QTY_DISCOUNT_PCT 15            # local app only
    .venv/Scripts/python set_rule.py QTY_DISCOUNT_PCT 15 --publish  # + GitHub Pages (cloud mode)

Only scalar rules (e.g. QTY_DISCOUNT_PCT, QTY_DISCOUNT_THRESHOLD, FREE_SHIPPING_FROM, SHIPPING_FEE).
--publish needs a GitHub token (ghp_...) in .env and waits until the new value is actually served.
"""
import base64
import re
import sys
import time
from pathlib import Path

import httpx

try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent
RULES = ROOT / "legacy_app" / "rules.js"
OWNER, REPO = "EliasMoussouni", "reborn-legacy-erp"
PAGES_URL = f"https://eliasmoussouni.github.io/{REPO}/rules.js"


def set_local(name: str, value: str) -> str:
    text = RULES.read_text(encoding="utf-8")
    new, n = re.subn(rf"(\b{name}\s*:\s*)[\d.]+", rf"\g<1>{value}", text)
    if n != 1:
        sys.exit(f"rule {name!r} not found (or not a scalar) in {RULES}")
    RULES.write_text(new, encoding="utf-8")
    print(f"local: {name} = {value}")
    return new


def publish(content: str, name: str, value: str) -> None:
    m = re.search(r"\bghp_[A-Za-z0-9]+", (ROOT / ".env").read_text(encoding="utf-8"))
    if not m:
        sys.exit("no GitHub token (ghp_...) in .env")
    h = {"Authorization": f"Bearer {m.group(0)}", "Accept": "application/vnd.github+json"}
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/contents/rules.js"
    sha = httpx.get(url, headers=h, timeout=30).json()["sha"]
    r = httpx.put(url, headers=h, timeout=30, json={
        "message": f"Blind Challenge: {name} = {value}",
        "content": base64.b64encode(content.encode()).decode(), "sha": sha})
    r.raise_for_status()
    print("pushed to GitHub, waiting for Pages to serve it...", flush=True)
    t0 = time.monotonic()
    while time.monotonic() - t0 < 300:
        served = httpx.get(f"{PAGES_URL}?v={time.time()}", timeout=15).text
        if re.search(rf"\b{name}\s*:\s*{re.escape(value)}\b", served):
            print(f"live on GitHub Pages after {time.monotonic() - t0:.0f}s")
            return
        time.sleep(5)
    sys.exit("timeout: Pages still serves the old value after 5 min")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    rule, val = sys.argv[1], sys.argv[2]
    content = set_local(rule, val)
    if "--publish" in sys.argv:
        publish(content, rule, val)
