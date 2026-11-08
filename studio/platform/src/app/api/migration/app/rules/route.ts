import { appStatus, publishRulesToApp } from "@/lib/migration/generate";
import { assertActive, businessModelPackage, getProject, migrationLog, recordBusinessModel } from "@/lib/migration/project";
import { actorName } from "@/lib/service";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Publie une version VALIDÉE du modèle métier dans le logiciel livré : { version? } (défaut : la
 * dernière validée). Les nouveaux documents l'utilisent ; les documents existants gardent leur version.
 * Propriétaire du projet ; l'auteur enregistré est l'identité authentifiée (jamais un champ du corps).
 */
export const POST = handler(
  async (req) => {
    const b = ((await readJson(req).catch(() => ({}))) ?? {}) as { version?: unknown };
    assertActive();
    const st = await appStatus();
    if (!st.app_id) throw new ApiError(409, "Aucun logiciel mis en service");
    const validated = (getProject().business_models ?? []).filter((m) => m.status === "validated");
    const meta = typeof b.version === "number" ? validated.find((m) => m.version === b.version) : validated.at(-1);
    if (!meta) throw new ApiError(409, typeof b.version === "number" ? `Le modèle métier v${b.version} n'est pas validé` : "Aucune version validée du modèle métier");
    const out = await publishRulesToApp(st.app_id, businessModelPackage(meta.version));
    recordBusinessModel(meta.version, { published: { app_id: st.app_id, at: new Date().toISOString(), by: actorName() } });
    migrationLog(`Modèle métier v${meta.version} publié dans le logiciel livré`, out.running ? `Pris en compte à chaud (version active : v${out.active_version ?? "?"})` : "Logiciel arrêté : la version sera chargée à son prochain démarrage");
    return json({ ok: true, version: meta.version, ...out });
  },
  { access: ["owner"], write: true, project: "query" },
);
