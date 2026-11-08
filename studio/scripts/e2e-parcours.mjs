#!/usr/bin/env node
/**
 * Test 7 — parcours CLIENT complet dans un VRAI navigateur (Chrome headless via DevTools), sur une pile
 * ISOLÉE : Studio de production (build dédié), ancien logiciel de test Relatio 2004 et logiciel livré dans
 * un dossier temporaire, sur des ports libres, avec des secrets aléatoires. Aucune donnée réelle touchée.
 * Chaque étape se fait en cliquant dans l'interface :
 *
 *   accueil public → inscription (cases de consentement non cochées) → espace → « Nouvelle migration »
 *   (assistant en 3 étapes) → « Analyser mon logiciel » → « Agent d'analyse non disponible pour le moment. »
 *   → test réel du connecteur sur le logiciel de test → découverte → données → correspondances → migration
 *   → validation → reconstruction → livraison → « Créer mon accès au logiciel » → activation dans le CRM
 *   livré avec un mot de passe choisi → devis à 3 lignes calculé par le serveur → historique protégé →
 *   vues mobiles 390 et 320 px.
 *
 *   node scripts/e2e-parcours.mjs              (construit le Studio dans platform/.next-test si nécessaire)
 *   REBORN_DIST_DIR=.next-xxx SHOTS_DIR=… node scripts/e2e-parcours.mjs
 * Captures : SHOTS_DIR, sinon un dossier temporaire (jamais dans le dépôt) ; aucun secret n'y figure
 * (mots de passe masqués par les champs, lien d'activation masqué avant la capture).
 */
import fs from "node:fs";
import path from "node:path";
import { checker, createStack, shotsDir, distDir, ensureBuild, launchChrome, legalVersions, secret, up } from "./acceptance/stack.mjs";

const AGENT_UNAVAILABLE = "Agent d'analyse non disponible pour le moment.";
const NO_EXPLORATION = "Exploration indisponible — agent non connecté.";
const SHOTS = shotsDir("parcours");

const { check, results, failed } = checker();
const dist = distDir();
ensureBuild(dist);
const stack = createStack("parcours");
const relatio = await stack.startRelatio();
const studio = await stack.startStudio({ dist, egress: [`127.0.0.1:${relatio.port}`] });
const BASE = studio.url;
const REL = relatio.url;
const CRM = `http://127.0.0.1:${studio.crmPort}`;
const PROJECT_CONNEXION = /^\/projets\/MIG_[a-f0-9]{8}\/connexion$/;
let b;

