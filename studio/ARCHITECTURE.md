# Architecture réelle — partie Jerem

Ce document décrit ce qui existe dans le code aujourd'hui. Ce qui manque est listé dans [LIMITATIONS.md](LIMITATIONS.md).

## Vue d'ensemble

```
 Ancien logiciel                 REBORN Studio (platform/, Next.js, :3000)                     Logiciel livré (generated/<id>/)
 ───────────────                 ─────────────────────────────────────────                     ──────────────────────────────
 écrans ──► agent Mouss ──► /api/projects/:id/connection · /api/investigations · /api/events    runtime générique (node:http + node:sqlite)
 exports ─► connecteur HTTP ─► /api/migration/extract ─┐                                         app.json  = ApplicationSpec 1.1
 fichiers ─► dépôt manuel ──► /api/migration/sources ──┤                                         rules/vN.json = modèle métier versionné
                                                       ▼                                         data/app.db = base migrée (SQLite)
                         coffre (SHA-256) ─► profil ─► correspondances ─► migration ─► vérification ─► génération ─► mise en service
                                               │        (Alan / auto)    (transaction)  (indépendante)   (spec)      (détachée, PID)
                         modèle métier (Alan) ─┴─► rejeu sur l'historique ─► validation humaine ─► rules/vN.json ─────────┘
```

Le Studio prépare, vérifie et publie. Le logiciel livré tourne seul : il ne contacte jamais le Studio ni l'ancien logiciel.

## Modules

| Module | Fichiers | Rôle |
|---|---|---|
| Projets | `platform/src/lib/migration/project.ts`, `context.ts`, `credentials.ts`, `project-contracts.ts`, routes `api/projects/**` | Projets isolés (`<data>/migration/projects/<id>/`), états persistés, historique d'états, identifiants chiffrés (AES-256-GCM, 24 h max), mission et jeton de remise pour l'agent |
| Extraction | `connectors.ts`, `formats.ts` | Plan d'extraction HTTP (même origine, cookie de session non réutilisé ailleurs, 401/403 consignés, 200 Mo max), lecteurs CSV (encodages), JSON, XLSX, ZIP, SQL (instructions autorisées seulement), SQLite |
| Analyse | `profile.ts` | Types, formats, clés, relations (inclusion des valeurs + noms), anomalies, indicateurs oui/non |
| Correspondances | `mapping.ts`, `labels.ts` | Contrat `migration_mapping` 1.0, proposition automatique générique (libellés FR, classification et protection de l'historique), points à valider, décisions humaines |
| Migration | `run.ts`, `model.ts`, `transforms.ts` | Nouvelle base par exécution, transaction unique, ordre des dépendances, `_lineage` par enregistrement, rejets motivés, doublons signalés, montants en centimes entiers |
| Vérification | `verify.ts` | Relit les sources du coffre (empreintes revérifiées) et la base cible en lecture seule : volumes, valeurs champ par champ, relations (`foreign_key_check`), sommes au centime, contrôles métier, pièces jointes, intégrité |
| Modèle métier | `business-model.ts`, `rules-history.ts`, `engine/bindings.ts` | Contrat `business_model` 1.0 (modules de règles + liaisons aux entités), versions immuables à valider, rejeu sur les documents historiques (identiques / arrondis / écarts) |
| Moteur de règles | `platform/src/lib/engine/` | Exécution déterministe par étapes (base, remise, frais, ajustement, arrondi), évaluateur d'expressions sûr (pas d'`eval`) |
| Génération | `generate.ts`, `application-spec.ts` | ApplicationSpec 1.1 (provenance, écrans, actions, règles, éléments non reconstruits), installation du modèle validé, port par logiciel, lancement détaché, mise à jour sans perte, retour arrière, réconciliation |
| Runtime livré | `platform/runtime/` (copié dans `generated/<id>/`) | API REST, interface web générique, sessions scrypt, rôles, audit, sauvegardes, export CSV, calcul des documents par le moteur de règles copié (`lib/engine/*.mjs`, généré par `npm --prefix platform run runtime`) |
| Interface Studio | `platform/src/app/(platform)/` | Tableau de bord des projets, création, 8 étapes (`projets/[id]/…`), atelier découverte & règles (`/atelier`, `/investigation`, `/regles`, `/reconstruction`, `/comparaison`) |

