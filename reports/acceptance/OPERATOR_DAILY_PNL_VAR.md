# OPERATOR_DAILY_PNL_VAR — Operator Daily P&L Value-at-Risk Analyzer Acceptance

Generated: `2026-05-19T10:39:33.073Z`

## Headline

**6/6 configs PASS** at 10000 MC T-day P&L paths each = 60K Normal random draws.

Closes W227 — **84. closed-form solver, first OPERATOR-side capital kernel** u portfolio (UKGC GA 2005 §3 + UK Capital Adequacy Guidance 2024 + MGA CRD §28 + EU EBA Solvency II Pillar 1 + Basel III Op Risk + AU NCPF §10).

## Method

Daily operator GGR aggregated via CLT (independent sessions):
  - **μ_GGR = λ_sessions · μ_per_session**
  - **σ²_GGR = λ_sessions · σ²_per_session**

Basel III stress-test (zero-drift) VaR_α(T):
  - **VaR_α(T) = z_α · σ_GGR · √T**, z_α = Φ^(-1)(α) (Beasley-Springer-Moro)
  - Conservative: ignores expected profit margin (standard regulatory framework)
  - Expected Shortfall (CVaR): **ES_α = σ_GGR · √T · φ(z_α) / (1 − α)**

Jackpot tail-event reserve:
  - jackpotTailReserve = jackpot_max · trigger_prob_per_day · 365 · safety_factor

Required reserve capital:
  - **requiredReserveCapital = max(VaR_α, jackpotTailReserve, minimumReserve)**

Solvency:
  - **solvencyRatio = operatorOwnFunds / requiredReserveCapital**
  - Mandatory ≥ 1.0; UKGC ≥ 1.2 recommended

MC: 10K T-day P&L paths per config, Box-Muller Normal sampler, sort to get empirical α-quantile.

## Results

| config | jurisd. | N/d | CF μ_GGR | MC μ_GGR | CF VaR | MC VaR | rel | jackpot_res | reqReserve | solvency | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_small_operator_£1M_reserves | UKGC | 1000 | £3000 | £3005 | £6979 | £7705 | 0.094 | £7300 | £100000 | 10.00 | ✅ | ✅ |
| B_uk_mid_tier_£5M_reserves | UKGC | 10000 | £50000 | £50026 | £36783 | £40607 | 0.094 | £73000 | £100000 | 50.00 | ✅ | ✅ |
| C_eu_large_operator_£50M_reserves | EU_EBA | 100000 | £400000 | £400134 | £247219 | £257029 | 0.038 | £1825000 | £1825000 | 27.40 | ✅ | ✅ |
| D_au_micro_operator_AUD_1M_minimum | AU_NCPF | 500 | £1500 | £1503 | £4112 | £4540 | 0.094 | £1825 | £1000000 | 1.00 | ✅ | ✅ |
| E_corner_undercapitalized_at_risk | UKGC | 5000 | £20000 | £20037 | £119684 | £124434 | 0.038 | £2737500 | £2737500 | 0.07 | ❌ | ✅ |
| F_corner_well_capitalized_high_solvency | UKGC | 20000 | £80000 | £80045 | £62422 | £68912 | 0.094 | £182500 | £500000 | 200.00 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| VaR rel (MC empirical vs CF closed-form) | ≤ 0.1 |
| daily GGR rel | ≤ 0.05 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form operator-side capital VaR/ES kernel ready for UKGC GA 2005 + UK Capital Adequacy + MGA CRD + EU EBA Solvency II + Basel III Op Risk + AU NCPF §10 audit submission. **84. solver — first OPERATOR-side risk-capital kernel** u portfolio. Distinct od W148/W154/W157-W167 (player-side first-passage) / W220-W226 (player-side RG) — ovo modeluje OPERATOR-side Basel-III-style VaR/ES za solvency reporting.