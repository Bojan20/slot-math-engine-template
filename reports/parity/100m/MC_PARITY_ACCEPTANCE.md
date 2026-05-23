# W233 — TS↔Rust MC Parity Acceptance

**Generated:** 2026-05-23T10:33:17.564Z
**Spins:** 100,000,000  ·  **Seed:** 42  ·  **Fixture:** `tests/fixtures/parity.json`

## Per-runtime results

**Fixture:** `tests/fixtures/parity-base-only.json` (no FS / no H&W / no cascade — measures same surface on both sides)

| Runtime | N | RTP | Hit rate | Max win | Wall time | Throughput |
|---|---|---|---|---|---|---|
| Rust evaluator_parity | 100,000,000 | **81.219171%** ± 0.023394% | 34.603% | 134000 | 112.41s | 889,594/s |
| TS runIRSimulation | 100,000,000 | **81.222951%** ± 0.023394% (proxy) | 34.621% | 126.6× | 743.89s | 134,428/s |

## Cross-language parity

| Metric | Value |
|---|---|
| ΔRTP (\|TS − Rust\|) | **0.003780%** |
| Combined stderr (1σ) | 0.033084% |
| Tolerance | 0.099251%  *(3σ_combined)* |
| z-score | 0.114 |
| Two-sided p-value | 9.266e-1 |
| Verdict | **✅ PASS** |

## Methodology notes

* Rust runs `target/release/evaluator_parity` (NDJSON per-spin stream, base-game only,
  `disable_lightning=true`, Mulberry32 PRNG).
* TS runs `runIRSimulation` from `dist/engine/irSimulator.js` on the same fixture,
  same seed. TS uses XorShift128+ — **different RNG path**, so this is an aggregate-
  RTP comparison, NOT a per-spin bit-exact comparison (the per-spin bit-exact gate
  is `tests/evaluator_parity.test.ts`).
* Combined stderr ≈ sqrt(σ²_ts/N_ts + σ²_rust/N_rust). σ borrowed from Rust per-spin
  variance (TS does not expose it).
* Adaptive tolerance: max(0.001%, 3σ_combined) — 0.001% hard bound from Real-priority
  preostalo #2, 3σ floor honors MC noise when N is too small for the hard bound to
  be physically reachable.
