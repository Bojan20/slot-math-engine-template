# VARIABLE_REEL_HEIGHT_WAYS — Megaways-Style Ways Volatility Acceptance

Generated: `2026-05-16T06:48:13.513Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Variable Reel Height Ways" (Wave 112).

## Naming policy (clean-room)

BTG Megaways patent **EXPIRED 2023** — naming "variable reel height ways" /
"ways count" / "reel modifier" is generic industry terminology. No vendor TM.
Pragmatic, Blueprint, iSoftBet, Stakelogic ship this pattern under various brands.

## Method

Per-reel H_i ~ discrete pmf, ways count W = Π_i H_i (cross-reel independence).

Closed-form moments:
  - E[W] = Π_i E[H_i]
  - E[W²] = Π_i E[H_i²]
  - Var[W] = E[W²] − E[W]²

Tail (operator "epic ways" marketing-claim disclosure):
  - maxWays = Π_i max(supp(H_i))
  - probMaxWays = Π_i P(H_i = max)
  - P(W ≥ threshold) via PMF aggregation

MC: 100K episodes per config, mulberry32 RNG, per-reel inverse-CDF sampling.

## Configs

| Config | Pass | E[W]_CF | E[W]_MC | rel | maxWays | P(max) |
|---|---|---|---|---|---|---|
| A_6reel_uniform_2_7_megaways_classic | ✅ | 8303.8 | 8254.1 | 0.60% | 117649 | 0.0021% |
| B_6reel_weighted_skew_low | ✅ | 2117.0 | 2099.5 | 0.83% | 117649 | 0.0000% |
| C_6reel_weighted_skew_high | ✅ | 25257.6 | 25202.2 | 0.22% | 117649 | 0.1372% |
| D_5reel_fixed_edge_variable_middle | ✅ | 405.0 | 404.6 | 0.09% | 648 | 14.2857% |
| E_4reel_dense_grid | ✅ | 410.1 | 409.0 | 0.26% | 1296 | 0.3906% |
| F_deterministic_corner | ✅ | 1024.0 | 1024.0 | 0.00% | 1024 | 100.0000% |

## Compliance context

- **UKGC RTS 14** — variance + tail-probability disclosure (ways distribution must be auditable)
- **MGA PPD §11.f** — operator-facing ways volatility disclosure
- **eCOGRA Generic Slots Audit** — verifies E[W] / Var[W] match engine
- Industry use: Pragmatic Megaways slots, Blueprint Megaways, iSoftBet Megaways,
  Stakelogic Megaways, hundreds of licensed Big Time Gaming Megaways titles.