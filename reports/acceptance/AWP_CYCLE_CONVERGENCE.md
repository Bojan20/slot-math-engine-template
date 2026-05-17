# AWP_CYCLE_CONVERGENCE — AWP Cycle Convergence Analyzer Acceptance

Generated: `2026-05-17T09:58:04.297Z`

## Headline

**6/6 configs PASS** at 3000 MC cycles each = 18.0K total cycle simulations.

Closes Faza 12 ext (post-W100): ✅ "AWP Cycle Convergence Analyzer" (Wave 167 — 55th solver, first kernel above existing `compensatedMath.ts` IR state machine).

## Method

Closed-form CLT-Bachelier projection from partial-cycle snapshot:
  - E[r_N] = (P_n + m·R*·b)/(N·b)
  - stdDev[r_N] = σ·√m / N  (shrinks to 0 as cycle completes)
  - P(|D_N|>τ) = (1−Φ((τ−μ)/σ)) + Φ((−τ−μ)/σ)
  - compensationHintRecommended = −E[D_N]
  - cycleHealthScore = 1 − P(exceeds)

MC: 3K cycles per config, Gaussian per-spin payout draws, mulberry32 RNG.

## Configs — UK regulator AWP disclosure table

| Config | Pass | N | R* | τ | n (% prog) | E[r_N] CF/MC | stdDev CF/MC | P(>τ) CF/MC | health |
|---|---|---|---|---|---|---|---|---|---|
| A_uk_b3_mid_cycle_on_track | ✅ | 10000 | 70% | 4pp | 5000 (50%) | 0.7000/0.7003 | 0.0212/0.0211 | 5.93%/5.43% | 0.941 |
| B_uk_b3_early_cycle_below_target | ✅ | 10000 | 70% | 4pp | 1000 (10%) | 0.6950/0.6944 | 0.0285/0.0284 | 16.63%/16.57% | 0.834 |
| C_uk_d_high_rtp_late_cycle | ✅ | 20000 | 90% | 3pp | 18000 (90%) | 0.8955/0.8955 | 0.0045/0.0044 | 0.00%/0.00% | 1.000 |
| D_uk_b3a_high_vol_early | ✅ | 15000 | 85% | 5pp | 3000 (20%) | 0.8400/0.8398 | 0.0365/0.0364 | 18.68%/18.67% | 0.813 |
| E_corner_cycle_just_started | ✅ | 10000 | 70% | 4pp | 0 (0%) | 0.7000/0.6996 | 0.0300/0.0296 | 18.24%/16.73% | 0.818 |
| F_corner_cycle_at_end_outside_band | ✅ | 10000 | 70% | 4pp | 10000 (100%) | 0.6000/0.6000 | 0.0000/0.0000 | 100.00%/100.00% | 0.000 |

## Compliance context

- **UKGC LCCP** — B3/B3A/C/D AWP finite-cycle convergence proof
- **MGA AWP §15** — cycle deviation tolerance disclosure
- **EU GA 2024** — compensated math disclosure mandate
- **AU NCPF Class III** — finite-cycle disclosure

Industry use: UKGC operator pre-deployment certification, MGA AWP audit replay,
EU GA compensated math compliance proof, on-floor machine state introspection.