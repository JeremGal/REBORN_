# Architecture réelle — partie Jerem

Ce document décrit ce qui existe dans le code aujourd'hui. Ce qui manque est listé dans [LIMITATIONS.md](LIMITATIONS.md).

## Vue d'ensemble

```
 Client (navigateur)            REBORN Studio (platform/, Next.js 16, :3000)                     Logiciel livré (generated/<id>/)
 ───────────────────            ───────────────────────────────────────────                      ──────────────────────────────
 compte (Better Auth) ──► /api/auth/* · /api/me · handler() : identité, origine, projet, droits    runtime générique (node:http + node:sqlite)
 « Analyser mon logiciel » ─► /api/projects/:id/analysis ─► file des missions (auth.db)            app.json  = ApplicationSpec 1.1
                                                              ▲ heartbeat · claim · complete        rules/vN.json = modèle métier versionné
 Exécuteur de Mouss (jeton explorer) ─────────────────────────┘ redeem · connection · events        data/app.db = base migrée + comptes
 Analyste d'Alan (jeton analyst) ─► /api/migration/mapping · /business-model (?project=)           .secrets/invites = invitations (empreintes)
 exports ─► connecteur HTTP (egress.ts) ─► /api/migration/extract ─┐
 fichiers ─► dépôt manuel ──────────────► /api/migration/sources ──┤
                                                                   ▼
                     coffre (SHA-256) ─► profil ─► correspondances ─► migration ─► vérification ─► génération ─► mise en service
                                          │      (Alan / auto / corrections)  (transaction)  (indépendante)   (spec)      (détachée, PID)
                     modèle métier (Alan) ┴─► rejeu sur l'historique ─► validation humaine ─► rules/vN.json ───────────────┘
```

Le Studio prépare, vérifie et publie. Le logiciel livré tourne seul : il ne contacte jamais le Studio ni l'ancien logiciel.

## Comptes et contrôle d'accès

### Identités (`platform/src/lib/auth/`)

| Identité | Origine | Accès |
|---|---|---|
| Anonyme | aucune session | accueil, textes juridiques, inscription, connexion, `/api/health` réduit, contrats JSON |
| **Client** | inscription (`/inscription`) | ses projets seulement |
| **Opérateur** (équipe REBORN) | `npm run account -- operator <email>`, jamais par l'API | ses projets, ceux sans propriétaire, l'atelier, `/design-system`, `/app` |
| Service `explorer` | `Authorization: Bearer <REBORN_EXPLORER_TOKEN>` | exécuteur de Mouss : file des missions, remise des identifiants (titulaire du prêt), rapports, évènements, observations, dépôt d'exports |
| Service `analyst` | `Authorization: Bearer <REBORN_ANALYST_TOKEN>` | Analyste d'Alan : correspondances, modèle métier, règles de l'atelier, lecture des données d'un projet |

- **Better Auth 1.7.12** sur `node:sqlite` : `<REBORN_DATA_DIR>/auth.db` (comptes, sessions, vérifications) plus les tables de REBORN : `consents`, `auth_lockout`, `analysis_missions`, `executors`.
- **Mots de passe** : 10 à 128 caractères, hachés par scrypt, jamais journalisés. **Sessions** : cookie `reborn.session_token` (HttpOnly, SameSite=Lax, `Secure` si `REBORN_PUBLIC_URL` est en https), 7 jours glissants ; déconnexion, déconnexion de tous les appareils, changement de mot de passe qui ferme les autres sessions.
- **Tentatives abusives** : verrouillage par compte (8 échecs en 15 min → 15 min, réponse 429), compteur dans `auth.db` (adresse e-mail hachée). La limitation par adresse IP n'est active que derrière un proxy de confiance (`REBORN_TRUST_PROXY=1`) ; sinon une limite globale (`lib/auth/limits.ts`, voir [LIMITATIONS.md](LIMITATIONS.md)).
- **Consentements** (`lib/legal.ts`, table `consents`) : à l'inscription, `terms_acceptance` (contrat) et `privacy_acknowledgement` (information) ; à la création d'un projet, `source_authorization` (autorisation d'accès à l'ancien logiciel) et, si des identifiants sont confiés, `credentials_notice`. Version, empreinte SHA-256 du texte exact, date. Cases jamais pré-cochées ; version périmée refusée (409).
- **Réinitialisation du mot de passe** : aucun service d'e-mail ; la CLI de l'opérateur demande un lien (usage unique, 1 h) avec la clé `<données>/operator.key`, et la page `/reinitialisation` (jeton dans le fragment `#`) l'utilise.

