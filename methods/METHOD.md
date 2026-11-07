# The ReBorn method

A **software-agnostic** way to understand a legacy business application you are authorized to study, well enough to rebuild a modern interface on top of the **same business logic**. The method is fixed here; the software it is applied to is not. Each new target of the same trade (accounting, point of sale, dispensary, legal, ...) adds to the matching profile in `methods/by-domain/`, so the method gets sharper the more applications of one trade it has seen.

Goal, always: **refresh the interface, keep the business logic.** Never copy code, assets or branding. Only study software whose licence or the owner allows it.

## The four moves

### 1. Route by technology (what can be read, and how)

The technology decides which evidence is cheap and which is impossible. First identify it, then pick the readers.

| Signal in the binary / bundle | Technology | Cheapest rich evidence |
|---|---|---|
| imports `mscoree.dll`, CLI directory present | .NET | managed metadata: classes, methods, string literals (no engine) |
| imports `wx*`, `Qt*`, `libgtk`, MSVC runtime, no CLI dir | native C/C++ | strings and cross-references in the binary; shipped UI files; DLL imports |
| `app.asar`, `electron`, `libcef` | Electron / web UI | the JS application graph, IPC channels, endpoints |
| `python3x.dll`, `PYZ-00.pyz` | Python (frozen) | the archive inventory, then the `.pyc` modules |
| `jvm.dll`, a `.jar` | Java | the class files (bytecode is high level and readable) |
| `wd*vm*.dll`, Delphi `RCDATA` forms, VB6 `MSVBVM` | WinDev / Delphi / VB6 | shipped forms/resources and the data files; code is often opaque |
| a web URL, no local binary | SaaS | the page (DOM, scripts), the API surface from a recorded session |

Rule: **never claim a static finding was observed at runtime.** Static says what the code *declares*; only running the software proves what it *does*.

### 2. Pull the three layers of evidence

A business application is three layers. Capture each from the cheapest honest source.

- **Data layer (the backbone).** The data model is the most stable, most transferable thing in a legacy app. Get it from, in order of reliability: a real database created by the app (schema with types, keys, enums) > network payloads (SaaS) > table/column names found in the binary > field labels on screens. This layer drives everything else and is what makes a **migration** possible later.
- **Rule layer (the value).** The computations and constraints: totals, rounding, tax, numbering, posting workflow, validations, state machines. Find candidate rules by: observed input/output pairs from a run (strongest), worked examples in documentation, and functions located from an on-screen label (label -> strings -> functions). Every rule needs at least one worked numeric example; that example becomes a test.
- **Screen layer (the surface).** The windows, their fields in order, required/validation, shortcuts, navigation. Get it from shipped UI definition files when they exist (GtkBuilder, Delphi DFM, .NET resources, Electron HTML), otherwise from run screenshots. This layer is the one we deliberately **modernise**; capture its behaviour, not its looks.

### 3. Cross-check, and grade honestly

One source is a hypothesis. A finding becomes `confirmed` only with an exact observation or two independent kinds of evidence (for example: a column name in the binary **and** a value seen on screen). Grades: `confirmed`, `partial`, `hypothesis`, `refuted`. Anything you cannot establish is an **open question** with the probe that would answer it, never a guess. Open questions of the kind "needs a run" are handed back to the exploration block as new missions.

### 4. Package for rebuild (not for reading)

The receiving block gets a kit, not a report. See `docs/REBUILD-DOSSIER.md` for the shape. The parts that make it rebuild-ready:
- a **build order** computed from dependencies (data model, then rules, then features by priority);
- per feature, the **discovery trace**: screen -> label -> function -> table -> observed value, each step with its evidence id and grade, so the rebuilder sees what is sure and what is assumed;
- a **migration map**: for each field of the new model, the original table and column it came from, so real customers can carry their data across (the single strongest reason a business would switch);
- **test vectors**: every rule with its numeric examples, every feature with its expected values, ready to become automated tests and to be replayed on the rebuild for a parity score.

## The loop that proves it

The rebuild is reconstructed from the kit alone (clean room). Then the exploration block replays the same acceptance scenarios on the new application and compares with the original. The share of scenarios that match is the honest measure of "same logic, new interface."

## What gets reused across targets

Only the **method** and the **per-trade profiles** are reusable, never one application's content. A profile lists, for a trade: the entities to expect, the rules to look for, the screens that always exist, and the questions worth asking first. A new application of that trade is first mapped against its profile, then the profile is enriched with whatever that application taught. See `methods/by-domain/README.md`.
