# TUMBLE_MULTIPLIER_CAP — Tumble Multiplier with Cap Acceptance

Generated: `2026-05-16T10:21:26.510Z`

## Headline

**6/6 configs PASS** at 200000 spins each = 1.20M total MC spins.

Closes Faza 12 ext (post-W100): ✅ "Tumble Multiplier with Cap" (Wave 138).

## Method

Closed-form cascade multiplier ladder + explicit M_max cap analyzer:
  - Chain length L ~ Geometric(1−p): E[L]=p/(1−p)
  - Multiplier ladder sa cap: M_k = min(base + (k−1)·step, M_max)
  - **k\* = ceil((M_max − base)/step) + 1** smallest k where ladder hits cap
  - **E[Y] = E[V] · (A + B)** decomposition:
    - A = Σ_{k=1..k\*-1} M_k·p^k (ramp)
    - B = M_max · p^k\* / (1−p) (saturated tail)

MC: 200K spins per config, mulberry32 RNG, per-cascade Bernoulli + cap-bounded multiplier walk.

## Configs

| Config | Pass | k* | E[Y] | E[L] | maxM_obs | M_max |
|---|---|---|---|---|---|---|
| A_gonzos_quest_5x_cap | ✅ | 5 | 5.0588 | 0.6667 | 5 | 5 |
| B_btg_bonanza_fs_10x_cap | ✅ | 10 | 9.4431 | 0.8182 | 10 | 10 |
| C_sweet_bonanza_xmas_100x_cap | ✅ | 50 | 75.0000 | 1.0000 | 40 | 100 |
| D_money_cart_4_20x_cap | ✅ | 5 | 16.0583 | 0.5385 | 20 | 20 |
| E_corner_no_cap_effect | ✅ | 1000000 | 1.3469 | 0.4286 | 11 | 1000000 |
| F_corner_constant_multiplier | ✅ | 1 | 9.2000 | 0.6667 | 3 | 3 |

## Compliance context

- **UKGC RTS 14** — multiplier ceiling disclosure (max-win cap visibility)
- **MGA PPD §11.f** — operator-facing cascade multiplier variance
- **eCOGRA Generic Slots Audit** — verifies maxM never exceeds declared M_max
- Industry use: NetEnt Gonzo's Quest (5×), BTG Bonanza (10×), Pragmatic Sweet
  Bonanza Xmas (100×), Push Money Cart 4 (20×), Hacksaw Tombstone R.I.P,
  Yggdrasil Vault of Anubis (5×) — cascade-with-ceiling family.