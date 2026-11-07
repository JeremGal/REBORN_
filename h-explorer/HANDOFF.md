# REBORN — Explorer (Mouss) : document de passation

> À lire en entier avant de toucher au code. Rédigé le 2026-11-07, mis à jour à ~18:30 (rapports, runtime local, sessions zombies).
> Les secrets ne sont **pas** dans ce fichier : ils sont dans `.env` (voir §6, ne jamais l'afficher).

---

## 1. Contexte projet

- **Hackathon** H Company × 42AI. Équipe : **Mouss** (moi, Explorer), **Alan** (Comprendre : moteur de rétro-ingénierie Python/LLM), **Jerem** (Reconstruire : app React/Next.js).
- **REBORN** = « archéologue logiciel autonome » : comprendre, documenter et reconstruire un logiciel métier **sans son code ni sa base**, uniquement par expériences reproductibles. Brief complet : `REBORN_Projet_Complet_Equipe_Hackathon.pdf`.
- **Boucle** : hypothèse → expérience → observation → validation → reconstruction. Seuls les résultats observés dans l'app font foi. **Décision du 2026-11-07 : l'agent a le droit de lire le code source de la page** (ça peut l'aider), mais l'observation rapportée reste la valeur affichée par l'app, et une règle n'est validée que par l'expérience.
- **Rôle de Mouss** : un opérateur qui exécute des scénarios sur une UI web via un agent **H Company** et renvoie des observations structurées fiables (actions, preuves, résultats, erreurs).
- **Démo** : un configurateur de devis industriel legacy avec règles cachées. Moment fort = **Blind Challenge** : une règle cachée change (remise 10 % → 15 %), le système doit la redécouvrir.
- **Linkup** (recherche web sourcée) = enrichissement **optionnel** ; une norme ou une source web ne valide **jamais** une règle.

## 2. Contrat Mouss → Alan (format de sortie)

```json
{
  "experiment_id": "EXP_001",
  "application": "Legacy ERP",
  "module": "Devis",
  "inputs": { "product": "A", "quantity": 10, "customer_type": "premium" },
  "observed_output": { "total_price": 810.0, "displayed_total_text": "810,00", "status_message": "Devis calcule." },
  "status": "success",
  "error": null,
  "duration_s": 22.1,
  "attempts": 1,
  "session_id": "…",
  "agent_view_url": "https://platform.hcompany.ai/agents/sessions/…",
  "evidence": { "trace_path": "artifacts/EXP_001/trace.json", "screenshots": ["…step_01.png"], "final_screenshot": "…", "actions": ["select_option(…)"] },
  "timings": { "start_session_s": 0.5, "agent_s": 18.1, "evidence_s": 1.7 },
  "agent_config": { "browser": "cloud", "model": "holo4-35b-a3b", "reasoning_effort": "disabled", "settle_s": "0.3" },
  "external_context": { "provider": "linkup", "status": "ok", "answer": "…", "sources": [], "disclaimer": "ne valide aucune règle" },
  "timestamp": "2026-11-07T15:39:53+00:00"
}
```

- Champs optionnels possibles : `app_error` (erreur affichée par l'app, ex. ERR-102 → `status: success`, `total_price: null`), `attempt_errors` (tentatives ratées même si la suivante a réussi).
- `run_experiment` **ne lève jamais d'exception** : un problème donne `status: "failed"` + `error`.
- Fichiers : `experiments/EXP_xxx.json` ; preuves dans `artifacts/EXP_xxx/` (`trace.json`, `step_NN.png`), liées par l'id.

## 3. Architecture et fichiers

```
hackathon_H/
  .env                      secrets (format libre, voir §6) — gitignoré
  requirements.txt          hai-agents[browser], python-dotenv, truststore, linkup-sdk
  README.md                 mode d'emploi court (Alan/Jerem)
  HANDOFF.md                ce fichier
  legacy_app/index.html     faux ERP "GESCOM v3.2" (look Windows 98), charge rules.js avec anti-cache
  legacy_app/rules.js       RÈGLES CACHÉES (modifiées par set_rule.py)
  explorer/explorer.py      cœur : run_experiment, run_experiments, run_ui_experiment, _agent_session
  explorer/browser.py       Chromes dédiés (mode local), 1 profil/port, headless par défaut
  explorer/legacy_server.py sert legacy_app/ sur http://localhost:8765 (thread, no-cache)
  explorer/context.py       Linkup : get_context(module), cache context_cache.json
  explorer/mapper.py        explore_app(url) : cartographie autonome d'une app inconnue
  explorer/reporter.py      report_app(url) : RAPPORT DE RÉTRO-INGÉNIERIE complet (carte → analyse par
                            fonctionnalité en parallèle → reports/<host>_<stamp>/REPORT.md + report.json)
  explorer/local_runtime.py runtime local H (Client.local) : 1 runtime + 1 Chrome par worker, bundle CA Avast
  bench.py                  N essais, durée, réussite, débit → bench_*.md / .json
  blind_challenge.py        compare observations vs "ancien modèle" → DRIFT
  set_rule.py               change une règle (local, + --publish vers GitHub Pages)
  persona_experiments.py    expériences sur le portfolio https://eliasmoussouni.fr/
  agent_answer_eliasmoussouni.md   réponse brute de l'agent ("navigue et dis-moi ce que c'est")
  ui_map.json               libellés d'options appris des traces (accélère les <select>)
  experiments/ artifacts/ explorations/ reports/   sorties (gitignorées)
  .certs/ca-bundle.pem      certifi + racine Avast (pour le runtime local) — gitignoré
```

### Règles cachées actuelles (`legacy_app/rules.js`)
Prix A=100, B=250, C=40 ; remise quantité **10 %** si qté ≥ 10 ; remise client standard 0 / premium 10 / distributeur 15 % ; **en cascade** ; arrondi 2 décimales ; frais de port 25 € si sous-total < 500. Ex. A/10/premium = 810 ; B/10/distributeur = 1912,50 ; C/9/distributeur = 331. Erreurs : ERR-101 (article manquant), ERR-102 (quantité hors 1..9999).

### API publique

```python
from explorer.explorer import run_experiment, run_experiments, run_ui_experiment
from explorer.mapper import explore_app
from explorer.context import get_context

run_experiment({"product": "A", "quantity": 10, "customer_type": "premium"})        # 1 expérience devis
run_experiments([{...}, {...}], workers=3)                                          # parallèle, même ordre
run_ui_experiment(url, instruction, PydanticSchema, inputs, application=..., module=...)  # n'importe quelle app (cloud)
explore_app("https://exemple.com/")                                                # carte de l'app (explorations/EXPL_xxx.json)
from explorer.reporter import report_app
report_app("https://exemple.com/")                     # rapport complet ; from_exploration="EXPL_001" pour réutiliser une carte
get_context("Devis")                                                               # contexte Linkup (caché)
```

### Commandes

```bash
.venv/Scripts/python -m explorer.explorer A 10 premium        # 1 expérience
.venv/Scripts/python bench.py 10                              # benchmark
.venv/Scripts/python blind_challenge.py                       # Blind Challenge
.venv/Scripts/python set_rule.py QTY_DISCOUNT_PCT 15 --publish
.venv/Scripts/python -m explorer.mapper https://exemple.com/  # exploration autonome
PYTHONIOENCODING=utf-8 .venv/Scripts/python -m explorer.reporter https://exemple.com/ [EXPL_xxx]   # rapport
REBORN_RUNTIME=local REBORN_LOCAL_WORKERS=3 ... -m explorer.reporter <url>   # idem sur le runtime local
```

## 4. Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `REBORN_BROWSER` | `local` | `local` = Chrome sur la machine (localhost:8765) ; `cloud` = navigateur hébergé H sur la copie GitHub Pages. **Recommandé pour la démo : `cloud`.** |
| `REBORN_APP_URL` | `https://eliasmoussouni.github.io/reborn-legacy-erp/index.html` | URL en mode cloud |
| `REBORN_MODEL` | `holo4-35b-a3b` | modèle rapide (`holo4-27b` = plus fort, plus lent) |
| `REBORN_REASONING` | `disabled` | `disabled`/`low`/`medium`/`xhigh` |
| `REBORN_SETTLE_S` | `0.3` | attente après chaque action |
| `REBORN_TIMEOUT_S` / `REBORN_MAX_ATTEMPTS` | `120` / `2` | timeout par tentative, retries |
| `REBORN_SLOT_WAIT_S` | `60` | attente max d'un créneau H libre avant `failed` |
| `REBORN_HEADLESS` | `1` | mode local : `0` affiche Chrome (ne pas le minimiser) |
| `REBORN_CONTEXT` / `REBORN_CONTEXT_WAIT_S` | `1` / `15` | Linkup on/off, attente max |
| `REBORN_EXPLORE_MODEL` / `REBORN_EXPLORE_REASONING` | `holo4-27b` / `low` | modèle pour `explore_app` |
| `REBORN_WORKERS` | `1` | bench.py : >1 utilise `run_experiments` |
| `REBORN_RUNTIME` | `cloud` | `cloud` = sessions sur la plateforme H ; `local` = runtime local H (Client.local), contourne le plafond de sessions de l'orga |
| `REBORN_LOCAL_MODEL` / `REBORN_LOCAL_WORKERS` | `holo4-35b-a3b` / `3` | modèle (API Modèles) et nb de runtimes locaux en parallèle |
| `REBORN_REPORT_MODEL` / `REBORN_REPORT_REASONING` | `holo4-27b` / `low` | modèle des analyses de rapport (plateforme) |
| `REBORN_REPORT_WORKERS` / `REBORN_REPORT_TIMEOUT_S` | `3` / `540` | analyses en parallèle, timeout par analyse |
| `REBORN_FORCE_ANSWER_WAIT_S` | `120` | après un timeout : attente de la réponse forcée (partielle) avant annulation |

## 5. Résultats mesurés

| Étape | Résultat | Fichier |
|---|---|---|
| Bench initial (local, modèle par défaut) | 10/10, 51,0 s/exp | `bench_20261107_155633.md` |
| Consigne outils + onglet sur about:blank | 5/5, 61,8 s (régression, corrigée) | `bench_20261107_160546.md` |
| + onglet sur l'app + libellés appris | 5/5, 5 étapes, 1 outlier 318 s (Chrome minimisé) | `bench_20261107_161455.md` |
| + headless | 5/5, 45,1 s | `bench_20261107_161927.md` |
| + holo4-35b-a3b, reasoning off, settle 0,3 | 5/5, 32,0 s | `bench_20261107_162255.md` |
| Validation config par défaut | **10/10, 32,6 s** | `bench_20261107_162841.md` |
| **Cloud, 3 en parallèle** | **9/9, 22,7 s/exp, débit 7,8 s/exp** | `bench_20261107_164520.md` |
| Blind Challenge local (15 %) | 3 DRIFT exacts (765 / 365 / 1806,25), 2 conformes, ERR-102 capturé | `blind_challenge_20261107_163711.md` |
| Blind Challenge cloud | idem, **46 s pour 6 expériences** ; publication de la règle 35-39 s | `blind_challenge_20261107_164853.md` |
| Audit global (72 premières exp.) | 67 succès tous justes, 0 valeur fausse, 5 échecs explicites (phase de mise au point) | — |
| Linkup | appel réel OK, 8,4 s, 8 sources, 0,006 $ ; solde ≈ 19,99 $ | `context_cache.json` |

### Test sur une app tierce : https://eliasmoussouni.fr/ (portfolio React façon Netflix)
- `explore_app` → `explorations/EXPL_001.json` : 8 vues trouvées en 127 s / 24 actions (splash, « Who's Watching? » avec 4 personas, Home, Professional, Skills, Projects, Contact, EliasGPT). Aucun envoi, aucun lien externe suivi.
- Expériences persona (`persona_experiments.py`, EXP_075 à EXP_085, 11/11 succès) : texte d'accueil **identique** pour les 4 personas, **seule l'image de fond change** ; rangées/cartes identiques **avec protocole déterministe** (ne pas cliquer les flèches du carrousel).
- Leçons : (1) un protocole non déterministe produit de fausses découvertes → toujours répéter ; (2) le modèle rapide se trompe parfois sur la casse exacte (« LinkedIn » vs « Linkedin » réel : 2/11) ; (3) fond « Stalker » décrit différemment selon les runs (fond animé ? non tranché).
- Session libre « navigue et dis-moi ce que c'est » (holo4-27b, 136 s, 23 étapes) : réponse brute dans `agent_answer_eliasmoussouni.md`. Bon résumé, mais généralise à tort (« chaque profil a des carrousels différents ») et oublie 3 catégories de Skills → une réponse libre est moins fiable qu'une expérience ciblée.

### Rapports de rétro-ingénierie (`explorer/reporter.py`)
- **Portfolio v1** (`reports/eliasmoussouni.fr_20261107_173638/`) : 8/8 analyses, 381 s, très détaillé (timings d'animation, hex, étapes de reconstruction). **Défaut** : les agents ont fait des recherches web et lu des dépôts GitHub **d'autres personnes** (`lokeshreddy1226/netflix-portfolio`, `Elias-te/…`, `elias-92/…`) → sections Profile Home / Skills / EliasGPT potentiellement fausses, contradictions (intro 0,3 s vs 3 s). Seule Splash a lu le vrai dépôt `EliasMoussouni/portfolio-Elias`.
- Correctifs : consigne « sources du site uniquement, pas de recherche web ni dépôts tiers », **traçabilité** par fonctionnalité dans le rapport (sources du site + alerte ⚠️ si sources externes).
- **Portfolio v2** (`reports/eliasmoussouni.fr_20261107_174401/`) : **raté** (3 timeouts 720 s, 2 refus de créneau). Causes : agents perdus dans le JS minifié ; 3 sessions bloquées côté H (voir §6) ; pré-contrôle de quota qui empêchait H de libérer les sessions idle.
- Correctifs : budget 25 actions / 4 lectures de source max, timeout 540 s, **`force_answer` au timeout** (rapport partiel marqué ⏱️ au lieu de rien), annulation vérifiée, plus de pré-contrôle de quota en cloud.
- **Fiabilité (fin de journée)** : cause des zombies identifiée par statistique sur 127 sessions — `holo4-27b` + `reasoning_effort: low` = 7/36 sessions figées à l'étape 0 ; `holo4-35b-a3b` + `disabled` = **0/58**. Rapports et exploration passés sur `holo4-35b-a3b`/`disabled`. Superviseur de session dans `_session_on_client` : figée à 0 étape > `REBORN_STALL_S` (120 s) → abandon + nouvelle session ; plus de progression > `REBORN_PROGRESS_STALL_S` (180 s) ou timeout → `force_answer` ; rien 120 s après → abandon. Toute erreur d'analyse est retentée (3 essais). `repair_report(dir)` / `-m explorer.reporter --repair <dir>` relance seulement les analyses ratées. Les zombies existants (ignorant l'API) ont été tués **à la main** depuis l'interface platform.hcompany.ai (fonctionne, contrairement à l'API cancel).
- **Runtime local** : réponses structurées impossibles (bug runtime 0.1.23 `datamodel_code_generator`) → schéma injecté dans la consigne + extraction JSON (`_json_from_text`) ; reste moins fiable (4/10 réponses mal formées) et plus lent (6-10 min/analyse) → **à utiliser seulement en secours**.
- **Stock pneus — rapport final** : `reports/isp-stock-pneus-demo.vercel.app_20261107_191951/REPORT.md` — **11/11 fonctionnalités**, plateforme, 10 en parallèle, 351 s + 113 s de réparation, 0 zombie, 0 source externe. Défaut : `confidence` = `unrated` partout (le modèle rapide ne le remplit pas).
- (historique) **Stock pneus** (https://isp-stock-pneus-demo.vercel.app/, appli Inter Service Pneus : vue Technicien mobile + Bureau) : **en cours** au moment de la rédaction, sur la plateforme (holo4-27b, 2 workers), 11 fonctionnalités cartographiées (Top Navigation Bar, Technicien (Mobile View), Bureau – Accueil, Stock, Camions, Commandes, Inventaires, Activité, Demandes, Exports, Réglages). Log : `report_pneus.log` ; sortie : `reports/isp-stock-pneus-demo.vercel.app_*/REPORT.md`.

## 6. Environnement, secrets, pièges (IMPORTANT)

- **Windows 11**, Python 3.14, venv `.venv/`. Lancer avec `.venv/Scripts/python`.
- **`.env` en format libre** (`API-key : hk-…`, `token GitHub : ghp_…`, `linkup api key : …`, un code H de 100 €). Le code lit : clé H = premier `hk-…` ; Linkup = ligne contenant « linkup » ; GitHub = premier `ghp_…`. **Ne jamais afficher le `.env`** (une fuite a déjà eu lieu en session : le token GitHub a des droits admin larges → **à révoquer après le hackathon**). L'écrasement du `.env` a été refusé par l'utilisateur/le classifieur : ne pas le réécrire sans accord.
- **Avast Web Shield intercepte le HTTPS** → `CERTIFICATE_VERIFY_FAILED` en Python. Solution en place : `truststore.inject_into_ssl()` (magasin Windows) dans `explorer.py` et `context.py`. Tout nouveau script réseau doit l'importer (ou importer `explorer.explorer` d'abord).
- **pip** : l'index du paquet `mcp` arrive corrompu (même hors sandbox) → le CLI `holo` (`hai-agents[cli]`) n'est **pas** installé ; inutile, le SDK suffit.
- **Commandes réseau depuis Claude Code** : nécessitent `dangerouslyDisableSandbox: true` (le proxy du sandbox casse le TLS).
- **Plan H gratuit** : 60M tokens/mois, **3 sessions simultanées** (scope org). Quota : `Client().sessions.get_session_quota()`.
- **Mode local = 2 créneaux par expérience** (session agent + canal du bridge local, trajectoire v1 `agent_platform`) → parallélisme 1 en plan gratuit. `run_experiments` plafonne à `limit // 2` (local) ou `limit` (cloud).
- **Canaux qui fuient** : si un run local est tué, le canal reste `pending` et bloque un créneau. Le code supprime désormais le canal exact (`DELETE https://agp.eu.hcompany.ai/api/v1/trajectories/{bridge.session_id}`) en `finally`. Ne pas tuer un run en cours. Pour diagnostiquer : `GET /api/v1/trajectories/?size=20`.
- **`handle.cancel()` sur une session `idle`** la laisse parfois `idle` ; les sessions inline passent `idle` après réponse (traité comme succès).
- **Chrome local** : port 9222 (+1 par worker), profils `.chrome-profile/<port>`, flags anti-throttling, `--force-device-scale-factor=1`. Une fenêtre **minimisée** bloque les captures (timeouts 60 s) → headless par défaut.
- **Bridge maison** : on crée `SeleniumBrowserBridge(debugging_port=…)` + un `BridgeManager()` par tentative et on passe `session_id` dans l'environnement → l'auto-bridge du SDK est ignoré. Ce sont des **API internes** de `hai_agents_local` (peuvent casser à une mise à jour du SDK, version testée : hai-agents 1.4.3).
- **Onglet neuf** à chaque expérience (`fresh_tab(url)`) : sinon le formulaire garde les valeurs du run précédent (risque d'observation fausse silencieuse).
- **Validation de la réponse** : `wait_for_completion(answer_schema=None)` puis validation maison → un écart de format ne fait plus perdre la réponse brute ni les preuves. Schémas : accepter `null` pour les listes (`BeforeValidator(lambda v: v or [])`).
- **GitHub Pages** : repo public **EliasMoussouni/reborn-legacy-erp** (uniquement `index.html` + `rules.js`), site https://eliasmoussouni.github.io/reborn-legacy-erp/. `rules.js` y est lisible publiquement. Cache CDN `max-age=600` contourné par `rules.js?v=Date.now()`. Toute modification de ce repo = publication publique → demander l'accord.
- **Sessions zombies côté H** (vu le 2026-11-07 ~16:44-16:48 UTC) : 3 sessions bloquées à l'étape 0 après la 1re observation, ignorant cancel / pause / force_answer, statut `running` indéfiniment (ids `79c086cd…`, `11837296…`, `cddad2be…`). Le quota a fini par se libérer (active=1) alors que le statut restait `running`. Si ça recommence : basculer sur `REBORN_RUNTIME=local`.
- **Runtime local H** (`Client.local`, binaire `hai-agent-runtime` 0.1.23 téléchargé depuis `assets.hcompanyprod.fr`, SHA-256 épinglé, dans `~/.hai/agent-runtime/`, logs dans `~/.hai/agent-runtime/logs/`) : **1 session max par instance** → 1 runtime (ports 18795+) + 1 Chrome (ports 9300+) par worker. C'est un exécutable Python figé : il n'a pas `truststore` → il faut **`SSL_CERT_FILE=.certs/ca-bundle.pem`** (certifi + racine Avast extraite du magasin Windows en lecture seule ; fait automatiquement par `explorer/local_runtime.py`). Il appelle l'**API Modèles** (`https://api.hcompany.ai/v1`), facturée à part : sans crédit seul `holo3-1-35b-a3b` répond ; après ajout des crédits `holo4-35b-a3b` OK, `holo4-27b` encore 402 (18:30). Pas d'Agent View en local. Un runtime laissé actif par un run interrompu garde sa session (429 « 1/1 active ») : il s'arrête avec le processus Python qui l'a lancé.
- **Abonnement** : l'utilisateur passe au plan **Builder** (10 sessions simultanées) le 2026-11-07 au soir → remonter `REBORN_REPORT_WORKERS` / `workers` à 8-10 ; limite de démarrage de navigateurs cloud : 10/min/utilisateur, 20/min/orga.
- **Script utilitaire** de lecture des événements d'une session : voir `_save_evidence` / `client.sessions.list_session_events(id, size=200)` ; Agent View : `https://platform.hcompany.ai/agents/sessions/<id>`.

## 7. Doc consultée (vérifiée)

- H Company : https://hub.hcompany.ai (index `https://hub.hcompany.ai/llms.txt`) — Agents API, base EU `https://agp.eu.hcompany.ai/api/v2`, SDK `hai-agents`, `Client.run_session/start_session`, `answer_schema`, `overrides`, environnements `host: cloud | user_device`, `start_url`, `settle_s`, modèles `holo4-35b-a3b` / `holo4-27b`, `reasoning_effort`. « Surfer-H-CLI » n'existe plus dans la doc (remplacé par le CLI `holo`).
- Linkup : https://docs.linkup.so (index `/llms.txt`) — SDK `linkup-sdk`, `LinkupClient.search(query, depth="standard", output_type="sourcedAnswer")`, 0,006 $/appel, 10 req/s. Code promo hackathon `HACK42AIH` (+25 $).

## 8. Ce qui reste à faire / pistes

1. **Intégration avec Alan** : lui donner `run_experiment` / `run_experiments` ; convenir s'il appelle en Python direct ou via une petite API HTTP (non faite).
2. **Démo** : mettre `REBORN_BROWSER=cloud` ; préparer le script du Blind Challenge (`set_rule.py … --publish` puis expériences). Restaurer la règle à 10 % après (elle l'est actuellement, local + Pages).
3. **Généraliser l'Explorer** : brancher `explore_app` → génération automatique du schéma/consigne d'expérience (aujourd'hui écrits à la main par app).
4. **Fidélité du texte exact** : vote majoritaire sur 2-3 runs ou `holo4-27b` pour les champs textuels sensibles.
5. **Parallélisme** : avec Builder (10 créneaux), cloud = 10 en parallèle (limite 10 démarrages/min/utilisateur), navigateur local = 5 ; runtime local = autant que de runtimes lancés (`REBORN_LOCAL_WORKERS`).
9. **Rapports** : relire le rapport pneus, vérifier par expériences ciblées les points `likely`/`guess` et les « questions ouvertes » ; fusionner un vote sur 2 runs pour les textes exacts.
10. **Rapport → expériences** : générer automatiquement, à partir des « règles » d'un rapport, les expériences `run_ui_experiment` qui les testent (boucle REBORN complète sur une app inconnue).
6. **Versionner** : le dossier n'est pas un dépôt git (le `.gitignore` est prêt : `.env`, `.venv`, `artifacts/`, `experiments/`, `explorations/`, `.chrome-profile/`, `*.log`).
7. **Sécurité** : révoquer le token GitHub (droits admin) après le hackathon ; `Token.txt` à la racine est vide.
8. Desktop computer-use avec replay de session = bonus non commencé.

## 8 bis. Répartition Claude / Codex (pour travailler en parallèle sans conflit)

Règle d'or : **chaque agent a ses fichiers**, personne n'édite les fichiers de l'autre.

| Agent | Possède | Mission |
|---|---|---|
| **Claude** | `explorer/*.py`, `bench.py`, `blind_challenge.py`, `set_rule.py`, `persona_experiments.py`, `HANDOFF.md`, `README.md` | Moteur : rapports, boucle « rapport → expériences ciblées », fiabilité, parallélisme Builder |
| **Codex** | `api/`, `viewer/`, `tests/`, `.git` | (A) API HTTP pour Alan autour de `run_experiment(s)` / `report_app` ; (B) visionneuse HTML des rapports (`report.json`) pour Jerem et le jury ; (C) tests pytest des fonctions pures + init git |

Codex : importer `explorer.explorer` / `explorer.reporter` (ne pas les modifier ; signaler un besoin à Claude via ce fichier, section « Demandes »). Ne jamais afficher `.env`. Toute requête réseau Python doit passer par `truststore` (importer `explorer.explorer` suffit).

### Demandes entre agents
- _(vide)_

## 9. Règles de travail convenues avec l'utilisateur

- Réponses en **français**, directes ; dire quand quelque chose ne marche pas ou n'est pas sûr.
- Petites étapes vérifiées ; mesurer avant d'affirmer.
- Clés uniquement dans `.env`, jamais en dur, jamais affichées.
- Demander avant toute action publique (repo GitHub, publication) ou destructive.
- Les sources web (Linkup) ne valident jamais une règle ; seule l'expérience fait foi.
- L'agent **peut lire le code source** des pages (décision de l'utilisateur, 2026-11-07, l'ancienne règle « boîte noire stricte » est abandonnée). Il ne doit pas remplacer la valeur affichée par une valeur calculée.
