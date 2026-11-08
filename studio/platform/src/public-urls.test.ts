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
