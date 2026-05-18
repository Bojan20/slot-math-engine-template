# COLOSSAL_REELS_WILD_TRANSFER — Colossal Reels Wild-Transfer Two-Grid Aggregator Acceptance (W184, 65. solver, L&W M7 P0 GAP CLOSURE)

Generated: `2026-05-18T00:11:21.115Z`

## Headline

**6/6 configs PASS** at 30000 MC spins each = 180K total spin sims.

Closes Faza 12 ext (post-W100): ✅ "Colossal Reels Wild-Transfer Two-Grid Aggregator" (Wave 184 — 65. closed-form solver, L&W M7 GAP CLOSED — Spartacus family + 50+ WMS land-based titles).

## Method

2-stage Binomial sa conditional coupling. Stage 1: K_main = # wild reels on main grid via per-reel-non-uniform DP O(N²). Stage 2: K_col | K_main ~ Binomial(K_main, q_t). Joint PMF eksplicitno enumerisana.
  - **E[K_col] = q_t · E[K_main]** (law of total expectation)
  - **Var[K_col] = q_t·(1−q_t)·E[K_main] + q_t²·Var[K_main]** (law of total variance)
  - **P(full wild both grids) = P(K_main=N) · q_t^N**
  - **E[Y] = Σ P(K_main=k) · [payoutMain[k] + Σ P(K_col=j|K_main=k) · (payoutCol[j] + jointBonus[k][j])]**

MC: per-spin per-reel Bernoulli(p_w_i) main wild + conditional Bernoulli(q_t) transfer, accumulate payout, count P(both ≥ 1).

## Configs — Colossal Reels Wild-Transfer operator disclosure table

| Config | Pass | q_t | E[K_main] CF/MC | E[K_col] CF/MC | P(both≥1) CF/MC | E[Y] CF/MC |
|---|---|---|---|---|---|---|
| A_spartacus_gladiator_of_rome_5reel_high_transfer | ✅ | 0.85 | 0.520/0.518 | 0.442/0.440 | 37.06%/36.73% | 0.2652/0.2517 |
| B_super_colossal_reels_full_transfer | ✅ | 1.00 | 0.780/0.778 | 0.780/0.778 | 57.20%/57.13% | 2.2655/2.0600 |
| C_call_to_arms_50_payline_low_transfer | ✅ | 0.70 | 0.420/0.418 | 0.294/0.292 | 26.15%/25.92% | 0.0662/0.0676 |
| D_wms_landbase_caesar_empire_uniform_high_density | ✅ | 0.80 | 1.000/0.999 | 0.800/0.799 | 58.18%/58.51% | 1.3782/1.2708 |
| E_corner_low_transfer_independent_split | ✅ | 0.05 | 0.600/0.597 | 0.030/0.028 | 2.96%/2.77% | 0.1744/0.1644 |
| F_corner_joint_bonus_full_wild_jackpot | ✅ | 0.90 | 0.500/0.496 | 0.450/0.446 | 37.60%/37.24% | 0.3207/0.2492 |

## Compliance context

- **UKGC RTS 14** — multi-grid feature disclosure.
- **MGA PPD §11** — coupled-grid mechanic transparency.
- **eCOGRA Generic Slots Audit** — joint-grid evaluation audit.
- **EU GA 2024** — cross-jurisdiction baseline.

Industry use: L&W M7 gap — WMS Spartacus Gladiator of Rome (2012, defining title 100 paylines 5×4+5×12), Super Colossal Reels (2019 full transfer), Call to Arms (2017 50 paylines variant), 50+ WMS land-based dependent titles (Caesar Empire, Forbidden Dragons, etc.).