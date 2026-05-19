# KYC_AML_SANCTION_SCREENING — Operator KYC/AML Sanction-Screening Risk Analyzer Acceptance

Generated: `2026-05-19T10:56:43.052Z`

## Headline

**6/6 configs PASS** at 200 MC year-long screening campaigns.

Closes W229 — **86. closed-form solver, first AML/COMPLIANCE kernel** u portfolio (UKGC LCCP 3.5.5 Oct 2024 + UK MLR 2017 + EU AMLD6 + AU AUSTRAC + DE GwG §10 + FATF Rec 10/11). Trigger: Entain £18M / William Hill £19M / Betway £11M AML fine cascade 2022-2024.

## Method

FP/FN rate decomposition:
  - **FP_per_day = λ_new · (1 − p_match) · (1 − spec)**
  - **FN_per_day = λ_new · p_match · (1 − sens)**

Annual cost projection:
  - **total = FP_cost + FN_cost + overhead**

Bayesian Beta-Binomial posterior:
  - Prior θ ~ Beta(α, β), observed k hits in n screenings
  - Posterior: Beta(α + k, β + n − k)

Regulator detection + fine exposure:
  - **P_detection = 1 − (1 − P_audit)^expectedMissed**
  - **expectedAnnualFineExposure = P_detection · finePerViolation**

UKGC LCCP 3.5.5 compliance: sens ≥ 0.99 ∧ spec ≥ 0.95 ∧ cadence ≤ 1d.

MC: 200 year-long Poisson(λ_new) arrivals × per-player Bernoulli sanctions check × per-screening Bernoulli(sens|spec).

## Results

| config | tier | λ_new | sens | spec | CF FP | MC FP | CF FN | MC FN | total cost | fine exposure | risk | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_mid_tier_500_new_per_day | UK_MID | 500 | 0.99 | 0.98 | 3648 | 3648 | 0.91 | 0.94 | £739K | £921K | 0.07 | ✅ | ✅ |
| B_uk_large_5K_new_per_day | UK_LARGE | 5000 | 0.995 | 0.99 | 18241 | 18262 | 4.56 | 4.84 | £4469K | £16250K | 0.51 | ✅ | ✅ |
| C_eu_amld6_compliant_strict | EU_AMLD6 | 2000 | 0.999 | 0.99 | 7293 | 7303 | 0.73 | 0.80 | £1577K | £2292K | 0.09 | ✅ | ✅ |
| D_au_austrac_micro_operator | AU_AUSTRAC | 100 | 0.98 | 0.97 | 1095 | 1097 | 0.22 | 0.26 | £225K | £70K | 0.01 | ❌ | ✅ |
| E_corner_bad_screening_tool | CORNER_BAD | 1000 | 0.9 | 0.92 | 29177 | 29186 | 29.20 | 29.34 | £31438K | £15000K | 0.75 | ❌ | ✅ |
| F_corner_best_in_class | CORNER_BEST | 2000 | 0.9995 | 0.999 | 730 | 728 | 0.18 | 0.20 | £909K | £200K | 0.01 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| annual FP rel | ≤ 0.15 |
| annual FN rel (rare events) | ≤ 0.5 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form operator AML compliance economic-exposure kernel ready for UKGC LCCP 3.5.5 + UK MLR + EU AMLD6 + AU AUSTRAC + DE GwG + FATF audit submission. **86. solver — first AML/COMPLIANCE kernel** u portfolio. Distinct od W148-W167 (player gaming math) / W220-W226 (player RG) / W227 (operator capital) / W228 (commercial LTV). Sad pokriveno 6 dimenzija: gaming math + responsible gambling + operator capital + commercial CRM + AML compliance.