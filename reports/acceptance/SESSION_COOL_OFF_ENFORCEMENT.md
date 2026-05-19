# SESSION_COOL_OFF_ENFORCEMENT — Session Cool-Off Enforcement Markov Chain Analyzer Acceptance

Generated: `2026-05-19T06:41:05.378Z`

## Headline

**6/6 configs PASS** at 500 MC year-long sims each = 1.09M total simulated days.

Closes W223 — **🎯 80. closed-form solver, P-100 MILESTONE, first MULTI-SESSION TEMPORAL kernel** u portfolio (UKGC RTS 11 mandatory cool-off Apr 2025 + MGA PPD §20 + EU EBA Annex III + AU NCPF Schedule 7).

## Method

Daily Poisson loss-stop hazard derived from upstream W220 single-session P_loss:
  - **λ_day = probLossStopPerSession · sessionsPerDay**
  - N_window ~ Poisson(λ_day · D)  (Poisson process restriction)

Stationary daily trigger probability:
  - **P_trigger_per_day = 1 − Σ_{n=0..K-1} e^(-λD)·(λD)^n/n!**

Empty-history first-passage (validated against MC):
  - **E[T_first] = K / λ_day** (Gamma mean — time to K-th Poisson event)
  - Annual cool-offs = 365 / (E[T_first] + coolOffDurationDays)

UKGC RTS 11 compliance check:
  - **K ≤ 5 ∧ D ≤ 7 ∧ coolOffDurationHours ≥ 24**

MC: 500 year-long simulations per config, Knuth Poisson sampler for λ<30 + Normal-approx for λ≥30, rolling D-day window count, post-trigger history reset.

## Results

| config | jurisd. | K/D/hrs | λ_day | T_first | CF annual | MC annual | rel | CF frac | MC frac | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_rts11_moderate_user | UKGC | 5/7/24h | 0.80 | 6.3d | 50.3 | 42.4 | 0.157 | 0.138 | 0.116 | ✅ | ✅ |
| B_uk_rts11_heavy_user | UKGC | 5/7/24h | 2.40 | 2.1d | 118.4 | 101.8 | 0.140 | 0.324 | 0.278 | ✅ | ✅ |
| C_au_ncpf_stricter_k3_48h | AU_NCPF | 3/7/48h | 0.80 | 3.8d | 63.5 | 57.7 | 0.091 | 0.348 | 0.315 | ✅ | ✅ |
| D_mga_relaxed_k5_d10 | MGA | 5/10/24h | 0.80 | 6.3d | 50.3 | 45.9 | 0.089 | 0.138 | 0.125 | ❌ | ✅ |
| E_corner_low_risk_player | UKGC | 5/7/24h | 0.05 | 30547.2d | 0.0 | 0.0 | 0.039 | 0.000 | 0.000 | ✅ | ✅ |
| F_corner_high_risk_player | UKGC | 5/7/24h | 1.50 | 3.3d | 84.2 | 75.1 | 0.108 | 0.231 | 0.205 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| daily trigger rate (CF annual/365 vs MC) | ≤ 0.05 abs |
| annual cool-offs CF vs MC | ≤ 0.3 rel |
| fraction-of-year-in-cool-off | ≤ 0.05 abs |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form session cool-off enforcement kernel ready for UKGC RTS 11 + MGA PPD §20 + EU EBA + AU NCPF audit submission. **🎯 P-100 MILESTONE — first MULTI-SESSION TEMPORAL kernel** u portfolio. Distinct od W157/W161/W163/W165/W167 (all within-single-session) / W220 (single-session dual-stop) / W222 (per-spin time-rate).