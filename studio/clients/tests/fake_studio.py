"""Faux Studio local (jeu de test) pour tester le protocole de l'exécuteur SANS réseau ni vrai serveur.

Implémente seulement les routes que l'exécuteur appelle, enregistre chaque requête (méthode, chemin,
en-têtes, corps) et sert une mission une seule fois. Les identifiants « remis » sont inventés et retenus
pour vérifier qu'ils ne fuitent dans AUCUN corps de requête reçu. stdlib uniquement.
"""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional

Json = Dict[str, Any]

# Identifiants INVENTÉS remis par le faux Studio (jeu de test) : jamais de vraie valeur.
FAKE_USERNAME = "agent.migration@exemple.test"
FAKE_PASSWORD = "mot-de-passe-fictif-jeu-de-test-ABC123"
FAKE_TOKEN = "jeton-de-remise-fictif-0000000000"


class FakeStudio:
    def __init__(self, *, mission: Json, plan_route: bool = False, with_credentials: bool = True):
        self.mission = mission
        self.plan_route = plan_route
        self.with_credentials = with_credentials
        self.requests: List[Json] = []
        self.heartbeats = 0
        self.claimed = False
        self.redeemed = 0
        self.connection_reports: List[str] = []
        self.completed: Optional[Json] = None
        self.plan_posts = 0
        self.secrets = [FAKE_USERNAME, FAKE_PASSWORD, FAKE_TOKEN]
        self._lock = threading.Lock()
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self.url = ""

    # -- cycle de vie -----------------------------------------------------
    def start(self) -> str:
        studio = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):  # silencieux
                pass

            def _send(self, code: int, body: Any):
                data = json.dumps(body).encode() if body is not None else b""
                self.send_response(code)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                if data:
                    self.wfile.write(data)

            def do_POST(self):
                length = int(self.headers.get("content-length") or 0)
                raw = self.rfile.read(length).decode("utf-8") if length else ""
                try:
                    body = json.loads(raw) if raw else None
                except ValueError:
                    body = raw
                path = self.path
                with studio._lock:
                    studio.requests.append({"path": path, "headers": {k.lower(): v for k, v in self.headers.items()}, "raw": raw, "body": body})
                code, resp = studio.route(path, self.headers, body)
                self._send(code, resp)

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self.url

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        if self._thread:
            self._thread.join(timeout=2)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *a):
        self.stop()

    # -- routage ----------------------------------------------------------
    def route(self, path: str, headers, body) -> tuple:
        base = path.split("?", 1)[0]
        with self._lock:
            if base == "/api/executor/heartbeat":
                self.heartbeats += 1
                return 200, {"ok": True, "server_time": "2026-11-08T00:00:00Z", "renew_within_s": 20, "executor_id": "EXE_000000000000", "lease_s": 120, "leases": []}
            if base == "/api/executor/missions/claim":
                if self.heartbeats == 0:
                    return 409, {"ok": False, "error": "battement requis"}
                if self.claimed:
                    return 204, None
                self.claimed = True
                return 200, self.mission
            if base.endswith("/credentials/redeem"):
                if headers.get("origin") or headers.get("sec-fetch-site"):
                    return 403, {"ok": False, "error": "navigateur refusé", "reason": "executor"}
                if self.redeemed:
                    return 403, {"ok": False, "error": "déjà utilisé", "reason": "used"}
                self.redeemed += 1
                return 200, {"ok": True, "username": FAKE_USERNAME, "password": FAKE_PASSWORD}
            if base.endswith("/connection"):
                status = (body or {}).get("status")
                self.connection_reports.append(status)
                return 200, {"ok": True, "project": {"status": "CONNECTED"}, "mission": {"status": status}}
            if base == "/api/events":
                lst = body if isinstance(body, list) else [body]
                return 200, {"ok": True, "ids": [f"e{i}" for i in range(len(lst))], "seqs": list(range(len(lst)))}
            if base == "/api/schema":
                return 200, {"ok": True, "version": 1, "issues": []}
            if base == "/api/observations":
                lst = body if isinstance(body, list) else [body]
                return 200, {"ok": True, "count": len(lst), "duplicates": 0, "investigation_id": "INV_TEST", "experiment_ids": []}
            if base == "/api/migration/extraction-plan":
                self.plan_posts += 1
                return (200, {"ok": True, "status": "proposed"}) if self.plan_route else (404, {"ok": False, "error": "route inconnue"})
            if base.endswith("/complete"):
                self.completed = {"outcome": (body or {}).get("outcome"), "disposal": (body or {}).get("disposal")}
                return 200, {"ok": True, "mission": {"status": self.completed["outcome"]}, "credentials": {"revoked_at": "2026-11-08T00:00:00Z", "erased": True}}
            return 404, {"ok": False, "error": f"route inconnue : {base}"}

    # -- utilitaires de vérification -------------------------------------
    def leaked_secrets(self) -> List[str]:
        """Secrets (identifiants remis, jeton) retrouvés dans un corps de requête reçu : doit être vide."""
        hits = []
        for req in self.requests:
            raw = req.get("raw") or ""
            for s in self.secrets:
                if s in raw and req["path"].endswith("/credentials/redeem") is False:
                    hits.append(f"{s[:6]}… dans {req['path']}")
        return hits

    def posted(self, suffix: str) -> List[Json]:
        return [r for r in self.requests if r["path"].split("?", 1)[0].endswith(suffix) or r["path"].split("?", 1)[0] == suffix]


def default_mission(*, with_credentials: bool = True) -> Json:
    """Mission connection_mission 1.1 (jeu de test) servie par le faux Studio."""
    m: Json = {
        "contract": "connection_mission",
        "contract_version": "1.1",
        "mission_id": "MIS_0123456789",
        "project_id": "MIG_00000001",
        "status": "claimed",
        "created_at": "2026-11-08T00:00:00Z",
        "expires_at": "2026-11-09T00:00:00Z",
        "requires_network": "private",
        "investigation_id": "INV_TEST",
        "executor": {"id": "EXE_000000000000", "lease_expires_at": "2026-11-08T00:02:00Z"},
        "target": {"url": "http://logiciel-hotelier.exemple.test", "software": "Logiciel hôtelier (jeu de test)", "software_type": "Hôtellerie", "company": "Hôtel de test"},
        "authorization": None,
        "consent": {"privacy_notice_version": "1.0", "authorization_version": "1.0", "accepted_at": "2026-11-08T00:00:00Z"},
        "objectives": ["Explorer en lecture seule"],
        "constraints": ["Ne jamais modifier de données"],
        "credential": None,
        "limits": {"read_only": True, "login_screenshots": False, "max_duration_s": 60},
        "report": {},
    }
    if with_credentials:
        m["credential"] = {
            "username_hint": "a••••••t",
            "expires_at": "2026-11-08T00:15:00Z",
            "credentials_expires_at": "2026-11-09T00:00:00Z",
            "token": FAKE_TOKEN,
            "token_expires_at": "2026-11-08T00:15:00Z",
            "handling": "remplir hors du modèle : coffre H fill_secret_at ou CDP ; jamais dans la consigne",
        }
    return m
