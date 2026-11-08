import { getState, projectRevisions, subscribe } from "@/lib/store";
import { canSee, viewRevision, visibilityFor, type Visibility } from "@/lib/visibility";
import { ownedProjectIds, ownerOf } from "@/lib/migration/project";
import { projectScope } from "@/lib/migration/context";
import { currentPrincipal, type Principal } from "@/lib/auth/principal";
import { bearerToken, serviceFromToken } from "@/lib/auth/tokens";
import { getSessionPrincipal } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Intervalle des messages « ping », à chacun desquels l'identité de l'abonné est revérifiée. */
const PING_MS = 15000;
/** Connexions simultanées par compte ou par jeton de service (protège le nombre d'abonnés du store). */
const MAX_STREAMS_PER_PRINCIPAL = 8;
const g = globalThis as unknown as { __rebornStreams?: Map<string, number> };
const open = (g.__rebornStreams ??= new Map<string, number>());

const keyOf = (p: Principal) => (p.kind === "user" ? `user:${p.userId}` : p.kind === "service" ? `service:${p.tokenId}` : "anonymous");

/**
 * L'abonné est-il toujours autorisé ? Session revérifiée en base (déconnexion, révocation, changement de
 * mot de passe) ou jeton de service toujours configuré ; projet désigné toujours accessible. Renvoie
 * l'identité à jour (le rôle a pu changer), ou null pour fermer le flux.
 */
async function recheck(req: Request, before: Principal, designated: string | null): Promise<Principal | null> {
  let now: Principal | null = null;
  if (before.kind === "service") {
    const t = bearerToken(req);
    const s = t ? serviceFromToken(t) : null;
    now = s && s.service === before.service ? s : null;
  } else if (before.kind === "user") {
    const p = await getSessionPrincipal(req.headers);
    now = p.kind === "user" && p.sessionId === before.sessionId ? p : null;
  }
  if (!now || !designated) return now;
  const owner = ownerOf(designated);
  if (owner === undefined) return null;
  if (now.kind === "user" && !(owner === now.userId || (now.role === "operator" && owner === null))) return null;
  return now;
}

/**
 * Server-Sent Events : chaque mutation du store est poussée aux abonnés.
 * - Équipe (opérateur) et agents, sans projet désigné : flux complet de l'atelier, évènement compris.
 * - Compte client (ou ?project=) : seulement les évènements de SES projets, avec SA révision ; le premier
 *   message (hello) ne porte que cette révision. Aucun message n'est envoyé pour l'activité des autres.
 * L'identité est revérifiée à chaque ping (15 s) : session révoquée, compte retiré du projet → flux fermé.
 */
export const GET = handler(
  async (req) => {
    let who = currentPrincipal();
    const designated = projectScope.getStore() ?? null;
    const key = keyOf(who);
    if ((open.get(key) ?? 0) >= MAX_STREAMS_PER_PRINCIPAL) {
      return json({ ok: false, error: `Trop de connexions au flux en temps réel pour ce compte (${MAX_STREAMS_PER_PRINCIPAL} au plus) : fermez un onglet.` }, 429);
    }
    open.set(key, (open.get(key) ?? 0) + 1);
    let vis: Visibility = visibilityFor(who, designated, ownedProjectIds);
    const revision = () => viewRevision(vis, getState(), projectRevisions());
    const encoder = new TextEncoder();
    let finished = false;
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const close = () => {
          cleanup();
          try {
            controller.close();
          } catch {}
        };
        const send = (event: string, data: unknown) => {
          if (finished) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            cleanup();
          }
        };
        send("hello", { revision: revision() });
        const unsub = subscribe((msg) => {
          if (vis.all) return send("change", msg);
          if (!msg.event || !canSee(vis, getState(), msg.event)) return;
          send("change", { revision: revision(), event: msg.event });
        });
        const ping = setInterval(() => {
          void recheck(req, who, designated)
            .catch(() => null)
            .then((fresh) => {
              if (finished) return;
              if (!fresh) return close();
              who = fresh;
              vis = visibilityFor(who, designated, ownedProjectIds);
              send("ping", Date.now());
            });
        }, PING_MS);
        cleanup = () => {
          if (finished) return;
          finished = true;
          clearInterval(ping);
          unsub();
          const n = (open.get(key) ?? 1) - 1;
          if (n > 0) open.set(key, n);
          else open.delete(key);
        };
        req.signal.addEventListener("abort", close);
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  },
  { access: ["user", "explorer", "analyst"], project: "query" },
);
