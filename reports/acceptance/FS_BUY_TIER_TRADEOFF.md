# FS_BUY_TIER_TRADEOFF — Free Spins Buy + Tier Escalation Trade-Off Acceptance

Generated: `2026-05-16T08:23:05.436Z`

## Headline

**6/6 configs PASS** at 50000 MC trials each.

Closes Faza 4.8 ext (post-W100): ✅ "Free Spins Buy + Tier Escalation Trade-Off" (Wave 130).

## Method

Closed-form decision-math:
  - RTP_t = E[Y]/buyCost, netEdge = RTP_t − 1
  - σ_relative = σ/buyCost, Sharpe = (RTP-1)/σ_rel
  - uplift_t = (RTP_t − RTP_b)·buyCost (absolute)
  - premium_t = (RTP_t − RTP_b)/RTP_b · 100 (% relative)
  - 2σ crossover N* = 4σ_rel²/(RTP-1)² (∞ za fair)
  - Decision modes: argmax RTP / Volatility / Sharpe / Payout
  - Optional adoptionFractions za weighted-RTP/revenue
  - **bonusBuyBanImpactPercent** = counterfactual RTP loss if banned

MC: 50K Gaussian-approx trials per tier (sanity check for CF moments, ne actual distribution).

## Configs

| Config | Pass | Tiers | argmaxRTP | Ban impact% |
|---|---|---|---|---|
| A_pragmatic_bigger_bass_buy | ✅ | 2 | super_buy | 1.04% |
| B_hacksaw_money_hunt_3tier | ✅ | 3 | expensive | 1.18% |
| C_push_razor_shark_50x_buy | ✅ | 1 | standard | 0.10% |
| D_nolimit_mental_xways_premium | ✅ | 2 | normal_buy | 0.00% |
| E_aus_ncrg_ban_impact_disclosure | ✅ | 2 | super_buy | 0.35% |
| F_corner_fair_tier | ✅ | 1 | fair | 3.63% |

## Compliance context

- **UKGC RTS 14** — per-tier RTP disclosure required
- **MGA PPD §11.f** — operator buy-bonus tier transparency
- **Australian NCRG** — Bonus Buy ban; impact computed kao counterfactual RTP loss
- **Belgian regulator** — Bonus Buy ban; same impact disclosure metric
- Industry use: Pragmatic Bigger Bass family, Hacksaw Money Hunt tiers, Push Razor
  Shark 50x, Nolimit Mental Bonus Buy + xWays, Stakelogic Megaways Bonus Buy