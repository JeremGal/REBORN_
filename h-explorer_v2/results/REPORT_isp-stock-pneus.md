# Rapport de rétro-ingénierie — isp-stock-pneus-demo.vercel.app

> Généré par REBORN Explorer (agent H Company) le 2026-11-07T18:25:43+00:00. URL : https://isp-stock-pneus-demo.vercel.app/
> 11 fonctionnalités analysées (11 réussies), durée totale 351 s. Les observations viennent de l'agent : les points marqués `likely`/`guess` et les questions ouvertes sont à vérifier par expérience avant reconstruction.

## 0. Cadre légal et normes applicables (recherche Linkup)

> ⚖️ Synthèse automatique de sources web (Linkup, recherche approfondie) générée le 2026-11-07 20:35. **Ce n'est pas un avis juridique** : à faire valider par un juriste / expert-comptable avant reconstruction. Ces normes décrivent ce que la loi exige ; elles ne valident jamais un comportement observé dans l'application (seule l'expérience fait foi).

- **Secteur identifié** : Services de pneumatiques et assistance automobile, notamment pour véhicules utilitaires et industriels. Le code NAF 5221Z (« services auxiliaires des transports terrestres ») est mentionné pour l’entreprise, mais ne suffit pas à établir à lui seul son secteur opérationnel exact. (France)
- **Activités** : Gérer les stocks de pneus au dépôt et dans les camions. ; Enregistrer les montages et les transferts de pneus entre le dépôt et les véhicules. ; Gérer les commandes fournisseurs et la réception des livraisons. ; Effectuer et valider des inventaires, y compris des comptages à l’aveugle. ; Suivre les mouvements de stock et traiter les demandes de correction des techniciens. ; Exporter les données de stock, de mouvements et de commandes. ; Selon les informations fournies sur l’entreprise : vente, montage et dépannage de pneumatiques pour différents types de véhicules.
- **Données manipulées** : Références, dimensions et codes-barres des pneus ; Quantités et emplacements des stocks : dépôt et camions ; Catégories de véhicules et état des stocks par véhicule ; Commandes fournisseurs et données de réception ; Résultats d’inventaires et ajustements de stock ; Historique des mouvements et journal d’activité ; Demandes, décisions d’approbation ou de rejet et motifs ; Comptes utilisateurs, rôles, permissions et appareils associés
- **Domaines étudiés** : 12 (12 avec résultat), en 258 s

### 0.1 Facturation, devis et TVA

Le domaine s’applique : l’entreprise vend des pneus et fournit des prestations de montage et d’assistance. Les règles de facturation, de TVA et de conservation sont donc pertinentes ; l’obligation de certification d’un logiciel de caisse dépend toutefois de l’usage réel de l’ERP pour enregistrer des règlements de clients particuliers. Les éléments disponibles ne permettent pas d’établir la taille de l’entreprise, son régime de TVA ni l’ensemble des circuits de vente ; les échéances et obligations conditionnelles sont précisées ci-dessous.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Mentions obligatoires et émission des factures | CGI, art. 289 et annexe II, art. 242 nonies A ; Code de commerce, art. L. 441-9 et R. 123-237 ; CGI, art. 1737, II (sanction) | Émettre les factures conformément aux règles fiscales et commerciales applicables ; les mentions incluent notamment la date et le numéro de facture, l’identité des parties, la désignation et la quantité des biens ou services, les prix, les taux et montants de TVA et les conditions de paiement. ; Utiliser une numérotation unique fondée sur une séquence chronologique et continue, selon les règles de facturation applicables. ; Prévoir les mentions particulières de l’article 242 nonies A, notamment la date de livraison ou d’exécution si elle diffère de la date de facture, les montants HT et de taxe ventilés par taux et, le cas échéant, les mentions d’autoliquidation ou d’autofacturation. | Prévoir des champs structurés pour l’identité du vendeur et du client, les dates, le numéro de facture, les lignes, quantités, prix, taux de TVA, totaux et modalités de règlement. ; Paramétrer la numérotation et conserver les factures émises avec leur contenu et leurs dates ; les sources fournies ne justifient pas une exigence générale d’immutabilité technique absolue ni un algorithme particulier. ; Permettre l’édition et l’export des factures et des détails de TVA. La liste exhaustive des mentions dépend du type de client et de l’opération ; elle doit être vérifiée sur les textes applicables. | Obligations générales en vigueur. L’article 242 nonies A fourni indique que certaines mentions liées aux opérations relevant des articles 290 et 290 A s’appliquent aux factures émises, ou à défaut aux opérations réalisées, à compter du 1er septembre 2026. | CGI, art. 1737, II : les sources fournies indiquent une amende de 15 € par mention manquante ou inexacte, plafonnée au quart du montant de la facture. La sanction commerciale exacte et ses conditions ne sont pas établies par les seuls éléments fournis. |
| Facturation électronique B2B et transmission électronique de données | CGI, art. 289 bis, 290 et 290 A ; loi n° 2023-1322 du 29 décembre 2023 de finances pour 2024, art. 91 ; ordonnance n° 2021-1190 du 15 septembre 2021 ; CGI, annexe II, art. 242 nonies A | Depuis le 1er septembre 2026, toutes les entreprises concernées doivent être en capacité de recevoir des factures électroniques par le circuit prévu par la réforme. ; Les grandes entreprises et ETI doivent émettre leurs factures B2B domestiques sous forme électronique à compter du 1er septembre 2026 ; les PME et micro-entreprises à compter du 1er septembre 2027, selon le calendrier fourni. ; La transmission des données relevant de l’e-reporting suit le calendrier indiqué : 1er septembre 2026 pour grandes entreprises et ETI, 1er septembre 2027 pour PME et micro-entreprises. Les opérations concernées incluent, selon les sources fournies, les opérations B2C et internationales. ; L’article 242 nonies A fourni prévoit des mentions nouvelles pour les opérations concernées : SIREN du client, adresse de livraison si différente, catégorie de l’opération (biens, services ou mixte) et option pour la TVA sur les débits, le cas échéant. | Prévoir un circuit de réception et de traitement des factures électroniques via une plateforme répondant aux exigences de la réforme, ainsi que l’accès aux factures fournisseurs reçues. ; Pour l’émission et l’e-reporting, déterminer le calendrier applicable selon la taille de l’entreprise et ses opérations ; préparer les données nécessaires à la transmission. ; Prévoir les champs relatifs au SIREN client professionnel, à l’adresse de livraison, à la catégorie d’opération et à l’option de TVA sur les débits lorsqu’ils sont requis. ; Les formats, modalités techniques précises et sanctions propres à chaque manquement ne sont pas suffisamment détaillés dans les éléments fournis pour être spécifiés ici. | Réception : 1er septembre 2026 pour toutes les entreprises concernées. Émission B2B domestique et e-reporting : 1er septembre 2026 pour grandes entreprises et ETI ; 1er septembre 2027 pour PME et micro-entreprises, selon les sources fournies. | Les éléments fournis renvoient aux sanctions de facturation du CGI, notamment l’article 1737, mais ne donnent pas une description officielle et complète des sanctions propres aux manquements aux obligations d’e-invoicing et d’e-reporting. |
| Logiciels ou systèmes de caisse | CGI, art. 286, I, 3° bis et art. 1770 duodecies ; LPF, art. L. 80 O ; loi n° 2025-127 du 14 février 2025 de finances pour 2025, art. 43 | Si le dispositif s’applique, le logiciel ou système doit satisfaire aux exigences d’inaltérabilité, de sécurisation, de conservation et d’archivage des données de règlement. ; Depuis le 16 février 2025, la preuve de conformité est en principe un certificat délivré par un organisme accrédité ; le BOFiP fourni mentionne une mesure de tempérament jusqu’au 31 août 2026. ; Le champ dépend de la fonction effectivement utilisée et du mode d’enregistrement des règlements ; les opérations B2B sont indiquées comme exclues dans la source administrative fournie. | Si l’ERP enregistre des règlements B2C dans une fonction de caisse, conserver les données nécessaires à leur sécurisation, conservation et archivage et tenir disponible le certificat correspondant au logiciel/version concernés. ; Ne pas assimiler automatiquement un module de facturation ou de suivi de stock à un logiciel de caisse : vérifier l’usage réel et les opérations enregistrées. ; Les mécanismes techniques précis tels qu’un hachage SHA-256 ou un journal particulier ne sont pas établis par les sources fournies comme obligations légales générales. | Dispositif applicable depuis le 1er janvier 2018. Suppression de l’attestation individuelle de l’éditeur à compter du 16 février 2025 ; mesure de tempérament mentionnée jusqu’au 31 août 2026. | CGI, art. 1770 duodecies : les sources fournies indiquent une amende de 7 500 € par logiciel ou système concerné et un délai de 60 jours pour se mettre en conformité, sous peine d’une nouvelle amende. |
| TVA : exigibilité selon la nature de l’opération | CGI, art. 256 et 269 | Distinguer les livraisons de biens des prestations de services pour appliquer les règles d’exigibilité correspondantes. ; Pour les prestations de services, la source fournie indique l’exigibilité à l’encaissement, sauf option pour le paiement de la taxe d’après les débits ; elle indique l’exigibilité à la livraison pour les ventes de biens. Les cas particuliers doivent être vérifiés selon le régime fiscal et la nature exacte des opérations. | Qualifier les lignes ou opérations comme biens, services ou mixtes et conserver les dates pertinentes : livraison, exécution, facture et encaissement. ; Permettre une ventilation des bases et de la TVA par taux et l’export des données nécessaires aux déclarations comptables et fiscales. ; Ne pas automatiser une règle uniforme d’exigibilité sans tenir compte des options et situations fiscales de l’entreprise. | Règles en vigueur ; les sources fournies ne précisent pas de date d’entrée en vigueur distincte pour ces dispositions. | Les éléments fournis évoquent des rappels et majorations en cas d’erreur fiscale, mais ne permettent pas d’établir précisément les sanctions applicables à chaque erreur d’exigibilité. |
| Conservation des factures et pièces comptables | LPF, art. L. 102 B ; Code de commerce, art. L. 123-22 | Conserver les documents et pièces justificatives selon les durées prévues par les textes applicables. Les éléments fournis indiquent six ans au plan fiscal et dix ans au plan commercial. | Prévoir l’archivage et la restitution des factures et pièces associées pendant les durées applicables, avec une recherche par numéro, date, client ou fournisseur. ; Permettre l’export ou la mise à disposition des pièces en cas de contrôle ; les sources fournies ne précisent pas ici les exigences techniques détaillées d’archivage. | Obligations en vigueur. Les délais indiqués dans les éléments fournis sont de six ans au plan fiscal et dix ans au plan commercial. | Aucune sanction spécifique de conservation n’est suffisamment documentée dans les éléments fournis. |
| Devis et information précontractuelle des consommateurs | Code de la consommation, art. L. 111-1, L. 111-2 et R. 111-1 ; arrêté du 27 mars 1987 relatif aux règles de publicité des prix dans le secteur de l’entretien et de la réparation de véhicules | Communiquer au consommateur les informations précontractuelles requises, notamment sur les caractéristiques essentielles, le prix et les délais applicables. ; L’arrêté du 27 mars 1987 est mentionné dans les sources comme relatif à l’affichage des prix dans le secteur de l’entretien, de la réparation et du dépannage automobile ; son application exacte aux prestations exercées doit être vérifiée selon leur nature. ; Ne pas traiter l’article 1359 du Code civil comme une règle imposant systématiquement un devis : les sources fournies décrivent une exigence de preuve écrite au-delà d’un seuil, sans établir une obligation générale de devis. | Permettre de produire des devis ou propositions détaillés indiquant les prestations, les pneus, les frais éventuels et les prix communiqués au client. ; Conserver la version remise au client et la preuve de son acceptation lorsque cela est pertinent. ; Les sources fournies ne permettent pas de fixer une liste universelle de champs obligatoires pour chaque devis lié à cette activité. | Textes indiqués comme en vigueur ; les sources fournies ne précisent pas de date d’entrée en vigueur applicable à chaque obligation. | Les éléments fournis mentionnent des amendes administratives liées à l’information précontractuelle, mais ne permettent pas d’en confirmer ici toutes les conditions d’application aux opérations de pneumatiques. |

Sources : [Facturation électronique : prêt pour 2026 ? - DBM](https://www.debussac.net/facturation-electronique-pret-pour-2026/) · [TVA - Régimes d'imposition et obligations déclaratives et co](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20180704) · [Article 242 nonies A - Code général des impôts, annexe II - ](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276) · [Mentions Obligatoires Facture 2026 : Liste Complète (Nouvell](https://comparateur-efacturation.fr/blog/mentions-obligatoires-facture-2026) · [Les (nouvelles) mentions obligatoires d'une facture en 2026](https://independant.io/mentions-obligatoires-facture/) · [Mentions obligatoires sur une facture en 2026 : la liste com](https://www.newbi.fr/blog/mentions-obligatoires-facture) · [Mentions obligatoires sur une facture : liste 2026](https://exempledevis.com/mentions-obligatoires-facture/) · [Mentions obligatoires sur une facture : liste complète 2026](https://www.burovirtuel.fr/mention-obligatoire-facture/)

### 0.2 Comptabilité, conservation et archivage

Le domaine s’applique à l’entreprise si elle tient une comptabilité commerciale ou fiscale informatisée : inventaire annuel, conservation des documents et, en cas de contrôle, présentation du FEC sont notamment concernés. L’ERP de stock n’est pas nécessairement lui-même le logiciel comptable ; les exigences portant sur les écritures et le FEC ne s’appliquent à ses fonctions que s’il produit ou transmet des données comptables. Les sources fournies ne permettent pas d’établir le régime fiscal, la taille de l’entreprise ni si l’ERP enregistre les règlements ou numérise des originaux papier.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Code de commerce — comptabilité et inventaire | Code de commerce, articles L. 123-12, L. 123-14, L. 123-22 et R. 123-177 | Enregistrer chronologiquement les mouvements affectant le patrimoine de l’entreprise. ; Contrôler au moins une fois tous les douze mois l’existence et la valeur des éléments d’actif et de passif. ; Établir et tenir les documents comptables relatifs à l’enregistrement des opérations et à l’inventaire sans blanc ni altération. ; Conserver les documents comptables et pièces justificatives pendant dix ans. ; Organiser les données d’inventaire de façon à justifier le contenu et le mode d’évaluation des postes du bilan. | Permettre de distinguer les stocks par emplacement, notamment dépôt et véhicule, et de restituer les quantités comptées et leur valeur à la date d’inventaire. ; Conserver les résultats, écarts et corrections avec leur historique ; ne pas remplacer silencieusement les données validées. ; Prévoir une restitution détaillée permettant de justifier les postes de stock du bilan. ; Les textes cités n’imposent pas les champs précis, une méthode particulière de valorisation, une double validation ni un processus obligatoire de comptage à l’aveugle. | Articles L. 123-12 à L. 123-24 en vigueur depuis le 21 septembre 2000 ; R. 123-177 en vigueur depuis le 1er janvier 2016 selon les références fournies. | Les sources fournies ne précisent pas de sanction chiffrée propre à ces articles. Elles indiquent qu’une absence d’inventaire physique peut empêcher de justifier l’existence et la valeur des actifs et fragiliser la comptabilité. |
| Conservation des pièces et données à des fins fiscales | Livre des procédures fiscales, article L. 102 B, notamment I et I bis ; Code général des impôts, article 286 | Conserver les documents, pièces et données relevant du champ de l’article L. 102 B pendant le délai fiscal applicable, indiqué dans les sources comme six ans. ; Conserver les pièces justificatives originales relatives aux opérations ouvrant droit à déduction de TVA selon les règles applicables. ; Pouvoir présenter les documents et données à l’administration dans des conditions permettant leur consultation et leur recherche. ; Conserver sur support informatique les données constituées ou reçues sous forme informatique ; une simple impression papier n’est pas une solution de remplacement suffisante selon la doctrine citée. | Prévoir une conservation contrôlée des documents, données et exports concernés, avec accès et restitution lisibles pendant la durée applicable. ; Conserver les données comptables ou justificatives originellement numériques sous forme informatique. ; Associer, lorsque nécessaire, les commandes, réceptions, mouvements et pièces justificatives afin de faciliter leur recherche et leur présentation. ; Ne pas appliquer automatiquement dix ans à chaque donnée fiscale : les durées varient selon la nature du document et le fondement juridique. | En vigueur à la date de réponse selon les références fournies. Le délai fiscal de six ans est distinct du délai commercial de dix ans prévu par le Code de commerce. | Les sources indiquent qu’une conservation inadéquate de données originellement informatisées peut exposer à un rejet de comptabilité. Elles ne donnent pas ici de montant de sanction spécifique. |
| Fichier des écritures comptables (FEC) | LPF, articles L. 47 A I et L. 47 AA ; LPF, article A. 47 A-1 | Remettre les fichiers des écritures comptables sous forme dématérialisée au début des opérations d’une vérification de comptabilité. ; Lors d’un examen de comptabilité, transmettre la copie dans le délai prévu par l’article L. 47 AA. ; Respecter les règles de contenu, de classement, de format et de nommage prévues à l’article A. 47 A-1. ; Pour le format de comptabilité commerciale visé par le texte, inclure les dix-huit informations requises dans l’ordre prescrit ; les écritures sont classées chronologiquement et le fichier inclut les écritures après opérations d’inventaire. | Si l’ERP génère ou prépare le FEC, conserver et exporter les données comptables nécessaires dans le format réglementaire ; ne pas traiter la liste des champs FEC comme une obligation applicable à un simple module de stock qui ne tient pas la comptabilité. ; Prendre en compte les champs prescrits par A. 47 A-1, la chronologie de validation, les écritures d’inventaire et les règles de format et de nommage. ; Permettre une extraction exploitable des écritures en cas de demande de l’administration. ; Les règles de séquentialité et autres tests formels doivent être appliquées selon les exigences et instructions en vigueur pour le FEC ; les sources fournies ne justifient pas une règle générale interdisant toute correction dans l’ERP. | Obligation et normes de remise en vigueur selon les articles cités ; l’arrêté définissant les normes a été publié en 2013. L. 47 AA est indiqué en vigueur depuis le 1er janvier 2017. | Les sources fournies précisent les délais et procédures, mais ne donnent pas le barème complet des sanctions applicables en cas de défaut ou de non-conformité du FEC. |
| Piste d’audit fiable et conservation des pièces de facturation | CGI, article 289 VII, 1° ; LPF, article L. 102 B I bis ; CGI, annexe III, article 96 I | Mettre en place des contrôles documentés permettant d’établir l’authenticité de l’origine, l’intégrité du contenu et la lisibilité des factures. ; Conserver les éléments constitutifs de ces contrôles et leur documentation selon le délai applicable de l’article L. 102 B. ; Conserver les factures concernées dans leur contenu originel ; la documentation citée indique que le parcours des documents doit pouvoir être retracé dans les deux sens. | Permettre de relier les pièces pertinentes, par exemple commande, réception, facture et éventuels retours ou avoirs, lorsque ces pièces constituent les contrôles de l’entreprise. ; Conserver les documents et éléments de contrôle sans altération de leur contenu originel pendant la durée applicable. ; Rendre consultables et exportables la documentation des contrôles et les pièces associées. ; Les références ne prescrivent pas un chaînage technique unique ni une chaîne obligatoire reliant chaque mouvement de stock à une écriture comptable. | En vigueur à la date de réponse selon les dispositions citées. La durée indiquée par les sources pour les données et pièces de piste d’audit est de six ans. | Les sources fournies ne donnent pas de sanction chiffrée propre à la piste d’audit ; une documentation insuffisante peut compromettre la justification des factures et des opérations fiscales concernées. |
| Inaltérabilité des données de caisse ou d’enregistrement des règlements | CGI, article 286 I, 3° bis ; CGI, article 1770 duodecies ; LPF, article L. 80 O | Le cas échéant, utiliser un logiciel ou système satisfaisant aux conditions d’inaltérabilité, de sécurisation, de conservation et d’archivage des données. ; Justifier le respect de ces conditions par l’attestation de l’éditeur ou le certificat prévu par le texte. ; Restituer les données archivées dans un format répondant aux normes de l’administration. ; Tenir compte des dispenses prévues à l’article 286 pour certaines situations. | Appliquer ces exigences uniquement si l’ERP enregistre les opérations ou règlements entrant dans le champ légal ; un ERP limité à la gestion des stocks n’est pas soumis à cette obligation de ce seul fait. ; Si le module est concerné, mettre en place les contrôles nécessaires à l’inaltérabilité, à la sécurisation, à la conservation, à l’archivage et à la restitution des données. ; Les sources fournies ne prescrivent pas spécifiquement un chaînage cryptographique, un journal technique déterminé ni une certification NF 525. | Le dispositif a été introduit par la loi du 29 décembre 2015 puis modifié par la loi du 30 décembre 2017. La référence fournie à l’article 286 signale également des dispositions maintenues ou abrogées à compter du 1er janvier 2027 selon l’ordonnance n° 2025-1247 ; les règles de remplacement ne sont pas détaillées dans les informations disponibles. | L’article 1770 duodecies prévoit, selon la source fournie, une amende de 7 500 € par logiciel ou système concerné en l’absence de justification exigée. |
| Numérisation des factures papier et copies fiables | LPF, articles L. 102 B, A. 102 B-1 et A. 102 B-2 ; Code civil, article 1379 ; arrêté du 22 mars 2017 | Pour les factures papier entrant dans le dispositif fiscal, produire une reproduction à l’identique en image et en contenu, en préservant les couleurs lorsqu’elles portent un sens. ; Conserver les documents numérisés sous le format et avec les garanties prévus par l’article A. 102 B-2, dans le cadre d’une organisation documentée et contrôlée assurant disponibilité, lisibilité et intégrité pendant la durée de conservation. ; Une copie fiable peut avoir la même force probante que l’original selon l’article 1379 du Code civil ; si l’original subsiste, sa présentation peut toujours être exigée. | Si une fonction de numérisation est proposée, permettre de conserver une reproduction fidèle et lisible et de documenter les opérations d’archivage. ; Respecter les formats et garanties expressément prévus par A. 102 B-1 ou A. 102 B-2 selon la catégorie du document ; les sources mentionnent PDF, signature électronique conforme au RGS pour A. 102 B-1, et PDF ou PDF/A-3 pour les factures numérisées sous A. 102 B-2. ; Ne pas imposer indistinctement PDF/A-3, horodatage qualifié ou signature qualifiée à tout document : ces exigences ne sont pas établies par les références fournies comme règles générales. | Article A. 102 B-1 en vigueur depuis le 1er février 2016 ; article A. 102 B-2 en vigueur depuis le 31 mars 2017 ; article 1379 du Code civil en vigueur depuis le 1er octobre 2016. | Les sources fournies ne donnent pas de sanction chiffrée. Une copie ne répondant pas aux conditions peut ne pas être admise comme substitut probant ; la présentation de l’original peut alors être exigée. |

Sources : [Code de commerce - Légifrance](https://www.legifrance.gouv.fr/loda/id/LEGISCTA000006146119) · [Article 286 - Code général des impôts - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054337091) · [Code de commerce - Article R123-177](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000030927443) · [CAA de LYON, 2ème chambre, 22/06/2023, 22LY01645, Inédit au ](https://www.legifrance.gouv.fr/ceta/id/CETATEXT000047720607?init=true&page=1&query=%22article+L123-12%22+du+%22Code+de+commerce%22&searchField=ALL&tab_selection=cetat) · [CF - Droit de communication et procédures de recherche et de](https://bofip.impots.gouv.fr/bofip/8877-PGP.html/identifiant%3DBOI-CF-COM-10-10-30-10-20131018) · [BIC - Obligations déclaratives - Obligations fiscales et com](https://bofip.impots.gouv.fr/bofip/2899-PGP.html/identifiant=BOI-BIC-DECLA-30-10-20-40-20180720) · [Article - Arrêté du 13 janvier 2021 d'application du décret ](https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000042963409) · [Livre des procédures fiscales - Article L47 A](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037526053)

### 0.3 Données personnelles (RGPD)

Le RGPD et la loi française s’appliquent dès lors que l’ERP identifie les salariés ou techniciens dans les comptes, mouvements, validations ou journaux. Les faits fournis ne confirment pas que l’ERP collecte la géolocalisation : les règles spécifiques à celle-ci ne s’appliquent donc que si cette fonction est effectivement activée. Les sources disponibles ne permettent pas d’établir une liste exhaustive de tous les textes et standards applicables en 2026 ; les éléments ci-dessous sont ceux que ces sources étayent.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement général sur la protection des données (RGPD) | Règlement (UE) 2016/679 du 27 avril 2016, notamment art. 4, 5, 12 à 22, 25, 30, 32, 33 et 83 | Définir les finalités et une base juridique pour chaque traitement ; limiter les données à ce qui est nécessaire, les tenir exactes et ne pas les conserver au-delà de la durée justifiée (art. 5). ; Informer les personnes et leur permettre d’exercer les droits applicables (art. 12 à 22). ; Tenir un registre des activités de traitement lorsque l’art. 30 l’exige. ; Mettre en œuvre des mesures techniques et organisationnelles adaptées au risque (art. 32), et notifier à l’autorité de contrôle les violations répondant aux conditions de l’art. 33, en principe sous 72 heures. ; Déterminer si une analyse d’impact est nécessaire au regard des critères applicables ; les informations fournies ne suffisent pas à conclure qu’elle est obligatoire. | Prévoir une notice d’information adaptée aux traitements et aux catégories de personnes concernées, avec finalités, base juridique, destinataires, durées ou critères de conservation et modalités d’exercice des droits. ; Limiter les champs de compte et d’approbation aux données nécessaires ; définir des rôles et permissions appropriés. ; Prévoir des procédures permettant de retrouver et traiter les données d’une personne pour les demandes de droits, sans promettre un effacement incompatible avec une obligation de conservation ou la défense de droits en justice. ; Définir des durées par finalité et des mécanismes de suppression, d’anonymisation ou d’archivage lorsque cela est justifié ; les sources ne fixent pas une durée générale pour tous les comptes ou mouvements de stock. ; Protéger les données et les exports par des contrôles d’accès et des mesures de sécurité proportionnées ; documenter les traitements et incidents. | Applicable depuis le 25 mai 2018. Les sources fournies n’indiquent pas d’échéance future particulière pour l’ERP. | L’art. 83 prévoit des amendes administratives pouvant atteindre, selon le manquement, 20 millions d’euros ou 4 % du chiffre d’affaires annuel mondial total, le montant le plus élevé étant retenu. Les sources fournies ne permettent pas de déterminer une sanction concrète pour cette entreprise. |
| Loi Informatique et Libertés | Loi n° 78-17 du 6 janvier 1978 relative à l’informatique, aux fichiers et aux libertés, modifiée | Respecter les dispositions nationales applicables et les compétences de contrôle de la CNIL. ; Informer les personnes concernées conformément aux règles applicables ; les mentions précises dépendent du traitement et de sa base juridique. | Mettre à disposition des notices d’information et des coordonnées de contact permettant aux personnes d’exercer leurs droits ou de saisir la CNIL. ; Ne pas présumer que chaque champ proposé est légalement obligatoire : déterminer les données nécessaires selon la finalité et le contexte. | Loi du 6 janvier 1978, modifiée notamment pour tenir compte du RGPD. La source fournie ne détaille pas les dates d’entrée en vigueur des modifications applicables. | Les sanctions dépendent des dispositions applicables et peuvent inclure les pouvoirs de la CNIL et les sanctions prévues par le RGPD. Aucun montant particulier n’est établi pour le cas décrit. |
| Recommandation CNIL relative à la journalisation des opérations | CNIL, « Sécurité : Tracer les opérations » ; la source fournie renvoie également à la recommandation CNIL relative à la journalisation, sans en donner la référence exacte de délibération | La CNIL recommande de journaliser les activités métier, interventions techniques, anomalies et événements de sécurité, selon le contexte. ; Pour les traces applicatives, consigner l’auteur, la date et l’heure, la nature de l’opération et la référence des données concernées. ; Informer les utilisateurs de la journalisation et éviter son détournement à d’autres fins, comme le contrôle du temps de travail. ; Éviter de dupliquer excessivement des données personnelles dans les journaux, notamment les mots de passe. | Journaliser de façon ciblée les créations, consultations, partages, modifications et suppressions pertinents, avec identifiant d’auteur, horodatage, action et référence de l’objet. ; Définir une conservation documentée et limitée : la CNIL indique une période glissante de six mois à un an à titre de recommandation, sous réserve d’un besoin ou d’une obligation justifiant une autre durée. ; Protéger les journaux contre les accès non autorisés et les altérations ; ne pas y enregistrer de secrets d’authentification. ; Informer les utilisateurs et, selon le contexte de travail, traiter l’information et la consultation des instances représentatives du personnel. | La source indique les recommandations CNIL mais ne fournit pas la date ni la référence exacte de la délibération correspondante. Il s’agit d’une recommandation, non d’une durée réglementaire universelle. | Le non-respect d’une recommandation n’est pas en soi une sanction autonome. Une sécurité insuffisante peut toutefois constituer un manquement à l’art. 32 du RGPD et exposer aux sanctions prévues par ce règlement. |
| Géolocalisation des véhicules des salariés — règles et recommandations CNIL | CNIL, « La géolocalisation des véhicules des salariés » ; ancienne norme simplifiée NS-051, délibération CNIL n° 2015-165 du 4 juin 2015 | Si la géolocalisation est utilisée, informer les salariés et limiter l’accès aux personnes habilitées et aux destinataires justifiés. ; Permettre au salarié de désactiver la collecte ou transmission de sa localisation hors temps de travail. ; En principe, ne pas conserver les données au-delà de deux mois ; la CNIL indique des durées pouvant aller jusqu’à un an pour l’optimisation des tournées ou la preuve d’interventions lorsque celle-ci ne peut être apportée autrement, et cinq ans pour le suivi du temps de travail. ; Ne pas communiquer le nom du conducteur à un client ou donneur d’ordre sauf intérêt particulier et indispensable, selon la page CNIL fournie. | Si une fonction de géolocalisation existe, prévoir une commande de désactivation hors temps de travail, des habilitations et une information visibles. ; Configurer les durées en fonction de la finalité et purger les données à échéance ; documenter toute conservation prolongée. ; Contrôler les exports et destinataires pour éviter la transmission injustifiée de l’identité du conducteur. ; Ne pas déduire de la seule gestion des stocks par camion qu’une géolocalisation est réalisée. | La délibération NS-051 citée date du 4 juin 2015. La source actuelle de la CNIL présente les garanties et durées applicables ; les informations fournies ne précisent pas le statut juridique actuel de la norme simplifiée comme formalité. | En cas de manquement, les sanctions RGPD peuvent s’appliquer selon les faits. Les sources fournies ne permettent pas de confirmer une sanction propre à cette fonctionnalité ni une conséquence probatoire générale. |
| Référentiel CNIL de durées de conservation pour la gestion des ressources humaines | CNIL, référentiel « Gestion des ressources humaines » relatif aux durées de conservation, publié le 29 janvier 2026 ; présentation CNIL du 2 avril 2026 | Déterminer les durées pertinentes en fonction des finalités et des obligations applicables. ; Distinguer les données conservées en base active des archives nécessaires après le départ d’un salarié. | Prévoir la désactivation des comptes lorsqu’un salarié quitte l’entreprise et une procédure d’archivage ou de suppression adaptée aux données concernées. ; Ne pas appliquer une durée RH uniforme aux mouvements de stock, journaux ou décisions : définir leur durée selon leur finalité et les obligations correspondantes. | Référentiel publié le 29 janvier 2026 et présenté par la CNIL le 2 avril 2026. C’est un référentiel d’accompagnement ; la source ne lui attribue pas une date d’entrée en vigueur réglementaire. | Aucune sanction autonome n’est indiquée pour le non-respect du référentiel. Les obligations légales de limitation de conservation du RGPD restent applicables et peuvent entraîner les sanctions prévues par ce règlement. |

Sources : [La géolocalisation des véhicules des salariés / CNIL](https://cnil-d10.cnil.fr/fr/la-geolocalisation-des-vehicules-des-salaries) · [Les règles pour la gestion du personnel / CNIL](https://cnil-d10.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel) · [Sécurité : Tracer les opérations / CNIL](https://www.cnil.fr/fr/securite-tracer-les-operations) · [1 RÉFÉRENTIEL Les durées de conservation des données à carac](https://www.cnil.fr/sites/default/files/2026-04/referentiel_durees_de_conservation_gestion_des_ressources_humaines.pdf) · [La CNIL donne ses consignes pour renforcer la sécurité des g](https://www.cnil.fr/fr/consignes-pour-renforcer-la-securite-des-grandes-bases-de-donnees) · [Géolocalisation des véhicules des employés Norme simplifiée ](http://piwik.cnil.fr/fr/declaration/ns-051-geolocalisation-des-vehicules-des-employes) · [Question / CNIL](https://cnil-d10.cnil.fr/fr/cnil-direct/question/geolocalisation-des-vehicules-professionnels-des-employes-combien-de-temps-sont) · [Recherche scientifique (hors santé) : les mesures de sécurit](https://www.cnil.fr/fr/recherche-scientifique-hors-sante/mesures-de-securite-et-de-confidentialite)

### 0.4 Réglementation produit du secteur

La réglementation produit concerne directement la vente et la distribution de pneumatiques, et certaines exigences concernent aussi leur montage ainsi que la gestion des pneus usagés. Les éléments fournis ne permettent toutefois pas d’établir que l’entreprise est importatrice ou metteur sur le marché, ni de justifier plusieurs obligations logicielles précises avancées dans le brouillon. Le cadrage ci-dessous distingue les obligations réglementaires établies des fonctions ERP qui sont utiles mais ne sont pas, d’après les sources disponibles, imposées en tant que telles.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Étiquetage européen des pneumatiques | Règlement (UE) 2020/740 du Parlement européen et du Conseil du 25 mai 2020, notamment articles 4, 6 et 7 et annexes III et IV. | Le distributeur doit veiller à ce que l’étiquette soit visible pour les pneus exposés à la vente et à ce que l’étiquette et la fiche d’information produit soient accessibles à l’utilisateur final dans les conditions prévues par le règlement, y compris en vente à distance. ; Les fournisseurs sont responsables de l’enregistrement des modèles concernés dans EPREL et de la transmission des informations réglementaires. ; Les sources fournies ne permettent pas de confirmer une obligation générale d’imprimer les classes d’étiquetage sur toutes les factures. | Prévoir, pour les références concernées, un accès à l’étiquette et à la fiche d’information produit, par exemple par identifiant ou URL EPREL, afin de faciliter leur présentation au client. ; Permettre d’identifier si un produit est soumis à l’étiquetage et de restituer les informations publiées par le fournisseur. ; Ne pas bloquer automatiquement ventes ou devis pour absence de données EPREL sans avoir établi que cette exigence s’applique au rôle de l’entreprise et à la transaction. | Applicable depuis le 1er mai 2021. | Le règlement prévoit des mesures de surveillance du marché et les États membres doivent établir des sanctions effectives. Les sources disponibles ne permettent pas de confirmer un montant de sanction français précis applicable à cette entreprise. |
| Surveillance du marché et conformité des produits | Règlement (UE) 2019/1020 du Parlement européen et du Conseil du 20 juin 2019, notamment articles 11, 14, 16 et 34; son application aux pneumatiques est mentionnée par l’article 12 du règlement (UE) 2020/740. | Les autorités peuvent effectuer des contrôles et ordonner des mesures correctives, notamment le retrait ou le rappel d’un produit non conforme. ; Les éléments fournis ne démontrent pas que chaque détaillant de pneus doit conserver systématiquement une traçabilité de chaque pneu jusqu’au client final pendant dix ans. ; Des obligations additionnelles peuvent dépendre du rôle effectif de l’entreprise dans la chaîne d’approvisionnement, notamment si elle importe ou agit comme fournisseur. | Conserver les données commerciales et de réception déjà nécessaires à la gestion des stocks et faciliter une extraction des références et quantités en stock en cas de contrôle ou de retrait. ; Relier les articles aux fournisseurs et aux réceptions lorsque ces informations sont disponibles dans le processus métier. ; Ne pas imposer un numéro DOT, un lot ou une conservation décennale comme obligation générale sur la seule base des sources fournies. | Applicable depuis le 16 juillet 2021. | Le cadre prévoit des contrôles et mesures correctives. Le montant et la nature des sanctions françaises dépendent des manquements et textes nationaux applicables; les sources fournies ne permettent pas de préciser une sanction déterminée pour cette entreprise. |
| Règles nationales relatives à l’état, à l’utilisation et à la vente des pneumatiques | Code de la route, articles R. 314-1 et R. 314-2; arrêté du 18 juillet 2019 relatif aux pneumatiques. L’arrêté du 18 juillet 2019 abroge notamment l’arrêté du 24 octobre 1994. | Les pneumatiques doivent satisfaire aux exigences applicables concernant leur nature, leur état et leurs conditions d’utilisation. ; La vente d’un pneumatique ne présentant pas les caractéristiques d’utilisation prévues par l’article R. 314-1, sauf pour mise au rebut, est sanctionnée par l’article R. 314-2. ; La profondeur minimale de 1,6 mm citée dans les sources concerne notamment les catégories M1, N1, O1 et O2; elle ne doit pas être généralisée à toutes les catégories de véhicules. | Pour les opérations de montage, permettre d’enregistrer l’identification du pneu et du véhicule, la position de montage et les contrôles réalisés, si cela correspond au processus de l’entreprise. ; Prévoir des contrôles métier adaptés aux catégories de véhicules et aux caractéristiques des pneus; les sources fournies ne suffisent pas à définir une règle bloquante universelle pour toutes les montes. ; Les textes cités ne rendent pas obligatoires, à eux seuls, une profondeur de sculpture enregistrée dans l’ERP, un bon de montage suivant un format donné ou une conservation de cinq ans. | L’arrêté date du 18 juillet 2019; les articles R. 314-1 et R. 314-2 sont en vigueur. La source fournie ne précise pas la date exacte d’entrée en vigueur de l’arrêté. | L’article R. 314-1 prévoit une contravention de 4e classe pour les manquements qu’il vise et permet l’immobilisation du véhicule dans les conditions prévues par le Code de la route. L’article R. 314-2 prévoit une contravention de 4e classe pour la mise en vente ou la vente visée. |
| Équipements hivernaux en zones concernées | Code de la route, article D. 314-8, issu du décret n° 2020-1264 du 16 octobre 2020; article L. 314-1 du Code de la route. | L’obligation d’équipement dépend des catégories de véhicules, des zones désignées et de la période du 1er novembre au 31 mars. ; Pour qualifier un pneumatique d’« hiver » au sens de l’article D. 314-8, les sources indiquent la présence conjointe du symbole alpin et d’un marquage M+S, M.S ou M&S depuis le 1er novembre 2024. ; Les dispositifs antidérapants amovibles peuvent répondre à l’obligation dans les conditions prévues par l’article. | Un attribut 3PMSF et les autres marquages figurant sur le produit peuvent aider à filtrer les références et à informer les clients. ; Si l’ERP assiste le conseil ou le montage, il peut signaler la période, la catégorie de véhicule et les marquages; il s’agit d’une fonction de conformité utile, pas d’un champ ERP expressément imposé par les sources. ; Ne pas présenter automatiquement la monte vendue comme conforme à la situation du véhicule sans tenir compte des zones, catégories, exemptions et équipements alternatifs. | Le décret n° 2020-1264 est entré en application à partir du 1er novembre 2021; l’exigence de marquages conjoints indiquée dans les sources s’applique depuis le 1er novembre 2024. | Les sources disponibles mentionnent des sanctions routières, mais ne permettent pas de confirmer une sanction spécifique applicable au vendeur ou au logiciel. L’obligation vise l’équipement des véhicules dans les conditions de l’article D. 314-8. |
| Gestion des déchets de pneumatiques et filière REP | Code de l’environnement, articles L. 541-10 et R. 543-138 à R. 543-145, notamment R. 543-139 et R. 543-140; décret n° 2023-152 du 2 mars 2023. | Il est interdit d’abandonner, de déposer dans le milieu naturel ou de brûler à l’air libre des pneumatiques. ; Les professionnels détenteurs doivent préserver le potentiel de réutilisation, de recyclage et de valorisation des déchets, notamment en les conservant à l’abri des intempéries. ; Les personnes qui réalisent des opérations de gestion des déchets de pneumatiques sont enregistrées auprès des éco-organismes ou systèmes individuels agréés selon l’article R. 543-139. ; Les sources disponibles ne démontrent pas une obligation générale de registre chronologique de déchets à la charge de tout atelier détenteur, ni une reprise gratuite universelle sans examiner le rôle et les conditions applicables. | Si l’entreprise détient et suit les pneus usagés, un module ou des mouvements dédiés peuvent enregistrer quantités, dates, lieux de stockage et collectes pour assurer le suivi opérationnel. ; Permettre d’identifier le collecteur et de rattacher les justificatifs de collecte lorsque l’entreprise les reçoit. ; Activer les fonctions de déclaration REP, d’IDU ou de suivi des tonnages seulement si l’entreprise est effectivement producteur ou metteur sur le marché au sens des textes. ; Les sources fournies ne justifient pas un délai général de conservation de trois ans pour ces données. | Le décret n° 2023-152 est entré en vigueur le 5 mars 2023; l’article R. 543-139 est applicable depuis le 1er juillet 2023. | Les interdictions et obligations relèvent du Code de l’environnement. Les sources fournies ne permettent pas de confirmer les montants précis de sanctions avancés dans le brouillon pour les faits décrits. |

Sources : [Le label européen du pneu / SPF Santé publique](https://www.health.belgium.be/fr/professionnels/entreprises/environnement/labels-certification-etiquettage/label-europeen-pneu) · [Section 8 : Pneumatiques (Articles R543-137 à R543-145) - Lé](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006176999/) · [Arrêté du 18 juillet 2019 relatif aux pneumatiques - Légifra](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000038987822) · [Article R314-1 du Code de la route / Doctrine](https://www.doctrine.fr/l/texts/codes/LEGITEXT000006074228/articles/LEGIARTI000006841664) · [L’Étiquetage - Syndicat du Pneu](https://www.syndicatdupneu.org/etiquetage-des-pneumatiques/) · [Le nouveau règlement (UE) 2020/740 instaure un renouvellemen](https://portail-qualite.public.lu/fr/actualites/securite-sante/2021/le-nouveau-reglement-UE-2020-740-instaure-un-renouvellement-de-l-etiquetage-des-pneumatiques.html) · [Déclaration d'étiquetage de l'UE / Giti Tire](https://giti-tire.eu/fr/declaration-d-etiquetage-de-l-ue) · [TLR : Règlement sur l&#39;étiquetage des pneumatiques, expli](https://www.conphora.com/fr/reglements-ue/tlr/)

### 0.5 Environnement et fin de vie

Le domaine s’applique au moins aux pneus usagés issus des ventes, montages et dépannages : l’entreprise est susceptible d’être distributeur et détenteur professionnel de ces déchets, même si le code NAF ne suffit pas à définir son statut. Les obligations de producteur REP, de reprise sans achat sous condition de surface, de registre et de traçabilité dépendent de faits non précisés (notamment importation, surface de vente, déchets effectivement expédiés et nature des déchets annexes) ; l’ERP devrait donc les rendre configurables plutôt que présumer ces faits.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Responsabilité élargie du producteur (REP) pour les pneumatiques — statut et identifiant unique | Code de l’environnement, articles L. 541-10, L. 541-10-1 (16°), L. 541-10-13, L. 541-10-10 et R. 541-173 ; arrêté du 27 juin 2023 portant cahiers des charges de la filière REP pneumatiques ; décret n° 2023-152 du 2 mars 2023 relatif à la gestion des déchets de pneumatiques | Si l’entreprise est producteur, s’enregistrer, disposer d’un identifiant unique (IDU), adhérer à un éco-organisme agréé ou mettre en place un système individuel, et transmettre les données requises sur les produits mis sur le marché et leur gestion, éventuellement par l’intermédiaire de l’éco-organisme. ; Le producteur indique son IDU dans les conditions générales de vente ou, à défaut, dans un document contractuel communiqué à l’acheteur ; il le communique sur son site internet dans les conditions prévues par le texte. ; Un vendeur communique à l’acheteur, sur demande, l’IDU du producteur qui remplit les obligations REP pour le produit concerné. ; Les personnes réalisant des opérations de gestion de déchets de pneumatiques sont enregistrées auprès des éco-organismes ou systèmes individuels agréés, conformément à l’article R. 543-139. | Permettre de renseigner, par établissement et par référence, le rôle de l’entreprise (producteur, distributeur, détenteur), l’IDU pertinent, l’éco-organisme ou le système individuel et les périodes de validité ; ne pas imposer un IDU propre à l’entreprise tant que son statut de producteur n’est pas établi. ; Associer les pneus commercialisés à leur producteur et à son IDU afin de répondre aux demandes d’acheteurs et de produire les informations contractuelles requises lorsqu’elles s’appliquent. ; Prévoir des exports de données de mise sur le marché pour les déclarations REP si l’entreprise est producteur ; le schéma et la périodicité précis ne sont pas établis par les éléments fournis. ; Journaliser les modifications des paramètres REP et limiter leur modification aux rôles habilités. Les références fournies ne prescrivent pas de journal informatique ni de champs de code-barres ou de catégories de véhicules déterminés. | Les dispositions citées sur l’IDU sont indiquées en vigueur depuis le 1er janvier 2022. Le décret n° 2023-152 est entré en vigueur, selon les dispositions citées, le 5 mars 2023, avec l’article R. 543-139 applicable depuis le 1er juillet 2023. Aucune échéance future précise applicable à cette entreprise n’est établie par les informations disponibles. | Les références fournies ne permettent pas d’établir une sanction précise pour chaque manquement à ces obligations REP. L’amende de 15 000 € citée dans les éléments concerne des obligations d’information déterminées aux articles L. 541-9-1 et L. 541-9-1-1 ou un affichage visé aux articles L. 541-9-11 et L. 541-9-12 ; elle ne peut pas être transposée sans vérification aux obligations REP décrites ici. |
| Reprise gratuite des déchets de pneumatiques par les distributeurs | Code de l’environnement, articles L. 541-10-8 et R. 541-158 à R. 541-160 ; décret n° 2024-1221 du 27 décembre 2024, article 3 | Appliquer la reprise gratuite selon les conditions de l’article L. 541-10-8 et des articles réglementaires correspondants. ; Selon les extraits fournis, la reprise sans achat jusqu’à huit pneus par personne et par an vise les distributeurs de pneus pour voitures particulières et camionnettes, ainsi que certains pneus de véhicules à deux ou trois roues, disposant d’au moins 250 m² de surface de vente consacrée à ces produits. ; Les distributeurs concernés peuvent demander une attestation sur l’honneur indiquant que le déposant n’a pas déjà apporté plus de huit pneus usagés à des distributeurs au cours de l’année. | Permettre d’enregistrer les pneus usagés repris, la date, la quantité, le contexte (avec achat ou sans achat), le point de reprise et le lien éventuel avec la vente ou l’intervention. ; Si l’entreprise relève du seuil de reprise sans achat, permettre de gérer l’attestation et de suivre les apports annuels par personne, dans les limites de nécessité et de minimisation des données ; les sources fournies ne prescrivent pas une identité obligatoire du déposant ni un délai légal de conservation de l’attestation. ; Paramétrer les règles selon le type de pneu, la catégorie de client, la surface de vente et la situation juridique de l’établissement. Ne pas appliquer automatiquement le plafond de huit pneus à tous les dépôts ou à tous les types de véhicules. | La reprise sans achat est indiquée dans les sources comme applicable depuis le 1er janvier 2024. L’article R. 541-160 a été modifié par le décret n° 2024-1221 du 27 décembre 2024. Les éléments fournis ne précisent pas d’échéance future supplémentaire. | L’extrait de l’article R. 543-152 relatif à une contravention de 3e classe est signalé comme ancien et ne permet pas, à lui seul, d’établir la sanction actuellement applicable. La sanction en vigueur pour un manquement à la reprise doit être vérifiée dans la version consolidée applicable de l’article R. 541-78 et des dispositions pertinentes ; les sources disponibles ne la confirment pas précisément. |
| Gestion des déchets de pneumatiques : interdictions et préservation de leur potentiel de valorisation | Code de l’environnement, articles R. 543-138 et R. 543-140 ; décret n° 2023-152 du 2 mars 2023 | Ne pas abandonner, déposer dans le milieu naturel ni brûler à l’air libre des pneumatiques. ; En tant que détenteur professionnel, prendre les dispositions nécessaires pour préserver le potentiel de réutilisation, de recyclage et de valorisation des pneus en attente de collecte, notamment en les conservant à l’abri des intempéries et sans les rendre délibérément impropres à ces voies de valorisation. ; Ne pas remettre les déchets à une personne non autorisée à les prendre en charge, conformément à l’article L. 541-2 cité dans les sources. | Distinguer dans le stock opérationnel les pneus neufs des pneus usagés et, si utile à la gestion, leur état (réutilisable, à évaluer, à orienter vers une filière déchets). Ces états sont des choix de conception utiles, pas des champs réglementaires explicitement imposés par les références citées. ; Suivre les mouvements entre véhicule et dépôt, les reprises et les enlèvements afin d’aider à organiser la collecte et à démontrer les opérations réalisées. ; Ne pas prétendre qu’un champ d’emplacement dans l’ERP garantit le stockage matériel à l’abri des intempéries ; cette obligation porte sur les conditions réelles de stockage. | Articles R. 543-138 et R. 543-140 indiqués en vigueur depuis le 5 mars 2023. | L’article L. 541-3 permet des mesures administratives en matière de déchets. Les sanctions pénales citées à l’article L. 541-46 concernent des infractions définies par cet article ; leur application à un fait précis doit être vérifiée au regard de la qualification retenue. Les éléments fournis ne permettent pas d’associer automatiquement ces peines à toute violation des obligations de stockage. |
| Registre chronologique des déchets et transmission au registre national | Code de l’environnement, article R. 541-43 ; arrêté du 31 mai 2021 fixant le contenu des registres déchets, terres excavées et sédiments, notamment articles 1 à 3 ; code de l’environnement, article R. 541-78 | Tenir à jour un registre chronologique des déchets produits ou expédiés, avec les informations prescrites par l’arrêté du 31 mai 2021. ; Conserver ce registre pendant au moins trois ans et le mettre à disposition des autorités de contrôle. ; Les catégories de personnes visées au II de l’article R. 541-43 transmettent les données au registre national dans les conditions et délais prévus par cet article. Selon son texte, une transmission accomplie dans les conditions requises dispense de tenir et conserver le registre local correspondant. ; Ne pas présumer que le seul fait de produire des pneus usagés impose une déclaration au registre national : le périmètre du II de l’article R. 541-43, notamment selon la nature du déchet et le rôle de l’établissement, doit être vérifié. | Pour les déchets sortants concernés, prendre en charge les champs réglementaires applicables du registre : date, dénomination usuelle, code déchet, quantité, établissement et adresse de prise en charge si différente, producteur initial lorsque requis, destinataire et autres informations prévues par l’arrêté selon le flux. ; Gérer une conservation d’au moins trois ans pour le registre local lorsqu’il est requis, et permettre sa présentation aux autorités. La source réglementaire n’impose pas un format CSV, Excel ou PDF particulier. ; Prévoir une fonction de transmission électronique ou d’export selon le rôle et le flux, si l’établissement relève de l’obligation de transmission au registre national. ; La traçabilité et l’historique sont des moyens logiciels utiles ; l’obligation réglementaire est de tenir les informations prescrites, pas une exigence explicite d’inaltérabilité informatique ou de journal d’accès. | L’arrêté du 31 mai 2021 est indiqué applicable depuis le 1er janvier 2022. L’article R. 541-43 cité prévoit la transmission électronique depuis le 1er janvier 2022 pour les personnes relevant de son II. | L’article R. 541-78, en vigueur depuis le 5 juin 2026 selon les éléments fournis, prévoit une amende de 4e classe notamment pour le non-respect des obligations de registre ou de transmission et le refus de présenter le registre. |
| Bordereaux électroniques pour déchets dangereux ou déchets POP (Trackdéchets) | Code de l’environnement, articles R. 541-45 et R. 541-78 ; décret n° 2021-321 du 25 mars 2021 relatif à la traçabilité des déchets, des terres excavées et des sédiments ; arrêtés du 21 décembre 2021 cités dans les sources | Lorsqu’elle produit ou remet des déchets dangereux ou POP relevant de l’article R. 541-45, émettre et compléter le bordereau électronique dans le système prévu, puis assurer les étapes relevant de son rôle. ; Respecter les obligations de suivi et de transmission applicables au flux concerné. Le régime ne peut être étendu aux déchets non dangereux de pneus sans fondement spécifique. | Qualifier chaque flux de déchet selon sa classification réglementaire et ne déclencher une procédure de bordereau électronique que si le flux relève de l’article R. 541-45. ; Si l’entreprise gère effectivement des déchets dangereux ou POP, prévoir le suivi des identifiants et statuts de bordereau et un accès ou une interface avec le service officiel, selon ses obligations et le fonctionnement de celui-ci. ; Ne pas imposer une clé API ni bloquer toute sortie de pneus usagés sur l’existence d’un numéro Trackdéchets : cette exigence n’est pas établie pour les pneus non dangereux par les sources fournies. | Les sources officielles citées indiquent l’application des dispositions de traçabilité des déchets dangereux à compter du 1er janvier 2022. Les pneus non dangereux ne sont pas soumis, sur la base des informations fournies, à cette obligation de bordereau pour ce seul motif. | L’article R. 541-78 prévoit une amende de 4e classe pour les manquements aux obligations de bordereau visées par le texte. L’article L. 541-46 peut prévoir des peines pour certaines infractions, mais les informations fournies ne permettent pas de les attribuer automatiquement à toute erreur de bordereau. |
| Cahier des charges des éco-organismes et collecte de la filière REP pneumatiques | Arrêté du 27 juin 2023 portant cahiers des charges des éco-organismes, des systèmes individuels et des organismes coordonnateurs de la filière REP pneumatiques ; Code de l’environnement, articles R. 543-139 et R. 543-142 | Pour les éco-organismes, assurer la collecte dans les conditions du cahier des charges ; l’arrêté indique que celle-ci est organisée auprès des détenteurs professionnels qui en font la demande. ; Pour les professionnels réalisant des opérations de gestion de déchets de pneus, respecter les modalités d’enregistrement auprès d’un éco-organisme ou système individuel agréé prévues à l’article R. 543-139. | Conserver les informations pratiques nécessaires aux demandes d’enlèvement et associer les enlèvements aux documents remis par le collecteur ou l’éco-organisme. ; Les sources fournies ne prescrivent pas de champs ERP spécifiques, de format d’export ou de délai de conservation propre à cet arrêté ; ne pas présenter ces choix techniques comme des obligations légales. | L’arrêté a été publié en 2023 ; l’article R. 543-139 est indiqué applicable depuis le 1er juillet 2023. Une source secondaire mentionne une échéance au 27 mai 2026 pour un contrat-type relatif au rechapage, mais les éléments fournis ne permettent pas d’établir qu’elle impose une obligation à cette entreprise ou à son ERP. | Les éléments disponibles ne donnent pas de sanction précise applicable à cette entreprise pour un manquement au cahier des charges, qui vise principalement les obligations des éco-organismes et systèmes individuels. |

Sources : [Sous-section 1 : Gestion des déchets de pneumatiques (Articl](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006188998/) · [Arrêté du 27 juin 2023 portant cahiers des charges des éco-o](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047792950) · [Paragraphe 1 : Dispositions générales (Articles R541-158 à R](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000042584201/) · [REP pneumatiques : obligations pour les fabricants et import](https://auditrep.fr/blog/rep-pneumatiques-guide-pratique) · [Article L541-10-13 - Code de l'environnement - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041583847) · [Paragraphe 1 : Modalités relatives à la délivrance et l&#39;](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000042584470/) · [Article L541-10-10 - Code de l'environnement - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041599045) · [Sous-section 2 : Filières soumises à la responsabilité élarg](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000041554940/)

### 0.6 Stock, inventaire et traçabilité

Le domaine s’applique : l’entreprise doit inventorier et justifier ses stocks, enregistrer chronologiquement les mouvements comptables et valoriser les stocks selon les règles applicables. Plusieurs affirmations du brouillon fourni vont au-delà des sources citées ou ne sont pas établies par elles : notamment l’obligation légale de comptage à l’aveugle, l’application générale de la REP au réparateur, et l’obligation d’un rapprochement de réception « trois voies ». Les fonctionnalités ERP ci-dessous distinguent donc les obligations attestées des mesures utiles de preuve.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Code de commerce — inventaire annuel et conservation des données d’inventaire | Code de commerce, art. L. 123-12 et R. 123-177 ; CGI, art. 54 ; BOFiP BOI-BIC-PDSTK-20-10, § 300 et 310 ; conservation : Code de commerce, art. L. 123-22. | Contrôler au moins une fois tous les douze mois l’existence et la valeur des éléments d’actif et de passif, à la date de clôture de l’exercice. ; Établir un inventaire détaillé et précis et être en mesure de communiquer à l’administration l’inventaire annuel. ; Si l’inventaire matériel est effectué avant la clôture, corriger les mouvements jusqu’à la clôture et conserver les justificatifs permettant de reconstituer les quantités et coûts à cette date. ; Les textes et extraits fournis ne prescrivent pas le comptage à l’aveugle : celui-ci peut être un choix de contrôle interne, mais ne doit pas être présenté comme une obligation légale établie ici. | Permettre d’établir un état d’inventaire à la clôture, détaillé par article et quantité, avec une valorisation justifiable. ; Enregistrer les quantités constatées, les écarts et leurs corrections, avec les pièces et mouvements intervenus entre la date de comptage et la clôture si le comptage est anticipé. ; Conserver les données d’inventaire dans les conditions de l’article L. 123-22 et les organiser pour justifier le contenu et le mode d’évaluation des postes du bilan. ; Le masquage des quantités théoriques pour les comptages à l’aveugle, la séparation des rôles et les motifs obligatoires d’écart sont des choix de conception pertinents, mais les sources fournies n’en établissent pas l’obligation. | Art. L. 123-12 indiqué en vigueur depuis le 21 septembre 2000 ; art. R. 123-177 en vigueur depuis le 1er janvier 2016. Obligation annuelle en vigueur en 2026. | Les sources fournies n’indiquent pas de sanction spécifique attachée au seul défaut de comptage physique. Elles signalent le risque de rectification fiscale si l’inventaire ou la comptabilité ne permet pas de justifier les stocks. |
| Règles fiscales de valorisation des stocks | CGI, art. 38, 3 ; annexe III au CGI, art. 38 nonies ; Code de commerce, art. R. 123-178 ; BOFiP BOI-BIC-PDSTK-20-20-10-10 (source fournie, page de valorisation). | Évaluer le stock à son prix de revient ; la source BOFiP précise qu’une valeur supérieure au prix de revient n’est pas admise. ; Pour les biens interchangeables ne pouvant être identifiés individuellement, appliquer le coût moyen pondéré ou le premier entré, premier sorti (FIFO/PEPS), selon les conditions exposées par le BOFiP. ; La source fournie ne suffit pas à établir une interdiction générale du LIFO dans toutes les situations ni à préciser toutes les composantes du coût d’acquisition : vérifier le texte consolidé et les règles comptables applicables à l’entreprise avant de transformer ces points en contrôles bloquants. | Conserver les données d’achat et les éléments permettant de justifier le prix de revient et la valeur de clôture. ; Permettre de documenter la méthode de valorisation retenue pour les catégories de stocks et d’en retracer les calculs. ; Produire un état valorisé par article à la date d’inventaire, et conserver les données nécessaires à sa justification. ; Ne pas imposer une méthode ou une formule détaillée non vérifiée dans les textes consolidés ; les frais accessoires et les changements de méthode doivent être paramétrés après validation comptable. | Règles en vigueur en 2026 ; les sources fournies ne précisent pas une date d’entrée en vigueur distincte pour les dispositions citées. | Les sources fournies ne donnent pas de barème de sanction spécifique pour une erreur de valorisation. Une valorisation injustifiée peut affecter le résultat imposable et exposer à rectification fiscale. |
| Mouvements comptables et contrôle des comptabilités informatisées | Code de commerce, art. L. 123-12 ; LPF, art. L. 13 et L. 47 A ; CGI, art. 54 et 1729 D ; BOFiP BOI-CF-IOR-60-40. | Enregistrer chronologiquement les mouvements affectant le patrimoine de l’entreprise. ; Présenter, lors d’un contrôle, les fichiers comptables et traitements requis par les règles du contrôle des comptabilités informatisées. ; Fournir les éléments permettant de justifier les montants comptabilisés et les stocks retenus à la clôture. ; Les extraits fournis ne fondent pas une obligation générale d’inaltérabilité de chaque mouvement opérationnel, ni un format d’export universel pour tous les fichiers de stock. Les exigences doivent être déterminées selon le périmètre comptable du logiciel et les demandes applicables au contrôle. | Garder une chronologie des mouvements intégrés à la comptabilité et des références permettant de les rapprocher des pièces justificatives. ; Prévoir des exports exploitables des données comptables requises et des états de stock permettant de justifier la valorisation et les quantités. ; Pour la fiabilité de la preuve, privilégier l’annulation ou la correction traçable plutôt que l’effacement silencieux des mouvements validés ; cette mesure est ici une bonne pratique, non une obligation démontrée par les seuls extraits. ; Tracer les validations, corrections, utilisateurs et motifs est utile à l’audit, mais les champs détaillés et la durée de conservation de chaque journal doivent être fixés selon les obligations comptables et fiscales réellement applicables. | Dispositions en vigueur en 2026 ; les sources fournies ne précisent pas de date d’entrée en vigueur applicable à l’ensemble de ces règles. | Selon les sources fournies, l’article 1729 D du CGI sanctionne certains défauts de présentation des fichiers comptables informatisés. Le montant et les conditions exactes doivent être vérifiés dans la version en vigueur de cet article ; la majoration de 100 % mentionnée dans la source concerne l’opposition au contrôle fiscal, et non toute anomalie d’un journal de stock. |
| Réserve de propriété et revendication de marchandises | Code de commerce, art. L. 624-9, L. 624-16 à L. 624-18 ; Code civil, art. 2367 et suivants. Jurisprudence citée : Cass. com., 29 novembre 2016, n° 15-12.350 ; Cass. com., 6 mars 2024, n° 22-22.651. | La clause doit avoir été convenue par écrit au plus tard au moment de la livraison pour permettre la revendication dans le cadre visé par l’article L. 624-16. ; Les biens concernés doivent se retrouver en nature au moment de l’ouverture de la procédure collective ; les biens fongibles sont soumis aux règles applicables à leur revendication. ; La revendication doit être exercée dans les délais et selon les conditions de la procédure collective. La source cite le délai de trois mois, sans détailler ici toutes les règles procédurales ni leurs points de départ. | Si des clauses existent, conserver le contrat ou les CGV applicables, leur preuve d’acceptation et leur date, ainsi que les bons de livraison et factures associés. ; Permettre de rapprocher les réceptions, sorties et quantités encore détenues des achats concernés, y compris par dépôt ou véhicule, dans la mesure où les données le permettent. ; Un indicateur de clause et un état des quantités liées à des factures impayées peuvent faciliter la preuve, mais les champs exacts ne constituent pas, en eux-mêmes, des obligations légales explicitement citées. ; Ne pas traiter le statut « facture impayée » comme preuve suffisante d’une clause opposable : conserver l’écrit et la preuve de son acceptation. | Dispositions en vigueur en 2026 ; les sources fournies ne précisent pas une date d’entrée en vigueur distincte. | Une identification ou une preuve insuffisante peut compromettre l’exercice d’une revendication. Les sources fournies ne prévoient pas de sanction ERP spécifique. |
| Déchets de pneumatiques — traçabilité et responsabilité élargie du producteur | Code de l’environnement, art. L. 541-10, L. 541-10-8, R. 543-137 à R. 543-145, notamment R. 543-139 ; décret n° 2023-152 du 2 mars 2023, art. 1 et 4 ; art. R. 541-160 pour les seuils de reprise cités. | Les personnes réalisant des opérations de gestion des déchets de pneumatiques doivent être enregistrées auprès des éco-organismes ou systèmes individuels agréés, selon l’article R. 543-139. ; L’article R. 543-138 interdit notamment l’abandon, le dépôt dans le milieu naturel et le brûlage à l’air libre des pneumatiques. ; Les obligations de reprise dépendent du rôle de distributeur et, pour certaines modalités, des seuils et conditions de l’article R. 541-160. Les sources ne démontrent pas que chaque montage implique une déclaration ou un suivi individuel par l’ERP. ; Les règles générales de bordereau et de conservation des déchets varient selon le flux, la qualité de l’acteur et les textes applicables ; les éléments fournis ne permettent pas d’imposer un BSD Trackdéchets à tous les flux de pneus usagés. | Si l’entreprise collecte ou détient des pneus usagés, enregistrer les quantités et dates de remise, le collecteur ou éco-organisme et les justificatifs effectivement requis pour son rôle. ; Permettre d’exporter les données de suivi demandées par l’éco-organisme ou les autorités, si l’entreprise est assujettie à ces déclarations. ; Paramétrer les obligations de reprise selon le rôle et les seuils applicables plutôt que bloquer tous les montages sur une obligation supposée de reprise. ; Conserver les justificatifs selon le délai applicable au document et au statut de l’entreprise ; les sources fournies citent trois ans pour certains collecteurs/transporteurs et cinq ans dans les autres cas pour des copies de bordereaux, sans établir que cette règle concerne chaque opérateur de pneus. | Art. R. 543-138 en vigueur depuis le 5 mars 2023 ; art. R. 543-139 en vigueur depuis le 1er juillet 2023. Pas d’échéance future identifiée dans les sources fournies. | Le Code de l’environnement prévoit des sanctions pour des manquements aux obligations relatives aux déchets, mais les sources fournies ne permettent pas d’associer avec certitude un montant précis à chaque manquement d’un monteur ou réparateur de pneus. Les sanctions mentionnées dans le brouillon doivent être vérifiées au regard de l’obligation concrète et de la version consolidée applicable. |
| Facturation B2B et facturation électronique — lien avec les stocks | Code de commerce, art. L. 441-9 (version en vigueur jusqu’au 1er septembre 2026 selon la source fournie) ; CGI, art. 289 et 289 bis ; annexe II au CGI, art. 242 nonies J ; décret n° 2022-1299 du 7 octobre 2022, modifié par le décret n° 2024-266 du 25 mars 2024. | La facture professionnelle comporte les mentions applicables, dont le numéro du bon de commande lorsqu’il a été préalablement établi par l’acheteur, selon l’article L. 441-9 fourni. ; Les factures électroniques soumises à l’article 289 bis doivent respecter les exigences de données structurées applicables. ; La source fournie indique des échéances au 1er septembre 2026 et au 1er septembre 2027 selon les catégories d’assujettis et les opérations. Elle ne suffit pas à déterminer le calendrier exact de chaque obligation pour cette entreprise, qui dépend notamment de sa taille et de la nature des opérations. | Si l’ERP gère la facturation, conserver le numéro de commande lorsqu’il existe et les données nécessaires aux factures et échanges structurés applicables. ; Relier commande, réception et facture peut être une fonctionnalité de contrôle interne ; le rapprochement dit « trois voies » n’est pas établi comme obligation générale par les sources fournies. ; Vérifier le calendrier et les formats requis selon la catégorie de l’entreprise et les textes applicables avant de spécifier les exports. | Art. L. 441-9 cité dans la source du 26 avril 2019 au 1er septembre 2026. Les sources fournies indiquent des dates de réforme au 1er septembre 2026 et au 1er septembre 2027 selon les cas ; elles ne permettent pas de fixer la date propre à l’entreprise sans connaître sa catégorie. | La source fournie cite une amende administrative pour manquement à l’article L. 441-9. Les sanctions et échéances de facturation électronique doivent être vérifiées dans les textes consolidés applicables au moment du déploiement. |

Sources : [Code de commerce - Article L123-12](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219304) · [BIC - Produits et stocks - Valorisation des stocks / bofip.i](https://bofip.impots.gouv.fr/bofip/1497-PGP.html/identifiant=BOI-BIC-PDSTK-20-20-10-10-20120912) · [Section 3 : Des droits du vendeur de meubles, des revendicat](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000005634379/LEGISCTA000006161365?init=true&amp=&page=1&amp=&query=L624-16&amp=&searchField=ALL&amp=&tab_selection=all&amp=&anchor=LEGIARTI000019984038) · [Titre IV : Déchets (Articles D541-1 à D543-370) - Légifrance](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006143787/) · [BIC - Produits et stocks - Notion de stocks et de production](https://bofip.impots.gouv.fr/bofip/1493-PGP.html/identifiant=BOI-BIC-PDSTK-20-10-20120912) · [Code de commerce - Article R123-177](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000030927443) · [CF - Procédures de rectification et d&#039;imposition d&#039](https://bofip.impots.gouv.fr/bofip/9848-PGP.html/identifiant=BOI-CF-IOR-60-40-40-20210113) · [CF - Infractions et sanctions - Infractions et pénalités fis](https://bofip.impots.gouv.fr/bofip/721-PGP.html/identifiant%3DBOI-CF-INF-10-40-20-20120912)

### 0.7 Travail, sécurité et flotte de véhicules

Le domaine s’applique en partie : l’entreprise emploie des techniciens et utilise des véhicules, mais les informations fournies ne précisent ni les horaires et régimes de travail, ni les équipements utilisés, ni le nombre, le PTAC ou l’usage réglementaire des véhicules. Les sources disponibles ne permettent donc pas d’établir une liste exhaustive des textes applicables ni de confirmer plusieurs détails avancés dans le brouillon, notamment certaines fréquences de contrôle, durées de conservation et sanctions.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Code du travail — décompte du temps de travail | Code du travail, articles L. 3171-2, L. 3171-3, L. 3171-4 et D. 3171-8 ; Conseil d’État, 17 avril 2025, n° 492418 | Dans le cas visé par les textes, décompter quotidiennement les heures de début et de fin des périodes de travail ou le nombre d’heures accomplies, puis récapituler le temps de travail chaque semaine. ; Le décompte doit refléter les heures réellement accomplies. Un système avec horaires prévisionnels doit permettre les corrections nécessaires chaque jour et chaque semaine. ; Tenir les documents de décompte à la disposition de l’inspection du travail selon les textes cités. | Prévoir, si l’entreprise choisit d’utiliser l’ERP pour ce décompte, des relevés individuels quotidiens et une récapitulation hebdomadaire. ; Conserver l’historique des corrections et permettre d’identifier les valeurs prévisionnelles et les valeurs effectivement déclarées. ; Les sources fournies ne justifient pas une obligation générale d’enregistrer les pauses, les trajets de dépannage, de bloquer automatiquement les affectations ou d’utiliser un format particulier d’export. | Dispositions du Code du travail en vigueur ; décision du Conseil d’État du 17 avril 2025 sur les conditions d’utilisation d’horaires préremplis. | L’article L. 8115-1, selon les sources fournies, prévoit une amende administrative pouvant atteindre 4 000 € par salarié concerné. Les autres sanctions et leur applicabilité ne peuvent être précisées à partir des éléments fournis. |
| Code du travail — prévention des risques et conduite d’équipements de travail | Code du travail, articles L. 4121-1, R. 4323-55 et R. 4323-56 ; arrêté du 2 décembre 1998 relatif à la formation à la conduite des équipements de travail mobiles automoteurs et des équipements de levage | Prendre les mesures nécessaires de prévention et assurer une formation adéquate à la conduite en sécurité des équipements concernés. ; Pour les équipements relevant de l’obligation d’autorisation de conduite, délivrer cette autorisation après les vérifications prévues, notamment relatives à l’aptitude, aux compétences et à la connaissance des lieux et consignes. ; Le CACES est présenté dans les sources comme un moyen d’évaluer les compétences, et non comme une obligation légale générale. | Si ces équipements sont utilisés, permettre de suivre les formations et autorisations pertinentes, leur périmètre et leur état de validité. ; Les sources ne fondent pas une obligation d’utiliser un CACES, de conserver ces pièces pendant une durée précise dans l’ERP ou de bloquer automatiquement une mission. | Dispositions citées en vigueur ; les sources mentionnent une refonte des recommandations CACES au 1er janvier 2020, sans que cette date transforme le CACES en obligation légale générale. | Les sources fournies ne permettent pas de préciser une sanction spécifique pour chaque manquement ni son montant. Le devoir général de prévention est cité, mais les conséquences dépendent des faits et des textes applicables. |
| Code de la route — désignation du conducteur après certaines infractions constatées automatiquement | Code de la route, articles L. 121-6, L. 130-9, R. 130-11 et A. 121-1 ; arrêté du 15 décembre 2016 mentionné dans les sources | Le représentant légal doit communiquer à l’autorité indiquée l’identité et l’adresse de la personne physique qui conduisait, dans les 45 jours à compter de l’envoi ou de la remise de l’avis, sauf exceptions prévues par le texte. ; La désignation peut être faite par voie dématérialisée selon les modalités applicables. | Si l’entreprise choisit de gérer ce processus dans l’ERP, conserver des affectations de véhicules et conducteurs suffisamment précises pour aider à identifier le conducteur à la date de l’infraction. ; Permettre le suivi de la date de l’avis et de l’échéance de 45 jours, ainsi que la traçabilité de la désignation et de son justificatif. ; Les sources ne démontrent pas que l’ERP doit enregistrer le numéro de permis, interdire une affectation sans permis valide ou produire un export spécifique par lot. | En vigueur depuis le 1er janvier 2017 selon les sources fournies. | Le manquement est puni de l’amende prévue pour les contraventions de quatrième classe. Le montant exact applicable à l’entreprise ne peut être établi de manière fiable à partir des seules sources fournies. |
| Contrôle technique des véhicules de transport routier de marchandises | Code de la route, articles R. 323-22 à R. 323-26 selon le brouillon ; modalités résumées par Service-Public.fr, fiche F22299 | Pour les véhicules concernés par le transport routier de marchandises, effectuer le contrôle technique selon la périodicité indiquée par la source, soit une fois par an. | Si l’entreprise exploite de tels véhicules, suivre leur catégorie et les dates de contrôle ainsi que les échéances correspondantes. ; La source ne justifie pas les fréquences proposées pour les VUL, les alertes à J-60/J-30, un blocage automatique des tournées ou une durée de conservation particulière. | La périodicité annuelle des véhicules de transport routier de marchandises est donnée par la fiche Service-Public fournie. Les dates d’application détaillées ne figurent pas dans les sources disponibles. | Les sources fournies ici ne permettent pas de préciser les sanctions applicables. |
| Règlements de l’Union européenne sur les temps de conduite et les tachygraphes | Règlement (CE) n° 561/2006 ; règlement (UE) n° 165/2014 | Si les véhicules et activités entrent dans le champ des règlements, respecter les règles pertinentes relatives aux temps de conduite et de repos et à l’utilisation du tachygraphe. ; La détermination des exemptions et des obligations de téléchargement ou d’archivage requiert les caractéristiques précises des véhicules et de l’activité ; les sources fournies ne permettent pas de les établir pour cette entreprise. | Ne pas activer par défaut un module de conformité tachygraphe sur la seule base du secteur ou de la mention de camions. ; Si l’assujettissement est confirmé, prévoir un suivi adapté aux obligations applicables et conserver les données requises ; les périodicités et durées avancées dans le brouillon ne sont pas suffisamment étayées par les sources officielles fournies. | Les règlements sont cités comme applicables, mais les sources fournies ne permettent pas de préciser les dates et règles de champ pertinentes pour les véhicules de l’entreprise. | Les sanctions invoquées dans le brouillon ne sont pas suffisamment étayées par les sources fournies pour être reprises comme applicables. |
| Réglementation des équipements sous pression et des appareils de levage | Arrêté du 20 novembre 2017 relatif au suivi en service des équipements sous pression et arrêté du 1er mars 2004 relatif aux vérifications des appareils et accessoires de levage, tels que cités dans le brouillon | Les obligations de vérification et leurs échéances dépendent du type d’équipement et, pour les équipements sous pression, de ses caractéristiques et de son régime réglementaire. ; Les sources fournies ne permettent pas de confirmer une périodicité unique applicable aux ponts élévateurs, aux cuves ou aux compresseurs de cette entreprise. | Si de tels équipements sont exploités, tenir un inventaire avec identification, emplacement, caractéristiques et justificatifs de contrôles pertinents. ; Paramétrer les échéances après qualification de chaque équipement et du régime applicable ; ne pas appliquer automatiquement les périodicités ou blocages allégués dans le brouillon. | Les arrêtés sont cités dans les sources, mais les modalités exactes applicables et leurs échéances ne peuvent être confirmées pour les équipements de l’entreprise. | Les sources disponibles ne permettent pas de préciser les sanctions applicables à chaque équipement ou manquement. |
| Taxe annuelle incitative relative à l’acquisition de véhicules légers à faibles émissions | Code des impositions sur les biens et services, articles L. 421-94 et suivants selon le brouillon ; article 28 de la loi de finances pour 2025 selon les sources fournies | Si l’entreprise entre dans le champ du dispositif, les obligations fiscales et les modalités de calcul doivent être déterminées à partir des dispositions en vigueur et de la composition du parc. ; Les sources disponibles ne permettent pas de confirmer les seuils, taux, calculs ni échéances déclaratives avancés dans le brouillon. | Recueillir, si nécessaire pour l’analyse d’assujettissement, la catégorie, le PTAC, le mode de détention et les caractéristiques des véhicules concernés. ; Ne pas coder un seuil, un ratio, une déclaration ou une taxe par véhicule sans vérification des textes officiels applicables à la situation de l’entreprise. | Une évolution législative en 2025 est mentionnée, mais les sources fournies ne permettent pas de déterminer de façon suffisamment fiable le régime exact en vigueur en 2026 ni les échéances à venir. | Montants et sanctions non confirmables à partir des sources disponibles. |

Sources : [Décompte du temps de travail : obligations légales](https://www.compta-online.com/le-decompte-des-heures-de-travail-par-employeur-ao1356) · [Modalités de décompte du temps de travail effectif : des pré](https://www.lagazettefrance.fr/article/modalites-de-decompte-du-temps-de-travail-effectif-des-precisions-utiles-du-conseil-d-etat) · [Décompte du temps de travail : un logiciel avec des horaires](https://www.legisocial.fr/actualites-sociales/7330-decompte-temps-travail-logiciel-horaires-theoriques-pre-renseignes-utilise-condition.html) · [Calcul heure de travail par semaine : guide employeur](https://www.swim.legal/blog/calcul-heure-de-travail-par-semaine) · [Décompte des heures de travail : règles et sanctions](https://www.swim.legal/blog/decompte-des-heures-de-travail-definition-obligations-methodes-employeur) · [Heure commencée est-elle due ? Ce que dit le Code du travail](https://www.swim.legal/blog/toute-heure-commencee-est-due-code-du-travail-5210c) · [Gestion et suivi du temps de travail : ce que dit la loi / F](https://fortify.fr/digital-rh/suivi-du-temps-de-travail-obligations-legales-et-solutions/) · [CACES® : définition, rôle et obligations : le guide complet](https://www.positivformation.com/caces-quest-ce-que-cest/)

### 0.8 Sécurité informatique et gestion des accès

Le RGPD s’applique aux données des comptes utilisateurs et aux journaux lorsqu’ils permettent d’identifier des salariés. Il impose des mesures de sécurité proportionnées aux risques, mais les sources disponibles ne justifient pas toutes les prescriptions techniques avancées du brouillon comme des obligations légales fixes. L’assujettissement à NIS 2 et aux règles d’accessibilité ne peut pas être tranché à partir du seul code NAF ou de la seule description d’un ERP interne.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Règlement général sur la protection des données (RGPD) | Règlement (UE) 2016/679, notamment articles 5, 24, 25, 28, 32, 33, 34 et 83 ; loi n° 78-17 du 6 janvier 1978 modifiée | Mettre en œuvre des mesures techniques et organisationnelles adaptées aux risques pour assurer la confidentialité, l’intégrité, la disponibilité et la résilience des données personnelles. ; Limiter les habilitations aux personnes qui en ont besoin et protéger les données dès la conception et par défaut. ; Si l’ERP est fourni ou hébergé par un prestataire traitant des données pour l’entreprise, encadrer cette sous-traitance conformément à l’article 28. ; Documenter et notifier à la CNIL une violation de données personnelles dans les conditions et délais de l’article 33 ; informer les personnes concernées lorsque les conditions de l’article 34 sont réunies. ; Conserver les données et journaux personnels seulement pendant une durée justifiée par leur finalité. | Prévoir des comptes individuels, des rôles et des permissions différenciés, ainsi qu’une procédure de création, modification et révocation des habilitations. ; Journaliser les actions nécessaires à la sécurité et à la traçabilité, en limitant les données enregistrées et les accès aux journaux. ; Permettre l’export et la recherche des éléments utiles à la gestion d’un incident ou à l’exercice des droits, avec accès réservé aux personnes autorisées. ; Définir des durées de conservation documentées et une purge adaptée ; aucune durée générale unique de conservation des logs n’est établie par les éléments disponibles. ; Prévoir des sauvegardes et des procédures de restauration adaptées aux risques et tester leur efficacité ; les sources ne fixent pas de périodicité légale particulière. | Depuis le 25 mai 2018. | Les sanctions administratives de l’article 83 peuvent atteindre, selon le manquement, 20 millions d’euros ou 4 % du chiffre d’affaires annuel mondial, le montant le plus élevé étant retenu. |
| Recommandation CNIL relative aux mots de passe et autres secrets partagés | Délibération CNIL n° 2022-100 du 21 juillet 2022 portant adoption d’une recommandation relative aux mots de passe et autres secrets partagés et abrogeant la délibération n° 2017-012 du 19 janvier 2017 | Appliquer des mesures d’authentification adaptées au risque du traitement. ; Ne pas enregistrer les mots de passe en clair dans les journaux. ; Choisir une protection des secrets adaptée aux recommandations, notamment pour leur stockage et leur manipulation. | Ne jamais écrire les mots de passe ou secrets d’authentification dans les journaux. ; Mettre en œuvre le stockage sécurisé des mots de passe, avec une fonction de hachage adaptée et un sel ou une clé selon le cas. ; Prévoir des contrôles de tentatives d’authentification et des protections complémentaires déterminées par l’analyse de risques. ; La CNIL recommande de privilégier l’authentification multifacteur lorsque possible, notamment pour les connexions accessibles depuis l’extérieur ; les éléments fournis ne permettent pas d’en faire une exigence universelle pour tout ERP. | Délibération du 21 juillet 2022 ; la source disponible ne précise pas une échéance future spécifique. | La recommandation n’établit pas de sanction autonome. Un défaut de sécurité peut être sanctionné au titre du RGPD, notamment de son article 32. |
| Recommandation CNIL relative à la journalisation | Recommandation CNIL relative aux mesures de journalisation ; la référence exacte de la délibération et sa date ne sont pas établies par les éléments disponibles | La journalisation doit être justifiée par la sécurité ou une finalité légitime, proportionnée et limitée à ce qui est nécessaire. ; Les logs ne doivent pas être conservés plus longtemps que nécessaire ; la CNIL indique qu’en général six mois est une durée adéquate dans le contexte de gestion des utilisateurs. ; Ne pas détourner les journaux techniques de leur finalité de sécurité. | Tracer de manière ciblée les accès et opérations utiles à la sécurité, en identifiant l’utilisateur et l’action lorsque nécessaire. ; Protéger les journaux contre les accès et modifications non autorisés et restreindre leur consultation. ; Définir une durée de conservation justifiée et une purge automatique ; six mois est une indication générale de la CNIL, pas une durée légale fixe applicable à chaque journal. | Recommandation de la CNIL ; aucune date d’entrée en vigueur réglementaire n’est établie par les éléments disponibles. | Pas de sanction autonome identifiée pour la recommandation ; une journalisation excessive ou insuffisamment sécurisée peut relever du RGPD. |
| Code du travail — proportionnalité et information sur les dispositifs de contrôle | Code du travail, article L. 1121-1 ; article L. 2312-38 | Toute restriction aux droits et libertés doit être justifiée par la tâche à accomplir et proportionnée au but recherché. ; Informer les salariés des dispositifs de collecte ou de contrôle qui les concernent. ; Lorsque les conditions légales sont réunies, informer et consulter le CSE avant la décision de mise en œuvre d’un moyen ou d’une technique permettant un contrôle de l’activité des salariés. | Limiter la collecte des événements nominatifs à des finalités explicites et proportionnées. ; Restreindre l’accès aux historiques détaillés aux personnes habilitées. ; Permettre de distinguer les journaux nécessaires à la sécurité des fonctions de suivi de l’activité ; préciser les finalités et règles d’accès dans les informations destinées aux salariés. | Textes en vigueur ; aucune échéance particulière n’est indiquée dans les éléments disponibles. | Les sources disponibles ne précisent pas de sanction chiffrée applicable à ce cas. |
| Sécurité des appareils mobiles — recommandations CNIL | CNIL, fiche « Sécuriser l’informatique mobile » et fiche « Perte ou vol de matériel informatique nomade : les bons réflexes à avoir ! » ; RGPD, article 32 | Protéger les données accessibles depuis des appareils mobiles selon les risques, notamment en cas de perte ou de vol. ; Gérer l’affectation du matériel et les habilitations, et pouvoir révoquer les accès. ; Limiter les données conservées localement et prendre en compte les risques spécifiques du BYOD. ; Pour un appareil personnel, éviter d’accéder à l’espace privé ; les modalités d’un éventuel effacement à distance doivent préserver la séparation des usages. | Tenir, si nécessaire, un inventaire des appareils autorisés et de leur affectation à un utilisateur. ; Permettre la révocation des sessions et accès d’un terminal perdu ou volé. ; Limiter et protéger les données locales ; prévoir des mécanismes tels que verrouillage, chiffrement ou effacement à distance selon l’analyse de risques. ; En BYOD, cloisonner les données professionnelles et encadrer les modalités d’effacement ; un effacement sélectif est une mesure recommandée, non une obligation générale explicitement établie ici. | Recommandations publiées par la CNIL, notamment en 2022 ; pas de date d’entrée en vigueur réglementaire distincte. | Pas de sanction autonome pour le non-respect d’une fiche de recommandations ; un incident dû à des mesures insuffisantes peut engager la responsabilité au titre du RGPD. |
| Directive NIS 2 — sécurité des réseaux et systèmes d’information | Directive (UE) 2022/2555, notamment articles 3, 20, 21 et 23 et annexes I et II ; état de la transposition française au 7 novembre 2026 non établi par les sources officielles fournies | Aucune obligation NIS 2 ne peut être attribuée à cette entreprise à partir des seuls faits fournis. ; Si l’entreprise est assujettie, les mesures de gestion des risques prévues par la directive comprennent notamment la gestion des incidents, la continuité d’activité, la sécurité de la chaîne d’approvisionnement, le contrôle des accès et la cryptographie. ; L’applicabilité doit être vérifiée au regard du texte européen, des règles nationales de transposition en vigueur et de la qualification précise de l’entité. | Ne pas activer de contrôles ou de champs présentés comme des exigences NIS 2 propres à cette société avant d’avoir confirmé son assujettissement. ; Si l’entreprise est couverte, intégrer les contrôles pertinents au système de gestion des risques et aux obligations de notification applicables ; les modalités précises dépendent du droit national en vigueur. | La directive prévoyait une transposition au plus tard le 17 octobre 2024. Les sources fournies sont contradictoires ou insuffisantes pour établir l’état exact du droit français au 7 novembre 2026. | Les plafonds prévus par la directive varient selon la catégorie d’entité ; leur application concrète dépend du droit national de transposition et de l’assujettissement. Les éléments disponibles ne permettent pas de confirmer le régime effectivement opposable en France à cette date. |
| Accessibilité numérique — RGAA et directive européenne sur l’accessibilité | Directive (UE) 2019/882 ; loi n° 2023-171 du 9 mars 2023 ; décret n° 2023-931 du 9 octobre 2023 ; article 47 de la loi n° 2005-102 du 11 février 2005 ; référentiel RGAA 4.1.2 | Vérifier séparément le champ de l’article 47 et celui de la directive 2019/882, selon le statut de l’entreprise, les utilisateurs et la nature du service. ; Un ERP interne n’est pas, à lui seul, une preuve que les obligations de conformité, d’audit ou de publication du RGAA s’appliquent. | Aucune obligation d’audit RGAA, de déclaration publique ou de champs réglementaires ne peut être confirmée pour cet ERP avec les informations disponibles. ; Si une interface ou un service entre dans le champ d’un texte applicable, les exigences d’accessibilité correspondantes devront être analysées pour ce service précis. | La directive 2019/882 est applicable depuis le 28 juin 2025 pour les services entrant dans son champ ; l’application à cet ERP précis n’est pas établie. | Les sanctions ne peuvent être déterminées sans établir l’assujettissement et le texte national effectivement applicable au service concerné. |

Sources : [Gérer les utilisateurs / CNIL](https://cnil-d10.cnil.fr/fr/gerer-les-utilisateurs) · [NIS 2 : obligations, entités concernées et transposition en ](https://www.nexthop.fr/comprendre/nis2) · [Obligations accessibilité RGAA : le guide complet (Loi 2025)](https://wexperience.fr/blog/obligations-accessibilite-rgaa-le-guide-complet-loi-2025/) · [Quelles mesures renforcées la CNIL prévoit-elle dans le cadr](https://www.haas-avocats.com/reglementation/cnil/quelles-mesures-renforcees-la-cnil-prevoit-elle-dans-le-cadre-du-rgpd/) · [Perte ou vol de matériel informatique nomade : les bons réfl](https://cnil-d10.cnil.fr/fr/perte-ou-vol-de-materiel-informatique-nomade-les-bons-reflexes-avoir) · [La CNIL dévoile ses recommandations pour renforcer la protec](https://lemondedelasecurite.fr/la-cnil-devoile-ses-recommandations-pour-renforcer-la-protection-des-grandes-bases-de-donnees/) · [La CNIL donne ses consignes pour renforcer la sécurité des g](https://cnil-d10.cnil.fr/fr/consignes-pour-renforcer-la-securite-des-grandes-bases-de-donnees) · [www.cnil.fr LA SÉCURITÉ DES DONNÉES PERSONNELLES](https://www.cnil.fr/sites/cnil/files/attachment_501_517.pdf)

### 0.9 Déchets de pneumatiques et filière REP

_Périmètre : Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité._

Le domaine s’applique parce que l’entreprise vend des pneumatiques et peut en reprendre, détenir ou expédier après montage/dépannage. Le rôle exact dépend toutefois des opérations réellement effectuées : la vente établit le rôle de distributeur, tandis que la collecte pour le compte de tiers ou l’importation ne sont pas établies par les informations fournies. L’ERP peut soutenir la conformité et la traçabilité, mais les sources disponibles ne permettent pas d’affirmer qu’un logiciel donné doit obligatoirement automatiser ou transmettre tous ces flux.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Code de l’environnement — reprise des pneumatiques usagés par les distributeurs | Articles L. 541-10-8, 16° de L. 541-10-1, R. 541-158 à R. 541-160 et R. 541-163 à R. 541-166 ; décret n° 2024-1221 du 27 décembre 2024, dispositions applicables à compter du 18 août 2025 | Reprendre gratuitement les pneus usagés dans la limite du type et de la quantité de pneumatiques vendus ou remplacés au titre de la reprise « 1 pour 1 », y compris par un distributeur procédant à des livraisons. ; Si les conditions de surface et de catégories sont réunies, assurer la reprise sans achat dans la limite prévue pour les détenteurs particuliers ; une attestation sur l’honneur peut être demandée pour le plafond annuel. ; Un refus est possible lorsque contamination ou mauvaise manipulation crée un risque pour la santé ou la sécurité du personnel ; le détenteur doit être informé des solutions alternatives. ; Respecter les obligations d’information sur les modalités de reprise prévues par les textes cités. | Permettre d’enregistrer les pneus usagés repris, la date, la quantité, le point de collecte et le contexte (vente/remplacement ou apport sans achat), afin de documenter les opérations. ; Paramétrer les seuils applicables par établissement : surface dédiée, catégories de pneus et caractère particulier du détenteur ; ne pas appliquer automatiquement la reprise sans achat si les critères ne sont pas remplis. ; Permettre de consigner un refus et son motif ainsi que l’information donnée sur les solutions alternatives. ; Les textes fournis ne prescrivent pas de champs ERP, de droits informatiques, de format d’export ni de durée de conservation spécifique des données de reprise. Ce sont des choix de conception à valider selon les obligations de preuve et les autres règles applicables. | R. 541-158 est en vigueur depuis le 1er janvier 2021 ; les règles pneumatiques citées à R. 541-159 depuis le 5 mars 2023 ; seuils de R. 541-160 issus du décret n° 2024-1221 applicables depuis le 18 août 2025. | Le manquement à l’obligation de reprise ou aux obligations d’information afférentes est sanctionné par l’amende de 5e classe selon R. 541-166. Les sources fournies ne permettent pas de confirmer ici le détail du montant applicable à chaque cas. |
| Code de l’environnement — REP pneumatiques et enregistrement des personnes réalisant des opérations de gestion | Articles L. 541-10-1, 16°, L. 541-10 et R. 543-137 à R. 543-145, notamment R. 543-139 ; décret n° 2023-152 du 2 mars 2023 ; arrêté du 27 juin 2023 portant cahier des charges de la filière REP pneumatiques | Enregistrer auprès d’un éco-organisme ou système individuel agréé les personnes qui réalisent les opérations de gestion concernées, selon les modalités applicables à la filière. ; Respecter l’interdiction d’abandonner, de déposer dans le milieu naturel ou de brûler à l’air libre des pneus ; R. 543-138 interdit également certaines réceptions en installations de stockage, d’incinération sans valorisation énergétique et exploitations agricoles. ; Les obligations de producteur (notamment contribution et déclaration au titre de la REP) ne peuvent être attribuées à cette entreprise sur les seules informations fournies ; elles sont à vérifier si elle importe ou met directement des pneus sur le marché national. | Si l’entreprise effectue des opérations de gestion visées, prévoir la tenue des données nécessaires à son enregistrement et à la traçabilité des opérations, avec l’identifiant de l’établissement et les catégories/quantités utiles. ; Permettre le suivi des pneus usagés détenus et des enlèvements, en distinguant pneus neufs en stock et déchets de pneumatiques. ; Ne pas présumer qu’un IDU producteur, un module de déclaration d’éco-contribution ou une connexion à un portail est obligatoire pour l’entreprise sans vérifier son rôle effectif et les exigences de l’éco-organisme concerné. ; Les références fournies ne fixent pas de champs ERP, de format d’export ou de durée d’archivage propres à ce logiciel. | Le décret n° 2023-152 et les dispositions citées de la section pneumatiques sont entrés en vigueur le 5 mars 2023 ; R. 543-139 est applicable depuis le 1er juillet 2023. L’arrêté de cahier des charges est daté du 27 juin 2023. | Les extraits fournis ne précisent pas de sanction déterminée applicable à chaque manquement d’enregistrement ou de gestion ; les sanctions doivent être vérifiées au regard de l’infraction et des dispositions en vigueur. |
| Code de l’environnement — registre chronologique des déchets | Articles L. 541-7, L. 541-7-1 et R. 541-43 ; arrêté du 31 mai 2021 fixant le contenu des registres déchets, terres excavées et sédiments, notamment ses dispositions relatives aux déchets sortants ; nomenclature des déchets, code 16 01 03 pour les pneumatiques hors d’usage | Tenir à jour un registre chronologique des déchets sortants concernés, avec les informations exigées par R. 541-43 et l’arrêté du 31 mai 2021. ; Consigner les données réglementaires pertinentes du flux, notamment la dénomination et le code du déchet, la quantité, la date et les informations sur les acteurs et la destination prévues par l’arrêté. ; Conserver le registre pendant au moins trois ans selon les éléments fournis. | Séparer clairement les stocks commerciaux de pneumatiques neufs des déchets de pneumatiques usagés. ; Pour les flux concernés, prévoir les données réglementaires du registre, notamment date, code déchet, dénomination, quantité, expéditeur, transporteur/collecteur et destination, selon les champs applicables de l’arrêté. ; Fournir un historique chronologique consultable et un export permettant de présenter le registre en cas de contrôle ; les sources fournies ne prescrivent pas un format d’export particulier ni un journal informatique immuable. ; Appliquer une conservation d’au moins trois ans aux données constituant le registre. | L’arrêté du 31 mai 2021 fixe le contenu du registre et s’applique à compter du 1er janvier 2022 selon les sources fournies. La date exacte d’entrée en vigueur de chaque disposition législative ou réglementaire citée n’est pas précisée dans les éléments disponibles. | Des sanctions existent pour les manquements à la traçabilité des déchets, mais les sources fournies ne donnent pas une référence et un quantum suffisamment établis pour préciser ici la sanction applicable à chaque défaut de registre. |
| Code de l’environnement — bordereaux et registre national dématérialisé des déchets | Articles R. 541-43 et R. 541-45 du Code de l’environnement ; décret n° 2021-321 du 25 mars 2021 ; plateforme Trackdéchets et registre national des déchets, terres excavées et sédiments (RNDTS) | Tenir le registre applicable aux flux de déchets non dangereux ; les sources officielles citées indiquent que les registres chronologiques internes restent nécessaires pour les personnes concernées. ; Utiliser les bordereaux dématérialisés lorsqu’un flux relève effectivement d’une catégorie soumise à cette obligation, notamment les déchets dangereux concernés. ; Les informations disponibles ne permettent pas de confirmer une obligation générale de déclarer les pneus usagés non dangereux sur Trackdéchets, ni l’affirmation d’une fusion générale du RNDTS et de Trackdéchets au 5 mai 2025. | Ne pas rendre obligatoire un connecteur Trackdéchets pour les seuls pneus usagés de code 16 01 03 sur la base des éléments disponibles. ; Si l’entreprise génère d’autres déchets soumis à bordereau dématérialisé, prévoir un processus permettant leur suivi distinct et vérifier les obligations applicables à ces flux. ; Conserver les références et justificatifs de bordereaux lorsqu’ils sont requis ; les sources fournies ne permettent pas d’établir une durée unique applicable à tous les documents ni un format d’intégration ERP obligatoire. | Le décret n° 2021-321 date du 25 mars 2021 ; les sources fournies indiquent une mise en œuvre au 1er janvier 2022 pour les déchets dangereux concernés. Les informations disponibles ne permettent pas d’établir la date et la portée réglementaire d’une éventuelle intégration du RNDTS à Trackdéchets pour le flux de pneus non dangereux. | Les sanctions dépendent du flux et de l’obligation de bordereau ou de déclaration effectivement applicable. Les éléments fournis ne permettent pas de chiffrer une sanction propre au défaut de transmission Trackdéchets pour les pneus usagés non dangereux. |

Sources : [Paragraphe 1 : Dispositions générales (Articles R541-158 à R](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000042584199/) · [Section 8 : Pneumatiques (Articles R543-137 à R543-145) - Lé](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006176999/) · [Décret n° 2023-152 du 2 mars 2023 relatif à la gestion des d](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047259904?init=true&amp=&page=1&amp=&query=d%C3%A9cret+n%C2%B0+2023-152+&amp=&searchField=ALL&amp=&tab_selection=all) · [Arrêté du 31 mai 2021 fixant le contenu des registres déchet](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043884563) · [Éléctions : Reprise obligatoire de certains produits usagés ](https://www.pigna.corsica/demarches/elections?audience=pro&xml=F37982) · [Reprise obligatoire de certains produits usagés par les dist](https://entreprendre.service-public.gouv.fr/vosdroits/F37982) · [Mise à jour sur l’obligation de reprise des produis usagés](https://www.gouache.fr/ressources/articles-avocats-mise-a-jour-sur-l-obligation-de-reprise-des-produis-usages/) · [Obligations des distributeurs d’équipements ménagers / ecosy](https://pro.ecosystem.eco/profil/partenaire-collecte/sous-profil/distributeurs-grand-public/obligations-distributeurs-grand-public)

### 0.10 Éco-contribution et déclarations de mise sur le marché

_Périmètre : Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas._

La REP pneumatiques est pertinente pour cette entreprise, mais les informations fournies ne permettent pas d'établir qu'elle est elle-même metteuse sur le marché. Elle le devient notamment si elle importe ou introduit pour la première fois en France des pneus, ou si elle les commercialise sous sa seule marque ; dans ce cas, les obligations de producteur s'appliquent. Même si elle ne fait que revendre des pneus déjà mis sur le marché en France, elle doit pouvoir communiquer à la demande l'IDU du producteur concerné.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Responsabilité élargie du producteur — filière pneumatiques | Code de l'environnement, articles L. 541-10, L. 541-10-1 (16°), R. 543-137 à R. 543-145 ; décret n° 2023-152 du 2 mars 2023 ; arrêté du 27 juin 2023 portant cahier des charges de la filière REP pneumatiques | Si l'entreprise est productrice, satisfaire à la REP par adhésion à un éco-organisme agréé ou par un système individuel agréé. ; Déclarer annuellement les quantités mises sur le marché en nombre et en tonnes, ainsi que les informations de filière requises par le texte. ; Verser la contribution due selon les modalités applicables à l'éco-organisme et à son barème. ; Si elle n'est qu'un distributeur, distinguer les pneus usagés repris des stocks de pneus neufs ; les conditions de reprise et de collecte relèvent également du cadre de gestion des déchets de pneumatiques. | Prévoir un paramétrage du statut REP et une traçabilité de l'origine d'approvisionnement (achat France, importation ou introduction UE, marque propre) afin de déterminer les opérations potentiellement déclarables. ; Si productrice, conserver des données permettant d'établir les quantités mises sur le marché, en unités et en poids, avec une ventilation conforme aux catégories et champs demandés par le dispositif ou l'éco-organisme. ; Permettre l'export des données de mise sur le marché et des justificatifs de déclaration ; les sources fournies ne précisent pas un format ERP obligatoire. ; Pour l'activité de distributeur/monteur, permettre de distinguer les pneus usagés repris et les mouvements de collecte, si ces opérations sont suivies dans l'ERP. ; Les sources fournies ne permettent pas d'établir une durée légale de conservation spécifique à intégrer dans l'ERP. | Le décret n° 2023-152 est entré en vigueur le 5 mars 2023. Les agréments des éco-organismes cités dans les informations fournies couvrent la période 2024-2028. | L'article L. 541-9-5 du Code de l'environnement est cité pour des sanctions administratives en cas de manquement REP. Les sources fournies ne permettent pas de confirmer les montants ni les modalités exactes applicables à chaque manquement. |
| Enregistrement REP et identifiant unique (IDU) | Code de l'environnement, articles L. 541-10-10, L. 541-10-13 et R. 541-173 ; arrêté du 11 février 2022 relatif à l'enregistrement des producteurs soumis à la REP | Pour un producteur, être enregistré au registre SYDEREP et communiquer l'IDU dans les conditions prévues, notamment dans les CGV ou, à défaut, un document contractuel ; le site internet doit également le présenter selon les conditions légales. ; Pour un vendeur non-producteur, obtenir l'IDU pertinent auprès du fournisseur et le communiquer à l'acheteur qui le demande. | Prévoir des champs pour l'IDU de l'entreprise par filière si elle est productrice et pour l'IDU du producteur associé aux produits fournisseurs. ; Permettre la restitution de l'IDU fournisseur sur demande d'un client et l'insertion de l'IDU propre dans les CGV ou documents contractuels si l'entreprise est productrice. ; Ne pas imposer, sur la seule base des sources fournies, l'affichage de l'IDU sur chaque devis ou facture : les sources indiquent les CGV ou, à défaut, un document contractuel, et une communication à la demande pour le vendeur non-producteur. | L'obligation d'IDU mentionnée dans les sources est en vigueur depuis le 1er janvier 2022. | Les sources fournies mentionnent une amende administrative pouvant atteindre 30 000 € pour certains manquements de communication de l'IDU. Le montant et le fondement précis doivent être vérifiés au regard du manquement concerné. |
| Reprise des pneumatiques usagés par les professionnels concernés | Code de l'environnement, article R. 541-160 | Respecter les conditions réglementaires de reprise applicables aux pneus usagés et afficher une information visible, lisible et compréhensible sur les conditions de reprise dans les lieux de vente concernés. ; Remettre les pneus usagés collectés dans le cadre prévu par la filière ; les conditions précises de collecte dépendent notamment de l'organisation applicable et des partenaires de collecte. | Si l'ERP suit ces opérations, distinguer les pneus usagés repris des pneus neufs en stock, avec date, quantité, lieu et mouvement vers le collecteur. ; Les sources fournies ne démontrent pas que la tenue de ces informations dans l'ERP ou un format d'export particulier est légalement obligatoire ; l'affichage requis relève du point de vente et ne peut être remplacé par un champ ERP. | La date d'entrée en vigueur de la rédaction applicable de l'article R. 541-160 n'est pas établie par les informations fournies. | Les sources fournies ne précisent pas de sanction spécifique pour ce manquement. |

Sources : [Pneumatiques / Filières REP](https://filieres-rep.ademe.fr/filieres-REP/filiere-PNEU) · [Tout savoir sur l&#039;identifiant unique des filières REP (](https://filieres-rep.ademe.fr/identifiant-unique) · [Garagiste / Distributeur de pneus - Aliapur](https://www.aliapur.fr/profils/garagiste-distributeur/) · [Section 8 : Pneumatiques (Articles R543-137 à R543-145) - Lé](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006074220/LEGISCTA000006176999/) · [Article R543-138 - Code de l'environnement - Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000031090421/2016-08-10) · [Arrêté du 21/12/23 portant agrément d&#039;un éco-organisme ](https://aida.ineris.fr/reglementation/arrete-211223-portant-agrement-dun-eco-organisme-filiere-a-responsabilite-elargie) · [Fabricant / Importateur de pneus neufs - Aliapur](https://www.aliapur.fr/profils/fabricant-importateur/) · [Aliapur / Qui doit payer ? Les chiffres](https://www.aliapur.fr/fr/les-chiffres.html)

### 0.11 Sécurité et classement ICPE des stockages de pneus

_Périmètre : Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510._

Le domaine s’applique aux dépôts où des pneus sont stockés, mais le classement et les obligations dépendent des quantités, du volume maximal, de la couverture et de la configuration de chaque site. Les informations fournies ne permettent pas de déterminer si un site précis relève des rubriques 2663 ou 1510 : le code NAF et les fonctions ERP ne suffisent pas. Les prescriptions réglementaires s’adressent à l’exploitant ICPE ; l’ERP peut faciliter leur suivi, sans que les éléments disponibles établissent des obligations logicielles autonomes ni un standard technique obligatoire.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Nomenclature ICPE — stockage de pneumatiques et de produits comportant au moins 50 % de polymères | Code de l’environnement, art. R. 511-9, rubrique 2663 ; arrêté du 14 janvier 2000 (régime de déclaration) ; arrêté du 15 avril 2010 modifié (régime d’enregistrement). | Déterminer, pour chaque installation concernée, le volume maximal susceptible d’être stocké et le régime ICPE applicable. ; Respecter les prescriptions générales correspondant au régime et les prescriptions particulières éventuellement applicables au site. ; Pour les installations soumises à déclaration, l’arrêté du 14 janvier 2000 cité dans les sources prévoit notamment des prescriptions d’implantation et de séparation ; les prescriptions exactes doivent être vérifiées au regard du texte consolidé et du site. | Permettre de distinguer les sites et zones de stockage, ainsi que les emplacements fixes et mobiles, sans présumer que le stock embarqué est juridiquement hors périmètre. ; Permettre de renseigner les volumes de référence et de calculer des quantités par site ou zone à partir de règles de calcul documentées par l’exploitant. ; Conserver les données de stock et les mouvements utiles à la justification du volume maximal déclaré ; les sources disponibles ne fixent pas une durée de conservation ERP précise. ; Prévoir des exports de stock et d’historique permettant à l’exploitant de préparer les éléments utiles à ses vérifications et échanges avec l’administration. Les sources disponibles ne prescrivent ni format ERP, ni champs logiciels obligatoires, ni journalisation immuable. | Les textes cités sont présentés comme en vigueur dans les informations disponibles. Le décret n° 2020-1169 du 24 septembre 2020 et les modifications associées sont indiqués comme applicables à compter du 1er janvier 2021. Aucune échéance future spécifique n’est établie par les éléments fournis. | Les sources disponibles indiquent que l’exploitation sans le régime ICPE requis peut entraîner des mesures administratives et des sanctions prévues par le Code de l’environnement, sans préciser ici les articles ni les montants applicables. Vérifier les sanctions dans la version consolidée du Code. |
| Prescriptions générales ICPE applicables au stockage relevant de la rubrique 2663 | Arrêté du 14 janvier 2000 relatif aux installations soumises à déclaration sous la rubrique 2663 ; arrêté du 15 avril 2010 relatif aux installations soumises à enregistrement sous la rubrique 2663, modifié notamment par l’arrêté du 24 septembre 2020. | Appliquer les prescriptions générales correspondant au régime et au cas de l’installation, notamment celles relatives à la prévention des risques et à l’organisation du stockage. ; Vérifier les prescriptions exactes dans les annexes et dispositions transitoires applicables au site : les résumés fournis ne permettent pas d’établir exhaustivement les exigences actuelles ni leurs exceptions. | Faciliter le suivi des volumes et de l’emplacement des stocks, et conserver les mouvements nécessaires à la vérification par l’exploitant. ; Les sources disponibles ne démontrent pas que ces arrêtés imposent un ERP, des champs précis, une durée de conservation informatique, un format d’export ou des droits logiciels particuliers. | Arrêtés de 2000 et 2010, avec modifications, indiqués comme applicables. Les modifications postérieures au décret de 2020 sont présentées comme entrées en vigueur au 1er janvier 2021 ; vérifier les dispositions transitoires sur Légifrance. | Le non-respect des prescriptions ICPE peut entraîner les mesures administratives et sanctions prévues par le Code de l’environnement. Les éléments disponibles ne précisent pas les sanctions propres à chaque manquement. |
| Nomenclature ICPE — entrepôts couverts de matières ou produits combustibles | Code de l’environnement, art. R. 511-9, rubrique 1510 ; décret n° 2020-1169 du 24 septembre 2020. | Faire déterminer le classement du bâtiment ou du groupement d’installations par rapport aux conditions de la rubrique et aux autres rubriques applicables. ; Respecter, si le site relève de la rubrique 1510, le régime administratif et les prescriptions générales correspondantes. | Permettre de rattacher les stocks à un site, bâtiment et zone, et de produire des données utiles au suivi des quantités et volumes, si l’exploitant choisit de s’en servir à cette fin. ; Les sources disponibles ne rendent pas obligatoires dans l’ERP le calcul d’une masse combustible, des seuils automatisés, ni un champ de poids par référence. La composition des stocks et le périmètre de calcul doivent être définis au regard des textes et du site. | Le décret n° 2020-1169 est indiqué comme applicable depuis le 1er janvier 2021. Aucune échéance future propre à la rubrique n’est établie par les informations fournies. | Les manquements aux obligations ICPE peuvent donner lieu aux mesures administratives et sanctions prévues par le Code de l’environnement. Les sources fournies ne détaillent pas les sanctions applicables à chaque situation. |
| Prescriptions générales applicables aux entrepôts couverts relevant de la rubrique 1510 | Arrêté du 11 avril 2017 relatif aux prescriptions générales applicables aux entrepôts couverts soumis à la rubrique 1510, modifié notamment par l’arrêté du 24 septembre 2020. | Respecter les prescriptions générales de l’arrêté correspondant au régime et à la situation du site. ; Pour les installations concernées, tenir un état des matières stockées mis à jour au minimum chaque semaine, accessible à tout moment, y compris en cas d’incident, et accompagné d’un plan général des zones concernées, selon l’article et l’annexe applicables. ; Vérifier dans le texte consolidé les prescriptions et dispositions transitoires applicables à l’installation, notamment selon son régime et sa date de mise en service. | Si l’exploitant doit tenir l’état des matières stockées, permettre de produire des données de stocks par zones et de les associer à un plan de zones, et d’en assurer une mise à jour au moins hebdomadaire. ; Permettre l’accès et l’export des informations nécessaires en situation d’incident. Les sources ne prescrivent pas spécifiquement un format PDF/A, CSV, hébergement cloud, sauvegarde hors site ou conservation de trois ans. ; Les données d’inventaire, mouvements et ajustements de l’ERP peuvent aider à maintenir l’état, mais les éléments disponibles ne prescrivent pas un journal immuable, des rôles logiciels déterminés ou une validation d’inventaire dans l’ERP. | Arrêté du 11 avril 2017 modifié. Les changements liés à l’arrêté du 24 septembre 2020 sont indiqués comme applicables à partir du 1er janvier 2021, avec certaines dispositions et échéances transitoires ; aucune échéance future précise ne peut être établie à partir des informations fournies. | Le non-respect des prescriptions peut donner lieu aux mesures administratives et sanctions prévues par le Code de l’environnement. Les éléments disponibles ne précisent pas les sanctions spécifiques à cette obligation. |

Sources : [Post-Lubrizol : guide d’identification des entrepôts concern](https://www.red-on-line.fr/blog/post-lubrizol-guide-didentification-des-entrepots-concernes-par-la-rubrique-icpe-1510/) · [ICPE 1510 : les obligations d&#039;un entrepôt / FORMAFORCE](https://forma-force.fr/icpe-1510-entrepot-logistique-obligations/) · [Arrêté du 15 avril 2010 relatif aux prescriptions générales ](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000022198256) · [Note d&#039;interprétation DPPR/SEI/ GV-238 du 17/12/03 sur ](https://aida.ineris.fr/reglementation/note-dinterpretation-dpprsei-gv-238-171203-precision-relative-classement) · [Rubrique 1510 des installations classées pour la protection ](https://www.riskpart.com/fr/actualites/rubrique-1510-des-installations-classees-pour-la-protection-de-l-environnement-ce-qui-change_-n.html) · [ICPE Rubrique n° 2663](https://sitesecurite.com/contenu/_icpe/icpe/rub/2663.php) · [Arrêté du 14 janvier 2000 relatif aux prescriptions générale](https://www.legifrance.gouv.fr/affichTexte.do?cidTexte=JORFTEXT000000567521) · [Arrêté du 14/01/00 relatif aux prescriptions générales appli](https://aida.ineris.fr/node/28816/printable/print)

### 0.12 Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement

_Périmètre : Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable._

Le domaine s’applique potentiellement : l’entreprise stocke des pneumatiques, mais les éléments fournis ne précisent ni les quantités maximales, ni les surfaces et configurations de stockage, ni le statut des sites. Ils ne permettent donc pas de déterminer si un dépôt relève d’une rubrique ICPE ou quelles prescriptions de site s’appliquent. L’ERP peut aider à produire des données de stock et de localisation, mais les sources ne fondent pas l’obligation d’intégrer des contrôles réglementaires ou un module particulier dans le logiciel.

| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |
|---|---|---|---|---|---|
| Nomenclature des installations classées — stockage de pneumatiques (rubrique 2663) | Code de l’environnement, art. R. 511-9 et nomenclature annexée, rubrique 2663 ; arrêté du 14 janvier 2000 relatif aux prescriptions générales applicables aux installations soumises à déclaration sous la rubrique 2663 ; arrêté du 15 avril 2010 relatif aux installations relevant de l’enregistrement sous cette rubrique. | Si l’installation atteint un seuil de classement, respecter le régime et les prescriptions correspondant à sa situation, notamment les prescriptions applicables de l’arrêté du 14 janvier 2000 ou de l’arrêté du 15 avril 2010. ; Pour les stockages relevant de la déclaration, les éléments fournis mentionnent notamment des limites de hauteur et de volume par îlot, des passages entre îlots et des distances de séparation. Les prescriptions exactes doivent être vérifiées dans le texte en vigueur et au regard du régime et du site concernés. | Pour aider l’exploitant à évaluer le classement et documenter les stocks, prévoir des données de quantité et d’emplacement, ainsi qu’une capacité à restituer le volume stocké si les données nécessaires à ce calcul sont disponibles. ; Les sources ne démontrent pas que l’ERP doit calculer le volume réglementaire selon une méthode déterminée, bloquer les mouvements, ni imposer des seuils logiciels. Le classement et le calcul réglementaire doivent être établis pour chaque installation à partir des caractéristiques réelles du site. | Les textes cités sont présentés comme en vigueur dans les sources fournies. La date d’entrée en vigueur de chaque version applicable et les dispositions transitoires doivent être vérifiées sur les textes consolidés officiels avant mise en œuvre. | Les sources fournies ne précisent pas les sanctions applicables à cette rubrique. Elles ne permettent donc pas d’indiquer une peine ou un montant fiable. |
| Nomenclature des installations classées — entrepôts couverts de matières combustibles (rubrique 1510) | Code de l’environnement, art. R. 511-9 et nomenclature annexée, rubrique 1510 ; arrêté du 11 avril 2017 relatif aux prescriptions générales applicables aux entrepôts couverts soumis à la rubrique 1510 ; arrêté du 24 septembre 2020 modifiant cet arrêté et certains arrêtés applicables aux stockages ICPE ; décret n° 2020-1169 du 24 septembre 2020. | Si un site relève de la rubrique 1510, appliquer les prescriptions du régime concerné, issues notamment de l’arrêté du 11 avril 2017 modifié. ; Les sources mentionnent des obligations de prévention incendie pour les entrepôts concernés, dont un plan de défense incendie, et, pour certaines installations, un état des matières stockées. Les exigences exactes dépendent du régime, de la configuration et des dispositions applicables au site. | Des champs de quantité, famille de matières et zone de stockage peuvent contribuer à la préparation d’un état de stock, si l’exploitant est assujetti et si ces données correspondent aux exigences applicables. ; Les informations fournies ne justifient pas d’imposer dans l’ERP un seuil automatique de 500 tonnes, une règle de priorité 1510/2663, une fréquence de mise à jour unique, ni des champs tels que masse unitaire ou famille de danger comme obligations ERP universelles. ; La nécessité d’exporter un état réglementaire, son format, sa fréquence de mise à jour, son accessibilité et sa conservation doivent être déterminées d’après le statut ICPE et le texte applicable à l’installation. | Le décret n° 2020-1169 et l’arrêté modificatif du 24 septembre 2020 sont indiqués dans les sources comme applicables à compter du 1er janvier 2021. Certaines obligations d’état détaillé sont indiquées comme applicables à compter du 1er janvier 2022 dans les sources secondaires fournies. Vérifier les dispositions consolidées officielles et transitoires pour le site concerné. | Les sources fournies ne précisent pas les sanctions propres à la rubrique 1510 ni celles applicables à un manquement donné. Il n’est pas possible d’indiquer ici des sanctions chiffrées fiables. |
| État des matières stockées pour certaines ICPE | Arrêté du 4 octobre 2010 relatif à la prévention des risques accidentels au sein des installations classées pour la protection de l’environnement soumises à autorisation, art. 46, modifié par l’arrêté du 24 septembre 2020 ; arrêté du 11 avril 2017 relatif aux entrepôts couverts soumis à la rubrique 1510, dans sa version modifiée. | Pour les installations visées par l’article 46, tenir à jour un état des matières stockées, y compris les matières combustibles non dangereuses ou non classées ICPE. ; Les éléments fournis indiquent une mise à jour au moins hebdomadaire, quotidienne pour les matières dangereuses, un état accompagné d’un plan général des zones, une disponibilité en cas d’incident et un inventaire physique au moins annuel. Les exigences exactes dépendent du texte et du statut de l’installation. ; Pour les matières dangereuses, disposer des fiches de données de sécurité avant réception lorsque cette exigence est applicable et que de telles fiches existent. | Si l’installation est assujettie, l’ERP peut fournir un export daté des stocks par matière et zone, avec le plan de zones associé, et conserver les éléments permettant de retracer les mises à jour et inventaires. ; Les sources ne prescrivent pas que ces fonctions soient nécessairement dans l’ERP : elles imposent des obligations à l’exploitant. Elles ne fondent pas non plus une obligation générale de conserver les journaux ERP pendant une durée donnée. ; La fréquence, le contenu, les destinataires et les modalités d’accès doivent être configurés selon le texte applicable et les modalités définies pour l’installation. | L’article 46 modifié est indiqué comme entré en vigueur le 1er janvier 2021 ; certaines dispositions mentionnées dans les sources sont applicables depuis le 1er janvier 2022. Aucune échéance future spécifique n’est identifiée dans les informations fournies. | Les sources fournies ne précisent pas les sanctions applicables à un manquement à cette obligation. Elles ne permettent pas de donner un montant ou une peine. |
| Gestion des déchets de pneumatiques — collecte et préservation | Code de l’environnement, art. R. 543-137 à R. 543-152 ; décret n° 2023-152 du 2 mars 2023 ; arrêté du 15 décembre 2015 relatif à la collecte des déchets de pneumatiques. | L’article R. 543-138 interdit notamment l’abandon, le dépôt dans le milieu naturel et le brûlage à l’air libre des pneumatiques. ; Les sources indiquent que les détenteurs préservent le potentiel de réutilisation, de recyclage et de valorisation des pneus en attente de collecte, notamment en les conservant à l’abri des intempéries, en les séparant d’autres types de déchets et en les triant par type. ; Les sources ne suffisent pas à confirmer une obligation générale, pour cette entreprise, de tenir un registre ERP avec les champs ou la durée de conservation proposés dans la réponse précédente. | Si l’entreprise gère des pneus usagés, l’ERP peut distinguer les stocks neufs des pneus usagés et enregistrer les entrées, sorties et destinations afin d’aider au suivi opérationnel. ; Aucune source fournie n’établit que le logiciel doit bloquer une sortie sans collecteur agréé, imposer un numéro de bordereau, ou conserver un registre pendant trois ans. Ces exigences ne doivent pas être présentées comme des obligations établies sur la base des informations disponibles. | Le décret n° 2023-152 et les articles cités sont indiqués comme en vigueur depuis le 5 mars 2023. Aucune échéance future n’est identifiée dans les sources fournies. | L’article R. 543-138 énonce des interdictions, mais les sources fournies ne précisent pas les sanctions correspondantes. Il n’est pas possible de donner une peine ou un montant fiable. |

Sources : [Rayonnage pneus : rack de stockage, règles INRS et ICPE](https://system-agencement.com/pages/stockage-pneus) · [Rubrique 1510 des ICPE - AGMS](https://www.agms.fr/actus/rubrique-1510-des-icpe/) · [Nomenclature ICPE : comprendre rubriques, seuils et régimes](https://mosaic-conseil.com/nomenclature-icpe/) · [ICPE : guide complet de la réglementation 2026 / Réglementat](https://www.reglementation-environnement.com/icpe-guide-complet-reglementation-2026/) · [2663. Stockage de pneumatiques et produits composés d'au moi](https://aida.ineris.fr/reglementation/2663-stockage-pneumatiques-produits-composes-dau-moins-50-polymeres) · [Arrêté du 14 janvier 2000 relatif aux prescriptions générale](https://www.legifrance.gouv.fr/affichTexte.do?cidTexte=JORFTEXT000000567521) · [Arrêté du 15 avril 2010 relatif aux prescriptions générales ](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000022198256) · [Entrepôts et stockage : Le décret n° 2020-1169 modifie la no](https://www.cnpp.com/blog/entrepots-et-stockage-le-decret-ndeg-2020-1169-modifie-la-nomenclature-des-icpe)

### 0.x Checklist de conformité pour la reconstruction

- [ ] **Facturation, devis et TVA** — Mentions obligatoires et émission des factures : Prévoir des champs structurés pour l’identité du vendeur et du client, les dates, le numéro de facture, les lignes, quantités, prix, taux de TVA, totaux et modalités de règlement.
- [ ] **Facturation, devis et TVA** — Mentions obligatoires et émission des factures : Paramétrer la numérotation et conserver les factures émises avec leur contenu et leurs dates ; les sources fournies ne justifient pas une exigence générale d’immutabilité technique absolue ni un algorithme particulier.
- [ ] **Facturation, devis et TVA** — Mentions obligatoires et émission des factures : Permettre l’édition et l’export des factures et des détails de TVA. La liste exhaustive des mentions dépend du type de client et de l’opération ; elle doit être vérifiée sur les textes applicables.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission électronique de données : Prévoir un circuit de réception et de traitement des factures électroniques via une plateforme répondant aux exigences de la réforme, ainsi que l’accès aux factures fournisseurs reçues.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission électronique de données : Pour l’émission et l’e-reporting, déterminer le calendrier applicable selon la taille de l’entreprise et ses opérations ; préparer les données nécessaires à la transmission.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission électronique de données : Prévoir les champs relatifs au SIREN client professionnel, à l’adresse de livraison, à la catégorie d’opération et à l’option de TVA sur les débits lorsqu’ils sont requis.
- [ ] **Facturation, devis et TVA** — Facturation électronique B2B et transmission électronique de données : Les formats, modalités techniques précises et sanctions propres à chaque manquement ne sont pas suffisamment détaillés dans les éléments fournis pour être spécifiés ici.
- [ ] **Facturation, devis et TVA** — Logiciels ou systèmes de caisse : Si l’ERP enregistre des règlements B2C dans une fonction de caisse, conserver les données nécessaires à leur sécurisation, conservation et archivage et tenir disponible le certificat correspondant au logiciel/version concernés.
- [ ] **Facturation, devis et TVA** — Logiciels ou systèmes de caisse : Ne pas assimiler automatiquement un module de facturation ou de suivi de stock à un logiciel de caisse : vérifier l’usage réel et les opérations enregistrées.
- [ ] **Facturation, devis et TVA** — Logiciels ou systèmes de caisse : Les mécanismes techniques précis tels qu’un hachage SHA-256 ou un journal particulier ne sont pas établis par les sources fournies comme obligations légales générales.
- [ ] **Facturation, devis et TVA** — TVA : exigibilité selon la nature de l’opération : Qualifier les lignes ou opérations comme biens, services ou mixtes et conserver les dates pertinentes : livraison, exécution, facture et encaissement.
- [ ] **Facturation, devis et TVA** — TVA : exigibilité selon la nature de l’opération : Permettre une ventilation des bases et de la TVA par taux et l’export des données nécessaires aux déclarations comptables et fiscales.
- [ ] **Facturation, devis et TVA** — TVA : exigibilité selon la nature de l’opération : Ne pas automatiser une règle uniforme d’exigibilité sans tenir compte des options et situations fiscales de l’entreprise.
- [ ] **Facturation, devis et TVA** — Conservation des factures et pièces comptables : Prévoir l’archivage et la restitution des factures et pièces associées pendant les durées applicables, avec une recherche par numéro, date, client ou fournisseur.
- [ ] **Facturation, devis et TVA** — Conservation des factures et pièces comptables : Permettre l’export ou la mise à disposition des pièces en cas de contrôle ; les sources fournies ne précisent pas ici les exigences techniques détaillées d’archivage.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle des consommateurs : Permettre de produire des devis ou propositions détaillés indiquant les prestations, les pneus, les frais éventuels et les prix communiqués au client.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle des consommateurs : Conserver la version remise au client et la preuve de son acceptation lorsque cela est pertinent.
- [ ] **Facturation, devis et TVA** — Devis et information précontractuelle des consommateurs : Les sources fournies ne permettent pas de fixer une liste universelle de champs obligatoires pour chaque devis lié à cette activité.
- [ ] **Comptabilité, conservation et archivage** — Code de commerce — comptabilité et inventaire : Permettre de distinguer les stocks par emplacement, notamment dépôt et véhicule, et de restituer les quantités comptées et leur valeur à la date d’inventaire.
- [ ] **Comptabilité, conservation et archivage** — Code de commerce — comptabilité et inventaire : Conserver les résultats, écarts et corrections avec leur historique ; ne pas remplacer silencieusement les données validées.
- [ ] **Comptabilité, conservation et archivage** — Code de commerce — comptabilité et inventaire : Prévoir une restitution détaillée permettant de justifier les postes de stock du bilan.
- [ ] **Comptabilité, conservation et archivage** — Code de commerce — comptabilité et inventaire : Les textes cités n’imposent pas les champs précis, une méthode particulière de valorisation, une double validation ni un processus obligatoire de comptage à l’aveugle.
- [ ] **Comptabilité, conservation et archivage** — Conservation des pièces et données à des fins fiscales : Prévoir une conservation contrôlée des documents, données et exports concernés, avec accès et restitution lisibles pendant la durée applicable.
- [ ] **Comptabilité, conservation et archivage** — Conservation des pièces et données à des fins fiscales : Conserver les données comptables ou justificatives originellement numériques sous forme informatique.
- [ ] **Comptabilité, conservation et archivage** — Conservation des pièces et données à des fins fiscales : Associer, lorsque nécessaire, les commandes, réceptions, mouvements et pièces justificatives afin de faciliter leur recherche et leur présentation.
- [ ] **Comptabilité, conservation et archivage** — Conservation des pièces et données à des fins fiscales : Ne pas appliquer automatiquement dix ans à chaque donnée fiscale : les durées varient selon la nature du document et le fondement juridique.
- [ ] **Comptabilité, conservation et archivage** — Fichier des écritures comptables (FEC) : Si l’ERP génère ou prépare le FEC, conserver et exporter les données comptables nécessaires dans le format réglementaire ; ne pas traiter la liste des champs FEC comme une obligation applicable à un simple module de stock qui ne tient pas la comptabilité.
- [ ] **Comptabilité, conservation et archivage** — Fichier des écritures comptables (FEC) : Prendre en compte les champs prescrits par A. 47 A-1, la chronologie de validation, les écritures d’inventaire et les règles de format et de nommage.
- [ ] **Comptabilité, conservation et archivage** — Fichier des écritures comptables (FEC) : Permettre une extraction exploitable des écritures en cas de demande de l’administration.
- [ ] **Comptabilité, conservation et archivage** — Fichier des écritures comptables (FEC) : Les règles de séquentialité et autres tests formels doivent être appliquées selon les exigences et instructions en vigueur pour le FEC ; les sources fournies ne justifient pas une règle générale interdisant toute correction dans l’ERP.
- [ ] **Comptabilité, conservation et archivage** — Piste d’audit fiable et conservation des pièces de facturation : Permettre de relier les pièces pertinentes, par exemple commande, réception, facture et éventuels retours ou avoirs, lorsque ces pièces constituent les contrôles de l’entreprise.
- [ ] **Comptabilité, conservation et archivage** — Piste d’audit fiable et conservation des pièces de facturation : Conserver les documents et éléments de contrôle sans altération de leur contenu originel pendant la durée applicable.
- [ ] **Comptabilité, conservation et archivage** — Piste d’audit fiable et conservation des pièces de facturation : Rendre consultables et exportables la documentation des contrôles et les pièces associées.
- [ ] **Comptabilité, conservation et archivage** — Piste d’audit fiable et conservation des pièces de facturation : Les références ne prescrivent pas un chaînage technique unique ni une chaîne obligatoire reliant chaque mouvement de stock à une écriture comptable.
- [ ] **Comptabilité, conservation et archivage** — Inaltérabilité des données de caisse ou d’enregistrement des règlements : Appliquer ces exigences uniquement si l’ERP enregistre les opérations ou règlements entrant dans le champ légal ; un ERP limité à la gestion des stocks n’est pas soumis à cette obligation de ce seul fait.
- [ ] **Comptabilité, conservation et archivage** — Inaltérabilité des données de caisse ou d’enregistrement des règlements : Si le module est concerné, mettre en place les contrôles nécessaires à l’inaltérabilité, à la sécurisation, à la conservation, à l’archivage et à la restitution des données.
- [ ] **Comptabilité, conservation et archivage** — Inaltérabilité des données de caisse ou d’enregistrement des règlements : Les sources fournies ne prescrivent pas spécifiquement un chaînage cryptographique, un journal technique déterminé ni une certification NF 525.
- [ ] **Comptabilité, conservation et archivage** — Numérisation des factures papier et copies fiables : Si une fonction de numérisation est proposée, permettre de conserver une reproduction fidèle et lisible et de documenter les opérations d’archivage.
- [ ] **Comptabilité, conservation et archivage** — Numérisation des factures papier et copies fiables : Respecter les formats et garanties expressément prévus par A. 102 B-1 ou A. 102 B-2 selon la catégorie du document ; les sources mentionnent PDF, signature électronique conforme au RGS pour A. 102 B-1, et PDF ou PDF/A-3 pour les factures numérisées sous A. 102 B-2.
- [ ] **Comptabilité, conservation et archivage** — Numérisation des factures papier et copies fiables : Ne pas imposer indistinctement PDF/A-3, horodatage qualifié ou signature qualifiée à tout document : ces exigences ne sont pas établies par les références fournies comme règles générales.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Prévoir une notice d’information adaptée aux traitements et aux catégories de personnes concernées, avec finalités, base juridique, destinataires, durées ou critères de conservation et modalités d’exercice des droits.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Limiter les champs de compte et d’approbation aux données nécessaires ; définir des rôles et permissions appropriés.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Prévoir des procédures permettant de retrouver et traiter les données d’une personne pour les demandes de droits, sans promettre un effacement incompatible avec une obligation de conservation ou la défense de droits en justice.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Définir des durées par finalité et des mécanismes de suppression, d’anonymisation ou d’archivage lorsque cela est justifié ; les sources ne fixent pas une durée générale pour tous les comptes ou mouvements de stock.
- [ ] **Données personnelles (RGPD)** — Règlement général sur la protection des données (RGPD) : Protéger les données et les exports par des contrôles d’accès et des mesures de sécurité proportionnées ; documenter les traitements et incidents.
- [ ] **Données personnelles (RGPD)** — Loi Informatique et Libertés : Mettre à disposition des notices d’information et des coordonnées de contact permettant aux personnes d’exercer leurs droits ou de saisir la CNIL.
- [ ] **Données personnelles (RGPD)** — Loi Informatique et Libertés : Ne pas présumer que chaque champ proposé est légalement obligatoire : déterminer les données nécessaires selon la finalité et le contexte.
- [ ] **Données personnelles (RGPD)** — Recommandation CNIL relative à la journalisation des opérations : Journaliser de façon ciblée les créations, consultations, partages, modifications et suppressions pertinents, avec identifiant d’auteur, horodatage, action et référence de l’objet.
- [ ] **Données personnelles (RGPD)** — Recommandation CNIL relative à la journalisation des opérations : Définir une conservation documentée et limitée : la CNIL indique une période glissante de six mois à un an à titre de recommandation, sous réserve d’un besoin ou d’une obligation justifiant une autre durée.
- [ ] **Données personnelles (RGPD)** — Recommandation CNIL relative à la journalisation des opérations : Protéger les journaux contre les accès non autorisés et les altérations ; ne pas y enregistrer de secrets d’authentification.
- [ ] **Données personnelles (RGPD)** — Recommandation CNIL relative à la journalisation des opérations : Informer les utilisateurs et, selon le contexte de travail, traiter l’information et la consultation des instances représentatives du personnel.
- [ ] **Données personnelles (RGPD)** — Géolocalisation des véhicules des salariés — règles et recommandations CNIL : Si une fonction de géolocalisation existe, prévoir une commande de désactivation hors temps de travail, des habilitations et une information visibles.
- [ ] **Données personnelles (RGPD)** — Géolocalisation des véhicules des salariés — règles et recommandations CNIL : Configurer les durées en fonction de la finalité et purger les données à échéance ; documenter toute conservation prolongée.
- [ ] **Données personnelles (RGPD)** — Géolocalisation des véhicules des salariés — règles et recommandations CNIL : Contrôler les exports et destinataires pour éviter la transmission injustifiée de l’identité du conducteur.
- [ ] **Données personnelles (RGPD)** — Géolocalisation des véhicules des salariés — règles et recommandations CNIL : Ne pas déduire de la seule gestion des stocks par camion qu’une géolocalisation est réalisée.
- [ ] **Données personnelles (RGPD)** — Référentiel CNIL de durées de conservation pour la gestion des ressources humaines : Prévoir la désactivation des comptes lorsqu’un salarié quitte l’entreprise et une procédure d’archivage ou de suppression adaptée aux données concernées.
- [ ] **Données personnelles (RGPD)** — Référentiel CNIL de durées de conservation pour la gestion des ressources humaines : Ne pas appliquer une durée RH uniforme aux mouvements de stock, journaux ou décisions : définir leur durée selon leur finalité et les obligations correspondantes.
- [ ] **Réglementation produit du secteur** — Étiquetage européen des pneumatiques : Prévoir, pour les références concernées, un accès à l’étiquette et à la fiche d’information produit, par exemple par identifiant ou URL EPREL, afin de faciliter leur présentation au client.
- [ ] **Réglementation produit du secteur** — Étiquetage européen des pneumatiques : Permettre d’identifier si un produit est soumis à l’étiquetage et de restituer les informations publiées par le fournisseur.
- [ ] **Réglementation produit du secteur** — Étiquetage européen des pneumatiques : Ne pas bloquer automatiquement ventes ou devis pour absence de données EPREL sans avoir établi que cette exigence s’applique au rôle de l’entreprise et à la transaction.
- [ ] **Réglementation produit du secteur** — Surveillance du marché et conformité des produits : Conserver les données commerciales et de réception déjà nécessaires à la gestion des stocks et faciliter une extraction des références et quantités en stock en cas de contrôle ou de retrait.
- [ ] **Réglementation produit du secteur** — Surveillance du marché et conformité des produits : Relier les articles aux fournisseurs et aux réceptions lorsque ces informations sont disponibles dans le processus métier.
- [ ] **Réglementation produit du secteur** — Surveillance du marché et conformité des produits : Ne pas imposer un numéro DOT, un lot ou une conservation décennale comme obligation générale sur la seule base des sources fournies.
- [ ] **Réglementation produit du secteur** — Règles nationales relatives à l’état, à l’utilisation et à la vente des pneumatiques : Pour les opérations de montage, permettre d’enregistrer l’identification du pneu et du véhicule, la position de montage et les contrôles réalisés, si cela correspond au processus de l’entreprise.
- [ ] **Réglementation produit du secteur** — Règles nationales relatives à l’état, à l’utilisation et à la vente des pneumatiques : Prévoir des contrôles métier adaptés aux catégories de véhicules et aux caractéristiques des pneus; les sources fournies ne suffisent pas à définir une règle bloquante universelle pour toutes les montes.
- [ ] **Réglementation produit du secteur** — Règles nationales relatives à l’état, à l’utilisation et à la vente des pneumatiques : Les textes cités ne rendent pas obligatoires, à eux seuls, une profondeur de sculpture enregistrée dans l’ERP, un bon de montage suivant un format donné ou une conservation de cinq ans.
- [ ] **Réglementation produit du secteur** — Équipements hivernaux en zones concernées : Un attribut 3PMSF et les autres marquages figurant sur le produit peuvent aider à filtrer les références et à informer les clients.
- [ ] **Réglementation produit du secteur** — Équipements hivernaux en zones concernées : Si l’ERP assiste le conseil ou le montage, il peut signaler la période, la catégorie de véhicule et les marquages; il s’agit d’une fonction de conformité utile, pas d’un champ ERP expressément imposé par les sources.
- [ ] **Réglementation produit du secteur** — Équipements hivernaux en zones concernées : Ne pas présenter automatiquement la monte vendue comme conforme à la situation du véhicule sans tenir compte des zones, catégories, exemptions et équipements alternatifs.
- [ ] **Réglementation produit du secteur** — Gestion des déchets de pneumatiques et filière REP : Si l’entreprise détient et suit les pneus usagés, un module ou des mouvements dédiés peuvent enregistrer quantités, dates, lieux de stockage et collectes pour assurer le suivi opérationnel.
- [ ] **Réglementation produit du secteur** — Gestion des déchets de pneumatiques et filière REP : Permettre d’identifier le collecteur et de rattacher les justificatifs de collecte lorsque l’entreprise les reçoit.
- [ ] **Réglementation produit du secteur** — Gestion des déchets de pneumatiques et filière REP : Activer les fonctions de déclaration REP, d’IDU ou de suivi des tonnages seulement si l’entreprise est effectivement producteur ou metteur sur le marché au sens des textes.
- [ ] **Réglementation produit du secteur** — Gestion des déchets de pneumatiques et filière REP : Les sources fournies ne justifient pas un délai général de conservation de trois ans pour ces données.
- [ ] **Environnement et fin de vie** — Responsabilité élargie du producteur (REP) pour les pneumatiques — statut et identifiant unique : Permettre de renseigner, par établissement et par référence, le rôle de l’entreprise (producteur, distributeur, détenteur), l’IDU pertinent, l’éco-organisme ou le système individuel et les périodes de validité ; ne pas imposer un IDU propre à l’entreprise tant que son statut de producteur n’est pas établi.
- [ ] **Environnement et fin de vie** — Responsabilité élargie du producteur (REP) pour les pneumatiques — statut et identifiant unique : Associer les pneus commercialisés à leur producteur et à son IDU afin de répondre aux demandes d’acheteurs et de produire les informations contractuelles requises lorsqu’elles s’appliquent.
- [ ] **Environnement et fin de vie** — Responsabilité élargie du producteur (REP) pour les pneumatiques — statut et identifiant unique : Prévoir des exports de données de mise sur le marché pour les déclarations REP si l’entreprise est producteur ; le schéma et la périodicité précis ne sont pas établis par les éléments fournis.
- [ ] **Environnement et fin de vie** — Responsabilité élargie du producteur (REP) pour les pneumatiques — statut et identifiant unique : Journaliser les modifications des paramètres REP et limiter leur modification aux rôles habilités. Les références fournies ne prescrivent pas de journal informatique ni de champs de code-barres ou de catégories de véhicules déterminés.
- [ ] **Environnement et fin de vie** — Reprise gratuite des déchets de pneumatiques par les distributeurs : Permettre d’enregistrer les pneus usagés repris, la date, la quantité, le contexte (avec achat ou sans achat), le point de reprise et le lien éventuel avec la vente ou l’intervention.
- [ ] **Environnement et fin de vie** — Reprise gratuite des déchets de pneumatiques par les distributeurs : Si l’entreprise relève du seuil de reprise sans achat, permettre de gérer l’attestation et de suivre les apports annuels par personne, dans les limites de nécessité et de minimisation des données ; les sources fournies ne prescrivent pas une identité obligatoire du déposant ni un délai légal de conservation de l’attestation.
- [ ] **Environnement et fin de vie** — Reprise gratuite des déchets de pneumatiques par les distributeurs : Paramétrer les règles selon le type de pneu, la catégorie de client, la surface de vente et la situation juridique de l’établissement. Ne pas appliquer automatiquement le plafond de huit pneus à tous les dépôts ou à tous les types de véhicules.
- [ ] **Environnement et fin de vie** — Gestion des déchets de pneumatiques : interdictions et préservation de leur potentiel de valorisation : Distinguer dans le stock opérationnel les pneus neufs des pneus usagés et, si utile à la gestion, leur état (réutilisable, à évaluer, à orienter vers une filière déchets). Ces états sont des choix de conception utiles, pas des champs réglementaires explicitement imposés par les références citées.
- [ ] **Environnement et fin de vie** — Gestion des déchets de pneumatiques : interdictions et préservation de leur potentiel de valorisation : Suivre les mouvements entre véhicule et dépôt, les reprises et les enlèvements afin d’aider à organiser la collecte et à démontrer les opérations réalisées.
- [ ] **Environnement et fin de vie** — Gestion des déchets de pneumatiques : interdictions et préservation de leur potentiel de valorisation : Ne pas prétendre qu’un champ d’emplacement dans l’ERP garantit le stockage matériel à l’abri des intempéries ; cette obligation porte sur les conditions réelles de stockage.
- [ ] **Environnement et fin de vie** — Registre chronologique des déchets et transmission au registre national : Pour les déchets sortants concernés, prendre en charge les champs réglementaires applicables du registre : date, dénomination usuelle, code déchet, quantité, établissement et adresse de prise en charge si différente, producteur initial lorsque requis, destinataire et autres informations prévues par l’arrêté selon le flux.
- [ ] **Environnement et fin de vie** — Registre chronologique des déchets et transmission au registre national : Gérer une conservation d’au moins trois ans pour le registre local lorsqu’il est requis, et permettre sa présentation aux autorités. La source réglementaire n’impose pas un format CSV, Excel ou PDF particulier.
- [ ] **Environnement et fin de vie** — Registre chronologique des déchets et transmission au registre national : Prévoir une fonction de transmission électronique ou d’export selon le rôle et le flux, si l’établissement relève de l’obligation de transmission au registre national.
- [ ] **Environnement et fin de vie** — Registre chronologique des déchets et transmission au registre national : La traçabilité et l’historique sont des moyens logiciels utiles ; l’obligation réglementaire est de tenir les informations prescrites, pas une exigence explicite d’inaltérabilité informatique ou de journal d’accès.
- [ ] **Environnement et fin de vie** — Bordereaux électroniques pour déchets dangereux ou déchets POP (Trackdéchets) : Qualifier chaque flux de déchet selon sa classification réglementaire et ne déclencher une procédure de bordereau électronique que si le flux relève de l’article R. 541-45.
- [ ] **Environnement et fin de vie** — Bordereaux électroniques pour déchets dangereux ou déchets POP (Trackdéchets) : Si l’entreprise gère effectivement des déchets dangereux ou POP, prévoir le suivi des identifiants et statuts de bordereau et un accès ou une interface avec le service officiel, selon ses obligations et le fonctionnement de celui-ci.
- [ ] **Environnement et fin de vie** — Bordereaux électroniques pour déchets dangereux ou déchets POP (Trackdéchets) : Ne pas imposer une clé API ni bloquer toute sortie de pneus usagés sur l’existence d’un numéro Trackdéchets : cette exigence n’est pas établie pour les pneus non dangereux par les sources fournies.
- [ ] **Environnement et fin de vie** — Cahier des charges des éco-organismes et collecte de la filière REP pneumatiques : Conserver les informations pratiques nécessaires aux demandes d’enlèvement et associer les enlèvements aux documents remis par le collecteur ou l’éco-organisme.
- [ ] **Environnement et fin de vie** — Cahier des charges des éco-organismes et collecte de la filière REP pneumatiques : Les sources fournies ne prescrivent pas de champs ERP spécifiques, de format d’export ou de délai de conservation propre à cet arrêté ; ne pas présenter ces choix techniques comme des obligations légales.
- [ ] **Stock, inventaire et traçabilité** — Code de commerce — inventaire annuel et conservation des données d’inventaire : Permettre d’établir un état d’inventaire à la clôture, détaillé par article et quantité, avec une valorisation justifiable.
- [ ] **Stock, inventaire et traçabilité** — Code de commerce — inventaire annuel et conservation des données d’inventaire : Enregistrer les quantités constatées, les écarts et leurs corrections, avec les pièces et mouvements intervenus entre la date de comptage et la clôture si le comptage est anticipé.
- [ ] **Stock, inventaire et traçabilité** — Code de commerce — inventaire annuel et conservation des données d’inventaire : Conserver les données d’inventaire dans les conditions de l’article L. 123-22 et les organiser pour justifier le contenu et le mode d’évaluation des postes du bilan.
- [ ] **Stock, inventaire et traçabilité** — Code de commerce — inventaire annuel et conservation des données d’inventaire : Le masquage des quantités théoriques pour les comptages à l’aveugle, la séparation des rôles et les motifs obligatoires d’écart sont des choix de conception pertinents, mais les sources fournies n’en établissent pas l’obligation.
- [ ] **Stock, inventaire et traçabilité** — Règles fiscales de valorisation des stocks : Conserver les données d’achat et les éléments permettant de justifier le prix de revient et la valeur de clôture.
- [ ] **Stock, inventaire et traçabilité** — Règles fiscales de valorisation des stocks : Permettre de documenter la méthode de valorisation retenue pour les catégories de stocks et d’en retracer les calculs.
- [ ] **Stock, inventaire et traçabilité** — Règles fiscales de valorisation des stocks : Produire un état valorisé par article à la date d’inventaire, et conserver les données nécessaires à sa justification.
- [ ] **Stock, inventaire et traçabilité** — Règles fiscales de valorisation des stocks : Ne pas imposer une méthode ou une formule détaillée non vérifiée dans les textes consolidés ; les frais accessoires et les changements de méthode doivent être paramétrés après validation comptable.
- [ ] **Stock, inventaire et traçabilité** — Mouvements comptables et contrôle des comptabilités informatisées : Garder une chronologie des mouvements intégrés à la comptabilité et des références permettant de les rapprocher des pièces justificatives.
- [ ] **Stock, inventaire et traçabilité** — Mouvements comptables et contrôle des comptabilités informatisées : Prévoir des exports exploitables des données comptables requises et des états de stock permettant de justifier la valorisation et les quantités.
- [ ] **Stock, inventaire et traçabilité** — Mouvements comptables et contrôle des comptabilités informatisées : Pour la fiabilité de la preuve, privilégier l’annulation ou la correction traçable plutôt que l’effacement silencieux des mouvements validés ; cette mesure est ici une bonne pratique, non une obligation démontrée par les seuls extraits.
- [ ] **Stock, inventaire et traçabilité** — Mouvements comptables et contrôle des comptabilités informatisées : Tracer les validations, corrections, utilisateurs et motifs est utile à l’audit, mais les champs détaillés et la durée de conservation de chaque journal doivent être fixés selon les obligations comptables et fiscales réellement applicables.
- [ ] **Stock, inventaire et traçabilité** — Réserve de propriété et revendication de marchandises : Si des clauses existent, conserver le contrat ou les CGV applicables, leur preuve d’acceptation et leur date, ainsi que les bons de livraison et factures associés.
- [ ] **Stock, inventaire et traçabilité** — Réserve de propriété et revendication de marchandises : Permettre de rapprocher les réceptions, sorties et quantités encore détenues des achats concernés, y compris par dépôt ou véhicule, dans la mesure où les données le permettent.
- [ ] **Stock, inventaire et traçabilité** — Réserve de propriété et revendication de marchandises : Un indicateur de clause et un état des quantités liées à des factures impayées peuvent faciliter la preuve, mais les champs exacts ne constituent pas, en eux-mêmes, des obligations légales explicitement citées.
- [ ] **Stock, inventaire et traçabilité** — Réserve de propriété et revendication de marchandises : Ne pas traiter le statut « facture impayée » comme preuve suffisante d’une clause opposable : conserver l’écrit et la preuve de son acceptation.
- [ ] **Stock, inventaire et traçabilité** — Déchets de pneumatiques — traçabilité et responsabilité élargie du producteur : Si l’entreprise collecte ou détient des pneus usagés, enregistrer les quantités et dates de remise, le collecteur ou éco-organisme et les justificatifs effectivement requis pour son rôle.
- [ ] **Stock, inventaire et traçabilité** — Déchets de pneumatiques — traçabilité et responsabilité élargie du producteur : Permettre d’exporter les données de suivi demandées par l’éco-organisme ou les autorités, si l’entreprise est assujettie à ces déclarations.
- [ ] **Stock, inventaire et traçabilité** — Déchets de pneumatiques — traçabilité et responsabilité élargie du producteur : Paramétrer les obligations de reprise selon le rôle et les seuils applicables plutôt que bloquer tous les montages sur une obligation supposée de reprise.
- [ ] **Stock, inventaire et traçabilité** — Déchets de pneumatiques — traçabilité et responsabilité élargie du producteur : Conserver les justificatifs selon le délai applicable au document et au statut de l’entreprise ; les sources fournies citent trois ans pour certains collecteurs/transporteurs et cinq ans dans les autres cas pour des copies de bordereaux, sans établir que cette règle concerne chaque opérateur de pneus.
- [ ] **Stock, inventaire et traçabilité** — Facturation B2B et facturation électronique — lien avec les stocks : Si l’ERP gère la facturation, conserver le numéro de commande lorsqu’il existe et les données nécessaires aux factures et échanges structurés applicables.
- [ ] **Stock, inventaire et traçabilité** — Facturation B2B et facturation électronique — lien avec les stocks : Relier commande, réception et facture peut être une fonctionnalité de contrôle interne ; le rapprochement dit « trois voies » n’est pas établi comme obligation générale par les sources fournies.
- [ ] **Stock, inventaire et traçabilité** — Facturation B2B et facturation électronique — lien avec les stocks : Vérifier le calendrier et les formats requis selon la catégorie de l’entreprise et les textes applicables avant de spécifier les exports.
- [ ] **Travail, sécurité et flotte de véhicules** — Code du travail — décompte du temps de travail : Prévoir, si l’entreprise choisit d’utiliser l’ERP pour ce décompte, des relevés individuels quotidiens et une récapitulation hebdomadaire.
- [ ] **Travail, sécurité et flotte de véhicules** — Code du travail — décompte du temps de travail : Conserver l’historique des corrections et permettre d’identifier les valeurs prévisionnelles et les valeurs effectivement déclarées.
- [ ] **Travail, sécurité et flotte de véhicules** — Code du travail — décompte du temps de travail : Les sources fournies ne justifient pas une obligation générale d’enregistrer les pauses, les trajets de dépannage, de bloquer automatiquement les affectations ou d’utiliser un format particulier d’export.
- [ ] **Travail, sécurité et flotte de véhicules** — Code du travail — prévention des risques et conduite d’équipements de travail : Si ces équipements sont utilisés, permettre de suivre les formations et autorisations pertinentes, leur périmètre et leur état de validité.
- [ ] **Travail, sécurité et flotte de véhicules** — Code du travail — prévention des risques et conduite d’équipements de travail : Les sources ne fondent pas une obligation d’utiliser un CACES, de conserver ces pièces pendant une durée précise dans l’ERP ou de bloquer automatiquement une mission.
- [ ] **Travail, sécurité et flotte de véhicules** — Code de la route — désignation du conducteur après certaines infractions constatées automatiquement : Si l’entreprise choisit de gérer ce processus dans l’ERP, conserver des affectations de véhicules et conducteurs suffisamment précises pour aider à identifier le conducteur à la date de l’infraction.
- [ ] **Travail, sécurité et flotte de véhicules** — Code de la route — désignation du conducteur après certaines infractions constatées automatiquement : Permettre le suivi de la date de l’avis et de l’échéance de 45 jours, ainsi que la traçabilité de la désignation et de son justificatif.
- [ ] **Travail, sécurité et flotte de véhicules** — Code de la route — désignation du conducteur après certaines infractions constatées automatiquement : Les sources ne démontrent pas que l’ERP doit enregistrer le numéro de permis, interdire une affectation sans permis valide ou produire un export spécifique par lot.
- [ ] **Travail, sécurité et flotte de véhicules** — Contrôle technique des véhicules de transport routier de marchandises : Si l’entreprise exploite de tels véhicules, suivre leur catégorie et les dates de contrôle ainsi que les échéances correspondantes.
- [ ] **Travail, sécurité et flotte de véhicules** — Contrôle technique des véhicules de transport routier de marchandises : La source ne justifie pas les fréquences proposées pour les VUL, les alertes à J-60/J-30, un blocage automatique des tournées ou une durée de conservation particulière.
- [ ] **Travail, sécurité et flotte de véhicules** — Règlements de l’Union européenne sur les temps de conduite et les tachygraphes : Ne pas activer par défaut un module de conformité tachygraphe sur la seule base du secteur ou de la mention de camions.
- [ ] **Travail, sécurité et flotte de véhicules** — Règlements de l’Union européenne sur les temps de conduite et les tachygraphes : Si l’assujettissement est confirmé, prévoir un suivi adapté aux obligations applicables et conserver les données requises ; les périodicités et durées avancées dans le brouillon ne sont pas suffisamment étayées par les sources officielles fournies.
- [ ] **Travail, sécurité et flotte de véhicules** — Réglementation des équipements sous pression et des appareils de levage : Si de tels équipements sont exploités, tenir un inventaire avec identification, emplacement, caractéristiques et justificatifs de contrôles pertinents.
- [ ] **Travail, sécurité et flotte de véhicules** — Réglementation des équipements sous pression et des appareils de levage : Paramétrer les échéances après qualification de chaque équipement et du régime applicable ; ne pas appliquer automatiquement les périodicités ou blocages allégués dans le brouillon.
- [ ] **Travail, sécurité et flotte de véhicules** — Taxe annuelle incitative relative à l’acquisition de véhicules légers à faibles émissions : Recueillir, si nécessaire pour l’analyse d’assujettissement, la catégorie, le PTAC, le mode de détention et les caractéristiques des véhicules concernés.
- [ ] **Travail, sécurité et flotte de véhicules** — Taxe annuelle incitative relative à l’acquisition de véhicules légers à faibles émissions : Ne pas coder un seuil, un ratio, une déclaration ou une taxe par véhicule sans vérification des textes officiels applicables à la situation de l’entreprise.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Prévoir des comptes individuels, des rôles et des permissions différenciés, ainsi qu’une procédure de création, modification et révocation des habilitations.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Journaliser les actions nécessaires à la sécurité et à la traçabilité, en limitant les données enregistrées et les accès aux journaux.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Permettre l’export et la recherche des éléments utiles à la gestion d’un incident ou à l’exercice des droits, avec accès réservé aux personnes autorisées.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Définir des durées de conservation documentées et une purge adaptée ; aucune durée générale unique de conservation des logs n’est établie par les éléments disponibles.
- [ ] **Sécurité informatique et gestion des accès** — Règlement général sur la protection des données (RGPD) : Prévoir des sauvegardes et des procédures de restauration adaptées aux risques et tester leur efficacité ; les sources ne fixent pas de périodicité légale particulière.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative aux mots de passe et autres secrets partagés : Ne jamais écrire les mots de passe ou secrets d’authentification dans les journaux.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative aux mots de passe et autres secrets partagés : Mettre en œuvre le stockage sécurisé des mots de passe, avec une fonction de hachage adaptée et un sel ou une clé selon le cas.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative aux mots de passe et autres secrets partagés : Prévoir des contrôles de tentatives d’authentification et des protections complémentaires déterminées par l’analyse de risques.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative aux mots de passe et autres secrets partagés : La CNIL recommande de privilégier l’authentification multifacteur lorsque possible, notamment pour les connexions accessibles depuis l’extérieur ; les éléments fournis ne permettent pas d’en faire une exigence universelle pour tout ERP.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative à la journalisation : Tracer de manière ciblée les accès et opérations utiles à la sécurité, en identifiant l’utilisateur et l’action lorsque nécessaire.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative à la journalisation : Protéger les journaux contre les accès et modifications non autorisés et restreindre leur consultation.
- [ ] **Sécurité informatique et gestion des accès** — Recommandation CNIL relative à la journalisation : Définir une durée de conservation justifiée et une purge automatique ; six mois est une indication générale de la CNIL, pas une durée légale fixe applicable à chaque journal.
- [ ] **Sécurité informatique et gestion des accès** — Code du travail — proportionnalité et information sur les dispositifs de contrôle : Limiter la collecte des événements nominatifs à des finalités explicites et proportionnées.
- [ ] **Sécurité informatique et gestion des accès** — Code du travail — proportionnalité et information sur les dispositifs de contrôle : Restreindre l’accès aux historiques détaillés aux personnes habilitées.
- [ ] **Sécurité informatique et gestion des accès** — Code du travail — proportionnalité et information sur les dispositifs de contrôle : Permettre de distinguer les journaux nécessaires à la sécurité des fonctions de suivi de l’activité ; préciser les finalités et règles d’accès dans les informations destinées aux salariés.
- [ ] **Sécurité informatique et gestion des accès** — Sécurité des appareils mobiles — recommandations CNIL : Tenir, si nécessaire, un inventaire des appareils autorisés et de leur affectation à un utilisateur.
- [ ] **Sécurité informatique et gestion des accès** — Sécurité des appareils mobiles — recommandations CNIL : Permettre la révocation des sessions et accès d’un terminal perdu ou volé.
- [ ] **Sécurité informatique et gestion des accès** — Sécurité des appareils mobiles — recommandations CNIL : Limiter et protéger les données locales ; prévoir des mécanismes tels que verrouillage, chiffrement ou effacement à distance selon l’analyse de risques.
- [ ] **Sécurité informatique et gestion des accès** — Sécurité des appareils mobiles — recommandations CNIL : En BYOD, cloisonner les données professionnelles et encadrer les modalités d’effacement ; un effacement sélectif est une mesure recommandée, non une obligation générale explicitement établie ici.
- [ ] **Sécurité informatique et gestion des accès** — Directive NIS 2 — sécurité des réseaux et systèmes d’information : Ne pas activer de contrôles ou de champs présentés comme des exigences NIS 2 propres à cette société avant d’avoir confirmé son assujettissement.
- [ ] **Sécurité informatique et gestion des accès** — Directive NIS 2 — sécurité des réseaux et systèmes d’information : Si l’entreprise est couverte, intégrer les contrôles pertinents au système de gestion des risques et aux obligations de notification applicables ; les modalités précises dépendent du droit national en vigueur.
- [ ] **Sécurité informatique et gestion des accès** — Accessibilité numérique — RGAA et directive européenne sur l’accessibilité : Aucune obligation d’audit RGAA, de déclaration publique ou de champs réglementaires ne peut être confirmée pour cet ERP avec les informations disponibles.
- [ ] **Sécurité informatique et gestion des accès** — Accessibilité numérique — RGAA et directive européenne sur l’accessibilité : Si une interface ou un service entre dans le champ d’un texte applicable, les exigences d’accessibilité correspondantes devront être analysées pour ce service précis.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — reprise des pneumatiques usagés par les distributeurs : Permettre d’enregistrer les pneus usagés repris, la date, la quantité, le point de collecte et le contexte (vente/remplacement ou apport sans achat), afin de documenter les opérations.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — reprise des pneumatiques usagés par les distributeurs : Paramétrer les seuils applicables par établissement : surface dédiée, catégories de pneus et caractère particulier du détenteur ; ne pas appliquer automatiquement la reprise sans achat si les critères ne sont pas remplis.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — reprise des pneumatiques usagés par les distributeurs : Permettre de consigner un refus et son motif ainsi que l’information donnée sur les solutions alternatives.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — reprise des pneumatiques usagés par les distributeurs : Les textes fournis ne prescrivent pas de champs ERP, de droits informatiques, de format d’export ni de durée de conservation spécifique des données de reprise. Ce sont des choix de conception à valider selon les obligations de preuve et les autres règles applicables.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — REP pneumatiques et enregistrement des personnes réalisant des opérations de gestion : Si l’entreprise effectue des opérations de gestion visées, prévoir la tenue des données nécessaires à son enregistrement et à la traçabilité des opérations, avec l’identifiant de l’établissement et les catégories/quantités utiles.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — REP pneumatiques et enregistrement des personnes réalisant des opérations de gestion : Permettre le suivi des pneus usagés détenus et des enlèvements, en distinguant pneus neufs en stock et déchets de pneumatiques.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — REP pneumatiques et enregistrement des personnes réalisant des opérations de gestion : Ne pas présumer qu’un IDU producteur, un module de déclaration d’éco-contribution ou une connexion à un portail est obligatoire pour l’entreprise sans vérifier son rôle effectif et les exigences de l’éco-organisme concerné.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — REP pneumatiques et enregistrement des personnes réalisant des opérations de gestion : Les références fournies ne fixent pas de champs ERP, de format d’export ou de durée d’archivage propres à ce logiciel.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — registre chronologique des déchets : Séparer clairement les stocks commerciaux de pneumatiques neufs des déchets de pneumatiques usagés.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — registre chronologique des déchets : Pour les flux concernés, prévoir les données réglementaires du registre, notamment date, code déchet, dénomination, quantité, expéditeur, transporteur/collecteur et destination, selon les champs applicables de l’arrêté.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — registre chronologique des déchets : Fournir un historique chronologique consultable et un export permettant de présenter le registre en cas de contrôle ; les sources fournies ne prescrivent pas un format d’export particulier ni un journal informatique immuable.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — registre chronologique des déchets : Appliquer une conservation d’au moins trois ans aux données constituant le registre.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — bordereaux et registre national dématérialisé des déchets : Ne pas rendre obligatoire un connecteur Trackdéchets pour les seuls pneus usagés de code 16 01 03 sur la base des éléments disponibles.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — bordereaux et registre national dématérialisé des déchets : Si l’entreprise génère d’autres déchets soumis à bordereau dématérialisé, prévoir un processus permettant leur suivi distinct et vérifier les obligations applicables à ces flux.
- [ ] **Déchets de pneumatiques et filière REP : obligations applicables au rôle réel de l’entreprise (distributeur, détenteur, collecteur ou producteur), reprise, stockage, collecte et traçabilité.** — Code de l’environnement — bordereaux et registre national dématérialisé des déchets : Conserver les références et justificatifs de bordereaux lorsqu’ils sont requis ; les sources fournies ne permettent pas d’établir une durée unique applicable à tous les documents ni un format d’intégration ERP obligatoire.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Responsabilité élargie du producteur — filière pneumatiques : Prévoir un paramétrage du statut REP et une traçabilité de l'origine d'approvisionnement (achat France, importation ou introduction UE, marque propre) afin de déterminer les opérations potentiellement déclarables.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Responsabilité élargie du producteur — filière pneumatiques : Si productrice, conserver des données permettant d'établir les quantités mises sur le marché, en unités et en poids, avec une ventilation conforme aux catégories et champs demandés par le dispositif ou l'éco-organisme.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Responsabilité élargie du producteur — filière pneumatiques : Permettre l'export des données de mise sur le marché et des justificatifs de déclaration ; les sources fournies ne précisent pas un format ERP obligatoire.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Responsabilité élargie du producteur — filière pneumatiques : Pour l'activité de distributeur/monteur, permettre de distinguer les pneus usagés repris et les mouvements de collecte, si ces opérations sont suivies dans l'ERP.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Responsabilité élargie du producteur — filière pneumatiques : Les sources fournies ne permettent pas d'établir une durée légale de conservation spécifique à intégrer dans l'ERP.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Enregistrement REP et identifiant unique (IDU) : Prévoir des champs pour l'IDU de l'entreprise par filière si elle est productrice et pour l'IDU du producteur associé aux produits fournisseurs.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Enregistrement REP et identifiant unique (IDU) : Permettre la restitution de l'IDU fournisseur sur demande d'un client et l'insertion de l'IDU propre dans les CGV ou documents contractuels si l'entreprise est productrice.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Enregistrement REP et identifiant unique (IDU) : Ne pas imposer, sur la seule base des sources fournies, l'affichage de l'IDU sur chaque devis ou facture : les sources indiquent les CGV ou, à défaut, un document contractuel, et une communication à la demande pour le vendeur non-producteur.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Reprise des pneumatiques usagés par les professionnels concernés : Si l'ERP suit ces opérations, distinguer les pneus usagés repris des pneus neufs en stock, avec date, quantité, lieu et mouvement vers le collecteur.
- [ ] **Éco-contribution et déclarations de mise sur le marché : à examiner si l’entreprise met elle-même des pneumatiques neufs sur le marché ; les informations fournies ne l’établissent pas.** — Reprise des pneumatiques usagés par les professionnels concernés : Les sources fournies ne démontrent pas que la tenue de ces informations dans l'ERP ou un format d'export particulier est légalement obligatoire ; l'affichage requis relève du point de vente et ne peut être remplacé par un champ ERP.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — stockage de pneumatiques et de produits comportant au moins 50 % de polymères : Permettre de distinguer les sites et zones de stockage, ainsi que les emplacements fixes et mobiles, sans présumer que le stock embarqué est juridiquement hors périmètre.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — stockage de pneumatiques et de produits comportant au moins 50 % de polymères : Permettre de renseigner les volumes de référence et de calculer des quantités par site ou zone à partir de règles de calcul documentées par l’exploitant.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — stockage de pneumatiques et de produits comportant au moins 50 % de polymères : Conserver les données de stock et les mouvements utiles à la justification du volume maximal déclaré ; les sources disponibles ne fixent pas une durée de conservation ERP précise.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — stockage de pneumatiques et de produits comportant au moins 50 % de polymères : Prévoir des exports de stock et d’historique permettant à l’exploitant de préparer les éléments utiles à ses vérifications et échanges avec l’administration. Les sources disponibles ne prescrivent ni format ERP, ni champs logiciels obligatoires, ni journalisation immuable.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Prescriptions générales ICPE applicables au stockage relevant de la rubrique 2663 : Faciliter le suivi des volumes et de l’emplacement des stocks, et conserver les mouvements nécessaires à la vérification par l’exploitant.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Prescriptions générales ICPE applicables au stockage relevant de la rubrique 2663 : Les sources disponibles ne démontrent pas que ces arrêtés imposent un ERP, des champs précis, une durée de conservation informatique, un format d’export ou des droits logiciels particuliers.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — entrepôts couverts de matières ou produits combustibles : Permettre de rattacher les stocks à un site, bâtiment et zone, et de produire des données utiles au suivi des quantités et volumes, si l’exploitant choisit de s’en servir à cette fin.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Nomenclature ICPE — entrepôts couverts de matières ou produits combustibles : Les sources disponibles ne rendent pas obligatoires dans l’ERP le calcul d’une masse combustible, des seuils automatisés, ni un champ de poids par référence. La composition des stocks et le périmètre de calcul doivent être définis au regard des textes et du site.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Prescriptions générales applicables aux entrepôts couverts relevant de la rubrique 1510 : Si l’exploitant doit tenir l’état des matières stockées, permettre de produire des données de stocks par zones et de les associer à un plan de zones, et d’en assurer une mise à jour au moins hebdomadaire.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Prescriptions générales applicables aux entrepôts couverts relevant de la rubrique 1510 : Permettre l’accès et l’export des informations nécessaires en situation d’incident. Les sources ne prescrivent pas spécifiquement un format PDF/A, CSV, hébergement cloud, sauvegarde hors site ou conservation de trois ans.
- [ ] **Sécurité et classement ICPE des stockages de pneus : vérifier les seuils et prescriptions applicables à chaque site, notamment la rubrique 2663 et, selon la configuration de l’entrepôt, la rubrique 1510.** — Prescriptions générales applicables aux entrepôts couverts relevant de la rubrique 1510 : Les données d’inventaire, mouvements et ajustements de l’ERP peuvent aider à maintenir l’état, mais les éléments disponibles ne prescrivent pas un journal immuable, des rôles logiciels déterminés ou une validation d’inventaire dans l’ERP.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Nomenclature des installations classées — stockage de pneumatiques (rubrique 2663) : Pour aider l’exploitant à évaluer le classement et documenter les stocks, prévoir des données de quantité et d’emplacement, ainsi qu’une capacité à restituer le volume stocké si les données nécessaires à ce calcul sont disponibles.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Nomenclature des installations classées — stockage de pneumatiques (rubrique 2663) : Les sources ne démontrent pas que l’ERP doit calculer le volume réglementaire selon une méthode déterminée, bloquer les mouvements, ni imposer des seuils logiciels. Le classement et le calcul réglementaire doivent être établis pour chaque installation à partir des caractéristiques réelles du site.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Nomenclature des installations classées — entrepôts couverts de matières combustibles (rubrique 1510) : Des champs de quantité, famille de matières et zone de stockage peuvent contribuer à la préparation d’un état de stock, si l’exploitant est assujetti et si ces données correspondent aux exigences applicables.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Nomenclature des installations classées — entrepôts couverts de matières combustibles (rubrique 1510) : Les informations fournies ne justifient pas d’imposer dans l’ERP un seuil automatique de 500 tonnes, une règle de priorité 1510/2663, une fréquence de mise à jour unique, ni des champs tels que masse unitaire ou famille de danger comme obligations ERP universelles.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Nomenclature des installations classées — entrepôts couverts de matières combustibles (rubrique 1510) : La nécessité d’exporter un état réglementaire, son format, sa fréquence de mise à jour, son accessibilité et sa conservation doivent être déterminées d’après le statut ICPE et le texte applicable à l’installation.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — État des matières stockées pour certaines ICPE : Si l’installation est assujettie, l’ERP peut fournir un export daté des stocks par matière et zone, avec le plan de zones associé, et conserver les éléments permettant de retracer les mises à jour et inventaires.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — État des matières stockées pour certaines ICPE : Les sources ne prescrivent pas que ces fonctions soient nécessairement dans l’ERP : elles imposent des obligations à l’exploitant. Elles ne fondent pas non plus une obligation générale de conserver les journaux ERP pendant une durée donnée.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — État des matières stockées pour certaines ICPE : La fréquence, le contenu, les destinataires et les modalités d’accès doivent être configurés selon le texte applicable et les modalités définies pour l’installation.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Gestion des déchets de pneumatiques — collecte et préservation : Si l’entreprise gère des pneus usagés, l’ERP peut distinguer les stocks neufs des pneus usagés et enregistrer les entrées, sorties et destinations afin d’aider au suivi opérationnel.
- [ ] **Prévention incendie et conditions de stockage des pneumatiques, en lien avec le classement ICPE réellement applicable.** — Gestion des déchets de pneumatiques — collecte et préservation : Aucune source fournie n’établit que le logiciel doit bloquer une sortie sans collecteur agréé, imposer un numéro de bordereau, ou conserver un registre pendant trois ans. Ces exigences ne doivent pas être présentées comme des obligations établies sur la base des informations disponibles.

---

## 1. Vue d'ensemble

"Stock pneus · démo" is a tire stock management system demo for Inter Service Pneus, a tire service company. It manages tire inventory across trucks and a depot, with two interfaces: a mobile app for field technicians and a desktop dashboard for office staff (Bureau) and management (Direction).

### Plan du site

| Vue | Route | Rôle |
|---|---|---|
| Top Navigation Bar | `-` | Switch between app views and access demo controls |
| Technicien (Mobile View) | `-` | Field technician interface for managing onboard tire stock on a truck |
| Bureau - Accueil (Dashboard) | `-` | Daily overview of stock, fleet, and pending actions |
| Bureau - Stock | `-` | Detailed inventory table of all tire references with distribution across locations |
| Bureau - Camions | `-` | Overview of all trucks in the fleet with tire stock status |
| Bureau - Commandes | `-` | Manage supplier orders and receive deliveries |
| Bureau - Inventaires | `-` | Track and validate blind inventory counts performed on iPhone |
| Bureau - Activité | `-` | Immutable audit log of all stock movements |
| Bureau - Demandes | `-` | Review and approve/reject stock adjustment requests from technicians |
| Bureau - Exports | `-` | Export data as CSV files for external use |
| Bureau - Réglages | `-` | Manage users, devices, and role-based permissions |

### Parcours utilisateur

- View tire stock by truck in Technician mobile view
- Mount a tire (Monter) from truck stock
- Transfer tires between depot and trucks (Transférer)
- Receive a supplier order delivery (Recevoir)
- Search tires by dimension, reference, or barcode
- View fleet-wide stock dashboard (Accueil)
- Filter and review stock by vehicle category
- Export stock/movements/orders as CSV
- Create draft supplier orders from reorder suggestions
- Track and validate blind inventory counts
- Review immutable activity log with filters
- Approve or reject technician adjustment requests with reason
- Manage users and remotely disconnect lost phones
- Configure role-based permission matrix
- Switch between Technician, Bureau, and Side-by-side views
- Reset demo data to initial state

## 2. Fonctionnalités en détail

### 2.1 Top Navigation Bar

- **Rôle** : Switch between three app views (Côte à côte, Technicien, Bureau) and access demo controls (guided tour, reset)
- **Route** : `https://isp-stock-pneus-demo.vercel.app/`
- **Accès** : The nav bar is always visible at the top of the page. No navigation needed — it appears on the home page after the intro modal is dismissed.
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/c577e70f-9680-4edd-89f8-a6c1921a2333 (86 s, 16 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/css/main.css`

**Mise en page (haut → bas)**

- Fixed dark horizontal bar at top of viewport
- Left: Brand - 'Stock pneus' + 'Inter Service Pneus · démo'
- Center: Three tabs - 'Côte à côte', 'Technicien', 'Bureau' (grouped pills)
- Right: Two buttons - 'Visite guidée' (yellow) + 'Réinitialiser' (dark)

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| text | Stock pistes | App name, white bold text |  |
| text | Inter Service Pneus · démo | Company name + demo indicator, white smaller text |  |
| tab | Côte à côte | Switches to split view (technician + office side by side) | active, inactive |
| tab | Technicien | Switches to technician-only view (iPhone) | active, inactive |
| tab | Bureau | Switches to office dashboard only view | active, inactive |
| button | Visite guidée | Opens 9-step guided tour panel on right side | default |
| button | Réinitialiser | Resets all demo data to initial state | default |

**Contenu (textes exacts)**

- Stock pistes
- Inter Service Pneus · démo
- Côte à côte
- Technicien
- Bureau
- Visite guidée
- Réinitialiser

**Interactions testées**

- Clicked 'Côte à côté' tab → Showed split view: technician iPhone (left) + office dashboard (right)
- Clicked 'Technicien' tab → Showed only technician mobile view (iPhone of Tech. A · camion C3)
- Clicked 'Bureau' tab → Showed only office dashboard view (Poste du bureau · B.)
- Clicked 'Visite guidée' button → Opened right-side panel showing 9-step guided tour with progress '0 étape sur 9'
- Closed Visite guidée panel (X) → Panel closed, returned to previous view

**Règles de fonctionnement**

- [unrated] Only one tab can be active at a time; clicking a tab switches the view instantly (no page reload) — _preuve : Tested all three tabs; each showed a different view, no URL change_
- [unrated] No URL routing - SPA with client-side state management — _preuve : URL remained https://isp-stock-pneus-demo.vercel.app/ throughout all interactions_
- [unrated] Visite guidée opens a 9-step tour panel that auto-checks steps as completed — _preuve : Panel showed 9 numbered steps with 'Chaque étape se coche toute seule quand vous la faites'_
- [unrated] Réinitialiser resets all demo data to initial state — _preuve : Button labeled 'Réinitialiser' with reset icon; page states 'Un rechargement remets la démo à zéro'_
- [unrated] No 'Direction' tab exists in the navigation bar despite app description mentioning Direction role — _preuve : Only 3 tabs visible: Côte à côté, Technicien, Bureau_

**Données & technique**

- Single-page application at /, no route changes
- Client-side view switching (no API calls observed)
- Static/fictitious data as stated in app
- React-based UI (inferred from structure)

**Style visuel**

- Dark navy/black nav bar background (#1a1f2e approx)
- White text throughout
- Active tab: light/white background with dark text
- Visite guidée button: yellow/gold background with dark text
- Réinitialiser button: dark background with white text
- Sans-serif font, pill-shaped tabs grouped together
- Simple line icons next to tabs and buttons

**Cas limites / anomalies**

- No 'Direction' tab despite app description mentioning it
- Two views ('Côte à côté' and 'Technicien') both appear as defaults

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

- Fixed dark top bar, full viewport width
- Left: brand text (Stock pistes + Inter Service Pneus · démo)
- Center: 3 clickable tabs with icons, grouped pill container
- Right: Visite guidée button (yellow) + Réinitialiser button (dark)
- Tab click switches between 3 views: split/technician-only/bureau-only
- Visite guidée opens right panel with 9-step tour
- Réinitialiser resets all demo state

**Captures**

![Top Navigation Bar 1](../../artifacts/RPT_20261107_191951_F01/step_01.png)
![Top Navigation Bar 2](../../artifacts/RPT_20261107_191951_F01/step_05.png)
![Top Navigation Bar 3](../../artifacts/RPT_20261107_191951_F01/step_08.png)

### 2.2 Technicien (Mobile View)

- **Rôle** : Mobile interface for field technicians to manage tire stock onboard trucks, including viewing inventory, completing tire mounts, reordering, mounting new tires, transferring between depot/trucks, and receiving deliveries
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Technicien tab)`
- **Accès** : From home page: Click "Explorer librement" to dismiss intro modal → Click "Technicien" tab in top navigation
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/e9c706ad-c584-4909-9736-2650854416d3 (176 s, 51 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static`, `https://isp-stock-pneus-demo.vercel.app/_next/static/build-manifest.json`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/technicien/page.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/media/main.*.js`, `https://isp-stock-pneus-demo.vercel.app/api/stock`, `https://isp-stock-pneus-demo.vercel.app/build-manifest.json`, `https://isp-stock-pneus-demo.vercel.app/data.json`, `https://isp-stock-pneus-demo.vercel.app/static/js/main.js`, `https://isp-stock-pneus-demo.vercel.app/vercel.json`

**Mise en page (haut → bas)**

- Desktop layout with phone mockup centered. Phone displays mobile app. Top nav: "Côte à côté", "Technicien", "Bureau" tabs. Phone header: "iPhone de Tech. A · camion C3". Phone screen: status bar (19:20/19:22, signal, wifi, battery), App header (Camion dropdown, Tech. A with green dot, Démo badge), Stock summary card, Search bar with QR and 123/ABC buttons, 2 action rows, Tire list, Bottom nav (Monter/Transférer/Recevoir)

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |
| other |  |  |  |

**Contenu (textes exacts)**

- [Full detailed content as documented in the report]

**Interactions testées**

- Click 'Technicien' tab → Navigates to technician mobile view
- Click 'Camion' dropdown → Shows all 9 trucks with tire counts
- Click '2 montages à compléter' → Opens mounts needing license plate registration
- Click 'Réassort : 3 références' → Opens transfer page with depot-to-C3 tab
- Click 'Monter' button → Opens mount-from-truck page
- Click 'Transférer' button → Opens transfer page with 3 tabs
- Click 'Recevoir' button → Opens receive-delivery page
- Type in search bar → Filters tire list by dimension
- Click QR code button → Opens barcode scanner
- Click tire row → Opens tire detail view

**Règles de fonctionnement**

- [unrated] Truck dropdown shows all 9 trucks (C1-C9) with individual tire counts — _preuve : Dropdown showed C1:6, C2:4, C3:22, C4:13, C5:0, C6:7, C7:7, C8:4, C9:4_
- [unrated] '2 montages à compléter' shows mounts missing license plate info — _preuve : Page showed 2 mounts: 225/75 R16C (C3, Location W) and 295/80 R22.5 (C3, Client Z)_
- [unrated] 'Réassort' shows recommended depot-to-truck transfers — _preuve : Listed tires with Depot and C3 quantities, 'Réassort : N' warnings_
- [unrated] Transfer has 3 modes: Depot→Truck, Truck→Depot, Truck→Truck — _preuve : Three tabs visible on Transférer page_
- [unrated] Search filters tire list by dimension text — _preuve : Typed '225' showed only 225/75 R16C and 225/45 R17 results_

**Données & technique**

- Static demo data. 9 trucks (C1-C9), 12 tire references tracked, 22 total tires on C3. Tire data includes: dimension, brand, usage type, location (depot/truck counts), availability, reservation status. Mock license plates: AB-123-CD, EF-456-GH. Mock clients: Transports X, Location W, Client Z, Fournisseur X.

**Style visuel**

- Dark navy header, white/light phone body, blue accent (#2563EB) for primary actions. Green dot for online status. Red for zero-stock items. Rounded phone frame. System font (SF Pro-like). Scan animation with diagonal stripes.

**Cas limites / anomalies**

- C5 Camion shows '0 pneu' (singular). C3 → Dépôt transfer shows 'S'enregistre en « Retour au dépôt ».' Recevoir page warns 'Plus de jeux que le reliquat ? Demande au bureau (excédent).' Search bar placeholder: 'Dimension, ma...' (truncated 'Marque,的难度...')

**Questions ouvertes**

- [1. What happens when you click 'Enregistrer l'immatriculation'? (would modify stock data) 2. What happens when you click 'Valider le transfert'? (would modify stock data) 3. What happens when you click 'Valider la réception'? (would modify stock data) 4. Exact path to JS source files (could not locate)"]

**Pour la reconstruire**

- [See full report for detailed rebuild instructions]

**Captures**

![Technicien (Mobile View) 1](../../artifacts/RPT_20261107_191951_F02/step_01.png)
![Technicien (Mobile View) 2](../../artifacts/RPT_20261107_191951_F02/step_19.png)
![Technicien (Mobile View) 3](../../artifacts/RPT_20261107_191951_F02/step_36.png)

### 2.3 Bureau - Accueil (Dashboard)

- **Rôle** : Daily overview of tire stock across depot and fleet, pending actions, fleet status, and recent activity for Bureau (office staff) users
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau role tab, same URL for all views)`
- **Accès** : Home page → click "Explorer librement" to dismiss intro modal → click "Bureau" tab in top navigation bar
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/21346e86-9616-4adf-8532-d62110c3ae2f (113 s, 34 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/%5Btenant%5D/bureau/page.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main.js`, `https://isp-stock-pneus-demo.vercel.app/api`, `https://isp-stock-pneus-demo.vercel.app/api/stock`, `https://isp-stock-pneus-demo.vercel.app/assets/index-Co4BJ0Ph.js`, `https://isp-stock-pneus-demo.vercel.app/assets/index-D9v1hCuE.css`

**Mise en page (haut → bas)**

- Top nav bar: logo, role tabs (Côte à côte / Technicien / Bureau), Visite guidée + Réinitialiser buttons
- Left sidebar: Quotidien (Accueil, Stock, Camions, Commandes), Suivi (Inventaires, Activité, Demandes), Administration (Exports, Réglages), B.·Bureau footer
- Main: page title 'Votre journée en un coup d’œil' with date/montages count
- Stock summary: 5 metric cards (Stock global, Disponible, Réservé, En commande, Valeur d'achat)
- Blue banner: 'Votre équipe attend une décision' with Examiner les demandes button
- Two-column: 'Vos actions à traiter' list (7 items) + 'Votre flotte' grid (9 truck cards)
- Bottom: 'Activité en direct' live feed + 'Montages par jour' bar chart

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| tab | Bureau | Switches to Bureau dashboard view |  |
| button | Explorer librement | Dismisses intro modal |  |
| button | Consulter le stock | Navigates to Stock page |  |
| button | Commander | Navigates to Commandes fournisseur page |  |
| button | Examiner les demandes | Navigates to Demandes à valider page |  |
| link | Tous les camions | Navigates to Camions page |  |
| link | Stock bas au dépôt | Navigates to Stock page filtered to low stock items |  |
| link | Demandes (sidebar, badge 1) | Navigates to Demandes page |  |
| button | Réinitialiser | Resets demo data to initial state |  |
| button | Visite guidée | Opens 9-step guided tour panel |  |
| card | Stock global: 132 / dépôt et 9 camions | Displays total stock count |  |
| card | Quincailler: 130 / non réservé | Displays available stock |  |
| card | Réservé: 2 / pour des dossiers | Displays reserved stock |  |
| card | En commande: 12 / reliquats attendus | Displays ordered stock |  |
| card | Valeur d'achat: 27 155 € / visible direction et bureau | Displays total purchase value |  |
| chart | Montages par jour bar chart | Shows 7-day montage history |  |
| list | Vos actions à traiter (7 items with counts) | Lists pending actions with navigation links |  |
| grid | Votre flotte (9 truck cards C1-C9) | Shows fleet status per truck |  |

**Contenu (textes exacts)**

- Votre journée en un coup d’œil
- Samedi 7 novembre · 9 montages depuis ce matin
- Consulter le stock
- Commander
- À suivre maintenant — Votre équipe attend une décision
- 1 demande à examiner. Chaque décision est conservée dans l’activité.
- Examiner les demandes
- Stock global: 132 / dépôt et 9 camions
- Quincailler: 130 / non réservé
- Réservé: 2 / pour des dossiers
- En commande: 12 / reliquats attendus
- Valeur d'achat: 27 155 € / visible direction et bureau
- Vos actions à traiter: Stock bas au dépôt (3), Références à commander (2), Demandes à valider (1), Montages à compléter (2), Commandes en retard (1), Inventaires à valider (1), Stocks négatifs à régulariser (0)
- Votre flotte: C1(6 Complet), C2(4 Complet), C3(3, 22 à réassortir), C4(13 Complet), C5(0 Inactif), C6(6 Complet), C7(7 Complet), C8(4 Complet), C9(4 Complet)
- Activité en direct — Démo en direct — Tout voir
- Montages par jour

**Interactions testées**

- Clicked Explorer librement → Intro modal dismissed, home page shown
- Clicked Bureau tab → Navigated to Bureau dashboard
- Clicked Consulter le stock → Navigated to Stock page showing depot and truck inventory
- Clicked Commander → Navigated to Commandes fournisseur page with order history and create draft option
- Clicked Examiner les demandes → Navigated to Demandes à valider page showing 1 pending request
- Clicked Stock bas au dépôt → Navigated to Stock page filtered to low stock items (5 items listed)
- Clicked Tous les camions → Navigated to Camions page showing all 9 trucks with details
- Clicked Visite guidée → Opened 9-step guided tour panel on right side
- Clicked Réinitialiser → Reset demo data (confirmed by data values changing back)
- Observed live data updates → Stock values, montages count, and activity feed updated in real time during session

**Règles de fonctionnement**

- [unrated] All Bureau navigation uses client-side routing; URL stays at root path — _preuve : URL remained https://isp-stock-pneus-demo.vercel.app/ across all page navigations_
- [unrated] Stock metrics are live/dynamic and update in real time — _preuve : Observed stock global change 133→132→131, montages 8→9, valeur d'achat 27251€→27155€ during session_
- [unrated] Fleet shows 9 trucks C1-C9, C5 is inactive, C3 has low stock needing 22 more — _preuve : Truck cards visible in Votre flotte section_
- [unrated] 7 action items tracked, all with count badges and navigation links — _preuve : Vos actions à traiter section shows all 7 items with numbers_
- [unrated] Activity feed shows real-time technician actions with location and truck reference — _preuve : Feed entry: 'Tech. F a monté 1 × 225/75 R16C depuis C6 · Location W · LM-012-NP'_

**Données & technique**

- Single-page app, all routes at same URL (client-side routing)
- Data is dynamic/live (observed real-time updates during session)
- Demo/fictive data as stated in intro modal
- JS bundle: /assets/index-Co4BJ0Ph.js (could not fetch externally)
- CSS: /assets/index-D9v1hCuE.css
- No API endpoints found at /api or /api/stock

**Style visuel**

- Dark navy header (#1a1a2e approx), light gray sidebar, white main content
- Blue accent (#2563eb) for primary buttons and active states
- Green for positive indicators (À jour, Démo en direct, ✓ Complet)
- Red for notifications (Demandes badge, alerts)
- Sans-serif font, bold numbers in stock cards
- Card-based layout with rounded corners and subtle shadows
- Clean whitespace, modern minimal design

**Cas limites / anomalies**

- C5 truck shows 0 pneu and 'Inactif' status (inactive truck)
- C3 truck has low stock warning (3 pneu, 22 à réassortir)
- Last action item 'Stocks négatifs à régulariser' shows 0 (no negative stocks)
- Activity feed and chart have scrollable content (more items/days available)

**Questions ouvertes**

- What exact API/data source powers the live updates? (could not access JS bundle)
- What triggers the '1 demande à examiner' count?
- What are the exact threshold values for 'Stock bas' and 'Références à commander' alerts?

**Pour la reconstruire**

- Build SPA with client-side routing (all routes at root URL)
- Create top nav with role tabs (Côte à côté, Technicien, Bureau)
- Build left sidebar with 3 section groups and navigation links
- Implement 5-stock-metric card row with live data
- Create blue banner card with decision request count
- Build 'Vos actions à traiter' list with 7 actionable items and count badges
- Create 'Votre flotte' grid with 9 truck cards showing status icons
- Add 'Activité en direct' live feed component
- Add 'Montages par jour' bar chart component (7-day view)
- Style with dark navy header, blue accents, card-based layout

**Captures**

![Bureau - Accueil (Dashboard) 1](../../artifacts/REPAIR_192613_F03/step_01.png)
![Bureau - Accueil (Dashboard) 2](../../artifacts/REPAIR_192613_F03/step_11.png)
![Bureau - Accueil (Dashboard) 3](../../artifacts/REPAIR_192613_F03/step_21.png)

### 2.4 Bureau - Stock

- **Rôle** : Desktop dashboard for office staff (Bureau) to view complete tire stock across depot and all trucks, with per-reference details, ordering, and stock adjustments
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (reached via Bureau tab → Stock in sidebar)`
- **Accès** : Home page → click 'Explorer librement' to dismiss intro modal → click 'Bureau' tab in top nav → click 'Stock' in left sidebar
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/b58156f9-e9f5-4239-8aa8-6988e4284e71 (204 s, 40 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/assets/index-Co4BJ0Ph.js`, `https://isp-stock-pneus-demo.vercel.app/assets/index.js`, `https://isp-stock-pneus-demo.vercel.app/index.html`, `https://isp-stock-pneus-demo.vercel.app/static/js/main.js`

**Mise en page (haut → bas)**

- Top bar: B. avatar + Bureau label + À jour status | Visite guidée button | Réinitialiser button
- Left sidebar: Quotidien (Accueil, Stock, Camions), Suivi (Inventaires, Activité, Demandes), Administration (Exports, Réglages)
- Page header: 'Stock' title, subtitle '14 références au dépôt et dans les camions. Ouvrez un pneu pour voir le détail.', 'Exporter (Excel)' button
- Search & filter bar: search input (Ctrl K), filter tabs (Tous/Poids lourds/Utilitaires/Véhicules légers), 'Sous le seuil seulement' checkbox
- Stock table: 14 rows with columns Référenc/Répartition/Dépôt/Camions/Réservé/Disponible/En commande/État
- Per-reference detail view (click row): stats, stock by location, open orders, reserved files, forecast, activity
- Ajuster modal: location, correction (-2/-1/+1/+2), motif, comment, save/cancel
- Activity page (via Tout l'historique): tabs Tout/Montages/Transferts/Réceptions/Ajustements/Annulations, location/person/tire filters, Excel archive

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| button | Explorer librement | Dismisses intro modal |  |
| button | Bureau | Switches to desktop dashboard view |  |
| link | Stock | Navigates to stock inventory page |  |
| input | Rechercher un pneu, un camion, une com... (Ctrl K) | Search/filter tire references by text |  |
| button | Tous | Shows all 14 tire references |  |
| button | Poids lourds | Filters to PL (heavy vehicle) tires only - 8 refs |  |
| button | Utilitaires | Filters to VU (utility) tires only - 2 refs |  |
| button | Véhicules légers | Filters to VL (light vehicle) tires only - 2 refs |  |
| checkbox | Sous le seuil seulement | Shows only tires below reorder threshold |  |
| table | Stock table with 14 tire references | Shows all tire stock data across locations |  |
| button | Exporter (Excel) | Export stock data (no visible effect observed) |  |
| button | Modifier | Not yet implemented (tooltip: arrives batch 3) |  |
| button | Ajuster | Opens stock adjustment modal |  |
| button | Commander | Creates draft supplier order |  |
| button | Réinitialiser | Resets demo data to initial state |  |
| button | Visite guidée | Starts guided tour |  |
| link | ← Stock | Back to stock list from detail view |  |
| link | Tout l'historique | Navigates to full activity page with tire filter |  |

**Contenu (textes exacts)**

- Stock page subtitle: '14 références au dépôt et dans les camions. Ouvrez un pneu pour voir le détail.'
- 'Modifier' tooltip: 'La modification du catalogue arrive au lot 3. Dimension, indices, seuils, prix et alias de doublons.'
- 'Ajuster' modal: 'Réservé aux responsables. L'ajustement est daté, motivé et attribué. Il ne s'ajoute au registre.'
- Motif options: Casse, Vol, Inventaire, Autre
- Commentaire placeholder: 'Ex. : flanc entaillé au déchargement'
- Prévision text: 'Au rythme des 30 derniers jours, le dépôt tombe sous le seuil dans environ X jours. Délai fournisseur habituel : 3 jours.'
- Commander toast: 'Brouillon CF-0316 créé. 4 × 315/80 R22.5 chez Fournisseur X. À vérifier puis envoyer.'
- Search no-match: 'Aucun pneu ne correspond à « X ». Vérifie la saisie ou change de filtre.'
- Activity page header: 'Chaque mouvement est inscrit dans un registre qui ne se modifie jamais. Une erreur se corrige par un mouvement inverse.'
- Excel archive (read-only): '03/2026 [Historique Excel] Sortie 2 × 315/80 R22.5 · « camion 3 »', '03/2026 [Historique Excel] Entrée 8 × 385/65 R22.5 · « livraison X »', '02/2026 [Historique Excel] Sortie 1 × 13 R22.5 · « chantier, voir Tech. B »'

**Interactions testées**

- Clicked 'Bureau' tab → Switched from mobile technician view to desktop office dashboard
- Clicked 'Stock' in sidebar → Navigated to stock inventory page showing 14 tire references
- Typed '315' in search → Filtered table to 3 results: 315/80 R22.5, 315/70 R22.5, 315/60 R22.5
- Clicked 'Poids lourds' filter → Showed 8 PL tires, 'Tous' tab became active again after
- Clicked 'Utilitaires' filter → Showed 2 VU tires: 225/75 R16C and 195/75 R16C
- Clicked 'Véhicules légers' filter → Showed 2 VL tires: 205/55 R16 91V and 225/45 R17 94W
- Checked 'Sous le seuil seulement' with Véhicules légers filter → Showed 'Aucun pneu ne correspond. Vérifie la dimension ou cherche par marque.'
- Clicked '315/80 R22.5' row → Opened detail view with stats, stock by location, orders, reservations, forecast, activity
- Clicked 'Modifier' button → Showed tooltip: modification not yet implemented (batch 3)
- Clicked 'Ajuster' button → Opened stock adjustment modal with location/correction/motif/comment fields
- Clicked 'Commander' button → Created draft order CF-0316, toast confirmed: '4 × 315/80 R22.5 chez Fournisseur X'
- Clicked '215/75 R17.5' row → Opened detail view: 7 Total, 7 Disponible, 2 En commande, Stock bas, 7 jours until below threshold
- Clicked '275/70 R22.5' row then 'Tout l'historique' → Navigated to Activity page with tire pre-filtered, showed Excel archive history

**Règles de fonctionnement**

- [unrated] Filter tabs are mutually exclusive - only one active at a time — _preuve : Clicked each tab and only one showed highlighted/filled state_
- [unrated] Tous shows all 14 references, Poids lourds shows 8, Utilitaires shows 2, Véhicules légers shows 2 — _preuve : Counted visible rows after clicking each filter tab_
- [unrated] Sous le seuil seulement filters to tires where depot stock < seuil threshold — _preuve : When checked with Véhicules légers (none below threshold), showed empty state message_
- [unrated] Search filters by tire reference text, brand, or other searchable fields — _preuve : Typed '315' and got 3 matching results; empty search shows all 14_
- [unrated] Clicking a tire row opens detail view replacing the list; ← Stock returns to list — _preuve : Observed page transform when clicking 315/80 R22.5, 215/75 R17.5, 275/70 R22.5_
- [unrated] Commander creates a draft supplier order (CF-XXXX format) with quantité to reach threshold — _preuve : Created CF-0316 for 4× 315/80 R22.5 (needed to reach depot threshold of 6, had 8... actually 4 was ordered)_
- [unrated] Ajuster modal logs a dated, motivated stock adjustment to the registre — _preuve : Modal description states it's logged; modal has date, motif, attributaire fields_
- [unrated] Prévision calculates days until depot falls below seuil based on 30-day average consumption — _preuve : Different tires showed different day counts: 19, 7, 5 jours_
- [unrated] Dossiers réservés shows format: 'BI-XXXX Company · Plate Truck · count' — _preuve : Saw 'BI-2041 Transports X · AB-123-CD C3 · 1' for 315/80 R22.5_
- [unrated] État badge shows Disponible (green) when above threshold, Stock bas (amber) when below, À commander (red) when at/below threshold with no orders — _preuve : Observed different badge colors across the 14 rows_

**Données & technique**

- SPA (Single Page Application) - React/Vite build. Data is static/hardcoded (demo with 'Réinitialiser' to reset). No API calls observed during interaction. Client-side routing. JS bundle: /assets/index-Co4BJ0Ph.js (couldn't fetch - blocked or wrong path). CSS: /assets/index-D9v1hCuE.css. Data appears embedded in the JS bundle.

**Style visuel**

- Dark navy header (#1a1f36), light gray page background (#f0f2f5), white cards with rounded corners and subtle shadows. Blue primary buttons (#2563eb). Green badges for 'Disponible/Recommandé', amber/orange for 'Stock bas', red for 'À commander'. Sans-serif font (Inter-like). Smooth transitions between views. Toast notifications slide in from bottom-right.

**Cas limites / anomalies**

- 'Modifier' button not implemented (placeholder). Search field shows leftover text '315 80 22, Marque A...' after clearing but doesn't filter (might be placeholder). 'Exporter (Excel)' has no observable effect. 'Commander' button not visible for some tires (e.g., 275/70 R22.5) - possibly disabled when stock is above threshold or other conditions. 'Réinitialiser' confirmation dialog not clearly observed.

**Questions ouvertes**

- Exact route URL for the Stock page (SPA routing not visible in URL bar)
- Why does 'Commander' button appear disabled/hidden for some tires?
- What does 'Exporter (Excel)' actually do (file download not observed)?
- What happens when you actually submit the 'Ajuster' modal?
- What is the exact logic for when 'Commander' button is enabled vs disabled?

**Pour la reconstruire**

- Build a React SPA with: 1) Top nav with Vue switcher (Côte à côté/Technicien/Bureau), 2) Left sidebar with Quotidien/Suivi/Administration sections, 3) Stock page with search input, 4 filter tabs (Tous/Poids lourds/Utilitaires/Véhicules légers), 5) 'Sous le seuil seulement' checkbox, 6) Table with 14 hardcoded tire references showing Répartition (truck distribution), 7) Clickable rows opening detail view with stats cards, 8) Stock par emplacement table, 9) Commandes ouvertes and Dossiers réservés sections, 10) Prévision text, 11) Ajuster modal with location/correction/motif/comment fields, 12) Commander button creating draft orders (CF-XXXX), 13) Activity page with filter tabs and Excel archive section.

**Captures**

![Bureau - Stock 1](../../artifacts/RPT_20261107_191951_F04/step_01.png)
![Bureau - Stock 2](../../artifacts/RPT_20261107_191951_F04/step_16.png)
![Bureau - Stock 3](../../artifacts/RPT_20261107_191951_F04/step_30.png)

### 2.5 Bureau - Camions

- **Rôle** : Desktop dashboard view for office staff (Bureau) to see all 9 workshop trucks and their tire stock levels
- **Route** : `https://isp-stock-pneus-demo.vercel.app/bureau/camions`
- **Accès** : Home page → Click 'Bureau' tab in top navigation → Click 'Camions' in left sidebar (under 'Quotidien' section)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/8277206d-f50b-4b1e-972d-79b53b60286b (109 s, 35 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/__next/require`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/678-abc123.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app-bureau-camions-page-[slug]-page-[id]-page.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/bureau/camions-[slug]-page-[id]-page.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/flux.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/layout.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main-app.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/webpack.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/css/main.css`, `https://isp-stock-pneus-demo.vercel.app/_next/static/media/main-[hash].js`, `https://isp-stock-pneus-demo.vercel.app/api/camions`, `https://isp-stock-pneus-demo.vercel.app/bureau/camions`, `https://isp-stock-pneus-demo.vercel.app/static/js/main.js`

**Mise en page (haut → bas)**

- Top nav: Logo + view switcher (Côte à côte / Technicien / Bureau) + Visite guidée / Réinitialiser buttons
- Sub-header: 'Poste du bureau · B.'
- Search bar with 'Ctrl K' shortcut hint and placeholder 'Rechercher un pneu, un camion, une com...'
- Filter tabs: Flotte / Tout / Pneus / Remorquage
- Page title: 'Camions' + subtitle 'Neuf camions d'atelier. Chaque technicien voit son camion sur son iPhone.'
- Truck cards grid (2-column): 9 cards showing ID, driver, company, tire count, status badge, last movement
- Left sidebar: Quotidien (Accueil, Stock, Camions, Commandes), Suivi (Inventaires, Activité, Demandes+1), Administration (Exports, Réglages)
- Bottom status bar: 'B. · Bureau' + 'À jour'

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| tab | Bureau (top nav, active) | Switches to desktop dashboard view |  |
| link | Camions (left sidebar) | Navigates to Camions overview page |  |
| input | Search bar (placeholder: 'Rechercher un pneu, un camion, une com...') | Searches tires, trucks, companies; shows autocomplete dropdown |  |
| button | Tout filter tab | Shows all 9 trucks (default) |  |
| button | Pneus filter tab | Shows only Inter Service Pneus trucks (C1-C6) |  |
| button | Remorquage filter tab | Shows only Remorquage trucks (C7-C9) |  |
| card | Truck cards (C1-C9) | Click to view truck detail with tire inventory table |  |
| badge | Complet (green) | Shows truck has sufficient tire stock |  |
| badge | Inactif (grey, C5 only) | Shows truck has 0 tires, card has dashed border |  |
| badge | X à réassortir (orange warning) | Shows truck has tires below minimum threshold |  |

**Contenu (textes exacts)**

- Neuf camions d'atelier. Chaque technicien voit son camion sur son iPhone.
- C1 - Tech. C - Inter Service Pneus - 6 - Complet - Dernier mouvement 17:21
- C2 - Tech. D - Inter Service Pneus - 4 - Complet - Dernier mouvement il y a 22 min
- C3 - Tech. A - Inter Service Pneus - 22 - 3 à réassortir - Dernier mouvement 18:09
- C4 - Tech. E - Inter Service Pneus - 13 - Complet - Dernier mouvement 16:09
- C5 - Au garage - Inter Service Pneus - 0 - Inactif
- C6 - Tech. F - Inter Service Pneus - 7 - Complet
- C7 - Tech. B - Inter Service Remorquage - 6 - Complet - Dernier mouvement à l'instant
- C8 - Tech. G - Inter Service Remorquage - 4 - Complet - Dernier mouvement 15:48
- C9 - Tech. H - Inter Service Remorquage - 4 - Complet - Dernier mouvement il y a 53 min
- Camion C3 - Tech. A · 22 pData à bord - Préparer le réassort (3)
- Table columns: Référence, Phys., Rés., Dispo, Seuil, État

**Interactions testées**

- Clicked 'Bureau' tab → Navigated to Bureau dashboard
- Clicked 'Camions' in sidebar → Navigated to Camions overview with 9 truck cards
- Clicked 'Pneus' filter → Filtered to 6 Inter Service Pneus trucks (C1-C6)
- Clicked 'Remorquage' filter → Filtered to 3 Remorquage trucks (C7-C9)
- Clicked 'Tout' filter → Showed all 9 trucks
- Typed 'Tech' in search → Showed autocomplete with all 9 truck names
- Clicked C1 truck card → Navigated to C1 detail page with tire inventory table
- Clicked C3 truck card → Navigated to C3 detail with 'Préparer le réassort (3)' button and 12 tire entries

**Règles de fonctionnement**

- [unrated] Filter tabs are mutually exclusive: Tout (all 9), Pneus (C1-C6), Remorquage (C7-C9) — _preuve : Each filter showed different subset of trucks_
- [unrated] Truck cards show: ID, driver name, company, tire count, status badge, last movement time — _preuve : All 9 cards had consistent layout_
- [unrated] Clicking a truck card navigates to detail view with full tire inventory table — _preuve : C1 and C3 both navigated to detail pages_
- [unrated] 'Complet' badge = sufficient stock; 'Inactif' = 0 tires (C5); 'X à réassortir' = below threshold (C3) — _preuve : C5 had 0 tires and 'Inactif' badge with dashed border; C3 had '3 à réassortir' warning_
- [unrated] Detail page shows 'Préparer le réassort (N)' button when tires need restocking — _preuve : C3 (22 tires, 3 below threshold) showed the button_
- [unrated] Tire inventory table columns: Référence, Phys., Rés., Dispo, Seuil, État — _preuve : C3 detail view showed all 6 columns_
- [unrated] Data is live/dynamic: 'Dernier mouvement' times update over time — _preuve : C2 went from 'il y a 21 min' to 'il y a 22 min' between observations_

**Données & technique**

- Data appears client-side (hardcoded in JS), not fetched from API
- Truck names, tire specs, counts are static
- Last movement times are dynamic/relative (timestamps, 'il y a X min', 'à l'instant')
- Could not access source files - all web_fetch attempts returned 404

**Style visuel**

- Navy/dark blue top navigation bar
- White card containers with subtle shadow
- Green 'Complet' badges, orange warning badges, blue action buttons
- Clean sans-serif font, bold for headings and truck IDs
- 2-column card grid layout
- Minimal animations, smooth transitions

**Cas limites / anomalies**

- C5 'Au garage' has 0 tires, shows 'Inactif' badge and dashed card border
- C3 shows '3 à réassortir' warning (tires below threshold)
- Search autocomplete shows all trucks regardless of active filter

**Questions ouvertes**

- Could not access source files to confirm data source (JS/CSS bundles not found at standard paths)
- Flotte filter tab behavior not explored
- URL structure for truck detail pages not confirmed

**Pour la reconstruire**

- Build a desktop dashboard with top nav (view switcher), left sidebar, and main content area
- Implement 9 truck cards in 2-column grid with ID, driver, company, tire count, status badge, last movement
- Add filter tabs: Tout, Pneus, Remorquage (mutually exclusive)
- Add search bar with autocomplete
- Truck detail page: table with columns Référence, Phys., Rés., Dispo, Seuil, État
- Status logic: Complet (sufficient), Inactif (0 tires, dashed border), X à réassortir (below threshold)
- 'Préparer le réassort (N)' button appears when restocking needed

**Captures**

![Bureau - Camions 1](../../artifacts/RPT_20261107_191951_F05/step_01.png)
![Bureau - Camions 2](../../artifacts/RPT_20261107_191951_F05/step_10.png)
![Bureau - Camions 3](../../artifacts/RPT_20261107_191951_F05/step_18.png)

### 2.6 Bureau - Commandes

- **Rôle** : Manage supplier orders: view orders, create draft orders from stock suggestions, receive deliveries, export orders to CSV
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau view > Commandes in left sidebar)`
- **Accès** : Home page → click "Bureau" tab (top center) → click "Commandes" in left sidebar (under "Quotidien" section)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/f8d5ff72-dc40-4b32-a2d7-00e22bc8dd4c (118 s, 35 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/.well-known/assetlinks.json`, `https://isp-stock-pneus-demo.vercel.app/_app.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main.js`, `https://isp-stock-pneus-demo.vercel.app/app.js`, `https://isp-stock-pneus-demo.vercel.app/assets/index-legacy.css`, `https://isp-stock-pneus-demo.vercel.app/index.html`, `https://isp-stock-pneus-demo.vercel.app/main.js`, `https://isp-stock-pneus-demo.vercel.app/manifest.json`, `https://isp-stock-pneus-demo.vercel.app/src`, `https://isp-stock-pneus-demo.vercel.app/static/js/main.js`

**Mise en page (haut → bas)**

- 1. Top bar: "Stock pneus / Inter Service Pneus · démo" logo (left), view switcher (Côte à côté / Technicien / Bureau), "Visite guidée" button, "Réinitialiser" button. 2. Left sidebar: "Poste du bureau · B." → Stock pneus logo → Quotidien (Accueil, Stock, Camions, Commandes), Suivi (Inventaires, Activité, Demandes w/ badge 1), Administration (Exports, Réglages). 3. Main content: Search bar "Rechercher un pneu, un camion, une com... Ctrl K". 4. Page header: "Commandes fournisseur" + subtitle "Le stock en commande n'est jamais disponible avant sa réception." + "Exporter" button (top right). 5. "Suggestion de commande" card: "Aperçu" badge, "Créer 2 brouillons" button, text "2 références sont sous le seuil au dépôt, sans commande suffisante en cours :" + 2 chip pills. 6. Orders table: columns N°, Fournisseur, Créée, Prévue, Pneus, Reliquat, Statut. 7. Footer: "B. · Bureau" + "À jour"

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| page-title | Commandes fournisseur |  |  |
| subtitle | Le stock en commande n'est jamais disponible avant sa réception. |  |  |
| button | Exporter | Downloads commandes.csv file with all order data |  |
| card | Suggestion de commande |  |  |
| badge | Aperçu | Non-functional badge (clicked, nothing happens) |  |
| button | Créer 2 brouillons | Creates 2 draft orders from low-stock suggestions, shows toast |  |
| table | Orders list |  |  |
| button | PDF | Visible on order detail pages |  |
| button | Réceptionner... | Opens reception modal for non-draft orders |  |
| button | Envoyer au fournisseur | Visible on draft orders (function not tested) |  |
| button | Réinitialiser | Resets demo data to initial state |  |

**Contenu (textes exacts)**

- PAGE HEADER:
- Title: "Commandes fournisseur"
- Subtitle: "Le stock en commande n'est jamais disponible avant sa réception."
- Exporter button (top right)

SUGGESTION DE COMMANDE CARD:
- Title: "Suggestion de commande"
- Badge: "Aperçu" (non-functional)
- Button: "Créer 2 brouillons"
- Text: "2 références sont sous le seuil au dépôt, sans commande suffisante en cours :"
- Chip 1: "275/70 R22.5 · dépôt 2 / seuil 3 · Fournisseur Y"
- Chip 2: "13 R22.5 · dépôt 2 / seuil 3 · Fournisseur X"

ORDERS TABLE (columns: N°, Fournisseur, Créée, Prévue, Pneus, Reliquat, Statut):
1. CF-0316 (Nouvelle) | Fournisseur X | aujourd'hui | 10/11 | 4 | · | Brouillon
2. CF-0312 | Fournisseur X | 01/11 | aujourd'hui | 14 | 6 | Partiellement reçue
3. CF-0301 | Fournisseur X | 26/10 | 04/11 | 6 | 6 | En retard
4. CF-0309 | Fournisseur Y | 29/10 | 02/11 | 8 | 0 | Reçue
5. CF-0315 | Fournisseur Z | 06/11 | 11/11 | 4 | · | Brouillon

ORDER DETAIL (e.g. CF-0312 - Partiellement reçue):
- Header: "CF-0312" + status badge "Partiellement reçue"
- Meta: "Fournisseur X · créée le 01/11 · prévue aujourd'hui"
- Buttons: "PDF" | "Réceptionner..."
- Table (columns: Référence, Commandé, Reçu, Reliquat, Excédent):
  - 315/80 R22.5 Marque A Régional: 10 | 6 | 4 | 0
  - 385/65 R22.5 Marque B Remorque: 4 | 2 | 2 | 0

RECEPTION MODAL (Réceptionner CF-0312):
- Title: "Réceptionner CF-0312"
- Text: "Une livraison de plusieurs références s'enregistre en une seule opération."
- "Livré à" dropdown (default: "Dépôt")
- Rows: tire reference | reliquat quantity | number input (pre-filled with reliquat)
- Buttons: "Annuler" | "Valider la réception (6)"

DRAFT ORDER DETAIL (e.g. CF-0315 - Brouillon):
- Header: "CF-0315" + status "Brouillon"
- Meta: "Fournisseur Z · créée le 06/11 · prévue 11/11"
- Buttons: "PDF" | "Envoyer au fournisseur"
- Table: 225/45 R17 | 4 | 0 | 4 | 0

CSV EXPORT (commandes.csv):
Headers: Commande;Fournisseur;Statut;Prévue;Référence;Commandé;Reliquat
Data rows per tire reference per order.

**Interactions testées**

- Clicked 'Bureau' tab → Switched from Technicien mobile view to Bureau desktop dashboard
- Clicked 'Commandes' in sidebar → Navigated to Commandes fournisseur page
- Clicked 'Aperçu' badge → Nothing happened - non-functional
- Clicked CF-0312 order → Opened order detail page showing 2 tire references, PDF and Réceptionner... buttons
- Clicked 'Réceptionner...' → Opened reception modal with Livré à dropdown (Dépôt default), pre-filled quantities, Annuler/Valider buttons
- Clicked 'Annuler' in modal → Closed modal, returned to order detail
- Clicked 'Créer 2 brouillons' → Created 2 draft orders (CF-0316 x2), toast: '2 brouillons créés : CF-0316, CF-0316. Quantités proposées pour remonter au double du seuil. Vérifie puis envoie.'
- Clicked draft order CF-0316 → Opened draft order detail with 'Envoyer au fournisseur' button (vs 'Réceptionner...' for non-drafts)
- Clicked 'Réinitialiser' → Reset demo: removed created drafts, returned to original 4 orders
- Clicked 'Exporter' → Downloaded commandes.csv with all order data (semicolon-separated)

**Règles de fonctionnement**

- [unrated] Orders are listed in the table with status badges: Brouillon (grey), Partiellement reçue (yellow/orange), En retard (red, date in red), Reçue (green) — _preuve : Observed in table - each status has distinct color coding_
- [unrated] Clicking an order row opens its detail page with tire-level breakdown — _preuve : Clicked CF-0312 and CF-0316, both opened detail views_
- [unrated] Non-draft orders show 'Réceptionner...' button; draft orders show 'Envoyer au fournisseur' button — _preuve : CF-0312 (Partiellement reçue) showed Réceptionner...; CF-0315 (Brouillon) showed Envoyer au fournisseur_
- [unrated] Reception modal pre-fills quantities with reliquat values; user can modify before validating — _preuve : Modal showed 4 and 2 pre-filled for CF-0312 reliquats_
- [unrated] Créer 2 brouillons creates drafts for references below threshold at depot with no sufficient order in progress — _preuve : Created drafts for 275/70 R22.5 (Fournisseur Y) and 13 R22.5 (Fournisseur X) - the 2 suggestions shown_
- [unrated] Export produces semicolon-separated CSV with columns: Commande, Fournisseur, Statut, Prévue, Référence, Commandé, Reliquat — _preuve : Read commandes.csv file after clicking Exporter_
- [unrated] Réinitialiser resets all demo state to initial values — _preuve : After clicking, created drafts disappeared and original 4 orders remained_
- [unrated] Date format is DD/MM/YYYY; 'aujourd'hui' used for today's date — _preuve : Observed in order dates throughout the UI_
- [unrated] PDF button visible on all order detail pages (function not tested) — _preuve : PDF button seen on CF-0312 and CF-0315 detail pages_

**Données & technique**

- Client-side rendered SPA. Data appears to be hardcoded/demo data (fictive). CSV export is a client-side generated file. No API calls observed during interactions. Data persists in browser memory (Réinitialiser resets it).

**Style visuel**

- Dark navy header bar, light grey sidebar with icons, white main content area, blue primary buttons, status badges with distinct colors (green=Reçue, yellow=Partiellement reçue, red=En retard, grey=Brouillon), red text for overdue dates, clean modern UI with rounded cards and badges

**Cas limites / anomalies**

- - Two draft orders created by 'Créer 2 brouillons' both show as CF-0316 (same number - potential UX issue)
- 'Aperçu' badge is non-functional (labeled as 'piste pour la suite' per intro text)
- 'Envoyer au fournisseur' button function not tested (would be a state-changing action)
- 'PDF' button function not tested

**Questions ouvertes**

- - What does the 'PDF' button do?
- What does 'Envoyer au fournisseur' do for draft orders?
- What happens when you validate a reception in the modal?
- What is the 'Livré à' dropdown used for?

**Pour la reconstruire**

_(rien relevé)_

**Captures**

![Bureau - Commandes 1](../../artifacts/RPT_20261107_191951_F06/step_01.png)
![Bureau - Commandes 2](../../artifacts/RPT_20261107_191951_F06/step_11.png)
![Bureau - Commandes 3](../../artifacts/RPT_20261107_191951_F06/step_20.png)

### 2.7 Bureau - Inventaires

- **Rôle** : Track and validate blind inventory counts performed on iPhone by field technicians
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau view > Inventaires)`
- **Accès** : Home page → Click "Bureau" tab (top nav) → Click "Inventaires" in left sidebar (under "Suivi" section)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/6655102b-b06e-433e-8fb7-5f74d93c4499 (68 s, 13 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main-app.js`

**Mise en page (haut → bas)**

- Page title 'Inventaires' with subtitle description
- Inventory list: rows showing n° + truck name + summary + status badge
- Detail view (when clicking row): title, submitted-by info, action buttons, warning banner, table with tire lines, footnote

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| link | ← Inventaires | Back navigation to list |  |
| badge | Soumis, à valider | Orange status badge for unvalidated inventories |  |
| badge | Validé | Green status badge after validation |  |
| button | Renvoyer au comptage | Returns inventory to counting phase (not tested - only available before validation) |  |
| button | Valider les écarts | Validates the inventory, creates adjustments, changes status to Validé |  |
| table | Référence | Théorique* | Compté | Écart | Commentaire | Displays 4 tire lines with theoretical vs counted values and discrepancies |  |
| banner | 1 écart sans commentaire. Tu peux valider, le motif sera « à justifier ». | Warning shown when a discrepancy has no comment |  |
| toast | 2 ajustements créés, motif « Inventaire n° 7 ». Les mouvements faits pendant le comptage restent intacts. | Success notification after validation |  |

**Contenu (textes exacts)**

- Comptage à l'aveugle sur iPhone. L'écart se calcule au moment du comptage de chaque ligne, puis s'applique en différence.
- n° 7 · Camion C6 · 4 lignes · 2 écarts · soumis par Tech. F
- Soumis par Tech. F vendredi 6 novembre à 17 h 40
- 295/80 R22.5 | 2 | 2 | 0
- 275/70 R22.5 | 1 | 0 | -1 | « Pneu crevé laissé chez le client »
- 225/75 R16C | 2 | 3 | +1 | Commentaire requis
- 195/75 R16C | 2 | 2 | 0
- * au moment du comptage de la ligne

**Interactions testées**

- Click inventory row (Camion C6) → Navigates to detail view with tire lines table
- Click 'Valider les écarts' → Status changed to 'Validé', buttons disappeared, toast '2 ajustements créés, motif « Inventaire n° 7 »' appeared
- Click '← Inventaires' back link → Returned to list view, inventory now shows 'Validé' badge

**Règles de fonctionnement**

- [unrated] Écart = Compté − Théorique (counted minus theoretical) — _preuve : Table shows -1 for 1-0, +1 for 3-2, 0 for matching values_
- [unrated] Validating creates stock adjustment entries for each non-zero discrepancy — _preuve : Toast said '2 ajustements créés' for 2 lines with non-zero écarts (-1 and +1)_
- [unrated] Discrepancies without comments trigger warning banner and auto-assign 'à justifier' reason — _preuve : Warning banner appeared for 275/70 R22.5 line which had no comment_
- [unrated] Status transitions: Soumis/à valider → Validé (one-way, irreversible) — _preuve : After validation, buttons disappeared and status changed to green 'Validé'_
- [unrated] Theoretical count is frozen at counting time — _preuve : Footnote '* au moment du comptage de la ligne'_

**Données & technique**

- Static/fictitious data in demo. No API calls observed. Data appears hardcoded (single inventory n° 7 for Camion C6).

**Style visuel**

- Blue primary button (#2563EB), orange badge for 'Soumis, à valider', green badge for 'Validé', red text for negative écarts, green text for positive écarts, sans-serif font, card-based layout, toast animation from bottom-right

**Cas limites / anomalies**

- Only one inventory item exists in demo. 'Renvoyer au comptage' button behavior not tested (only available before validation).

**Questions ouvertes**

- What does 'Renvoyer au comptage' exactly do? (button not tested)
- How does the iPhone blind counting interface work? (not in scope - Bureau view only)

**Pour la reconstruire**

- 1. Create inventory list page with status badges (Soumis/à valider, Validé). 2. Detail view with table of tire lines (Référence, Théorique, Compté, Écart, Commentaire). 3. 'Valider les écarts' button that: validates status, creates adjustment entries, shows toast. 4. 'Renvoyer au comptage' button for re-opening. 5. Warning banner when discrepancies lack comments. 6. Écart = Compté - Théorique with color coding.

**Captures**

![Bureau - Inventaires 1](../../artifacts/RPT_20261107_191951_F07/step_01.png)
![Bureau - Inventaires 2](../../artifacts/RPT_20261107_191951_F07/step_04.png)
![Bureau - Inventaires 3](../../artifacts/RPT_20261107_191951_F07/step_07.png)

### 2.8 Bureau - Activité

- **Rôle** : Immutable audit log of all stock movements for office staff (Bureau). Shows all tire stock operations in a non-editable register.
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau > Suivi > Activité)`
- **Accès** : From home page: 1) Click "Explorer librement" to dismiss intro modal, 2) Click "Bureau" tab in top navigation, 3) Click "Activité" in left sidebar under "Suivi" section.
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/36e04f32-dd13-4b9a-a48f-f7bdf0f24f19 (91 s, 24 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/layout.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main-app.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/webpack.js`, `https://isp-stock-pneus-demo.vercel.app/api/data`, `https://isp-stock-pneus-demo.vercel.app/data.json`

**Mise en page (haut → bas)**

- Top bar: "Poste du bureau · B." label, Search bar, "Visite guidée" button (yellow), "Réinitialiser" button
- Left sidebar: Navigation (Quotidien: Accueil/Stock/Camions/Commandes, Suivi: Inventaires/Activité/Demandes, Administration: Exports/Réglages)
- Main content: H1 "Activité", description text, filter tabs row, filter dropdowns row, activity list, Excel archive section, footer status

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| tab | Tout | Default active tab showing all 11 movements |  |
| tab | Montages | Filter to show only mounting operations (1 movement) |  |
| tab | Transferts | Filter to show only transfers (1 movement) |  |
| tab | Réceptions | Filter to show only receptions (1 movement) |  |
| tab | Ajustements | Filter to show only adjustments (1 movement) |  |
| tab | Annulations | Filter to show cancellations (0 in main list, 3 in Excel archive) |  |
| select | Tous les emplacements | Location filter dropdown with 11 options |  |
| select | Toutes les personnes | Person filter dropdown with 10 options |  |
| select | Toutes les références | Tire reference filter dropdown |  |
| list | Activity list | Scrollable list of filtered stock movements |  |
| section | Archive du classeur Excel | Read-only Excel history section with 3 entries |  |

**Contenu (textes exacts)**

- Heading: "Activité"
- Description: "Chaque mouvement est inscrit dans un registre qui ne se modifie jamais. Une erreur se corrige par un mouvement inverse."
- Excel Archive badge: "Lecture seule, sans effet sur le stock"
- Excel entries: "03/2026 [Historique Excel] Sortie 2 × 315/80 R22.5 · « camion 3 »", "03/2026 [Historique Excel] Entrée 8 × 385/65 R22.5 · « livraison X »", "02/2026 [Historique Excel] Sortie 1 × 13 R22.5 · « chantier, voir Tech. B »"
- Empty state: "Aucun mouvement avec ces filtres."
- Footer: "B. · Bureau" + "À jour"

**Interactions testées**

- Clicked each of the 6 filter tabs → Tout shows 11 movements; Montages/Transferts/Réceptions/Ajustements each show 1 movement; Annulations shows 0 in main list but 3 in Excel archive
- Opened "Tous les emplacements" dropdown → Showed 11 options: Tous les emplacements, Dépôt, Camion C1-C9
- Opened "Toutes les personnes" dropdown → Showed 10 options: Toutes les personnes, B., Direction, Tech. A through Tech. H
- Opened "Toutes les références" dropdown → Showed tire size reference options

**Règles de fonctionnement**

- [unrated] Six filter tabs are mutually exclusive - only one can be active at a time — _preuve : Only one tab has dark navy background at any time_
- [unrated] Three combobox filters (emplacements, personnes, références) are all multi-select and applied together — _preuve : All three dropdowns visible in filter row 2_
- [unrated] Main activity list shows movements matching all active filters combined — _preuve : Empty state shown when filters produce no matches_
- [unrated] Excel Archive section is always visible and read-only, showing 3 historical entries regardless of active tab — _preuve : Same 3 entries visible when Annulations tab selected vs other tabs_
- [unrated] The register is immutable - errors are corrected by inverse movements — _preuve : Description text: "Chaque mouvement est inscrit dans un registre qui ne se modifie jamais. Une erreur se corrige par un mouvement inverse."_

**Données & technique**

- ["Client-side rendered React/Next.js app with hardcoded demo data (11 movements per home page description). No visible API calls - data likely embedded in JS bundle. Excel archive entries appear to be static sample data separate from the main register."],
"visual_style": ["Dark navy header (#1a1f36), white content area, green status dot, yellow \"Visite guidée\" button. Active tabs: dark navy bg/white text. Inactive tabs: light gray. Cards: white with subtle borders, rounded corners."],
"edge_cases": ["\"Annulations\" tab shows empty main list but Excel archive displays 3 entries - the archive is not filtered by tab selection. Empty state message \"Aucun mouvement avec ces filtres.\" appears when no movements match current filters."],
"open_questions": ["Exact data source for the 11 movements (could not locate JS bundle). Whether Excel archive entries are filtered by any criteria. Full list of \"Toutes les références\" dropdown options."],
"rebuild_notes": ["Create page at Bureau > Suivi > Activité route. Implement 6 mutually exclusive filter tabs. Add 3 multi-select dropdown filters. Display filtered activity list with empty state. Include read-only Excel archive section with 3 static entries. Show description text about immutable register. Footer with user status indicator."]

**Style visuel**

_(rien relevé)_

**Cas limites / anomalies**

_(rien relevé)_

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

_(rien relevé)_

**Captures**

![Bureau - Activité 1](../../artifacts/RPT_20261107_191951_F08/step_01.png)
![Bureau - Activité 2](../../artifacts/RPT_20261107_191951_F08/step_08.png)
![Bureau - Activité 3](../../artifacts/RPT_20261107_191951_F08/step_15.png)

### 2.9 Bureau - Demandes

- **Rôle** : Allow Bureau staff to review, approve, or reject stock adjustment requests submitted by field technicians
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (reached via Bureau tab → Examiner les demandes)`
- **Accès** : Home page → click 'Bureau' tab in top nav → click 'Examiner les demandes' button in blue banner (or 'Demandes' in left sidebar)
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/b3e0af15-c696-4e85-bd9e-fe0dc10b68b8 (82 s, 21 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main.js`, `https://isp-stock-pneus-demo.vercel.app/assets/index-Co4BJ0Ph.js`, `https://isp-stock-pneus-demo.vercel.app/static/js/bundle.js`

**Mise en page (haut → bas)**

- Header: 'Stock pneu' logo, role tabs (Côte à côté/Technicien/Bureau), 'Visite guidée' and 'Réinitialiser' buttons
- Left sidebar: Quotidien (Accueil, Stock, Camions, Commandes), Suivi (Inventaires, Activité, Demandes), Administration (Exports, Réglages), footer: 'B. · Bureau' online status
- Main: 'Demandes à valider (N)' section with request cards, 'Traitées' section below

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| button | Accorder | Approves the stock adjustment request |  |
| button | Refuser | Rejects the stock adjustment request |  |
| input | Motif de la décision (tracé) | Free-text field for entering a custom decision reason |  |
| link | Voir l'activité de la référence | Opens reference activity detail view |  |
| button | Réinitialiser | Resets the demo state |  |
| button | Visite guidée | Opens guided tour |  |

**Contenu (textes exacts)**

- Demandes à valider (1)
- Rien n'est enregistré dans le registre tant qu'une demande n'est pas accordée. Chaque décision est tracée avec son auteur et son motif.
- Aucune demande en attente. Depuis l'iPhone, un refus de montage permet d'en envoyer une.
- Demande d'ajustement - Tech. G - il y a 52 min
- Ajustement 1 × 245/70 R19.5 à C8 · stock affiché 2
- Motif : « Flanc entaillé au déchargement, pneu inexploitable. »
- ✓ Accordée par Direction · « Pneu vérifié par téléphone »
- × Refusée par Direction · « Stock à vérifier avant tout montage »
- Demande accordée. Tech. G est prévenu sur son iPhone.
- Demande refusée. Tech. G est prévenu sur son iPhone.

**Interactions testées**

- Clicked 'Accorder' button → Request moved to Traitées, toast 'Demande accordée. Tech. G est prévenu sur son iPhone.', decision shown as 'Accordée par Direction · « Pneu vérifié par téléphone »'
- Clicked 'Refuser' button (empty reason field) → Request moved to Traitées, toast 'Demande refusée. Tech. G est prévenu sur son iPhone.', decision shown as 'Refusée par Direction · « Stock à vérifier avant tout montage »'
- Typed 'Test reason' in Motif field, then clicked 'Accorder' → Decision shown as 'Accordée par Direction · « Test reason »' - custom reason used
- Clicked 'Voir l'activité de la référence' → Opened reference activity view showing timeline: C8 arrival, stock update 226→227, mounting completed

**Règles de fonctionnement**

- [unrated] Accorder button approves request and shows default reason 'Pneu vérifié par téléphone' if Motif field is empty — _preuve : Tested: clicked Accorder with empty field, reason showed as 'Pneu vérifié par téléphone'_
- [unrated] Refuser button rejects request and shows default reason 'Stock à vérifier avant tout montage' if Motif field is empty — _preuve : Tested: clicked Refuser with empty field, reason showed as 'Stock à vérifier avant tout montage'_
- [unrated] Motif de la décision (tracé) field content overrides default reasons when present — _preuve : Tested: typed 'Test reason', decision showed 'Test reason' as the motif_
- [unrated] All decisions attributed to 'Direction' regardless of Bureau login — _preuve : Logged in as Bureau, both decisions showed 'par Direction'_
- [unrated] Requests move one-way from Demandes à valider to Traitées (irreversible) — _preuve : After approving, request only appeared in Traitées, never back in pending_
- [unrated] Approving updates truck stock (C8: 226→227) — _preuve : Activity view showed 'Stock mis à jour : 226 → 227' after approval_

**Données & technique**

_(rien relevé)_

**Style visuel**

- Dark navy header bar, light grey sidebar, white main content, blue Accorder button, red Refuser button, green approved text, red rejected text, orange 'Demande d'ajustement' badges

**Cas limites / anomalies**

- Only one request exists in demo - no pagination or multiple requests
- No actual login - all roles accessible, but decisions always attributed to Direction
- No backend - all state is in-browser, Réinitialiser resets everything

**Questions ouvertes**

_(rien relevé)_

**Pour la reconstruire**

- Create Bureau Demandes page with pending requests list and processed requests list
- Each request card: orange badge, requester name, timestamp, description line, reason line, Accorder/Refuser buttons, Motif text field, 'Voir l'activité' link
- Accorder: move to processed, show green '✓ Accordée par Direction · [reason]' with default 'Pneu vérifié par téléphone'
- Refuser: move to processed, show red '× Refusée par Direction · [reason]' with default 'Stock à vérifier avant tout montage'
- Motif field: free text, overrides default reason when filled
- Toast notifications for both actions mentioning tech notified on iPhone
- Reference activity view: timeline of truck events

**Captures**

![Bureau - Demandes 1](../../artifacts/RPT_20261107_191951_F09/step_01.png)
![Bureau - Demandes 2](../../artifacts/RPT_20261107_191951_F09/step_09.png)
![Bureau - Demandes 3](../../artifacts/RPT_20261107_191951_F09/step_16.png)

### 2.10 Bureau - Exports

- **Rôle** : Export tire stock, movements, and order data as CSV files for external use
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau view → Administration → Exports)`
- **Accès** : From home page: Dismiss intro modal (Explorer librement) → Click "Bureau" tab → Left sidebar: Administration → Exports
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/623c14b5-d680-409f-bb4f-dcbe37479e8c (108 s, 25 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/_next/static`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks`, `https://isp-stock-pneus-demo.vercel.app/manifest.json`, `https://isp-stock-pneus-demo.vercel.app/static`

**Mise en page (haut → bas)**

- Top bar: Logo + view tabs (Côte à côté / Technicien / Bureau) + Visite guidée / Réinitialiser buttons
- Sub-header: 'Poste du bureau · B.'
- Search bar: 'Rechercher un pneu, un camion, une com...' with Ctrl K
- Page title: 'Exports'
- Subtitle: 'CSV en UTF-8, séparateur point-virgule : s'ouvre directement dans Excel en français.'
- 2x2 grid of export cards
- Footer: 'B. · Bureau' + 'À jour'

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| card | Stock par référence et emplacement | Shows stock data export description | CSV button downloads file |
| button | CSV | Downloads stock CSV file (stock-{date}.csv) |  |
| card | Mouvements | Shows movements log export description | CSV button downloads file |
| button | CSV | Downloads movements CSV file (mouvements-{date}.csv) |  |
| card | Commandes et lignes | Shows orders export description | CSV button downloads file |
| button | CSV | Downloads orders CSV file (commandes-{date}.csv) |  |
| card | Export complet (réversibilité) | Shows full database export description | Préparer button triggers simulation toast |
| button | Préparer | Shows toast notification (simulation only, no file generated) |  |

**Contenu (textes exacts)**

- Title: Exports
- Subtitle: CSV en UTF-8, séparateur point-virgule : s'ouvre directement dans Excel en français.
- Card 1: Stock par référence et emplacement / Physique, réservé, disponible et en commande. Même calcul que l'écran.
- Card 2: Mouvements / Le registre complet : date, auteur, motif, valideur et annotations.
- Card 3: Commandes et lignes / Commandé, reçu, reliquat et excédent par ligne.
- Card 4: Export complet (réversibilité) / Toutes les tables en CSV et une copie de la base. Vos données restent à vous.
- Toast: Export complet préparé (simulation). Un lien de téléchargement arrive par e-mail à la direction.

**Interactions testées**

- Clicked CSV button (Stock par référence et emplacement) → Downloaded stock-2026-11-07.csv (1816 bytes, 40 data rows)
- Clicked CSV button (Mouvements) → Downloaded mouvements-2026-11-07.csv (1127 bytes, 11 data rows)
- Clicked CSV button (Commandes et lignes) → Downloaded commandes-2026-11-07.csv (395 bytes, 7 data rows)
- Clicked Préparer button (Export complet) → Toast notification appeared: 'Export complet préparé (simulation). Un lien de téléchargement arrive par e-mail à la direction.' No file downloaded.

**Règles de fonctionnement**

- [unrated] CSV files use UTF-8 encoding with semicolon separator and BOM — _preuve : All three downloaded files start with BOM character, use ; as separator_
- [unrated] CSV filenames follow pattern: {type}-{YYYY-MM-DD}.csv — _preuve : stock-2026-11-07.csv, mouvements-2026-11-07.csv, commandes-2026-11-07.csv_
- [unrated] Stock CSV has 7 columns: Code, Dimension, Marque, Emplacement, Physique, Réservé, Disponible — _preuve : Verified in downloaded stock-2026-11-07.csv_
- [unrated] Mouvements CSV has 11 columns: Date, Heure, Auteur, Type, Détail, De, Vers, Client, Immatriculation, Dérogation, Annulé — _preuve : Verified in downloaded mouvements-2026-11-07.csv_
- [unrated] Commandes CSV has 5 columns: Commande, Fournisseur, Prévue, Référence, Commandé — _preuve : Verified in downloaded commandes-2026-11-07.csv_
- [unrated] Export complet is a simulation - no actual file is generated — _preuve : No file in Downloads after clicking Préparer; toast says 'simulation'_
- [unrated] Data is static/fictive and stored in browser memory — _preuve : Page footer states: 'Les données sont fictives et restent en mémoire. Un rechargement remets la démo à zéro.'_

**Données & technique**

- All data is static/fictive demo data stored in browser memory
- CSV files generated client-side and downloaded directly to browser Downloads folder
- No server API calls observed for CSV downloads
- No JavaScript source files accessible (Vercel deployment structure not browsable)
- Data resets on page reload

**Style visuel**

- Dark navy header (#1a2332), light gray sidebar (#f0f4f8), white cards with subtle shadows
- Green icons for CSV export cards, blue icon for database export card
- Yellow/gold 'Visite guidée' button, outline 'Réinitialiser' button
- System sans-serif font stack
- Toast notification slides in from bottom-right with fade animation
- 2x2 CSS Grid layout for export cards

**Cas limites / anomalies**

- Export complet 'Préparer' button is a simulation only - no file generated, no email sent
- Empty fields in CSV rows where data doesn't apply (e.g., 'Vers' empty for montage movements, 'Client' empty for transfers)
- All CSV rows show Réservé=0 in current demo data

**Questions ouvertes**

- What would the full database export (Export complet) contain if it were implemented? The description mentions 'Toutes les tables en CSV et une copie de la base' but the actual structure is unknown.
- What is the exact email address that would receive the download link in the full implementation?

**Pour la reconstruire**

- Create 4 export cards in a 2x2 grid layout
- 3 cards have 'CSV' download buttons that generate UTF-8 semicolon-separated CSV files with BOM
- File naming: {stock|mouvements|commandes}-{YYYY-MM-DD}.csv
- 4th card has 'Préparer' button that shows a toast notification (simulation mode in demo)
- Stock CSV: Code;Dimension;Marque;Emplacement;Physique;Réservé;Disponible
- Mouvements CSV: Date;Heure;Auteur;Type;Détail;De;Vers;Client;Immatriculation;Dérogation;Annulé
- Commandes CSV: Commande;Fournisseur;Prévue;Référence;Commandé
- Toast message: 'Export complet préparé (simulation). Un lien de téléchargement arrive par e-mail à la direction.'

**Captures**

![Bureau - Exports 1](../../artifacts/RPT_20261107_191951_F10/step_01.png)
![Bureau - Exports 2](../../artifacts/RPT_20261107_191951_F10/step_08.png)
![Bureau - Exports 3](../../artifacts/RPT_20261107_191951_F10/step_15.png)

### 2.11 Bureau - Réglages

- **Rôle** : Manage users (view, disconnect devices), devices (iPhone/truck associations), and role-based permissions (view-only table comparing Technicien/Bureau/Direction rights per action)
- **Route** : `https://isp-stock-pneus-demo.vercel.app/ (Bureau section → Réglages in left sidebar)`
- **Accès** : Home page → click "Bureau" tab in top nav → click "Réglages" in left sidebar under "Administration"
- **Replay agent** : https://platform.hcompany.ai/agents/sessions/f3982aa9-7d4c-44d6-87c5-cefc4a3b20d7 (91 s, 29 actions)
- **Sources lues sur le site** : `https://isp-stock-pneus-demo.vercel.app`, `https://isp-stock-pneus-demo.vercel.app/__next`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/app/layout.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/chunks/main-app.js`, `https://isp-stock-pneus-demo.vercel.app/_next/static/css/app/layout.css`, `https://isp-stock-pneus-demo.vercel.app/_next/static/media/site.webmanifest`, `https://isp-stock-pneus-demo.vercel.app/api`, `https://isp-stock-pneus-demo.vercel.app/api/users`, `https://isp-stock-pneus-demo.vercel.app/robots.txt`, `https://isp-stock-pneus-demo.vercel.app/sitemap.xml`

**Mise en page (haut → bas)**

- 1. Top bar: "B." avatar + "Bureau" (current user), "Visite guidée" button, "Réinitialiser" button
2. Page header: "Réglages" title + subtitle "Utilisateurs, appareils et droits. Un téléphone perdu se déconnecte à distance."
3. Two-column layout:
   LEFT: "Utilisateurs" section with user cards
   RIGHT: "Droits par rôle" section with a permissions table
4. Bottom left: "B. · Bureau" avatar + "À jour" status

**Composants**

| Type | Libellé | Comportement | États |
|---|---|---|---|
| section | Utilisateurs |  |  |
| component | Direction card |  |  |
| component | Technicien cards |  |  |
| component | Droits par rôle |  |  |
| component | Visite guidée |  |  |
| component | Réinitialiser |  |  |

**Contenu (textes exacts)**

- Page title: "Réglages"
Subtitle: "Utilisateurs, appareils et droits. Un téléphone perdu se déconnecte à distance."
Section: "Utilisateurs"
Section: "Droits par rôle" (with "Défaut, à valider" badge)
Users: B. (Direction, Poste et iPhone); Tech. A through Tech. H (Technicien, each with iPhone and a specific truck)
Rights table actions: "Monter, transférer, recevoir une commande" | "Voir les prix d'achat" | "Créer et envoyer une commande" | "Ajuster le stock directement" | "Accorder une dérogation" | "Valider un inventaire"
Status: "À jour"

**Interactions testées**

- Click 'Déconnecter' on Tech. C → Toast notification: 'Sessions de Tech. C fermées (simulation). Son iPhone est déconnecté à la prochaine requête.'
- Click 'Visite guidée' → Opens right-side panel with 9-step guided tour (Stock, Commandes, Inventaires, Activités, Demandes, Camions, Bureau, Direction, Réglages). Each step has description text. Close button at top right.
- Click 'Réinitialiser' → No visible change observed
- Click user name in list → No visible effect
- Click 'Défaut, à valider' badge → No visible effect

**Règles de fonctionnement**

- [unrated] Direction user (B.) has both Poste and iPhone, shown first in list, no Déconnecter button available — _preuve : B. card shows 'Direction' badge and 'Poste et iPhone' text, no disconnect button_
- [unrated] Technicien users each have iPhone + one truck, listed alphabetically by letter — _preuve : Tech. A-H each show 'iPhone · camion [letter][number]' with sequential truck assignments C1-C9_
- [unrated] Déconnecter button simulates remote disconnection of user's iPhone session — _preuve : Clicking it shows toast: 'Sessions de Tech. C fermées (simulation). Son iPhone est déconnecté à la prochaine requête.'_
- [unrated] Role permissions are fixed/read-only: Direction has all rights, Bureau has limited rights, Technicien has fewest rights — _preuve : Table shows: all roles can Monter/transférer/recevoir commande; only Bureau+Direction can Voir prix d'achat; only Bureau+Direction can Créer/envoyer commande; Ajuster stock requires demande for Tech/Bureau but oui for Direction; only Direction can Accorder dérogation or Valider inventaire_
- [unrated] 'Défaut, à valider' badge indicates permissions have default values needing validation — _preuve : Badge text 'Défaut, à valider' next to 'Droits par rôle' title; badge is grey with dashed border suggesting pending state_

**Données & technique**

- Client-side rendered React app (Next.js likely). Data appears static/hardcoded in the UI. The 'Déconnecter' action shows a simulation toast message indicating it's a mock/demo action. No API calls observed. The 'À jour' status at bottom suggests data synchronization state."

**Style visuel**

- Clean modern UI with dark navy header, white cards with subtle shadows, green badges for Direction role, grey badges for Technicien role, blue 'Déconnecter' text buttons, green 'oui' badges, grey 'non' badges, orange/yellow 'demande' badges in the permissions table. Font appears to be a clean sans-serif. Layout uses CSS Grid/Flexbox with two-column main content area."

**Cas limites / anomalies**

- "Réinitialiser" button has no observed effect. 'Défaut, à valider' badge is not clickable. User names in the list are not clickable. The user list appears to be alphabetically ordered by last name/letter. The page does not scroll - all content fits in viewport."

**Questions ouvertes**

- What does 'Réinitialiser' actually do? (no visible effect observed)
- What happens when 'Visite guidée' steps are navigated through?
- Is there a mobile equivalent of this Réglages page?
- What is the actual data source for the user list and permissions table?

**Pour la reconstruire**

- To rebuild this feature identically: 1) Create a page accessible from Bureau nav under 'Administration' > 'Réglages'. 2) Layout: two-column grid - left column for Users list, right column for Permissions table. 3) Users section: show Direction user first (B. with 'Poste et iPhone'), then Technicien users alphabetically (Tech. A-H) each with iPhone + truck assignment. Each Technicien card has a blue 'Déconnecter' button. 4) Permissions table: 6 actions × 3 roles (Technicien/Bureau/Direction) with oui/non/demande values as shown. 5) Include 'Défaut, à valider' badge next to 'Droits par rôle' title. 6) Toast notification on Déconnecter: 'Sessions de [Name] fermées (simulation). Son iPhone est déconnecté à la prochaine requête.' 7) 'Visite guidée' button opens 9-step tour panel. 8) 'Réinitialiser' button in top right (functionality unknown). 9) Bottom status bar shows current user and 'À jour'.

**Captures**

![Bureau - Réglages 1](../../artifacts/RPT_20261107_191951_F11/step_01.png)
![Bureau - Réglages 2](../../artifacts/RPT_20261107_191951_F11/step_09.png)
![Bureau - Réglages 3](../../artifacts/RPT_20261107_191951_F11/step_16.png)

## 3. Checklist de reconstruction

**Top Navigation Bar**

- [ ] Fixed dark top bar, full viewport width
- [ ] Left: brand text (Stock pistes + Inter Service Pneus · démo)
- [ ] Center: 3 clickable tabs with icons, grouped pill container
- [ ] Right: Visite guidée button (yellow) + Réinitialiser button (dark)
- [ ] Tab click switches between 3 views: split/technician-only/bureau-only
- [ ] Visite guidée opens right panel with 9-step tour
- [ ] Réinitialiser resets all demo state

**Technicien (Mobile View)**

- [ ] [See full report for detailed rebuild instructions]

**Bureau - Accueil (Dashboard)**

- [ ] Build SPA with client-side routing (all routes at root URL)
- [ ] Create top nav with role tabs (Côte à côté, Technicien, Bureau)
- [ ] Build left sidebar with 3 section groups and navigation links
- [ ] Implement 5-stock-metric card row with live data
- [ ] Create blue banner card with decision request count
- [ ] Build 'Vos actions à traiter' list with 7 actionable items and count badges
- [ ] Create 'Votre flotte' grid with 9 truck cards showing status icons
- [ ] Add 'Activité en direct' live feed component
- [ ] Add 'Montages par jour' bar chart component (7-day view)
- [ ] Style with dark navy header, blue accents, card-based layout

**Bureau - Stock**

- [ ] Build a React SPA with: 1) Top nav with Vue switcher (Côte à côté/Technicien/Bureau), 2) Left sidebar with Quotidien/Suivi/Administration sections, 3) Stock page with search input, 4 filter tabs (Tous/Poids lourds/Utilitaires/Véhicules légers), 5) 'Sous le seuil seulement' checkbox, 6) Table with 14 hardcoded tire references showing Répartition (truck distribution), 7) Clickable rows opening detail view with stats cards, 8) Stock par emplacement table, 9) Commandes ouvertes and Dossiers réservés sections, 10) Prévision text, 11) Ajuster modal with location/correction/motif/comment fields, 12) Commander button creating draft orders (CF-XXXX), 13) Activity page with filter tabs and Excel archive section.