### `handler()` : point d'application unique (`platform/src/lib/http.ts`)

Chaque route de l'API passe par `handler(fn, { access, write?, project? })`, sauf `/api/auth/*` (Better Auth : contrôle de l'hôte, puis ses propres contrôles d'origine et une liste fermée de fonctions). `access` est **obligatoire** : une route sans contrôle d'accès ne se charge pas, et un test d'inventaire vérifie que chacune des 57 routes en déclare un. Ordre :

1. **Hôte** : adresses de bouclage seulement (protection contre le rebinding DNS), plus `REBORN_ALLOWED_HOSTS` et l'hôte de `REBORN_PUBLIC_URL` ; tous les hôtes en mode réseau (`REBORN_LAN=1`).
2. **Identité** : jeton Bearer de service (comparaison en temps constant), sinon session Better Auth, sinon anonyme.
3. **Origine (CSRF)** : écriture par cookie → `Origin` égale à l'hôte (ou `sec-fetch-site: same-origin`), sinon 403 ; Bearer → refus si une `Origin` étrangère est présente.
4. **Projet désigné** : `[id]` du chemin, `?project=` ou `x-reborn-project`, validés (`MIG_` + 8 hexadécimaux) ; deux désignations différentes → 400 ; aucun « projet courant » pour un client ou un agent (400 « Projet requis »), l'opérateur seul garde le repli de l'atelier.
5. **Droits** : anonyme → 401 ; rôle insuffisant → 403 ; projet inconnu **ou** d'un autre compte → 404 « Projet introuvable » (même réponse : pas d'énumération).
6. Exécution dans la portée de l'identité et du projet (`AsyncLocalStorage`) ; le champ `by` des corps est remplacé par l'identité authentifiée.

### Isolation des données entre clients

- **Projets** : `<données>/migration/projects/<id>/`, propriétaire dans l'index (`owner_id`). Un client ne liste, ne lit et n'écrit que les siens.
- **État temps réel** (`lib/store.ts`, `lib/visibility.ts`) : chaque évènement, observation, investigation, modèle et schéma porte le projet fixé **par le serveur** (portée de la requête ou investigation), jamais par le corps. `/api/state`, `/api/revision`, `/api/events`, `/api/observations`, `/api/investigations`, `/api/stream` (filtré par abonné, identité revérifiée à chaque ping) et `/api/shots/<id>` (captures rangées par projet, `cache-control: private, no-store`) ne montrent à un client que ses projets. L'atelier (règles, scénarios, remise à zéro) est réservé à l'équipe et aux agents.
- **Vérifié** route par route : test d'inventaire (chaque méthode de chaque `route.ts` porte son contrôle), tests d'isolation en mémoire (`platform/src/*.test.ts`) et appels directs entre deux comptes sur un serveur réel (`npm run acceptance`, test 7).

## Identifiants de l'ancien logiciel

