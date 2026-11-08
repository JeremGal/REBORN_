import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Ancienne session navigateur par jeton maître (cookie reborn_token) : supprimée.
 * Les comptes REBORN la remplacent (Better Auth, /api/auth/*). Le cookie reborn_token n'est ni posé ni lu :
 * toutes les méthodes répondent 410, sans effet. Comme toute route, elle passe par handler() (SPEC §1.3 :
 * contrôle d'hôte, origine des écritures, annotation d'accès vérifiée par l'inventaire) ; publique.
 */
const gone = handler(async () => json({ ok: false, error: "Remplacé par les comptes REBORN : connectez-vous sur /connexion" }, 410), { access: ["public"], project: "none" });

export const GET = gone;
export const POST = gone;
export const PUT = gone;
export const PATCH = gone;
export const DELETE = gone;
