# Market Expansion Strategy — Beyond L&W

> W215 strategy doc. Defines the sequenced expansion of slot-math-engine commercial pursuit beyond W213's L&W focus.
> Companion: `docs/outreach/operators-tier2/` for per-operator dossiers.
> Last refresh: 2026-05-19.

## Executive summary

W213 closed the 16/16 published L&W mechanic-family gap and produced the L&W-targeted outreach kit. W215 expands the addressable market to the **next 8 largest non-L&W slot publishers**, validates that our engine covers ~80% of their combined catalogue config-only, and sequences a 18-month commercial rollout.

- **L&W single-customer NPV (W213 model)**: +$33M (5yr).
- **Tier-2 (8 ops) total NPV (W215 model)**: +$478M (5yr base case).
- **TAM ratio**: Tier-2 is ~14× the L&W single-customer book.
- **Sequencing**: L&W pilot continues (week 0 ongoing) → P0 Tier-2 (Aristocrat + IGT) starts week 8 → P1 (Konami/Novomatic/Playtech) starts week 16 → P2 (Everi/Ainsworth/AGS) starts week 24.

## TAM breakdown

| Segment | Operators | Title count | 5yr NPV book (model) | Sales cycle | Status |
|---|---|---|---|---|---|
| **L&W** | 1 | ~1,500 | $33M | 12–18 months | Pilot in flight (W213) |
| **Tier-2 P0** | Aristocrat, IGT | ~2,100 | $213M | 12–18 months | Outreach starts W215+8wk |
| **Tier-2 P1** | Konami, Novomatic, Playtech | ~2,180 | $213M | 6–14 months | Outreach starts W215+16wk |
| **Tier-2 P2** | Everi, Ainsworth, AGS | ~680 | $52M | 3–9 months | Outreach starts W215+24wk |
| **Tier-3 indie** (W216 candidate) | Pragmatic, Push, NoLimit City, Hacksaw, Relax | ~3,000 | ~$120M (est.) | 2–4 months | Not yet scoped |
| **Asia / Macau in-house** (W217 candidate) | Galaxy, SJM, Sands in-house | ~200 | ~$15M (est.) | 9–14 months | Not yet scoped |
| **State lotteries w/ slot teams** (W218 candidate) | ADM-Italy, ONLAE-Spain | ~100 | ~$8M (est.) | 18–24 months | Not yet scoped |
| **TOTAL ADDRESSABLE** | 16+ | ~9,800 | ~$654M | — | — |

## Sequencing rationale

### Why L&W first (W213)

- Single largest publisher; densest mechanic coverage map.
- Our 16/16 L&W mechanic-family coverage already validated; pilot dossier complete.
- Closes the credibility-loop: success with the largest publisher de-risks every subsequent operator.

### Why Aristocrat + IGT next (Tier-2 P0)

- Combined ~50% of all Tier-2 addressable book.
- Mechanic palettes overlap heavily with L&W (Reel-Power, Hold-and-Spin, ways) — every solver we proved on L&W carries forward.
- Public-company decision velocity is comparable to L&W; same sales-cycle muscle memory applies.

### Why Konami + Novomatic + Playtech next (Tier-2 P1)

- Three different geographic anchors (NA, DACH/EU, UK/EU) — diversifies regulatory exposure.
- Sales cycles are 6–14 months — faster than P0, providing earlier revenue runway.
- Each has a distinct adjacency: Konami SYNKROS systems business, Greentube digital, Playtech-Snaitech operator side.

### Why Everi + Ainsworth + AGS last (Tier-2 P2)

- Smaller portfolios → faster cycles (3–9 months) → cash velocity uplift.
- All three have corporate-overlay considerations (post-merger Everi/IGT, Novomatic-parent Ainsworth, Brightstar PE for AGS) — these add cycle complexity that we want resolved with P0/P1 wins behind us.
- Each carries adjacency value (class-II compliance reuse, AU-jurisdiction reuse, PE-board credibility).

## Tier-2 vs L&W operational differences

| Dimension | L&W | Tier-2 (avg) |
|---|---|---|
| Sales cycle | 12–18mo | 4–14mo (varies) |
| Math team size | ~80 | ~25 (avg per operator) |
| Decision velocity | Public co, board-gated | Mix: public, private, PE-owned |
| Cert lab footprint | BMM + GLI heavy | Adds NMi (Novomatic), ADM (IGT, Playtech), DICJ (Konami) |
| Build-vs-buy reflex | Strong "build" muscle in-house | Weaker; more open to "buy" |
| Commercial vehicle preference | Acquisition or full-license | License-tier dominant; some acquisition (Aristocrat, IGT) |
| Internal kernel maturity | Highly modular | Often monolithic; older codebases |
| Regulatory submission process | Heavily templated | More variance per operator |

## Regulatory leverage

Every cert lab evidence packet our engine emits for the L&W pilot is **reusable verbatim** for Tier-2 operators in the same jurisdiction. The marginal compliance cost of expanding from L&W (1 customer) to all 8 Tier-2 ops in the same jurisdiction is approximately $0.

