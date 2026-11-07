# Démonstration complète (environ 10 minutes)

Elle se fait sur un **ancien logiciel de test réel** : Relatio 2004, un CRM web avec sa base SQLite et des données synthétiques. Les éléments que fourniront Alan et Mouss sont remplacés par des **jeux de test à leur format**, étiquetés comme tels dans l'interface. Aucune exploration réelle par H Company n'est simulée.

## Préparer

```bash
npm install --prefix platform        # une fois
npm run start                        # Studio :3000 · Relatio :4100 · Quotix :4000
npm run crm-source:password          # copie le mot de passe du compte « migration » de Relatio
```

## Dérouler

1. **Projets** (`http://127.0.0.1:3000`)
   - Cliquer sur « Nouveau projet ».
   - Renseigner : entreprise « Morel Équipements », logiciel « Relatio 2004 », URL `http://127.0.0.1:4100`, identifiant `migration` et le mot de passe copié.
   - Cocher l'autorisation du propriétaire, puis créer le projet.
   - Le mot de passe ne sera plus jamais affiché : il est chiffré et effacé au bout de 24 h.
2. **Connexion**
   - Montrer l'état « Connexion en attente » et la mission prévue pour l'agent de Mouss : objectifs, contraintes, jeton à usage unique.
   - Lancer le test réel du connecteur HTTP avec le plan de test Relatio : l'état passe à « Connecté ».
3. **Découverte**
   - Expliquer qu'aucune exploration réelle n'a eu lieu : l'écran indique « En attente de l'agent Computer Use ».
   - L'atelier (`/atelier`) montre la chaîne règles en mode test.
4. **Données**
   - Extraire avec le plan de test : 11 exports sont récupérés et 2 sont refusés au compte (commissions, sauvegarde SQL). Les refus sont consignés.
   - Montrer l'encodage détecté et les empreintes SHA-256.
5. **Correspondances**
   - Comparer la proposition automatique et le jeu de test de l'Analyste (Relatio).
   - Montrer « Ancien T_CLIENT.RAISON_SOC → clients.raison_sociale », les relations et la protection des factures.
   - Valider les points incertains : la migration reste bloquée tant qu'il en reste.
6. **Migration**
   - La lancer : environ 21 000 enregistrements, chacun avec son origine.
   - Montrer les rejets et leur motif (CSV), ainsi que les doublons signalés.
7. **Validation**
   - Montrer la vérification indépendante : volumes, valeurs champ par champ, relations, montants au centime, pièces jointes, intégrité.
   - Accepter les écarts documentés.
   - Recevoir le modèle métier (jeu de test au format d'Alan) et le **rejouer sur l'historique** : 1 772 devis identiques au centime sur 1 796, 24 écarts d'arrondi signalés comme tels, aucun écart réel.
8. **Reconstruction**
   - Parcourir l'ApplicationSpec : entités, provenance (observé, déduit, validé), écrans, actions, règles installées, éléments **non reconstruits** (exports refusés).
   - Valider le modèle métier, puis « Générer et mettre en service ».
9. **Livraison**
   - Le logiciel est en service sur son port. Ouvrir le lien.
   - `npm run crm:password` copie le mot de passe admin.
10. **Dans le nouveau CRM**
    - Retrouver un client migré et son origine exacte.
    - Créer un devis : choisir un client, ajouter 3 articles avec leur quantité. Prix, remises, TVA et TTC sont calculés côté serveur par le modèle métier v1, et la version est affichée sur le devis.
    - Tenter de modifier une facture historique : le serveur refuse et la tentative est journalisée.
11. **Nouvelle version des règles**
    - Publier une v2 validée depuis l'étape Livraison.
    - Un nouveau devis est calculé en v2 ; le premier garde ses montants en v1.
12. **Indépendance**
    - Faire Ctrl+C dans le terminal de `npm run start` : le Studio et l'ancien logiciel s'arrêtent, le CRM continue de répondre.
    - Il se relance seul avec `npm run crm`, et ses données sont intactes.

## Preuves automatisées

```bash
npm test                 # vitest, dont la chaîne complète sur le vrai serveur Relatio
npm run acceptance       # tests d'acceptation 1 à 6 et 8 : processus réels, Ctrl+C sur le Studio compris
node scripts/e2e-parcours.mjs   # parcours d'un projet dans un vrai navigateur
```
