# Contexte pour le prochain agent

Mis à jour le 07/11/2026. Lis ce fichier en entier avant de toucher au repo, puis `CLAUDE.md`, `README.md` et `docs/GUIDE.md`. Les docs du repo sont en anglais ; Alan, lui, te parle en français et tu lui réponds au « tu », sans tiret cadratin, avec des phrases qu'un novice comprend.

## 1. Le projet en trois phrases

ReBorn est le projet d'Alan pour le **H Company Computer Use Agents Hackathon** (Paris, avec 42AI, novembre 2026). Il sert à moderniser un vieux logiciel métier (compta, caisse, ERP type PC Compta) : **nouvelle interface, même logique métier**. Le projet ne sera jamais commercialisé : c'est une démonstration, sur des logiciels qu'on a le droit d'étudier.

## 2. La chaîne en trois blocs

| Bloc | Qui | Reçoit | Produit |
|---|---|---|---|
| 1. Explorer | agent computer-use de H Company | des missions (`ui_steps`, valeurs à lire) | des runs : étapes, captures, valeurs lues à l'écran |
| 2. Enquêter | Alan + REA + Craft Anything + Claude Code | les runs + le logiciel ou sa doc | `handoff.json` + `dossier.md` + questions ouvertes |
| 3. Reconstruire | Claude Code, en salle blanche | **seulement** le kit du bloc 2 | l'appli neuve dans `apps/<cible>/`, puis un rapport de parité |

Principes qui tiennent tout le reste :

- **Chaque affirmation cite une preuve.** Statuts : `confirmed` (observé exactement, ou deux preuves de nature différente), `partial`, `hypothesis`, `refuted`. Ce qu'on ne sait pas va dans `unknowns.yaml`, on ne devine pas.
- **Statique n'est pas exécution.** Une décompilation dit « le code déclare », jamais « le logiciel fait ».
- **Salle blanche.** Le bloc 3 ne lit que le dossier produit par `export-kit` (kit, dossier, captures). Jamais de code décompilé ou original, d'asset ou de marque dans le kit ni dans l'appli. Le code le fait respecter : `dossier` et `handoff` refusent d'écrire si un nom lu dans la sortie du décompilateur s'y trouve, et le kit porte un `kit_title` neutre.
- **Natures de preuve.** Chaque preuve est de l'une de quatre natures : `runtime` (observation du programme qui tourne), `shipped-data` (données livrées : script SQL, fichiers d'interface, ressources), `static-code` (lecture ou décompilation du code), `documentation`. `confirmed` exige une observation, ou deux natures différentes, ou pour une entité un script SQL livré. Deux outils qui lisent le même binaire comptent pour une seule preuve. `validate` le vérifie (`tools/lib/basis.mjs`).
- **12 contrats JSON Schema** dans `contracts/` (feature, rule, screen, entity, run, mission, evidence-index, parity-report…). `node tools/reborn.mjs validate <cible>` avant chaque commit.

## 3. Où sont les choses