- **Chiffrement** (`lib/migration/credentials.ts`, format v2) : une clé AES-256-GCM aléatoire **par identifiant**, rangée dans `REBORN_KEYS_DIR` (défaut `platform/.keys`, 0700, hors du dossier de données, à exclure des sauvegardes), elle-même enveloppée par la clé maîtresse `<données>/vault.key` (jamais régénérée en silence). Données associées authentifiées : `reborn/cred/v2|<projet>|<id>|<échéance>` (un chiffré recopié dans un autre projet est rejeté).
- **24 heures au plus** après le dépôt (refus au-delà ; date illisible = expiré). **Balayage** au démarrage du serveur (`src/instrumentation.ts`) puis toutes les 60 s : identifiants échus, jetons expirés, clés orphelines, prêts de mission expirés — même si personne ne revient.
- **Effacement anticipé** (la clé est supprimée en premier, puis le chiffré) : extraction réussie, fin de mission déclarée par l'exécuteur, passage aux correspondances ou au-delà, changement d'adresse, mise en service, demande du client (`DELETE /api/projects/:id/credentials` → `{ revoked_at }`). Les données métier déjà récupérées ne sont jamais touchées.
- **Jamais** dans une réponse (sauf la remise à l'exécuteur titulaire), un évènement, un journal, une capture, `project.json` ou un rapport. Le navigateur du client ne voit jamais de jeton de remise.

## File des missions d'analyse (`lib/migration/analysis.ts`)

1. Le client clique « Analyser mon logiciel » : `POST /api/projects/:id/analysis` exige l'autorisation d'accès à la version courante, une adresse valide et des identifiants non expirés (ou `{ without_credentials: true }` explicite). La demande entre en file (`queued`) dans `analysis_missions` (une seule mission active par projet). Sans exécuteur disponible, la réponse porte exactement « Agent d'analyse non disponible pour le moment. » ; rien n'est simulé.
2. L'exécuteur envoie un **battement de cœur** au moins toutes les 20 s (`/api/executor/heartbeat` : réseaux joignables, saisie des identifiants hors du modèle). Il est « disponible » si son dernier battement a moins de 60 s.
3. **Prise atomique** (`/api/executor/missions/claim`, `BEGIN IMMEDIATE … RETURNING`) : mission `connection_mission` 1.1 avec un **jeton de remise** lié à la mission et à l'exécuteur (15 min, usage unique). Prêt de 120 s renouvelé par le battement ; prêt expiré → jeton révoqué, mission remise en file ; 3 prises sans aboutir → `failed`.
4. Remise des identifiants (`/credentials/redeem`, refusée si la requête porte `Origin`), rapport de connexion, exploration, exports : **titulaire du prêt** seulement.
5. **Fin** (`/api/executor/missions/:id/complete`) : investigation close, prêt libéré, **identifiants effacés**. Jamais de `completed` implicite.

Contrats : `connection_mission` 1.1, `executor_heartbeat` 1.0, `mission_complete` 1.0, `connection_report` 1.1 (`contracts/`). Détail pour Mouss : [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md).

## Sorties réseau (`lib/migration/egress.ts`)

Connecteur HTTP et simulateur de l'atelier passent par `node:http`/`node:https` avec un `lookup` qui contrôle **chaque adresse résolue** (plages privées, bouclage, lien local, métadonnées, IPv6 ULA, IPv4 mappées), redirections non suivies, délais et taille maximale. Liste blanche `REBORN_EGRESS_ALLOW` (`hôte:port`) posée par `scripts/dev.mjs` pour les logiciels de test locaux (4100, 4000), jamais 3000, 4001 ni 5050. Adresse d'ancien logiciel : `http(s)` seulement, sans identifiant (`user:pass@` refusé), 500 caractères au plus ; jamais recopiée dans un message d'erreur.

## Modules de migration

| Module | Fichiers | Rôle |
|---|---|---|
| Projets | `platform/src/lib/migration/project.ts`, `context.ts`, `project-contracts.ts`, routes `api/projects/**` | Projets isolés, propriétaire, états persistés (pause appliquée côté serveur), historique d'états |
| Extraction | `connectors.ts`, `formats.ts`, `egress.ts` | Plan d'extraction HTTP (même origine, 401/403 consignés, 200 Mo max), lecteurs CSV (encodages), JSON, XLSX, ZIP, SQL (instructions autorisées seulement), SQLite ; lecture paginée côté serveur (`/api/migration/sources/rows`, 100 lignes au plus) |
| Analyse | `profile.ts` | Types, formats, clés, relations (inclusion des valeurs + noms), anomalies, indicateurs oui/non |
| Correspondances | `mapping.ts`, `labels.ts`, route `mapping/fields` | Contrat `migration_mapping` 1.0, proposition automatique, points à valider, décisions humaines, corrections champ par champ (nouvelle version « user », aperçu sur les vraies valeurs) |
| Migration | `run.ts`, `model.ts`, `transforms.ts` | Nouvelle base par exécution, transaction unique, ordre des dépendances, `_lineage` par enregistrement, rejets motivés, doublons signalés, montants en centimes entiers |
| Vérification | `verify.ts` | Relit les sources du coffre (empreintes revérifiées) et la base cible en lecture seule : volumes, valeurs champ par champ, relations (`foreign_key_check`), sommes au centime, contrôles métier, pièces jointes, intégrité |
| Modèle métier | `business-model.ts`, `rules-history.ts`, `engine/bindings.ts` | Contrat `business_model` 1.0 (modules de règles + liaisons), versions immuables à valider, rejeu sur les documents historiques (identiques / arrondis / écarts) |
| Moteur de règles | `platform/src/lib/engine/` | Exécution déterministe par étapes (base, remise, frais, ajustement, arrondi), évaluateur d'expressions sûr (pas d'`eval`) |
| Génération | `generate.ts`, `application-spec.ts`, `app-access.ts` | ApplicationSpec 1.1, installation du modèle validé, port par logiciel, lancement détaché, mise à jour sans perte, retour arrière, réconciliation ; invitations au logiciel livré |
| Runtime livré | `platform/runtime/` (copié dans `generated/<id>/`) | API REST, interface web générique, comptes (activation par invitation, « Mon mot de passe », sessions revalidées à chaque requête), rôles, audit, sauvegardes, export CSV, calcul des documents par le moteur de règles copié |

