import { currentSchema, schemasOf } from "@/lib/store";
import { publishSchema } from "@/lib/service";
import { currentPrincipal, isOperator } from "@/lib/auth/principal";
import { projectOfWrite, redactIncomingSchema, requireExecutorLease, secretContext } from "@/lib/migration/agent-writes";
import { ApiError, handler, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Description structurée de l'interface (champs, sections, sorties, éléments non reconstruits).
 * Chaque envoi crée une nouvelle version dans la portée (?project= : ce projet ; sinon l'atelier) ;
 * l'application reconstruite se régénère. Écrite par l'exécuteur de l'agent (écran découvert),
 * l'Analyste ou l'équipe ; ?source=user réservé à l'équipe. Exécuteur : dans le projet d'un client,
 * seulement s'il tient le prêt de la mission en cours (SPEC §6 ; 403 sinon). Avant l'enregistrement, les
 * valeurs proposées d'un champ mot de passe et toute copie d'un secret connu sont masquées (lib/migration/redact.ts).
 */
export const POST = handler(
  async (req) => {
    const source = new URL(req.url).searchParams.get("source") ?? "explorer";
    if (!["explorer", "analyst", "user"].includes(source)) throw new ApiError(400, "source : explorer (défaut), analyst ou user");
    if (source === "user" && !isOperator(currentPrincipal())) throw new ApiError(403, "?source=user : réservé à l'équipe REBORN (opérateur)");
    const raw = await readJson(req);
    const project = projectOfWrite(raw && typeof raw === "object" ? (raw as { investigation_id?: unknown }).investigation_id : undefined);
    await requireExecutorLease(req, [project], [source]);
    const { stored, issues } = publishSchema(redactIncomingSchema(raw, secretContext([project])), source);
    return json({ ok: true, version: stored.version, issues });
  },
  { access: ["explorer", "analyst", "operator"], write: true, project: "query" },
);

/** Schéma courant de la portée, ?all=1 pour l'historique. */
export const GET = handler(
  async (req) => {
    if (new URL(req.url).searchParams.get("all")) return json(schemasOf());
    const s = currentSchema();
    return s ? json(s) : json({ ok: false, error: "Aucun schéma" }, 404);
  },
  { access: ["explorer", "analyst", "operator"], project: "query" },
);