| Quoi | Où |
|---|---|
| Repo GitHub (privé) | `AlanECE/ReBorn` |
| Clone de travail | `%USERPROFILE%\hackaton-work\ReBorn` (disque interne : `node_modules` et rendus cassent sur le disque exFAT) |
| Outils installés (Node portable, Ghidra, JDK, ghidra-mcp) | `%USERPROFILE%\hackaton-work\tools\` |
| Logiciels étudiés (binaires, jamais dans git) | `%USERPROFILE%\hackaton-work\samples\` (gnucash, unicenta, mmex) |
| Chemins propres à la machine | `reborn.local.json` à la racine du repo (gitignoré) |
| Variables d'environnement d'une session PowerShell | `. %USERPROFILE%\hackaton-work\tools\env-hackaton.ps1` (PATH, `JAVA_HOME`, `GHIDRA_INSTALL_DIR`) |
| Dossier hackathon d'Alan (skills, catalogue, état du PC) | `D:\Nouveau dossier\Claude\hackaton\` et son `ENVIRONNEMENT\` (REA.md, GITHUB-ET-CLES.md, ETAT-DU-PC.md, CARTE-DES-BRIQUES.md) |
| Preuves brutes (sorties REA, décompilations) | `.evidence/<cible>/` dans le repo, **gitignoré**. Seul `targets/<id>/02-investigation/evidence/index.yaml` (métadonnées + empreintes) est versionné |

## 4. La CLI `tools/reborn.mjs`

Point d'entrée unique, environ 800 lignes, Node 20+ (REA, lui, demande Node 24 : la CLI le trouve via `reborn.local.json`). Commandes principales :

| Commande | Rôle |
|---|---|
| `doctor` | ce qui est installé ou manquant (Node, REA, Craft, Chrome, Ghidra, JDK) |
| `init <cible>` / `status` / `validate` | créer une cible depuis `targets/_template`, voir son état, valider contre les schémas |
| `analyze <cible> <fichier ou URL>` | aiguillage automatique selon le type (PE, ELF, jar, SQL, page web…) |
| `schema <cible> <fichier.sql>` | transforme les `CREATE TABLE` en fiches entités `confirmed` |
| `doc <cible> <url>` / `web` | capture de pages publiques (Crawl4AI en Docker, ou Linkup si `WEB_PROVIDER=linkup`) |
| `ui <cible> ...` / `find` | inventaire des fenêtres, recherche de fonctionnalités (Craft) |
| `native <cible> <binaire> --engine ghidra-mcp\|rea --find <regex>` | **nouveau** : décompilation Ghidra de fonctions choisies par nom (voir §7) |
| `rea <cible> <commande REA>` | n'importe laquelle des 175 commandes REA, avec garde légale sur les commandes natives |
| `ask <cible>` | transforme chaque question ouverte en mission prête pour l'agent computer-use |
| `coverage <cible>` | couverture mesurée (écrans vus / fenêtres trouvées, entités / tables) |
| `verify [cible]` | re-calcule l'empreinte de chaque fichier de preuve et la compare à l'index |
| `identify <cible> <fichier>` | avec quoi le programme est fabriqué (Detect It Easy) et l'outil suivant ; arrêt si le programme est protégé |
| `symbols <cible> <dll> --contains RE` | noms exportés lus dans la table d'exports, en quelques secondes, sans Ghidra |
| `find <cible> <exe> "<libellé>" --engine ghidra-mcp` | du texte vu à l'écran aux fonctions qui l'utilisent, sur le serveur Ghidra (même vitesse que Craft, mais classé et suivi d'une décompilation immédiate) |
| `java <cible> <jar> --query Q` | classes et méthodes Java, appelants, lecture d'une méthode (Craft en mode profond, base légale exigée) |
| `manual <cible> <fichier.chm>` | sujets documentés du manuel : le dénominateur de la couverture des fonctionnalités |
| `db <cible> <fichier.dbf/.mdb/.accdb>` | vieille base vers SQLite et fiches d'entités (dBase testé, Access installé mais pas testé) |
| `relations <cible>` | liens entre tables suggérés par les noms de colonnes, sans clé déclarée (hypothèses) |
| `parity <cible>` | part des attentes du kit que la refonte a prouvées, avec une preuve assez forte |
| `export-kit <cible> <dossier>` | le seul dossier que le bloc 3 peut lire : kit, dossier, captures, README, après contrôle anti-fuite |
| `dossier <cible>` / `handoff <cible>` | le kit du bloc 3 : `dossier.md` lisible + `handoff.json` (ordre de construction, trace, carte de migration, vecteurs de test, `to_observe`, `readiness`, `coverage`) |

Bibliothèques dans `tools/lib/` : `config.mjs` (chemins, `reaEnv()`), `evidence.mjs` (registre des preuves, `runRea`), `handoff.mjs`, `sql-schema.mjs`, `rea-session.mjs` (client MCP REA à session longue), `ghidra-http.mjs` (client du serveur ghidra-mcp). `tools/mcp-rea.mjs` expose REA comme serveur MCP à Claude Code (`.mcp.json`).

Piège de code : `opt()` retire l'option de `argv`. Lis toujours les options **avant** les arguments positionnels.

## 5. Les cibles et leur état

| Cible | Type | Base légale | Où on en est |
|---|---|---|---|
| `gnucash` | compta, natif C/C++ (GPL) | open source | 1 fonctionnalité `partial`, 2 règles, 3 écrans, 4 entités, 25 preuves, 5 missions, 1 vrai run (premier lancement capturé). **Cible principale.** |
| `unicenta` | caisse, Java (GPL) | open source | 40 entités **confirmées** depuis le SQL livré dans le jar, 1 fonctionnalité, 2 règles, 1 écran |
| `pc-compta` | compta (DLG), commercial | version d'évaluation | doc publique seulement : 1 fonctionnalité `hypothesis`, 3 règles, 4 entités. Pas d'analyse du code (pas de licence d'étude) |
| `mmex`, `dolibarr` | compta perso / ERP web | open source | triage seulement |

Appli refaite (bloc 3) : `apps/gnucash/index.html`, « ReBorn Compta », une page HTML en français, partie double, règle R-001 (une transaction doit être équilibrée) et R-002 (montants en centimes entiers). Captures avant/après et onglet de tests (4 tests, tous passent). Publiée en artifact claude.ai (id `Ji8NkyQT9fEHXYg4iaHC8y`).

## 6. Ce qu'on a appris (à ne pas survendre)

- **Alan a demandé : « comment tu peux être sûr d'avoir bien recopié les features ? »** Réponse honnête : on ne peut pas l'être sans rejouer les mêmes scénarios sur l'original et sur la refonte. La couverture mesurée des écrans GnuCash était de **3 %**. Les affirmations trop fortes ont été corrigées (R-001 en confiance basse, U-004 ajoutée pour l'écart « Rebalance Transaction »).
- **Ce qui se récupère bien : les données.** uniCenta : 40/40 tables confirmées depuis le SQL livré. GnuCash : noms des 23 tables connus, types complets après un run qui enregistre un livre SQLite.
- **Ce qui demande l'observation : le comportement.** Les règles et le registre de saisie ne se confirment qu'en faisant tourner le logiciel, d'où le bloc 1.
- **Estimation GnuCash** (estimations, pas des mesures de parité) : structure retrouvée et documentée environ 90 % ; comportement des parcours courants 70 à 90 % sur les scénarios testés si l'agent computer-use tourne ; application entière 30 à 50 % dans le temps d'un hackathon. Banque en ligne, OFX, cours de bourse : hors périmètre.
- **GnuCash est le meilleur cas** : moteur non « stripped » (23 330 fonctions nommées dans `libgnc-engine.dll`, avec infos de débogage), 39 rapports standard en Scheme lisible (110 fichiers, 51 417 lignes), 111 fenêtres dans les fichiers d'interface, manuels `.chm` livrés, `gnucash-cli` qui génère des rapports sans fenêtre (piste de comparaison, pas testée). Un logiciel fermé se laisse beaucoup moins lire.

## 7. Analyse native : Ghidra, REA et ghidra-mcp (installés le 07/11/2026)

Avant, REA n'avait pas de moteur natif : sur un `.exe` ou une `.dll`, il ne voyait que les ressources et les imports. C'est réglé.

| Outil | Version | Rôle |
|---|---|---|
| Ghidra | 12.1.4 (NSA, empreinte SHA-256 vérifiée) | décompilateur |
| JDK Temurin | 21.0.13+9 (empreinte vérifiée) | Java pour Ghidra |
| REA | rea-agents 6.8.0 | `rea doctor --provider ghidra` : tout au vert. Premier `analyze` natif réussi sur `libgnc-core-utils.dll` (337 s) |
| ghidra-mcp | 7.0.0 (`github.com/bethington/ghidra-mcp`, Apache-2.0, empreintes vérifiées) | serveur Ghidra **sans interface** qui garde le programme chargé : 190 outils HTTP, plus un pont MCP Python |

Le jar de ghidra-mcp 7.0.0 est compilé pour Ghidra 12.1.4 (son `extension.properties` le dit, même si le README parle de 12.2), donc une seule installation de Ghidra sert aux deux.

**Lancer le serveur** (laisse-le tourner dans sa fenêtre) :

```powershell
powershell -ExecutionPolicy Bypass -File tools\ghidra-mcp.ps1 -Root %USERPROFILE%\hackaton-work\samples
# vérifier : http://127.0.0.1:8089/check_connection
```

Il écoute seulement sur `127.0.0.1`, l'exécution de scripts reste coupée, et `-Root` limite les fichiers importables au dossier des échantillons.

**Décompiler des fonctions choisies** :

```powershell
node tools\reborn.mjs native gnucash <chemin>\libgnc-core-utils.dll --engine ghidra-mcp --find "^gnc_path_get_" --max 3
```

Mesuré sur `libgnc-core-utils.dll` : import + analyse automatique 129 s (2 596 fonctions), puis 3 fonctions décompilées en 2 s, avec types, noms de variables, appelants et appelés. Sans `--engine`, c'est REA qui travaille (autonome mais il rouvre le binaire à chaque appel, donc plusieurs minutes par appel).

Mesuré sur `libgnc-engine.dll` (47 Mo, le moteur comptable) : import d'environ 6 min (18 637 fonctions), puis 7 fonctions de règles (équilibre d'une transaction, valeur de déséquilibre, réparation, arrondis) décompilées en 10 s. Résultat porté dans R-001 : le code déclare « équilibrée = somme exacte des valeurs égale à zéro, sans tolérance », avec une variante quand le livre utilise des comptes de négoce. R-001 passe en confiance `medium` mais reste `partial` : la décompilation et la recherche Craft lisent le même binaire, ce n'est pas une deuxième preuve indépendante. Sur cet essai, les appelants et appelés sont sortis vides : l'analyse automatique n'avait pas tourné après l'import. C'est corrigé : la CLI analyse maintenant après chaque import, et `--analyze` force une nouvelle analyse (non retesté sur cette DLL, l'analyse de 47 Mo est longue).

Pièges :
- `--file` au démarrage importe sans analyser ; la CLI lance `run_analysis` après tout import qu'elle déclenche elle-même, ou avec `--analyze`. Le serveur identifie les programmes par nom de fichier : la CLI refuse si un autre fichier du même nom est déjà chargé.
- Le client HTTP utilise `node:http` et pas `fetch` : `fetch` coupe toute réponse qui met plus de 5 min à arriver, et l'import d'une grosse DLL dure plus longtemps. Si un import est coupé quand même, le serveur continue : relance la même commande, elle retrouvera le programme déjà ouvert.
- La sortie décompilée est une **preuve brute** : elle reste dans `.evidence/`, jamais dans une fiche, jamais dans git, jamais donnée au bloc 3.
- La CLI refuse l'analyse native si `target.yaml` n'a pas `access.method` à `open-source`, `licence` ou `provided-by-organizers`.
- Pont MCP pour Claude Code : `%USERPROFILE%\hackaton-work\tools\ghidra-mcp\bridge-venv\Scripts\bridge-mcp-ghidra.exe` (variable `GHIDRA_MCP_URL=http://127.0.0.1:8089`). Il n'est **pas** déclaré dans le `.mcp.json` du repo exprès : le bloc 3 travaille dans ce repo et ne doit pas avoir de décompilateur. Ne l'ajoute que pour une session du bloc 2.

