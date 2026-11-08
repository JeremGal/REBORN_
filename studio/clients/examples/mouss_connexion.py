#!/usr/bin/env python3
"""
JEU DE TEST — doublure de l'exécuteur de Mouss (agent Computer Use), pour une PILE ISOLÉE uniquement.

Ce n'est PAS l'agent : aucun modèle, aucune exploration. Elle déroule le protocole de l'exécuteur
(client 1.2) avec une VRAIE connexion quand elle sait la faire, et ne déclare jamais « connected »
sans l'avoir constatée :
  1. battement de cœur (réseaux joignables, identifiants saisis hors de tout modèle : « cdp ») ;
  2. prise d'une mission dans la file (ou de celle de REBORN_PROJECT : compatibilité 1.0 take_mission) ;
  3. remise unique des identifiants par le jeton de la mission (jamais affichés ni journalisés) ;
  4. connexion RÉELLE à l'ancien logiciel uniquement s'il s'agit du logiciel de test Relatio 2004
     (formulaire /login, puis lecture d'une page authentifiée, puis déconnexion) ; pour tout autre logiciel,
     rapport « human_needed » : la doublure ne sait pas s'y connecter ;
  5. fin de mission : « completed » seulement si la connexion a réellement réussi, « failed » sinon,
     avec confirmation qu'aucun fichier local n'a été conservé (aucun n'est écrit).

Refuse de s'exécuter sans REBORN_TEST_STACK=1, sans REBORN_URL explicite, ou vers le port 3000 (Studio
en service : de vraies missions de clients y attendent).

    REBORN_TEST_STACK=1 REBORN_URL=http://127.0.0.1:4700 REBORN_TOKEN=<jeton explorer de la pile isolée> \\
      REBORN_EXECUTOR_ID=doublure-test python3 clients/examples/mouss_connexion.py

Code de sortie : 0 mission menée et connexion réelle constatée · 3 aucune mission en file ·
4 mission menée sans connexion (échec ou logiciel inconnu, rapporté honnêtement) · 2 refus de démarrer · 1 erreur.
"""
import http.cookiejar
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from reborn_client import Reborn, RebornError  # noqa: E402

LABEL = "doublure d'exécuteur — jeu de test"


def refuse(msg: str) -> None:
    print(f"[jeu de test] refus de démarrer : {msg}", file=sys.stderr)
    sys.exit(2)


def check_isolated_stack() -> None:
    url = os.environ.get("REBORN_URL")
    if os.environ.get("REBORN_TEST_STACK") != "1":
        refuse("REBORN_TEST_STACK=1 requis (doublure réservée à une pile isolée)")
    if not url:
        refuse("REBORN_URL explicite requis (adresse de la pile isolée)")
    parts = urllib.parse.urlsplit(url)
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port == 3000:
        refuse("le port 3000 est celui du Studio en service : jamais la doublure contre de vraies missions")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401 - API urllib
        return None


def relatio_login(base: str, username: str, password: str, timeout: float = 10.0) -> bool:
    """Connexion RÉELLE au logiciel de test Relatio 2004 : formulaire, cookie de session, page authentifiée."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), _NoRedirect())
    form = urllib.parse.urlencode({"utilisateur": username, "motdepasse": password}).encode()
    try:
        opener.open(urllib.request.Request(base + "/login", data=form, method="POST"), timeout=timeout)
    except urllib.error.HTTPError as e:
        if e.code != 302:
            return False
    if not any(c.name == "RELATIOSESSID" for c in jar):
        return False
    try:
        with opener.open(base + "/", timeout=timeout) as r:
            page = r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return False
    authenticated = "Déconnexion" in page and "Utilisateur :" in page
    try:  # la session ouverte dans l'ancien logiciel est refermée
        opener.open(base + "/logout", timeout=timeout)
    except urllib.error.HTTPError:
        pass
    return authenticated


def main() -> int:
    check_isolated_stack()
    rb = Reborn(executor_id=os.environ.get("REBORN_EXECUTOR_ID") or "doublure-jeu-de-test")
    try:
        hb = rb.heartbeat(networks=["public", "private"], login="cdp", max_concurrent=1, label=LABEL)
        print(f"[jeu de test] battement accepté · exécuteur {hb['executor_id']} · à renouveler sous {hb['renew_within_s']} s")
        mission = rb.take_mission(rb.project) if rb.project else rb.claim_mission()
        if not mission:
            print("[jeu de test] aucune mission en file")
            return 3
        mid, pid = mission["mission_id"], mission["project_id"]
        target = mission["target"]
        print(f"[jeu de test] mission {mid} prise · projet {pid} · contrat {mission['contract']} {mission['contract_version']} · réseau {mission['requires_network']}")
        rb.heartbeat(networks=["public", "private"], login="cdp", active_missions=[mid], label=LABEL)
        rb.report_connection("pending", "Ouverture de la page de connexion (jeu de test)", pid, mission_id=mid)

        connected = False
        is_test_software = bool(re.search(r"relatio", target.get("software") or "", re.I)) and bool(target.get("url"))
        if not mission.get("credential") or not mission["credential"].get("token"):
            rb.report_connection("human_needed", "Mission sans identifiants : la doublure ne sait pas explorer sans compte", pid, mission_id=mid)
        elif not is_test_software:
            rb.report_connection("human_needed", "Logiciel inconnu de la doublure de test : aucune connexion tentée", pid, mission_id=mid)
        else:
            creds = rb.redeem_credentials(mission["credential"]["token"], pid, mid)
            try:
                connected = relatio_login(target["url"].rstrip("/"), creds["username"], creds["password"])
            finally:
                creds.clear()  # jamais conservés, jamais affichés
            if connected:
                rb.report_connection("connected", "Page authentifiée du logiciel de test affichée (jeu de test)", pid, mission_id=mid)
            else:
                rb.report_connection("failed", "Connexion refusée par le logiciel de test", pid, mission_id=mid)

        done = rb.complete_mission(mid, "completed" if connected else "failed", "Doublure d'exécuteur (jeu de test) : connexion seule, aucune exploration", h_vault_item_deleted=None, local_artifacts_purged=True)
        print(f"[jeu de test] mission close : {done['mission']['status']} · identifiants effacés côté Studio : {'oui' if done['credentials']['revoked_at'] else 'non'}")
        return 0 if connected else 4
    except RebornError as e:
        print(f"[jeu de test] erreur : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
