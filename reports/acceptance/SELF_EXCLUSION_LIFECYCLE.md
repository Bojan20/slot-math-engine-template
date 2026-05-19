# SELF_EXCLUSION_LIFECYCLE — Self-Exclusion (GAMSTOP) Lifecycle Markov Analyzer Acceptance

Generated: `2026-05-19T09:52:33.466Z`

## Headline

**6/6 configs PASS** at 300 × 1825-day MC lifecycle sims = 3.29M simulated player-days.

Closes W225 — **82. closed-form solver, first LIFECYCLE MARKOV kernel** u portfolio (UKGC RTS 7B GAMSTOP mandatory + MGA PPD §23 + EU EBA Annex V cross-border + AU NCPF Sch.9 BetStop 2025 + DE OASIS).

## Method

3-state continuous-time Markov chain {ACTIVE, EXCLUDED, PERMANENT}:
  - A → E rate: **λ_se** (self-exclusion onset, from upstream W224 vulnerability)
  - E → A rate: **1/D_se** (mean SE duration expiry)
  - * → P rate: **λ_p** (permanent absorption)

Stationary distribution (transient sub-chain {A, E}):
  - π_e / π_a = λ_se · D_se  (balance condition)
  - **π_a = 1/(1 + λ_se · D_se)**
  - **π_e = (λ_se · D_se)/(1 + λ_se · D_se)**

Annual disclosure:
  - annualSelfExclusionEpisodes = π_a · 365 · λ_se
  - expectedDaysActivePerYear = π_a · 365
  - expectedDaysExcludedPerYear = π_e · 365
  - expectedDaysToFirstSE = 1/λ_se (Exponential mean)
  - expectedDaysToPermanent = 1/λ_p (Geometric absorption)

UKGC RTS 7B compliance: D_se_min ≥ 180d ∧ D_se_max ≤ 1825d ∧ cooling ≥ 24h.

MC: 300 × 1825-day discrete-time chain simulations per config, daily transition probabilities via continuous→discrete approximation 1−exp(−λ_se).

## Results

| config | jurisd. | λ_se/d | D_se | π_a | π_e | CF annual | MC annual | rel | harm red | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_gamstop_typical_user | UKGC | 0.0030 | 180d | 0.649 | 0.351 | 0.71 | 0.67 | 0.051 | 0.351 | ✅ | ✅ |
| B_uk_high_risk_user | UKGC | 0.0100 | 180d | 0.357 | 0.643 | 1.30 | 0.94 | 0.276 | 0.643 | ✅ | ✅ |
| C_au_betstop_stricter_12mo | AU_NCPF | 0.0030 | 365d | 0.477 | 0.523 | 0.52 | 0.53 | 0.009 | 0.523 | ✅ | ✅ |
| D_de_oasis_typical | DE_OASIS | 0.0020 | 365d | 0.578 | 0.422 | 0.42 | 0.41 | 0.017 | 0.422 | ✅ | ✅ |
| E_corner_modest_risk_user | UKGC | 0.0010 | 180d | 0.847 | 0.153 | 0.31 | 0.29 | 0.050 | 0.153 | ✅ | ✅ |
| F_corner_severe_player | UKGC | 0.0300 | 365d | 0.084 | 0.916 | 0.92 | 0.77 | 0.155 | 0.916 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| stationary fraction (π_e vs MC) | ≤ 0.08 abs |
| annual SE episodes rel | ≤ 0.4 |
| E[first SE day] rel (Exponential variance) | ≤ 0.4 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form GAMSTOP-class lifecycle Markov kernel ready for UKGC RTS 7B + MGA PPD §23 + EU EBA Annex V + AU NCPF Sch.9 + DE OASIS audit submission. **82. solver — first LIFECYCLE MARKOV kernel** u portfolio. Distinct od W148-W167 (within-session) / W220 (single-session boundary) / W222 (per-spin time) / W223 (multi-DAY cool-off) / W224 (multi-MONTH spend). Ovo je LIFETIME 3-state absorbing Markov.