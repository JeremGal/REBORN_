# Intégration — Mouss (exécuteur de l'agent Computer Use, H Company)

Le client clique « Analyser mon logiciel » dans le Studio. Le Studio met la demande **en file** ; ton exécuteur vient la **chercher**, se connecte avec les droits fournis par le propriétaire, explore en lecture seule et rapporte ce qu'il voit. Le Studio ne simule jamais ce travail : tant qu'aucun exécuteur n'est disponible, le client lit exactement « Agent d'analyse non disponible pour le moment. » et la demande attend.

- Client Python 1.3 : [`clients/reborn_client.py`](clients/reborn_client.py) — `heartbeat()`, `claim_mission()`, `redeem_credentials()`, `report_connection(..., mission_id=…)`, `complete_mission()` (1.2) ; `?project=` ajouté à toutes les routes d'un projet quand un projet est configuré (1.3 : `REBORN_PROJECT` ou `use_project()`).
- Doublure de test : [`clients/examples/mouss_connexion.py`](clients/examples/mouss_connexion.py) — **jeu de test**, pile isolée uniquement (voir §8). Ce n'est pas l'agent.
- Schémas : [`contracts/`](contracts/) — `connection_mission` 1.1 (+ `connection_mission.example.json`, valeurs fictives), `connection_report` 1.1, `executor_heartbeat` 1.0, `mission_complete` 1.0, `extraction_plan` 1.0, `observation`, `event`, `investigation`. Générés depuis la validation réelle du serveur (`npm run contracts`).

## 1. Authentification

| Élément | Valeur |
|---|---|
| Jeton | `Authorization: Bearer <REBORN_EXPLORER_TOKEN>` (`npm run token -- explorer` le copie, jamais affiché). Jamais le cookie d'un client. |
| Origine | Aucun en-tête `Origin` (code serveur, pas un navigateur). Une remise d'identifiants qui porte `Origin` ou `Sec-Fetch-Site` est refusée. |
| Instance | `X-Reborn-Executor: <nom>` (1 à 64 caractères : lettres, chiffres, `. _ : -`). Plusieurs exécuteurs peuvent partager le jeton ; chaque instance a son identité (`executor_id`), et le jeton de remise est lié à elle. Le client Python le pose depuis `REBORN_EXECUTOR_ID`. |

La frontière de sécurité reste le jeton de service : le nom d'instance distingue les exécuteurs, il ne les authentifie pas.

## 2. Boucle de l'exécuteur

