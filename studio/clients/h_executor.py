#!/usr/bin/env python3
"""Exécuteur H Company pour la file des missions du Studio (côté Mouss, écrit hors de son dossier).

Branche le véritable agent H Company (h-explorer_v2, importé SANS le modifier) sur « Analyser mon
logiciel » du Studio : battement de cœur, prise atomique d'une mission, remise des identifiants (hors de
toute consigne : coffre H puis suppression), exploration réelle en lecture seule, rapports de connexion,
envoi de la carte et des observations, proposition d'un plan d'extraction à valider, fin de mission.

    REBORN_URL=http://127.0.0.1:3000 REBORN_TOKEN=<jeton explorer> REBORN_EXECUTOR_ID=poste-mouss-1 \
      python3 clients/h_executor.py                 # exploration réelle (clé H dans HAI_API_KEY ou h-explorer_v2/.env)
    ... python3 clients/h_executor.py --replay clients/examples/replay/hotel   # doublure : rejoue des sorties ENREGISTRÉES

Jetons / adresses (SPEC-5) : REBORN_TOKEN = jeton explorer du Studio, REBORN_URL = adresse du Studio.
La clé H est lue par l'explorateur dans HAI_API_KEY ou h-explorer_v2/.env ; elle n'est jamais affichée.

Codes de sortie : 0 mission menée · 3 aucune mission en file · 4 mission rendue en échec (proprement) ·
2 refus de démarrer (configuration) · 1 erreur inattendue.
"""
from __future__ import annotations

# Linkup et cadre légal coupés AVANT tout import de l'explorateur (pas de recherche web sur le logiciel
# d'un client) : explorer.explorer lit REBORN_CONTEXT, explorer.reporter lit REBORN_LEGAL à l'import.
import os as _os

_os.environ["REBORN_CONTEXT"] = "0"
_os.environ["REBORN_LEGAL"] = "0"

import argparse
import json
import os
import re
import shutil
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(__file__))
from reborn_client import Reborn, RebornError  # noqa: E402
import h_adapter as A  # noqa: E402

Json = Dict[str, Any]

REPO = Path(__file__).resolve().parents[2]
HEXP_ROOT = REPO / "h-explorer_v2"
VAULT_NAME = "reborn-logins"  # même coffre interne que h-explorer_v2/explorer/vault.py (non modifié)
HEARTBEAT_EVERY_S = 15.0       # < 20 s (renouvellement du prêt exigé par le Studio)
DOUBLURE = "(doublure — jeu de test)"


def log(msg: str) -> None:
    print(f"[exécuteur] {msg}", flush=True)


# --------------------------------------------------------------------------- clé H

def h_api_key() -> Optional[str]:
    """HAI_API_KEY, sinon le premier « hk-… » d'un h-explorer_v2/.env (format libre). Jamais affichée."""
    key = os.environ.get("HAI_API_KEY")
    if key:
        return key
    env = HEXP_ROOT / ".env"
    if env.exists():
        m = re.search(r"\bhk-[A-Za-z0-9_\-]+", env.read_text(encoding="utf-8", errors="ignore"))
        if m:
            return m.group(0)
    return None


# --------------------------------------------------------------------------- coffre H (identifiants)

