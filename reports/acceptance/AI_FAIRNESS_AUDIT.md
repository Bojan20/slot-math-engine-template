# AI_FAIRNESS_AUDIT — AI/ML Player Profiling Fairness Audit Analyzer Acceptance

Generated: `2026-05-19T11:53:09.133Z`

**6/6 configs PASS** @ 500 MC sampling runs each.

## Results

| config | regime | DP | EO_TPR | DI | score | EU AI Act | UKGC | pass |
|---|---|---|---|---|---|---|---|---|
| A_uk_fair_baseline | FAIR_BASELINE | -0.050 | 0.020 | 0.86 | 0.67 | ✅ | ✅ | ✅ |
| B_eu_perfect_fairness | GOLD_STANDARD | 0.000 | 0.000 | 1.00 | 1.00 | ✅ | ✅ | ✅ |
| C_us_disparate_impact_failure | DI_FAILURE | -0.250 | 0.150 | 0.37 | 0.22 | ❌ | ❌ | ✅ |
| D_no_oversight_no_docs | NO_OVERSIGHT | -0.020 | 0.010 | 0.94 | 0.88 | ❌ | ❌ | ✅ |
| E_strict_thresholds_audit_grade | STRICT_AUDIT | -0.010 | 0.000 | 0.97 | 0.84 | ✅ | ✅ | ✅ |
| F_equalized_odds_failure | EO_FAILURE | 0.000 | 0.250 | 1.00 | 0.50 | ❌ | ✅ | ✅ |

**Overall: ✅ PASS**