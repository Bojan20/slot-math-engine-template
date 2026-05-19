# Tier-2 Operator Outreach — Master Index

> W215 deliverable. Expands the addressable market beyond L&W (W213) to the 8 largest non-L&W slot publishers.
> All content is clean-room: no real names, only role placeholders.
> Companion automation: `scripts/outreach/tier2-coverage-matrix.mjs`, `scripts/outreach/operator-portfolio-fit.mjs`.

## Operator dossiers

| # | Operator | Slug | Region | Priority | Portfolio est. | Coverage est. |
|---|---|---|---|---|---|---|
| 1 | Aristocrat | `aristocrat` | AU + NA | P0 | ~1,200 titles | ~82% |
| 2 | IGT | `igt` | NA + EU | P0 | ~900 titles | ~71% |
| 3 | Konami Gaming | `konami` | NA + APAC | P1 | ~330 titles | ~88% |
| 4 | Novomatic / Greentube | `novomatic` | EU + CEE | P1 | ~850 titles | ~79% |
| 5 | Playtech | `playtech` | EU + UK | P1 | ~1,000 titles | ~76% |
| 6 | Everi (now IGT-merged BU) | `everi` | NA | P2 | ~280 titles | ~85% |
| 7 | Ainsworth Game Technology | `ainsworth` | AU + NA | P2 | ~220 titles | ~88% |
| 8 | AGS (PlayAGS, Brightstar PE) | `ags` | NA | P2 | ~180 titles | ~84% |

**Total Tier-2 addressable**: ~4,960 titles. At ~80% blended config-only coverage that is ~3,970 titles our engine can ship via configuration alone.

## Comparative matrix

