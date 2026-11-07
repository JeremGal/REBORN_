# ReBorn

**Give legacy business software a second life.** Accountants, pharmacists, lawyers, driving schools and shops still run on software from another era: the screens are dated, but the business logic inside is precise and battle-tested. ReBorn chains three agents to capture that logic and rebuild the software as a modern application.

> **En bref (FR).** Un agent « computer use » de H Company utilise le vieux logiciel comme un humain et note ce qu'il observe. REA et Craft Anything relient chaque comportement observé à une preuve et produisent un dossier de reconstruction. Claude Code reconstruit l'application à partir de ce seul dossier, puis l'agent H rejoue les mêmes scénarios sur la nouvelle version pour mesurer la parité.

## The chain

```
 ┌──────────────────────────┐     ┌──────────────────────────────┐     ┌──────────────────────────────┐
 │ 1. EXPLORE               │     │ 2. INVESTIGATE               │     │ 3. REBUILD                   │
 │ H Company computer-use   │ ──▶ │ REA + Craft Anything         │ ──▶ │ Claude Code (+ Craft Anything│
 │ agent drives the legacy  │     │ tie every behaviour to       │     │ in clean-room mode) builds   │
 │ app like a user          │     │ evidence: code, data,        │     │ from the dossier only        │
 │                          │     │ network, screens             │     │                              │
 │ OUT: missions, run       │     │ OUT: rebuild dossier         │     │ OUT: modern app + tests      │
 │ traces, screenshots,     │     │ (features, rules, screens,   │     │                              │
 │ observations             │     │ data model, unknowns)        │     │                              │
 └──────────────────────────┘     └──────────────────────────────┘     └──────────────┬───────────────┘
              ▲                          │ open questions become new missions          │
              └──────────────────────────┘                                             │
              ▲                                                                        │
              └────────── PARITY: the agent replays the same scenarios on the rebuild ─┘
```

Every hand-off is a set of files with a fixed format (`contracts/`), so the three blocks work in parallel from day one.

## Repository map

| Path | What lives there |
|---|---|
| `methods/` | The reusable, software-agnostic reverse method (`METHOD.md`) and the per-trade profiles (`by-domain/`) that get sharper with every target of the same trade |
| `contracts/` | JSON Schemas of every hand-off: target, mission, run, observations, feature, rule, screen, entity, unknowns, evidence index, parity report |
| `targets/<id>/` | One folder per legacy software studied (see below). `targets/_template/` is copied by `reborn init` |
| `tools/reborn.mjs` | The team CLI: drives REA and Craft Anything, stores evidence, validates files, renders the dossier |
| `apps/<id>/` | Rebuilt applications (block 3) |
| `docs/` | Pipeline, dossier format, clean-room policy, demo script, setup |
| `.claude/skills/` | Claude Code skills for each block, plus REA's official `reverse-engineer-anything` skill |

```
targets/<id>/
├── target.yaml                     what we study, version, legal basis, artifact hashes (never the binary)
├── 01-exploration/                 BLOCK 1
│   ├── missions/M-001.yaml         tasks given to the computer-use agent
│   ├── runs/<run-id>/run.yaml      step-by-step trace + screenshots
│   └── observations.yaml           business behaviour noticed, tied to run steps
├── 02-investigation/               BLOCK 2
│   ├── features/F-001.yaml         one card per feature: goal, inputs, steps, rules, errors, acceptance tests
│   ├── rules/R-001.yaml            business rules with formulas and worked examples
│   ├── screens/S-001.yaml          screens: fields, actions, shortcuts, navigation
│   ├── domain/<Entity>.yaml        data model
│   ├── unknowns.yaml               open questions and the probe that would answer them
│   ├── evidence/index.yaml         register of raw evidence (files stay local, out of git)
│   └── dossier.md                  generated, human-readable rebuild dossier
└── 03-reconstruction/              BLOCK 3
    ├── README.md                   where the rebuild lives, how to run it
    └── parity/report.yaml          original vs rebuild, scenario by scenario
```

