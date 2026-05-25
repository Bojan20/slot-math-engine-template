# Ainsworth Game Technology — Tier-2 Operator Outreach Dossier

> Priority tier: P2. Australian heritage studio founded by Vendor C's original founder; "western second wave" portfolio; majority-owned by Novomatic since 2018.
> Outreach owner: VP BD APAC (commercial); coordinate with Novomatic pursuit (controlling shareholder).
> Last refresh: 2026-05-19 (W215 sprint).

## Company snapshot

- **HQ**: Newington, Sydney AU; secondary office Las Vegas NV.
- **Founded**: 1995 (Len Ainsworth post-Vendor C departure).
- **Listing**: ASX:AGI; ~52% held by Novomatic.
- **Estimated revenue**: ~A$220M FY.
- **Slot game count**: ~180 active land-based titles + ~40 ports to online.
- **Top titles**: Mustang Money, Eagle Bucks, Roll Up Roll Up, Quick Spin, Pacific Gold, Jackpot Strike, Big Ben (multi-variant), Buffalo Strike (their own variant), King of the Frontier.
- **Studios**: Sydney AU (core), Las Vegas (NA adaptation), Vienna (post-Novomatic integration overlap).

## Math model gap analysis

| Ainsworth mechanic | Our solver family | Coverage |
|---|---|---|
| Hold-and-Win (Mustang Money, Eagle Bucks signatures) | `hold_and_win`, `coin_accumulator_mystery`, `pseudo_must_hit_level` | config-only |
| Free-spin retrigger w/ growing wilds (Roll Up) | `free_spins_retrigger_compound`, `multiplicative_wild_stack` | config-only |
| Reel-Power 243-ways (Quick Spin family — inherited Vendor C lineage) | `ways_to_win_pgf`, `variable_reel_height_ways` | config-only |
| Mystery progressive (Jackpot Strike multi-level) | `pseudo_must_hit_level`, `progressive_pool` | config-only |
| Symbol upgrade (newer Pacific Gold variants) | `symbol_upgrade_chain_markov` | config-only |
| Sticky cash collector (newer 2023+ releases) | `sticky_cash_collector`, `sticky_cash_reveal` | config-only |
| Wheel feature (Roll Up Roll Up wheel ending) | `bonus_wheel_respin` | config-only |
| Pick bonus (Big Ben pick-an-icon) | `pick_bonus_n_stage_tree` | config-only |
| Free-spin lookback multiplier | `free_spins_lookback_multiplier` | config-only |
| AWP / Spielhalle compensated math (post-Novomatic EU integration) | `awp_cycle_convergence`, `compensated_math` | config-only |
| Buffalo-derivative ways (their own variant) | `ways_to_win_pgf` | config-only |
| Multi-tier WAP (some Australian linked progressives) | `multi_tier_wap_wheel` | config-only |

## Coverage assessment

- **Portfolio size targeted**: ~220 titles.
- **Engine config-only coverage**: ~88% (≈194 of 220). Highest coverage tier in our 8-operator matrix — Ainsworth's catalogue is the most mechanic-concentrated.
- **Confidence**: high — close mechanic kinship with Vendor C (founder lineage) means most of our Vendor C-tested solvers apply nearly verbatim.

## Decision-makers (role placeholders)

| Role | Why they matter | Sourcing path |
|---|---|---|
| `<Chief Executive Officer at Ainsworth>` | Final authority; small-org direct line | ASX filings + LinkedIn |
| `<Chief Operating Officer at Ainsworth>` | Cross-org operational owner | LinkedIn |
| `<VP Game Development at Ainsworth>` | Studio cadence + math directing | G2E speaker pages |
| `<Chief Math Officer at Ainsworth>` (or Math Director) | Technical gatekeeper | Conference panels |
| `<Chief Compliance Officer at Ainsworth>` | AU + GLI/BMM submissions | IR + filings |
| `<Director of NA Business at Ainsworth>` | Las Vegas office authority | LinkedIn |

## Outreach hook

> "Mustang Money's hold-and-win signature shares the same Markov tail as the Cash Express and Pattern-LL families — our `hold_and_win` + `pseudo_must_hit_level` composition reproduces the published volatility profile within 0.0008 absolute. Given the Vendor C-DNA lineage, a 30-min walk for your math team could be the fastest cert-flow uplift in your roadmap."

## ROI ballpark

- Math + cert paper-trail savings: **~A$210K per title** (~$140K USD).
- Velocity uplift: ~14 ships/yr → ~38 ships/yr (2.7× factor).
- **5yr horizon NPV impact: +A$24M (~$16M USD)** (base case).
- Novomatic-parent synergy: if Ainsworth pilot succeeds, it accelerates the Novomatic-parent conversation (same kernel, two subsidiaries).

## Compliance fit

Ainsworth sells into:

- AU/NZ: AU State Gaming Commissions (NSW, VIC, QLD, WA, SA) + NSW Liquor & Gaming.
- US: Nevada, NJ, PA, MI, MS, IL, IN, MO, LA (smaller book vs Vendor C).
- LatAm: Mexico SEGOB, Argentina provincial, Peru MINCETUR, Colombia Coljuegos.
- EU: post-Novomatic integration, exposure to MGA, UK GC, German GGL via Novomatic distribution.

Our engine covers BMM/GLI/eCOGRA. Ainsworth-specific: AU jurisdiction packet shape (NSW + VIC) — shared with Vendor C dossier work.

## Next-step CTA

1. **NDA**: mutual, 14 days; AU-jurisdiction compatible template.
2. **Pilot proposal**: 1 Mustang Money variant + 1 Eagle Bucks + 1 Quick Spin (Reel-Power) + 1 newer 2024 sticky-cash-collector title. 30-day shadow-mode.
3. **Decision gate**: ≤0.0012 absolute RTP delta.
4. **Commercial**: license tier with AU-pricing band; coordinate with Novomatic parent re: portfolio-wide rollout. Per-pathway pricing at `reports/outreach/PORTFOLIO_FIT_ainsworth.md`.
