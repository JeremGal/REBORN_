import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { requestHostOf, VALID_HOST } from "./request-host";

/**
 * Boîte d'envoi locale (aucun service d'e-mail n'est configuré) : <REBORN_DATA_DIR>/outbox/,
 * dossier 0700, fichiers 0600. Le lien de réinitialisation n'est écrit QUE là : jamais journalisé,
 * jamais renvoyé par l'API. La CLI de l'opérateur (npm run account -- reset-link <email>) le lit,
 * l'affiche dans son terminal puis supprime le fichier.
 */

export interface OutboxMessage {
  kind: "password_reset";
  to: string;
  /** Lien à usage unique (jeton dans le fragment #, jamais envoyé au serveur par le navigateur). */
  link: string;
  created_at: string;
  expires_at: string;
}

export const outboxDir = (dataDir: string) => path.join(/* turbopackIgnore: true */ dataDir, "outbox");

/** Écrit le message ; les messages précédents au même destinataire sont supprimés (un seul lien valide à transmettre). */
export function writeOutbox(dataDir: string, msg: OutboxMessage): string {
  const dir = outboxDir(dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {}
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const old = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Partial<OutboxMessage>;
      if (old.kind === msg.kind && old.to === msg.to) fs.rmSync(path.join(dir, f), { force: true });
    } catch {}
  }
  const name = `${msg.kind}-${Date.now()}-${randomBytes(4).toString("hex")}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(msg, null, 1), { mode: 0o600, flag: "wx" });
  return file;
}

/** Base des liens : REBORN_PUBLIC_URL, sinon l'hôte de la requête (déjà contrôlé par checkHost). */
export function linkBase(request?: Request): string {
  const pub = process.env.REBORN_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (pub && /^https?:\/\/[^\s/]+$/i.test(pub)) return pub;
  if (request) {
    const host = requestHostOf(request);
    if (host && VALID_HOST.test(host)) return `http://${host}`;
  }
  return "http://127.0.0.1:3000";
}
