#!/usr/bin/env node
// ReBorn team CLI. Run without arguments for help.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import YAML from "yaml";
import { ROOT, chromePath, craftCommand, evidenceDir, localConfig, reaCommand, targetDir, nodeVersionOk } from "./lib/config.mjs";
import { blockStyle, readJson, register, runRea, sha256File } from "./lib/evidence.mjs";
import { listTargets, loadTarget } from "./lib/load.mjs";
import { validateTarget } from "./lib/validate.mjs";
import { renderDossier } from "./lib/dossier.mjs";
import { inventoryUi } from "./lib/ui-extract.mjs";
import { buildHandoff, computeCoverage } from "./lib/handoff.mjs";
import { schemaToEntities } from "./lib/sql-schema.mjs";

const HELP = `ReBorn CLI

Project
  init <target> --name "<name>" --kind exe|saas|both   create targets/<target> from the template
  status [target]                                      what each block has produced so far
  validate [target]                                    contracts + cross references (run before every commit)
  dossier <target>                                     render 02-investigation/dossier.md (human read)
  handoff <target>                                      build 02-investigation/handoff.json (machine kit for the rebuild block)
  ask <target>                                         turn open unknowns (probe h-mission) into block 1 missions
  coverage <target>                                    how much of the original the cards cover (screens, entities; features unknown)

Investigation (block 2): evidence goes to .evidence/<target>/ (gitignored) and is registered in evidence/index.yaml
  analyze <target> <file|folder|url>                   detect the kind and run the right command (routes like REA/Craft)
  triage <target> <file|folder>                        first pass on a .exe/.dll, an install folder, an archive, an .asar or a database
  js <target> <dir|app.asar> [--max-kb 300]           static JavaScript / Electron analysis (optionally skip huge bundles)
  web <target> <url> [--cdp <endpoint>]                passive page inspection + script export + JS analysis
  har <target> <session.har>                           API surface from a recorded browser session
  sqlite <target> <file> [--table <name>]              schema (or one table) of a SQLite database
  schema <target> <create.sql> [--only T,T]            a shipped SQL create script -> entity cards (types, keys), graded confirmed
  rea <target> <rea-command> [args...]                 any REA CLI command (rea --help lists 175)
  doc <target> <url>                                   public documentation page -> markdown evidence (Crawl4AI in Docker)
  ui <target> <folder|file>                            shipped UI definition files (GtkBuilder .ui/.glade) -> screen candidates
  find <target> <file.exe> "<label>"                   label seen on screen -> strings -> functions using them (Craft, Deep mode, gated by legal basis)
  craft <target> <command> [args...]                   any Craft Anything command (322); analysis output registered as evidence
`;

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = (name, def = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };
const needTarget = (t) => { if (!t) die("missing <target>"); if (!fs.existsSync(targetDir(t))) die(`unknown target "${t}". Create it with: node tools/reborn.mjs init ${t} --name "..." --kind exe`); return t; };
const absolute = (p) => path.resolve(process.cwd(), p);

// ---------- project commands ----------

function init(target) {
  if (!target || !/^[a-z0-9][a-z0-9-]*$/.test(target)) die("target id must be lowercase letters, digits and dashes, e.g. pc-compta");
  const name = opt("name", target);
  const kind = opt("kind", "exe");
  if (!["exe", "saas", "both"].includes(kind)) die("--kind must be exe, saas or both");
  const dst = targetDir(target);
  if (fs.existsSync(dst)) die(`targets/${target} already exists`);
  const src = path.join(ROOT, "targets", "_template");
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name), b = path.join(to, e.name);
      if (e.isDirectory()) copy(a, b);
      else fs.writeFileSync(b, fs.readFileSync(a, "utf8").replaceAll("__TARGET_ID__", target).replaceAll("__TARGET_NAME__", name).replaceAll("__TARGET_KIND__", kind));
    }
  };
  copy(src, dst);
  console.log(`created targets/${target}. Next: fill target.yaml (access, legal basis), then write the first missions in 01-exploration/missions/.`);
}

