// Comptes REBORN : administration par l'opérateur (équipe REBORN), sur ce poste uniquement.
//
//   npm run account -- list                      → comptes (rôle, entreprise) et projets (propriétaire)
//   npm run account -- operator <email>          → donne le rôle opérateur (jamais possible par l'API)
//   npm run account -- client <email>            → remet le rôle client
//   npm run account -- assign <MIG_id> <email>   → rattache un projet à un compte
//   npm run account -- claim-unowned <email>     → rattache à ce compte tous les projets sans propriétaire
//   npm run account -- reset-link <email>        → lien de réinitialisation du mot de passe (usage unique, 1 h)
//   npm run account -- delete-project <MIG_id> [--confirm]  → suppression d'un projet et de ses données (sur demande)
//   npm run account -- delete <email> [--confirm]           → suppression d'un compte, de ses projets et de leurs données
//
// Suppressions (demande de la personne concernée) : sans --confirm, la commande AFFICHE seulement ce qui serait
// supprimé ; avec --confirm, le Studio en service (même dossier de données) supprime tout, dans son processus
// (son état en mémoire compris) : logiciel livré arrêté puis supprimé, identifiants confiés (clé d'abord),
// dossier du projet, captures, journal, observations, schémas, missions, entrée de l'index ; pour un compte,
// en plus : sessions, connexions, liens de réinitialisation, compteur de verrouillage, compte. Les lignes de
// consentement (sans nom ni e-mail) sont conservées comme preuve — à valider par un juriste.
//
// Lit et écrit directement <REBORN_DATA_DIR>/auth.db (node:sqlite) et migration/projects.json ;
// REBORN_DATA_DIR vaut par défaut platform/.data (le Studio de ce poste). Aucun mot de passe n'est lu
// ni affiché. reset-link demande la réinitialisation au Studio en service (REBORN_URL, par défaut
// http://127.0.0.1:3000), avec la clé de l'opérateur (<REBORN_DATA_DIR>/operator.key : seul ce poste
// peut la lire), puis lit le lien dans la boîte d'envoi locale : il n'apparaît QUE dans ce terminal
// (à transmettre à la personne par un canal sûr) et le fichier est supprimé aussitôt.
//
// Limite : une seconde connexion à auth.db (le Studio garde la sienne). Les écritures sont brèves ;
// en cas de conflit avec une inscription en cours, l'une des deux peut échouer : relancez la commande.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ROOT } from "./secrets.mjs";

const DATA = path.resolve(process.env.REBORN_DATA_DIR ?? path.join(ROOT, "platform", ".data"));
const STUDIO = (process.env.REBORN_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const AUTH_DB = path.join(DATA, "auth.db");
const MIGRATION = path.join(DATA, "migration");
const INDEX = path.join(MIGRATION, "projects.json");
const PROJECT_ID = /^MIG_[a-f0-9]{8}$/;

const [cmd, ...args] = process.argv.slice(2);

function fail(message, code = 1) {
  console.error(`[reborn] ${message}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage : npm run account -- <commande>
  list                       comptes et projets (sans aucun secret)
  operator <email>           rôle opérateur (équipe REBORN)
  client <email>             rôle client
  assign <MIG_id> <email>    rattache un projet à un compte
  claim-unowned <email>      rattache tous les projets sans propriétaire à ce compte
  reset-link <email>         lien de réinitialisation du mot de passe (Studio en service requis)
  delete-project <MIG_id> [--confirm]   suppression d'un projet et de ses données (aperçu sans --confirm)
  delete <email> [--confirm]            suppression d'un compte, de ses projets et de leurs données (aperçu sans --confirm)
Données : ${DATA}  (REBORN_DATA_DIR)   Studio : ${STUDIO}  (REBORN_URL)`);
}

function openDb() {
  if (!fs.existsSync(AUTH_DB)) fail(`Aucune base de comptes dans ${DATA} : démarrez le Studio et créez un compte sur ${STUDIO}/inscription (ou précisez REBORN_DATA_DIR).`);
  const db = new DatabaseSync(AUTH_DB);
  db.exec("PRAGMA busy_timeout = 5000;");
  if (!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'`).get()) fail("La base des comptes n'est pas encore initialisée : ouvrez une première fois le Studio.");
  return db;
}

const norm = (email) => String(email ?? "").trim().toLowerCase();

function userByEmail(db, email) {
  const e = norm(email);
  if (!e || !e.includes("@")) fail("Adresse e-mail attendue.");
  const u = db.prepare(`SELECT id, email, firstName, lastName, company, role FROM "user" WHERE email = ?`).get(e);
  if (!u) fail(`Aucun compte pour ${e}.`);
  return u;
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX, "utf8"));
  } catch {
    // Même règle que le Studio : l'ancien projet unique devient le premier projet de l'index.
    try {
      const legacy = JSON.parse(fs.readFileSync(path.join(MIGRATION, "project.json"), "utf8"));
      return { current: legacy.id, projects: [{ id: legacy.id, dir: "" }] };
    } catch {
      return { current: null, projects: [] };
    }
  }
}

