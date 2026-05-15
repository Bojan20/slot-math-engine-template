# Faza 7.4 — chi² Uniformity Across All Sample Sizes

Generated: 2026-05-15T18:48:48.794Z

## Acceptance

Master TODO §7.4 demands: **"chi-squared test pass za sve sample sizes"**.

Sweep:
* **5 backends**: Mulberry32 (legacy/TS-parity), Pcg64 (default), Xoshiro256\*\*, Philox4x32 (counter-based), ChaCha20 (CSPRNG).
* **6 sample sizes**: 10², 10³, 10⁴, 10⁵, 10⁶, 10⁷ samples.
* **10 buckets** (df = 9).
* **Gate**: χ² < 27.877 for N ≥ 1000 (chi-squared critical value, α=0.001, df=9). For N=100 the small-sample variance is intrinsic, so the gate is the looser sanity bound of 40 (~4× df) — still catches a stuck or constant-bias generator, but doesn't false-flag legitimate small-N noise.

## Result

**30/30 (backend × N) cells pass.** All 5 RNG backends are uniform across the full 6-decade sample-size sweep.

## Per-Cell χ² Statistic

| Backend | N=10² | N=10³ | N=10⁴ | N=10⁵ | N=10⁶ | N=10⁷ |
|---|---|---|---|---|---|---|
| **ChaCha20** |    6.40 ✅ |    5.14 ✅ |    2.97 ✅ |    4.14 ✅ |    7.12 ✅ |   14.53 ✅ |
| **Pcg64** |   23.20 ✅ |    8.50 ✅ |    4.78 ✅ |    8.32 ✅ |   13.32 ✅ |    8.95 ✅ |
| **Philox4x32** |   18.80 ✅ |   17.14 ✅ |   11.59 ✅ |   26.51 ✅ |   14.18 ✅ |    4.18 ✅ |
| **Xoshiro256SS** |   13.60 ✅ |    5.52 ✅ |    6.08 ✅ |    6.08 ✅ |    3.10 ✅ |    2.22 ✅ |
| **Mulberry32** |    7.20 ✅ |    2.76 ✅ |    7.28 ✅ |   11.05 ✅ |    6.11 ✅ |    5.00 ✅ |

Gate values: ≤ 40.00 for N=100 (small-N sanity), ≤ 27.88 for N ≥ 1000 (α=0.001, df=9).

## Reproducer

```
cargo test --release --test faza74_chi_squared_sizes -- --nocapture
node scripts/chi-squared-sizes-report.mjs   # regenerates this report
```

Seed is fixed (`0xDEAD_BEEF_CAFE_F00D`) so every audit run produces bit-identical numbers.
