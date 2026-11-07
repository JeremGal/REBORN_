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
