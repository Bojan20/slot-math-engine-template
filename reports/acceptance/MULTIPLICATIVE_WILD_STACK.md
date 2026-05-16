# MULTIPLICATIVE_WILD_STACK — Product Wild Multiplier Acceptance

Generated: `2026-05-16T05:09:51.091Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 4.5 extension: ✅ "Multiplicative Wild Stack Bonus" (Wave 93).

## Method

Closed-form via per-reel Bernoulli + product moment formula:
  - N ~ Binomial(R, p): E[N]=R·p, Var[N]=R·p·(1-p)
  - E[W] = (p·μ_M + 1-p)^R (interchange product)
  - E[W²] = (p·E[M²] + 1-p)^R
  - E[Y] = μ_B · E[W], Var[Y] = (σ²_B + μ²_B)·E[W²] − E[Y]²

MC: 100K episodes per config, deterministic mulberry32, inverse-CDF mult sampling.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | E[W]_CF | E[W]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_netent_hotline_style | ✅ | 0.805 | 0.802 | 0.44% | 1.611 | 1.609 | 0.07% |
| B_classic_5reel_multi_tier | ✅ | 4.826 | 4.747 | 1.65% | 4.826 | 4.826 | 0.01% |
| C_high_density_low_mult | ✅ | 5.243 | 5.183 | 1.13% | 10.486 | 10.475 | 0.10% |
| D_moderate_5reel_balanced | ✅ | 3.491 | 3.418 | 2.08% | 6.982 | 6.941 | 0.58% |
| E_p1_guaranteed | ✅ | 8.000 | 7.963 | 0.46% | 8.000 | 8.000 | 0.00% |
| F_p0_no_wilds | ✅ | 1.000 | 1.002 | 0.16% | 1.000 | 1.000 | 0.00% |

## Tail metrics (per config)

| Config | E[wilds] | P(zero) | P(all) | Var[W] | max combined |
|---|---|---|---|---|---|
| A_netent_hotline_style | 0.50 | 59.0490% | 0.001000% | 1.119 | 3.20e+1 |
| B_classic_5reel_multi_tier | 1.00 | 32.7680% | 0.032000% | 192.651 | 1.00e+5 |
| C_high_density_low_mult | 3.00 | 1.0240% | 7.776000% | 62.153 | 3.20e+1 |
| D_moderate_5reel_balanced | 1.25 | 23.7305% | 0.097656% | 273.896 | 3.13e+3 |
| E_p1_guaranteed | 3.00 | 0.0000% | 100.000000% | 0.000 | 8.00e+0 |
| F_p0_no_wilds | 0.00 | 100.0000% | 0.000000% | 0.000 | 3.20e+1 |

## Compliance context

- **UKGC RTS 14** — variance disclosure for multiplicative-wild features
- **MGA PPD §11.f** — max-payout tail-probability disclosure
- **eCOGRA Generic Slots Audit** — closed-form product moment auditor-verifiable
- Industry use: NetEnt Hotline, Push Wanted Dead or a Wild, Hacksaw Multiplier Mayhem