## Quick start

```bash
npm install                                   # ajv + yaml, nothing else
node tools/reborn.mjs init pc-compta --name "PC Compta" --kind exe
node tools/reborn.mjs status
```

| Block | Start here |
|---|---|
| 1. Explore (H Company agent) | `docs/PIPELINE.md` §1, skill `.claude/skills/reborn-explorer` |
| 2. Investigate (REA + Craft Anything) | `docs/PIPELINE.md` §2, skill `.claude/skills/reborn-investigator`, `docs/SETUP.md` |
| 3. Rebuild (Claude Code) | `docs/PIPELINE.md` §3, skill `.claude/skills/reborn-rebuilder`, `docs/REBUILD-DOSSIER.md` |

Investigator commands (block 2):

```bash
node tools/reborn.mjs triage   <target> <file.exe|.dll|.asar|.zip>   # first pass: resources, imports, .NET, Go, Rust...
node tools/reborn.mjs js       <target> <dir|app.asar>              # static JavaScript / Electron analysis
node tools/reborn.mjs web      <target> <url>                       # passive inspection of a SaaS page in a throwaway browser
node tools/reborn.mjs har      <target> <session.har>               # API surface from a recorded session
node tools/reborn.mjs sqlite   <target> <file.db>                   # schema and sample rows of a local database
node tools/reborn.mjs doc      <target> <url>                       # public documentation page -> markdown evidence (Crawl4AI in Docker)
node tools/reborn.mjs ui       <target> <folder|file>              # shipped UI files (GtkBuilder .ui/.glade) -> screen candidates
node tools/reborn.mjs find     <target> <file.exe> "<label>"        # label seen on screen -> strings -> functions (Craft Anything, Deep mode if allowed)
node tools/reborn.mjs rea      <target> <any rea command> [args]    # any of REA's 175 commands, evidence registered
node tools/reborn.mjs craft    <target> <any craft command> [args]  # any of Craft Anything's 322 commands, evidence registered
node tools/reborn.mjs ask      <target>                             # open questions -> new missions for block 1
node tools/reborn.mjs validate <target>                             # contracts + cross references
node tools/reborn.mjs dossier  <target>                             # render the rebuild dossier
node tools/reborn.mjs handoff  <target>                             # build the machine-readable kit (handoff.json)
```

## Rules of the road

1. **Clean room.** Blocks 1 and 2 may study the original software. Block 3 builds **only** from the dossier. No original code, assets or branding are copied. See `docs/CLEAN-ROOM.md`.
2. **Evidence or it did not happen.** Every feature, rule, screen and entity cites its evidence. `status` says how sure we are: confirmed, partial, hypothesis, refuted.
3. **Never claim a static finding was observed at runtime.** Static analysis says what the code declares; only a run proves what happens.
4. **No secrets, no binaries, no raw evidence in git.** Raw evidence can contain decompiled code: it stays in the local `.evidence/` store.
5. **Authorized targets only.** Open-source software, free demos, our own licences, or targets provided by the organizers.

## Status

| Piece | State |
|---|---|
| Contracts (12 schemas), CLI, validation, dossier rendering, unknowns → missions | working |
| REA 6.8.0 (CLI + MCP) | tested on `targets/mmex` (Windows exe: imports, resources, .NET/Go/Rust detection, install folder, SQLite) and `targets/dolibarr` (SaaS page: inspection, script export, JS analysis) |
| Craft Anything 0.4.0 | built on Windows; triage and label → functions tested in Deep mode on `targets/mmex`; clean room refusal verified |
| H Company Agents API adapter | to build by block 1 (output format: `contracts/run.schema.json`) |
| Rebuild + parity loop | to build by block 3 |

`targets/mmex` and `targets/dolibarr` are worked examples of block 2's first pass: real evidence, open questions, and the missions they generated for block 1.

Built for the H Company Computer Use Agents Hackathon.
