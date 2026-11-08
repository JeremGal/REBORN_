# REBORN — état au rendu (8 novembre 2026, 13 h)

Cible de démonstration : **HotelDruid** (gestion hôtelière, logiciel libre AGPL-3.0), instance fournie
https://www.hotelrm.pro. Tout ce qui suit a été exécuté pour de vrai le 8 novembre ; ce qui ne l'a pas été
est dit.

## Ce qui marche de bout en bout

| Étape | Ce qui tourne | Preuve |
|---|---|---|
| Compte client, projet, autorisation | Inscription réelle (Better Auth), projet « Hôtel RM » avec l'adresse de l'ancien logiciel, « Analyser mon logiciel » | `studio/scripts/demo-hotel.mjs` |
| Studio → agent H de Mouss | La mission part dans la file du Studio ; le nouvel exécuteur `studio/clients/h_executor.py` la prend (battement, prise atomique, réseau public) et lance **le véritable agent H Company** de `h-explorer_v2/` (importé, jamais modifié) | session H « completed », mission `MIS_…` prise par `EXE_…` |
| Agent H → Studio | 1re mission : connexion rapportée « réussie », carte de 18 écrans reçue, puis un envoi refusé (HTTP 400) : mission close **en échec**, honnêtement. Correction de l'exécuteur (envoi écran par écran, refus consignés). 2e mission `MIS_85157e3573` : **terminée** — 13 évènements de découverte reçus et schéma de l'écran « Reservation Form » publié dans le projet | évènements et schémas du projet dans le Studio |
| Studio → bloc 2 d'Alan | `tools/studio-pull.mjs` lit, avec le jeton de l'Analyste, les écrans réellement découverts par l'agent H dans le projet du Studio et écrit un run au contrat d'Alan (`targets/hoteldruid/`, mission M-001 « cartographier les écrans ») : **12 écrans**, libellés d'interface seulement, aucune donnée ; `node tools/reborn.mjs validate hoteldruid` : 0 erreur | `targets/hoteldruid/01-exploration/runs/run-20261108T112651-studio-MIS_85157e3573/` |
| Extraction autorisée | Mécanisme d'export officiel du logiciel (création de la sauvegarde puis téléchargement compressé) : **55 tables, 23 977 lignes** | `.evidence/hoteldruid/` (hors git) |
| Adaptateur de format | `studio/scripts/tagged-dump-to-sqlite.mjs` : lecture du format de sauvegarde, tables par année fusionnées avec une clé « année:identifiant » (les identifiants se répètent d'une année à l'autre), liens déclarés, **comptes, sessions, réglages et modèles de documents jamais importés** | 15 tables, 22 915 lignes, 0 ligne rejetée |
| Migration (moteur de Jerem) | Dépôt par le propriétaire, profil (48 relations), correspondances proposées, migration | **22 915 importés, 0 rejeté** |
| Vérification indépendante | 37 contrôles, 0 en échec ; écarts documentés examinés | rapport de l'exécution `RUN_001` |
| Nouveau logiciel | Généré par le runtime générique et mis en service, indépendant du Studio : 15 entités, **22 915 enregistrements**, chacun tracé vers sa ligne d'origine (`_lineage`) ; accès du propriétaire par lien d'activation | `/api/health` du logiciel livré |

Reproduire (Studio de production déjà construit dans `studio/platform/.next-test`) :

```bash
cd studio
REBORN_NO_REBUILD=1 node --no-warnings scripts/demo-hotel.mjs            # pile + compte + projet + « Analyser »
REBORN_URL=… REBORN_TOKEN=<jeton explorer> python3 clients/h_executor.py --wait 120   # agent H réel (clé dans ../.env)
node --no-warnings scripts/tagged-dump-to-sqlite.mjs <sauvegarde.gz> <hotel.db>
node --no-warnings scripts/demo-hotel-migrate.mjs <hotel.db>             # migration → vérification → livraison
```

Les secrets de la pile (jetons, compte client, lien d'activation) sont écrits en 0600 hors du dépôt ; les
clés des agents sont dans `.env` (ignoré par git).

## Ce qui n'est pas encore branché (dit tel quel)

- **Bloc 2 d'Alan → Studio** : le sens retour n'est pas encore relié. `studio-export` (kit → `migration_mapping` +
  `business_model`, une hypothèse ne devenant jamais une règle validée) est spécifié mais pas écrit, et
  l'enquête du bloc 2 sur HotelDruid (règles, entités) n'a pas été menée jusqu'au kit. Les correspondances
  de la démonstration viennent de la proposition automatique du Studio, et les 172 points à valider ont été
  **acceptés par l'équipe** pour la démonstration (journalisé).
- **Règles métier** : aucune règle n'est installée dans le logiciel livré (`rules_version: null`). Le prix d'un
  séjour (tarifs par période, frais, réductions, acompte, taxes) n'est pas encore reproduit ; l'historique est
  migré tel quel, jamais recalculé.
- **Extraction par l'agent** : l'agent H repère les écrans, mais la sauvegarde a été déclenchée par l'équipe avec
  le mécanisme officiel. Le plan d'extraction proposé par l'agent et validé par le client (plan 1.1 : POST,
  gzip) est spécifié, pas encore dans le Studio.
- **Libellés** : les entités portent encore les noms bruts des tables d'origine.
- **Audit** : P2 (identifiant `morel-crm`) corrigé ; P1 (masquage) partiel ; P3 (compteurs du panneau latéral)
  non terminé. Détail et fichiers : état des lieux du 8 novembre.

## Tests

| Suite | Résultat |
|---|---|
| Bloc 2, `npm test` | 64/66, 0 échec, 2 ignorés (preuves absentes de ce poste) |
| Studio, vitest + typecheck | 386/386, typecheck propre |
| Studio, `npm run acceptance` (pile isolée, vrais processus) | 95/95 |
| Exécuteur H, `python3 -m unittest` (studio/clients/tests) | 18/18 |

## Sécurité, à faire après le hackathon

- Renouveler la clé H Company et la clé Linkup (elles ont été écrites dans un fichier versionné puis déplacées
  dans `.env`, et sont passées dans un journal de session). Quota de jetons H dépassé (169,6 M / 60 M).
- Ne jamais remettre de clé dans `.env.example`.
