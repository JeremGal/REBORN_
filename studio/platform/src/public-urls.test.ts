// Adresse publique d'un logiciel livré (tunnel https tenu par scripts/serve-public.mjs), sinon adresse locale.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appPublicUrl } from "@/lib/migration/public-urls";

const saved = process.env.REBORN_APP_PUBLIC_URLS_FILE;
afterEach(() => {
  if (saved === undefined) delete process.env.REBORN_APP_PUBLIC_URLS_FILE;
  else process.env.REBORN_APP_PUBLIC_URLS_FILE = saved;
});

describe("adresse publique d'un logiciel livré", () => {
  it("sans fichier de tunnels : adresse locale", () => {
    delete process.env.REBORN_APP_PUBLIC_URLS_FILE;
    expect(appPublicUrl(4310)).toBe("http://127.0.0.1:4310");
  });

  it("avec un tunnel https pour ce port : adresse publique ; entrée invalide ou absente : adresse locale", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-urls-"));
    const file = path.join(dir, "public-app-urls.json");
    fs.writeFileSync(file, JSON.stringify({ "4310": "https://abcd-1-2-3-4.ngrok-free.app", "4311": "http://pas-https.exemple.test", "4312": "https://exemple.test/chemin" }));
    process.env.REBORN_APP_PUBLIC_URLS_FILE = file;
    expect(appPublicUrl(4310)).toBe("https://abcd-1-2-3-4.ngrok-free.app");
    expect(appPublicUrl(4311)).toBe("http://127.0.0.1:4311");
    expect(appPublicUrl(4312)).toBe("http://127.0.0.1:4312");
    expect(appPublicUrl(4399)).toBe("http://127.0.0.1:4399");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("lien « Ouvrir le logiciel » (liste des logiciels livrés)", () => {
  it("le résumé du projet porte l'adresse publique du logiciel, pas l'hôte du Studio suivi du port", async () => {
    const { deliveredSummary } = await import("@/lib/migration/project");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-urls-"));
    const file = path.join(dir, "public-app-urls.json");
    fs.writeFileSync(file, JSON.stringify({ "4311": "https://a1b2-1-2-3-4.ngrok-free.app" }));
    process.env.REBORN_APP_PUBLIC_URLS_FILE = file;
    const active = { at: "2026-11-08T14:46:40.000Z", run_id: "RUN_1" };
    expect(deliveredSummary({ id: "hotel-rm", port: 4311 }, active)).toEqual({ id: "hotel-rm", port: 4311, url: "https://a1b2-1-2-3-4.ngrok-free.app", deployed_at: active.at, run_id: "RUN_1" });
    // Port sans tunnel publié : adresse locale du poste, jamais une adresse inventée
    expect(deliveredSummary({ id: "autre", port: 4312 }, active).url).toBe("http://127.0.0.1:4312");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("aucun écran ne fabrique l'adresse d'un logiciel livré à partir de l'adresse du Studio dans le navigateur", () => {
    const roots = [path.join(__dirname, "app"), path.join(__dirname, "components")];
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && /location\.host(name)?\b/.test(fs.readFileSync(f, "utf8"))) offenders.push(path.relative(__dirname, f));
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
