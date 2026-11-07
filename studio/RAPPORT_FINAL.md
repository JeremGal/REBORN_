# REBORN V1.0 — rapport final (partie Jerem)

Date : 7 novembre 2026. Tous les chiffres ci-dessous viennent de tests réellement exécutés le même jour. Ils ont été revérifiés à la fin de la session : 113 tests toujours au vert, build à jour avec le code, serveurs en service, Morel CRM en spécification 1.1 avec le modèle v1.

## En bref

Un projet REBORN part maintenant d'un ancien logiciel et aboutit à un nouveau logiciel autonome qui contient les **données historiques réellement migrées et vérifiées**. Ce nouveau logiciel calcule ses **nouveaux documents avec le modèle métier validé**. Le parcours a été testé de bout en bout dans un vrai navigateur, ainsi que par des tests d'acceptation qui utilisent de vrais processus. Ce qui reste simulé est étiqueté « jeu de test » partout et listé à la fin.

## 1. Fonctionnalités terminées

| Priorité | Fonctionnalité | Fichiers principaux |
|---|---|---|
| P0 | **Une seule chaîne** : moteur de règles branché au logiciel livré, modèle métier versionné (contrat `business_model`), calcul des lignes puis du document côté serveur, version enregistrée sur chaque document, documents existants jamais recalculés | `platform/src/lib/engine/bindings.ts`, `platform/runtime/server.mjs`, `platform/src/lib/migration/business-model.ts` |
| P0 | **Modèle rejoué sur l'historique** avant validation humaine : identiques, écarts d'arrondi, écarts réels, non calculables | `platform/src/lib/migration/rules-history.ts` |
| P0 | **Historique comptable protégé côté serveur** : modification, suppression ou ajout de lignes refusés (409) et journalisés ; classification proposée automatiquement, protégée par défaut tant qu'elle est incertaine | `platform/runtime/server.mjs`, `platform/src/lib/migration/mapping.ts` |
| P0 | **CRM autonome** : processus détaché et fichier PID, il survit à un Ctrl+C sur le Studio, redémarre seul, se met à jour sans perte de données | `platform/src/lib/migration/generate.ts` |
| P0 | **ApplicationSpec 1.1** : provenance (observé, déduit, validé), écrans, actions, règles, éléments non reconstruits | `platform/src/lib/migration/application-spec.ts` |
| P1 | **Studio** : tableau de bord des projets, création avec autorisation obligatoire, 8 étapes reliées à de vraies opérations | `platform/src/app/(platform)/page.tsx`, `projets/nouveau`, `projets/[id]/*`, `platform/src/components/project/*` |
| P1 | **Projets isolés** : états persistés, changés uniquement par de vraies opérations, pause bloquée par le serveur, un logiciel livré et un port par projet | `platform/src/lib/migration/project.ts`, `context.ts`, `platform/src/app/api/projects/**` |
| P1 | **Identifiants de l'ancien logiciel** chiffrés (AES-256-GCM, 24 h max), jamais renvoyés ; mission pour l'agent avec jeton à usage unique (15 min) | `platform/src/lib/migration/credentials.ts`, `api/projects/[id]/{credentials,mission,connection}` |
| P1 | **Nouveau CRM** : éditeur de devis à lignes avec aperçu du calcul, champs calculés en lecture seule, libellés en français, nom et couleur de l'entreprise, booléens à 3 états (une valeur vide de l'historique reste vide) | `platform/runtime/public/*`, `platform/src/lib/migration/labels.ts` |
| P1 | **Contrats pour Alan et Mouss** : 10 schémas JSON générés depuis la validation de l'API (plus des exemples), client Python étendu, 2 exemples exécutables | `contracts/`, `clients/reborn_client.py`, `clients/examples/` |

## 2. Critères de fin

