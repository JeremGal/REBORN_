import fs from "node:fs";

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