class Vault:
    """Élément du coffre H créé en mémoire juste avant la session et supprimé juste après (jamais de
    valeur dans une consigne, un journal ou un fichier). Reprend le coffre « reborn-logins » d'Elias."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None
        self.vault_id: Optional[str] = None
        self.item_id: Optional[str] = None
        self.deleted = False

    def put(self, origin: str, username: str, password: str) -> str:
        from hai_agents import Client, VaultCreateRequestProviderConfig_Internal

        self._client = Client(api_key=self.api_key)
        vault = next((v for v in (self._client.vaults.list_vaults(limit=100).vaults or []) if v.name == VAULT_NAME), None)
        if vault is None:
            vault = self._client.vaults.create_vault(name=VAULT_NAME, provider_config=VaultCreateRequestProviderConfig_Internal())
        item = self._client.vaults.create_vault_item(vault.id, name=f"mission {origin}", urls=[origin], values={"username": username, "password": password})
        self.vault_id, self.item_id = vault.id, item.id
        return vault.id

    def delete(self) -> bool:
        if self._client and self.vault_id and self.item_id and not self.deleted:
            try:
                self._client.vaults.delete_vault_item(self.vault_id, self.item_id)
                self.deleted = True
            except Exception as exc:  # noqa: BLE001
                log(f"coffre H : suppression de l'élément impossible ({type(exc).__name__})")
        return self.deleted


# --------------------------------------------------------------------------- envoi au Studio

def propose_extraction_plan(rb: Reborn, plan: Json, project_id: str) -> str:
    """Envoie le plan 1.1 PROPOSÉ. Route attendue : POST /api/migration/extraction-plan?project=… Si elle
    n'existe pas encore (404/405), on consigne le plan dans le journal du projet (« à valider »), sans
    secret : il reste visible du propriétaire. Renvoie « route » ou « journal »."""
    try:
        rb.propose_extraction_plan(plan, project_id)
        return "route"
    except RebornError as e:
        if e.status in (404, 405):
            rb.log("Plan d'extraction proposé (à valider)", json.dumps(plan, ensure_ascii=False)[:5000], source="explorer")
            return "journal"
        raise


def send_exploration(rb: Reborn, exploration: Json, mission: Json, *, dry_run: bool = False) -> Json:
    """Carte → évènements (une page par évènement) + UN schéma d'écran ; renvoie un petit résumé."""
    mid, inv = mission["mission_id"], mission.get("investigation_id")
    app_map = exploration.get("app_map") if isinstance(exploration.get("app_map"), dict) else exploration
    app_map = app_map or {}
    events = A.app_map_to_events(exploration, mid, inv)
    if dry_run:
        for ev in events:
            ev["title"] = f"{ev['title']} {DOUBLURE}"[:500]
    sent, refused = 0, []
    if events:
        try:
            rb.emit(events, investigation_id=inv)  # une page par évènement (form_discovered / log)
            sent = len(events)
        except RebornError as e:
            # Lot refusé : on renvoie un par un pour garder ce qui est conforme, et on consigne le refus exact.
            log(f"lot d'évènements refusé : HTTP {e.status} {str(e)[:300]}")
            for ev in events:
                try:
                    rb.emit([ev], investigation_id=inv)
                    sent += 1
                except RebornError as e1:
                    refused.append(f"{ev.get('type')} « {str(ev.get('title', ''))[:60]} » : HTTP {e1.status} {str(e1)[:200]}")
    screen = A.pick_screen(app_map)
    schema_version = None
    if screen is not None:
        schema = A.screen_to_app_schema(screen, app_map, mid, inv)
        if schema:
            if dry_run:
                schema["title"] = f"{schema.get('title', 'Écran')} {DOUBLURE}"
            try:
                schema_version = rb.publish_schema(schema, investigation_id=inv).get("version")
            except RebornError as e:
                refused.append(f"schéma d'écran « {schema.get('title', '')} » : HTTP {e.status} {str(e)[:200]}")
    for r in refused:
        log(f"envoi refusé par le Studio — {r}")
    return {"events": sent, "refused": len(refused), "screen_schema_version": schema_version, "screen": (screen or {}).get("name")}


def send_observations(rb: Reborn, experiments: List[Json], mission: Json, *, dry_run: bool = False) -> int:
    mid, inv = mission["mission_id"], mission.get("investigation_id")
    items = []
    for exp in experiments or []:
        obs = A.experiment_to_observation(exp, mid, inv)
        if dry_run:
            obs.setdefault("note", DOUBLURE)
        items.append(obs)
    if items:
        rb.observations(items, investigation_id=inv)
    return len(items)


