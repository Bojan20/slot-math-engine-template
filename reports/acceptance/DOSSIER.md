# Acceptance Dossier — ±0.001% RTP precision

> Generated: 2026-05-14T23:39:49.019Z
> Golden snapshot: `/Users/vanvinklstudio/Projects/slot-math-engine-template/reports/acceptance/golden.json` (20,000 spins)
> Target: ±0.00001 @ 99.00% confidence
> Variance source: fallback

## Summary

| Metric | Value |
|---|---|
| Overall | **too_few_spins** |
| Converged | 0/30 |
| Warned (too-few / not-converged) | 30 |
| Failed (diverged) | 0 |
| Worst \|Δ\| | 0.000e+0 |
| Worst CI half-width | 4.618e+5 |
| Max required spins | 42,654,268,891,372,150,000,000,000 |
| Σ required spins | 42,721,359,850,782,246,000,000,000 |

## Per-fixture verdicts

| Fixture | Verdict | observed-RTP | ref-RTP | Δ | CI hw | σ² | required-N | source |
|---|---|---|---|---|---|---|---|---|
| `3x5-5lines` | too_few_spins | 0.977920 | 0.977920 | 0.00e+0 | 3.84e-1 | 444.2814 | 29,476,941,526,917 | fallback_from_maxWinX |
| `5x3-20lines` | too_few_spins | 4.227480 | 4.227480 | 0.00e+0 | 3.81e+0 | 43704.1574 | 2,899,659,679,990,752 | fallback_from_maxWinX |
| `5x3-243ways` | too_few_spins | 304.675015 | 304.675015 | 0.00e+0 | 5.59e+2 | 941458522.2339 | 62,463,378,256,323,340,000 | fallback_from_maxWinX |
| `5x4-25lines` | too_few_spins | 29.664330 | 29.664330 | 0.00e+0 | 1.46e+1 | 644619.7899 | 42,768,883,403,332,744 | fallback_from_maxWinX |
| `6x4-4096ways` | too_few_spins | 14447.269285 | 14447.269285 | 0.00e+0 | 1.07e+4 | 344359349400.4193 | 22,847,366,920,276,684,000,000 | fallback_from_maxWinX |
| `cascade-drop` | too_few_spins | 11.809285 | 11.809285 | 0.00e+0 | 8.78e+0 | 232168.3320 | 15,403,778,285,022,318 | fallback_from_maxWinX |
| `cascade-fixed-strip` | too_few_spins | 4.420565 | 4.420565 | 0.00e+0 | 1.65e+0 | 8210.3852 | 544,738,174,264,288 | fallback_from_maxWinX |
| `cascade-refill` | too_few_spins | 2227.660920 | 2227.660920 | 0.00e+0 | 1.67e+3 | 8425523141.7087 | 559,012,029,291,712,000,000 | fallback_from_maxWinX |
| `classic-3x3-lines` | too_few_spins | 0.560550 | 0.560550 | 0.00e+0 | 2.29e-1 | 157.6225 | 10,457,854,982,734 | fallback_from_maxWinX |
| `cluster-7x7` | too_few_spins | 28.383775 | 28.383775 | 0.00e+0 | 2.34e+0 | 16463.8359 | 1,092,333,632,836,501 | fallback_from_maxWinX |
| `cluster-diagonal` | too_few_spins | 1.650200 | 1.650200 | 0.00e+0 | 4.25e-1 | 545.0407 | 36,162,063,076,701 | fallback_from_maxWinX |
| `cluster-hexagonal` | too_few_spins | 33.171495 | 33.171495 | 0.00e+0 | 3.91e+0 | 46097.0789 | 3,058,423,930,086,005 | fallback_from_maxWinX |
| `complex-variable-rows` | too_few_spins | 533331.147130 | 533331.147130 | 0.00e+0 | 4.62e+5 | 642892300711805.0000 | 42,654,268,891,372,150,000,000,000 | fallback_from_maxWinX |
| `expanding-wilds` | too_few_spins | 11602.932630 | 11602.932630 | 0.00e+0 | 2.79e+3 | 23546612341.4289 | 1,562,257,835,690,655,700,000 | fallback_from_maxWinX |
| `fs-expanding-wilds` | too_few_spins | 3.294005 | 3.294005 | 0.00e+0 | 1.36e+0 | 5559.0556 | 368,829,200,040,726 | fallback_from_maxWinX |
| `fs-multiplier-ladder` | too_few_spins | 7.709970 | 7.709970 | 0.00e+0 | 8.43e+0 | 214266.8818 | 14,216,062,601,253,908 | fallback_from_maxWinX |
| `fs-retrigger` | too_few_spins | 3.540555 | 3.540555 | 0.00e+0 | 1.51e+0 | 6880.6173 | 456,511,458,350,095 | fallback_from_maxWinX |
| `fs-sticky-wilds` | too_few_spins | 2.280520 | 2.280520 | 0.00e+0 | 1.52e+0 | 6999.1299 | 464,374,468,748,404 | fallback_from_maxWinX |
| `hnw-classic` | too_few_spins | 1.584665 | 1.584665 | 0.00e+0 | 7.38e-1 | 1642.0631 | 108,946,710,291,060 | fallback_from_maxWinX |
| `hnw-full-grid` | too_few_spins | 3.278570 | 3.278570 | 0.00e+0 | 2.05e+0 | 12701.2772 | 842,697,435,829,725 | fallback_from_maxWinX |
| `hnw-grand-jackpot` | too_few_spins | 189.519695 | 189.519695 | 0.00e+0 | 5.69e+1 | 9748991.2728 | 646,820,773,414,103,700 | fallback_from_maxWinX |
| `multiplier-wilds` | too_few_spins | 1.598160 | 1.598160 | 0.00e+0 | 8.43e-1 | 2141.9934 | 142,115,811,647,246 | fallback_from_maxWinX |
| `mystery-symbol` | too_few_spins | 5.285420 | 5.285420 | 0.00e+0 | 4.63e+0 | 64521.6829 | 4,280,849,543,425,350 | fallback_from_maxWinX |
| `pay-anywhere` | too_few_spins | 246.289805 | 246.289805 | 0.00e+0 | 5.99e+1 | 10812983.9385 | 717,413,980,416,245,200 | fallback_from_maxWinX |
| `pick-bonus` | too_few_spins | 3.196600 | 3.196600 | 0.00e+0 | 8.21e-1 | 2032.8684 | 134,875,646,975,966 | fallback_from_maxWinX |
| `respin-feature` | too_few_spins | 2.739274 | 2.739274 | 0.00e+0 | 1.60e+0 | 7678.3921 | 509,441,782,363,714 | fallback_from_maxWinX |
| `symbol-upgrade` | too_few_spins | 313.528860 | 313.528860 | 0.00e+0 | 2.00e+2 | 120970536.7879 | 8,026,087,415,221,419,000 | fallback_from_maxWinX |
| `variable-rows-7reels` | too_few_spins | 21545.993010 | 21545.993010 | 0.00e+0 | 1.45e+4 | 633789054013.7632 | 42,050,291,627,975,380,000,000 | fallback_from_maxWinX |
| `walking-wilds` | too_few_spins | 4.541775 | 4.541775 | 0.00e+0 | 2.53e+0 | 19241.9448 | 1,276,654,091,861,115 | fallback_from_maxWinX |
| `wheel-bonus` | too_few_spins | 59.289580 | 59.289580 | 0.00e+0 | 2.11e+1 | 1336165.2255 | 88,651,164,044,473,000 | fallback_from_maxWinX |

## Interpretation

- `converged` — sample reached precision target at configured confidence.
- `too_few_spins` — sample needs more spins (run `acceptance-golden.mjs` with bigger N).
- `not_converged` — sample met N, but CI still > target (variance under-counted; rerun with `--variance-map`).
- `diverged_from_reference` — sample provably outside ±precision band (real bug — investigate).
