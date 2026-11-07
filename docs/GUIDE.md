# ReBorn operating guide

How each block works, what it hands to the next one, and what block 2 needs before it can run.

## 0. Setup (once)

```bash
npm install
node tools/reborn.mjs doctor
```

Details: `docs/SETUP.md`. Machine-specific paths go in `reborn.local.json` (not committed). Keys go in environment variables (see `.env.example`), never in files.

## 1. Block 1: explore

**Worklist.** `node tools/reborn.mjs ask <target>` turns open questions into missions in `targets/<target>/01-exploration/missions/`. Each mission has:
- `ui_steps`: what to open, click, type, read and screenshot, in order;
- `capture.read_values`: the exact values to read on screen;
- `fills`: the acceptance scenario the run completes.

Start with the missions listed in `to_observe` of `02-investigation/handoff.json`: they are the ones that move features to `confirmed`.

**Deliver, per run,** a folder `01-exploration/runs/run-<date>-<time>-<mission>/` with:
- `run.yaml` (format: `contracts/run.schema.json`): one entry per step with the action, the screenshot file, what changed, and the values read in `extracted`;
- screenshots `s01.png`, `s02.png`... matching step numbers;
- the agent's raw output in `raw/`.

Also update `observations.yaml` with behaviours worth checking (a total, a message, a default value), each pointing to `{run, step}`. Use fake data only.

## 2. Block 2: investigate

### What block 2 needs to run

| Need | Why | Where to put it |
|---|---|---|
| Target name, version, and why we may study it | legal basis decides which analyses are allowed | `targets/<id>/target.yaml` (`access.method`, `legal.basis`) |
| The software: installer, executable, `.jar`, install folder, or the web app URL | static analysis and data model | local path outside git (never commit binaries) |
| A database file saved by the app after a run (when the app stores data locally) | real types, keys and values | local path, then `reborn sqlite` |
| Block 1 runs with values read on screen | turns hypotheses into confirmed rules | `01-exploration/runs/` |
| For web apps: a recorded session (HAR) | API surface | local path outside git, then `reborn har` |
| Vendor public documentation URL (when the code cannot be studied) | documented behaviour, graded `hypothesis` | `reborn doc <url>` |
| Test account for web apps | to explore without real data | environment variable name in the mission, never the value |

Tools on the investigator's machine: Node (REA needs ^22.23.4 or ^24.22.1), Chrome, Docker (for Crawl4AI) or a `LINKUP_API_KEY` (set `WEB_PROVIDER=linkup`), optionally Craft Anything.

### Order of work

1. `reborn identify <id> <main-executable>` (what it is built with, and a stop if it is protected), then `reborn triage <id> <install-folder>` and `reborn triage <id> <main-executable>`: technology, resources, data files. `reborn manual <id> <help file>` gives the independent feature inventory early.
2. Data model first, from the strongest source available:
   - shipped schema script: `reborn schema <id> <create.sql>` (graded `confirmed`);
   - local database: `reborn sqlite <id> <file>`;
   - names in the program: `reborn craft <id> native-strings-find ...`;
   - documentation: `reborn doc <id> <url>`.
3. Screens: `reborn ui <id> <folder>` when UI definition files ship with the app, otherwise block 1 screenshots.
4. Rules: from runs (exact values), documentation, or `reborn find <id> <exe> "<label seen on screen>"` (only when the legal basis allows reading the program). For native code with named functions, `reborn native <id> <dll> --engine ghidra-mcp --find "<regex>"` decompiles the functions behind a rule (Ghidra, see `docs/SETUP.md` §2b). Decompiled output is raw evidence: describe the behaviour in the card, grade it "the code declares", never paste the code.
5. Write cards in `02-investigation/` (formats in `contracts/`, examples in `docs/REBUILD-DOSSIER.md`).
6. `reborn validate <id>`, `reborn ask <id>`, `reborn dossier <id>`, `reborn handoff <id>`.

### When a run arrives

For each run that `fills` an acceptance scenario: copy the values read into `expected_values`, set `source_run`, add the matching rule examples, then raise the grades that are now backed by an exact observation. Regenerate the dossier and handoff.

## 3. Block 3: rebuild

**Receive only** `02-investigation/handoff.json`, `dossier.md`, and the screenshots referenced there: block 2 hands them over with `node tools/reborn.mjs export-kit <id> <folder>`, which refuses an out-of-date kit and checks that no name read out of the original's code is inside. The kit carries `inputs_sha256`: quote it in the parity report, so a rebuild made from an outdated kit is detectable. Each build-order item shows its grade, refuted items are left out, and a feature is `ready` only when a run on the original supplied expected values.

