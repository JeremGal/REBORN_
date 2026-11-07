// The kit is all block 3 receives. It must be valid, deterministic, honest about grades and free of the original's identifiers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sandbox, edit, inv, lib } from "./helpers.mjs";

const ghost = "ev_" + "0".repeat(64);
const build = async (t = "gnucash") => (await lib("handoff")).buildHandoff(t).kit;

test("an invalid target does not produce a kit", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), (s) => s.replace(/^contradictions:/m, `  - { ref: ${ghost}, kind: craft }\ncontradictions:`));
    await assert.rejects(build(), /valid|error/i);
  } finally { sb.cleanup(); }
});

test("a card that fails to parse does not vanish silently from the kit", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "features/F-001.yaml"), (s) => `${s}\nbroken: [unclosed`);
    await assert.rejects(build(), /valid|error|parse/i);
  } finally { sb.cleanup(); }
});

test("the kit carries no locator text from the evidence", async () => {
  const sb = sandbox();
  try {
    const kit = await build();
    assert.ok(!JSON.stringify(kit).includes('"locator"'), "a locator reached the kit");
  } finally { sb.cleanup(); }
});

test("the kit is deterministic and states what it was built from", async () => {
  const sb = sandbox();
  try {
    const a = await build();
    const b = await build();
    assert.equal(a.generated_at, undefined);
    assert.match(a.inputs_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(a, b);
  } finally { sb.cleanup(); }
});

test("a change in a card changes the kit digest", async () => {
  const sb = sandbox();
  try {
    const a = await build();
    edit(inv(sb.root, "rules/R-002.yaml"), (s) => s.replace(/^title: .*/m, "title: A different title"));
    const b = await build();
    assert.notEqual(a.inputs_sha256, b.inputs_sha256);
  } finally { sb.cleanup(); }
});

test("a refuted rule is not part of the build order", async () => {
  const sb = sandbox();
  try {
    edit(inv(sb.root, "rules/R-001.yaml"), (s) => s.replace("status: partial", "status: refuted"));
    const kit = await build();
    assert.ok(!kit.build_order.some((x) => x.kind === "rule" && x.id === "R-001"));
  } finally { sb.cleanup(); }
});

test("every item of the build order shows its grade", async () => {
  const sb = sandbox();
  try {
    const kit = await build();
    for (const x of kit.build_order) assert.ok(x.grade, `${x.kind} ${x.id} has no grade`);
  } finally { sb.cleanup(); }
});

test("an acceptance scenario with no observed value is not a test vector", async () => {
  const sb = sandbox();
  try {
    const kit = await build();
    assert.ok(!kit.test_vectors.from_acceptance.some((v) => v.id === "AC-001"));
    assert.ok(kit.test_vectors.unobserved_acceptance.some((v) => v === "AC-001" || v.id === "AC-001"));
  } finally { sb.cleanup(); }
});

test("to_observe includes the missions of unknowns that block a feature", async () => {
  const sb = sandbox();
  try {
    const kit = await build();
    const row = kit.to_observe.find((r) => r.feature === "F-001");
    assert.ok(row.missions.includes("M-005"), `missions: ${row.missions}`);
  } finally { sb.cleanup(); }
});

test("the kit does not carry the product's name or vendor", async () => {
  const sb = sandbox();
  try {
    const kit = await build();
    // the id is the folder name and stays; the title, domain and tech must not carry the name or the vendor
    const { id, ...described } = kit.target;
    assert.ok(!/GnuCash/i.test(JSON.stringify(described)), JSON.stringify(described));
    assert.ok(kit.target.title && kit.target.title !== "GnuCash");
  } finally { sb.cleanup(); }
});

test("an identifier read out of the original blocks the kit", async () => {
  const sb = sandbox();
  try {
    fs.mkdirSync(path.join(sb.evidence, "gnucash", "rea"), { recursive: true });
    fs.writeFileSync(path.join(sb.evidence, "gnucash", "rea", "20260101T000000Z-native-ghidra-mcp-x.dll.json"), JSON.stringify({ procedures: [{ name: "xaccFooBarBaz" }] }));
    edit(inv(sb.root, "rules/R-001.yaml"), (s) => s.replace("Static evidence only:", "Static evidence only (see xaccFooBarBaz):"));
    await assert.rejects(build(), /identifier|original/i);
  } finally { sb.cleanup(); }
});

test("the dossier is written without the original's identifiers, locators or a timestamp", async () => {
  const sb = sandbox();
  try {
    const { renderDossier } = await lib("dossier");
    const out = renderDossier("gnucash");
    const text = fs.readFileSync(out, "utf8");
    assert.ok(!/xaccTrans|get_balance_split/.test(text), "a function name reached the dossier");
    assert.ok(!/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/.test(text), "the dossier carries a timestamp");
    assert.ok(!/GnuCash/i.test(text.split("\n")[0]), "the title carries the product's name");
  } finally { sb.cleanup(); }
});
