// Minimal MCP client for REA: one long-lived session (open the binary once, query many times).
// Ghidra imports and analyses a binary on open, which takes minutes; a session pays that cost once,
// whereas every one-shot `rea <command>` call pays it again.
import { spawn } from "node:child_process";
import { nodeVersionOk, reaCommand, reaEnv } from "./config.mjs";

export class ReaSession {
  constructor() {
    this.n = 0;
    this.pending = new Map();
    this.buf = "";
    this.err = "";
  }

  async start(extraEnv = {}) {
    const rea = reaCommand();
    if (!rea.shell) {
      const v = nodeVersionOk(rea.cmd);
      if (!v.ok) throw new Error(`REA needs Node ^22.23.4, ^24.22.1 or >=26.12.1; ${rea.cmd} is ${v.version}`);
    }
    this.child = spawn(rea.cmd, [...rea.args, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: rea.shell || false,
      windowsHide: true,
      env: { REA_MCP_OUTPUT_SCHEMA_PROFILE: "off", ...process.env, ...reaEnv(), ...extraEnv },
    });
    this.child.stdout.on("data", (d) => {
      this.buf += d.toString("utf8");
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          const p = m.id !== undefined && this.pending.get(m.id);
          if (p) { this.pending.delete(m.id); p.resolve(m); }
        } catch { /* not a JSON-RPC line */ }
      }
    });
    this.child.stderr.on("data", (d) => { this.err = (this.err + d.toString("utf8")).slice(-20000); });
    this.child.on("exit", (code) => {
      for (const [, p] of this.pending) p.reject(new Error(`REA exited (${code}): ${this.err.slice(-300)}`));
      this.pending.clear();
    });
    await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "reborn", version: "0.1.0" } }, 60000);
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }

  rpc(method, params, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const id = ++this.n;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`timeout after ${Math.round(timeoutMs / 1000)} s: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (m) => { clearTimeout(t); resolve(m); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  async call(tool, args, timeoutMs) {
    const m = await this.rpc("tools/call", { name: tool, arguments: args }, timeoutMs);
    if (m.error) throw new Error(`${tool}: ${m.error.message}`);
    const r = m.result ?? {};
    const text = (r.content ?? []).map((c) => c.text).filter(Boolean).join("\n");
    let data = r.structuredContent ?? null;
    if (!data) { try { data = JSON.parse(text); } catch { data = null; } }
    return { isError: !!r.isError, text, data };
  }

  close() { try { this.child?.kill(); } catch { /* already gone */ } }
}

export function collectStrings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => collectStrings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => collectStrings(v, out));
  return out;
}
