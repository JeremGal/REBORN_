import fs from "node:fs";
import path from "node:path";
import { ApiError } from "../errors";
import { purgeProjectState } from "../store";
import { getAuthDb } from "../auth/auth";
import { authDataDir, lockoutKey, outsideTransaction } from "../auth/db";
import { outboxDir } from "../auth/outbox";
import { PROJECT_ID } from "./context";
import { forgetCredentials } from "./credentials";
import { deleteProjectMissions } from "./analysis";
import { appsRoot, stopApp } from "./generate";
import { deliveredApp, loadProject, migrationRoot, projectExists, projectRoot, projectsOwnedBy, removeProjectEntry } from "./project";

/**
 * Suppression d'un compte, ou d'un projet et de ses données, à la demande de la personne concernée (revue
 * finale SEC-06 ; conditions d'utilisation et politique de confidentialité : « la demande se fait auprès de
 * l'équipe REBORN »). Traitée par l'opérateur : `npm run account -- delete-project <MIG_id>` ou
 * `npm run account -- delete <email>` (scripts/account.mjs → POST /api/admin/erase, clé de l'opérateur).
 *
 * Projet : logiciel livré arrêté puis supprimé (avec sa base, ses sauvegardes, ses accès) ; identifiants
 * confiés effacés (clé d'abord) et jetons de remise ; dossier du projet (project.json, sources extraites,
 * exécutions, modèles métier, missions.json) ; captures ; évènements, observations, schémas, modèles de règles
 * et investigations de l'état ; missions d'analyse ; entrée de l'index.
 * Compte : chacun de ses projets, puis sessions, comptes de connexion, liens de réinitialisation, compteur de
 * verrouillage, messages en attente dans la boîte d'envoi, et le compte lui-même.
 * Conservés comme preuve (à valider par un juriste) : les lignes de consentement (identifiant de compte, projet,
 * document, version, empreinte, date — ni nom, ni e-mail).
 * `dryRun` : rien n'est supprimé, la réponse décrit ce qui le serait.
 */

export interface ProjectErasure {
  project_id: string;
  company: string | null;
  app: { id: string; stopped: boolean; removed: boolean } | null;
  credentials_erased: boolean;
  files_removed: boolean;
  state: { events: number; observations: number; models: number; schemas: number; investigations: number } | null;
  missions: number;
}

/** Logiciels livrés de CE projet : celui enregistré, et ceux de ses mises en service marqués à son nom. */
function appsOf(projectId: string): string[] {
  const p = loadProject(projectId);
  const ids = new Set<string>();
  const app = p ? deliveredApp(p) : null;
  if (app) ids.add(app.id);
  for (const d of p?.deployments ?? []) ids.add(path.basename(d.app_dir));
  return [...ids].filter((id) => {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return false;
    // Jamais le logiciel d'un autre projet : le marqueur du générateur, s'il existe, doit désigner celui-ci.
    try {
      return fs.readFileSync(path.join(appsRoot(), id, ".reborn-project"), "utf8").trim() === projectId;
    } catch {
      return !!app && app.id === id && fs.existsSync(path.join(appsRoot(), id));
    }
  });
}

/** Fichiers d'un projet dans son dossier ; pour le projet historique à la racine, seulement les siens (jamais les autres projets). */
function removeProjectFiles(dir: string): boolean {
  const root = migrationRoot();
  const abs = path.resolve(/* turbopackIgnore: true */ root, dir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return false;
  if (abs === root) {
    let any = false;
    for (const f of ["project.json", "sources", "runs", "business-model", "credentials.enc.json", "credentials.redeem.json", "missions.json"]) {
      const p = path.join(/* turbopackIgnore: true */ root, f);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
        any = true;
      }
    }
    return any;
  }
  if (!fs.existsSync(abs)) return false;
  fs.rmSync(abs, { recursive: true, force: true });
  return true;
}

/**
 * Lignes supprimées de auth.db réellement écrasées (PRAGMA secure_delete) le temps de la suppression : sans cela,
 * le nom ou l'e-mail d'un compte supprimé pourrait subsister dans les pages libérées du fichier.
 */
async function withSecureDelete<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getAuthDb();
  const before = (db.prepare("PRAGMA secure_delete").get() as { secure_delete?: number } | undefined)?.secure_delete ?? 0;
  db.exec("PRAGMA secure_delete = ON");
  try {
    return await fn();
  } finally {
    db.exec(`PRAGMA secure_delete = ${before ? "ON" : "OFF"}`);
  }
}