## 8. Outils de la machine

Windows 10 sans droits admin. Node 24.22.2 portable (pour REA), ffmpeg 9.0, git 2.56, Python 3.12, Rust 1.99.1 + `craft-anything-cli` 0.4.0 (322 commandes ; salle blanche par défaut, `--deep` lit le code), Docker (image `unclecode/crawl4ai`, 8,18 Go), innoextract. PowerShell 5.1 : pas de `&&`, pas de `foreach` entre parenthèses (utiliser `$( ... )`), pas de `$var:` collé à un deux-points.

## 9. Pousser sur GitHub

Le jeton est `github_token_reborn` dans `D:\Nouveau dossier\Claude\.env`. Il ne va **jamais** dans la config git, un fichier ou un message. On le passe par variables d'environnement, le temps d'une commande :

```powershell
$tok = (Select-String -Path "D:\Nouveau dossier\Claude\.env" -Pattern '^github_token_reborn=(.+)$').Matches[0].Groups[1].Value.Trim()
$b = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$tok"))
$env:GIT_CONFIG_COUNT = "1"; $env:GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader"; $env:GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic $b"
git push origin main
Remove-Item Env:GIT_CONFIG_COUNT, Env:GIT_CONFIG_KEY_0, Env:GIT_CONFIG_VALUE_0
```

