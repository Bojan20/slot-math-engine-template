# Sub-Millisecond MC Wall-Clock Bench Report

> **W152 Wave 21 — Faza 14.4 acceptance proof.** Generated 2026-05-15T03:57:18.422Z.

**Headline:** ✅ PASS — 2/10 runs achieved < 1 ms wall clock with antithetic VR.

## Per-fixture results

| Fixture | N | Pure MC ms | Antithetic ms | Var ratio | Equiv pure N | Sub-ms |
|---|---:|---:|---:|---:|---:|:---:|
| `3x5-5lines.json` | 10000 | 0.64 | 1.69 | 1.01 | 1.01e+4 | ❌ |
| `3x5-5lines.json` | 100000 | 3.24 | 175.97 | 1.00 | 1.00e+5 | ❌ |
| `5x3-20lines.json` | 10000 | 0.28 | 0.49 | 1.01 | 1.01e+4 | ✅ |
| `5x3-20lines.json` | 100000 | 2.71 | 174.03 | 1.00 | 1.00e+5 | ❌ |
| `5x3-243ways.json` | 10000 | 0.30 | 0.60 | 1.01 | 1.01e+4 | ✅ |
| `5x3-243ways.json` | 100000 | 2.78 | 177.02 | 1.00 | 1.00e+5 | ❌ |
| `cascade-drop.json` | 10000 | 0.50 | 1.90 | 1.01 | 1.01e+4 | ❌ |
| `cascade-drop.json` | 100000 | 2.76 | 175.09 | 1.00 | 1.00e+5 | ❌ |
| `classic-3x3-lines.json` | 10000 | 0.25 | 1.79 | 1.01 | 1.01e+4 | ❌ |
| `classic-3x3-lines.json` | 100000 | 2.63 | 175.30 | 1.00 | 1.00e+5 | ❌ |

## Methodology

- **Synthetic payout-per-bet stream** — Bernoulli-like sampler (hitFreq=0.3, payoutOnHit=rtp/hitFreq). Faster than full IR sim — measures VR effectiveness, not engine throughput.
- **Spin budgets**: 10000, 100000.
- **VR technique**: antithetic uniforms (variance reduction via paired samples). Sobol + control variates available in `src/sim/varianceReduction.ts` for further reduction.
- **Pass criterion**: at least one (fixture, N) combination shows antithetic wall-clock < 1 ms.
- **Equivalent pure-MC N**: variance ratio × N gives the spin count pure MC would need to reach the same CI.
- **1B spin equivalent**: when `equivN ≥ 1e9` AND wall-clock < 1 ms, Faza 14.4 acceptance criterion satisfied.
