# WALKING_WILD_RESPIN — Walking-Wild Respin Variant Acceptance

Generated: `2026-05-16T02:05:57.559Z`

## Headline

**6/6 configs PASS** at 100000 MC episodes each.

Closes Faza 12 scenario: ⚠️→✅ "Walking-wild respin variant".

## Method

Closed-form: 1D absorbing Markov chain over column position, fundamental matrix `N = (I − Q)^{-1}` →
E[K] + Var[K]. Wald + compound-sum variance for E[Y], Var[Y].
Verified vs Monte Carlo at 100K episodes per config.

## Tolerances

| Metric | Tolerance |
|---|---|
| E[Y] | rel ≤ 2.0% |
| E[K] | rel ≤ 1.5% |
| Var[K] | rel ≤ 10.0% (skipped if deterministic) |

## Configs

| Config | Pass | CF E[Y] | MC E[Y] | rel | CF E[K] | MC E[K] | rel | CF σ[Y] |
|---|---|---|---|---|---|---|---|---|
| A_5col_symmetric | ✅ | 11.900 | 11.973 | 0.61% | 7.00 | 7.04 | 0.54% | 12.14 |
| B_7col_with_stay | ✅ | 29.143 | 29.154 | 0.04% | 17.14 | 17.14 | 0.00% | 31.07 |
| C_strict_right | ✅ | 8.500 | 8.506 | 0.07% | 5.00 | 5.00 | 0.00% | 2.66 |
| D_center_start_high_stay | ✅ | 90.667 | 90.561 | 0.12% | 53.33 | 53.24 | 0.18% | 74.65 |
| E_biased_right | ✅ | 13.603 | 13.561 | 0.31% | 8.00 | 7.98 | 0.31% | 9.73 |
| F_heavy_tail_reward | ✅ | 36.818 | 37.102 | 0.77% | 7.00 | 7.04 | 0.54% | 59.43 |
