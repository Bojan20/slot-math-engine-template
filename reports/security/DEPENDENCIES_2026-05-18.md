# Dependency Vulnerability Scan — 2026-05-18

**Totals:** critical=0 high=2 moderate=28 low=4 info=0

## Per-manifest summary

| Manifest | Critical | High | Moderate | Low | Info | Status |
|---|---:|---:|---:|---:|---:|---|
| `root` | 0 | 1 | 8 | 4 | 0 | ATTENTION |
| `web/studio` | 0 | 1 | 4 | 0 | 0 | ATTENTION |
| `web/operator` | 0 | 0 | 4 | 0 | 0 | ok |
| `web/regulator` | 0 | 0 | 4 | 0 | 0 | ok |
| `web/marketplace` | 0 | 0 | 4 | 0 | 0 | ok |
| `web/cabinet` | — | — | — | — | — | error: [object Object] |
| `sdk` | 0 | 0 | 4 | 0 | 0 | ok |

## CVEs (Critical/High)

### root
- **[high]** `rollup` 4.0.0 - 4.58.0 — via: Rollup 4 has Arbitrary File Write via Path Traversal.
  - Fix: run `npm audit fix` (auto-fix available).

### web/studio
- **[high]** `xlsx` * — via: Prototype Pollution in sheetJS; SheetJS Regular Expression Denial of Service (ReDoS).

