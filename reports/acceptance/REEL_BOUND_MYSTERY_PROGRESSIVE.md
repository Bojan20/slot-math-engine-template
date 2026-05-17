# REEL_BOUND_MYSTERY_PROGRESSIVE — Reel-Bound Mystery Progressive Analyzer Acceptance (L&W M5 GAP CLOSURE)

Generated: `2026-05-17T23:30:37.629Z`

## Headline

**6/6 configs PASS** at 500000 MC spins each = 3.00M total spin sims.

**Covers 8+ L&W titles iz Quick Hit family** (Platinum / Black Gold / Pro / Wild / Blitz / Cash Wheel / Triple Cash Wheel / Smokin 7s).

## Method

Per-reel Bernoulli adjacency cascade closed-form + per-spin reel-walk MC.
  - **prefix_k** = ∏_{i=1..k} p_i (prob first k reels all show QH)
  - **tier_k** = prefix_k − prefix_{k+1} for k < R, = prefix_R for k = R
  - **E[payout]** = Σ tier_k · payout_k
  - **1-in-N** = 1 / tier_k (regulator disclosure form)

## Configs — L&W Quick Hit family operator disclosure table

| Config | Pass | R | kMin | Top-tier 1-in-N | E[RTP] CF/MC |
|---|---|---|---|---|---|
| A_quick_hit_platinum_5tier | ✅ | 5 | 3 | 1 in 1852 | 3.105/3.161 |
| B_quick_hit_black_gold_high_top_tier | ✅ | 5 | 3 | 1 in 6667 | 2.057/2.209 |
| C_quick_hit_pro_9tier_extended | ✅ | 9 | 3 | 1 in 9070295 | 1.675/1.598 |
| D_quick_hit_wild_baseline_low_var | ✅ | 5 | 3 | 1 in 260 | 8.736/8.528 |
| E_bally_smokin_7s_single_tier | ✅ | 5 | 5 | 1 in 3125 | 1.600/1.640 |
| F_quick_hit_blitz_high_vol_4tier | ✅ | 5 | 2 | 1 in 33333 | 0.494/0.454 |

## Compliance context

- **UKGC RTS 12** — progressive jackpot disclosure, per-tier hit frequency.
- **MGA PPD §11** — mystery progressive transparency.
- **GLI-19 §3.4** — progressive contribution audit trail.
- **NIGC 25 CFR 542.7(c)** — Class III mystery progressive.

**L&W M5 GAP CLOSURE**: this kernel covers the per-reel scatter-presence + adjacency-reel tier mapping
mehaniku iconic za Quick Hit family — 8+ titles dependent on this kernel for cert dossier.