# --------------------------------------------------------------------------- exploration réelle (H)

def explore_real(url: str, vault_id: Optional[str], timeout_s: float) -> Json:
    """Exploration réelle par l'agent H (explore_app de h-explorer_v2, navigateur cloud). Jamais de
    recherche web (REBORN_CONTEXT=0, posé à l'import). Ne lève pas : renvoie la sortie JSON de l'explorateur."""
    os.environ["REBORN_BROWSER"] = "cloud"  # navigateur hébergé : nécessaire au coffre H (fill_secret_at)
    sys.path.insert(0, str(HEXP_ROOT))
    from explorer.mapper import explore_app  # import tardif : pas de SDK requis en mode --replay

    return explore_app(url, timeout_s=timeout_s, vault_id=vault_id)


def read_export_forms(url: str, export_pages: List[Json], timeout_s: float) -> List[Json]:
    """Expérience ciblée : l'agent LIT (sans cliquer sur un bouton d'action) la méthode, l'adresse et les
    champs des formulaires d'export repérés. Renvoie des mécanismes pour build_extraction_plan."""
    sys.path.insert(0, str(HEXP_ROOT))
    from pydantic import BaseModel, Field  # noqa: E402
    from explorer.explorer import run_ui_experiment  # noqa: E402

    class _Field(BaseModel):
        name: str = ""
        value: str = ""

    class _Form(BaseModel):
        label: str = ""
        method: str = "GET"
        action_url: str = ""
        role: str = Field(default="download", description="prepare | download")
        fields: List[_Field] = Field(default_factory=list)

    class _Forms(BaseModel):
        forms: List[_Form] = Field(default_factory=list)
        notes: str = ""

    pages = "; ".join(f"{p.get('name')} ({p.get('url')})" for p in export_pages[:8])
    instruction = (
        "You are inspecting export/backup screens of a legacy web app, READ-ONLY. "
        f"Visit these screens: {pages}. For each export or backup FORM, read (do NOT click any action/submit "
        "button, do NOT download anything, do NOT change data) its HTTP method, its form action URL, and the "
        "name and current value of every field (including hidden fields). If one form only PREPARES a file "
        "(e.g. 'create backup') and another DOWNLOADS it, set role='prepare' or role='download' accordingly. "
        "Report the forms exactly as written in the page source."
    )
    res = run_ui_experiment(url, instruction, _Forms, {"task": "read_export_forms"}, application="export",
                            module="export", timeout_s=timeout_s)
    out = res.get("observed_output") or {}
    forms = out.get("forms") or []
    mechs: List[Json] = []
    for i, f in enumerate(forms):
        if not isinstance(f, dict) or not f.get("action_url"):
            continue
        fields = {str(x.get("name")): str(x.get("value", "")) for x in (f.get("fields") or []) if isinstance(x, dict) and x.get("name")}
        role = str(f.get("role") or "download").lower()
        mech: Json = {
            "id": A._slug(f.get("label") or f"export_{i + 1}"),
            "label": f.get("label") or "Export",
            "url": f.get("action_url"),
            "method": f.get("method") or "GET",
            "form": fields,
            "kind": "database" if "backup" in (f.get("label") or "").lower() or role == "download" and len(fields) > 1 else "export",
        }
        if role == "prepare":
            mech["note"] = "Préparation seulement (ne télécharge pas)"
        mechs.append(mech)
    # Replie les « prepare » dans le mécanisme de téléchargement correspondant (même adresse).
    prepares = [m for m in mechs if "Préparation" in (m.get("note") or "")]
    downloads = [m for m in mechs if m not in prepares]
    for d in downloads:
        same = [{"url": p["url"], "method": p.get("method", "POST"), "form": p.get("form", {})} for p in prepares if p["url"] == d["url"]]
        if same:
            d["prepare"] = same
    return downloads or mechs


