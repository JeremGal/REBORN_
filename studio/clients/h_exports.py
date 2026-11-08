#!/usr/bin/env python3
"""Récupération automatique des données par un mécanisme d'export OFFICIEL du logiciel source.

Appelé par l'exécuteur (h_executor.py) PENDANT qu'il tient le prêt de la mission (avant complete_mission) :
il interroge l'ancien logiciel à son adresse déclarée, repère un mécanisme d'export reconnu, déclenche la
sauvegarde officielle du logiciel, la convertit en base SQLite avec l'adaptateur du Studio
(studio/scripts/tagged-dump-to-sqlite.mjs) et la dépose au projet (POST /api/migration/sources). Les comptes
(tables, lignes lues/écrites, tables exclues) sont consignés SANS aucune donnée.

Principes (SPEC / INTEGRATION_MOUSS.md) :
- Même origine que l'adresse du projet : seules des requêtes vers {scheme}://{host:port}/… sont émises.
- Redirections JAMAIS suivies (une 3xx est un refus) : on ne quitte jamais l'origine déclarée.
- Délais stricts, plafonds de taille (50 Mo compressé, 500 Mo décompressé, décompression bornée).
- Pas de contournement d'authentification : si le logiciel demande une connexion (page de connexion, 401/403),
  on ne tente rien et on le signale.
- Aucune valeur de donnée ne quitte ce module (ni journal, ni évènement) : seulement des noms de tables et
  des comptes. Le fichier converti part au Studio ; le dossier temporaire est supprimé après le dépôt.
- Ne lève jamais vers l'appelant : renvoie un résumé (reprise propre après erreur, sans secret).

Registre extensible : REGISTRY liste les mécanismes reconnus. Premier mécanisme : sauvegarde HotelDruid
(crea_backup.php, format « tagged-dump » gzip).
"""
from __future__ import annotations

import base64
import gzip
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlsplit
import urllib.error
import urllib.request

Json = Dict[str, Any]

# Plafonds (octets).
MAX_COMPRESSED = 50 * 1024 * 1024          # sauvegarde compressée téléchargée
MAX_DECOMPRESSED = 500 * 1024 * 1024       # sauvegarde une fois décompressée
MAX_PAGE = 4 * 1024 * 1024                 # page HTML lue à la détection / préparation
READ_CHUNK = 64 * 1024

# Délais réseau (secondes).
DETECT_TIMEOUT_S = 20.0
PREPARE_TIMEOUT_S = 120.0
DOWNLOAD_TIMEOUT_S = 300.0

USER_AGENT = "reborn-executor-export/1.0"

# Adaptateur de conversion du Studio (jamais modifié ici) et interpréteur Node.
STUDIO = Path(__file__).resolve().parents[1]
CONVERT_SCRIPT = STUDIO / "scripts" / "tagged-dump-to-sqlite.mjs"


def _node_bin() -> str:
    return os.environ.get("REBORN_NODE") or "node"


class ExportError(RuntimeError):
    """Problème de récupération (réseau, format, plafond). Rattrapé : l'exécuteur continue sa mission."""

    def __init__(self, message: str, *, reason: str = "error"):
        super().__init__(message)
        self.reason = reason


# --------------------------------------------------------------------------- HTTP même origine, sans redirection

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Toute redirection est un refus : on ne quitte jamais l'origine déclarée du projet."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401, ANN001
        raise urllib.error.HTTPError(req.full_url, code, f"redirection {code} refusée (même origine exigée)", headers, fp)


def _origin(url: str) -> Tuple[str, str]:
    """(origine normalisée, chemin de base). Lève ExportError si l'adresse n'est pas http(s)."""
    s = urlsplit(url if "://" in url else f"https://{url}")
    if s.scheme not in ("http", "https") or not s.netloc:
        raise ExportError(f"adresse non http(s) : {url}", reason="bad_url")
    return f"{s.scheme}://{s.netloc}", s.path


def _same_origin(url: str, origin: str) -> None:
    s = urlsplit(url)
    if f"{s.scheme}://{s.netloc}" != origin:
        raise ExportError("origine différente de l'adresse du projet : requête refusée", reason="origin")


