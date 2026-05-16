# FREE_SPINS_LOOKBACK_MULTIPLIER — Post-Hoc Multiplier Aggregator Acceptance

Generated: `2026-05-16T05:24:49.440Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 4.3 extension: ✅ "Free Spins Lookback Multiplier Aggregator" (Wave 97).

## Method

Closed-form Wald-like aggregator:
  - S_K = Σ W_i, E[S_K] = K·μ_W, Var[S_K] = K·σ²_W
  - M ~ discrete distribution, μ_M, σ²_M
  - E[Y] = μ_M · K · μ_W
  - Var[Y] = K·σ²_W·(σ²_M + μ²_M) + K²·μ²_W·σ²_M

MC: 100K episodes per config, deterministic mulberry32, exact 2-point base win + inverse-CDF multiplier.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | μ_M_CF | μ_M_MC | rel |
|---|---|---|---|---|---|---|---|
| A_money_cart_4_style | ✅ | 204.000 | 201.967 | 1.00% | 8.500 | 8.422 | 0.92% |
| B_hacksaw_deterministic | ✅ | 40.000 | 40.000 | 0.00% | 5.000 | 5.000 | 0.00% |
| C_low_K_high_mult_range | ✅ | 9.750 | 9.920 | 1.75% | 3.900 | 3.946 | 1.19% |
| D_long_K_modest_mult | ✅ | 60.000 | 59.939 | 0.10% | 2.000 | 1.996 | 0.21% |
| E_balanced_mid_volatility | ✅ | 35.250 | 35.285 | 0.10% | 2.350 | 2.346 | 0.17% |
| F_low_K_high_K_extreme | ✅ | 56.000 | 56.358 | 0.64% | 2.800 | 2.818 | 0.64% |

## Tail metrics (per config)

| Config | max M | P(max M) | E[Y \| M=max] | Var[Y] | E[S_K] |
|---|---|---|---|---|---|
| A_money_cart_4_style | x100 | 5.00% | 2400.00 | 309840.00 | 24.00 |
| B_hacksaw_deterministic | x5 | 100.00% | 40.00 | 0.00 | 8.00 |
| C_low_K_high_mult_range | x50 | 2.00% | 125.00 | 1102.56 | 2.50 |
| D_long_K_modest_mult | x10 | 3.00% | 300.00 | 3810.00 | 30.00 |
| E_balanced_mid_volatility | x10 | 5.00% | 150.00 | 1526.69 | 15.00 |
| F_low_K_high_K_extreme | x10 | 20.00% | 200.00 | 5184.00 | 20.00 |

## Compliance context

- **UKGC RTS 14** — variance disclosure for lookback-multiplier features
- **MGA PPD §11.f** — max-payout tail-probability disclosure
- **eCOGRA Generic Slots Audit** — Wald-like aggregator auditor-verifiable
- Industry use: Push Money Cart 4, Hacksaw bonus games, Pragmatic post-FS multipliers