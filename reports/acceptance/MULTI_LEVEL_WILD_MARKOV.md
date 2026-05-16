# MULTI_LEVEL_WILD_MARKOV — Multi-Level Wild Tier Markov Acceptance

Generated: `2026-05-16T08:34:25.913Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Multi-Level Wild Tier Markov" (Wave 132).

## Method

Closed-form 4-state Markov stationary:
  - States: {idle, basic, super, mega}
  - **π_basic = π_idle · p_land / (p_up1 + p_exp)**
  - **π_super = π_basic · p_up1 / (p_up2 + p_exp)**
  - **π_mega = π_super · p_up2 / p_exp**
  - Normalize: π_idle · (1 + r_basic + r_super + r_mega) = 1
  - **E[M per spin] = π_idle·1 + π_basic·M_b + π_super·M_s + π_mega·M_m**
  - **E[Y] = E[V]·E[M]** (cross-independence)

MC: 100K spins per config, mulberry32 RNG, state-walking sa transition Markov.

## Configs

| Config | Pass | E[M]_CF | π_mega | maxπAbs |
|---|---|---|---|---|
| A_netent_vikings_2tier | ✅ | 1.4571 | 0.000% | 0.10pp |
| B_push_mount_magmas_3tier_aggressive | ✅ | 2.2000 | 0.909% | 0.24pp |
| C_pragmatic_da_vinci_high_freq | ✅ | 1.3739 | 0.176% | 0.33pp |
| D_balanced_5_15_5_25 | ✅ | 1.6667 | 1.333% | 0.20pp |
| E_corner_no_upgrades | ✅ | 1.5000 | 0.000% | 0.18pp |
| F_high_persistence_low_expire | ✅ | 12.7778 | 22.222% | 0.41pp |

## Compliance context

- **UKGC RTS 14** — wild-tier variance + max-multiplier disclosure
- **MGA PPD §11.f** — tier-upgrade rate disclosure
- **eCOGRA Generic Slots Audit** — verifies stationary E[M], E[Y] match engine
- Industry use: NetEnt Vikings Berzerk (basic→super), Push Mount Magmas (3-tier),
  Pragmatic Da Vinci's Mystery, Quickspin Sakura Fortune.