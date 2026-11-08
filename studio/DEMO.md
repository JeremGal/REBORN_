# Démonstration complète (environ 15 minutes)

Elle suit le parcours d'un **client** de REBORN, sur un **ancien logiciel de test réel** : Relatio 2004, un CRM web avec sa base SQLite et des données synthétiques. Les éléments que fourniront Alan et Mouss sont remplacés par des **jeux de test à leur format**, étiquetés comme tels dans l'interface. Aucune exploration par l'agent de H Company n'est simulée : tant que l'exécuteur de Mouss n'est pas branché, le Studio l'affiche honnêtement.

## Préparer

```bash
npm install --prefix platform        # une fois
npm run start                        # Studio :3000 · Relatio :4100 · Quotix :4000
npm run crm-source:password          # copie le mot de passe du compte « migration » de Relatio
```

Pour une démonstration répétée, utiliser une nouvelle adresse e-mail : une adresse n'a qu'un compte.

## Dérouler

1. **Accueil** (`http://127.0.0.1:3000`)
   - Page publique « Your software. Reborn. ». Cliquer sur « Commencer une migration ».
2. **Inscription**
   - Prénom, nom, entreprise (« Morel Équipements »), e-mail professionnel, mot de passe (10 caractères au moins) et sa confirmation.
   - Montrer les deux cases, **non cochées** : « J'accepte les conditions d'utilisation (version 1.0). » (contrat) et « J'ai pris connaissance de la politique de confidentialité (version 1.0). » (information). Sans elles, le compte n'est pas créé.
   - « Créer mon compte » ouvre l'espace du client.
3. **Nouvelle migration** (assistant en 3 étapes)
   - *Votre logiciel* : entreprise « Morel Équipements », logiciel « Relatio 2004 », adresse `http://127.0.0.1:4100`.
   - *Accès* : « Je confie un compte de connexion (recommandé) », identifiant `migration`, mot de passe copié. L'écran explique ce que deviennent les identifiants : chiffrés dès réception, 24 heures au maximum, supprimés plus tôt dès qu'ils ne servent plus, jamais montrés à un modèle d'IA, jamais écrits dans un journal.
   - *Confidentialité et autorisation* : cocher la déclaration d'autorisation d'accès et la prise de connaissance du traitement des identifiants, puis « Analyser mon logiciel ».
   - Résultat : le projet est créé et la demande d'analyse est en file. Sans exécuteur en ligne, le Studio affiche exactement « Agent d'analyse non disponible pour le moment. » ; aucune exploration n'a commencé. L'import manuel de fichiers reste possible.
4. **Connexion** (« Suivre la demande »)
   - État de la demande (« En file d'attente », agent « Non disponible »), échéance des identifiants, bouton de suppression immédiate.
   - « Logiciel de test Relatio 2004 » puis « Tester la connexion » : le connecteur HTTP de REBORN se connecte **réellement** au logiciel de test, l'état passe à « Connecté ».
5. **Découverte**
   - « Exploration indisponible — agent non connecté. » et la chronologie des seuls faits réels (demande, connexion, exports).
6. **Données**
   - « Extraire avec le plan de test » : 11 exports récupérés, 2 refusés au compte (commissions, sauvegarde SQL), refus consignés. Les identifiants confiés sont effacés à la fin de l'extraction réussie.
   - Consultation paginée côté serveur (tri, recherche, filtre), colonnes et qualité.
7. **Correspondances**
   - « Jeu de test au format de l'Analyste — Relatio ». La file « À vérifier » montre « Ancien champ → Nouveau champ » (ex. `T_CLIENT.RAISON_SOC` → Clients / Raison sociale), l'incertitude et les transformations qui modifient une valeur.
   - Accepter, corriger (aperçu sur les vraies valeurs avant d'enregistrer) ou rejeter un champ ; ou « Accepter toutes les propositions restantes » (confirmation : nombre de points, protections de l'historique comptable listées à part et décochables). La migration reste bloquée tant qu'un point incertain n'est pas tranché.
8. **Migration**
   - « Lancer la migration » : 21 065 fiches transférées sur 21 079 lignes sources, 14 rejetées avec leur motif (2 clients sans raison sociale, leurs devis et leurs lignes).
9. **Validation**
   - Vérification indépendante : totaux financiers, fiches et champs, documents, règles métier, et ce qui n'a pas pu être vérifié.
   - Accepter les écarts documentés avec un commentaire (enregistré au nom du compte connecté).
10. **Reconstruction**
    - Vue d'ensemble de la spécification : modules, écrans, liens, fonctionnalités, éléments **non reconstruits** (exports refusés).
    - « Recevoir le jeu de test Relatio » (modèle métier au format d'Alan), « Rejouer sur l'historique » : 1 772 devis identiques au centime sur 1 796, 24 écarts d'arrondi de 1 à 2 centimes signalés comme tels, aucun écart réel.
    - « Valider cette version », puis « Générer et mettre en service ».
11. **Livraison**
    - Le logiciel est « En service » sur son port ; « Ouvrir mon nouveau logiciel ».
    - « Créer mon accès au logiciel » : lien d'activation à usage unique, affiché une seule fois. L'ouvrir et **choisir son mot de passe** (12 caractères au moins). Ni le mot de passe REBORN ni celui de Relatio n'ouvrent le nouveau logiciel.
12. **Dans le nouveau CRM**
    - Retrouver un client migré et l'origine exacte de sa fiche.
    - Créer un devis : choisir un client, ajouter 3 articles avec leur quantité. Prix, remises, TVA et TTC sont calculés côté serveur par le modèle métier v1 (« Calculé par le serveur »), et la version est affichée sur le devis.
    - Ouvrir une facture historique : « Historique protégé ». Une modification de son montant est refusée par le serveur et la tentative est journalisée.
13. **Nouvelle version des règles** (si l'Analyste a envoyé une v2, rejouée et validée)
    - « Publier v2 » à l'étape Livraison : un nouveau devis est calculé en v2 ; le premier garde ses montants en v1 ; l'historique n'est jamais recalculé.
14. **Indépendance**
    - Faire Ctrl+C dans le terminal de `npm run start` : le Studio et l'ancien logiciel s'arrêtent, le CRM continue de répondre.
    - Il se relance seul avec `npm run crm`, et ses données comme les accès créés sont intacts.

## Côté équipe (facultatif)

Avec un compte opérateur (`npm run account -- operator <email>`) : l'atelier règles (`/atelier`, `/app`), la vue `/migration` et `/design-system`. Un client n'y a pas accès (page introuvable).

## Preuves automatisées

```bash
npm test                          # vitest, dont la chaîne complète sur le vrai serveur Relatio
npm run acceptance                # 95 vérifications : comptes, deux clients isolés, doublure d'exécuteur, Ctrl+C sur le Studio
node scripts/e2e-parcours.mjs     # 72 vérifications : ce parcours client dans un vrai navigateur
npm run e2e                       # 29 vérifications : atelier de l'équipe
node scripts/e2e-migration.mjs    # 32 vérifications : vue /migration de l'équipe
```

Chacun monte sa propre pile isolée (dossier temporaire, ports libres, secrets aléatoires) : le Studio en service et ses données ne sont pas touchés.