## Données

| Où | Contenu | Persistance |
|---|---|---|
| `platform/.data/auth.db` | Comptes, sessions, consentements, verrouillages, missions d'analyse, exécuteurs | SQLite |
| `platform/.data/migration/projects.json` | Index des projets (propriétaire), projet de repli de l'atelier | Fichier (écriture atomique) |
| `platform/.data/migration/projects/<id>/` | `project.json` (état, historique, correspondances, décisions, exécutions), `sources/` (coffre), `runs/<RUN>/target.db` (base migrée + rapport), `business-model/vN.json`, `credentials.enc.json` (chiffré, 0600), `missions.json` (empreintes des jetons de remise) | Fichiers |
| `platform/.data/vault.key` · `platform/.keys/` | Clé maîtresse · une clé par identifiant confié (à exclure des sauvegardes) | Fichiers 0600, jamais versionnés |
| `platform/.data/state.json`, `platform/.data/shots/<projet>/` | Investigations, observations, règles, évènements (avec leur projet) ; captures rangées par projet | Fichiers |
| `generated/<id>/data/app.db` | Base du logiciel livré : tables métier, `_lineage`, `_audit`, `_users`, `_invites`, `_files`, `_meta`, `_rules` | SQLite |
| `generated/<id>/backups/` | Sauvegardes (avant mise en service, mise à jour, restauration) | SQLite (`VACUUM INTO`) |
| En mémoire seulement | Sessions du logiciel livré, abonnés du flux temps réel, compteurs de limitation des tentatives | — |

Le projet unique des versions précédentes reste à la racine de `platform/.data/migration/` et devient le premier projet de l'index ; les projets créés avant les comptes n'ont pas de propriétaire (rattachement par `npm run account -- claim-unowned|assign`). Aucune donnée n'est déplacée.

## Calcul d'un nouveau document dans le logiciel livré

