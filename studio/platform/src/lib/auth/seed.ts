/**
 * Comptes créés au démarrage à partir de variables d'environnement, pour un déploiement sans terminal
 * (Vercel : impossible d'y lancer `npm run account -- operator <email>`).
 *
 *   REBORN_SEED_ADMIN_EMAIL / REBORN_SEED_ADMIN_PASSWORD   compte de l'équipe REBORN, rôle opérateur
 *   REBORN_SEED_USER_EMAIL  / REBORN_SEED_USER_PASSWORD    compte client de test
 *
 * - Même chemin qu'une inscription (Better Auth : mot de passe haché, consentements aux versions courantes
 *   enregistrés, rôle « client » imposé), puis rôle opérateur posé en base pour l'adresse admin, exactement
 *   comme la ligne de commande scripts/account.mjs.
 * - Idempotent : un compte qui existe déjà n'est jamais modifié (son mot de passe n'est pas réécrit) ; seul le
 *   rôle opérateur de l'adresse admin déclarée est reposé.
 * - Les mots de passe ne sont jamais journalisés : ils ne vivent que dans les variables de l'hébergeur.
 */
import { getAuth, getAuthDb } from "./auth";
import { outsideTransaction } from "./db";
import { LEGAL_DOCUMENTS } from "../legal";

interface Seed {
  email?: string;
  password?: string;
  role: "operator" | "client";
  firstName: string;
  lastName: string;
  company: string;
}

export interface SeedResult {
  created: string[];
  existing: string[];
  failed: string[];
}

export async function seedAccounts(env: NodeJS.ProcessEnv = process.env): Promise<SeedResult> {
  const seeds: Seed[] = [
    { email: env.REBORN_SEED_ADMIN_EMAIL, password: env.REBORN_SEED_ADMIN_PASSWORD, role: "operator", firstName: "Admin", lastName: "REBORN", company: "Équipe REBORN" },
    { email: env.REBORN_SEED_USER_EMAIL, password: env.REBORN_SEED_USER_PASSWORD, role: "client", firstName: "Utilisateur", lastName: "Test", company: "Entreprise de test" },
  ];
  const out: SeedResult = { created: [], existing: [], failed: [] };
  const todo = seeds.filter((s) => s.email?.trim() && s.password);
  if (!todo.length) return out;
  const auth = await getAuth();
  const db = await getAuthDb();
  for (const s of todo) {
    const email = s.email!.trim().toLowerCase();
    try {
      const found = db.prepare(`SELECT id FROM "user" WHERE email = ?`).get(email);
      if (!found) {
        await auth.api.signUpEmail({
          body: {
            email,
            password: s.password!,
            name: `${s.firstName} ${s.lastName}`,
            firstName: s.firstName,
            lastName: s.lastName,
            company: s.company,
            termsVersion: LEGAL_DOCUMENTS.conditions.version,
            privacyVersion: LEGAL_DOCUMENTS.confidentialite.version,
          } as never,
        });
        out.created.push(email);
      } else out.existing.push(email);
      if (s.role === "operator") {
        await outsideTransaction(db, () => db.prepare(`UPDATE "user" SET role = 'operator', updatedAt = ? WHERE email = ?`).run(new Date().toISOString(), email));
      }
    } catch (e) {
      out.failed.push(email);
      const why = e instanceof Error ? e.message.slice(0, 200) : "erreur inconnue";
      console.warn(`[reborn] comptes : création au démarrage refusée pour ${email} (${why})`);
    }
  }
  if (out.created.length) console.log(`[reborn] comptes créés au démarrage : ${out.created.join(", ")}`);
  return out;
}
