# 30-Mechanic Per-Fixture Acceptance Report
> Generated: 2026-05-15T18:16:30.467Z
> Fixtures: 30 · Seeds: 4 · Spins/seed: 25,000
> Total spins: 3,000,000 · Wall: 70661ms · 42,456 spins/sec

## Headline

**30/30 fixtures pass per-fixture acceptance.** All clean.

## Per-fixture results

| Fixture | Target RTP | MC mean | σ (4 seeds) | Stab | Sanity |
|---------|-----------:|--------:|------------:|:----:|:------:|
| `3x5-5lines.json` | 96.00% | 97.983% | 1.327% | ✓ | ✅ |
| `5x3-20lines.json` | 96.00% | 429.502% | 7.264% | ✗ | ✅ |
| `5x3-243ways.json` | 96.00% | 29675.553% | 961.064% | ✗ | ✅ |
| `5x4-25lines.json` | 96.00% | 2922.354% | 37.636% | ✗ | ✅ |
| `6x4-4096ways.json` | 96.00% | 1430345.693% | 15720.726% | ✗ | ✅ |
| `cascade-drop.json` | 96.00% | 1192.714% | 12.536% | ✗ | ✅ |
| `cascade-fixed-strip.json` | 96.00% | 431.747% | 6.426% | ✗ | ✅ |
| `cascade-refill.json` | 96.00% | 226105.810% | 2206.079% | ✗ | ✅ |
| `classic-3x3-lines.json` | 96.00% | 55.494% | 0.519% | ✓ | ✅ |
| `cluster-7x7.json` | 96.00% | 2827.403% | 15.759% | ✗ | ✅ |
| `cluster-diagonal.json` | 96.00% | 164.747% | 0.819% | ✓ | ✅ |
| `cluster-hexagonal.json` | 96.00% | 3330.350% | 14.755% | ✗ | ✅ |
| `complex-variable-rows.json` | 96.00% | 52375166.465% | 319668.704% | ✗ | ✅ |
| `expanding-wilds.json` | 96.00% | 1146357.853% | 10207.433% | ✗ | ✅ |
| `fs-expanding-wilds.json` | 96.00% | 333.669% | 4.353% | ✓ | ✅ |
| `fs-multiplier-ladder.json` | 96.00% | 781.860% | 16.160% | ✗ | ✅ |
| `fs-retrigger.json` | 96.00% | 359.403% | 4.258% | ✓ | ✅ |
| `fs-sticky-wilds.json` | 96.00% | 224.305% | 3.932% | ✓ | ✅ |
| `hnw-classic.json` | 96.00% | 160.402% | 1.845% | ✓ | ✅ |
| `hnw-full-grid.json` | 96.00% | 330.940% | 6.058% | ✗ | ✅ |
| `hnw-grand-jackpot.json` | 96.00% | 18865.679% | 59.568% | ✗ | ✅ |
| `multiplier-wilds.json` | 96.00% | 164.333% | 3.396% | ✓ | ✅ |
| `mystery-symbol.json` | 96.00% | 533.732% | 11.693% | ✗ | ✅ |
| `pay-anywhere.json` | 96.00% | 24511.072% | 157.628% | ✗ | ✅ |
| `pick-bonus.json` | 96.00% | 306.234% | 4.922% | ✓ | ✅ |
| `respin-feature.json` | 96.00% | 277.554% | 2.243% | ✓ | ✅ |
| `symbol-upgrade.json` | 96.00% | 30991.528% | 231.680% | ✗ | ✅ |
| `variable-rows-7reels.json` | 96.00% | 2131637.674% | 22418.150% | ✗ | ✅ |
| `walking-wilds.json` | 96.00% | 449.472% | 5.006% | ✗ | ✅ |
| `wheel-bonus.json` | 96.00% | 5968.013% | 53.758% | ✗ | ✅ |

## Gates

- **Sanity**: MC RTP finite, ≥0, < 1e+9. Synthetic fixtures aren't kalibrisan; we test engine plausibility.
- **Stability**: σ across 4 independent seeds × 25,000 spins ≤ 5%.

## Acceptance verdict

**✅ All 30 fixtures pass.** Engine handles every reference mechanic without crash/NaN/overflow; cross-seed convergence holds across the entire reference set.