1. L'utilisateur ajoute une ligne (`POST /api/e/<lignes>`).
2. Le serveur détermine la version du modèle : celle du document si elle est déjà fixée, sinon la version active.
3. Le module de règles de la ligne est exécuté. Ses entrées sont lues sur la ligne et ses références (par exemple le prix catalogue de l'article). Le prix et le montant de la ligne sont enregistrés.
4. Le module du document est exécuté sur la somme des lignes et les champs du document : remise, taux de TVA selon la date, TVA, TTC.
5. Tout s'enregistre dans une seule transaction, avec la version utilisée (`_rules_version`).

Une erreur (règle manquante, entrée absente) annule l'ensemble et renvoie 422 avec la raison. Les documents migrés ne sont jamais recalculés.

## Protection de l'historique (côté serveur)

| Cas | Réponse |
|---|---|
| Modifier un champ comptable d'un enregistrement migré | 409, tentative journalisée (`update_refused`) |
| Supprimer un document historique protégé | 409, tentative journalisée (`delete_refused`) |
| Ajouter, modifier ou supprimer une ligne d'un document historique protégé | 409 |
| Saisir à la main un champ calculé par le modèle | 400 |
| Modifier un élément de calcul d'un document historique (remise, date) | 409 |
| Restaurer une sauvegarde | Une sauvegarde de sécurité est d'abord créée |

La classification « comptable / commercial / lignes / référentiel » est proposée automatiquement. Quand elle est incertaine, elle est soumise à validation humaine, et la protection reste active tant qu'un humain ne l'a pas retirée.

## Accès au logiciel livré (phase 1)

« Créer mon accès au logiciel » (`POST /api/migration/app/access`, propriétaire) dépose dans `generated/<id>/.secrets/invites/` une invitation qui ne contient que l'**empreinte** du jeton (fichier 0600, écriture atomique) et renvoie le lien une seule fois (jamais journalisé). Le logiciel livré importe l'invitation (même s'il était arrêté), l'activation est à usage unique (transaction) et la personne choisit son mot de passe ; les empreintes utilisées sont notées hors de la base pour qu'une restauration ne rouvre pas une invitation. `admin.json` reste l'accès de secours de l'opérateur.

## Interface du Studio et design system

- **Pages** : `(site)` public (accueil, `/legal/conditions`, `/legal/confidentialite`) ; `(auth)` (`/connexion`, `/inscription`, `/reinitialisation`) ; `(platform)` espace connecté (`/espace`, `/projets`, `/projets/nouveau`, `/projets/[id]/<8 étapes>`, `/activite`, `/parametres`), session vérifiée côté serveur dans le layout ; `(platform)/(equipe)` atelier de l'équipe (404 pour un client). `src/proxy.ts` ne fait qu'une redirection optimiste (présence du cookie) : la vraie barrière reste l'API.
- **AppShell** : une barre latérale contextuelle (navigation globale ; dans un projet, ses 8 étapes avec leur statut réel ; bloc utilisateur), tiroir `<dialog>` sur mobile, lien « Aller au contenu ».
- **Design system** (`platform/src/components/ds/`) : composants natifs et accessibles (Button, Field/Input/PasswordInput/Select/Checkbox/RadioGroup, Dialog/ConfirmationDialog/Drawer, Menu, Tabs, Stepper, Toast, Alert, Progress, DataTable, Pagination, FileUpload, Wordmark…). Jetons centralisés dans `globals.css` (`@theme`) : une seule couleur d'accent (vert-de-gris, aussi celle de la validation), ocre pour les avertissements, rouille pour les erreurs ; Instrument Sans et IBM Plex Mono ; contrastes calculés (texte ≥ 4,5:1) ; mouvement réduit respecté. Démonstration de chaque composant : `/design-system` (équipe). Le logiciel livré garde sa propre identité (IBM Plex Sans embarquée).

## Exposition réseau

Le Studio écoute sur 127.0.0.1. En mode réseau (`npm run dev:lan`, `REBORN_LAN=1`), tous les hôtes sont servis : l'accès reste protégé par les comptes et les jetons des agents. Les secrets (`.secrets/`, `platform/.data/`, `platform/.keys/`, `legacy-crm/data/`, `generated/*/.secrets/`) sont en mode 0600 et ignorés par git ; les commandes `npm run …:password` et `npm run token` les copient sans les afficher.
