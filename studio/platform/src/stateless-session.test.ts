// Hébergement à plusieurs instances SANS base partagée (Vercel : /tmp propre à chaque instance) :
// une session ouverte sur l'instance A doit être reconnue par l'instance B, avec le même compte, le même
// rôle et le même identifiant. Deux dossiers de données temporaires simulent les deux instances.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cleanupAuthEnv, setupAuthEnv, signIn } from "@/test/auth";

const ADMIN = { email: "admin.stateless@exemple.test", password: "Stateless-Admin-2026" };
const KEYS = ["REBORN_STATELESS_SESSIONS", "REBORN_SEED_ADMIN_EMAIL", "REBORN_SEED_ADMIN_PASSWORD", "REBORN_SEED_USER_EMAIL", "REBORN_SEED_USER_PASSWORD"];
const extraDirs: string[] = [];
afterAll(async () => {
  for (const k of KEYS) delete process.env[k];
  for (const d of extraDirs) fs.rmSync(d, { recursive: true, force: true });
  await cleanupAuthEnv();
});

async function instanceB(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-instance-b-"));
  extraDirs.push(dir);
  process.env.REBORN_DATA_DIR = dir; // nouvelle base vide : autre instance, même secret
  const { seedAccounts } = await import("@/lib/auth/seed");
  await seedAccounts();
}

describe("sessions sans base partagée", () => {
  it("une session ouverte sur une instance est reconnue par une autre (cookie signé, identifiant stable)", async () => {
    setupAuthEnv("reborn-instance-a-");
    Object.assign(process.env, { REBORN_STATELESS_SESSIONS: "1", REBORN_SEED_ADMIN_EMAIL: ADMIN.email, REBORN_SEED_ADMIN_PASSWORD: ADMIN.password });
    const { seedAccounts, seedUserId } = await import("@/lib/auth/seed");
    await seedAccounts();
    const login = await signIn(ADMIN.email, ADMIN.password);
    expect(login.status).toBe(200);

    await instanceB();
    const { resolveSession } = await import("@/lib/auth/session");
    const { principal } = await resolveSession(new Headers({ cookie: login.cookie }));
    expect(principal.kind).toBe("user");
    if (principal.kind === "user") {
      expect(principal.email).toBe(ADMIN.email);
      expect(principal.role).toBe("operator");
      expect(principal.userId).toBe(seedUserId(ADMIN.email));
    }
    const { requiredAccountConsents } = await import("@/lib/auth/consents");
    expect(await requiredAccountConsents(seedUserId(ADMIN.email))).toEqual([]);
  });

  it("sans ce mode, l'autre instance ne connaît pas la session (comportement par défaut, hors Vercel)", async () => {
    setupAuthEnv("reborn-instance-a2-");
    Object.assign(process.env, { REBORN_STATELESS_SESSIONS: "0", REBORN_SEED_ADMIN_EMAIL: ADMIN.email, REBORN_SEED_ADMIN_PASSWORD: ADMIN.password });
    const { seedAccounts } = await import("@/lib/auth/seed");
    await seedAccounts();
    const login = await signIn(ADMIN.email, ADMIN.password);
    expect(login.status).toBe(200);
    await instanceB();
    const { resolveSession } = await import("@/lib/auth/session");
    expect((await resolveSession(new Headers({ cookie: login.cookie }))).principal.kind).toBe("anonymous");
  });
});
