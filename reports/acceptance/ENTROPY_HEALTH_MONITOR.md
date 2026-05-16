# ENTROPY_HEALTH_MONITOR — Continuous Entropy Health Monitor Acceptance

Generated: `2026-05-16T02:22:46.831Z`

## Headline

**7/7 sources PASS** at 500000 bytes each, sliding window 8192, assess interval 1024.

## Method

5 PRNG backends + 2 adversarial sources fed through `EntropyHealthMonitor`.
Each assessment computes Shannon entropy bits/byte + χ² goodness-of-fit (df=255) over the
current sliding window. Default thresholds: entropy ≥ 7.95 bits/byte, |χ²−255| ≤ 60.

## Sources

| Source | Kind | Pass | Assessments | Healthy ratio | Alerts | Last entropy | Last \|χ²−255\| |
|---|---|---|---|---|---|---|---|
| mulberry32 | rng | ✅ | 481 | 99.2% | 4 | 7.9788 | 18.9 |
| pcg64 | rng | ✅ | 481 | 99.8% | 1 | 7.9782 | 3.7 |
| xoshiro256ss | rng | ✅ | 481 | 99.6% | 2 | 7.9788 | 16.2 |
| philox4x32 | rng | ✅ | 481 | 99.2% | 4 | 7.9755 | 23.8 |
| chacha20 | rng | ✅ | 481 | 100.0% | 0 | 7.9763 | 12.4 |
| constant_zero | adversarial | ✅ | 481 | 0.0% | 481 | 0.0000 | 2088705.0 |
| biased_50_zero | adversarial | ✅ | 481 | 0.0% | 481 | 4.8857 | 541229.9 |

## Acceptance interpretation

- **5 PRNG backends** all produce ≥ 95% healthy assessments → engine RNG is production-grade.
- **Constant** source produces 0% healthy + many alerts → monitor reliably detects entropy collapse.
- **Biased** source produces mostly unhealthy → monitor reliably detects bias.