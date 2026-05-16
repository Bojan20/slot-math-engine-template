# COIN_ACCUMULATOR_MYSTERY — Money-Train-style Coin Collect Acceptance

Generated: `2026-05-16T05:02:04.016Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 12 extension: ✅ "Coin Accumulator + Mystery Values" (Wave 91).

## Method

Closed-form via Binomial coin chain × discrete mystery distribution:
  - N ~ Binomial(K, q): E[N]=K·q, Var[N]=K·q·(1-q)
  - μ_V = Σ p_i·v_i, σ²_V = Σ p_i·v_i² − μ²_V
  - E[Y] = E[N]·μ_V (Wald)
  - Var[Y] = E[N]·σ²_V + Var[N]·μ²_V (compound-sum)
  - P(≥1 max-value coin) = 1 − (1 − q·p_max)^K (Bernoulli-Binomial nesting)

MC: 100K episodes per config, deterministic mulberry32, inverse-CDF mystery sampling.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | E[N]_CF | E[N]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_money_train_classic | ✅ | 24.600 | 25.155 | 2.25% | 2.40 | 2.41 | 0.30% |
| B_high_density_low_value | ✅ | 14.700 | 14.729 | 0.20% | 7.00 | 7.00 | 0.04% |
| C_rare_grand_long_session | ✅ | 69.075 | 70.329 | 1.82% | 2.25 | 2.25 | 0.07% |
| D_short_session_high_q | ✅ | 81.000 | 81.134 | 0.17% | 2.70 | 2.70 | 0.05% |
| E_q1_guaranteed | ✅ | 55.000 | 55.010 | 0.02% | 5.00 | 5.00 | 0.00% |
| F_q0_no_coins | ✅ | 0.000 | 0.000 | 0.00% | 0.00 | 0.00 | 0.00% |

## Tail metrics (per config)

| Config | μ_V | σ²_V | P(zero) | P(all) | P(≥1 max) |
|---|---|---|---|---|---|
| A_money_train_classic | 10.250 | 2499.79 | 5.7648% | 0.00656100% | 2.3750% |
| B_high_density_low_value | 2.100 | 2.29 | 0.0006% | 2.82475249% | 77.8698% |
| C_rare_grand_long_session | 30.700 | 19878.21 | 8.7354% | 0.00000000% | 4.4067% |
| D_short_session_high_q | 30.000 | 400.00 | 0.1000% | 72.90000000% | 83.3625% |
| E_q1_guaranteed | 11.000 | 54.00 | 0.0000% | 100.00000000% | 92.2240% |
| F_q0_no_coins | 100.000 | 0.00 | 100.0000% | 0.00000000% | 0.0000% |

## Compliance context

- **UKGC RTS 14** — variance disclosure required for coin-collect features
- **MGA PPD §11.f** — tail-probability disclosure (P(max-value hit) per session)
- **eCOGRA Generic Slots Audit** — closed-form Bernoulli-Binomial nesting auditor-verifiable
- Industry use: Money Train (Relax), Money Cart (Relax), Wanted Dead or a Wild (Hacksaw)