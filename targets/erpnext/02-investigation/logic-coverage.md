# Business logic coverage: Open-source web ERP (accounting, selling, buying, stock, manufacturing)

Business forms read on screen by the H Company agent: 180. Rules declared by the business document types: 3830.

| Kind of declared rule | Declared | Confirmed by observation | Consistent, not proof | Contradicted | Not checkable by reading |
|---|---|---|---|---|---|
| default | 1227 | 71 | 158 | 1 | 997 |
| visibility | 1120 | 116 | 152 | 0 | 852 |
| computed | 876 | 52 | 0 | 0 | 824 |
| auto-fill | 319 | 0 | 0 | 0 | 319 |
| conditional-mandatory | 96 | 0 | 0 | 0 | 96 |
| default-dynamic | 85 | 0 | 0 | 0 | 85 |
| conditional-read-only | 76 | 0 | 0 | 0 | 76 |
| link-filter | 31 | 0 | 0 | 0 | 31 |
| **total** | **3830** | **239 (6.2 %)** | 310 | 1 | |

Logic no definition declares, observed in runs: 7 computation and validation rules confirmed, 66 refusals with their message, 67 drafts accepted.

Confirmed = seen on screen or read back from the running program and matching the declared rule. Consistent = compatible with what was seen but not a proof (a field not reported may sit on another tab). Not checkable by reading = needs typing or a document in another state (auto-fills, conditional mandatory, computed values on an empty form).

## Contradictions to look at

- Serial and Batch Bundle.naming_series (default, declared SABB-.########): observed "SABB-#######"
