# Trade: accounting (general / auxiliary / analytical bookkeeping)

> Generic profile. Seeded from two targets: GnuCash (open source, binary studied) and PC Compta (public technical sheet only). No proprietary content.

## Entities to expect
- **Account** — code, label, type (asset/liability/income/expense/equity), parent (accounts form a tree), currency, flags (placeholder/non-postable, hidden, reconcilable). Codes are short alphanumeric (seen: up to 14 characters).
- **Journal / Book** — the set of entries; often one file per company, multiple fiscal years.
- **Transaction** — date, reference/number, description; belongs to a journal whose *nature* (purchases, sales, cash, ...) drives the default debit/credit side.
- **Split / Entry line** — the heart of double entry: each transaction has 2+ lines, each posting an amount to one account; the lines must balance. Carries memo, reconcile state, reconcile date.
- **Auxiliary / third party** — customers, suppliers, employees, grouped under control accounts; an auxiliary code can attach to several accounts, sometimes constrained by a prefix.
- **Analytical dimensions** — extra axes besides the chart (projects, regions, cost centres); a line can carry several.
- **Tax table / VAT rate**, **Invoice / Bill**, **Payment**, **Price/commodity** (multi-currency), **Scheduled/recurring transaction**.

## Rules to look for
- **Balance (double entry)** — sum of debits equals sum of credits per transaction; an unbalanced entry is completed to an imbalance account or refused. Capture one worked example.
- **Amount storage and rounding** — how amounts are stored (seen: integer numerator/denominator fraction, to avoid float drift) and how VAT/totals are rounded (to the cent, half-up?). Capture an example like 3 x 100 -> total and tax.
- **Numbering** — invoice/entry numbers: format, per-year reset, gaps allowed?
- **Posting / validation workflow** — draft -> validated -> (paid); what locks on validation; period close behaviour (a reconcilable account carries forward its unreconciled lines at year open).
- **Lettering / reconciliation** — matching entries that justify a balance.
- **Fiscal period / close** — multi-exercise, closing entries, what becomes read-only.

## Screens that usually exist
- Chart of accounts (tree), account create/edit
- Transaction/journal entry (header + lines grid + running balance)
- Customer/supplier (third party) create/edit and list
- Invoice entry, payment entry
- Reports: balance sheet, income statement, general ledger, trial balance
- Period close, preferences

## First questions
- Where and how is the data stored (a real database created by the app answers types, keys, enums at once)?
- How are amounts stored and rounded?
- What are the account types and the posting/validation states?
- Is numbering reset per fiscal year?

## Technology notes
- Often native desktop (C/C++ with GTK/Qt/wx, Delphi, VB6) or, locally, WinDev. Native code: route by strings + cross-references + shipped UI files; prefer a database created by the app for the data model. Some locale builds are the richest source of the real chart of accounts (shipped account templates per country).

## Migration notes
- The chart of accounts, the journals and the posted lines (with reconcile state and dates) are what a firm cannot lose. Map new fields back to the original tables/columns so the old data can be imported; without that, no accountant switches.

## Targets seen
- GnuCash 5.17 (open source) — confirmed a 23-table relational model (accounts, transactions, splits, invoices, taxtables, ...), amounts stored as num/denom fractions, a balance/imbalance rule in the engine, 111 UI windows in shipped GtkBuilder files.
- PC Compta / DLG (public technical sheet only) — journal *nature* drives debit/credit side; reconcilable accounts carry forward unreconciled lines at period open; auxiliary codes with an optional prefix constraint; three renamable analytical tables; codes up to 14 chars. All to be confirmed by observation.
