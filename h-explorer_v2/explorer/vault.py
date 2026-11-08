"""Credentials for authenticated exploration, through an H-hosted vault (secrets never reach the agent).

Put logins in `credentials.json` (git-ignored, never printed):

    [
      {"name": "Mon ERP - compte test", "urls": ["https://app.example.com/login"],
       "username": "test@example.com", "password": "...", "totp": "BASE32SECRET (optional)"}
    ]

`vault_for(url)` upserts these items into the H vault "reborn-logins" and returns its id when one item
matches the URL's host. Bound to a cloud browser (`vault_id`), the agent gets a `fill_secret_at` action:
H types the value into the page itself; the agent never sees it. Workstation Chrome cannot use vaults
(H doc), so authenticated areas are explored by the cloud-browser agents only.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from explorer.explorer import ROOT, _get_api_key

CREDENTIALS_FILE = ROOT / "credentials.json"
VAULT_NAME = "reborn-logins"
FIELDS = ("username", "password", "email", "totp", "api_key")
_lock = threading.Lock()
_cache: dict[str, Optional[str]] = {}


def _load() -> list[dict]:
    if not CREDENTIALS_FILE.exists():
        return []
    try:
        data = json.loads(CREDENTIALS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _host(u: str) -> str:
    return urlparse(u if "://" in u else f"https://{u}").netloc.lower().removeprefix("www.")


def has_credentials(url: str) -> bool:
    h = _host(url)
    return any(any(_host(x) == h or h.endswith("." + _host(x)) for x in c.get("urls", [])) for c in _load())


def vault_for(url: str) -> Optional[str]:
    """Vault id holding a login for `url`'s host (creating/updating the H vault items), else None."""
    h = _host(url)
    with _lock:
        if h in _cache:
            return _cache[h]
        creds = [c for c in _load() if any(_host(x) == h or h.endswith("." + _host(x)) for x in c.get("urls", []))]
        if not creds:
            _cache[h] = None
            return None
        from hai_agents import Client, VaultCreateRequestProviderConfig_Internal

        client = Client(api_key=_get_api_key())
        vault = next((v for v in (client.vaults.list_vaults(limit=100).vaults or []) if v.name == VAULT_NAME), None)
        if vault is None:
            vault = client.vaults.create_vault(name=VAULT_NAME, provider_config=VaultCreateRequestProviderConfig_Internal())
        existing = {i.name: i for i in (client.vaults.list_vault_items(vault.id, limit=100).items or [])}
        for c in creds:
            values = {k: str(c[k]) for k in FIELDS if c.get(k)}
            name = c.get("name") or f"login {h}"
            if name in existing:
                client.vaults.update_vault_item(vault.id, existing[name].id, urls=c["urls"], values=values)
            else:
                client.vaults.create_vault_item(vault.id, name=name, urls=c["urls"], values=values)
        _cache[h] = vault.id
        return vault.id


LOGIN_HINT = ("Credentials for this site are stored in a secure vault: when you reach its login form, sign in with "
              "the fill_secret_at action (username/email, password, and totp if asked). You never see the values. "
              "Once signed in, explore the authenticated area READ-ONLY: never submit, edit, delete, pay, or change "
              "account settings; log out at the end.")
