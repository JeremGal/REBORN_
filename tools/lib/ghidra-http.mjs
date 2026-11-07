// Client for the ghidra-mcp headless server (github.com/bethington/ghidra-mcp), started by tools/ghidra-mcp.ps1.
// Unlike a one-shot REA call, the server keeps the analysed program in memory: import + analysis once, then
// each decompilation costs about a second.
import http from "node:http";
import { localConfig } from "./config.mjs";

export function ghidraMcpUrl() {
  return (process.env.GHIDRA_MCP_URL || localConfig().ghidraMcpUrl || "http://127.0.0.1:8089").replace(/\/$/, "");
}

// node:http rather than fetch: fetch (undici) drops any response whose headers take more than 5 minutes,
// and importing or analysing a large DLL keeps the request open far longer than that.
export function gm(pathAndQuery, { method = "GET", body, timeoutMs = 120000 } = {}) {
  const headers = { "content-type": "application/json" };
  if (process.env.GHIDRA_MCP_AUTH_TOKEN) headers.authorization = `Bearer ${process.env.GHIDRA_MCP_AUTH_TOKEN}`;
  const payload = body ? JSON.stringify(body) : undefined;
  if (payload) headers["content-length"] = Buffer.byteLength(payload);
  const where = `${method} ${pathAndQuery.split("?")[0]}`;
  return new Promise((resolve, reject) => {
    const req = http.request(ghidraMcpUrl() + pathAndQuery, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (res.statusCode >= 400 || data.error) reject(new Error(`${where}: ${data.error || res.statusCode}`));
        else resolve(data);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${where}: no answer after ${Math.round(timeoutMs / 1000)} s`)));
    req.on("error", (e) => reject(new Error(`${where}: ${e.message}`)));
    req.end(payload);
  });
}

export const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")).toString();
