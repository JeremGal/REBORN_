# REBORN — Explorer (Mouss) : document de passation

> À lire **en entier** avant de toucher au code. Mis à jour le 2026-11-07 vers 23:40 (fin de session Claude Code).
> Aucun secret ici : ils sont dans `.env` (ne JAMAIS l'afficher, voir §7).

---

## 1. Contexte

- **Hackathon H Company × 42AI.** Équipe : **Mouss** (moi, bloc 1 « Explorer »), **Alan** (bloc 2 « Comprendre » : moteur de règles Python/LLM), **Jerem** (bloc 3 « Reconstruire » : app React/Next.js).
- **REBORN** = archéologue logiciel autonome : comprendre, documenter et reconstruire un logiciel métier par expériences reproductibles. Brief : `REBORN_Projet_Complet_Equipe_Hackathon.pdf`.
- **Boucle** : hypothèse → expérience → observation → validation → reconstruction. Seuls les résultats observés dans l'app font foi.
- **Décision utilisateur (2026-11-07)** : l'agent **peut lire le code source** servi par le site (HTML/JS/CSS/JSON du même domaine). Il ne remplace jamais la valeur affichée par une valeur calculée.
- **Linkup** = contexte web optionnel ; une norme/source web ne valide **jamais** une règle.
- Dépôt d'équipe : `AlanECE/ReBorn` (privé). Ma branche : **`Mouss_H_Company`**, orpheline (pas d'historique commun avec `main`), contenant uniquement `h-explorer/` (commit `789625b`). Merge futur : `git merge --allow-unrelated-histories Mouss_H_Company` → ajoute juste le dossier. **Tout ce qui est décrit à partir du §5.4 n'est PAS encore poussé** (voir §9).

## 2. Ce que fait l'Explorer aujourd'hui (vue d'ensemble)

```
                         ┌──────────── report_app(url) ─────────────────────────────────────┐
credentials (optionnel) ─┤ 0. vault H (login)                                                │
                         │ 1. inspect_site  (workstation H : shell+code)  ║ explore_app (carte, │
                         │                                                ║  navigateur cloud,  │
                         │                                                ║  connecté si vault) │
                         │ 2. fonctionnalités = pages de la carte + 1 par modèle de page du code │
                         │ 3. analyses en parallèle (navigateur cloud, testent chaque contrôle)  │
                         │    ║ legal_frame (Linkup, 8-12 domaines juridiques en parallèle)       │
                         │ 4. REPORT.md : §0 légal, §0bis inspection, §1 carte, §2 fonctionnalités│
                         └──────────────────────────────────────────────────────────────────────┘
run_experiment / run_experiments : expériences ciblées (contrat Mouss → Alan, §3)
```

## 3. Contrat Mouss → Alan (expériences)

