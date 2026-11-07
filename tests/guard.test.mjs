// Guards, evidence store and CLI behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { sandbox, lib, ROOT } from "./helpers.mjs";

test("target ids and operation names are plain slugs", async () => {
  const { isTargetId, isOpName } = await lib("config");
  assert.equal(isTargetId("pc-compta"), true);
  for (const bad of ["..", "../x", "a/b", "A", "", "-x", "a b"]) assert.equal(isTargetId(bad), false, bad);
  assert.equal(isOpName("inspect-pe-resources"), true);
  for (const bad of ["../../x", "x/y", "x.y", "", "X"]) assert.equal(isOpName(bad), false, bad);
});

test("a REA command not known to be harmless needs a legal basis for deep analysis", async () => {
  const { reaNeedsDeep } = await lib("guard");
  for (const open of ["inspect-pe-resources", "inspect-pe-imports", "inspect-native-exports", "inspect-sqlite-database", "inspect-web-page", "list-browser-targets", "doctor"]) assert.equal(reaNeedsDeep(open), false, open);
  for (const deep of ["decompile", "decompile-all", "read-bytes", "search-bytes", "trace-native-values", "inspect-native-api", "match-native-functions", "instrument-with-frida", "inspect-with-objdump", "some-future-command"]) assert.equal(reaNeedsDeep(deep), true, deep);
});

test("Craft runs in clean room unless Deep mode was explicitly requested", async () => {
  const { craftModeArgs } = await lib("guard");
  assert.ok(craftModeArgs(["core-overview-show", "x.exe"]).includes("--clean-room"));
  assert.ok(!craftModeArgs(["core-feature-find", "x.exe", "--deep"]).includes("--clean-room"));
  assert.equal(craftModeArgs(["a", "--clean-room"]).filter((a) => a === "--clean-room").length, 1);
});

test("running REA with a path-like operation name is refused", async () => {
  const sb = sandbox();
  try {
    const { runRea } = await lib("evidence");
    assert.throws(() => runRea("gnucash", ["../../x", "y"], { quiet: true }), /operation/i);
  } finally { sb.cleanup(); }
});

test("every option the CLI reads with opt() is declared as taking a value", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools", "reborn.mjs"), "utf8");
  const declared = new Set(JSON.parse(/const VALUE_OPTS = new Set\((\[[^\]]*\])\)/.exec(src)[1].replace(/'/g, '"')));
  const used = [...new Set([...src.matchAll(/\bopt\("([a-z-]+)"/g)].map((m) => m[1]))];
  const missing = used.filter((o) => !declared.has(o));
  assert.deepEqual(missing, [], `options read with opt() but missing from VALUE_OPTS: ${missing.join(", ")}`);
});

test("an unknown command exits with status 2", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "reborn.mjs"), "no-such-command"], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("evidence files are re-hashed against the index", async () => {
  const sb = sandbox();
  try {
    const { register, verifyEvidence, sha256File } = await lib("evidence");
    fs.mkdirSync(path.join(sb.evidence, "gnucash", "rea"), { recursive: true });
    const f = path.join(sb.evidence, "gnucash", "rea", "t.json");
    fs.writeFileSync(f, "{}");
    register("gnucash", { id: "rb_test", kind: "rea", tool: "rea-agents", operation: "inspect-pe-resources", created_at: new Date().toISOString(), file: "rea/t.json", bytes: 2, sha256: sha256File(f) });
    assert.ok(!verifyEvidence("gnucash").mismatched.includes("rb_test"));
    fs.writeFileSync(f, "{ }");
    assert.ok(verifyEvidence("gnucash").mismatched.includes("rb_test"));
  } finally { sb.cleanup(); }
});

test("parallel runs do not lose index entries", async () => {
  const sb = sandbox();
  try {
    const script = path.join(ROOT, "tests", "fixtures", "register-one.mjs");
    const N = 8;
    await Promise.all(Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
      const c = spawn(process.execPath, [script, String(i)], { env: { ...process.env }, stdio: "ignore" });
      c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`child ${i} exited ${code}`))));
    })));
    const { loadTarget } = await lib("load");
    const ids = new Set(loadTarget("gnucash").evidence.map((e) => e.id));
    for (let i = 0; i < N; i++) assert.ok(ids.has(`rb_parallel_${i}`), `entry ${i} was lost`);
  } finally { sb.cleanup(); }
});

test("a failed REA output never enters the index", async () => {
  const sb = sandbox();
  try {
    const { register } = await lib("evidence");
    const { validateTarget } = await lib("validate");
    register("gnucash", { id: "rb_failed", kind: "rea", tool: "ghidra-mcp", operation: "native-session", created_at: new Date().toISOString(), file: "rea/x.json", bytes: 1, sha256: "a".repeat(64), summary: "FAILED: fetch failed" });
    assert.match(validateTarget("gnucash").errors.join("\n"), /FAILED|failed/);
  } finally { sb.cleanup(); }
});
