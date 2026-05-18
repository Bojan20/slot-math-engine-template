# BONUS_BANK_RUNNING_BALANCE_OFFSET — Bonus Bank Running-Balance Offset Aggregator Acceptance (W191, 72. solver, L&W M10 P0 GAP CLOSURE)

Generated: `2026-05-18T01:26:22.353Z`

**6/6 configs PASS** @ 30000 MC bonus-sessions each.

Closes L&W M10 P0 GAP — Barcrest Rainbow Riches Megaways Bonus Bank + future banking-mode flagships.

## Method

Per-spin bucketed aggregation sa player-elected banking mode:
  - **Mode A "bank_off_wins"**: T_A = Σ W_k, E[T_A] = N·μ_W
  - **Mode B "bank_all_wins"**: T_B = m_B·Σ W_k, E[T_B] = m_B·N·μ_W
  - **Mode C "bank_small_wins"**: T_C = Σ Z_k where Z = W·(1+(m_S−1)·𝟙{W≤τ})
  - **E[Z]** = p·m_S·μ_low + (1−p)·μ_high
  - **Var[Z]** = E[Z²] − E[Z]², via per-bucket conditional moments
  - **bonusBankAdditiveOffsetB** = (m_B−1)·N·μ_W

## Configs
| Config | Pass | N / p_L / m_B / m_S | E[T_A] CF/MC | E[T_B] CF/MC | E[T_C] CF/MC | best | skill+ | uplift_B× |
|---|---|---|---|---|---|---|---|---|
| A_rainbow_riches_megaways_bank_all_wins | ✅ | 15/0.65/1.25/2 | 32.10/32.11 | 40.13/40.14 | 37.95/37.97 | B_all | 3.40 | 1.25 |
| B_rainbow_riches_bank_small_wins_high_freq | ✅ | 20/0.8/1.1/3 | 30.40/30.31 | 33.44/33.35 | 43.20/43.13 | C_small | 7.52 | 1.10 |
| C_barcrest_balanced_three_mode | ✅ | 12/0.55/1.15/2 | 24.18/24.21 | 27.81/27.84 | 29.46/29.50 | C_small | 2.31 | 1.15 |
| D_long_fs_low_freq_small_bucket | ✅ | 30/0.35/1.5/2.5 | 166.50/166.26 | 249.75/249.39 | 182.25/182.06 | B_all | 50.25 | 1.50 |
| E_corner_p_low_1_all_small_bucket | ✅ | 10/1/1.2/2.5 | 15.00/15.01 | 18.00/18.01 | 37.50/37.53 | C_small | 14.00 | 1.20 |
| F_corner_p_low_0_all_high_bucket | ✅ | 10/0/1.3/5 | 40.00/40.04 | 52.00/52.05 | 40.00/40.04 | B_all | 8.00 | 1.30 |

## Compliance: UKGC RTS-12 player-elected mode RTP / UKGC RTS-14 Bonus Bank transparency / MGA PPD §11 / eCOGRA / EU GA 2024.

Industry: LNW Barcrest Rainbow Riches Megaways Bonus Bank + Barcrest banking-mode variants + future L&W flagship.