| # | Critère | État | Preuve |
|---|---|---|---|
| 1 | Créer et conserver un projet | OUI | `projects.test.ts`, test navigateur |
| 2 | Recevoir des données structurées et des exports | OUI | SQLite déposé, 11 exports HTTP Relatio (acceptation) |
| 3 | Correspondances réellement appliquées | OUI | migrations Relatio et SQLite |
| 4 | Données réellement migrées | OUI | 333/333 ; 21 065 enregistrements (Relatio) |
| 5 | Relations conservées | OUI | 5/5 relations, contrôle d'intégrité des clés étrangères |
| 6 | Modèle métier intégré au nouveau logiciel | OUI* | `rules/vN.json` installé, calculs v1 puis v2. *Modèles fournis par des jeux de test au format d'Alan |
| 7 | Nouveaux calculs fonctionnels | OUI | devis de 3 lignes calculé par le serveur (test navigateur et acceptation) |
| 8 | Base persistante | OUI | données retrouvées après redémarrage |
| 9 | Indépendance vis-à-vis du Studio | OUI | Ctrl+C sur le Studio : le CRM continue, redémarre seul |
| 10 | Contrôles de migration | OUI | vérification indépendante (24 à 41 contrôles selon la source) |
| 11 | Fonctions comptables protégées | OUI | 409 côté serveur, valeur d'origine conservée |
| 12 | Interfaces principales fonctionnelles | OUI | 32/32 dans un vrai navigateur (quelques points d'interface mineurs restent, voir §5) |
| 13 | Contrats prêts pour Alan et Mouss | OUI | schémas + exemples Python réellement exécutés. L'intégration avec leurs vrais modules reste à faire |
| 14 | Tests critiques au vert | OUI | §3 |

## 3. Tests exécutés

| Commande | Résultat | Ce qui est réel |
|---|---|---|
| `npm test` | **113/113** | Routes d'API, moteur, et chaîne complète sur un vrai serveur Relatio (extraction HTTP, migration, vérification, CRM généré, règles v1 puis v2, mise à jour, retour arrière) |
| `npm run acceptance` | **49/49** | Processus réels : Studio, Relatio, 2 CRM livrés, Ctrl+C sur le Studio, exemples Python d'Alan et de Mouss |
| `node scripts/e2e-parcours.mjs` | **32/32** | Chrome réel : tout le parcours en cliquant, puis devis à lignes dans le nouveau CRM, mobile 390 px |
| `npm run e2e` (sur une pile isolée) | **24/24** | Atelier des règles (Quotix) |
| `next build` | propre | sans avertissement |

Non relancé : `scripts/e2e-migration.mjs`. Il remet à zéro le Studio qu'il vise.

## 4. Preuves que la migration et la reconstruction fonctionnent

| Mesure | Résultat |
|---|---|
| CRM synthétique (SQLite) | 333/333 enregistrements, 48 217,33 € TTC facturés de part et d'autre |
| Relatio 2004 | 21 065 enregistrements migrés, 14 rejetés avec motif ; 2 exports refusés au compte, consignés et listés comme non reconstruits |
| Règles rejouées sur l'historique | Relatio : 1 772/1 796 devis identiques au centime, 24 écarts d'arrondi (Relatio arrondit en virgule flottante), 0 écart réel. CRM synthétique : 40/40 |
| Calcul d'un nouveau devis | Lignes 36,84 + 13,77 + 8,08 €, remise de 5 %, soit 55,76 € HT, 11,15 € de TVA et 66,91 € TTC, calculés par le serveur |
| Version des règles | La v2 publiée à chaud s'applique aux nouveaux devis ; les précédents gardent leur v1 |
| Morel CRM réel (:5050) | Mis à jour en spécification 1.1 avec le modèle v1 : volumes identiques avant et après sur les 9 tables, sauvegarde faite avant |

## 5. Non terminé et limites

Le détail est dans [LIMITATIONS.md](LIMITATIONS.md).

- **Pas de génération de code** : le logiciel livré est un moteur générique configuré par la spécification.
- **Workflows** : ils ne sont pas exécutés, seulement listés.
- **Modèles métier** : ceux de Relatio et du CRM synthétique sont des **jeux de test** écrits à la main.
- **Agent réel** : aucune exploration H Company n'a eu lieu ; les projets affichent « En attente de l'agent ».
- **Migration interrompue** : elle est relancée entièrement, sans risque (nouvelle base, une seule transaction).
- **Points mineurs non corrigés** :
  - certaines erreurs réseau s'affichent en anglais ;
  - une confiance de 99,96 % peut s'afficher « 100 % » ;
  - aucun écran ne permet de revenir à une ancienne version des règles (API seulement) ;
  - des composants d'interface sont dupliqués entre étapes.
- **Conformité** : REBORN n'est certifié conforme à aucune réglementation. Les mesures en place (chiffrement, protection de l'historique, audit, sauvegardes, retour arrière) sont décrites dans [ARCHITECTURE.md](ARCHITECTURE.md).

