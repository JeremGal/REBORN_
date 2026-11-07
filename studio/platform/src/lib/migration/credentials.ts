import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Identifiants de l'ancien logiciel fournis par le propriétaire.
 *
 * - Chiffrés au repos (AES-256-GCM). La clé est dans <REBORN_DATA_DIR>/vault.key (droits 0600,
 *   jamais versionnée) ; le fichier chiffré est dans le dossier du projet.
 * - Durée de conservation limitée (24 h par défaut), puis effacement automatique.
 * - Jamais renvoyés par l'API ni écrits dans les journaux : seul un indice masqué est affiché.
 * - Remise à l'agent Computer Use par un jeton à usage unique et de courte durée (15 min) :
 *   la mission transmise à l'agent ne contient jamais le mot de passe.
 * Limite : la clé est sur la même machine que les données (protection contre une fuite de
 * fichiers, pas contre un accès complet à la machine). Un coffre externe est prévu après le hackathon.
 */

const dataDir = () => process.env.REBORN_DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = "credentials.enc.json";
const REDEEM = "credentials.redeem.json";

function key(): Buffer {
  const f = path.join(/* turbopackIgnore: true */ dataDir(), "vault.key");
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(f, "utf8").trim(), "base64");
}

export const maskUsername = (u: string) => (u.length <= 2 ? "•".repeat(u.length) : `${u[0]}${"•".repeat(Math.min(6, u.length - 2))}${u.at(-1)}`);

interface Stored {
  username_hint: string;
  created_at: string;
  expires_at: string;
  iv: string;
  tag: string;
  data: string;
}

export function storeCredentials(projectDir: string, username: string, password: string, ttlHours = 24): { username_hint: string; expires_at: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify({ username, password }), "utf8"), c.final()]);
  const now = Date.now();
  const rec: Stored = {
    username_hint: maskUsername(username),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + Math.min(Math.max(ttlHours, 0.25), 24 * 7) * 3600e3).toISOString(),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(/* turbopackIgnore: true */ projectDir, FILE), JSON.stringify(rec), { mode: 0o600 });
  return { username_hint: rec.username_hint, expires_at: rec.expires_at };
}

function readStored(projectDir: string): Stored | null {
  const f = path.join(/* turbopackIgnore: true */ projectDir, FILE);
  if (!fs.existsSync(f)) return null;
  const rec = JSON.parse(fs.readFileSync(f, "utf8")) as Stored;
  if (Date.parse(rec.expires_at) < Date.now()) {
    forgetCredentials(projectDir);
    return null;
  }
  return rec;
}

/** Usage interne uniquement (connecteur d'extraction, remise à l'agent) : jamais renvoyé tel quel par l'API. */
export function readCredentials(projectDir: string): { username: string; password: string } | null {
  const rec = readStored(projectDir);
  if (!rec) return null;
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(rec.iv, "base64"));
  d.setAuthTag(Buffer.from(rec.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(rec.data, "base64")), d.final()]).toString("utf8"));
}

export function credentialStatus(projectDir: string): { stored: boolean; username_hint?: string; expires_at?: string } {
  const rec = readStored(projectDir);
  return rec ? { stored: true, username_hint: rec.username_hint, expires_at: rec.expires_at } : { stored: false };
}

export function forgetCredentials(projectDir: string) {
  for (const f of [FILE, REDEEM]) fs.rmSync(path.join(/* turbopackIgnore: true */ projectDir, f), { force: true });
}

const hash = (t: string) => createHash("sha256").update(t).digest();

/** Jeton à usage unique (15 min) permettant à l'exécuteur de l'agent de récupérer les identifiants. */
export function issueRedeemToken(projectDir: string): { token: string; expires_at: string } {
  if (!readStored(projectDir)) throw new Error("Aucun identifiant enregistré pour ce projet");
  const token = randomBytes(24).toString("base64url");
  const expires_at = new Date(Date.now() + 15 * 60e3).toISOString();
  fs.writeFileSync(path.join(/* turbopackIgnore: true */ projectDir, REDEEM), JSON.stringify({ hash: hash(token).toString("base64"), expires_at }), { mode: 0o600 });
  return { token, expires_at };
}

export function redeem(projectDir: string, token: string): { username: string; password: string } | null {
  const f = path.join(/* turbopackIgnore: true */ projectDir, REDEEM);
  if (!fs.existsSync(f) || typeof token !== "string" || token.length < 20) return null;
  const rec = JSON.parse(fs.readFileSync(f, "utf8")) as { hash: string; expires_at: string };
  const ok = Date.parse(rec.expires_at) > Date.now() && timingSafeEqual(Buffer.from(rec.hash, "base64"), hash(token));
  if (!ok) return null;
  fs.rmSync(f, { force: true });
  return readCredentials(projectDir);
}