class Http:
    """Petit client HTTP même-origine (stdlib) : aucune redirection suivie, taille lue bornée, délais stricts.
    Pas de cookie, pas d'authentification : aucune tentative de contournement."""

    def __init__(self, origin: str):
        self.origin = origin
        self._opener = urllib.request.build_opener(_NoRedirect)

    def get(self, url: str, *, timeout: float, cap: int) -> Tuple[int, str, bytes]:
        return self._do("GET", url, None, timeout=timeout, cap=cap)

    def post(self, url: str, form: Dict[str, str], *, timeout: float, cap: int) -> Tuple[int, str, bytes]:
        from urllib.parse import urlencode

        body = urlencode(form).encode()
        return self._do("POST", url, body, timeout=timeout, cap=cap, content_type="application/x-www-form-urlencoded")

    def _do(self, method: str, url: str, data: Optional[bytes], *, timeout: float, cap: int, content_type: Optional[str] = None) -> Tuple[int, str, bytes]:
        _same_origin(url, self.origin)
        headers = {"user-agent": USER_AGENT, "accept": "*/*"}
        if content_type:
            headers["content-type"] = content_type
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with self._opener.open(req, timeout=timeout) as r:
                ctype = r.headers.get("content-type", "")
                return r.status, ctype, _read_capped(r, cap)
        except urllib.error.HTTPError as e:
            # 3xx (redirection refusée), 401/403 (connexion exigée), 404… : renvoyés tels quels à l'appelant.
            raise ExportError(f"HTTP {e.code} sur {urlsplit(url).path}", reason=_http_reason(e.code)) from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise ExportError(f"logiciel injoignable : {getattr(e, 'reason', e)}", reason="unreachable") from None


def _http_reason(code: int) -> str:
    if code in (301, 302, 303, 307, 308):
        return "redirect"
    if code in (401, 403):
        return "needs_login"
    return "http_error"


def _read_capped(resp: Any, cap: int) -> bytes:
    """Lit le corps en bornant la taille (plafond dépassé → ExportError), sans se fier à Content-Length."""
    out = bytearray()
    while True:
        chunk = resp.read(READ_CHUNK)
        if not chunk:
            break
        out.extend(chunk)
        if len(out) > cap:
            raise ExportError(f"réponse trop volumineuse (plafond {cap // (1024 * 1024)} Mo dépassé)", reason="too_large")
    return bytes(out)


def _decompressed_within(gz: bytes, cap: int) -> bool:
    """Décompression gzip BORNÉE (anti-bombe) : vrai si la taille décompressée reste sous `cap`, faux sinon.
    N'accumule jamais plus de READ_CHUNK en mémoire par itération."""
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    total = 0
    pending = gz
    guard = cap // READ_CHUNK + 16
    for _ in range(guard + 1):
        out = d.decompress(pending, READ_CHUNK)
        total += len(out)
        if total > cap:
            return False
        pending = d.unconsumed_tail
        if not pending:
            if d.eof:
                return True
            out = d.decompress(b"", READ_CHUNK)  # vider le tampon interne restant
            total += len(out)
            if total > cap:
                return False
            if not out:
                return d.eof  # plus rien à produire : flux terminé (ou tronqué, traité comme fini)
    return False  # trop d'itérations : traité comme dépassement


def _is_gzip(data: bytes) -> bool:
    return len(data) >= 2 and data[0] == 0x1F and data[1] == 0x8B


# --------------------------------------------------------------------------- mécanisme : sauvegarde HotelDruid

def _form_has_field(html: str, name: str) -> bool:
    return re.search(r"""name\s*=\s*["']%s["']""" % re.escape(name), html, re.I) is not None


def _read_year(html: str) -> str:
    """Année lue dans le champ `anno` du formulaire de sauvegarde. Dernière année proposée (sélectionnée si
    indiquée), sinon l'année courante. Jamais une donnée : juste le contexte d'année de la sauvegarde."""
    sel = re.search(r"<select[^>]*\bname\s*=\s*[\"']anno[\"'][^>]*>(.*?)</select>", html, re.I | re.S)
    if sel:
        block = sel.group(1)
        chosen = re.search(r"<option[^>]*value\s*=\s*[\"'](\d{4})[\"'][^>]*\bselected", block, re.I)
        if chosen:
            return chosen.group(1)
        years = re.findall(r"<option[^>]*value\s*=\s*[\"'](\d{4})[\"']", block, re.I)
        if years:
            return max(years)
    inp = re.search(r"<input[^>]*\bname\s*=\s*[\"']anno[\"'][^>]*>", html, re.I)
    if inp:
        v = re.search(r"value\s*=\s*[\"'](\d{4})[\"']", inp.group(0), re.I)
        if v:
            return v.group(1)
    return str(datetime.now(timezone.utc).year)