## Données

| Où | Contenu | Persistance |
|---|---|---|
| `platform/.data/migration/projects.json` | Index des projets, projet courant | Fichier (écriture atomique) |
| `platform/.data/migration/projects/<id>/` | `project.json` (état, historique, correspondances, décisions, exécutions), `sources/` (coffre), `runs/<RUN>/target.db` (base migrée + rapport), `business-model/vN.json`, `credentials.enc.json` (chiffré, 0600) | Fichiers |
| `platform/.data/vault.key` | Clé de chiffrement des identifiants (0600) | Fichier, jamais versionné |
| `platform/.data/state.json` | Investigations, observations, règles, évènements (atelier) | Fichier |
| `generated/<id>/data/app.db` | Base du logiciel livré : tables métier, `_lineage`, `_audit`, `_users`, `_files`, `_meta`, `_rules` (versions du modèle) | SQLite |
| `generated/<id>/backups/` | Sauvegardes (avant mise en service, mise à jour, restauration) | SQLite (`VACUUM INTO`) |
| En mémoire seulement | Sessions du logiciel livré (reconnexion après redémarrage), abonnés du flux temps réel du Studio | — |

Le projet unique des versions précédentes reste à la racine de `platform/.data/migration/` et devient le premier projet de l'index : aucune donnée n'est déplacée.

## Calcul d'un nouveau document dans le logiciel livré

1. L'utilisateur ajoute une ligne (`POST /api/e/<lignes>`).
2. Le serveur détermine la version du modèle : celle du document si elle est déjà fixée, sinon la version active.
3. Le module de règles de la ligne est exécuté. Ses entrées sont lues sur la ligne et ses références (par exemple le prix catalogue de l'article). Le prix et le montant de la ligne sont enregistrés.
4. Le module du document est exécuté sur la somme des lignes et les champs du document : remise, taux de TVA selon la date, TVA, TTC.
5. Tout s'enregistre dans une seule transaction, avec la version utilisée (`_rules_version`).

Une erreur (règle manquante, entrée absente) annule l'ensemble et renvoie 422 avec la raison. Les documents migrés ne sont jamais recalculés.

## Protection de l'historique (côté serveur)

| Cas | Réponse |
|---|---|
| Modifier un champ comptable d'un enregistrement migré | 409, tentative journalisée (`update_refused`) |
| Supprimer un document historique protégé | 409, tentative journalisée (`delete_refused`) |
| Ajouter, modifier ou supprimer une ligne d'un document historique protégé | 409 |
| Saisir à la main un champ calculé par le modèle | 400 |
| Modifier un élément de calcul d'un document historique (remise, date) | 409 |
| Restaurer une sauvegarde | Une sauvegarde de sécurité est d'abord créée |

La classification « comptable / commercial / lignes / référentiel » est proposée automatiquement. Quand elle est incertaine, elle est soumise à validation humaine, et la protection reste active tant qu'un humain ne l'a pas retirée.

## Sécurité du Studio

- **Exposition réseau** : le Studio écoute sur 127.0.0.1. En mode réseau (`npm run dev:lan`), les écritures exigent un jeton.
- **Contrôles des requêtes** : l'hôte est vérifié contre le DNS rebinding, et l'origine ou `sec-fetch-site` contre le CSRF.
- **Secrets** :
  - ils sont stockés dans `.secrets/`, `platform/.data/`, `legacy-crm/data/` et `generated/*/.secrets/`, en mode 0600 et ignorés par git ;
  - ils ne sont jamais affichés : les commandes `npm run …:password` les copient dans le presse-papiers.
- **Identifiants de l'ancien logiciel** :
  - ils ne sont jamais renvoyés par l'API ni journalisés ;
  - ils sont remis à l'exécuteur de l'agent par un jeton à usage unique valable 15 minutes.
