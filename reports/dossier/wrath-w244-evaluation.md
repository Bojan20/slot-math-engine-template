# SLOT-MATH Evaluation — wrath-of-olympus

## Closed-form composition

| Metric | Value |
|---|---|
| CF target RTP | 96.136025% |
| Composed RTP (W244 kernels) | 59.790043% |
| Delegated baseline (per-line + scatter + lightning) | 36.345983% |
| **Total** | **96.136025%** |
| Δ vs CF target | +0.0000 bps |
| Composer parity (≤ 1 bps) | ✅ |

### Per-kernel breakdown

| Kernel | Feature | RTP contribution | Status |
|---|---|---:|:---:|
| asymmetric_paytable | evaluation.lines | 0.000000% | ⚠️ delegated |
| expanding_symbol | feature.free_spins | 20.092156% | ✅ |
| hold_and_win | feature.hold_and_win | 39.697886% | ✅ |

## Monte Carlo runtime

| Metric | Value |
|---|---|
| Spins | 100,000 |
| Measured RTP | 96.393908% |
| Std error | ±3.100268% |
| Wilson 99% CI half-width | ±7.986290% |
| Δ vs CF target | +25.79 bps |
| Convergence (within Wilson 99% CI) | ✅ |
| Hit rate | 20.7550% |
| FS trigger | 1/114.29 |
| H&W trigger | 1/112.87 |
| Max win observed | 1190.98× |
| Throughput | 1,195,561 spins/sec |

## Performance

- composer: 10.1 ms
- mc: 83.6 ms
