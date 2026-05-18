# MID_SPIN_REEL_RESHAPE_MIXTURE — Mid-Spin Random Reel-Reshape Mixture Aggregator Acceptance (W195, 76. solver, L&W M13 P1 GAP CLOSURE)

Generated: `2026-05-18T02:03:46.521Z`

**6/6 configs PASS** @ 100000 MC spins each.

Closes L&W M13 P1 GAP — WMS Wizard of Oz Follow the Yellow Brick Road (Glinda reshape, 2017 defining title) + Munchkinland reshape variants + future L&W reshape-mechanic flagships.

## Method

K-component reel-set mixture distribution:
  - K ~ Categorical(p_0..p_{K-1}), Σ p_k = 1
  - Per-set X_k ~ iid sa distinct (μ_k, σ²_k) paytable
  - **E[Y] = Σ p_k · μ_k** mixture mean
  - **E[Y²] = Σ p_k · (σ²_k + μ²_k)**
  - **Var[Y] = E[Y²] − E[Y]²** mixture variance
  - **Var[Y] = E[Var[Y|K]] + Var[E[Y|K]]** (within + between decomposition)
  - reshapeProbability = 1 − p_0
  - commercialUpliftVsBaseOnly = E[Y] / μ_base

## Configs
| Config | Pass | K | E[Y] CF/MC | reshape CF/MC | best (uplift×) | within share |
|---|---|---|---|---|---|---|
| A_wizard_of_oz_ybr_glinda_3_set | ✅ | 3 | 1.610/1.606 | 12.0%/11.9% | glinda_emerald_jackpot (1.75×) | 90.1% |
| B_wizard_of_oz_munchkinland_reshape_2_set | ✅ | 2 | 1.354/1.344 | 8.0%/7.9% | munchkin_bonus (1.43×) | 94.5% |
| C_lw_diverse_5_set_reshape_menu | ✅ | 5 | 2.575/2.598 | 30.0%/30.0% | tier_jackpot (2.58×) | 88.2% |
| D_high_freq_reshape_low_jackpot | ✅ | 2 | 1.135/1.122 | 30.0%/30.0% | reshape_med (1.34×) | 99.0% |
| E_corner_p_reshape_zero_only_base | ✅ | 2 | 1.000/0.991 | 0.0%/0.0% | reshape_1 (1.00×) | 100.0% |
| F_corner_rare_jackpot_reshape_1_in_500 | ✅ | 2 | 1.148/1.137 | 0.2%/0.2% | jackpot (1.21×) | 52.9% |

## Compliance: UKGC RTS-14 mandatory per-reel-set RTP disclosure / MGA PPD §11 stochastic reshape transparency / eCOGRA per-reel-set paytable audit / EU GA 2024.

Industry: LNW WMS Wizard of Oz Follow the Yellow Brick Road + Munchkinland reshape + future L&W reshape-mechanic flagships.