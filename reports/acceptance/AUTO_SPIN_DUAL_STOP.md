# AUTO_SPIN_DUAL_STOP — Auto-Spin Dual-Stop (Loss/Win Limit + Spin Cap) Analyzer Acceptance

Generated: `2026-05-19T04:26:25.881Z`

## Headline

**6/6 configs PASS** at 3000 MC episodes each = 18.0K total dual-stop session runs.

Closes W220 — 58. closed-form solver, first **TWO-SIDED BARRIER + horizon** first-passage kernel u portfolio (UKGC RTS 13B + MGA PPD §19 + AU NCPF Schedule 5 mandatory 2025).

## Method

Closed-form Bachelier-Wiener drifted random walk with three absorbing conditions:
  1. Cumulative net loss reaches −L_loss → **loss_stop**
  2. Cumulative net win reaches +L_win → **win_stop**
  3. Auto-spin counter reaches N_max → **spin_limit**

Per-spin model:
  - μ_spin = bet · (RTP − 1)
  - σ²_spin = bet² · v (v = volatility index)

Closed-form (Karatzas-Shreve §5.18):
  - **P(hits +b before −a) = (e^(λa) − 1) / (e^(λa) − e^(−λb))** where λ = 2μ/σ²
  - μ = 0 limit: P_win = a/(a+b)
  - **E[T_unbounded] = (P_win·b − P_loss·a) / μ**
  - **P(spin_limit fired)** ≈ exponential-tail decay when N_max ≥ E[T_unbounded], Markov-bound truncation otherwise

MC: 3K episodes per config, iid Gaussian per-spin steps, mulberry32 RNG + Box-Muller normal sampler.

## Results

| config | regime | RTP | L_loss/L_win | N_max | CF P_loss | MC P_loss | Δ | CF E[spins] | MC E[spins] | risk | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_responsible_small_bet_smooth | small-bet | 0.96 | 5/10 | 5000 | 0.878 | 0.869 | 0.008 | 791.5 | 857.0 | 0.658 | ✅ |
| B_uk_realistic_£1_bet_£50_£100_limits | realistic | 0.96 | 50/100 | 500 | 0.415 | 0.429 | 0.013 | 500.0 | 398.0 | 0.312 | ✅ |
| C_au_ncpf_high_vol_£2_bet | realistic | 0.88 | 100/200 | 250 | 0.503 | 0.484 | 0.019 | 250.0 | 192.2 | 0.378 | ✅ |
| D_eu_high_roller_£5_bet_long_session | realistic | 0.97 | 500/1000 | 1000 | 0.163 | 0.148 | 0.015 | 1000.0 | 957.2 | 0.122 | ✅ |
| E_corner_zero_drift_symmetric | small-bet | 1 | 10/10 | 10000 | 0.500 | 0.481 | 0.019 | 2000.0 | 2054.7 | 0.500 | ✅ |
| F_corner_player_edge_positive_drift | small-bet | 1.03 | 5/10 | 5000 | 0.459 | 0.435 | 0.024 | 1036.0 | 1060.2 | 0.345 | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| P_loss / P_win delta (small-bet regime) | ≤ 0.05 abs |
| P_loss / P_win delta (realistic regime) | ≤ 0.15 abs (Bachelier-discrete overshoot) |
| P_loss + P_win + P_spin_limit sum | within 0.005 of 1.0 |
| E[spins_to_stop] CF vs MC | ≤ 0.3 rel |

## Headline regulator forms

| config | 1-in-N session loss-stop | session risk score | E[final net] |
|---|---|---|---|
| A_uk_responsible_small_bet_smooth | 1.14 | 0.658 | -3.166 |
| B_uk_realistic_£1_bet_£50_£100_limits | 2.41 | 0.312 | -25.518 |
| C_au_ncpf_high_vol_£2_bet | 1.99 | 0.378 | -71.011 |
| D_eu_high_roller_£5_bet_long_session | 6.13 | 0.122 | -204.068 |
| E_corner_zero_drift_symmetric | 2.00 | 0.500 | 0.000 |
| F_corner_player_edge_positive_drift | 2.18 | 0.345 | 3.108 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form auto-spin dual-stop disclosure kernel ready for UKGC RTS 13B + MGA PPD §19 + AU NCPF Schedule 5 audit submission. Distinct from W157 (single-barrier bust), W161 (one-sided max drop), W163/W165 (bet-progression), W167 (cycle compensation), W148 (payout cap).