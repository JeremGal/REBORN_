// Manual inventory, implicit relations, kit expectations and parity score, closing conditions of open questions.
import test from "node:test";
import assert from "node:assert/strict";
import { sandbox, edit, inv, lib, errorsOf } from "./helpers.mjs";

test("a CHM table of contents becomes a topic inventory without front and back matter", async () => {
  const { parseHhc, inventory } = await lib("manual");
  const hhc = `<UL>
  <LI><OBJECT><param name="Name" value="Product Manual"></OBJECT>
  <UL>
    <LI><OBJECT><param name="Name" value="About the Authors"></OBJECT>
    <LI><OBJECT><param name="Name" value="Invoices"></OBJECT>
    <UL><LI><OBJECT><param name="Name" value="Create an invoice"></OBJECT><LI><OBJECT><param name="Name" value="Post an invoice &amp; print it"></OBJECT></UL>
    <LI><OBJECT><param name="Name" value="Reports"></OBJECT>
    <UL><LI><OBJECT><param name="Name" value="Balance sheet"></OBJECT></UL>
    <LI><OBJECT><param name="Name" value="GNU Free Documentation License"></OBJECT>
    <UL><LI><OBJECT><param name="Name" value="Preamble"></OBJECT></UL>
  </UL>
</UL>`;
  const r = inventory(parseHhc(hhc));
  assert.deepEqual(r.chapters.map((c) => c.title), ["Invoices", "Reports"]);
  assert.equal(r.topics, 3);
  assert.ok(r.titles.includes("Post an invoice & print it"));
});

test("markdown headings (a converted PDF manual) give the same inventory", async () => {
  const { parseHeadings, inventory } = await lib("manual");
  const r = inventory(parseHeadings("# Introduction\n## Welcome\n# Sales\n## New ticket\n## Refund\n# Stock\n## Count"));
  assert.equal(r.topics, 3);
});

test("a column named after another table without a foreign key is an implicit relation", async () => {
  const { implicitRelations } = await lib("relations");
  const found = implicitRelations([
    { name: "Customer", fields: [{ name: "id", type: "integer", unique: true }] },
    { name: "Invoice", fields: [{ name: "id", type: "integer" }, { name: "customer_id", type: "integer" }, { name: "taxcode", type: "string" }] },
  ]);
  assert.deepEqual(found.map((r) => `${r.from}.${r.field}->${r.to}`), ["Invoice.customer_id->Customer"]);
});

test("a declared foreign key is not reported again", async () => {
  const { implicitRelations } = await lib("relations");
  const found = implicitRelations([
    { name: "Customer", fields: [{ name: "id", type: "integer" }] },
    { name: "Invoice", fields: [{ name: "customer_id", type: "ref", ref: "Customer" }] },
  ]);
  assert.equal(found.length, 0);
});

test("the kit lists checkable expectations with the proof each one needs", async () => {
  const sb = sandbox("unicenta");
  try {
    const { kit } = (await lib("handoff")).buildHandoff("unicenta");
    const rule = kit.expectations.find((x) => x.id === "X-R-003");
    assert.equal(rule.proof_needed, "unit-test");
    assert.ok(rule.cases.includes("halfway value"));
    const acc = kit.expectations.find((x) => x.id === "X-AC-001");
    assert.equal(acc.proof_needed, "live-run");
    assert.ok(kit.expectations.some((x) => x.kind === "screen" && x.proof_needed === "built-app"));
  } finally { sb.cleanup(); }
});

test("a unit test does not prove what only a live replay can show", async () => {
  const { parityScore } = await lib("handoff");
  const kit = { inputs_sha256: "a".repeat(64), expectations: [
    { id: "X-R-001", kind: "rule", proof_needed: "unit-test" },
    { id: "X-AC-001", kind: "acceptance", proof_needed: "live-run" },
    { id: "X-S-001", kind: "screen", proof_needed: "built-app" },
  ] };
  const s = parityScore(kit, { kit_inputs_sha256: "a".repeat(64), expectations: [
    { id: "X-R-001", verified_by: "unit-test", result: "pass" },
    { id: "X-AC-001", verified_by: "unit-test", result: "pass" },
  ] });
  assert.equal(s.proven, 1);
  assert.equal(s.weaker, 1);
  assert.equal(s.unknown, 1);
  assert.equal(s.ratio, 33);
  assert.equal(s.stale, false);
});

test("a parity report made from another kit is flagged as stale", async () => {
  const { parityScore } = await lib("handoff");
  const s = parityScore({ inputs_sha256: "a".repeat(64), expectations: [] }, { kit_inputs_sha256: "b".repeat(64), expectations: [] });
  assert.equal(s.stale, true);
});

test("a question answered with the wrong kind of proof is an error", async () => {
  const sb = sandbox();
  try {
    // U-001 needs runtime; answer it with a static code reference
    edit(inv(sb.root, "unknowns.yaml"), (s) => s.replace(/(  - id: U-001[\s\S]*?)status: open/, "$1status: answered\n    answer: guessed from the code"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("gnucash")), /U-001.*needs runtime|needs runtime/);
  } finally { sb.cleanup(); }
});

test("a question on a closed target cannot require reading the code", async () => {
  const sb = sandbox("pc-compta");
  try {
    edit(inv(sb.root, "unknowns.yaml"), (s) => s.replace(/required_basis:\n(\s+)- runtime\n\s+- documentation\n(\s+)prediction: Data/, "required_basis:\n$1- static-code\n$2prediction: Data"));
    const { validateTarget } = await lib("validate");
    assert.match(errorsOf(validateTarget("pc-compta")), /static-code/);
  } finally { sb.cleanup(); }
});
