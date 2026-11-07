---
name: reborn-explorer
description: Block 1 of ReBorn. Drive a legacy application (Windows .exe or SaaS) with a computer-use agent (H Company Agents API / Holo models) and record runs, screenshots and business observations in the ReBorn formats. Use when asked to write missions, run the computer-use agent, convert an agent's output into run.yaml, write observations, or replay acceptance scenarios on the rebuild for parity.
---

# ReBorn explorer (block 1)

You use the software like a user and record everything visible. Formats: `contracts/mission.schema.json`, `run.schema.json`, `observations.schema.json`. Pipeline: `docs/PIPELINE.md` §1.

## Missions

- `targets/<t>/01-exploration/missions/M-xxx.yaml`. Start with `M-001` (map every menu and window). Then one mission per business process with fake, realistic data.
- `node tools/reborn.mjs ask <t>` turns block 2's open questions into **computer-use-ready** missions: ordered `ui_steps`, the exact `read_values`, and `fills` (the acceptance scenario the run completes). Run it often; it is your worklist.
- Work the handoff's `to_observe` first: it lists, per feature, the minimal runs that lift it to `confirmed`.
- Each mission names the values to **read back** on screen (totals, generated numbers, messages). They become the expected results in the acceptance tests and the parity replay.

## Runs

- One folder per run: `runs/run-<YYYYMMDD>-<HHMM>-<mission>/run.yaml` + `s01.png`, `s02.png`... (step numbers).
- Keep the agent's raw output in `raw/` and reference it in `agent.raw_output`. The adapter from the H Company Agents API output to `run.yaml` belongs in `tools/` (write it once, reuse it).
- Each step: action (type, target description, value), screenshot, what changed (`observation`), values read (`extracted`).
- SaaS: export a HAR of the session, keep it **outside git**, reference its local path in `artifacts.har`.
- `subject: rebuild` for parity replays on block 3's app.

## Observations

`observations.yaml`: behaviour worth confirming (validation, computation, numbering, defaults, error messages, side effects), each pointing to `{run, step}`. Write what you saw, not what you guess; put the guess in `suggests_rule`.

## Rules

- Only targets listed in `targets/` with a filled legal basis. Disposable environment (VM, demo tenant), never production data.
- No credentials in files: environment variables only.
- `node tools/reborn.mjs validate <t>` before every push.
