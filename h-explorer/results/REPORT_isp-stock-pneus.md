# Rapport de rétro-ingénierie — isp-stock-pneus-demo.vercel.app

> Généré par REBORN Explorer (agent H Company) le 2026-11-07T18:25:43+00:00. URL : https://isp-stock-pneus-demo.vercel.app/
> 11 fonctionnalités analysées (11 réussies), durée totale 351 s. Les observations viennent de l'agent : les points marqués `likely`/`guess` et les questions ouvertes sont à vérifier par expérience avant reconstruction.

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
