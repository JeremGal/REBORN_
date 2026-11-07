#!/usr/bin/env node
// Starts REA's MCP server with the right Node and package, on any OS (no shell, no .cmd shim).
// Machine-specific paths: reborn.local.json { "reaNode": "...", "reaJs": ".../rea-agents/scripts/rea.mjs" }.
import { spawn } from "node:child_process";
import { nodeVersionOk, reaCommand, reaEnv } from "./lib/config.mjs";

// REA can decompile (Ghidra). It belongs to block 2 sessions only: block 3 rebuilds from the kit and must not have a
// decompiler. Start a block 2 session with: claude --mcp-config .mcp.block2.json   (that file sets REBORN_BLOCK=2).
if (process.env.REBORN_BLOCK !== "2") {
  process.stderr.write("[reborn] refusing to start the REA server outside a block 2 session (clean room). Use: claude --mcp-config .mcp.block2.json\n");
  process.exit(1);
}

const rea = reaCommand();
if (!rea.shell) {
  const v = nodeVersionOk(rea.cmd);
  if (!v.ok) {
    process.stderr.write(`[reborn] REA needs Node ^22.23.4, ^24.22.1 or >=26.12.1, found ${v.version} at ${rea.cmd}. Set reaNode in reborn.local.json.\n`);
    process.exit(1);
  }
}
const child = spawn(rea.cmd, [...rea.args, "mcp"], {
  stdio: "inherit",
  shell: rea.shell || false,
  env: { REA_MCP_OUTPUT_SCHEMA_PROFILE: "off", ...reaEnv(), ...process.env },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
