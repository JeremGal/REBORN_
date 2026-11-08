# REBORN — migration et reconstruction de logiciels métier

Partie **Jerem** du projet (hackathon H Company × 42AI) : REBORN Studio, comptes clients, migration des données, reconstruction du logiciel, validation, livraison.

REBORN est un service en ligne pour les entreprises (B2B). Un client **crée son compte**, crée un projet de migration, indique l'adresse de son ancien CRM ou ERP, confie un compte de connexion (chiffré, 24 h au plus) et autorise l'analyse. REBORN produit un **nouveau logiciel autonome** qui contient les **données historiques réellement migrées et vérifiées**, et calcule ses nouveaux documents avec le **modèle métier validé**. Le parcours d'un projet :

1. **Connexion** à l'ancien logiciel (« Analyser mon logiciel »).
2. **Découverte** par l'agent Computer Use de Mouss.
3. **Données** : exports et fichiers récupérés.
4. **Correspondances** : ancien schéma → nouveau.
5. **Migration** : nouvelle base construite.
6. **Validation** : contrôles sur les vraies données.
7. **Reconstruction** : spécification et modèle métier d'Alan.
8. **Livraison** : logiciel indépendant du Studio, avec ses propres comptes.

Documents : [ARCHITECTURE.md](ARCHITECTURE.md) · [DEMO.md](DEMO.md) · [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md) · [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md) · [LIMITATIONS.md](LIMITATIONS.md) · contrats JSON : [`contracts/`](contracts/).

## Lancer

Dans le dépôt de l'équipe, toutes les commandes de ce document se lancent depuis le dossier `studio/` (`cd studio`) : à la racine, `npm test` lance les tests de l'équipe, et `npm run start` ou `npm run account` n'existent pas.

```bash
npm install --prefix platform     # une fois (Node ≥ 22.13)
npm run start                     # build de production puis serveurs, sur 127.0.0.1 uniquement
```

| Adresse | Quoi |
|---|---|
| http://127.0.0.1:3000 | **REBORN Studio** : accueil public, `/inscription`, `/connexion`, espace client (`/espace`, `/projets`), parcours en 8 étapes |
| http://127.0.0.1:4100 | Relatio 2004 : **ancien CRM de test** (vraie base SQLite, données synthétiques). `npm run crm-source:password` copie le mot de passe du compte `migration` |
| http://localhost:4000 | Quotix 98 : ancien logiciel de devis de test, pour l'atelier règles de l'équipe |
| http://127.0.0.1:5050 | **Logiciel livré** (après mise en service), un port par logiciel à partir de 5050 |

Les mots de passe et jetons ne sont jamais affichés : les commandes `npm run …:password` et `npm run token` les copient dans le presse-papiers.

## Comptes

### Premier démarrage (et projets existants)

1. Créer son compte sur http://127.0.0.1:3000/inscription : prénom, nom, entreprise, e-mail, mot de passe (10 à 128 caractères), et les deux cases (conditions d'utilisation acceptées, politique de confidentialité lue). Elles ne sont jamais pré-cochées ; le serveur refuse l'inscription sans elles et enregistre leur version.
2. Se donner le rôle d'opérateur (équipe REBORN) — **uniquement en ligne de commande**, jamais par l'interface ni l'API :
   ```bash
   npm run account -- operator <email>
   ```