| Jurisdiction | L&W coverage | Tier-2 ops adding coverage | Marginal cost |
|---|---|---|---|
| Nevada GCB | Y | Aristocrat, IGT, Konami, Novomatic*, Playtech*, Everi, Ainsworth, AGS | $0 |
| NJ DGE | Y | All 8 | $0 |
| UK Gambling Commission | Y | IGT, Novomatic (UK Ltd), Playtech (primary) | $0 |
| Malta MGA | Y | Greentube, Playtech, others | $0 |
| German GGL + SPIELV-2 | Stub | Novomatic (primary) | ~$40K (one-time spec finalization) |
| Italian ADM | Stub | IGT (primary), Playtech (Snaitech), Greentube | ~$30K (one-time spec finalization) |
| Macau DICJ | Not yet | Konami | ~$60K (W216 if commercially warranted) |
| AU State Gaming Commissions | Y | Aristocrat (primary), Ainsworth | $0 |
| NIGC class-II | Y | Konami, Everi, AGS | $0 |

\* Novomatic and Playtech have small US footprints; main market is EU.

## Sales-cycle phases (Tier-2)

| Week | P0 (Aristocrat, IGT) | P1 (Konami, Novomatic, Playtech) | P2 (Everi, Ainsworth, AGS) |
|---|---|---|---|
| 0–4 | Pre-research, contact sourcing, hook drafting | — | — |
| 4–8 | Cold outbound (math team peer-review framing) | Pre-research | — |
| 8–12 | Reply triage; NDA exchange | Cold outbound | Pre-research |
| 12–16 | Pilot proposal | Reply triage; NDA exchange | Cold outbound |
| 16–24 | Pilot execution (shadow-mode) | Pilot proposal | Reply triage; NDA exchange |
| 24–36 | Decision gate; commercial terms | Pilot execution | Pilot proposal |
| 36–48 | Contract close; first revenue | Decision gate; commercial terms | Pilot execution |
| 48–72 | Expansion; portfolio rollout | Contract close; first revenue | Decision gate; commercial terms |

## 18-month rollout milestone calendar

### Months 0–3 (weeks 0–12)

- W215 sprint complete: 8 operator dossiers, coverage matrix, portfolio-fit tool.
- Aristocrat + IGT contact sourcing done by week 4.
- First cold outbound to Aristocrat math team by week 6.
- First cold outbound to IGT math team by week 8.
- Konami/Novomatic/Playtech pre-research started by week 10.

### Months 3–6 (weeks 12–24)

- Aristocrat NDA expected by week 14.
- IGT NDA expected by week 16.
- P1 cold outbound underway.
- L&W pilot results reportable (assumes W213 pilot landed in week 0–4).

### Months 6–9 (weeks 24–36)

- Aristocrat pilot execution begins.
- IGT pilot execution begins.
- P1 NDAs and proposals.
- P2 cold outbound underway.
- L&W expansion / commercial close.

### Months 9–12 (weeks 36–48)

- Aristocrat pilot decision gate.
- IGT pilot decision gate.
- P1 pilots executing.
- P2 NDA/proposal phase.
- L&W revenue recognized.

### Months 12–15 (weeks 48–60)

- Aristocrat commercial close (license or acquisition).
- IGT commercial close.
- P1 decision gates.
- P2 pilots executing.

### Months 15–18 (weeks 60–72)

- Aristocrat portfolio rollout begins.
- IGT portfolio rollout begins.
- P1 commercial close.
- P2 decision gates / commercial close.
- Tier-3 scoping (W216).

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Aristocrat in-house build response | Medium | High | Lead with peer-review framing; show solver source-code dossier |
| IGT-Everi merger integration confusion | High | Medium | Coordinate Everi pursuit through IGT parent post-W215+24wk |
| Novomatic private-company gatekeeping | Medium | Medium | Greentube digital subsidiary as entry point |
| Playtech UK GC regulatory cert lock-in | Low | Medium | Our UKGC adapter already validated against L&W work |
| Brightstar PE board veto on AGS pursuit | Medium | Low | Pitch as asset-light operational leverage (PE-friendly thesis) |
| Ainsworth deferring to Novomatic parent | High | Low | Pursue both in sequence; same kernel, two subsidiaries |
| Macau DICJ cert lock-out (Konami exposure) | Low | Low | Macau is small slice of Konami book; defer adapter to W216 |
| Regulator surprise (new jurisdiction) | Low | Medium | Adapter stub pattern keeps marginal cost low |

## Success metrics (18-month horizon)

| Metric | Target | Floor |
|---|---|---|
| NDAs signed (Tier-2) | 6 of 8 | 4 of 8 |
| Pilots executed | 5 of 8 | 3 of 8 |
| Commercial closes (license or acquisition) | 3 of 8 | 2 of 8 |
| First-year revenue (Tier-2) | $25M | $12M |
| 5yr NPV booked (Tier-2) | $300M | $150M |
| Cert lab packets reused (zero marginal cost) | 100% | 95% |
| Math kernel regressions caused by Tier-2 customizations | 0 | ≤2 (must be reverted within 30 days) |

## What success looks like at month 18

- L&W: in production with at least 1 contract signed, portfolio rollout in flight.
- Aristocrat OR IGT: at least one of the P0 pair closed (license tier or acquisition LOI).
- 2 of 3 P1 ops in pilot or post-pilot decision phase.
- 1+ of P2 ops closed (fastest cycle).
- Combined first-year revenue ≥ $25M.
- Tier-3 scoping work (W216) underway.

## What failure looks like (and the pivot)

- If Aristocrat AND IGT both stall past month 12: pivot to "single-vendor exclusivity" framing with the more-engaged of the two; offer co-development discount.
- If <3 NDAs by month 9: re-examine the outreach hook; A/B test mathematician peer-review vs commercial NPV framing.
- If pilot reconciliation tolerance fails on any operator: open-source the failing test case to build credibility (controlled disclosure under NDA).
- If post-merger Everi situation locks out the pursuit: drop Everi, double-down on AGS as the fast-cycle P2 anchor.
