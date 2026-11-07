#!/usr/bin/env python3
"""
Exemple exécutable — Mouss (Explorer, agent Computer Use) → REBORN Studio.

Ce que fait l'exécuteur de l'agent, sans l'agent lui-même :
  1. récupère la mission du projet (cible, objectifs, contraintes) ;
  2. rapporte l'état de connexion (en attente → connecté) ;
  3. rattache une investigation au projet et y publie une observation ;
  4. dépose un export obtenu (ici un petit CSV DE TEST, étiqueté comme tel).

    REBORN_URL=http://127.0.0.1:3000 REBORN_PROJECT=MIG_xxxxxxxx python3 clients/examples/mouss_connexion.py
    (sans REBORN_PROJECT : un projet de démonstration est créé)

Les identifiants de l'ancien logiciel ne sont jamais demandés ici : en production, l'exécuteur
appelle take_mission() puis redeem_credentials(jeton) dans son code technique, sans jamais les
transmettre au modèle ni les journaliser.
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from reborn_client import Reborn, RebornError  # noqa: E402


def main() -> int:
    rb = Reborn()
    try:
        print("Studio :", rb.health().get("service"), "· contrats", rb.health().get("contract_version"))
        if not rb.project:
            p = rb.create_project("Démo intégration Mouss", authorized_by="Exemple Mouss", software="Logiciel de test", legacy_url="http://127.0.0.1:4100")
            print("Projet créé :", p["id"])
        mission = rb.mission()
        print("Mission :", mission["contract"], mission["contract_version"], "· cible :", mission["target"]["url"])
        print("  contraintes :", len(mission["constraints"]), "· points de rapport :", ", ".join(mission["report"].keys()))
        rb.report_connection("pending", "Ouverture de la page de connexion")
        state = rb.report_connection("connected", "Session ouverte avec le compte fourni (exemple)")
        print("État du projet :", state["project"]["status"], "—", state["project"]["status_label"])
        inv = rb.start_investigation(application=mission["target"]["software"] or "Logiciel", module="Découverte", mode="live")
        print("Investigation rattachée :", inv["id"], "· projet", inv.get("project_id"))
        rb.complete(inv["id"])
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "exemple_clients_TEST.csv")
            with open(path, "w", encoding="utf-8") as f:
                f.write("id;nom;ville\n1;Exemple SARL (TEST);Lyon\n2;Démo SAS (TEST);Nantes\n")
            src = rb.migration_upload(path, mechanism="export CSV (exemple de test)")
            print("Export déposé :", src["source"]["name"], "· SHA-256", src["source"]["sha256"][:12], "·", src["source"]["tables"][0]["rows"], "lignes")
        print("Projet :", rb.project_details()["project"]["status_label"])
        return 0
    except RebornError as e:
        print("Erreur :", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
