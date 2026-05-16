# CRASH_MULTIPLIER — Crash-style multiplier-only Acceptance

Generated: `2026-05-16T02:38:07.805Z`

## Headline

**6/6 strategies PASS** at 1000000 MC spins each.

Closes Faza 12 scenario: ⚠️→✅ "Crash-style multiplier-only (non-reel) corner case".

## Key theorem (closed-form)

For house edge HE = 0.01, RTP = 1 − HE = 0.99 **regardless of cash-out target M**
(within `maxMultiplier` = 10000). Verified across 6 strategies — all CF RTPs equal:

- RTP invariance: max spread across strategies = 1.11e-16 ≈ 0
- mean RTP = 0.990000 ≈ 1 − HE = 0.99

## House statistics

- Median bust multiplier = 1.9800
- E[B_truncated] = 9.13× (within cap)
- P(bust < 2×) = 50.50%
- P(bust < 10×) = 90.10%
- P(bust < 100×) = 99.01%
- P(reach cap = 10000×) = 0.009900%

## Per-strategy results

| Strategy | Target M | CF RTP | MC RTP | rel | hit CF | hit MC | σ/μ |
|---|---|---|---|---|---|---|---|
| A_target_2x | 2× | 0.99000 | 0.99059 | 0.06% | 0.49500 | 0.49530 | 1.01 |
| B_target_5x | 5× | 0.99000 | 0.99057 | 0.06% | 0.19800 | 0.19812 | 2.01 |
| C_target_10x | 10× | 0.99000 | 0.99423 | 0.43% | 0.09900 | 0.09942 | 3.02 |
| D_target_50x | 50× | 0.99000 | 0.99710 | 0.72% | 0.01980 | 0.01994 | 7.04 |
| E_target_500x | 500× | 0.99000 | 0.98500 | 0.51% | 0.00198 | 0.00197 | 22.45 |
| F_target_5000x | 5000× | 0.99000 | 1.02000 | 3.03% | 0.00020 | 0.00020 | 71.06 |

## Industry context

- UKGC SI 2025/215 §2(g) — explicitly includes multiplier games in slot-style classifications
- Cabot & Hannum 2002 ch. 12 — Practical Casino Math instant games reference
- Truncated Pareto distribution α=1, x_m=(1−HE), cap=M_max