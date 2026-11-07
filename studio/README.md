# REBORN — Studio de migration et de modernisation

Partie **Jerem** du projet (Hackathon H Company × 42AI).

REBORN migre une entreprise d'un ancien logiciel métier vers un **nouveau logiciel complet, qui contient ses données historiques** et reproduit ses processus validés.

1. L'Explorer de Mouss découvre les écrans et les mécanismes d'extraction autorisés.
2. L'Analyste d'Alan décrit les entités, les relations et les règles.
3. REBORN extrait les données, construit la nouvelle base, les migre en conservant leur origine et vérifie la migration sur les données réellement relues.
4. REBORN génère ensuite le nouveau logiciel et le met en service, avec sauvegarde et possibilité de retour arrière.

| Moteur (Jerem) | Où | Documentation |
|---|---|---|
| Data Migration Engine | `platform/src/lib/migration/` (formats, profile, mapping, run) | [MIGRATION.md](MIGRATION.md) |
| Migration Validation Engine | `platform/src/lib/migration/verify.ts` | [MIGRATION.md](MIGRATION.md) |
| Application Reconstruction Engine | `generate.ts` + `platform/runtime/` (logiciel livré autonome) ; `lib/engine` + `lib/appschema` (calculateurs reconstruits depuis le comportement observé) | [MIGRATION.md](MIGRATION.md), ci-dessous |
| Modernization Engine | Logiciel livré : interface, API, authentification, rôles, audit, sauvegardes | [MIGRATION.md](MIGRATION.md) |
| REBORN Studio | `platform/` (Next.js) : suivi de l'exploration, des règles, de la migration et de la vérification | ci-dessous |

Logiciels de test fournis :
- **Relatio 2004** (`legacy-crm/`, :4100) : ancien CRM avec une vraie base SQLite et des données synthétiques cohérentes (1 200 clients, 3 500 prospects, 248 articles, 1 800 devis, 988 factures, 1 020 règlements, 4 000 activités, 596 documents). On y trouve volontairement des défauts réalistes ainsi que des exports soumis à des droits.
- **Quotix 98** (`legacy-app/`, :4000) : configurateur de devis en boîte noire, pour la reconstruction des règles de calcul et le Blind Challenge.

## Démarrer

```bash
npm install --prefix platform        # une seule fois
npm run dev                          # REBORN Studio :3000 · Quotix 98 :4000 · Relatio 2004 :4100 (127.0.0.1 uniquement)
npm run crm-source:password          # mot de passe du compte « migration » de Relatio (copié, jamais affiché)
```

Migration de bout en bout : **Studio → 03 Migrer**. La procédure est décrite dans [MIGRATION.md](MIGRATION.md). Le nouveau CRM est servi sur :5050, et `npm run crm` le lance seul, sans le Studio.

Ouvrir **http://127.0.0.1:3000**. Sans agent ni analyste, la colonne « Démonstration autonome » rejoue les scénarios.

| Commande | Effet |
|---|---|
| `npm test` | 86 tests : moteur de règles, intégration API, sécurité (hôte, origine, jeton), **chaîne de migration complète sur le vrai serveur Relatio**, formats, conversions exactes, runtime livré |
| `npm run e2e` | 24 vérifications navigateur : reconstruction par les règles (**remet la plateforme à zéro**) |
| `node scripts/e2e-migration.mjs` | 28 vérifications navigateur : migration dans le Studio, puis nouveau CRM (connexion, données, saisie, mobile) |
| `npm run crm` · `npm run crm:password` | Lance le logiciel livré seul · copie le mot de passe admin initial |
| `npm run start` | Build de production puis serveurs (démo finale) |
| `npm run build` | Build de production |
| `npm run dev:lan` | Mode réseau local pour Mouss et Alan : écritures protégées par jeton (affiché au démarrage) |
| `npm run scenarios` | Régénère les observations des scénarios depuis la logique cachée des logiciels de test |

## Les écrans

