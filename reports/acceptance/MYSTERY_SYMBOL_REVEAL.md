# MYSTERY_SYMBOL_REVEAL — Mystery Symbol Reveal Aggregator Acceptance

Generated: `2026-05-16T07:11:24.118Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Mystery Symbol Reveal Aggregator" (Wave 116).

## Method

Closed-form Wald-style decomposition under K ⊥ S independence:
  - Y = K · paytable[S]
  - **E[Y] = E[K] · E[paytable[S]]**
  - **Var[Y] = E[K²]·E[paytable²] − E[K]²·E[paytable]²**
  - P(full grid + max symbol) = P(K=K_max) · P(S=max) joint

MC: 100K spins per config, mulberry32 RNG, per-spin K/S sampling.

## Configs

| Config | Pass | E[K] | E[Y]_CF | E[Y]_MC | rel | maxSym | P(jointMax) |
|---|---|---|---|---|---|---|---|
| A_pragmatic_big_bass_classic | ✅ | 1.370 | 24.660 | 24.585 | 0.30% | 2000 | 25.00ppm |
| B_wolf_gold_3tier_jackpot | ✅ | 1.100 | 106.150 | 106.396 | 0.23% | 1000 | 3000.00ppm |
| C_high_freq_low_value | ✅ | 2.350 | 3.995 | 3.999 | 0.09% | 5 | 5000.00ppm |
| D_rare_jackpot_heavy_tail | ✅ | 0.330 | 15.757 | 16.851 | 6.94% | 5000 | 50.00ppm |
| E_single_symbol_deterministic | ✅ | 1.600 | 16.000 | 16.095 | 0.59% | 10 | 200000.00ppm |
| F_zero_count_corner | ✅ | 0.000 | 0.000 | 0.000 | 0.00% | 1000 | 50000.00ppm |

## Compliance context

- **UKGC RTS 14** — variance + tail-probability disclosure (P(K=0), P(K=max), P(jointMax))
- **MGA PPD §11.f** — operator-facing reveal-rate disclosure
- **eCOGRA Generic Slots Audit** — verifies steady-state E[Y] / Var[Y]
- Industry use: Pragmatic Big Bass Bonanza family (Big Bass / Bigger Bass / Bass
  Boss), Wolf Gold (3-tier MMM jackpot), NetEnt Wild-O-Tron 3000, Yggdrasil Vault
  of Anubis, plus dozens of Pragmatic-licensed branded clones.