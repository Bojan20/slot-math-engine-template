# W215 Fuzz Discovery — Bug-Fix Campaign

W215 Faza 600.4 — honest, complete log of every issue surfaced by the
discovery run.

## Discovery summary

| Mode | Total iter | Targets | Unique crashes | Property violations |
| --- | ---: | ---: | ---: | ---: |
| Synthetic | 350 000 (50K × 7) | 7 | 0 | 0 |
| Properties | 50 000 (10K × 5) | 5 | n/a | 0 |

Total: **400 000 fuzz iterations** across 7 fuzz targets and 5 property
invariants. **Zero unique crashes**, **zero property violations**.

## Fixes applied

| # | Crash class | Root cause | Fix | Regression test |
| --- | --- | --- | --- | --- |
| 1 | shrinker stall | W214 halving shrinker stopped at power-of-2 boundary (length 8 for predicate `len>4`). Halving from 8 → 4 crossed the threshold so the shrinker bailed out. | Added Phase-2 bisect step in `_lib.mjs` that binary-searches the smallest still-failing prefix length after halving plateaus. `_lib-v2.mjs` ships the same logic as `shrinkOptimal`. | `scripts/tests/fuzz-shrinker.test.mjs` (15 specs), incl. exact-length assertions for strings + arrays + objects. |

That's the entire fix list. No actual logic bugs were discovered by
the 400 000-iteration sweep — the W212 + W215 harnesses + stubs are
internally consistent. This is the expected outcome on a fresh
codebase; future weekly discovery runs may surface more.

## What we did NOT find

Negative results matter — the following classes of issues were
specifically searched for and **not present**:

- **prototype pollution** in marketplace payloads (guard in
  `validateListingPayload` worked across 50K malicious inputs).
- **conservation violations** in the spin pipeline (debit + credit
  arithmetic stayed exact across 10K random tenants × games).
- **JWT signature bypass** via tampered tokens (50K mutated tokens
  all rejected with `bad_signature`).
- **canary stuck states** — every unhealthy signal from `ramping`/
  `holding` correctly rolled back to `rolled-back`.
- **non-determinism** in spin output for fixed seed.
- **monotonicity violations** — doubling the bet doubled the payout
  within the rounding tolerance for every seed.
- **round-trip drift** — sign → verify preserved every legitimate
  payload bit-for-bit.

## How to extend the campaign

Future bug-hunt waves should focus on:

1. **Cross-target fuzz** — feed the IR evaluator's output into the
   spin engine's makeInput, find interaction bugs.
2. **Differential fuzz** — compare TypeScript engine output against
   the Rust `slot-math-engine-core` for the same IR + seed.
3. **Mutation budget** — once seed corpus is populated, switch from
   pure random to corpus-mutation (LibFuzzer-style).

See `docs/FUZZ_DISCOVERY.md` § "Adding a new fuzz target" for the
contract every new harness must follow.

## Generated artifacts

- `reports/fuzz/discovery/<TS>/summary.{json,md}` — per-run report.
- `reports/fuzz/INGEST_REPORT.md` — classified findings list.
- `reports/fuzz/FUZZ_DASHBOARD.{json,md,html}` — multi-run trend.
- `reports/fuzz/seed-corpus/<harness>/` — coverage-growing seeds.
