# Reconstruction (block 3): ReBorn Compta

- **Where the rebuild lives:** `apps/gnucash/index.html` (single page, no build step, no server).
- **How to run it:** open `apps/gnucash/index.html` in a browser. Data stays in that browser (local storage); "Nouveau livre" starts a fresh book.
- **Inputs used (clean room):** `02-investigation/` cards and the screenshots of `01-exploration/runs/run-20261107-1600-m001/`. No original code, asset or name reused.
- **What it implements from the kit:**
  - entities Account, Transaction, Split (account tree with parent, code, type, placeholder, hidden);
  - R-001: every transaction balances; an unbalanced entry is completed on a `Déséquilibre-<devise>` account;
  - R-002: amounts parsed and stored as integer cents (never a float);
  - S-001 new account dialog, S-002 register with debit, credit and running balance, S-003 new book setup (3 steps instead of 6);
  - a "Tests du kit" tab replaying AC-001, R-001 and R-002 (4 tests).
- **Design choices (not from the original):** the list of account types and the French starter chart; the original values are still open question U-002.
- **Scenarios to replay for parity (block 1):** AC-001 (Bank to Groceries 25.00, read both balances) on the original and on this rebuild.
- **Parity report:** `parity/report.yaml`, once block 1 has replayed AC-001 on both.
- **Before / after:** `apps/gnucash/before/` (real captures of the original at first launch) and `apps/gnucash/after.png`.

## Faithfulness: what is known, what is assumed, what diverges

This rebuild is **not yet proven faithful**: nothing in it has been compared with the original running.

| Part of the rebuild | Basis |
|---|---|
| New Account dialog fields (S-001) | read from the original's shipped UI file (strong) |
| First-run assistant (S-003) | observed on the original (strong); shortened from 6 steps to 3 on purpose |
| Table and column names, fraction amounts (R-002) | present in the original binary (names only; types and keys not observed) |
| Balance rule (R-001) | inferred from engine function names; likely incomplete, see divergence below |
| Register columns, debit/credit sign convention, account types, starter chart | design choices (hypothesis), not observed |
| "Tests des règles du kit" tab (4 tests, all passing) | expected values written from the rules, not measured on the original |

**Known divergence.** Public sources describe a "Rebalance Transaction" dialog when an unbalanced entry is saved in the original. The rebuild silently adds the balancing split. Open question U-004, mission M-005.

**Coverage** (`node tools/reborn.mjs coverage gnucash`): 3 screens carded of 111 windows found, 4 entities of at least 23 tables found, 1 feature carded and feature coverage unknown (no independent feature list yet).

**To prove fidelity:** (1) block 1 runs the missions and fills the expected values; (2) the same scenarios (AC-001, then the U-004 one) are replayed on the original and on the rebuild; (3) the results go in `parity/report.yaml`; (4) the cards are extended until `coverage` shows the screens and features that matter.