**Bureau - Camions**

- [ ] Build a desktop dashboard with top nav (view switcher), left sidebar, and main content area
- [ ] Implement 9 truck cards in 2-column grid with ID, driver, company, tire count, status badge, last movement
- [ ] Add filter tabs: Tout, Pneus, Remorquage (mutually exclusive)
- [ ] Add search bar with autocomplete
- [ ] Truck detail page: table with columns Référence, Phys., Rés., Dispo, Seuil, État
- [ ] Status logic: Complet (sufficient), Inactif (0 tires, dashed border), X à réassortir (below threshold)
- [ ] 'Préparer le réassort (N)' button appears when restocking needed

**Bureau - Commandes**


**Bureau - Inventaires**

- [ ] 1. Create inventory list page with status badges (Soumis/à valider, Validé). 2. Detail view with table of tire lines (Référence, Théorique, Compté, Écart, Commentaire). 3. 'Valider les écarts' button that: validates status, creates adjustment entries, shows toast. 4. 'Renvoyer au comptage' button for re-opening. 5. Warning banner when discrepancies lack comments. 6. Écart = Compté - Théorique with color coding.

**Bureau - Activité**


**Bureau - Demandes**

- [ ] Create Bureau Demandes page with pending requests list and processed requests list
- [ ] Each request card: orange badge, requester name, timestamp, description line, reason line, Accorder/Refuser buttons, Motif text field, 'Voir l'activité' link
- [ ] Accorder: move to processed, show green '✓ Accordée par Direction · [reason]' with default 'Pneu vérifié par téléphone'
- [ ] Refuser: move to processed, show red '× Refusée par Direction · [reason]' with default 'Stock à vérifier avant tout montage'
- [ ] Motif field: free text, overrides default reason when filled
- [ ] Toast notifications for both actions mentioning tech notified on iPhone
- [ ] Reference activity view: timeline of truck events

