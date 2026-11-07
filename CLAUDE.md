# ReBorn: instructions for Claude Code

ReBorn rebuilds legacy business software in three blocks. Read `README.md`, then `docs/GUIDE.md` (operating manual), then the skill of the block you are working on:

| Block | Skill | Writes to |
|---|---|---|
| 1. Explore with a computer-use agent (H Company) | `.claude/skills/reborn-explorer` | `targets/<id>/01-exploration/` |
| 2. Investigate with REA + Craft Anything | `.claude/skills/reborn-investigator` (+ `reverse-engineer-anything`) | `targets/<id>/02-investigation/` |
| 3. Rebuild from the dossier | `.claude/skills/reborn-rebuilder` | `apps/<id>/`, `targets/<id>/03-reconstruction/` |

If you do not know which block you serve, ask.

## Non-negotiable rules

- **Formats.** Every YAML file follows its schema in `contracts/`. Run `node tools/reborn.mjs validate <target>` before every commit; fix errors, read warnings.
- **Evidence.** Every claim cites evidence (`evidence:` lists). Use `status` honestly: `confirmed` needs an exact observation or two independent kinds of evidence; otherwise `partial` or `hypothesis`. Unknowns go to `unknowns.yaml`, never get guessed.
- **Static is not runtime.** Never write that something "happens" when only static analysis (REA, decompilation) shows it. Write "the code declares", "the resources contain".
- **Clean room.** Block 3 reads only `targets/<id>/02-investigation/` (YAML + `dossier.md`) and the screenshots of `01-exploration/`. Never paste decompiled or original code, original assets or brand names into the dossier or the rebuild. `rebuild_notes` describe behaviour and a suggested approach.
- **Secrets and data.** No API key, token, password, cookie or real customer data in git. HAR files, raw evidence and binaries are gitignored on purpose. Test data is fake.
- **Targets.** Only software we may study: open source, free demo, our own licence, or provided by the organizers. Never bypass DRM, licence checks, anti-cheat or authentication.
- **Tools.** REA: `node tools/reborn.mjs rea <target> <command>` (or the `rea` MCP server). Prefer summary-first REA calls, cite `evidence_id`s, keep coverage limits visible.

## Useful commands

```bash
node tools/reborn.mjs status [target]
node tools/reborn.mjs validate [target]
node tools/reborn.mjs dossier <target>
node tools/reborn.mjs handoff <target>  # machine-readable kit for block 3 (build order, migration map, test vectors, to_observe)
node tools/reborn.mjs ask <target>      # turn open unknowns into computer-use-ready missions for block 1
```

Full command list: `docs/GUIDE.md` §5.
