# Limites connues (état réel)

Ce qui suit n'est **pas** fait, ou seulement en partie. Rien ici n'est présenté ailleurs comme terminé.

## Dépend d'Alan et de Mouss

| Sujet | État |
|---|---|
| Exploration par l'agent Computer Use (H Company) | Contrats prêts (mission, jeton de remise, rapport de connexion, investigations rattachées au projet, dépôt d'exports). Aucun agent réel branché : les projets restent « En attente de l'agent ». |
| Compréhension métier (Alan) | Contrats `migration_mapping` et `business_model` prêts et validés automatiquement. Les modèles de Relatio et du CRM synthétique sont des **jeux de test écrits à la main** au format d'Alan, étiquetés comme tels. Le modèle de Relatio est rejoué sur l'historique : 1 772 devis identiques au centime sur 1 796, 24 écarts d'arrondi de 1 à 2 centimes (Relatio arrondit en virgule flottante), aucun écart réel. |
| Conversion des formats du dépôt d'équipe (`handoff.json`, YAML d'entités et de règles) | Non écrite : à faire avec Alan (voir [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md)). |

## Reconstruction et logiciel livré

- **Génération** : le logiciel livré est **un runtime générique configuré par la spécification** (`app.json`), sans génération de code spécifique au client. Ce qui ne s'exprime pas dans la spécification n'existe pas.
- **Workflows** : ceux décrits par l'analyse sont conservés et listés comme « non reconstruits ». Le runtime n'exécute pas encore de workflows (statuts avec transitions et actions).
- **Calcul par les règles** : le modèle métier calcule des documents à lignes (prix, remises, frais, taxes, totaux). Il ne gère pas encore des traitements par lots, des échéanciers ni des numérotations automatiques.
- **Sessions** : elles sont en mémoire. Après un redémarrage du logiciel livré, il faut se reconnecter ; les données, elles, sont conservées.
- **Lancement** : chaque logiciel livré a son port, attribué à partir de 5050. Ils tournent sur la machine locale (127.0.0.1). Aucun déploiement public n'est fait.
- **Ancienne version** : un logiciel livré avant cette version (spécification 1.0) ne bénéficie des règles qu'après « Mettre à jour le moteur » (étape Livraison). Cette mise à jour conserve les données. Morel CRM (port 5050) a été mis à jour le 7/11 : spécification 1.1, modèle métier v1 (jeu de test), volumes vérifiés identiques avant et après.

## Studio

- **Investigation active** : une seule à la fois pour toute la plateforme, atelier compris. Lancer une découverte sur un projet clôt celle qui est en cours.
- **Lancement d'une investigation** : il ne fait pas passer le projet à l'état « Découverte en cours ». Seuls les rapports de l'agent et les données reçues font évoluer l'état.
- **Évènements** :
  - ceux qui précèdent cette version n'ont pas d'identifiant de projet : le journal d'un projet les filtre par date ;
  - le journal global est plafonné à 5 000 évènements.
- **Mission** :
  - `GET /api/projects/:id/mission` crée un nouvel identifiant de mission à chaque appel ;
  - préparer une nouvelle mission (`POST`) invalide le jeton précédent ;
  - on ne sait pas encore, projet par projet, si un jeton a été utilisé.
- **Retour à une version antérieure du modèle métier** : il passe par l'API du logiciel livré (`POST /api/admin/rules/active`). Il n'y a pas encore d'écran pour cela. Publier une ancienne version ne l'active pas.
- **Pause d'un projet** : le serveur bloque toutes les écritures sur un projet en pause. Les rapports de connexion de l'agent sont enregistrés, mais ne changent pas l'état.
- **Cohérence visuelle** : quatre jeux de composants d'interface (connexion, données, migration, livraison) coexistent, avec de petites différences de style. C'est sans effet sur le fonctionnement.

## Migration

- **Reprise** : une migration interrompue n'est pas reprise là où elle s'est arrêtée. Elle est relancée entièrement. C'est sans risque, car chaque exécution construit une base neuve dans une seule transaction et ne laisse aucune donnée partielle.
- **Volumes** : ils ont été testés jusqu'à environ 21 000 enregistrements (Relatio). Il n'y a pas eu de test de charge au-delà.
- **Formats** : CSV, XLSX, JSON, SQL et SQLite sont pris en charge. Il n'y a pas de connecteur direct de base de données distante, ni d'API propriétaire hors plan HTTP.

## Sécurité et conformité

- **Clé de chiffrement** : elle est sur la même machine que les données, ce qui protège contre une fuite de fichiers mais pas contre un accès complet à la machine. Un coffre externe est à prévoir.
- **Modes d'accès** : en local, sans jeton, toute application de la machine peut appeler l'API du Studio (protections hôte et origine actives). En mode réseau, un jeton est exigé pour les écritures.
- **Conformité** : REBORN n'est pas certifié conforme à une réglementation, par exemple le RGPD ou les normes comptables. Les mesures réellement en place sont les suivantes :
  - chiffrement des identifiants ;
  - protection serveur de l'historique comptable ;
  - journal d'audit ;
  - sauvegardes avant chaque opération critique ;
  - retour arrière.

  Une vérification juridique reste nécessaire.

## Tests

- **Tests d'acceptation** (`npm run acceptance`) : ils utilisent des données **synthétiques**, sans exploration réelle par H Company.
- **Absence d'erreur** : elle ne prouve pas l'absence de perte dans des cas absents des jeux de test.
