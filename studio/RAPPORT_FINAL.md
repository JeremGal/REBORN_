# REBORN V1.1 — comptes clients, isolation, expérience produit

Rapport final du 8 novembre 2026. Il répond à deux demandes : **authentification client et parcours de migration**, puis **expérience produit premium**. Le rapport précédent (V1.0, moteurs de migration et de reconstruction) est conservé dans [RAPPORT_V1.0.md](RAPPORT_V1.0.md).

Tous les chiffres viennent de tests exécutés le 8 novembre 2026 sur le code final. Ils ont été rejoués sur une copie exacte de ce qui est poussé sur la branche `rebuild/studio` du dépôt de l'équipe, sans aucun fichier local (ni secret, ni donnée) : mêmes résultats.

## En bref

- **SaaS B2B réel** : les clients créent leur compte, retrouvent leurs projets et livrent leur nouveau logiciel depuis leur espace. Chaque client ne voit que ses projets ; c'est contrôlé côté serveur sur toutes les routes de l'API (57) et vérifié par des tentatives réelles de contournement.
- **Identifiants de l'ancien logiciel** : chiffrés, une clé par identifiant, 24 h au plus. Ils sont effacés automatiquement même si personne ne revient, effacés plus tôt dès qu'ils ne servent plus, et le client peut les supprimer lui-même. Ils n'apparaissent dans aucune réponse, aucun journal, aucun fichier en clair (vérifié sous 21 formes d'encodage).
- **« Analyser mon logiciel »** : une vraie mission est mise en file pour l'agent de Mouss. Sans agent connecté, l'écran affiche exactement « Agent d'analyse non disponible pour le moment. » et rien n'est simulé.
- **Nouvelle interface** : design system unique, accueil, connexion, espace client, parcours en 8 étapes, CRM livré retravaillé. 0 violation d'accessibilité détectée par axe-core sur 76 analyses.
- **Aucune régression** : tous les tests historiques passent encore et le parcours complet a été rejoué dans un vrai navigateur.

## Tests exécutés (code final)

| Commande | Résultat | Ce qui est réel |
|---|---|---|
| `npx tsc --noEmit -p .` | 0 erreur | |
| `npm test` (vitest) | **386/386** (27 fichiers) | Routes appelées en mémoire, vrai serveur Relatio, vrai CRM généré et démarré |
| `npm run acceptance` | **95/95** | Processus réels sur pile isolée : deux clients, doublure d'exécuteur étiquetée « jeu de test », Ctrl+C sur le Studio |
| `node scripts/e2e-parcours.mjs` | **72/72** | Chrome réel : inscription, assistant, 8 étapes, activation du CRM livré, devis, mobile 390 et 320 px |
| `npm run e2e` | **29/29** | Atelier de l'équipe (session opérateur) |
| `node scripts/e2e-migration.mjs` | **32/32** | Vue de l'équipe `/migration`, pile isolée |
| `npm run a11y` | **0 violation** | axe-core sur 27 pages et 12 états, 76 analyses ; clavier : 0 défaut ; scénarios 24/24 |
| `next build` | propre, sans avertissement | |

Avant ce travail, les chiffres étaient de 113 tests unitaires, 49 vérifications d'acceptation et 32 dans le navigateur.

**Les tests attrapent-ils vraiment les fautes ?** Des défauts ont été introduits volontairement, un par un, sur des copies du code (jamais dans le dépôt) :

| Zone | Défauts détectés |
|---|---|
| Isolation | 44/44 |
| Tests de la suite | 39/39 |
| Durcissements | 35/35 |
| Identifiants et file de missions | 31/32 |
| Routes de correspondances et d'accès | 12/12 |
| Lecture paginée | 8/8 |
| Revalidation des sessions du CRM livré | 3/3 |

Le seul défaut non détecté (prise de mission sans `BEGIN IMMEDIATE`) ne se voit qu'entre deux processus.

**Revues finales indépendantes**, faites par l'expérience sur piles isolées :