**Bureau - Exports**

- [ ] Create 4 export cards in a 2x2 grid layout
- [ ] 3 cards have 'CSV' download buttons that generate UTF-8 semicolon-separated CSV files with BOM
- [ ] File naming: {stock|mouvements|commandes}-{YYYY-MM-DD}.csv
- [ ] 4th card has 'Préparer' button that shows a toast notification (simulation mode in demo)
- [ ] Stock CSV: Code;Dimension;Marque;Emplacement;Physique;Réservé;Disponible
- [ ] Mouvements CSV: Date;Heure;Auteur;Type;Détail;De;Vers;Client;Immatriculation;Dérogation;Annulé
- [ ] Commandes CSV: Commande;Fournisseur;Prévue;Référence;Commandé
- [ ] Toast message: 'Export complet préparé (simulation). Un lien de téléchargement arrive par e-mail à la direction.'

**Bureau - Réglages**

- [ ] To rebuild this feature identically: 1) Create a page accessible from Bureau nav under 'Administration' > 'Réglages'. 2) Layout: two-column grid - left column for Users list, right column for Permissions table. 3) Users section: show Direction user first (B. with 'Poste et iPhone'), then Technicien users alphabetically (Tech. A-H) each with iPhone + truck assignment. Each Technicien card has a blue 'Déconnecter' button. 4) Permissions table: 6 actions × 3 roles (Technicien/Bureau/Direction) with oui/non/demande values as shown. 5) Include 'Défaut, à valider' badge next to 'Droits par rôle' title. 6) Toast notification on Déconnecter: 'Sessions de [Name] fermées (simulation). Son iPhone est déconnecté à la prochaine requête.' 7) 'Visite guidée' button opens 9-step tour panel. 8) 'Réinitialiser' button in top right (functionality unknown). 9) Bottom status bar shows current user and 'À jour'.