## 10. Règles à ne jamais casser

- **Légal.** En France, l'étude d'un logiciel acquis légalement est permise pour l'interopérabilité, la sécurité, l'étude et la réparation. On n'analyse le code que des logiciels open source, sous notre licence ou fournis par les organisateurs. Jamais de contournement de protection (dongle, DRM, licence, authentification).
- **Secrets et données.** Aucune clé, aucun jeton, mot de passe, cookie, nom de serveur ou chemin personnel dans git. Binaires, HAR, bases et preuves brutes sont gitignorés exprès. Données de test inventées.
- **Pas d'action publique ou irréversible** (publier, envoyer des mails, payer, toucher au VPS) sans demande explicite d'Alan dans la conversation.
- **Qualité.** Une chose « faite » a été vérifiée. Un problème s'annonce tel quel. Aucun pourcentage de parité sans scénarios rejoués.

## 11. Pièges déjà rencontrés

- SourceForge bloque les téléchargements depuis cette machine (DNS et anti-robot). Le jar d'uniCenta a été fourni à la main par Alan.
- Les inspecteurs PE de REA refusent les fichiers de plus de 64 Mo : la CLI ajoute `--max-file-bytes` au-delà de 60 Mo.
- `craft native-window-capture` demande un consentement interactif : capturer l'appli en marche est le travail du bloc 1.
- Les artifacts claude.ai ne publient que des fichiers du dossier de travail ou du scratchpad.
- Certaines réponses longues sur le reverse engineering ont été coupées par un filtre de sécurité : rester concret et factuel aide.