| Route | Rôle |
|---|---|
| `/` | Mission control : logiciel analysé, statut, versions, preuve (avec nombre de cas), fonctionnalités reconstruites, scénarios, journal |
| `/investigation` | Actions et observations en direct, écran analysé, fiches d'expérience |
| `/regles` | Modèle par étape d'exécution, validation, confiance, preuves, diff entre versions, publication avec validation à blanc |
| `/reconstruction` | Chaîne écran → modèle → application → vérification ; application avec provenance de chaque ligne ; historique des versions |
| `/comparaison` | Construction et validation séparées, refus reproduits, limites calculées, couverture des règles, matrice versions × investigations, Blind Challenge, import d'observations |
| `/app` | **Application livrée**, avec sa propre identité visuelle. Elle se met à jour à chaud quand le schéma ou les règles changent |

## Ce que le générateur reconstruit

| Élément du schéma | Rendu |
|---|---|
| `number` (`integer`, `min`, `max`, `step`, `unit`) | Saisie numérique avec pas, unité, bornes et paliers lus dans les règles |
| `enum` (`select`, `radio`) | Segmenté (≤ 4 options), cartes (avec descriptions) ou liste déroulante (`display` pour forcer) |
| `boolean` (`checkbox`) | Case à cocher |
| `text` (`max_length`, `pattern`, `placeholder`) | Champ texte avec compteur et validation de format |
| `sections` | Formulaire structuré en groupes |
| `outputs` (`currency`, `number`, `integer`, `percent`, `text`) | Résultat principal et sorties secondaires |
| `tables` (`vary`, `values`) | Tableau calculé : un champ varie, chaque ligne est calculée par le moteur |
| `unsupported` + types inconnus (`date`, `file`…) | Affichés comme **non reconstruits**, jamais simulés |

Ajouter un champ d'un de ces types dans le schéma le fait apparaître dans `/app` sans toucher au code. La validation des entrées (requis, bornes, entier, liste, format) est faite par le moteur, et le comparateur l'utilise aussi.

## Ce que le moteur exécute

L'ordre d'exécution est fixe et déterministe : **validation → base → discount → fee → adjust → rounding**. Dans une étape, les règles s'appliquent par `priority` croissante, puis dans l'ordre de déclaration.

| Conditions (combinées en ET) | Actions (nombre ou expression `"5 + 0.5 * quantity"`) |
|---|---|
| `champ: valeur` (casse ignorée, booléens acceptés) | `error: "message"` : refus métier, stoppe le calcul (validation) |
| `champ_gte / _gt / _lte / _lt / _between` | `unit_price`, `base_total` (base ; `base_total = unit_price × quantity` par défaut) |
| `champ_eq / _neq / _in / _nin` | `discount_percent`, `discount_amount` (discount ; cumul `compound`, `additive` ou `max`) |
| `any`, `all`, `not` | `fee_amount`, `surcharge_percent` (fee, calculés sur le montant remisé) |
| `expr: "quantity >= 10 && zone == 'EU'"` | `multiply`, `minimum_total`, `maximum_total`, `total_price` (adjust) |
| | `set: { variable: expression }` : sorties calculées supplémentaires · `round` (rounding) |

