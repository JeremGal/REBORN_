#!/usr/bin/env python3
"""
Exemple exécutable — Alan (Analyste) → REBORN Studio : correspondances puis modèle métier.

  1. publie les correspondances ancien → nouveau (contrat migration_mapping) ;
  2. publie le modèle métier exécutable (contrat business_model : modules de règles + liaisons) ;
  3. affiche les problèmes détectés et l'état « à valider » (un responsable valide dans le Studio,
     après vérification du modèle sur l'historique migré).

Données : les JEUX DE TEST Relatio 2004 du dépôt (platform/scenarios/crm/), au format d'Alan.

    REBORN_URL=http://127.0.0.1:3000 REBORN_TOKEN=<jeton analyst> REBORN_PROJECT=MIG_xxxxxxxx \
      python3 clients/examples/alan_modele_metier.py

REBORN_TOKEN : jeton de service de l'Analyste (npm run token -- analyst le copie, jamais affiché).
REBORN_PROJECT : projet obligatoire (aucun « projet courant » pour un agent).
"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
from reborn_client import Reborn, RebornError  # noqa: E402

SCENARIO = os.path.join(HERE, "..", "..", "platform", "scenarios", "crm")


def main() -> int:
    rb = Reborn()
    if not rb.project:
        print("Définissez REBORN_PROJECT (projet contenant les données extraites de Relatio 2004).", file=sys.stderr)
        return 2
    if not rb.token:
        print("Définissez REBORN_TOKEN (jeton de l'Analyste : npm run token -- analyst le copie).", file=sys.stderr)
        return 2
    try:
        with open(os.path.join(SCENARIO, "mapping.json"), encoding="utf-8") as f:
            mapping = json.load(f)
        m = rb.migration_publish_mapping(mapping)
        print(f"Correspondances v{m['version']} : {len(m['issues'])} problème(s), {m['review']['pending']} point(s) à valider")
        with open(os.path.join(SCENARIO, "business-model.json"), encoding="utf-8") as f:
            model = json.load(f)
        r = rb.publish_business_model(model)
        errors = [i for i in r["issues"] if i["level"] == "error"]
        print(f"Modèle métier v{r['version']} reçu — statut {r['status']}, {len(errors)} erreur(s) bloquante(s)")
        for i in r["issues"][:10]:
            print(f"  [{i['level']}] {i['path']} : {i['message']}")
        print("Versions :", [(v["version"], v["status"]) for v in rb.business_models()])
        return 0
    except RebornError as e:
        print("Erreur :", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