## 12. Prochaines étapes

1. Bloc 1 : écrire dans `tools/` l'adaptateur qui convertit la sortie de l'agent H Company en `run.yaml` (`contracts/run.schema.json`), puis faire tourner les 5 missions GnuCash.
2. GnuCash : extraire le manuel `.chm` pour une liste de fonctionnalités indépendante, générer les fiches des 111 écrans, enregistrer les compteurs pour que `coverage` donne une vraie couverture. Couverture mesurée au 07/11/2026 : écrans 3 %, entités 17 %, fonctionnalités inconnue.
3. Faire passer R-001 en `confirmed` : soit un run (missions M-002 et M-005), soit le manuel `.chm` (nature `documentation`) en plus du code. Même méthode ensuite pour R-002 (arrondis).
4. Ce qui reste : un décompilateur .NET (ilspycmd) pour les logiciels .NET/WinForms, Docling pour les manuels PDF, un essai d'Access sur un vrai fichier, un serveur REA permanent (piste non testée), les lecteurs Delphi et VB6 trouvés (très jeunes, à tester sur un logiciel libre avant usage), écrire les fiches des 111 écrans de GnuCash.
5. Tests : `npm test` (51 tests, `tests/`). Ajouter un test à chaque défaut trouvé. Ils travaillent sur des copies jetables des cibles (`REBORN_TARGETS_DIR`).

