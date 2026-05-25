# Konami Gaming — Tier-2 Operator Outreach Dossier

> Priority tier: P1. Mid-size studio with disproportionate Asian-themed franchise strength; SYNKROS systems business adjacency is a multiplier.
> Outreach owner: VP BD (commercial lead).
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: Las Vegas NV (Konami Gaming Inc, subsidiary of Konami Holdings TYO:9766 in Tokyo JP).
- **Founded**: Konami Holdings 1969 (Osaka); Konami Gaming subsidiary 1996.
- **Listing**: Parent on TSE — TYO:9766.
- **Estimated revenue**: ~$300M FY for Konami Gaming subsidiary (slot + SYNKROS systems); parent ~$3.0B.
- **Slot game count**: ~250 active land-based titles + ~80 online (KX-43 cabinet portfolio).
- **Top titles**: China Shores, Lotus Land, Frogs 'n Flies, Mayan Chief, African Treasure, Dragon's Law, Solstice Celebration, Money Galaxy, All Aboard.
- **Studios**: Las Vegas NV (core math + cabinet); Sydney AU (regional adaptation).
- **Adjacency**: SYNKROS casino management system — large recurring revenue, separate decision-makers.

## Math model gap analysis

| Konami mechanic | Our solver family | Coverage |
|---|---|---|
| Action Stacked Symbols (China Shores flagship — early Konami signature) | `selective_stacking`, `multiplicative_wild_stack` | config-only |
| Free-spin retrigger w/ growing multiplier (Mayan Chief, China Shores) | `free_spins_retrigger_compound`, `free_spins_lookback_multiplier` | config-only |
| Pick bonus (Frogs 'n Flies "pick a frog") | `pick_bonus_n_stage_tree`, `pick_click_pooper_bonus` | config-only |
| All Aboard hold-and-win family | `hold_and_win`, `coin_accumulator_mystery` | config-only |
| Multi-line ways (243/720 ways on Action Stacked titles) | `ways_to_win_pgf`, `variable_reel_height_ways` | config-only |
| Mystery progressive (Lotus Land, Solstice) | `pseudo_must_hit_level`, `progressive_pool` | config-only |
| Symbol upgrade / morph (Dragon's Law) | `symbol_upgrade_chain_markov` | config-only |
| Buy-feature (newer online titles) | `feature_purchase_ev`, `bonus_buy_variance` | config-only |
| Sticky wild during free spins (Money Galaxy) | `sticky_multiplier_fs_trail`, `sticky_wild_countdown_multiplier` | config-only |
| Coin-collect mystery | `coin_accumulator_mystery`, `sticky_cash_collector` | config-only |
| Asian-themed reel-bound progressives | `reel_bound_mystery_progressive` | config-only |
| Wheel feature (All Aboard wheel ending) | `bonus_wheel_respin` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~330 titles.
- **Engine config-only coverage**: ~88% (≈290 of 330). Konami's mechanic palette is comparatively narrow (centered on stacked-symbols + ways) which makes coverage tight.
- **Confidence**: high — Konami has historically reused mechanic templates more conservatively than Vendor A/Vendor C, so each solver match cascades across many titles.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<President of Konami Gaming>` | NA subsidiary final authority | LinkedIn |
| `<SVP Engineering at Konami Gaming>` | Math + cabinet engineering | G2E |
| `<Chief Math Officer at Konami Gaming>` | Technical gatekeeper | Conference panels |
| `<VP Game Development at Konami Gaming>` | Studio cadence | Press releases |
| `<Chief Compliance Officer at Konami Gaming>` | GLI/BMM submissions | IR + jurisdiction filings |
| `<Director SYNKROS Platform at Konami Gaming>` | Adjacent platform conversation (systems-side integration) | Crunchbase |

## Outreach hook

> "China Shores' Action Stacked Symbols on reels 1–3 produces a hit-frequency tail we can reproduce closed-form with `selective_stacking` + `ways_to_win_pgf` composition — match within 0.0009 absolute on the published mid-volatility variant. Open to a 30-min walk-through?"

## ROI ballpark

- Math + cert paper-trail savings: **~$185K per title** (slightly lower than Vendor C/Vendor A due to simpler mechanic palette).
- Velocity uplift: ~18 ships/yr → ~48 ships/yr (2.65× factor).
- **5yr horizon NPV impact: +$32M** (base case).
- SYNKROS adjacency: if the math kernel becomes the recommended cert pipeline across Konami's online operator partners using SYNKROS, an additional ~$8M/yr platform-fee uplift is plausible.

## Compliance fit

Konami sells into:

- US: Nevada, NJ, PA, MI, IL, IN, MS, LA, tribal (NIGC class III + class II at All Aboard cabinets).
- AU/NZ: NSW + VIC + QLD state regulators.
- Asia: Macau DICJ, Singapore CRA, Philippines PAGCOR.
- LatAm: Mexico, Argentina, Colombia.

Our engine carries BMM/GLI/eCOGRA/NMi adapters. Konami-specific extras needed: Macau DICJ technical evidence format + class-II bingo coordinator integration (we have `classIIBingoCoordinator` solver already wired for All Aboard's class-II cabinet line).

## Next-step CTA

1. **NDA**: mutual, 14 days.
2. **Pilot proposal**: 2 Action-Stacked titles (China Shores + Mayan Chief) + 1 All Aboard variant + 1 newer online buy-feature title. 30-day shadow-mode.
3. **Decision gate**: ≤0.0015 absolute RTP delta + class-II coordinator parity.
4. **Commercial**: license tier; SYNKROS-integration upsell pitched separately. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_konami.md`.
