# STACKED_MULTI_WHEEL_COMPOSITION — Stacked Multi-Wheel Composition Aggregator Acceptance (W196, 77. solver, L&W M6 P1 FINAL GAP CLOSURE — 16/16 L&W GAPS 🏆)

Generated: `2026-05-18T02:12:12.345Z`

**6/6 configs PASS** @ 100000 MC spins each.

🏆 **Closes 16th and FINAL L&W KIMI gap** — Bally Triple Cash Wheel + Quick Hit Cash Wheel + Cash Wheel Quick Hit family.

## Method

Independent multi-wheel sum sa per-slice joint disclosure:
  - N wheels, per wheel discrete PMF over M_i slices
  - **E[Y] = Σ μ_i** (linearity)
  - **Var[Y] = Σ σ²_i** (independence)
  - **probabilityAllTopSlice = Π p_{i,top}** (grand jackpot)
  - **probabilityAtLeastOneTopSlice = 1 − Π (1−p_{i,top})**
  - perWheel.contributionToTotalRtp + varianceContribution + topSlice disclosure
  - independenceVarianceRatio = σ_Y / Σ σ_i (< 1 for independent, = 1 for correlated)

## Configs
| Config | Pass | N | E[Y] CF/MC | P(all top) CF/MC | uplift× | ind ratio |
|---|---|---|---|---|---|---|
| A_bally_triple_cash_wheel_3_stacked | ✅ | 3 | 42.050/41.816 | 0.0125%/0.0140% | 1.86 | 0.65 |
| B_quick_hit_cash_wheel_2_wheel_composition | ✅ | 2 | 75.850/75.309 | 0.2500%/0.2460% | 1.03 | 0.99 |
| C_cash_wheel_quick_hit_3_tier_balanced | ✅ | 3 | 87.950/87.479 | 0.0125%/0.0140% | 2.08 | 0.62 |
| D_high_freq_2_wheel_simple | ✅ | 2 | 7.550/7.556 | 18.0000%/17.9740% | 1.74 | 0.71 |
| E_corner_2_wheel_binary_minimum | ✅ | 2 | 11.000/11.011 | 25.0000%/25.0590% | 2.00 | 0.71 |
| F_corner_5_wheel_long_field | ✅ | 5 | 110.550/111.382 | 0.0000%/0.0000% | 1.92 | 0.62 |

## Compliance: UKGC RTS-14 mandatory per-wheel RTP / UKGC RTS-3 joint top-slice probability / MGA PPD §11 multi-wheel transparency / eCOGRA / EU GA 2024.

Industry: LNW Bally Triple Cash Wheel (2022 defining) + Quick Hit Cash Wheel (2014) + Cash Wheel Quick Hit (2014) + future L&W multi-wheel flagships.

🏆 **W196 MILESTONE: 16/16 L&W KIMI gaps CLOSED — ALL P0 + ALL P1 + M-codes complete.** Engine now ships full L&W mehanika coverage 100%.