| Étape | Appel | Réponse |
|---|---|---|
| Signe de vie, **au moins toutes les 20 s** | `POST /api/executor/heartbeat` `{ version: "1.1", networks: ["public"\|"private"], login: "h_vault"\|"cdp"\|"none", max_concurrent, active_missions: [MIS_…] }` | `{ server_time, renew_within_s: 20, executor_id, lease_s: 120, leases[] }` |
| Prendre une mission | `POST /api/executor/missions/claim` | `200` mission `connection_mission` 1.1, ou `204` s'il n'y a rien. `409` sans battement récent. |
| Obtenir les identifiants (une fois) | `POST /api/projects/<id>/credentials/redeem` `{ token, mission_id }` | `{ ok, username, password }` ; refus `403 { ok:false, error, reason }` |
| État de connexion | `POST /api/projects/<id>/connection` `{ status, detail?, mission_id }` | `{ ok, project, mission }` |
| Exploration | `POST /api/events?project=<id>`, `/api/schema?project=<id>`, `/api/observations?project=<id>` avec `investigation_id` de la mission | voir contrats `event`, `observation` |
| Exports obtenus | `POST /api/migration/sources?project=<id>` `{ name, content_base64, mechanism }`, ou `POST /api/migration/extract?project=<id>` `{ plan }` (plan `extraction_plan` ; le connecteur du Studio utilise les identifiants confiés et **seulement** l'adresse déclarée du projet) | |
| Fin de mission | `POST /api/executor/missions/<mission_id>/complete` `{ outcome: "completed"\|"failed", detail?, disposal: { h_vault_item_deleted, local_artifacts_purged } }` | `{ ok, mission, credentials: { revoked_at, erased } }` |

Avec le client Python, après la prise : `rb.use_project(mission["project_id"])` — les appels d'exploration suivants (évènements, observations, schéma, investigations, exports) portent `?project=` du projet de la mission. Un appel d'agent sans projet désigné ne vise jamais le projet d'un client (400 « Projet requis » sur les routes de migration).

Règles appliquées par le Studio :
- **Prise atomique** : deux exécuteurs qui demandent en même temps, une seule prise.
- **Prêt de 120 s**, renouvelé par chaque battement qui liste la mission dans `active_missions`. Prêt expiré : jeton révoqué, mission remise en file. Après **3 prises** sans aboutir : `failed`.
- **Jamais de `completed` implicite** : seul ton appel `complete` le déclare.
- **Échéance** : au plus tôt entre l'échéance des identifiants (24 h au maximum après leur dépôt) et la demande + 24 h. Mission échue : `expired`.
- **Fin de mission** : investigation close, prêt libéré, jetons révoqués, **identifiants effacés** côté Studio.
- **Titulaire seulement** : la remise, le rapport de connexion et l'extraction ne sont acceptés que de l'exécuteur qui tient le prêt de la mission en cours du projet (`403` sinon). Le champ `by` est ignoré : le Studio enregistre l'identité authentifiée.
- **Pause** du projet par le client : la mission n'est pas remise (elle attend la reprise), le jeton en cours est révoqué, remise et rapports refusés (`409`).
- **Adresse modifiée** par le client après la demande : la mission est annulée ; tes appels suivants reçoivent `409` (arrête-toi).

États de la mission (ce que voit le client) : `queued` → `claimed` → `connecting` (rapport `pending`) → `connected` (`connected`) → `exploring` (premières observations du titulaire : branchement de `POST /api/observations` en cours côté Studio) ; `needs_human` (`mfa_required` ou `human_needed` : intervention du propriétaire, plus de prêt) ; fins : `completed`, `failed` (dont rapport `failed`), `cancelled` (annulée par le client, identifiants retirés, adresse modifiée), `expired`.

## 3. Mission `connection_mission` 1.1

Tous les champs 1.0 sont conservés (`contract`, `contract_version`, `mission_id`, `project_id`, `target`, `authorization`, `objectives`, `constraints`, `credential`, `report`). Ajouts 1.1 :

| Champ | Sens |
|---|---|
| `status`, `created_at`, `expires_at` | État et échéance de la mission |
| `requires_network` | `private` pour une adresse de bouclage, privée, en `.local` ou sans domaine ; sinon `public` |
| `investigation_id` | Investigation créée par le Studio pour ce projet : **ne pas en créer une autre** |
| `executor { id, lease_expires_at }` | Ton identité et l'échéance de ton prêt |
| `consent { privacy_notice_version, authorization_version, accepted_at }` | Versions des textes acceptés par le propriétaire |
| `credential.credentials_expires_at`, `credential.token_expires_at` | Échéances distinctes (`credential.expires_at` garde son sens 1.0 ambigu : **déprécié**) |
| `credential.handling` | « remplir hors du modèle : coffre H fill_secret_at ou CDP ; jamais dans la consigne » |
| `limits { read_only: true, login_screenshots: false, max_duration_s }` | Lecture seule, aucune capture des étapes de connexion, durée maximale |
| `report.heartbeat`, `report.complete` | Nouveaux points de rapport |

Compatibilité 1.0 : `rb.take_mission(projet)` (`POST /api/projects/<id>/mission` avec le jeton explorer) prend la mission **en file** de ce projet (même format, champs 1.1 en plus) ; `409` s'il n'y a rien en file. `GET` du même chemin renvoie un aperçu sans jeton.

## 4. Identifiants de l'ancien logiciel

- Jeton de remise : **usage unique, 15 minutes**, lié à la mission et à ton instance. Un refus (`reason` : `invalid`, `expired`, `used`, `revoked`, `executor`, `mission`, `no_credentials`) ne consomme pas le jeton quand il vient d'un autre exécuteur ou d'une autre mission.
- **Jamais dans la consigne d'un modèle**, ni dans un journal, ni sur une capture :
  - navigateur hébergé : coffre H (`vault_id`, `fill_secret_at`) ; créer l'élément juste avant la session, le **supprimer juste après**, et le confirmer dans `disposal.h_vault_item_deleted` ;
  - navigateur local : ton code remplit le formulaire de connexion par CDP **avant** de confier l'onglet à l'agent.
- Double authentification (`request_otp`) : rapporte `mfa_required` et arrête-toi ; le propriétaire doit intervenir.
- Le Studio masque toute occurrence des identifiants confiés — brute ou encodée (adresse, formulaire, JSON, HTML, hexadécimal, base64) — dans tes `detail`, évènements, observations et schémas d'écran, ainsi que la valeur saisie dans un champ mot de passe ; à l'effacement des identifiants, il masque aussi les copies déjà enregistrées. Ne t'appuie pas dessus : n'envoie jamais ces valeurs.

## 5. Réseaux

Déclare dans `networks` les réseaux **réellement** joignables. Le navigateur hébergé par H n'atteint que des adresses publiques (`["public"]`) ; une mission `private` (logiciel sur le réseau du client, ou logiciel de test local) ne te sera remise que si tu déclares `private`. Un exécuteur `login: "none"` ne reçoit que des missions sans identifiants.

## 6. Rapports honnêtes

- `connected` seulement après avoir **vu** une page authentifiée.
- Une session bloquée ou interrompue se termine en `failed`, jamais en `completed`.
- Ne jamais envoyer de capture des étapes de connexion, ni `agent_view_url` au client.
- Observations : préfixer `experiment_id` par l'identifiant de mission ; valeurs simples uniquement (contrat `observation`).
- Captures (`screenshot_url`) : envoie l'image en data URL (PNG, JPEG ou WebP, 8 Mo au plus) ; le Studio la range dans le projet et la sert à son propriétaire. Une adresse externe (http, https) ou toute autre forme n'est pas conservée.

## 7. Hygiène

- Purger tes fichiers locaux des missions clients (`experiments/`, `artifacts/`, `explorations/`, `reports/`) et le confirmer dans `disposal.local_artifacts_purged`.
- Couper Linkup pour les missions clients (`REBORN_CONTEXT=0`).
- Respecter les plafonds H dans `max_concurrent`.

## 8. Doublure de test (jeu de test)

`clients/examples/mouss_connexion.py` déroule ce protocole **sans agent** : battement → prise → remise → connexion **réelle** au seul logiciel de test Relatio 2004 (formulaire, page authentifiée, déconnexion) → rapport → fin. Pour tout autre logiciel, elle rapporte `human_needed` et termine en `failed` : elle ne déclare jamais `connected` sans connexion constatée. Elle refuse de démarrer sans `REBORN_TEST_STACK=1`, sans `REBORN_URL` explicite, ou vers le port 3000 (Studio en service : de vraies missions de clients y attendent). Vérifiée par `platform/src/analysis.test.ts` contre les routes réelles du Studio et un vrai Relatio, et par `npm run acceptance` (test 6) sur une pile isolée, avec le jeton explorer aléatoire de la pile : battement → prise (compatibilité 1.0, `REBORN_PROJECT`) → remise → connexion réelle → rapport → fin, identifiants effacés côté Studio. Le même test déroule aussi le protocole 1.1 complet par appels directs (prise conforme au schéma `connection_mission` 1.1, jeton refusé à un autre exécuteur, à un navigateur et au propriétaire, deuxième échange refusé).

## 9. Ce qui dépend de Mouss

1. **Exécuteur** : la boucle ci-dessus (battement ≥ 20 s, prise, renouvellement des prêts, fin). Rien n'existe aujourd'hui dans `h-explorer`.
2. **Connexion** : lever l'interdiction de se connecter, pour ces missions seulement, en restant en lecture seule ; coffre H ou CDP, jamais la consigne. Vérifier que l'offre H donne accès aux coffres.
3. **Double authentification** : `mfa_required` puis arrêt.
4. **Joignabilité** : `networks` exact.
5. **Rapports honnêtes** et adaptation des sorties `EXP_…` au contrat `observation`.
6. **Exports** : les autoriser en lecture seule, ou fournir un `extraction_plan` pour le connecteur du Studio.
7. **Hygiène** : purge locale, Linkup coupé, plafonds H.

## 10. Points signalés à l'équipe (code non modifié par le Studio)

- `tools/h_run.py` (Alan) place l'identifiant et le mot de passe dans la consigne envoyée au modèle (bloc `login = …`, l. 77-80 au commit `33d2afe`) : contraire à `credential.handling` ; à remplacer par le coffre H ou CDP.
- Une capture commitée sur `main` (`targets/erpnext/01-exploration/runs/run-20261107T193709-h-EXP_001/step_02.png`) montre un identifiant de connexion en clair et la longueur du mot de passe ; l'identifiant figure aussi dans `context.md`.
- Script de test de la CI : corrigé par Alan (`33d2afe`) ; la CI est de nouveau verte sur `main` et sa garde anti-secrets tourne.

## 11. Limites connues

- Le nom d'instance (`X-Reborn-Executor`) est déclaré par l'exécuteur : il distingue les exécuteurs d'un même jeton, il ne les authentifie pas.
- Les données qui passent par le navigateur hébergé et le coffre H transitent chez H Company ; leur durée de conservation n'est pas documentée par H. À mentionner au propriétaire (textes juridiques encore à valider).
