# BONUS_BUY_VARIANCE — Feature Buy Variance Analyzer Acceptance

Generated: `2026-05-16T04:27:17.774Z`

## Headline

**6/6 configs PASS** at 200000 MC buys each = 1.2M total MC.

Closes Faza 4.7 extension: ✅ "Bonus Buy / Feature Buy variance + RTP + risk analyzer" (Wave 81).

## Method

Closed-form (no integration, no approximation):
  - E[Y] = Σ p_i · payout_i
  - Var[Y] = E[Y²] − E[Y]²
  - Effective RTP = E[Y] / C, House edge = 1 − RTP
  - Hit frequency = Σ p_i where payout_i > 0
  - N* (CLT) = (z · √Var[Y] / (tol · C))²

MC: 200K buys per config, deterministic mulberry32, inverse-CDF sampling.

## Configs

| Config | Pass | RTP_CF | RTP_MC | rel | var_CF | var_MC | rel | hit_CF | hit_MC | rel |
|---|---|---|---|---|---|---|---|---|---|---|
| A_typical_pragmatic_style | ✅ | 0.7300 | 0.7297 | 0.05% | 70111 | 69586 | 0.75% | 0.5000 | 0.5007 | 0.14% |
| B_high_volatility_maxwin_chase | ✅ | 5.0000 | 5.0585 | 1.17% | 4750000 | 4802616 | 1.11% | 0.0500 | 0.0506 | 1.17% |
| C_low_volatility_low_house_edge | ✅ | 0.9600 | 0.9612 | 0.12% | 2304 | 2292 | 0.54% | 0.9000 | 0.9016 | 0.18% |
| D_expensive_buy_high_max | ✅ | 1.2500 | 1.2507 | 0.06% | 2256875 | 2262261 | 0.24% | 0.6000 | 0.6007 | 0.12% |
| E_super_high_volatility | ✅ | 1.0000 | 1.0200 | 2.00% | 9990000 | 10189596 | 2.00% | 0.0010 | 0.0010 | 2.00% |
| F_break_even_skew_high_RTP | ✅ | 1.6500 | 1.6510 | 0.06% | 84525 | 84662 | 0.16% | 0.7000 | 0.7006 | 0.08% |

## Risk metrics (per config)

| Config | P(bust) | P(below cost) | P(break-even) | N* (95% / ±1%) | win/loss ratio |
|---|---|---|---|---|---|
| A_typical_pragmatic_style | 50.00% | 85.00% | 15.00% | 269,339 | 50× |
| B_high_volatility_maxwin_chase | 95.00% | 95.00% | 5.00% | 18,247,600 | 100× |
| C_low_volatility_low_house_edge | 10.00% | 60.00% | 40.00% | 8,852 | 2× |
| D_expensive_buy_high_max | 40.00% | 65.00% | 35.00% | 346,801 | 20× |
| E_super_high_volatility | 99.90% | 99.90% | 0.10% | 38,377,585 | 1000× |
| F_break_even_skew_high_RTP | 30.00% | 60.00% | 40.00% | 324,712 | 10× |

## Compliance context

- **UKGC (Great Britain)** — bonus-buy purchase banned 2022 (LCCP 5.1 + RTS 8); engine supports disclosure for jurisdictions where allowed
- **MGA (Malta)** — feature buy RTP + variance disclosure required (PPD 2018 §11.f)
- **Australia (Class B / B+)** — bonus-buy banned 2024 (NCPF + state regulations)
- **EU jurisdictions** — closed-form RTP + N* convergence enables exact PAR sheet disclosure