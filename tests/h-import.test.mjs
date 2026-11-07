// Block 1 -> block 2: an experiment of the H Company explorer (format of h-explorer/HANDOFF.md §2) becomes a valid run.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sandbox, ROOT, lib } from "./helpers.mjs";

const EXP = {
  experiment_id: "EXP_001", application: "Legacy ERP", module: "Devis",
  inputs: { product: "A", quantity: 10, customer_type: "premium" },
  observed_output: { total_price: 810.0, displayed_total_text: "810,00", status_message: "Devis calcule." },
  status: "success", error: null, duration_s: 22.1, attempts: 1, session_id: "s-1",
  agent_view_url: "https://platform.hcompany.ai/agents/sessions/s-1",
  evidence: { trace_path: "artifacts/EXP_001/trace.json", screenshots: ["artifacts/EXP_001/step_01.png"], final_screenshot: "artifacts/EXP_001/final.png", actions: ["select_option(product, A)", "type(quantity, 10)", "click(Calculer)"] },
  agent_config: { browser: "cloud", model: "holo4-35b-a3b" },
  timestamp: "2026-11-07T15:39:53+00:00",
};

test("an explorer experiment becomes a run with the values the agent read", async () => {
  const { experimentToRun } = await lib("h-import");
  const run = experimentToRun(EXP, { target: "gnucash", mission: "M-001", rawName: "EXP_001.json" });
  assert.equal(run.subject, "original");
  assert.equal(run.outcome, "success");
  assert.equal(run.agent.provider, "h-company");
  assert.equal(run.steps.length, 4);
  assert.equal(run.steps[2].action.type, "click");
  assert.equal(run.steps.at(-1).extracted.total_price, 810);
  assert.deepEqual(run.steps.at(-1).extracted.inputs, EXP.inputs);
});

test("a failed experiment becomes a failed run with no extracted values", async () => {
  const { experimentToRun } = await lib("h-import");
  const run = experimentToRun({ ...EXP, status: "failed", error: "timeout", observed_output: null }, { target: "gnucash", mission: "M-001" });
  assert.equal(run.outcome, "failed");
  assert.equal(run.steps.at(-1).extracted, undefined);
});

test("import-run writes a run that validates, copying the screenshots it finds", () => {
  const sb = sandbox("gnucash");
  try {
    const hdir = path.join(sb.dir, "h-explorer");
    fs.mkdirSync(path.join(hdir, "experiments"), { recursive: true });
    fs.mkdirSync(path.join(hdir, "artifacts", "EXP_001"), { recursive: true });
    fs.writeFileSync(path.join(hdir, "artifacts", "EXP_001", "final.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(hdir, "experiments", "EXP_001.json"), JSON.stringify(EXP));
    const r = spawnSync(process.execPath, [path.join(ROOT, "tools", "reborn.mjs"), "import-run", "gnucash", path.join(hdir, "experiments"), "--mission", "M-001", "--root", hdir], { encoding: "utf8", env: { ...process.env } });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /1\/2 screenshot\(s\) copied/);
    const v = spawnSync(process.execPath, [path.join(ROOT, "tools", "reborn.mjs"), "validate", "gnucash"], { encoding: "utf8", env: { ...process.env } });
    assert.equal(v.status, 0, v.stdout);
  } finally { sb.cleanup(); }
});
