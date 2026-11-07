// Runs REA / Craft Anything, stores raw output in the local evidence store, registers it in the git-tracked index.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { REA_VERSION, evidenceDir, isOpName, nodeVersionOk, reaCommand, reaEnv, targetDir } from "./config.mjs";

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
// Two runs of the same operation in the same second (Claude Code runs tools in parallel) must not write the same file.
export const uniqueName = (op, ext = "json") => `${stamp()}-${process.pid}-${crypto.randomBytes(3).toString("hex")}-${op}.${ext}`;
export const timeoutMs = () => Math.max(1, Number(process.env.REBORN_TIMEOUT_MIN || 90)) * 60000;

function indexPath(target) {
  return path.join(targetDir(target), "02-investigation", "evidence", "index.yaml");
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The index is read, edited and rewritten: two parallel runs would lose entries without a lock.
function withLock(file, fn) {
  const lock = `${file}.lock`;
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 60000) { fs.rmSync(lock, { force: true }); continue; } } catch { /* released meanwhile */ }
      if (Date.now() - t0 > 30000) throw new Error(`the evidence index is locked: ${lock}`);
      sleep(25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

// Adds one entry. An entry is identified by its id alone: registering the same evidence again changes nothing.
export function register(target, entry) {
  const file = indexPath(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return withLock(file, () => {
    const doc = fs.existsSync(file)
      ? YAML.parseDocument(fs.readFileSync(file, "utf8"))
      : new YAML.Document({ target, entries: [] });
    if (!doc.has("entries") || doc.get("entries") == null) doc.set("entries", []);
    const entries = doc.get("entries");
    const items = entries.items ?? [];
    if (items.some((it) => (it.get ? it.get("id") : it.id) === entry.id)) return "duplicate";
    entries.add(doc.createNode(entry));
    blockStyle(entries);
    fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
    return "added";
  });
}

// One entry per block so git diffs stay readable (a template written as `key: []` would otherwise stay inline).
export function blockStyle(seq) {
  if (!seq || !seq.items) return;
  seq.flow = false;
  for (const it of seq.items) if (it && "flow" in it) it.flow = false;
}

// Re-hashes every evidence file against the index: a file edited, truncated or swapped after registration is caught here.
export function verifyEvidence(target) {
  const out = { checked: 0, missing: [], mismatched: [] };
  const file = indexPath(target);
  if (!fs.existsSync(file)) return out;
  const base = path.resolve(evidenceDir(target));
  const entries = YAML.parse(fs.readFileSync(file, "utf8"))?.entries ?? [];
  for (const e of entries) {
    const f = path.resolve(base, e.file ?? "");
    if (!f.startsWith(base + path.sep)) { out.mismatched.push(e.id); continue; }
    if (!fs.existsSync(f)) { out.missing.push(e.id); continue; }
    out.checked++;
    if (e.sha256 && sha256File(f) !== e.sha256) out.mismatched.push(e.id);
  }
  return out;
}

function findEvidenceId(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(65536);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const m = /"evidence_id"\s*:\s*"(ev_[0-9a-f]{64})"/.exec(buf.subarray(0, n).toString("utf8"));
  return m ? m[1] : null;
}

// A failed run is not evidence. Its output is kept for diagnosis, away from the folder the index points into.
export function quarantine(target, file) {
  const dir = path.join(evidenceDir(target), "errors");
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(file));
  fs.renameSync(file, dst);
  return dst;
}

/**
 * Run one REA CLI command. Output (JSON) goes to .evidence/<target>/rea/<stamp>-<pid>-<random>-<op>.json.
 * extraFiles: additional files REA writes itself (e.g. --evidence_output) to register too.
 */
export function runRea(target, reaArgs, { label = "", extraFiles = [], quiet = false } = {}) {
  const op = reaArgs[0];
  if (!isOpName(op)) throw new Error(`invalid REA operation name "${op}" (lowercase letters, digits and dashes)`);
  const rea = reaCommand();
  if (!rea.shell) {
    const nv = nodeVersionOk(rea.cmd);
    if (!nv.ok) {
      throw new Error(`REA ${REA_VERSION} needs Node ^22.23.4, ^24.22.1 or >=26.12.1; ${rea.cmd} is ${nv.version}. Set reaNode in reborn.local.json.`);
    }
  }
  const dir = path.join(evidenceDir(target), "rea");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, uniqueName(op));
  const fd = fs.openSync(out, "wx");
  const args = [...rea.args, ...reaArgs, "--format", "json"];
  const r = spawnSync(rea.cmd, args, {
    stdio: ["ignore", fd, "pipe"],
    shell: rea.shell || false,
    env: { ...process.env, ...reaEnv() },
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs(),
    windowsHide: true,
  });
  fs.closeSync(fd);
  const timedOut = r.error?.code === "ETIMEDOUT";
  const bytes = fs.statSync(out).size;
  const evId = bytes > 0 ? findEvidenceId(out) : null;
  const ok = r.status === 0 && bytes > 0 && !timedOut;
  let kept = out;
  if (ok) {
    const base = path.relative(evidenceDir(target), out).split(path.sep).join("/");
    register(target, {
      id: evId ?? `rea:${path.basename(out, ".json")}`,
      kind: "rea",
      tool: "rea-agents",
      tool_version: REA_VERSION,
      operation: op,
      args: redactArgs(reaArgs.slice(1)),
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
    kept = null;
  } else if (evId && !timedOut) {
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
      args: redactArgs(reaArgs.slice(1)),
      ...(label ? { subject: { label } } : {}),
      created_at: new Date().toISOString(),
      file: path.relative(evidenceDir(target), out).split(path.sep).join("/"),
      bytes,
      sha256: sha256File(out),
      summary: `PARTIAL (${code}): ${message}`.slice(0, 300),
    });
  } else {
    kept = quarantine(target, out);
  }
  const stderr = (r.stderr || Buffer.alloc(0)).toString("utf8");
  const lastErr = [timedOut ? `timed out after ${Math.round(timeoutMs() / 60000)} min (REBORN_TIMEOUT_MIN)` : "", ...stderr
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.includes('"rea_progress"'))
    .slice(-3)]
    .filter(Boolean)
    .join("\n");
  if (!ok) process.exitCode = 1;
  if (!quiet) {
    console.log(`${ok ? "OK " : "ERR"} rea ${op}  exit=${r.status ?? r.error?.code}  ${bytes ? `${(bytes / 1024).toFixed(0)} KB` : "no output"}${evId ? `  ${evId.slice(0, 19)}...` : ""}`);
    if (!ok && lastErr) console.log(`    ${lastErr.replace(/\n/g, "\n    ")}`);
  }
  return { ok, status: r.status, file: ok ? out : null, kept, evidenceId: evId, bytes, stderr: lastErr };
}

