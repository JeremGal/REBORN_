#!/usr/bin/env node
/**
 * Atelier de l'équipe (règles reconstruites, application générée /app, tableaux de bord) dans un VRAI
 * navigateur (Chrome headless piloté par le protocole DevTools, sans dépendance), sur une pile ISOLÉE :
 * Studio de production construit dans un dossier dédié, données temporaires, ports libres, secrets
 * aléatoires. Le Studio en service (:3000) et ses données ne sont JAMAIS touchés : les scénarios de
 * démonstration remettent à zéro l'atelier de la pile temporaire seulement.
 *
 * L'atelier est réservé à l'équipe REBORN : un compte est créé par l'inscription réelle, reçoit le rôle
 * opérateur par scripts/account.mjs (sur la base temporaire, comme en production), puis se connecte par
 * le formulaire de connexion.
 *
 *   npm run e2e                                (construit le Studio dans platform/.next-test si nécessaire)
 *   REBORN_DIST_DIR=.next-xxx CHROME_PATH=… SHOTS_DIR=… node scripts/e2e-browser.mjs
 * Captures : SHOTS_DIR, sinon un dossier temporaire (jamais dans le dépôt).
 */
import { checker, createStack, shotsDir, distDir, ensureBuild, launchChrome, makeOperator, signUp, up } from "./acceptance/stack.mjs";

const SHOTS = shotsDir("atelier");

const { check, results, failed } = checker();
const dist = distDir();
ensureBuild(dist);
const stack = createStack("atelier");
const studio = await stack.startStudio({ dist });
const BASE = studio.url;
let b;

