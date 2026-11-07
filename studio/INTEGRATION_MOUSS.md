# Intégration — Mouss (Computer Use, H Company)

Ton agent explore l'ancien logiciel avec les droits fournis par le propriétaire et rapporte ce qu'il voit. REBORN ne simule jamais ce travail en mode réel. Tant que ton agent n'a rien rapporté, le projet affiche « En attente de l'agent ».

- Client Python : [`clients/reborn_client.py`](clients/reborn_client.py). Exemple exécutable : [`clients/examples/mouss_connexion.py`](clients/examples/mouss_connexion.py).
- Schémas : [`contracts/`](contracts/) (`connection_report`, `extraction_plan`, `observation`, `event`, `investigation`).

## Identifiants

| Identifiant | Format | Où le trouver |
|---|---|---|
| Projet | `MIG_xxxxxxxx` | URL du projet dans le Studio, ou `rb.projects()` |
| Investigation | `INV_nnn` | Renvoyé par `start_investigation(..., project_id=…)` |
| Expérience | `EXP_…` | Demandes d'expériences de l'Analyste (`experiment_requests`) |
| Mission | `MIS_…` | Renvoyé par la mission |

## 1. Mission

| Appel | Contenu |
|---|---|
| `GET /api/projects/<id>/mission` (`rb.mission()`) | Cible (URL, logiciel, type), autorisation du propriétaire, objectifs, contraintes (aucun contournement de permission, aucune modification, aucun identifiant transmis à un modèle), points de rapport |
| `POST /api/projects/<id>/mission` (`rb.take_mission()`) | La même chose, plus un **jeton à usage unique** valable 15 minutes |

L'exécuteur échange ce jeton contre les identifiants avec `POST /api/projects/<id>/credentials/redeem` (`rb.redeem_credentials(token)`). Le jeton est détruit à la première utilisation. Les identifiants ne doivent jamais être envoyés à un modèle de langage, ni journalisés, ni apparaître sur une capture.

## 2. État de connexion

`POST /api/projects/<id>/connection` (`rb.report_connection(status, detail)`).

| `status` | Effet sur le projet |
|---|---|
| `pending` | Connexion en attente |
| `connected` | Connecté. Seul ton rapport, ou un test réel du connecteur HTTP, produit cet état |
| `failed` | Échec, avec la raison |
| `mfa_required` | Validation humaine requise : la double authentification est demandée au propriétaire |
| `human_needed` | Validation humaine requise |

## 3. Exploration

| Étape | Appel |
|---|---|
| Rattacher l'exploration au projet | `rb.start_investigation(application, module, mode="live", project_id=…)` |
| Publier ce que tu vois | `rb.action(...)`, `rb.publish_schema(...)`, `rb.form_discovered(...)`, `rb.observations([...])` (captures en `screenshot`), `rb.hypothesis(...)` |
| Récupérer les demandes d'expériences de l'Analyste | `rb.experiment_requests()` |
| Terminer | `rb.complete(investigation_id)` (ou `failed=True`) |
| Signaler une erreur ou une intervention nécessaire | `rb.log(...)` et `report_connection("human_needed", detail)` |

Envoyer deux fois une observation identique n'a pas d'effet.

## 4. Exports et fichiers obtenus

| Appel | Usage |
|---|---|
| `POST /api/migration/sources?project=<id>` avec `{ name, content_base64, mechanism }` (`rb.migration_upload(chemin, mechanism=…)`) | Déposer un fichier : CSV (encodage détecté), Excel `.xlsx`, JSON, export SQL (instructions autorisées seulement), base SQLite, archive ZIP de pièces jointes |
| `POST /api/migration/extract` avec un `extraction_plan` | Logiciel web avec exports téléchargeables : le connecteur HTTP de REBORN les récupère lui-même avec les identifiants confiés au projet |

Chaque fichier est conservé dans un coffre avec son empreinte SHA-256. Un export refusé au compte (401/403) est consigné et listé comme « non migré ».

## 5. Ce qu'il te reste à brancher

- Ton exécuteur H Company : mission → jeton → connexion → rapports ci-dessus.
- Linkup : à brancher côté agent. REBORN ne reçoit que des observations et des fichiers, pas de requêtes Linkup.
- Les captures :
  - à envoyer dans `screenshot` (URL ou base64) ;
  - floute toute donnée sensible inutile ;
  - ne montre jamais un écran de saisie de mot de passe rempli.
