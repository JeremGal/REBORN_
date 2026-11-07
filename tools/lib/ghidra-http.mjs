// Client for the ghidra-mcp headless server (github.com/bethington/ghidra-mcp), started by tools/ghidra-mcp.ps1.
// Unlike a one-shot REA call, the server keeps the analysed program in memory: import + analysis once, then
// each decompilation costs about a second.
import { localConfig } from "./config.mjs";

export function ghidraMcpUrl() {
  return (process.env.GHIDRA_MCP_URL || localConfig().ghidraMcpUrl || "http://127.0.0.1:8089").replace(/\/$/, "");
}

export async function gm(pathAndQuery, { method = "GET", body, timeoutMs = 120000 } = {}) {
  const headers = { "content-type": "application/json" };
  if (process.env.GHIDRA_MCP_AUTH_TOKEN) headers.authorization = `Bearer ${process.env.GHIDRA_MCP_AUTH_TOKEN}`;
  const res = await fetch(ghidraMcpUrl() + pathAndQuery, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) throw new Error(`${method} ${pathAndQuery.split("?")[0]}: ${data.error || res.status}`);
  return data;
}

export const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")).toString();
