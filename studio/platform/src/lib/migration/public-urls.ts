import fs from "node:fs";
import { ApiError } from "../errors";

/**
 * Adresse publique d'un logiciel livré. Quand le Studio est publié par des tunnels https
 * (studio/scripts/serve-public.mjs), REBORN_APP_PUBLIC_URLS_FILE désigne un fichier { "<port>": "https://…" }
 * tenu à jour par ce script ; sinon, ou pour un port sans tunnel, l'adresse locale http://127.0.0.1:<port>.
 * Seules des adresses https sans chemin sont acceptées depuis ce fichier.
 */
export function appPublicUrl(port: number): string {
  const file = process.env.REBORN_APP_PUBLIC_URLS_FILE?.trim();
  if (file) {
    try {
      const map = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8")) as Record<string, unknown>;
      const u = map[String(port)];
      if (typeof u === "string" && /^https:\/\/[a-z0-9.-]+$/i.test(u)) return u;
    } catch {}
  }
  return `http://127.0.0.1:${port}`;
}

/** Studio publié par des tunnels https (scripts/serve-public.mjs) : chaque logiciel livré a sa propre adresse publique. */
export const tunnelMode = () => !!process.env.REBORN_APP_PUBLIC_URLS_FILE?.trim();

/**
 * Adresse d'un logiciel qui vient de démarrer. En mode tunnels, son tunnel https n'est publié que quelques secondes
 * après le démarrage : il est attendu (au plus `ms`) pour ne pas remettre au navigateur une adresse locale
 * (http://127.0.0.1:<port>) injoignable depuis un autre poste. Hors tunnels : immédiat. Délai dépassé : adresse locale.
 */
export async function waitAppPublicUrl(port: number, ms = 10_000): Promise<string> {
  let u = appPublicUrl(port);
  if (!tunnelMode()) return u;
  const end = Date.now() + ms;
  while (!u.startsWith("https://") && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    u = appPublicUrl(port);
  }
  return u;
}

/** Lien d'activation ou identifiants à remettre : en mode tunnels, refus (409, rien n'est émis) tant que l'adresse publique n'existe pas. */
export async function requireAppPublicUrl(port: number, ms = 8_000): Promise<string> {
  const u = await waitAppPublicUrl(port, ms);
  if (tunnelMode() && !u.startsWith("https://")) throw new ApiError(409, "L'adresse publique du nouveau logiciel n'est pas encore prête : vérifiez qu'il est en service, puis réessayez dans quelques secondes.");
  return u;
}