# --------------------------------------------------------------------------- purge locale

def purge_local(ids: List[str]) -> int:
    """Supprime les fichiers que l'explorateur a écrits pour CETTE mission (explorations/experiments +
    artifacts/<id>). Renvoie le nombre de chemins supprimés. Ne lève jamais."""
    removed = 0
    for i in ids or []:
        for p in [HEXP_ROOT / "explorations" / f"{i}.json", HEXP_ROOT / "experiments" / f"{i}.json", HEXP_ROOT / "artifacts" / i]:
            try:
                if p.is_dir():
                    shutil.rmtree(p)
                    removed += 1
                elif p.exists():
                    p.unlink()
                    removed += 1
            except Exception:  # noqa: BLE001
                pass
    return removed


# --------------------------------------------------------------------------- doublure (--replay)

def load_replay(folder: str) -> Json:
    """Charge des sorties d'explorateur ENREGISTRÉES (jeu de test). Attendu : map.json (sortie explore_app
    ou app_map) ; facultatifs experiments.json (liste) et meta.json ({connection, plan_mechanisms, system})."""
    d = Path(folder)
    if not d.is_dir():
        raise RebornError(f"--replay : dossier introuvable : {folder}")
    read = lambda name: json.loads((d / name).read_text(encoding="utf-8")) if (d / name).exists() else None
    mp = read("map.json") or read("exploration.json")
    if mp is None:
        raise RebornError(f"--replay : map.json manquant dans {folder}")
    return {"map": mp, "experiments": read("experiments.json") or [], "meta": read("meta.json") or {}}


# --------------------------------------------------------------------------- une mission

