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
- **Salle blanche.** Le bloc 3 ne lit que `targets/<id>/02-investigation/` et les captures de `01-exploration/`. Jamais de code décompilé ou original, d'asset ou de marque dans le kit ni dans l'appli.
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

Pièges :
- `--file` au démarrage importe sans analyser ; la CLI lance `run_analysis` toute seule si elle trouve moins de 10 fonctions nommées.
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
2. GnuCash : extraire le manuel `.chm` pour une liste de fonctionnalités indépendante, générer les fiches des 111 écrans, enregistrer les compteurs pour que `coverage` donne une vraie couverture.
3. Utiliser `native --engine ghidra-mcp` sur `libgnc-engine.dll` pour appuyer les règles du moteur (équilibre, arrondis) par une deuxième preuve, puis les faire confirmer par un run.
4. Mettre à jour `docs/SETUP.md` et `docs/GUIDE.md` au fil des changements, et rejouer les tests de l'appli avant chaque démo.
