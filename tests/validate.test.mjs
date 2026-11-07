// Each test reproduces a way a weak or false card could pass validation. A defect that is not caught fails the test.
import test from "node:test";
import assert from "node:assert/strict";
import { sandbox, edit, inv, lib, errorsOf, ROOT } from "./helpers.mjs";
import fs from "node:fs";
import path from "node:path";

const ghost = "ev_" + "0".repeat(64);
const addEvidence = (line) => (s) => s.replace(/^contradictions:/m, `  - ${line}\ncontradictions:`);

test("every real target validates with no error", async () => {
  delete process.env.REBORN_TARGETS_DIR;
  const { validateTarget } = await lib("validate");
  const { listTargets } = await lib("load");
  for (const t of listTargets()) assert.deepEqual(validateTarget(t).errors, [], t);
});

test("a card citing a craft evidence that does not exist is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), addEvidence(`{ ref: ${ghost}, kind: craft }`));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /does not exist|not in evidence/i);
  } finally { sb.cleanup(); }
});

test("a card citing a manual/doc reference that is not in the index is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), addEvidence(`{ ref: "doc:deadbeefdeadbeef", kind: manual }`));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /does not exist|not in evidence/i);
  } finally { sb.cleanup(); }
});

test("a card citing a run that does not exist is an error, not a warning", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), addEvidence(`{ ref: run-nonexistent, kind: h-run }`));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /run-nonexistent/);
  } finally { sb.cleanup(); }
});

test("a rule graded confirmed on two static readings of one binary is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), (s) => s.replace("status: partial", "status: confirmed"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /R-001.*confirmed|confirmed.*R-001/i);
  } finally { sb.cleanup(); }
});

test("a rule graded confirmed with an observed run passes (positive control)", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), (s) => addEvidence(`{ ref: run-20261107-1600-m001, kind: h-run }`)(s.replace("status: partial", "status: confirmed")));
    const { validateTarget } = await lib("validate");
    assert.deepEqual(validateTarget("gnucash").errors, []);
  } finally { sb.cleanup(); }
});

test("a screen graded confirmed on static code alone is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "domain/Transaction.yaml"), (s) => s.replace("status: partial", "status: confirmed"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /Transaction.*confirmed|confirmed.*Transaction/i);
  } finally { sb.cleanup(); }
});

test("duplicate evidence ids in the index are an error", async () => {
  const sb = sandbox();
  try {
    const f = inv(sb.root, "evidence/index.yaml");
    const text = fs.readFileSync(f, "utf8");
    const first = /^  - id: (\S+)\r?\n/m.exec(text)[1];
    // make the second entry reuse the first id
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    const idxs = lines.map((l, i) => (/^  - id: /.test(l) ? i : -1)).filter((i) => i >= 0);
    lines[idxs[1]] = `  - id: ${first}`;
    fs.writeFileSync(f, lines.join("\n"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /duplicate.*evidence|evidence.*duplicate/i);
  } finally { sb.cleanup(); }
});

test("a failed run registered as evidence is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "evidence/index.yaml"), (s) => s.replace(/^(    sha256: [a-f0-9]{64})\r?\n/m, `$1\n    summary: "FAILED: fetch failed"\n`));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /FAILED|failed/);
  } finally { sb.cleanup(); }
});

test("an evidence entry without a hash is an error", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "evidence/index.yaml"), (s) => s.replace(/^    sha256: [a-f0-9]{64}\r?\n/m, ""));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /sha256/);
  } finally { sb.cleanup(); }
});

test("an acceptance scenario sourced from a replay of the rebuild is an error", async () => {
  const sb = sandbox();
  try {
    edit(path.join(sb.root, "01-exploration/runs/run-20261107-1600-m001/run.yaml"), (s) => s.replace("subject: original", "subject: rebuild"));
    edit(inv(sb.root, "features/F-001.yaml"), (s) => s.replace("    # source_run: (none yet)", "    source_run: run-20261107-1600-m001"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /source_run|rebuild|original/i);
  } finally { sb.cleanup(); }
});

test("an acceptance scenario sourced from a failed run is an error", async () => {
  const sb = sandbox();
  try {
    edit(path.join(sb.root, "01-exploration/runs/run-20261107-1600-m001/run.yaml"), (s) => s.replace("outcome: partial", "outcome: failed"));
    edit(inv(sb.root, "features/F-001.yaml"), (s) => s.replace("    # source_run: (none yet)", "    source_run: run-20261107-1600-m001"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /source_run|failed/i);
  } finally { sb.cleanup(); }
});

test("an entity built from a shipped SQL script may be confirmed (positive control)", async () => {
  delete process.env.REBORN_TARGETS_DIR;
  const { validateTarget } = await lib("validate");
  const r = validateTarget("unicenta");
  assert.deepEqual(r.errors, []);
  assert.ok(r.counts.entities >= 40);
});
