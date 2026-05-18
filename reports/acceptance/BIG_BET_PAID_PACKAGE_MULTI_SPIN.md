# BIG_BET_PAID_PACKAGE_MULTI_SPIN — Big Bet Paid-Package Multi-Spin Schedule Aggregator Acceptance (W186, 67. solver, UK-CRITICAL L&W M9 P0 GAP CLOSURE)

Generated: `2026-05-18T00:34:28.355Z`

## Headline

**6/6 configs PASS** at 30000 MC packages each = 180K total package sims.

Closes Faza 12 ext (post-W100): ✅ "Big Bet Paid-Package Multi-Spin Schedule Aggregator" (Wave 186 — 67. closed-form solver, UK-CRITICAL L&W M9 GAP CLOSED — Barcrest UK family + UKGC RTS-12 mandatory disclosure).

## Method

Per-spin independent + aggregate disclosure. Paket K spinova, svaki sa distinct (b_k, r_k, σ²_k).
  - **Total cost**: C = Σ b_k
  - **E[total payout]** = Σ b_k · r_k
  - **Var[total]** = Σ σ²_k (per-spin independence)
  - **packageRtp** = E[Y_total] / C
  - **E[net profit]** = E[Y_total] − C
  - **P(profit) CLT-Normal**: z = (C − μ)/σ, P = 1 − Φ(z) (Abramowitz-Stegun erf)
  - **Operator subsidy**: max(0, packageRtp − baseRtp) · C
  - **RTP escalation slope**: linear regression r_k vs k
  - **Harm-threshold flag**: UKGC LCCP 3.4.3 ako E[loss] > threshold

MC: per-package, per-spin Gaussian draw mean=b_k·r_k stddev=√σ²_k (clipped ≥ 0 per vendor convention).

## Configs — Big Bet Paid-Package operator disclosure table (UKGC RTS-12 mandatory)

| Config | Pass | K | Cost | RTP CF/MC | E[Y] CF/MC | P(profit) CF/MC | Subsidy | Harm Flag |
|---|---|---|---|---|---|---|---|---|
| A_monopoly_big_event_5spin_98pct_top | ✅ | 5 | 20 | 94.20%/94.52% | 18.84/18.90 | 45.56%/45.88% | 0.20% | no |
| B_rainbow_riches_pick_n_mix_flat_96pct | ✅ | 5 | 25 | 96.00%/96.22% | 24.00/24.05 | 45.55%/45.88% | 4.00% | no |
| C_action_bank_5spin_progressive_to_102pct | ✅ | 5 | 15 | 96.40%/96.83% | 14.46/14.52 | 47.93%/48.21% | 1.40% | no |
| D_pearl_of_caribbean_5spin_high_vol | ✅ | 5 | 20 | 96.00%/96.47% | 19.20/19.29 | 47.88%/48.20% | 3.00% | no |
| E_corner_2spin_minimum_package | ✅ | 2 | 20 | 94.50%/94.77% | 18.90/18.95 | 43.82%/44.04% | 1.50% | no |
| F_corner_10spin_extended_package | ✅ | 10 | 20 | 94.20%/94.66% | 18.84/18.93 | 46.67%/46.81% | 2.20% | no |

## Compliance context

- **UKGC RTS-12** — Big Bet mandatory per-spin RTP disclosure (2010-2022 UK regulation).
- **UKGC LCCP 3.4.3** — responsible gambling chase-pattern detection via harm-threshold flag.
- **MGA PPD §17** — paid-package transparency.
- **eCOGRA Generic Slots Audit** — multi-spin schedule audit trail.

Industry use: L&W M9 gap (UK-CRITICAL) — LNW Barcrest Monopoly Big Event (2010, defining UK title), Rainbow Riches Pick n Mix (2014, Big Bet + feature composition), Action Bank (2017, vault-pick), Pearl of Caribbean variants. **First Belgian-ban-impact-aware analyzer** za UK Big Bet familiju (Belgian Big Bet ban 2018 forced operator disclosure shift).