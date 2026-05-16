# STICKY_CASH_REVEAL — Sticky Cash + Reveal Multiplier Acceptance

Generated: `2026-05-16T01:58:31.710Z`

## Headline

**6/6 configs PASS** at 100000 MC episodes each.

Closes Faza 12 scenario: ⚠️→✅ "Sticky cash + reveal multiplier".

## Method

Closed-form: per-cell independent geometric (1-p)^N → q probability, cash V iid → E[T] = Gq·E[V],
Var[T] = G(q·E[V²]−q²·E[V]²), independent reveal M → E[Y] = E[T]·E[M],
Var[Y] = E[T]²·Var[M] + Var[T]·E[M]² + Var[T]·Var[M].
MC verification across 6 synthetic configs × 100K episodes each = 600K total.

## Tolerances

| Metric | Tolerance |
|---|---|
| E[Y] | rel ≤ 2.0% |
| Var[Y] | rel ≤ 10.0% |
| E[occupied] | rel ≤ 1.0% |
| P(Y=0) | abs ≤ 0.01 |
| E[M] | rel ≤ 2.0% |

## Configs

| Config | Pass | CF E[Y] | MC E[Y] | rel | CF σ[Y] | MC σ[Y] | P(Y=0) CF | P(Y=0) MC |
|---|---|---|---|---|---|---|---|---|
| A_classic_5x4_10spins | ✅ | 66.435 | 66.716 | 0.42% | 228.04 | 228.66 | 0.0000 | 0.0000 |
| B_short_window_low_p | ✅ | 23.074 | 23.281 | 0.90% | 87.44 | 87.80 | 0.0059 | 0.0058 |
| C_long_window_high_p | ✅ | 100.824 | 100.974 | 0.15% | 339.14 | 341.49 | 0.0000 | 0.0000 |
| D_big_grid_5x7 | ✅ | 116.261 | 117.303 | 0.90% | 393.43 | 396.86 | 0.0000 | 0.0000 |
| E_heavy_tail_cash | ✅ | 97.461 | 98.657 | 1.23% | 393.25 | 407.39 | 0.0000 | 0.0000 |
| F_flat_reveal | ✅ | 37.646 | 37.706 | 0.16% | 20.23 | 20.28 | 0.0000 | 0.0000 |
