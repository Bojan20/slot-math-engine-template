# BONUS_TRIGGER_WAIT_TIME — Bonus Trigger Wait Time Analyzer Acceptance

Generated: `2026-05-16T06:33:07.218Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 4.6 ext (post-W100): ✅ "Bonus Trigger Wait Time Analyzer" (Wave 110).

## Method

Closed-form shifted-geometric per feature i:
  - E[T_i] = 1 / p_i
  - Var[T_i] = (1 − p_i) / p_i²
  - Median_i = ⌈log(0.5) / log(1 − p_i)⌉
  - Percentile_q(i) = ⌈log(1 − q) / log(1 − p_i)⌉

Any-feature combined:
  - p_any = 1 − Π (1 − p_i)
  - E[T_any] = 1 / p_any
  - Var[T_any] = (1 − p_any) / p_any²

Aggregate rate:
  - E[features triggered per spin] = Σ p_i
  - P(multiple features per spin) = 1 − P(0) − P(exactly 1)

MC: 100K episodes per config, mulberry32 RNG, run until ALL features trigger,
per-feature first-hit wait time + any-feature first-hit wait time recorded.

## Configs

| Config | Pass | E[T_any]_CF | E[T_any]_MC | rel | maxPerFeat |
|---|---|---|---|---|---|
| A_typical_slot_3features | ✅ | 80.17 | 79.89 | 0.35% | 0.43% |
| B_high_freq_single_feature | ✅ | 50.00 | 49.93 | 0.13% | 0.13% |
| C_rare_jackpot_only | ✅ | 10000.00 | 9959.25 | 0.41% | 0.41% |
| D_5feature_clustered | ✅ | 25.39 | 25.34 | 0.18% | 0.67% |
| E_two_feature_wide_spread | ✅ | 49.51 | 49.38 | 0.26% | 0.30% |
| F_deterministic_corner | ✅ | 2.00 | 2.00 | 0.17% | 0.17% |

## Per-feature disclosure (Config A — typical slot)

| Feature | p | E[T] | Median | P95 | P99 |
|---|---|---|---|---|---|
| free_spins | 0.01 | 100.0 | 69 | 299 | 459 |
| wheel_bonus | 0.002 | 500.0 | 347 | 1497 | 2301 |
| pick_bonus | 0.0005 | 2000.0 | 1386 | 5990 | 9209 |

## Compliance context

- **UKGC RTS 14** — wait-time disclosure: median + 95th percentile per feature MUST
  match engine math (this report = artefakt koji se predaje testing house).
- **MGA PPD §11.f** — operator-facing trigger frequency for player protection.
- **eCOGRA Generic Slots Audit** — verifies disclosure matches engine math.
- Industry use: any commercial slot with bonus-trigger frequency disclosure (NetEnt /
  Pragmatic / Microgaming / Play'n GO marketing claims "~1 in 100 spins" must match
  median + tail percentiles printed in PAR sheet).