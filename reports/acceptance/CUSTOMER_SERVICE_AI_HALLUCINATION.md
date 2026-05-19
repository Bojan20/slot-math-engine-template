# CUSTOMER_SERVICE_AI_HALLUCINATION

**6/6 PASS**

| config | regime | halluc | detected | cost | safety | EU AI Act | pass |
|---|---|---|---|---|---|---|---|
| A_uk_chatbot_compliant | UK_COMPLIANT | 20000 | 1900 | £9550000 | 0.64 | ✅ | ✅ |
| B_eu_strict_high_sampling | EU_STRICT | 30000 | 5880 | £27320000 | 0.69 | ✅ | ✅ |
| C_low_sampling_corner | CORNER_LOW_OVERSIGHT | 50000 | 800 | £24700000 | 0.45 | ❌ | ✅ |
| D_high_hallucination_unsafe | CORNER_UNSAFE | 100000 | 4500 | £95750000 | 0.29 | ✅ | ✅ |
| E_au_mature_ai_safety | AU_MATURE | 15000 | 2183 | £11604000 | 0.70 | ✅ | ✅ |
| F_full_human_review_costly | CORNER_FULL_REVIEW | 20000 | 19800 | £5100000 | 0.92 | ✅ | ✅ |