def run_mission(rb: Reborn, mission: Json, *, replay: Optional[Json], api_key: Optional[str], heartbeat_ctl: "Heartbeat") -> int:
    mid, pid = mission["mission_id"], mission["project_id"]
    target = mission.get("target") or {}
    url = (target.get("url") or "").rstrip("/")
    dry = replay is not None
    tag = f" {DOUBLURE}" if dry else ""
    rb.use_project(pid)
    heartbeat_ctl.active(mid)
    cred = mission.get("credential") or {}
    has_creds = bool(cred.get("token"))
    max_dur = ((mission.get("limits") or {}).get("max_duration_s")) or 900
    timeout_s = float(min(int(max_dur), 900))
    vault = None
    local_ids: List[str] = []
    outcome, detail = "failed", "non menée"

    try:
        rb.report_connection("pending", f"Ouverture de l'ancien logiciel{tag}", pid, mission_id=mid)

        # --- identifiants : remis hors de toute consigne (coffre H), supprimés à la fin ---
        vault_id = None
        if has_creds:
            if dry:
                creds = rb.redeem_credentials(cred["token"], pid, mid)
                creds.clear()  # protocole exercé ; la doublure ne se connecte pas réellement
            else:
                if not api_key:
                    rb.report_connection("failed", "clé H Company absente", pid, mission_id=mid)
                    rb.complete_mission(mid, "failed", "clé H Company absente", h_vault_item_deleted=False, local_artifacts_purged=True)
                    log("clé H Company absente")
                    return 4
                creds = rb.redeem_credentials(cred["token"], pid, mid)
                vault = Vault(api_key)
                try:
                    origin = _origin(url)
                    vault_id = vault.put(origin, creds["username"], creds["password"])
                finally:
                    creds.clear()

        # --- exploration ---
        if dry:
            exploration = replay["map"]
            connection = (replay["meta"].get("connection") or "connected").lower()
        else:
            exploration = explore_real(url, vault_id, timeout_s)
            if exploration.get("exploration_id"):
                local_ids.append(exploration["exploration_id"])
            connection = "connected" if exploration.get("status") == "success" and exploration.get("app_map") else "failed"

        if connection == "mfa_required":
            rb.report_connection("mfa_required", f"Double authentification demandée — intervention du propriétaire{tag}", pid, mission_id=mid)
            rb.complete_mission(mid, "failed", f"Double authentification requise{tag}", h_vault_item_deleted=bool(vault and vault.delete()), local_artifacts_purged=True)
            return 4
        if connection != "connected":
            reason = (exploration.get("error") if not dry else replay["meta"].get("reason")) or "exploration non aboutie"
            rb.report_connection("failed", f"{reason}{tag}"[:1000], pid, mission_id=mid)
            rb.complete_mission(mid, "failed", f"{reason}{tag}"[:1000], h_vault_item_deleted=bool(vault and vault.delete()), local_artifacts_purged=bool(purge_local(local_ids)) or True)
            return 4

        detail_seen = "Espace authentifié affiché" if has_creds else "Page d'accueil de l'application affichée"
        rb.report_connection("connected", f"{detail_seen}{tag}", pid, mission_id=mid)

        # --- envoi de la carte et des observations ---
        summary = send_exploration(rb, exploration, mission, dry_run=dry)
        n_obs = send_observations(rb, replay["experiments"] if dry else [], mission, dry_run=dry)

        # --- plan d'extraction proposé (à valider) ---
        app_map = exploration.get("app_map") if isinstance(exploration.get("app_map"), dict) else exploration
        export_pages = A.find_export_pages(app_map or {})
        plan_route = None
        if dry:
            mechs = replay["meta"].get("plan_mechanisms") or []
            system = replay["meta"].get("system") or target.get("software") or "Logiciel exploré"
        elif export_pages:
            try:
                mechs = read_export_forms(url, export_pages, timeout_s)
            except Exception as exc:  # noqa: BLE001
                mechs = []
                log(f"lecture des formulaires d'export impossible ({type(exc).__name__})")
            system = target.get("software") or (app_map or {}).get("app_summary") or "Logiciel exploré"
        else:
            mechs, system = [], target.get("software") or "Logiciel exploré"
        if mechs:
            who = f"Agent H (exécuteur {rb.executor_id or 'default'}){' — jeu de test' if dry else ''}"
            plan = A.build_extraction_plan(system, url, mechs, who, mission_id=mid)
            plan_route = propose_extraction_plan(rb, plan, pid)

        # --- fin de mission ---
        purged = bool(purge_local(local_ids)) or True
        vault_deleted = vault.delete() if vault else None
        detail = f"Carte : {summary['events']} évènement(s), écran « {summary.get('screen')} »" + (f", {n_obs} observation(s)" if n_obs else "") + (f", plan d'extraction proposé ({plan_route})" if plan_route else "") + tag
        rb.complete_mission(mid, "completed", detail[:1000], h_vault_item_deleted=vault_deleted, local_artifacts_purged=purged)
        heartbeat_ctl.done(mid)
        log(f"mission {mid} terminée : {detail}")
        return 0

    except RebornError as e:
        # Perte du prêt / adresse modifiée / projet en pause : on s'arrête proprement.
        lost = e.status in (403, 409)
        log(f"mission {mid} interrompue : HTTP {e.status or '?'} ({'prêt perdu' if lost else 'erreur Studio'})")
        if not lost:
            try:
                rb.complete_mission(mid, "failed", f"Interrompue : {str(e)[:300]}{tag}", h_vault_item_deleted=bool(vault and vault.delete()), local_artifacts_purged=bool(purge_local(local_ids)) or True)
            except RebornError:
                pass
        if vault:
            vault.delete()
        purge_local(local_ids)
        return 4
    finally:
        if vault and not vault.deleted:
            vault.delete()
        heartbeat_ctl.done(mid)


def _origin(url: str) -> str:
    from urllib.parse import urlsplit

    s = urlsplit(url if "://" in url else f"https://{url}")
    return f"{s.scheme}://{s.netloc}"


# --------------------------------------------------------------------------- battement de cœur

