import fs from "node:fs";
import { shotPath } from "@/lib/store";
import { checkHost } from "@/lib/http";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkHost(req);
  if (denied) return denied;
  const { id } = await params;
  const p = shotPath(id);
  if (!p) return new Response("Not found", { status: 404 });
  const ext = id.split(".").pop() ?? "png";
  return new Response(fs.readFileSync(p), { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" } });
}
