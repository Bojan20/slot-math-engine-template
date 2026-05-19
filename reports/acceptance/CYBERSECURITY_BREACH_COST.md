# CYBERSECURITY_BREACH_COST — Cybersecurity Breach Cost Quantification Analyzer Acceptance

Generated: `2026-05-19T11:40:46.598Z`

## Headline

**6/6 configs PASS** @ 3000 MC compound-Poisson campaigns each.

Closes W234 — **91. closed-form solver, first CYBERSECURITY/RESILIENCE kernel** u portfolio.

## Method

Compound Poisson aggregate loss model:
  - N_breaches ~ Poisson(λ_effective · T), λ_eff = λ · exp(−k·Investment)
  - C_breach ~ Pareto(α, x_m), E[C] = α·x_m/(α−1), Var[C] = α·x_m²/((α−1)²·(α−2)) (α>2)
  - E[S_T] = λ·T·E[C], sd[S_T] = √(λ·T·E[C²])
  - VaR_α(T) = E[S_T] + z_α · sd[S_T] (CLT approximation)

Investment ROI: ΔE[S]/I − 1.

NIS2 compliance: λ_eff ≤ 0.10/yr ∧ I/revenue ≥ 1% ∧ responseHours ≤ 72.

## Results

| config | tier | λ | α | xm | effRate | E[loss] | VaR | ROI | fine cap | score | NIS2 | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_mid_tier_compliant_baseline | UK_MID | 0.08 | 2.5 | £1000K | 0.076 | £380K | £2866K | -98.7% | £61K | 0.50 | ✅ | ✅ |
| B_uk_large_high_value_target | UK_LARGE | 0.3 | 1.8 | £3000K | 0.182 | £3685K | £96864K | -84.1% | £2184K | 0.50 | ❌ | ✅ |
| C_eu_nis2_essential_service | EU_NIS2 | 0.15 | 2 | £1500K | 0.123 | £1105K | £31358K | -91.8% | £307K | 0.51 | ❌ | ✅ |
| D_au_small_under_investment | AU_SMALL | 0.2 | 2.2 | £800K | 0.199 | £877K | £5651K | -97.1% | £50K | 0.46 | ❌ | ✅ |
| E_corner_extreme_heavy_tail | CORNER_HEAVY_TAIL | 0.1 | 1.3 | £2000K | 0.086 | £3730K | £40959K | -92.0% | £430K | 0.51 | ✅ | ✅ |
| F_corner_best_in_class_low_breach | CORNER_BEST | 0.02 | 3 | £500K | 0.004 | £10K | £243K | -99.6% | £1K | 0.69 | ✅ | ✅ |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form cybersecurity breach-cost kernel ready for EU NIS2 + UK Cyber Resilience + UKGC LCCP 4.1 + ICO GDPR audit. **91. solver — first CYBERSECURITY kernel** u portfolio.