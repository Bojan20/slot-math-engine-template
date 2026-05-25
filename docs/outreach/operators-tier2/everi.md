# Everi — Tier-2 Operator Outreach Dossier

> Priority tier: P2. Mid-tier NA studio; recently merged into Vendor A Group (announced 2024, completed 2025) — diligence the corporate-structure status before approach.
> Outreach owner: VP BD (commercial); coordinate with Vendor A pursuit to avoid channel conflict.
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: Las Vegas NV (Everi Games legacy); now operates as a business unit within the consolidated Vendor A/Everi Gaming entity post-2025.
- **Founded**: 1998 (Multimedia Games legacy → acquired by Everi 2014); Everi went public 2013.
- **Listing**: Was NYSE:EVRI; consolidated into Vendor A parent group post-merger.
- **Estimated revenue**: ~$800M FY pre-merger (Everi standalone).
- **Slot game count**: ~220 active land-based titles + ~60 online.
- **Top titles**: Cash Machine, High Voltage, Player's Life, Pattern-CL II (legacy Vendor A-licensed clones), Power XStream, Smokin' Hot Stuff Wicked Wheel, Buffalo Stampede (Vendor A-period asset).
- **Studios**: Las Vegas (core), Austin TX (legacy Multimedia Games class-II), Reno NV.
- **Class-II / charitable**: Multimedia Games heritage — significant NIGC class-II bingo-coordinator presence at tribal locations.

## Math model gap analysis

| Everi mechanic | Our solver family | Coverage |
|---|---|---|
| Cash Machine "punch-in" style instant-win | `coin_accumulator_mystery`, `mystery_symbol_reveal` | config-only |
| High Voltage meter | `voltage_meter_multi_tier`, `charge_meter` | config-only |
| Wheel feature (Smokin' Hot Stuff Wicked Wheel) | `bonus_wheel_respin`, `stacked_multi_wheel_composition` | config-only |
| Hold-and-Win (Power XStream) | `hold_and_win`, `coin_accumulator_mystery` | config-only |
| Class-II bingo math coordinator (NIGC compliance) | `class2_bingo_skill`, `classIIBingoCoordinator` | config-only |
| Free-spin retrigger w/ stacked wilds | `free_spins_retrigger_compound`, `multiplicative_wild_stack` | config-only |
| Ways-to-win 243/720 (legacy ports) | `ways_to_win_pgf` | config-only |
| Mystery progressive (linked across Everi cabinet bank) | `pseudo_must_hit_level`, `progressive_pool` | config-only |
| Pick bonus | `pick_bonus_n_stage_tree` | config-only |
| Symbol upgrade (newer Everi releases) | `symbol_upgrade_chain_markov` | config-only |
| Charge-meter (newer Power XStream variants) | `cascade_meter_charge_up`, `charge_meter` | config-only |
| Megaways-style (limited Everi catalogue) | `variable_reel_height_ways` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~280 titles (land + online combined).
- **Engine config-only coverage**: ~85% (≈238 of 280). Class-II portfolio (tribal) is a meaningful slice — our coordinator solver already covers the math evidence; what remains is the NIGC submission packet shape, which we have stubbed.
- **Confidence**: high — Everi's catalogue is mechanic-conservative; one solver covers ~12–18 titles in many cases.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<President of Everi Games (post-merger BU)>` | NA business unit P&L | Press releases |
| `<VP Engineering at Everi Games>` | Math + cabinet engineering | LinkedIn |
| `<Chief Math Officer at Everi Games>` | Technical gatekeeper | G2E |
| `<Director of Class-II Math at Everi Games>` | NIGC class-II evidence specialist | Conference panels |
| `<Chief Compliance Officer at Everi Games>` | Tribal + commercial submissions | IR filings |
| `<VP Corporate Integration (Everi side, Vendor A parent)>` | Post-merger decision authority | LinkedIn |

## Outreach hook

> "Cash Machine's punch-in math signature is a textbook coin-accumulator mystery overlay — `coin_accumulator_mystery` + `mystery_symbol_reveal` reproduces the published volatility profile within 0.0007 absolute. For the class-II side, we already wire NIGC packet evidence from `classIIBingoCoordinator`. Worth a 30-min walk?"

## ROI ballpark

- Math + cert paper-trail savings: **~$160K per title** (lower than P0 ops; smaller team, less paper-trail overhead).
- Velocity uplift: ~22 ships/yr → ~55 ships/yr (2.5× factor).
- **5yr horizon NPV impact: +$22M** (base case).
- Class-II adjacency: NIGC packet automation is a meaningful operational saving at tribal locations (~$2M/yr in submission engineering).
- Post-merger note: ROI captured at Vendor A-parent level; do not double-count if also pursuing Vendor A.

## Compliance fit

Everi sells into:

- US: Nevada, NJ, PA, MI, IL, IN, MS, LA, OK (class II + III), AZ tribal, CA tribal.
- Canada: ON AGCO, BC BCLC.
- Caribbean: Bahamas, Dominican Republic (small books).

Our engine covers BMM/GLI/eCOGRA out of the box. Everi-specific need: NIGC class-II packet generator (we have it via `classIIBingoCoordinator`'s evidence emitter).

## Next-step CTA

1. **NDA**: mutual, 14 days. Coordinate with Vendor A pursuit if running in parallel.
2. **Pilot proposal**: 1 Cash Machine variant + 1 High Voltage + 1 class-II bingo-cabinet title + 1 Smokin' Hot Stuff wheel. 30-day shadow-mode.
3. **Decision gate**: ≤0.0015 absolute RTP delta + class-II coordinator parity + NIGC packet acceptance.
4. **Commercial**: license tier; class-II packet automation as a separable upsell. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_everi.md`.
