# Intégration — Alan (Business Reverse Engineering)

Tu produis ce que REBORN ne doit pas deviner : la signification des données et la logique métier. REBORN reçoit, vérifie sur les vraies données, fait valider par un humain (le propriétaire du projet), puis installe.

- Client Python : [`clients/reborn_client.py`](clients/reborn_client.py) (1.3), sans dépendance. Exemple exécutable : [`clients/examples/alan_modele_metier.py`](clients/examples/alan_modele_metier.py).
- Schémas JSON : [`contracts/`](contracts/). Ils sont générés à partir de la validation de l'API (`npm run contracts`).

## 0. Authentification et projet (obligatoires)

| Élément | Valeur |
|---|---|
| Jeton | `Authorization: Bearer <REBORN_ANALYST_TOKEN>` — le jeton de service de l'Analyste. `npm run token -- analyst` le copie dans le presse-papiers (jamais affiché). Sans jeton : 401 ; un jeton d'un autre service ou un compte client ne publie pas à ta place (403). Pas d'en-tête `Origin` (code serveur, pas un navigateur). |
| Projet | **`?project=MIG_xxxxxxxx` sur chaque appel** (identifiant visible dans l'adresse du projet, `/projets/MIG_…`). Il n'y a plus de « projet courant » pour un agent : sans projet, les routes `/api/migration/*` répondent 400 « Projet requis ». Projet inconnu : 404. |
| Variables du client Python | `REBORN_URL` (défaut `http://127.0.0.1:3000`), `REBORN_TOKEN` (le jeton analyst), `REBORN_PROJECT` (le projet). |

Avec `REBORN_PROJECT`, le client 1.3 ajoute `?project=` aux routes de migration **et** à celles des règles et de la découverte (`/api/rules`, `/api/compute`, `/api/compare`, `/api/app`, `/api/revision`, `/api/investigations`, `/api/events`, `/api/observations`, `/api/schema`). Sans projet, ces routes visent l'atelier de l'équipe : un modèle publié ainsi n'apparaît pas dans la Découverte du client.

```bash
REBORN_TOKEN=<jeton analyst> REBORN_PROJECT=MIG_xxxxxxxx python3 clients/examples/alan_modele_metier.py
```

Ce que le jeton analyst permet sur un projet : lire le projet, ses sources (`/api/migration/sources`, lignes paginées `/api/migration/sources/rows`), le profil (`/api/migration/profile`), les exécutions et leurs rejets, l'aperçu de spécification (`/api/migration/spec`) ; publier les correspondances et le modèle métier, rejouer un modèle sur l'historique (`/api/migration/business-model/check`) ; envoyer hypothèses et demandes d'expérience (`/api/events`), règles (`/api/rules`), calculs (`/api/compute`), comparaisons (`/api/compare`). Il ne permet **pas** de décider à la place d'un humain : décisions sur les points incertains, lancement de la migration, validation d'une version du modèle et mise en service restent au propriétaire du projet (403 pour un jeton de service).

## 1. Correspondances : `migration_mapping` 1.0

`POST /api/migration/mapping?project=<id>` (jeton analyst) ou `rb.migration_publish_mapping(mapping)`.

Pour chaque entité du nouveau logiciel, tu décris :
- la table source et sa clé ;
- les champs : colonne source, type, transformations explicites, référence vers une autre entité ;
- la `confidence` (0 à 1) et une `note` ;
- les champs `accounting` à protéger ;
- la `classification` (`financial`, `commercial`, `line` ou `master`) et `line_of` pour les lignes de document ;
- les contrôles (`checks`) à vérifier sur l'historique.

Sous le seuil (0,9), un élément devient un point à valider par un humain, et la migration est bloquée tant qu'il n'est pas tranché. Exemple complet : `contracts/migration_mapping.example.json` (Relatio 2004).

## 2. Modèle métier : `business_model` 1.0

`POST /api/migration/business-model?project=<id>` (jeton analyst) ou `rb.publish_business_model(model)`. Schéma : `contracts/business_model.schema.json`. Exemple : `contracts/business_model.example.json`.

```json
{
  "contract_version": "1.0",
  "source_system": "Relatio 2004",
  "modules": {
    "devis.ligne":    { "module": "devis.ligne",    "inputs": [...], "rules": [ ... contrat rules existant ... ] },
    "devis.document": { "module": "devis.document", "inputs": [...], "rules": [ ... ] }
  },
  "bindings": [
    { "id": "devis-lignes", "module": "devis.ligne", "scope": "line", "entity": "devis_lignes",
      "document": { "entity": "devis", "via": "devis" },
      "inputs":  { "quantity": "quantite", "prix_unitaire": ["prix_unitaire", "article.prix_ht"], "remise_ligne": "remise_pct" },
      "outputs": { "unit_price": "prix_unitaire", "total_price": "montant_ht" },
      "fields":  [{ "name": "montant_ht", "label": "Montant HT", "type": "money" }] },
    { "id": "devis", "module": "devis.document", "scope": "document", "entity": "devis",
      "lines":   { "entity": "devis_lignes", "via": "devis" },
      "inputs":  { "lignes_ht": { "sum": "devis_lignes.montant_ht" }, "remise_document": "remise_pct", "date_num": { "date_number": "date" } },
      "outputs": { "total_price": "total_ht", "total_tva": "total_tva", "total_ttc": "total_ttc" } }
  ],
  "workflows": [], "hypotheses": [], "notes": "…"
}
```

### Modules

Un module suit le contrat `rules` existant. Il est exécuté par le moteur de REBORN dans cet ordre d'étapes : validation, base, remise, frais, ajustement, arrondi.
- **Expressions** : sûres, sans `eval` ; fonctions disponibles : `round`, `min`, `max`, `abs`, `floor`, `ceil`, `clamp`.
- **Conditions** : numériques. Les dates passent par `{ "date_number": "champ" }`, qui donne le format AAAAMMJJ.
- **Noms réservés pour les entrées** : `unit_price`, `base_total`, `subtotal`, `discount_total`, `fees_total`, `total_price`. Une entrée qui porte l'un de ces noms est refusée : le moteur les calcule lui-même.

### Liaisons

Une liaison dit où lire chaque entrée et où écrire chaque sortie.

**Sources d'une entrée :**

| Forme | Exemple | Usage |
|---|---|---|
| Chemin | `"quantite"`, `"article.prix_ht"`, `"devis.client.categorie"` | Lit le champ, en suivant les références si besoin |
| Liste de chemins | `["prix_unitaire", "article.prix_ht"]` | Premier chemin non vide |
| `{ "sum": "lignes.champ" }` | `{ "sum": "devis_lignes.montant_ht" }` | Somme sur les lignes du document |
| `{ "date_number": "date" }` | `{ "date_number": "date" }` | Date convertie en AAAAMMJJ |
| `{ "value": 20 }` | `{ "value": 20 }` | Paramètre constant |

**Autres règles :**
- Les montants sont stockés en centimes et convertis en euros pour le moteur, dans les deux sens.
- Une sortie absente du résultat donne « calcul non disponible » : jamais de valeur inventée.
- `fields` crée les champs du nouveau logiciel qui n'existaient pas dans l'ancien. Ils restent vides pour l'historique.

### Ce qui se passe après l'envoi

1. La version est créée avec le statut `proposed`. Les problèmes de cohérence (entités, champs, chemins, noms réservés) sont renvoyés.
2. Dans le Studio, à l'étape Validation, le modèle est rejoué sur les documents historiques migrés. Le résultat sépare les documents identiques au centime, les écarts d'arrondi (au plus 2 centimes), les écarts réels et les cas non calculables.
3. Le propriétaire du projet (un humain) valide ou refuse la version ; ni l'Analyste ni un jeton de service ne peuvent valider.
4. Seule une version validée est installée dans le logiciel livré, à la mise en service ou à chaud :
   - les nouveaux documents l'utilisent ;
   - les documents existants gardent leur version ;
   - l'historique n'est jamais recalculé.

## 3. Ce qu'il te reste à brancher

- **Ta sortie actuelle.** Le dépôt d'équipe produit `handoff.json`, des entités, des règles et des fonctionnalités. Il faut convertir cette sortie vers `migration_mapping` et `business_model`. Les champs `workflows` et `hypotheses` sont acceptés et conservés, mais pas encore exécutés : voir [LIMITATIONS.md](LIMITATIONS.md).
- **Le jeton et le projet.** Chaque appel porte le jeton analyst et `?project=` (ou `REBORN_TOKEN` et `REBORN_PROJECT` avec le client Python).
- **Les noms d'entités.** Ils doivent correspondre à ceux des correspondances. Le plus simple : publie les correspondances avant le modèle.
- **Les règles découvertes sur l'écran par l'atelier.** Elles peuvent devenir un module : `POST /api/migration/business-model?from=investigation` avec `{ module?, bindings }`, appel réservé à l'équipe (opérateur).
- **Signalé (ton code, non modifié par le Studio)** : `tools/h_run.py` place l'identifiant et le mot de passe de l'ancien logiciel dans la consigne envoyée au modèle (bloc `login = …`, l. 77-80 au commit `33d2afe`, repris dans chaque `instruction`). Les identifiants ne doivent jamais entrer dans une consigne : coffre H (`fill_secret_at`) ou saisie par CDP, comme le prévoit `credential.handling` des missions (voir [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md) §4).