## 13. Durcissement du bloc 2 (07/11/2026, après relecture de REA et de Craft)

Six lectures croisées (REA : méthode, code et Ghidra natif ; Craft ; notre code ; recherche de repos) ont donné 9 améliorations. Faites : validation stricte, kit contrôlé, salle blanche appliquée par le code, lecteur SQL corrigé, tests, robustesse de la CLI. Mesures, tests écrits avant les corrections :

| Mesure | Avant | Après |
|---|---|---|
| Défauts simulés détectés (37 scénarios) | 0 | 37 |
| Noms de fonctions du code original dans le kit GnuCash | 16 | 0 |
| Mentions du nom du logiciel dans le kit | 5 | 0 |
| Colonnes uniCenta retrouvées | 222 | 226 (+4) |
| Fiches uniCenta `confirmed` | 40 | 39 (Categories passe `partial`) |
| Essais ratés dans l'index des preuves | 1 | 0 |
| Deux générations du kit identiques | non (horodatage) | oui |

Ce qui a changé pour toi : `.mcp.json` est vide, REA et Craft sont dans `.mcp.block2.json` (`claude --mcp-config .mcp.block2.json`) ; Craft tourne en `--clean-room` sauf `--deep` autorisé par `target.yaml` ; une commande REA inconnue exige la base légale ; un essai raté va dans `.evidence/<cible>/errors/` et jamais dans l'index ; les enregistrements créés par ReBorn s'appellent `rb_...` et non `ev_...` ; `schema` ne remplace plus une fiche modifiée à la main sans `--force` ; `REBORN_TIMEOUT_MIN` (90 par défaut) limite chaque appel REA ou Craft.

Constat d'honnêteté : le script SQL livré d'uniCenta déclare `TEXTTIP` deux fois sur `CATEGORIES`, avec deux types contradictoires (texte puis booléen). Le lecteur garde le premier et note la table `partial`. À trancher par une observation, pas par une hypothèse.

## 14. Deuxième vague (07/11/2026) : analyse enrichie, attentes, discipline, nouveaux lecteurs

Choix d'Alan : schéma livré + lecture du code = deux natures de preuve, donc une règle peut être `confirmed` sans run. Ce que le code seul montre reste `partial`.

| Mesure | Avant | Après |
|---|---|---|
| Règles uniCenta | 2 (partial) | 4 : 3 confirmed, 1 partial |
| Règles nouvelles trouvées dans le code uniCenta | 0 | 2 (arrondi au pair le plus proche à la précision de la devise ; taxes en cascade dans l'ordre d'application) |
| Couverture des fonctionnalités GnuCash | inconnue | 1 / 341 sujets du manuel (0 %) |
| Attentes vérifiables dans les kits | 0 | 18 (GnuCash 7, uniCenta 6, PC Compta 5) |
| Part prouvée par la refonte | non mesurable | mesurable : 0 % tant qu'aucun rapport de parité n'existe |
| Questions ouvertes avec condition de fermeture | 0 / 12 | 12 / 12 |
| Formats lisibles en plus | | dBase (testé), Access (installé, pas testé), manuel `.chm` et markdown (testés), identification du compilateur (testée) |
| Noms Java surveillés par le contrôle anti-fuite | 0 | 173 |
| Tests | 41 | 51 |

## 14 bis. Les trois blocs sont dans `main` (07/11/2026, fin de soirée)

