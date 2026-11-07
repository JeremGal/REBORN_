# Pipeline

Three blocks, one target folder, fixed hand-off formats. Each block can start immediately: block 2 investigates the binary while block 1 explores, block 3 scaffolds the app from the first feature cards.

## 1. Explore (computer-use agent, H Company)

**Goal:** use the legacy software like a real user and record everything visible.

**In:** `targets/<id>/01-exploration/missions/M-xxx.yaml` (written by the team; new ones generated from open questions by `node tools/reborn.mjs ask <id>`).

**Out:**
- `runs/<run-id>/run.yaml` + screenshots: every action, what changed, values read on screen (`contracts/run.schema.json`);
- `observations.yaml`: business behaviour worth confirming (validation, computation, numbering, defaults, errors), each pointing to run steps.

**How:**
1. Start with the kickoff tour (`M-001`): open every menu entry, screenshot each window. It feeds the screen inventory.
2. Then one mission per business process, with fake but realistic data (create a customer, an invoice, a payment, a closing...). Ask the agent to **read back** totals, generated numbers and messages: these values become the expected results of acceptance tests.
3. Convert the agent's raw output into `run.yaml` (keep the raw output next to it). The H Company Agents API returns its own format: write the adapter once, in `tools/` (it is the only block-specific code we do not have yet).
4. SaaS targets: also export a HAR of the session (kept out of git) so block 2 can map the API.

## 2. Investigate (REA + Craft Anything)

**Goal:** turn observations and artifacts into a rebuild dossier where every statement is backed by evidence.

**In:** the runs and observations of block 1, the software itself (install folder, `.exe`, `.asar`, local database, HAR, SaaS URL).

**Out:** `targets/<id>/02-investigation/`: feature cards, rules, screens, entities, unknowns, the evidence index, and the generated `dossier.md`.

**How:**

| Step | Command | What you get |
|---|---|---|
| Triage the install folder | `reborn triage <id> <install-dir>` | app inventory, data files (databases, configs), embedded runtimes |
| Triage the main executable | `reborn triage <id> <app.exe>` | imports (technology), resources (dialogs, menus, strings?), .NET/Go/Rust detection, artifact hash |
| .NET assembly | `reborn rea <id> inspect-managed-members <dll> --type <Full.Name>` | types, methods, string literals, call edges, without executing anything |
| Electron / JavaScript | `reborn js <id> <app.asar or dir>` | modules, IPC channels, endpoints, storage |
| SaaS page | `reborn web <id> <url>` (or `--cdp` on your own logged-in Chrome) | DOM, scripts, network metadata, exported scripts analysed statically |
| Recorded SaaS session | `reborn har <id> <session.har>` | API surface: methods, paths, payload shapes |
| Local database | `reborn sqlite <id> <file>` | schema, then `--table` for sample rows: the most direct view of the data model |
| Anything else | `reborn rea <id> <command> ...` | any of REA's 175 commands, evidence registered |
| Rebuild trial | Craft Anything (`docs/SETUP.md`) | study + rebuild loop with its own evidence (`investigation.cany/`) |

Then write the cards, from the strongest evidence:
1. **Data model** (`domain/`): database schema or API payloads first, labels from screens second.
2. **Screens** (`screens/`): resources (DIALOG, MENU, STRING) when present, otherwise block 1 screenshots.
3. **Rules** (`rules/`): one per computation, validation, numbering, rounding, tax; each with worked examples read in runs.
4. **Features** (`features/`): one card per user goal, tying screens, rules and entities together, with acceptance scenarios built from the runs.
5. **Unknowns**: anything you could not establish, with the probe that would answer it. `reborn ask <id>` sends them back to block 1.

Run `reborn validate <id>` and `reborn dossier <id>` before every hand-off.

## 3. Rebuild (Claude Code)

**Goal:** a modern application that reproduces the business behaviour, built only from the dossier.

**In:** `02-investigation/` (YAML + `dossier.md`) and the screenshots of `01-exploration/`. Nothing else: no raw evidence, no decompiled code, no original assets.

**Out:** `apps/<id>/` with automated tests (one per acceptance scenario, one per rule example), `03-reconstruction/README.md`, then `parity/report.yaml`.

**How:**
1. Data model and rules first (pure functions + unit tests from rule examples), then screens and features in priority order (`must` first).
2. Keep what legacy users rely on: field order, keyboard shortcuts, numbering formats, printed documents. Modernise the look, not the logic.
3. Options: Claude Code directly, or Craft Anything in clean-room mode fed with the dossier (see `docs/SETUP.md`).

## Closing the loop: parity

Block 1 replays the acceptance scenarios on the rebuild with the same agent, `subject: rebuild` in `run.yaml`. Block 3 fills `parity/report.yaml`: match, mismatch (with the difference) or not run. The score (for example 18/20 scenarios match) is the headline of the demo.
