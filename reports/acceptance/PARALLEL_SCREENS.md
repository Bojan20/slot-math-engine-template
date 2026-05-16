# PARALLEL_SCREENS — N-screen Aggregate Distribution Acceptance

Generated: `2026-05-16T02:44:47.224Z`

## Headline

**6/6 configs PASS** at 500000 MC spins each.

Closes Faza 12 scenario: ⚠️→✅ "Parallel screens (N independent screens spun together)".

## Method

Closed-form: Independent ⇒ Y = ΣY_i, E[Y] = ΣE[Y_i], Var[Y] = ΣVar[Y_i].
Correlated mixture: pShared × N×V + (1−pShared) × ΣY_i. Var via E[Y²] decomposition.
Aggregate PMF via discrete convolution (independent mode only).
MC verified against closed-form at 500K spins per config.

## Configs

| Config | Pass | CF E[Y] | MC E[Y] | rel | CF σ | hit rate | P(Y=0) | PMF size |
|---|---|---|---|---|---|---|---|---|
| A_3screens_shared_indep | ✅ | 3.300 | 3.308 | 0.25% | 6.36 | 0.6570 | 0.3430 | 20 |
| B_5screens_shared_indep | ✅ | 5.500 | 5.523 | 0.42% | 8.21 | 0.8319 | 0.1681 | 54 |
| C_3screens_correlated_30pct | ✅ | 3.300 | 3.306 | 0.19% | 8.05 | 0.5499 | 0.4501 | — |
| D_2screens_fully_correlated | ✅ | 2.200 | 2.207 | 0.30% | 7.35 | 0.3000 | 0.7000 | — |
| E_heterogeneous_2screen | ✅ | 10.700 | 10.739 | 0.37% | 36.53 | 0.5800 | 0.4200 | 20 |
| F_8screens_max_independence | ✅ | 8.800 | 8.826 | 0.29% | 10.39 | 0.9424 | 0.0576 | 125 |