function status(target) {
  const targets = target ? [needTarget(target)] : listTargets();
  if (!targets.length) return console.log("no target yet: node tools/reborn.mjs init <target> --name ... --kind exe");
  for (const t of targets) {
    const d = loadTarget(t);
    const v = validateTarget(t);
    const by = (arr, k) => Object.entries(arr.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {})).map(([a, b]) => `${a} ${b}`).join(", ") || "0";
    console.log(`\n${t}  (${d.meta?.name ?? "?"}, ${d.meta?.kind ?? "?"})`);
    console.log(`  1. explore      missions: ${by(d.missions, "status")} | runs: ${d.runs.length} | observations: ${d.observations.length}`);
    console.log(`  2. investigate  features: ${d.features.length} (${by(d.features, "status")}) | rules: ${d.rules.length} | screens: ${d.screens.length} | entities: ${d.entities.length} | evidence: ${d.evidence.length} | open unknowns: ${d.unknowns.filter((u) => u.status === "open").length}`);
    console.log(`  3. rebuild      parity reports: ${d.parity.length}${d.parity[0] ? ` (last: ${d.parity.at(-1).results.filter((r) => r.result === "match").length}/${d.parity.at(-1).results.length} match)` : ""}`);
    console.log(`  validation      ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
  }
}

function validate(target) {
  const targets = target ? [needTarget(target)] : listTargets();
  let failed = false;
  for (const t of targets) {
    const r = validateTarget(t);
    console.log(`\n${t}: ${r.errors.length} error(s), ${r.warnings.length} warning(s)  [${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ")}]`);
    r.errors.forEach((e) => console.log(`  ERROR ${e}`));
    r.warnings.forEach((w) => console.log(`  warn  ${w}`));
    if (r.errors.length) failed = true;
  }
  if (!targets.length) console.log("no target to validate");
  process.exit(failed ? 1 : 0);
}

function ask(target) {
  needTarget(target);
  const file = path.join(targetDir(target), "02-investigation", "unknowns.yaml");
  if (!fs.existsSync(file)) die("no unknowns.yaml");
  const t = loadTarget(target);
  const featById = new Map(t.features.map((f) => [f.id, f]));
  const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"));
  const missionsDir = path.join(targetDir(target), "01-exploration", "missions");
  fs.mkdirSync(missionsDir, { recursive: true });
  const used = fs.readdirSync(missionsDir).map((f) => Number((/^M-(\d+)\.ya?ml$/.exec(f) || [])[1])).filter(Boolean);
  let next = (used.length ? Math.max(...used) : 0) + 1;
  let created = 0;
  for (const u of doc.get("unknowns")?.items ?? []) {
    if (u.get("status") !== "open") continue;
    const probe = u.get("probe");
    if (!probe || probe.get("kind") !== "h-mission" || probe.get("mission")) continue;
    const id = `M-${String(next++).padStart(3, "0")}`;
    const blocks = u.get("blocks")?.toJSON?.() ?? [];
    // Make the mission computer-use-ready: UI steps from the probe, and the exact values to read from the blocked
    // feature's first acceptance scenario, so the run links straight back to what it completes.
    const feat = blocks.map((b) => featById.get(b)).find(Boolean);
    const acc = feat?.acceptance?.[0];
    const readKeys = acc?.expected_values && Object.keys(acc.expected_values).length ? Object.keys(acc.expected_values) : [];
    const thenKeys = acc?.then ? [acc.then] : [];
    const uiSteps = [
      { action: "open", target: t.meta?.name ?? target },
      { action: "note", target: probe.get("suggestion") },
    ];
    for (const k of readKeys) uiSteps.push({ action: "read", capture: k });
    if (!readKeys.length && acc) uiSteps.push({ action: "read", capture: "the values stated in the acceptance 'then'" });
    uiSteps.push({ action: "screenshot", target: "each screen touched" });
    const mission = {
      id,
      title: `Answer ${u.get("id")}: ${u.get("question")}`.slice(0, 120),
      goal: probe.get("suggestion"),
      priority: feat?.priority === "must" ? "must" : "should",
      capture: { screenshots: "every-step", read_values: readKeys.length ? readKeys : thenKeys },
      success_criteria: [acc ? `Acceptance ${acc.id} gets real expected values and ${u.get("id")} is answered` : `The run answers: ${u.get("question")}`],
      ui_steps: uiSteps,
      ...(acc ? { fills: { acceptance: acc.id } } : {}),
      features: blocks,
      requested_by: u.get("id"),
      status: "todo",
    };
    fs.writeFileSync(path.join(missionsDir, `${id}.yaml`), YAML.stringify(mission, { lineWidth: 0 }));
    probe.set("mission", id);
    created++;
    console.log(`created ${id} for ${u.get("id")}${acc ? ` (fills ${acc.id})` : ""}`);
  }
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
  console.log(created ? `${created} computer-use-ready mission(s) for block 1` : "no open unknown with an h-mission probe left");
}

// ---------- investigation commands ----------

function addArtifact(target, file) {
  const meta = path.join(targetDir(target), "target.yaml");
  const doc = YAML.parseDocument(fs.readFileSync(meta, "utf8"));
  const sha = sha256File(file);
  const items = doc.get("artifacts")?.items ?? [];
  if (!items.some((it) => it.get("sha256") === sha)) {
    if (!doc.has("artifacts") || !doc.get("artifacts")) doc.set("artifacts", []);
    doc.get("artifacts").add(doc.createNode({ name: path.basename(file), sha256: sha, bytes: fs.statSync(file).size, source: "local copy (not in git)" }));
    blockStyle(doc.get("artifacts"));
    fs.writeFileSync(meta, doc.toString({ lineWidth: 0 }));
  }
  return sha;
}

function fullEvidencePath(target, op) {
  const dir = path.join(evidenceDir(target), "rea");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}-${op}.complete.json`);
}

// Markers looked up in REA's import and resource evidence. Results are hypotheses, never conclusions.
const TECH_MARKERS = [
  [/mscoree\.dll/i, ".NET (managed): use inspect-managed-artifact, no engine needed"],
  [/msvbvm[56]0\.dll/i, "Visual Basic 6"],
  [/wd\d{3}vm\w*\.dll|wd\d{3}\w*\.dll/i, "WinDev / WLanguage (PC SOFT): bytecode is proprietary, rely on resources, data files (HFSQL .fic/.ndx) and observation"],
  [/borlndmm|DVCLAL|PACKAGEINFO|rtl\d{2,3}\.bpl|vcl\d{2,3}\.bpl/i, "Delphi / C++Builder (VCL): forms are stored in RCDATA resources"],
  [/qt[56]core|qt6core/i, "Qt (C++)"],
  [/wxmsw|wxbase/i, "wxWidgets (C++)"],
  [/python3\d*\.dll|PYZ-00\.pyz|pyi-windows/i, "Python (PyInstaller): inspect-artifact lists the archive"],
  [/jvm\.dll|java\.exe|\.jar"/i, "Java"],
  [/libcef\.dll/i, "Chromium Embedded Framework (HTML UI)"],
  [/electron|app\.asar/i, "Electron: run `reborn js` on resources/app.asar"],
  [/mfc\d{2,3}u?\.dll/i, "MFC (C++)"],
  [/msjet|odbc32\.dll|msado/i, "Uses ODBC / Jet / ADO databases"],
  [/sqlite3?\.dll|sqlite3_open/i, "Embeds SQLite"],
];

function guessTech(files) {
  const hits = new Set();
  for (const f of files) {
    if (!f) continue;
    const st = fs.statSync(f);
    const fd = fs.openSync(f, "r");
    const buf = Buffer.alloc(Math.min(st.size, 8 * 1024 * 1024));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const text = buf.toString("utf8");
    for (const [re, label] of TECH_MARKERS) if (re.test(text)) hits.add(label);
  }
  return [...hits];
}

// Standard Win32 resource type ids.
const RT = { 1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG", 6: "STRING", 7: "FONTDIR", 8: "FONT", 9: "ACCELERATOR", 10: "RCDATA", 11: "MESSAGETABLE", 12: "GROUP_CURSOR", 14: "GROUP_ICON", 16: "VERSION", 17: "DLGINCLUDE", 19: "PLUGPLAY", 20: "VXD", 21: "ANICURSOR", 22: "ANIICON", 23: "HTML", 24: "MANIFEST" };

function summarizeResources(file) {
  const res = readJson(file)?.normalized_result?.resources;
  if (!Array.isArray(res)) return;
  const counts = {};
  for (const r of res) {
    const k = r.type?.name ?? (r.type?.id !== undefined ? RT[r.type.id] ?? `#${r.type.id}` : String(r.type));
    counts[k] = (counts[k] || 0) + 1;
  }
  console.log(`\nresources (${res.length}): ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (counts.DIALOG) console.log("  DIALOG templates present: describe each window from them (controls, labels, layout) in screens/S-xxx.yaml.");
  if (counts.MENU || counts.ACCELERATOR) console.log("  MENU / ACCELERATOR present: menu tree and keyboard shortcuts are recoverable for screens/actions.");
  if (counts.STRING || counts.MESSAGETABLE) console.log("  STRING tables present: labels and error messages are recoverable.");
  if (counts.RCDATA) console.log("  RCDATA present: Delphi stores its forms (DFM) here; WinDev and others store data blobs.");
  if (!counts.DIALOG && !counts.STRING) console.log("  no DIALOG and no STRING table: the UI is built in code at runtime. Screen inventory must come from block 1 runs.");
}

const DATA_FILE =/\.(db|sqlite3?|db3|mdb|accdb|fic|ndx|mmo|fdb|gdb|dbf|mmb|sdf|ldf|mdf|xml|ini|cfg|config|json|asar|dll|exe)$/i;

function scanFolder(dir, max = 4000) {
  const found = {};
  let n = 0;
  const walk = (d, depth) => {
    if (depth > 6 || n > max) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (DATA_FILE.test(e.name)) {
        n++;
        const ext = path.extname(e.name).toLowerCase();
        (found[ext] ||= []).push(path.relative(dir, full));
      }
    }
  };
  walk(dir, 0);
  return found;
}

// Route by target, the way REA and Craft Anything do: look at the thing, then pick the first tool.
function detectKind(p) {
  if (/^https?:\/\//i.test(p)) return "url";
  if (!fs.existsSync(p)) return "missing";
  if (fs.statSync(p).isDirectory()) return "dir";
  if (/\.sql$/i.test(p)) return "sql";
  if (/\.har$/i.test(p)) return "har";
  const head = Buffer.alloc(16);
  const fd = fs.openSync(p, "r"); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  if (head.toString("latin1", 0, 15) === "SQLite format 3") return "sqlite";
  if (/\.asar$/i.test(p)) return "asar";
  if (head[0] === 0x4d && head[1] === 0x5a) return "pe";             // MZ: Windows executable/DLL
  if (head[0] === 0x50 && head[1] === 0x4b) return /\.jar$/i.test(p) ? "jar" : "zip"; // PK: zip/jar/apk
  if (head[0] === 0x7f && head.toString("latin1", 1, 4) === "ELF") return "elf";
  return "unknown";
}

// One entry point that detects the input and runs the right sub-command (or says what to do next).
function analyze(target, input) {
  needTarget(target);
  if (!input) die("usage: analyze <target> <file|folder|url>");
  const p = /^https?:\/\//i.test(input) ? input : absolute(input);
  const kind = detectKind(p);
  console.log(`analyze: detected "${kind}"`);
  switch (kind) {
    case "url": return (p.includes("://") && /\/\/[^/]+\/?$/.test(p)) ? web(target, p) : doc(target, p);
    case "dir": case "pe": case "sqlite": case "asar": return triage(target, p);
    case "sql": return schema(target, p);
    case "har": return har(target, p);
    case "jar": case "zip": {
      addArtifact(target, p);
      console.log(`  archive (${kind}). Look inside for a shipped SQL schema or an app bundle:`);
      console.log(`  - extract it, then: reborn schema ${target} <create.sql>  (if it ships one)`);
      console.log(`  - or: reborn craft ${target} core-archive-show --path "${p}"`);
      return;
    }
    case "elf": console.log("  ELF binary: reborn rea " + target + " inspect-binary-layout <path> (Linux tools needed for deep)"); return;
    case "missing": die(`not found: ${p}`); break;
    default: console.log("  unknown type. Try a specific command: triage / schema / sqlite / js / doc / web.");
  }
}

function triage(target, input) {
  needTarget(target);
  if (!input) die("missing <file|folder>");
  const p = absolute(input);
  if (!fs.existsSync(p)) die(`not found: ${p}`);
  const label = path.basename(p);
  console.log(`triage ${label} → target ${target} (evidence store: ${path.relative(ROOT, evidenceDir(target)) || evidenceDir(target)})`);

  if (fs.statSync(p).isDirectory()) {
    const full = fullEvidencePath(target, "inspect-desktop-application");
    runRea(target, ["inspect-desktop-application", p, "--detail", "summary", "--evidence_output", full], { label, extraFiles: [full] });
    const files = scanFolder(p);
    console.log("\nfiles worth a look (by extension):");
    for (const [ext, list] of Object.entries(files).sort()) console.log(`  ${ext.padEnd(8)} ${list.length}  e.g. ${list.slice(0, 3).join(", ")}`);
    console.log("\nnext: triage the main .exe, `sqlite` any database, `js` any .asar.");
    return;
  }

  const head = Buffer.alloc(16);
  const fd = fs.openSync(p, "r"); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  const sha = addArtifact(target, p);
  console.log(`sha256 ${sha} (added to target.yaml artifacts)`);

  if (head.toString("latin1", 0, 15) === "SQLite format 3") return sqlite(target, p);
  if (/\.asar$/i.test(p)) return js(target, p);

  if (head[0] === 0x4d && head[1] === 0x5a) {
    // REA PE readers default to a 64 MiB input budget; raise it for big executables (installers, bundled runtimes).
    const big = fs.statSync(p).size;
    const cap = big > 60 * 1024 * 1024 ? ["--max-file-bytes", String(big + 1024)] : [];
    const outputs = [];
    for (const op of ["inspect-pe-imports", "inspect-pe-resources", "inspect-pe-certificates", "inspect-pe-load-config", "inspect-native-exports"]) {
      outputs.push(runRea(target, [op, p, ...cap], { label }).file);
    }
    // REA exits 0 on a negative answer too: read the classification, not the exit code.
    const managed = runRea(target, ["inspect-managed-artifact", p], { label, quiet: true });
    const mj = readJson(managed.file);
    const mstatus = (mj?.normalized_result ?? mj?.summary?.normalized_result)?.classification?.status;
    console.log(!managed.ok ? `ERR rea inspect-managed-artifact  ${managed.stderr}` : mstatus === "not-managed" ? "--  rea inspect-managed-artifact: no CLI metadata, not .NET (native code)" : `OK  rea inspect-managed-artifact: .NET assembly (${mstatus ?? "managed"}), continue with inspect-managed-members`);
    outputs.push(managed.file);
    const probes = { "inspect-go-binary": (s) => s?.build_info, "inspect-rust-binary": (s) => s?.auditable_metadata ?? s?.rustc_commit };
    for (const [op, found] of Object.entries(probes)) {
      const full = fullEvidencePath(target, op);
      const r = runRea(target, [op, p, "--detail", "summary", "--evidence_output", full], { label, extraFiles: [full], quiet: true });
      const s = (readJson(r.file)?.summary?.normalized_result ?? readJson(r.file)?.normalized_result)?.summary;
      console.log(!r.ok ? `ERR rea ${op}` : found(s) ? `OK  rea ${op}: embedded ${op.includes("go") ? "Go" : "Rust"} metadata found` : `--  rea ${op}: no ${op.includes("go") ? "Go" : "Rust"} metadata`);
    }
    const art = fullEvidencePath(target, "inspect-artifact");
    outputs.push(runRea(target, ["inspect-artifact", p, "--detail", "summary", "--evidence_output", art, "--integrity-policy", "record-and-continue"], { label, extraFiles: [art] }).file);
    summarizeResources(outputs[1]);
    const tech = guessTech(outputs);
    console.log(`\ntechnology hints (hypotheses, confirm before writing target.yaml tech):${tech.length ? "" : " none found"}`);
    tech.forEach((t) => console.log(`  - ${t}`));
    const dlls = new Set();
    for (const f of outputs.filter(Boolean)) {
      const txt = fs.readFileSync(f, "utf8");
      for (const m of txt.matchAll(/"([A-Za-z0-9_.+-]+\.(?:dll|DLL|drv|ocx|bpl))"/g)) dlls.add(m[1].toLowerCase());
    }
    if (dlls.size) console.log(`\nimported libraries (${dlls.size}): ${[...dlls].slice(0, 40).join(", ")}${dlls.size > 40 ? ", ..." : ""}`);
    console.log("\nnext: run `triage` on the install folder for data files, then describe screens and entities from the resources and the runs.");
    return;
  }

  const art = fullEvidencePath(target, "inspect-artifact");
  runRea(target, ["inspect-artifact", p, "--detail", "summary", "--evidence_output", art, "--integrity-policy", "record-and-continue"], { label, extraFiles: [art] });
}

function js(target, input, maxKbDefault) {
  needTarget(target);
  if (!input) die("missing <dir|app.asar>");
  const p = absolute(input);
  const full = fullEvidencePath(target, "analyze-javascript-application");
  const args = ["analyze-javascript-application", p, "--detail", "summary", "--evidence_output", full, "--integrity-policy", "record-and-continue"];
  // Very large third-party bundles can exceed REA's per-source deadline (300 s): optionally analyse only files under a size cap.
  const maxKb = Number(opt("max-kb", maxKbDefault ?? 0));
  if (maxKb > 0 && fs.statSync(p).isDirectory()) {
    const keep = [], skipped = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(m?js|cjs)$/i.test(e.name)) (fs.statSync(f).size <= maxKb * 1024 ? keep : skipped).push(path.relative(p, f).split(path.sep).join("/")); } };
    walk(p);
    if (skipped.length) {
      console.log(`  analysing ${keep.length} JS files under ${maxKb} KB, skipping ${skipped.length} larger one(s) (likely third-party bundles): ${skipped.join(", ")}`);
      const list = path.join(path.dirname(full), `${path.basename(full, ".json")}.sources.json`);
      fs.writeFileSync(list, JSON.stringify(keep));
      args.push("--source-paths-json", list);
    }
  }
  const r = runRea(target, args, { label: path.basename(p), extraFiles: [full] });
  const j = readJson(r.file);
  const s = j?.summary?.normalized_result?.summary;
  if (s) {
    const e = s.electron || {};
    console.log(`  files ${s.statistics?.relevant_files} | parsed JS ${s.statistics?.parsed_javascript_files} | findings ${s.statistics?.findings} | windows ${e.browser_windows ?? 0} | contextBridge APIs ${e.context_bridge_apis ?? 0} | IPC ops ${e.ipc?.operations ?? 0} | coverage ${s.coverage?.application?.status}`);
  }
}

function sqlite(target, input) {
  needTarget(target);
  if (!input) die("missing <file>");
  const p = absolute(input);
  const table = opt("table");
  const args = ["inspect-sqlite-database", p];
  if (table) args.push("--table", table);
  const r = runRea(target, args, { label: path.basename(p) });
  const nr = readJson(r.file)?.normalized_result;
  if (!nr) return;
  if (nr.artifact?.bytes === 0) return console.log("  empty file: the application creates this database on first run. Ask block 1 for a run that saves data, then inspect the populated copy.");
  const tables = nr.schema?.tables ?? [];
  console.log(`  ${nr.engine?.name ?? "SQLite"} ${nr.engine?.version ?? ""} | tables ${tables.length} | indexes ${nr.schema?.indexes?.length ?? 0} | views ${nr.schema?.views?.length ?? 0} | triggers ${nr.schema?.triggers?.length ?? 0}`);
  for (const tb of tables.slice(0, 60)) {
    const cols = (tb.columns ?? []).map((c) => c.name ?? c).filter(Boolean);
    console.log(`  - ${tb.name ?? tb.table ?? "?"}${cols.length ? ` (${cols.slice(0, 12).join(", ")}${cols.length > 12 ? ", ..." : ""})` : ""}`);
  }
  if (tables.length) console.log("  next: one domain/<Entity>.yaml per business table; add --table <name> for sample rows.");
}

function har(target, input) {
  needTarget(target);
  if (!input) die("missing <session.har>");
  const p = absolute(input);
  const full = fullEvidencePath(target, "inspect-web-network-capture");
  runRea(target, ["inspect-web-network-capture", p, "har", "--detail", "summary", "--evidence_output", full], { label: path.basename(p), extraFiles: [full] });
  console.log("  next: rea inspect-analysis-view on the complete evidence with the api-surface view (see the reverse-engineer-anything skill).");
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on("error", reject);
  });
}

async function web(target, url) {
  needTarget(target);
  if (!url) die("missing <url>");
  let endpoint = opt("cdp");
  let chrome = null;
  let profile = null;
  if (!endpoint) {
    const exe = chromePath();
    if (!exe) die("Chrome not found: set CHROME_PATH or chrome in reborn.local.json");
    const port = 9300 + Math.floor(Math.random() * 90);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), "reborn-chrome-"));
    chrome = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", url], { stdio: "ignore", windowsHide: true });
    endpoint = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) {
      try { await getJson(`${endpoint}/json/version`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  try {
    const origin = new URL(url).origin;
    const pages = await getJson(`${endpoint}/json`);
    const page = pages.find((p) => p.type === "page" && p.url.startsWith(origin));
    if (!page) die(`no open tab on ${origin} at ${endpoint}`);
    runRea(target, ["list-browser-targets", endpoint], { label: origin });
    const insp = runRea(target, ["inspect-web-page", endpoint, page.id, "--observation-ms", "3000", "--include-script-sources", "--include-accessibility-text", "--include-json-body-shapes"], { label: page.url });
    if (insp.ok) {
      const outDir = path.join(evidenceDir(target), "web-scripts", new URL(url).hostname + "-" + Date.now());
      fs.mkdirSync(path.dirname(outDir), { recursive: true }); // REA wants an absent directory inside an existing parent
      const exp =runRea(target, ["export-web-scripts", insp.file, outDir], { label: page.url });
      if (exp.ok && fs.existsSync(outDir)) js(target, outDir, 300);
    }
  } finally {
    if (chrome) {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
      else chrome.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 1000));
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files for a moment */ }
    }
  }
}

// How much of the original the cards cover (screens vs windows found, entities vs tables found; features unknown).
function coverage(target) {
  needTarget(target);
  const c = computeCoverage(loadTarget(target));
  console.log(`coverage of ${target} (denominators are what the evidence found, a lower bound, not a guarantee of completeness)`);
  for (const [k, v] of Object.entries(c)) {
    console.log(`  ${k.padEnd(9)} ${String(v.carded).padStart(3)} carded / ${v.inventoried ?? "?"} found${v.ratio != null ? ` (${v.ratio}%)` : ""}${v.note ? `   ${v.note}` : ""}`);
  }
}

// A shipped SQL create script -> entity cards with real types/keys (graded confirmed). Reusable across targets.
function schema(target, input) {
  needTarget(target);
  if (!input) die("usage: schema <target> <create-script.sql> [--only TABLE,TABLE]");
  const p = absolute(input);
  if (!fs.existsSync(p)) die(`not found: ${p}`);
  const only = (opt("only") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  // register the script itself as evidence
  const evDir = path.join(evidenceDir(target), "schema");
  fs.mkdirSync(evDir, { recursive: true });
  const copy = path.join(evDir, path.basename(p));
  fs.copyFileSync(p, copy);
  const sha = sha256File(copy);
  register(target, { id: `sql:${sha.slice(0, 16)}`, kind: "rea", tool: "reborn-schema", operation: "sql-schema", subject: { label: path.basename(p) }, created_at: new Date().toISOString(), file: path.relative(evidenceDir(target), copy).split(path.sep).join("/"), bytes: fs.statSync(copy).size, sha256: sha, summary: "shipped SQL create script", counts: { tables: (fs.readFileSync(p, "utf8").match(/CREATE\s+(?:CACHED\s+|MEMORY\s+)?TABLE/gi) || []).length } });
  const entities = schemaToEntities(fs.readFileSync(p, "utf8"), { engine: path.basename(p).split("-")[0], sourceRef: `sql:${sha.slice(0, 16)}` });
  const domainDir = path.join(targetDir(target), "02-investigation", "domain");
  fs.mkdirSync(domainDir, { recursive: true });
  let written = 0;
  for (const e of entities) {
    if (only.length && !only.includes(e.name.toUpperCase()) && !only.includes((e.storage.observed_table || "").toUpperCase())) continue;
    const doc = new YAML.Document(e);
    fs.writeFileSync(path.join(domainDir, `${e.name}.yaml`), doc.toString({ lineWidth: 0 }));
    written++;
  }
  console.log(`OK  schema  ${entities.length} tables parsed, ${written} entity card(s) written to domain/  (sql:${sha.slice(0, 16)})`);
  console.log(`  entities: ${entities.map((e) => e.name).join(", ")}`);
}

// Fetch a public page as markdown. Provider is pluggable: Linkup (web agent, preferred) when LINKUP_API_KEY is set
// or WEB_PROVIDER=linkup, otherwise Crawl4AI in Docker. The rest of the pipeline does not care which was used.
function fetchPageMarkdown(url, outFile) {
  const provider = process.env.WEB_PROVIDER || (process.env.LINKUP_API_KEY ? "linkup" : "crawl4ai");
  if (provider === "linkup") {
    const key = process.env.LINKUP_API_KEY || localConfig().linkupApiKey;
    if (!key) die("WEB_PROVIDER=linkup but no LINKUP_API_KEY (env or reborn.local.json.linkupApiKey)");
    const body = JSON.stringify({ q: url, depth: "standard", outputType: "searchResults", includeRawContent: true });
    const r = spawnSync("curl", ["-sS", "--max-time", "120", "-X", "POST", "https://api.linkup.so/v1/fetch", "-H", `Authorization: Bearer ${key}`, "-H", "Content-Type: application/json", "-d", body], { encoding: "utf8", windowsHide: true });
    if (r.status !== 0 || !r.stdout) die(`linkup fetch failed: ${(r.stderr || "").slice(0, 200)}`);
    let md = r.stdout;
    try { const j = JSON.parse(r.stdout); md = j.markdown ?? j.content ?? j.rawContent ?? (j.results?.[0]?.content) ?? r.stdout; } catch { /* keep raw */ }
    fs.writeFileSync(outFile, md);
    return "linkup";
  }
  const dir = path.dirname(outFile);
  const r = spawnSync("docker", ["run", "--rm", "-e", "CRAWL4AI_NO_CLOUD_NOTICE=1", "-v", `${dir}:/out`, "--entrypoint", "crwl", "unclecode/crawl4ai:latest", "crawl", url, "-o", "markdown", "-O", `/out/${path.basename(outFile)}`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(outFile)) die(`crawl4ai failed (exit ${r.status}): is Docker running and unclecode/crawl4ai pulled? (or set WEB_PROVIDER=linkup + LINKUP_API_KEY)`);
  return "crawl4ai";
}

// Public documentation (vendor technical sheet, manual page) -> markdown, registered as evidence.
function doc(target, url) {
  needTarget(target);
  if (!url || !/^https?:\/\//.test(url)) die("usage: doc <target> <https://public-doc-url>");
  const dir = path.join(evidenceDir(target), "docs");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}-${new URL(url).hostname}${new URL(url).pathname.replace(/[^A-Za-z0-9]+/g, "-")}.md`.replace(/-+\.md$/, ".md");
  const out = path.join(dir, name);
  const provider = fetchPageMarkdown(url, out);
  const sha = sha256File(out);
  register(target, { id: `doc:${sha.slice(0, 16)}`, kind: "manual", tool: provider, operation: "public-documentation", subject: { label: url }, created_at: new Date().toISOString(), file: path.relative(evidenceDir(target), out).split(path.sep).join("/"), bytes: fs.statSync(out).size, sha256: sha, summary: `public page captured as markdown via ${provider}: ${url}` });
  console.log(`OK  doc (${provider})  ${(fs.statSync(out).size / 1024).toFixed(0)} KB  doc:${sha.slice(0, 16)}  ${url}`);
}

// Shipped UI definition files (resources, not code) -> screen candidates, registered as evidence.
function ui(target, input) {
  needTarget(target);
  if (!input) die("missing <folder|file> containing .ui / .glade files");
  const p = absolute(input);
  const inv = inventoryUi(p);
  const dir = path.join(evidenceDir(target), "ui");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}-gtkbuilder-inventory.json`);
  fs.writeFileSync(out, JSON.stringify(inv, null, 1));
  const sha = sha256File(out);
  register(target, { id: `ui:${sha.slice(0, 16)}`, kind: "manual", tool: "reborn-ui", operation: "gtkbuilder-inventory", subject: { label: path.basename(p) }, created_at: new Date().toISOString(), file: path.relative(evidenceDir(target), out).split(path.sep).join("/"), bytes: fs.statSync(out).size, sha256: sha, summary: `${inv.files} UI definition files, ${inv.screens.length} top-level windows / panels`, counts: { windows: inv.screens.length, files: inv.files } });
  console.log(`OK  ui inventory  ${inv.files} files, ${inv.screens.length} windows/panels  ui:${sha.slice(0, 16)}`);
  for (const s of inv.screens.filter((s) => s.title).slice(0, 40)) console.log(`  - ${s.title.padEnd(42)} ${s.class.padEnd(14)} inputs ${String(s.inputs.length).padStart(2)} | checks ${String(s.checks.length).padStart(2)} | buttons ${String(s.buttons.length).padStart(2)}  (${s.file})`);
}

function rea(target, args) {
  needTarget(target);
  if (!args.length) die("missing REA command, e.g. inspect-pe-resources <path>");
  const r = runRea(target, args, { label: args[1] ? path.basename(args[1]) : "" });
  if (r.file) console.log(`  evidence file: ${path.relative(ROOT, r.file)}`);
  process.exit(r.ok ? 0 : 1);
}

// Deep mode reads the inside of the original (code, files, page source). Allowed only when the target's access method permits it.
const DEEP_OK = ["open-source", "licence", "provided-by-organizers"];
function deepAllowed(target) {
  const meta = YAML.parse(fs.readFileSync(path.join(targetDir(target), "target.yaml"), "utf8"));
  return { ok: DEEP_OK.includes(meta?.access?.method), method: meta?.access?.method };
}

const CRAFT_INTERACTIVE = new Set(["rebuild", "setup", "mcp", "doctor", "commands", "help"]);

// Runs one Craft Anything command. Analysis commands are captured as evidence; interactive ones stream to the console.
function runCraft(target, args, { label = "", quiet = false } = {}) {
  const exe = craftCommand();
  if (args.includes("--deep")) {
    const d = deepAllowed(target);
    if (!d.ok) die(`--deep reads the inside of the original. targets/${target}/target.yaml access.method is "${d.method}"; Deep mode needs one of: ${DEEP_OK.join(", ")}. Stay in clean room (docs/CLEAN-ROOM.md).`);
  }
  if (CRAFT_INTERACTIVE.has(args[0])) {
    const r = spawnSync(exe, args, { stdio: "inherit" });
    if (r.error) die(`${exe} not runnable (${r.error.code}). Install it: docs/SETUP.md`);
    return { ok: r.status === 0, status: r.status };
  }
  const dir = path.join(evidenceDir(target), "craft");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}-${args[0]}.json`);
  const fd = fs.openSync(out, "w");
  const full = args.includes("--output-format") || args.includes("--format") ? args : [...args, "--output-format", "json"];
  const r = spawnSync(exe, full, { stdio: ["ignore", fd, "pipe"], windowsHide: true });
  fs.closeSync(fd);
  if (r.error) die(`${exe} not runnable (${r.error.code}). Install it: docs/SETUP.md`);
  const bytes = fs.statSync(out).size;
  const head = bytes ? fs.readFileSync(out, "utf8").slice(0, 65536) : "";
  const evId = /"evidence_id"\s*:\s*"(ev_[0-9a-f]{64})"/.exec(head)?.[1] ?? /\b(ev_[0-9a-f]{64})\b/.exec(head)?.[1];
  const ok = r.status === 0 && bytes > 0;
  if (ok) {
    register(target, { id: evId ?? `craft:${path.basename(out, ".json")}`, kind: "craft", tool: "craft-anything", operation: args[0], args: args.slice(1).map((a) => (/^[A-Za-z]:\\|^\//.test(a) ? `<path>/${path.basename(a)}` : a)), ...(label ? { subject: { label } } : {}), created_at: new Date().toISOString(), file: path.relative(evidenceDir(target), out).split(path.sep).join("/"), bytes, sha256: sha256File(out) });
  } else if (!bytes) fs.rmSync(out, { force: true });
  if (!quiet) {
    const err = (r.stderr || Buffer.alloc(0)).toString("utf8").trim().split(/\r?\n/).slice(-2).join(" ");
    console.log(`${ok ? "OK " : "ERR"} craft ${args[0]}  exit=${r.status}  ${bytes ? `${(bytes / 1024).toFixed(0)} KB` : "no output"}${evId ? `  ${evId.slice(0, 19)}...` : ""}${!ok && err ? `\n    ${err}` : ""}`);
  }
  return { ok, file: ok ? out : null, evidenceId: evId };
}

function craft(target, args) {
  needTarget(target);
  if (!args.length) die("missing Craft Anything command (craft-anything-cli commands lists 322)");
  const r = runCraft(target, args, { label: args.find((a) => /[\\/]/.test(a)) ? path.basename(args.find((a) => /[\\/]/.test(a))) : "" });
  if (r.file) console.log(`  evidence file: ${path.relative(ROOT, r.file)}`);
  process.exit(r.ok ? 0 : 1);
}

// Bridge between block 1 and the code: a label seen on screen -> strings -> functions that use them (Craft Anything, Deep mode).
function find(target, file, query) {
  needTarget(target);
  if (!file || !query) die('usage: find <target> <file.exe> "<label seen on screen>"');
  const p = absolute(file);
  const d = deepAllowed(target);
  if (!d.ok) die(`find needs Deep mode (it reads the program's strings and code). access.method "${d.method}" does not allow it: use block 1 observations and REA resources instead.`);
  const r = runCraft(target, ["core-feature-find", p, "--query", query, "--deep"], { label: `${path.basename(p)} :: "${query}"` });
  const j = readJson(r.file);
  const fns = j?.functions ?? j?.result?.functions ?? j?.normalized_result?.functions ?? [];
  if (Array.isArray(fns) && fns.length) {
    console.log(`  ${fns.length} function(s) use matching text:`);
    for (const f of fns.slice(0, 15)) console.log(`  - ${f.address ?? ""} ${f.name ?? ""}  ${(f.why ?? []).join("; ").slice(0, 100)}`);
    console.log("  next: craft-anything-cli native-function-study <file> --address <addr> --deep (via `reborn craft`) to read what a function does, then describe the behaviour (never paste the pseudo-code into the dossier).");
  }
}

// ---------- dispatch ----------

const t = argv.shift();
switch (cmd) {
  case "init": init(t); break;
  case "status": status(t); break;
  case "validate": validate(t); break;
  case "dossier": { needTarget(t); console.log(`written ${path.relative(ROOT, renderDossier(t))}`); break; }
  case "handoff": { needTarget(t); const { out, kit } = buildHandoff(t); console.log(`written ${path.relative(ROOT, out)}`); console.log(`  build order: ${kit.build_order.length} steps | migration rows: ${kit.migration_map.length} | test vectors: ${kit.test_vectors.from_rules.length + kit.test_vectors.from_acceptance.length} | observed values: ${kit.readiness.has_observed_values ? "yes" : "NO (block 1 pending)"}`); break; }
  case "ask": ask(t); break;
  case "coverage": coverage(t); break;
  case "analyze": analyze(t, argv[0]); break;
  case "triage": triage(t, argv[0]); break;
  case "js": js(t, argv[0]); break;
  case "sqlite": sqlite(t, argv[0]); break;
  case "har": har(t, argv[0]); break;
  case "web": await web(t, argv[0]); break;
  case "rea": rea(t, argv); break;
  case "craft": craft(t, argv); break;
  case "find": find(t, argv[0], argv[1]); break;
  case "ui": ui(t, argv[0]); break;
  case "schema": schema(t, argv[0]); break;
  case "doc": doc(t, argv[0]); break;
  case "doctor": {
    const r = reaCommand();
    console.log(`REA via: ${r.via}`);
    if (!r.shell) { const v = nodeVersionOk(r.cmd); console.log(`REA node: ${v.version} ${v.ok ? "OK" : "TOO OLD (needs ^22.23.4, ^24.22.1 or >=26.12.1)"}`); }
    console.log(`Chrome: ${chromePath() ?? "not found"}`);
    const c = spawnSync(craftCommand(), ["--version"], { encoding: "utf8" });
    console.log(`Craft Anything: ${c.error ? "not installed" : (c.stdout || c.stderr).trim()}`);
    console.log(`Evidence store: ${path.join(evidenceDir("<target>"), "..")}`);
    break;
  }
  default: console.log(HELP);
}
