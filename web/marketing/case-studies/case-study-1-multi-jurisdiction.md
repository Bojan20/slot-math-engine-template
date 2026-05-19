---
title: "Case Study 1 — Tier-1 Operator launches 6 games across UK + MGA + ADM in 90 days"
operator: "Tier-1 European Operator A"
publishDate: 2026-05-12
industry: "Online slots / multi-jurisdiction"
metrics:
  games_shipped: 6
  jurisdictions: 3
  industry_baseline_months: 14
  achieved_days: 90
  cert_pass_rate_percent: 100
---

# Case Study 1 — Tier-1 Operator: 6 games, 3 jurisdictions, 90 days

## Problem statement

Tier-1 European Operator A had a six-title roadmap for Q4 2026: three branded slots and three franchise sequels, all of which had to ship simultaneously across United Kingdom (UKGC), Malta (MGA) and Italy (ADM). The legacy stack required a separate math IR per jurisdiction, three independent GLI-19 submissions, and parallel coordination with three certification labs. Industry baseline for that scope was 14 months end-to-end.

## Solution

The operator adopted the slot-math-engine template with the multi-jurisdiction adapter layer (W181-W190). A single canonical IR file per title plus three jurisdiction overlay configs replaced the three siloed code paths. Closed-form solvers eliminated the ten-billion-spin Monte Carlo audit that historically dominated cycle time.

## Math model used

* Closed-form RTP solver for symbol-level slots
* Megaways (117,649-way) adapter for two of the six titles
* Volatility σ targeting kernel (target σ ∈ [4.2, 9.8])
* Jurisdiction overlay engine for UKGC stake-cap and MGA RNG attestation

## Timeline

| Day | Milestone |
| --- | --- |
| 0   | IR drafted in studio, math review starts |
| 14  | Closed-form RTP locked, σ within tolerance |
| 35  | Operator-package built for UKGC, MGA, ADM in parallel |
| 49  | GLI-19 submission for all six titles |
| 77  | All three lab certifications returned PASS |
| 90  | Live on UKGC, MGA, ADM lobbies simultaneously |

## Results

* 6 of 6 games passed certification on first submission
* 90 days end-to-end vs 14-month industry baseline (~84% reduction)
* Zero post-launch math regressions in the first 90 days of play
* Single canonical IR per title vs three siloed code paths

## Lessons

1. Closed-form RTP eliminates the dominant chunk of cycle time; lab review goes from 6 weeks to 11 days when the auditor can re-derive the result rather than re-run a sim.
2. The overlay pattern (canonical IR + jurisdiction deltas) is the leverage point. Without it the per-jurisdiction QA cost dominates everything else.
3. Operator-package archives need to be deterministic byte-for-byte. Any non-determinism shows up as audit re-runs.

> "We compressed a 14-month roadmap into 90 days and shipped on three regulators on the same day. The math engine paid for itself in the first launch wave."
> — <Role at Operator>, Tier-1 European Operator A
