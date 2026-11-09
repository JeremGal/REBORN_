import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ApiError } from "../errors";
import { appsRoot } from "./project";
import { appPublicUrl } from "./public-urls";

/**
 * Accès au logiciel livré par invitation à usage unique (conception A, phase 1).
 *
 * Le Studio dépose une invitation dans `generated/<id>/.secrets/invites/` (dossier 0700, fichier
 * 0600, écriture atomique : fichier `.tmp` puis renommage). Le fichier ne contient QUE l'empreinte
 * SHA-256 du jeton ; le jeton n'existe que dans le lien renvoyé, une seule fois, à l'appelant. Le
 * logiciel livré importe l'invitation (au démarrage, avant une activation, à l'affichage des
 * invitations) : cela fonctionne même s'il est arrêté au moment de l'invitation. Le fichier reste en
 * place tant que l'invitation est ouverte (elle survit à un remplacement de la base) ; le logiciel le
 * supprime une fois l'invitation utilisée, révoquée, remplacée ou expirée. Une nouvelle invitation pour
 * la même adresse remplace la précédente. La personne choisit ensuite son propre mot de passe sur
 * l'écran d'activation ; ni le Studio ni l'ancien logiciel ne le connaissent jamais.
 *
 * Ne jamais journaliser le lien (ni migrationLog, ni addEvent, ni console) : il donne accès au logiciel.
 */

export type AppRole = "admin" | "editor" | "viewer";
export interface AppInviteInput {
  email: string;
  role: AppRole;
  /** Identité authentifiée de la personne qui invite (affichée dans le journal du logiciel livré). */
  by: string;
  /** Validité du lien en heures (72 par défaut, 7 jours au plus, comme le logiciel livré l'exige). */
  ttlHours?: number;
}

export const APP_INVITE_DEFAULT_TTL_HOURS = 72;
export const APP_INVITE_MAX_TTL_HOURS = 168;
const ROLES: readonly AppRole[] = ["admin", "editor", "viewer"];
const APP_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
/** Même contrôle que le logiciel livré (runtime/server.mjs, validEmail). */
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

function secretDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

/**
 * Crée une invitation pour le logiciel livré `appId` et renvoie le lien d'activation
 * `http://127.0.0.1:<port>/#/activation/<jeton>` (port lu dans son app.json). Le jeton est dans le
 * fragment `#` : il n'est envoyé ni au serveur dans l'adresse, ni dans l'en-tête Referer.
 */
/** Port du logiciel livré `appId`, lu dans son app.json. */
function deliveredPort(appId: string): number {
  if (!APP_ID.test(appId)) throw new ApiError(400, "Identifiant de logiciel invalide");
  let port: number;
  try {
    port = Number((JSON.parse(fs.readFileSync(path.join(appsRoot(), appId, "app.json"), "utf8")) as { app?: { port?: unknown } }).app?.port);
  } catch {
    throw new ApiError(404, "Logiciel non généré");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError(409, "Port du logiciel livré illisible (app.json)");
  return port;
}

export function issueAppInvite(appId: string, i: AppInviteInput): { link: string; expires_at: string; port: number; file: string } {
  const port = deliveredPort(appId);
  const dir = path.join(appsRoot(), appId);
  const email = String(i.email ?? "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new ApiError(400, "Adresse e-mail invalide");
  if (!ROLES.includes(i.role)) throw new ApiError(400, "Rôle : admin, editor ou viewer");
  const by = String(i.by ?? "").trim().slice(0, 200);
  if (!by) throw new ApiError(400, "Auteur de l'invitation requis");
  const ttl = i.ttlHours ?? APP_INVITE_DEFAULT_TTL_HOURS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > APP_INVITE_MAX_TTL_HOURS) throw new ApiError(400, `Validité : de 1 à ${APP_INVITE_MAX_TTL_HOURS} heures`);

  const token = randomBytes(32).toString("base64url");
  const created = new Date();
  const expires = new Date(created.getTime() + ttl * 3600e3);
  const record = {
    v: 1,
    token_sha256: createHash("sha256").update(token).digest("hex"),
    email,
    role: i.role,
    created_by: by,
    created_at: created.toISOString(),
    expires_at: expires.toISOString(),
  };
  const secrets = path.join(dir, ".secrets");
  const invites = path.join(secrets, "invites");
  secretDir(secrets);
  secretDir(invites);
  const name = `studio-${created.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.json`;
  const tmp = path.join(invites, `${name}.tmp`);
  // Écriture atomique : le logiciel livré ignore les *.tmp, il ne lit jamais un fichier incomplet
  fs.writeFileSync(tmp, JSON.stringify(record), { mode: 0o600, flag: "wx" });
  try {
    fs.renameSync(tmp, path.join(invites, name));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return { link: `${appPublicUrl(port)}/#/activation/${token}`, expires_at: record.expires_at, port, file: path.join(invites, name) };
}

/** Alphabet sans caractères ambigus (0/O, 1/l/I) : un mot de passe facile à recopier. */
const READABLE = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function readablePassword(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => READABLE[b % READABLE.length]).join("");
  return `Rbn-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * « Identifiant et mot de passe » (étape Livraison) : le Studio crée une invitation pour l'adresse du
 * propriétaire, l'active AUSSITÔT dans le logiciel livré (appel local) avec un mot de passe aléatoire lisible,
 * et renvoie identifiant + mot de passe pour affichage UNIQUE. Le Studio ne conserve pas le mot de passe (seul
 * le logiciel livré en garde l'empreinte) ; une nouvelle demande en génère un autre et annule le précédent
 * (le logiciel livré réinitialise le mot de passe d'un compte existant). Logiciel arrêté : 409.
 */
export async function issueAppCredentials(appId: string, i: { email: string; by: string }): Promise<{ login: string; password: string; url: string }> {
  // Logiciel joignable AVANT d'écrire l'invitation : un refus ne laisse aucune invitation qui révoquerait, au prochain
  // démarrage du logiciel, le lien d'activation encore valable du propriétaire.
  const port = deliveredPort(appId);
  const h = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ app?: unknown }>) : null))
    .catch(() => null);
  if (h?.app !== appId) throw new ApiError(409, "Le logiciel livré ne répond pas : démarrez-le, puis réessayez.");
  const invite = issueAppInvite(appId, { email: i.email, role: "admin", by: i.by, ttlHours: 1 });
  const token = decodeURIComponent(invite.link.slice(invite.link.indexOf("#/activation/") + "#/activation/".length));
  const password = readablePassword();
  const local = `http://127.0.0.1:${invite.port}`;
  let res: Response;
  try {
    res = await fetch(`${local}/api/auth/activate`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: local },
      body: JSON.stringify({ token, password }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Invitation retirée : jamais importée, elle révoquerait au prochain démarrage le lien encore valable du propriétaire
    fs.rmSync(invite.file, { force: true });
    throw new ApiError(409, "Le logiciel livré ne répond pas : démarrez-le, puis réessayez.");
  }
  if (!res.ok) {
    fs.rmSync(invite.file, { force: true });
    const why = await res.text().catch(() => "");
    throw new ApiError(502, `Le logiciel livré a refusé l'activation (HTTP ${res.status})${why ? ` : ${why.slice(0, 200)}` : ""}`);
  }
  return { login: i.email.trim().toLowerCase(), password, url: appPublicUrl(invite.port) };
}
