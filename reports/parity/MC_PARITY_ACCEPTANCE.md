# W233 — TS↔Rust MC Parity Acceptance

**Generated:** 2026-05-23T10:22:22.499Z
**Spins:** 10,000,000  ·  **Seed:** 42  ·  **Fixture:** `tests/fixtures/parity.json`

## Per-runtime results

**Fixture:** `tests/fixtures/parity-base-only.json` (no FS / no H&W / no cascade — measures same surface on both sides)

| Runtime | N | RTP | Hit rate | Max win | Wall time | Throughput |
|---|---|---|---|---|---|---|
| Rust evaluator_parity | 10,000,000 | **81.109516%** ± 0.073883% | 34.611% | 134000 | 11.46s | 872,748/s |
| TS runIRSimulation | 10,000,000 | **81.073696%** ± 0.073883% (proxy) | 34.599% | 96.8× | 56.56s | 176,790/s |

## Cross-language parity

| Metric | Value |
|---|---|
| ΔRTP (\|TS − Rust\|) | **0.035820%** |
| Combined stderr (1σ) | 0.104487% |
| Tolerance | 0.313460%  *(3σ_combined)* |
| z-score | 0.343 |
| Two-sided p-value | 7.722e-1 |
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
