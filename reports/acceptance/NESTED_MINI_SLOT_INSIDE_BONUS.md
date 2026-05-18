# NESTED_MINI_SLOT_INSIDE_BONUS — Nested Mini-Slot Inside Bonus Compositional Aggregator Acceptance (W190, 71. solver, L&W M14 P1 GAP CLOSURE)

Generated: `2026-05-18T01:13:14.065Z`

**6/6 configs PASS** @ 50000 MC parent-spins each.

Closes L&W M14 GAP — LOTR Two Towers + Return of the King + Star Trek.

## Method

Hierarchical composition sa law of total variance:
  - **E[Z per outer] = μ_O + p_N · N_I · μ_I**
  - **Var[Z]** = σ²_O + p_N·N_I·σ²_I + p_N(1-p_N)·(N_I·μ_I)²
  - **E[B | bonus] = K_O · E[Z]**
  - **E[Y/parent spin] = p_B · E[B]**
  - **Var[Y]** = p_B·Var[B] + p_B(1-p_B)·E[B]²

## Configs
| Config | Pass | p_B/K_O/p_N/N_I | E[Y] CF/MC | E[B|trig] CF/MC | nested share | uplift× |
|---|---|---|---|---|---|---|
| A_lotr_two_towers_tower_spin_nested | ✅ | 0.02/10/0.15/5 | 1.600/1.622 | 80.0/79.6 | 75.0% | 4.00 |
| B_lotr_return_of_the_king_extended | ✅ | 0.015/12/0.2/4 | 1.890/1.997 | 126.0/124.2 | 76.2% | 4.20 |
| C_star_trek_trek_through_stars | ✅ | 0.03/6/0.25/3 | 1.269/1.256 | 42.3/42.0 | 74.5% | 3.92 |
| D_high_freq_low_payout_nested | ✅ | 0.1/5/0.3/2 | 1.650/1.639 | 16.5/16.4 | 54.5% | 2.20 |
| E_corner_p_nested_1_always_triggers | ✅ | 0.05/4/1/2 | 2.400/2.420 | 48.0/47.9 | 83.3% | 6.00 |
| F_corner_K_outer_1_single_outer_spin | ✅ | 0.08/1/0.3/3 | 1.376/1.310 | 17.2/16.8 | 41.9% | 1.72 |

## Compliance: UKGC RTS-14 nested-feature compositional / MGA PPD §11 / eCOGRA / EU GA 2024.

Industry: LOTR Two Towers + Return of the King + Star Trek variants.