export async function eraseProject(projectId: string, opts: { dryRun?: boolean } = {}): Promise<ProjectErasure> {
  return opts.dryRun ? eraseProjectNow(projectId, true) : withSecureDelete(() => eraseProjectNow(projectId, false));
}

async function eraseProjectNow(projectId: string, dryRun: boolean): Promise<ProjectErasure> {
  if (!PROJECT_ID.test(projectId)) throw new ApiError(400, "Identifiant de projet invalide");
  if (!projectExists(projectId)) throw new ApiError(404, "Projet introuvable");
  const p = loadProject(projectId);
  const apps = appsOf(projectId);
  const report: ProjectErasure = { project_id: projectId, company: p?.company ?? p?.name ?? null, app: apps.length ? { id: apps[0], stopped: false, removed: false } : null, credentials_erased: false, files_removed: false, state: null, missions: 0 };
  if (dryRun) return report;
  // 1. Logiciel livré : arrêté, puis supprimé (base, sauvegardes, invitations et accès compris).
  for (const id of apps) {
    const stopped = await stopApp(id).catch(() => false);
    fs.rmSync(path.join(appsRoot(), id), { recursive: true, force: true });
    if (report.app?.id === id) report.app = { id, stopped, removed: !fs.existsSync(path.join(appsRoot(), id)) };
  }
  // 2. Identifiants confiés : clé de l'identifiant d'abord, puis le chiffré ; jetons de remise révoqués.
  report.credentials_erased = forgetCredentials(projectRoot(projectId), "suppression du projet demandée", projectId).erased;
  // 3. Missions d'analyse, état (journal, observations, schémas, modèles, investigations, captures), index, fichiers.
  report.missions = await deleteProjectMissions(projectId);
  report.state = purgeProjectState(projectId);
  const removed = removeProjectEntry(projectId);
  report.files_removed = removeProjectFiles(removed?.dir ?? path.join("projects", projectId));
  return report;
}

export interface AccountErasure {
  email: string;
  projects: ProjectErasure[];
  removed: { user: number; sessions: number; accounts: number; verifications: number; lockout: number; outbox: number };
  consents_kept: number;
}

export async function eraseAccount(email: string, opts: { dryRun?: boolean } = {}): Promise<AccountErasure> {
  return opts.dryRun ? eraseAccountNow(email, true) : withSecureDelete(() => eraseAccountNow(email, false));
}

async function eraseAccountNow(email: string, dryRun: boolean): Promise<AccountErasure> {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e.includes("@") || e.length > 254) throw new ApiError(400, "Adresse e-mail attendue");
  const db = await getAuthDb();
  const user = db.prepare(`SELECT id FROM "user" WHERE email = ?`).get(e) as { id: string } | undefined;
  if (!user) throw new ApiError(404, "Aucun compte pour cette adresse");
  const owned = projectsOwnedBy(user.id);
  const consentsKept = (db.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = ?").get(user.id) as { n: number }).n;
  const report: AccountErasure = { email: e, projects: [], removed: { user: 0, sessions: 0, accounts: 0, verifications: 0, lockout: 0, outbox: 0 }, consents_kept: consentsKept };
  if (dryRun) {
    report.projects = await Promise.all(owned.map((id) => eraseProjectNow(id, true)));
    return report;
  }
  for (const id of owned) report.projects.push(await eraseProjectNow(id, false));
  await outsideTransaction(db, () => {
    db.exec("BEGIN IMMEDIATE");
    try {
      report.removed.sessions = Number(db.prepare("DELETE FROM session WHERE userId = ?").run(user.id).changes);
      report.removed.accounts = Number(db.prepare("DELETE FROM account WHERE userId = ?").run(user.id).changes);
      report.removed.verifications = Number(db.prepare("DELETE FROM verification WHERE value = ? OR identifier = ?").run(user.id, e).changes);
      report.removed.lockout = Number(db.prepare("DELETE FROM auth_lockout WHERE email_sha256 = ?").run(lockoutKey(e)).changes);
      report.removed.user = Number(db.prepare(`DELETE FROM "user" WHERE id = ?`).run(user.id).changes);
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw err;
    }
  });
  // Messages en attente (liens de réinitialisation) adressés à ce compte
  const out = outboxDir(authDataDir());
  let names: string[] = [];
  try {
    names = fs.readdirSync(out).filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of names) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(out, f), "utf8")) as { to?: unknown };
      if (typeof m.to === "string" && m.to.toLowerCase() === e) {
        fs.rmSync(path.join(out, f), { force: true });
        report.removed.outbox++;
      }
    } catch {}
  }
  return report;
}
