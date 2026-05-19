# CUSTOMER_AFFORDABILITY_STRATIFICATION — Customer Affordability Stratification Analyzer Acceptance

Generated: `2026-05-19T08:03:26.591Z`

## Headline

**6/6 configs PASS** at 3000 year-long MC sims each = 216K monthly Log-Normal spend samples.

Closes W224 — **81. closed-form solver, first AFFORDABILITY kernel** u portfolio (UKGC RTS 14E mandatory £100 / £500 / £2000 affordability checks Aug 2024 — £19M Entain fine + £5.9M Flutter fine 2024-2025 trigger).

## Method

Player monthly spend modeled as Log-Normal (Gainsbury 2020, Auer-Griffiths 2017):
  - X ~ Log-Normal(μ, σ²), E[X] = exp(μ + σ²/2), Median = exp(μ)
  - CDF: F(x) = Φ((ln(x) − μ) / σ)
  - Quantile: F^(-1)(p) = exp(μ + σ · Φ^(-1)(p)) via Beasley-Springer-Moro

Affordability tier classification (UKGC RTS 14E defaults):
  - T0 < £lowHarm/2 (no check)
  - T1 [£lowHarm/2, £lowHarm) (light)
  - T2 [£lowHarm, £enhanced) (low-harm review)
  - T3 [£enhanced, £fullCheck) (Equifax enhanced)
  - T4 ≥ £fullCheck (full income verification)

Annual projection: per-month iid → E[months above threshold] = 12 · (1 − F(threshold))

K-of-M rolling-window trigger via Binomial:
  - P_trigger = 1 − Σ_{k=0..K-1} C(M, k)·p^k·(1−p)^(M−k)
  - where p = P(month above enhanced threshold)

MC: per config 3K year-long simulations (36K monthly Log-Normal draws each), Box-Muller normal + exp transform.

## Results

| config | jurisd. | median | μ/σ | P>£100 CF | P>£100 MC | P>£500 CF | P>£500 MC | rolling/yr | vuln | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_typical_player_median_£85 | UKGC | £86 | 4.5/1.5 | 0.459 | 0.457 | 0.120 | 0.120 | 0.2 | 0.225 | ✅ | ✅ |
| B_uk_low_spender_median_£25 | UKGC | £25 | 3.2/0.8 | 0.040 | 0.038 | 0.000 | 0.000 | 0.0 | 0.016 | ✅ | ✅ |
| C_uk_high_roller_median_£600 | UKGC | £602 | 6.4/1.0 | 0.964 | 0.962 | 0.574 | 0.571 | 5.5 | 0.592 | ✅ | ✅ |
| D_au_ncpf_AUD1000_threshold_median_$200 | AU_NCPF | $200 | 5.3/1.4 | 0.500 | 0.497 | 0.125 | 0.125 | 0.2 | 0.241 | ❌ | ✅ |
| E_nl_ksa_EUR350_strict_median_€60 | NL_KSA | €60 | 4.1/1.3 | 0.349 | 0.346 | 0.088 | 0.088 | 0.1 | 0.168 | ✅ | ✅ |
| F_corner_problem_gambler_high_variance | UKGC | £200 | 5.3/2.5 | 0.609 | 0.606 | 0.357 | 0.355 | 2.6 | 0.405 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| E[X] mean rel | ≤ 0.08 |
| P(X > threshold) abs | ≤ 0.02 (all 3 tiers) |
| rolling triggers/year rel | ≤ 0.25 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form customer-affordability stratification kernel ready for UKGC RTS 14E + MGA PPD §22 + EU EBA + AU NCPF + NL KSA + CA AGCO audit submission. **81. solver — first AFFORDABILITY kernel** u portfolio. Distinct od W148/W154/W157/W161/W163/W165/W167 (single-event/single-session) / W220 (single-session boundary) / W222 (per-spin time-rate) / W223 (multi-DAY cool-off count). Ovo je multi-MONTH spend-distribution stratification.