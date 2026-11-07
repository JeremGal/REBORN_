"""Serve legacy_app/ on localhost in a background thread (idempotent)."""
import functools
import http.server
import socket
import threading
from pathlib import Path

LEGACY_DIR = Path(__file__).resolve().parent.parent / "legacy_app"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep the console clean
        pass

    def end_headers(self):
        # No cache: after a Blind Challenge rule change, the agent must see the new rules.js
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def ensure_server(port: int = 8765) -> str:
    """Start the static server if nothing listens on `port`; return the app URL."""
    if not _port_in_use(port):
        handler = functools.partial(_QuietHandler, directory=str(LEGACY_DIR))
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://localhost:{port}/index.html"


if __name__ == "__main__":
    import time

    print("Legacy ERP on", ensure_server())
    while True:
        time.sleep(3600)
