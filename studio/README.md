# REBORN — migration et reconstruction de logiciels métier

Partie **Jerem** du projet (hackathon H Company × 42AI) : REBORN Studio, migration des données, reconstruction du logiciel, validation, livraison.

À partir d'un ancien CRM ou ERP auquel le propriétaire donne un accès autorisé, REBORN produit un **nouveau logiciel autonome**. Ce logiciel contient les **données historiques réellement migrées et vérifiées**, et calcule ses nouveaux documents avec le **modèle métier validé**. Le parcours :

1. **Connexion** à l'ancien logiciel.
2. **Découverte** par l'agent Computer Use de Mouss.
3. **Données** : exports et fichiers récupérés.
4. **Correspondances** : ancien schéma → nouveau.
5. **Migration** : nouvelle base construite.
6. **Validation** : contrôles sur les vraies données.
7. **Reconstruction** : spécification et modèle métier d'Alan.
8. **Livraison** : logiciel indépendant du Studio.

Documents : [ARCHITECTURE.md](ARCHITECTURE.md) · [DEMO.md](DEMO.md) · [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md) · [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md) · [LIMITATIONS.md](LIMITATIONS.md) · contrats JSON : [`contracts/`](contracts/).

## Lancer

```bash
npm install --prefix platform     # une fois (Node ≥ 22.13)
npm run start                     # build de production puis serveurs, sur 127.0.0.1 uniquement
```

| Adresse | Quoi |
|---|---|
| http://127.0.0.1:3000 | **REBORN Studio** : projets de migration, parcours en 8 étapes |
| http://127.0.0.1:4100 | Relatio 2004 : **ancien CRM de test** (vraie base SQLite, données synthétiques). `npm run crm-source:password` copie le mot de passe du compte `migration` |
| http://localhost:4000 | Quotix 98 : ancien logiciel de devis de test, pour l'atelier règles |
| http://127.0.0.1:5050 | **Logiciel livré** (après mise en service). `npm run crm:password` copie le mot de passe `admin` initial |

Les mots de passe ne sont jamais affichés. Ils sont copiés dans le presse-papiers.

## Lancer le logiciel livré sans REBORN

```bash
npm run crm                       # ou : cd generated/<id> && npm start   (PORT=8080 HOST=0.0.0.0 npm start)
```

Le logiciel livré ne dépend ni du Studio ni de l'ancien logiciel :
- **Dépendances** : il n'a besoin que de Node.
- **Ce qu'il contient** : sa base `data/app.db`, ses règles `rules/vN.json`, ses utilisateurs, ses sauvegardes et son journal d'audit.
- **Arrêt du Studio** : le logiciel est lancé détaché, donc un Ctrl+C dans le terminal du Studio ne l'arrête pas.

## Tests

| Commande | Ce qui est vérifié |
|---|---|
| `npm test` | 113 tests unitaires et d'intégration (vitest) : moteur de règles, API, sécurité, projets isolés, identifiants, contrats publiés, formats, conversions, protection de l'historique. Elle inclut la **chaîne complète sur le vrai serveur Relatio** : extraction HTTP, migration, vérification, modèle métier rejoué sur l'historique, CRM généré, calcul des devis par les règles v1 puis v2, mise à jour sans perte, retour arrière. |
| `npm run acceptance` | 49 vérifications d'acceptation de bout en bout, avec des **processus réels** : deux structures d'ancien logiciel (SQLite synthétique, Relatio par extraction HTTP), exemples Python d'Alan et de Mouss exécutés, trois projets isolés, deux logiciels livrés en parallèle, ancien CRM SQLite synthétique, migration, CRM généré, client, produit, devis à 3 lignes calculé par le modèle, nouvelle version des règles, **Ctrl+C sur le Studio** puis redémarrage du CRM seul, refus de modifier une facture historique |
| `node scripts/e2e-parcours.mjs` | **Parcours complet dans un vrai navigateur** (Chrome headless), sur un Studio et un Relatio isolés (dossiers temporaires) : création du projet, connexion, extraction, correspondances, migration, validation, modèle métier, génération, livraison, puis devis à lignes dans le nouveau CRM, mobile 390 px |
| `npm run e2e` · `node scripts/e2e-migration.mjs` | Anciens parcours navigateur (atelier règles ; vue unique `/migration`). **Ils remettent à zéro le Studio visé** : lancez-les sur une pile de test (`REBORN_URL=…`), jamais sur vos données |
| `npm run contracts` | Régénère `contracts/*.schema.json` à partir de la validation de l'API |
| `npm run build` | Build de production du Studio |

## Où est le code

| Partie | Dossier |
|---|---|
| Studio (interface et API) | `platform/src/app/` : tableau de bord `/`, projets `/projets/[id]/<étape>`, atelier `/atelier` |
| Moteurs | `platform/src/lib/migration/` (projets, extraction, analyse, correspondances, migration, vérification, modèle métier, génération) · `platform/src/lib/engine/` (moteur de règles, liaisons) |
| Logiciel livré (gabarit générique) | `platform/runtime/`, copié dans `generated/<id>/` |
| Logiciels de test | `legacy-crm/` (Relatio 2004), `legacy-app/` (Quotix 98) |
| Jeux de test au format d'Alan et de Mouss | `platform/scenarios/crm/` (plan d'extraction, correspondances, modèle métier) |
| Client Python et exemples | `clients/reborn_client.py`, `clients/examples/` |