| Revue | Ce qui a été essayé |
|---|---|
| Isolation | 47 routes × 4 façons de désigner un projet, flux temps réel, élévation de rôle |
| Secrets | 21 formes d'encodage, 470 réponses HTTP, tous les fichiers, journaux et captures |
| Web | CSRF, XSS, redirections, SSRF, sessions, en-têtes |
| Parcours réel | Chrome, deux clients |
| Visuel | 445 captures à 5 largeurs |

Bilan : 0 constat critique, 3 hauts, 19 moyens, 33 bas. **Tous les constats hauts et moyens sont corrigés**, chacun avec un test de non-régression. Les points non corrigés sont listés au § 16 et en G.

---

# Partie 1 — Authentification client et parcours de migration

### 1. Système d'authentification choisi
- **Bibliothèque** : **Better Auth 1.7.12**, une solution éprouvée. Elle a d'abord été essayée en isolation sur ce poste (≈ 80 vérifications), puis intégrée.
- **Base** : `platform/.data/auth.db` (SQLite intégré à Node, une seule connexion partagée).
- **Mots de passe** : hachés en scrypt (N=16384, r=16, p=1), jamais stockés en clair ni chiffrés de façon réversible.
- **Sessions** : cookie `reborn.session_token` HttpOnly, SameSite=Lax, Secure et préfixe `__Secure-` en https, signé par HMAC. Durée de 7 jours glissante, pas de cache de session : une révocation est immédiate.
- **Contrôle d'accès** : un point d'application unique, `handler()` dans `platform/src/lib/http.ts`, pour toutes les routes de l'API sauf `/api/auth/*` (Better Auth : contrôle de l'hôte, puis ses propres contrôles d'origine et une liste fermée de fonctions). Le contrôle d'accès y est **obligatoire** : une route sans règle ne se charge pas, et un test d'inventaire vérifie que chacune des 57 routes en déclare une. Un client désigne-t-il un projet qui n'est pas à lui ? Le serveur répond 404, sans dire s'il existe.
- **Trois catégories d'identité** :

