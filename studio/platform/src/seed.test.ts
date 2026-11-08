// Comptes créés au démarrage (déploiement sans terminal) : admin opérateur + client, idempotents,
// mots de passe jamais journalisés. Données inventées, dossier temporaire.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupAuthEnv, setupAuthEnv, signIn } from "@/test/auth";

const ADMIN = { email: "admin.seed@exemple.test", password: "Seed-Admin-2026@" };
const USER = { email: "user.seed@exemple.test", password: "Seed2026@" }; // 9 caractères : minimum abaissé à 9

beforeAll(() => {
  setupAuthEnv("reborn-seed-");
  Object.assign(process.env, {
    REBORN_AUTH_MIN_PASSWORD: "9",
    REBORN_SEED_ADMIN_EMAIL: ADMIN.email,
    REBORN_SEED_ADMIN_PASSWORD: ADMIN.password,
    REBORN_SEED_USER_EMAIL: USER.email,
    REBORN_SEED_USER_PASSWORD: USER.password,
  });
});
afterAll(async () => {
  for (const k of ["REBORN_AUTH_MIN_PASSWORD", "REBORN_SEED_ADMIN_EMAIL", "REBORN_SEED_ADMIN_PASSWORD", "REBORN_SEED_USER_EMAIL", "REBORN_SEED_USER_PASSWORD"]) delete process.env[k];
  await cleanupAuthEnv();
});

describe("comptes de départ (REBORN_SEED_*)", () => {
  it("crée l'admin (opérateur) et le client, qui se connectent avec leur mot de passe", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((m: unknown) => void logs.push(String(m)));
    const warn = vi.spyOn(console, "warn").mockImplementation((m: unknown) => void logs.push(String(m)));
    const { seedAccounts } = await import("@/lib/auth/seed");
    const r = await seedAccounts();
    spy.mockRestore();
    warn.mockRestore();
    expect(r.failed).toEqual([]);
    expect(r.created.sort()).toEqual([ADMIN.email, USER.email].sort());
    expect(logs.join("\n")).not.toContain(ADMIN.password);
    expect(logs.join("\n")).not.toContain(USER.password);

    const { getAuthDb } = await import("@/lib/auth/auth");
    const db = await getAuthDb();
    const role = (e: string) => (db.prepare(`SELECT role FROM "user" WHERE email = ?`).get(e) as { role: string }).role;
    expect(role(ADMIN.email)).toBe("operator");
    expect(role(USER.email)).toBe("client");
    const consents = db.prepare(`SELECT COUNT(*) AS n FROM consents c JOIN "user" u ON u.id = c.user_id WHERE u.email = ?`).get(USER.email) as { n: number } | undefined;
    expect(consents?.n ?? 0).toBeGreaterThanOrEqual(2);

    expect((await signIn(ADMIN.email, ADMIN.password)).status).toBe(200);
    expect((await signIn(USER.email, USER.password)).status).toBe(200);
  });

  it("au redémarrage, ne recrée rien et ne réécrit aucun mot de passe", async () => {
    const { seedAccounts } = await import("@/lib/auth/seed");
    const r = await seedAccounts({ ...process.env, REBORN_SEED_USER_PASSWORD: "Autre-Mot-De-Passe-2026" });
    expect(r.created).toEqual([]);
    expect(r.existing.sort()).toEqual([ADMIN.email, USER.email].sort());
    expect((await signIn(USER.email, USER.password)).status).toBe(200);
  });
});