class HotelDruidBackup:
    """Sauvegarde officielle de type HotelDruid : crea_backup.php, format « tagged-dump » compressé en gzip.

    Détection prudente : GET {base}/crea_backup.php ; le formulaire de CRÉATION (`crea_backup`, avec `azione`
    et `anno`) doit être présent. Le formulaire de téléchargement (`salva_backup`) n'apparaît qu'une fois une
    sauvegarde créée : il est vérifié APRÈS la préparation (POST crea_backup=1). Téléchargement : POST
    salva_backup=1 & compresso=SI → gzip, dont le contenu doit être une sauvegarde reconnue (<database>).
    Aucune donnée n'est lue ni devinée.
    """

    id = "hoteldruid_backup"
    label = "Sauvegarde officielle du logiciel"
    source_name = "sauvegarde-logiciel.db"
    output_format = "tagged-dump"

    def detect(self, http: Http, origin: str) -> Optional[Json]:
        url = f"{origin}/crea_backup.php"
        status, _ctype, body = http.get(url, timeout=DETECT_TIMEOUT_S, cap=MAX_PAGE)
        html = body.decode("utf-8", errors="replace")
        if not (_form_has_field(html, "crea_backup") and _form_has_field(html, "azione") and _form_has_field(html, "anno")):
            # Champs de sauvegarde absents : soit ce n'est pas ce mécanisme, soit une page de connexion
            # (on ne tente alors RIEN et on le signale, pas de contournement d'authentification).
            if _looks_like_login(html.lower()):
                raise ExportError("le mécanisme d'export demande une connexion", reason="needs_login")
            return None
        return {"url": url, "anno": _read_year(html)}

    def download(self, http: Http, params: Json) -> bytes:
        url, anno = params["url"], params["anno"]
        # L'hébergeur du logiciel peut servir deux requêtes successives par deux instances différentes (le fichier
        # de sauvegarde créé par l'une est absent de l'autre) : création puis téléchargement enchaînés, contenu
        # contrôlé (gzip d'une sauvegarde reconnue), jusqu'à 5 essais. Connexion exigée ou plafond : arrêt immédiat.
        last: Optional[ExportError] = None
        for attempt in range(5):
            try:
                return self._create_and_fetch(http, url, anno)
            except ExportError as e:
                if e.reason in ("needs_login", "too_large"):
                    raise
                last = e
                time.sleep(1.5)
        raise last or ExportError("sauvegarde non récupérée", reason="not_created")

    def _create_and_fetch(self, http: Http, url: str, anno: str) -> bytes:
        # 1. Préparation : le logiciel crée le fichier de sauvegarde (réponse « File created » ou équivalent).
        _status, _ctype, prep = http.post(
            url,
            {"anno": anno, "id_sessione": "", "azione": "SI", "crea_backup": "1"},
            timeout=PREPARE_TIMEOUT_S,
            cap=MAX_PAGE,
        )
        if _looks_like_login(prep.decode("utf-8", errors="replace").lower()):
            raise ExportError("la préparation renvoie une page de connexion", reason="needs_login")
        # 2. Téléchargement de la sauvegarde compressée, aussitôt.
        _status, ctype, data = http.post(
            url,
            {"anno": anno, "id_sessione": "", "azione": "SI", "mostra_header": "NO", "salva_backup": "1", "compresso": "SI"},
            timeout=DOWNLOAD_TIMEOUT_S,
            cap=MAX_COMPRESSED,
        )
        if not _is_gzip(data):
            if _looks_like_login(data[:4000].decode("utf-8", errors="replace").lower()):
                raise ExportError("le téléchargement renvoie une page de connexion", reason="needs_login")
            raise ExportError(f"réponse inattendue (type « {ctype or '?'} », non gzip)", reason="not_created")
        if not _decompressed_within(data, MAX_DECOMPRESSED):
            raise ExportError(f"sauvegarde décompressée au-delà du plafond ({MAX_DECOMPRESSED // (1024 * 1024)} Mo)", reason="too_large")
        try:
            head = gzip.GzipFile(fileobj=io.BytesIO(data)).read(MAX_PAGE)
        except OSError as exc:
            raise ExportError(f"archive gzip illisible ({type(exc).__name__})", reason="not_gzip") from exc
        if b"<database>" not in head and b"<backup>" not in head:
            raise ExportError("le fichier téléchargé n'est pas une sauvegarde reconnue", reason="unknown_format")
        return data


def _looks_like_login(text_lower: str) -> bool:
    """Indices d'une page de connexion (pour ne jamais tenter de contourner une authentification)."""
    hits = ("type=\"password\"", "type='password'", "name=\"password\"", "name='password'", "login", "connexion", "accesso", "autenticazione")
    return sum(h in text_lower for h in hits) >= 2


REGISTRY: List[Any] = [HotelDruidBackup()]