| Identité | Comment on l'obtient |
|---|---|
| Client | Par inscription |
| Opérateur (équipe REBORN) | Uniquement en ligne de commande |
| Services (agent de Mouss, Analyste d'Alan) | Par jeton, sans jamais de cookie |

### 2. Pages créées
- **Publiques**
  - accueil `/` ;
  - `/legal/conditions` et `/legal/confidentialite`, versionnées.
- **Entrée**
  - `/connexion` : connexion à REBORN, deux panneaux ;
  - `/inscription` ;
  - `/reinitialisation`.
- **Espace client**
  - `/espace` (vue d'ensemble), `/projets` (mes projets), `/activite` ;
  - `/parametres` : profil, sécurité, confidentialité.
- **Autres** : pages 404 en français ; `/design-system`, réservé à l'équipe.
- **Nouvelles routes d'API**

| Route | Rôle |
|---|---|
| `/api/auth/*` | Comptes (Better Auth) |
| `/api/me`, `/api/me/consents` | Profil et consentements |
| `/api/projects/[id]/analysis` | « Analyser mon logiciel » |
| `/api/executor/heartbeat`, `/api/executor/missions/claim`, `/api/executor/missions/[id]/complete` | Exécuteur de l'agent d'analyse |
| `/api/migration/sources/rows` | Lecture paginée des données |
| `/api/migration/mapping/fields` | Correction d'un champ |
| `/api/migration/app/access` | Accès au logiciel livré |
| `/api/admin/erase` | Suppression d'un compte ou d'un projet par l'opérateur |

### 3. Pages modifiées
- `/projets/nouveau`, devenue un assistant en 3 temps.
- Les 8 étapes d'un projet.
- Les layouts et la navigation : barre latérale unique, contextuelle dans un projet.
- L'atelier de l'équipe, déplacé dans un groupe réservé aux opérateurs, à adresses inchangées.
- Le CRM livré (runtime générique).
- **Supprimées** : l'ancienne page de jeton partagé (`/connexion`), qui mettait le jeton maître dans un cookie, et l'ancien tableau de bord de `/`.

### 4. Inscription
- **Champs** : prénom, nom, entreprise, e-mail professionnel, mot de passe (10 à 128 caractères) et sa confirmation.
- **Deux cases, jamais pré-cochées** : l'acceptation des conditions d'utilisation (contrat) et la prise de connaissance de la politique de confidentialité (information). Le serveur refuse l'inscription sans elles et enregistre la version et la date de chacune.
- **Protections** : le rôle ne peut pas être choisi à l'inscription (toujours « client »), l'e-mail est normalisé, et les créations de comptes sont limitées (100 par 10 minutes).

### 5. Connexion
- E-mail et mot de passe, avec affichage et masquage du mot de passe et des erreurs en français.
- Après connexion, retour à la page demandée. Seuls les chemins internes sont acceptés : pas de redirection ouverte.
- **Contre les tentatives abusives**
  - Verrouillage par compte : 8 échecs en 15 min bloquent le compte 15 min.
  - Délai constant : aucun échec n'est répondu en moins de 250 ms, ce qui empêche de deviner un compte au temps de réponse.
  - Limite globale à fenêtre glissante, qui ne peut plus bloquer tout le monde comme le faisait la limitation d'origine.
  - Derrière un proxy de confiance (`REBORN_TRUST_PROXY=1`) : limitation par adresse réelle en plus.
- **Mot de passe oublié** : aucun service d'e-mail n'est configuré, donc aucun bouton factice. La page indique qu'un administrateur REBORN peut transmettre un lien. `npm run account -- reset-link <email>` produit un lien réellement fonctionnel : usage unique, 1 heure, toutes les sessions révoquées à la réinitialisation.

### 6. Gestion des comptes clients
- **Paramètres** :
  - profil ;
  - changement de mot de passe, qui révoque les autres sessions ;
  - liste des sessions, déconnexion des autres appareils ou de tous ;
  - historique des consentements, avec leurs versions ;
  - identifiants confiés, projet par projet, avec suppression immédiate.
- **Ligne de commande de l'équipe** (`npm run account -- …`) : `list`, `operator`, `client`, `assign`, `claim-unowned`, `reset-link`, et `delete` / `delete-project`. Les suppressions montrent un aperçu par défaut et ne s'exécutent qu'avec `--confirm`. Aucune commande n'affiche de mot de passe.

### 7. Isolation des projets
- **Propriétaire** : chaque projet appartient à un compte. Aucun repli sur un « projet courant » global pour un client ou un service.
- **Désignation du projet** par `[id]`, `?project=` ou l'en-tête `x-reborn-project` : la valeur est validée, et deux désignations divergentes donnent 400.
- **État partagé**
  - Évènements, investigations, observations, captures et flux temps réel sont rattachés à leur projet par le serveur, jamais par ce qu'envoie le client.
  - Ils sont filtrés pour chaque client ; les captures sont servies en `private, no-store`.
  - Le flux temps réel revérifie la session toutes les 15 s.
- **Atelier de l'équipe** : réservé aux opérateurs. Sa remise à zéro ne touche jamais un projet client.
- **Preuves** :
  - 20 tests d'isolation ;
  - inventaire automatique des 57 routes (85 méthodes) : aucune réponse 2xx sans identité, hors la liste publique ;
  - 340 appels croisés entre deux comptes, avec des données inchangées à l'octet ;
  - la revue indépendante n'a trouvé aucune fuite.

### 8. Chiffrement des identifiants de l'ancien logiciel
- **Chiffrement** : AES-256-GCM, **une clé aléatoire par identifiant**. Elle est rangée dans `REBORN_KEYS_DIR` (par défaut `platform/.keys`, ignoré par git) et enveloppée par la clé maîtresse `vault.key`.
- **Liaison au projet** : des données associées authentifiées (projet, identifiant, échéance) empêchent de recopier un chiffré vers un autre projet.
- **Effacement cryptographique** : à l'effacement, la clé de l'identifiant est supprimée en premier. Une copie du chiffré gardée avant l'échéance devient illisible ; c'est vérifié par la revue.
- **Accès au mot de passe** : seul l'exécuteur habilité, titulaire du prêt de la mission, l'obtient. Il le reçoit avec un jeton à usage unique de 15 minutes, lié à la mission et à l'exécuteur. Un navigateur ne l'obtient jamais, même celui du propriétaire.
- **Masquage** : un mot de passe renvoyé par l'agent est masqué sous toutes ses formes dans les évènements, observations, schémas et rapports.
- **Adresses** : une URL qui contient des identifiants (`user:pass@`) est refusée sans être recopiée.

### 9. Suppression automatique après 24 h
- **Durée** : plafond de 24 h après le dépôt ; une durée plus longue est refusée. Une date illisible vaut « expiré ».
- **Balayage** : au démarrage du Studio, puis toutes les 60 s, et au plus une fois par minute depuis n'importe quelle requête.
- **Vérifié réellement** : un identifiant antidaté est effacé en 59 s **sans aucune requête**, chiffré et clé compris.
- **Test avec horloge contrôlée** : à +24 h + 1 s, l'identifiant est inutilisable, ses fichiers sont supprimés et le jeton est refusé.

### 10. Suppression anticipée
Les identifiants sont effacés, avec révocation des jetons, dans 6 cas :
- fin réussie d'une extraction ;
- mission déclarée terminée par l'agent ;
- passage du projet aux correspondances ;
- mise en service ;
- changement d'adresse de l'ancien logiciel ;
- demande du client (« Supprimer mes identifiants maintenant »).

Les données métier déjà extraites ne sont jamais touchées. Le test E vérifie par empreintes que sources, correspondances et exécutions sont intactes.

### 11. Procédure de création d'une mission Computer Use
1. **Le client** clique sur « Analyser mon logiciel ». `POST /api/projects/<id>/analysis` vérifie la propriété, l'autorisation à la version en vigueur, l'adresse et les identifiants, puis met une mission en file. Une seule mission est active par projet.
2. **Sans exécuteur actif** (aucun signe de vie depuis 60 s) : réponse 202 et message exact « Agent d'analyse non disponible pour le moment. ». La mission reste en file, sans progression simulée.
3. **L'exécuteur de Mouss** (jeton `explorer`) :
   - envoie un signe de vie (`/api/executor/heartbeat`) ;
   - prend la mission (`/api/executor/missions/claim`). La prise est atomique, avec un prêt de 120 s renouvelé ; la mission suit le contrat `connection_mission` **1.1** (les champs 1.0 sont conservés) ;
   - échange son jeton à usage unique contre les identifiants ;
   - rapporte la connexion. Une double authentification donne « intervention nécessaire » ;
   - envoie observations et exports ;
   - termine la mission. Les identifiants sont alors effacés.
4. **Contrats publiés** : `contracts/connection_mission.schema.json` (1.1), `executor_heartbeat.schema.json`, `mission_complete.schema.json`. Le client Python est passé en version 1.3, et l'exemple de Mouss est devenu une doublure d'exécuteur étiquetée « jeu de test ».

### 12. Parcours client

| Étape | Ce qui se passe |
|---|---|
| 1 | Accueil |
| 2 | Inscription |
| 3 | Espace |
| 4 | Nouvelle migration (assistant) |
| 5 | Adresse et identifiants |
| 6 | Confidentialité et autorisation |
| 7 | « Analyser mon logiciel » |
| 8 | Exploration : en attente de l'agent, avec le message exact |
| 9 | Données : import manuel, ou plan de test pour le logiciel de test Relatio |
| 10 | Correspondances |
| 11 | Migration |
| 12 | Validation |
| 13 | Reconstruction |
| 14 | Livraison |
| 15 | « Créer mon accès au logiciel » : lien d'activation unique, mot de passe choisi dans le nouveau logiciel |
| 16 | Accès au logiciel depuis le compte |

Chaque étape est reliée aux moteurs existants. Le parcours entier est rejoué dans Chrome par `e2e-parcours` (72/72).

### 13 et 14. Tests exécutés et résultats réels
Voir le tableau en tête de rapport. Les scénarios A à I demandés :

| Scénario | Où | Résultat |
|---|---|---|
| A — création de compte, reconnexion, projets retrouvés (y compris après redémarrage simulé) | `client-account.test.ts`, acceptance | vert |
| B — isolation, y compris par appels directs | `isolation.test.ts` (+ inventaire), acceptance (25 appels croisés), revue | vert |
| C — identifiants chiffrés, jamais exposés | `credentials.test.ts` (bilan sur tous les mots de passe, toutes réponses, évènements, console, fichiers) | vert |
| D — expiration à 24 h, horloge contrôlée | `credentials.test.ts`, `sweeper.test.ts` (minuterie réelle) | vert |
| E — suppression anticipée, données métier intactes | `credentials.test.ts` (empreintes) | vert |
| F — mission compatible avec les contrats de Mouss | `analysis.test.ts` (schéma publié 1.1, doublure d'exécuteur) | vert |
| G — export réellement reçu migré avec le moteur existant | `client-journey.test.ts` (exports Relatio, vérification au centime) | vert |
| H — logiciel livré accessible depuis le compte | `app-access.route.test.ts`, `client-journey.test.ts`, e2e-parcours | vert |
| I — non-régression | toutes les suites ci-dessus | vert |

### 15. Ce qui dépend encore d'Alan ou de Mouss
- **Mouss** : rien côté exécuteur n'existe aujourd'hui sur le dépôt d'équipe. `h-explorer` n'a ni API vers le Studio ni file de missions. Il reste à :
  - écrire la boucle de l'exécuteur (signe de vie → prise → remise → rapports → fin) ;
  - remplir les identifiants **hors du modèle**, avec le coffre H Company (`fill_secret_at`) ou par CDP, jamais dans la consigne ;
  - lever l'interdiction de connexion de `mapper.py`, uniquement pour ces missions et en lecture seule ;
  - gérer la double authentification et déclarer les réseaux réellement joignables (le navigateur cloud n'atteint pas `127.0.0.1`) ;
  - purger ses fichiers locaux.

  Détail dans [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md).
- **Alan** :
  - utiliser le jeton `analyst` et `?project=` ;
  - **retirer le mot de passe de la consigne envoyée au modèle** dans `tools/h_run.py` ;
  - le script de test de la CI : corrigé par Alan (`33d2afe`), la CI est de nouveau verte sur `main` et sa garde anti-secrets tourne.

  Détail dans [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md).
- **Signalé sur le dépôt d'équipe, sans modification** : une capture commitée sur `main` montre un identifiant de connexion en clair.

### 16. Limitations de sécurité et de conformité
- **Textes juridiques** : ce sont des **documents de travail**, datés et versionnés, à faire valider par un juriste avant tout usage commercial. REBORN n'est présenté comme conforme à aucune réglementation (RGPD ou autre). Les consentements sont conservés après la suppression d'un compte, à faire valider aussi.
- **Écran de réacceptation** : il n'existe pas encore. Si une nouvelle version des textes est publiée, le serveur refuse les écritures du compte (403) tant qu'elle n'est pas acceptée, mais l'interface ne propose pas encore l'acceptation. Aujourd'hui, aucune version n'a changé.
- **E-mail** : pas de service d'e-mail. Ni vérification de l'adresse, ni réinitialisation en libre-service : elle passe par l'opérateur. L'inscription révèle qu'une adresse a déjà un compte.
- **Limitation des connexions** : sans proxy de confiance, un attaquant qui produit plus de 300 échecs par minute ralentit les connexions de tous, tant qu'il continue (60 s au plus après son arrêt).
- **CSP** : elle garde `'unsafe-inline'` pour les scripts, parce que Next en a besoin pour ses pages statiques.
- **Non testés** : https et mode réseau en conditions réelles, Firefox et Safari, lecteurs d'écran réels.
- **Effacement** : il ne garantit pas la disparition physique sur un disque à copie sur écriture (APFS, instantanés). **`platform/.keys` doit être exclu des sauvegardes**, ce qui n'est pas automatique (voir le README).
- **Données transmises à H Company** : avec l'agent de Mouss, des écrans, données et identifiants passent par H Company, dont la durée de conservation n'est pas documentée. C'est indiqué dans la politique de confidentialité.
- **Extraction en cours** : supprimer les identifiants n'interrompt pas une extraction déjà en cours.
- **CRM livré** :
  - ses comptes vivent dans sa base : une nouvelle mise en service fait perdre les comptes déjà activés (les invitations ouvertes sont réimportées) ;
  - l'accès de secours de l'équipe (`admin.json`) reste en clair sur le poste ; le client peut le désactiver.
- **Atelier de l'équipe** : les numéros d'investigation et de version des modèles restent des compteurs globaux, mais aucune donnée n'y figure.

---

# Partie 2 — Expérience produit premium

### A. Design
- **Direction** : l'identité « Reborn_ », un mot-symbole typographique (« Reborn » graissé, « _ » en mono couleur d'accent). **Aucun fichier de logo n'existe** dans les dépôts : aucun pictogramme n'a été inventé, et le composant `Wordmark` est prêt à recevoir le SVG officiel.
- **Univers** : un atelier de restauration. Des matériaux qui ont vécu (encre, craie, patine, ocre, rouille), remis à neuf. Sobre, précis, chaleureux.
- **Couleurs** :
  - fond blanc cassé, surfaces blanches utilisées avec parcimonie ;
  - texte et boutons principaux en anthracite `#16191d` ;
  - **une seule couleur d'accent, le vert-de-gris** (`#21736a`, et `#18604f` pour le texte), qui porte aussi les validations ;
  - avertissements en ocre, erreurs en rouille.
- **Contraste** : 89 couples texte/fond calculés, tous au moins à 4,5:1 (le plus faible, 4,77:1). Bordures de contrôle et anneau de focus au moins à 3:1.
- **Typographie** :
  - **Instrument Sans** pour l'interface, **IBM Plex Mono** pour les identifiants et le mot-symbole ;
  - le CRM livré garde IBM Plex Sans, une identité distincte ;
  - échelle de 12 à 36 px, aucun texte sous 12 px.
- **Composants** : un design system unique dans `platform/src/components/ds/`, avec les mêmes jetons, rayons, hauteurs, focus et états partout.
  - **Commandes** : Button (avec chargement et sans double envoi), IconButton, PasswordInput.
  - **Formulaires** : Field, Input, Select, Checkbox, RadioGroup, Textarea, SearchInput, FileUpload.
  - **États** : Badge, StatusBadge (texte + icône, jamais la couleur seule), Alert, Progress (réelle ou indéterminée avec message), Skeleton, EmptyState, ErrorState.
  - **Superpositions** : Tooltip, Dialog, ConfirmationDialog, Drawer (`<dialog>` natif : focus piégé, Échap, retour du focus), Menu, Toast (région annoncée).
  - **Navigation et données** : Tabs, Stepper, Breadcrumb, DataTable (tri accessible, vue empilée sur mobile), Pagination.
- **Unification** : les quatre kits par étape et l'ancien `ui.tsx` passent par ces jetons. Pas de Combobox : aucun écran n'en a besoin.
- **Principales améliorations d'usage** :
  - une barre latérale unique, contextuelle dans un projet (les 8 étapes et leur état réel) ;
  - une action principale par étape ;
  - un vocabulaire simple, le détail technique étant rangé dans « Avancé / Intégration technique » ;
  - des chiffres cohérents entre les pages (un seul décompte des contrôles) ;
  - aucune progression fictive, et des pourcentages jamais arrondis à 100 % (99,93 % reste 99,93 %).

### B. Pages

| Page | Statut |
|---|---|
| Accueil, conditions, confidentialité | Terminées et testées (navigateur, axe, 320 px) |
| Connexion, inscription, réinitialisation | Terminées et testées |
| Vue d'ensemble, mes projets, activité, paramètres | Terminées et testées |
| Nouvelle migration (assistant) | Terminée et testée |
| Les 8 étapes (Connexion → Livraison) | Terminées et testées (parcours complet dans Chrome) |
| CRM livré : connexion, activation, tableau de bord, listes, fiches, formulaires, éditeur de lignes, mot de passe, administration des accès | Terminés et testés |
| Écran de réacceptation d'une nouvelle version des textes | **Incomplet** (§ 16) |
| Atelier de l'équipe (`/atelier`, `/regles`…) | Déplacé et protégé, nouveaux jetons appliqués, **pas retravaillé** (outil interne) |

### C. Accessibilité
WCAG 2.2 AA visé. **Aucune conformité n'est revendiquée** : un audit automatisé n'en vaut pas une.
- **axe-core 4.14** : 27 pages et 12 états, à 1440 et 390 px, 76 analyses. **0 violation**, toutes gravités confondues.
- **Clavier**
  - 1 172 arrêts de tabulation sur 1 172 ont un focus visible, mesuré au pixel ;
  - aucun piège ; ordre logique ; lien « Aller au contenu ».
  - 24/24 scénarios :
    - Entrée et Espace ;
    - 8 fenêtres et tiroirs : focus piégé, Échap, retour du focus ;
    - 8 formulaires : erreurs reliées aux champs, focus sur la première erreur.
- **Mise en page** : zoom à 200 % sans contenu coupé ; aucun défilement horizontal à 320, 390, 768, 1024 et 1440 px ; mouvement réduit respecté ; cibles tactiles de 44 px sur mobile.
- **Corrigé en cours de route** :
  - 6 violations sérieuses à la première passe ;
  - des anneaux de focus invisibles ou coupés ;
  - des listes privées de leur sémantique ;
  - un débordement à 320 px sur les pages publiques.
- **Limites** : pas de lecteur d'écran réel (VoiceOver, NVDA), pas de Firefox ni de Safari, pas de mode contraste élevé.

### D. Régressions
- **Tests historiques** : tous conservés et verts. Les 49 vérifications d'origine de l'acceptation y sont toutes, sur 95.
- **Textes cliqués par les tests navigateur** : gardés, ou les tests ont été mis à jour avec eux.
- **Régressions trouvées puis corrigées pendant le travail** :
  - un faux « 100 % » ;
  - un séparateur de milliers invisible ;
  - des chiffres contradictoires entre Migration et Validation ;
  - le jeu de test qui livrait toujours « morel-crm », ce qui bloquait un second client ;
  - un rejeu de fin de mission qui effaçait des identifiants confiés à nouveau.
- **Scripts de test** : ceux qui visaient le Studio en service et le remettaient à zéro (`npm run e2e`, `e2e-migration`) tournent maintenant sur une pile isolée. Ils ne touchent plus jamais les données du Studio en service.

### E. Preuves visuelles
Captures réelles de Chrome, prises sur le code final, sur ordinateur et sur mobile (390 et 320 px). Galerie locale, non versionnée (`e2e-shots/` est ignoré par git) : **`e2e-shots/final/index.html`** sur le poste de Jerem, avec 56 captures :
- accueil, connexion, inscription, espace ;
- l'assistant ;
- les 8 étapes ;
- l'accès au logiciel livré et son activation ;
- le CRM livré : tableau de bord, devis calculé, facture protégée ;
- les versions mobiles.

Rapport d'accessibilité : `e2e-shots/a11y/a11y-report.md`, écrit par `npm run a11y` (non versionné lui aussi).

### F. Fichiers principaux et dépendances
- **Nouvelles dépendances (2, versions exactes)** : `better-auth@1.7.12` (production) et `axe-core@4.14.0` (développement uniquement). Aucune autre.
- **Comptes et accès** :
  - `platform/src/lib/auth/*`
  - `platform/src/lib/http.ts`
  - `platform/src/lib/visibility.ts`
  - `platform/src/lib/legal.ts`
  - `scripts/account.mjs`
- **Identifiants, réseau, missions** :
  - `platform/src/lib/migration/{credentials,egress,analysis,redact,erase,agent-writes}.ts`
  - `platform/src/instrumentation.ts`
- **Interface** :
  - `platform/src/components/ds/*` (design system)
  - `platform/src/components/AppShell.tsx` et `components/shell/*`
  - `platform/src/app/(site)`, `(auth)`, `(platform)`, `(platform)/(equipe)`
  - `platform/src/components/project/*` (8 étapes)
  - `platform/src/app/globals.css`
- **CRM livré** :
  - `platform/runtime/server.mjs` (invitations, activation, sessions revalidées, recherche)
  - `platform/runtime/public/*` (nouvelle interface, polices embarquées)
  - `platform/src/lib/migration/app-access.ts`
- **Tests** :
  - 21 nouveaux fichiers de test vitest, pour 27 au total (`auth`, `isolation`, `http-access`, `credentials`, `sweeper`, `analysis`, `egress`, `client-account`, `client-journey`, `hardening`, `review-server`, `mapping-fields`, `rows`, `proxy`, `app-access`, `app-access.route`, et des tests de composants)
  - `scripts/acceptance/stack.mjs` (pile isolée commune)
  - `scripts/a11y.mjs`
- **Contrats et clients** :
  - `contracts/` (dont `connection_mission` 1.1, `executor_heartbeat`, `mission_complete`, `project_create` 1.3)
  - `clients/reborn_client.py` (1.3)
  - `clients/examples/mouss_connexion.py`
- **Documentation** : README, ARCHITECTURE, DEMO, LIMITATIONS, INTEGRATION_MOUSS, INTEGRATION_ALAN.

### G. Limitations de l'expérience
- L'**agent d'exploration** n'étant pas connecté, la Découverte affiche « Exploration indisponible — agent non connecté. » : c'est vrai, mais l'écran reste pauvre tant que Mouss n'envoie rien.
- L'**atelier de l'équipe** n'a pas été retravaillé visuellement.
- **Pas de mode sombre.**
- Pas de logo officiel (le mot-symbole est typographique).
- Le CRM Morel déjà en service garde son ancienne interface tant que sa mise à jour n'est pas lancée (voir plus bas).

---

## Pour reprendre la main (une fois par poste)
Les commandes se lancent depuis la racine du Studio : le dossier REBORN sur le poste de Jerem, `studio/` dans le dépôt de l'équipe (détail dans le [README](README.md#comptes)).
1. `npm install --prefix platform` (une fois), `npm run start`, puis **créer un compte** sur http://127.0.0.1:3000/inscription.
2. Rôle équipe et projets créés avant les comptes :
   ```bash
   npm run account -- operator <e-mail>       # rôle équipe (atelier, maintenance)
   npm run account -- claim-unowned <e-mail>  # rattache les projets créés avant les comptes
   ```
   Sur le poste de Jerem, Morel et EPB ont été créés avant les comptes : ils n'appartiennent à personne et restent invisibles tant qu'ils ne sont pas rattachés. Rien n'a été supprimé.
3. Un logiciel livré avant la V1.1, comme le CRM Morel (http://127.0.0.1:5050), garde ses données et son ancienne interface. Pour passer à la nouvelle : Livraison du projet → Maintenance → « Mettre à jour le moteur ». Une sauvegarde est faite avant, et les données sont conservées.
4. Sécurité du poste :
   - fichiers de secrets locaux (`.env`, `.secrets/`) lisibles par leur seul propriétaire (`chmod 600 .env`) ;
   - exclure `platform/.keys` des sauvegardes (commande dans le README) ;
   - optionnel : supprimer les anciens dossiers temporaires de tests (`$TMPDIR/reborn-*`).