try {
  b = await launchChrome(stack, { base: BASE, shotsDir: SHOTS, onDialog: "Test parcours" });
  const { evaluate, waitFor, hasText, goto, click, clickWhen, fill, shot, overflow, resize } = b;
  const MOBILE_320 = { width: 320, height: 844, mobile: true };
  /** Débordement à 320 px dans l'état affiché (sans recharger : un lien montré une seule fois reste à l'écran). */
  const overflow320 = async (name, label) => {
    await resize(MOBILE_320);
    await new Promise((r) => setTimeout(r, 800));
    const o = await overflow();
    check(`Mobile 320 px sans débordement horizontal : ${label}`, o <= 0, `${o}px`);
    return o;
  };
  check("Studio et ancien logiciel de test démarrés (dossiers temporaires, build isolé)", (await up(`${BASE}/api/health`, 60000, (r) => r.ok)) && (await up(`${REL}/login`, 60000, (r) => r.ok)));
  const relPassword = stack.relatioPassword();
  const V = legalVersions();
  const account = { firstName: "Camille", lastName: "Morel", company: "Morel Équipements", email: `camille.morel.${secret(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}@exemple.test`, password: `Phrase-de-test-${secret(9)}` };
  const pageHas = (s) => evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(s)}) || JSON.stringify({ ...localStorage, ...sessionStorage }).includes(${JSON.stringify(s)})`);

  /* 1. Accueil public → inscription réelle -------------------------------------- */
  await goto("/");
  check("Accueil public sans compte : « Commencer une migration » mène à l'inscription", (await hasText("Your software. Reborn.")) && (await waitFor(`[...document.querySelectorAll("a")].some((a) => a.textContent.includes("Commencer une migration") && a.getAttribute("href").startsWith("/inscription"))`, 5000)));
  await shot("01-accueil");
  // Pages publiques SANS compte à 320 px : en-tête « Se connecter » + « Créer un compte ». Les mesures de fin de
  // parcours sont faites connecté (en-tête « Mon espace ») et ne verraient pas ce débordement (constats ISO-2, C3).
  for (const [name, url] of [["accueil", "/"], ["conditions", "/legal/conditions"], ["confidentialite", "/legal/confidentialite"]]) {
    await goto(url, MOBILE_320);
    await new Promise((r) => setTimeout(r, 500));
    const o = await overflow();
    check(`Mobile 320 px sans débordement horizontal, sans compte : ${name}`, o <= 0, `${o}px`);
  }
  await goto("/");
  check("« Accéder à mes projets » sans compte : page de connexion", (await clickWhen("Accéder à mes projets", 5000, "a")) && (await waitFor("location.pathname === '/connexion'", 15000)));
  check("Connexion : aucune réinitialisation en libre-service présentée comme opérationnelle", (await hasText("Mot de passe oublié ? Un administrateur REBORN peut vous transmettre un lien de réinitialisation.")) && !(await waitFor(`[...document.querySelectorAll("a, button")].some((x) => /mot de passe oublié/i.test(x.textContent))`, 1000)));
  await shot("02-connexion");
  check("Lien « Créer un compte »", (await clickWhen("Créer un compte", 5000, "a")) && (await waitFor("location.pathname === '/inscription' && !!document.querySelector('form [name=firstName]')", 15000)));
  check(
    "Inscription : deux cases de consentement NON cochées, texte exact et version",
    (await evaluate(`document.querySelector("[name=terms]").checked === false && document.querySelector("[name=privacy]").checked === false`)) &&
      (await hasText(`J'accepte les conditions d'utilisation (version ${V.terms}).`)) &&
      (await hasText(`J'ai pris connaissance de la politique de confidentialité (version ${V.privacy}).`)),
  );
  for (const [name, v] of [["firstName", account.firstName], ["lastName", account.lastName], ["company", account.company], ["email", account.email]]) await fill(`form [name=${name}]`, v);
  await shot("03-inscription"); // avant la saisie du mot de passe : aucune trace, même masquée, dans les captures
  await fill("form [name=password]", account.password);
  await fill("form [name=confirm]", account.password);
  await clickWhen("Créer mon compte", 5000, "button");
  check("Sans les cases : inscription refusée, erreur sous la case", (await hasText("Acceptez les conditions d'utilisation pour créer un compte.", 5000)) && (await evaluate("location.pathname")) === "/inscription");
  await fill("form [name=terms]", true);
  await fill("form [name=privacy]", true);
  await clickWhen("Créer mon compte", 5000, "button");
  check("Compte créé par l'inscription réelle : espace personnel ouvert", await waitFor("location.pathname === '/espace'", 20000));
  const me = await evaluate(`fetch("/api/me").then((r) => r.json())`);
  check("Session du compte client, deux consentements enregistrés", me?.user?.email === account.email && me?.user?.role === "client" && (me?.consents ?? []).length >= 2, `${me?.user?.role} · ${(me?.consents ?? []).map((c) => c.kind).join(", ")}`);
  await shot("04-espace");

  /* 2. « Nouvelle migration » : assistant en 3 étapes (champs désignés par leur nom) --- */
  check("Espace → « Nouvelle migration »", (await clickWhen("Nouvelle migration", 5000, "a")) && (await waitFor("location.pathname === '/projets/nouveau' && !!document.querySelector('form [name=company]')", 15000)));
  await fill("form [name=company]", "Morel Équipements");
  await fill("form [name=software]", "Relatio 2004");
  await fill("form [name=legacy_url]", REL);
  await shot("05-assistant-1-logiciel");
  await clickWhen("Continuer", 5000, "button");
  check("Étape 2 « Accès » : compte confié par défaut, champs identifiant et mot de passe", await waitFor(`!!document.querySelector("input[type=radio][name=access_mode][value=account]:checked") && !!document.querySelector("form [name=legacy_username]") && document.querySelector("form [name=legacy_password]")?.type === "password"`, 10000));
  await fill("form [name=legacy_username]", "migration");
  await shot("06-assistant-2-acces");
  await fill("form [name=legacy_password]", relPassword);
  await clickWhen("Continuer", 5000, "button");
  check("Étape 3 : autorisation et information NON pré-cochées", await waitFor(`document.querySelector("form [name=authorization]")?.checked === false && document.querySelector("form [name=credentials_notice]")?.checked === false`, 10000));
  await fill("form [name=authorization]", true);
  await fill("form [name=credentials_notice]", true);
  await shot("07-assistant-3-autorisation");
  check("« Analyser mon logiciel » : projet créé", (await clickWhen("Analyser mon logiciel", 5000, "button")) && (await hasText("Projet créé", 20000)));
  check(`Sans agent : message exact « ${AGENT_UNAVAILABLE} », rien de simulé`, (await hasText(AGENT_UNAVAILABLE, 15000)) && (await hasText("Aucune exploration n'a commencé")));
  check("Le mot de passe n'apparaît nulle part dans la page ni dans le stockage du navigateur", !(await pageHas(relPassword)) && !(await pageHas(account.password)));
  await shot("08-assistant-resultat");

  /* 3. Connexion : file d'attente, test réel du connecteur ------------------------ */
  await clickWhen("Suivre la demande", 5000, "a");
  check("Projet ouvert sur son étape Connexion (/projets/MIG_…/connexion)", await waitFor(`${PROJECT_CONNEXION}.test(location.pathname)`, 15000));
  const projectUrl = await evaluate("location.pathname");
  const pid = projectUrl.split("/")[2];
  check("Connexion : demande « En file d'attente », message exact, agent « Non disponible »", (await hasText("En file d'attente", 15000)) && (await hasText(AGENT_UNAVAILABLE)) && (await hasText("Non disponible")));
  await shot("09-connexion-en-file");
  await overflow320("connexion-en-file", "connexion en file d'attente (identifiants déposés)");
  await shot("09b-mobile-320-connexion-en-file");
  await resize();
  await clickWhen("Logiciel de test Relatio 2004", 5000);
  check("Test réel du connecteur HTTP sur le logiciel de test (étiqueté) → « Connecté »", (await clickWhen("Tester la connexion", 10000, "button")) && (await hasText("Connecté", 20000)));
  await shot("10-connexion-reussie");
  await overflow320("connexion-testee", "connexion testée (identifiants encore déposés, avant l'extraction)");
  await shot("10b-mobile-320-connexion-testee");
  await resize();

  /* 4. Découverte ------------------------------------------------------------------ */
  await goto(`/projets/${pid}/decouverte`);
  check(`Découverte : « ${NO_EXPLORATION} »`, await hasText(NO_EXPLORATION, 15000));
  await shot("11-decouverte");

  /* 5. Données --------------------------------------------------------------------- */
  await goto(`/projets/${pid}/extraction`);
  check("Extraction avec le plan de test (étiqueté)", (await clickWhen("Extraire avec le plan de test", 10000, "button")) && (await hasText("clients", 60000)));
  check("Exports refusés au compte consignés", await hasText("refus", 20000));
  await shot("12-donnees");

  /* 6. Correspondances --------------------------------------------------------------- */
  await goto(`/projets/${pid}/correspondances`);
  check("Jeu de test de l'Analyste reçu", (await clickWhen("Jeu de test au format de l'Analyste — Relatio", 10000, "button")) && (await hasText("T_CLIENT", 30000)));
  let accepted = 0;
  for (let i = 0; i < 30; i++) {
    // Boutons de chaque point de la liste « À vérifier » (jamais « Accepter toutes les propositions restantes », en tête de section)
    const ok = (await click("Garder la protection", "#a-verifier li button")) || (await click("Accepter", "#a-verifier li button"));
    if (!ok) break;
    accepted++;
    await new Promise((r) => setTimeout(r, 500));
  }
  check("Points incertains validés un par un", accepted > 0 && (await hasText("Passer à la migration", 15000)), `${accepted} décision(s)`);
  await shot("13-correspondances");

  /* 7. Migration --------------------------------------------------------------------- */
  await goto(`/projets/${pid}/migration`);
  check("Migration lancée depuis l'interface", (await clickWhen("Lancer la migration", 15000, "button")) && (await hasText("RUN_001", 90000)));
  check("Résultat par entité et rejets motivés", await hasText("rejet", 20000));
  await shot("14-migration");

  /* 8. Validation -------------------------------------------------------------------- */
  await goto(`/projets/${pid}/validation`);
  check("Rapport de vérification indépendante", await hasText("Vérification", 20000));
  if (await waitFor(`[...document.querySelectorAll("button")].some((x) => x.textContent.includes("Accepter les écarts documentés"))`, 8000)) {
    await fill("textarea[name=comment]", "Écarts examinés (test du parcours)");
    check("Écarts documentés acceptés avec un commentaire", (await clickWhen("Accepter les écarts documentés", 5000, "button")) && (await hasText("Écarts acceptés", 20000)));
  }
  await shot("15-validation");

  /* 9. Reconstruction ---------------------------------------------------------------- */
  await goto(`/projets/${pid}/reconstruction`);
  check("Spécification du nouveau logiciel affichée (provenance, non reconstruit)", await hasText("non reconstruit", 20000));
  check("Modèle métier reçu (jeu de test étiqueté)", (await clickWhen("Recevoir le jeu de test Relatio", 10000, "button")) && (await hasText("v1", 20000)));
  check("Modèle rejoué sur l'historique", (await clickWhen("Rejouer sur l'historique", 10000, "button")) && (await hasText("identique", 60000)));
  await evaluate(`(() => { const t = [...document.querySelectorAll("textarea")].at(-1); if (t) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "Rejoué sur l'historique"); t.dispatchEvent(new Event("input", { bubbles: true })); } return true; })()`);
  check("Version validée par le responsable du projet", (await clickWhen("Valider cette version", 10000, "button")) && (await hasText("validée", 20000)));
  await shot("16-reconstruction");
  check("Génération et mise en service", (await clickWhen("Générer et mettre en service", 15000, "button")) && (await waitFor(`fetch("/api/migration/app?project=${pid}").then((r) => r.json()).then((a) => a.running)`, 90000)));

  /* 10. Livraison : « Créer mon accès au logiciel » ------------------------------------ */
  await goto(`/projets/${pid}/livraison`);
  check("Livraison : logiciel en service, lien réel", (await hasText("En service", 20000)) && (await hasText(`127.0.0.1:${studio.crmPort}`, 5000)) && (await hasText("Logiciel livré", 5000)));
  const admin = stack.deliveredApps()[0];
  const adminPw = admin ? JSON.parse(fs.readFileSync(path.join(stack.appsDir, admin.id, ".secrets", "admin.json"), "utf8")).password : null;
  check("Aucun mot de passe affiché dans la livraison", !!adminPw && !(await pageHas(adminPw)) && !(await pageHas(relPassword)));
  await shot("17-livraison");
  await clickWhen("Créer mon accès au logiciel", 10000, "button");
  const shown = await waitFor(`[...document.querySelectorAll("code")].some((c) => c.textContent.includes("#/activation/"))`, 15000);
  const link = await evaluate(`[...document.querySelectorAll("code")].map((c) => c.textContent).find((t) => t.includes("#/activation/"))`);
  check("« Créer mon accès au logiciel » : lien d'activation à usage unique affiché", shown && new RegExp(`^${CRM.replace(/[.]/g, "\\.")}/#/activation/[A-Za-z0-9_-]{20,}$`).test(link ?? "") && (await hasText("vous choisirez votre propre mot de passe")));
  // Lien affiché une seule fois : mesure à 320 px dans cet état (le lien réel, sans aucune capture)
  await overflow320("livraison-acces", "livraison, lien d'accès affiché");
  await resize();
  // Aucun secret dans une capture : le jeton est masqué dans la page avant la photo
  await evaluate(`[...document.querySelectorAll("code")].forEach((c) => { if (c.textContent.includes("#/activation/")) c.textContent = c.textContent.replace(/(#\\/activation\\/).+$/, "$1•••••••• (masqué pour la capture)"); })`);
  await shot("18-livraison-acces");
  await resize(MOBILE_320);
  await new Promise((r) => setTimeout(r, 500));
  await shot("18b-mobile-320-livraison-acces");
  await resize();
  const token = (link ?? "").split("/").at(-1);
  const state = await evaluate(`fetch("/api/state?project=${pid}").then((r) => r.text())`);
  check("Le lien n'est pas journalisé par le Studio", !!token && !(state ?? "").includes(token));

  /* 11. Logiciel livré : activation avec un mot de passe choisi ------------------------ */
  await goto(link);
  check("Écran d'activation du logiciel livré", await hasText("Activer votre accès", 15000));
  const chosen = `ma phrase de passe choisie ${secret(6)}`;
  await shot("19-crm-activation");
  await fill("#ac-pw", chosen);
  await fill("#ac-pw2", chosen);
  await evaluate(`document.querySelector("#activate").requestSubmit()`);
  check("Accès activé avec le mot de passe choisi : connecté au nouveau logiciel", await hasText("Tableau de bord", 20000));
  const who = await evaluate(`fetch("/api/auth/me").then((r) => r.json())`);
  check("Connecté au nom du propriétaire du projet (administrateur)", who?.user === account.email && who?.role === "admin", `${who?.role}`);
  const loginWith = (pw) => evaluate(`fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: ${JSON.stringify(account.email)}, password: ${JSON.stringify(pw)} }) }).then((r) => r.status)`);
  check("Les mots de passe du Studio et de l'ancien logiciel n'y donnent pas accès", (await loginWith(account.password)) === 401 && (await loginWith(relPassword)) === 401 && (await loginWith(chosen)) === 200);
  check("Lien d'activation à usage unique (réutilisation refusée)", (await evaluate(`fetch("/api/auth/invitation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ${JSON.stringify(token)} }) }).then((r) => r.status)`)) === 410);
  await shot("20-crm-tableau-de-bord");

  /* 12. Nouveau CRM : devis à 3 lignes calculé par le serveur --------------------------- */
  await goto(`${CRM}/#/e/devis/new`);
  await waitFor("document.querySelector('form [name=numero]')");
  const firstClient = await evaluate(`fetch("/api/e/clients?per=1").then((r) => r.json()).then((d) => d.rows[0].id)`);
  await fill("form [name=numero]", "D2026-P0001");
  const clientField = await evaluate(`document.querySelector("form [name=client]")?.tagName`);
  await fill("form [name=client]", String(firstClient));
  await fill("form [name=date]", "2026-11-07");
  await fill("form [name=remise_pct]", "5");
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("Devis créé depuis l'interface", await waitFor("/#\\/e\\/devis\\/\\d+/.test(location.hash)", 20000), `champ client : ${clientField}`);
  const article = await evaluate(`fetch("/api/e/articles?per=3").then((r) => r.json()).then((d) => d.rows.map((x) => x.id))`);
  for (const [i, art] of (article ?? []).entries()) {
    await waitFor("document.querySelector('#line-form')");
    await fill("#line-form [name=article]", String(art));
    await fill("#line-form [name=quantite]", String(i + 2));
    await fill("#line-form [name=remise_pct]", "0");
    await new Promise((r) => setTimeout(r, 600));
    await evaluate(`document.querySelector("#line-form").requestSubmit()`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const devisId = await evaluate("location.hash.match(/devis\\/(\\d+)/)?.[1]");
  const devis = await evaluate(`fetch("/api/e/devis/${devisId}").then((r) => r.json())`);
  const lines = devis?.children?.["devis_lignes.devis"]?.total ?? 0;
  check("3 lignes ajoutées dans l'interface, montants calculés par le serveur (modèle v1)", lines === 3 && devis?.record?.total_ht > 0 && devis?.record?._rules_version === 1, `${lines} lignes · total HT ${(devis?.record?.total_ht ?? 0) / 100} € · TTC ${(devis?.record?.total_ttc ?? 0) / 100} € · modèle v${devis?.record?._rules_version}`);
  check("Totaux présentés comme calculés par le serveur", await hasText("Calculé par le serveur", 10000));
  await shot("21-crm-devis-calcule");

  /* 13. Protection de l'historique ------------------------------------------------------ */
  const hist = await evaluate(`fetch("/api/e/factures?_migrated=1&per=1").then((r) => r.json()).then((d) => d.rows[0].id)`);
  await goto(`${CRM}/#/e/factures/${hist}`);
  check("Facture historique : protection affichée", await hasText("Historique protégé", 15000));
  const put = await evaluate(`fetch("/api/e/factures/${hist}", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ total_ttc: 1 }) }).then((r) => r.status)`);
  check("Facture historique : modification du montant refusée par le serveur", put === 409 || put === 400, `HTTP ${put}`);
  await shot("22-crm-facture-protegee");

  /* 13b. Projet sans nom de logiciel (champ facultatif) : jamais le jeu de test Relatio (PR-04, V03) ---------- */
  await goto("/espace");
  const other = await evaluate(
    `fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: "Atelier sans nom de logiciel", legacy_url: "https://erp.atelier.example", authorized: true, authorization_version: ${JSON.stringify(V.authorization)} }) }).then(async (r) => ({ status: r.status, id: (await r.json()).project?.id ?? null }))`,
  );
  await goto(`/projets/${other?.id}/extraction`);
  await waitFor("!!document.querySelector('main h1')", 15000);
  const offersTestPlan = await waitFor(`[...document.querySelectorAll("main button")].some((x) => x.textContent.includes("Extraire avec le plan de test"))`, 3000);
  await goto(`/projets/${other?.id}/connexion`);
  await waitFor("!!document.querySelector('main h1')", 15000);
  const offersTestSoftware = await waitFor(`document.querySelector("main").innerText.includes("Logiciel de test Relatio")`, 3000);
  check("Projet sans nom de logiciel : ni extraction ni connexion avec le jeu de test Relatio proposées", other?.status === 201 && !offersTestPlan && !offersTestSoftware, `${other?.status} · plan de test ${offersTestPlan ? "proposé" : "absent"} · logiciel de test ${offersTestSoftware ? "proposé" : "absent"}`);

  /* 14. Mobile 390 et 320 px ------------------------------------------------------------ */
  const pages = [
    ["accueil", "/"],
    ["conditions", "/legal/conditions"],
    ["confidentialite", "/legal/confidentialite"],
    ["espace", "/espace"],
    ["connexion", `/projets/${pid}/connexion`],
    ["correspondances", `/projets/${pid}/correspondances`],
    ["livraison", `/projets/${pid}/livraison`],
    ["crm-devis", `${CRM}/#/e/devis/${devisId}`],
  ];
  for (const width of [390, 320]) {
    for (const [name, url] of pages) {
      await goto(url, { width, height: 844, mobile: true });
      await new Promise((r) => setTimeout(r, 800));
      const o = await overflow();
      check(`Mobile ${width} px sans débordement horizontal : ${name}`, o <= 0, `${o}px`);
      await shot(`23-mobile-${width}-${name}`);
    }
  }
  check("Aucune exception JavaScript", b.exceptions.length === 0, b.exceptions.slice(0, 3).join(" | "));
  // En-têtes de sécurité (W1) : la politique du Studio n'empêche rien de fonctionner, et le navigateur ne signale aucune violation
  check("Aucune violation de la politique de sécurité du contenu (CSP)", b.securityIssues.length === 0, b.securityIssues.slice(0, 3).join(" | "));
  const sec = await fetch(`${BASE}/connexion`).then((r) => Object.fromEntries(["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"].map((k) => [k, r.headers.get(k)])));
  check("En-têtes de sécurité du Studio : CSP (frame-ancestors 'none'), X-Frame-Options, nosniff, Referrer-Policy", /frame-ancestors 'none'/.test(sec["content-security-policy"] ?? "") && sec["x-frame-options"] === "DENY" && sec["x-content-type-options"] === "nosniff" && sec["referrer-policy"] === "no-referrer", JSON.stringify(sec).slice(0, 200));
} catch (e) {
  check("Exécution du parcours", false, e.message);
} finally {
  await b?.close();
  await stack.stop();
  const n = failed();
  if (n) console.log(`\nDernières lignes du journal du Studio :\n${stack.tail("studio", 25)}`);
  stack.cleanup();
  console.log(`\n${results.length - n}/${results.length} vérifications réussies · captures : ${SHOTS}${n ? " · relancer avec REBORN_KEEP_TMP=1 pour garder le dossier de test" : ""}`);
  process.exit(n ? 1 : 0);
}
