# EXACT_ENUMERATION — Analytical Base-Game RTP Ground Truth

Generated: `2026-05-16T03:35:24.502Z`

## Headline

**11/11 fixtures: EXACT analytical RTP matches MC at 2M spins**.

Computed by direct enumeration of per-line cell-symbol combinations weighted by per-cell PMF.
Exact within IEEE 754 floating-point precision. Auditor pins these as **ground truth** —
not statistical estimates.

## Method

For each payline, cells are independently drawn from per-column weighted PMF.
Expected payout per line = Σ over (s_0,…,s_{N−1}) ∈ Symbols^N of (Π_i P(cell_i=s_i)) × line_payout(combo).
Total RTP = Σ over paylines (linearity of expectation, even with shared cells).

## Scope

Tractable for: weighted-mode reels (per-cell iid), lines evaluator, min_match ≥ 2.
Excluded: cascade/FS/H&W features (their MC contribution accounted separately).
Fixtures verified: small lines-only fixtures (3-5 cells per line, ≤ 7 symbol classes).

## Results

| Fixture | EXACT RTP | MC RTP (2M spins) | rel err | Pass |
|---|---|---|---|---|
| classic-3x3-lines | 0.519166 | 0.520052 | 0.171% | ✅ |
| 3x5-5lines | 0.698061 | 0.697101 | 0.138% | ✅ |
| 5x3-20lines | 3.195128 | 3.196102 | 0.030% | ✅ |
| 5x4-25lines | 8.435580 | 8.433346 | 0.026% | ✅ |
| fs-multiplier-ladder | 2.371357 | 2.366659 | 0.198% | ✅ |
| fs-retrigger | 2.371357 | 2.366659 | 0.198% | ✅ |
| fs-sticky-wilds | 1.687116 | 1.688497 | 0.082% | ✅ |
| fs-expanding-wilds | 2.371357 | 2.366659 | 0.198% | ✅ |
| hnw-classic | 1.561553 | 1.562581 | 0.066% | ✅ |
| multiplier-wilds | 1.288974 | 1.287429 | 0.120% | ✅ |
| pick-bonus | 1.561553 | 1.562581 | 0.066% | ✅ |

## Operator / auditor usage

Quote EXACT column as engine's **certified base-game RTP** for the fixture.
No statistical hedging needed — it's a closed-form sum, deterministic at compile time.