3. Rattacher les projets créés avant les comptes (ils n'ont pas de propriétaire : seul un opérateur les voit) :
   ```bash
   npm run account -- claim-unowned <email>        # tous les projets sans propriétaire → ce compte
   npm run account -- assign <MIG_id> <email>      # ou un projet précis → un compte (client ou opérateur)
   ```
   Aucune donnée n'est déplacée ni supprimée : seul le propriétaire est inscrit dans `platform/.data/migration/projects.json`.

### Commandes de l'opérateur

`npm run account -- <commande>` lit et écrit `platform/.data/auth.db` (ou `REBORN_DATA_DIR`). Aucune commande ne lit ni n'affiche un mot de passe.

| Commande | Effet |
|---|---|
| `list` | Comptes (rôle, entreprise, nombre de projets) et projets (propriétaire) |
| `operator <email>` · `client <email>` | Donne ou retire le rôle opérateur (effet immédiat, sans reconnexion) |
| `assign <MIG_id> <email>` | Rattache un projet à un compte |
| `claim-unowned <email>` | Rattache à ce compte tous les projets sans propriétaire |
| `reset-link <email>` | Lien de réinitialisation du mot de passe (usage unique, 1 h), affiché **dans ce terminal seulement**, à transmettre par un canal sûr. Studio en service requis. Aucun service d'e-mail n'est branché : il n'y a pas de « Mot de passe oublié » en libre-service |
| `delete-project <MIG_id> [--confirm]` | **Suppression sur demande** d'un projet et de ses données. Sans `--confirm` : aperçu, rien n'est supprimé. Avec : logiciel livré arrêté puis supprimé (base, sauvegardes, accès), identifiants confiés effacés (clé d'abord), dossier du projet (sources extraites, exécutions, modèles), captures, journal, observations, schémas, missions, entrée de l'index. Irréversible. Studio en service requis (la suppression se fait dans son processus, état en mémoire compris) |
| `delete <email> [--confirm]` | **Suppression sur demande** d'un compte : chacun de ses projets comme ci-dessus, puis sessions, connexions, liens de réinitialisation en attente, compteur de verrouillage et le compte. Les lignes de consentement (identifiant de compte, document, version, date — ni nom, ni e-mail) sont conservées comme preuve, à valider par un juriste |

### Ce que chacun voit

- **Client** : ses projets seulement. Tout appel sur le projet d'un autre compte répond « Projet introuvable » (404), quelle que soit la façon de désigner le projet (`/api/projects/<id>`, `?project=`, en-tête `x-reborn-project`).
- **Opérateur** : ses projets, les projets sans propriétaire, l'atelier (`/atelier`, `/investigation`, `/regles`, `/reconstruction`, `/comparaison`, `/migration`, `/design-system`, `/app`). Il n'ouvre pas les projets des clients.
- **Agents** (Mouss, Alan) : jetons de service, `Authorization: Bearer …`. `npm run token -- explorer` (exécuteur de Mouss) ou `npm run token -- analyst` (Analyste d'Alan) copie le jeton. Projet **obligatoire** : `?project=MIG_…` (le client Python le pose depuis `REBORN_PROJECT`). Voir [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md) et [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md).

### Accès au logiciel livré

Le logiciel livré a ses propres comptes. À l'étape Livraison, le propriétaire du projet clique « Créer mon accès au logiciel » : le Studio dépose une invitation à usage unique (72 h) et affiche le lien **une seule fois**. En l'ouvrant, la personne choisit **son** mot de passe (12 caractères au moins) ; ni le Studio ni l'ancien logiciel ne le connaissent. Le compte `admin` de `generated/<id>/.secrets/admin.json` reste l'accès de secours de l'opérateur (`npm run crm:password` le copie).

## Lancer le logiciel livré sans REBORN

```bash
npm run crm                       # ou : cd generated/<id> && npm start   (PORT=8080 HOST=0.0.0.0 npm start)
```

Le logiciel livré ne dépend ni du Studio ni de l'ancien logiciel :
- **Dépendances** : il n'a besoin que de Node.
- **Ce qu'il contient** : sa base `data/app.db`, ses règles `rules/vN.json`, ses comptes, ses sauvegardes et son journal d'audit.
- **Arrêt du Studio** : le logiciel est lancé détaché, donc un Ctrl+C dans le terminal du Studio ne l'arrête pas.

## Secrets et sauvegardes

| Où | Quoi |
|---|---|
| `.secrets/tokens.json` | Secret des sessions des comptes, jetons des agents (explorer, analyst), console Quotix. Clés ajoutées si absentes, jamais régénérées en silence (`npm run secrets -- rotate <clé>` explicitement) |
| `platform/.data/auth.db` | Comptes (mots de passe hachés scrypt), sessions, consentements, file des missions d'analyse |
| `platform/.data/vault.key` | Clé maîtresse qui enveloppe les clés des identifiants confiés |
| `platform/.keys/` | **Une clé par identifiant confié.** L'effacement d'un identifiant supprime d'abord sa clé : c'est ce qui le rend illisible pour toujours |
| `generated/<id>/.secrets/` | Accès de secours de l'opérateur au logiciel livré, invitations (empreintes seulement) |

Tous ces fichiers sont en mode 0600 (dossiers 0700) et ignorés par git.

> **Exclure `platform/.keys` des sauvegardes** (Time Machine, iCloud, disque externe) : une sauvegarde qui contient ces clés conserverait de quoi déchiffrer des identifiants que REBORN a effacés. Ce n'est pas automatique. Time Machine : `mkdir -p -m 700 platform/.keys && tmutil addexclusion platform/.keys` (le dossier n'existe qu'après le premier dépôt d'identifiants ; le créer à l'avance avec ces droits est sans effet sur le Studio). Si le Bureau est synchronisé avec iCloud, placer les clés hors du Bureau : `REBORN_KEYS_DIR="$HOME/Library/Application Support/REBORN/keys" npm run start` (changer ce dossier rend inutilisables les identifiants déjà confiés : ils sont effacés et le client les confie à nouveau).

## Tests

Les scripts d'acceptation et de navigateur montent **leur propre pile isolée** : Studio de production construit dans `platform/.next-test` (jamais `.next`, le build du Studio en service), dossier temporaire pour les données et les logiciels livrés, ports libres, secrets aléatoires jamais affichés, comptes créés par la vraie inscription, opérateur désigné par `scripts/account.mjs` sur la base temporaire. Le Studio en service, ses données, `.secrets/` et `generated/` ne sont jamais lus ni modifiés. Le dossier temporaire et le profil Chrome sont supprimés à la fin.

| Commande | Ce qui est vérifié |
|---|---|
| `npm test` | Tests unitaires et d'intégration (vitest) : comptes, isolation entre clients route par route, identifiants (chiffrement, 24 h, effacement), file des missions, moteur de règles, migration, contrats, et la **chaîne complète sur le vrai serveur Relatio** (extraction HTTP, migration, vérification, modèle métier rejoué, CRM généré, règles v1 puis v2, mise à jour sans perte, retour arrière) |
| `npm run acceptance` | **95 vérifications** avec des processus réels : comptes (inscription avec consentements, refus sans consentement, déconnexion, reconnexion, opérateur par la ligne de commande) ; deux clients et deux structures d'ancien logiciel (SQLite synthétique, Relatio par extraction HTTP) ; « Analyser mon logiciel » sans exécuteur (message exact) ; doublure d'exécuteur étiquetée « jeu de test » (battement, prise conforme au schéma `connection_mission` 1.1, remise unique, connexion réelle, rapport, fin, identifiants effacés) ; exemples Python de Mouss et d'Alan avec les jetons de service, et règles de l'Analyste rangées dans le projet par le client Python 1.3 ; accès au logiciel livré par lien d'activation ; devis à 3 lignes, règles v1 puis v2 ; protection de l'historique ; isolation entre les deux comptes par appels directs ; aucun secret dans les réponses, les fichiers ni le journal ; **Ctrl+C sur le Studio** puis redémarrage du CRM seul |
| `node scripts/e2e-parcours.mjs` | **72 vérifications**, parcours client dans un vrai navigateur (Chrome headless) : accueil, inscription dans l'interface, assistant « Nouvelle migration », « Agent d'analyse non disponible pour le moment. », test réel du connecteur, 8 étapes jusqu'à la livraison, activation dans le CRM livré avec un mot de passe choisi, devis à 3 lignes calculé par le serveur, historique protégé, mobile 390 et 320 px |
| `npm run e2e` | **29 vérifications**, atelier de l'équipe (opérateur) : application générée `/app` (devis, logistique, mise à jour du modèle en cours d'utilisation), tableaux de bord |
| `node scripts/e2e-migration.mjs` | **32 vérifications**, vue de l'équipe `/migration` : extraction, correspondances, migration, vérification, écarts acceptés au nom du compte connecté, mise en service, CRM livré |
| `npm run a11y` | Audit d'accessibilité sur pile isolée : axe-core sur 27 pages (Studio et CRM livré) et 12 états, à 1440 et 390 px (76 analyses) ; clavier (focus visible mesuré, ordre, lien d'évitement, dialogues : piège, Échap, retour du focus) ; zoom 200 %, 320 px, mouvement réduit ; rapport dans `e2e-shots/a11y/`. Un audit automatisé ne vaut pas conformité WCAG |
| `npm run contracts` | Régénère `contracts/*.schema.json` à partir de la validation de l'API |
| `npm run build` | Build de production du Studio en service (`platform/.next`) |

Variables des scripts de test : `REBORN_DIST_DIR=.next-<nom>` (dossier de build, défaut `.next-test` ; reconstruit si une source est plus récente, `REBORN_REBUILD=1` force, `REBORN_NO_REBUILD=1` l'évite), `REBORN_KEEP_TMP=1` (garder le dossier de test pour lire les journaux), `SHOTS_DIR` (captures, jamais dans le dépôt par défaut), `CHROME_PATH`. `next build` réécrit `platform/tsconfig.json` et `platform/next-env.d.ts` pour un dossier de build personnalisé : les scripts les restaurent à l'identique.

## Où est le code

| Partie | Dossier |
|---|---|
| Studio (pages) | `platform/src/app/` : `(site)` accueil et textes juridiques · `(auth)` connexion, inscription, réinitialisation · `(platform)` espace client (`/espace`, `/projets`, `/projets/[id]/<étape>`, `/activite`, `/parametres`) · `(platform)/(equipe)` atelier de l'équipe |
| Comptes et accès | `platform/src/lib/auth/` (Better Auth, sessions, consentements, jetons de service), `platform/src/lib/http.ts` (contrôle d'accès de chaque route), `platform/src/lib/visibility.ts` |
| Moteurs | `platform/src/lib/migration/` (projets, identifiants, file des missions, sorties réseau, extraction, analyse, correspondances, migration, vérification, modèle métier, génération) · `platform/src/lib/engine/` (moteur de règles, liaisons) |
| Design system | `platform/src/components/ds/`, jetons dans `platform/src/app/globals.css`, démonstration `/design-system` (opérateur) |
| Logiciel livré (gabarit générique) | `platform/runtime/`, copié dans `generated/<id>/` |
| Logiciels de test | `legacy-crm/` (Relatio 2004), `legacy-app/` (Quotix 98) |
| Jeux de test au format d'Alan et de Mouss | `platform/scenarios/crm/` (plan d'extraction, correspondances, modèle métier) |
| Client Python et exemples | `clients/reborn_client.py` (1.3), `clients/examples/` |
| Scripts | `scripts/account.mjs` (comptes), `scripts/acceptance/stack.mjs` (pile de test isolée commune), `scripts/acceptance.mjs`, `scripts/e2e-*.mjs` |
