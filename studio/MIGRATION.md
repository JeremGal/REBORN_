# REBORN — Migration des données et logiciel livré

> Document de la V1.0, centré sur la vue `/migration` de l'équipe (réservée aux opérateurs depuis la V1.1). Fonctionnement et chiffres actuels : [README.md](README.md) et [RAPPORT_FINAL.md](RAPPORT_FINAL.md).

Ce document décrit la partie **Jerem** de REBORN : les moteurs de migration des données (Data Migration Engine), de vérification (Migration Validation Engine), de reconstruction (Application Reconstruction Engine) et de modernisation (Modernization Engine).

```
Relatio 2004 (ancien CRM, base SQLite réelle)
   │  compte « migration » confié par le propriétaire · exports autorisés uniquement
   ▼
Connecteurs (CSV · Excel · JSON · SQL · SQLite · ZIP)  ── coffre des sources (SHA-256)
   ▼
Analyse de structure (types, formats, clés, relations, anomalies)
   ▼
Correspondances (Alan, ou proposition automatique) ── validation humaine des points incertains
   ▼
Migration (nouvelle base, ordre des dépendances, traçabilité ligne par ligne, rejets motivés)
   ▼
Vérification (relecture des fichiers sources ET de la base cible, contrôles réels)
   ▼
Génération + mise en service (generated/<id>/ : serveur autonome, base propre, sauvegarde préalable)
   ▼
Nouveau CRM (Morel CRM) : données migrées, création et modification, audit, sauvegardes, retour arrière
```

## Lancer la démonstration

```bash
npm install --prefix platform     # une fois
npm run dev                       # Studio :3000 · Quotix :4000 · Relatio 2004 :4100
npm run crm-source:password       # copie le mot de passe du compte « migration » (jamais affiché)
```

