// Frappe connector: definitions -> cards, behaviour probe safety, labels observed on screen vs declared.
import test from "node:test";
import assert from "node:assert/strict";
import { lib } from "./helpers.mjs";

const META = {
  name: "Sales Thing", module: "Selling", istable: 0, issingle: 0, is_submittable: 1,
  fields: [
    { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", reqd: 1 },
    { fieldname: "details", label: "Details", fieldtype: "Section Break" },
    { fieldname: "posting_date", label: "Date", fieldtype: "Date", reqd: 1 },
    { fieldname: "status", label: "Status", fieldtype: "Select", options: "\nDraft\nPaid", reqd: 1 },
    { fieldname: "total", label: "Total", fieldtype: "Currency", read_only: 1, precision: "2" },
    { fieldname: "items", label: "Items", fieldtype: "Table", options: "Sales Thing Item", reqd: 1 },
  ],
};
const CHILD = { name: "Sales Thing Item", module: "Selling", istable: 1, fields: [{ fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: 1 }, { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: 1, in_list_view: 1 }] };

test("a definition becomes an entity with its links, lines, types and life cycle", async () => {
  const { metaToEntity } = await lib("frappe-model");
  const e = metaToEntity(META, { sourceRef: "rb_x" });
  assert.equal(e.name, "SalesThing");
  assert.equal(e.fields.find((f) => f.name === "customer").ref, "Customer");
  assert.deepEqual(e.fields.find((f) => f.name === "status").enum_values, ["Draft", "Paid"]);
  assert.equal(e.fields.find((f) => f.name === "total").type, "money");
  assert.ok(e.relations.some((r) => r.to === "SalesThingItem" && r.kind === "one-to-many"));
  assert.deepEqual(e.lifecycle, ["draft", "submitted", "cancelled"]);
});

test("a minimal draft fills only the mandatory fields, including one mandatory line", async () => {
  const { minimalDoc } = await lib("frappe-probe");
  const byName = new Map([[META.name, META], [CHILD.name, CHILD]]);
  const links = { Customer: "TEST-Client Alpha", Item: "TEST-ART-001" };
  const { doc, skip } = minimalDoc(META, byName, { today: "2026-11-07", linkValue: (dt) => links[dt] });
  assert.equal(skip, undefined);
  assert.equal(doc.customer, "TEST-Client Alpha");
  assert.equal(doc.status, "Draft");
  assert.equal(doc.total, undefined);
  assert.deepEqual(doc.items, [{ item_code: "TEST-ART-001", qty: 1 }]);
});

test("a draft is not attempted when a mandatory link has nothing to point to", async () => {
  const { minimalDoc } = await lib("frappe-probe");
  const byName = new Map([[META.name, META], [CHILD.name, CHILD]]);
  const r = minimalDoc(META, byName, { today: "2026-11-07", linkValue: () => undefined });
  assert.match(r.skip, /no Customer record/);
});

test("the probe never touches documents that change the configuration", async () => {
  const { probeable } = await lib("frappe-probe");
  for (const name of ["Company", "Fiscal Year", "Account", "Transaction Deletion Record", "Repost Item Valuation", "Authorization Rule", "Period Closing Voucher"]) {
    assert.equal(probeable({ name, module: "Accounts", istable: 0, issingle: 0 }), false, name);
  }
  assert.equal(probeable({ name: "Quotation", module: "Selling", istable: 0, issingle: 0 }), true);
  assert.equal(probeable({ name: "Web Page", module: "Website", istable: 0, issingle: 0 }), false);
  assert.equal(probeable({ name: "Selling Settings", module: "Selling", istable: 0, issingle: 1 }), false);
});

test("labels read on screen are compared with the declared form", async () => {
  const { compareLabels } = await lib("frappe-features");
  const r = compareLabels(["Customer", "Date", "Status", "Items"], ["Customer *", "Date", "Status:", "Something else"]);
  assert.equal(r.observed, 4);
  assert.equal(r.matched, 3);
  assert.deepEqual(r.unmatched, ["something else"]);
});

test("one feature and one screen per form, with observed drafts attached", async () => {
  const { featuresFromMetas } = await lib("frappe-features");
  const apiObservations = new Map([["Sales Thing", { run: "run-x", step: 3, result: "refused", message: "Customer is disabled" }]]);
  const { features, screens } = featuresFromMetas([META, CHILD], { sourceRef: "rb_x", firstFeature: 2, firstScreen: 1, firstAcceptance: 3, apiObservations });
  assert.equal(features.length, 1);
  assert.equal(screens.length, 1);
  assert.equal(features[0].id, "F-002");
  assert.equal(features[0].priority, "must");
  assert.deepEqual(features[0].inputs.map((i) => i.field), ["SalesThing.customer", "SalesThing.posting_date", "SalesThing.status"]);
  assert.equal(features[0].errors[0].message, "Customer is disabled");
  assert.ok(features[0].evidence.some((e) => e.kind === "h-run"));
  assert.ok(screens[0].fields.find((f) => f.label === "Items").columns.includes("Qty"));
});
