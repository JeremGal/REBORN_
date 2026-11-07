# ReBorn

**New interface, same business logic.** ReBorn helps modernize old business software that a team is allowed to study (open source, own licence, or provided by the organizers). Three agents work in a chain: one uses the software, one documents its behaviour with evidence, one rebuilds a modern version from that documentation only.

> **En bref (FR).** Bloc 1 : un agent « computer use » utilise le logiciel et relève ce qu'il voit. Bloc 2 : on documente chaque comportement avec des preuves et on produit un kit de reconstruction. Bloc 3 : on reconstruit à partir de ce seul kit, puis on rejoue les mêmes scénarios pour vérifier la parité. Mode d'emploi : [`docs/GUIDE.md`](docs/GUIDE.md).

## The chain

| Block | Who | Receives | Produces |
|---|---|---|---|
| 1. Explore | computer-use agent | missions with UI steps | runs: steps, screenshots, values read on screen |
| 2. Investigate | REA + Craft Anything + Claude Code | runs + the software or its docs | `handoff.json` + `dossier.md` + open questions |
| 3. Rebuild | Claude Code | `handoff.json` + `dossier.md` + screenshots only | modern app + tests + parity report |

Open questions from block 2 become new missions for block 1. At the end, block 1 replays the same scenarios on the rebuilt app; the share of matching results is the parity score.

## Repository map

| Path | Content |
|---|---|
| `docs/GUIDE.md` | Operating manual for the three blocks, including what block 2 needs to run |
| `methods/` | The reusable method and per-trade profiles that improve with each new target |
| `contracts/` | JSON Schemas of every hand-off (CI validates them) |
| `targets/<id>/` | One folder per software studied (`01-exploration`, `02-investigation`, `03-reconstruction`) |
| `tools/reborn.mjs` | Team CLI |
| `apps/<id>/` | Rebuilt applications (block 3) |
| `.claude/skills/` | One skill per block |

## Worked examples

| Target | Kind | Basis | Status |
|---|---|---|---|
| `gnucash` | accounting desktop app | GPL | data model, 2 rules, 2 screens, 1 feature; waiting for observed runs |
| `unicenta` | point of sale | GPL | 40 entities from its shipped database schema, 2 rules, 1 feature; waiting for observed runs |
| `pc-compta` | accounting | vendor public documentation only | 4 entities, 3 rules as hypotheses; to confirm on the official evaluation version |
| `mmex`, `dolibarr` | first-pass examples | GPL | triage evidence only |

No feature is `confirmed` yet: that needs values observed by block 1. Each `handoff.json` says so in its `readiness` and lists the missing observations in `to_observe`.

## Quick start

```bash
npm install
node tools/reborn.mjs doctor
node tools/reborn.mjs status
node tools/reborn.mjs handoff gnucash
```

## Rules

1. Only study software you are allowed to study. Never bypass a protection.
2. Block 3 builds from the kit only; no original code, assets or branding are reused.
3. Every claim cites evidence and carries an honest grade (`confirmed`, `partial`, `hypothesis`, `refuted`).
4. No secrets, binaries or raw evidence in git.