```json
{"experiment_id": "EXP_001", "application": "Legacy ERP", "module": "Devis",
 "inputs": {"product": "A", "quantity": 10, "customer_type": "premium"},
 "observed_output": {"total_price": 810.0, "displayed_total_text": "810,00", "status_message": "Devis calcule."},
 "status": "success", "error": null, "duration_s": 22.1, "attempts": 1, "session_id": "…",
 "agent_view_url": "https://platform.hcompany.ai/agents/sessions/…",
 "evidence": {"trace_path": "artifacts/EXP_001/trace.json", "screenshots": ["…"], "final_screenshot": "…", "actions": ["…"]},
 "timings": {"start_session_s": 0.5, "agent_s": 18.1, "evidence_s": 1.7},
 "agent_config": {"browser": "cloud", "model": "holo4-35b-a3b", "reasoning_effort": "disabled", "settle_s": "0.3"},
 "external_context": {"provider": "linkup", "status": "ok", "answer": "…", "sources": [], "disclaimer": "ne valide aucune règle"},
 "timestamp": "…"}
```
Optionnels : `app_error` (erreur affichée par l'app, ex. ERR-102 → `status: success`, `total_price: null`), `attempt_errors`, `forced_answer`. `run_experiment` ne lève jamais : problème → `status: "failed"` + `error`.

## 4. Fichiers

```
hackathon_H/
  .env                       secrets, FORMAT LIBRE (clé H "hk-…", token GitHub "ghp_…", "linkup api key : …") — gitignoré
  credentials.json           (optionnel, gitignoré) identifiants de connexion, voir §6
  requirements.txt           hai-agents[browser], python-dotenv, truststore, linkup-sdk
  README.md / HANDOFF.md
  login_report.py            ★ rapport CONNECTÉ en 1 commande (mot de passe tapé ou lu dans .env) — §6
  legacy_app/index.html, rules.js   faux ERP de devis + règles cachées (rules.js chargé avec ?v=Date.now())
  explorer/
    explorer.py      cœur : run_experiment(s), run_ui_experiment, _agent_session / _session_on_client (superviseur)
    reporter.py      report_app (pipeline complet), repair_report (--repair), add_legal (--legal)
    mapper.py        explore_app(url, vault_id=None) : cartographie (se connecte si vault_id)
    inspector.py     inspect_site(url) : inspecteur sur WORKSTATION H (terminal + lecture du code)
    legal.py         legal_frame / render_legal : cadre légal Linkup en tête de rapport
    vault.py         vault H "reborn-logins" : vault_for(url), LOGIN_HINT
    context.py       get_context(module) : contexte Linkup par module (cache context_cache.json)
    browser.py       Chromes locaux dédiés (mode navigateur local), headless par défaut
    local_runtime.py runtime local H (Client.local) — secours, voir §7
    legacy_server.py sert legacy_app/ sur localhost:8765
  bench.py, blind_challenge.py, set_rule.py, persona_experiments.py
  ui_map.json        libellés d'options appris (accélère les <select> du faux ERP)
  sorties (gitignorées) : experiments/ artifacts/ explorations/ inspections/ reports/ .certs/ .chrome-profile/ *.log
```

## 5. Composants en détail

### 5.1 Expériences (faux ERP de devis)
Règles cachées (`legacy_app/rules.js`) : A=100, B=250, C=40 € ; remise quantité **10 %** si qté ≥ 10 ; client standard 0 / premium 10 / distributeur 15 % **en cascade** ; arrondi 2 déc. ; port 25 € si < 500. A/10/premium = 810 ; B/10/distributeur = 1912,50 ; C/9/distributeur = 331. Erreurs ERR-101 (article), ERR-102 (qté hors 1..9999). Copie publique : https://eliasmoussouni.github.io/reborn-legacy-erp/ (repo `EliasMoussouni/reborn-legacy-erp`).

### 5.2 Blind Challenge
`set_rule.py QTY_DISCOUNT_PCT 15 [--publish]` (publie sur Pages en ~35-40 s, attend que la valeur soit servie) → `blind_challenge.py` (6 expériences, compare à l'ancien modèle → DRIFT). Mesuré cloud : 3 DRIFT exacts (765 / 365 / 1806,25), 2 conformes, ERR-102 capturé, **46 s**. Règle actuellement **remise à 10 %** (local + Pages).

### 5.3 Rapport de rétro-ingénierie (`report_app`)
- **0. Vault** : si des identifiants existent pour l'hôte (`login_report.py` ou `credentials.json`), `vault_for` les met dans le vault H.
- **1. En parallèle** : `inspect_site` (workstation) et `explore_app` (carte ; **se connecte si vault** puis cartographie aussi l'espace connecté, ~40 actions).
- **2. Fonctionnalités** = vues de la carte + `_template_features` (1 représentant par modèle de page trouvé dans le code et absent de la carte), max `REBORN_MAX_FEATURES` (25).
- **3. Analyses** (`_dive`, navigateur cloud, `holo4-35b-a3b`/`disabled`) : chacune reçoit **les contrôles à tester** (`controls_for`) → consigne « essaie chaque valeur et note ce qui change » ; reçoit le vault + `LOGIN_HINT` si connexion ; 3 essais sur toute erreur. En parallèle : `legal_frame` (Linkup).
- **4. REPORT.md** : §0 cadre légal, §0bis inspection technique, §1 vue d'ensemble, §2 une section par fonctionnalité (rôle, accès, mise en page, composants, textes exacts, interactions testées, règles + preuve, données/tech, style, cas limites, questions ouvertes, reconstruction, captures, alertes ⚠️ sources externes / ⏱️ partiel), §3 checklist de reconstruction, §4 à vérifier par expérience.
- Outils : `-m explorer.reporter <url> [EXPL_xxx|-] [INSP_xxx]` (réutiliser carte/inspection), `--repair <dir>` (relance les analyses ratées), `--legal <dir>` (régénère le cadre légal).

### 5.4 Inspecteur workstation (`inspector.py`) — NOUVEAU
- Environnement H `{"kind": "workstation", "storage": {"ephemeral": true}}` = Debian cloud + terminal + Chrome (`web`). Doc : https://hub.hcompany.ai/agents-api/workstation (preview hackathon, page non listée).
- Fait : robots/sitemap, crawl, téléchargement et lecture des bundles JS (routes, backend, données embarquées, **règles codées en dur**), formulaires, **contrôles avec toutes leurs valeurs**, auth/rôles. Écrit `/workspace/inspection.json` + `share_files` ; on télécharge via `_download_shared_files` (AttachmentEvent → `artifacts/INSP_xxx/files/`).
- **Pièges** : (1) `answer_schema` fait boucler l'agent workstation (il répond en texte) → `free_answer: True` ; (2) `holo4-27b` sur workstation → « internal error » au démarrage → `holo4-35b-a3b` ; (3) l'agent peut **tourner en boucle** sur un gros bundle minifié (vu : 260 étapes de la même commande) → consigne « grep, 2 lectures max par bundle, ne jamais répéter une commande plus de 2 fois, ~40 commandes » + timeout `REBORN_INSPECT_TIMEOUT_S` = 600 s. Le superviseur ne voit pas ce cas (les étapes progressent).
- Garde-fous : GET seulement, ≤ 2 req/s, pas de contournement d'auth, pas d'écriture backend, pas de données perso, robots `Disallow` respecté. **Ne se connecte jamais** (le Chrome du workstation ne gère pas les vaults).

### 5.5 Connexion (`vault.py`, `login_report.py`) — NOUVEAU
- Vault H interne `reborn-logins` ; un item par login (`urls` = origine du site, champs `username`/`password`/`email`/`totp`/`api_key`). Lié au navigateur cloud par `vault_id` → action `fill_secret_at` : **H tape la valeur, l'agent ne la voit jamais** (ni consigne, ni réponse, ni captures). TOTP géré. Doc : https://hub.hcompany.ai/agents-api/vaults/overview.md
- Consigne de connexion (`LOGIN_HINT`) : se connecter via `fill_secret_at`, **lecture seule** (ne rien soumettre/modifier/supprimer/payer), se déconnecter à la fin.
- **Statut** : vault créé et item enregistré pour `rs-consulting-tau.vercel.app` (par l'utilisateur via `login_report.py`). Le 1er run connecté était limité (la carte ne se connectait pas encore) → **corrigé** (`explore_app(vault_id=…)`), **à relancer par l'utilisateur** (§6). Connexion réelle **pas encore confirmée** dans les traces.
- ⚠️ **Règle Claude** : Claude ne saisit, ne stocke et ne transmet **aucun mot de passe** pour se connecter à une appli en ligne (même avec l'accord du propriétaire / une attestation). Exception seulement pour une appli en `localhost` ou un hôte de test explicite (`staging.`, `dev.`, `test.`…). → C'est **l'utilisateur** qui lance `login_report.py`. Claude peut ensuite relire/analyser le rapport (il ne contient pas le mot de passe).

### 5.6 Cadre légal Linkup (`legal.py`)
Profil (secteur, activités, données, sujets réglementaires spécifiques + **pertinence de chaque domaine générique** core/conditional/not_relevant) → recherche Linkup `depth="deep"`, `output_type="structured"` + sources par domaine (8 génériques ERP non écartés + ≤ 8 spécifiques au secteur) → §0 du rapport (tableaux Norme / Référence / Obligations / Impact ERP / En vigueur / Sanctions, sources, checklist conformité, domaines écartés avec raison). Avertissement : synthèse web, pas un avis juridique. ~0,7 $/rapport.

### 5.7 Superviseur de session (`_session_on_client`)
- 0 étape > `REBORN_STALL_S` (120 s) = session figée → abandon + `stalled` (l'appelant relance une session neuve).
- plus de nouvelle étape > `REBORN_PROGRESS_STALL_S` (180 s), ou timeout → `force_answer` (réponse partielle) ; rien `REBORN_FORCE_ANSWER_WAIT_S` (120 s) après → abandon.
- `wait_for_completion(answer_schema=None)` + validation maison (`_json_from_text`, listes `null` → `[]`) → jamais de perte de réponse/preuves.
- Fichiers partagés par l'agent téléchargés automatiquement.

## 6. ★ Rapport connecté : commandes pour l'utilisateur

Depuis `C:\Users\emous\Desktop\cyber\hackathon_H` (PowerShell ; en Git Bash remplacer `\` par `/`) :

**Option A — mot de passe tapé (rien sur le disque)**
```powershell
.venv\Scripts\python login_report.py https://rs-consulting-tau.vercel.app/ user@example.com
```
→ taper le mot de passe (invisible), Entrée pour le TOTP.

**Option B — depuis `.env`** (ajouter ces lignes au `.env`, format `CLE=valeur`) :
```
REBORN_LOGIN_USERNAME=user@example.com
REBORN_LOGIN_PASSWORD=le_mot_de_passe
```
puis :
```powershell
.venv\Scripts\python login_report.py https://rs-consulting-tau.vercel.app/ --env
```

Attendu dans le terminal : `credentials found: the map and dives will sign in…`, puis le chemin `reports\rs-consulting-tau.vercel.app_…\REPORT.md` (10-15 min). Ne pas lancer deux rapports en même temps (créneaux H).

**Vérifier que la connexion a marché** (sans voir de secret) : chercher `fill_secret_at` dans `artifacts/EXPL_xxx/trace.json` et `artifacts/RPT_<stamp>_F*/trace.json`, et regarder si la carte (`explorations/EXPL_xxx.json`, `app_map.pages`) contient les écrans de l'espace connecté. Replay : `agent_view_url` de chaque analyse.

**Avant tout run** : arrêter un ancien `login_report.py` encore actif (Ctrl+C dans son terminal).

## 7. Environnement, secrets, pièges (IMPORTANT)

- Windows 11, Python 3.14, venv `.venv/`. Commandes réseau depuis Claude Code : `dangerouslyDisableSandbox: true` (le proxy du sandbox casse le TLS).
- **`.env` format libre** : la clé H est le premier `hk-…` ; Linkup = ligne contenant « linkup » ; GitHub = premier `ghp_…` ; les lignes `CLE=valeur` (ex. `REBORN_LOGIN_*`) sont lues par python-dotenv. **Ne jamais afficher le `.env`** (fuite déjà eue en session : **révoquer le token GitHub** (droits admin) et **changer le mot de passe de RS Consulting** — il a été collé dans le chat).
- **Avast intercepte le HTTPS** → `truststore.inject_into_ssl()` (fait à l'import de `explorer.explorer`, `explorer.context`). Le runtime local (exécutable séparé) a besoin de `SSL_CERT_FILE=.certs/ca-bundle.pem` (certifi + racine Avast, généré par `local_runtime.py`).
- **H Company** : base EU `https://agp.eu.hcompany.ai/api/v2`, SDK `hai-agents` 1.4.3. Orga : **10 sessions simultanées** (passé de 3 à 10 dans la journée). Quota : `Client().sessions.get_session_quota()`. Tokens : plan affiché « Free plan » (60M/mois).
- **Config fiable** : `holo4-35b-a3b` + `reasoning_effort: disabled` = **0 zombie / 58+**. **Ne pas utiliser `holo4-27b` + `reasoning_effort: low`** (7/36 sessions figées à l'étape 0, sourdes à cancel/pause/force_answer). Zombies tués **à la main** depuis l'interface platform.hcompany.ai (l'API cancel ne marche pas sur eux).
- **API Modèles** (runtime local) : facturée à part ; avec crédits, `holo4-35b-a3b` OK, `holo4-27b` 402.
- **Navigateur local** (mode `REBORN_BROWSER=local`) : 2 créneaux par expérience (session + canal bridge), canaux qui fuient si run tué (supprimés en `finally`), Chrome headless dédié sur 9222+ ; Chrome minimisé = captures bloquées.
- **Runtime local** (`REBORN_RUNTIME=local`) : contourne le plafond de sessions ; pas de réponse structurée (bug runtime 0.1.23 → schéma injecté dans la consigne) ; moins fiable (4/10 JSON mal formés), plus lent → **secours seulement**.
- **GitHub Pages** : repo public `EliasMoussouni/reborn-legacy-erp` ; toute modif = publication publique → demander l'accord.

## 8. Résultats mesurés

| Quoi | Résultat |
|---|---|
| Expériences devis (local → optimisé) | 51 s → **32,6 s**, 10/10 |
| Expériences devis cloud, 3 en parallèle | **9/9, débit 7,8 s/exp** |
| Audit 72 premières expériences | 67/67 succès justes, 0 valeur fausse |
| Blind Challenge cloud | 3 DRIFT exacts, 46 s |
| Portfolio eliasmoussouni.fr | 8 vues cartographiées, persona → seule l'image de fond change (11 exp.) |
| Stock pneus (isp-stock-pneus-demo) | rapport 11/11 + cadre légal 12 domaines / 63 normes : `reports/isp-stock-pneus-demo.vercel.app_20261107_191951/` |
| cerclai.fr v1 → v2 (avec inspecteur) | pages principales **12/23 → 23/23**, sitemap 14 → 30/78, filtres d'éligibilité **testés** (Artisan 26 → 21, « 5 aides masquées ») : `reports/www.cerclai.fr_20261107_221151/` |
| RS Consulting (rs-consulting-tau.vercel.app) | partie publique (login seul) + inspection du code : `reports/rs-consulting-tau.vercel.app_20261107_225451/` ; partie connectée **à relancer** (§6) |

Note RS Consulting : l'inspection relève qu'une grande partie de la logique métier et de la configuration est lisible dans le JS envoyé au navigateur → à signaler à Jérémie (vérification sécurité de son côté).

## 9. À faire

1. **Utilisateur** : relancer le rapport connecté RS Consulting (§6), puis vérifier `fill_secret_at` dans les traces.
2. **Pousser** sur `Mouss_H_Company` tout ce qui n'y est pas : `explorer/{inspector,vault,legal,mapper,reporter,explorer,local_runtime}.py`, `login_report.py`, README/HANDOFF, résultats texte. Méthode : clone dans le scratchpad, copier dans `h-explorer/`, scan des secrets (valeurs du `.env`, `hk-`, `ghp_`), commit avec la ligne d'attribution, `git push --force-with-lease` (la branche est orpheline). **Ne jamais pousser** `.env`, `credentials.json`, `.certs/`, `artifacts/`, rapports contenant des données perso.
3. Fermer la boucle REBORN : questions ouvertes du rapport → expériences `run_ui_experiment` automatiques → réinjection dans le rapport.
4. Détecteur de boucle dans le superviseur (même commande répétée N fois) pour l'inspecteur.
5. Catalogue de données (ex. aides cerclai) : extraction directe/Linkup fetch plutôt qu'agent visuel.
6. Intégration avec Alan (import Python direct de `run_experiment(s)`).

## 10. Règles de travail avec l'utilisateur

- Français, direct ; dire ce qui ne marche pas ou n'est pas sûr ; mesurer avant d'affirmer.
- Clés uniquement dans `.env`, jamais affichées ni en dur.
- Demander avant toute action publique (push, Pages) ou destructive.
- Linkup ne valide jamais une règle ; seule l'expérience fait foi.
- L'agent peut lire le code source du site ; il ne remplace pas une valeur affichée par un calcul.
- **Connexion aux comptes : c'est l'utilisateur qui lance** (`login_report.py`) ; Claude ne manipule pas de mot de passe.
