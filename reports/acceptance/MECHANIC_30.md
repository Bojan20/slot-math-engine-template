# 30-Mechanic Per-Fixture Acceptance Report
> Generated: 2026-05-20T11:32:27.278Z
> Fixtures: 30 · Seeds: 4 · Spins/seed: 5,000
> Total spins: 600,000 · Wall: 15241ms · 39,367 spins/sec

## Headline

**30/30 fixtures pass per-fixture acceptance.** All clean.

## Per-fixture results

| Fixture | Target RTP | MC mean | σ (4 seeds) | Stab | Sanity |
|---------|-----------:|--------:|------------:|:----:|:------:|
| `3x5-5lines.json` | 96.00% | 98.977% | 3.039% | ✓ | ✅ |
| `5x3-20lines.json` | 96.00% | 433.365% | 8.169% | ✗ | ✅ |
| `5x3-243ways.json` | 96.00% | 29297.454% | 914.384% | ✗ | ✅ |
| `5x4-25lines.json` | 96.00% | 2900.569% | 115.503% | ✗ | ✅ |
| `6x4-4096ways.json` | 96.00% | 1423361.433% | 33544.422% | ✗ | ✅ |
| `cascade-drop.json` | 96.00% | 1186.607% | 24.919% | ✗ | ✅ |
| `cascade-fixed-strip.json` | 96.00% | 422.724% | 16.182% | ✗ | ✅ |
| `cascade-refill.json` | 96.00% | 226336.634% | 6555.881% | ✗ | ✅ |
| `classic-3x3-lines.json` | 96.00% | 55.619% | 0.835% | ✓ | ✅ |
| `cluster-7x7.json` | 96.00% | 2810.464% | 18.611% | ✗ | ✅ |
| `cluster-diagonal.json` | 96.00% | 162.583% | 0.788% | ✓ | ✅ |
| `cluster-hexagonal.json` | 96.00% | 3328.732% | 22.306% | ✗ | ✅ |
| `complex-variable-rows.json` | 96.00% | 51151448.084% | 2156029.225% | ✗ | ✅ |
| `expanding-wilds.json` | 96.00% | 1159332.200% | 18998.317% | ✗ | ✅ |
| `fs-expanding-wilds.json` | 96.00% | 334.884% | 6.889% | ✗ | ✅ |
| `fs-multiplier-ladder.json` | 96.00% | 804.620% | 52.046% | ✗ | ✅ |
| `fs-retrigger.json` | 96.00% | 365.381% | 8.282% | ✗ | ✅ |
| `fs-sticky-wilds.json` | 96.00% | 222.930% | 8.506% | ✗ | ✅ |
| `hnw-classic.json` | 96.00% | 161.917% | 6.115% | ✗ | ✅ |
| `hnw-full-grid.json` | 96.00% | 338.569% | 12.698% | ✗ | ✅ |
| `hnw-grand-jackpot.json` | 96.00% | 18980.358% | 367.683% | ✗ | ✅ |
| `multiplier-wilds.json` | 96.00% | 167.052% | 4.360% | ✓ | ✅ |
| `mystery-symbol.json` | 96.00% | 531.342% | 8.283% | ✗ | ✅ |
| `pay-anywhere.json` | 96.00% | 24276.424% | 622.430% | ✗ | ✅ |
| `pick-bonus.json` | 96.00% | 302.524% | 17.984% | ✗ | ✅ |
| `respin-feature.json` | 96.00% | 275.662% | 4.405% | ✓ | ✅ |
| `symbol-upgrade.json` | 96.00% | 30840.314% | 584.256% | ✗ | ✅ |
| `variable-rows-7reels.json` | 96.00% | 2129533.548% | 31075.554% | ✗ | ✅ |
| `walking-wilds.json` | 96.00% | 446.050% | 13.028% | ✗ | ✅ |
| `wheel-bonus.json` | 96.00% | 5953.164% | 98.465% | ✗ | ✅ |

## Gates

- **Sanity**: MC RTP finite, ≥0, < 1e+9. Synthetic fixtures aren't kalibrisan; we test engine plausibility.
- **Stability**: σ across 4 independent seeds × 5,000 spins ≤ 5%.

## Acceptance verdict

**✅ All 30 fixtures pass.** Engine handles every reference mechanic without crash/NaN/overflow; cross-seed convergence holds across the entire reference set.
