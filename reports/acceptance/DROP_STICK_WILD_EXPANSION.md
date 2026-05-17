# DROP_STICK_WILD_EXPANSION — Drop-and-Stick Wild Expansion Analyzer Acceptance

Generated: `2026-05-17T10:12:02.093Z`

## Headline

**6/6 configs PASS** at 2000 MC episodes each = 12.0K total grid-walk simulations.

Closes Faza 12 ext (post-W100): ✅ "Drop-and-Stick Wild Expansion Analyzer" (Wave 169 — 56th solver, per-cell sticky accumulation).

## Method

Closed-form per-cell geometric saturation:
  - perCellActiveSteady = 1 − (1−q)^S
  - E[W_∞] = N·M · perCellSteady
  - Var = N·M · p · (1−p)
  - gridFillProb = perCellSteady^(N·M)

MC: 2K episodes per config, per-cell remaining-stick counter, mulberry32 RNG.

## Configs — operator wild-mechanic disclosure table

| Config | Pass | Grid | q | S | E[W_∞] CF/MC | stdDev CF/MC | fill % | gridFill P |
|---|---|---|---|---|---|---|---|---|
| A_netent_witchcraft_3x5_S5 | ✅ | 3×5 | 0.08 | 5 | 5.11/5.12 | 1.84/1.83 | 34.1% | 0.000% |
| B_pragmatic_wild_west_gold_6x5_S10 | ✅ | 5×6 | 0.05 | 10 | 12.04/12.07 | 2.68/2.76 | 40.1% | 0.000% |
| C_hacksaw_tombstone_5x5_S3_high_q | ✅ | 5×5 | 0.15 | 3 | 9.65/9.71 | 2.43/2.42 | 38.6% | 0.000% |
| D_push_mount_magmas_4x5_S8 | ✅ | 4×5 | 0.06 | 8 | 7.81/7.83 | 2.18/2.18 | 39.0% | 0.000% |
| E_corner_small_grid_high_fill | ✅ | 2×2 | 0.3 | 5 | 3.33/3.33 | 0.75/0.76 | 83.2% | 47.901% |
| F_corner_large_grid_low_freq | ✅ | 7×7 | 0.02 | 4 | 3.80/3.83 | 1.87/1.87 | 7.8% | 0.000% |

## Compliance context

- **UKGC RTS 14** — wild mechanic disclosure (operator must display sticky-wild rate)
- **MGA PPD §11** — sticky feature transparency (per-cell active prob disclosed)
- **eCOGRA Generic Slots Audit** — sticky-wild auditor verification

Industry use: NetEnt Witchcraft Academy spreading sticky wilds, Pragmatic Wild West Gold
money wilds, Hacksaw Tombstone skull wilds, Pragmatic Gates of Olympus 1000 multiplier wilds.