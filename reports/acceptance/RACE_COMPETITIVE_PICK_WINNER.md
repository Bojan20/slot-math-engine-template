# RACE_COMPETITIVE_PICK_WINNER — Race/Competitive Pick One-Winner-Among-N Aggregator Acceptance (W192, 73. solver, L&W M8 P1 GAP CLOSURE)

Generated: `2026-05-18T01:37:13.955Z`

**6/6 configs PASS** @ 50000 MC races each (2 strategies = 100,000 sim spins per config).

Closes L&W M8 P1 GAP — WMS Goldfish Race for the Gold + Reel'em In Big Bass Bucks fishing contest.

## Method

Categorical winner + player-pick gating × multiplier draw:
  - **K ~ Categorical(p_1..p_N)** sa p_i = w_i / Σ w_j
  - **Y(pick=s) = V_s · M_s · 𝟙{K=s}**
  - **E[Y | pick=s] = p_s · V_s · μ_M_s**
  - **Var[Y | pick=s] = p_s · V_s² · (σ²_M + μ_M²) − E[Y]²**
  - **bestPickIndex = argmax_s** E[Y | pick=s]
  - **skillPremiumVsUniform = best − (1/N)·Σ E[Y|s]**
  - **rtpSpread = best − worst**
  - **commercialUpliftOverSymmetric = bestRtp / uniformRtp**

## Configs
| Config | Pass | N | best(p%) | best ER CF/MC | uniform CF/MC | skill+ | uplift× |
|---|---|---|---|---|---|---|---|
| A_goldfish_race_for_gold_4_fish | ✅ | 4 | gold(10.0%) | 10.000/10.122 | 5.000/5.032 | 5.00 | 2.00 |
| B_big_bass_bucks_5_anglers_14_to_55 | ✅ | 5 | angler_3(20.0%) | 6.000/5.980 | 5.000/4.985 | 1.00 | 1.20 |
| C_competitive_pick_3_candidate_skewed | ✅ | 3 | jackpot(7.1%) | 28.571/29.704 | 12.679/12.449 | 15.89 | 2.25 |
| D_symmetric_race_no_skill_premium | ✅ | 4 | c1(25.0%) | 2.500/2.500 | 2.500/2.516 | 0.00 | 1.00 |
| E_corner_2_candidate_binary_race | ✅ | 2 | c1(30.0%) | 1.500/1.510 | 1.100/1.101 | 0.40 | 1.36 |
| F_corner_8_candidate_long_field | ✅ | 8 | c8(3.3%) | 13.333/13.640 | 3.454/3.474 | 9.88 | 3.86 |

## Compliance: UKGC RTS-12 player-skill mechanic RTP / UKGC RTS-14 per-candidate transparency / MGA PPD §11 / eCOGRA / EU GA 2024.

Industry: LNW WMS Goldfish Race for the Gold (2017) + Reel'em In Big Bass Bucks (2014) + competitive-pick variants.