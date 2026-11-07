# Demo script (3 minutes)

| Time | On screen | Message |
|---|---|---|
| 0:00 | The legacy software, full screen | "Millions of accountants, pharmacists and shops run software like this. The logic inside is gold; the interface is stuck in 2005." |
| 0:20 | H Company agent driving it (recorded run, sped up) | "Block 1: a computer-use agent uses it like a person and writes down every screen, value and message." |
| 0:50 | `reborn triage` output + evidence index | "Block 2: REA and Craft Anything tie each behaviour to evidence: resources, data files, network, code. Nothing is guessed: every line has a status and a proof." |
| 1:20 | `dossier.md` (features, rules with formulas, data model diagram) | "The result is a rebuild dossier: features, business rules with worked examples, screens, data model, open questions." |
| 1:50 | Rebuilt app side by side with the original | "Block 3: Claude Code rebuilds from the dossier only. Clean room: no original code, no assets." |
| 2:20 | Parity report: N/M scenarios match | "Then the same agent replays the same scenarios on the new app. This is the proof." |
| 2:45 | The chain diagram | "Point it at any legacy software: it comes back reborn." |

## Plan B

- Pre-recorded runs and a pre-generated dossier in the repo (the demo never depends on live APIs).
- If the parity replay cannot run live, show the last `parity/report.yaml`.

## What must be true before the demo

- `node tools/reborn.mjs validate` passes.
- One target with at least 3 `must` features, each with acceptance scenarios.
- At least one parity report.
