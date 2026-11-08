// Sur Vercel, le Studio sert ses propres adresses (fournies par Vercel) sans réglage, et seulement elles.
import { afterEach, describe, expect, it } from "vitest";
import { checkHost } from "@/lib/http";
import { configuredPublicUrl, platformHosts } from "@/lib/auth/request-host";

const KEYS = ["VERCEL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL", "REBORN_PUBLIC_URL", "REBORN_LAN", "REBORN_ALLOWED_HOSTS"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
});
const at = (host: string) => new Request(`https://${host}/api/health`);

describe("hôtes servis sur Vercel", () => {
  it("hors de Vercel, une adresse vercel.app reste refusée (protection contre le rebinding DNS)", () => {
    for (const k of KEYS) delete process.env[k];
    expect(checkHost(at("platform-demo.vercel.app"))?.status).toBe(403);
    expect(configuredPublicUrl()).toBe("");
    expect(platformHosts()).toEqual([]);
  });

  it("sur Vercel, les adresses de production, de déploiement et de branche sont servies, pas les autres", () => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "platform-demo.vercel.app", VERCEL_URL: "platform-abc123-team.vercel.app", VERCEL_BRANCH_URL: "platform-git-main-team.vercel.app" });
    expect(configuredPublicUrl()).toBe("https://platform-demo.vercel.app");
    expect(checkHost(at("platform-demo.vercel.app"))).toBeNull();
    expect(checkHost(at("platform-abc123-team.vercel.app"))).toBeNull();
    expect(checkHost(at("platform-git-main-team.vercel.app"))).toBeNull();
    expect(checkHost(at("evil.example"))?.status).toBe(403);
  });

  it("REBORN_PUBLIC_URL garde la priorité", () => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "platform-demo.vercel.app", REBORN_PUBLIC_URL: "https://studio.exemple.test" });
    expect(configuredPublicUrl()).toBe("https://studio.exemple.test");
    expect(checkHost(at("studio.exemple.test"))).toBeNull();
  });
});
