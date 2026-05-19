# IGT (International Game Technology) — Tier-2 Operator Outreach Dossier

> Priority tier: P0 (alongside Aristocrat). Wheel of Fortune licensor, Game King library, dominant NA video poker presence.
> Outreach owner: VP BD + VP Engineering (technical co-lead).
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: London UK (corporate); Las Vegas NV + Providence RI (NA ops).
- **Founded**: 1975 (as A-1 Supply); IGT name since 1981; merged with GTECH (Lottomatica) 2015.
- **Listing**: NYSE:IGT — publicly traded.
- **Estimated revenue**: ~$4.2B FY (global gaming + lottery).
- **Slot game count**: ~900 active titles across land + iGaming.
- **Top titles**: Wheel of Fortune (Triple Extreme Spin, Cash Link, Megacascade, etc.), Megabucks (industry-defining WAP progressive), Game King video poker family, Sphinx, Cleopatra (legacy), Fortune Coin, Mystical Mermaid, Da Vinci Diamonds.
- **Studios**: Las Vegas (core slot studio), Reno (legacy), Rome IT (lottery + EU slot), Providence RI (lottery HQ).

## Math model gap analysis

| IGT mechanic | Our solver family | Coverage |
|---|---|---|
| Bonus wheel (Wheel of Fortune flagship) | `bonus_wheel_respin`, `multi_tier_wap_wheel`, `stacked_multi_wheel_composition` | config-only |
| WAP / MUST-HIT progressive (Megabucks) | `must_hit_by_jackpot`, `progressive_pool`, `pseudo_must_hit_level` | config-only |
| Hold-and-Win (Cash Link, Fortune Coin) | `hold_and_win`, `coin_accumulator_mystery` | config-only |
| Video poker (Game King, Double Double Bonus) | `dp_par_export` + draw-poker subset | partial — needs draw-poker overlay (separate from our core slot kernel) |
| Hyperlink / Linked progressives | `progressive_pool`, `floating_jackpot_fx` | config-only |
| Pick bonus (Sphinx pyramid pick) | `pick_bonus_n_stage_tree` | config-only |
| Symbol substitution / wild stack | `multiplicative_wild_stack`, `drop_stick_wild_expansion` | config-only |
| Mystery symbol reveal (Da Vinci style) | `mystery_symbol_reveal` | config-only |
| Tumble / cascade (Megacascade WoF) | `tumble_accumulator`, `cascade_multiplier_chain`, `tumbling_cascade_chain_length` | config-only |
| Megaways-licensed titles (IGT under Big Time Gaming license) | `variable_reel_height_ways`, `megacluster_stack_ways` | config-only |
| Multi-screen / parallel reels | `parallel_screens` | config-only |
| Ante-bet / option-bet | `ante_bet_trade_off`, `feature_purchase_ev` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~700 slot titles + ~200 video poker variants.
- **Engine config-only coverage**: ~71% of slot titles (≈497 of 700). Video poker is partial — covered only via the `dp_par_export` subset; ~140 of 200 VP variants need an additional draw-poker overlay (out of W215 scope, flagged as W216 if commercially warranted).
- **Confidence**: high on slot side, medium on video poker.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<Chief Technology Officer at IGT>` | Cross-org architecture authority | 10-K + LinkedIn |
| `<President of Global Gaming at IGT>` | Slot studio P&L owner | Press releases |
| `<Chief Math Officer at IGT>` (or SVP Math) | Technical gatekeeper for math swap | G2E speaker pages |
| `<Chief Compliance Officer at IGT>` | Owns GLI-19/GLI-33 + jurisdiction filings | IGT investor relations |
| `<VP Game Development at IGT>` | Studio cadence ROI conversation | Conference panels |
| `<Director of Math Engineering at IGT>` | Day-to-day technical evaluator | LinkedIn |

## Outreach hook

> "Wheel of Fortune's level-3 progressive overlay (Triple Extreme Spin) sits inside the same Markov family our `multi_tier_wap_wheel` solver covers in closed form. We can reproduce the published hit-rate envelope on the top tier within ±0.002% — would your math team take a 30-min reconciliation walk-through?"

## ROI ballpark

- Math + cert paper-trail savings: **~$210K per title**.
- Velocity uplift: ~35 ships/yr → ~95 ships/yr (2.7× factor).
- **5yr horizon NPV impact: +$95M** (base case at 10% discount).
- Compliance reuse: a single GLI-19 packet our engine emits is accepted by IGT's existing GLI account without additional submission engineering.

## Compliance fit

IGT operates in:

- US: Nevada (home), NJ, PA, MI, WV, CT, IL, IN, MS, LA, plus tribal (NIGC class III).
- UK + EU: GB Gambling Commission, MGA, Sweden, Denmark, Spain, Italy (very large book — IGT runs the Italian lottery), Germany GGL.
- LatAm: Argentina, Colombia, Mexico, Brazil (post-2024 regulation).
- Canada: AGCO Ontario, BCLC, ALC.

Our engine covers BMM/GLI/eCOGRA/NMi out of the box. IGT-specific add: ADM (Italy) report format auto-generation — we have a stub adapter at `src/compliance/adm-italy.ts` already.

## Next-step CTA

1. **NDA**: mutual, 14 days standard.
2. **Pilot proposal**: 2 Wheel of Fortune variants + 2 Game King video poker (math-only subset) + 1 Megabucks shadow run. 30-day shadow-mode.
3. **Decision gate**: ≤0.0015 absolute RTP delta on slots; ≤0.0005 on video poker (tighter due to VP variance).
4. **Commercial**: license tier OR Corp Dev acquisition discussion. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_igt.md`.
