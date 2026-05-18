# MULTI_POT_BRANCHED_HOLD_SPIN_SUB_FEATURE — Multi-Pot Branched H&S Sub-Feature Selection Aggregator Acceptance (W193, 74. solver, L&W M15 P1 GAP CLOSURE)

Generated: `2026-05-18T01:45:21.546Z`

**6/6 configs PASS** @ 100000 MC spins each.

Closes L&W M15 P1 GAP — Bally Rich Little Piggies Piggy Bankin' Break In + World Class + Hens.

## Method

Trigger-gated categorical sub-mode mixture:
  - **T ~ Bernoulli(p_trigger), K ~ Categorical(p_1..p_M) given T=1**
  - **E[V|trig] = Σ p_k · μ_k** (mixture mean)
  - **Var[V|trig] = Σ p_k·(σ²_k+μ²_k) − (E[V|trig])²** (mixture variance)
  - **E[Y/spin] = p_trigger · E[V|trig]**
  - **Var[Y/spin]** via law of total variance on trigger
  - perPot.contributionShareOfBonus = p_k·μ_k / E[V|trig]
  - mixtureVarianceLift = Var[V|trig] / Σ p_k·σ²_k (cross-pot diversity)

## Configs
| Config | Pass | p_T / M | E[Y] CF/MC | E[V|trig] CF/MC | best pot (share) | mixVarLift | CoV |
|---|---|---|---|---|---|---|---|
| A_piggy_bankin_break_in_3_pot | ✅ | 0.04/3 | 2.660/2.756 | 66.5/67.5 | repeat_win(54.1%) | 16.83 | 0.91 |
| B_rich_piggies_world_class_4_tier_jackpot | ✅ | 0.03/4 | 10.950/11.075 | 365.0/361.8 | grand(68.5%) | 90.66 | 2.96 |
| C_rich_hens_world_class_hen_variant | ✅ | 0.035/3 | 5.390/5.490 | 154.0/153.8 | hen_grand(64.9%) | 20.93 | 1.90 |
| D_high_freq_low_jackpot_3_pot | ✅ | 0.1/3 | 1.960/1.968 | 19.6/19.5 | large(40.8%) | 18.29 | 1.15 |
| E_corner_2_pot_binary_branch | ✅ | 0.06/2 | 1.980/2.005 | 33.0/33.2 | pot_1(68.2%) | 16.37 | 0.86 |
| F_corner_5_pot_uniform_progression | ✅ | 0.05/5 | 6.450/6.634 | 129.0/130.5 | p5(62.0%) | 23.43 | 1.14 |

## Compliance: UKGC RTS-14 mandatory per-pot RTP contribution / MGA PPD §11 branched-mode / eCOGRA per-mode audit / EU GA 2024.

Industry: LNW Bally Rich Little Piggies Piggy Bankin' Break In (2024 defining title) + World Class (2025) + Rich Little Hens World Class (2025).