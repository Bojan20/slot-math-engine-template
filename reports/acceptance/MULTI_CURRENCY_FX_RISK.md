# MULTI_CURRENCY_FX_RISK — Multi-Currency FX Settlement Risk Analyzer Acceptance

Generated: `2026-05-19T11:19:28.999Z`

## Headline

**6/6 configs PASS** at 3000 MC T-day correlated P&L paths each.

Closes W232 — **89. closed-form solver, first TREASURY/FX RISK kernel** u portfolio (UKGC RTS 16 + MGA Treasury §30 + EU EBA FX 2024 Annex X + AU NCPF Sch.13 + IFRS 7 §31-42 + Basel III FRTB).

## Method

Markowitz mean-variance portfolio:
  - **Var[ΔV] = Σ_i Σ_j V_i · V_j · σ_i · σ_j · ρ_{ij}** (quadratic form)

Basel III T-day VaR:
  - **VaR_α(T) = z_α · √T · √Var[ΔV]**
  - z_α via Beasley-Springer-Moro (1e-9 accuracy)

Expected Shortfall (CVaR, coherent):
  - **ES_α = √T · √Var · φ(z_α) / (1 − α) ≥ VaR_α**

Hedging:
  - σ_effective = σ · (1 − h + h · basisRisk)
  - hedgingCost = c · |V| · h annualized

IFRS 7 §40 sensitivity disclosure: 10% per-currency shock.

Herfindahl-Hirschman concentration: HHI = Σ (V_i/V_total)².

UKGC RTS 16: VaR < 50% ownFunds ∧ HHI < 0.7.

MC: 3K T-day P&L paths × Cholesky-correlated Normal draws.

## Results

| config | regime | N | portfolio | unhedged VaR | hedged VaR | HHI | hedge cost/y | comply | pass |
|---|---|---|---|---|---|---|---|---|---|
| A_uk_operator_GBP_EUR_USD | UK_BASELINE | 3 | 2000000 | 71896 | 46895 | 0.38 | 760 | ✅ | ✅ |
| B_eu_5_currencies_diversified | EU_DIVERSIFIED | 5 | 2000000 | 62522 | 35095 | 0.28 | 1152 | ✅ | ✅ |
| C_au_AUD_NZD_exotic_basket | AU_EXOTIC | 4 | 980000 | 47644 | 32960 | 0.43 | 534 | ✅ | ✅ |
| D_global_high_concentration_single_USD | CORNER_CONCENTRATION | 3 | 10000000 | 420751 | 231413 | 0.81 | 5000 | ❌ | ✅ |
| E_crypto_exposure_high_vol | CRYPTO_HEAVY | 3 | 1000000 | 159520 | 120437 | 0.38 | 1200 | ✅ | ✅ |
| F_corner_full_hedging_zero_risk | CORNER_FULL_HEDGE | 3 | 2000000 | 71896 | 1438 | 0.38 | 6000 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| hedged portfolioStd rel CF vs MC | ≤ 0.1 |
| VaR ratio CF vs MC | factor 1.5 (empirical quantile variance) |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form multi-currency FX VaR kernel ready for UKGC RTS 16 + MGA Treasury + EU EBA FX Risk Reporting + AU NCPF + IFRS 7 + Basel III FRTB audit submission. **89. solver — first TREASURY/FX RISK kernel** u portfolio. Komplementarno sa W227 (single-currency GGR VaR) — ovaj proširuje na multi-currency treasury-side FX exposure sa Markowitz covariance + hedging optimization + IFRS 7 disclosure.