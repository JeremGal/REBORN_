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
  const r = compareLabels(["Customer", "Date", "Status", "Items", "Total", "Amount"], ["Customer *", "Date", "Status:", "Something else", "Total (USD)", "Amount (U..."]);
  assert.equal(r.observed, 6);
  assert.equal(r.matched, 5);
  assert.deepEqual(r.unmatched, ["something else"]);
});

test("simple display conditions are evaluated, complex ones are left alone", async () => {
  const { parseCondition, evaluate } = await lib("frappe-logic");
  assert.equal(evaluate(parseCondition("eval:doc.is_return == 1"), { is_return: "0" }), false);
  assert.equal(evaluate(parseCondition("eval:doc.status=='Draft'"), { status: "Draft" }), true);
  assert.equal(evaluate(parseCondition("eval:!doc.disabled"), { disabled: "0" }), true);
  assert.equal(evaluate(parseCondition("eval:!doc.disabled"), {}), null);   // unknown state: no prediction
  assert.equal(evaluate(parseCondition("customer"), { customer: "C" }), true);
  assert.equal(parseCondition("eval:in_list(['A','B'], doc.x) && doc.y"), null);
});

test("only positive observations confirm a declared rule", async () => {
  const { gradeLogic } = await lib("frappe-logic");
  const metas = [{ name: "Thing", module: "Selling", fields: [
    { fieldname: "status", label: "Status", fieldtype: "Select", options: "Draft\nOpen", default: "Draft" },
    { fieldname: "is_ok", label: "Is OK", fieldtype: "Check", default: "1" },
    { fieldname: "notes", label: "Notes", fieldtype: "Data", depends_on: "eval:doc.status=='Draft'" },
    { fieldname: "extra", label: "Extra", fieldtype: "Data", depends_on: "eval:doc.status=='Open'" },
    { fieldname: "total", label: "Total", fieldtype: "Currency", read_only: 1 },
  ] }];
  const readings = new Map([["Thing", { labels: ["Statut", "Is OK", "Notes", "Total"], prefilled: ["Statut: Brouillon", "Is OK: checked"] }]]);
  const g = gradeLogic(metas, { readings, translations: { Status: "Statut", Draft: "Brouillon" }, computedSeen: new Set(["Thing.total"]) });
  assert.equal(g.tally.default.confirmed, 2);
  assert.equal(g.tally.visibility.confirmed, 1);
  assert.equal(g.tally.visibility.consistent, 1);
  assert.equal(g.tally.computed.confirmed, 1);
  assert.equal(g.total.contradicted, 0);
});

test("the grader never invents a contradiction: unknown state, settings pages, separators and unticked boxes", async () => {
  const { gradeLogic } = await lib("frappe-logic");
  const metas = [
    { name: "Doc", module: "Selling", fields: [
      { fieldname: "naming_series", label: "Series", fieldtype: "Select", default: "DOC-.####" },
      { fieldname: "flag", label: "Flag", fieldtype: "Check", default: "0" },
      { fieldname: "party_type", label: "Party Type", fieldtype: "Link", options: "Party Type" },
      { fieldname: "party_extra", label: "Party Extra", fieldtype: "Data", depends_on: "eval:doc.party_type == 'Customer'" },
      { fieldname: "posting", label: "Posting", fieldtype: "Check", depends_on: "eval:doc.docstatus==0" },
      { fieldname: "local", label: "Local", fieldtype: "Data", depends_on: "eval:doc.__islocal" },
    ] },
    { name: "Some Settings", module: "Selling", issingle: 1, fields: [{ fieldname: "same_rate", label: "Same Rate", fieldtype: "Check", default: "0" }] },
  ];
  const readings = new Map([
    ["Doc", { labels: ["Series", "Flag", "Party Type", "Party Extra", "Posting", "Local"], prefilled: ["Series: DOC-####", "Flag: unchecked"] }],
    ["Some Settings", { labels: ["Same Rate"], prefilled: ["Same Rate: checked"] }],
  ]);
  const g = gradeLogic(metas, { readings });
  assert.equal(g.total.contradicted, 0, JSON.stringify(g.contradictions));
  assert.equal(g.tally.default.confirmed, 2);       // series without its dots, and the unticked box
  assert.equal(g.tally.visibility.confirmed, 2);    // docstatus 0 and a new document are known states
  assert.equal(g.tally.visibility.consistent, 1);   // control field with no declared default: unknown, no verdict
});

test("an action on an unsaved form confirms the display rule it controls and the amounts it recomputes", async () => {
  const { gradeLogic } = await lib("frappe-logic");
  const metas = [
    { name: "Order", module: "Selling", fields: [
      { fieldname: "is_return", label: "Is Return", fieldtype: "Check", default: "0" },
      { fieldname: "return_against", label: "Return Against", fieldtype: "Link", options: "Order", depends_on: "eval:doc.is_return" },
      { fieldname: "total", label: "Total", fieldtype: "Currency", read_only: 1 },
      { fieldname: "items", label: "Items", fieldtype: "Table", options: "Order Item" },
    ] },
    { name: "Order Item", module: "Selling", istable: 1, fields: [{ fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: 1 }] },
  ];
  const interactions = [
    { doctype: "Order", action: { field: "is_return", value: "1" }, labels: ["Retour contre"], prefilled: [] },
    { doctype: "Order", action: { line: { item_code: "X", qty: 3, rate: 10 } }, labels: ["Total"], prefilled: ["Total: $ 30,00", "Montant: 30"] },
  ];
  const g = gradeLogic(metas, { readings: new Map(), translations: { "Return Against": "Retour contre", Amount: "Montant" }, interactions });
  assert.equal(g.tally.visibility.confirmed, 1);
  assert.equal(g.tally.computed.confirmed, 2);
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