# --------------------------------------------------------------------------- conversion + dépôt

def _convert(gz_path: Path, db_path: Path) -> Json:
    """Convertit la sauvegarde en base SQLite via l'adaptateur du Studio. Renvoie son rapport JSON (comptes)."""
    if not CONVERT_SCRIPT.exists():
        raise ExportError(f"adaptateur introuvable : {CONVERT_SCRIPT}", reason="no_converter")
    proc = subprocess.run(
        [_node_bin(), "--no-warnings", str(CONVERT_SCRIPT), str(gz_path), str(db_path)],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if proc.returncode != 0 or not db_path.exists():
        raise ExportError(f"conversion échouée (code {proc.returncode})", reason="convert_failed")
    try:
        return json.loads(proc.stdout or "{}")
    except ValueError:
        return {}


def _counts_event(mechanism_label: str, mission_id: Optional[str], report: Json, source_meta: Json) -> Json:
    """Évènement de suivi : comptes SANS aucune donnée (noms de tables, lignes lues/écrites, exclusions, motifs)."""
    excluded = [{"table": str(x.get("table")), "reason": str(x.get("reason"))} for x in (report.get("excluded") or []) if isinstance(x, dict)]
    written = [{"table": str(w.get("table")), "rows": int(w.get("rows") or 0)} for w in (report.get("written") or []) if isinstance(w, dict)]
    data: Json = {
        "mechanism": mechanism_label,
        "tables_read": report.get("tables_read"),
        "rows_read": report.get("rows_read"),
        "rows_written": report.get("rows_written"),
        "rejected_rows": report.get("rejected_rows"),
        "tables_written": written,
        "excluded_tables": excluded,
        "removed_columns": [str(c) for c in (report.get("removed_columns") or [])],
        "source_id": source_meta.get("id"),
        "source_name": source_meta.get("name"),
    }
    if mission_id:
        data["mission_id"] = mission_id
    nb_tables = len(written)
    nb_rows = report.get("rows_written")
    title = f"Données récupérées automatiquement : {nb_tables} table(s), {nb_rows} ligne(s)"[:500]
    detail = f"Mécanisme : {mechanism_label}. Tables exclues (comptes, sessions, réglages) : {len(excluded)}. Aucune donnée dans ce journal."
    return {"source": "explorer", "type": "log", "title": title, "detail": detail[:5000], "data": data}


# --------------------------------------------------------------------------- point d'entrée

def recover(
    rb: Any,
    *,
    base_url: str,
    mission_id: Optional[str],
    project_id: Optional[str],
    investigation_id: Optional[str] = None,
    log: Callable[[str], None] = lambda _m: None,
    dry_run: bool = False,
) -> Json:
    """Tente une récupération automatique par un mécanisme d'export officiel, pendant le prêt de la mission.

    Renvoie un résumé : { recovered, mechanism?, reason, summary, counts? }. Ne lève jamais : toute erreur est
    consignée (sans secret) et rapportée au propriétaire par un évènement du projet. Le fichier converti est
    déposé au Studio ; le dossier temporaire est supprimé ensuite.
    """
    tag = " (jeu de test)" if dry_run else ""
    try:
        origin, _ = _origin(base_url)
    except ExportError as e:
        log(f"export : adresse inexploitable ({e.reason})")
        return {"recovered": False, "reason": e.reason, "summary": "adresse du projet inexploitable pour un export"}

    http = Http(origin)
    mech = None
    params = None
    for candidate in REGISTRY:
        try:
            params = candidate.detect(http, origin)
        except ExportError as e:
            # Détection impossible (connexion exigée, injoignable) : on le signale et on s'arrête proprement.
            if e.reason == "needs_login":
                _emit(rb, project_id, investigation_id, _login_event(mission_id))
                log("export : le logiciel demande une connexion — aucune tentative (le propriétaire peut déposer ses exports)")
                return {"recovered": False, "reason": "needs_login", "summary": "le logiciel demande une connexion : récupération non tentée"}
            log(f"export : détection impossible ({e.reason})")
            continue
        if params:
            mech = candidate
            break

    if not mech:
        _emit(rb, project_id, investigation_id, _none_event(mission_id))
        log("export : aucun export automatique reconnu")
        return {"recovered": False, "reason": "unrecognized", "summary": "aucun export automatique reconnu : le propriétaire peut déposer ses exports dans l'étape Données"}

    tmp = Path(tempfile.mkdtemp(prefix="reborn-export-"))
    try:
        data = mech.download(http, params)
        gz_path = tmp / "sauvegarde.gz"
        gz_path.write_bytes(data)
        db_path = tmp / "sauvegarde.db"
        report = _convert(gz_path, db_path)
        mechanism_label = f"{mech.label}, récupérée par l'agent d'exploration" + (f" (mission {mission_id})" if mission_id and _valid_mission(mission_id) else "")
        source_meta: Json = {}
        try:
            name = mech.source_name if not dry_run else f"jeu-de-test-{mech.source_name}"
            res = rb.migration_upload(str(db_path), mechanism=mechanism_label[:120], name=name)
            source_meta = (res or {}).get("source") or {}
        except Exception as e:  # noqa: BLE001 — jamais de secret dans le message
            log(f"export : dépôt refusé par le Studio ({type(e).__name__})")
            _emit(rb, project_id, investigation_id, _failed_event(mission_id, "dépôt refusé par le Studio"))
            return {"recovered": False, "reason": "deposit_failed", "mechanism": mech.label, "summary": "sauvegarde récupérée mais dépôt refusé par le Studio"}

        ev = _counts_event(mech.label + tag, mission_id, report, source_meta)
        if dry_run:
            ev["title"] = (ev["title"] + " — jeu de test")[:500]
        _emit(rb, project_id, investigation_id, ev)
        written = report.get("rows_written")
        tables = len(report.get("written") or [])
        excluded = len(report.get("excluded") or [])
        summary = f"sauvegarde officielle récupérée : {tables} table(s), {written} ligne(s), {excluded} table(s) exclue(s)"
        log(f"export : {summary}")
        return {
            "recovered": True,
            "mechanism": mech.label,
            "reason": "ok",
            "summary": summary + tag,
            "counts": {"tables": tables, "rows_written": written, "rows_read": report.get("rows_read"), "excluded": excluded, "source_id": source_meta.get("id")},
        }
    except ExportError as e:
        if e.reason == "needs_login":
            _emit(rb, project_id, investigation_id, _login_event(mission_id))
            log("export : le logiciel demande une connexion — aucune tentative")
            return {"recovered": False, "reason": "needs_login", "mechanism": mech.label, "summary": "le logiciel demande une connexion : récupération non tentée"}
        log(f"export : récupération interrompue ({e.reason})")
        _emit(rb, project_id, investigation_id, _failed_event(mission_id, str(e)))
        return {"recovered": False, "reason": e.reason, "mechanism": mech.label, "summary": f"récupération automatique interrompue ({e.reason})"}
    except Exception as e:  # noqa: BLE001
        log(f"export : erreur inattendue ({type(e).__name__})")
        _emit(rb, project_id, investigation_id, _failed_event(mission_id, "erreur inattendue"))
        return {"recovered": False, "reason": "error", "mechanism": mech.label if mech else None, "summary": "récupération automatique en échec"}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- évènements de suivi (sans donnée)

def _valid_mission(mission_id: str) -> bool:
    return bool(re.match(r"^MIS_[a-f0-9]{10}$", mission_id or ""))


def _base_event(mission_id: Optional[str], title: str, detail: str) -> Json:
    ev: Json = {"source": "explorer", "type": "log", "title": title[:500], "detail": detail[:5000], "data": {}}
    if mission_id:
        ev["data"]["mission_id"] = mission_id
    return ev


def _none_event(mission_id: Optional[str]) -> Json:
    return _base_event(
        mission_id,
        "Aucun export automatique reconnu",
        "Aucun mécanisme d'export officiel reconnu sur ce logiciel. Le propriétaire peut déposer ses exports dans l'étape Données.",
    )


def _login_event(mission_id: Optional[str]) -> Json:
    return _base_event(
        mission_id,
        "Export automatique non tenté : connexion requise",
        "Le mécanisme d'export du logiciel demande une connexion. Aucune tentative n'est faite (pas de contournement d'authentification) ; le propriétaire peut déposer ses exports dans l'étape Données.",
    )


def _failed_event(mission_id: Optional[str], reason: str) -> Json:
    return _base_event(
        mission_id,
        "Récupération automatique des données en échec",
        f"La récupération par le mécanisme d'export officiel n'a pas abouti ({reason}). Le propriétaire peut déposer ses exports dans l'étape Données. Aucune donnée n'a été journalisée.",
    )


def _emit(rb: Any, project_id: Optional[str], investigation_id: Optional[str], event: Json) -> None:
    """Envoie un évènement de suivi au projet. Ne lève jamais (la récupération ne doit pas casser la mission)."""
    try:
        rb.emit([event], investigation_id=investigation_id)
    except Exception as e:  # noqa: BLE001
        # Pas de secret : seul le type d'erreur est tracé par l'appelant via son propre journal.
        pass
