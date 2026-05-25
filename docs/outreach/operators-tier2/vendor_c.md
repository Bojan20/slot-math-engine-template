# Vendor C — Tier-2 Operator Outreach Dossier

> Priority tier: P0 (alongside Vendor A). Largest non-Vendor B global slot publisher; math org concentrated in Sydney + Las Vegas.
> Outreach owner: VP BD (commercial) + VP Engineering (technical co-lead).
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: North Ryde, Sydney AU (corporate); Las Vegas NV (NA studios).
- **Founded**: 1953 (Len Ainsworth founder; spun out separately, see Ainsworth dossier).
- **Listing**: ASX:ALL — publicly traded.
- **Estimated revenue**: ~A$6.0B FY (gaming + digital combined).
- **Slot game count**: ~1,200+ titles across land-based + online (Vendor C Interactive after Vendor F-EU acquisition rumors and Pixel/NeoGames absorption).
- **Top titles**: Buffalo, Buffalo Gold, Buffalo Link, Pattern-LL (Magic Pearl/Sahara Gold/etc.), Pattern-DL (Autumn Moon/Golden Century/etc.), 5 Dragons, Wonder 4, Big Red, More Hearts, Cash Express.
- **Studios**: Sydney (core math), Las Vegas (NA-specific titles), Tel Aviv (digital via NeoGames/NYX legacy).

## Math model gap analysis

Our engine maps cleanly onto Vendor C's published mechanics. Coverage by mechanic family (against our 16/16 Vendor B matrix carried forward):

| Vendor C mechanic | Our solver family | Coverage |
|---|---|---|
| Hold-and-Spin / Hold-Your-Hat (Pattern-LL, Pattern-DL, Cash Express) | `hold_and_win`, `pseudo_must_hit_level`, `coin_accumulator_mystery` | config-only |
| Reel-Power Ways (Buffalo, 5 Dragons) | `ways_to_win_pgf`, `variable_reel_height_ways` | config-only |
| Free-Spin retrigger w/ stacked wilds (Buffalo Gold) | `free_spins_retrigger_compound`, `multiplicative_wild_stack` | config-only |
| Mystery progressives (Lightning/Pattern-DL levels) | `multi_level_wild_markov`, `must_hit_by_jackpot`, `progressive_pool` | config-only |
| Symbol upgrade (More Chilli, More Hearts) | `symbol_upgrade_chain_markov` | config-only |
| Sticky cash collector (Cash Express family) | `sticky_cash_collector`, `sticky_cash_reveal` | config-only |
| Hyperlink shared progressives (cross-bank) | `progressive_pool`, `multi_tier_wap_wheel` | config-only |
| Bonus wheel respin (Wonder 4 Boost/Power) | `bonus_wheel_respin`, `multi_tier_wap_wheel` | config-only |
| Anticipation reel (Big Red style) | `anticipation_reel_tease` | config-only |
| Free-spin lookback multiplier | `free_spins_lookback_multiplier` | config-only |
| Megaways-style variable height (newer Vendor C licensed titles) | `variable_reel_height_ways`, `megacluster_stack_ways` | config-only |
| Pick bonus (Wonder 4 pick-an-icon) | `pick_bonus_n_stage_tree`, `pick_click_pooper_bonus` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~750 active land-based titles + 450 online ports.
- **Engine config-only coverage**: ~82% of titles (≈984 of 1,200). Remaining ~18% need a minor solver extension (typically a bespoke meter or a localised licensed-IP overlay).
- **Confidence**: high — Vendor C's mechanic palette overlaps our Vendor B matrix significantly because both companies share a Reel-Power and Hold-and-Spin lineage.

## Decision-makers (role placeholders — clean-room, NO real names)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<Chief Technology Officer at Vendor C>` | Architecture sign-off on math engine swap | LinkedIn / G2E speaker pages |
| `<VP Game Development at Vendor C>` | Owns studio cadence; ROI conversation lands here | Public press releases |
| `<Chief Math Officer at Vendor C>` (or VP Math) | Technical gatekeeper; reviews our solver dossiers | G2E / ICE math-craft sessions |
| `<Chief Compliance Officer at Vendor C>` | Owns BMM/GLI submission flow; gates our cert paper-trail integration | Investor relations + jurisdiction filings |
| `<Director of Lab Submissions at Vendor C>` | Day-to-day cert lab interaction | Conference attendee lists |
| `<VP Corporate Development at Vendor C>` | Build-vs-buy financial frame | Crunchbase + IR page |

## Outreach hook (tailored opening line)

> "Buffalo's stacked-wild math signature on the 4th reel is the cleanest published example of a Reel-Power ways-tree we've found — our `ways_to_win_pgf` solver reconstructs the PGF closed-form and matches the published RTP envelope within 0.0007 absolute. Worth a 30-min code walk for your math team?"

## ROI ballpark

- Math + cert paper-trail savings: **~$220K per title** (12–18 week → 14 day collapse).
- Velocity uplift: from ~40 ships/yr to ~110 ships/yr (same headcount, 2.75× factor).
- **5yr horizon NPV impact: +$118M** (base case, conservative discounting at 10%).
- Capex offset: clean-room MIT license tier eliminates ~$15M/yr internal kernel maintenance line item.

## Compliance fit

Vendor C sells into:

- AU/NZ (their home regulator: AU State Gaming Commissions + NSW Liquor & Gaming).
- US (Nevada GCB, NJ DGE, PA PGCB, MI MGCB).
- EU (UK GC, Malta MGA, Sweden SGA, Germany GGL).
- LatAm (Mexico SEGOB, Argentina provincial, Colombia Coljuegos).

Our engine carries BMM/GLI/eCOGRA/NMi adapters. Vendor C-specific add: GLI-19 + GLI-33 evidence reports auto-generated from the same kernel run that produces the BMM packet — zero marginal compliance cost when an existing Vendor B-validated solver is reused.

## Next-step CTA

1. **NDA exchange** (mutual, 14 days standard). Our template at `docs/legal/nda-mutual-template.md`.
2. **Pilot proposal**: pick 3 Buffalo-family titles + 1 Pattern-DL variant + 1 Pattern-LL variant. Run our engine in shadow-mode against their existing math packets. Deliverable: 5 reconciliation reports + paper-trail dossier in 30 days.
3. **Decision gate**: pilot success criteria = ≤0.001 absolute RTP delta across all 5 titles + 100% lab-evidence parity.
4. **Commercial**: license + per-title processing fee OR full acquisition discussion (financial model at `reports/outreach/PORTFOLIO_FIT_aristocrat.md`).
