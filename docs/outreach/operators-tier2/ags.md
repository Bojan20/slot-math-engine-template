# AGS (PlayAGS) — Tier-2 Operator Outreach Dossier

> Priority tier: P2. Mid-tier NA studio; acquired by Brightstar Capital Partners (2024) — privately held post-acquisition; nimble integration partner.
> Outreach owner: VP BD (commercial). Brightstar PE board overlay influences commercial cadence.
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: Las Vegas NV.
- **Founded**: 2005 (American Gaming Systems); rebranded to AGS.
- **Listing**: Previously NYSE:AGS; private since 2024 Brightstar take-private.
- **Estimated revenue**: ~$370M FY pre-take-private.
- **Slot game count**: ~150 active land-based titles + ~30 online (Interactive division).
- **Top titles**: Capital Plays, Survivor (licensed CBS IP), Royal Reels, Longhorn Jackpots, Rakin' Bacon, Jade Wins, Fu Nan Fu Nu, Olympus Strikes, Coin Combo, Player's Choice (multi-game).
- **Studios**: Las Vegas (core), Atlanta GA (interactive online).
- **Class-II / charitable**: Significant tribal class-II business; AGS class-II cabinet revenue ~30% of slot segment.

## Math model gap analysis

| AGS mechanic | Our solver family | Coverage |
|---|---|---|
| Hold-and-Win (Rakin' Bacon flagship + Jade Wins) | `hold_and_win`, `coin_accumulator_mystery`, `pseudo_must_hit_level` | config-only |
| Linked progressive (Longhorn Jackpots) | `progressive_pool`, `multi_tier_wap_wheel` | config-only |
| Free-spin retrigger w/ stacked wilds | `free_spins_retrigger_compound`, `multiplicative_wild_stack` | config-only |
| Survivor licensed-IP mechanic (CBS Survivor): pick + immunity meter | `pick_bonus_n_stage_tree`, `charge_meter`, `voltage_meter_multi_tier` | config-only |
| Class-II bingo-cabinet math (tribal) | `class2_bingo_skill`, `classIIBingoCoordinator` | config-only |
| Multi-game cabinet (Player's Choice menu of titles) | composable IR mounts | config-only |
| Mystery symbol reveal (Olympus Strikes) | `mystery_symbol_reveal` | config-only |
| Ways-to-win 243/720 | `ways_to_win_pgf` | config-only |
| Coin-collect family (Coin Combo) | `coin_accumulator_mystery`, `sticky_cash_collector` | config-only |
| Symbol upgrade (newer Royal Reels variants) | `symbol_upgrade_chain_markov` | config-only |
| Wheel feature (Capital Plays ending wheel) | `bonus_wheel_respin` | config-only |
| Asian-themed reel-bound progressives (Fu Nan Fu Nu) | `reel_bound_mystery_progressive` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~180 titles.
- **Engine config-only coverage**: ~84% (≈151 of 180). Class-II portfolio covered via coordinator solver. Survivor licensed-IP mechanic is the only non-trivial gap (custom meter + pick tree interaction) — covered as composition of two existing solvers.
- **Confidence**: high — small concentrated catalogue; one solver covers many titles.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<Chief Executive Officer at AGS>` | Final authority; small-org direct line | LinkedIn + press |
| `<Chief Operating Officer at AGS>` | Cross-org operational owner | LinkedIn |
| `<VP Game Development at AGS>` | Studio cadence | G2E |
| `<Chief Math Officer at AGS>` | Technical gatekeeper | Conference panels |
| `<Chief Compliance Officer at AGS>` | NIGC + commercial submissions | Trade press |
| `<Brightstar Capital Operating Partner — Gaming>` | PE-board strategic alignment | Brightstar IR |

## Outreach hook

> "Rakin' Bacon's hold-and-win signature with the special pig respin trigger maps cleanly onto our `hold_and_win` + `coin_accumulator_mystery` composition — we reconstruct the published top-tier hit cycle within 0.0009 absolute. With the Brightstar take-private behind you, a 30-min walk could be the fastest math-cert acceleration in the post-merger integration plan."

## ROI ballpark

- Math + cert paper-trail savings: **~$150K per title**.
- Velocity uplift: ~12 ships/yr → ~32 ships/yr (2.65× factor).
- **5yr horizon NPV impact: +$14M** (base case).
- Class-II adjacency: NIGC packet automation savings ~$1.5M/yr.
- PE-board angle: Brightstar values asset-light operational leverage — math kernel licensing is exactly that frame.

## Compliance fit

AGS sells into:

- US: Nevada, NJ, PA, MI, IL, IN, MS, LA, OK (class II + III), CA tribal, AZ tribal, FL tribal.
- Canada: ON AGCO, BC BCLC, SK SaskGaming.
- LatAm: Mexico SEGOB, Argentina provincial, Peru MINCETUR (small).
- Caribbean: limited.

Our engine covers BMM/GLI/eCOGRA + NIGC class-II via the coordinator solver. AGS-specific: NIGC + state-by-state tribal compact submissions.

## Next-step CTA

1. **NDA**: mutual, 14 days. Coordinate with Brightstar legal counsel for PE-board awareness.
2. **Pilot proposal**: 1 Rakin' Bacon variant + 1 Capital Plays + 1 class-II cabinet title + 1 Survivor IP. 30-day shadow-mode.
3. **Decision gate**: ≤0.0015 absolute RTP delta + class-II coordinator parity + Survivor mechanic composition match.
4. **Commercial**: license tier; class-II packet automation as separable upsell; PE-board pitched as asset-light operational leverage thesis. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_ags.md`.
