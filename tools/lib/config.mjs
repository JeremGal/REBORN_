// Shared paths and tool resolution. Machine-specific overrides live in reborn.local.json (gitignored).
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REA_VERSION = "6.8.0";
export const REA_MIN_NODE = { 22: [23, 4], 24: [22, 1], 26: [12, 1] };

export function localConfig() {
  const file = path.join(ROOT, "reborn.local.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function targetDir(target) {
  return path.join(ROOT, "targets", target);
}

export function evidenceDir(target) {
  const base = process.env.REBORN_EVIDENCE_DIR || localConfig().evidenceDir || path.join(ROOT, ".evidence");
  return path.join(base, target);
}

export function nodeVersionOk(nodeBin) {
  const r = spawnSync(nodeBin, ["--version"], { encoding: "utf8" });
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec((r.stdout || "").trim());
  if (!m) return { ok: false, version: "unknown" };
  const [maj, min, pat] = m.slice(1).map(Number);
  const need = REA_MIN_NODE[maj];
  const ok = maj > 26 || (need !== undefined && (min > need[0] || (min === need[0] && pat >= need[1])));
  return { ok, version: m[0] };
}

// REA is launched as `<node> <rea.mjs>` so no shell is needed (Windows .cmd shims need one).
export function reaCommand() {
  const cfg = localConfig();
  const node = process.env.REBORN_REA_NODE || cfg.reaNode || process.execPath;
  let js = process.env.REBORN_REA_JS || cfg.reaJs;
  if (!js) {
    try {
      const root = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const candidate = path.join(root, "rea-agents", "scripts", "rea.mjs");
      if (fs.existsSync(candidate)) js = candidate;
    } catch {
      /* npm not on PATH */
    }
  }
  if (js) return { cmd: node, args: [js], via: `node ${js}` };
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  return { cmd: npx, args: ["-y", `rea-agents@${REA_VERSION}`], via: "npx", shell: process.platform === "win32" };
}

// Environment REA's native providers need (Ghidra + JDK 21). Values come from the real environment first,
// then from reborn.local.json (ghidraInstallDir, javaHome, ghidraStartupTimeoutMs). Never overrides an explicit variable.
export function reaEnv() {
  const cfg = localConfig();
  const env = {};
  const set = (k, v) => { if (v && !process.env[k]) env[k] = String(v); };
  set("GHIDRA_INSTALL_DIR", cfg.ghidraInstallDir);
  set("JAVA_HOME", cfg.javaHome);
  set("REA_GHIDRA_STARTUP_TIMEOUT_MS", cfg.ghidraStartupTimeoutMs);
  return env;
}

export function craftCommand() {
  return process.env.REBORN_CRAFT_CLI || localConfig().craftCli || "craft-anything-cli";
}

export function chromePath() {
  const cfg = localConfig();
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (cfg.chrome) return cfg.chrome;
  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] || [];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}
