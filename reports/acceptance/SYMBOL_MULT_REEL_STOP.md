# SYMBOL_MULT_REEL_STOP — Symbol Multiplier on Reel-Stop Acceptance

Generated: `2026-05-16T10:40:08.346Z`

## Headline

**6/6 configs PASS** at 200000 spins each = 1.20M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Symbol Multiplier on Reel-Stop" (Wave 142).

## Method

Closed-form random multiplier landing analyzer with configurable aggregation:
  - N positions; per position P(multiplier lands) = q (independent)
  - Value V ~ multiplierValuePmf when landed
  - ADDITIVE: T = max(1, Σ v_i) sum-style (Sweet Bonanza/Bigger Bass/RIP City)
  - MULTIPLICATIVE: T = Π v_i product-style (Asgardian Stones)
  - E[Y] = E[T]·μ_W (T ⊥ W)

MC: 200K spins per config, mulberry32 RNG, per-position Bernoulli + PMF sampling.

## Configs

| Config | Pass | Mode | E[Y] | E[land] | maxM_obs |
|---|---|---|---|---|---|
| A_sweet_bonanza_5x6_additive | ✅ | additive | 41.6688 | 0.7500 | 1100 |
| B_bigger_bass_5x3_additive | ✅ | additive | 1.2531 | 0.3000 | 104 |
| C_hacksaw_rip_city_5x5_additive | ✅ | additive | 12.6733 | 1.0000 | 62 |
| D_asgardian_stones_avalanche_multiplicative | ✅ | multiplicative | 23.1983 | 1.5000 | 2700 |
| E_corner_no_multipliers_baseline | ✅ | additive | 1.0100 | 0.0100 | 4 |
| F_corner_always_lands_additive | ✅ | additive | 9.9000 | 4.9500 | 10 |

## Compliance context

- **UKGC RTS 14** — multiplier value distribution disclosure
- **MGA PPD §11.f** — symbol-landing rule + aggregation transparency
- **eCOGRA Generic Slots Audit** — verifies T = Σ v_i (additive) ili Π v_i (multiplicative)
- Industry use: Pragmatic Sweet Bonanza (tumble mult symbols), Pragmatic
  Bigger Bass Bonanza (fish multipliers), Hacksaw RIP City (sum), Push Wild
  Swarm (sum), NetEnt Asgardian Stones (avalanche multiplicative), Yggdrasil
  Reactoonz multipliers.