## 6. À connecter avec Alan et Mouss

- **Alan** : convertir sa sortie actuelle (`handoff.json` et YAML du dépôt d'équipe) vers les contrats `migration_mapping` et `business_model`. Voir [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md).
- **Mouss** : brancher l'exécuteur H Company sur la mission, le jeton de remise, le rapport de connexion, les investigations rattachées au projet et le dépôt d'exports. Linkup reste côté agent. Voir [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md).
- **Nouveau sur le dépôt d'équipe** (vérifié à la fin de la session) :
  - la branche `main` a reçu 8 commits depuis notre envoi, dont le **bloc Explorer de Mouss** (`h-explorer/`, agents H Company) et une cible ERPNext étudiée par son API ;
  - ce bloc n'est pas encore relié aux contrats de REBORN Studio : c'est le premier branchement à faire.

## 7. Lancer REBORN

```bash
npm install --prefix platform     # une fois
npm run start                     # Studio http://127.0.0.1:3000 · Relatio :4100 · Quotix :4000
```

Démonstration pas à pas : [DEMO.md](DEMO.md).

## 8. Lancer le nouveau CRM

```bash
npm run crm                       # ou : cd generated/<id> && npm start
npm run crm:password              # copie le mot de passe admin (jamais affiché)
```

## 9. Fichiers modifiés

132 fichiers créés ou modifiés, ce rapport compris :

| Zone | Fichiers |
|---|---|
| Moteurs | `platform/src/lib/migration/` (projets, identifiants, modèle métier, historique, spécification, libellés, génération), `platform/src/lib/engine/bindings.ts` |
| API | `platform/src/app/api/projects/**`, `platform/src/app/api/migration/{business-model,spec,app/rules,extract,app}` |
| Studio | tableau de bord, création, 8 étapes, `components/project/*`, barre de navigation, `/atelier` |
| Logiciel livré | `platform/runtime/` (serveur, interface, copie du moteur) |
| Tests | `projects.test.ts`, `contracts.test.ts`, chaîne et tests unitaires étendus, `scripts/acceptance*`, `scripts/e2e-parcours.mjs` |
| Intégration | `contracts/` (10 schémas et des exemples), `clients/` (client et exemples) |
| Documentation | README, ARCHITECTURE, DEMO, INTEGRATION_ALAN, INTEGRATION_MOUSS, LIMITATIONS, ce rapport |

### Poussé sur GitHub le 7 novembre 2026

- **Branche** : `rebuild/studio`, commit `579c38e`, dossier `studio/`. `main` n'a pas été modifié.
- **Fusion** : `main` a été fusionné dans la branche sans conflit, puisque l'équipe ne touche pas à `studio/`.
- **Vérifications avant envoi, sur l'arbre poussé** : aucun secret, 113/113 tests, contrôle des types sans erreur, validation de l'équipe (`tools/reborn.mjs validate`) sans erreur, aucun fichier interdit.
- **CI GitHub (validate)** : l'étape « Tests » échoue à cause d'un bug déjà présent sur `main` depuis le commit `d2d874d`. Les 3 dernières exécutions de `main` échouent pareil.
  - Cause : `"test": "node --test tests/"` passe un dossier, ce que `node --test` refuse.
  - Correctif proposé à Alan : `"test": "node --test 'tests/*.test.mjs'"`. Essayé en local : 55 tests, 0 échec.
  - Les autres étapes de la CI passent.
