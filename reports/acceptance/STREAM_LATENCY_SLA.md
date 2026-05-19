# STREAM_LATENCY_SLA

**6/6 PASS**

| config | regime | median ms | breach% | refund | UK RTS 14F | pass |
|---|---|---|---|---|---|---|
| A_uk_500ms_compliant | UK_COMPLIANT | 217 | 1.10% | £4011196 | ✅ | ✅ |
| B_eu_strict_300ms | EU_STRICT | 159 | 2.38% | £34788995 | ✅ | ✅ |
| C_high_latency_corner | CORNER_HIGH | 397 | 23.78% | £43401159 | ❌ | ✅ |
| D_us_loose_1000ms | US_LOOSE | 433 | 1.10% | £1002799 | ❌ | ✅ |
| E_au_excellent | AU_EXCELLENT | 105 | 0.00% | £15 | ✅ | ✅ |
| F_corner_high_variance | CORNER_VAR | 330 | 17.98% | £131222749 | ❌ | ✅ |
