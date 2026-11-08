"""Faux logiciel de type HotelDruid (JEU DE TEST) pour tester la récupération d'export SANS réseau externe.

Implémente le mécanisme de sauvegarde officielle sur une seule origine locale (http.server) :
- GET  /crea_backup.php  → formulaire portant les champs `crea_backup`, `salva_backup`, et un select `anno` ;
- POST /crea_backup.php  (crea_backup=1)              → « File created » ;
- POST /crea_backup.php  (salva_backup=1, compresso=SI) → gzip d'une sauvegarde « tagged-dump » INVENTÉE.

La sauvegarde est entièrement fictive (étiquetée « jeu de test ») : 2 années, tables prenota / clienti /
appartamenti fictives, et une table sensible `utenti` (comptes) qui ne doit JAMAIS être déposée au Studio.

Modes : "ok" (défaut), "login" (page de connexion : aucun champ de sauvegarde), "redirect" (302 hors origine).
stdlib uniquement.
"""
from __future__ import annotations

import gzip
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import parse_qs


def _table(name: str, cols, types, rows) -> str:
    out = [f"<nometabella>{name}</nometabella>"]
    out += [f"<nomecolonna>{c}</nomecolonna>" for c in cols]
    out += [f"<tipocolonna>{t}</tipocolonna>" for t in types]
    for r in rows:
        cells = "".join(f"<cmp>{v}</cmp>" for v in r)
        out.append(f"<riga>{cells}</riga>")
    return "\n".join(out)


def invented_tagged_dump() -> bytes:
    """Sauvegarde « tagged-dump » INVENTÉE (jeu de test) : 2 années + une table sensible `utenti`."""
    parts = ["<database>"]
    parts.append(_table("appartamenti", ["idappartamenti", "nome"], ["int", "varchar"],
                        [["1", "Chambre bleue (jeu de test)"], ["2", "Chambre verte (jeu de test)"]]))
    parts.append(_table("prenota2025", ["idprenota", "idappartamenti", "nome"], ["int", "int", "varchar"],
                        [["1", "1", "Client A (jeu de test)"], ["2", "2", "Client B (jeu de test)"]]))
    parts.append(_table("prenota2026", ["idprenota", "idappartamenti", "nome"], ["int", "int", "varchar"],
                        [["1", "1", "Client C (jeu de test)"]]))
    parts.append(_table("clienti2025", ["idclienti", "nome"], ["int", "varchar"],
                        [["1", "Client A (jeu de test)"]]))
    parts.append(_table("clienti2026", ["idclienti", "nome"], ["int", "varchar"],
                        [["1", "Client C (jeu de test)"]]))
    parts.append(_table("utenti", ["idutenti", "nome", "password"], ["int", "varchar", "varchar"],
                        [["1", "admin", "secret-fictif-jeu-de-test"]]))
    parts.append("</database>")
    return "\n".join(parts).encode("utf-8")


FORM_HTML = """<!doctype html><html><body>
<h1>Backup (jeu de test)</h1>
<form method="post" action="/crea_backup.php">
  <select name="anno"><option value="2025">2025</option><option value="2026" selected>2026</option></select>
  <input type="hidden" name="id_sessione" value="">
  <input type="hidden" name="azione" value="SI">
  <input type="submit" name="crea_backup" value="Creare backup">
</form>{download}</body></html>"""

# Comme le vrai logiciel : le formulaire de téléchargement n'apparaît qu'une fois une sauvegarde créée.
DOWNLOAD_FORM = """<form method="post" action="/crea_backup.php">
  <input type="hidden" name="anno" value="2026"><input type="hidden" name="id_sessione" value="">
  <input type="hidden" name="azione" value="SI"><input type="hidden" name="mostra_header" value="NO">
  <input type="submit" name="salva_backup" value="Salvare backup"><input type="checkbox" name="compresso" value="SI" checked>
</form>"""

LOGIN_HTML = """<!doctype html><html><body>
<h1>Login / Connexion</h1>
<form method="post" action="/index.php">
  <input type="text" name="utente">
  <input type="password" name="password">
  <input type="submit" value="Accesso">
</form></body></html>"""


class FakeHotelDruid:
    def __init__(self, *, mode: str = "ok", gzip_body: Optional[bytes] = None):
        self.mode = mode
        # Permet de servir un corps gzip précis (ex. trop volumineux une fois décompressé) pour les plafonds.
        self._gzip_body = gzip_body
        self.requests = []
        self._server: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self.url = ""
        self._lock = threading.Lock()
        self.created = False  # une sauvegarde existe-t-elle déjà sur le « logiciel » ?

    def backup_gzip(self) -> bytes:
        return self._gzip_body if self._gzip_body is not None else gzip.compress(invented_tagged_dump())

    def start(self) -> str:
        app = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body: bytes, ctype="text/html; charset=utf-8", extra=None):
                self.send_response(code)
                self.send_header("content-type", ctype)
                self.send_header("content-length", str(len(body)))
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                if body:
                    self.wfile.write(body)

            def do_GET(self):
                with app._lock:
                    app.requests.append({"method": "GET", "path": self.path})
                if self.path.split("?", 1)[0] != "/crea_backup.php":
                    return self._send(404, b"not found")
                if app.mode == "redirect":
                    return self._send(302, b"", extra={"location": "http://autre-origine.exemple.test/"})
                if app.mode == "login":
                    return self._send(200, LOGIN_HTML.encode())
                if app.mode == "blank":
                    return self._send(200, b"<!doctype html><html><body><h1>Bienvenue (jeu de test)</h1></body></html>")
                return self._send(200, FORM_HTML.format(download=DOWNLOAD_FORM if app.created else "").encode())

            def do_POST(self):
                length = int(self.headers.get("content-length") or 0)
                raw = self.rfile.read(length).decode("utf-8") if length else ""
                form = {k: v[0] for k, v in parse_qs(raw, keep_blank_values=True).items()}
                with app._lock:
                    app.requests.append({"method": "POST", "path": self.path, "form": form})
                if self.path.split("?", 1)[0] != "/crea_backup.php":
                    return self._send(404, b"not found")
                if app.mode == "login":
                    return self._send(200, LOGIN_HTML.encode())
                if form.get("crea_backup") == "1":
                    app.created = True
                    return self._send(200, b"File created (jeu de test)")
                if form.get("salva_backup") == "1" and not app.created:
                    return self._send(200, b"<!doctype html><html><body>Aucune sauvegarde (jeu de test)</body></html>")
                if form.get("salva_backup") == "1" and form.get("compresso") == "SI":
                    return self._send(200, app.backup_gzip(), ctype="application/x-gzip")
                return self._send(400, b"requete inattendue")

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self.url

    def stop(self):
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
