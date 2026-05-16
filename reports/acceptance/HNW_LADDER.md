# HNW_LADDER — N-tier Hold & Win Ladder Jackpot Acceptance

Generated: `2026-05-16T01:32:05.860Z`

## Headline

**6/6 configs PASS** at 250000 MC spins each.

Closes Faza 5 sales-blocker: ⚠️→✅ "Money-symbol H&W + multi-tier jackpot ladder".

## Method

Closed-form solver `solveLadderJackpot` propagates probability + expected cash through
state graph `(respins, filled)` in topological order. Each config is verified against a
Monte Carlo reference (`simulateLadderJackpot`) at 250K spins, seed=12345.

## Tolerances

| Metric | Tolerance |
|---|---|
| expectedTotalX | rel ≤ 2.0% |
| expectedCashValueX | rel ≤ 2.0% |
| expectedTierPayoutX | rel ≤ 5.0% |
| expectedFilled | rel ≤ 1.0% |
| per-tier probability | abs ≤ 0.005 |

## Configs

| Config | Pass | CF EV (X) | MC EV (X) | rel err | filled (CF) | tier-prob max abs |
|---|---|---|---|---|---|---|
| A_classic_reset_p015_r3 | ✅ | 655.229 | 656.717 | 0.23% | 17.70 | 0.0024 |
| B_no_reset_p015_r5 | ✅ | 77.283 | 77.333 | 0.06% | 13.79 | 0.0014 |
| C_high_p030 | ✅ | 1463.429 | 1465.179 | 0.12% | 19.46 | 0.0017 |
| D_long_respin_r8 | ✅ | 1144.405 | 1145.275 | 0.08% | 18.98 | 0.0006 |
| E_big_grid_5x7 | ✅ | 350.045 | 350.633 | 0.17% | 30.39 | 0.0004 |
| F_heavy_tail_coin | ✅ | 653.808 | 655.280 | 0.23% | 17.70 | 0.0024 |

## Per-config tier probabilities (closed-form)

### A_classic_reset_p015_r3

_5×4 grid, 4 tiers, reset on land, p=0.15, R0=3 (baseline)_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.01521 | 0.0000 |
| MINI | 12 | 0.06311 | 1.5776 |
| MINOR | 15 | 0.28872 | 28.8725 |
| MAJOR | 18 | 0.44783 | 223.9139 |
| GRAND | 20 | 0.18513 | 370.2547 |

### B_no_reset_p015_r5

_5×4 grid, 4 tiers, NO reset on land, p=0.15, R0=5_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.10952 | 0.0000 |
| MINI | 12 | 0.53545 | 13.3862 |
| MINOR | 15 | 0.33599 | 33.5986 |
| MAJOR | 18 | 0.01877 | 9.3855 |
| GRAND | 20 | 0.00027 | 0.5436 |

### C_high_p030

_5×4 grid, 4 tiers, reset, p=0.30, R0=3 (frequent landings)_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.00003 | 0.0000 |
| MINI | 12 | 0.00094 | 0.0235 |
| MINOR | 15 | 0.03410 | 3.4105 |
| MAJOR | 18 | 0.33671 | 168.3561 |
| GRAND | 20 | 0.62822 | 1256.4316 |

### D_long_respin_r8

_5×4 grid, 4 tiers, reset, p=0.10, R0=8 (endurance)_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.00056 | 0.0000 |
| MINI | 12 | 0.00743 | 0.1858 |
| MINOR | 15 | 0.10409 | 10.4086 |
| MAJOR | 18 | 0.45067 | 225.3329 |
| GRAND | 20 | 0.43726 | 874.5177 |

### E_big_grid_5x7

_5×7=35 grid, 3 tiers, reset, p=0.10, R0=3_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.00503 | 0.0000 |
| A | 18 | 0.07916 | 3.9579 |
| B | 26 | 0.86895 | 217.2383 |
| C | 35 | 0.04686 | 70.2880 |

### F_heavy_tail_coin

_5×4 grid, 4 tiers, reset, p=0.15, R0=3, Pareto-like coin dist_

| Tier | Threshold | P(final) | CF expectedTierPayoutX contribution |
|---|---|---|---|
| NONE | 0 | 0.01521 | 0.0000 |
| MINI | 12 | 0.06311 | 1.5776 |
| MINOR | 15 | 0.28872 | 28.8725 |
| MAJOR | 18 | 0.44783 | 223.9139 |
| GRAND | 20 | 0.18513 | 370.2547 |
