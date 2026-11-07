---
name: reborn-investigator
description: Block 2 of ReBorn. Turn a legacy application (install folder, .exe/.dll, .asar, local database, SaaS URL or HAR) plus the computer-use agent's runs into an evidence-backed rebuild dossier (features, rules, screens, entities, unknowns) using REA and Craft Anything. Use when asked to investigate, reverse engineer, triage, analyse a binary or SaaS, write feature/rule/screen/entity cards, or prepare the dossier for the rebuilder.
---

# ReBorn investigator (block 2)

You turn what the software **is** (artifacts) and what it **does** (block 1 runs) into a dossier block 3 can rebuild from without ever seeing the original code. Formats: `contracts/*.schema.json`. Worked examples: `docs/REBUILD-DOSSIER.md`. Policy: `docs/CLEAN-ROOM.md`.

## Before starting

1. `node tools/reborn.mjs doctor` (REA reachable with Node ^22.23.4 / ^24.22.1, Chrome found, Craft Anything installed?).
2. `node tools/reborn.mjs status <target>`: what block 1 already produced, open unknowns.
3. Read `targets/<target>/target.yaml`: access method and legal basis must be filled. If the target is not open source, provided by the organizers or covered by our licence, stop and ask.

## Order of work

1. **Triage** (minutes): `reborn triage <t> <install-dir>` then `reborn triage <t> <main.exe>`. Read the technology hints (hypotheses), the resource summary and the data files found.
2. **Pick the richest source for this technology:**
   - .NET: `reborn rea <t> inspect-managed-members <dll> --type <Full.Name>` (types, methods, string literals, no execution).
   - Electron / JS: `reborn js <t> <resources/app.asar>`.
   - Delphi: forms live in RCDATA resources; Win32 classic: DIALOG / MENU / STRING resources.
   - WinDev, VB6, native C++ (wxWidgets, Qt, MFC): bytecode or code is hard to read; lean on data files, resources and observation.
   - SaaS: `reborn web <t> <url>` (public pages) or `--cdp http://127.0.0.1:9222` on a Chrome you logged into yourself; `reborn har <t> <file>` for the API surface.
   - Any local database: `reborn sqlite <t> <file>` then `--table <name>`. The schema is the backbone of the data model.
3. **Cross-check with block 1**: for each observation, find the evidence that confirms or refutes it. A value read on screen in a run is an exact observation.
4. **Write cards** in this order: `domain/` → `screens/` → `rules/` (with worked examples) → `features/` (with acceptance scenarios from runs) → `unknowns.yaml`.
5. `reborn validate <t>`, `reborn ask <t>` (open questions become block 1 missions), `reborn dossier <t>`, commit.

## Rules

- Cite evidence on every card: REA `evidence_id` (from `evidence/index.yaml`), `run-...`, `O-...`, screenshots. Keep REA's limitations and partial coverage visible.
- `status: confirmed` only with an exact observation or two independent kinds of evidence. Otherwise `partial` / `hypothesis`.
- Static analysis is not runtime: write "the resources contain", "the code declares", never "the app does" unless a run shows it.
- Never paste decompiled code, original strings in bulk, images or icons into cards. Describe behaviour in your own words; quote only short UI labels and error messages needed to reproduce behaviour.
- Raw evidence stays in `.evidence/` (gitignored). Never move it into `targets/`.
- REA conduct (from the `reverse-engineer-anything` skill): summary first, then `inspect-analysis-view` pages, then a precise trace; never repeat an identical analysis; on `artifact_integrity_mismatch` use `--integrity-policy record-and-continue` and say so.

## Done when

Each `must` feature has a card with inputs, steps, rules, errors and at least one acceptance scenario; every referenced rule, screen and entity exists; validation passes; `dossier.md` is regenerated; remaining gaps are in `unknowns.yaml` with a probe.
