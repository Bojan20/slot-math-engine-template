# EXACT_ENUMERATION — Analytical Base-Game RTP Ground Truth

Generated: `2026-05-16T03:16:07.533Z`

## Headline

**3/3 fixtures: EXACT analytical RTP matches MC at 2M spins**.

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
| classic-3x3-lines | 0.519166 | 0.519508 | 0.066% | ✅ |
| 3x5-5lines | 0.698061 | 0.697660 | 0.057% | ✅ |
| 5x3-20lines | 1.446976 | 1.446906 | 0.005% | ✅ |

## Operator / auditor usage

Quote EXACT column as engine's **certified base-game RTP** for the fixture.
No statistical hedging needed — it's a closed-form sum, deterministic at compile time.