# ARCADE_SHOOTER_SURVIVAL_LEVELS — Arcade-Shooter Survival Level Progression Aggregator Acceptance (W194, 75. solver, L&W M16 P1 GAP CLOSURE)

Generated: `2026-05-18T01:54:27.866Z`

**6/6 configs PASS** @ 100000 MC runs each.

Closes L&W M16 P1 GAP — Lightning Box Stellar Jackpots wrapper (Thundering Bison + Chicken Fox + Lightning Horseman + 4+ Astro family).

## Method

Sequential survival Markov chain sa absorbing failure state + per-level reward + terminal jackpot mixture:
  - **S_k = ∏_{i<k} p_i** survival probability (chain rule)
  - **P(exit at k) = S_k · (1−p_k)** early-exit Bernoulli
  - **P(complete) = S_{L+1} = ∏ p_i**
  - **E[Y per run] = Σ S_{k+1}·V_k + S_{L+1}·μ_J**
  - **Var[Y]** via correlated-Bernoulli E[Y²] + jackpot mixture variance
  - perLevel.expectedRewardContribution = S_{k+1}·V_k
  - perJackpotTier.probabilityHitThisTier = S_{L+1}·π_k
  - oneInNRunsToComplete = 1/S_{L+1}

## Configs
| Config | Pass | L / K | E[Y] CF/MC | P(complete) CF/MC | E[lv] CF/MC | JP share | 1-in-N complete |
|---|---|---|---|---|---|---|---|
| A_stellar_jackpots_6_level_4_tier | ✅ | 6/4 | 18.30/17.66 | 2.02%/1.98% | 2.95/2.94 | 30.8% | 49.6 |
| B_thundering_bison_4_level_escalation | ✅ | 4/2 | 72.99/72.05 | 8.92%/8.89% | 2.83/2.82 | 88.6% | 11.2 |
| C_chicken_fox_high_freq_short_chain | ✅ | 3/2 | 193.50/191.24 | 33.75%/33.66% | 2.91/2.91 | 83.7% | 3.0 |
| D_lightning_horseman_8_level_long_chain | ✅ | 8/1 | 451.53/432.57 | 1.72%/1.65% | 3.83/3.82 | 95.4% | 58.0 |
| E_corner_single_level_binary | ✅ | 1/1 | 44.00/43.99 | 40.00%/40.00% | 1.40/1.40 | 90.9% | 2.5 |
| F_corner_all_pass_1_complete_certain | ✅ | 3/1 | 61.42/61.40 | 85.74%/85.70% | 3.71/3.71 | 69.8% | 1.2 |

## Compliance: UKGC RTS-14 mandatory per-stage probability / MGA PPD §11 sequential-stage / eCOGRA per-stage audit / EU GA 2024.

Industry: LNW Lightning Box Stellar Jackpots wrapper + Thundering Bison/Buffalo/Gorilla + Chicken Fox + Lightning Horseman + 4+ Astro family.