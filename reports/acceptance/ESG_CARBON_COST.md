# ESG_CARBON_COST — ESG Compliance Score & Carbon-Cost Optimizer Acceptance

Generated: `2026-05-19T11:47:08.374Z`

**6/6 configs PASS** @ 1000 MC sensitivity runs each.

## Results

| config | tier | kWh | r | total tCO₂ | carbonCost | E | ESG | CSRD | TCFD | pass |
|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_csrd_compliant_baseline | UK_COMPLIANT | 5.0GWh | 0.5 | 875 | £66K | 0.56 | 0.66 | ✅ | ✅ | ✅ |
| B_eu_large_high_emissions | EU_LARGE | 50.0GWh | 0.2 | 15500 | £1395K | 0.13 | 0.43 | ✅ | ❌ | ✅ |
| C_au_renewable_powered_leader | AU_LEADER | 8.0GWh | 1 | 180 | £9K | 0.85 | 0.84 | ✅ | ✅ | ✅ |
| D_non_compliant_no_target | NON_COMPLIANT | 10.0GWh | 0.1 | 4050 | £304K | 0.11 | 0.30 | ❌ | ❌ | ✅ |
| E_high_carbon_price_eu_ets_shock | CARBON_SHOCK | 20.0GWh | 0.4 | 3600 | £432K | 0.64 | 0.66 | ✅ | ✅ | ✅ |
| F_micro_operator_low_intensity | MICRO_GREEN | 0.2GWh | 0.8 | 32 | £2K | 0.67 | 0.73 | ✅ | ✅ | ✅ |

**Overall: ✅ PASS**