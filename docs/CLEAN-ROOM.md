# Clean-room policy

ReBorn rebuilds what software **does**, not what it **is**. This is both the legal frame and our method.

## What we may do

- **Observe, study and test** how a program works to find the ideas and principles behind it, as a lawful user (EU Directive 2009/24/EC, art. 5(3); a contract cannot forbid it). This is block 1.
- **Analyse shipped artifacts** of software we may study: open-source programs, our own licences, free demos, targets provided by the organizers. This is block 2.
- **Rebuild** an application that reproduces the behaviour, written from a functional description. This is block 3.

Decompiling beyond what is needed for interoperability is restricted in the EU (art. 6). For proprietary targets, block 2 favours observable sources: resources, data files, network captures, UI observation. Native decompilation is used only on targets whose licence allows it (open source) or with the right holder's authorization.

## The separation

| | Block 1 + 2 | Block 3 |
|---|---|---|
| May read | the software, its files, raw evidence, decompilation output | `02-investigation/` YAML + `dossier.md`, block 1 screenshots |
| Must never receive | | raw evidence (`.evidence/`), decompiled code, original assets |
| Writes | behaviour, rules, data model, unknowns | new code, new design |

Raw evidence stays in each investigator's local `.evidence/` folder (gitignored). The dossier describes behaviour in our own words.

## Never

- Copy code, decompiled output, images, icons, fonts, sounds or text content of the original into the dossier or the rebuild.
- Reuse the original name, logo or trade dress.
- Bypass DRM, licence checks, anti-cheat, authentication, or any technical protection measure.
- Use real customer data. Test data is fake.
- Run untrusted binaries outside a disposable environment.

## Tools and their own rules

- **REA**: MIT, local analysis, `DISCLAIMER.md` forbids circumvention and copying proprietary code or assets.
- **Craft Anything**: clean-room mode by default (only what is visible); its Deep mode reads code and is meant for private use. Block 3 runs it in clean-room mode only, fed with the dossier.