Garanties :
- **Validation avant publication** (`422` avec la liste des erreurs) : identifiants dupliqués, expression invalide, action non exécutable, opérateur mal formé, `depends_on` inconnu ou dans le mauvais ordre. Les avertissements (variable absente du formulaire, conflit statique, action ignorée) n'empêchent pas la publication.
- **Expressions sûres** : analyseur dédié, sans `eval`. Pas d'accès aux propriétés, fonctions limitées à `min`, `max`, `abs`, `floor`, `ceil`, `round` et `clamp`, longueur et imbrication bornées.
- **Calcul déterministe** : `group` rend des règles exclusives (seule la première qui correspond s'applique), `depends_on` est respecté. Si plusieurs règles affectent la même variable, la dernière appliquée l'emporte et un avertissement de conflit est émis.
- **Données absentes ou invalides** : aucun calcul n'est fait avec une valeur inventée. Le résultat a le statut `invalid` (entrée), `rejected` (refus métier) ou `ok`.

**Ce qui n'est pas représentable** : les workflows multi-écrans, les états persistants (stock, historique client), les dates, les fichiers et les appels externes. Ces éléments doivent être déclarés dans `unsupported`.

## Intégration — Mouss (Explorer) et Alan (Analyste)

Le client Python sans dépendance est [clients/reborn_client.py](clients/reborn_client.py). Il lit `REBORN_URL` et `REBORN_TOKEN` dans l'environnement.

```python
from reborn_client import Reborn
rb = Reborn()

# Mouss
inv = rb.active_investigation()                           # lancée depuis le dashboard
rb.publish_schema({"fields": [...], "sections": [...], "unsupported": [...]})
rb.action("Clic sur « Calculer »", screenshot="shot.png")
rb.observation("EXP_001", {"product": "A", "quantity": 10}, {"total_price": 810})
rb.observation("EXP_002", {"product": "A", "quantity": 0}, {}, status="error", error="QUANTITE INVALIDE")
for req in rb.experiment_requests(): ...                  # polling sans perte (after_seq)

# Alan
rb.publish_rules(model, dry_run=True)                     # valider sans publier
r = rb.publish_rules(model)                               # RebornError 422 si non exécutable
r["validation"]["mismatches"], r["validation"]["limitations"]
rb.compute(inputs, model=brouillon)
rb.request_experiment({...}, "lever une ambiguïté")
```

| Endpoint | Contrat |
|---|---|
| `POST /api/observations` | Observation au format du brief, ou liste. `status` vaut `success`, `error` (refus affiché, comparé) ou `failed` (échec technique, exclu) |
| `POST /api/schema` | Description de l'écran, versionnée ([exemple](contracts/schema.example.json)) |
| `POST /api/rules[?dry_run=1]` | Modèle de règles ([exemple](contracts/rules.example.json)), validé puis versionné |
| `POST /api/events` | `action`, `hypothesis`, `experiment_request`, `form_discovered` (compatible), `log` |
| `POST/GET/PATCH /api/investigations` | Création, `?active=1`, clôture |
| `GET /api/events?after_seq=N` | Polling ordonné (`seq` strictement croissant) |
| `GET /api/compare`, `GET /api/app`, `POST /api/compute` | Comparaison, application résolue, exécution |
| `GET /api/contracts` | **Schémas JSON** des contrats, générés depuis la validation réelle |

**Compatibilité** : les formats du brief (page 6) sont inchangés. Toutes les évolutions sont des champs optionnels (`contract_version: "1.1"`). Une observation sans `investigation_id` est rattachée à l'investigation active, qui est créée si besoin. Un `investigation_id` inconnu est refusé (`422`).

## Réseau et sécurité

- `npm run dev` : REBORN et Quotix n'écoutent que sur **127.0.0.1**.
- `npm run dev:lan` : accès LAN pour l'équipe. Toutes les écritures exigent `Authorization: Bearer <REBORN_API_TOKEN>` ; le navigateur s'authentifie via `/api/session?token=…`. Les lectures restent ouvertes sur le LAN.
- **Console de maintenance de Quotix** (Blind Challenge) : serveur séparé, lié à `127.0.0.1:4001`, protégé par jeton (`LEGACY_ADMIN_TOKEN`, sinon jeton aléatoire affiché au démarrage). Elle n'existe pas sur le port 4000 que l'agent explore.
- Si l'agent H Company tourne dans le cloud, n'exposer **que Quotix** : `cloudflared tunnel --url http://localhost:4000`. Ne jamais tunneliser le port 3000 ni le port 4001.

## Scénarios de démonstration (`platform/scenarios/`)

Les données sont au format exact des futurs envois de l'Explorer et de l'Analyste. Elles passent par les mêmes API et les mêmes validations.

- **A — Quotix 98** (devis) : 3 champs, 9 règles dont une exception, 23 observations. Étape 2 : remise volume 10 % → 15 %, le modèle v1 tombe à 61 %. Étape 3 : le modèle v2 revient à 100 %.
- **B/C — TransCalc 2003** (logistique) : 6 champs dont des cases à cocher, un texte et une date non prise en charge ; 11 règles dont une exception croisée ; 2 sorties (prix et délai). Version 2 : un champ « assurance » apparaît, l'express passe de 50 % à 65 %.

## Blind Challenge en démo

1. `npm run dev` (noter l'URL de maintenance affichée), puis lancer l'investigation initiale (explorateur local ou agent).
2. Le jury ouvre la console de maintenance et modifie une remise.
3. `/comparaison` → « Démarrer le Blind Challenge ». Les écarts apparaissent en direct.
4. Alan publie le modèle corrigé. `/app` se met à jour, et la matrice montre v1 en échec et v2 à 100 %, avec les cas indépendants.
