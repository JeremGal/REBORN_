# ReBorn: instructions for Claude Code

ReBorn rebuilds legacy business software in three blocks.

**Block 3 reads only the folder made by `node tools/reborn.mjs export-kit <target> <folder>`** (kit, dossier, screenshots, all leak-checked). Do not read `context.md`, `.evidence/`, `targets/*/02-investigation/evidence/` or any decompiler output: they hold what block 3 must never see. Everyone else: read `context.md` (state of the project, tools, pitfalls, next steps), `README.md`, then `docs/GUIDE.md` (operating manual), then the skill of the block you are working on:

| Block | Skill | Writes to |
|---|---|---|
| 1. Explore with a computer-use agent (H Company) | `.claude/skills/reborn-explorer` | `targets/<id>/01-exploration/` |
| 2. Investigate with REA + Craft Anything | `.claude/skills/reborn-investigator` (+ `reverse-engineer-anything`) | `targets/<id>/02-investigation/` |
| 3. Rebuild from the dossier | `.claude/skills/reborn-rebuilder` | `apps/<id>/`, `targets/<id>/03-reconstruction/` |

If you do not know which block you serve, ask.

## Non-negotiable rules

- **Formats.** Every YAML file follows its schema in `contracts/`. Run `node tools/reborn.mjs validate <target>` before every commit; fix errors, read warnings.
- **Evidence.** Every claim cites evidence that exists (`evidence:` lists; a dead reference is a validation error). Use `status` honestly, and `validate` enforces it: `confirmed` needs an observation of the running program, or two different kinds of proof (runtime, shipped-data, static-code, documentation: two tools reading the same binary count once), or, for an entity, an exact shipped SQL script. Otherwise `partial` or `hypothesis`. Unknowns go to `unknowns.yaml`, never get guessed. A failed tool run is not evidence and never enters the index.
- **Static is not runtime.** Never write that something "happens" when only static analysis (REA, decompilation) shows it. Write "the code declares", "the resources contain".
- **Clean room.** Block 3 reads only `targets/<id>/02-investigation/` (YAML + `dossier.md`) and the screenshots of `01-exploration/`. Never paste decompiled or original code, original assets or brand names into the dossier or the rebuild. `rebuild_notes` describe behaviour and a suggested approach.
- **Secrets and data.** No API key, token, password, cookie or real customer data in git. HAR files, raw evidence and binaries are gitignored on purpose. Test data is fake.
- **Targets.** Only software we may study: open source, free demo, our own licence, or provided by the organizers. Never bypass DRM, licence checks, anti-cheat or authentication.
- **Tools.** REA: `node tools/reborn.mjs rea <target> <command>` (or the `rea` MCP server). Prefer summary-first REA calls, cite `evidence_id`s, keep coverage limits visible. Native code: `node tools/reborn.mjs native <target> <binary> --engine ghidra-mcp` (block 2 only; block 3 never gets a decompiler). The REA and Craft MCP servers are in `.mcp.block2.json`, not in `.mcp.json`: start a block 2 session with `claude --mcp-config .mcp.block2.json`. A REA command not known to be harmless, and Craft without an explicit `--deep`, run in clean room unless `target.yaml` `access.method` allows reading the code.
- **Kit.** Cards never name functions or symbols read out of the original; describe the behaviour. `dossier` and `handoff` refuse to write if the target does not validate or if a name from the local decompiler output appears in them. Use `kit_title` in `target.yaml`, not the product's name.

## Useful commands

```bash
node tools/reborn.mjs status [target]
node tools/reborn.mjs validate [target]
node tools/reborn.mjs dossier <target>
node tools/reborn.mjs handoff <target>  # machine-readable kit for block 3 (build order, migration map, test vectors, to_observe)
node tools/reborn.mjs ask <target>      # turn open unknowns into computer-use-ready missions for block 1
node tools/reborn.mjs verify [target]   # re-hash the evidence files against the index
node tools/reborn.mjs export-kit <target> <folder>   # the only folder block 3 may read
npm test                                # 41 tests: validation, SQL reader, kit, guards
```

Full command list: `docs/GUIDE.md` §5.
