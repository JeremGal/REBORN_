// Runs REA / Craft Anything, stores raw output in the local evidence store, registers it in the git-tracked index.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { REA_VERSION, evidenceDir, nodeVersionOk, reaCommand, reaEnv, targetDir } from "./config.mjs";

export function sha256File(file) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(1 << 20);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest("hex");
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");

function indexPath(target) {
  return path.join(targetDir(target), "02-investigation", "evidence", "index.yaml");
}

export function register(target, entry) {
  const file = indexPath(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const doc = fs.existsSync(file)
    ? YAML.parseDocument(fs.readFileSync(file, "utf8"))
    : new YAML.Document({ target, entries: [] });
  if (!doc.has("entries") || doc.get("entries") == null) doc.set("entries", []);
  const entries = doc.get("entries");
  const items = entries.items ?? [];
  if (items.some((it) => (it.get ? it.get("id") : it.id) === entry.id && (it.get ? it.get("file") : it.file) === entry.file)) return;
  entries.add(doc.createNode(entry));
  blockStyle(entries);
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
}

// One entry per block so git diffs stay readable (a template written as `key: []` would otherwise stay inline).
export function blockStyle(seq) {
  if (!seq || !seq.items) return;
  seq.flow = false;
  for (const it of seq.items) if (it && "flow" in it) it.flow = false;
}

function findEvidenceId(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(65536);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const m = /"evidence_id"\s*:\s*"(ev_[0-9a-f]{64})"/.exec(buf.subarray(0, n).toString("utf8"));
  return m ? m[1] : null;
}

/**
 * Run one REA CLI command. Output (JSON) goes to .evidence/<target>/rea/<stamp>-<op>.json.
 * extraFiles: additional files REA writes itself (e.g. --evidence_output) to register too.
 */
export function runRea(target, reaArgs, { label = "", extraFiles = [], quiet = false } = {}) {
  const rea = reaCommand();
  if (!rea.shell) {
    const nv = nodeVersionOk(rea.cmd);
    if (!nv.ok) {
      throw new Error(`REA ${REA_VERSION} needs Node ^22.23.4, ^24.22.1 or >=26.12.1; ${rea.cmd} is ${nv.version}. Set reaNode in reborn.local.json.`);
    }
  }
  const op = reaArgs[0];
  const dir = path.join(evidenceDir(target), "rea");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${stamp()}-${op}.json`);
  const fd = fs.openSync(out, "w");
  const args = [...rea.args, ...reaArgs, "--format", "json"];
  const r = spawnSync(rea.cmd, args, {
    stdio: ["ignore", fd, "pipe"],
    shell: rea.shell || false,
    env: { ...process.env, ...reaEnv() },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  fs.closeSync(fd);
  const bytes = fs.statSync(out).size;
  const evId = bytes > 0 ? findEvidenceId(out) : null;
  const ok = r.status === 0 && bytes > 0;
  if (ok) {
    const base = path.relative(evidenceDir(target), out).split(path.sep).join("/");
    register(target, {
      id: evId ?? `rea:${path.basename(out, ".json")}`,
      kind: "rea",
      tool: "rea-agents",
      tool_version: REA_VERSION,
      operation: op,
      args: reaArgs.slice(1).map(redactPath),
      ...(label ? { subject: { label } } : {}),
      created_at: new Date().toISOString(),
      file: base,
      bytes,
      sha256: sha256File(out),
    });
    for (const extra of extraFiles) {
      if (!fs.existsSync(extra)) continue;
      const xid = findEvidenceId(extra);
      register(target, {
        id: xid ?? `rea:${path.basename(extra)}`,
        kind: "rea",
        tool: "rea-agents",
        tool_version: REA_VERSION,
        operation: `${op} (complete evidence)`,
        created_at: new Date().toISOString(),
        file: path.relative(evidenceDir(target), extra).split(path.sep).join("/"),
        bytes: fs.statSync(extra).size,
        sha256: sha256File(extra),
      });
    }
  } else if (bytes === 0) {
    fs.rmSync(out, { force: true });
  } else if (evId) {
    // REA failed but returned partial Evidence (e.g. a per-source timeout): keep it, flagged as partial.
    const head = fs.readFileSync(out, { encoding: "utf8", flag: "r" }).slice(0, 4000);
    const code = /"code"\s*:\s*"([^"]+)"/.exec(head)?.[1] ?? "error";
    const message = /"message"\s*:\s*"([^"]+)"/.exec(head)?.[1] ?? "";
    register(target, {
      id: evId,
      kind: "rea",
      tool: "rea-agents",
      tool_version: REA_VERSION,
      operation: op,
      args: reaArgs.slice(1).map(redactPath),
      ...(label ? { subject: { label } } : {}),
      created_at: new Date().toISOString(),
      file: path.relative(evidenceDir(target), out).split(path.sep).join("/"),
      bytes,
      sha256: sha256File(out),
      summary: `PARTIAL (${code}): ${message}`.slice(0, 300),
    });
  }
  const stderr = (r.stderr || Buffer.alloc(0)).toString("utf8");
  const lastErr = stderr
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.includes('"rea_progress"'))
    .slice(-3)
    .join("\n");
  if (!quiet) {
    console.log(`${ok ? "OK " : "ERR"} rea ${op}  exit=${r.status}  ${bytes ? `${(bytes / 1024).toFixed(0)} KB` : "no output"}${evId ? `  ${evId.slice(0, 19)}...` : ""}`);
    if (!ok && lastErr) console.log(`    ${lastErr.replace(/\n/g, "\n    ")}`);
  }
  return { ok, status: r.status, file: ok ? out : null, evidenceId: evId, bytes, stderr: lastErr };
}

// Keep the index free of personal absolute paths: only the file name is recorded.
function redactPath(arg) {
  return /^[A-Za-z]:\\|^\//.test(arg) ? `<path>/${path.basename(arg)}` : arg;
}

export function readJson(file, maxBytes = 50 * 1024 * 1024) {
  if (!file || fs.statSync(file).size > maxBytes) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
