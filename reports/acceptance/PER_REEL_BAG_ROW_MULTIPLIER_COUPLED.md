# PER_REEL_BAG_ROW_MULTIPLIER_COUPLED — Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator Acceptance (W185, 66. solver, L&W M1 P0 GAP CLOSURE)

Generated: `2026-05-18T00:22:30.142Z`

## Headline

**6/6 configs PASS** at 20000 MC spins each = 120K total spin sims.

Closes Faza 12 ext (post-W100): ✅ "Per-Reel Cash-Bag × Per-Row-Multiplier Coupled Accumulator" (Wave 185 — 66. closed-form solver, L&W M1 GAP CLOSED — Dragon Spin CrossLink Water + future L&W flagship).

## Method

Per-cell Bernoulli × coupled-dimension aggregation. Grid N×M cells, each cell independent Bernoulli(q) landing sa iid value V (μ_V, σ²_V).
  - **Per-reel bag**: B_i = Σ_j I_{ij}·V_{ij}, E[B] = M·q·μ_V (Wald)
  - **Per-row coin count**: C_j ~ Binomial(N, q)
  - **Per-row multiplier**: M_j = m_{C_j} (operator lookup)
  - **Total payout**: Y = Σ_j M_j · S_j, E[Y] = M · μ_V · Σ_c Bin(c;N,q)·m_c·c
  - **P(all rows full)** = q^(N·M); **P(at least one row full)** = 1 − (1−q^N)^M
  - **E[highest row multiplier]** via Σ v · (CDF_max(v) − CDF_max(prev)) sorted-values approach

MC: per-spin per-cell Bernoulli(q) → Box-Muller Gaussian V (clip ≥ 0), accumulate per-reel bag i per-row sum/count, evaluate Σ M_j(C_j)·S_j.

## Configs — Per-Reel Bag × Row-Multiplier operator disclosure table

| Config | Pass | N×M | q | E[Y] CF/MC | E[bag] CF/MC | P(≥1 full) CF/MC | uplift× |
|---|---|---|---|---|---|---|---|
| A_dragon_spin_crosslink_water_classic_5x4 | ✅ | 5×4 | 0.12 | 11.912/12.040 | 1.440/1.443 | 0.01%/0.01% | 1.65 |
| B_dragon_spin_crosslink_high_density | ✅ | 5×4 | 0.25 | 26.680/26.595 | 2.000/2.003 | 0.39%/0.38% | 2.67 |
| C_dragon_spin_crosslink_steep_ramp | ✅ | 5×4 | 0.15 | 25.723/25.992 | 1.500/1.502 | 0.03%/0.02% | 3.43 |
| D_compact_grid_3x3_balanced | ✅ | 3×3 | 0.2 | 5.328/5.372 | 1.200/1.204 | 2.38%/2.46% | 1.48 |
| E_corner_flat_multiplier_pure_collector | ✅ | 5×4 | 0.15 | 6.000/5.990 | 1.200/1.198 | 0.03%/0.02% | 1.00 |
| F_corner_threshold_only_top_tier_pays | ✅ | 5×4 | 0.2 | 1.280/1.530 | 1.600/1.601 | 0.13%/0.15% | 0.16 |

## Compliance context

- **UKGC RTS 14** — multi-dimensional feature aggregator disclosure.
- **MGA PPD §11** — per-reel + per-row reward transparency.
- **eCOGRA Generic Slots Audit** — dual-dimension accumulator audit.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M1 gap — Dragon Spin CrossLink Water (2024, defining title) + future L&W flagship variants extending CrossLink pattern.