`handoff.json` contains:
- `build_order`: entities, then rules, then features by priority;
- `entities`, `rules`, `screens`, `features` (each feature with its `discovery_trace`);
- `migration_map`: new field to original table and column, for importing existing data;
- `test_vectors`: rule examples and acceptance scenarios with expected values;
- `to_observe` and `readiness`: what is not ready yet;
- `open_questions`.

Build in `apps/<id>/`. Turn every test vector into an automated test. Features graded `hypothesis` go behind a clear TODO. If something is missing, add an open question instead of guessing. After block 1 replays the scenarios on the rebuild, fill `03-reconstruction/parity/report.yaml`.

## 3b. Checking that a rebuild is faithful

A rebuild that passes its own tests is not proof of fidelity: the tests only restate the rules the kit wrote down. Check in this order:

1. `node tools/reborn.mjs coverage <target>` shows how many of the original's windows and tables the cards cover. Feature coverage stays `unknown` until an independent feature list (user manual, menu tree) is added to the evidence; never read it as complete.
2. Every rule example and acceptance scenario must come from a block 1 run (`source_run`). Expected values written by hand are labelled as such in the rebuild.
3. Replay the same scenarios on the original and on the rebuild with the computer-use agent, then fill `parity/report.yaml`. This is the only comparison that counts.
4. Keep a list of known divergences in `03-reconstruction/README.md` (what the rebuild does differently on purpose, and what it does not reproduce yet). Each divergence becomes an open question and a mission.

## 4. Hand-off checklist

| From to | Ready when |
|---|---|
| 1 to 2 | each finished mission has a run with screenshots and values read |
| 2 to 3 | each `must` feature has steps, rules, inputs and an acceptance scenario; handoff regenerated |
| 2 to 1 | `reborn ask` produced missions for open questions |
| 3 to 1 | the rebuild runs locally and the scenarios to replay are listed |

## 5. Command reference

```bash
node tools/reborn.mjs init <id> --name "<name>" --kind exe|saas|both
node tools/reborn.mjs triage <id> <file|folder>
node tools/reborn.mjs schema <id> <create.sql> [--only T1,T2]
node tools/reborn.mjs sqlite <id> <file> [--table T]
node tools/reborn.mjs ui <id> <folder>
node tools/reborn.mjs doc <id> <url>
node tools/reborn.mjs web <id> <url>
node tools/reborn.mjs har <id> <file.har>
node tools/reborn.mjs js <id> <dir|app.asar> [--max-kb 300]
node tools/reborn.mjs find <id> <exe> "<label>"
node tools/reborn.mjs identify <id> <file>             # compiler / framework / packer and the next tool (Detect It Easy)
node tools/reborn.mjs symbols <id> <dll> [--contains RE] # exported names in seconds, no Ghidra
node tools/reborn.mjs find <id> <exe> "<label>" [--engine craft|ghidra-mcp]
node tools/reborn.mjs java <id> <jar> --query Q | --class C [--method M] [--users]
node tools/reborn.mjs manual <id> <file.chm|folder|file.md>   # documented topics: the denominator of feature coverage
node tools/reborn.mjs db <id> <file.dbf|.mdb|.accdb>    # legacy database -> SQLite + entity cards
node tools/reborn.mjs relations <id>                    # links implied by column names, no foreign key (hypotheses)
node tools/reborn.mjs parity <id>                       # share of the kit's expectations the rebuild has proven
node tools/reborn.mjs frappe <id> model                 # Frappe/ERPNext site: every document type -> entity cards
node tools/reborn.mjs frappe <id> observe <cases.json>  # fictitious drafts created, computed amounts read back -> a run
node tools/reborn.mjs import-run <id> <EXP.json|dir> --mission M-xxx [--root h-explorer]   # H Company explorer -> runs
node tools/reborn.mjs native <id> <binary> [--engine ghidra-mcp|rea] [--find RE] [--decompile a,b] [--max 3]
node tools/reborn.mjs rea <id> <command> [args]
node tools/reborn.mjs craft <id> <command> [args]
node tools/reborn.mjs coverage <id>
node tools/reborn.mjs verify [id]              # re-hash evidence files against the index
node tools/reborn.mjs export-kit <id> <folder> # kit + dossier + screenshots for block 3, leak-checked
powershell -File tools/ghidra-mcp.ps1 -Root <samples>   # headless Ghidra server for --engine ghidra-mcp
node tools/reborn.mjs ask <id>
node tools/reborn.mjs validate [id]
node tools/reborn.mjs dossier <id>
node tools/reborn.mjs handoff <id>
node tools/reborn.mjs status [id]
```

## 6. Known limits

- No feature is `confirmed` yet: every target waits for block 1 runs.
- Running a desktop app from the investigation tools needs interactive consent; on this setup, runtime capture is block 1's job.
- The adapter from the computer-use agent's output to `run.yaml` is still to write (format fixed in `contracts/run.schema.json`).