| Operator | Mechanic palette breadth | Math org concentration | Cert lab posture | Sales cycle (est.) | Commercial vehicle |
|---|---|---|---|---|---|
| Aristocrat | Broad (Reel-Power + HW + WAP + ways) | Sydney + LV | BMM + GLI heavy | 9–14 months | License OR acquisition |
| IGT | Broad (WoF + Megabucks + VP + cascade) | LV + Reno + Rome | GLI + ADM heavy | 12–18 months | License OR acquisition |
| Konami | Narrow-deep (Action Stacked + HW) | LV + Sydney | GLI + BMM | 6–10 months | License + SYNKROS adj. |
| Novomatic | Broad EU-leaning (BoR + AWP + linked) | AT + EE | NMi + SPIELV-2 + MGA | 8–14 months | License (Greentube first) |
| Playtech | Broad online (AotG + ways + cascade) | EE + BG + UK | UKGC + MGA + ADM | 6–12 months | License + Snaitech adj. |
| Everi | Mid-narrow (CashMachine + HV + class-II) | LV + Austin | BMM + GLI + NIGC | 4–8 months | License (post-IGT-merger) |
| Ainsworth | Narrow (MM + EB + Reel-Power) | Sydney + LV | BMM + GLI + AU state | 5–9 months | License (Novomatic-parent aware) |
| AGS | Narrow (Rakin'Bacon + class-II + Survivor) | LV + Atlanta | BMM + GLI + NIGC | 3–6 months | License (PE board aware) |

## Priority ranking + sequencing

### P0 — Aristocrat + IGT (parallel, weeks 1–8)

These two together are >50% of Tier-2 addressable book by title count. Sales cycle is long (12–18mo), but the financial upside is the lion's share of the ROI ballpark.

- Open with technical hook to math team (peer-review framing, not vendor pitch).
- Parallel commercial conversation via VP BD with Corp Dev awareness.
- Pilot proposal lands in week 6–8.

### P1 — Konami + Novomatic + Playtech (rolling, weeks 4–16)

Three different geographic anchors (NA, DACH/EU, UK/EU). Shorter sales cycles than P0 (~6–14 months). Greentube is the natural entry into Novomatic; Playtech Casino BU into Playtech.

- Konami: SYNKROS adjacency is the leverage point.
- Novomatic: Greentube digital first, land second.
- Playtech: UK GC certification narrative is the wedge.

### P2 — Everi + Ainsworth + AGS (rolling, weeks 12–24)

Smaller portfolios → faster cycles (3–9 months). Critical to coordinate:

- **Everi**: don't double-count vs IGT post-merger.
- **Ainsworth**: signal-coordinate with Novomatic parent.
- **AGS**: PE-board (Brightstar) is the strategic gatekeeper.

## Coverage matrix (8 ops × 12 mechanics)

See `scripts/outreach/tier2-coverage-matrix.mjs --json` for full cell-by-cell detail. Summary:

| Mechanic family | Operators with strong presence |
|---|---|
| Cascade / Tumble | Playtech, IGT, Novomatic |
| Respin / Hold-and-Win | Aristocrat, IGT, Konami, Everi, Ainsworth, AGS |
| Hold-and-Win (named "HW") | Aristocrat, Ainsworth, AGS, Everi, Konami |
| Cluster pays | Playtech (limited), Novomatic (limited) |
| Ways-to-win 243/720 | Aristocrat, IGT, Konami, Ainsworth, Playtech |
| Megaways (BTG-licensed) | Playtech, IGT (limited), Novomatic (limited) |
| Ante-bet | Novomatic, Playtech, IGT |
| Buy-feature | Konami, Novomatic (Greentube), Playtech |
| Pick bonus | All 8 |
| Wheel bonus | IGT (WoF), Aristocrat, Konami, Ainsworth, AGS, Everi |
| Mystery symbol/progressive | All 8 |
| Linked / WAP jackpot | All 8 (varying scale) |

## ROI rollup (5yr base case)

| Operator | $ NPV impact (5yr) |
|---|---|
| Aristocrat | +$118M |
| IGT | +$95M |
| Playtech | +$96M |
| Novomatic | +$85M |
| Konami | +$32M |
| Everi | +$22M |
| Ainsworth | +$16M |
| AGS | +$14M |
| **Total Tier-2** | **+$478M (5yr base, 10% discount)** |

L&W comparable from W213 dossier: +$33M. Tier-2 totals are **~14× the L&W single-customer NPV** — confirming the strategic mandate to expand beyond L&W.

## Outreach kit reuse

Each operator dossier reuses W213's outreach kit:

- Email templates: `docs/outreach/email-templates/` (cold-cto, cold-cfo, cold-cmo + tier2 variant)
- Cadence playbook: `docs/outreach/CADENCE_PLAYBOOK.md`
- Objection responses: `docs/outreach/OBJECTION_RESPONSES.md`
- One-pager: `docs/outreach/ONE_PAGER.md` (variable-substituted per operator)
- Pre-pitch checklist: `docs/outreach/PRE_PITCH_CHECKLIST.md`

The new tier2 cold-email template (`docs/outreach/email-templates/tier2-cold-email.md`) supports `{{operator_name}}`, `{{flagship_title}}`, `{{coverage_pct}}`, and `{{decision_maker_role}}` substitution.

## Automation

- **Coverage matrix**: `node scripts/outreach/tier2-coverage-matrix.mjs` emits `reports/outreach/TIER2_COVERAGE.md` + JSON.
- **Per-operator portfolio fit**: `node scripts/outreach/operator-portfolio-fit.mjs --operator <slug>` emits `reports/outreach/PORTFOLIO_FIT_<slug>.{json,md}`.
- Both scripts are deterministic; no clock/RNG dependencies.

## Compliance & clean-room

- Zero real-name references throughout dossiers. All decision-makers are `<Role at Operator>` placeholders.
- Public-source facts only (HQ, ASX/NYSE/LSE listing, founding year, top title names — all publicly disclosed by operators themselves).
- Mechanic-family analysis is structural (Markov family, PGF form) and does not reference proprietary RNG seed schedules or paytables of specific titles.
- All ROI numbers are model-based (per-title savings × portfolio velocity × 5yr discount), not real financial disclosure.

## Next deliverable (W216 candidate)

- Tier-3 indie studios (Pragmatic Play, Push Gaming, NoLimit City, Hacksaw Gaming, Relax Gaming) — combined ~3,000 titles, online-only, faster sales cycles (~2–4 months).
- Asia-specific (Macau): Galaxy Entertainment, SJM, Sands China in-house studios — separate compliance regime (DICJ).
- Lottery operators: state lotteries with in-house slot teams (Italian ADM, Spanish ONLAE) — slower cycles, larger annual contracts.