class Heartbeat:
    """Fil de battement toutes les 15 s (< 20 s). Déclare les réseaux joignables et le mode de saisie des
    identifiants hors du modèle ; renouvelle le prêt des missions en cours."""

    def __init__(self, rb: Reborn, networks: List[str], login: str, label: str):
        self.rb, self.networks, self.login, self.label = rb, networks, login, label
        self._active: set = set()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.executor_id: Optional[str] = None
        self.lock = threading.Lock()

    def beat(self) -> Json:
        with self.lock:
            active = sorted(self._active)
        hb = self.rb.heartbeat(self.networks, self.login, max_concurrent=1, active_missions=active, label=self.label)
        self.executor_id = hb.get("executor_id")
        return hb

    def active(self, mid: str) -> None:
        with self.lock:
            self._active.add(mid)

    def done(self, mid: str) -> None:
        with self.lock:
            self._active.discard(mid)

    def start(self) -> None:
        def loop():
            while not self._stop.wait(HEARTBEAT_EVERY_S):
                try:
                    self.beat()
                except RebornError:
                    pass
        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)


# --------------------------------------------------------------------------- main

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Exécuteur H Company pour la file des missions du Studio.")
    ap.add_argument("--replay", metavar="DOSSIER", help="doublure : rejoue des sorties d'explorateur enregistrées (jeu de test), sans appeler H")
    ap.add_argument("--wait", type=float, default=0.0, help="secondes d'attente d'une mission en file (défaut 0 : une seule tentative)")
    args = ap.parse_args(argv)

    replay = None
    if args.replay:
        try:
            replay = load_replay(args.replay)
        except RebornError as e:
            print(f"[exécuteur] refus de démarrer : {e}", file=sys.stderr)
            return 2

    rb = Reborn(executor_id=os.environ.get("REBORN_EXECUTOR_ID") or "poste-mouss-1")
    if not rb.token:
        print("[exécuteur] refus de démarrer : REBORN_TOKEN (jeton explorer du Studio) requis", file=sys.stderr)
        return 2

    api_key = None if replay else h_api_key()
    runtime_local = os.environ.get("REBORN_RUNTIME") == "local"
    networks = ["public", "private"] if (runtime_local or replay) else ["public"]
    login = "cdp" if (runtime_local or replay) else ("h_vault" if api_key else "none")
    label = ("doublure d'exécuteur — jeu de test" if replay else f"agent H — {rb.executor_id}")
    hb = Heartbeat(rb, networks, login, label)

    try:
        info = hb.beat()
        log(f"battement accepté · exécuteur {info.get('executor_id')} · prêt {info.get('lease_s')} s · à renouveler sous {info.get('renew_within_s')} s")
    except RebornError as e:
        print(f"[exécuteur] Studio injoignable ou jeton refusé : {e}", file=sys.stderr)
        return 1

    hb.start()
    try:
        deadline = time.monotonic() + max(0.0, args.wait)
        mission = None
        while True:
            try:
                mission = rb.claim_mission()
            except RebornError as e:
                if e.status == 409 and time.monotonic() < deadline:  # pas de battement récent : on en refait un
                    hb.beat()
                    time.sleep(1)
                    continue
                if e.status == 409:
                    hb.beat()  # une dernière prise après un battement frais
                    mission = rb.claim_mission()
                else:
                    raise
            if mission or time.monotonic() >= deadline:
                break
            time.sleep(2)
        if not mission:
            log("aucune mission en file")
            return 3
        log(f"mission {mission['mission_id']} prise · projet {mission['project_id']} · réseau {mission.get('requires_network')}" + (f" {DOUBLURE}" if replay else ""))
        return run_mission(rb, mission, replay=replay, api_key=api_key, heartbeat_ctl=hb)
    except RebornError as e:
        print(f"[exécuteur] erreur : {e}", file=sys.stderr)
        return 1
    finally:
        hb.stop()


if __name__ == "__main__":
    sys.exit(main())
