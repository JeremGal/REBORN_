# Working together

## Branches

- `main` stays valid: `node tools/reborn.mjs validate` passes.
- One branch per block and target: `explore/<target>`, `investigate/<target>`, `rebuild/<target>`.
- Small pull requests, merged often: the next block is waiting for your files.

## Before every push

```bash
node tools/reborn.mjs validate <target>
node tools/reborn.mjs dossier <target>     # block 2: keep dossier.md in sync
git status                                  # no .har, .exe, .evidence/, .env, screenshots with personal data
```

## Hand-off checklist

| From → To | Ready when |
|---|---|
| 1 → 2 | each `done` mission has a run with screenshots, `observations.yaml` lists the behaviours worth confirming |
| 2 → 3 | each `must` feature has a card with steps, rules, inputs and at least one acceptance scenario; `dossier.md` regenerated; open unknowns listed |
| 3 → 1 | the rebuild runs locally; the acceptance scenarios to replay are listed in `03-reconstruction/README.md` |
| 2 → 1 | `node tools/reborn.mjs ask <target>` created missions for open unknowns |

## What never goes in git

Binaries (`.exe`, `.dll`, `.msi`, `.asar`, archives), raw evidence (`.evidence/`), HAR captures, `.env` files, keys and tokens, real customer data, decompiled code.
