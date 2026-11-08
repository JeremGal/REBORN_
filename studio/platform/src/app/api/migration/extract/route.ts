import { extract, getProject } from "@/lib/migration/project";
import { readCredentials } from "@/lib/migration/credentials";
import { legacyUrlProblem } from "@/lib/migration/project-contracts";
import { executorIdentity, requireLeaseHolder, sweepIfDue } from "@/lib/migration/analysis";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { currentPrincipal, displayName, isOperator } from "@/lib/auth/principal";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const str = (v: unknown) => (typeof v === "string" && v.length ? v : undefined);

/**
 * Extraction autorisée : { plan ("test" = plan de test Relatio 2004, jeu de test ; ou contrat
 * extraction_plan), username?, password?, base_url? }.
 *
 * Exfiltration impossible (SPEC §5) :
 * - avec les identifiants CONFIÉS au projet (aucun mot de passe dans la requête), seule l'adresse
 *   DÉCLARÉE du projet sert : base_url ou username fournis dans la requête → 400, plan.base_url ignoré ;
 * - un plan libre n'est accepté que de l'exécuteur titulaire de la mission ou de l'équipe REBORN ;
 * - avec des identifiants fournis dans la requête (jamais conservés), une autre adresse que celle du projet
 *   n'est acceptée que de l'exécuteur ou de l'équipe, et seulement si le projet n'en déclare aucune.
 * Toutes les sorties réseau passent par egress.ts (adresses internes refusées, redirections non suivies).
 * Fin réussie : les identifiants confiés sont effacés (ils ne servent plus).
 */
export const POST = handler(
  async (req) => {
    await sweepIfDue();
    const who = currentPrincipal();
    const agent = who.kind === "service";
    const trusted = agent || isOperator(who);
    const b = ((await readJson(req)) ?? {}) as { plan?: unknown; base_url?: unknown; username?: unknown; password?: unknown };
    const p = getProject();
    if (agent) await requireLeaseHolder(p.id, executorIdentity(who, req));
    const isFixture = b.plan === "test" || b.plan === undefined;
    if (!isFixture && !trusted) throw new ApiError(403, "Plan d'extraction libre réservé à l'agent d'exploration et à l'équipe REBORN : utilisez le plan de test (logiciel Relatio) ou le plan produit par l'agent");
    if (isFixture && p.source_system && !/relatio/i.test(p.source_system)) throw new ApiError(409, `Le plan de test décrit Relatio 2004 : il ne s'applique pas à « ${p.source_system} » (fournissez le plan d'extraction de ce logiciel)`);
    if (b.base_url !== undefined && typeof b.base_url !== "string") throw new ApiError(400, "base_url invalide");
    const plan = isFixture ? CRM_FIXTURES.extraction_plan : b.plan;
    const password = str(b.password);
    const declared = p.legacy_url && !legacyUrlProblem(p.legacy_url) ? p.legacy_url : undefined;
    let base: string | undefined;
    let username: string | undefined;
    let pass: string | undefined;
    if (!password) {
      // Identifiants confiés au projet : jamais vers une autre adresse ni associés à un autre identifiant.
      if (b.base_url !== undefined) throw new ApiError(400, "base_url refusé : avec les identifiants confiés au projet, seule l'adresse déclarée du projet est utilisée");
      if (b.username !== undefined) throw new ApiError(400, "username refusé : les identifiants confiés au projet sont utilisés tels quels");
      if (!declared) throw new ApiError(409, `${p.legacy_url ? legacyUrlProblem(p.legacy_url) : "Adresse de l'ancien logiciel non déclarée"} : indiquez l'adresse du projet avant l'extraction`);
      base = declared;
      const stored = readCredentials(p.id);
      username = stored?.username;
      pass = stored?.password;
    } else {
      username = str(b.username);
      if (!username) throw new ApiError(400, "username requis avec password");
      pass = password;
      const asked = str(b.base_url);
      if (asked && declared && new URL(declared).origin !== safeOriginOf(asked)) throw new ApiError(400, "base_url refusé : seule l'adresse déclarée du projet est utilisée");
      if (asked && !declared && !trusted) throw new ApiError(403, "Adresse libre réservée à l'agent d'exploration et à l'équipe REBORN : déclarez l'adresse de l'ancien logiciel dans le projet");
      base = declared ?? asked;
      if (!base && !trusted) throw new ApiError(409, "Adresse de l'ancien logiciel non déclarée : indiquez-la dans le projet avant l'extraction");
    }
    const summary = await extract(plan, { base_url: base, username, password: pass }, displayName(who));
    return json({ ok: true, extraction: summary });
  },
  { access: ["owner", "explorer", "operator"], project: "query", write: true },
);

function safeOriginOf(u: string): string | null {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}
