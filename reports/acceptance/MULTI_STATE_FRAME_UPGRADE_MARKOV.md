# MULTI_STATE_FRAME_UPGRADE_MARKOV — Multi-State Frame Upgrade Markov Aggregator Acceptance (W183, 64. solver, L&W M2 P0 GAP CLOSURE)

Generated: `2026-05-18T00:00:06.173Z`

## Headline

**6/6 configs PASS** at 5000 MC features each = 30K total feature sims.

Closes Faza 12 ext (post-W100): ✅ "Multi-State Frame Upgrade Markov Aggregator" (Wave 183 — 64. closed-form solver, L&W M2 GAP CLOSED).

## Method

Per-cell K-state Markov chain on N×M grid sa explicit P^T computation. Aggregates:
  - **π_T = π_0 · P^T** per-cell state distribution after T spinova
  - **E[per-cell payout per spin] = dot(π_t, m)** time-averaged
  - **E[total payout] = N·M · Σ_{t=0..T-1} dot(π_t, m)**
  - **P(per-cell ≥ k_target) = Σ_{k ≥ k_target} π_T(k)**
  - **P(at least one cell reaches k_target) = 1 − (1−P_perCell)^(N·M)**
  - **Stationary π_∞**: left eigenvector via power iteration

MC: per-feature, sample initial state from π_0, advance T spinova sa cumulative transition probability, accumulate payout per spin from current state, count cells at terminal/target state.

## Configs — Multi-State Frame Upgrade Markov operator disclosure table

| Config | Pass | N×M | K | T | E[payout] CF/MC | P(≥1@tgt) CF/MC | E[#cells@tgt] CF/MC |
|---|---|---|---|---|---|---|---|
| A_huff_n_puff_original_3stage_straw_wood_brick | ✅ | 5×3 | 4 | 10 | 1666.9/1671.8 | 100.0%/100.0% | 10.31/10.36 |
| B_huff_n_more_puff_5state_extended | ✅ | 5×3 | 5 | 15 | 6106.8/6119.0 | 100.0%/100.0% | 14.28/14.28 |
| C_huff_n_even_more_puff_megahat_addon | ✅ | 5×4 | 4 | 20 | 7651.4/7637.6 | 100.0%/100.0% | 16.62/16.60 |
| D_huff_n_money_mansion_fast_advance | ✅ | 5×3 | 4 | 8 | 5917.0/5907.7 | 100.0%/100.0% | 14.83/14.82 |
| E_corner_3state_balanced_with_reset | ✅ | 4×4 | 3 | 12 | 1055.3/1054.1 | 100.0%/100.0% | 11.43/11.42 |
| F_corner_huff_xtra_puff_persistent_meter_high_state_payout | ✅ | 5×3 | 6 | 12 | 3477.1/3467.8 | 100.0%/100.0% | 12.09/12.08 |

## Compliance context

- **UKGC RTS 14** — frame-state mechanic disclosure (per-state hit frequency).
- **MGA PPD §11** — per-cell evolution transparency.
- **eCOGRA Generic Slots Audit** — Markov audit trail per cell.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M2 gap — Huff N' Puff family (original, More, Even More, Lots of, Xtra, Hard Hat Edition, Grand, Money Mansion — 8 titles).