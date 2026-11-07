# Morel CRM

Logiciel métier généré par REBORN Studio le 07/11/2026 17:04:11 à partir des données de **Relatio 2004** (migration RUN_001).

Il fonctionne seul : Node 22.13 ou plus récent, aucune dépendance, aucune connexion à REBORN ni à l'ancien logiciel.

```bash
npm start                 # http://127.0.0.1:5050
PORT=8080 HOST=0.0.0.0 npm start
```

| Élément | Emplacement |
|---|---|
| Base de données (SQLite) | `data/app.db` |
| Pièces jointes (nommées par empreinte SHA-256) | `files/` |
| Sauvegardes | `backups/` (avant chaque mise en service et à la demande) |
| Description du logiciel (entités, champs, relations, règles, tableaux de bord) | `app.json` |
| Compte administrateur initial | `.secrets/admin.json` (à protéger ; changer le mot de passe après la première connexion) |

Entités : Clients (14 champs), Prospects (9 champs), Articles (7 champs), Devis (8 champs), Lignes de devis (5 champs), Factures (10 champs), Lignes de facture (4 champs), Règlements (4 champs), Activités (6 champs).

Chaque enregistrement migré conserve son origine (table et clé de l'ancien logiciel, empreinte de la ligne, transformations) dans la table `_lineage`. Les montants comptables historiques sont en lecture seule. Toute modification est tracée dans `_audit`.
