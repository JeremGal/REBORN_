"""Optional business context from the web (Linkup), attached to observations as `external_context`.

Rules of use (REBORN):
- OPTIONAL: active only if LINKUP_API_KEY is set; otherwise status "skipped".
- NEVER BLOCKING: any error -> status "error", the experiment goes on.
- NEVER A PROOF: norms / web sources can suggest hypotheses (VAT, rounding, usual discounts) but
  only an experiment in the app validates a rule. Every payload carries that disclaimer.
- CHEAP: depth "standard" + sourcedAnswer ($0.006/call), one query per module, cached on disk.
"""
from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:  # OS certificate store (Avast intercepts HTTPS on this machine)
    import truststore

    truststore.inject_into_ssl()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = ROOT / "context_cache.json"
DISCLAIMER = "Contexte web informatif : ne valide aucune règle. Seule une expérience dans l'application fait foi."

# One question per legacy module; extend when new modules are explored.
MODULE_QUERIES = {
    "Devis": (
        "Dans un devis B2B industriel en France, quelles sont les pratiques usuelles pour : "
        "remise sur quantité (seuils, pourcentages), remise par catégorie de client, frais de port "
        "offerts au-delà d'un montant, ordre d'application des remises, arrondi des montants HT et TVA ?"
    ),
}

_LOCK = threading.Lock()


def _api_key() -> Optional[str]:
    key = os.getenv("LINKUP_API_KEY")
    if key:
        return key
    env = ROOT / ".env"
    if env.exists():  # tolerate a free-form .env line such as "linkup: <key>"
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "linkup" in line.lower():
                m = re.search(r"[:=]\s*(\S+)\s*$", line)
                if m:
                    return m.group(1)
    return None


def _load_cache() -> dict:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def get_context(module: str, query: Optional[str] = None, *, refresh: bool = False) -> dict:
    """Return the external_context payload for `module` (cached). Never raises."""
    query = query or MODULE_QUERIES.get(module)
    base = {"provider": "linkup", "module": module, "query": query, "disclaimer": DISCLAIMER}
    if not query:
        return {**base, "status": "skipped", "reason": f"no query configured for module {module!r}"}
    key = _api_key()
    if not key:
        return {**base, "status": "skipped", "reason": "LINKUP_API_KEY not set"}

    with _LOCK:
        cache = _load_cache()
        if not refresh and query in cache:
            return {**cache[query], "cached": True}
        try:
            from linkup import LinkupClient

            resp = LinkupClient(api_key=key).search(
                query=query, depth="standard", output_type="sourcedAnswer", timeout=60
            )
            payload = {
                **base,
                "status": "ok",
                "answer": resp.answer,
                "sources": [{"name": s.name, "url": s.url} for s in (resp.sources or [])][:8],
                "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
            cache[query] = payload
            CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
            return {**payload, "cached": False}
        except Exception as exc:  # optional enrichment: never fatal
            return {**base, "status": "error", "error": f"{type(exc).__name__}: {exc}"[:300]}


if __name__ == "__main__":
    print(json.dumps(get_context("Devis"), indent=2, ensure_ascii=False))
