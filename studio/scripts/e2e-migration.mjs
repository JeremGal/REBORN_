#!/usr/bin/env node
/**
 * Vue de l'équipe « Data Migration Engine » (/migration, réservée aux opérateurs) dans un VRAI navigateur
 * (Chrome headless via DevTools), sur une pile ISOLÉE : Studio de production construit dans un dossier
 * dédié, ancien logiciel de test Relatio 2004 et logiciel livré dans un dossier temporaire, ports libres,
 * secrets aléatoires. Ni le Studio en service, ni le vrai Relatio (:4100), ni le CRM livré (:5050), ni
 * aucun secret réel (.secrets, legacy-crm/data, generated/) ne sont lus ou modifiés.
 *
 * Parcours : compte opérateur (inscription réelle + scripts/account.mjs sur la base temporaire) →
 * extraction (mot de passe saisi dans le formulaire, jamais conservé) → correspondances (jeu de test au
 * format de l'Analyste) validées → migration et vérification → écarts acceptés (au nom du compte
 * connecté) → mise en service → logiciel livré (accès de secours de l'opérateur) : données migrées,
 * origine, historique verrouillé, création d'un enregistrement, mobile.
 * Le parcours CLIENT complet (comptes, assistant, analyse, livraison, activation) : scripts/e2e-parcours.mjs.
 *
 *   node scripts/e2e-migration.mjs           (construit le Studio dans platform/.next-test si nécessaire)
 *   REBORN_DIST_DIR=.next-xxx SHOTS_DIR=… node scripts/e2e-migration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { checker, createStack, shotsDir, distDir, ensureBuild, launchChrome, makeOperator, signUp, up } from "./acceptance/stack.mjs";

const SHOTS = shotsDir("migration");

const { check, results, failed } = checker();
const dist = distDir();
ensureBuild(dist);
const stack = createStack("migration");
const relatio = await stack.startRelatio();
const studio = await stack.startStudio({ dist, egress: [`127.0.0.1:${relatio.port}`] });
const BASE = studio.url;
const CRM = `http://127.0.0.1:${studio.crmPort}`;
let b;

try {
  check("Studio et ancien logiciel de test démarrés (pile isolée)", (await up(`${BASE}/api/health`, 60000, (r) => r.ok)) && (await up(`${relatio.url}/login`, 60000, (r) => r.ok)));
  const op = await signUp(BASE, { firstName: "Équipe", lastName: "Migration", company: "REBORN (test)" });
  const role = makeOperator(stack, op.email);
  check("Compte opérateur : inscription réelle + npm run account -- operator (base temporaire)", role.ok, role.ok ? "" : role.out.slice(0, 200));
  const legacyPw = stack.relatioPassword();

  b = await launchChrome(stack, { base: BASE, shotsDir: SHOTS, onDialog: "Test e2e" });
  const { evaluate, waitFor, hasText, goto, fill, shot } = b;
  const clickText = (tag, txt) => evaluate(`(() => { const x = [...document.querySelectorAll(${JSON.stringify(tag)})].find(e => e.textContent.trim().includes(${JSON.stringify(txt)}) && !e.disabled); if (!x) return false; x.click(); return true; })()`);
  await goto("/connexion");
  await fill("form [name=email]", op.email);
  await fill("form [name=password]", op.password);
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("Opérateur connecté par le formulaire de connexion", await waitFor("location.pathname === '/espace'", 20000));
  const created = await evaluate(`fetch("/api/migration/project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Migration e2e Relatio → Morel CRM" }) }).then((r) => r.status)`);
  check("Projet de l'équipe créé (POST /api/migration/project, opérateur seulement)", created === 200);

  await goto("/migration");
  check("Studio · page de migration chargée", await hasText("Data Migration Engine"));
  check("Studio · état initial vide", await hasText("Aucune extraction"));

  // 1. Extraction autorisée, mot de passe saisi dans le formulaire (ancien logiciel de test de la pile)
  await fill('input[name="base_url"]', relatio.url);
  await fill('input[name="password"]', legacyPw);
  await clickText("button", "Extraire");
  check("Extraction · exports autorisés récupérés", await hasText("Fichier clients (CSV)", 40000));
  check("Extraction · exports refusés consignés", await waitFor(`document.body.textContent.includes("Accès refusé : droit « direction » requis")`, 20000));
  check("Extraction · CSV Windows-1252 détecté", await hasText("windows-1252"));
  check("Structure · tables et relations affichées", await hasText("relations détectées"));
  check("Sécurité · mot de passe absent de la page", !(await evaluate(`document.documentElement.outerHTML.includes(${JSON.stringify(legacyPw)})`)));

  // 2. Correspondances (jeu au format de l'Analyste) et validation humaine
  await clickText("button", "Jeu de test (format Alan)");
  check("Correspondances · points incertains à valider", await hasText("6 en attente"));
  check("Migration · bloquée tant que non validé", await hasText("correspondance(s) incertaine(s) à valider"));
  for (let i = 0; i < 8; i++) {
    if (!(await clickText("button", "Valider"))) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  check("Correspondances · toutes validées", await hasText("toutes traitées"));

  // 3. Migration réelle + vérification
  await clickText("button", "Lancer la migration");
  check("Migration · exécutée et vérifiée", await waitFor(`document.body.textContent.includes("Validation humaine requise")`, 60000));
  check("Vérification · registre de réconciliation", await hasText("Lignes sources"));
  check("Vérification · rejets signalés avec motif", await hasText("ligne(s) de clients non migrée(s)"));
  check("Vérification · pièces perdues signalées", await hasText("pièce(s) jointe(s) référencée(s) mais non récupérée(s)"));
  check("Vérification · avertissement de portée affiché", await hasText("ne prouvent pas l'absence de données"));
  await shot("migration-1-verification");

  // 4. Acceptation des écarts (au nom du compte connecté, jamais d'un nom envoyé par la page) puis mise en service
  await fill('input[placeholder^="Commentaire"]', "Écarts examinés en e2e");
  await clickText("button", "Accepter les écarts");
  check("Validation humaine · écarts acceptés au nom du compte connecté", await hasText(`Écarts acceptés par ${op.firstName} ${op.lastName}`, 20000));
  await clickText("button", "mettre en service");
  check("Mise en service · nouveau CRM démarré", await waitFor(`document.body.textContent.includes("En service")`, 60000));
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await shot("migration-2-mise-en-service");

  // 5. Nouveau CRM : autonome, données migrées, saisie réelle (accès de secours de l'opérateur, pile temporaire)
  const app = stack.deliveredApps()[0];
  const admin = JSON.parse(fs.readFileSync(path.join(stack.appsDir, app.id, ".secrets", "admin.json"), "utf8"));
  await goto(CRM);
  check("CRM · écran de connexion", await hasText("Accès réservé aux utilisateurs autorisés"));
  await fill('input[name="username"]', admin.username);
  await fill('input[name="password"]', admin.password);
  await clickText("button", "Se connecter");
  check("CRM · tableau de bord après connexion", await hasText("Tableau de bord"));
  check("CRM · origine des données affichée", await hasText("Données historiques migrées depuis"));
  check("CRM · 1 198 clients migrés", await waitFor(`document.body.textContent.replace(/\\s/g, " ").includes("1 198")`));
  await shot("crm-1-tableau-de-bord");
  await goto(`${CRM}/#/e/clients?q=C00012`);
  check("CRM · recherche d'un client migré", await hasText("C00012"));
  await clickText("a", "C00012");
  check("CRM · fiche client avec origine", await hasText("Origine de la donnée"));
  check("CRM · factures liées au client (panneau de la fiche)", await waitFor(`(document.querySelector("[id^='rel-factures-']")?.textContent ?? "").includes("Factures")`, 10000));
  await shot("crm-2-fiche-client");
  await goto(`${CRM}/#/e/factures`);
  await waitFor(`document.querySelectorAll("tbody tr a").length > 0`);
  await evaluate(`document.querySelector("tbody tr a").click()`);
  check("CRM · facture historique verrouillée", await hasText("Document comptable historique"));
  await shot("crm-3-facture");
  await goto(`${CRM}/#/e/clients/new`);
  await waitFor(`!!document.querySelector('input[name="code"]')`);
  await fill('input[name="code"]', "C09500");
  await fill('input[name="raison_sociale"]', "Société créée en e2e (pile de test)");
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("CRM · création d'un vrai enregistrement", await hasText("créé dans ce logiciel", 20000));
  await goto(`${CRM}/#/e/clients`, { width: 390, height: 844, mobile: true });
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  check("CRM · mobile sans débordement horizontal", overflow <= 0, `${overflow}px`);
  await shot("crm-4-mobile");
  check("Aucune exception JavaScript", b.exceptions.length === 0, b.exceptions.slice(0, 3).join(" | "));
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
