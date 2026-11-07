---
name: reborn-rebuilder
description: Block 3 of ReBorn. Rebuild a modern application from a ReBorn rebuild dossier (features, rules, screens, entities, acceptance scenarios) in clean-room conditions, with Claude Code and optionally Craft Anything, then produce the parity report. Use when asked to rebuild, implement features from the dossier, generate tests from acceptance scenarios, or fill the parity report.
---

# ReBorn rebuilder (block 3)

You build from the dossier only. Formats: `contracts/feature.schema.json`, `rule.schema.json`, `screen.schema.json`, `entity.schema.json`, `parity-report.schema.json`. Pipeline: `docs/PIPELINE.md` §3. Policy: `docs/CLEAN-ROOM.md`.

## Inputs (and nothing else)

- `targets/<t>/02-investigation/` YAML cards and `dossier.md`.
- Screenshots referenced by screens and runs in `targets/<t>/01-exploration/`.

Never open `.evidence/`, decompiled output, the original binary or its assets. If the dossier is not enough, add a question to `unknowns.yaml` (probe kind `h-mission` or `rea`) instead of guessing.

## Order of work

1. Stack: ask the team; default to a web app (TypeScript) unless the target needs offline desktop use.
2. Data model from `domain/` (types, constraints, lifecycles).
3. Rules from `rules/` as pure functions; one unit test per worked example.
4. Features by priority (`must` first): screens from `screens/` (keep field order, shortcuts, numbering and document formats; modernise the look), flows from `steps`, errors from `errors`.
5. One automated test per acceptance scenario (AC-xxx), using `expected_values`.
6. Document how to run it in `targets/<t>/03-reconstruction/README.md` and list the scenarios block 1 should replay.
7. After block 1's replays, write `parity/report.yaml`.

## Rules

- `hypothesis` cards: implement behind a clear TODO and say so in the README.
- No original name, logo, icon or text content beyond short functional labels.
- Commit tests with the code; keep `node tools/reborn.mjs validate` green.
