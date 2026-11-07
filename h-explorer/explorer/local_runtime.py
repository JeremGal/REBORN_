"""H local agent runtime (Client.local) as a fallback / parallel backend.

Why: the H platform caps concurrent sessions per org (3 on the free plan) and platform sessions can get
stuck. The local runtime runs the agent loop on this machine: only model calls go to H (Models API).
Each runtime instance serves 1 session at a time, so we run one runtime + one dedicated Chrome per worker.

Constraints found (2026-11-07):
- Models API default tier (no credits) only serves `holo3-1-35b-a3b` (Holo4 -> 402). With credits added,
  `holo4-35b-a3b` works; `holo4-27b` was still 402 at 2026-11-07 18:30. Override with REBORN_LOCAL_MODEL.
- The runtime is a separate (frozen Python) process: it does not get our truststore fix, so behind Avast
  HTTPS scanning it needs SSL_CERT_FILE = certifi + the Avast root (built here from the Windows store).
- No Agent View URL (the session lives on this machine).
"""
from __future__ import annotations

import atexit
import contextlib
import os
import queue
import ssl
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CA_BUNDLE = ROOT / ".certs" / "ca-bundle.pem"
LOCAL_MODEL = os.getenv("REBORN_LOCAL_MODEL", "holo4-35b-a3b")  # holo3-1-35b-a3b works without credits
LOCAL_WORKERS = int(os.getenv("REBORN_LOCAL_WORKERS", "3"))
RUNTIME_BASE_PORT = 18795
CHROME_BASE_PORT = 9300

_lock = threading.Lock()
_clients: dict[int, object] = {}
_slots: "queue.Queue[int]" = queue.Queue()
for _i in range(max(1, LOCAL_WORKERS)):
    _slots.put(_i)


def ensure_ca_bundle() -> str:
    """certifi + any intercepting-antivirus root found in the Windows store (read-only)."""
    if not CA_BUNDLE.exists():
        import certifi

        extra = []
        if hasattr(ssl, "enum_certificates"):  # Windows only
            for store in ("ROOT", "CA"):
                for der, enc, _trust in ssl.enum_certificates(store):
                    if enc == "x509_asn" and (b"Avast" in der or b"AVG" in der):
                        extra.append(ssl.DER_cert_to_PEM_cert(der))
        CA_BUNDLE.parent.mkdir(exist_ok=True)
        CA_BUNDLE.write_text(Path(certifi.where()).read_text(encoding="utf-8") + "\n" +
                             "\n".join(dict.fromkeys(extra)), encoding="utf-8")
    return str(CA_BUNDLE)


def _client(slot: int, api_key: str):
    with _lock:
        if slot not in _clients:
            from hai_agents import Client

            # The runtime child inherits our environment: H key + CA bundle.
            os.environ["HAI_API_KEY"] = api_key
            os.environ.setdefault("SSL_CERT_FILE", ensure_ca_bundle())
            _clients[slot] = Client.local(local_options={"port": RUNTIME_BASE_PORT + slot})
        return _clients[slot]


@contextlib.contextmanager
def local_slot(api_key: str):
    """Borrow (local client, chrome port) for one session; blocks until a worker slot is free."""
    slot = _slots.get()
    try:
        yield _client(slot, api_key), CHROME_BASE_PORT + slot
    finally:
        _slots.put(slot)


@atexit.register
def _close_all() -> None:
    for c in list(_clients.values()):
        with contextlib.suppress(Exception):
            c.close()
