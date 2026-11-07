import { resetState } from "@/lib/store";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Remise à zéro (avant une répétition ou la démo). */
export const POST = handler(
  async () => {
    resetState();
    return json({ ok: true });
  },
  { write: true },
);
