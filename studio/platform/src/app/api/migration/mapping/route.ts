import { currentMapping, planStatus, proposeAutomatic, setMapping } from "@/lib/migration/project";
import { CRM_FIXTURES } from "@/lib/migration/fixtures";
import { handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Correspondances (Analyste → Jerem) : corps = contrat migration_mapping.
 * ?propose=auto : proposition générique déduite de la structure lue.
 * ?fixture=crm : jeu de test au format de l'Analyste.
 * Réponses : 200 (version créée, problèmes, points à valider) · 400 format · 409 aucune source.
 */
export const POST = handler(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const v =
      sp.get("propose") === "auto"
        ? proposeAutomatic()
        : sp.get("fixture") === "crm"
          ? setMapping(CRM_FIXTURES.mapping, "fixture")
          : setMapping(await readJson(req), sp.get("source") === "user" ? "user" : "analyst");
    const st = planStatus();
    return json({ ok: true, version: v.version, issues: v.issues, review: { items: st.items, pending: st.pending, can_run: st.can_run, blockers: st.blockers } });
  },
  { write: true },
);

export const GET = handler(async () => json({ current: currentMapping(), status: planStatus() }));