- `h-explorer/` : l'explorateur d'Elias (bloc 1, agents H Company), branche `Mouss_H_Company`, déjà fusionnée.
- `studio/` : le Studio de Jérémie (bloc 3), branche `rebuild/studio` fusionnée : moteur de migration des données, modèle métier versionné, historique comptable protégé, CRM livré, contrats JSON pour le bloc 1 et le bloc 2 (`studio/contracts/`, `studio/INTEGRATION_ALAN.md`, `studio/INTEGRATION_MOUSS.md`), bilan dans `studio/RAPPORT_FINAL.md`. Ses 113 tests (TypeScript, `studio/platform`) demandent un `npm install` dans ce dossier ; ils n'ont pas été relancés lors de la fusion.
- Le dépôt n'a pas de branche `master` : la branche principale est `main`.
- CI corrigée : `npm test` passait un dossier à Node (1 faux test en échec) ; il lance maintenant `node --test "tests/*.test.mjs"` (66 tests), d'où `engines.node >= 22`.

## 15. ERPNext (site Frappe Cloud d'Alan) et fusion avec l'explorateur d'Elias (07/11/2026)

- **Fusion** : la branche `Mouss_H_Company` d'Elias (dossier `h-explorer/`, explorateur Python qui pilote les agents H Company) est dans main. Lire `h-explorer/HANDOFF.md`. Ne pas modifier ses fichiers (sa règle §8 bis) : le pont est de notre côté, `reborn import-run` (EXP_xxx.json vers run.yaml). La branche `rebuild/studio` de Jérémie (bloc 3) n'est pas fusionnée.
- **Clé H Company** : dans le `.env` d'Alan sur une ligne libre `hk-…` ; le code d'Elias lit `HAI_API_KEY` ou le premier `hk-…` de son propre `.env`. Ne jamais la recopier dans le repo.
- **Accès ERPNext** : `FRAPPE_URL`, `FRAPPE_API_KEY`, `FRAPPE_API_SECRET` dans le `.env` d'Alan, lu via `secretsEnvFile` de `reborn.local.json`. La clé est celle du compte administrateur d'Alan : à révoquer après le hackathon. Versions : Frappe 16.55.2, ERPNext 16.51.2 ; société « Digital Solution Service », France, devise USD, plan comptable français.
- **Données fictives créées** (préfixe TEST-) : 1 client, 3 articles, 15 factures de vente en **brouillon** (jamais validées).

| Mesure ERPNext | Résultat |
|---|---|
| Modèle de données | 835 entités sur 835 (100 %), extraites en 33 s |
| Règles de calcul | 7, toutes `confirmed` par observation, 16 exemples chiffrés |
| Fonctionnalités prêtes à reconstruire | 1 (facture de vente) |
| Vecteurs de test | 18 |
| Couverture des fonctionnalités | 1 sur 755 pages de la documentation actuelle |

**Mise à l'échelle (même soirée)** :

