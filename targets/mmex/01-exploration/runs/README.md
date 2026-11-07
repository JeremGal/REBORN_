# Runs

One folder per run: `run-<YYYYMMDD>-<HHMM>-<mission>/` containing `run.yaml` (format: `contracts/run.schema.json`) and the screenshots it references.

- Keep the agent's untouched raw output next to it (`raw/`) and point to it from `agent.raw_output`.
- Screenshots: PNG or JPG, named `s01.png`, `s02.png`... matching step numbers.
- HAR captures (SaaS): keep them **outside git** (they contain cookies and tokens) and reference the local path in `artifacts.har`. Block 2 runs `node tools/reborn.mjs har <target> <file>`.
- Use fake data only.
