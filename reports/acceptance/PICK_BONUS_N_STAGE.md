# PICK_BONUS_N_STAGE — Multi-Stage Pick Bonus Acceptance

Generated: `2026-05-16T06:20:01.667Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 4.6 extension: ✅ "Pick Bonus N-Stage Tree" (Wave 107).

## Method

Closed-form recursive stage probabilities:
  - P(reach 1) = 1
  - P(reach i) = Π advance_{j<i}
  - P(collect at i) = P(reach i) · collect_i
  - E[Y] = Σ P(collect at i) · v_i
  - Var[Y] = Σ P(collect at i) · v_i² − E[Y]²

MC: 100K episodes per config, deterministic mulberry32 + per-stage Bernoulli routing.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | P(top) | P(end0) |
|---|---|---|---|---|---|---|
| A_netent_classic_3tier | ✅ | 53.000 | 52.671 | 0.62% | 8.000% | 15.20% |
| B_microgaming_5tier_grand | ✅ | 98.250 | 97.844 | 0.41% | 1.200% | 17.66% |
| C_2tier_simple | ✅ | 111.500 | 111.597 | 0.09% | 60.000% | 11.00% |
| D_single_stage_deterministic | ✅ | 100.000 | 100.000 | 0.00% | 100.000% | 0.00% |
| E_high_end_low_advance | ✅ | 21.000 | 20.941 | 0.28% | 1.000% | 76.50% |
| F_aggressive_advance | ✅ | 759.950 | 761.603 | 0.22% | 16.800% | 25.32% |

## Compliance context

- **UKGC RTS 14** — variance disclosure required for pick bonus features
- **MGA PPD §11.f** — tail-probability disclosure (P(reach top), P(end with 0))
- **eCOGRA Generic Slots Audit** — recursive stage probability auditor-verifiable
- Industry use: NetEnt classic pick-til-pop, Microgaming jackpot ladder, Play'n GO pick bonuses