# The rebuild dossier

What block 2 hands to block 3: enough detail to rebuild every detected feature **without ever seeing the original code**. One YAML file per item so several people (and agents) can write in parallel, plus a generated `dossier.md` to read top to bottom.

## Principles

- **Behaviour, not code.** Describe what the user does, what the system answers, the rules and the data. `rebuild_notes` may suggest an approach; they never contain decompiled or original code.
- **Every claim has evidence.** REA evidence ids (`ev_...`), run ids, observation ids, screenshots.
- **Honest status.** `confirmed` (exact observation or two independent kinds of evidence), `partial`, `hypothesis`, `refuted`. Gaps go to `unknowns.yaml`.
- **Testable.** Each feature has acceptance scenarios; each rule has worked examples. They become block 3's tests and block 1's parity replays.

## Example cards (an invoicing feature)

`features/F-001.yaml`

```yaml
id: F-001
title: Create and validate a sales invoice
module: Sales
priority: must
status: partial
confidence: medium
user_goal: As an accountant, I create an invoice for a customer so that the sale is recorded and numbered.
actors: [accountant]
entry_points: [{ screen: S-003, action: "Menu Sales > New invoice (F2)" }]
preconditions: [at least one customer exists, the accounting period is open]
inputs:
  - { label: Client, field: Invoice.customer_id, type: ref, required: true, validation: "Message 'Client obligatoire' if empty" }
  - { label: Date, field: Invoice.issue_date, type: date, required: true, default: today }
steps:
  - { n: 1, actor: user, does: picks a customer, screen: S-003 }
  - { n: 2, actor: user, does: adds lines (product, quantity, unit price) }
  - { n: 3, actor: system, does: recomputes line totals and invoice totals after each change, rules: [R-001] }
  - { n: 4, actor: user, does: clicks Validate }
  - { n: 5, actor: system, does: assigns the next invoice number and locks the invoice, rules: [R-002] }
rules: [R-001, R-002]
outputs:
  - { kind: data-change, description: invoice stored as validated, entities: [Invoice, InvoiceLine] }
  - { kind: print, description: A4 invoice, format: "header with company, customer block, lines table, VAT summary" }
errors:
  - { when: no line, behaviour: Validate is refused, message: "La facture ne contient aucune ligne" }
screens: [S-003]
entities: [Invoice, InvoiceLine, Customer]
acceptance:
  - id: AC-001
    given: customer "Durand SARL", product "Conseil" at 100.00 HT, VAT 20 %
    when: the user adds 3 units and validates
    then: total HT 300.00, VAT 60.00, total TTC 360.00, invoice numbered FA-2026-0001
    expected_values: { total_ht: 300.00, vat: 60.00, total_ttc: 360.00, number: FA-2026-0001 }
    source_run: run-20261107-1030-m002
evidence:
  - { ref: run-20261107-1030-m002, kind: h-run, locator: steps 4-12 }
  - { ref: O-003, kind: observation }
unknowns: [U-004]
rebuild_notes: Recompute totals on every line change; store amounts as integer cents to avoid rounding drift.
```

`rules/R-001.yaml`

```yaml
id: R-001
title: Invoice totals
kind: computation
statement: Line total is quantity times unit price; VAT is computed on the sum of lines and rounded to the cent.
formula: |
  line.total_ht = qty * unit_price_ht
  total_ht = sum(line.total_ht)
  vat = round_half_up(total_ht * vat_rate, 2)
  total_ttc = total_ht + vat
applies_to: [Invoice.total_ht, Invoice.vat_amount, Invoice.total_ttc]
features: [F-001]
examples:
  - { given: { lines: [{ qty: 3, unit_price_ht: 100.00 }], vat_rate: 0.20 }, expect: { total_ht: 300.00, vat: 60.00, total_ttc: 360.00 }, source: { ref: run-20261107-1030-m002, kind: h-run, locator: step 11 } }
status: partial
confidence: medium
evidence:
  - { ref: O-003, kind: observation }
contradictions: []
```

`screens/S-003.yaml`

```yaml
id: S-003
title: Invoice entry
purpose: Create or edit a sales invoice
kind: master-detail
screenshots: [01-exploration/runs/run-20261107-1030-m002/s04.png]
layout: header (customer, date, number) on top, lines grid in the middle, totals bottom right, buttons bottom bar
fields:
  - { label: Client, control: lookup, binds: Invoice.customer_id, required: true }
  - { label: Lignes, control: grid, columns: [Article, Désignation, Qté, PU HT, Total HT] }
  - { label: Total TTC, control: display, binds: Invoice.total_ttc }
actions:
  - { label: Valider, shortcut: F10, triggers: F-001 }
  - { label: Imprimer, shortcut: Ctrl+P }
states: [draft (editable), validated (read-only)]
status: confirmed
evidence:
  - { ref: run-20261107-1030-m002, kind: h-run, locator: step 4 }
```

`domain/Invoice.yaml`

```yaml
name: Invoice
description: A sales invoice issued to a customer
fields:
  - { name: number, label: N°, type: string, unique: true, computed_by: R-002 }
  - { name: customer_id, label: Client, type: ref, ref: Customer, required: true }
  - { name: issue_date, label: Date, type: date, required: true }
  - { name: total_ht, label: Total HT, type: money, precision: 2, computed_by: R-001 }
  - { name: vat_amount, label: TVA, type: money, precision: 2, computed_by: R-001 }
  - { name: total_ttc, label: Total TTC, type: money, precision: 2, computed_by: R-001 }
  - { name: status, type: enum, enum_values: [draft, validated, paid, cancelled] }
relations:
  - { to: InvoiceLine, kind: one-to-many, via: invoice_id }
  - { to: Customer, kind: many-to-one, via: customer_id }
lifecycle: [draft, validated, paid]
storage: { engine: SQLite, observed_table: FACTURE }
status: partial
evidence:
  - { ref: ev_<64 hex from reborn sqlite>, kind: rea, locator: table FACTURE }
```

These examples are illustrative: real cards only contain what the evidence shows.

## Generated dossier

`node tools/reborn.mjs dossier <target>` writes `02-investigation/dossier.md`: overview, feature table, one section per feature (inputs, steps, rules, outputs, errors, acceptance, notes), rules with formulas and examples, data model with a Mermaid ER diagram, screens with a navigation graph and screenshots, open questions, a traceability matrix and an evidence summary.
