# MEGA_SYMBOL_EXPANSION — Multi-Cell Expansion Aggregator Acceptance

Generated: `2026-05-16T07:46:20.825Z`

## Headline

**6/6 configs PASS** at 100000 spins each = 600K total MC.

Closes Faza 12 ext (post-W100): ✅ "Mega Symbol Multi-Cell Expansion Aggregator" (Wave 123).

## Method

Closed-form Wald-style sa S² area coverage:
  - Y = Σ_{i=1..K} S_i² · paytable[T_i]
  - K ⊥ S ⊥ T cross-independence
  - **E[Y] = E[K] · E[S²] · E[paytable[T]]**
  - **E[Y²] = E[K]·E[S⁴]·E[paytable²] + (E[K²]−E[K])·(E[S²]·E[paytable])²**
  - **Var[Y] = E[Y²] − E[Y]²**
  - probMaxConfig = P(K=K_max)·(P(S=max)·P(T=max))^K_max joint extreme

MC: 100K spins per config, mulberry32 RNG, per-drop K/S/T sampling.

## Configs

| Config | Pass | E[K] | E[S²] | E[Y]_CF | E[Y]_MC | rel | maxArea |
|---|---|---|---|---|---|---|---|
| A_sweet_bonanza_super_symbols | ✅ | 0.750 | 2.540 | 48.101 | 48.114 | 0.03% | 16 |
| B_razor_shark_jumbo_5x5_rare | ✅ | 0.050 | 2.880 | 29.952 | 27.197 | 9.20% | 25 |
| C_high_freq_small_supers | ✅ | 1.900 | 1.600 | 8.816 | 8.774 | 0.48% | 4 |
| D_heavy_tail_jackpot_giant | ✅ | 0.180 | 2.050 | 95.663 | 92.934 | 2.85% | 16 |
| E_single_size_single_target_corner | ✅ | 0.700 | 4.000 | 56.000 | 55.920 | 0.14% | 4 |
| F_zero_drop_corner | ✅ | 0.000 | 9.000 | 0.000 | 0.000 | 0.00% | 9 |

## Compliance context

- **UKGC RTS 14** — variance + tail-coverage disclosure (maxArea, probMaxConfig)
- **MGA PPD §11.f** — operator-facing super-symbol-rate disclosure
- **eCOGRA Generic Slots Audit** — verifies steady-state E[Y] / Var[Y]
- Industry use: Pragmatic Sweet Bonanza (super-symbols), Push Razor Shark (jumbo blocks),
  NetEnt Mega Joker, Slot Mountain Megaways, BTG Megaways multi-cell variants.