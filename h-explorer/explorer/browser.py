"""Dedicated Chrome instances the H local bridges attach to (one per debug port / worker).

The SDK's own launcher uses default flags; on Windows that gives HiDPI screenshots (tiny targets)
and a minimized/background window stops rendering, which stalls the agent's observations.
We start Chrome ourselves with stable flags, one profile per port so instances never collide.
"""
import os
import subprocess
import time
from pathlib import Path

import httpx

DEFAULT_PORT = 9222
ROOT = Path(__file__).resolve().parent.parent
PROFILES_DIR = ROOT / ".chrome-profile"
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
]


def _base(port: int) -> str:
    return f"http://127.0.0.1:{port}/json"


def _listening(port: int) -> bool:
    try:
        return httpx.get(f"{_base(port)}/version", timeout=2, trust_env=False).status_code == 200
    except httpx.HTTPError:
        return False


def fresh_tab(url: str = "about:blank", port: int = DEFAULT_PORT) -> None:
    """Leave exactly one new tab already on `url`, so no form state survives from a previous experiment."""
    old = [t["id"] for t in httpx.get(f"{_base(port)}/list", timeout=5, trust_env=False).json()
           if t.get("type") == "page"]
    httpx.put(f"{_base(port)}/new?{url}", timeout=5, trust_env=False)
    for tid in old:
        httpx.get(f"{_base(port)}/close/{tid}", timeout=5, trust_env=False)


def ensure_chrome(port: int = DEFAULT_PORT, headless: bool | None = None) -> None:
    """Start a REBORN Chrome on `port` unless one already listens there."""
    if _listening(port):
        return
    if headless is None:
        # Headless by default: a minimized visible window stops rendering and stalls screenshots.
        # Watch live in the H Agent View instead (agent_view_url), or set REBORN_HEADLESS=0.
        headless = os.getenv("REBORN_HEADLESS", "1") == "1"
    binary = next((p for p in CHROME_CANDIDATES if Path(p).exists()), None)
    if binary is None:
        raise RuntimeError("Google Chrome not found")
    profile = PROFILES_DIR / str(port)
    profile.mkdir(parents=True, exist_ok=True)
    args = [
        binary,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile}",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=1",             # 1 CSS px = 1 screenshot px
        "--window-size=1100,800",
        "--disable-backgrounding-occluded-windows",  # keep rendering when hidden/behind other windows
        "--disable-renderer-backgrounding",
        "--disable-background-timer-throttling",
    ]
    if headless:
        args.append("--headless=new")
    subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if _listening(port):
            return
        time.sleep(0.25)
    raise RuntimeError(f"Chrome did not open debug port {port} within 20s")
