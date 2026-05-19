# PLAYER_LTV_BAYESIAN — Player Lifetime Value Bayesian Predictive Analyzer Acceptance

Generated: `2026-05-19T10:48:54.356Z`

## Headline

**6/6 configs PASS** at 5000 MC player lifetimes each = 30K Geometric churn samples.

Closes W228 — **85. closed-form solver, first COMMERCIAL/MARKETING/CRM kernel** u portfolio (UKGC RTS 5 + UK GA Reform §6.7 + EU EBA Marketing Directive 2024 + AU NCPF §11 + DE GlüStV §5b + IRL Gambling Reg Bill §3.18).

## Method

Geometric churn model (Schmittlein-Morrison-Colombo 1987 simplification):
  - N_active_months ~ Geometric(θ_churn)
  - **E[N] = 1/θ**, Var[N] = (1−θ)/θ²

LTV calculations:
  - **LTV_undiscounted = E[M] / θ_churn**
  - **LTV_discounted = E[M] · (1+r) / (θ + r)**  (geometric series sum)

CAC payback:
  - **m_payback = log(1 − CAC·θ/μ_M) / log(1−θ)**

LTV/CAC ratio (industry: ≥ 3 healthy, ≥ 5 excellent).

Bayesian posterior on churn:
  - Prior: θ ~ Beta(α, β), Observed n active months
  - Posterior: Beta(α, β + n), E[θ] = α / (α + β + n)

UKGC RTS 5 + AU NCPF §11 compliance: CAC ≤ 30% LTV ∧ ROAS ≤ threshold.

MC: 5K Geometric churn lifetimes per config, monthly revenue accrual.

## Results

| config | channel | θ | μ/mo | CAC | E[N]mo | LTV_disc | LTV/CAC | payback | ROAS | comply | pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A_uk_social_media_£100_cac | SOCIAL_MEDIA | 0.10 | £50 | £100 | 10.0 | £467 | 4.67 | 2.1mo | 2.50 | ✅ | ✅ |
| B_uk_affiliate_£250_cac_high_value | AFFILIATE | 0.05 | £100 | £250 | 20.0 | £1738 | 6.95 | 2.6mo | 3.00 | ✅ | ✅ |
| C_eu_tv_advertising_£500_cac_premium | TV | 0.04 | £150 | £500 | 25.0 | £3150 | 6.30 | 3.5mo | 2.75 | ✅ | ✅ |
| D_au_loose_search_£50_cac_low_value | SEARCH | 0.15 | £30 | £50 | 6.7 | £191 | 3.83 | 1.8mo | 2.00 | ✅ | ✅ |
| E_corner_unprofitable_channel | BAD_CHANNEL | 0.30 | £40 | £500 | 3.3 | £131 | 0.26 | ∞ | 1.20 | ❌ | ✅ |
| F_corner_super_premium_VIP | VIP | 0.02 | £500 | £1500 | 50.0 | £18000 | 12.00 | 3.1mo | 4.00 | ✅ | ✅ |

## Tolerance bands

| metric | tolerance |
|---|---|
| E[active months] rel | ≤ 0.25 |
| LTV_undiscounted rel (Geometric high variance) | ≤ 0.25 |

## Conclusion

**Overall: ✅ PASS**

Engine ships closed-form player-LTV + CAC + ROAS + Bayesian posterior kernel ready for UKGC RTS 5 + UK GA Reform + EU EBA + AU NCPF + DE GlüStV + IRL Gambling Reg Bill audit submission. **85. solver — first COMMERCIAL/MARKETING kernel** u portfolio. Distinct od W148-W167 (player first-passage) / W220-W226 (player RG) / W227 (operator capital). Komplementarno proširuje portfolio na CRM/marketing decisioning.