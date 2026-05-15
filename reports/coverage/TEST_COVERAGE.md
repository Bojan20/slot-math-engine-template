# Unified Test Coverage Report (TS + Rust)

> **W152 Wave 23 — tehnički dug closeout.** Generated 2026-05-15T10:35:05.791Z.

## Headline

- **TypeScript**: 115 test files, 2701 specs passing.
- **Rust**: 28 test files, 783 tests passing.

## TypeScript by category

| Category | File count |
|---|---:|
| acceptance | 7 |
| integration | 35 |
| unit | 73 |

## Rust by category

| Category | File count |
|---|---:|
| integration | 19 |
| unit | 9 |

## Methodology

- TS test count via vitest --reporter=basic stdout regex match.
- Rust test count via cargo test --release stdout summation across `test result: ok. N passed` lines.
- File categories inferred from filename keywords (acceptance/integration/mutation/unit).
- Coverage = test-COUNT, not line-coverage. Use `c8` (TS) or `tarpaulin` (Rust) for line coverage.
