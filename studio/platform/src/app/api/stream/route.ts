import { getState, subscribe } from "@/lib/store";
import { checkHost } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events : chaque mutation du store est poussée aux clients. */
export async function GET(req: Request) {
  const denied = checkHost(req);
  if (denied) return denied;
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("hello", { revision: getState().revision });
      const unsub = subscribe((msg) => send("change", msg));
      const ping = setInterval(() => send("ping", Date.now()), 15000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
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
}