Ensuite, dans **REBORN Studio → 03 Migrer** (http://127.0.0.1:3000/migration) :

1. **Extraction** : coller le mot de passe, puis cliquer sur « Extraire ». Onze exports sont récupérés. Deux sont refusés au compte : les commissions et la sauvegarde SQL. Ces refus sont consignés.
2. **Structure** : 10 tables et 21 675 lignes sont lues, avec 11 relations détectées à partir des valeurs. Le Studio signale aussi les orphelins et les dates invalides.
3. **Correspondances** : cliquer sur « Jeu de test (format Alan) ». Six points incertains s'affichent : codes de catégorie, rattachement des pièces jointes, factures sans client, etc. Les valider ou les exclure un par un.
4. **Migration** : la nouvelle base est créée, puis 21 065 enregistrements sont importés en environ 1,2 seconde. Les 14 lignes rejetées le sont avec leur motif : 2 clients sans raison sociale, puis leurs 4 devis et les 8 lignes de ces devis.
5. **Vérification** : 41 contrôles sont exécutés, aucun bloquant n'échoue, et le statut affiché est « Validation humaine requise ». Le rapport présente 11 écarts documentés :
   - les rejets ;
   - 2 factures dont le client a été supprimé dans l'ancien logiciel, conservées sans lien ;
   - 3 lignes de devis pointant vers un article supprimé ;
   - 5 dates d'activité invalides, laissées vides ;
   - 8 pièces jointes perdues sur l'ancien serveur ;
   - 15 groupes de doublons ;
   - 12 factures dont le total diffère de la somme des lignes (historique conservé) ;
   - 2 exports refusés au compte.

   Le rapport d'écarts est téléchargeable en CSV. Pour continuer, accepter les écarts avec un commentaire.
6. **Mise en service** : cliquer sur « Générer et mettre en service », puis ouvrir http://127.0.0.1:5050. Le mot de passe du compte `admin` se copie avec `npm run crm:password`.

Le nouveau CRM fonctionne **sans le Studio et sans l'ancien logiciel**. Il suffit d'arrêter `npm run dev`, puis de lancer `npm run crm`.

## Ce que garantit le moteur

| Règle | Mise en œuvre |
|---|---|
| Aucune donnée inventée | Une valeur vide reste vide (NULL). Une valeur obligatoire absente fait rejeter la ligne, avec son motif. Une valeur facultative non convertible est laissée vide et signalée. Aucune valeur par défaut n'est appliquée. |
| Montants exacts | Les montants sont convertis en centimes entiers à partir du texte, sans calcul flottant. Au-delà de 2 décimales non nulles, la valeur est refusée plutôt qu'arrondie. |
| Historique comptable intact | Les champs marqués `accounting` ne sont jamais recalculés. Dans le logiciel livré, ils sont en lecture seule sur les enregistrements migrés, et une facture migrée ne peut être ni modifiée, ni complétée, ni supprimée. |
| Traçabilité | Chaque enregistrement migré pointe vers son origine dans `_lineage` : table, clé source, fichier et son empreinte, ligne source complète, empreintes source et cible, transformations appliquées, exécution. |
| Correspondances incertaines | Tout point dont la confiance est sous le seuil (0,9 par défaut) doit être validé ou exclu par un humain. Sinon, la migration est refusée (409). |
| Relations | Les références sont résolues par les clés sources. Une référence introuvable entraîne le rejet de la ligne, ou un rattachement manquant signalé (`keep_unlinked`) si la correspondance l'autorise. |
| Doublons | Ils sont détectés selon les règles déclarées (SIRET, e-mail…) et signalés, jamais fusionnés automatiquement. |
| Pièces jointes | Elles sont copiées, nommées par leur empreinte SHA-256 et revérifiées octet par octet. Un fichier manquant est signalé. |
| Vérification réelle | Les fichiers du coffre sont réanalysés et la base cible est relue en SQL : volumes (source = importés + rejetés), comparaison champ par champ, intégrité référentielle, sommes au centime, empreintes, règles métier, `PRAGMA integrity_check`. Toute altération est détectée (testé). |
| Pas de garantie abusive | Le rapport précise toujours que les contrôles ne prouvent pas l'absence de données que le logiciel source n'a pas exportées. |
| Bascule réversible | La base en service est sauvegardée avant chaque mise en service. Le Studio refuse d'écraser les saisies des utilisateurs sans confirmation explicite. Le retour arrière est disponible en un clic. |
| Identifiants du propriétaire | Le mot de passe sert uniquement à ouvrir la session dans le logiciel source. Il n'est jamais stocké, journalisé ni renvoyé, et le compte apparaît masqué (`mi*******`). |

Statuts de vérification :
- **Migration validée** : tous les contrôles sont réussis et il n'y a aucun écart.
- **Validation humaine requise** : aucun contrôle bloquant n'a échoué, mais des écarts documentés doivent être acceptés.
- **Intervention requise** : au moins un contrôle bloquant a échoué ; la mise en service est impossible.

## Contrats d'intégration

Les schémas JSON sont publiés par `GET /api/migration/contracts`. Le client Python [clients/reborn_client.py](clients/reborn_client.py) couvre toutes les opérations.

### Mouss — plan d'extraction et fichiers extraits

L'Explorer décrit les mécanismes **autorisés** qu'il a découverts (exemple : [platform/scenarios/crm/extraction-plan.json](platform/scenarios/crm/extraction-plan.json)) :

```json
{ "system": "Relatio 2004", "base_url": "http://…",
  "login": { "url": "/login", "username_field": "utilisateur", "password_field": "motdepasse", "session_cookie": "RELATIOSESSID" },
  "manifest": "/exports/manifest.json",
  "mechanisms": [ { "id": "clients", "label": "Fichier clients (CSV)", "kind": "export", "url": "/exports/clients.csv" },
                  { "id": "sauvegarde", "kind": "database", "url": "/exports/sauvegarde.sql", "requires": "admin" } ],
  "not_extractable": [ { "label": "…", "reason": "visible à l'écran, aucun export" } ] }
```

```python
rb.migration_extract(plan, username, password)          # REBORN télécharge (même origine uniquement)
rb.migration_upload("clients.csv", mechanism="clients")  # ou : Mouss dépose lui-même un fichier extrait
```

### Alan — correspondances ancien → nouveau

Exemple complet : [platform/scenarios/crm/mapping.json](platform/scenarios/crm/mapping.json).
- Par entité : `source.table` et `source.key`, ainsi que les `fields`. Chaque champ précise `source`, `type` (text, integer, decimal, money, percent, date, boolean, enum, email, phone, reference), `transforms`, `required`, `unique`, `references`, `on_missing`, `accounting` et `confidence`.
- Également par entité : `duplicates`, `checks` (expressions sûres sur l'historique), `aggregates` (somme des lignes), `computed` (règles des nouveaux enregistrements) et `ui` (navigation, colonnes, indicateurs).
- `attachments` : table d'index, archive, chemin, et propriétaire (polymorphe ou non).
- Transformations disponibles : `trim`, `lower`, `upper`, `collapse_spaces`, `digits`, `{date}`, `{decimal}`, `{money}`, `{boolean}`, `{map}`, `{null_if}`. Un code absent d'une `map` est une erreur, jamais une valeur par défaut.

```python
rb.migration_profile()                       # structure lue (types, clés, relations, anomalies)
r = rb.migration_publish_mapping(mapping)    # 400 format · réponse : problèmes et points à valider
```

### API de suivi (Studio)

| Endpoint | Rôle |
|---|---|
| `GET /api/migration` | Vue d'ensemble : sources, extraction, correspondances, points à valider, exécutions, mises en service, état du logiciel |
| `POST /api/migration/extract` | Extraction autorisée (`plan`, `base_url`, `username`, `password`) |
| `POST /api/migration/sources` · `GET` · `DELETE ?id=` | Coffre des fichiers extraits |
| `GET /api/migration/profile` | Structure analysée |
| `POST /api/migration/mapping[?propose=auto]` · `GET` | Correspondances (Alan, proposition automatique) |
| `POST /api/migration/decisions` | Validation humaine (`key`, `decision` : `accepted`/`excluded`, `comment`) |
| `POST /api/migration/runs` · `GET /api/migration/runs/{id}` | Migration et vérification, rapport complet |
| `GET /api/migration/runs/{id}/rejects` | Rapport d'écarts (CSV) |
| `POST /api/migration/runs/{id}/acknowledge` | Acceptation humaine des écarts |
| `POST /api/migration/deploy` · `/rollback` · `/app` · `/reconcile` | Mise en service, retour arrière, démarrage/arrêt, réconciliation après mise en service |

Les écritures suivent les mêmes règles que le reste de l'API : jeton en mode réseau, contrôle d'origine et d'hôte.

## Le logiciel livré (`generated/<id>/`)

| Élément | Contenu |
|---|---|
| `server.mjs` + `lib/` + `public/` | Runtime générique (Node ≥ 22.13, sans dépendance) : API REST, interface web, authentification, rôles, audit, sauvegardes. Aucun vocabulaire métier en dur (un test le vérifie). |
| `app.json` | Spécification générée : entités, champs, relations, listes, recherche, règles calculées, agrégats, tableau de bord, schéma SQL |
| `data/app.db` | Base SQLite propre : tables métier avec contraintes (NOT NULL, UNIQUE, CHECK, clés étrangères) et tables `_lineage`, `_files`, `_audit`, `_users`, `_meta` |
| `files/`, `backups/`, `.secrets/admin.json` | Pièces jointes, sauvegardes, compte administrateur initial (droits 600, non versionné) |

Fonctions disponibles :
- Tableau de bord, listes avec recherche, tri, filtres et pagination ; export CSV.
- Fiches avec relations (un client et ses devis, factures et activités), origine de la donnée et ligne source complète, pièces jointes, historique.
- Création et modification validées côté serveur. Les règles s'appliquent aux nouveaux enregistrements : HT = somme des lignes, TVA à 20 %, TTC = HT + TVA.
- Rôles admin, editor et viewer ; mots de passe hachés avec scrypt ; limitation des tentatives de connexion ; contrôle d'origine sur les écritures.
- En-têtes de sécurité : CSP, `nosniff`, `frame-ancestors`.
- Sauvegarde cohérente (`VACUUM INTO`) et restauration précédée d'une sauvegarde de sécurité.

Ces protections sont des bases techniques. Elles ne constituent **pas** une certification de conformité (RGPD, comptable ou autre), qui reste à établir au cas par cas.

## Tests

| Commande | Couverture |
|---|---|
| `npm test` | 386 tests (27 fichiers), dont `migration.chain.test.ts` (chaîne complète sur le vrai serveur Relatio, vérité lue dans sa base SQLite, détection d'altérations, mise en service, API du CRM livré, saisie, réconciliation, retour arrière) et `migration.test.ts` (formats, conversions exactes, analyse, correspondances, runtime) |
| `node scripts/e2e-migration.mjs` | 32 vérifications dans Chrome headless, sur une pile isolée (le Studio en service n'est pas touché) : Studio, puis nouveau CRM (connexion, données, création, mobile). |

## Limites actuelles

- **Source de test** : Relatio 2004 est un CRM de démonstration aux données synthétiques. Aucun ERP réel n'a été migré.
- **Connecteur HTTP** : il couvre une connexion par formulaire et des exports téléchargeables. Ne sont pas couverts : authentification multi-facteurs, captcha, API paginées, exports asynchrones. Ces cas relèvent de l'Explorer ou de nouveaux connecteurs.
- **Formats** : ZIP64, dates Excel sans déclaration `date: excel` et exports SQL non compatibles SQLite (procédures, syntaxes propriétaires) ne sont pas pris en charge.
- **Schéma cible** : une entité correspond à une table source. Le moteur ne gère ni la fusion de plusieurs tables, ni l'éclatement d'une colonne, ni la fusion automatique des doublons, ni les auto-références vers des lignes situées plus loin dans le fichier.
- **Logiciel livré** : CRUD, relations, règles calculées et agrégats sont pris en charge. Les workflows à étapes (validation de devis, relances), les droits par enregistrement, l'authentification multi-facteurs et le chiffrement de la base ne sont pas générés.
- **Volumétrie** : la migration s'exécute dans le processus du Studio, en une transaction. Elle a été testée sur environ 21 700 lignes (1,2 s) ; au-delà de quelques centaines de milliers de lignes, un traitement par lots serait nécessaire.
- **Mode développement** : juste après un redémarrage de `npm run dev`, le rechargement à chaud de Next 16 (Turbopack) a provoqué pendant quelques minutes des rechargements en boucle du Studio, sans cause trouvée dans notre code. Le mode production (`npm run start`), recommandé pour la démonstration, n'est pas concerné ; les deux parcours navigateur y passent intégralement.
- **Projet** : la vue `/migration` de l'équipe travaille sur le projet courant de l'atelier ; chaque client a ses propres projets (`/projets`).
