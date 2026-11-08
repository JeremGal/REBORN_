# Limites connues (état réel)

Ce qui suit n'est **pas** fait, ou seulement en partie. Rien ici n'est présenté ailleurs comme terminé.

## Dépend d'Alan et de Mouss

| Sujet | État |
|---|---|
| Exploration par l'agent Computer Use (H Company) | **Aucun exécuteur réel n'est branché.** Le protocole est prêt et testé (file des missions, battement de cœur, prise atomique, jeton de remise à usage unique, rapports, fin de mission qui efface les identifiants) ; seule une **doublure étiquetée « jeu de test »** l'utilise (`clients/examples/mouss_connexion.py`, pile isolée uniquement : elle refuse le port 3000). Les demandes « Analyser mon logiciel » restent en file avec le message « Agent d'analyse non disponible pour le moment. », et la Découverte affiche « Exploration indisponible — agent non connecté. ». Voir [INTEGRATION_MOUSS.md](INTEGRATION_MOUSS.md) §9. |
| Compréhension métier (Alan) | Contrats `migration_mapping` et `business_model` prêts et validés automatiquement. Les modèles de Relatio et du CRM synthétique sont des **jeux de test écrits à la main** au format d'Alan, étiquetés comme tels. Le modèle de Relatio est rejoué sur l'historique : 1 772 devis identiques au centime sur 1 796, 24 écarts d'arrondi de 1 à 2 centimes (Relatio arrondit en virgule flottante), aucun écart réel. |
| Conversion des formats du dépôt d'équipe (`handoff.json`, YAML d'entités et de règles) | Non écrite : à faire avec Alan (voir [INTEGRATION_ALAN.md](INTEGRATION_ALAN.md)). |

**Signalé à l'équipe (code non modifié par le Studio) :**
- `tools/h_run.py` (Alan) place l'identifiant et le mot de passe de l'ancien logiciel **dans la consigne envoyée au modèle** (bloc `login = …`, l. 77-80 au commit `33d2afe`, repris dans chaque `instruction`) : contraire à `credential.handling` des missions ; à remplacer par le coffre H (`fill_secret_at`) ou une saisie par CDP.
- Une capture commitée sur `main` (`targets/erpnext/01-exploration/runs/run-20261107T193709-h-EXP_001/step_02.png`) montre un identifiant de connexion en clair et la longueur du mot de passe ; l'identifiant figure aussi dans `context.md`.
- Script de test de la CI : corrigé par Alan (`33d2afe`) ; la CI est de nouveau verte sur `main` et sa garde anti-secrets tourne.
- Les données qui passent par le navigateur hébergé et le coffre de H Company transitent chez H ; leur durée de conservation n'est pas documentée par H. À indiquer au propriétaire.

## Comptes et sécurité

