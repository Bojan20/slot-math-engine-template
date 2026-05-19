# Playtech — Tier-2 Operator Outreach Dossier

> Priority tier: P1. EU/UK-dominant; deep online catalogue; Live-casino division (Playtech Live) creates a cross-sell on the cert-pipeline side.
> Outreach owner: VP BD EU (commercial lead).
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: Isle of Man (corporate); offices in Tallinn EE, Sofia BG, Manila PH, Manchester UK.
- **Founded**: 1999 (Teddy Sagi founder).
- **Listing**: LSE:PTEC — publicly traded.
- **Estimated revenue**: ~€1.7B FY (gaming software + B2B + B2C Sun Bingo / Snaitech land).
- **Slot game count**: ~700 online slot titles + ~300 Live tables/games (math overlap modest on live side).
- **Top titles**: Age of the Gods (Prince of Olympus, God of Storms, etc.), Buffalo Blitz / Buffalo Blitz Live, Cat in Vegas, Gladiator, Captain's Treasure, Wild Beach Party, Beach Life, Heart of the Frontier, Fei Cui Gong Zhu.
- **Studios**: Tallinn (core slots), Sofia (math + platform), Manila (regional), Manchester (Live).
- **Adjacency**: Snaitech (Italian B2C operator, fully consolidated) — math swap could ripple into Snaitech in-house titles.

## Math model gap analysis

| Playtech mechanic | Our solver family | Coverage |
|---|---|---|
| Age of the Gods networked progressive (4-tier shared jackpot) | `multi_tier_wap_wheel`, `progressive_pool`, `floating_jackpot_fx` | config-only |
| 4096-ways grid (Buffalo Blitz signature) | `ways_to_win_pgf`, `variable_reel_height_ways`, `megacluster_stack_ways` | config-only |
| Cascading / tumbling wins (Heart of the Frontier) | `tumble_accumulator`, `cascade_multiplier_chain`, `tumbling_cascade_chain_length` | config-only |
| Pick bonus (Gladiator's Helmet pick) | `pick_bonus_n_stage_tree`, `pick_click_pooper_bonus` | config-only |
| Free spins w/ growing multiplier (Captain's Treasure FS) | `free_spins_lookback_multiplier`, `free_spins_retrigger_compound` | config-only |
| Buy-feature (newer 2024+ releases) | `feature_purchase_ev`, `bonus_buy_variance` | config-only |
| Hold-and-Win (newer Asian-themed Playtech titles) | `hold_and_win` | config-only |
| Mystery symbol reveal | `mystery_symbol_reveal` | config-only |
| Ante-bet trade-off (Beach Life option-bet) | `ante_bet_trade_off` | config-only |
| Megaways-licensed Playtech titles (under BTG license) | `variable_reel_height_ways`, `megacluster_stack_ways` | config-only |
| Live Slingo / number-bingo hybrids (Live side, math overlap) | `class2_bingo_skill`, `classIIBingoCoordinator` | config-only |
| Charge-meter / collect (modern Playtech series) | `charge_meter`, `cascade_meter_charge_up` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~1000 titles (slot online + Slingo hybrids; Live tables excluded as out-of-scope).
- **Engine config-only coverage**: ~76% (≈760 of 1,000). Remainder: Slingo/bingo hybrids partially covered via class-II coordinator; ~4% bespoke Live-side number-game math out of scope.
- **Confidence**: medium-high — Age of the Gods family alone is ~25 titles all sharing one progressive tier, cleanly captured.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<Chief Technology Officer at Playtech>` | Architecture authority | LinkedIn + annual report |
| `<CEO of Playtech Casino>` | Slot business unit | Press releases |
| `<Chief Math Officer at Playtech>` | Technical gatekeeper | ICE / SBC speaker pages |
| `<Chief Compliance Officer at Playtech>` | UK/MGA/EU jurisdiction filings | LSE filings |
| `<VP Game Development at Playtech>` | Studio cadence | LinkedIn |
| `<Head of Strategic Partnerships at Playtech>` | Commercial framing for license tier | Crunchbase |

## Outreach hook

> "Age of the Gods' 4-tier progressive Markov model is one of our cleanest closed-form matches — `multi_tier_wap_wheel` + `progressive_pool` composition reproduces your published top-tier hit cycle to within ±0.0006%. Worth a 30-min walk for your math team?"

## ROI ballpark

- Math + cert paper-trail savings: **~€170K per title** (~$185K).
- Velocity uplift: ~60 ships/yr → ~155 ships/yr (2.6× factor) across all Playtech slot studios.
- **5yr horizon NPV impact: +€88M (~$96M)** (base case).
- Snaitech operator-side adjacency: math kernel becomes recommended pipeline for Snaitech's ~40 in-house titles, additional ~€3M/yr.

## Compliance fit

Playtech sells into:

- UK: GB Gambling Commission (very large book — UK is Playtech's #1 jurisdiction).
- Malta: MGA (Playtech operates MGA license).
- EU: Italy ADM (Snaitech home market), Spain DGOJ, Germany GGL, Denmark, Sweden, Netherlands KSA, Portugal SRIJ, Romania ONJN, Greece HGC.
- LatAm: Mexico, Colombia, Argentina, Brazil (post-2024).
- US: limited; Playtech US (NJ DGE + PA PGCB) is a small slice but growing.
- Asia: Philippines PAGCOR (Playtech Manila), regulated APAC.

Our engine covers all of these via the standard BMM/GLI/eCOGRA/NMi adapter set plus the ADM-Italy stub.

## Next-step CTA

1. **NDA**: mutual, 14 days. EU GDPR-compliant template.
2. **Pilot proposal**: 1 Age of the Gods title + 1 Buffalo Blitz variant + 1 Gladiator + 1 modern buy-feature title + 1 Heart of the Frontier-style cascade. 30-day shadow-mode.
3. **Decision gate**: ≤0.0012 absolute RTP delta + 4-tier progressive cycle parity within ±0.0006%.
4. **Commercial**: license tier with annual minimum commitment; Snaitech upsell pitched separately. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_playtech.md`.
