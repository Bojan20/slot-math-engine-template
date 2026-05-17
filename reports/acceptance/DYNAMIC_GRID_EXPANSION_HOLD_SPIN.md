# DYNAMIC_GRID_EXPANSION_HOLD_SPIN — Dynamic Grid-Expansion Hold-and-Spin Aggregator Acceptance (W179, 63. solver, L&W M3 GAP CLOSURE)

Generated: `2026-05-17T23:47:08.924Z`

## Headline

**6/6 configs PASS** at 30000 MC features each = 180K total feature simulations.

Closes Faza 12 ext (post-W100): ✅ "Dynamic Grid-Expansion Hold-and-Spin Aggregator" (Wave 182 — 63. closed-form solver, L&W M3 GAP CLOSED).

## Method

Exact Markov DP over state (active_cells, current_rows_idx, stale_streak) sa per-spin Binomial(empty, q) landing PMF.
  - **State space**: (a, m_idx, s) gde a ∈ [0, N·m_max], m_idx ∈ [0, R], s ∈ [0, k_stale)
  - **Transition**: per spin, B ~ Binomial(N·m_now − a, q); newA = a+B; row extensions triggered iff cumLandings ≥ T_k
  - **Termination**: stale == k_stale OR newA == N·m_max
  - **Aggregates**: E[bags], E[#extensions], E[spins], P(full max grid) iz terminal-state mass

MC: per-feature exact Binomial(empty, q) landings sa cumulative-threshold extension triggering + 3-stale termination, mulberry32 RNG.

## Configs — Dynamic Grid-Expansion H&S operator disclosure table

| Config | Pass | N×m₀ | +rows | q | E[bags] CF/MC | E[#ext] CF/MC | E[spins] CF/MC | P(full grid) CF/MC | uplift× |
|---|---|---|---|---|---|---|---|---|---|
| A_ultimate_fire_link_olvera_street | ✅ | 5×3 | +4 | 0.1 | 26.9/27.1 | 3.56/3.59 | 24.3/24.4 | 82.3%/83.6% | 2.56 |
| B_lock_it_link_eureka_reel_blast | ✅ | 5×4 | +3 | 0.12 | 31.2/31.3 | 2.96/2.97 | 22.6/22.6 | 97.9%/98.2% | 1.88 |
| C_ultimate_fire_link_power4_high_vol | ✅ | 4×4 | +2 | 0.18 | 22.3/22.3 | 2.00/2.00 | 15.4/15.7 | 99.6%/99.7% | 1.55 |
| D_ultimate_fire_link_china_street_low_vol | ✅ | 5×3 | +3 | 0.08 | 18.5/18.8 | 2.34/2.40 | 20.1/20.3 | 63.7%/67.3% | 2.08 |
| E_corner_single_extension_aggressive_threshold | ✅ | 3×3 | +1 | 0.1 | 5.2/5.2 | 0.14/0.16 | 9.3/9.4 | 14.4%/16.2% | 1.04 |
| F_corner_fixed_grid_no_extension | ✅ | 5×3 | +0 | 0.15 | 12.7/12.7 | 0.00/0.00 | 12.3/12.5 | 100.0%/100.0% | 1.00 |

## Compliance context

- **UKGC RTS 14** — grid-expansion feature mechanic disclosure (operator must show row-extension trigger thresholds + average grid-end state).
- **MGA PPD §11** — H&S trigger + dynamic-grid transparency.
- **eCOGRA Generic Slots Audit** — grid evolution audit trail per feature.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M3 gap — Ultimate Fire Link family (Olvera Street, China Street, Riverwalk, Boardwalk, Route 66, Power 4, Cash Falls, Explosion — 7+ variants),
Lock It Link Eureka Reel Blast (Bally) sa dynamite-scatter row-add trigger.