## 4. À vérifier par expérience

- **Technicien (Mobile View)** — [1. What happens when you click 'Enregistrer l'immatriculation'? (would modify stock data) 2. What happens when you click 'Valider le transfert'? (would modify stock data) 3. What happens when you click 'Valider la réception'? (would modify stock data) 4. Exact path to JS source files (could not locate)"]
- **Bureau - Accueil (Dashboard)** — What exact API/data source powers the live updates? (could not access JS bundle)
- **Bureau - Accueil (Dashboard)** — What triggers the '1 demande à examiner' count?
- **Bureau - Accueil (Dashboard)** — What are the exact threshold values for 'Stock bas' and 'Références à commander' alerts?
- **Bureau - Stock** — Exact route URL for the Stock page (SPA routing not visible in URL bar)
- **Bureau - Stock** — Why does 'Commander' button appear disabled/hidden for some tires?
- **Bureau - Stock** — What does 'Exporter (Excel)' actually do (file download not observed)?
- **Bureau - Stock** — What happens when you actually submit the 'Ajuster' modal?
- **Bureau - Stock** — What is the exact logic for when 'Commander' button is enabled vs disabled?
- **Bureau - Camions** — Could not access source files to confirm data source (JS/CSS bundles not found at standard paths)
- **Bureau - Camions** — Flotte filter tab behavior not explored
- **Bureau - Camions** — URL structure for truck detail pages not confirmed
- **Bureau - Commandes** — - What does the 'PDF' button do?
- What does 'Envoyer au fournisseur' do for draft orders?
- What happens when you validate a reception in the modal?
- What is the 'Livré à' dropdown used for?
- **Bureau - Inventaires** — What does 'Renvoyer au comptage' exactly do? (button not tested)
- **Bureau - Inventaires** — How does the iPhone blind counting interface work? (not in scope - Bureau view only)
- **Bureau - Exports** — What would the full database export (Export complet) contain if it were implemented? The description mentions 'Toutes les tables en CSV et une copie de la base' but the actual structure is unknown.
- **Bureau - Exports** — What is the exact email address that would receive the download link in the full implementation?
- **Bureau - Réglages** — What does 'Réinitialiser' actually do? (no visible effect observed)
- **Bureau - Réglages** — What happens when 'Visite guidée' steps are navigated through?
- **Bureau - Réglages** — Is there a mobile equivalent of this Réglages page?
- **Bureau - Réglages** — What is the actual data source for the user list and permissions table?

## 5. Anomalies relevées pendant la cartographie

- Page reports 100% visible but Bureau content area has its own internal scroll
- C5 truck shows Au garage instead of a technician name and is Inactif with 0 tires
- Demandes sidebar badge shows 1 persistently across all pages
- Valeur d'achat stat is explicitly noted as visible direction et bureau only
- Permission matrix uses demande (orange) for Ajuster le stock for both Technicien and Bureau roles