| Mesure ERPNext | Décrit (structure déclarée) | Observé (programme qui tourne) |
|---|---|---|
| Entités | 835 / 835 | |
| Écrans | 471 / 471 formulaires | 10 ouverts par l'agent H, 3 confirmés par recoupement des libellés (traductions officielles fr) |
| Fonctionnalités | 472 / 755 pages du manuel | 134 (brouillons enregistrés ou refusés par l'API, factures calculées) |
| Fonctionnalités prêtes à reconstruire | 69 | |
| Vecteurs de test | 86 | |
| Attentes vérifiables pour le bloc 3 | 1017 | 0 prouvée (aucune refonte encore) |

Commandes : `frappe features` (une fiche fonctionnalité et une fiche écran par formulaire), `frappe probe` (brouillon minimal de 181 documents métier : 67 enregistrés, 66 refusés avec leur message, 48 non tentés faute de fiche liée ; jamais validés ; `frappe cleanup <run>` les supprime), `frappe translations --lang fr`. L'agent H se lance avec `tools/h_run.py <plan.json>` (venv `tools/py-hexplorer`, clé lue dans le `.env`, utilisateur de test `<compte de test à rôles métier>` à rôles métier, mot de passe dans `tools/secrets/frappe-agent.env` hors du repo, changé après chaque série). Leçon : l'agent a d'abord lu le total des lignes comme total TTC faute d'avoir fait défiler la page ; consigne corrigée, lectures EXP_011 et EXP_012 écartées. Les sessions H n'apparaissaient pas pour Alan : la clé de son `.env` voit 14 sessions, son tableau de bord est sans doute sur une autre organisation.

**Campagne H Company, bilan mesuré (07/11/2026 soir)** : `reborn frappe erpnext logic` écrit `02-investigation/logic-coverage.md`.

| Mesure | Résultat |
|---|---|
| Règles déclarées par les formulaires métier (dénominateur) | 3 830 |
| **Confirmées par observation** | **239 (6,2 %)** après la phase 2 (193, soit 5,0 %, avant) |
| Compatibles sans preuve | 310 (8,1 %) |
| Contredites | 1 (série de numérotation : l'agent a lu 7 croix au lieu de 8, à vérifier) |
| Formulaires lus par l'agent | 180 sur 263 (263 sessions réussies ; 47 lectures vides, dont 27 refus de droits du compte de test) |
| Écrans dont les libellés concordent avec la définition | 96 sur 180 |
| Phase 2 (actions sans enregistrer) | 199 / 200 terminées au bilan final (198 réussies, 1 échouée) ; +46 règles d'affichage confirmées (70 vers 116), soit environ 0,25 règle par expérience |

Par type : valeurs par défaut 71 / 1 227, affichage conditionnel 116 / 1 120, champs calculés 52 / 876, remplissages automatiques 0 / 319, obligatoires ou verrouillés sous condition 0 / 172, filtres 0 / 31. En plus, hors déclarations : 7 règles de calcul confirmées, 66 refus observés avec leur message, 67 brouillons acceptés.

Pourquoi si bas : une lecture de formulaire vide ne teste qu'un état de départ. Les 876 champs calculés valent 0 sans ligne, les remplissages automatiques demandent de choisir un client ou un article, les champs obligatoires sous condition demandent d'essayer d'enregistrer. Le rendement de la phase 2 est limité par les droits (12 refus), les champs introuvables et les listes de libellés tronquées. Le calculateur ne compte que les observations positives et connaît l'état d'un document neuf (brouillon, non enregistré, défauts littéraux) ; 23 « contradictions » initiales étaient des artefacts (séparateurs de numérotation, pages de réglages, masquage de l'utilisateur) et ont été corrigées par des tests.

Pour monter : phase 3 (choisir un client et un article pour les remplissages automatiques), validation de documents fictifs pour lire les écritures comptables et mouvements de stock, rôle plus large pour le compte de test (27 formulaires refusés), puis lecture du code public d'ERPNext (GPL) comme deuxième preuve. Les captures sont limitées à la dernière image de chaque lecture (29 Mo) ; l'historique complet reste dans `h-explorer/artifacts` (hors git) et derrière l'adresse de session de chaque run.

Découvertes : arrondi bancaire au centime (0,625 donne 0,62), réglable dans les paramètres système ; deux lignes de taxe sur le **même compte** partagent un taux (la première prend le taux de la dernière, cause non établie, U-001) ; quantité décimale refusée pour les unités « nombre entier ». Prochaines familles de calcul à observer avec `frappe observe` : achats, paiements et soldes restants, stock (valorisation), règles de prix, échéanciers.

Temps mesurés : `symbols` liste les 19 954 exports du moteur GnuCash en 8,5 s sans Ghidra ; une recherche Java dans uniCenta prend 1,3 s ; `find --engine ghidra-mcp` (11,3 s) n'est pas plus rapide que Craft (10,2 s), son intérêt est le classement et la décompilation immédiate qui suit. `relations` ne trouve aucun lien implicite sur nos trois cibles (toutes les clés sont déclarées) : il servira sur les vieilles bases sans clés étrangères.