try {
  check("Studio isolé démarré (build dédié, données temporaires, secrets aléatoires)", await up(`${BASE}/api/health`, 60000, (r) => r.ok));
  // Compte de l'équipe : inscription réelle, rôle opérateur donné par la ligne de commande (jamais par l'API)
  const op = await signUp(BASE, { firstName: "Équipe", lastName: "Atelier", company: "REBORN (test)" });
  const role = makeOperator(stack, op.email);
  check("Compte opérateur : inscription réelle + npm run account -- operator (base temporaire)", role.ok, role.ok ? "" : role.out.slice(0, 200));

  b = await launchChrome(stack, { base: BASE, shotsDir: SHOTS });
  const { evaluate, waitFor, hasText, goto, fill, shot } = b;
  await goto("/connexion");
  await fill("form [name=email]", op.email);
  await fill("form [name=password]", op.password);
  await evaluate(`document.querySelector("form").requestSubmit()`);
  check("Opérateur connecté par le formulaire de connexion", await waitFor("location.pathname === '/espace'", 20000));
  const me = await evaluate(`fetch("/api/me").then((r) => r.json())`);
  check("Session de l'opérateur dans le navigateur", me?.user?.role === "operator");

  // Scénarios de référence de l'atelier : appels de l'opérateur connecté (cookie de session, même origine)
  const scenario = (sc, step) => evaluate(`fetch("/api/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: ${JSON.stringify(JSON.stringify({ scenario: sc, step }))} }).then((r) => r.status)`);
  const clickLabel = (txt) => evaluate(`(() => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().includes(${JSON.stringify(txt)})); if (!l) return false; l.click(); return true; })()`);
  const typeInto = (selector, value) =>
    evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);

  // A — Configurateur de devis
  check("Scénario « quote » chargé par l'opérateur (POST /api/scenarios)", (await scenario("quote", "baseline")) === 200);
  await goto("/app");
  check("A · /app génère le configurateur", await hasText("Configurer un devis"));
  check("A · valeur initiale calculée (A × 1, standard)", await hasText("145,00"));
  await clickLabel("Premium");
  await typeInto('input[name="quantity"]', "10");
  check("A · saisie → règles exécutées (810 €)", await hasText("810,00"));
  await typeInto('input[name="quantity"]', "0");
  check("A · exception métier reproduite", (await hasText("Demande refusée")) && (await hasText("QUANTITE INVALIDE")));
  await typeInto('input[name="quantity"]', "2,5");
  check("A · validation des entrées (entier attendu)", await hasText("nombre entier attendu"));
  await typeInto('input[name="quantity"]', "10");
  await hasText("810,00");
  check("A · tableau calculé présent", await hasText("Grille par quantité"));
  await shot("A-app-devis");

  // B — Calculateur logistique : autre logiciel, mêmes composants
  await scenario("logistics", "baseline");
  await goto("/app");
  check("B · /app régénérée pour un autre métier", await hasText("Calcul des frais de transport"));
  check("B · case à cocher générée", await waitFor("document.querySelector('input[type=checkbox][name=express]')"));
  check("B · champ non pris en charge signalé", (await hasText("Non reconstruit")) && (await hasText("Date d'enlèvement")));
  check("B · sorties multiples (délai)", await hasText("Délai estimé"));
  await clickLabel("Livraison express");
  await typeInto('input[name="weight_kg"]', "10");
  // FR, 10 kg, express : (6,5 + 8,5) × 1,5 = 22,5 €
  check("B · calcul express (22,50 €)", await hasText("22,50"));
  await typeInto('input[name="reference"]', "cmd 1");
  check("B · motif de texte validé", await hasText("format invalide"));
  await typeInto('input[name="reference"]', "CMD-1");
  await shot("B-app-logistique");

  // C — Mise à jour du modèle pendant l'utilisation
  await scenario("logistics", "change");
  check("C · nouveau champ apparu sans rechargement", await hasText("Valeur déclarée"));
  await scenario("logistics", "update");
  check("C · bannière de mise à jour", await hasText("Application mise à jour"));
  check("C · versions affichées", await hasText("règles v2"));
  // Même saisie (FR, 10 kg, express) : 15 × 1,65 = 24,75 → arrondi au dixième supérieur 24,80 €
  check("C · nouveau comportement appliqué (24,80 €)", await hasText("24,80"));
  await shot("C-app-mise-a-jour");

  // Stabilité après actualisation
  await b.send("Page.reload");
  await waitFor("document.readyState === 'complete'");
  check("Actualisation · état restitué", (await hasText("règles v2")) && (await hasText("Valeur déclarée")));

  // Responsive
  await goto("/app", { width: 390, height: 844, mobile: true });
  await hasText("Calcul des frais de transport");
  const overflow = await evaluate("document.documentElement.scrollWidth - window.innerWidth");
  check("Mobile · aucune barre de défilement horizontale", overflow <= 0, `débordement ${overflow}px`);
  await shot("D-app-mobile");

  // Tableaux de bord de l'atelier
  for (const [url, needle, name] of [
    ["/atelier", "Équivalence comportementale", "E-dashboard"],
    ["/investigation", "Exploration du logiciel historique", "E-investigation"],
    ["/regles", "Modèle métier v2", "E-regles"],
    ["/reconstruction", "Chaîne de reconstruction", "E-reconstruction"],
    ["/comparaison", "Limites de la vérification", "E-comparaison"],
  ]) {
    await goto(url);
    const ok = url === "/reconstruction" ? await waitFor("document.querySelector('[aria-label=\"Chaîne de reconstruction\"]')") : await hasText(needle);
    check(`Dashboard · ${url}`, ok);
    await shot(name);
  }
  check("Aucune exception JavaScript", b.exceptions.length === 0, b.exceptions.slice(0, 3).join(" | "));
} catch (e) {
  check("Exécution", false, e.message);
} finally {
  await b?.close(); // profil Chrome supprimé
  await stack.stop();
  const n = failed();
  if (n) console.log(`\nDernières lignes du journal du Studio :\n${stack.tail("studio", 25)}`);
  stack.cleanup();
  console.log(`\n${results.length - n}/${results.length} vérifications réussies · captures : ${SHOTS}${n ? " · relancer avec REBORN_KEEP_TMP=1 pour garder le dossier de test" : ""}`);
  process.exit(n ? 1 : 0);
}