// Keep the index free of personal absolute paths: only the file name is recorded.
export function redactPath(arg) {
  return /^[A-Za-z]:[\\/]|^\//.test(arg) ? `<path>/${path.basename(arg)}` : arg;
}

// The index is tracked by git: arguments that name code of the original (a class, a method, a function, an address) are
// masked; the evidence file itself keeps the exact query, locally.
const SYMBOL_FLAGS = new Set(["--class-name", "--method-name", "--function", "--descriptor", "--procedure", "--address", "--namespace", "--name", "--symbol", "--start", "--goal"]);
// A value shaped like a code identifier (mixedCase, snake_case_name, package.Class.method) is masked whatever its flag;
// a plain label such as "Imbalance" or "tax" stays readable.
const looksLikeCode = (v) => !/^--/.test(v) && !/^[A-Za-z]:[\\/]|^\//.test(v) && (/^[A-Za-z_$][\w$]*(\.[\w$]+){2,}/.test(v) || /^[A-Za-z_$][\w$]*$/.test(v) && (/[a-z][A-Z]/.test(v) || /^[a-z]+_[a-z_]+$/.test(v) && v.length > 7));
export function redactArgs(args) {
  return args.map((a, i) => (i > 0 && SYMBOL_FLAGS.has(args[i - 1])) || looksLikeCode(a) ? "<symbol>" : redactPath(a));
}

export function readJson(file, maxBytes = 50 * 1024 * 1024) {
  if (!file || fs.statSync(file).size > maxBytes) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
