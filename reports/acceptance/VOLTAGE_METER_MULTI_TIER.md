# VOLTAGE_METER_MULTI_TIER — Voltage/XP Meter Multi-Tier Reward Acceptance

Generated: `2026-05-16T11:18:46.037Z`

## Headline

**6/6 configs PASS** at 300000 spins each = 1.80M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Voltage/XP Meter Multi-Tier Reward Levels" (Wave 150).

## Method

Closed-form K-tier voltage meter analyzer:
  - Per spin chain L ~ Geometric(1-p)
  - K tier thresholds T_1 < T_2 < ... < T_K
  - **P(L ≥ T_k) = p^{T_k}** strictly decreasing
  - **P(H = k) = p^{T_k} − p^{T_{k+1}}** difference of geometric tails
  - MODE 1 highest-only: E[R] = Σ_k R_k·(p^{T_k}−p^{T_{k+1}})
  - MODE 2 cumulative: E[R] = Σ_k R_k·p^{T_k} (direct sum)

MC: 300K spins per config, mulberry32 RNG, per-spin chain sampling.

## Configs

| Config | Pass | K | Mode | E[R] | P(no_tier) |
|---|---|---|---|---|---|
| A_hacksaw_stack_em_3tier_cumulative | ✅ | 3 | cumulative | 1.6388 | 83.36% |
| B_push_wild_swarm_4tier_highest_only | ✅ | 4 | highest-only | 3.9682 | 75.00% |
| C_netent_charged_5tier_deep_cumulative | ✅ | 5 | cumulative | 0.9498 | 64.00% |
| D_yggdrasil_vault_anubis_3tier_balanced | ✅ | 3 | highest-only | 0.2473 | 95.90% |
| E_corner_single_tier_T1 | ✅ | 1 | highest-only | 8.0000 | 60.00% |
| F_corner_rare_extreme_high_threshold | ✅ | 1 | highest-only | 0.0000 | 100.00% |

## Compliance context

- **UKGC RTS 14** — multi-tier reward frequency disclosure (per tier hit rate)
- **MGA PPD §11.f** — tier mechanic + reward mode transparency
- **eCOGRA Generic Slots Audit** — verifies per-tier hit rates match engine
- Industry use: Hacksaw Stack 'Em multi-tier boost levels, Push Wild Swarm
  power-up tiers, NetEnt Charged XP bar 3-tier reward, Yggdrasil Vault of
  Anubis multi-step charge, Inspired XP bar, Push Aztec Bonanza multi-tier.