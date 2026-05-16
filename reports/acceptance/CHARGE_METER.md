# CHARGE_METER — Charge Meter Feature Acceptance

Generated: `2026-05-16T01:42:38.111Z`

## Headline

**7/7 configs PASS** at 500000 MC spins each.

Closes Faza 12 scenario: ⚠️→✅ "Cluster cascade + charge meter".

## Method

Renewal-theoretic closed-form (`solveChargeMeterSteadyState`) for long-run RTP contribution and trigger rate.
Discrete-convolution exact PMF (`solveChargeMeterFiniteHorizon`) for finite-N episodes.
Both verified against Monte Carlo reference (`simulateChargeMeter`) at 500K spins per config.

## Configs

| Config | Pass | CF RTP (X/spin) | MC RTP (X/spin) | rel err | trigger rate | spins/trigger |
|---|---|---|---|---|---|---|
| A_small_T10_subtract | ✅ | 2.12500 | 2.12890 | 0.18% | 0.042500 | 23.5 |
| B_mid_T50_subtract | ✅ | 0.85000 | 0.85140 | 0.16% | 0.008500 | 117.6 |
| C_large_T200_subtract | ✅ | 1.06250 | 1.06400 | 0.14% | 0.002125 | 470.6 |
| D_small_T10_drain | ✅ | 2.05314 | 1.97630 | 3.74% | 0.041063 | 24.4 |
| E_mid_T50_drain | ✅ | 0.84409 | 0.83900 | 0.60% | 0.008441 | 118.5 |
| F_low_pwin | ✅ | 0.42500 | 0.43160 | 1.55% | 0.004250 | 235.3 |
| G_high_pwin | ✅ | 2.55000 | 2.55075 | 0.03% | 0.034000 | 29.4 |

## Finite-Horizon PMF (subtract configs A & B, N=200, 5000 episodes)

### A_small_T10_subtract

E[#triggers] CF = 8.0500, MC = 8.0616, rel = 0.14%

PMF L1 distance = 0.0173 (tolerance 0.05)

| k | CF P(K=k) | MC P(K=k) |
|---|---|---|
| 0 | 0.00000 | 0.00000 |
| 1 | 0.00000 | 0.00000 |
| 2 | 0.00000 | 0.00000 |
| 3 | 0.00004 | 0.00020 |
| 4 | 0.00154 | 0.00160 |
| 5 | 0.01979 | 0.02220 |
| 6 | 0.09879 | 0.09280 |
| 7 | 0.23197 | 0.23060 |

### B_mid_T50_subtract

E[#triggers] CF = 1.1387, MC = 1.1392, rel = 0.04%

PMF L1 distance = 0.0019 (tolerance 0.05)

| k | CF P(K=k) | MC P(K=k) |
|---|---|---|
| 0 | 0.00158 | 0.00180 |
| 1 | 0.85813 | 0.85720 |
| 2 | 0.14028 | 0.14100 |
| 3 | 0.00001 | 0.00000 |
| 4 | 0.00000 | 0.00000 |
| 5 | 0.00000 | 0.00000 |
| 6 | 0.00000 | 0.00000 |
| 7 | 0.00000 | 0.00000 |
