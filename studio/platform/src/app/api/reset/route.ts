import { resetState } from "@/lib/store";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Remise à zéro de l'ATELIER (avant une répétition ou la démo), équipe REBORN seulement : investigations,
 * évènements, observations, modèles, schémas et captures SANS projet. Les données des projets clients et
 * le journal de migration ne sont jamais touchés (lib/store.ts, resetState).
 */
export const POST = handler(
  async () => {
    resetState();
    return json({ ok: true });
  },
  { access: ["operator"], write: true, project: "none" },
);
