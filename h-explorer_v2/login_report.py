"""Authenticated reverse-engineering report in one command. YOU provide the password; the agent never sees it.

Two ways to give the credentials (run from the project folder):

  1) Typed (hidden prompt, nothing written to disk):
       .venv\\Scripts\\python login_report.py https://app.example/ user@example.com

  2) From .env (add these lines yourself, .env is git-ignored):
       REBORN_LOGIN_USERNAME=user@example.com
       REBORN_LOGIN_PASSWORD=...
       REBORN_LOGIN_TOTP=...            (optional, authenticator secret for 2FA)
     then:
       .venv\\Scripts\\python login_report.py https://app.example/ --env

The credentials go straight into the H vault "reborn-logins". The H cloud browser signs in with
fill_secret_at (H types the values into the login form; the agent, the report and the screenshots never
contain them). The map AND the per-feature dives sign in, explore read-only, and log out.
Output: reports/<host>_<stamp>/REPORT.md (legal frame + code inspection + every screen, incl. logged-in).
"""
import getpass
import os
import sys
from urllib.parse import urlparse

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import explorer.vault as vault_mod  # noqa: E402  (also loads .env)
from explorer.reporter import report_app  # noqa: E402


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--env"]
    use_env = "--env" in sys.argv
    if not args:
        sys.exit(__doc__)
    url = args[0]
    if use_env:
        username = os.getenv("REBORN_LOGIN_USERNAME", "").strip()
        password = os.getenv("REBORN_LOGIN_PASSWORD", "")
        totp = os.getenv("REBORN_LOGIN_TOTP", "").strip()
        if not username or not password:
            sys.exit("REBORN_LOGIN_USERNAME / REBORN_LOGIN_PASSWORD manquants dans .env (format CLE=valeur).")
    else:
        if len(args) < 2:
            sys.exit(__doc__)
        username = args[1]
        password = getpass.getpass(f"Mot de passe pour {username} (invisible) : ")
        totp = getpass.getpass("Secret TOTP 2FA (Entrée si aucun) : ").strip()
    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    item = {"name": f"login {urlparse(url).netloc}", "urls": [origin], "username": username, "password": password}
    if totp:
        item["totp"] = totp
    vault_mod._load = lambda: [item]  # in-memory only: no credentials file written
    vault_id = vault_mod.vault_for(url)
    del password, item
    print(f"Identifiants dans le vault H ({vault_id}). Lancement du rapport connecté...", flush=True)
    print(report_app(url))


if __name__ == "__main__":
    main()
