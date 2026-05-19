# QUANTUM_RESISTANT_RNG

**6/6 PASS**

| config | regime | qubits | prob | ROI | score | NIST | pass |
|---|---|---|---|---|---|---|---|
| A_uk_rsa2048_baseline | UK_BASELINE | 4096 | 0.19 | 37.8 | 0.84 | ✅ | ✅ |
| B_eu_rsa4096_ahead | EU_AHEAD | 8192 | 0.99 | 1483.7 | 1.00 | ✅ | ✅ |
| C_us_rsa2048_no_hybrid | US_LAGGARD | 4096 | 0.87 | 359.7 | 0.35 | ❌ | ✅ |
| D_au_ecc256_modern | AU_ECC | 512 | 1.00 | 249.0 | 0.68 | ✅ | ✅ |
| E_corner_attacker_break_today | CORNER_BREAK | 4096 | 1.00 | 499.0 | 0.70 | ✅ | ✅ |
| F_corner_no_migration | CORNER_LAGGARD | 2048 | 1.00 | 9998.9 | 0.35 | ❌ | ✅ |