- **Aucun service d'e-mail.** L'adresse donnée à l'inscription n'est pas vérifiée, et l'inscription révèle si une adresse a déjà un compte (« Un compte existe déjà avec cette adresse »). Pas de « Mot de passe oublié » en libre-service : la page de connexion indique qu'un administrateur REBORN peut transmettre un lien ; l'opérateur le génère avec `npm run account -- reset-link <email>` (usage unique, 1 h) et le transmet lui-même par un canal sûr.
- **Limitation des tentatives sans proxy de confiance.** Sans `REBORN_TRUST_PROXY=1`, l'adresse IP du client n'est pas connue (`x-forwarded-for` est usurpable) : il n'y a pas de limitation par adresse, seulement le verrouillage par compte et une limite **globale** partagée par tous. Un attaquant qui produit durablement plus d'échecs que cette limite ralentit la connexion de tous tant qu'il continue (`platform/src/lib/auth/limits.ts`). La limitation par adresse exige un proxy de confiance ; ce mode n'a pas été testé derrière un vrai proxy.
- **Verrouillage par un tiers.** Quelqu'un qui connaît une adresse peut bloquer ce compte 15 minutes avec 8 mauvais mots de passe : comportement voulu (risque accepté).
- **Clés sur la même machine.** La clé maîtresse (`platform/.data/vault.key`) et les clés par identifiant (`platform/.keys/`) sont sur le poste du Studio : protection contre une fuite de fichiers, pas contre un accès complet à la machine. Un coffre externe est à prévoir.
- **Sauvegardes.** `platform/.keys/` doit être **exclu des sauvegardes** (Time Machine, iCloud) : sinon une sauvegarde garde de quoi déchiffrer des identifiants effacés. Ce n'est pas automatique (voir le [README](README.md#secrets-et-sauvegardes)). Changer `REBORN_KEYS_DIR` rend inutilisables les identifiants déjà confiés : ils sont effacés.
- **Extraction en cours.** Si le client supprime ses identifiants pendant une extraction, celle-ci se termine avec ceux qu'elle a déjà en mémoire.
- **Identité de l'exécuteur.** L'en-tête `X-Reborn-Executor` est déclaré par l'exécuteur : il distingue plusieurs instances d'un même jeton, il ne les authentifie pas (la sécurité repose sur le jeton `explorer`).
- **Projet de repli de l'opérateur.** Les pages historiques de l'atelier utilisent un « projet courant » (`index.current`) ; s'il est rattaché à un client avec `assign`, l'opérateur peut encore y agir sans `?project=`.
- **Non testé** : mode réseau depuis un autre poste, cookies `Secure` en https dans un vrai navigateur, Studio derrière un proxy.
- **Nouvelle version des conditions ou de la politique.** Côté serveur, un compte qui n'a pas accepté la version en vigueur ne peut plus rien écrire (403 « Nouvelles conditions à accepter », code `consents_required`) ; `GET /api/me` donne `consents_required`, `POST /api/me/consents { termsVersion, privacyVersion }` enregistre la nouvelle acceptation (version affichée exigée). L'**écran** qui présente les textes et appelle cette route (redirection depuis l'espace connecté) relève de l'interface : il doit exister **avant** de publier une nouvelle version des textes, sinon les comptes concernés ne peuvent plus qu'accepter… par l'API.
- **Suppression sur demande.** Traitée par l'opérateur (`npm run account -- delete <email>` ou `delete-project <MIG_id>`, aperçu puis `--confirm`). L'effacement est logique (fichiers supprimés, lignes de la base écrasées) : comme pour les identifiants, des blocs peuvent subsister physiquement sur un disque à copie sur écriture, et les **sauvegardes** déjà faites du dossier de données ne sont pas touchées. Les consentements sont conservés comme preuve (choix à valider par un juriste).
- **En-têtes de sécurité.** La politique de sécurité du contenu (CSP) du Studio autorise les scripts en ligne (Next les utilise pour les pages statiques) : elle interdit l'affichage dans un cadre, les ressources tierces et le changement de base, mais n'empêche pas à elle seule l'exécution d'un script injecté. `Strict-Transport-Security` n'est posé que si `REBORN_PUBLIC_URL` est en https (réponses de l'API ; pages aussi si l'adresse est connue au build).
- **Textes juridiques.** Conditions d'utilisation et politique de confidentialité sont des **documents de travail à faire valider par un juriste** avant tout usage commercial ; l'adresse de contact pour les demandes de suppression (`REBORN_PRIVACY_CONTACT`) reste à définir. REBORN n'est certifié conforme à aucune réglementation (RGPD, normes comptables). Les mesures réellement en place : comptes et isolation par client, consentements versionnés, chiffrement et effacement des identifiants (24 h au plus), protection serveur de l'historique comptable, journal d'audit, sauvegardes avant chaque opération critique, retour arrière.

## Logiciel livré

- **Comptes, phase 1.** Les comptes vivent dans `data/app.db`. Une remise en service (« Régénérer et remettre en service ») ou un retour arrière **perd les comptes activés** ; les invitations encore ouvertes sont réimportées. Le propriétaire refait alors « Créer mon accès au logiciel ». `admin.json` (accès de secours de l'opérateur) reste en clair, en 0600.
- **Pas d'e-mail** : le lien d'activation est remis à la main ; « mot de passe oublié » = nouvelle invitation par un administrateur du logiciel.
- **Projet en pause** : créer un accès au logiciel livré reste possible (l'opération écrit dans le logiciel livré, pas dans le projet).
- **Génération** : le logiciel livré est **un runtime générique configuré par la spécification** (`app.json`), sans code spécifique au client. Ce qui ne s'exprime pas dans la spécification n'existe pas.
- **Workflows** : ceux décrits par l'analyse sont conservés et listés comme « non reconstruits » ; le runtime n'exécute pas encore de workflows (statuts avec transitions et actions).
- **Calcul par les règles** : documents à lignes (prix, remises, frais, taxes, totaux). Pas encore de traitements par lots, d'échéanciers ni de numérotations automatiques.
- **Sessions** en mémoire : après un redémarrage du logiciel livré, il faut se reconnecter ; les données et les comptes sont conservés.
- **Lancement** : un port par logiciel à partir de 5050, sur la machine locale (127.0.0.1). Aucun déploiement public.
- **Ancienne version** : un logiciel livré en spécification 1.0 ne bénéficie des règles qu'après « Mettre à jour le moteur » (opération de l'équipe, données conservées).
- **Retour à une version antérieure du modèle métier** : par l'API du logiciel livré (`POST /api/admin/rules/active`), sans écran. Publier une ancienne version ne l'active pas.

## Studio

- **Journal temps réel** : plafonné à 5 000 évènements pour tous les projets ensemble ; un projet très actif peut évincer le journal des autres.
- **Compteurs globaux** : identifiants `INV_` et numéros de version des modèles de l'atelier (aucune donnée n'y apparaît).
- **Pause d'un projet** : le serveur bloque les écritures ; la mission en file attend la reprise, le jeton en cours est révoqué, la remise et les rapports de l'exécuteur sont refusés (409).
- **Pages de l'équipe** : `/migration`, `/atelier` et les pages voisines gardent leur ancienne mise en page (restylées par les jetons du design system, pas réécrites).

## Migration

- **Reprise** : une migration interrompue n'est pas reprise là où elle s'est arrêtée ; elle est relancée entièrement. C'est sans risque : chaque exécution construit une base neuve dans une seule transaction et ne laisse aucune donnée partielle.
- **Volumes** : testés jusqu'à environ 21 000 enregistrements (Relatio). Pas de test de charge au-delà.
- **Formats** : CSV, XLSX, JSON, SQL et SQLite. Pas de connecteur direct de base de données distante, ni d'API propriétaire hors plan HTTP.

## Tests

- **Données** : les tests d'acceptation et de navigateur utilisent des données **synthétiques** (CRM SQLite généré, Relatio 2004), sans exploration réelle par H Company ; l'exécuteur y est une doublure étiquetée.
- **Navigateurs** : Chrome seulement (headless). Pas de Firefox ni Safari, pas de lecteur d'écran réel. L'accessibilité est mesurée automatiquement (axe-core, clavier, 320 px) : cela ne vaut pas conformité WCAG.
- **Portée** : l'absence d'erreur ne prouve pas l'absence de perte dans des cas absents des jeux de test.
- **Build et polices** : `next build` télécharge les polices du Studio chez Google Fonts (accès Internet nécessaire). Sur 8 builds d'une copie neuve, un a échoué (« next/font/google queries have exactly one entry », sur IBM Plex Sans), et l'échec restait ensuite dans le cache de Turbopack. Remède : supprimer le dossier de ce build (`platform/.next-test` pour les tests ; `platform/.next` seulement Studio arrêté), puis relancer. Solution durable : embarquer les trois polices (`next/font/local`).