function writeIndex(idx) {
  fs.mkdirSync(MIGRATION, { recursive: true });
  const tmp = `${INDEX}.account.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 1));
  fs.renameSync(tmp, INDEX);
}

function projectName(entry) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(MIGRATION, entry.dir, "project.json"), "utf8"));
    return p.company ?? p.name ?? "(sans nom)";
  } catch {
    return "(project.json illisible)";
  }
}

const display = (u) => `${[u.firstName, u.lastName].filter(Boolean).join(" ") || "(sans nom)"}${u.company ? ` · ${u.company}` : ""}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "?");

function setRole(email, role) {
  const db = openDb();
  const u = userByEmail(db, email);
  if (u.role === role) {
    console.log(`[reborn] ${u.email} a déjà le rôle ${role}.`);
    return;
  }
  db.prepare(`UPDATE "user" SET role = ?, updatedAt = ? WHERE id = ?`).run(role, new Date().toISOString(), u.id);
  console.log(`[reborn] ${u.email} (${display(u)}) : rôle ${role}${role === "operator" ? " — accès de l'équipe REBORN (atelier, projets sans propriétaire)" : ""}. Effet immédiat, sans reconnexion.`);
}

async function resetLink(email) {
  const db = openDb();
  const u = userByEmail(db, email);
  db.close();
  const outbox = path.join(DATA, "outbox");
  // Clé de l'opérateur créée par le Studio dans son dossier de données : prouve que la demande vient de ce poste.
  let key;
  try {
    key = fs.readFileSync(path.join(DATA, "operator.key"), "utf8").trim();
  } catch {
    fail(`Clé de l'opérateur absente (${path.join(DATA, "operator.key")}) : le Studio de ce dossier de données n'a pas encore démarré.`);
  }
  const since = Date.now() - 1000;
  let res;
  try {
    res = await fetch(`${STUDIO}/api/auth/request-password-reset`, { method: "POST", headers: { "content-type": "application/json", "x-reborn-operator-key": key }, body: JSON.stringify({ email: u.email }) });
  } catch {
    fail(`Studio injoignable sur ${STUDIO} : démarrez-le (npm run dev) ou précisez REBORN_URL.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    fail(`Demande refusée par le Studio (${res.status}) : ${body.message ?? body.error ?? "erreur inconnue"}`);
  }
  // Le Studio écrit le lien dans SA boîte d'envoi : même dossier de données que cette commande.
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(outbox) ? fs.readdirSync(outbox).filter((f) => f.endsWith(".json")) : [];
    for (const f of files) {
      const file = path.join(outbox, f);
      try {
        const m = JSON.parse(fs.readFileSync(file, "utf8"));
        if (m.kind === "password_reset" && m.to === u.email && Date.parse(m.created_at) >= since) {
          fs.rmSync(file, { force: true });
          console.log(`[reborn] Lien de réinitialisation pour ${u.email} (usage unique, valable jusqu'au ${new Date(m.expires_at).toLocaleString("fr-FR")}) :`);
          console.log(m.link);
          console.log("[reborn] À transmettre à la personne par un canal sûr. Il n'est conservé nulle part ailleurs ; les liens demandés auparavant pour ce compte ne fonctionnent plus.");
          return;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  fail(`Aucun lien reçu dans ${outbox} : le Studio de ${STUDIO} utilise-t-il le même dossier de données (REBORN_DATA_DIR) ?`);
}

/** Clé de l'opérateur créée par le Studio dans son dossier de données : prouve que la demande vient de ce poste. */
function operatorKey() {
  try {
    return fs.readFileSync(path.join(DATA, "operator.key"), "utf8").trim();
  } catch {
    fail(`Clé de l'opérateur absente (${path.join(DATA, "operator.key")}) : le Studio de ce dossier de données n'a pas encore démarré.`);
  }
}

const n = (x, one, many = `${one}s`) => `${x} ${x > 1 ? many : one}`;
function describeProject(p) {
  const st = p.state ? `${n(p.state.events, "évènement")}, ${n(p.state.observations, "observation")}, ${n(p.state.schemas, "schéma")} d'écran, ${n(p.state.models, "modèle")} de règles, ${n(p.state.investigations, "investigation")}` : "journal, observations, schémas, modèles, investigations";
  const app = p.app ? `logiciel livré « ${p.app.id} »${p.state ? (p.app.removed ? ` ${p.app.stopped ? "arrêté et " : ""}supprimé` : " NON supprimé") : ""}` : "aucun logiciel livré";
  return `${p.project_id} (${p.company ?? "sans nom"}) : ${app} · identifiants confiés${p.state ? (p.credentials_erased ? " effacés" : " : aucun") : ""} · ${st} · ${n(p.missions, "mission")} d'analyse · dossier du projet${p.state ? (p.files_removed ? " supprimé" : " : rien à supprimer") : ""}`;
}

/** Suppression demandée au Studio en service (son état en mémoire est purgé dans son processus). */
async function erase(body, confirm) {
  const key = operatorKey();
  let res;
  try {
    res = await fetch(`${STUDIO}/api/admin/erase`, { method: "POST", headers: { "content-type": "application/json", "x-reborn-operator-key": key }, body: JSON.stringify({ ...body, dry_run: !confirm }) });
  } catch {
    fail(`Studio injoignable sur ${STUDIO} : démarrez-le (npm run dev) ou précisez REBORN_URL. Rien n'a été supprimé.`);
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Suppression refusée par le Studio (${res.status}) : ${out.error ?? "erreur inconnue"}. Rien n'a été supprimé.`);
  const projects = out.project ? [out.project] : (out.account?.projects ?? []);
  console.log(confirm ? "[reborn] Supprimé :" : "[reborn] APERÇU — rien n'est supprimé. Serait supprimé :");
  for (const p of projects) console.log(`  · ${describeProject(p)}`);
  if (out.account) {
    const r = out.account.removed;
    console.log(`  · compte ${out.account.email}${confirm ? ` : ${n(r.sessions, "session")}, ${n(r.accounts, "connexion")}, ${n(r.verifications, "lien")} de réinitialisation, ${n(r.outbox, "message")} en attente, compte supprimé (${r.user ? "oui" : "non"})` : " : sessions, connexions, liens de réinitialisation, compte"}`);
    console.log(`  · conservé comme preuve : ${n(out.account.consents_kept, "ligne")} de consentement (identifiant de compte, document, version, date — ni nom, ni e-mail)`);
  }
  if (!confirm) console.log("[reborn] Relancez avec --confirm pour supprimer définitivement (irréversible).");
}

async function main() {
  if (cmd === "list") {
    const db = openDb();
    const users = db.prepare(`SELECT id, email, firstName, lastName, company, role, createdAt FROM "user" ORDER BY createdAt`).all();
    const idx = readIndex();
    const owned = new Map();
    for (const p of idx.projects) if (p.owner_id) owned.set(p.owner_id, (owned.get(p.owner_id) ?? 0) + 1);
    console.log(`Comptes (${users.length}) :`);
    for (const u of users) console.log(`  ${u.email.padEnd(34)} ${display(u).padEnd(40)} ${String(u.role ?? "client").padEnd(9)} créé le ${day(u.createdAt)} · ${owned.get(u.id) ?? 0} projet(s)`);
    const emails = new Map(users.map((u) => [u.id, u.email]));
    console.log(`Projets (${idx.projects.length}) :`);
    for (const p of idx.projects) {
      const owner = p.owner_id ? (emails.get(p.owner_id) ?? `compte supprimé (${p.owner_id.slice(0, 6)}…)`) : "sans propriétaire (visible de l'opérateur seulement)";
      console.log(`  ${p.id}  ${projectName(p).padEnd(32)} ${owner}`);
    }
    return;
  }
  if (cmd === "operator" || cmd === "client") {
    if (!args[0]) fail(`Usage : npm run account -- ${cmd} <email>`);
    return setRole(args[0], cmd);
  }
  if (cmd === "assign") {
    const [id, email] = args;
    if (!id || !email) fail("Usage : npm run account -- assign <MIG_id> <email>");
    if (!PROJECT_ID.test(id)) fail(`Identifiant de projet invalide : ${id.slice(0, 40)}`);
    const u = userByEmail(openDb(), email);
    const idx = readIndex();
    const entry = idx.projects.find((p) => p.id === id);
    if (!entry) fail(`Projet introuvable : ${id}`);
    const before = entry.owner_id;
    entry.owner_id = u.id;
    writeIndex(idx);
    console.log(`[reborn] ${id} (${projectName(entry)}) rattaché à ${u.email}${before && before !== u.id ? " (il appartenait à un autre compte)" : ""}.`);
    return;
  }
  if (cmd === "claim-unowned") {
    if (!args[0]) fail("Usage : npm run account -- claim-unowned <email>");
    const u = userByEmail(openDb(), args[0]);
    const idx = readIndex();
    const claimed = idx.projects.filter((p) => !p.owner_id);
    for (const p of claimed) p.owner_id = u.id;
    if (claimed.length) writeIndex(idx);
    console.log(claimed.length ? `[reborn] ${claimed.length} projet(s) rattaché(s) à ${u.email} : ${claimed.map((p) => `${p.id} (${projectName(p)})`).join(", ")}.` : "[reborn] Aucun projet sans propriétaire.");
    return;
  }
  if (cmd === "reset-link") {
    if (!args[0]) fail("Usage : npm run account -- reset-link <email>");
    return resetLink(args[0]);
  }
  if (cmd === "delete-project") {
    const id = args.find((a) => !a.startsWith("--"));
    if (!id) fail("Usage : npm run account -- delete-project <MIG_id> [--confirm]");
    if (!PROJECT_ID.test(id)) fail(`Identifiant de projet invalide : ${id.slice(0, 40)}`);
    return erase({ project_id: id }, args.includes("--confirm"));
  }
  if (cmd === "delete") {
    const email = args.find((a) => !a.startsWith("--"));
    if (!email) fail("Usage : npm run account -- delete <email> [--confirm]");
    return erase({ email: norm(email) }, args.includes("--confirm"));
  }
  usage();
  if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1);
}

await main();
