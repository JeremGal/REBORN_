# Rapport de rétro-ingénierie — www.cerclai.fr

> Généré par REBORN Explorer (agent H Company) le 2026-11-07T21:18:47+00:00. URL : https://www.cerclai.fr/
> 16 fonctionnalités analysées (16 réussies), durée totale 416 s. Les observations viennent de l'agent : les points marqués `likely`/`guess` et les questions ouvertes sont à vérifier par expérience avant reconstruction.

## 0. Cadre légal et normes applicables (recherche Linkup)

> ⚖️ Synthèse automatique de sources web (Linkup, recherche approfondie) générée le 2026-11-07 22:18. **Ce n'est pas un avis juridique** : à faire valider par un juriste / expert-comptable avant reconstruction. Ces normes décrivent ce que la loi exige ; elles ne valident jamais un comportement observé dans l'application (seule l'expérience fait foi).

- **Secteur identifié** : Conseil en systèmes et logiciels informatiques et services numériques aux entreprises, avec des offres de conseil et d’intégration en IA, développement web, CRM, automatisation et cybersécurité. Le code APE exact n’est pas établi par les informations fournies. (France)
- **Activités** : Conseil et accompagnement en intelligence artificielle ; Développement web et création de logiciels ou CRM ; Conception et intégration d’agents IA et de chatbots ; Automatisation de processus et intégration de systèmes ; Prestations de cybersécurité ; Formation aux technologies de l’IA ; Information et accompagnement à la recherche d’aides publiques à la numérisation ; Présentation de réalisations et collecte de demandes de consultation via le site ; Quiz sur les rémunérations des talents juniors en technologie
- **Données manipulées** : Coordonnées et demandes transmises via le formulaire de contact ; Identifiants de connexion des membres; les catégories exactes de données de compte ne sont pas précisées ; Réponses au quiz sur les rémunérations et données fournies pour afficher ses résultats; les champs exacts ne sont pas précisés ; Critères de recherche d’aides, notamment département, type et taille d’entreprise ; Données professionnelles et administratives potentiellement fournies lors d’une demande d’accompagnement aux subventions; les pièces et données effectivement recueillies ne sont pas précisées ; Données de navigation liées à l’utilisation du site, si elles sont collectées; les éléments fournis ne détaillent pas leur nature
- **Domaines étudiés** : 11 (11 avec résultat), en 389 s

**Domaines jugés non pertinents (non approfondis)** :

- Environnement et fin de vie — Les activités décrites sont principalement des prestations numériques et ne font pas état de fabrication, de vente ou de gestion de produits physiques en fin de vie.
- Stock, inventaire et traçabilité — Aucune activité de vente ou de gestion de stock de marchandises physiques n’est décrite.

### 0.1 Facturation, devis et TVA

Le domaine s’applique : l’entreprise facture des prestations professionnelles et son ERP peut préparer devis, factures et suivi de TVA. Les règles principales concernent les mentions et la numérotation des factures, la TVA, les obligations de facturation électronique et, selon les clients et le mode d’encaissement, les règles des logiciels de caisse. Le code APE, le régime de TVA, la taille de l’entreprise et la part d’activité B2C ne sont pas établis ; ces éléments conditionnent certaines obligations et échéances.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Facturation des prestations professionnelles et mentions des factures | Code de commerce, art. L. 441-9 ; CGI, art. 289 ; annexe II au CGI, art. 242 nonies A ; ordonnance n° 2019-359 du 24 avril 2019 | Facturer les prestations réalisées pour une activité professionnelle et délivrer la facture dès la réalisation de la prestation. ; Faire figurer notamment l’identité et l’adresse des parties, l’adresse de facturation si différente, les dates pertinentes, la désignation précise et le prix des prestations, ainsi que les réductions acquises. ; En B2B, mentionner le numéro du bon de commande s’il a été préalablement établi, la date d’échéance, les conditions d’escompte, le taux des pénalités de retard et l’indemnité forfaitaire de recouvrement de 40 €. ; Conserver un exemplaire des factures selon les durées applicables. Les sources fournies ne précisent pas ici la durée exacte de conservation. | Prévoir des champs pour les identités et adresses des parties, les adresses de facturation distinctes, les dates, la description et le prix des lignes, les réductions, les conditions de paiement, les pénalités, l’indemnité de 40 € et, le cas échéant, le numéro de commande. ; Permettre des modèles distincts selon le régime de TVA et la nature du client, sans présumer que toutes les ventes sont B2B. ; Archiver les factures émises et éviter leur suppression non tracée ; la durée exacte doit être déterminée à partir des règles de conservation applicables. | En vigueur en 2026 ; les sources fournies ne donnent pas une date d’entrée en vigueur unique pour l’ensemble de ces dispositions. | Selon les sources fournies, l’absence de mentions peut entraîner une amende fiscale de 15 € par mention manquante ou inexacte, plafonnée au quart du montant de la facture (CGI, art. 1737, II), et des sanctions administratives au titre de l’art. L. 441-9 du Code de commerce, avec des plafonds indiqués de 75 000 € pour une personne physique et 375 000 € pour une personne morale, susceptibles d’être doublés en cas de réitération dans les conditions citées. |
| Numérotation des factures et règles de correction | Annexe II au CGI, art. 242 nonies A, I, 7° ; CGI, art. 289 ; BOI-TVA-DECLA-30-20-20 | Attribuer à chaque facture un numéro unique fondé sur une séquence chronologique et continue ; des séries distinctes peuvent être utilisées selon les conditions applicables. ; Les sources fournies indiquent qu’une facture validée ne doit pas être supprimée ou modifiée sans trace et qu’une correction se traite par un avoir. | Générer automatiquement des numéros uniques selon une ou plusieurs séries paramétrées et empêcher les doublons ou la réutilisation des numéros. ; Conserver les factures validées et leur historique ; gérer les avoirs et lier ceux-ci aux factures concernées. ; Journaliser les opérations de correction, d’annulation et d’émission, sans présenter les modalités techniques détaillées comme une obligation textuelle distincte si elles ne sont pas établies. | En vigueur en 2026 ; aucune date d’entrée en vigueur distincte n’est précisée dans les informations fournies. | Les sources fournies mentionnent une amende fiscale de 15 € par omission, plafonnée au quart du montant de la facture, et un risque de contestation de la valeur probante de la comptabilité. Le fondement et l’application précise de chaque conséquence doivent être vérifiés selon le manquement. |
| TVA sur les prestations de services et mentions fiscales | CGI, art. 256, 269, 283, 286 ter et 289 ; annexe II au CGI, art. 242 nonies A ; directive 2006/112/CE | Déterminer le traitement TVA applicable à chaque opération et faire apparaître la taxe et les totaux par taux lorsque la TVA est due. ; Pour les prestations de services, tenir compte des règles d’exigibilité indiquées dans les sources : encaissements, ou débits si l’entreprise a opté pour ce régime. ; Lorsque le client est redevable de la taxe, faire figurer la mention « Autoliquidation » et les éléments d’identification TVA requis pour l’opération concernée. ; En cas de franchise en base, appliquer les mentions et règles propres à ce régime ; les sources fournies ne permettent pas de déterminer si l’entreprise en bénéficie. | Configurer les régimes et taux de TVA par type d’opération, client et territoire, avec ventilation des bases et montants de taxe. ; Prévoir les champs de numéros de TVA pertinents et les mentions d’exonération ou d’autoliquidation lorsque le régime applicable l’exige. ; Gérer la date d’exigibilité et le suivi des encaissements ou l’option pour les débits selon le régime effectivement choisi. ; Ne pas coder un taux unique comme règle universelle : les sources fournies ne permettent pas de conclure que toutes les opérations de l’entreprise relèvent du taux normal de 20 %. | En vigueur en 2026 ; l’application précise dépend du régime de l’entreprise et de la nature et du lieu des opérations. | Les sources fournies évoquent des rappels de TVA, des majorations ou intérêts et l’amende de 15 € par mention manquante, mais ne permettent pas de déterminer les sanctions exactes applicables sans connaître le manquement et les circonstances. |
| Facturation électronique B2B et transmission de données (e-reporting) | CGI, art. 289 bis, 290 et 290 A ; loi n° 2023-1322 du 29 décembre 2023, art. 91 ; décret n° 2022-1299 du 7 octobre 2022, modifié par le décret n° 2024-266 du 25 mars 2024 ; annexe II au CGI, art. 242 nonies A et 242 nonies E bis à E quater | À compter du 1er septembre 2026, toutes les entreprises concernées doivent pouvoir recevoir des factures électroniques ; les grandes entreprises et ETI doivent également émettre électroniquement à cette date. ; À compter du 1er septembre 2027, les PME et micro-entreprises doivent émettre électroniquement. La taille de l’entreprise n’est pas fournie, donc son échéance d’émission ne peut pas être définitivement déterminée. ; Pour les opérations concernées, transmettre les factures ou données via une plateforme prévue par le dispositif ; les opérations hors champ de l’e-invoicing peuvent relever de l’e-reporting. ; Les sources indiquent quatre mentions nouvelles pour les factures électroniques : SIREN du client, catégorie de l’opération, adresse de livraison ou d’exécution si distincte, et mention de l’option pour les débits lorsqu’elle s’applique. Leur calendrier varie selon la catégorie de l’entreprise et le type d’opération. | Être en mesure de recevoir les factures électroniques depuis le 1er septembre 2026 et de les traiter via la plateforme choisie par l’entreprise. ; Prévoir les champs nécessaires aux nouvelles mentions lorsque celles-ci s’appliquent, ainsi que la qualification des opérations et des clients pour distinguer e-invoicing et e-reporting. ; Prévoir l’export ou l’échange dans les formats et circuits acceptés par le dispositif et la connexion à la plateforme retenue ; les sources fournies ne suffisent pas à établir l’intégralité des spécifications techniques ou les obligations de journalisation détaillées. ; Conserver les factures et données conformément aux durées applicables ; celles-ci ne sont pas intégralement précisées dans les informations fournies. | Réception : 1er septembre 2026 pour toutes les entreprises concernées. Émission : 1er septembre 2026 pour les grandes entreprises et ETI ; 1er septembre 2027 pour les PME et micro-entreprises. La taille de l’entreprise n’est pas établie. | Les sources fournies ne précisent pas les sanctions applicables en 2026 à chaque défaut de réception, d’émission ou d’e-reporting. Elles ne permettent donc pas de donner un montant fiable pour cette norme. |
| Devis et information précontractuelle | Code de commerce, art. L. 441-1, III ; Code de la consommation, art. L. 111-1, L. 111-2, L. 221-5 et L. 224-25-5 | En B2B, lorsque le prix d’un service ne peut être déterminé à l’avance ou indiqué avec exactitude, communiquer sur demande la méthode de calcul du prix ou un devis suffisamment détaillé. ; Avant qu’un consommateur ne soit engagé, lui communiquer les informations précontractuelles applicables, notamment les caractéristiques et le prix du service et, selon le cas, les informations sur la rétractation. ; Pour un contrat de contenu ou service numérique avec un consommateur, fournir les informations particulières prévues par l’art. L. 224-25-5, notamment celles portant sur la durée, les prix et le service, dans la mesure où elles sont applicables. | Permettre la création de devis détaillés avec identité des parties, prestations, prix et conditions pertinentes. ; Pour les parcours B2C concernés, présenter les informations précontractuelles et recueillir et conserver les choix ou acceptations pertinents, notamment lorsque le régime de rétractation l’exige. ; Ne pas imposer comme universel un format de devis ou une mention de signature spécifique : les obligations dépendent du canal, du client et du contrat. | En vigueur en 2026 ; les sources fournies ne donnent pas de date d’entrée en vigueur unique pour l’ensemble des dispositions. | Les sources fournies citent, pour certains manquements d’information précontractuelle, une amende administrative pouvant atteindre 3 000 € pour une personne physique et 15 000 € pour une personne morale (Code de la consommation, art. L. 131-1). L’application dépend du manquement concerné. |
| Logiciels ou systèmes de caisse sécurisés | CGI, art. 286, I, 3° bis et II ; CGI, art. 1770 duodecies ; loi n° 2025-127 du 14 février 2025, art. 43 | Si l’entreprise entre dans le champ, utiliser un logiciel ou système satisfaisant aux conditions d’inaltérabilité, de sécurisation, de conservation et d’archivage, avec le justificatif de conformité requis. ; Les sources fournies décrivent une exclusion pour les opérations exclusivement B2B donnant lieu à facturation ; elles ne permettent pas de conclure que l’ERP envisagé est hors champ sans connaître ses fonctions et les encaissements effectivement traités. | Si l’ERP enregistre des règlements de particuliers au moyen d’une fonction de caisse, vérifier et documenter la conformité de la version utilisée aux exigences légales. ; Si l’ERP sert uniquement à gérer devis et factures et n’enregistre pas les règlements comme une caisse, l’applicabilité doit être évaluée à partir de l’usage réel et des règles officielles, plutôt que déduite du seul secteur d’activité. | L’obligation de caisse décrite s’applique depuis le 1er janvier 2018. La loi de finances pour 2025 mentionnée dans les sources modifie les modalités de justification de conformité ; la date précise d’application de cette modification n’est pas établie par les informations fournies. | Les sources fournies indiquent une amende de 7 500 € par logiciel ou système de caisse concerné, avec mise en demeure de régulariser sous 60 jours. |

Sources : [Qu’est-ce que l’annuaire de la facturation électronique ? / ](https://www.economie.gouv.fr/entreprises/quest-ce-que-lannuaire-de-la-facturation-electronique) · [Facturation électronique : les entreprises accompagnées tout](https://www.economie.gouv.fr/actualites/facturation-electronique-les-entreprises-accompagnees-tout-au-long-du-deploiement) · [Article L441-9 - Code de commerce - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414397) · [Les mentions obligatoires sur les factures](https://www.berton-associes.fr/blog/droit-des-affaires/les-mentions-obligatoires-sur-les-factures/) · [Mentions obligatoires facture : que faut-il écrire au bas d&](https://www.guide-entrepreneur.fr/mentions-obligatoires-facture-que-faut-il-ecrire-au-bas-dune-facture/) · [Mentions obligatoires facture : liste et sanctions 2026](https://www.swim.legal/blog/mentions-obligatoires-facture-liste-sanctions-reforme-2026) · [Article 242 nonies A du Code général des impôts, annexe II, ](https://lawplayer.com/fr/article/LEGITEXT000006069569/LEGIARTI000050811276) · [Article 242 nonies A - Code général des impôts, annexe II - ](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276)

### 0.2 Comptabilité, conservation et archivage

Toutes les normes ci‑dessus sont en vigueur en 2026 et s’appliquent à l’entreprise de conseil & services numériques ainsi qu’à son ERP. Elles imposent des champs obligatoires, des contrôles d’intégrité, des durées de conservation (6 ans fiscal / 10 ans comptable), des exports (FEC, factures électroniques, journaux d’encaissement), des exigences de traçabilité (PAF, horodatage, hash) et des certificats de conformité (NF 525, RGS, signature qualifiée). Le non‑respect entraîne des sanctions : amendes administratives (de 5 000 € à plus de 15 000 €), remise en cause du droit à déduction de TVA, voire responsabilité pénale du dirigeant.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
|  | Code de commerce – Articles L.123‑12 à L.123‑24 |  | Champs obligatoires : date opération, date d’enregistrement, libellé, compte général, sens débit/crédit, montant en euros. ; Contrôles : séquentiel sans blanc ni rature, équilibre débit = crédit, interdiction de modification d’une écriture validée (seul le contre‑passation est autorisé). ; Gestion des droits : profils séparés (saisie → validation → archivage). ; Export : journal d’audit des écritures exportable pour contrôle fiscal. ; date_entry_into_force ; Sanctions : rejet de la comptabilité (art. L.123‑23 C. com.), amende fiscale et risque de taxation d’office. ; applicable ; comment ; source |  |  |
|  | Plan Comptable Général – Règlement ANC n° 2014‑03 (mis à jour) |  | Mise en place du plan comptable (classe 1‑7), numérotation des comptes, rapprochement automatique avec les écritures du FEC. ; Contrôle de la conformité du format de pièce comptable (format PDF/A‑3, horodatage, empreinte SHA‑256). ; Journal‑type « Z » obligatoire à chaque clôture d’exercice. ; date_entry_into_force ; Sanctions : refus de l’acceptation du bilan par le tribunal, pénalité de 5 000 € (article 1729 D‑I CGI) en cas de non‑conformité au FEC. ; applicable ; source |  |  |
|  | Livre des procédures fiscales – Articles A. 47‑A‑1 et A. 47‑A‑2 (modifiés 29 juil. 2013, 2 août 2013) |  | Export automatique d’un fichier unique à plat (FEC) : 18 zones normalisées (JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise). ; Nom du fichier : <SIREN>FEC<AAAAMMJJ> ; encodage UTF‑8 ou ISO‑8859‑15, séparateur tabulation ou « / ». ; Blocage de toute modification de ValidDate après clôture. ; Utilisation du module TestComptaDemat pour valider la conformité avant transmission. ; date_entry_into_force ; Sanctions : amende forfaitaire 5 000 €, majoration de 10 % des droits dûs (art. 1729 D‑I CGI). ; applicable ; source |  |  |
|  | Code général des impôts – Articles 289‑V à 289‑VII (piste d’audit fiable) |  | Enregistrement tracé du lien facture ↔ devis ↔ bon de commande ↔ prestation ↔ paiement (ID unique, horodatage, immutabilité). ; Journal de contrôle PAF (veille de l’intégrité, archivage 10 ans). ; Obligation de conserver les pièces justificatives liées (PDF/A‑3, horodatage qualifié, empreinte SHA‑256). ; Interface d’audit permettant à l’administration d’interroger le journal sans altération. ; date_entry_into_force ; Sanctions : remise en cause du droit à déduction de la TVA, amende pouvant atteindre 50 % du montant de la facture (art. 1737 CGI). ; applicable ; source |  |  |
|  | Code civil – Article 1379 (réforme 10 févr. 2016) + Décret n° 2016‑1673 du 5 déc. 2016 |  | Archivage numérique en PDF/A‑3 avec méta‑données (date de numérisation, identité du scanner, empreinte numérique). ; Cachet serveur ou signature électronique qualifiée (RGS ≥ 1 étoile) obligatoire pour que la copie soit présumée fiable. ; Journal d’archivage immuable (non‑effaçable) pendant la durée de conservation légale (10 ans). ; Vérification périodique de l’intégrité (re‑calcul d’empreinte). ; date_entry_into_force ; Sanctions : perte de la force probante (rejet en justice), impossibilité de déduire la TVA, amende administrative. ; applicable ; source |  |  |
|  | Article 286 I‑3° bis du CGI (modifié loi de finances 2015‑2016, art. 88) – Logiciels de caisse/encaissement inaltérables |  | Chaînage cryptographique des enregistrements d’encaissement (hash‑in‑hash). ; Journal Z quotidien, verrouillé, certifié NF 525 (ou équivalent). ; Export obligatoire du journal d’encaissement au format conforme aux spécifications de l’administration (CSV, UTF‑8, horodatage). ; Gestion des certificats d’attestation (renouvellement annuel). ; date_entry_into_force ; Sanctions : amende 7 500 € par logiciel non certifié, 60 jours de mise en conformité sous peine de nouvelle amende (art. 1770 duodécies CGI). ; applicable ; source |  |  |
|  | Code de commerce – Article L.123‑22 (décret n° 2000‑912, 21 sept. 2000) – Durées de conservation |  | Blocage de la fonction de purge avant 10 ans pour les livres comptables, pièces justificatives et documents annexes. ; Gestion d’un archivage à froid (WORM ou coffre‑fort numérique) avec droits d’accès réservés aux administrateurs uniquement. ; Mise en place de sauvegardes hors‑site conservées 10 ans, avec journal de restauration. ; date_entry_into_force ; Sanctions : requalification de la comptabilité en irrégulière, amende fiscale, responsabilité pénale du dirigeant. ; applicable ; source |  |  |
|  | Ordonnance n° 2021‑1190 du 15 sept. 2021 + Loi de finances 2024 (art. 91) + Loi de finances 2026 (art. 123) – Facturation électronique (e‑invoicing) et e‑reporting |  | Capacité de réception via Plateforme Agréée (PA) : API REST / SOAP conforme au protocole NF Z 12‑012 (EN 16931). ; Émission obligatoire pour les Grandes Entreprises/ETI dès le 1 sept. 2026 ; pour les PME/TPE 1 sept. 2027 : génération de factures structurées Factur‑X/UBL/CII avec les 24 mentions légales (SIREN, TVA‑intracom, adresse de livraison, nature de la prestation, option de TVA débit, etc.). ; Transmission automatisée du e‑reporting (déclarations de facturation, de paiement, de TVA) aux services fiscaux via l’API « e‑reporting » (format JSON, SSL/TLS, authent. certificat). ; Gestion des rejets PA (notification, relance, archivage de la copie non acceptée). ; date_entry_into_force ; Sanctions : 50 € par facture non émise au format structuré (plaf. 15 000 € / an) ; 500 € par transmission e‑reporting manquante (plaf. 15 000 € / an) ; 1 000 € pour absence de plateforme agréée après mise en demeure (art. 1737 CGI, art. 1788 D CGI). ; applicable ; source |  |  |
|  | Arrêté du 22 mars 2017 – Article A. 102 B‑2 du LPF (numérisation et archivage des factures papier) |  | Numérisation en format PDF ou PDF/A‑3 (ISO 19005‑3) avec empreinte digitale et horodatage qualifié. ; Interdiction de toute modification de l’image (aucun retouche, aucun recadrage). ; Journal d’importation automatisé (date, opérateur, hash). ; Conservation pendant 6 ans (minimum fiscal) – l’ERP doit suivre la règle 6 ans + 10 ans pour les pièces comptables. ; date_entry_into_force ; Sanctions : perte de la valeur probante, refus de la déduction TVA, amende fiscale de 5 000 € (art. 1729 D‑I CGI). ; applicable ; source |  |  |
|  | Décret n° 2024‑714 du 5 juil. 2024 – Modalités techniques de la facturation électronique |  | Support des formats Factur‑X, UBL, CII ; validation par le validateur officiel TestFacture.x (API). ; Archivage obligatoire des factures électroniques pendant 10 ans (PDF/A‑3 + métadonnées). ; Journal des échanges (envoi, accusé de réception, rejet) immuable pour audit. ; date_entry_into_force ; Sanctions : même que la loi de finances 2026 (50 €/facture, 500 €/e‑reporting, plafond 15 000 €). ; applicable ; source |  |  |
|  | Article 86‑1 du Code de la consommation – Conservation des documents commerciaux (décret 2024‑219) |  | Application du délai de conservation de 10 ans aux contrats de prestation de services, aux bons de commande et aux devis liés aux factures. ; L’ERP doit implémenter un mécanisme de rétention légal (archivage à froid, verrouillage de suppression). ; date_entry_into_force ; Sanctions : amende administrative (jusqu’à 75 000 € selon la gravité) et mise en demeure de mise en conformité. ; applicable ; source |  |  |
|  | RGPD – Règlement (UE) 2016/679 (applicable en France) – Traitement des données personnelles |  | Gestion du consentement pour les données de contacts (formulaires web). ; Droits d’accès, de rectification, d’effacement et de portabilité à implémenter dans le CRM/ERP. ; Journal des traitements (registre des activités) à tenir, conservation 3 ans minimum. ; Sécurisation (chiffrement des bases, mesures de confidentialité, DPO). ; date_entry_into_force ; Sanctions : amende jusqu’à 20 M € ou 4 % du chiffre d’affaires mondial (CNIL). ; applicable ; source |  |  |

Sources : [Arrêté du 29 juillet 2013 portant modification des dispositi](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000027788276) · [Section 2 : De la comptabilité des commerçants (Articles L12](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000005634379/LEGISCTA000006161250/2021-07-05/) · [TVA - Régimes d&#039;imposition et obligations déclaratives ](https://bofip.impots.gouv.fr/bofip/8865-PGP.html/identifiant=BOI-TVA-DECLA-30-20-30-20-20180207) · [Preuve numérique fiable : le papier peut disparaître - Group](https://groupeca2.fr/preuve-numerique-fiable/) · [Article 286 - Code général des impôts - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051764897) · [Facturation électronique obligatoire 1er septembre 2026 : gu](https://et-editalent.tech/blog/facturation-electronique-obligatoire-1er-septembre-2026-france-guide.html) · [Code de commerce - Article L123-22](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219327) · [Article L123-12 - Code de commerce - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219304)

### 0.3 Données personnelles (RGPD)

Le RGPD et la loi Informatique et Libertés s’appliquent aux traitements décrits, notamment aux formulaires, comptes membres, quiz et demandes d’accompagnement. Les informations disponibles ne permettent pas de confirmer les champs réellement collectés, les durées, les effectifs, ni les rôles exercés pour chaque prestation client : ces points doivent être documentés avant de fixer les règles de l’ERP. Les sources fournies ne suffisent pas à établir une liste exhaustive de toutes les normes et échéances applicables en 2026.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement général sur la protection des données (RGPD) | Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016, notamment articles 5, 6, 12 à 22, 24 à 28, 30, 32 à 34 et 83 | Définir et documenter, pour chaque traitement, une finalité et une base juridique ; limiter les données à celles nécessaires (articles 5 et 6). ; Fournir les informations requises et permettre l’exercice des droits prévus par les articles 12 à 22, sous réserve des conditions et exceptions applicables. ; Mettre en œuvre des mesures appropriées de protection des données dès la conception et par défaut (articles 24 et 25), ainsi que des mesures de sécurité adaptées aux risques (article 32). ; Tenir le registre prévu à l’article 30 lorsque l’obligation s’applique. L’exception pour certains organismes de moins de 250 salariés comporte des conditions et ne peut être présumée ici. ; Si l’entreprise agit comme sous-traitant, respecter les instructions documentées, conclure un contrat conforme à l’article 28 et tenir le registre des catégories d’activités de traitement applicable. ; Notifier à la CNIL une violation de données dans les conditions de l’article 33, notamment dans les 72 heures lorsque cela est requis, et informer les personnes si les conditions de l’article 34 sont remplies. | Pour chaque formulaire ou fonctionnalité, documenter les finalités, catégories de données, base juridique, destinataires et durées ; ne pas rendre obligatoire un champ sans nécessité établie. ; Présenter une information de confidentialité adaptée au point de collecte et prévoir des workflows pour les demandes d’accès, rectification, effacement, limitation, portabilité et opposition, selon le droit applicable. ; Permettre de rechercher les données rattachées à une personne et d’en produire une copie intelligible ; l’export doit être adapté au traitement, sans qu’un format JSON ou CSV précis soit imposé par les éléments fournis. ; Configurer des règles de revue, d’archivage ou d’effacement selon des durées définies et justifiées pour chaque traitement ; les sources fournies ne permettent pas de fixer une durée universelle. ; Prévoir une gestion des accès et des mesures de sécurité proportionnées aux risques, ainsi que des éléments de traçabilité utiles à la démonstration de conformité. Les éléments fournis n’établissent pas une obligation générale de journaliser chaque lecture et modification. ; Prévoir une procédure de gestion des violations et une coopération avec le responsable de traitement lorsqu’il s’agit d’un traitement sous-traité. | En vigueur depuis le 25 mai 2018. Aucune échéance future spécifique n’est établie par les sources fournies. | Selon l’article 83, les plafonds administratifs peuvent atteindre 10 000 000 € ou 2 % du chiffre d’affaires annuel mondial total pour certaines catégories de manquements, et 20 000 000 € ou 4 % pour les catégories les plus graves, selon le montant le plus élevé et les conditions prévues par le règlement. |
| Loi Informatique et Libertés | Loi n° 78-17 du 6 janvier 1978 relative à l’informatique, aux fichiers et aux libertés, modifiée ; notamment dispositions relatives aux pouvoirs de la CNIL et aux traitements relevant du RGPD | Respecter les dispositions nationales applicables en complément du RGPD et coopérer avec la CNIL dans l’exercice de ses pouvoirs de contrôle. ; Prendre en compte les règles nationales applicables aux droits des personnes, notamment les directives relatives aux données après le décès lorsque pertinentes. ; Ne pas présumer qu’un dispositif particulier de gestion post-mortem ou une règle RH précise est nécessaire sans vérifier les traitements effectivement mis en œuvre. | Documenter les procédures permettant de répondre aux demandes et contrôles de la CNIL et de mettre à disposition les informations pertinentes. ; N’ajouter un workflow post-mortem que si les traitements et demandes concernés le justifient ; les données fournies ne permettent pas d’en imposer un dans l’ERP. ; Définir les habilitations selon les besoins d’accès réels et documentés ; la loi ne prescrit pas ici une implémentation RBAC particulière. | Loi initiale du 6 janvier 1978, modifiée notamment pour l’adaptation au RGPD. Les sources fournies indiquent une entrée en application des modifications en 2019, mais ne permettent pas de détailler toutes les dates et dispositions consolidées. | La CNIL peut prononcer les mesures et sanctions prévues par la loi et le RGPD. Les sources fournies ne permettent pas de dresser un barème autonome exhaustif distinct des plafonds RGPD. |
| Code pénal — atteintes aux droits de la personne résultant des fichiers ou des traitements informatiques | Code pénal, articles 226-16 à 226-24, notamment articles 226-17, 226-17-1, 226-18, 226-20 et 226-22-2 | Éviter les comportements pénalement réprimés, notamment les traitements illicites ou déloyaux, les défauts de sécurité visés par les textes et les manquements de notification lorsqu’ils entrent dans le champ des infractions. ; Ne pas entraver les contrôles de la CNIL ni dissimuler ou altérer les renseignements et documents demandés. | Conserver les données et pièces pertinentes de manière à pouvoir répondre aux demandes légales de contrôle, avec des accès adaptés. ; Prévoir un processus interne de traitement des incidents ; les mesures techniques précises doivent être choisies selon l’analyse des risques et ne sont pas entièrement définies par les sources fournies. ; Ne pas considérer le chiffrement, la purge des sauvegardes ou une journalisation exhaustive comme des obligations uniformes établies pour tous les cas par les éléments fournis. | Dispositions en vigueur ; les sources fournies indiquent notamment le 1er juin 2019 pour certaines modifications. | Les sources fournies rapportent notamment, pour certaines infractions de cette section, jusqu’à cinq ans d’emprisonnement et 300 000 € d’amende pour une personne physique. Les peines varient selon l’infraction ; il faut consulter l’article concerné pour déterminer la sanction applicable. |
| Référentiels et recommandations de la CNIL | Guide de la sécurité des données personnelles de la CNIL ; délibération CNIL n° 2022-100 sur les mots de passe ; référentiel CNIL relatif aux traitements de gestion du personnel et de recrutement | Les guides et recommandations cités sont des référentiels de mise en œuvre et non, sur la base des sources fournies, des lois ou règlements autonomes applicables comme tels. ; Choisir et documenter des mesures de sécurité appropriées au risque, conformément notamment à l’article 32 du RGPD. | Évaluer les contrôles d’accès, l’authentification, la protection des identifiants et la journalisation en fonction des risques et des recommandations CNIL pertinentes. ; Ne pas imposer une durée uniforme de conservation des journaux, un mécanisme MFA, un algorithme de hachage précis ou une séparation particulière des données du quiz sans analyse des traitements et des recommandations applicables. ; Si des traitements RH sont effectivement réalisés dans l’ERP, vérifier leur conformité au référentiel CNIL correspondant. | Documents de référence évolutifs ; les sources fournies ne donnent pas une date d’entrée en vigueur réglementaire unique ni d’échéance future. | Aucune sanction autonome ne découle du seul non-respect d’un guide ; les pratiques peuvent toutefois être prises en compte pour apprécier le respect des obligations légales, notamment la sécurité prévue par le RGPD. |

Sources : [EXEMPLE DE REGISTRE Composition du document](https://www.cnil.fr/sites/default/files/atoms/files/registre_rgpd_basique.pdf) · [Le registre des activités de traitement / CNIL](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement) · [RGPD : les premières étapes / CNIL](https://www.cnil.fr/fr/passer-laction/rgpd-les-premieres-etapes) · [Règlement - 2016/679 - FR - rgdp - EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr) · [Chapitre III : Obligations incombant au responsable du trait](https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000886460/LEGISCTA000037805097/2026-04-15) · [Article 28 RGPD : Sous-traitant - Explication simple + exemp](https://monexpertrgpd.com/article-28/) · [Règlement (UE) n° 2018/1725 du Parlement européen et du Cons](https://www.wipo.int/wipolex/ar/legislation/details/20186) · [Le registre des activités de traitement - Observatoire de la](https://observatoire-compliance.univ-avignon.fr/2021/08/19/le-registre-des-activites-de-traitement/)

### 0.4 Réglementation produit du secteur

_Pertinence : conditionnelle (dépend de l'activité réelle de l'entreprise)_

Le domaine s’applique de façon ciblée : l’activité de développement et d’intégration peut faire de l’entreprise le fournisseur ou fabricant de certains produits logiciels, mais les seuls services de conseil, d’intégration, de formation et le site vitrine ne suffisent pas à établir que chaque régime produit s’applique à tous ses outils. Les informations fournies ne permettent pas de conclure que les logiciels sont commercialisés comme produits autonomes, que le quiz est un système d’IA à haut risque, ou que l’entreprise vend à des consommateurs. Les obligations dépendant de ces faits sont donc conditionnelles, et l’exhaustivité demandée ne peut être garantie à partir des sources fournies.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement sur l’intelligence artificielle (AI Act) | Règlement (UE) 2024/1689 du Parlement européen et du Conseil du 13 juin 2024, notamment articles 4, 5 et 50 ; modification et calendrier attribués au Règlement (UE) 2026/1744 dans les informations fournies | Depuis le 2 février 2025, prendre des mesures pour favoriser la maîtrise de l’IA du personnel concerné (article 4) et respecter les pratiques interdites visées à l’article 5. ; Depuis le 2 août 2026, respecter les obligations de transparence pertinentes de l’article 50, notamment informer les personnes qu’elles interagissent avec un système d’IA lorsque cette obligation s’applique. ; Les obligations de marquage technique des contenus générés et les échéances correspondantes sont décrites de façon divergente dans les sources fournies ; elles ne peuvent être précisées ici avec certitude. ; Des obligations renforcées peuvent concerner un système à haut risque, mais sa qualification dépend de sa finalité et de son contexte d’utilisation, non établis ici. | Pour les chatbots concernés, prévoir une information visible signalant l’interaction avec une IA. ; Prévoir une gestion documentaire permettant d’identifier les systèmes, leurs rôles (fournisseur/déployeur), leurs usages et leur catégorie de risque ; les sources ne permettent pas d’affirmer qu’un dossier technique ou un registre donné est obligatoire pour chaque outil. ; Ne pas imposer par défaut la conservation de tous les prompts et réponses ni un « kill switch » : les éléments fournis ne justifient pas ces exigences comme obligations générales applicables à cet ERP. ; Si un système à haut risque est identifié, déterminer séparément les exigences applicables au fournisseur ou au déployeur avant de configurer les contrôles et journaux. | Règlement entré en vigueur le 1er août 2024. Les articles 4 et 5 s’appliquent depuis le 2 février 2025 ; l’article 50 depuis le 2 août 2026 selon les informations fournies. Les dates ultérieures relatives aux systèmes à haut risque sont contradictoires dans les sources : 2 décembre 2027 ou dates antérieures selon les versions mentionnées. | Les sources fournies indiquent des plafonds de 35 000 000 € ou 7 % du chiffre d’affaires annuel mondial pour certaines violations de l’article 5, et de 15 000 000 € ou 3 % pour d’autres manquements. Les plafonds exacts applicables à chaque manquement ne sont pas établis par les seuls éléments disponibles. |
| Cyber Resilience Act (CRA) | Règlement (UE) 2024/2847 du Parlement européen et du Conseil du 23 octobre 2024, notamment articles 14 et 71 | À partir du 11 septembre 2026, les fabricants concernés doivent notifier les vulnérabilités activement exploitées et les incidents graves selon les délais prévus à l’article 14. ; À compter du 11 décembre 2027, les obligations principales du règlement s’appliquent aux produits couverts, notamment les exigences essentielles de cybersécurité, la documentation et l’évaluation de conformité. ; Pour les produits couverts, les obligations de fabricant peuvent inclure la gestion des vulnérabilités et, selon le cas, la déclaration UE de conformité et le marquage CE. | Tenir un inventaire des logiciels et versions afin de déterminer lesquels sont des produits mis à disposition sur le marché et qui en est le fabricant. ; Pour les produits relevant de l’article 14, prévoir un processus d’escalade et de notification permettant de respecter les délais de signalement. ; Pour les produits couverts à partir du 11 décembre 2027, prévoir la gestion des éléments de conformité, de la documentation technique et, selon la procédure applicable, de la déclaration et du marquage CE. ; Ne pas traiter une SBOM, une durée de support de cinq ans ou une exportation particulière comme champs obligatoires universels de l’ERP sur la seule base des informations disponibles. | Entré en vigueur le 10 décembre 2024. Le chapitre IV relatif aux organismes d’évaluation s’applique le 11 juin 2026 ; l’article 14 le 11 septembre 2026 ; les obligations principales s’appliquent le 11 décembre 2027, selon les sources fournies. | Les sources fournies indiquent, pour certains manquements, un plafond pouvant atteindre 15 000 000 € ou 2,5 % du chiffre d’affaires annuel mondial. Elles ne permettent pas de détailler sûrement les sanctions applicables à chaque type de manquement. |
| Code de la consommation — information précontractuelle sur les services numériques | Code de la consommation, articles L. 111-1 et L. 111-2 ; ordonnance n° 2021-1247 du 29 septembre 2021 | Avant la conclusion d’un contrat avec un consommateur, communiquer de manière lisible et compréhensible les informations précontractuelles requises. ; Pour les biens, contenus et services numériques concernés, informer notamment sur les fonctionnalités, la compatibilité, l’interopérabilité et les restrictions pertinentes. | Si des offres numériques sont vendues à des consommateurs, présenter avant contrat les informations pertinentes sur les fonctionnalités, compatibilité et interopérabilité. ; Les éléments fournis ne justifient pas une case d’acceptation, un archivage particulier de l’acceptation ou un export PDF comme obligations générales de réglementation produit. ; Aucun champ ERP obligatoire ne peut être déterminé sans connaître les offres et le parcours de vente effectivement proposés aux consommateurs. | L’ordonnance n° 2021-1247 est présentée dans les informations fournies comme en vigueur depuis le 1er janvier 2022. | Les informations fournies citent des amendes administratives, mais ne permettent pas d’établir avec suffisamment de précision les sanctions applicables à chaque manquement de ces articles. |

Sources : [AI Act : comprendre le règlement européen sur l&#39;IA, ses ](https://www.scafe.io/blog/ai-act/) · [Cyber Resilience Act: Obligations for Software &amp; SaaS 20](https://rickert.law/en/cyber-resilience-act-software-providers/) · [Mentions obligatoires d&#039;une facture : tout savoir / eco](https://www.economie.gouv.fr/entreprises/gerer-son-entreprise-au-quotidien/gerer-sa-comptabilite-et-ses-demarches/mentions-obligatoires-dune-facture-tout-savoir) · [Directive NIS 2](https://fr.wikipedia.org/wiki/Directive_NIS_2) · [Le Code de la consommation à l’ère du numérique – Clairmont ](https://www.clairmont-novus.law/publications/actualites/le-code-de-la-consommation-a-lere-du-numerique) · [AI Act : le règlement européen sur l&#x27;intelligence artif](https://www.victorisavocat.com/blog/ai-act-reglement-europeen-intelligence-artificielle-2026) · [AI Act entreprise obligations : l'état du droit / France IA](https://www.franceia.com/articles/ai-act-obligations-entreprises) · [Article 26 — Obligations des déployeurs de systèmes / Regula](https://www.regulation-ai.eu/fr/articles/article-26/)

### 0.5 Travail, sécurité et flotte de véhicules

_Pertinence : conditionnelle (dépend de l'activité réelle de l'entreprise)_

Le domaine s’applique au logiciel ERP uniquement si l’entreprise emploie des salariés et gère des interventions ou véhicules concernés. Les informations fournies ne confirment ni l’existence de salariés, ni une flotte, ni des interventions électriques : les obligations correspondantes sont donc conditionnelles, et l’ERP n’a pas à intégrer d’office tous les modules RH, habilitations ou flotte mentionnés dans le projet d’analyse. Les sources disponibles ne permettent pas d’établir une liste exhaustive de toutes les normes ni de valider plusieurs références et sanctions avancées dans le projet.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Décompte de la durée du travail | Code du travail, articles L. 3171-1 à L. 3171-4 et D. 3171-8 à D. 3171-16 ; CJUE, 14 mai 2019, C-55/18 ; Conseil d’État, 17 avril 2025, n° 492418. | Pour les salariés concernés, établir un décompte quotidien et une récapitulation hebdomadaire selon les modalités applicables. ; Tenir les documents nécessaires à la disposition des autorités de contrôle. | Si l’ERP gère ces données, permettre le relevé quotidien et le récapitulatif hebdomadaire adaptés au régime de travail. ; Prévoir un historique consultable et des exports des relevés ; les sources fournies ne justifient pas d’imposer un format PDF/CSV précis ni un journal dit « infalsifiable ». ; Ne pas appliquer automatiquement les limites horaires et contrôles identiques à tous les salariés : les régimes et dérogations applicables dépendent de leur situation. | Les références citées sont présentées comme en vigueur ; la décision du Conseil d’État date du 17 avril 2025. Les informations disponibles ne suffisent pas à préciser davantage les dates d’application de chaque disposition. | Les sources fournies mentionnent une contravention de 4e classe au titre de l’article R. 3124-3 du Code du travail, ainsi que des rappels de salaire possibles. Les montants et modalités exacts n’ont pas été vérifiés ici. |
| Forfait annuel en jours | Code du travail, articles L. 3121-58 à L. 3121-65, notamment L. 3121-60, L. 3121-64 et L. 3121-65. | Suivre les journées ou demi-journées travaillées selon le cadre applicable. ; Veiller régulièrement au caractère raisonnable de la charge de travail et au respect des repos ; organiser les mesures de suivi et entretiens requis par les dispositions applicables. | Si le module est utilisé, enregistrer jours et demi-journées travaillés et absences pertinentes, avec un moyen de signaler une charge excessive. ; Permettre une synthèse individuelle et le suivi prévu par l’accord applicable ; ne pas imposer de plafond conventionnel uniforme sans vérifier l’accord applicable. ; Les sources fournies ne suffisent pas à établir une durée de conservation légale générale de trois ans pour tous ces relevés. | Dispositions présentées comme en vigueur en 2026 ; aucune échéance future précise n’est établie par les informations disponibles. | Le forfait peut être privé d’effet ou remis en cause si les conditions légales ou conventionnelles ne sont pas respectées ; les conséquences financières exactes dépendent de la situation et ne sont pas précisées par les sources disponibles. |
| Passeport de prévention | Code du travail, article L. 4141-5 ; loi n° 2021-1018 du 2 août 2021 ; décrets n° 2022-1712 du 29 décembre 2022, n° 2025-748 du 1er août 2025 et n° 2026-496 du 12 juin 2026. | Pour les formations couvertes, effectuer les déclarations employeur selon le calendrier et les modalités applicables au passeport de prévention. ; Ne pas assimiler la formation générale aux technologies de l’IA à une formation SST sans éléments établissant qu’elle relève du périmètre légal. | Si l’ERP suit des formations SST déclarables, conserver les informations nécessaires à leur suivi et à leur déclaration, selon le portail officiel et les règles applicables. ; Limiter les données personnelles traitées à celles nécessaires ; les sources fournies ne justifient pas l’enregistrement systématique du NIR ni une conservation pérenne dans l’ERP. ; Les informations disponibles ne permettent pas de confirmer un format d’export particulier ni une sanction forfaitaire de 2 000 € par manquement. | Les éléments fournis indiquent l’ouverture de l’espace employeur le 16 mars 2026 et des dispositions transitoires pouvant courir jusqu’à la fin de 2026 ; les échéances précises sont à vérifier dans les textes cités. | Les sources fournies ne permettent pas de confirmer précisément les sanctions applicables en 2026 ; ne pas retenir comme certaine l’amende de 2 000 € avancée dans le projet. |
| Prévention du risque électrique et habilitation | Code du travail, articles R. 4544-9 à R. 4544-11 ; décret n° 2025-355 du 18 avril 2025 ; norme NF C 18-510 citée dans les sources. | Lorsque les opérations entrent dans le champ des textes, réserver celles-ci aux travailleurs habilités et satisfaire aux conditions de formation et de délivrance de l’habilitation prévues par les textes applicables. ; Évaluer les tâches réellement confiées avant de déterminer les habilitations nécessaires. | Si l’entreprise suit ces habilitations, permettre d’enregistrer le titre et sa portée, ainsi que les dates utiles, et d’alerter sur une échéance ou une habilitation manquante avant une mission concernée. ; Ne pas présumer qu’un recyclage à trois ans ou une visite médicale s’applique uniformément : vérifier les exigences correspondant aux opérations et au texte en vigueur. ; Les sources fournies ne fixent pas de durée de conservation générale des dossiers d’habilitation. | Les articles cités sont présentés comme en vigueur ; le décret indiqué est daté du 18 avril 2025. La portée exacte des changements et leurs dates d’application ne peuvent être confirmées à partir des seules informations fournies. | Les sources mentionnent des sanctions en cas de manquement aux règles de sécurité, sans établir les montants ni les dispositions pénales exactes applicables. |
| Désignation du conducteur en cas d’infraction routière constatée sans interception | Code de la route, article L. 121-6 ; ANTAI, démarches du représentant légal d’une personne morale. | Le représentant légal doit désigner le conducteur dans le délai prévu après réception de l’avis, lorsque les conditions légales sont réunies. ; L’ANTAI confirme l’obligation et son application aux personnes morales ; les informations fournies indiquent un délai de 45 jours. | Si l’entreprise dispose d’une flotte concernée, conserver une attribution datée des véhicules permettant de rechercher le conducteur au moment pertinent. ; Prévoir un suivi des avis, du délai de désignation et des éléments nécessaires à la démarche ; les sources ne confirment pas que toutes les données personnelles proposées dans le projet soient obligatoires à stocker dans l’ERP. ; Les sources disponibles ne déterminent pas une durée générale de conservation du registre d’affectation. | En vigueur depuis le 1er janvier 2017, selon les sources fournies. Aucune échéance future indiquée. | Les sources indiquent une contravention de 4e classe et un maximum de 3 750 € pour une personne morale. Les montants effectivement applicables dépendent de la procédure et doivent être vérifiés dans les textes officiels. |
| Géolocalisation de véhicules des salariés — protection des données et droit du travail | RGPD (règlement (UE) 2016/679), notamment articles 5, 6 et 83 ; Code du travail, articles L. 1121-1, L. 1222-4 et L. 2312-38 ; recommandations CNIL sur la géolocalisation des véhicules des salariés. | Définir une finalité et une base juridique, informer les salariés et limiter le dispositif à ce qui est nécessaire. ; Respecter les limites exposées par la CNIL, notamment sur le suivi hors temps de travail et l’usage de la géolocalisation pour contrôler le temps de travail. ; Tenir compte des obligations de consultation du CSE lorsqu’elles s’appliquent. | Si le traitement existe, prévoir une collecte limitée aux finalités établies, des accès contrôlés, une information des personnes et l’exercice de leurs droits. ; Configurer les périodes de collecte et les durées de conservation selon la finalité et la doctrine CNIL applicable ; les sources fournies ne permettent pas de poser une règle uniforme de deux mois, un an ou cinq ans dans tous les cas. ; Ne pas collecter de positions GPS dans l’ERP sans nécessité et fondement documentés. | RGPD applicable depuis le 25 mai 2018 ; les dispositions citées du Code du travail sont présentées comme en vigueur. Aucune échéance future particulière n’est établie. | L’article 83 du RGPD prévoit des plafonds de sanctions administratives ; le plafond applicable dépend notamment de la catégorie de manquement. La source fournie ne permet pas de chiffrer une sanction propre à cette entreprise. |
| Obligations de verdissement de flotte et taxe annuelle incitative | Code de l’environnement, article L. 224-10 ; Code des impositions sur les biens et services, articles L. 421-132-4 et suivants, tels que cités dans les sources. | Vérifier le seuil, le périmètre de véhicules et les règles fiscales en vigueur à partir des textes officiels avant de déterminer les obligations de déclaration ou de paiement. ; Les informations disponibles ne permettent pas de présenter de façon fiable les quotas, le seuil exact ou la taxe applicables en 2026. | Aucun module de calcul ou de déclaration ne peut être rendu obligatoire sur la base des informations fournies seules. ; Si le parc entre dans le champ après vérification officielle, prévoir les données véhicules et déclaratives exigées par le texte applicable. | Les sources évoquent un changement en 2025 et des objectifs futurs, mais se contredisent sur le régime de 2026. Les échéances exactes ne sont pas établies de manière suffisamment fiable. | Les sanctions ou montants fiscaux applicables ne peuvent pas être établis à partir des informations fournies. |

Sources : [Loi LOM 2026 : obligations de verdissement des flottes](https://dadycar.com/blog/loi-lom) · [Décompte des heures de travail : règles et sanctions](https://www.swim.legal/blog/decompte-des-heures-de-travail-definition-obligations-methodes-employeur) · [La réglementation / ANTAI.gouv.fr](https://www.antai.gouv.fr/professionnel/reglementation/) · [Habilitation Électrique Obligatoire : Loi, Niveaux et Sancti](https://habilitation-electrique-entreprise.fr/legislation-habilitation-electrique/) · [Contrôle du temps de travail par l’employeur : obligations e](https://esperoo.fr/blog/controle-temps-travail-employeur) · [Enregistrement automatique du temps — Dairia IA](https://www.dairia.ai/blog/enregistrement-automatique-du-temps-conformite-et-mise-en-place-2026-08-19) · [Décompte du temps de travail : obligations légales](https://www.compta-online.com/le-decompte-des-heures-de-travail-par-employeur-ao1356) · [Suivi du temps de travail obligatoire : ce que dit la loi](https://fr.trackingtime.co/logiciel-feuilles-de-temps/suivi-du-temps-de-travail-obligatoire.html)

### 0.6 Sécurité informatique et gestion des accès

Le RGPD s’applique aux données personnelles traitées par l’ERP et impose des mesures de sécurité adaptées aux risques, notamment pour les accès, les journaux et les violations. Les recommandations CNIL éclairent l’état de l’art mais ne fixent pas, à elles seules, des obligations techniques universelles. L’assujettissement à NIS 2 et aux règles d’accessibilité ne peut pas être établi avec les faits fournis : il dépend notamment de l’activité précise, de la taille, des services proposés et des clients.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement général sur la protection des données (RGPD) | Règlement (UE) 2016/679 du 27 avril 2016, notamment articles 5(1)(f), 25, 32, 33 et 34 ; loi n° 78-17 du 6 janvier 1978 modifiée relative à l’informatique, aux fichiers et aux libertés. | Mettre en œuvre des mesures techniques et organisationnelles appropriées au risque et réévaluer leur adéquation (art. 32). ; Limiter les accès aux personnes qui en ont besoin et protéger la confidentialité, l’intégrité et la disponibilité des données ; l’article 32 ne prescrit pas un modèle RBAC précis, un chiffrement systématique au repos ou un MFA universel. ; Concevoir les traitements selon les principes de protection des données dès la conception et par défaut (art. 25). ; Documenter et notifier à la CNIL les violations de données personnelles dans les conditions et délais de l’article 33, en principe dans les 72 heures après en avoir pris connaissance ; informer les personnes si le risque élevé prévu à l’article 34 est atteint. ; Fixer des durées de conservation adaptées aux finalités et limiter l’accès aux données et aux journaux conformément aux principes de finalité et de minimisation. | Prévoir une gestion des comptes et habilitations permettant de limiter les droits par fonction et de retirer rapidement les accès devenus inutiles ; le choix RBAC/ABAC relève de la conception, pas d’une prescription textuelle précise. ; Ne pas enregistrer les mots de passe ou autres secrets dans les journaux ; protéger les données d’authentification conformément au niveau de risque. ; Mettre en place des traces utiles à la sécurité et à l’investigation, avec accès limité, protection contre l’altération et durée de conservation justifiée ; aucun champ ou format de journal universel n’est imposé par les éléments fournis. ; Prévoir des procédures et moyens de détection, d’escalade et de documentation des violations permettant d’évaluer les notifications prévues aux articles 33 et 34. ; Documenter les règles de conservation et de suppression des données et des journaux. Le RGPD ne fixe pas ici une durée unique de conservation des logs. | Applicable depuis le 25 mai 2018. | Les manquements peuvent entraîner les sanctions administratives prévues à l’article 83 du RGPD, jusqu’à 20 millions d’euros ou 4 % du chiffre d’affaires annuel mondial total de l’exercice précédent, le montant le plus élevé étant retenu, selon la catégorie de manquement et les circonstances. |
| Recommandations CNIL sur les mots de passe et autres secrets partagés | Délibération CNIL n° 2022-100 du 21 juillet 2022 portant adoption d’une recommandation relative aux mots de passe et autres secrets partagés ; elle abroge la délibération n° 2017-012 du 19 janvier 2017. | La recommandation n’a pas, en elle-même, de caractère normatif : l’organisme peut adopter d’autres mesures s’il peut démontrer un niveau de sécurité au moins équivalent au regard de l’article 32 du RGPD. ; Éviter que les mots de passe ou identifiants non reconnus apparaissent dans les journaux d’authentification. | Stocker et traiter les secrets d’authentification conformément à la recommandation ou à une solution démontrant une sécurité équivalente. ; Ne pas journaliser les mots de passe, y compris ceux saisis lors d’une tentative échouée, ni les identifiants non reconnus. ; Choisir les contrôles d’authentification en fonction du risque ; la recommandation reconnaît notamment que des moyens comme le double facteur peuvent offrir davantage de sécurité que le seul mot de passe. | Délibération adoptée le 21 juillet 2022 ; la source fournie la décrit comme une recommandation et non comme une norme contraignante autonome. | Pas de sanction autonome identifiée dans les éléments fournis. Un niveau de sécurité insuffisant peut être apprécié au titre de l’article 32 du RGPD. |
| Recommandations CNIL relatives à la journalisation et à la sécurité des données personnelles | Recommandation CNIL relative aux mesures de journalisation ; Guide de la sécurité des données personnelles, édition 2023. Les références fournies ne donnent pas le numéro ni la date exacte de la recommandation de journalisation. | Appliquer des mesures de journalisation appropriées au risque et aux finalités de sécurité, dans le cadre de l’obligation générale de l’article 32 du RGPD. ; La CNIL recommande, dans les extraits fournis, une architecture de traçabilité des accès et actions et une conservation comprise entre six mois et un an ; cette fourchette est une recommandation, non une durée légale universelle démontrée ici. ; Limiter l’accès aux journaux et ne pas les réutiliser pour des finalités incompatibles. | Évaluer quels événements doivent être tracés, par exemple accès et actions pertinentes pour la sécurité, sans présumer qu’une liste exhaustive est légalement imposée. ; Protéger les journaux et séparer leur stockage du système principal lorsque cela est adapté ; la CNIL cite le puits de logs comme bonne pratique. ; Définir et documenter une durée de conservation proportionnée. La fourchette de six mois à un an est indiquée dans les sources comme une recommandation CNIL, et non comme une obligation générale applicable à tout ERP. ; Ne pas utiliser les traces de sécurité à des fins incompatibles, par exemple le contrôle du temps de travail, sans base et information appropriées. | Guide CNIL cité : édition 2023. La date exacte et le numéro de la recommandation de journalisation ne sont pas précisés dans les informations disponibles. | Pas de sanction autonome identifiée pour le non-respect d’un guide ou d’une recommandation ; les mesures de sécurité peuvent être examinées au regard du RGPD. |
| Directive NIS 2 – sécurité des réseaux et des systèmes d’information | Directive (UE) 2022/2555 du 14 décembre 2022, notamment articles 2, 3, 20, 21, 23 et annexes I et II. | Si l’entreprise entre dans le champ après qualification de son activité et de sa taille, elle doit appliquer les mesures de gestion des risques de l’article 21 et les obligations de gouvernance et de signalement prévues par le texte et sa transposition nationale. ; L’article 23 prévoit, pour les incidents significatifs relevant du texte, une alerte précoce au plus tard dans les 24 heures, une notification au plus tard dans les 72 heures et un rapport final selon le calendrier prévu par cet article. ; Les exigences contractuelles de clients assujettis peuvent être répercutées sur un prestataire, mais cela ne suffit pas à établir un assujettissement direct de celui-ci. | Si l’entreprise est qualifiée d’entité assujettie, aligner les contrôles d’accès, la gestion des incidents, la continuité et les journaux sur les mesures de gestion des risques applicables et les règles nationales de transposition. ; Prévoir un processus de qualification et de déclaration des incidents et la capacité d’exporter les informations requises par l’autorité compétente, si l’entreprise est assujettie. ; Les fonctionnalités précises à imposer au logiciel ne peuvent pas être déterminées sans connaître le statut NIS2, les textes nationaux applicables et les mesures retenues. | La directive est entrée en vigueur le 16 janvier 2023 et prévoyait une transposition nationale au plus tard le 17 octobre 2024. Les informations fournies ne permettent pas de confirmer l’état définitif, au 7 novembre 2026, de la transposition française ni ses dispositions applicables à cette entreprise ; il faut vérifier les textes français en vigueur et qualifier l’activité. | La directive prévoit des plafonds différents selon la catégorie d’entité et le manquement. Les montants précis cités dans les éléments fournis ne sont pas suffisamment établis par une source officielle dans le dossier ; les sanctions françaises applicables doivent être vérifiées dans la loi nationale de transposition. |
| Accessibilité numérique – régime de l’article 47 de la loi du 11 février 2005 et Acte européen sur l’accessibilité | Loi n° 2005-102 du 11 février 2005, article 47 ; directive (UE) 2019/882 du 17 avril 2019 ; textes français de transposition mentionnés dans les informations fournies : ordonnance n° 2023-859 du 6 septembre 2023 et décret n° 2023-931 du 9 octobre 2023. La version exacte des dispositions nationales consolidées applicables en 2026 n’est pas établie par les éléments fournis. | Le régime de l’article 47 dépend notamment de la catégorie de l’organisme et des seuils prévus par les dispositions applicables ; les informations fournies évoquent un seuil de 250 millions d’euros de chiffre d’affaires annuel moyen réalisé en France sur trois exercices pour certaines entreprises privées, mais ne permettent pas de vérifier toutes les conditions. ; L’Acte européen sur l’accessibilité concerne des catégories déterminées de produits et services, sous réserve notamment de l’exemption applicable aux microentreprises fournissant des services. Un site vitrine ou un ERP B2B ne suffit pas, à lui seul, à démontrer que l’entreprise est un fournisseur de service couvert. ; Si un service est assujetti, respecter les exigences d’accessibilité et les obligations de publication et d’information applicables au régime concerné. | Sur les faits fournis, aucune exigence légale précise de champs, rôles, conservation ou journalisation de l’ERP ne découle de ces textes. ; Si le site ou un logiciel livré devient un service couvert, examiner les exigences fonctionnelles d’accessibilité du service et les obligations de déclaration, de contact et de publication pertinentes. ; Une exigence d’accessibilité peut également résulter d’un contrat ou d’un marché public ; aucun contrat de ce type n’est établi dans les informations fournies. | L’article 47 de la loi de 2005 est en vigueur sous réserve de ses conditions de champ. La directive (UE) 2019/882 est applicable à partir du 28 juin 2025 pour les services concernés, selon les dispositions de transposition et mesures transitoires applicables. | Les sanctions varient selon le régime et le manquement. Les montants mentionnés dans les informations fournies proviennent principalement de sources secondaires et ne peuvent pas être confirmés ici comme applicables à cette entreprise. |

Sources : [La CNIL donne ses consignes pour renforcer la sécurité des g](https://cnil-d10.cnil.fr/fr/consignes-pour-renforcer-la-securite-des-grandes-bases-de-donnees) · [Obligations RGAA 2026 : concernés, publications, sanctions](https://sk-web.fr/article/rgaa-obligations-2026) · [NIS2 et loi Résilience : ce qui attend les agences web et pr](https://www.directmag.com/developpement-webmarketing-seo/info19903/nis2-loi-resilience-agences-web-prestataires-numeriques.html) · [Quelles mesures renforcées la CNIL prévoit-elle dans le cadr](https://www.haas-avocats.com/reglementation/cnil/quelles-mesures-renforcees-la-cnil-prevoit-elle-dans-le-cadre-du-rgpd/) · [CNIL - Mots de passe : mise à jour de l'état de l'art / Ster](https://steredenn.io/mots-de-passe-cnil) · [Khazad - La CNIL actualise son guide de la sécurité des donn](https://www.khazad.fr/blog/la-cnil-actualise-son-guide-de-la-securite-des-donnees-personnelles-pour-2023.html) · [www.cnil.fr LA SÉCURITÉ DES DONNÉES PERSONNELLES](https://www.cnil.fr/sites/default/files/attachment_501_517.pdf) · [NIS1 et NIS2 : les différences clés / CloudSoul](https://www.cloudsoul.net/fr/resources/blog/nis1-vs-nis2-key-differences/)

### 0.7 Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur 

Le domaine s’applique parce que l’entreprise propose du conseil, du développement et de l’intégration d’IA, mais les informations ne permettent pas de qualifier chaque solution ni le rôle de l’entreprise pour chaque système. Les règles de l’AI Act dépendent notamment de la fonction réelle du système, de son usage et du rôle de fournisseur ou de déployeur ; les données fournies ne démontrent pas qu’un système à haut risque est effectivement utilisé. Le RGPD s’applique aux traitements de données personnelles décrits, sans rendre automatiquement applicables des obligations IA spécifiques à haut risque.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement sur l’intelligence artificielle (AI Act) | Règlement (UE) 2024/1689 du Parlement européen et du Conseil du 13 juin 2024, notamment art. 2 à 6, 25, 50, 99, 111 et 113 ; règlement modificatif (UE) 2026/1744 du 8 juillet 2026, mentionné dans les informations fournies | Établir, système par système, si le logiciel relève de la définition d’un système d’IA et déterminer les rôles de l’entreprise ainsi que la catégorie de risque applicable. ; Depuis le 2 février 2025, prendre des mesures pour assurer un niveau suffisant de maîtrise de l’IA aux personnes qui travaillent avec des systèmes d’IA, en tenant compte de leurs fonctions, de leurs connaissances et du contexte d’utilisation (art. 4). ; Ne pas mettre en œuvre les pratiques interdites par l’art. 5, dans le champ et selon les conditions prévues par le texte. ; À compter de la date applicable, informer clairement les personnes physiques lorsqu’elles interagissent directement avec un système d’IA, sauf exception prévue par le règlement (art. 50(1)). Pour les systèmes qui génèrent des contenus synthétiques, appliquer les obligations de marquage prévues par l’art. 50 selon le rôle de fournisseur et les exceptions pertinentes. ; Si un système relève effectivement du haut risque, respecter les obligations correspondant au rôle concerné : exigences applicables au fournisseur, notamment gestion des risques, documentation et enregistrement des journaux ; et obligations du déployeur, notamment utilisation conforme aux instructions, supervision humaine et surveillance, selon les articles pertinents. ; Si l’entreprise fournit un modèle d’IA à usage général, vérifier les obligations applicables à ce rôle. Les informations fournies ne permettent pas de conclure qu’elle est fournisseur d’un tel modèle. | Tenir un inventaire des systèmes d’IA comprenant leur finalité, leurs versions, leurs fournisseurs, leurs usages, les rôles de l’entreprise et l’analyse de classification ; ce registre est une mesure de conformité utile, mais les informations fournies ne démontrent pas qu’un champ ERP déterminé est légalement obligatoire dans tous les cas. ; Pour un chatbot relevant de l’art. 50(1), afficher une information claire indiquant que la personne échange avec une IA. Ne pas imposer un bouton de transfert à un humain comme obligation générale de l’AI Act sur la seule base des faits fournis. ; Ne pas ajouter systématiquement un score de confiance, une journalisation intégrale des prompts, un format d’export réglementaire ou une conservation indéfinie : ces exigences ne sont pas établies comme obligations générales pour les usages décrits. Pour les systèmes à haut risque, mettre en œuvre les journaux et la documentation exigés par les dispositions applicables au système et au rôle. ; Si un système de haut risque est identifié, configurer les contrôles, journaux, documents et mécanismes de supervision correspondant à ses obligations exactes ; les données nécessaires et les durées de conservation doivent être déterminées selon le texte et le système concerné. ; Ne pas qualifier automatiquement le quiz salarial de système RH à haut risque : vérifier s’il sert réellement à recruter, sélectionner, évaluer ou prendre des décisions concernant des travailleurs. De même, la recherche d’aides n’établit pas à elle seule un système de décision sur l’octroi d’avantages publics. | Règlement entré en vigueur le 1er août 2024. Selon les éléments fournis, les chapitres I et II s’appliquent depuis le 2 février 2025, et les règles sur les modèles d’IA à usage général depuis le 2 août 2025. L’application générale et l’art. 50 sont indiqués comme applicables depuis le 2 août 2026. Les informations fournies rapportent une modification par le règlement (UE) 2026/1744 et des échéances ultérieures, notamment le 2 décembre 2027 pour certains systèmes à haut risque de l’annexe III ; la portée exacte de ces modifications et de leurs dispositions transitoires doit être vérifiée dans le texte officiel consolidé avant de fixer un calendrier de conformité. | L’art. 99 prévoit des amendes administratives pouvant atteindre, selon l’infraction, 35 millions d’euros ou 7 % du chiffre d’affaires annuel mondial, 15 millions d’euros ou 3 %, ou 7,5 millions d’euros ou 1 %. Les plafonds et leur application doivent être vérifiés au regard de la disposition violée, du statut de l’entreprise et du texte en vigueur. |
| Règlement général sur la protection des données (RGPD) | Règlement (UE) 2016/679 du 27 avril 2016, notamment art. 5, 6, 9, 12 à 22, 28, 30, 32, 35 et 83 | Définir les finalités et une base juridique appropriée, informer les personnes, limiter les données à ce qui est nécessaire et fixer des durées de conservation justifiées. ; Respecter les droits des personnes et, lorsque le traitement le permet, organiser leur exercice ; encadrer les sous-traitants conformément à l’art. 28. ; Mettre en place des mesures de sécurité adaptées. Réaliser une analyse d’impact lorsque les critères de l’art. 35 sont réunis ; l’usage de l’IA ne rend pas automatiquement une AIPD obligatoire. ; Respecter l’art. 22 lorsqu’une décision exclusivement automatisée produit des effets juridiques ou affecte une personne de manière significative, sous réserve des exceptions et garanties prévues par cet article. ; Traiter les catégories particulières de données seulement dans les conditions prévues par l’art. 9. Les champs exacts des formulaires et du quiz n’étant pas précisés, la présence de telles données ne peut pas être confirmée. | Prévoir des notices d’information adaptées aux formulaires, comptes, quiz, outils de recherche et dossiers d’accompagnement, en détaillant les traitements effectifs et leurs finalités. ; Mettre en place une gestion des demandes d’accès, rectification, effacement, opposition et limitation selon les droits applicables ; ne pas promettre un effacement d’un modèle ou de ses sorties sans vérifier la faisabilité et les obligations applicables. ; Configurer des durées de conservation par catégorie et des procédures de purge ; les durées précises ne sont pas établies par les informations fournies. ; Restreindre les accès aux données des membres et aux éventuels dossiers administratifs, et documenter les prestataires qui traitent les données. ; Ne pas imposer une case de consentement comme solution universelle : la base juridique doit être déterminée pour chaque finalité. | Applicable depuis le 25 mai 2018. | L’art. 83 prévoit, selon la violation, des amendes pouvant atteindre 20 millions d’euros ou 4 % du chiffre d’affaires annuel mondial total de l’exercice précédent, le montant le plus élevé étant retenu pour les catégories visées. |
| Normes ISO/IEC et normes harmonisées relatives à l’IA | ISO/IEC 42001:2023 ; travaux de normalisation CEN/CENELEC JTC 21 mentionnés dans les informations fournies | Aucune obligation légale générale de certification ISO/IEC 42001 n’est établie par les informations fournies. ; Vérifier, pour chaque système concerné, si une norme harmonisée a été publiée au Journal officiel de l’Union européenne et si elle couvre les exigences réglementaires pertinentes. | La tenue d’un inventaire des modèles, versions, fournisseurs et modifications peut soutenir la gouvernance, mais ne constitue pas, sur les seuls éléments disponibles, une exigence légale universelle de l’ERP. ; Ne pas présenter une certification ou une norme volontaire comme substitut à l’analyse des obligations applicables de l’AI Act. | ISO/IEC 42001:2023 est mentionnée comme publiée en 2023. Aucune date d’obligation légale ni échéance harmonisée précise applicable à cette entreprise n’est établie par les informations fournies. | Aucune sanction légale directe pour le seul fait de ne pas appliquer une norme volontaire n’est établie par les informations fournies. |
| Directive relative à la responsabilité du fait des produits défectueux | Directive (UE) 2024/2853 du Parlement européen et du Conseil du 23 octobre 2024 relative à la responsabilité du fait des produits défectueux | Aucune obligation de divulgation générale d’algorithmes ou de journalisation permanente spécifique à l’ERP n’est établie par les informations disponibles. ; Évaluer les règles de responsabilité applicables selon la place de l’entreprise dans la chaîne de fourniture, le produit ou logiciel concerné et la date de mise sur le marché. | Ne pas déduire de cette directive une obligation générale de conserver intégralement et indéfiniment toutes les décisions automatisées ; les éléments fournis ne fondent pas une telle exigence. ; La conservation de preuves et les mécanismes d’audit peuvent être examinés au regard des obligations contractuelles et du droit applicable au produit, sans durée déterminable à partir des informations fournies. | La date de transposition et d’application nationale applicable à l’entreprise n’est pas établie par les informations fournies ; la mention générale d’une mise en application progressive d’ici 2026 n’est pas suffisamment étayée pour fixer une échéance précise. | Les informations fournies ne précisent pas de sanctions spécifiques ; les conséquences éventuelles relèvent de la responsabilité civile selon le droit applicable. |

Sources : [Règlement (UE) 2024/1689 du Parlement européen et du Conseil](https://eur-lex.europa.eu/legal-content/FR/LSU/?uri=oj:L_202401689) · [Règlement - UE - 2024/1689 - EN - EUR-Lex - European Union](https://eur-lex.europa.eu/legal-content/FR/LSU/?uri=CELEX%3A32024R1689) · [Entry into application of the European AI Regulation: the fi](https://www.cnil.fr/en/entry-application-european-ai-regulation-first-questions-and-answers-cnil) · [Règlement - UE - 2024/1689 - FR - EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=fr) · [EU AI Act Article 4: AI Literacy Obligations for Deployers 2](https://agentliability.eu/articles/product-liability-directive-2024-ai-software-exposure) · [Article 50 — Obligations de transparence / Regulation AI](https://www.regulation-ai.eu/fr/articles/article-50/) · [Règlement européen sur l&#039;IA : les sanctions qui guetten](https://www.mondroitmeslibertes.fr/reglement-europeen-sur-lia-les-sanctions-qui-guettent-les-entreprises-en-2026/) · [EU AI Act Article 4: AI Literacy, Every Company Must Comply ](https://www.legalithm.com/en/ai-act-guide/article-4)

### 0.8 Règles propres à la formation professionnelle en France, si l’entreprise dispense effectiv

Le contexte indique que l’entreprise propose de la formation aux technologies de l’IA, mais ne précise pas si ces actions sont effectivement dispensées comme formation professionnelle au sens du Code du travail. Si c’est le cas, plusieurs obligations d’organisme de formation s’appliquent; Qualiopi et les règles CPF/EDOF dépendent, elles, des financements et dispositifs utilisés. L’ERP n’est pas en lui-même soumis à une certification spécifique : il doit surtout permettre de gérer et produire les informations et justificatifs nécessaires aux obligations effectivement applicables.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Déclaration d’activité du prestataire de formation | Code du travail, art. L. 6313-1, L. 6351-1 à L. 6351-8, L. 6352-12, R. 6351-1 à R. 6351-8 et R. 6351-13; sanctions : art. L. 6355-1 et L. 6355-16 | Déposer une déclaration d’activité auprès du préfet de région dans les trois mois suivant la conclusion de la première convention ou du premier contrat de formation professionnelle. ; Déclarer les modifications pertinentes et la cessation d’activité dans les délais prévus. ; Lorsque le numéro est enregistré, faire figurer la mention légale d’enregistrement sur les documents visés par l’article R. 6351-6-2; le numéro ne doit pas être présenté comme un agrément. ; Respecter les règles relatives à la publicité, notamment ne pas induire en erreur sur l’accès, le contenu, les sanctions ou le financement des formations. | Permettre d’enregistrer le statut de déclaration, le numéro, la date et l’autorité d’enregistrement, ainsi que les dates de dépôt et de modification. ; Si l’entreprise est déclarée, injecter la mention légale requise dans les documents concernés selon la situation et le texte applicable; ne pas imposer l’affichage du numéro avant son enregistrement. ; Conserver les conventions ou contrats de formation et les justificatifs utiles au suivi de la déclaration. ; Aucun champ ni traitement réglementaire spécifique n’est établi pour les données de contact, de compte, de quiz ou de navigation décrites dans le contexte. | Dispositions en vigueur en 2026. Le délai de déclaration est de trois mois après la première convention ou le premier contrat; la date d’entrée en vigueur historique détaillée n’est pas établie par les éléments fournis. | L’article L. 6355-1 prévoit une amende de 4 500 € pour l’exercice d’actions concernées sans déclaration. L’article L. 6355-16 prévoit un an d’emprisonnement et 4 500 € d’amende pour certaines publicités trompeuses relatives à la déclaration. Une interdiction temporaire ou définitive de diriger un organisme peut aussi être prononcée dans les conditions de l’article L. 6355-23. |
| Bilan pédagogique et financier (BPF) | Code du travail, art. L. 6352-11, L. 6351-6, L. 6355-15 et R. 6352-22 à R. 6352-24; Cerfa n° 10443*17 et téléservice Mon Activité Formation | Transmettre chaque année le document retraçant l’emploi des sommes reçues et le bilan pédagogique et financier de l’activité, selon l’échéance légale et les dates de campagne publiées par l’administration. ; Renseigner les données pédagogiques et financières demandées par le formulaire applicable; la campagne 2026 mentionnée dans les sources a accepté les dépôts jusqu’au 31 mai 2026, tandis que la date de la campagne suivante n’est pas établie. ; Présenter, sur demande des services compétents, les pièces comptables et la liste des prestations prévues par les textes. | Si l’activité de formation est exercée, structurer les données nécessaires au BPF : actions, bénéficiaires, heures, spécialités et recettes selon les rubriques du formulaire en vigueur. ; Prévoir des contrôles de cohérence et un export ou état de rapprochement vers le formulaire courant; ne pas figer des champs détaillés sur la seule base de descriptions commerciales non vérifiées. ; Conserver les données justificatives nécessaires au contrôle; la durée minimale précise de conservation n’est pas établie par les éléments fournis. | Obligation en vigueur en 2026. L’article R. 6352-23 fixe une échéance légale avant le 30 avril; une campagne administrative peut prévoir une date de dépôt ultérieure. Pour 2026, la campagne rapportée allait du 1er avril au 31 mai. | Le défaut de transmission peut rendre la déclaration d’activité caduque en application de l’article L. 6351-6 et est passible d’une amende de 4 500 € dans les conditions de l’article L. 6355-15. |
| Formalisation des conventions et contrats de formation | Code du travail, art. L. 6353-1 et D. 6353-1; pour une personne physique qui finance sa formation à titre individuel, art. L. 6353-3 à L. 6353-7; sanctions : art. L. 6355-18 et L. 6355-19 | Formaliser l’action selon le document et les mentions prescrits par les textes, en distinguant la convention applicable aux situations concernées du contrat de formation conclu avec une personne physique qui finance individuellement sa formation. ; Pour le contrat individuel autofinancé, respecter les mentions légales, le délai de rétractation de dix jours et les limites légales de versement applicables. ; Ne pas présumer que les mêmes clauses ou délais s’appliquent à tous les clients ou financements. | Permettre de sélectionner le type de relation contractuelle et de générer le modèle adapté, avec les mentions requises pour le cas concerné. ; Pour les contrats individuels autofinancés, suivre la date de signature et le délai de rétractation et appliquer les règles de paiement prévues par le Code du travail. ; Conserver les documents signés et les éléments permettant de retrouver la version conclue. Aucun délai uniforme de conservation n’est établi par les informations fournies. | Dispositions en vigueur en 2026; les sources fournies indiquent une réforme issue de l’ordonnance n° 2018-1128 et du décret n° 2018-1341 du 28 décembre 2018. | Les articles L. 6355-18 et L. 6355-19 prévoient une amende de 4 500 € pour les manquements qu’ils visent concernant le contrat avec une personne physique. D’autres conséquences contractuelles ou de financement peuvent dépendre du cas et ne sont pas suffisamment documentées ici. |
| Règlement intérieur applicable aux stagiaires et apprentis | Code du travail, art. L. 6352-3 à L. 6352-5, R. 6352-1 à R. 6352-15 et L. 6353-8; sanctions : art. L. 6355-8 et L. 6355-9 | Établir un règlement intérieur applicable aux stagiaires et apprentis, portant sur les matières prévues par le Code du travail, notamment santé et sécurité, discipline et représentation lorsque celle-ci est requise. ; Communiquer le règlement aux stagiaires dans les conditions prévues par les textes. ; Si l’organisme sollicite les financements visés par l’article L. 6316-1, inscrire également les exigences d’égalité de traitement, de liberté d’expression et de conscience et de neutralité prévues à l’article L. 6352-4. | Permettre de joindre ou transmettre la version applicable du règlement à la convocation ou au dossier de session et de conserver une preuve de transmission. ; Si une preuve électronique est utilisée, conserver sa date et son rattachement à la session ou au stagiaire; les éléments fournis ne démontrent pas qu’une case d’acceptation ou un blocage d’accès soient légalement obligatoires. ; Gérer les versions du document lorsque les règles ou modalités de formation changent. | Dispositions indiquées comme en vigueur; l’article L. 6352-3 est en vigueur depuis le 1er janvier 2019 selon la source fournie. | Les articles L. 6355-8 et L. 6355-9 prévoient une amende de 4 500 € pour les manquements qu’ils définissent. |
| Certification qualité Qualiopi / Référentiel national qualité | Code du travail, art. L. 6316-1 à L. 6316-5, R. 6316-1 à R. 6316-8; décret n° 2019-564 du 6 juin 2019; décret n° 2019-565 du 6 juin 2019; arrêté du 6 juin 2019 relatif aux modalités d’audit | Obtenir et maintenir la certification applicable aux catégories d’actions proposées lorsqu’un financement visé par l’article L. 6316-1 est sollicité. ; Se conformer au référentiel national qualité et aux règles d’audit applicables. ; La certification est délivrée pour une durée définie par les dispositions réglementaires citées; la source fournie indique trois ans. | Si la certification est recherchée ou détenue, permettre de documenter les informations et preuves liées aux prestations, à leur suivi et à leur évaluation conformément au référentiel applicable. ; Ne pas transformer des suggestions de logiciel (questionnaires, émargement numérique, journaux dits infalsifiables ou blocage d’attestations) en obligations légales générales : les sources fournies ne les établissent pas comme exigences techniques impératives. ; Gérer les éléments de preuve selon les procédures d’audit et les règles de conservation effectivement applicables; une durée uniforme n’est pas établie ici. | Obligation de certification applicable depuis le 1er janvier 2022 selon les sources fournies. Une source mentionne un décret n° 2026-728 du 1er août 2026 sur le RNQ, mais son contenu et son effet précis ne sont pas suffisamment documentés pour en déduire de nouvelles obligations ERP. | Le défaut de certification lorsque celle-ci est requise empêche l’accès aux financements concernés; le retrait ou la suspension de la certification peut résulter des procédures de certification. Les sanctions pécuniaires précises ne sont pas établies par les éléments fournis. |
| CPF, référencement EDOF et règles associées | Code du travail, art. L. 6323-6, L. 6323-9, L. 6323-9-1 et L. 6323-9-2; loi n° 2022-1587 du 19 décembre 2022; décret n° 2023-1350 du 28 décembre 2023; conditions de la plateforme Mon Compte Formation / EDOF | Pour proposer une offre CPF, satisfaire aux conditions légales de référencement et aux conditions applicables de la plateforme; l’éligibilité de l’offre dépend du dispositif et de la certification ou habilitation concernée. ; Respecter les obligations applicables aux dossiers, à l’exécution et à la justification du service fait, ainsi que les règles légales de sous-traitance CPF si l’entreprise est concernée. ; Les détails opérationnels issus des conditions de la plateforme peuvent évoluer; les sources fournies ne suffisent pas à établir de façon fiable tous les délais, plafonds, montants ou modalités applicables en 2026. ; Les sanctions relatives au démarchage CPF ne sont pas détaillées de manière suffisamment fiable dans les éléments fournis pour en donner ici le régime exact. | Seulement si l’entreprise utilise EDOF/CPF : prévoir le suivi des dossiers, des sessions, de l’assiduité et des justificatifs nécessaires à la déclaration et à la facturation, conformément aux spécifications officielles en vigueur. ; Ne pas implémenter comme règles certaines le délai de trois jours, un plafond de sous-traitance de 80 %, un montant de participation ou une durée de conservation sur la seule base des éléments fournis; ces points nécessitent vérification des textes et conditions officiels applicables au moment du déploiement. ; Le contexte ne décrit pas de données CPF effectivement collectées; il n’est donc pas possible de définir des champs obligatoires précis pour ce logiciel. | Les textes cités sont présentés comme en vigueur en 2026; le décret n° 2023-1350 du 28 décembre 2023 encadre la sous-traitance CPF, avec une entrée en vigueur au 1er avril 2024 rapportée dans les sources. Les échéances et paramètres opérationnels à venir ne sont pas établis. | Les sources évoquent le refus ou retrait de référencement et des conséquences sur les paiements en cas de manquement aux conditions EDOF. Le détail des sanctions et leur fondement exact doivent être vérifiés dans les textes et conditions officielles applicables; aucune sanction chiffrée complète n’est établie ici. |

Sources : [Organisme de formation déclaré : comment le vérifier](https://www.centre-agree-cse.fr/verifier-declaration-activite-organisme-formation-cse/) · [Démarches pour devenir prestataire de formation - Wuro](https://www.wuro.fr/blog/ressources-humaines/declaration-activite-formateurs-organismes-de-formation.html) · [NDA : obtenir son numéro de déclaration d&#39;activité](https://claudeagency.fr/blog/numero-declaration-activite/) · [Déclaration d’activité (NDA) d’un organisme de formation](https://mentivis.com/fr/referentiel/comment-declarer-son-activite-de-formation-professionnelle/) · [Démarche pour tous les organismes de formation / Via Compéte](https://www.via-competences.fr/formation/demarches-et-vie-de-mon-organisme-de-formation-cfaofa/obtenir-votre-numero-de-declaration-dactivite/demarche-pour-tous-les-organismes-de-formation) · [Titre V : Organismes de formation (Articles L6351-1 A à L635](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000006160828/) · [Code du travail - Article L6355-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037386187) · [Les sanctions financières et pénales pour les organismes de ](https://boit-action.fr/les-sanctions-encourues-par-les-organismes-de-formation/)

### 0.9 Conditions et règles des aides publiques présentées ou accompagnées

_Périmètre : Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif_

Ce domaine est pertinent parce que l’entreprise informe sur les aides à la numérisation et accompagne des demandes, mais les conditions d’éligibilité, justificatifs et règles de cumul dépendent de chaque dispositif. Les sources fournies ne permettent pas d’établir une liste exhaustive des régimes applicables ni de confirmer plusieurs prescriptions du brouillon ; les impacts ERP ci-dessous sont donc limités aux obligations étayées et aux fonctions utiles à leur mise en œuvre.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement de minimis général | Règlement (UE) 2023/2831 de la Commission du 13 décembre 2023, notamment articles 3, 6 et 7 | Le plafond général indiqué est de 300 000 € pour une entreprise unique sur trois ans. ; Les aides et entreprises liées à prendre en compte, ainsi que les exclusions et règles de cumul, doivent être appréciées selon le règlement et le dispositif concerné. ; Le règlement prévoit un registre central des aides de minimis au plus tard à compter du 1er janvier 2026 ; les informations fournies ne précisent pas les modalités opérationnelles du registre français ni une obligation de connexion à la charge de cet ERP. | Enregistrer, lorsque le dossier relève de ce régime, le régime d’aide, le bénéficiaire, l’aide déclarée ou octroyée, son montant, sa date et l’autorité concernée, ainsi que les informations nécessaires à l’examen de l’entreprise unique. ; Permettre le calcul ou la vérification du plafond à partir des informations fiables disponibles, avec signalement des données manquantes et possibilité de correction. ; Conserver la source et la date de mise à jour des critères affichés ; ne pas présenter le contrôle ERP comme une vérification officielle du registre sans intégration documentée. ; Aucun format d’export, journal technique ou durée de conservation particulière pour cet ERP n’est établi par les sources fournies. | Applicable du 1er janvier 2024 au 31 décembre 2030. Le registre central doit couvrir les aides à partir du 1er janvier 2026 au plus tard. | Aucune sanction précise applicable à l’entreprise ou à son ERP n’est établie par les sources fournies. Les conséquences dépendent notamment du dispositif et des règles d’aides d’État applicables. |
| Règlement général d’exemption par catégorie (RGEC) | Règlement (UE) n° 651/2014 de la Commission du 17 juin 2014, notamment article 8, dans sa version modifiée applicable au dispositif concerné | Respecter les conditions, plafonds d’intensité et règles de cumul correspondant à la catégorie d’aide et au régime concerné. ; Lorsque le régime l’exige, vérifier les conditions d’effet incitatif et de calendrier de la demande avant le commencement du projet. ; Les règles exactes sur les coûts éligibles et pièces justificatives sont propres au régime et au dispositif ; elles ne peuvent être uniformisées à partir des sources fournies. | Associer chaque fiche d’aide à son fondement juridique, à sa version, à ses critères, plafonds, dépenses éligibles, justificatifs et échéances propres. ; Collecter les dates de dépôt, de commencement du projet et les éléments de coûts ou de cofinancement uniquement lorsque le dispositif les requiert. ; Prévoir des alertes et contrôles paramétrables plutôt qu’un blocage général fondé sur une règle unique. ; Permettre un état récapitulatif des financements et dépenses lorsque le dispositif le demande ; aucune exigence générale de format d’export ou de piste d’audit ERP n’est établie ici. | Règlement en vigueur, sous réserve de ses modifications et de la version applicable à chaque régime. Aucune échéance particulière à venir n’est établie par les informations fournies. | Aucune sanction précise pour l’entreprise accompagnatrice ou son logiciel n’est établie par les sources fournies ; les conséquences relèvent du régime et de la décision d’octroi concernés. |
| Conventionnement et compte rendu financier des subventions attribuées à des personnes privées | Loi n° 2000-321 du 12 avril 2000, article 10 ; décret n° 2001-495 du 6 juin 2001, articles 1 et 2 | Lorsque la subvention annuelle dépasse 23 000 €, l’autorité attributrice conclut une convention avec le bénéficiaire privé, définissant l’objet, le montant et les conditions d’utilisation. ; Pour une subvention affectée à une dépense déterminée, le bénéficiaire produit un compte rendu financier attestant la conformité des dépenses à l’objet de la subvention, à déposer dans les six mois suivant la fin de l’exercice concerné. ; Le seuil de dépôt en préfecture indiqué par le décret est de 153 000 € de subventions annuelles, sous réserve des exceptions prévues par les textes. | Si l’ERP est utilisé par un bénéficiaire ou pour son compte, il peut enregistrer la convention, les échéances, les dépenses affectées et les justificatifs nécessaires au suivi. ; Prévoir un export de dépenses ou de compte rendu seulement selon les exigences de l’autorité et de la convention ; les sources ne prescrivent pas un format logiciel particulier. ; Les alertes d’échéance sont une mesure fonctionnelle utile, non une obligation technique expressément imposée à cet ERP. | Loi du 12 avril 2000 ; décret en vigueur depuis le 10 juin 2001. | Les sources fournies n’établissent pas de sanction générale spécifique applicable à l’éditeur ERP. Les conséquences du défaut de justificatifs ou du non-respect de la convention doivent être vérifiées dans le texte et la décision propres à chaque subvention. |
| Infractions pénales relatives à l’obtention frauduleuse d’aides | Code pénal, articles 313-1, 313-2 et 441-6 ; loi n° 2025-594 du 30 juin 2025 contre toutes les fraudes aux aides publiques | Ne pas établir ni transmettre sciemment de fausses déclarations ou pièces dans le but d’obtenir indûment une aide. ; Les contrôles, procédures de suspension et pénalités administratives doivent être appréciés selon les dispositions effectivement promulguées et le dispositif concerné. | Permettre de distinguer les informations déclarées par le client des informations vérifiées par le prestataire, et de tracer les versions des documents transmis, peut contribuer à une gestion fiable des dossiers. ; Les sources fournies ne justifient pas d’imposer comme champs obligatoires une attestation signée, des pièces d’identité, des attestations fiscales ou sociales, ni une interrogation obligatoire d’une API. ; Aucune obligation générale de verrouillage de factures ou de piste d’audit technique propre à cet ERP n’est établie par les sources fournies. | Les articles du Code pénal sont en vigueur. La loi n° 2025-594 est datée du 30 juin 2025 ; les éléments fournis ne permettent pas de préciser l’entrée en vigueur de chacune de ses dispositions. | Les sanctions pénales exactes dépendent de l’infraction et de sa qualification. Les chiffres avancés dans le brouillon ne peuvent pas être confirmés par les sources officielles fournies ; les montants et sanctions de la loi de 2025 ne sont pas suffisamment documentés ici. |

Sources : [Aides numériques 2026 — France Num / Mon Budget OPCO](https://mon-budget-opco.fr/aides-regionales/theme/numerique) · [Aides publiques numérique 2026 : subventions entreprise / MA](https://mesaidespubliques.infogreffe.fr/secteurs/aides-entreprises-numeriques/) · [Révision du cadre européen applicable aux aides de minimis](https://cms.law/fr/bel/legal-updates/revision-du-cadre-europeen-applicable-aux-aides-de-minimis) · [Aides publiques -Aides de minimis : seuils applicables et cr](https://entreprendre.service-public.gouv.fr/actualites/A17026) · [Article 10 — Tricoteuses](https://www.tricoteuses.fr/legifrance/articles/LEGIARTI000006529196) · [Chèque Numérique : Aides & Subventions / L’agence Snazzy](https://snazzy.fr/cheque-numerique/) · [Destination France : numérisation des entreprises pour le to](https://www.francenum.gouv.fr/guides-et-conseils/strategie-numerique/diagnostic-numerique/destination-france-numerisation-des) · [Aides de minimis : plafond, période de trois ans et cumul](https://audit-experts.fr/aides-de-minimis-plafond-periode-cumul/)

### 0.10 Obligations cyber applicables selon les services réellement fournis et le statut de l’entr

Le socle cyber certain pour l’entreprise et son ERP comprend la sécurité des traitements de données personnelles au titre du RGPD. Le Cyber Resilience Act (CRA) peut aussi concerner les logiciels mis sur le marché, selon leur forme de distribution; NIS 2 et DORA dépendent de critères d’activité, de taille, de désignation ou de clientèle qui ne sont pas établis ici. Le Code pénal réprime les atteintes aux systèmes, mais les éléments fournis ne permettent pas d’en déduire des obligations techniques précises pour l’ERP.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés | Règlement (UE) 2016/679 du 27 avril 2016, notamment articles 5, paragraphe 1, point f), 25, 28, 32, 33, 34 et 83; loi n° 78-17 du 6 janvier 1978 modifiée | Mettre en œuvre des mesures techniques et organisationnelles de sécurité adaptées aux risques, protéger confidentialité, intégrité, disponibilité et résilience des traitements, et évaluer régulièrement l’efficacité des mesures. ; Limiter les accès aux personnes autorisées et veiller à ce qu’elles ne traitent les données que sur instruction lorsqu’elles agissent sous l’autorité du responsable ou du sous-traitant. ; Si l’entreprise agit comme sous-traitant, respecter les obligations de l’article 28 et les instructions contractuelles du responsable du traitement. ; Documenter et notifier une violation de données à caractère personnel à l’autorité de contrôle dans les conditions de l’article 33, notamment dans les 72 heures lorsque cela est applicable; informer les personnes si les conditions de l’article 34 sont réunies. | Prévoir des comptes et habilitations adaptés aux rôles, le principe du moindre privilège et la révocation des accès devenus inutiles; les mesures exactes doivent être déterminées par l’analyse des risques. ; Protéger les données et les accès selon le risque. Les sources disponibles ne justifient pas d’imposer universellement une technologie précise telle que MFA, TLS d’une version déterminée ou chiffrement au repos pour tous les déploiements. ; Prévoir des journaux utiles à la sécurité et à l’investigation, protégés contre les accès ou modifications non autorisés; fixer leur contenu et leur durée selon la finalité et la proportionnalité. La durée de six mois citée dans les éléments disponibles est une recommandation, pas une durée légale universelle. ; Permettre de documenter les incidents et de retrouver les traitements et données concernés afin de traiter les notifications requises. ; Les catégories exactes de données et durées de conservation ne sont pas précisées dans le contexte: elles doivent être déterminées pour chaque traitement avant de définir les champs, contrôles et règles de purge. | RGPD applicable depuis le 25 mai 2018. Loi n° 78-17 du 6 janvier 1978 modifiée. | L’article 83 du RGPD prévoit, selon le manquement, des amendes administratives pouvant atteindre 20 000 000 € ou 4 % du chiffre d’affaires annuel mondial total de l’exercice précédent, le montant le plus élevé étant retenu. |
| Règlement sur la cyberrésilience (Cyber Resilience Act, CRA) | Règlement (UE) 2024/2847 du Parlement européen et du Conseil du 23 octobre 2024, notamment articles 14, 64 et 71 et annexe I | Pour les produits entrant dans le champ, les fabricants doivent satisfaire aux exigences essentielles de cybersécurité, traiter les vulnérabilités pendant la période de support applicable et respecter les obligations de documentation et de conformité prévues par le règlement. ; Depuis le 11 septembre 2026, les obligations de signalement de l’article 14 s’appliquent aux fabricants concernés pour les vulnérabilités activement exploitées et les incidents graves ayant une incidence sur la sécurité du produit. ; Les obligations de signalement comprennent des délais prévus par le règlement; les éléments fournis ici ne suffisent pas à détailler chaque délai ou procédure de notification. | Si le logiciel est un produit concerné et que l’entreprise en est fabricant, organiser un processus de suivi des vulnérabilités, de traitement des correctifs et de signalement, avec des éléments permettant d’identifier le produit, sa version et l’incident. ; Conserver la documentation technique et les éléments de conformité requis pour le produit concerné. ; Les sources indiquent une SBOM couvrant au moins les dépendances de premier niveau comme élément de documentation de gestion des vulnérabilités; vérifier les exigences exactes applicables au produit. ; Ne pas présumer que tout SaaS est exclu ou inclus: déterminer si le service fourni constitue un produit mis sur le marché au sens du règlement. | Entré en vigueur le 10 décembre 2024. Les obligations de signalement de l’article 14 s’appliquent depuis le 11 septembre 2026. La plupart des exigences du règlement s’appliquent à partir du 11 décembre 2027. | L’article 64 prévoit notamment des amendes pouvant atteindre 15 000 000 € ou 2,5 % du chiffre d’affaires annuel mondial pour certaines violations. Des mesures de restriction, retrait ou rappel peuvent également être prises. Le montant et la mesure dépendent du manquement. |
| Directive NIS 2 et règlement d’exécution (UE) 2024/2690 | Directive (UE) 2022/2555 du 14 décembre 2022, notamment articles 2, 3, 21, 23 et 41 et annexe I; règlement d’exécution (UE) 2024/2690 de la Commission du 17 octobre 2024 | Si l’entreprise relève effectivement du champ NIS 2, les obligations de gestion des risques cyber, de gouvernance et de notification d’incidents prévues par la directive et les mesures nationales de transposition peuvent s’appliquer. ; Le règlement d’exécution 2024/2690 vise les catégories de prestataires numériques qu’il énumère et précise des mesures techniques et méthodologiques; il ne s’applique à l’entreprise que si elle relève de l’une de ces catégories et du régime NIS 2. ; Des clients assujettis peuvent imposer des exigences de sécurité par contrat dans le cadre de leur gestion des risques de chaîne d’approvisionnement. Ces exigences contractuelles ne rendent pas automatiquement le fournisseur lui-même assujetti à NIS 2. | Aucun champ ou délai de conservation propre à NIS 2 ne peut être imposé à cet ERP sur les seules informations fournies. Si l’entreprise est dans le champ, définir les contrôles, journaux, procédures d’incident et preuves correspondant aux obligations effectivement applicables. ; Si des contrats clients le demandent, prévoir des capacités proportionnées de traçabilité des interventions, de signalement au client, de gestion des vulnérabilités et de restitution ou suppression des informations; les exigences précises dépendront des contrats et du statut du client. ; Vérifier le statut de l’entreprise au regard des critères de taille et de la qualification réelle de ses activités MSP/MSSP, ainsi que l’état de la transposition française avant de conclure à un assujettissement direct. | La directive est entrée en vigueur le 16 janvier 2023 et fixait au 17 octobre 2024 la date limite de transposition. Le règlement d’exécution (UE) 2024/2690 est entré en vigueur le 7 novembre 2024. Les informations disponibles indiquent un retard de transposition française, sans permettre de confirmer sa situation définitive au 7 novembre 2026. | Les sanctions et leur mise en œuvre à l’égard de l’entreprise ne peuvent être établies sans confirmer son assujettissement et le droit national applicable. Les éléments fournis ne permettent pas de retenir un montant de sanction déterminé pour cette société. |
| Règlement sur la résilience opérationnelle numérique du secteur financier (DORA) | Règlement (UE) 2022/2554 du Parlement européen et du Conseil du 14 décembre 2022, notamment articles 28 à 30 et 50 | Le règlement impose principalement des obligations aux entités financières. Celles-ci doivent gérer les risques liés aux prestataires TIC et encadrer leurs relations contractuelles conformément notamment aux articles 28 à 30. ; Un prestataire n’est directement soumis au cadre de surveillance des prestataires tiers critiques que s’il est désigné selon le régime applicable; aucune désignation de cette entreprise n’est établie. ; Les exigences précises qui seront demandées au fournisseur dépendent du service, de son importance pour le client et des stipulations contractuelles. | Aucune obligation DORA de champ, de journalisation ou d’export directement applicable à l’ERP ne peut être déduite des informations fournies. ; Si l’entreprise fournit un service TIC à une entité financière, le contrat peut prévoir des dispositions relatives à la sécurité, aux incidents, aux audits, à la sous-traitance et à la fin du contrat. Le logiciel peut alors devoir prendre en charge la traçabilité et la restitution des données convenues. ; Vérifier la nature des clients, le rôle du service dans leurs fonctions critiques ou importantes, le contrat et toute éventuelle désignation du prestataire. | Le règlement (UE) 2022/2554 est applicable depuis le 17 janvier 2025. | Le régime de sanctions de DORA vise les entités et personnes relevant de son champ ainsi que les prestataires tiers critiques dans les conditions prévues. Les éléments fournis ne permettent pas d’appliquer un montant de sanction à cette entreprise non désignée. |
| Code pénal — atteintes aux systèmes de traitement automatisé de données (STAD) | Code pénal, articles 323-1 à 323-7; notamment articles 323-1, 323-2 et 323-3 | Ne pas commettre les actes pénalement réprimés d’accès ou de maintien frauduleux, d’entrave au fonctionnement ou d’atteinte frauduleuse aux données. ; Les articles cités ne fixent pas, sur la base des éléments disponibles, une obligation générale de déployer un pare-feu, une fonction particulière de journalisation ou une durée de conservation des logs. | Aucun champ obligatoire, délai de conservation ou mécanisme particulier de l’ERP ne découle directement de ces dispositions selon les sources fournies. ; Des contrôles d’accès et des journaux peuvent être des mesures utiles de sécurité et de preuve, mais ne doivent pas être présentés comme des prescriptions techniques explicites des articles 323-1 à 323-7. | Dispositions en vigueur; la version citée de l’article 323-1 est en vigueur depuis le 26 janvier 2023. | Selon les infractions, les éléments fournis indiquent notamment jusqu’à 3 ans d’emprisonnement et 100 000 € d’amende pour l’accès ou le maintien frauduleux simple, et jusqu’à 5 ans et 150 000 € en cas d’altération ou de modification visée par l’article 323-1. Les aggravations dépendent des faits et du système concerné. |

Sources : [Cyber Resilience Act (CRA) : dates, délais, SBOM / SFEIR](https://www.sfeir.com/concepts/cyber-resilience-act/) · [NIS 2: obligations, entities in scope and French transpositi](https://www.nexthop.fr/en/understand/nis2) · [Article 32 RGPD : sécurité du traitement (MTO)](https://www.legiscope.com/blog/article-32-rgpd-securite-traitement.html) · [Chapitre III : Des atteintes aux systèmes de traitement auto](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070719/LEGISCTA000006149839/) · [Données personnelles sur internet : RGPD, CNIL et droits](https://www.swim.legal/blog/donnees-personnelles-sur-internet) · [Minute RGPD : Le nouveau guide sécurité de la CNIL](https://actecil-academy.eu/actualites-evenements/minute-rgpd-le-nouveau-guide-securite-de-la-cnil/) · [Sécurité des données RGPD : mesures techniques Art. 32](https://www.legiscope.com/blog/securite-donnees-rgpd-art-32.html) · [RGPD 2026 : sécurité des données et sanctions de la CNIL — g](https://ayinedjimi-consultants.fr/articles/rgpd-2026-securite-cnil)

### 0.11 Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables dévelop

Le domaine s’applique : l’entreprise crée ou intègre des logiciels et des contenus, et peut accorder des droits à ses clients ou utiliser des composants tiers. Les sources fournies établissent notamment des règles sur les logiciels d’auteurs salariés, la cession des droits et les exceptions logicielles ; elles ne permettent toutefois pas d’établir toutes les normes applicables, ni plusieurs affirmations de la réponse proposée concernant les stagiaires, les licences open source et l’IA. L’ERP n’a pas de champs techniques prescrits par ces textes : les contrôles ci-dessous sont des moyens pratiques de documenter la conformité, non des exigences explicites de format logiciel.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Code de la propriété intellectuelle — logiciels créés par des employés | CPI, art. L. 113-9 | Dans les conditions prévues par l’article, les droits patrimoniaux sur les logiciels et leur documentation sont dévolus à l’employeur, sauf dispositions statutaires ou stipulations contraires. ; L’article ne fixe pas les champs d’un ERP ni une obligation générale de journalisation ou de conservation de preuves. | À titre de traçabilité, enregistrer le contributeur, son statut et le projet ou livrable concerné ; conserver les contrats ou éléments utiles à l’établissement du cadre de création. ; Ne pas présenter cette traçabilité comme une formalité prescrite par l’article. | En vigueur ; le texte fourni indique une entrée en vigueur au 1er janvier 2020. | Aucune sanction spécifique n’est indiquée dans la source fournie. L’article prévoit que les contestations relèvent du tribunal judiciaire du siège social de l’employeur. |
| Code de la propriété intellectuelle — logiciels créés par des personnes accueillies dans le cadre d’une convention | CPI, art. L. 113-9-1 ; ordonnance n° 2021-1658 du 15 décembre 2021 | Si toutes les conditions de l’article sont réunies, les droits patrimoniaux sur les logiciels et leur documentation créés dans le cadre des missions ou instructions sont dévolus à la structure d’accueil, sauf stipulations contraires. ; La source fournie ne permet pas d’étendre cette règle à tous les stagiaires ou à toute entreprise accueillant un intervenant. | Si le régime est pertinent, documenter la convention, la contrepartie, l’autorité du responsable et les logiciels concernés, afin d’établir les conditions d’application. ; Aucun champ ERP ou délai de conservation spécifique n’est établi par les sources fournies. | En vigueur depuis le 17 décembre 2021, selon la source fournie. | Aucune sanction spécifique fournie ; l’article attribue les contestations au tribunal judiciaire du siège social de la structure d’accueil. |
| Code de la propriété intellectuelle — droits d’auteur et contrats de prestation | CPI, art. L. 111-1 | Ne pas traiter la seule commande ou livraison d’un ouvrage comme une cession automatique des droits d’auteur. ; Définir contractuellement les droits accordés ou cédés, sous réserve des règles applicables à la catégorie d’œuvre concernée. | Relier chaque livrable à son contrat et à ses conditions de licence ou de cession ; garder la version signée et ses avenants. ; Prévoir des champs de suivi des droits concédés et des usages autorisés comme mesures de gestion ; l’article ne prescrit pas ces champs. | Texte fourni en vigueur depuis le 27 décembre 2020. | Aucune sanction particulière n’est précisée dans la source fournie. |
| Code de la propriété intellectuelle — formalisme de cession des droits | CPI, art. L. 131-3 | Faire mention distincte de chacun des droits cédés dans l’acte. ; Délimiter le domaine d’exploitation quant à son étendue, sa destination, son lieu et sa durée. | Dans le dossier contractuel, identifier séparément les droits cédés et préciser leur périmètre, leur destination, leur territoire et leur durée. ; Alerter sur les champs incomplets avant émission ou signature d’un acte de cession, sans présenter un blocage ERP comme une obligation légale explicite. ; Archiver l’acte signé et les avenants ; aucun délai de conservation précis n’est indiqué par la source. | En vigueur depuis le 3 juillet 1992, selon la source fournie. | La source fournie ne précise pas de sanction chiffrée. Elle indique que la transmission est subordonnée au respect de ces conditions ; les effets d’une clause défectueuse doivent être appréciés au cas par cas. |
| Code de la propriété intellectuelle — rémunération de l’auteur lors d’une cession | CPI, art. L. 131-4, notamment 5° | Prévoir une rémunération appropriée et proportionnelle aux recettes, sauf cas légal où une rémunération forfaitaire est admise. ; La cession de droits portant sur un logiciel figure expressément parmi les cas permettant une évaluation forfaitaire. | Distinguer dans les documents commerciaux le prix de la prestation et la rémunération des droits si cela correspond à l’accord conclu ; conserver la justification contractuelle du mode de rémunération. ; Ne pas imposer une ventilation ou un champ ERP comme exigence légale générale : le texte fourni ne prescrit pas de format. | Texte fourni en vigueur depuis le 17 février 2024. | Aucune sanction spécifique n’est détaillée dans la source fournie. |
| Code de la propriété intellectuelle — droits exclusifs sur les logiciels et droit moral adapté | CPI, art. L. 122-6 et L. 121-7 ; directive 2009/24/CE | Le droit d’exploitation d’un logiciel comprend notamment les droits d’autoriser sa reproduction, son adaptation ou sa modification et sa mise sur le marché, sous réserve des exceptions légales. ; Sauf stipulation contraire plus favorable à l’auteur, l’auteur d’un logiciel ne peut s’opposer à certaines modifications par le cessionnaire et ne bénéficie pas du droit de repentir ou de retrait, selon l’article L. 121-7. | Associer à chaque logiciel ou version ses titulaires de droits et les autorisations contractuelles applicables à la reproduction, modification, distribution ou mise à disposition. ; Conserver les licences et versions livrées comme dispositif de preuve ; aucun registre ou format d’export précis n’est prescrit par les références fournies. | Articles du CPI fournis comme en vigueur ; les dates indiquées sont le 11 mai 1994. Directive 2009/24/CE : source fournie, sans date française particulière d’application. | La violation des droits d’auteur sur un logiciel peut constituer un délit de contrefaçon au titre de l’article L. 335-3 du CPI ; voir la norme correspondante. |
| Code de la propriété intellectuelle — exceptions relatives aux logiciels | CPI, art. L. 122-6-1 | Le texte prévoit notamment des exceptions portant sur les actes nécessaires à l’utilisation du logiciel conformément à sa destination, la copie de sauvegarde nécessaire, l’observation ou le test, et, sous conditions strictes, la décompilation indispensable à l’interopérabilité. ; Les informations obtenues par décompilation sont limitées aux usages définis par l’article ; les stipulations contraires aux exceptions mentionnées aux II, III et IV sont nulles et non avenues. | Pour les intégrations, documenter le fondement et le périmètre des opérations d’interopérabilité et vérifier les droits d’utilisation du logiciel concerné. ; Ne pas présenter un contrôle contractuel général ou un registre particulier comme exigé par l’article ; aucune durée de conservation ou fonction ERP obligatoire n’est précisée. | Article fourni comme en vigueur ; la source ne donne pas de date de début exploitable dans son extrait. | Aucune sanction spécifique n’est précisée dans la source fournie. Une utilisation qui excède les exceptions ou les autorisations peut relever de la contrefaçon selon les circonstances. |
| Code de la propriété intellectuelle — contrefaçon | CPI, art. L. 335-3 ; art. L. 335-2 et L. 335-8 pour les peines citées | Respecter les droits exclusifs et les licences applicables aux logiciels et autres œuvres. ; L’article L. 335-3 qualifie de délit de contrefaçon la violation des droits de l’auteur d’un logiciel définis à l’article L. 122-6. | Gérer les licences et autorisations des composants et livrables et conserver les preuves utiles de leur provenance et des droits accordés ; ces mesures sont pratiques, non des champs imposés par les articles cités. ; Prévoir un accès aux contrats, licences et versions livrées pour traiter les demandes ou litiges. | Articles fournis comme en vigueur ; L. 335-3 depuis le 14 juin 2009 et L. 335-2 depuis le 5 juin 2016. | La source fournie indique, pour la contrefaçon visée par L. 335-2, jusqu’à 3 ans d’emprisonnement et 300 000 € d’amende, portés à 7 ans et 750 000 € en bande organisée. Les personnes morales peuvent encourir les peines prévues par L. 335-8, dont l’amende selon le Code pénal, des interdictions et le retrait ou la destruction d’objets contrefaisants. Les sanctions exactes dépendent de l’infraction et de la décision judiciaire. |
| Règlement (UE) 2024/1689 sur l’intelligence artificielle — droit d’auteur applicable aux fournisseurs de modèles d’IA à usage général | Règlement (UE) 2024/1689, art. 53, paragraphe 1, point c) | Pour les fournisseurs concernés, l’article cité prévoit une politique de respect du droit d’auteur de l’Union et la publication d’un résumé suffisamment détaillé du contenu utilisé pour l’entraînement, conformément aux règles applicables. ; Les sources fournies ne permettent pas de confirmer les modalités détaillées, sanctions ou dates applicables au cas concret de cette entreprise. | Si l’entreprise est effectivement fournisseur d’un modèle d’IA à usage général, tenir les informations nécessaires à la politique et au résumé de contenus d’entraînement ; ne pas étendre cette exigence à de simples utilisateurs ou intégrateurs sans établir leur rôle juridique. ; Les sources fournies ne prescrivent pas les champs ERP, formats de journal ou durées de conservation décrits dans la réponse proposée. | Le règlement est indiqué comme entré en vigueur le 1er août 2024 et les obligations GPAI de l’article 53 comme applicables depuis le 2 août 2025. La source fournie signale une version consolidée au 27 juillet 2026 et une modification par le règlement (UE) 2026/1744 ; les échéances modifiées ne sont pas suffisamment détaillées dans les éléments disponibles. | La source fournie ne permet pas de confirmer le montant ou le plafond applicable à une éventuelle violation de l’article 53 ; ne pas reprendre les montants de la réponse proposée comme établis. |
| ISO/IEC 5230:2020 — OpenChain Specification | ISO/IEC 5230:2020 | Aucune obligation légale générale de conformité à cette norme, de produire une SBOM ou d’utiliser les formats SPDX ou CycloneDX n’est établie par les sources fournies. | Le suivi des composants, de leurs licences et des notices peut être une mesure utile de gestion, mais n’est pas présenté ici comme obligation légale démontrée. ; Les sources fournies ne justifient pas un blocage automatique de livraison fondé sur une catégorie générale de licence. | La réponse proposée indique une publication en 2020 ; aucune date d’entrée en vigueur ou échéance obligatoire n’est établie par les éléments disponibles. | Aucune sanction légale liée à la seule non-conformité à ISO/IEC 5230:2020 n’est établie par les sources fournies. Une violation d’une licence peut avoir des conséquences distinctes, mais elles dépendent de la licence et des faits. |

Sources : [Directive - 2009/24 - EN - EUR-Lex](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=celex:32009L0024) · [Code de la propriété intellectuelle - Article L113-9-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044502241) · [Règlement - UE - 2024/1689 - EN - EUR-Lex](https://eur-lex.europa.eu/legal-content/fr/ALL/?uri=CELEX%3A32024R1689) · [Code de la propriété intellectuelle - Article L113-9](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000039279818) · [Cour de cassation, civile, Chambre sociale, 3 mai 2018, 16-2](https://www.legifrance.gouv.fr/juri/id/JURITEXT000036883945/) · [Décret n° 2023-772 du 11 août 2023 relatif à l'intéressement](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047964885) · [Code de la propriété intellectuelle - Article L131-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006278958) · [Code de la propriété intellectuelle - Article L131-4](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049579339)

### 0.x Checklist de conformité pour la reconstruction

- [ ] **Facturation, devis et TVA** — Facturation des prestations professionnelles et mentions des factures : Prévoir des champs pour les identités et adresses des parties, les adresses de facturation distinctes, les dates, la description et le prix des lignes, les réductions, les conditions de paiement, les pénalités, l’indemnité de 40 € et, le cas échéant, le numéro de commande.
- [ ] **Facturation, devis et TVA** — Facturation des prestations professionnelles et mentions des factures : Permettre des modèles distincts selon le régime de TVA et la nature du client, sans présumer que toutes les ventes sont B2B.
- [ ] **Facturation, devis et TVA** — Facturation des prestations professionnelles et mentions des factures : Archiver les factures émises et éviter leur suppression non tracée ; la durée exacte doit être déterminée à partir des règles de conservation applicables.
- [ ] **Facturation, devis et TVA** — Numérotation des factures et règles de correction : Générer automatiquement des numéros uniques selon une ou plusieurs séries paramétrées et empêcher les doublons ou la réutilisation des numéros.
- [ ] **Facturation, devis et TVA** — Numérotation des factures et règles de correction : Conserver les factures validées et leur historique ; gérer les avoirs et lier ceux-ci aux factures concernées.
- [ ] **Facturation, devis et TVA** — Numérotation des factures et règles de correction : Journaliser les opérations de correction, d’annulation et d’émission, sans présenter les modalités techniques détaillées comme une obligation textuelle distincte si elles ne sont pas établies.
- [ ] **Facturation, devis et TVA** — TVA sur les prestations de services et mentions fiscales : Configurer les régimes et taux de TVA par type d’opération, client et territoire, avec ventilation des bases et montants de taxe.
- [ ] **Facturation, devis et TVA** — TVA sur les prestations de services et mentions fiscales : Prévoir les champs de numéros de TVA pertinents et les mentions d’exonération ou d’autoliquidation lorsque le régime applicable l’exige.
- [ ] **Facturation, devis et TVA** — TVA sur les prestations de services et mentions fiscales : Gérer la date d’exigibilité et le suivi des encaissements ou l’option pour les débits selon le régime effectivement choisi.
- [ ] **Facturation, devis et TVA** — TVA sur les prestations de services et mentions fiscales : Ne pas coder un taux unique comme règle universelle : les sources fournies ne permettent pas de conclure que toutes les opérations de l’entreprise relèvent du taux normal de 20 %.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission de données (e-reporting) : Être en mesure de recevoir les factures électroniques depuis le 1er septembre 2026 et de les traiter via la plateforme choisie par l’entreprise.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission de données (e-reporting) : Prévoir les champs nécessaires aux nouvelles mentions lorsque celles-ci s’appliquent, ainsi que la qualification des opérations et des clients pour distinguer e-invoicing et e-reporting.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission de données (e-reporting) : Prévoir l’export ou l’échange dans les formats et circuits acceptés par le dispositif et la connexion à la plateforme retenue ; les sources fournies ne suffisent pas à établir l’intégralité des spécifications techniques ou les obligations de journalisation détaillées.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission de données (e-reporting) : Conserver les factures et données conformément aux durées applicables ; celles-ci ne sont pas intégralement précisées dans les informations fournies.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle : Permettre la création de devis détaillés avec identité des parties, prestations, prix et conditions pertinentes.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle : Pour les parcours B2C concernés, présenter les informations précontractuelles et recueillir et conserver les choix ou acceptations pertinents, notamment lorsque le régime de rétractation l’exige.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle : Ne pas imposer comme universel un format de devis ou une mention de signature spécifique : les obligations dépendent du canal, du client et du contrat.
- [ ] **Facturation, devis et TVA** — Logiciels ou systèmes de caisse sécurisés : Si l’ERP enregistre des règlements de particuliers au moyen d’une fonction de caisse, vérifier et documenter la conformité de la version utilisée aux exigences légales.
- [ ] **Facturation, devis et TVA** — Logiciels ou systèmes de caisse sécurisés : Si l’ERP sert uniquement à gérer devis et factures et n’enregistre pas les règlements comme une caisse, l’applicabilité doit être évaluée à partir de l’usage réel et des règles officielles, plutôt que déduite du seul secteur d’activité.
- [ ] **Comptabilité, conservation et archivage** —  : Champs obligatoires : date opération, date d’enregistrement, libellé, compte général, sens débit/crédit, montant en euros.
- [ ] **Comptabilité, conservation et archivage** —  : Contrôles : séquentiel sans blanc ni rature, équilibre débit = crédit, interdiction de modification d’une écriture validée (seul le contre‑passation est autorisé).
- [ ] **Comptabilité, conservation et archivage** —  : Gestion des droits : profils séparés (saisie → validation → archivage).
- [ ] **Comptabilité, conservation et archivage** —  : Export : journal d’audit des écritures exportable pour contrôle fiscal.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : rejet de la comptabilité (art. L.123‑23 C. com.), amende fiscale et risque de taxation d’office.
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : comment
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Mise en place du plan comptable (classe 1‑7), numérotation des comptes, rapprochement automatique avec les écritures du FEC.
- [ ] **Comptabilité, conservation et archivage** —  : Contrôle de la conformité du format de pièce comptable (format PDF/A‑3, horodatage, empreinte SHA‑256).
- [ ] **Comptabilité, conservation et archivage** —  : Journal‑type « Z » obligatoire à chaque clôture d’exercice.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : refus de l’acceptation du bilan par le tribunal, pénalité de 5 000 € (article 1729 D‑I CGI) en cas de non‑conformité au FEC.
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Export automatique d’un fichier unique à plat (FEC) : 18 zones normalisées (JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, CompAuxNum, CompAuxLib, PieceRef, PieceDate, EcritureLib, Debit, Credit, EcritureLet, DateLet, ValidDate, Montantdevise, Idevise).
- [ ] **Comptabilité, conservation et archivage** —  : Nom du fichier : <SIREN>FEC<AAAAMMJJ> ; encodage UTF‑8 ou ISO‑8859‑15, séparateur tabulation ou « | ».
- [ ] **Comptabilité, conservation et archivage** —  : Blocage de toute modification de ValidDate après clôture.
- [ ] **Comptabilité, conservation et archivage** —  : Utilisation du module TestComptaDemat pour valider la conformité avant transmission.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : amende forfaitaire 5 000 €, majoration de 10 % des droits dûs (art. 1729 D‑I CGI).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Enregistrement tracé du lien facture ↔ devis ↔ bon de commande ↔ prestation ↔ paiement (ID unique, horodatage, immutabilité).
- [ ] **Comptabilité, conservation et archivage** —  : Journal de contrôle PAF (veille de l’intégrité, archivage 10 ans).
- [ ] **Comptabilité, conservation et archivage** —  : Obligation de conserver les pièces justificatives liées (PDF/A‑3, horodatage qualifié, empreinte SHA‑256).
- [ ] **Comptabilité, conservation et archivage** —  : Interface d’audit permettant à l’administration d’interroger le journal sans altération.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : remise en cause du droit à déduction de la TVA, amende pouvant atteindre 50 % du montant de la facture (art. 1737 CGI).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Archivage numérique en PDF/A‑3 avec méta‑données (date de numérisation, identité du scanner, empreinte numérique).
- [ ] **Comptabilité, conservation et archivage** —  : Cachet serveur ou signature électronique qualifiée (RGS ≥ 1 étoile) obligatoire pour que la copie soit présumée fiable.
- [ ] **Comptabilité, conservation et archivage** —  : Journal d’archivage immuable (non‑effaçable) pendant la durée de conservation légale (10 ans).
- [ ] **Comptabilité, conservation et archivage** —  : Vérification périodique de l’intégrité (re‑calcul d’empreinte).
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : perte de la force probante (rejet en justice), impossibilité de déduire la TVA, amende administrative.
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Chaînage cryptographique des enregistrements d’encaissement (hash‑in‑hash).
- [ ] **Comptabilité, conservation et archivage** —  : Journal Z quotidien, verrouillé, certifié NF 525 (ou équivalent).
- [ ] **Comptabilité, conservation et archivage** —  : Export obligatoire du journal d’encaissement au format conforme aux spécifications de l’administration (CSV, UTF‑8, horodatage).
- [ ] **Comptabilité, conservation et archivage** —  : Gestion des certificats d’attestation (renouvellement annuel).
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : amende 7 500 € par logiciel non certifié, 60 jours de mise en conformité sous peine de nouvelle amende (art. 1770 duodécies CGI).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Blocage de la fonction de purge avant 10 ans pour les livres comptables, pièces justificatives et documents annexes.
- [ ] **Comptabilité, conservation et archivage** —  : Gestion d’un archivage à froid (WORM ou coffre‑fort numérique) avec droits d’accès réservés aux administrateurs uniquement.
- [ ] **Comptabilité, conservation et archivage** —  : Mise en place de sauvegardes hors‑site conservées 10 ans, avec journal de restauration.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : requalification de la comptabilité en irrégulière, amende fiscale, responsabilité pénale du dirigeant.
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Capacité de réception via Plateforme Agréée (PA) : API REST / SOAP conforme au protocole NF Z 12‑012 (EN 16931).
- [ ] **Comptabilité, conservation et archivage** —  : Émission obligatoire pour les Grandes Entreprises/ETI dès le 1 sept. 2026 ; pour les PME/TPE 1 sept. 2027 : génération de factures structurées Factur‑X/UBL/CII avec les 24 mentions légales (SIREN, TVA‑intracom, adresse de livraison, nature de la prestation, option de TVA débit, etc.).
- [ ] **Comptabilité, conservation et archivage** —  : Transmission automatisée du e‑reporting (déclarations de facturation, de paiement, de TVA) aux services fiscaux via l’API « e‑reporting » (format JSON, SSL/TLS, authent. certificat).
- [ ] **Comptabilité, conservation et archivage** —  : Gestion des rejets PA (notification, relance, archivage de la copie non acceptée).
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : 50 € par facture non émise au format structuré (plaf. 15 000 € / an) ; 500 € par transmission e‑reporting manquante (plaf. 15 000 € / an) ; 1 000 € pour absence de plateforme agréée après mise en demeure (art. 1737 CGI, art. 1788 D CGI).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Numérisation en format PDF ou PDF/A‑3 (ISO 19005‑3) avec empreinte digitale et horodatage qualifié.
- [ ] **Comptabilité, conservation et archivage** —  : Interdiction de toute modification de l’image (aucun retouche, aucun recadrage).
- [ ] **Comptabilité, conservation et archivage** —  : Journal d’importation automatisé (date, opérateur, hash).
- [ ] **Comptabilité, conservation et archivage** —  : Conservation pendant 6 ans (minimum fiscal) – l’ERP doit suivre la règle 6 ans + 10 ans pour les pièces comptables.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : perte de la valeur probante, refus de la déduction TVA, amende fiscale de 5 000 € (art. 1729 D‑I CGI).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Support des formats Factur‑X, UBL, CII ; validation par le validateur officiel TestFacture.x (API).
- [ ] **Comptabilité, conservation et archivage** —  : Archivage obligatoire des factures électroniques pendant 10 ans (PDF/A‑3 + métadonnées).
- [ ] **Comptabilité, conservation et archivage** —  : Journal des échanges (envoi, accusé de réception, rejet) immuable pour audit.
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : même que la loi de finances 2026 (50 €/facture, 500 €/e‑reporting, plafond 15 000 €).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Application du délai de conservation de 10 ans aux contrats de prestation de services, aux bons de commande et aux devis liés aux factures.
- [ ] **Comptabilité, conservation et archivage** —  : L’ERP doit implémenter un mécanisme de rétention légal (archivage à froid, verrouillage de suppression).
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : amende administrative (jusqu’à 75 000 € selon la gravité) et mise en demeure de mise en conformité.
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Comptabilité, conservation et archivage** —  : Gestion du consentement pour les données de contacts (formulaires web).
- [ ] **Comptabilité, conservation et archivage** —  : Droits d’accès, de rectification, d’effacement et de portabilité à implémenter dans le CRM/ERP.
- [ ] **Comptabilité, conservation et archivage** —  : Journal des traitements (registre des activités) à tenir, conservation 3 ans minimum.
- [ ] **Comptabilité, conservation et archivage** —  : Sécurisation (chiffrement des bases, mesures de confidentialité, DPO).
- [ ] **Comptabilité, conservation et archivage** —  : date_entry_into_force
- [ ] **Comptabilité, conservation et archivage** —  : Sanctions : amende jusqu’à 20 M € ou 4 % du chiffre d’affaires mondial (CNIL).
- [ ] **Comptabilité, conservation et archivage** —  : applicable
- [ ] **Comptabilité, conservation et archivage** —  : source
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Pour chaque formulaire ou fonctionnalité, documenter les finalités, catégories de données, base juridique, destinataires et durées ; ne pas rendre obligatoire un champ sans nécessité établie.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Présenter une information de confidentialité adaptée au point de collecte et prévoir des workflows pour les demandes d’accès, rectification, effacement, limitation, portabilité et opposition, selon le droit applicable.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Permettre de rechercher les données rattachées à une personne et d’en produire une copie intelligible ; l’export doit être adapté au traitement, sans qu’un format JSON ou CSV précis soit imposé par les éléments fournis.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Configurer des règles de revue, d’archivage ou d’effacement selon des durées définies et justifiées pour chaque traitement ; les sources fournies ne permettent pas de fixer une durée universelle.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Prévoir une gestion des accès et des mesures de sécurité proportionnées aux risques, ainsi que des éléments de traçabilité utiles à la démonstration de conformité. Les éléments fournis n’établissent pas une obligation générale de journaliser chaque lecture et modification.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Prévoir une procédure de gestion des violations et une coopération avec le responsable de traitement lorsqu’il s’agit d’un traitement sous-traité.
- [ ] **Données personnelles (RGPD)** — Loi Informatique et Libertés : Documenter les procédures permettant de répondre aux demandes et contrôles de la CNIL et de mettre à disposition les informations pertinentes.
- [ ] **Données personnelles (RGPD)** — Loi Informatique et Libertés : N’ajouter un workflow post-mortem que si les traitements et demandes concernés le justifient ; les données fournies ne permettent pas d’en imposer un dans l’ERP.
- [ ] **Données personnelles (RGPD)** — Loi Informatique et Libertés : Définir les habilitations selon les besoins d’accès réels et documentés ; la loi ne prescrit pas ici une implémentation RBAC particulière.
- [ ] **Données personnelles (RGPD)** — Code pénal — atteintes aux droits de la personne résultant des fichiers ou des traitements informatiques : Conserver les données et pièces pertinentes de manière à pouvoir répondre aux demandes légales de contrôle, avec des accès adaptés.
- [ ] **Données personnelles (RGPD)** — Code pénal — atteintes aux droits de la personne résultant des fichiers ou des traitements informatiques : Prévoir un processus interne de traitement des incidents ; les mesures techniques précises doivent être choisies selon l’analyse des risques et ne sont pas entièrement définies par les sources fournies.
- [ ] **Données personnelles (RGPD)** — Code pénal — atteintes aux droits de la personne résultant des fichiers ou des traitements informatiques : Ne pas considérer le chiffrement, la purge des sauvegardes ou une journalisation exhaustive comme des obligations uniformes établies pour tous les cas par les éléments fournis.
- [ ] **Données personnelles (RGPD)** — Référentiels et recommandations de la CNIL : Évaluer les contrôles d’accès, l’authentification, la protection des identifiants et la journalisation en fonction des risques et des recommandations CNIL pertinentes.
- [ ] **Données personnelles (RGPD)** — Référentiels et recommandations de la CNIL : Ne pas imposer une durée uniforme de conservation des journaux, un mécanisme MFA, un algorithme de hachage précis ou une séparation particulière des données du quiz sans analyse des traitements et des recommandations applicables.
- [ ] **Données personnelles (RGPD)** — Référentiels et recommandations de la CNIL : Si des traitements RH sont effectivement réalisés dans l’ERP, vérifier leur conformité au référentiel CNIL correspondant.
- [ ] **Réglementation produit du secteur** — Règlement sur l’intelligence artificielle (AI Act) : Pour les chatbots concernés, prévoir une information visible signalant l’interaction avec une IA.
- [ ] **Réglementation produit du secteur** — Règlement sur l’intelligence artificielle (AI Act) : Prévoir une gestion documentaire permettant d’identifier les systèmes, leurs rôles (fournisseur/déployeur), leurs usages et leur catégorie de risque ; les sources ne permettent pas d’affirmer qu’un dossier technique ou un registre donné est obligatoire pour chaque outil.
- [ ] **Réglementation produit du secteur** — Règlement sur l’intelligence artificielle (AI Act) : Ne pas imposer par défaut la conservation de tous les prompts et réponses ni un « kill switch » : les éléments fournis ne justifient pas ces exigences comme obligations générales applicables à cet ERP.
- [ ] **Réglementation produit du secteur** — Règlement sur l’intelligence artificielle (AI Act) : Si un système à haut risque est identifié, déterminer séparément les exigences applicables au fournisseur ou au déployeur avant de configurer les contrôles et journaux.
- [ ] **Réglementation produit du secteur** — Cyber Resilience Act (CRA) : Tenir un inventaire des logiciels et versions afin de déterminer lesquels sont des produits mis à disposition sur le marché et qui en est le fabricant.
- [ ] **Réglementation produit du secteur** — Cyber Resilience Act (CRA) : Pour les produits relevant de l’article 14, prévoir un processus d’escalade et de notification permettant de respecter les délais de signalement.
- [ ] **Réglementation produit du secteur** — Cyber Resilience Act (CRA) : Pour les produits couverts à partir du 11 décembre 2027, prévoir la gestion des éléments de conformité, de la documentation technique et, selon la procédure applicable, de la déclaration et du marquage CE.
- [ ] **Réglementation produit du secteur** — Cyber Resilience Act (CRA) : Ne pas traiter une SBOM, une durée de support de cinq ans ou une exportation particulière comme champs obligatoires universels de l’ERP sur la seule base des informations disponibles.
- [ ] **Réglementation produit du secteur** — Code de la consommation — information précontractuelle sur les services numériques : Si des offres numériques sont vendues à des consommateurs, présenter avant contrat les informations pertinentes sur les fonctionnalités, compatibilité et interopérabilité.
- [ ] **Réglementation produit du secteur** — Code de la consommation — information précontractuelle sur les services numériques : Les éléments fournis ne justifient pas une case d’acceptation, un archivage particulier de l’acceptation ou un export PDF comme obligations générales de réglementation produit.
- [ ] **Réglementation produit du secteur** — Code de la consommation — information précontractuelle sur les services numériques : Aucun champ ERP obligatoire ne peut être déterminé sans connaître les offres et le parcours de vente effectivement proposés aux consommateurs.
- [ ] **Travail, sécurité et flotte de véhicules** — Décompte de la durée du travail : Si l’ERP gère ces données, permettre le relevé quotidien et le récapitulatif hebdomadaire adaptés au régime de travail.
- [ ] **Travail, sécurité et flotte de véhicules** — Décompte de la durée du travail : Prévoir un historique consultable et des exports des relevés ; les sources fournies ne justifient pas d’imposer un format PDF/CSV précis ni un journal dit « infalsifiable ».
- [ ] **Travail, sécurité et flotte de véhicules** — Décompte de la durée du travail : Ne pas appliquer automatiquement les limites horaires et contrôles identiques à tous les salariés : les régimes et dérogations applicables dépendent de leur situation.
- [ ] **Travail, sécurité et flotte de véhicules** — Forfait annuel en jours : Si le module est utilisé, enregistrer jours et demi-journées travaillés et absences pertinentes, avec un moyen de signaler une charge excessive.
- [ ] **Travail, sécurité et flotte de véhicules** — Forfait annuel en jours : Permettre une synthèse individuelle et le suivi prévu par l’accord applicable ; ne pas imposer de plafond conventionnel uniforme sans vérifier l’accord applicable.
- [ ] **Travail, sécurité et flotte de véhicules** — Forfait annuel en jours : Les sources fournies ne suffisent pas à établir une durée de conservation légale générale de trois ans pour tous ces relevés.
- [ ] **Travail, sécurité et flotte de véhicules** — Passeport de prévention : Si l’ERP suit des formations SST déclarables, conserver les informations nécessaires à leur suivi et à leur déclaration, selon le portail officiel et les règles applicables.
- [ ] **Travail, sécurité et flotte de véhicules** — Passeport de prévention : Limiter les données personnelles traitées à celles nécessaires ; les sources fournies ne justifient pas l’enregistrement systématique du NIR ni une conservation pérenne dans l’ERP.
- [ ] **Travail, sécurité et flotte de véhicules** — Passeport de prévention : Les informations disponibles ne permettent pas de confirmer un format d’export particulier ni une sanction forfaitaire de 2 000 € par manquement.
- [ ] **Travail, sécurité et flotte de véhicules** — Prévention du risque électrique et habilitation : Si l’entreprise suit ces habilitations, permettre d’enregistrer le titre et sa portée, ainsi que les dates utiles, et d’alerter sur une échéance ou une habilitation manquante avant une mission concernée.
- [ ] **Travail, sécurité et flotte de véhicules** — Prévention du risque électrique et habilitation : Ne pas présumer qu’un recyclage à trois ans ou une visite médicale s’applique uniformément : vérifier les exigences correspondant aux opérations et au texte en vigueur.
- [ ] **Travail, sécurité et flotte de véhicules** — Prévention du risque électrique et habilitation : Les sources fournies ne fixent pas de durée de conservation générale des dossiers d’habilitation.
- [ ] **Travail, sécurité et flotte de véhicules** — Désignation du conducteur en cas d’infraction routière constatée sans interception : Si l’entreprise dispose d’une flotte concernée, conserver une attribution datée des véhicules permettant de rechercher le conducteur au moment pertinent.
- [ ] **Travail, sécurité et flotte de véhicules** — Désignation du conducteur en cas d’infraction routière constatée sans interception : Prévoir un suivi des avis, du délai de désignation et des éléments nécessaires à la démarche ; les sources ne confirment pas que toutes les données personnelles proposées dans le projet soient obligatoires à stocker dans l’ERP.
- [ ] **Travail, sécurité et flotte de véhicules** — Désignation du conducteur en cas d’infraction routière constatée sans interception : Les sources disponibles ne déterminent pas une durée générale de conservation du registre d’affectation.
- [ ] **Travail, sécurité et flotte de véhicules** — Géolocalisation de véhicules des salariés — protection des données et droit du travail : Si le traitement existe, prévoir une collecte limitée aux finalités établies, des accès contrôlés, une information des personnes et l’exercice de leurs droits.
- [ ] **Travail, sécurité et flotte de véhicules** — Géolocalisation de véhicules des salariés — protection des données et droit du travail : Configurer les périodes de collecte et les durées de conservation selon la finalité et la doctrine CNIL applicable ; les sources fournies ne permettent pas de poser une règle uniforme de deux mois, un an ou cinq ans dans tous les cas.
- [ ] **Travail, sécurité et flotte de véhicules** — Géolocalisation de véhicules des salariés — protection des données et droit du travail : Ne pas collecter de positions GPS dans l’ERP sans nécessité et fondement documentés.
- [ ] **Travail, sécurité et flotte de véhicules** — Obligations de verdissement de flotte et taxe annuelle incitative : Aucun module de calcul ou de déclaration ne peut être rendu obligatoire sur la base des informations fournies seules.
- [ ] **Travail, sécurité et flotte de véhicules** — Obligations de verdissement de flotte et taxe annuelle incitative : Si le parc entre dans le champ après vérification officielle, prévoir les données véhicules et déclaratives exigées par le texte applicable.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Prévoir une gestion des comptes et habilitations permettant de limiter les droits par fonction et de retirer rapidement les accès devenus inutiles ; le choix RBAC/ABAC relève de la conception, pas d’une prescription textuelle précise.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Ne pas enregistrer les mots de passe ou autres secrets dans les journaux ; protéger les données d’authentification conformément au niveau de risque.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Mettre en place des traces utiles à la sécurité et à l’investigation, avec accès limité, protection contre l’altération et durée de conservation justifiée ; aucun champ ou format de journal universel n’est imposé par les éléments fournis.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Prévoir des procédures et moyens de détection, d’escalade et de documentation des violations permettant d’évaluer les notifications prévues aux articles 33 et 34.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Documenter les règles de conservation et de suppression des données et des journaux. Le RGPD ne fixe pas ici une durée unique de conservation des logs.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL sur les mots de passe et autres secrets partagés : Stocker et traiter les secrets d’authentification conformément à la recommandation ou à une solution démontrant une sécurité équivalente.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL sur les mots de passe et autres secrets partagés : Ne pas journaliser les mots de passe, y compris ceux saisis lors d’une tentative échouée, ni les identifiants non reconnus.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL sur les mots de passe et autres secrets partagés : Choisir les contrôles d’authentification en fonction du risque ; la recommandation reconnaît notamment que des moyens comme le double facteur peuvent offrir davantage de sécurité que le seul mot de passe.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL relatives à la journalisation et à la sécurité des données personnelles : Évaluer quels événements doivent être tracés, par exemple accès et actions pertinentes pour la sécurité, sans présumer qu’une liste exhaustive est légalement imposée.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL relatives à la journalisation et à la sécurité des données personnelles : Protéger les journaux et séparer leur stockage du système principal lorsque cela est adapté ; la CNIL cite le puits de logs comme bonne pratique.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL relatives à la journalisation et à la sécurité des données personnelles : Définir et documenter une durée de conservation proportionnée. La fourchette de six mois à un an est indiquée dans les sources comme une recommandation CNIL, et non comme une obligation générale applicable à tout ERP.
- [ ] **Sécurité informatique et gestion des accès** — Recommandations CNIL relatives à la journalisation et à la sécurité des données personnelles : Ne pas utiliser les traces de sécurité à des fins incompatibles, par exemple le contrôle du temps de travail, sans base et information appropriées.
- [ ] **Sécurité informatique et gestion des accès** — Directive NIS 2 – sécurité des réseaux et des systèmes d’information : Si l’entreprise est qualifiée d’entité assujettie, aligner les contrôles d’accès, la gestion des incidents, la continuité et les journaux sur les mesures de gestion des risques applicables et les règles nationales de transposition.
- [ ] **Sécurité informatique et gestion des accès** — Directive NIS 2 – sécurité des réseaux et des systèmes d’information : Prévoir un processus de qualification et de déclaration des incidents et la capacité d’exporter les informations requises par l’autorité compétente, si l’entreprise est assujettie.
- [ ] **Sécurité informatique et gestion des accès** — Directive NIS 2 – sécurité des réseaux et des systèmes d’information : Les fonctionnalités précises à imposer au logiciel ne peuvent pas être déterminées sans connaître le statut NIS2, les textes nationaux applicables et les mesures retenues.
- [ ] **Sécurité informatique et gestion des accès** — Accessibilité numérique – régime de l’article 47 de la loi du 11 février 2005 et Acte européen sur l’accessibilité : Sur les faits fournis, aucune exigence légale précise de champs, rôles, conservation ou journalisation de l’ERP ne découle de ces textes.
- [ ] **Sécurité informatique et gestion des accès** — Accessibilité numérique – régime de l’article 47 de la loi du 11 février 2005 et Acte européen sur l’accessibilité : Si le site ou un logiciel livré devient un service couvert, examiner les exigences fonctionnelles d’accessibilité du service et les obligations de déclaration, de contact et de publication pertinentes.
- [ ] **Sécurité informatique et gestion des accès** — Accessibilité numérique – régime de l’article 47 de la loi du 11 février 2005 et Acte européen sur l’accessibilité : Une exigence d’accessibilité peut également résulter d’un contrat ou d’un marché public ; aucun contrat de ce type n’est établi dans les informations fournies.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement sur l’intelligence artificielle (AI Act) : Tenir un inventaire des systèmes d’IA comprenant leur finalité, leurs versions, leurs fournisseurs, leurs usages, les rôles de l’entreprise et l’analyse de classification ; ce registre est une mesure de conformité utile, mais les informations fournies ne démontrent pas qu’un champ ERP déterminé est légalement obligatoire dans tous les cas.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement sur l’intelligence artificielle (AI Act) : Pour un chatbot relevant de l’art. 50(1), afficher une information claire indiquant que la personne échange avec une IA. Ne pas imposer un bouton de transfert à un humain comme obligation générale de l’AI Act sur la seule base des faits fournis.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement sur l’intelligence artificielle (AI Act) : Ne pas ajouter systématiquement un score de confiance, une journalisation intégrale des prompts, un format d’export réglementaire ou une conservation indéfinie : ces exigences ne sont pas établies comme obligations générales pour les usages décrits. Pour les systèmes à haut risque, mettre en œuvre les journaux et la documentation exigés par les dispositions applicables au système et au rôle.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement sur l’intelligence artificielle (AI Act) : Si un système de haut risque est identifié, configurer les contrôles, journaux, documents et mécanismes de supervision correspondant à ses obligations exactes ; les données nécessaires et les durées de conservation doivent être déterminées selon le texte et le système concerné.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement sur l’intelligence artificielle (AI Act) : Ne pas qualifier automatiquement le quiz salarial de système RH à haut risque : vérifier s’il sert réellement à recruter, sélectionner, évaluer ou prendre des décisions concernant des travailleurs. De même, la recherche d’aides n’établit pas à elle seule un système de décision sur l’octroi d’avantages publics.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement général sur la protection des données (RGPD) : Prévoir des notices d’information adaptées aux formulaires, comptes, quiz, outils de recherche et dossiers d’accompagnement, en détaillant les traitements effectifs et leurs finalités.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement général sur la protection des données (RGPD) : Mettre en place une gestion des demandes d’accès, rectification, effacement, opposition et limitation selon les droits applicables ; ne pas promettre un effacement d’un modèle ou de ses sorties sans vérifier la faisabilité et les obligations applicables.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement général sur la protection des données (RGPD) : Configurer des durées de conservation par catégorie et des procédures de purge ; les durées précises ne sont pas établies par les informations fournies.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement général sur la protection des données (RGPD) : Restreindre les accès aux données des membres et aux éventuels dossiers administratifs, et documenter les prestataires qui traitent les données.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Règlement général sur la protection des données (RGPD) : Ne pas imposer une case de consentement comme solution universelle : la base juridique doit être déterminée pour chaque finalité.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Normes ISO/IEC et normes harmonisées relatives à l’IA : La tenue d’un inventaire des modèles, versions, fournisseurs et modifications peut soutenir la gouvernance, mais ne constitue pas, sur les seuls éléments disponibles, une exigence légale universelle de l’ERP.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Normes ISO/IEC et normes harmonisées relatives à l’IA : Ne pas présenter une certification ou une norme volontaire comme substitut à l’analyse des obligations applicables de l’AI Act.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Directive relative à la responsabilité du fait des produits défectueux : Ne pas déduire de cette directive une obligation générale de conserver intégralement et indéfiniment toutes les décisions automatisées ; les éléments fournis ne fondent pas une telle exigence.
- [ ] **Réglementation applicable aux systèmes d’intelligence artificielle selon leur usage, leur rôle et leur niveau de risque, notamment les obligations de transparence et de documentation lorsqu’elles s’appliquent** — Directive relative à la responsabilité du fait des produits défectueux : La conservation de preuves et les mécanismes d’audit peuvent être examinés au regard des obligations contractuelles et du droit applicable au produit, sans durée déterminable à partir des informations fournies.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Déclaration d’activité du prestataire de formation : Permettre d’enregistrer le statut de déclaration, le numéro, la date et l’autorité d’enregistrement, ainsi que les dates de dépôt et de modification.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Déclaration d’activité du prestataire de formation : Si l’entreprise est déclarée, injecter la mention légale requise dans les documents concernés selon la situation et le texte applicable; ne pas imposer l’affichage du numéro avant son enregistrement.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Déclaration d’activité du prestataire de formation : Conserver les conventions ou contrats de formation et les justificatifs utiles au suivi de la déclaration.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Déclaration d’activité du prestataire de formation : Aucun champ ni traitement réglementaire spécifique n’est établi pour les données de contact, de compte, de quiz ou de navigation décrites dans le contexte.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Bilan pédagogique et financier (BPF) : Si l’activité de formation est exercée, structurer les données nécessaires au BPF : actions, bénéficiaires, heures, spécialités et recettes selon les rubriques du formulaire en vigueur.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Bilan pédagogique et financier (BPF) : Prévoir des contrôles de cohérence et un export ou état de rapprochement vers le formulaire courant; ne pas figer des champs détaillés sur la seule base de descriptions commerciales non vérifiées.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Bilan pédagogique et financier (BPF) : Conserver les données justificatives nécessaires au contrôle; la durée minimale précise de conservation n’est pas établie par les éléments fournis.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Formalisation des conventions et contrats de formation : Permettre de sélectionner le type de relation contractuelle et de générer le modèle adapté, avec les mentions requises pour le cas concerné.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Formalisation des conventions et contrats de formation : Pour les contrats individuels autofinancés, suivre la date de signature et le délai de rétractation et appliquer les règles de paiement prévues par le Code du travail.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Formalisation des conventions et contrats de formation : Conserver les documents signés et les éléments permettant de retrouver la version conclue. Aucun délai uniforme de conservation n’est établi par les informations fournies.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Règlement intérieur applicable aux stagiaires et apprentis : Permettre de joindre ou transmettre la version applicable du règlement à la convocation ou au dossier de session et de conserver une preuve de transmission.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Règlement intérieur applicable aux stagiaires et apprentis : Si une preuve électronique est utilisée, conserver sa date et son rattachement à la session ou au stagiaire; les éléments fournis ne démontrent pas qu’une case d’acceptation ou un blocage d’accès soient légalement obligatoires.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Règlement intérieur applicable aux stagiaires et apprentis : Gérer les versions du document lorsque les règles ou modalités de formation changent.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Certification qualité Qualiopi / Référentiel national qualité : Si la certification est recherchée ou détenue, permettre de documenter les informations et preuves liées aux prestations, à leur suivi et à leur évaluation conformément au référentiel applicable.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Certification qualité Qualiopi / Référentiel national qualité : Ne pas transformer des suggestions de logiciel (questionnaires, émargement numérique, journaux dits infalsifiables ou blocage d’attestations) en obligations légales générales : les sources fournies ne les établissent pas comme exigences techniques impératives.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — Certification qualité Qualiopi / Référentiel national qualité : Gérer les éléments de preuve selon les procédures d’audit et les règles de conservation effectivement applicables; une durée uniforme n’est pas établie ici.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — CPF, référencement EDOF et règles associées : Seulement si l’entreprise utilise EDOF/CPF : prévoir le suivi des dossiers, des sessions, de l’assiduité et des justificatifs nécessaires à la déclaration et à la facturation, conformément aux spécifications officielles en vigueur.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — CPF, référencement EDOF et règles associées : Ne pas implémenter comme règles certaines le délai de trois jours, un plafond de sous-traitance de 80 %, un montant de participation ou une durée de conservation sur la seule base des éléments fournis; ces points nécessitent vérification des textes et conditions officiels applicables au moment du déploiement.
- [ ] **Règles propres à la formation professionnelle en France, si l’entreprise dispense effectivement des formations professionnelles, et conditions de certification ou de financement selon les dispositifs concernés** — CPF, référencement EDOF et règles associées : Le contexte ne décrit pas de données CPF effectivement collectées; il n’est donc pas possible de définir des champs obligatoires précis pour ce logiciel.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement de minimis général : Enregistrer, lorsque le dossier relève de ce régime, le régime d’aide, le bénéficiaire, l’aide déclarée ou octroyée, son montant, sa date et l’autorité concernée, ainsi que les informations nécessaires à l’examen de l’entreprise unique.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement de minimis général : Permettre le calcul ou la vérification du plafond à partir des informations fiables disponibles, avec signalement des données manquantes et possibilité de correction.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement de minimis général : Conserver la source et la date de mise à jour des critères affichés ; ne pas présenter le contrôle ERP comme une vérification officielle du registre sans intégration documentée.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement de minimis général : Aucun format d’export, journal technique ou durée de conservation particulière pour cet ERP n’est établi par les sources fournies.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement général d’exemption par catégorie (RGEC) : Associer chaque fiche d’aide à son fondement juridique, à sa version, à ses critères, plafonds, dépenses éligibles, justificatifs et échéances propres.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement général d’exemption par catégorie (RGEC) : Collecter les dates de dépôt, de commencement du projet et les éléments de coûts ou de cofinancement uniquement lorsque le dispositif les requiert.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement général d’exemption par catégorie (RGEC) : Prévoir des alertes et contrôles paramétrables plutôt qu’un blocage général fondé sur une règle unique.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Règlement général d’exemption par catégorie (RGEC) : Permettre un état récapitulatif des financements et dépenses lorsque le dispositif le demande ; aucune exigence générale de format d’export ou de piste d’audit ERP n’est établie ici.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Conventionnement et compte rendu financier des subventions attribuées à des personnes privées : Si l’ERP est utilisé par un bénéficiaire ou pour son compte, il peut enregistrer la convention, les échéances, les dépenses affectées et les justificatifs nécessaires au suivi.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Conventionnement et compte rendu financier des subventions attribuées à des personnes privées : Prévoir un export de dépenses ou de compte rendu seulement selon les exigences de l’autorité et de la convention ; les sources ne prescrivent pas un format logiciel particulier.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Conventionnement et compte rendu financier des subventions attribuées à des personnes privées : Les alertes d’échéance sont une mesure fonctionnelle utile, non une obligation technique expressément imposée à cet ERP.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Infractions pénales relatives à l’obtention frauduleuse d’aides : Permettre de distinguer les informations déclarées par le client des informations vérifiées par le prestataire, et de tracer les versions des documents transmis, peut contribuer à une gestion fiable des dossiers.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Infractions pénales relatives à l’obtention frauduleuse d’aides : Les sources fournies ne justifient pas d’imposer comme champs obligatoires une attestation signée, des pièces d’identité, des attestations fiscales ou sociales, ni une interrogation obligatoire d’une API.
- [ ] **Conditions et règles des aides publiques présentées ou accompagnées : critères d’éligibilité, pièces justificatives, règles de cumul et obligations liées à chaque dispositif** — Infractions pénales relatives à l’obtention frauduleuse d’aides : Aucune obligation générale de verrouillage de factures ou de piste d’audit technique propre à cet ERP n’est établie par les sources fournies.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés : Prévoir des comptes et habilitations adaptés aux rôles, le principe du moindre privilège et la révocation des accès devenus inutiles; les mesures exactes doivent être déterminées par l’analyse des risques.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés : Protéger les données et les accès selon le risque. Les sources disponibles ne justifient pas d’imposer universellement une technologie précise telle que MFA, TLS d’une version déterminée ou chiffrement au repos pour tous les déploiements.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés : Prévoir des journaux utiles à la sécurité et à l’investigation, protégés contre les accès ou modifications non autorisés; fixer leur contenu et leur durée selon la finalité et la proportionnalité. La durée de six mois citée dans les éléments disponibles est une recommandation, pas une durée légale universelle.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés : Permettre de documenter les incidents et de retrouver les traitements et données concernés afin de traiter les notifications requises.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement général sur la protection des données (RGPD) et loi Informatique et Libertés : Les catégories exactes de données et durées de conservation ne sont pas précisées dans le contexte: elles doivent être déterminées pour chaque traitement avant de définir les champs, contrôles et règles de purge.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la cyberrésilience (Cyber Resilience Act, CRA) : Si le logiciel est un produit concerné et que l’entreprise en est fabricant, organiser un processus de suivi des vulnérabilités, de traitement des correctifs et de signalement, avec des éléments permettant d’identifier le produit, sa version et l’incident.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la cyberrésilience (Cyber Resilience Act, CRA) : Conserver la documentation technique et les éléments de conformité requis pour le produit concerné.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la cyberrésilience (Cyber Resilience Act, CRA) : Les sources indiquent une SBOM couvrant au moins les dépendances de premier niveau comme élément de documentation de gestion des vulnérabilités; vérifier les exigences exactes applicables au produit.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la cyberrésilience (Cyber Resilience Act, CRA) : Ne pas présumer que tout SaaS est exclu ou inclus: déterminer si le service fourni constitue un produit mis sur le marché au sens du règlement.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Directive NIS 2 et règlement d’exécution (UE) 2024/2690 : Aucun champ ou délai de conservation propre à NIS 2 ne peut être imposé à cet ERP sur les seules informations fournies. Si l’entreprise est dans le champ, définir les contrôles, journaux, procédures d’incident et preuves correspondant aux obligations effectivement applicables.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Directive NIS 2 et règlement d’exécution (UE) 2024/2690 : Si des contrats clients le demandent, prévoir des capacités proportionnées de traçabilité des interventions, de signalement au client, de gestion des vulnérabilités et de restitution ou suppression des informations; les exigences précises dépendront des contrats et du statut du client.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Directive NIS 2 et règlement d’exécution (UE) 2024/2690 : Vérifier le statut de l’entreprise au regard des critères de taille et de la qualification réelle de ses activités MSP/MSSP, ainsi que l’état de la transposition française avant de conclure à un assujettissement direct.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la résilience opérationnelle numérique du secteur financier (DORA) : Aucune obligation DORA de champ, de journalisation ou d’export directement applicable à l’ERP ne peut être déduite des informations fournies.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la résilience opérationnelle numérique du secteur financier (DORA) : Si l’entreprise fournit un service TIC à une entité financière, le contrat peut prévoir des dispositions relatives à la sécurité, aux incidents, aux audits, à la sous-traitance et à la fin du contrat. Le logiciel peut alors devoir prendre en charge la traçabilité et la restitution des données convenues.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Règlement sur la résilience opérationnelle numérique du secteur financier (DORA) : Vérifier la nature des clients, le rôle du service dans leurs fonctions critiques ou importantes, le contrat et toute éventuelle désignation du prestataire.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Code pénal — atteintes aux systèmes de traitement automatisé de données (STAD) : Aucun champ obligatoire, délai de conservation ou mécanisme particulier de l’ERP ne découle directement de ces dispositions selon les sources fournies.
- [ ] **Obligations cyber applicables selon les services réellement fournis et le statut de l’entreprise ou de ses clients; l’assujettissement à un régime sectoriel précis n’est pas établi par les informations fournies** — Code pénal — atteintes aux systèmes de traitement automatisé de données (STAD) : Des contrôles d’accès et des journaux peuvent être des mesures utiles de sécurité et de preuve, mais ne doivent pas être présentés comme des prescriptions techniques explicites des articles 323-1 à 323-7.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — logiciels créés par des employés : À titre de traçabilité, enregistrer le contributeur, son statut et le projet ou livrable concerné ; conserver les contrats ou éléments utiles à l’établissement du cadre de création.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — logiciels créés par des employés : Ne pas présenter cette traçabilité comme une formalité prescrite par l’article.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — logiciels créés par des personnes accueillies dans le cadre d’une convention : Si le régime est pertinent, documenter la convention, la contrepartie, l’autorité du responsable et les logiciels concernés, afin d’établir les conditions d’application.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — logiciels créés par des personnes accueillies dans le cadre d’une convention : Aucun champ ERP ou délai de conservation spécifique n’est établi par les sources fournies.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — droits d’auteur et contrats de prestation : Relier chaque livrable à son contrat et à ses conditions de licence ou de cession ; garder la version signée et ses avenants.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — droits d’auteur et contrats de prestation : Prévoir des champs de suivi des droits concédés et des usages autorisés comme mesures de gestion ; l’article ne prescrit pas ces champs.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — formalisme de cession des droits : Dans le dossier contractuel, identifier séparément les droits cédés et préciser leur périmètre, leur destination, leur territoire et leur durée.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — formalisme de cession des droits : Alerter sur les champs incomplets avant émission ou signature d’un acte de cession, sans présenter un blocage ERP comme une obligation légale explicite.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — formalisme de cession des droits : Archiver l’acte signé et les avenants ; aucun délai de conservation précis n’est indiqué par la source.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — rémunération de l’auteur lors d’une cession : Distinguer dans les documents commerciaux le prix de la prestation et la rémunération des droits si cela correspond à l’accord conclu ; conserver la justification contractuelle du mode de rémunération.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — rémunération de l’auteur lors d’une cession : Ne pas imposer une ventilation ou un champ ERP comme exigence légale générale : le texte fourni ne prescrit pas de format.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — droits exclusifs sur les logiciels et droit moral adapté : Associer à chaque logiciel ou version ses titulaires de droits et les autorisations contractuelles applicables à la reproduction, modification, distribution ou mise à disposition.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — droits exclusifs sur les logiciels et droit moral adapté : Conserver les licences et versions livrées comme dispositif de preuve ; aucun registre ou format d’export précis n’est prescrit par les références fournies.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — exceptions relatives aux logiciels : Pour les intégrations, documenter le fondement et le périmètre des opérations d’interopérabilité et vérifier les droits d’utilisation du logiciel concerné.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — exceptions relatives aux logiciels : Ne pas présenter un contrôle contractuel général ou un registre particulier comme exigé par l’article ; aucune durée de conservation ou fonction ERP obligatoire n’est précisée.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — contrefaçon : Gérer les licences et autorisations des composants et livrables et conserver les preuves utiles de leur provenance et des droits accordés ; ces mesures sont pratiques, non des champs imposés par les articles cités.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Code de la propriété intellectuelle — contrefaçon : Prévoir un accès aux contrats, licences et versions livrées pour traiter les demandes ou litiges.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Règlement (UE) 2024/1689 sur l’intelligence artificielle — droit d’auteur applicable aux fournisseurs de modèles d’IA à usage général : Si l’entreprise est effectivement fournisseur d’un modèle d’IA à usage général, tenir les informations nécessaires à la politique et au résumé de contenus d’entraînement ; ne pas étendre cette exigence à de simples utilisateurs ou intégrateurs sans établir leur rôle juridique.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — Règlement (UE) 2024/1689 sur l’intelligence artificielle — droit d’auteur applicable aux fournisseurs de modèles d’IA à usage général : Les sources fournies ne prescrivent pas les champs ERP, formats de journal ou durées de conservation décrits dans la réponse proposée.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — ISO/IEC 5230:2020 — OpenChain Specification : Le suivi des composants, de leurs licences et des notices peut être une mesure utile de gestion, mais n’est pas présenté ici comme obligation légale démontrée.
- [ ] **Droits d’auteur, licences de logiciels et de contenus, et droits sur les livrables développés pour les clients** — ISO/IEC 5230:2020 — OpenChain Specification : Les sources fournies ne justifient pas un blocage automatique de livraison fondé sur une catégorie générale de licence.

---

## 0 bis. Inspection technique (agent H workstation : terminal + code)

- **Framework / stack** : Vite + React + React Router + Supabase
- **Couverture** : 25 pages lues sur 78 du sitemap, 62 fichiers JS lus ; ignorées : /espace/* (disallowed by robots.txt), /admin/* (disallowed by robots.txt)
- **Authentification** : connexion /connexion ; inscription /inscription ; routes protégées /espace/*, /espace-client/*, /admin/* ; fournisseur Supabase Auth (email/password)

### Modèles de pages

| Modèle | Pages | Rôle | Exemples |
|---|---|---|---|
| `/` | 1 | Homepage with service chapters, CTA, FAQ | https://www.cerclai.fr/ |
| `/services` | 1 | Services overview with 3 category groups | https://www.cerclai.fr/services |
| `/{service-slug}` | 11 | Individual service detail pages (11 services) | https://www.cerclai.fr/creation-site-internet, https://www.cerclai.fr/agent-vocal-ia |
| `/{profession}` | 3 | Professional segment landing pages | https://www.cerclai.fr/artisans, https://www.cerclai.fr/commerces |
| `/subventions` | 1 | Subsidies hub - region/departement selector with 100+ aids | https://www.cerclai.fr/subventions |
| `/subventions/{category}` | 5 | Subsidies by service category (site-internet, IA, cybersecurite, logiciel, formation-ia) | https://www.cerclai.fr/subventions/site-internet, https://www.cerclai.fr/subventions/intelligence-artificielle |
| `/subventions/{region}` | 16 | Subsidies by French region (metropolitan + DOM-TOM) | https://www.cerclai.fr/subventions/ile-de-france, https://www.cerclai.fr/subventions/auvergne-rhone-alpes |
| `/subventions/{region}/{departement}` | 35 | Subsidies by department with detailed aid listings | https://www.cerclai.fr/subventions/auvergne-rhone-alpes/ardeche, https://www.cerclai.fr/subventions/nouvelle-aquitaine/gironde |
| `/{static-page}` | 8 | Static pages: methode, a-propos, contact, realisations, barometre, rejoindre, mentions-legales, confidentialite | https://www.cerclai.fr/contact, https://www.cerclai.fr/a-propos |
| `/{auth-page}` | 4 | Auth pages: connexion, inscription, mot-de-passe-oublie, nouveau-mot-de-passe | https://www.cerclai.fr/connexion, https://www.cerclai.fr/inscription |
| `/{success-page}` | 1 | Thank you page after form submission | https://www.cerclai.fr/merci |

### Backend et services

| Type | Service / endpoint | Usage | Preuve |
|---|---|---|---|
| Supabase | `nwzpwsvmlawsybkoirhc.supabase.co` | Authentication (email/password), database (profiles, consultants, client_missions), storage (CV uploads), RPC functions (claim_my_consultant, claim_my_missions) | Supabase client initialized in index-Ceu-DYoV.js with anon key; tables: profiles, consultants, client_missions; RPC: cla |

### Règles métier trouvées dans le code

- **Subsidy eligibility: aids filtered by user profile (salarié, indépendant, auto-entrepreneur), department, and service category needed** — `assets/subventions-VqmvplbI.js (filtering functions me, ue, hs)` : `filter by: statut (ouvert/ferme), effectif_min/max, prestataire (libre/impose/referencement_requis), region, departements`
- **Subsidy amounts vary by type: subventions (20-70% of eligible expenses, capped), prêts (0% interest, 3000-20000€), formations (50-100% financed), accompagnement gratuit (free advisory)** — `assets/subventions-VqmvplbI.js (embedded aid data)` : `Subvention de 70% des dépenses éligibles (2800-7000€); Prêt à 0% de 3000 à 20000€; Modules financés de 50 à 100%; Gratuit, entièrement pris en charge`
- **CV file upload limited to 10 MB, accepted formats validated** — `assets/Form-pRvGX3eB.js (file upload component)` : `g.size>10485760 (10MB limit); format validation against accepted extensions`
- **Password minimum length is 6 characters for signup** — `assets/SignupPage-DVdjwhL8.js` : `l.length<6 (password validation)`
- **Email format validated with regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/** — `assets/LoginPage-ByPtrSV2.js, assets/SignupPage-DVdjwhL8.js, assets/ConsultantForm-Bpg2EL6d.js` : `se=/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- **Subsidies verified twice from official sources, data refreshed (last: 2026-10-18)** — `assets/subventions-VqmvplbI.js` : `Chaque aide affichée a été vérifiée deux fois sur sa source officielle (deux relectures indépendantes)`

### Contrôles interactifs (testés ensuite par les agents visuels)

| Page | Type | Libellé | Valeurs | Paramètre URL |
|---|---|---|---|---|
| /subventions | select | Type d'aide (filter) | tout, subvention, cheque, pret, formation_financee, accompagnement, accompagnement_gratuit | type |
| /subventions | select | Région (filter) | Toutes les régions, Auvergne-Rhône-Alpes, Bourgogne-Franche-Comté, Bretagne, Centre-Val de Loire, Corse, Grand Est, Guadeloupe, Hauts-de-France, Île-de-France | region |
| /subventions/{region} | select | Département (filter) | All 101 French departments + DOM-TOM | departement |
| /subventions/{region}/{departement} | select | Situation / profil (filter) | Salarié, Indépendant, Auto-entrepreneur, Autre | profil |
| /subventions/{region}/{departement} | checkbox | Services éligibles (filter) | site-internet, reseaux-sociaux, crm-logiciel-metier, cybersecurite, intelligence-artificielle | besoin |
| /contact | select | Votre métier | Commerce, Cabinet / profession libérale, Garage, Hôtellerie / restauration, Services à domicile, Industrie / PME, Autre, Artisan / BTP |  |
| /contact | select | Ce qui vous prend le plus de temps | Les devis le soir, les appels manqués, les relances… |  |
| /contact | button | Choisir un créneau |  |  |
| /contact | button | Être rappelé |  |  |
| /rejoindre | select | École | CentraleSupélec, Mines, Ponts, Télécom Paris, ENSAE / ENSAI, INSA, UTC / UTT, Ensimag, EPITA, Epitech |  |
| /rejoindre | select | Année d'études / expérience | En formation, Diplômé depuis, 1re à 3e année, 4e / 5e année, Moins d'1 an, 1 à 2 ans, 2 à 3 ans, 3 à 5 ans, 5 ans et plus |  |
| /rejoindre | checkbox | Compétences (tags) | Backend, Frontend, Fullstack, Data / IA, DevOps / Cloud, Mobile, Sécurité, Design, Chef de projet |  |
| /rejoindre | button | Déjà membre? Se connecter |  |  |
| /barometre | select | École | CentraleSupélec, Mines, Ponts, Télécom Paris, ENSAE / ENSAI, INSA, UTC / UTT, Ensimag, EPITA, Epitech |  |
| /barometre | select | Poste / rôle | Backend, Frontend, Fullstack, Data / IA, DevOps / Cloud, Mobile |  |
| /connexion | button | Mot de passe oublié |  |  |
| /connexion | button | Créer un compte |  |  |

### Formulaires

- **/contact** — Contact form - request free 30-min exchange → `POST (to Supabase) Supabase (client_missions table + email)` : firstName (text, requis), lastName (text, requis), phone (tel, requis), metier (select, requis), ville (text, requis), besoin (select), email (email), callback (radio)
- **/rejoindre** — Consultant application form - talent recruitment → `POST (to Supabase storage + consultants table) Supabase (consultants table + storage CV upload)` : firstName (text, requis), lastName (text, requis), email (email, requis), phone (tel), linkedin (url), experience (select), tjm (number), availability (text), bio (textarea, requis), skills (tags), cv (file)
- **/barometre** — Salary survey - compare your situation → `POST (to Supabase) Supabase (survey responses table)` : school (select, requis), status (select, requis), role (select, requis), salary (number, requis)
- **/connexion** — Login form → `POST (Supabase Auth) Supabase Auth (signInWithPassword)` : email (email, requis), password (password, requis)
- **/inscription** — Signup form → `POST (Supabase Auth) Supabase Auth (signUp)` : firstName (text, requis), lastName (text, requis), email (email, requis), password (password, requis), passwordConfirm (password, requis)
- **/mot-de-passe-oublie** — Password reset request → `POST (Supabase Auth) Supabase Auth (resetPasswordForEmail)` : email (email, requis)

### Routes déclarées dans le code

`/`, `/services`, `/creation-site-internet`, `/agent-vocal-ia`, `/logiciel-crm-sur-mesure`, `/chatbot-ia`, `/automatisation-ia`, `/cybersecurite-pme`, `/mise-en-conformite-rgpd`, `/formation-ia-entreprise`, `/gestion-reseaux-sociaux`, `/artisans`, `/commerces`, `/professions-liberales`, `/realisations`, `/subventions`, `/subventions/:a`, `/subventions/:region/:departement`, `/methode`, `/a-propos`, `/contact`, `/rejoindre`, `/barometre`, `/mentions-legales`, `/confidentialite`, `/merci`, `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, `/mission`, `/espace/*`, `/espace-client/*`, `/admin/*`

### Sources de données

- Subsidies database (100+ public aids with eligibility data) — `assets/subventions-VqmvplbI.js (hardcoded embedded JSON)` (~233 KB embedded in JS bundle)
- Route/page configuration (titles, descriptions, SEO metadata) — `assets/index-Ceu-DYoV.js (routes array) + assets/routes-meta-CqKSLCtc.js` (embedded in main bundle)
- Service categorization (4 chapters, 11 services) — `assets/index-Ceu-DYoV.js (wt array)` (embedded in main bundle)
- Consultant skills options — `assets/ConsultantForm-Bpg2EL6d.js + assets/skills-0hrn5plM.js` (embedded in JS)

---

## 1. Vue d'ensemble

CerclAI is a French AI consulting firm serving TPE, PME, and large enterprises. They offer web development, AI agents, CRM software, chatbots, automation, cybersecurity, and training services. They also help businesses find government digital aid subsidies.

### Plan du site

| Vue | Route | Rôle |
|---|---|---|
| Homepage | `https://www.cerclai.fr/` | Landing page with hero, services overview, trust signals, testimonials, and CTA |
| Services | `https://www.cerclai.fr/services` | Detailed listing of all 9 services with descriptions |
| Réalisations | `https://www.cerclai.fr/realisations` | Portfolio of completed projects organized by category |
| Aides (Subventions) | `https://www.cerclai.fr/subventions` | Government digital aid finder with interactive map and filters |
| À propos | `https://www.cerclai.fr/a-propos` | Company information, team, philosophy, and stats |
| Méthode | `https://www.cerclai.fr/methode` | 6-step project methodology from free diagnostic to follow-up |
| Contact | `https://www.cerclai.fr/contact` | Contact form and CEO information for free 30-min consultation |
| Baromètre 2026 | `https://www.cerclai.fr/barometre` | 10-question quiz about junior tech talent salaries with free results |
| Mentions Légales | `https://www.cerclai.fr/mentions-legales` | Legal information about the website |
| Politique de Confidentialité | `https://www.cerclai.fr/confidentialite` | Privacy policy with data collection details |
| Espace Membre / Connexion | `https://www.cerclai.fr/connexion` | Member login page for registered users |
| Modèle /{service-slug} (11 pages) | `https://www.cerclai.fr/creation-site-internet` | Individual service detail pages (11 services) |
| Modèle /{profession} (3 pages) | `https://www.cerclai.fr/artisans` | Professional segment landing pages |
| Modèle /subventions/{category} (5 pages) | `https://www.cerclai.fr/subventions/site-internet` | Subsidies by service category (site-internet, IA, cybersecurite, logiciel, formation-ia) |
| Modèle /subventions/{region}/{departement} (35 pages) | `https://www.cerclai.fr/subventions/auvergne-rhone-alpes/ardeche` | Subsidies by department with detailed aid listings |
| Modèle /{success-page} (1 pages) | `https://www.cerclai.fr/merci` | Thank you page after form submission |

### Parcours utilisateur

- Browse services and read descriptions
- View portfolio projects by category
- Search government digital aids by department
- Filter aids by business type and size
- Take the 2026 tech salary barometer quiz
- Fill out contact form for free consultation
- Access member login space

## 2. Fonctionnalités en détail

### 2.1 Homepage

- **Rôle** : French AI consulting firm landing page for TPE, PME, and large enterprises. Shows services, process, team, FAQ, and contact CTA.
- **Route** : `https://www.cerclai.fr/`
- **Accès** : Navigate directly to https://www.cerclai.fr/
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/30932eaf-5b30-431e-8fae-6527ca7380d5 (205 s, 48 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/assets/css/style.css`, `https://www.cerclai.fr/css`, `https://www.cerclai.fr/index.html`, `https://www.cerclai.fr/js`, `https://www.cerclai.fr/manifest.json`, `https://www.cerclai.fr/shots`, `https://www.cerclai.fr/sitemap.xml`, `https://www.cerclai.fr/static/css/main.css`, `https://www.cerclai.fr/style.css`

**Mise en page (haut → bas)**

- Sticky Header: Logo + Services dropdown + Réalisations + Aides + À propos + Rejoindre le cercle + Phone + CTA button
- Hero: H1 headline, subheadline, CTA button, supporting text, hero image (desktop planning + phone mockup)
- Services Overview (3 sections): Être trouvé et choisi, Gagner du temps avec l'IA, Gérer et protéger - each with links and demo screenshots
- Pricing: 'Un prix ferme, écrit avant de commencer.'
- Actualités: 18 octobre 2026 news + Baromètre 2026 link
- Process: 'Comment ça start' - 3 numbered steps
- Team: Jérémie Gallula photo + text + 'Voir la méthode en détail' link
- FAQ: 3 accordion questions with expand/collapse
- Final CTA: 'Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.' + button
- Footer: Services + Métiers + Aides + CerclAI + Contact columns + bottom links

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| logo | cerclai | Links to home page / |  |
| nav_link | Services ▾ | Dropdown menu with 9 services in 3 columns on hover |  |
| nav_link | Réalisations | Links to /realisations |  |
| nav_link | Aides | Links to /subventions |  |
| nav_link | À propos | Links to /a-propos |  |
| nav_link | Rejoindre le cercle | Links to /rejoindre |  |
| phone | 07 68 74 61 26 | Tel link: tel:+33768746126 |  |
| button | Demander un échange → | Links to /contact, blue pill button with hover state |  |
| heading | Cabinet de conseil en IA pour les TPE, PME et grandes entreprises. | H1 hero headline, serif font, period after 'entreprises' in blue |  |
| text | Un site internet qui attire de nouveaux clients, un agent vocal IA qui répond à vos appels et un logiciel qui centralise vos devis, rendez-vous et contacts. Avec CerclAI, tout est connecté pour simplifier votre quotidien et développer votre activité. | Hero subheadline paragraph |  |
| button | Demander mon échange gratuit → | CTA button, links to /contact, blue pill button |  |
| text | 30 minutes au téléphone ou en visio, sans engagement. | CTA subtitle below button |  |
| image | Hero composite image: desktop planning + phone mockup (Maison de la Serrurerie) | Static image showing CRM interface and AI voice agent |  |
| link | Création de site internet | Links to /creation-site-internet |  |
| link | Chatbot IA | Links to /chatbot-ia |  |
| link | Réseaux sociaux | Links to /gestion-reseaux-sociaux |  |
| link | Agent vocal IA | Links to /agent-vocal-ia |  |
| link | Automatisation IA | Links to /automatisation-ia |  |
| link | Formation IA | Links to /formation-ia-entreprise |  |
| link | Logiciel de gestion et CRM | Links to /logiciel-crm-sur-mesure |  |
| link | Cybersécurité | Links to /cybersecurite-pme |  |
| link | Conformité RGPD | Links to /mise-en-conformite-rgpd |  |
| link | Voir la méthode en détail | Links to /methode |  |
| accordion | J'ai déjà un logiciel (Planity, EBP, Batappli…). Faut-il tout changer ? | Click to expand: 'Non. On garde ce qui fonctionne et on le relie au reste.' |  |
| accordion | Vous travaillez près de chez moi ? | Click to expand: 'Oui. On travaille partout en France, en visio ou par téléphone.' |  |
| accordion | Qui travaille sur mon projet ? | Click to expand: 'Les talents du cercle, sélectionnés sur dossier et entretien : chaque projet réunit les métiers dont il a besoin.' |  |
| button | Demander mon échange gratuit → | Final CTA button, links to /contact |  |
| link | LinkedIn | Links to https://www.linkedin.com/company/cercl-ai/ |  |
| link | Instagram | Links to https://www.instagram.com/cerclai/ |  |
| link | Rejoignez le cercle → | Links to /rejoindre |  |
| link | Baromètre 2026 | Links to /barometre |  |
| link | Mentions légales | Links to /mentions-legales |  |
| link | Confidentialité | Links to /confidentialite |  |
| link | Connexion | Links to /connexion |  |

**Contenu (textes exacts)**

- Cabinet de conseil en IA pour les TPE, PME et grandes entreprises.
- Un site internet qui attire de nouveaux clients, un agent vocal IA qui répond à vos appels et un logiciel qui centralise vos devis, rendez-vous et contacts. Avec CerclAI, tout est connecté pour simplifier votre quotidien et développer votre activité.
- Demander mon échange gratuit
- 30 minutes au téléphone ou en visio, sans engagement.
- Être trouvé et choisi.
- Gagner du temps avec l'IA.
- Gérer et protéger.
- Un prix ferme, écrit avant de commencer.
- On établit le périmètre avec vous, puis on revient avec le devis.
- Actualités.
- 18 octobre 2026 : relevé de 153 aides au numérique, région par région
- Baromètre 2026 des talents tech
- Comment ça start.
- Un échange de 30 minutes, gratuit.
- Vous nous dites ce que vous voulez et ce qui se répète chaque semaine. On vous dit ce qu'on automatise.
- Une proposition chiffrée.
- Ce qui est livré et quand, noir sur blanc.
- La mise en service, puis le suivi.
- Votre site, vos données et vos accès vous appartiennent.
- Jérémie Gallula
- Jérémie vous rappel sous 48 h ouvrées et suivre votre projet.
- Voir la méthode en détail
- Vos questions.
- J'ai déjà un logiciel (Planity, EBP, Batappli…). Faut-il tout changer ?
- Non. On garde ce qui fonctionne et on le relie au reste.
- Vous travaillez près de chez moi ?
- Oui. On travaille partout en France, en visio ou par téléphone.
- Qui travaille sur mon projet ?
- Les talents du cercle, sélectionnés sur dossier et entretien : chaque projet réunit les métiers dont il a besoin.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.
- © 2026 CerclAI

**Interactions testées**

- Clicked 'Compris' cookie consent button → Cookie banner dismissed
- Hovered over 'Services' in nav → Dropdown appeared with 3 columns of 3 services each, all with taglines and links
- Clicked 'Tous les services' in dropdown → Navigated to /services page (separate page, 6400px tall)
- Went back to homepage → Returned to / with full page content
- Hovered over 'Demander mon échange gratuit' button → Button hover state visible - slightly brighter/white background
- Clicked first FAQ question → Expanded to show answer, icon changed from + to ×, other questions collapsed
- Clicked second FAQ question → Expanded to show answer, first question collapsed back to +
- Clicked third FAQ question → Expanded to show answer

**Règles de fonctionnement**

- [unrated] Services dropdown appears on hover and shows 9 services in 3 category columns (Être trouvé et choisi, Gagner du temps avec l'IA, Gérer et protéger) — _preuve : Observed dropdown with all 9 services and taglines when hovering over Services nav item_
- [unrated] FAQ accordion: clicking a question expands it and collapses any other open question (single-open behavior) — _preuve : Clicked 3 questions sequentially; only one was open at a time, icon toggled between + and ×_
- [unrated] CTA buttons link to /contact page — _preuve : Both 'Demander un échange' (nav) and 'Demander mon échange gratuit' (body + footer) buttons link to /contact_
- [unrated] All content is static - no API calls or dynamic data loading — _preuve : HTML fetched directly shows all content hardcoded; no JavaScript framework detected in fetch response_
- [unrated] Header is sticky - remains visible when scrolling — _preuve : Header remained at top of viewport throughout all scrolling_

**Données & technique**

- All content is static HTML - no API calls, no dynamic data fetching observed. Site appears to be a static site (likely Next.js SSG). Images served from /shots/ and /equipe/ directories. All text content is hardcoded in the HTML. No CSS/JS files found at standard paths - likely served as part of the HTML or from a CDN not accessible via simple URL paths.
- Routes are flat paths: /, /services, /creation-site-internet, /agent-vocal-ia, /logiciel-crm-sur-mesure, /chatbot-ia, /automatisation-ia, /cybersecurite-pme, /mise-en-conformite-rgpd, /formation-ia-entreprise, /gestion-reseaux-sociaux, /artisans, /commerces, /professions-liberales, /realisations, /subventions, /methode, /a-propos, /contact, /rejoindre, /barometre, /mentions-legales, /confidentialite, /connexion

**Style visuel**

- Primary blue: #2563EB (buttons, links, footer background)
- Dark navy/black: #1a1a2e or #111 (headings, logo)
- Gray text: #555 or #666 (body text)
- Background: Off-white/cream textured (#f5f0e8 or similar) with paper-like texture
- Footer: Solid blue #2563EB
- Headings: Serif font (Playfair Display or similar)
- Body text: Sans-serif font
- CTA buttons: Rounded pill shape, blue fill, white text, arrow → on right
- Hero period after 'entreprises' in blue
- Images: Rounded corners, subtle shadows

**Cas limites / anomalies**

- The 'Confidentialité' footer link shows as 'Confalizados' in the raw HTML - possible encoding issue
- No visible carousel arrows on hero image despite 3 dots suggesting a carousel
- The page is 8,461px tall - very long single-page layout
- No testimonial carousel visible on the final page (observed in earlier screenshots may have been from a different view)

**Questions ouvertes**

- What is the exact color value of the CerclAI blue? (estimated #2563EB)
- What CSS framework or custom CSS is used? (couldn't access CSS files)
- What is the exact serif font used for headings?
- Why does the hero image show 3 dots but no navigation arrows? Is it a carousel or static?
- What technology stack is used? (couldn't determine from available source)

**Pour la reconstruire**

- Create sticky header with logo, Services dropdown (3 columns × 3 services), and right-side nav with phone + CTA button
- Build hero section with large serif H1, subheadline, blue CTA button, and composite hero image (desktop + phone mockup)
- Create 3 service sections with links and demo screenshots (chatbot conversation, automation workflow, CRM dashboard + cybersecurity checklist)
- Add pricing section with CTA to /subventions
- Add Actualités section with static text and Baromètre link
- Build 'Comment ça start' section with 3 numbered steps
- Add team section with Jérémie Gallula photo and 'Voir la méthode en détail' link
- Implement FAQ accordion with 3 questions (single-open behavior, +/× icons)
- Add final CTA section with heading and button
- Build blue footer with 5 columns of links + contact info + bottom bar with legal links
- Use serif font for headings, sans-serif for body text, off-white textured background, blue #2563EB as primary color
- All content is static - no backend needed for homepage

**Captures**

![Homepage 1](../../artifacts/RPT_20261107_221151_F01/step_01.png)
![Homepage 2](../../artifacts/RPT_20261107_221151_F01/step_18.png)
![Homepage 3](../../artifacts/RPT_20261107_221151_F01/step_34.png)

### 2.2 Services

- **Rôle** : Displays all 9 CerclAI services with descriptions and visual mockups, grouped into 4 thematic sections
- **Route** : `https://www.cerclai.fr/services`
- **Accès** : From home page: hover over 'Services' in nav → click 'Tous les services →' in dropdown, OR navigate directly to https://www.cerclai.fr/services
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/620b1b5a-cde4-41ab-b5c8-321213f02639 (135 s, 22 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/css`, `https://www.cerclai.fr/main.css`, `https://www.cerclai.fr/services`, `https://www.cerclai.fr/styles.css`

**Mise en page (haut → bas)**

- Sticky header: logo, nav links (Services, Réalisations, Aides, À propos), 'Rejoindre le cercle', phone 07 68 74 61 26, 'Demander un échange' button
- Breadcrumb: Accueil > Services
- Hero: headline 'Conseil en IA et outils numériques, pour les TPE, PME et grandes entreprises.', subtext, blue CTA 'Demander mon échange gratuit →', visual mockup (laptop + phone)
- Section 'Être trouvé et choisi.': 3 services (Création de site internet, Chatbot IA, Réseaux sociaux)
- Section 'Ne plus rien laisser filer.': 3 services (Agent vocal IA, Logiciel de gestion et CRM, Automatisation IA)
- Section 'Être protégé.' (dark bg): 2 services (Cybersécurité, Conformité RGPD)
- Section 'Faire progresser l'équipe.': 1 service (Formation IA)
- CTA section: 'Concentrez-vous sur votre métier...' + blue button
- Footer: links organized by Services, Métiers, Aides, CerclAI, Nous joindre

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| link | Services (nav) | Dropdown on hover showing 9 services in 3 columns |  |
| button | Demander un échange | Links to /contact |  |
| link | Tous les services → | Navigates to /services |  |
| button | Demander mon échange gratuit → | Links to /contact |  |
| link | Création de site internet → | Links to /creation-site-internet |  |
| link | Chatbot IA → | Links to /chatbot-ia |  |
| link | Réseaux sociaux → | Links to /gestion-reseaux-sociaux |  |
| link | Agent vocal IA → | Links to /agent-vocal-ia |  |
| link | Logiciel de gestion et CRM → | Links to /logiciel-crm-sur-mesure |  |
| link | Automatisation IA → | Links to /automatisation-ia |  |
| link | Cybersécurité → | Links to /cybersecurite-pme |  |
| link | Conformité RGPD → | Links to /mise-en-conformite-rgpd |  |
| link | Formation IA → | Links to /formation-ia-entreprise |  |

**Contenu (textes exacts)**

- Conseil en IA et outils numériques, pour les TPE, PME et grandes entreprises.
- Commencez par l'outil qui presse le plus. Les suivants s'y relieront, sans repartir de zéro.
- 30 minutes au téléphone ou en visio, sans engagement.
- Être trouvé et choisi.
- Création de site internet — Un site rapide sur téléphone, qui transforme les visites en appels et en rendez-vous.
- Chatbot IA — Il renseigne vos clients sur votre site, avec vos informations, et vous transmet le reste.
- Réseaux sociaux — Des publications régulières sur Instagram ou Facebook : on les prepare, vous les validez.
- Ne plus rien laisser filer.
- Agent vocal IA — Un standard téléphonique qui répond à votre place, trie les urgences et vous résume chaque appel par SMS.
- Logiciel de gestion et CRM — Clients, devis, acomptes, factures et planning dans un seul outil, au bureau comme sur le terrain.
- Automatisation IA — Les devis se relancent et les factures partent seules, selon des règles fixées avec vous.
- Être protégé.
- Cybersécurité — Un expert teste votre informatique comme le ferait un pirate, puis vous dit quoi corriger, par ordre d'urgence.
- Conformité RGPD — Le jour où un client ou la CNIL vous demande des comptes, la réponse est prête.
- Faire progresser l'équipe.
- Formation IA — Votre équipe apprend à utiliser l'IA pour ses e-mails, ses réponses aux clients et ses comptes rendus.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.

**Interactions testées**

- Hovered over Services in nav → Dropdown appeared showing 9 services in 3 columns with taglines
- Clicked Tous les services → in dropdown → Navigated to /services
- Clicked Compris on cookie banner → Cookie banner dismissed
- Scrolled through entire page → All 9 services visible in 4 sections, no animations or dynamic content

**Règles de fonctionnement**

- [confirmed] 9 services grouped into 4 sections: 'Être trouvé et choisi' (3), 'Ne plus rien laisser filer' (3), 'Être protégé' (2), 'Faire progresser l'équipe' (1) — _preuve : HTML source shows 4 <h2> section headers with services in that order_
- [confirmed] Each service name is a link to its dedicated page with blue arrow (→) — _preuve : HTML shows <a> tags with → for each service, blue color in CSS_
- [confirmed] All content is static, hardcoded in HTML — _preuve : HTML source contains all text and image URLs directly_
- [confirmed] Services dropdown in nav shows 3 columns of 3 services — _preuve : Observed dropdown with 3-column layout_
- [confirmed] Footer service list is in different order than displayed page — _preuve : Footer: Creation de site internet, Agent vocal IA, Logiciel de gestion et CRM, Chatbot IA, Automatisation IA, Cybersécurité, Conformité RGPD, Formation IA, Réseaux sociaux_

**Données & technique**

- All content static in HTML, no API calls
- Images hosted at https://www.cerclai.fr/shots/ (WebP format)
- No JavaScript frameworks detected in page source
- No dynamic data or fetch requests observed

**Style visuel**

- Light textured/off-white background
- Blue primary color for buttons/links (approx #2563EB)
- Dark near-black text for headings
- Clean sans-serif typography
- Generous padding, card-based layout
- Rounded device frame mockups (laptop, phone)
- Thin horizontal dividers between sections
- Dark background for 'Être protégé' section only

**Cas limites / anomalies**

- No carousels, tabs, filters, or toggles on this page
- No animations observed
- Page is 6400px tall, fully scrollable

**Questions ouvertes**

- Exact hex color values for blue and other colors
- Font family and sizes used
- CSS framework or custom styles

**Pour la reconstruire**

- Create 4 sections with h2 headers: 'Être trouvé et choisi.', 'Ne plus rien laisser filer.', 'Être protégé.', 'Faire progresser l'équipe.'
- Each service: bold name with blue → link + one-line description + right-aligned visual mockup
- 'Être protégé' section needs dark background
- Hero section with large headline, subtext, blue CTA button, and device mockup composite image
- Footer with 5 link groups: CerclAI, Services (9), Métiers (3), Aides (6), Nous joindre

**Captures**

![Services 1](../../artifacts/RPT_20261107_221151_F02/step_01.png)
![Services 2](../../artifacts/RPT_20261107_221151_F02/step_08.png)
![Services 3](../../artifacts/RPT_20261107_221151_F02/step_14.png)

### 2.3 Réalisations

- **Rôle** : Showcase completed projects organized by category: client websites, custom software, in-house AI products, and example sites by trade.
- **Route** : `https://www.cerclai.fr/realisations`
- **Accès** : From home page, click "Réalisations" in the top navigation bar (between "Services" and "Aides").
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/3b0a431b-a258-463b-8425-0e7c10463f54 (88 s, 20 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/manifest.json`, `https://www.cerclai.fr/realisations`, `https://www.cerclai.fr/robots.txt`, `https://www.cerclai.fr/sitemap.xml`

**Mise en page (haut → bas)**

- Header/nav bar with logo, Services, Réalisations (active), Aides, À propos, phone, CTA button
- Breadcrumb: Accueil > Réalisations
- Page title: 'Ce que nous avons construit.'
- 4 category tab labels with counts: Sites internet (3), Logiciels de gestion (3), Produits CerclAI (4), Exemples (5)
- Section 1: 'Les sites de nos clients.' with 3 project cards (desktop+mobile mockups)
- Section 2: 'Des logiciels de gestion sur mesure.' with 3 project cards (3-column grid)
- Section 3: 'Des projets nés de notre expertise.' with 4 mobile mockups
- Section 4: 'Exemples par métier.' with 5 mobile mockups
- Footer CTA: 'Concentrez-vous sur votre métier...' + 'Demander mon échange gratuit'
- Full footer with services, métiers, aides, CerclAI links, contact, social, copyright

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| nav-link | Réalisations | Navigates to /realisations |  |
| tab-label | Sites internet 3 | Non-functional, no visible effect when clicked |  |
| tab-label | Logiciels de gestion 3 | Non-functional, no visible effect when clicked |  |
| tab-label | Produits CerclAI 4 | Non-functional, no visible effect when clicked |  |
| tab-label | Exemples 5 | Non-functional, no visible effect when clicked |  |
| link | Découvrez notre service de création de sites internet → | Navigates to /creation-site-internet |  |
| link | Le service de logiciel de gestion et CRM → | Navigates to /logiciel-crm-sur-mesure |  |
| link | Voir le site → (Sweness) | Opens https://sweness.com in new tab |  |
| link | Voir le site → (Eco Star) | Opens https://eco-star.fr in new tab |  |
| link | Voir le site (Schemai) | Opens https://schemai.fr in new tab |  |
| link | Voir le site (Diyouk) | Opens https://diyouk.com in new tab |  |
| link | Voir le site (Clariforme) | Opens https://clariforme.com in new tab |  |
| button | Demander mon échange gratuit | Navigates to /contact |  |
| image | Device mockups (desktop+iPhone) for each project | Static images served from /shots/opt/ |  |

**Contenu (textes exacts)**

- Ce que nous avons construit.
- Les sites de nos clients. Des clients, des liens concrets, des réalisations qui parlent d'elles-mêmes. Découvrez les entreprises qui nous font confiance et les solutions que nous avons développées pour elles.
- Perfect Body by Anna — Cabinet de bien-être · Levallois‑Perret — Site vitrine : prestations, avis clients, bouton de prise de rendez-vous.
- sweness.com — Marque de mode — Boutique en ligne : collection, panier, paiement.
- Eco Star — Rénovation énergétique — Site vitrine, rendez-vous en ligne, demande de rappel.
- Des logiciels de gestion sur mesure.
- Festivo — Événementiel — Planning des prestations, acomptes à réclamer, tâches du jour.
- Gestion de cabinet — Expertise comptable — Planning de l'équipe, échéances fiscales, suivi des déclarations.
- Elize — Clinique vétérinaire — Dossiers patients, consultation dictée, facturation.
- Des projets nés de notre expertise. Des solutions imaginées et développées en interne, qui reflètent notre savoir-faire en développement logiciel et en intelligence artificielle.
- Schemai — Agent vocal IA — Le site du produit : un appel à écouter, une démo à demander.
- Diyouk — Assistant IA pour les visios — Une application web, Mac et Windows.
- Clariforme — Cadrage de logiciel — De l'idée aux instructions complètes pour la faire développer.
- Maquette — Aménagement intérieur — Plan coté, vue 3D, vrais meubles et vrais prix.
- Exemples par métier. Les entreprises et les numéros sont fictifs.
- Serrurerie — Site d'artisan · Paris — Dépannage jour et nuit, prix annoncé, appel direct.
- Plomberie, chauffage — Site d'artisan · Nantes — Fuite ou panne, devis gratuit, réponse sous 24 h ouvrées.
- Ostéopathie — Site de cabinet · Bordeaux — Rendez-vous en ligne, tarifs, accès.
- Bistrot — Site de restaurant · Lyon — L'ardoise du midi, la carte, la réservation d'une table.
- Garage automobile — Logiciel de gestion — Planning des ponts, devis, relances par SMS.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.

**Interactions testées**

- Clicked category tabs (Sites internet, Logiciels de gestion, Produits CerclAI, Exemples) → No visible effect. All content sections remain visible. Tabs appear decorative/non-functional.
- Clicked 'Voir le site' links on Sweness, Eco Star, Schemai, Diyouk, Clariforme → Links navigate to external domains (sweness.com, eco-star.fr, schemai.fr, diyouk.com, clariforme.com)
- Clicked 'Découvrez notre service de création de sites internet →' → Navigates to /creation-site-internet
- Clicked 'Le service de logiciel de gestion et CRM →' → Navigates to /logiciel-crm-sur-mesure

**Règles de fonctionnement**

- [unrated] All 15 projects are hard-coded static content in the HTML, no API calls — _preuve : Source HTML contains all project text and image URLs inline_
- [unrated] Category tabs are non-functional decorative elements — _preuve : Clicking tabs produces no visual change; all content shown sequentially_
- [unrated] Projects ordered: Sites internet (3) → Logiciels de gestion (3) → Produits CerclAI (4) → Exemples (5) — _preuve : Fixed HTML order, matches tab badge counts_
- [unrated] Only 5 projects have external 'Voir le site' links; others are CerclAI internal only — _preuve : Source shows links only for Sweness, Eco Star, Schemai, Diyouk, Clariforme_

**Données & technique**

- Static HTML page, no JS framework detected
- Images served from https://www.cerclai.fr/shots/opt/ (webp format)
- No JSON APIs, no dynamic data fetching
- Plain HTML/CSS, no visible JS bundles loaded on this page

**Style visuel**

- Light textured/off-white background
- Sans-serif typography, bold headings
- Blue links (#2563eb), blue CTA button
- Device mockups (desktop + iPhone) for visual presentation
- Horizontal rule separators between sections
- No animations or transitions observed

**Cas limites / anomalies**

- Category tabs are non-functional - they appear to be a UI element that was never wired to JavaScript
- Page is very long (5,562px) - all content visible by scrolling

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

- Hard-code all 15 projects in HTML with their descriptions and device mockup images
- Create 4 non-functional tab labels with project counts (3,3,4,5)
- Layout: single column scroll with sections separated by horizontal rules
- Device mockup images from /shots/opt/ directory
- External links for 5 projects only (Sweness, Eco Star, Schemai, Diyouk, Clariforme)

**Captures**

![Réalisations 1](../../artifacts/RPT_20261107_221151_F03/step_01.png)
![Réalisations 2](../../artifacts/RPT_20261107_221151_F03/step_06.png)
![Réalisations 3](../../artifacts/RPT_20261107_221151_F03/step_11.png)

### 2.4 Aides (Subventions)

- **Rôle** : Interactive government digital aid finder with interactive map, department search, and filters to help TPE/PME businesses discover available subsidies, grants, loans, and training funding in France for 2026.
- **Route** : `https://www.cerclai.fr/subventions`
- **Accès** : From the home page (https://www.cerclai.fr), click "Aides" in the top navigation bar (between "Réalisations" and "À propos"). This navigates to https://www.cerclai.fr/subventions.
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/b87b5acb-b9a2-40f4-b93e-8d693bde9bfa (172 s, 38 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/_next/static/main.js`, `https://www.cerclai.fr/data.json`, `https://www.cerclai.fr/js/main.js`, `https://www.cerclai.fr/robots.txt`, `https://www.cerclai.fr/sitemap.xml`, `https://www.cerclai.fr/static/css/main.css`, `https://www.cerclai.fr/subventions`, `https://www.cerclai.fr/subventions/auvergne-rhone-alpes`

**Mise en page (haut → bas)**

- 1. Header: Logo (cerclai) + Nav (Services, Réalisations, Aides, À propos) + "Rejoindre le cercle" + phone + "Demander un échange" button
2. Breadcrumb: Accueil > Aides
3. Hero section: H1 "Aides au numérique 2026 : ne passez pas à côté des dernières opportunités." + paragraph text about Dec 31, 2026 deadline
4. "Découvrez les aides disponibles près de chez vous →" link
5. Department form: "Votre département" label + search input (placeholder "Nom ou numéro, par exemple 69") + "Votre situation" dropdown + "Nombre de salariés" (0, 1-9, 10-49, 50+) + "Je suis en micro-entreprise" checkbox + "Voir les [N] aides" button
6. Interactive France map (dot grid) showing departments with subsidy counts, Outremers (971-976), legend, info card
7. "Les aides région par région" - 18 region cards (3 subventions régionales format)
8. "Les aides par projet" - 5 project category cards
9. "Partout en France" - national aids section with expandable items
10. "Formation financée" section with "Voir les 10 dispositifs" link
11. "Comment ce relevé est fait" - 3-step methodology
12. CTA: "Concentrez-vous sur votre métier..." + "Savoir à quelles aides je suis éligible" button
13. Footer: full site footer

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| navigation | cerclai | Services | Réalisations | Aides | À propos | Rejoindre le cercle | 07 68 74 61 26 | Demander un échange | Top sticky navigation bar |  |
| heading | Aides au numérique 2026 : ne passez pas à côté des dernières opportunités. | H1 hero heading |  |
| text | Certaines aides financières prennent fin le 31 décembre 2026. Votre entreprise pourrait bénéficier d'un financement pour créer son site internet, développer un logiciel ou moderniser ses outils numériques. N'attendez pas la clôture des dispositifs. Sélectionnez votre département pour découvrir les aides encore disponibles, les montants proposés et les conditions pour en bénéficier. | Hero description paragraph |  |
| link | Découvrez les aides disponibles près de chez vous → | Blue text link, navigates to same page (anchor or scroll) |  |
| search_input | Votre département - Nom ou numéro, par exemple 69 | Autocomplete search: type department number (e.g. 69) or name, dropdown shows matching departments, select to navigate to region+department page |  |
| dropdown | Votre situation - Toutes situations | Artisan | Commerçant | Profession libérale | Entreprise de services | Filters aids by user profile/eligibility on regional/department pages |  |
| segmented_control | Nombre de salariés - 0 | 1-9 | 10-49 | 50+ | Filters aids by company size on department pages |  |
| checkbox | Je suis en micro-entreprise | Toggles micro-enterprise filter on department pages |  |
| button | Voir les 27 aides → | Blue button, navigates to region+department page showing filtered aids |  |
| map | Interactive France map with department dot grid | Shows all French departments as dots with subsidy counts, highlights selected region, Outremers shown separately |  |
| card | Auvergne-Rhône-Alpes - 3 subventions régionales · jusqu'à 10 000 € - Rhône (69) : 27 aides, dont 3 subventions | Info card showing selected region/department summary |  |
| region_cards | 18 regions with aid counts (e.g. 'Auvergne-Rhône-Alpes 3 subventions régionales, 41 aides en tout') | Navigation cards to regional pages |  |
| project_cards | 5 project categories (Site internet 77 aides, Intelligence artificielle 58 aides, etc.) | Navigation cards to project-specific aid pages |  |
| expandable_list | Partout en France national aids with 'Voir les 5 autres aides nationales' expand | Accordion-style expandable national aid items |  |
| methodology_section | Comment ce relevé est fait - 3 steps | Static informational content |  |
| cta_button | Savoir à quelles aides je suis éligible | Navigates to /contact |  |

**Contenu (textes exacts)**

- Page title: "Aides au numérique 2026 pour TPE et PME, par département"
Subtitle: "153 aides publiques relevées le 18/10/2026 sur les sites officiels : subventions, chèques numériques, prêts, formations financées, par département."

Hero text: "Certaines aides financières prennent fin le 31 décembre 2026. Votre entreprise pourrait bénéficier d'un financement pour créer son site internet, développer un logiciel ou moderniser ses outils numériques. N'attendez pas la clôture des dispositifs. Sélectionnez votre département pour découvrir les aides encore disponibles, les montants proposés et les conditions pour en bénéficier."

Region cards:
- Auvergne-Rhône-Alpes: 3 subventions régionales, 41 aides en tout
- Bourgogne-Franche-Comté: 3 aides de la région, 21 aides en tout
- Bretagne: 1 subvention régionale, 20 aides en tout
- Centre-Val de Loire: 3 subventions régionales, 23 aides en tout
- Corse: 3 subventions régionales, 23 aides en tout
- Grand Est: 4 subventions régionales, 32 aides en tout
- Guadeloupe: 1 subvention régionale, 20 aides en tout
- Guyane: Aides nationales, 19 aides en tout
- Hauts-de-France: 2 subventions régionales, 39 aides en tout
- Île-de-France: 4 subventions régionales, 24 aides en tout
- La Réunion: 3 subventions régionales, 23 aides en tout
- Martinique: 1 aide de la région, 20 aides en tout
- Mayotte: Aides nationales, 19 aides en tout
- Normandie: 3 subventions régionales, 29 aides en tout
- Nouvelle-Aquitaine: 2 subventions régionales, 41 aides en tout
- Occitanie: 2 subventions régionales, 23 aides en tout
- Pays de la Loire: 2 subventions régionales, 23 aides en tout
- Provence-Alpes-Côte d'Azur: 1 subvention régionale, 25 aides en tout

Project cards:
- Site internet: 77 aides, dont 56 subventions
- Intelligence artificielle: 58 aides, dont 40 subventions
- Cybersécurité: 57 aides, dont 25 subventions
- Logiciel: 100 aides, dont 77 subventions
- Formation IA: 24 aides, dont 1 subvention

National aids (Partout en France):
- Accompagnement: MonAideCyber – diagnostic cyber gratuit (« Cyberdépart ») - Gratuit (diagnostic de 1 h 30)
- Accompagnement: France Num – Activateurs (premier rendez-vous gratuit), test de maturité et formations gratuits - Gratuit (premier rendez-vous et ressources)
- Prêt: Prêt Boost – Commerce de proximité - Prêt de 5 000 € à 100 000 € (à rembourser, ce n'est pas une subvention)
- Prêt: Prêt Boost – Intelligence artificielle - Prêt de 5 000 € à 100 000 € (à rembourser, ce n'est pas une subvention)
- (5 more hidden behind "Voir les 5 autres aides nationales")

Formation financée: OPCO, AGEFICE, FAFCEA, FIF PL, CPF - "Ces fonds peuvent payer votre formation ou celle de vos salariés. Presque tous exigent un organisme de formation référencé, souvent certifié Qualiopi."

Methodology:
1. Sur les sites officiels - "Chaque aide vient de la page de son financeur (Région, agglomération, chambre consulaire, Bpifrance, État), citée telle quelle, avec le lien."
2. Vérifié deux fois - "Deux relectures indépendantes de chaque aide sur sa source officielle ; au moindre écart, on rouvre la source. Seules les aides ouvertes ou annoncées en 2026 sont affichées. Dernière vérification complète : le 18 octobre 2026."
3. Contrôlé chaque mois - "Un contrôle automatique rouvre chaque source et repère les liens morts et les dates limites passées. Une aide expirée quitte la page."

**Interactions testées**

- Clicked 'Aides' in top nav from home page → Navigated to https://www.cerclai.fr/subventions
- Clicked 'Toutes situations' dropdown → Opened dropdown showing: Toutes situations, Artisan, Commerçant, Profession libérale, Entreprise de services. Map departments turned blue (highlighted).
- Typed '69' in department search → Dropdown appeared showing '69 Rhône - Auvergne-Rhône-Alpes' as option
- Selected 'Rhône (69)' from dropdown → Department selected, 'Voir les 27 aides' button appeared, map tooltip showed '3 · jusqu'à 10 000 €', info card showed 'Auvergne-Rhône-Alpes: 3 subventions régionales · jusqu'à 10 000 €' and 'Rhône (69) : 27 aides, dont 3 subventions'
- Clicked 'Voir les 27 aides' button → Navigated to https://www.cerclai.fr/subventions/auvergne-rhone-alpes/rhone - department page showing 'Aides au numérique dans le Rhône et à Lyon (2026)' with '5 aides régionales et 18 aides nationales, relevées le 18 octobre 2026'
- Scrolled to see department page filters → Found: 'Votre situation' dropdown (Toutes situations, Artisan, Commerçant, Profession libérale, Entreprise de services), 'Nombre de salariés' segmented (0, 1-9, 10-49, 50+), 'Je suis en micro-entreprise' checkbox, filter tabs (Tout, Site internet, Logiciel & CRM, IA & automatisation, Cybersécurité & RGPD, Réseaux sociaux, Formation)
- Navigated back to /subventions → Returned to main page, department still selected as Rhône (69)

**Règles de fonctionnement**

- [unrated] Department search: Type department number (e.g. '69') or name in 'Votre département' field. Autocomplete dropdown shows matching departments. Selecting a department shows 'Voir les [N] aides' button and navigates to /subventions/{region-slug}/{dept-slug} when clicking that button. — _preuve : Typed '69' → showed '69 Rhône - Auvergne-Rhône-Alpes'. Selected it → 'Voir les 27 aides' button appeared. Clicked it → navigated to /subventions/auvergne-rhone-alpes/rhone_
- [unrated] The 'Votre situation' dropdown on main page has 5 options: Toutes situations, Artisan, Commerçant, Profession libérale, Entreprise de services. Selecting a value highlights departments on the map but does NOT change URL or navigate. — _preuve : Clicked 'Toutes situations' → dropdown opened with 5 options. Map departments turned blue after opening dropdown. No URL change observed._
- [unrated] Regional pages are static HTML pages at /subventions/{region-slug}. Department pages at /subventions/{region-slug}/{dept-slug}. No URL query parameters are used for filtering. — _preuve : Navigated to /subventions/auvergne-rhone-alpes and /subventions/auvergne-rhone-alpes/rhone. Both are full static pages with all aid content embedded._
- [unrated] The 'Voir les [N] aides' button count reflects total aids (regional + national) for the selected department, not just regional ones. — _preuve : Rhône showed 'Voir les 27 aides' and the department page showed '5 aides régionales et 18 aides nationales' = 23 visible + more hidden = 27 total_
- [unrated] Department pages have their own set of filters: 'Votre situation' dropdown, 'Nombre de salariés' (0/1-9/10-49/50+), 'Je suis en micro-entreprise' checkbox, and filter tabs (Tout/Site internet/Logiciel & CRM/IA & automatisation/Cybersécurité & RGPD/Réseaux sociaux/Formation). — _preuve : Observed on /subventions/auvergne-rhone-alpes/rhone page after scrolling down_
- [unrated] The 'Voir les 12 autres régions' link reveals 12 more regions (total 30 regions: 13 mainland + 13 DOM-TOM). — _preuve : Main page shows 18 region cards + 'Voir les 12 autres régions' link. Sitemap confirms 30 region pages._
- [unrated] Clicking a region card navigates to that region's page showing regional aids + department breakdown + national aids. — _preuve : Auvergne-Rhône-Alpes page showed 5 regional aids, then departments (Ardèche, Drôme, Loire, etc.), then 'Voir les 18 aides nationales'_
- [unrated] National aids are 'Partout en France' - they apply across all regions and are listed on every regional/department page. — _preuve : Every regional and department page has a 'Partout en France' section with national aids like MonAideCyber, France Num, Prêt Boost_
- [unrated] The site is a static site (likely Astro or similar SSG). No JavaScript framework, no API calls, no dynamic data fetching. All content is pre-rendered HTML. — _preuve : All pages are static HTML. No network requests to APIs observed. Sitemap shows all pages pre-generated. robots.txt shows no JS framework indicators._

**Données & technique**

- Static site (likely Astro or similar SSG). All content pre-rendered as HTML. No JS framework, no API calls, no dynamic data fetching. Pages are at /subventions, /subventions/{region-slug}, /subventions/{region-slug}/{dept-slug}, /subventions/{project-slug}. Data is embedded directly in HTML. No client-side routing. No URL query parameters for filtering (contrary to task hypothesis). The map is a static SVG/HTML dot grid with CSS hover effects, not a dynamic chart library.

**Style visuel**

- Background: light beige/cream (#F5F0E8 approx). Primary color: blue (#2563EB for buttons, #1E40AF for links). Text: dark gray/black. Font: sans-serif (likely Inter or system font). Map: dot grid of French departments in blue, with numbered circles showing subsidy counts. Cards have white background with subtle shadows. Buttons: solid blue with white text, rounded corners. Hover states: subtle color changes. No animations observed (no intro animations on this page).

**Cas limites / anomalies**

- - The 'Voir les 12 autres régions' link expands to show 12 more regions (total 30). The 'Voir les 5 autres aides nationales' expands to show 5 more national aids. 'Voir les 10 dispositifs' in Formation section.
- DOM-TOM departments (971-976) shown separately on map, linked to their own region pages.
- Some regions (Guyane, Mayotte) show 'Aides nationales' only (no regional subventions).
- The 'Je suis en micro-entreprise' checkbox appears on both main page and department pages but its effect was not fully tested.
- The 'Nombre de salariés' segmented control (0, 1-9, 10-49, 50+) was visible but not tested.

**Questions ouvertes**

- - The task hypothesis mentions URL params (?type=, ?region=, ?departement=, ?profil=, ?besoin=) but none exist on this site. The filters are client-side only (dropdowns, checkboxes, tabs) that filter content on the same static page.
- The 'Je suis en micro-entreprise' checkbox effect not fully tested.
- The 'Nombre de salariés' segmented control effect not tested.
- The filter tabs on department pages (Tout, Site internet, etc.) not tested for their specific filtering behavior.

**Pour la reconstruire**

- To rebuild this feature identically: 1) Create static HTML pages for /subventions, /subventions/{region}, /subventions/{region}/{dept}, /subventions/{project}. 2) Main page needs: hero section with 2026 deadline text, department search with autocomplete (all 101 French departments + DOM-TOM), 'Votre situation' dropdown (5 options), 'Nombre de salariés' segmented control, micro-entreprise checkbox, 'Voir les N aides' button, interactive France map (dot grid with CSS), 18+ region cards, 5 project cards, national aids section, methodology section, CTA. 3) Regional pages need: regional aids list (with type badges: Subvention/Accompagnement/Prêt/Formation financée), department links, national aids, 'Ce que ces aides peuvent financer' section, FAQ section. 4) Department pages need: same structure as regional + department-specific aids + 'Les autres départements' section. 5) All content is static - no API needed. 6) Map can be a simple CSS dot grid (no chart library needed).

**Captures**

![Aides (Subventions) 1](../../artifacts/RPT_20261107_221151_F04/step_01.png)
![Aides (Subventions) 2](../../artifacts/RPT_20261107_221151_F04/step_13.png)
![Aides (Subventions) 3](../../artifacts/RPT_20261107_221151_F04/step_25.png)

### 2.5 À propos

- **Rôle** : Company information page showing team, expertise, school/company backgrounds, company description, and contact CTA
- **Route** : `https://www.cerclai.fr/a-propos`
- **Accès** : From home page (https://www.cerclai.fr/): Click "À propos" in the top navigation bar (between "Aides" and the right-side phone/CTA). Breadcrumb: Accueil > À propos
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/fb25a908-9677-4184-8e2f-642d14922e5c (187 s, 47 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/a-propos`, `https://www.cerclai.fr/app.js`, `https://www.cerclai.fr/assets/js/main.js`, `https://www.cerclai.fr/build/main.css`, `https://www.cerclai.fr/build/main.js`, `https://www.cerclai.fr/css/style.css`, `https://www.cerclai.fr/js/app.js`, `https://www.cerclai.fr/js/main.js`, `https://www.cerclai.fr/manifest.json`, `https://www.cerclai.fr/sitemap.xml`, `https://www.cerclai.fr/styles.css`

**Mise en page (haut → bas)**

- Sticky top nav bar: cerclai logo, Services dropdown, Réalisations, Aides, À propos (active), Rejoindre le cercle, phone 07 68 74 61 26, Demander un échange button
- Hero section: headline 'Les talents derrière vos projets.' with body text + CRM dashboard mockup image
- Votre interlocuteur section: text + white card with Jérémie Gallula photo, name, description, phone, email
- Toutes les expertises section: heading + 12 expertise roles grid on dark background
- Des parcours section: 17 school logos (Formés à) + 10 company logos (Passés par)
- Dark CTA band: 'Votre expertise mérite les bons projets.' text + Rejoindre le cercle button + Baromètre link
- CerclAI en bref section: two-column layout with company description paragraphs
- Final CTA: 'Concentrez-vous sur votre métier.' heading + Demander mon échange gratuit button
- Footer: Services, Métiers, Aides, CerclAI links, contact info, social links, legal links

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| nav_link | À propos | Navigates to /a-propos page |  |
| heading | Les talents derrière vos projets. |  |  |
| paragraph | CerclAI réunit des ingénieurs, designers et chefs de projet issus d'écoles prestigieuses comme Polytechnique, HEC et CentraleSupélec, avec des expériences au sein de groupes tels que BNP Paribas, Dassault Systèmes et Dior. Chaque talent est rigoureusement sélectionné sur dossier et entretien, pour garantir à votre projet les compétences qu'il mérite. |  |  |
| image | CRM dashboard mockup 'Gestion de cabinet' |  |  |
| heading | Votre interlocuteur. |  |  |
| paragraph | Derrière chaque projet, un nom et un numéro de téléphone. |  |  |
| card | Jérémie Gallula contact card with photo, name, description, phone 07 68 74 61 26, email contact@cerclai.fr |  |  |
| heading | Toutes les expertises, un seul cercle. |  |  |
| list_item | Ingénieurs IA |  |  |
| list_item | Ingénieurs Data |  |  |
| list_item | Développeurs web & mobile |  |  |
| list_item | Designers UX/UI |  |  |
| list_item | Experts cybersécurité & RGPD |  |  |
| list_item | Ingénieurs Cloud & DevOps |  |  |
| list_item | Experts en automatisation |  |  |
| list_item | Experts CRM & ERP |  |  |
| list_item | Experts SEO & marketing digital |  |  |
| list_item | Experts téléphonie & IA vocale |  |  |
| list_item | Formateurs IA & numérique |  |  |
| list_item | Chefs de projet |  |  |
| heading | Des parcours qui parlent d'eux-mêmes. |  |  |
| image_grid | 17 school logos (École polytechnique, HEC Paris, Mines Paris, CentraleSupélec, etc.) |  |  |
| image_grid | 10 company logos (BNP Paribas, Arval, Dassault Systèmes, Mercedes-Benz, Dior, etc.) |  |  |
| heading | Votre expertise mérite les bons projets. |  |  |
| paragraph | Rejoignez le réseau CerclAI et accédez à des missions sélectionnées, avec un périmètre clairement défini, une rémunération transparente et aucune prospection à gérer. Concentrez-vous sur votre expertise, nous nous occupons du reste. |  |  |
| button | Rejoindre le cercle → | Links to /rejoindre |  |
| link | Baromètre 2026 des talents tech | Links to /barometre |  |
| heading | CerclAI en bref. |  |  |
| paragraph | CerclAI est un cabinet français de conseil en intelligence artificielle et en développement informatique. Nous accompagnons les TPE, les PME et les grandes entreprises dans la création de sites internet, de logiciels sur mesure, d'agents IA et de solutions d'automatisation. Nous intervenons également en cybersécurité, en conformité RGPD et en formation à l'IA. |  |  |
| paragraph | Notre force : un réseau d'ingénieurs et d'experts rigoureusement sélectionnés, mobilisés selon les besoins de chaque projet. De la conception à la mise en service, nous proposant un accompagnement personnalisé, partout en France. |  |  |
| heading | Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous. |  |  |
| button | Demander mon échange gratuit → | Links to /contact |  |
| footer | Full footer with Services, Métiers, Aides, CerclAI, Nous joindre sections |  |  |

**Contenu (textes exacts)**

- Hero headline: 'Les talents derrière vos projets.'
- Hero body: 'CerclAI réunit des ingénieurs, designers et chefs de projet issus d'écoles prestigieuses comme Polytechnique, HEC et CentraleSupélec, avec des expériences au sein de groupes tels que BNP Paribas, Dassault Systèmes et Dior. Chaque talent est rigoureusement sélectionné sur dossier et entretien, pour garantir à votre projet les compétences qu'il mérite.'
- Interlocuteur subtext: 'Derrière chaque projet, un nom et un numéro de téléphone.'
- Jérémie Gallula: 'Jérémie vous rappelle et suit votre projet, du devis à la mise en service.' | 07 68 74 61 26 | contact@cerclai.fr
- Expertises subtext: 'Les meilleurs talents, réunis autour de vos projets. De la conception au déploiement, chaque besoin trouve son expert.'
- CTA band: 'Votre expertise mérite les bons projets. Rejoignez le réseau CerclAI et accédez à des missions sélectionnées, avec un périmètre clairement défini, une rémunération transparente et aucune prospection à gérer. Concentrez-vous sur votre expertise, nous nous occupons du reste.'
- CerclAI en bref subheading: 'Un cabinet, toutes les expertises pour accompagner votre transformation numérique.'
- CerclAI en bref para 1: 'CerclAI est un cabinet français de conseil en intelligence artificielle et en développement informatique. Nous accompagnons les TPE, les PME et les grandes entreprises dans la création de sites internet, de logiciels sur mesure, d'agents IA et de solutions d'automatisation. Nous intervenons également en cybersécurité, en conformité RGPD et en formation à l'IA.'
- CerclAI en bref para 2: 'Notre force : un réseau d'ingénieurs et d'experts rigoureusement sélectionnés, mobilisés selon les besoins de chaque projet. De la conception à la mise en service, nous proposant un accompagnement personnalisé, partout en France.'
- Final CTA: 'Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.'

**Interactions testées**

- Clicked 'À propos' in nav bar from home page → Navigated to /a-propos, page loaded with hero section
- Dismissed cookie consent banner → Banner disappeared, page content fully visible
- Scrolled through entire page (4,470px) → All sections visible sequentially, no interactive tabs or carousels found
- Checked for 'Lire la suite' link in CerclAI en bref section → No expand/collapse link found - full text is always visible
- Checked expertise items for hover effects → No hover effects observed - static text items only

**Règles de fonctionnement**

- [unrated] Page is fully static - no tabs, carousels, accordions, or interactive components — _preuve : All content visible on single scroll; HTML source confirms no JS interactivity_
- [unrated] All text content is hardcoded in HTML - no API calls or dynamic data — _preuve : HTML source contains all copy inline; no fetch calls or JSON data_
- [unrated] Logos are static SVG images served from /logos/creme/ — _preuve : Image URLs confirmed in HTML: cerclai.fr/logos/creme/*.svg_
- [unrated] Team photo is static WebP at /equipe/jeremie-gallula.webp — _preuve : Image URL confirmed in HTML source_
- [unrated] All links are static hrefs (no JS navigation) — _preuve : Standard <a> tags with href attributes in HTML_

**Données & technique**

- All content is static HTML - no APIs, no JS data fetching, no dynamic rendering
- Images served as static files: /equipe/jeremie-gallula.webp, /logos/creme/*.svg, /shots/opt/*.webp
- No JavaScript interactivity detected - page is essentially static HTML+CSS
- No build tools or frameworks detected from source inspection
- Cookie banner is the only JS element observed (consent management)

**Style visuel**

- Background: off-white/cream with subtle paper texture
- Dark sections: pure black background (expertise grid, CTA band)
- Primary color: blue ~#2563EB (buttons, links, email)
- Headings: large bold dark text, sans-serif font
- Body text: gray, smaller sans-serif
- Buttons: pill-shaped with arrow (→), white on dark / blue on light backgrounds
- Cards: white with rounded corners and subtle shadow
- Two-column grid layout for hero and CerclAI en bref sections
- No animations or transitions observed
- Logos: monochrome SVG images in dark sections

**Cas limites / anomalies**

- The word 'accompagnement' in the CerclAI en bref paragraph 2 appears garbled in source as 'accompagnement' - likely a rendering/encoding issue in the source HTML
- Cookie consent banner appears on first page load only
- Page is 4,470px tall - quite long for a single page, no sticky section navigation

**Questions ouvertes**

- The 'Lire la suite' link mentioned in the initial screenshot was not found in the actual page - it may have been from a different page version or a misread
- Cannot confirm exact CSS framework used without accessing source files (tried common paths, none found)

**Pour la reconstruire**

- Single static HTML page at /a-propos with all content inline
- No JS framework needed - pure HTML/CSS
- Assets: hero mockup image, Jérémie Gallula photo, 17 school SVG logos, 10 company SVG logos
- Layout: two-column sections alternating with full-width sections
- No interactive components to implement - purely presentational

**Captures**

![À propos 1](../../artifacts/RPT_20261107_221151_F05/step_01.png)
![À propos 2](../../artifacts/RPT_20261107_221151_F05/step_15.png)
![À propos 3](../../artifacts/RPT_20261107_221151_F05/step_29.png)

### 2.6 Méthode

- **Rôle** : Marketing page describing CerclAI's 6-step project methodology from free diagnostic to follow-up
- **Route** : `https://www.cerclai.fr/methode`
- **Accès** : Home page → scroll to "Comment ça débutre" section → click "Voir la méthode en détail" → /methode. Or navigate directly to https://www.cerclai.fr/methode
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/89509676-15d6-4086-80c0-f66009916b85 (123 s, 25 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/assets/MethodePage-BnxgJ34P.js`, `https://www.cerclai.fr/assets/index-BgLzBp30.css`, `https://www.cerclai.fr/assets/js/main.js`, `https://www.cerclai.fr/build/main.js`, `https://www.cerclai.fr/js/main.js`, `https://www.cerclai.fr/methode`

**Mise en page (haut → bas)**

- Fixed navbar: logo, Services/Réalisations/Aides/À propos links, Rejoindre le cercle, phone, Demander un échange button
- Hero section: 'Comment se déroule votre projet.' heading, subtext, blue CTA button, animated mock UI card
- Les six étapes section: 3-column table (Étape/Vous/Vous recevez) with 6 rows
- Tout est écrit avant de commencer (Étape 2 Cadrage): mock invoice document image
- Vous validez avant qu'on construise (Étape 3 Conception): mock design review interface image
- Après la mise en service on reste joignable (Étape 6 Suivi): mock chat interface image
- Notre engagement: single bullet point
- Final CTA: 'Concentrez-vous sur votre métier' with blue button
- Footer: full site navigation

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| button | Demander mon échange gratuit | Navigates to /contact page |  |
| button | Voir la méthode en détail | Navigates to /methode from home page |  |
| link | Accueil | Breadcrumb, navigates to home page |  |
| link | 30 minutes, gratuit | Blue underlined link in step 1 row |  |
| link | Devis gratuit | Blue underlined link in step 2 row |  |
| carousel | Hero mock UI card | Auto-cycles through different mock UI states with CSS animation |  |
| image | Devis 2026-014 mock document | Static image showing sample quote |  |
| image | Design review mockup | Static image showing mock design review interface |  |
| image | Chat interface mockup | Static image showing mock CRM chat |  |

**Contenu (textes exacts)**

- Comment se déroule votre projet.
- Un prix ferme et le même interlocuteur, du premier appel au suivi.
- Les six étapes.
- Étape | Vous | Vous recevez
- 1 Diagnostic — 30 minutes, gratuit — Dites-nous ce que vous voulez — Trois priorités
- 2 Cadrage — Devis gratuit — Relisez, puis décidez — Un devis à prix ferme et les dates
- 3 Conception — Commentez les écrans — Une maquette à valider
- 4 Développement — Essayez l'outil au fur et à mesure — Des versions régulières
- 5 Mise en service — Suivez la formation avec votre équipe — Vos données reprises, l'outil en ligne
- 6 Suivi — Écrivez ou appelez — La maintenance et les évolutions
- Tout est écrit avant de commencer. Étape 2 · Cadrage
- Le périmètre, les dates et le prix, noir sur blanc. Vous signez quand tout est clair.
- Vous validez avant qu'on construise. Étape 3 · Conception
- Vos écrans, en maquette. Vous commentez dessus, on corrige jusqu'à votre accord.
- Après la mise en service, on reste joignable. Étape 6 · Suivi
- Une question, une évolution : vous écrivez à votre interlocuteur, qui connaît votre dossier.
- Notre engagement.
- Votre site, vos données et vos accès vous appartiennent.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.
- Demander mon échange gratuit

**Interactions testées**

- Navigated to /methode from home page via 'Voir la méthode en détail' link → Page loaded with full 6-step methodology content
- Viewed page at multiple scroll positions → Confirmed all sections from hero to footer
- Checked view-source HTML → Confirmed React SPA, Tailwind CSS, Inter font, JSON-LD schema, all content static

**Règles de fonctionnement**

- [unrated] 6 steps are always shown in fixed sequential order: Diagnostic, Cadrage, Conception, Développement, Mise en service, Suivi — _preuve : Table rows always appear in this order, no sorting or filtering available_
- [unrated] Only steps 2, 3, and 6 have detailed visual mockups; steps 1, 4, 5 have no detailed images — _preuve : Source HTML only contains image tags for steps 2, 3, 6 sections_
- [unrated] All CTA buttons navigate to /contact — _preuve : HTML shows all 'Demander mon échange gratuit' and 'Demander un échange' buttons link to /contact_
- [unrated] Hero image is an auto-animating carousel of static mock UI screenshots — _preuve : CSS keyframes mtRipple, mtDot observed; card cycles through different mock states_
- [unrated] All content is static, no API calls or dynamic data — _preuve : No fetch/axios calls in page, all content in HTML, images from static /shots/opt/ paths_

**Données & technique**

- React SPA (bundles: react-BUPyVln.js, MethodePage-BnxgJ34P.js, Footer-DCbkV4Zs.js)
- Tailwind-style utility CSS classes
- Inter font (Google Fonts, variable weight)
- Images served from /shots/opt/ and /shots/opt/mobile/ paths
- JSON-LD structured data (Organization schema)
- No API calls, no localStorage, all static content

**Style visuel**

- Background: #F2F1EC (warm off-white/cream)
- Text: near-black #121214, muted gray for secondary text
- CTA buttons: deep blue pill shape, white text, rounded-full (999px radius)
- Links in table: blue underlined text
- Font: Inter variable weight 100-900
- Generous whitespace, clean grid layout
- Subtle box shadows on elevated cards
- CSS animations: mtRipple, mtClick, mtTap, mtDot keyframes

**Cas limites / anomalies**

- No interactive form elements on the page
- No error states or empty states possible
- All mock UI images are static screenshots, not functional interfaces
- The 'Compris' text in the invoice mock appears to be a button-like element but is static

**Questions ouvertes**

- The exact blue color hex value (partially obscured in source)
- Whether the hero carousel has user-controllable navigation (dots visible but not tested)
- Exact animation timing for the hero card carousel

**Pour la reconstruire**

- Create React page at route /methode
- Use Inter font from Google Fonts
- Implement hero with large heading, subtext, blue CTA button, and animated mock UI card
- Create 3-column table with 6 rows showing step details
- Add 3 detailed mockup image sections for steps 2, 3, 6
- Include 'Notre engagement' section and final CTA
- Style with Tailwind-like utility classes, #F2F1EC background, blue CTA buttons
- All content is static - no backend needed

**Captures**

![Méthode 1](../../artifacts/RPT_20261107_221151_F06/step_01.png)
![Méthode 2](../../artifacts/RPT_20261107_221151_F06/step_08.png)
![Méthode 3](../../artifacts/RPT_20261107_221151_F06/step_14.png)

### 2.7 Contact

- **Rôle** : Contact form for free 30-minute consultation (phone or video) and CEO information for CerclAI
- **Route** : `https://www.cerclai.fr/contact`
- **Accès** : From home page: click the blue button "Demander un échange gratuit" in the hero section → redirects to /contact. Alternatively, navigate directly to https://www.cerclai.fr/contact.
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/0926d251-689c-439e-967d-fb833ec69198 (140 s, 27 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/assets/js/main.js`, `https://www.cerclai.fr/contact`, `https://www.cerclai.fr/js/main.js`, `https://www.cerclai.fr/static/js/main.js`

**Mise en page (haut → bas)**

- Header: cerclai logo, navigation (Services, Réalisations, Aides, À propos), 'Rejoindre le cercle' link, phone number 07 68 74 61 26
- Breadcrumb: Accueil > Contact
- Hero section: 'Trente minutes pour repérer ce qu'on peut simplifier.' + 'Un échange au téléphone ou en visio, gratuit et sans engagement.'
- Left column: 'Ce qui se passe ensuite' section with numbered steps (1. On vous rappelé sous 48h ouvrées, 2. Un devis à prix ferme) + 'Qui vous répond' section with Jérémie Gallula's photo and name
- Right column: 'Être rappelé' form card with fields and submit button
- Footer: cerclai branding, navigation links, contact info, barometre link, legal links

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | Trente minutes pour repérer ce qu'on peut simplifier. | Main hero heading, large bold text |  |
| text | Un échange au téléphone ou en visio, gratuit et sans engagement. | Subtitle text |  |
| text | Ce qui se passe ensuite | Section header in left column |  |
| text | 1. On vous rappelé sous 48 h ouvrées.
Au numéro indiqué, pour fixer l'échange au moment qui vous arrange. | Step 1 description |  |
| text | 2. Un devis à prix ferme.
Après l'échange, si vous le souhaitez. Rien ne vous engage avant votre signature. | Step 2 description |  |
| text | Qui vous répond | Section header |  |
| image | Jérémie Gallula portrait photo | Circular profile photo |  |
| text | Jérémie Gallula | CEO name |  |
| heading | Être rappelé | Form card title, large bold text |  |
| text | Moins d'une minute. | Form subtitle |  |
| input | Prénom et nom | Text input field (required) |  |
| input | Téléphone | Text input field (required) |  |
| select | Votre métier - Choisissez | Dropdown with options: Artisan / BTP, Commerce, Cabinet / profession libérale, Garage, Hôtellerie / restauration, Services à domicile, Industrie / PME, Autre |  |
| input | Ville ou code postal | Text input field |  |
| textarea | Ce qui vous prend le plus de temps (facultatif) | Text area with placeholder 'Les devis le soir, les appels manqués, les relances...' | optional field |
| input | E-mail (facultatif) | Email input with placeholder 'vous@entreprise.fr' | optional field |
| text | Pour recevoir le devis par écrit. | Helper text for email field |  |
| button | Envoyer ma demande → | Blue submit button, opens form submission |  |
| text | Vos informations servent uniquement à répondre à votre demande. | Privacy notice |  |
| link | Confidentialité | Link to privacy policy (/confidentialite) |  |

**Contenu (textes exacts)**

- Hero heading: "Trente minutes pour repérer ce qu'on peut simplifier."
Subtitle: "Un échange au téléphone ou en visio, gratuit et sans engagement."
Form title: "Être rappelé"
Form subtitle: "Moins d'une minute."
Step 1: "On vous rappelé sous 48 h ouvrées. Au numéro indiqué, pour fixer l'échange au moment qui vous arrange."
Step 2: "Un devis à prix ferme. Après l'échange, si vous le souhaitez. Rien ne vous engage avant votre signature."
CEO: "Jérémie Gallula"
Button: "Envoyer ma demande →"
Privacy: "Vos informations servent uniquement à répondre à votre demande."
Footer phone: "07 68 74 61 26"
Footer email: "contact@cerclai.fr"

**Interactions testées**

- Clicked 'Demander un échange gratuit' button on home page hero section → Navigated to /contact page. URL changed from https://www.cerclai.fr/ to https://www.cerclai.fr/contact
- Clicked 'Votre métier' dropdown select → Dropdown opened showing 8 options: Choisissez, Artisan / BTP, Commerce, Cabinet / profession libérale, Garage, Hôtellerie / restauration, Services à domicile, Industrie / PME, Autre
- Selected 'Commerce' from dropdown → Dropdown closed, field showed 'Commerce'
- Selected 'Garage' from dropdown → Dropdown closed, field showed 'Garage'
- Clicked on 'Ce qui vous prend le plus de temps' text area → Field got focus (blue border appeared), placeholder 'Les devis le soir, les appels manqués, les relances...' visible
- Navigated back to /contact page → Page reloaded, dropdown reset to 'Choisissez', form fields cleared

**Règles de fonctionnement**

- [unrated] Form is a callback request form (not a calendar scheduling form) — _preuve : Page title 'Contact : échange gratuit de 30 minutes', form title 'Être rappelé', step 1 says 'On vous rappelé sous 48 h ouvrées'_
- [unrated] 'Votre métier' dropdown has 8 options: Choisissez (default), Artisan / BTP, Commerce, Cabinet / profession libérale, Garage, Hôtellerie / restauration, Services à domicile, Industrie / PME, Autre — _preuve : Observed dropdown options when opened_
- [unrated] 'Ce qui vous prend le plus de temps' is optional (facultatif), with placeholder text 'Les devis le soir, les appels manqués, les relances...' — _preuve : Field label includes '(facultatif)', placeholder text visible_
- [unrated] E-mail field is optional (facultatif), with placeholder 'vous@entreprise.fr' and helper text 'Pour recevoir le devis par écrit.' — _preuve : Field label includes '(facultatif)', visible placeholder and helper text_
- [unrated] Single submit button 'Envoyer ma demande →' sends the form — _preuve : Only button visible on form, blue color, arrow icon_
- [unrated] No 'Choisir un créneau' (choose time slot) button exists on this page — _preuve : Thoroughly inspected all visible elements; only 'Envoyer ma demande' button present_
- [unrated] No calendar scheduling UI is available on this page — _preuve : No calendar component found in page source or visible UI_
- [unrated] The form IS the 'Être rappelé' (callback) mechanism - submitting it requests a callback from CerclAI — _preuve : Form title 'Être rappelé', step 1 'On vous rappelé sous 48 h ouvrées', no separate callback button exists_

**Données & technique**

- Page is a static HTML page with CSS styling
- Phone number uses tel: protocol: <tel:+33768746126>
- CEO photo served from https://www.cerclai.fr/equipe/jeremie-gallula.webp
- Privacy link: /confidentialite
- Form action: 'Envoyer ma demande' (form submission likely via JavaScript POST request - cannot determine endpoint without JS)
- No visible API calls or dynamic data fetching in the contact form

**Style visuel**

- Color scheme: white/light gray background, blue (#2563EB approx) for buttons and accents, black/dark text
- Fonts: sans-serif, clean modern typeface
- Layout: two-column layout (left: info, right: form card)
- Form card: white background with rounded corners, subtle shadow
- Submit button: solid blue with white text and arrow icon (→)
- No animations or transitions observed on the contact page
- Images: Jeremie Gallula portrait in circular frame

**Cas limites / anomalies**

- The task instructions mentioned a 'Choisir un créneau' button that does not exist on this page - possibly a different version of the site or incorrect instructions
- The task also mentioned an 'Être rappelé' button as a separate control - but 'Être rappelé' is actually the form card title, not a button
- The 'Ne pas remplir' text I initially saw in screenshots was actually part of the E-mail field area (placeholder 'vous@entreprise.fr' and helper text 'Pour recevoir le devis par écrit.' were positioned there)
- Form fields appear to be required (Prénom et nom, Téléphone) but no explicit validation visible without submission

**Questions ouvertes**

- What happens when 'Envoyer ma demande' is clicked? (Form submission behavior, success message, where data goes)
- Is there a 'Choisir un créneau' button that appears in a different view/state not visible in the default page load?
- What is the form submission endpoint and what data is sent?

**Pour la reconstruire**

- Create a two-column layout page at /contact
- Left column: 'Ce qui se passe ensuite' with 2 numbered steps + 'Qui vous répond' with CEO photo and name
- Right column: Form card titled 'Être rappelé' with subtitle 'Moins d'une minute.'
- Form fields: Prénom et nom (text), Téléphone (text), Votre métier (select: Artisan/BTP, Commerce, Cabinet/profession libérale, Garage, Hôtellerie/restauration, Services à domicile, Industrie/PME, Autre), Ville ou code postal (text), Ce qui vous prend le plus de temps (textarea, optional), E-mail (email, optional)
- Blue submit button 'Envoyer ma demande →'
- Privacy notice text below button linking to /confidentialite
- Hero section with heading 'Trente minutes pour repérer ce qu'on peut simplifier.' and subtitle
- Blue color for buttons: approximately #2563EB
- Phone number 07 68 74 61 26 in header and footer

**Captures**

![Contact 1](../../artifacts/RPT_20261107_221151_F07/step_01.png)
![Contact 2](../../artifacts/RPT_20261107_221151_F07/step_10.png)
![Contact 3](../../artifacts/RPT_20261107_221151_F07/step_18.png)

### 2.8 Baromètre 2026

- **Rôle** : A 10-question quiz (approx. 3 minutes) that asks junior tech talent in France about their profile, salary, and billing rates. After completing the quiz, users can optionally share their email to receive the full results. Results are published freely once 500 responses are collected.
- **Route** : `https://www.cerclai.fr/barometre`
- **Accès** : From the home page (https://www.cerclai.fr), scroll to the footer and click "Baromètre 2026" link. Alternatively, navigate directly to https://www.cerclai.fr/barometre.
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/7af4472b-9f77-4dab-8b76-b5babf4da717 (287 s, 52 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/assets/BarometrePage-CJ_s-MFe.js`, `https://www.cerclai.fr/assets/react-BUPVILn.js`, `https://www.cerclai.fr/barometre`

**Mise en page (haut → bas)**

- LEFT COLUMN (fixed, ~45% width): H1, body text, 'Environ 3 minutes', horizontal rule, 'Ce que vous recevrez' with 3 bullet points
- RIGHT COLUMN (scrollable quiz card): Progress bar, question counter, category label, Facultatif badge, question text, answer options, navigation buttons (Précédent/Passer/Suivant), footer text
- BOTTOM SECTION (full width, dark bg): 'Résultats en accès libre' heading, chart card (blurred until 500 responses), footer

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | H1: Combien vaut vraiment un talent tech junior en France ? |  |  |
| text | Entre ce qu'un talent junior touche et ce que son travail est facturé, il y a un écart que personne ne publie. Ce baromètre le mesure. |  |  |
| text | Environ 3 minutes. |  |  |
| list | Ce que vous recevrez: Les résultats complets, Votre position face à la moyenne, L'écart entre payé et facturé |  |  |
| progress_bar | Blue progress bar at top of quiz card |  |  |
| quiz_card | Scrollable card with question counter, category, Facultatif badge, question text, answer options, navigation buttons |  |  |
| chart | Blurred bar chart: Payé et facturé, selon l'expérience. X-axis: < 1 an, 1–2 ans, 2–3 ans, 3–5 ans, 5 ans + |  |  |
| footer | Standard CerclAI footer (Services, Métiers, Aides, CerclAI, Contact) |  |  |

**Contenu (textes exacts)**

- Page title: Baromètre 2026 : salaire et TJM des talents tech juniors
- Intro: Combien vaut vraiment un talent tech junior en France ? Entre ce qu'un talent junior touche et ce que son travail est facturé, il y a un écart que personne ne publie. Ce baromètre le mesure. Environ 3 minutes.
- Ce que vous recevrez: Les résultats complets, Votre position face à la moyenne, L'écart entre payé et facturé
- Q1 (Profil): Quelle est votre situation aujourd'hui ? — Étudiant en stage, En alternance, Diplômé, en poste, Indépendant / en mission, En recherche
- Q2 (Formation): Quelle est votre école / formation ? — Polytechnique, CentraleSupélec, Mines, Ponts, Télécom Paris, ENSAE / ENSAI, INSA, UTC / UTT, Ensimag, EPITA, Epitech, 42, ESILV / ECE, Université, IUT / BUT, Autre...
- Q3 (Profil): Où en êtes-vous ? — En formation: 1re à 3e année, 4e / 5e année | Diplômé depuis: Moins d'1 an, 1 à 2 ans, 2 à 3 ans, 3 à 5 ans, 5 ans et plus
- Q4 (Spécialité): Votre spécialité principale — Backend, Frontend, Fullstack, Data / IA, DevOps / Cloud, Mobile, Cybersécurité, Autre...
- Q5 (Ville, facultatif): Où travaillez-vous ? — Paris / IDF, Lyon, Toulouse, Bordeaux, Lille, Nantes, Rennes, Marseille, Grenoble, Étranger, Autre...
- Q6 (Rémunération): Combien êtes-vous payé aujourd'hui ? — Type: Gratification de stage(€/mois), Salaire d'alternance(€net/mois), Salaire(€net/mois ou €brut/an), TJM(€/jour) + amount input
- Q7 (Facturation): Savez-vous combien votre travail est facturé au client ? — Oui je connais le montant, Non je ne l'ai jamais su, Je ne suis pas facturé à un client. If Oui: Montant facturé au client final (€/jour)
- Q8 (Ressenti, facultatif): Vous sentez-vous payé à votre juste valeur ? — 1 Très sous-payé, 2 Un peu sous-payé, 3 Correct, 4 Plutôt bien payé, 5 À ma juste valeur
- Q9 (Priorités, facultatif): Ce qui compte le plus pour vous dans une mission — Apprendre, La rémunération, La techno, L'équipe, La liberté
- Q10 (Email, facultatif): Recevez le baromètre dès sa publication ? — Email input + consent checkbox + Envoyer ma réponse / Passer buttons
- Results: Merci, votre réponse est enregistrée. + chart (Payé vs Facturé by experience) + Le cercle recrute CTA

**Interactions testées**

- Selected Q1 'Diplômé, en poste' and clicked Suivant → Progress bar advanced to ~10%, Question 2 appeared
- Selected Q2 'CentraleSupélec' and clicked Suivant → Progress ~20%, Question 3 appeared
- Selected Q3 '4e / 5e année' and clicked Suivant → Progress ~30%, Question 4 appeared
- Selected Q4 'Backend' and clicked Suivant → Progress ~40%, Question 5 appeared
- Selected Q5 'Paris / IDF' and clicked Suivant → Progress ~50%, Question 6 appeared
- Selected Q6 'Salaire € net / mois', typed 3000, clicked Suivant → Progress ~60%, Question 7 appeared
- Selected Q7 'Oui, je connais le montant', typed 400, clicked Suivant → Progress ~70%, Question 8 appeared
- Selected Q8 '3' and clicked Suivant → Progress ~80%, Question 9 appeared
- Selected Q9 'La rémunération' and clicked Suivant → Progress ~90%, Question 10 (email) appeared
- Clicked Précédent on Q10 → Returned to Q9 with 'La rémunération' still selected
- Clicked 'Formation' text in chart area → No visible change — not a clickable filter

**Règles de fonctionnement**

- [confirmed] Quiz has 10 questions in fixed order. Q1, Q2, Q3, Q4, Q6, Q7 are mandatory. Q5, Q8, Q9, Q10 are optional (have 'Passer' button). — _preuve : Observed quiz flow; optional questions show 'Facultatif' badge and 'Passer' button_
- [confirmed] Q2 options map to formData.formation; Q4 options map to formData.specialite — _preuve : JS source: BarometrePage-CJ_s-MFe.js shows formData.formation and formData.specialite assignments_
- [confirmed] Form submits via POST to /api/barometre with formData JSON + honeypot fields (site_web, piege) — _preuve : JS source shows fetch('/api/barometre', {method:'POST', body: JSON.stringify(...)})_
- [confirmed] Results are anonymized; only averages are published. Chart shows until 500 responses threshold. — _preuve : Page text: 'Réponses anonymes, seules des moyennes sont publiées' and 'Publication à 500 réponses'_
- [confirmed] Number inputs (Q6 amount, Q7 TJM) require user input — placeholder values (1800, 600) are not pre-filled — _preuve : Typed values and saw validation error when field was empty_

**Données & technique**

- React SPA (Vite build). JS bundle: /assets/BarometrePage-CJ_s-MFe.js. Form POST to /api/barometre. Chart data is static (blurred placeholder). No external API for chart data observed.
- All question text and options are hardcoded in the JS bundle. No dynamic data fetching observed.

**Style visuel**

- Light beige/cream background, white quiz card with rounded corners, blue progress bar and selected options (#2563eb), dark navy chart section, blue footer. Clean sans-serif font. Chart blurred with CSS filter until 500 responses.

**Cas limites / anomalies**

- Number inputs show placeholder values that are NOT pre-filled — user must type. Empty submission shows validation error. 'Aussi par: Formation·Spécialité·Ville' is descriptive text only, not clickable. Chart blurred until 500 responses. Honeypot fields (site_web, piege) in form.
- After submission, quiz card area becomes empty/white, thank you message shown instead.

**Questions ouvertes**

- Exact /api/barometre response format. Whether chart data is fetched from API (couldn't verify — always blurred). Whether progress is saved on navigation. Any intro animations on page load.

**Pour la reconstruire**

- Rebuild as React page at /barometre. 10-question quiz with exact questions/options. POST to /api/barometre on submit. Same color scheme. Chart blurred until 500 responses. Include 'Le cercle recrute' CTA after results. 'Formation·Spécialité·Ville' is descriptive text only.

**Captures**

![Baromètre 2026 1](../../artifacts/RPT_20261107_221151_F08/step_01.png)
![Baromètre 2026 2](../../artifacts/RPT_20261107_221151_F08/step_23.png)
![Baromètre 2026 3](../../artifacts/RPT_20261107_221151_F08/step_44.png)

### 2.9 Mentions Légales

- **Rôle** : Displays legal information about the cerclai.fr website, including editor details, hosting, intellectual property, and data/cookies policy, as required by French LCEN law (articles 1-1 and 19 of law n° 2004-575).
- **Route** : `https://www.cerclai.fr/mentions-legales`
- **Accès** : Home page (https://www.cerclai.fr/) → scroll to footer → click "Mentions légales" link
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/0d8c8997-2987-4578-8a59-b1b9f9df0674 (97 s, 18 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/confidentialite`, `https://www.cerclai.fr/mentions-legales`

**Mise en page (haut → bas)**

- Sticky header: CerclAI logo, nav (Services, Réalisations, Aides, À propos), phone number, 'Rejoindre le cercle' link, 'Demander un échange' button
- Breadcrumb: Accueil > Mentions légales
- H1 title: 'Mentions légales'
- Intro paragraph + last updated date (19 octobre 2026)
- Two-column content area: Left = Sommaire (TOC with 5 numbered links), Right = 5 numbered content sections
- CTA section: headline text + 'Demander mon échange gratuit' button
- Footer: 4 columns (Services, Métiers, Aides, CerclAI), contact info, social links, legal links

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | Mentions légales | H1 page title |  |
| paragraph | Les informations légales du site cerclai.fr, en application des articles 1-1 et 19 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN). | Intro text |  |
| paragraph | Dernière mise à jour : 19 octobre 2026 | Last updated date |  |
| link | Sommaire (TOC): 01 Éditeur du site, 02 Hébergement, 03 Propriété intellectuelle, 04 Logos et réalisations, 05 Données personnelles et cookies | Anchor navigation to sections |  |
| heading | 01 Éditeur du site | Section heading |  |
| table | Dénomination: CerclAI | Téléphone: 07 68 74 61 26 | E-mail: contact@cerclai.fr | Editor information |  |
| heading | 02 Hébergement | Section heading |  |
| table | Site: Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis | Données: Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513... | Hosting information |  |
| paragraph | 03 Propriété intellectuelle section text | Intellectual property notice |  |
| paragraph | 04 Logos et réalisations section text (2 paragraphs) | Logos and works disclaimer |  |
| paragraph | 05 Données personnelles et cookies section text with 'politique de confidentialité' link | Data and cookies summary |  |
| link | Politique de confidentialité → | CTA link to /confidentialite |  |
| heading | Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous. | CTA headline |  |
| button | Demander mon échange gratuit → | Navigates to /contact |  |
| link | Mentions légales (in footer) | Footer link to /mentions-legales |  |
| link | Confidentialité (rendering artifact for Politique de confidentialité) | Footer link to /confidentialite |  |

**Contenu (textes exacts)**

- Les informations légales du site cerclai.fr, en application des articles 1-1 et 19 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).
- Dernière mise à jour : 19 octobre 2026
- 01 Éditeur du site — Le site cerclai.fr est édité par CerclAI, cabinet de conseil en IA pour les TPE, les PME et les grandes entreprises, à Paris.
- Dénomination: CerclAI | Téléphone: 07 68 74 61 26 | E-mail: contact@cerclai.fr
- 02 Hébergement — Site: Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis. Données: Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513. Données des formulaires, de l'espace membre et du baromètre, sur des serveurs situés à Paris (France).
- 03 Propriété intellectuelle — Les contenus de ce site (textes, images, logo, code) sont protégés par le droit d'auteur et, le cas échéant, le droit des marques. Sauf mention contraire, ils appartiennent à CerclAI. Leur reproduction sans autorisation est interdite, sous réserve des exceptions prévues par le Code de la propriété intellectuelle.
- 04 Logos et réalisations — Les noms et logos d'écoles et d'entreprises indiquent le parcours de talents du cercle CerclAI. Ils appartiennent à leurs titulaires et n'impliquent ni partenariat ni recommandation. Les sites, noms et marques des entreprises présentées dans les réalisations appartiennent à leurs titulaires. Certaines réalisations sont montrées sous un nom modifié. Les démonstrations mettant en scène des entreprises, des personnes et des coordonnées fictives.
- 05 Données personnelles et cookies — CerclAI traite des données personnelles quand vous demandez à être rappelé, posez votre candidature ou répondez au baromètre. Ce qui est collecté, pourquoi, combien de temps, les cookies et vos droits : tout est dans la politique de confidentialité.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.
- Demander mon échange gratuit

**Interactions testées**

- Clicked '02 Hébergement' in Sommaire → Page scrolled to section 02; URL updated to https://www.cerclai.fr/mentions-legales#hebergement
- Clicked '01 Éditeur du site' in Sommaire → Page scrolled to section 01; URL updated to https://www.cerclai.fr/mentions-legales#editeur
- Clicked '05 Données personnelles et cookies' in Sommaire → Page scrolled to section 05; URL updated to https://www.cerclai.fr/mentions-legales#donnees-personnelles
- Clicked 'politique de confidentialité' link in section 05 → Navigated to /confidentialite (separate page with full privacy policy)
- Clicked 'Politique de confidentialité →' CTA link at bottom → Same as above — navigated to /confidentialite
- Hovered over Sommaire links → Text color changed to blue (active/primary color)
- Hovered over content links → Underline appeared on hover

**Règles de fonctionnement**

- [unrated] All content is static HTML — no API calls, no JavaScript framework, no dynamic data loading — _preuve : Page source is pure HTML with hardcoded text; no network requests observed_
- [unrated] Sommaire uses HTML anchor links (#editeur, #hebergement, #propriete-intellectuelle, #logos, #donnees-personnelles) for in-page navigation — _preuve : URL updates to #anchor when clicking TOC links; native browser scroll behavior_
- [unrated] The 'politique de confidentialité' link in section 05 and the 'Politique de confidentialité →' CTA both link to /confidentialite — _preuve : Both links navigated to the same URL_
- [unrated] The footer 'Confvisionnement' text is a rendering artifact — it's actually the 'Politique de confidentialité' link — _preuve : HTML source shows it links to /confidentialite_
- [unrated] Last updated date '19 octobre 2026' is hardcoded in the HTML — _preuve : Directly visible in page source_
- [unrated] External links to Vercel and Supabase open their respective websites — _preuve : HTML source shows href attributes to vercel.com and supabase.com_

**Données & technique**

- Static HTML page served directly from cerclai.fr — no JS framework detected
- No CSS/JS bundles fetched; page uses minimal inline/styled HTML
- Images served from https://www.cerclai.fr/shots/opt/ (not used on this page)
- No database, no API, no client-side rendering
- Route: /mentions-legales (static page, no dynamic routing)

**Style visuel**

- Background: light cream/beige with subtle paper texture
- Primary color: blue (#2D5BF0 approx) — buttons, active TOC links, footer
- Text: dark grey/black body text, lighter grey for 'Sommaire' label
- Font: sans-serif (modern, clean)
- Layout: max-width container, two-column (TOC ~40%, content ~60%)
- Section dividers: thin horizontal rules between sections
- Buttons: rounded rectangle, solid blue fill, white text, arrow icon on CTA
- Total page height: 3,049px

**Cas limites / anomalies**

- Footer shows 'Confvisionnement' — a rendering artifact; it's actually 'Politique de confidentialité' (links to /confidentialite)
- Two separate links to the privacy policy page (one in content, one as CTA) — both go to /confidentialite
- No forms, no login, no chatbot on this page — purely informational

**Questions ouvertes**

- The exact CSS font family and hex color values — would need to inspect computed styles
- Whether the page uses any CSS framework (Tailwind, etc.) — not detectable from content extraction

**Pour la reconstruire**

- Create static HTML page at /mentions-legales
- Include: H1 'Mentions légales', intro paragraph, last-updated date, two-column layout (Sommaire TOC left, content right)
- 5 numbered sections with exact text as documented above
- Sommaire: 5 anchor links (editeur, hebergement, propriete-intellectuelle, logos, donnees-personnelles)
- CTA section with headline and 'Demander mon échange gratuit' button linking to /contact
- Use cream/beige background, blue (#2D5BF0) accent color, sans-serif font, rounded buttons
- Footer with standard CerclAI footer (shared across site)

**Captures**

![Mentions Légales 1](../../artifacts/RPT_20261107_221151_F09/step_01.png)
![Mentions Légales 2](../../artifacts/RPT_20261107_221151_F09/step_07.png)
![Mentions Légales 3](../../artifacts/RPT_20261107_221151_F09/step_12.png)

### 2.10 Politique de Confidentialité

- **Rôle** : Informational legal page describing CerclAI's data collection practices under GDPR, for website visitors and users
- **Route** : `https://www.cerclai.fr/confidentialite`
- **Accès** : https://www.cerclai.fr → footer contains 'Conformité RGPD' link → /confidentialite. Can also navigate directly to https://www.cerclai.fr/confidentialite
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/7a722871-c725-4eab-bd97-49d80f89abbf (154 s, 22 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/confidentialite`

**Mise en page (haut → bas)**

- Sticky header (logo, nav: Services, Réalisations, Aides, À propos, Rejoindre le cercle, phone, Demander un échange button)
- Page title with subtitle and last-updated date
- Left sidebar: Sommaire with 6 numbered anchor links
- Main content: 6 numbered sections (01-06) with data collection tables
- Footer: Mentions légales link, CTA section, full footer with links
- Cookie banner (bottom-left): 'Ni pistage, ni publicité' with Détails and Compris buttons

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | Politique de confidentialité |  |  |
| text | Quelles données CerclAI collecte, pourquoi, combien de temps, et comment exercer vos droits. |  |  |
| text | Dernière mise à jour : 7 novembre 2026 |  |  |
| link | Sommaire (6 anchor links: Responsable du traitement, Ce que nous collectons, Qui y a accès, Transferts hors de l'UE, Cookies et stockage, Vos droits) |  |  |
| text | CerclAI, Paris. | contact@cerclai.fr | 07 68 74 61 26 |  |  |
| text | 6 content sections with data collection details |  |  |
| link | Mentions légales → |  |  |
| button | Demander mon échange gratuit |  |  |
| banner | Cookie banner: Ni pistage, ni publicité : seulement les cookies utiles au site. | Détails | Compris |  |  |

**Contenu (textes exacts)**

- Section 01: Responsable du traitement — CerclAI, Paris. contact@cerclai.fr, 07 68 74 61 26
- Section 02: Ce que nous collectons, et pourquoi — 5 subsections: Demande de rappel, Clients, Prospection auprès des entreprises, Candidature talent et espace membre, Baromètre — each with Données, Pourquoi, Base légale, Durée fields
- Section 03: Qui y a accès — Supabase (Paris), Vercel, OVHcloud; no data sold or shared
- Section 04: Transferts hors de l'Union européenne — Vercel (US), Supabase (Singapore); Data Privacy Framework or EU standard contractual clauses
- Section 05: Cookies et stockage — No advertising cookies, no tracking; only functional cookies (session, cookie banner state, form preferences, barometer mark, reload marker)
- Section 06: Vos droits — Access, correct, delete, limit, oppose, port data; contact contact@cerclai.fr or 07 68 74 61 26; CNIL complaint option

**Interactions testées**

- Clicked Sommaire link '01 Responsable du traitement' → Page scrolled to section 01, URL updated to #donnees
- Clicked 'Détails' button in cookie banner → No modal opened; page scrolled to Cookies section (URL changed to #cookies), banner remained visible
- Did not test 'Compris' button → N/A - would dismiss cookie banner

**Règles de fonctionnement**

_(rien relevé)_

**Données & technique**

- Static HTML page. No JS framework, no API calls, no dynamic data. Page source identical with or without JS rendering. All content hardcoded in HTML. No external dependencies (fonts, images, audio served from cerclai.fr).

**Style visuel**

- White/cream background, dark gray text, blue accent color for links and buttons, black 'Compris' button, serif or sans-serif font (no web fonts from third parties), clean minimal layout

**Cas limites / anomalies**

_(rien relevé)_

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

- Build a static HTML page at /confidentialite with: sticky header nav, page title with last-updated date, left sidebar Sommaire with 6 anchor links, main content with 6 sections using table-like layout for data collection items, footer with Mentions légales link and CTA, cookie banner with Détails (scrolls to cookies section) and Compris buttons. All content is static text.

**Captures**

![Politique de Confidentialité 1](../../artifacts/RPT_20261107_221151_F10/step_01.png)
![Politique de Confidentialité 2](../../artifacts/RPT_20261107_221151_F10/step_09.png)
![Politique de Confidentialité 3](../../artifacts/RPT_20261107_221151_F10/step_16.png)

### 2.11 Espace Membre / Connexion

- **Rôle** : Member login page for registered CerclAI users to access their account
- **Route** : `https://www.cerclai.fr/connexion`
- **Accès** : Navigate directly to https://www.cerclai.fr/connexion (no visible link in home page header; footer has 'Connexion' link in HTML but not easily visible in screenshots)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/62132907-4422-4690-b6d1-224e32416ed1 (196 s, 31 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/_next`, `https://www.cerclai.fr/_next/static/chunks/main-app.js`, `https://www.cerclai.fr/_next/static/css/main.css`, `https://www.cerclai.fr/assets/js/main.js`, `https://www.cerclai.fr/connexion`, `https://www.cerclai.fr/css/style.css`, `https://www.cerclai.fr/inscription`, `https://www.cerclai.fr/js/app.js`, `https://www.cerclai.fr/manifest.json`, `https://www.cerclai.fr/robots.txt`, `https://www.cerclai.fr/sitemap.xml`

**Mise en page (haut → bas)**

- Header: CerclAI logo | Services ▾ Réalisations Aides À propos | Phone 07 68 74 61 26
- Main: Heading 'Espace membre' + subheading 'Le cercle vous attend.'
- Login card (white, rounded): EMAIL input, MOT DE PASSE input, 'Mot de passe oublié ?' link, 'Se connecter' button
- Below card: 'Pas encore de compte ? Créer mon accès' + 'Vous n'avez pas encore candidaté ? Rejoindre le cercle'
- Footer: Blue bar with CerclAI logo + cookie consent banner

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | Espace membre |  |  |
| text | Le cercle vous attend. |  |  |
| input | EMAIL * (placeholder: votre@email.com) |  |  |
| input | MOT DE PASSE * (placeholder: Votre mot de passe) |  |  |
| link | Mot de passe oublié ? | Navigates to /mot-de-passe-oublie |  |
| button | Se connecter | Submits login form (SPA, no visible validation on empty submit) |  |
| link | Créer mon accès | Navigates to /inscription |  |
| link | Rejoindre le cercle | Navigates to /rejoindre |  |

**Contenu (textes exacts)**

- Espace membre
- Le cercle vous attend.
- EMAIL * — placeholder: votre@email.com
- MOT DE PASSE * — placeholder: Votre mot de passe
- Mot de passe oublié ?
- Se connecter
- Pas encore de compte ? Créer mon accès
- Vous n'avez pas encore candidaté ? Rejoindre le cercle

**Interactions testées**

- Clicked 'Mot de passe oublié ?' → Navigated to https://www.cerclai.fr/mot-de-passe-oublie
- Clicked 'Créer mon accès' → Navigated to https://www.cerclai.fr/inscription
- Clicked 'Rejoindre le cercle' → Navigated to https://www.cerclai.fr/rejoindre
- Clicked 'Se connecter' with empty form → No navigation, stayed on /connexion
- Browser back navigation after each link click → Returned correctly to /connexion each time

**Règles de fonctionnement**

- [unrated] Mot de passe oublié ? navigates to /mot-de-passe-oublie — _preuve : Confirmed by clicking and observing URL change_
- [unrated] Créer mon accès navigates to /inscription — _preuve : Confirmed by clicking and observing URL change_
- [unrated] Rejoindre le cercle navigates to /rejoindre — _preuve : Confirmed by clicking and observing URL change_
- [unrated] Se connecter is a form submit button (no visible validation on empty submit) — _preuve : Clicked with empty form, no navigation or error shown_
- [unrated] All routes are private (not in sitemap.xml) — _preuve : sitemap.xml does not list /connexion, /inscription, or /mot-de-passe-oublie_

**Données & technique**

- Client-side rendered SPA (web_fetch cannot retrieve /connexion HTML)
- All content static, no API calls observed
- Standard asset paths returned 404 (build system unknown)

**Style visuel**

- Background: light textured off-white/cream
- Primary color: bright blue #2849ff (button, links, footer)
- Text: dark (near black) headings, gray body
- Links: blue underlined
- Card: white, rounded corners, subtle shadow
- Font: sans-serif (exact not identified)
- Asterisks (*): red, required fields
- No animations observed

**Cas limites / anomalies**

_(rien relevé)_

**Questions ouvertes**

- Form submission behavior (where does it POST, what validation occurs)
- Exact font family and size
- Mot de passe oublié page content and behavior

**Pour la reconstruire**

- Create page at route /connexion
- Render heading 'Espace membre' and subheading 'Le cercle vous attend.'
- Create login form with EMAIL and MOT DE PASSE inputs (both required, red asterisk)
- Add 'Mot de passe oublié ?' link to /mot-de-passe-oublie
- Add 'Se connecter' submit button (blue #2849ff)
- Add 'Créer mon accès' link to /inscription
- Add 'Rejoindre le cercle' link to /rejoindre
- Match layout: centered white card on off-white background, blue footer bar

**Captures**

![Espace Membre / Connexion 1](../../artifacts/RPT_20261107_221151_F11/step_01.png)
![Espace Membre / Connexion 2](../../artifacts/RPT_20261107_221151_F11/step_08.png)
![Espace Membre / Connexion 3](../../artifacts/RPT_20261107_221151_F11/step_15.png)

### 2.12 Modèle /{service-slug} (11 pages)

- **Rôle** : Service detail page for CerclAI's web development service, targeting artisans and SMEs. Shows what's included, examples, pricing info, and FAQ.
- **Route** : `https://www.cerclai.fr/creation-site-internet`
- **Accès** : Accueil → Services (hover/click dropdown) → \"Création de site internet\" (first item in \"Être trouvé et choisi\" group)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/4c5c6a66-cd7e-40ca-ab6e-cbf5c3383d3b (197 s, 34 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/_next/static/chunks/main.js`, `https://www.cerclai.fr/_next/static/css/main.css`, `https://www.cerclai.fr/creation-site-internet`, `https://www.cerclai.fr/js/app.js`

**Mise en page (haut → bas)**

- Sticky header with nav (Services dropdown, Réalisations, Aides, À propos, Rejoindre le cercle, phone, CTA button)
- Breadcrumb: Accueil > Services > Création de site internet
- Hero section: H1 heading + description + CTA button (left) / Desktop+phone mockup of sweness.com (right)
- Exemples par métier: horizontal phone carousel with 4 business examples
- Ce que ça change pour vous: 3 benefit items
- Perfect Body by Anna example card with image
- Ce qui est compris: 6 bullet points
- Ce qui ne l'est pas: 2 bullet points
- Devis et aides: pricing + links
- FAQ accordion: 3 questions
- Une réalisation: Eco Star case study with phone mockup
- CTA section: 'Concentrez-vous sur votre métier'
- Footer: 5 columns + bottom links

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| heading | Création ou refonte de site internet. |  |  |
| paragraph | Chez CerclAI, nous concevons des sites modernos, rapides et adaptés à tous les écrans, pensés pour renforcer votre visibilité et transformer vos visiteurs en clients. Référencement Google, prise de rendez-vous, demandes de devis et intégration à vos outils : chaque fonctionnalité est conçue pour développer votre activité. |  |  |
| button | Demander mon échange gratuit | Navigates to /contact |  |
| text | 30 minutes au téléphone ou en visio, sans engagement. |  |  |
| image | Desktop + phone mockup of sweness.com (fashion boutique) |  |  |
| link | sweness.com ↗ |  |  |
| heading | Exemples par métier |  |  |
| carousel | Phone carousel with 4 business examples: Serrurerie, Ostéopathe, Bistrot, Rénovation énergétique |  |  |
| heading | Ce que ça change pour vous. |  |  |
| heading | Ce qui est compris. |  |  |
| list | 6 items: plan des pages, textes rédigés, photos optimisées, référencement local, mentions légales, heure de prise en main |  |  |
| heading | Ce qui ne l'est pas. |  |  |
| list | 2 items: séance photo sur place, publicité payante |  |  |
| heading | Devis et aides. |  |  |
| link | Proposer une mission |  |  |
| link | Les aides qui financent un site internet |  |  |
| heading | Vos questions sur la création de site internet. |  |  |
| accordion | 3 FAQ items: J'ai déjà un site, Le site sera-t-il bien placé sur Google, Le site m'appartient-il |  |  |
| heading | Une réalisation |  |  |
| image | Eco Star website on iPhone mockup |  |  |
| link | Voir le site eco-star.fr |  |  |
| link | Toutes nos réalisations |  |  |
| heading | Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous. |  |  |
| button | Demander mon échange gratuit |  |  |
| footer | Footer with Services, Métiers, Aides, CerclAI, Nous joindre columns |  |  |

**Contenu (textes exacts)**

- Création ou refonte de site internet.
- Chez CerclAI, nous concevons des sites modernos, rapides et adaptés à tous les écrans, pensés pour renforcer votre visibilité et transformer vos visiteurs en clients. Référencement Google, prise de rendez-vous, demandes de devis et intégration à vos outils : chaque fonctionnalité est conçue pour développer votre activité.
- Demander mon échange gratuit
- 30 minutes au téléphone ou en visio, sans engagement.
- Exemples par métier
- Serrurerie — Dépannage, installation, sécurisation.
- Ostéopathe — Prises de rendez-vous, explications, rappels.
- Bistrot — Réservations, carte, événements.
- Rénovation énergétique — Devis, conseils, suivi de chantiers.
- Ce que ça change pour vous.
- Vos clients vous appellent, au lieu de chercher ailleurs.
- Les demandes arrivent complètes. Le formulaire ou la réservation en ligne demande ce qu'il vous faut pour répondre : le besoin, l'adresse, le créneau.
- Google comprend ce que vous faites, et où.
- Perfect Body by Anna — Site internet — Les soins signature, avec leur durée et leur tarif
- Ce qui est compris.
- Le plan des pages, défini ensemble avant de commencer
- Les textes rédigés avec vous, dans vos mots
- Vos photos optimisées, pour un site qui se charge vite
- Le référencement local : titres, données structurées, fiche Google
- Les mentions légales et le bandeau cookies, conformes
- Une heure de prise en main à la mise en ligne
- Ce qui ne l'est pas.
- La séance photo sur place : on travaille avec vos photos
- La publicité payante, sur Google ou sur les réseaux sociaux
- Devis et aides.
- Prix ferme, écrit dans le devis.
- Proposer une mission
- Une partie peut être financée.
- Les aides qui financent un site internet
- Vos questions sur la création de site internet.
- J'ai déjà un site. Faut-il repartir de zéro ? — Pas forcément. On regarde d'abord ce qui fonctionne : vos textes, vos photos, les pages déjà bien placées sur Google. Ce qui marche est gardé, et les adresses des anciennes pages sont redirigées vers les nouvelles, pour ne perdre aucune visite.
- Le site sera-t-il bien placé sur Google ? — Il part avec ce que Google demande : des pages rapides sur téléphone, des titres clairs, des données structurées et une fiche Google à jour. La place dépend ensuite de la concurrence dans votre métier et votre zone. On ne promet pas de position : on vous montre où vous en êtes.
- Le site m'appartient-il ? — Oui. Le site, ses textes, ses photos et tous les accès sont à vous. Si vous changez un jour de prestataire, vous partez avec tout.
- Une réalisation — Eco Star — Rénovation énergétique — Site vitrine, rendez-vous en ligne, demande de rappel.
- Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.

**Interactions testées**

- Clicked 'Demander mon échange gratuit' button in hero → Navigates to /contact page
- Clicked 'sweness.com' link → Opens https://sweness.com in new tab (external link with ↗ indicator)
- Observed phone carousel → 4 business examples visible: Serrurerie, Ostéopathe, Bistrot, Rénovation énergétique. Horizontally scrollable.
- Clicked FAQ item 1: 'J'ai déjà un site. Faut-il repartir de zéro ?' → Expanded to show answer about keeping working content and redirecting old URLs
- Clicked FAQ item 2: 'Le site sera-t-il bien placé sur Google ?' → Expanded to show answer about technical SEO and no position promises
- Clicked FAQ item 3: 'Le site m'appartient-il ?' → Expanded to show answer confirming full ownership
- Clicked 'Voir le site eco-star.fr' link → Would open https://eco-star.fr (external link - not clicked to avoid leaving site)
- Clicked 'Proposer une mission' link → Would navigate to /contact (not clicked to avoid form)
- Clicked 'Les aides qui financent un site internet' link → Would navigate to /subventions/site-internet (not clicked)

**Règles de fonctionnement**

_(rien relevé)_

**Données & technique**

- Static HTML server-side rendered. Phone carousel data (4 business examples) rendered client-side (not in static HTML). All text content embedded in SSR HTML. Images static assets from /shots/ directory. No API calls detected. No dynamic data fetching.

**Style visuel**

- Light beige/cream textured background with subtle noise. Primary color: blue (#2563EB) for buttons and links. Black for headings, dark gray for body text. Sans-serif font (Inter-like). Max-width container. Desktop mockup + phone side by side in hero. WebP images from /shots/opt/ directory. No animations observed."],

**Cas limites / anomalies**

- Page title says 'pour artisans et PME' but hero heading doesn't include target audience
- Sweness.com mockup shown in hero but static HTML references 'Perfect Body by Anna' as secondary example
- Phone carousel has no visible navigation arrows or dots - appears to be simple horizontal scroll
- FAQ accordion allows multiple items to be open simultaneously

**Questions ouvertes**

- How is the phone carousel data (4 business examples) stored - hardcoded in JS or fetched from API?
- What JS framework is used to build the site (Next.js, Nuxt, etc.)?
- Are there any CSS animations or transitions that weren't visible during observation?

**Pour la reconstruire**

- Create page at route /creation-site-internet
- Add sticky header with nav links and CTA button
- Add breadcrumb: Accueil > Services > Création de site internet
- Add hero section with H1, paragraph, CTA button, and sweness.com mockup image
- Add 'Exemples par métier' section with horizontal phone carousel (4 items: Serrurerie, Ostéopathe, Bistrot, Rénovation énergétique)
- Add 'Ce que ça change pour vous' section with 3 benefit items
- Add Perfect Body by Anna example card with image from /shots/opt/site-anna-soins-1280.webp
- Add 'Ce qui est compris' section with 6 bullet points
- Add 'Ce qui ne l'est pas' section with 2 bullet points
- Add 'Devis et aides' section with 2 links (/contact and /subventions/site-internet)
- Add FAQ accordion with 3 questions and answers
- Add 'Une réalisation' section with Eco Star phone mockup and links
- Add final CTA section with button to /contact
- Add footer with 5 columns of links

**Captures**

![Modèle /{service-slug} (11 pages) 1](../../artifacts/RPT_20261107_221151_F12/step_01.png)
![Modèle /{service-slug} (11 pages) 2](../../artifacts/RPT_20261107_221151_F12/step_12.png)
![Modèle /{service-slug} (11 pages) 3](../../artifacts/RPT_20261107_221151_F12/step_23.png)

### 2.13 Modèle /{profession} (3 pages)

- **Rôle** : Professional segment landing page for artisans, showcasing CerclAI's web dev, AI voice agent, and CRM services tailored to tradespeople
- **Route** : `-`
- **Accès** : Home page → scroll to footer → 'Métiers' section → click 'Artisans'
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/44e62fe4-ad04-4ee3-aedb-71463c605b99 (160 s, 31 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/artisans`, `https://www.cerclai.fr/data.json`, `https://www.cerclai.fr/data/artisans.json`

**Mise en page (haut → bas)**

- Sticky header: logo, nav (Services, Réalisations, Aides, À propos), Rejoindre le cercle, phone, Demander un échange button
- Hero: breadcrumb 'Accueil > Artisans', H1 'Le site, les devis et l'agent vocal IA des artisans.', subheadline, CTA button 'Demander mon échange gratuit →', subtext '30 minutes au téléphone ou en visio, sans engagement.', hero image (laptop+phone mockup)
- Trust bar: 'Vos outils sont construits par des talents formés à' + 8 school logos, 'et passés par' + 7 company logos, 'Voir tous les parcours →'
- Section 'Moins d'appels perdus, moins de soirées sur les devis.' + list of trades + Garage Sorbel image + 3 bullet points (each with link) + 'Voir nos réalisations' link
- Section 'Quand vous rappelez, le client a déjà appelé un confrère.' + phone mockup call log + 'Le même agent, dans d'autres métiers' + 4 tabs (Artisan/Restaurant/Institut/Fleuriste) + call transcription content
- Section 'Chiffré avant de commencer, comme vos devis.' + 'Une aide locale peut en payer une partie.' + subvention image + example text + department dropdown + 'Voir mes aides'
- Section 'On démarre sans arrêter vos chantiers.' + 3 numbered steps + Jérémie Gallula agent card + 'Voir la méthode en détail'
- Section 'Vos questions d'artisan.' + 3 FAQ Q&As
- Footer CTA 'Concentrez-vous sur votre métier...' + 'Demander mon échange gratuit'
- Footer: Services, Métiers, Aides, CerclAI, Nous joindre links + baromètre + legal links + copyright

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| link | Artisans (footer) | Navigates to /artisans |  |
| heading | Le site, les devis et l'agent vocal IA des artisans. |  |  |
| button | Demander mon échange gratuit → | Navigates to /contact |  |
| image | Hero mockup: laptop + phone showing Serrurerie website + AI voice agent |  |  |
| link | Voir tous les parcours → |  |  |
| link | Voir nos réalisations |  |  |
| tab | Artisan (active) |  |  |
| tab | Restaurant |  |  |
| tab | Institut |  |  |
| tab | Fleuriste |  |  |
| select | Votre département dropdown |  |  |
| link | Voir mes aides |  |  |
| link | Voir la méthode en détail |  |  |
| link | Demander mon échange gratuit (footer CTA) |  |  |

**Contenu (textes exacts)**

- H1: 'Le site, les devis et l'agent vocal IA des artisans.'
- Subheadline: 'Vous restez sur le chantier. Le téléphone, les devis et les relances suivent sans vous.'
- CTA: 'Demander mon échange gratuit →' / '30 minutes au téléphone ou en visio, sans engagement.'
- Trades list: 'Plombiers, électriciens, chauffagistes, serruriers, menuisiers, couvreurs, maçons, peintres, carreleurs, garagistes, paysagistes.'
- Artisan tab content: 'Serrurier du 15e' / 0:44 / 'Intervention urgente — Ouverture de porte et serrure' / 7-line transcript / 'Appels de démonstration, entreprises fictives.'
- Restaurant tab content: 'Fast and Fresh' / 0:49 / 'Réservation : table pour 4, ce soir à 20 h 30' / 13-line transcript
- Subvention example: 'Exemple relevé le 18 octobre 2026 : l'Agglo de Brive finance 30 % de votre projet numérique, jusqu'à 3 000 € (« Je digitalise »).'
- Agent: 'Jérémie Gallula — Jérémie vous appelle sous 48 h ouvrées et suit votre projet.'
- FAQ: 'J'utilise Batappli ou Obst. Faut-il en changer ?' / 'Et les urgences de nuit ?' / 'Je travaille dans un rayon de 30 km. Le site le dit ?'

**Interactions testées**

- Clicked 'Restaurant' tab → Content swapped to restaurant version: 'Fast and Fresh', 0:49, reservation transcript
- Clicked 'Institut' tab → Content swapped to Institut version
- Clicked 'Fleuriste' tab → Content swapped to Fleuriste version
- Clicked 'Voir nos réalisations' → Navigated to /realisations (broken link, 404)
- Clicked 'Voir tous les parcours' → Navigated to /a-propos#parcours
- Department dropdown → Native select with all 97 French departments + DOM-TOM; 'Voir mes aides' links to /subventions

**Règles de fonctionnement**

_(rien relevé)_

**Données & technique**

- ["Static HTML, server-rendered, no JS framework detected", "Tab content (call transcripts) appears hardcoded in HTML, no API calls", "Department selector is native <select> element", 'Broken link: /realisations returns 404']

**Style visuel**

- Background: off-white/cream #F5F0E8 textured
- Accent blue: #2563EB (buttons, active tab, highlighted text)
- Body text: grey #4B5563
- Font: sans-serif
- Layout: full-width sections, ~1200px max-width content container
- No animations observed

**Cas limites / anomalies**

_(rien relevé)_

**Questions ouvertes**

- Institut and Fleuriste tab content not visually verified (only Artisan and Restaurant confirmed)
- Why is 'Voir nos réalisations' link broken (404)?
- Are there more profession pages beyond the 3 in the footer?

**Pour la reconstruire**

- Create static HTML page at /artisans route
- Hero section with profession-adaptive H1 (blue accent on profession name)
- Trust bar with school and company logos
- 3-bullet feature section with linked service pages
- Tabbed call transcription section with 4 profession variants (Artisan default, Restaurant, Institut, Fleuriste)
- Subvention helper section with department dropdown
- 3-step onboarding section with agent card
- FAQ accordion section
- Footer CTA and full footer with all link groups

**Captures**

![Modèle /{profession} (3 pages) 1](../../artifacts/RPT_20261107_221151_F13/step_01.png)
![Modèle /{profession} (3 pages) 2](../../artifacts/RPT_20261107_221151_F13/step_12.png)
![Modèle /{profession} (3 pages) 3](../../artifacts/RPT_20261107_221151_F13/step_23.png)

### 2.14 Modèle /subventions/{category} (5 pages)

- **Rôle** : Display government subsidy aids for website creation/refurbishment in France, by region and department
- **Route** : `https://www.cerclai.fr/subventions/site-internet`
- **Accès** : Home page → Aides (nav) → Site internet card, or direct URL https://www.cerclai.fr/subventions/site-internet
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/a869f7e4-a74a-4d77-ba1a-4072c7a5d8bd (163 s, 23 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/js/main.js`, `https://www.cerclai.fr/subventions/site-internet`

**Mise en page (haut → bas)**

- Header: logo, nav (Services, Réalisations, Aides, À propos), Rejoindre le cercle, phone, Demander un échange button
- Breadcrumb: Accueil > Aides > Site internet
- Hero: H1 title, body text (77 aides/56 subventions), sub-text, CTA button, service link, France dot map
- Partout en France: 4 national aid cards (Prêt Boost x2, France Num, PDOM)
- Région par région: 17 region cards with aid counts and highlights
- 31 départements: list of department links
- Vos questions: 3 FAQ Q&As
- Les aides par projet: 4 category cards (IA, Cyber, Logiciel, Formation IA)
- CTA section: 'Concentrez-vous sur votre métier' with button
- Footer: full site footer

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| breadcrumb | Accueil > Aides > Site internet |  |  |
| heading | Subvention site internet : les aides 2026, région par région |  |  |
| paragraph | 77 aides publiques peuvent financer un site internet en 2026, dont 56 subventions. 73 sont régionales ou locales, dans 16 régions, et 4 nationales. |  |  |
| paragraph | Vérifiées deux fois sur les sources officielles le 18 octobre 2026. CerclAI monte le dossier avec vous ; le financeur décide. |  |  |
| button | Savoir à quelles aides je suis éligible → | Navigates to /contact |  |
| link | Le service : Création de site internet → | Navigates to /creation-site-internet |  |
| image | France dot map showing subsidy counts by region |  |  |
| heading | Partout en France |  |  |
| card | Prêt Boost – Commerce de proximité (Bpifrance, 5000-100000€) |  |  |
| card | Prêt Boost – Transformation numérique (Bpifrance, 5000-100000€) |  |  |
| card | France Num – Activateurs (État, premier RDV gratuit) |  |  |
| card | Prêt de Développement Outre-Mer (PDOM) (Bpifrance, 10000-750000€) |  |  |
| heading | Région par région |  |  |
| link | 17 region links (Auvergne-Rhône-Alpes, Bourgogne-Franche-Comté, etc.) |  |  |
| section | 31 départements with local aid links |  |  |
| heading | Vos questions (FAQ - 3 Q&As) |  |  |
| heading | Les aides par projet (4 category links) |  |  |
| button | Savoir à quelles aides je suis éligible (CTA) |  |  |
| footer | Full footer with services, métiers, aides, contact links |  |  |

**Contenu (textes exacts)**

- H1: Subvention site internet : les aides 2026, région par région
- Body: 77 aides publiques peuvent financer un site internet en 2026, dont 56 subventions. 73 sont régionales ou locales, dans 16 régions, et 4 nationales.
- Sub: Vérifiées deux fois sur les sources officielles le 18 octobre 2026. CerclAI monte le dossier avec vous ; le financeur décide.
- CTA: Savoir à quelles aides je suis éligible → (/contact)
- Service link: Le service : Création de site internet → (/creation-site-internet)
- 4 national aids: Prêt Boost Commerce de proximité, Prêt Boost Transformation numérique, France Num Activateurs, PDOM
- 17 regions listed with aid counts
- 31 départements with local aid links
- 3 FAQ questions about aid counts, top region, provider choice
- 4 project categories: IA (58 aides), Cyber (57), Logiciel (100), Formation IA (24)
- CTA: Savoir à quelles aides je suis éligible
- Footer with all site links

**Interactions testées**

- Navigated to page from home via Aides nav → Page loaded at /subventions/site-internet with hero, map, and content sections. No filter controls visible.
- Scrolled through entire page → Confirmed no filter dropdowns, checkboxes, or interactive filter UI present. Page is static content.
- Attempted to find filter controls (Type, Région, Département, Profil, Services éligibles) → NOT FOUND. The filter UI described in the task does not exist on this page. No ?type=, ?region=, ?departement=, ?profil=, or ?besoin= URL parameters observed.

**Règles de fonctionnement**

_(rien relevé)_

**Données & technique**

- Static server-rendered HTML page
- All subsidy data hardcoded in HTML (77 aides, region counts, department lists, FAQ)
- No JavaScript filtering or API calls observed
- No SPA framework detected
- France map is static SVG/image

**Style visuel**

- Dark navy/black text on white background
- Blue (#2563EB) for CTAs and links
- Sans-serif font (Inter-like)
- Card-based grid layouts
- France dot map illustration
- No animations on subventions page

**Cas limites / anomalies**

_(rien relevé)_

**Questions ouvertes**

- The filter controls described in the task (Type d'aide, Région, Département, Profil, Services éligibles) are NOT present on the current page. Were they present in a previous version? The initial screenshot showed them but they are not in the current rendered page or server HTML.
- What was the original state of the page that showed the filter UI?

**Pour la reconstruire**

- Create static HTML page with hero section (title, count text, CTA, France map)
- Add 'Partout en France' section with 4 national aid cards
- Add 'Région par région' section with 17 region cards
- Add 31 department links section
- Add FAQ section with 3 Q&As
- Add 'Les aides par projet' section with 4 category links
- Add CTA section and footer
- Note: The interactive filter UI described in the task is NOT present on this page - it does not exist in the current implementation

**Captures**

![Modèle /subventions/{category} (5 pages) 1](../../artifacts/RPT_20261107_221151_F14/step_01.png)
![Modèle /subventions/{category} (5 pages) 2](../../artifacts/RPT_20261107_221151_F14/step_06.png)
![Modèle /subventions/{category} (5 pages) 3](../../artifacts/RPT_20261107_221151_F14/step_11.png)

### 2.15 Modèle /subventions/{region}/{departement} (35 pages)

- **Rôle** : Help TPE/PME businesses in French departments find verified digital subsidy aids (subventions, chèques, prêts, formations) by region and department, with filtering by profile, company size, and service category
- **Route** : `https://www.cerclai.fr/subventions/auvergne-rhone-alpes/ardeche`
- **Accès** : Home page → click 'Aides' in nav → click 'Voir les 30 aides' button → lands on /subventions/auvergne-rhone-alpes/ardeche
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/ec6e658e-8cbe-4166-a42e-15f98ca3be34 (244 s, 43 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/subventions`, `https://www.cerclai.fr/subventions/auvergne-rhone-alpes/ardeche`

**Mise en page (haut → bas)**

- Sticky header: logo, nav (Services, Réalisations, Aides, À propos), Rejoindre le cercle, phone, Demander un échange button
- Hero: title 'Aides au numérique en Ardèche 2026 : TPE et PME', breadcrumb, intro paragraph, 4 category chips
- Section 'Les 4 aides locales en Ardèche': subtitle, disclaimer, 4 aid cards with Details accordion
- Section '26 autres aides en Ardèche, dont 3 subventions': filters (situation dropdown, salariés buttons, micro checkbox, type pills), 1 stacked card, 'Voir les 16 autres aides' link
- Section 'Les autres départements d'Auvergne-Rhône-Alpes': 12 department buttons, 'Toutes les aides d'Auvergne-Rhône-Alpes' link
- Section 'Ce que ces aides peuvent financer': 5 service cards with counts
- Section 'Vos questions': 2 FAQ pairs
- CTA banner with phone/video offer and blue button
- Footer: all links, contact, social, copyright

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| nav | cerclai logo, Services, Réalisations, Aides, À propos, Rejoindre le cercle, phone, Demander un échange button |  |  |
| heading | Aides au numérique en Ardèche 2026 : TPE et PME |  |  |
| breadcrumb | Aides > Auvergne-Rhône-Alpes > Ardèche |  |  |
| paragraph | L'Ardèche (07) propose 4 aides locales et 26 aides régionales et nationales... |  |  |
| chip | Site internet 5 |  |  |
| chip | Logiciel & CRM 8 |  |  |
| chip | IA & automatisation 2 |  |  |
| chip | Cybersécurité & RGPD 1 |  |  |
| card | Aide aux investissements des entreprises avec point de vente (CCBA) |  |  |
| card | Aide au commerce de proximité (CAPCA) |  |  |
| card | Financer mon investissement – artisanat sans point de vente (ARCHE Agglo) |  |  |
| card | Financer mon investissement – commerce et artisanat avec point de vente (ARCHE Agglo) |  |  |
| dropdown | Votre situation: Toutes situations, Artisan, Commerçant, Profession libérale, Entreprise de services |  |  |
| segmented_button | Nombre de salariés: 0, 1-9, 10-49, 50+ |  |  |
| checkbox | Je suis en micro-entreprise |  |  |
| pill_button | Tout |  |  |
| pill_button | Site internet |  |  |
| pill_button | Logiciel & CRM |  |  |
| pill_button | IA & automatisation |  |  |
| pill_button | Cybersécurité & RGPD |  |  |
| pill_button | Réseaux sociaux |  |  |
| pill_button | Formation |  |  |
| expandable_link | Voir les 16 autres aides |  |  |
| department_button | Ain 01, Allier 03, Ardèche 07, Cantal 15, Drôme 26, Isère 38, Loire 42, Haute-Loire 43, Puy-de-Dôme 63, Rhône 69, Savoie 73, Haute-Savoie 74 |  |  |
| link | Toutes les aides d'Auvergne-Rhône-Alpes |  |  |
| faq_section | Quelle aide locale finance le numérique en Ardèche? / Peut-on choisir son prestataire? |  |  |
| cta_banner | Concentrez-vous sur votre métier... Savoir à quelles aides je suis éligible |  |  |
| footer | Services, Métiers, Aides, CerclAI, Contact, Social, Baromètre 2026, legal links |  |  |

**Contenu (textes exacts)**

- Ardèche : 4 aides locales, plus 26 aides régionales et nationales, vérifiées le 18/10/2026 sur les sites officiels.
- Financeurs : ARCHE Agglo, Communauté d'agglomération Privas Centre Ardèche, Communauté de communes du Bassin d'Aubenas. Le conseil départemental n'a pas d'aide propre au numérique des entreprises.
- Vérifiées deux fois sur les sources officielles le 18 octobre 2026. CerclAI vous aide à monter le dossier, mais c'est le financeur qui attribue l'aide : confirmez ses conditions avant d'engager une dépense.
- Votre situation: Toutes situations, Artisan, Commerçant, Profession libérale, Entreprise de services
- Nombre de salariés: 0, 1-9, 10-49, 50+
- Je suis en micro-entreprise
- Type filters: Tout, Site internet, Logiciel & CRM, IA & automatisation, Cybersécurité & RGPD, Réseaux sociaux, Formation
- Voir les 16 autres aides / Masquer les autres aides
- Voir les 10 dispositifs (formation card)
- Voir les 13 aides non ouvertes à votre situation
- Toutes les aides d'Auvergne-Rhône-Alpes

**Interactions testées**

- Clicked 'Aides' in nav from home page → Navigated to /subventions
- Clicked 'Voir les 30 aides' button → Navigated to /subventions/auvergne-rhone-alpes/ardeche
- Clicked 'Site internet' type filter → List filtered to 17 aides, 'Voir les 7 autres aides' shown
- Clicked 'Logiciel & CRM' type filter → List filtered to 18 aides
- Clicked 'IA & automatisation' type filter → List filtered to 17 aides
- Clicked 'Cybersécurité & RGPD' type filter → List filtered to 19 aides
- Clicked 'Réseaux sociaux' type filter → List filtered to 18 aides
- Clicked 'Formation' type filter → List filtered to 17 aides
- Selected 'Artisan' in Votre situation dropdown → URL ?statut=artisan, count 26→21, '5 aides masquées' message
- Selected '1-9' in Nombre de salariés → URL ?statut=artisan&salaries=1-9, count 19
- Checked 'Je suis en micro-entreprise' → URL ?salaries=1-9&micro=1, count 20, '6 aides masquées'
- Clicked 'Détails' on first aid card → Expanded accordion showing Pour qui, Dépenses éligibles, À savoir, Montant, Zone, Prestataire, Source
- Clicked 'Voir les 16 autres aides' → Expanded to show 16 regional/national aids in table format with sections

**Règles de fonctionnement**

- [confirmed] Page always shows 4 local department aids (if any exist) in card format, plus regional/national aids in expandable list — _preuve : 4 local aid cards always visible; '26 autres aides' expandable section_
- [confirmed] Votre situation dropdown filters by user profile, updates URL param ?statut= — _preuve : Selecting Artisan changed URL to ?statut=artisan, count from 26 to 21_
- [confirmed] Nombre de salariés buttons filter by employee count, param ?salaries= — _preuve : 0→13 aides, 1-9→19 aides, URLs ?salaries=0 and ?salaries=1-9_
- [confirmed] micro-entreprise checkbox is additional boolean filter, param ?micro= — _preuve : Checked with 1-9 employees: count 20, URL ?salaries=1-9&micro=1_
- [confirmed] Type pill buttons are mutually exclusive, filter by service category, no URL param — _preuve : Tout=26, Site internet=17, Logiciel&CRM=18, IA=17, Cyber=19, Réseaux=18, Formation=17_
- [confirmed] Filters combine: multiple active filters show lowest matching count — _preuve : statut=artisan+salaries=1-9 showed 19 aides (from 26 base)_
- [confirmed] Détails accordion on each aid card shows: Pour qui, Dépenses éligibles, À savoir, Montant, Zone, Prestataire, Source — _preuve : Expanded first card details showing all fields_
- [confirmed] Department buttons navigate within region, some use slugs (ardeche, drome, loire) others use ?departement=code — _preuve : Ardèche uses /ardeche slug, Ain uses ?departement=01_
- [confirmed] All aids verified twice on official sources, last check 18 Oct 2026, updated monthly — _preuve : Text on page: 'Vérifiées deux fois sur les sources officielles le 18 octobre 2026'_

**Données & technique**

- Client-side filtering via URL query params (no page reload)
- Params: ?statut=, ?salaries=, ?micro=, type filters (no param observed)
- Static HTML content with client-side JS for filter logic
- 153 total aids across all regions, verified on official sources
- Contact links use ?aide={id}&departement={code} params

**Style visuel**

- Dark navy header (#1a1a2e), white content area, blue accent (#2563eb) for buttons and active states
- Sans-serif font (Inter-like), bold headings, regular body
- Card-based layout with generous whitespace, rounded corners on cards
- Smooth accordion expand/collapse animations, filter state transitions
- Light gray background for filter section, dark background for active filter pills

**Cas limites / anomalies**

- Some departments have named URLs (ardeche, drome, loire) while others use ?departement=code
- 'Voir les X aides non ouvertes à votre situation' link shows filtered-out aids
- Formation card always shows regardless of filters (stacked card)
- Date limite badge only appears on some aid cards (e.g., 'Date limite: 31 décembre 2028')
- Some aids show 'À confirmer auprès du financeur' note, others show specific amounts

**Questions ouvertes**

- Type filter pill buttons don't appear to set a URL param - is this purely visual/client-side?
- What are the exact JS/CSS bundle URLs for the filter logic?
- Are there more than 16 regional/national aids (some may be hidden by filters)?
- What happens when all filters combined show 0 matching aids?

**Pour la reconstruire**

- Build static page with 4 local aid cards + expandable regional/national aids list
- Implement 5 filter controls: statut dropdown, salaries segmented buttons, micro checkbox, 7 type pills
- Filters combine and update URL params, client-side filtering
- Each aid card needs Details accordion with 7 fields
- Department navigation supports both slug and code-based URLs
- Data: 4 local aids + 26 regional/national for Ardèche (varies by department)

**Captures**

![Modèle /subventions/{region}/{departement} (35 pages) 1](../../artifacts/RPT_20261107_221151_F15/step_01.png)
![Modèle /subventions/{region}/{departement} (35 pages) 2](../../artifacts/RPT_20261107_221151_F15/step_18.png)
![Modèle /subventions/{region}/{departement} (35 pages) 3](../../artifacts/RPT_20261107_221151_F15/step_35.png)

### 2.16 Modèle /{success-page} (1 pages)

- **Rôle** : Displays a confirmation message after a user submits the contact form, with suggested next steps and a way to return to the home page.
- **Route** : `https://www.cerclai.fr/merci`
- **Accès** : Home page → click 'Demander mon échange gratuit' button → fills contact form → submits → redirects to /merci. Or directly navigate to https://www.cerclai.fr/merci
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/32651720-4f0e-4ebf-9c91-a712aaba42f6 (200 s, 27 actions)
- **Sources lues sur le site** : `https://www.cerclai.fr`, `https://www.cerclai.fr/_next/static/chunks/main-app.js`, `https://www.cerclai.fr/_next/static/css/main.css`, `https://www.cerclai.fr/assets/js/app.js`, `https://www.cerclai.fr/contact`, `https://www.cerclai.fr/js/app.js`, `https://www.cerclai.fr/merci`, `https://www.cerclai.fr/static/js/main.js`

**Mise en page (haut → bas)**

- Header: cerclai logo (top-left)
- Hero: Blue checkmark icon, 'Merci.' heading, 'Jérémie vous rappeler sous 48 h ouvrées.' subtitle
- Middle: 'En attendant' label, 3 suggested link cards
- Emergency: 'Une urgence ? Appelez le 07 68 74 61 26'
- CTA section: 'Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.' + 'Retour à l'accueil' button
- Footer: cerclai logo on blue background

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| logo | cerclai | Links to home page / |  |
| icon | Blue circular checkmark |  |  |
| heading | Merci. |  |  |
| text | Jérémie vous rappelle sous 48 h ouvrées. |  |  |
| label | En attendant |  |  |
| link | Écouter un appel de l'agent vocal IA / Des appels enregistrés, avec des entreprises fictives. | Links to /agent-vocal-ia |  |
| link | Voir les aides au numérique / Une partie de votre projet peut être financée. | Links to /subventions |  |
| link | Voir nos réalisations / Les sites et les logiciels livrés à vos clients. | Links to /realisations |  |
| link | Appelez le 07 68 74 61 26 | tel: link to 07 68 74 61 26 |  |
| heading | Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous. |  |  |
| button | Retour à l'accueil | Links to home page / |  |
| footer | cerclai logo |  |  |

**Contenu (textes exacts)**

- 'Merci.' (large black heading with period)
- 'Jérémie vous rappelle sous 48 h ouvrées.' (gray subtitle)
- 'En attendant' (small label)
- 'Écouter un appel de l'agent vocal IA' - 'Des appels enregistrés, avec des entreprises fictives.'
- 'Voir les aides au numérique' - 'Une partie de votre projet peut être financée.'
- 'Voir nos réalisations' - 'Les sites et les logiciels livrés à vos clients.'
- 'Une urgence ? Appelez le 07 68 74 61 26'
- 'Concentrez-vous sur votre métier. Laissez la technologie travailler pour vous.'
- 'Retour à l'accueil' (blue button)

**Interactions testées**

- Clicked 'Écouter un appel de l'agent vocal IA' → Navigated to /agent-vocal-ia
- Clicked 'Voir les aides au numérique' → Navigated to /subventions
- Clicked 'Voir nos réalisations' → Navigated to /realisations
- Clicked 'Retour à l'accueil' → Navigated to / (home page)

**Règles de fonctionnement**

- [confirmed] Page is a static thank-you page at /merci, reached after submitting the contact form at /contact — _preuve : Navigated from /contact form submission to /merci_
- [confirmed] Contact form at /contact has fields: Prénom et nom, Téléphone, Votre métier (dropdown), Ville ou code postal, Ce qui vous prend le plus de temps (facultatif), E-mail (facultatif) — _preuve : Observed on /contact page_
- [confirmed] All 3 suggested links navigate to internal pages: /agent-vocal-ia, /subventions, /realisations — _preuve : Clicked each link and verified navigation_
- [confirmed] Phone number is a tel: link, not an API call — _preuve : Text shows as clickable link_
- [confirmed] 'Retour à l'accueil' button navigates to home page / — _preuve : Clicked button and confirmed navigation to /_

**Données & technique**

- Static HTML page at /merci
- Likely built with Next.js
- All content appears static (no dynamic data fetched)
- Phone number is a tel: link

**Style visuel**

- Light gray/off-white background with subtle grain/noise texture
- Blue (#2563EB) for checkmark, phone link, Retour à l'accueil button, footer
- Black for main heading, gray for subtitles
- Clean sans-serif typography
- White cards with subtle shadow for suggested links
- Blue pill-shaped button with white text

**Cas limites / anomalies**

- Form submission is required to reach this page - it's a post-submission state
- No error states or loading states observed
- Page is purely informational with no interactive elements beyond navigation links

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

- Create static HTML page at /merci
- Include: blue checkmark icon, 'Merci.' heading, 'Jérémie vous rappeler sous 48 h ouvrées.' subtitle
- Add 3 link cards: /agent-vocal-ia, /subventions, /realisations with their titles and descriptions
- Add phone link: 'Appelez le 07 68 74 61 26'
- Add 'Retour à l'accueil' button linking to /
- Use blue (#2563EB) primary color, gray background with noise texture
- Ensure contact form at /contact redirects to /merci on successful submission

**Captures**

![Modèle /{success-page} (1 pages) 1](../../artifacts/RPT_20261107_221151_F16/step_01.png)
![Modèle /{success-page} (1 pages) 2](../../artifacts/RPT_20261107_221151_F16/step_09.png)
![Modèle /{success-page} (1 pages) 3](../../artifacts/RPT_20261107_221151_F16/step_17.png)

## 3. Checklist de reconstruction

**Homepage**

- [ ] Create sticky header with logo, Services dropdown (3 columns × 3 services), and right-side nav with phone + CTA button
- [ ] Build hero section with large serif H1, subheadline, blue CTA button, and composite hero image (desktop + phone mockup)
- [ ] Create 3 service sections with links and demo screenshots (chatbot conversation, automation workflow, CRM dashboard + cybersecurity checklist)
- [ ] Add pricing section with CTA to /subventions
- [ ] Add Actualités section with static text and Baromètre link
- [ ] Build 'Comment ça start' section with 3 numbered steps
- [ ] Add team section with Jérémie Gallula photo and 'Voir la méthode en détail' link
- [ ] Implement FAQ accordion with 3 questions (single-open behavior, +/× icons)
- [ ] Add final CTA section with heading and button
- [ ] Build blue footer with 5 columns of links + contact info + bottom bar with legal links
- [ ] Use serif font for headings, sans-serif for body text, off-white textured background, blue #2563EB as primary color
- [ ] All content is static - no backend needed for homepage

**Services**

- [ ] Create 4 sections with h2 headers: 'Être trouvé et choisi.', 'Ne plus rien laisser filer.', 'Être protégé.', 'Faire progresser l'équipe.'
- [ ] Each service: bold name with blue → link + one-line description + right-aligned visual mockup
- [ ] 'Être protégé' section needs dark background
- [ ] Hero section with large headline, subtext, blue CTA button, and device mockup composite image
- [ ] Footer with 5 link groups: CerclAI, Services (9), Métiers (3), Aides (6), Nous joindre

**Réalisations**

- [ ] Hard-code all 15 projects in HTML with their descriptions and device mockup images
- [ ] Create 4 non-functional tab labels with project counts (3,3,4,5)
- [ ] Layout: single column scroll with sections separated by horizontal rules
- [ ] Device mockup images from /shots/opt/ directory
- [ ] External links for 5 projects only (Sweness, Eco Star, Schemai, Diyouk, Clariforme)

**Aides (Subventions)**

- [ ] To rebuild this feature identically: 1) Create static HTML pages for /subventions, /subventions/{region}, /subventions/{region}/{dept}, /subventions/{project}. 2) Main page needs: hero section with 2026 deadline text, department search with autocomplete (all 101 French departments + DOM-TOM), 'Votre situation' dropdown (5 options), 'Nombre de salariés' segmented control, micro-entreprise checkbox, 'Voir les N aides' button, interactive France map (dot grid with CSS), 18+ region cards, 5 project cards, national aids section, methodology section, CTA. 3) Regional pages need: regional aids list (with type badges: Subvention/Accompagnement/Prêt/Formation financée), department links, national aids, 'Ce que ces aides peuvent financer' section, FAQ section. 4) Department pages need: same structure as regional + department-specific aids + 'Les autres départements' section. 5) All content is static - no API needed. 6) Map can be a simple CSS dot grid (no chart library needed).

**À propos**

- [ ] Single static HTML page at /a-propos with all content inline
- [ ] No JS framework needed - pure HTML/CSS
- [ ] Assets: hero mockup image, Jérémie Gallula photo, 17 school SVG logos, 10 company SVG logos
- [ ] Layout: two-column sections alternating with full-width sections
- [ ] No interactive components to implement - purely presentational

**Méthode**

- [ ] Create React page at route /methode
- [ ] Use Inter font from Google Fonts
- [ ] Implement hero with large heading, subtext, blue CTA button, and animated mock UI card
- [ ] Create 3-column table with 6 rows showing step details
- [ ] Add 3 detailed mockup image sections for steps 2, 3, 6
- [ ] Include 'Notre engagement' section and final CTA
- [ ] Style with Tailwind-like utility classes, #F2F1EC background, blue CTA buttons
- [ ] All content is static - no backend needed

**Contact**

- [ ] Create a two-column layout page at /contact
- [ ] Left column: 'Ce qui se passe ensuite' with 2 numbered steps + 'Qui vous répond' with CEO photo and name
- [ ] Right column: Form card titled 'Être rappelé' with subtitle 'Moins d'une minute.'
- [ ] Form fields: Prénom et nom (text), Téléphone (text), Votre métier (select: Artisan/BTP, Commerce, Cabinet/profession libérale, Garage, Hôtellerie/restauration, Services à domicile, Industrie/PME, Autre), Ville ou code postal (text), Ce qui vous prend le plus de temps (textarea, optional), E-mail (email, optional)
- [ ] Blue submit button 'Envoyer ma demande →'
- [ ] Privacy notice text below button linking to /confidentialite
- [ ] Hero section with heading 'Trente minutes pour repérer ce qu'on peut simplifier.' and subtitle
- [ ] Blue color for buttons: approximately #2563EB
- [ ] Phone number 07 68 74 61 26 in header and footer

**Baromètre 2026**

- [ ] Rebuild as React page at /barometre. 10-question quiz with exact questions/options. POST to /api/barometre on submit. Same color scheme. Chart blurred until 500 responses. Include 'Le cercle recrute' CTA after results. 'Formation·Spécialité·Ville' is descriptive text only.

**Mentions Légales**

- [ ] Create static HTML page at /mentions-legales
- [ ] Include: H1 'Mentions légales', intro paragraph, last-updated date, two-column layout (Sommaire TOC left, content right)
- [ ] 5 numbered sections with exact text as documented above
- [ ] Sommaire: 5 anchor links (editeur, hebergement, propriete-intellectuelle, logos, donnees-personnelles)
- [ ] CTA section with headline and 'Demander mon échange gratuit' button linking to /contact
- [ ] Use cream/beige background, blue (#2D5BF0) accent color, sans-serif font, rounded buttons
- [ ] Footer with standard CerclAI footer (shared across site)

**Politique de Confidentialité**

- [ ] Build a static HTML page at /confidentialite with: sticky header nav, page title with last-updated date, left sidebar Sommaire with 6 anchor links, main content with 6 sections using table-like layout for data collection items, footer with Mentions légales link and CTA, cookie banner with Détails (scrolls to cookies section) and Compris buttons. All content is static text.

**Espace Membre / Connexion**

- [ ] Create page at route /connexion
- [ ] Render heading 'Espace membre' and subheading 'Le cercle vous attend.'
- [ ] Create login form with EMAIL and MOT DE PASSE inputs (both required, red asterisk)
- [ ] Add 'Mot de passe oublié ?' link to /mot-de-passe-oublie
- [ ] Add 'Se connecter' submit button (blue #2849ff)
- [ ] Add 'Créer mon accès' link to /inscription
- [ ] Add 'Rejoindre le cercle' link to /rejoindre
- [ ] Match layout: centered white card on off-white background, blue footer bar

**Modèle /{service-slug} (11 pages)**

- [ ] Create page at route /creation-site-internet
- [ ] Add sticky header with nav links and CTA button
- [ ] Add breadcrumb: Accueil > Services > Création de site internet
- [ ] Add hero section with H1, paragraph, CTA button, and sweness.com mockup image
- [ ] Add 'Exemples par métier' section with horizontal phone carousel (4 items: Serrurerie, Ostéopathe, Bistrot, Rénovation énergétique)
- [ ] Add 'Ce que ça change pour vous' section with 3 benefit items
- [ ] Add Perfect Body by Anna example card with image from /shots/opt/site-anna-soins-1280.webp
- [ ] Add 'Ce qui est compris' section with 6 bullet points
- [ ] Add 'Ce qui ne l'est pas' section with 2 bullet points
- [ ] Add 'Devis et aides' section with 2 links (/contact and /subventions/site-internet)
- [ ] Add FAQ accordion with 3 questions and answers
- [ ] Add 'Une réalisation' section with Eco Star phone mockup and links
- [ ] Add final CTA section with button to /contact
- [ ] Add footer with 5 columns of links

**Modèle /{profession} (3 pages)**

- [ ] Create static HTML page at /artisans route
- [ ] Hero section with profession-adaptive H1 (blue accent on profession name)
- [ ] Trust bar with school and company logos
- [ ] 3-bullet feature section with linked service pages
- [ ] Tabbed call transcription section with 4 profession variants (Artisan default, Restaurant, Institut, Fleuriste)
- [ ] Subvention helper section with department dropdown
- [ ] 3-step onboarding section with agent card
- [ ] FAQ accordion section
- [ ] Footer CTA and full footer with all link groups

**Modèle /subventions/{category} (5 pages)**

- [ ] Create static HTML page with hero section (title, count text, CTA, France map)
- [ ] Add 'Partout en France' section with 4 national aid cards
- [ ] Add 'Région par région' section with 17 region cards
- [ ] Add 31 department links section
- [ ] Add FAQ section with 3 Q&As
- [ ] Add 'Les aides par projet' section with 4 category links
- [ ] Add CTA section and footer
- [ ] Note: The interactive filter UI described in the task is NOT present on this page - it does not exist in the current implementation

**Modèle /subventions/{region}/{departement} (35 pages)**

- [ ] Build static page with 4 local aid cards + expandable regional/national aids list
- [ ] Implement 5 filter controls: statut dropdown, salaries segmented buttons, micro checkbox, 7 type pills
- [ ] Filters combine and update URL params, client-side filtering
- [ ] Each aid card needs Details accordion with 7 fields
- [ ] Department navigation supports both slug and code-based URLs
- [ ] Data: 4 local aids + 26 regional/national for Ardèche (varies by department)

**Modèle /{success-page} (1 pages)**

- [ ] Create static HTML page at /merci
- [ ] Include: blue checkmark icon, 'Merci.' heading, 'Jérémie vous rappeler sous 48 h ouvrées.' subtitle
- [ ] Add 3 link cards: /agent-vocal-ia, /subventions, /realisations with their titles and descriptions
- [ ] Add phone link: 'Appelez le 07 68 74 61 26'
- [ ] Add 'Retour à l'accueil' button linking to /
- [ ] Use blue (#2563EB) primary color, gray background with noise texture
- [ ] Ensure contact form at /contact redirects to /merci on successful submission

## 4. À vérifier par expérience

- **Homepage** — What is the exact color value of the CerclAI blue? (estimated #2563EB)
- **Homepage** — What CSS framework or custom CSS is used? (couldn't access CSS files)
- **Homepage** — What is the exact serif font used for headings?
- **Homepage** — Why does the hero image show 3 dots but no navigation arrows? Is it a carousel or static?
- **Homepage** — What technology stack is used? (couldn't determine from available source)
- **Services** — Exact hex color values for blue and other colors
- **Services** — Font family and sizes used
- **Services** — CSS framework or custom styles
- **Aides (Subventions)** — - The task hypothesis mentions URL params (?type=, ?region=, ?departement=, ?profil=, ?besoin=) but none exist on this site. The filters are client-side only (dropdowns, checkboxes, tabs) that filter content on the same static page.
- The 'Je suis en micro-entreprise' checkbox effect not fully tested.
- The 'Nombre de salariés' segmented control effect not tested.
- The filter tabs on department pages (Tout, Site internet, etc.) not tested for their specific filtering behavior.
- **À propos** — The 'Lire la suite' link mentioned in the initial screenshot was not found in the actual page - it may have been from a different page version or a misread
- **À propos** — Cannot confirm exact CSS framework used without accessing source files (tried common paths, none found)
- **Méthode** — The exact blue color hex value (partially obscured in source)
- **Méthode** — Whether the hero carousel has user-controllable navigation (dots visible but not tested)
- **Méthode** — Exact animation timing for the hero card carousel
- **Contact** — What happens when 'Envoyer ma demande' is clicked? (Form submission behavior, success message, where data goes)
- **Contact** — Is there a 'Choisir un créneau' button that appears in a different view/state not visible in the default page load?
- **Contact** — What is the form submission endpoint and what data is sent?
- **Baromètre 2026** — Exact /api/barometre response format. Whether chart data is fetched from API (couldn't verify — always blurred). Whether progress is saved on navigation. Any intro animations on page load.
- **Mentions Légales** — The exact CSS font family and hex color values — would need to inspect computed styles
- **Mentions Légales** — Whether the page uses any CSS framework (Tailwind, etc.) — not detectable from content extraction
- **Espace Membre / Connexion** — Form submission behavior (where does it POST, what validation occurs)
- **Espace Membre / Connexion** — Exact font family and size
- **Espace Membre / Connexion** — Mot de passe oublié page content and behavior
- **Modèle /{service-slug} (11 pages)** — How is the phone carousel data (4 business examples) stored - hardcoded in JS or fetched from API?
- **Modèle /{service-slug} (11 pages)** — What JS framework is used to build the site (Next.js, Nuxt, etc.)?
- **Modèle /{service-slug} (11 pages)** — Are there any CSS animations or transitions that weren't visible during observation?
- **Modèle /{profession} (3 pages)** — Institut and Fleuriste tab content not visually verified (only Artisan and Restaurant confirmed)
- **Modèle /{profession} (3 pages)** — Why is 'Voir nos réalisations' link broken (404)?
- **Modèle /{profession} (3 pages)** — Are there more profession pages beyond the 3 in the footer?
- **Modèle /subventions/{category} (5 pages)** — The filter controls described in the task (Type d'aide, Région, Département, Profil, Services éligibles) are NOT present on the current page. Were they present in a previous version? The initial screenshot showed them but they are not in the current rendered page or server HTML.
- **Modèle /subventions/{category} (5 pages)** — What was the original state of the page that showed the filter UI?
- **Modèle /subventions/{region}/{departement} (35 pages)** — Type filter pill buttons don't appear to set a URL param - is this purely visual/client-side?
- **Modèle /subventions/{region}/{departement} (35 pages)** — What are the exact JS/CSS bundle URLs for the filter logic?
- **Modèle /subventions/{region}/{departement} (35 pages)** — Are there more than 16 regional/national aids (some may be hidden by filters)?
- **Modèle /subventions/{region}/{departement} (35 pages)** — What happens when all filters combined show 0 matching aids?
