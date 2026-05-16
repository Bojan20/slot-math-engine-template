# CASCADE_MULTIPLIER_PYRAMID — Cascade × Multiplier Ladder Acceptance

Generated: `2026-05-16T04:45:30.384Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 12 extension: ✅ "Cascade Sequential Multiplier Pyramid" (Wave 86).

## Method

Closed-form via geometric-sum interchange:
  - N ~ shifted-geometric: E[N]=1/(1-q), Var[N]=q/(1-q)²
  - E[Y] = μ_W · [Σ q^(k-1)·m_k + m_max·q^L/(1-q)]
  - Var[Y] via E[Y²] = σ²·E[Σm_k²] + μ²·E[S_N²]
  - Tail: P(N≥k) = q^(k-1), P(reach max) = q^(L-1)

MC: 100K episodes per config, deterministic mulberry32, exact 2-point per-step distribution.

## Configs

| Config | Pass | E[Y]_CF | E[Y]_MC | rel | E[N]_CF | E[N]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_sweet_bonanza_style | ✅ | 3.9077 | 3.8404 | 1.72% | 1.667 | 1.665 | 0.09% |
| B_sugar_rush_style | ✅ | 1.6956 | 1.6895 | 0.35% | 1.818 | 1.820 | 0.09% |
| C_no_continuation | ✅ | 6.0000 | 5.9998 | 0.00% | 1.000 | 1.000 | 0.00% |
| D_high_continuation_flat_ladder | ✅ | 3.3333 | 3.3295 | 0.11% | 3.333 | 3.332 | 0.04% |
| E_arithmetic_ladder | ✅ | 3.8750 | 3.8870 | 0.31% | 2.000 | 2.003 | 0.14% |
| F_long_tail_aggressive | ✅ | 8.0685 | 8.0677 | 0.01% | 5.000 | 5.002 | 0.04% |

## Tail metrics (per config)

| Config | E[final mult]_CF | P(N≥5) | P(N≥10) | P(reach max) | mega-hit μ_W·m_max·q^(L-1) | max obs N |
|---|---|---|---|---|---|---|
| A_sweet_bonanza_style | 2.345 | 2.5600% | 0.026214% | 1.0240% | 0.32768 | 13 |
| B_sugar_rush_style | 3.109 | 4.1006% | 0.075668% | 0.8304% | 0.15943 | 14 |
| C_no_continuation | 3.000 | 0.0000% | 0.000000% | 100.0000% | 6.00000 | 1 |
| D_high_continuation_flat_ladder | 2.000 | 24.0100% | 4.035361% | 24.0100% | 0.24010 | 30 |
| E_arithmetic_ladder | 3.875 | 6.2500% | 0.195313% | 6.2500% | 0.31250 | 16 |
| F_long_tail_aggressive | 4.034 | 40.9600% | 13.421773% | 32.7680% | 1.04858 | 49 |

## Compliance context

- **UKGC RTS 14** — variance disclosure required for cascade games
- **MGA PPD §11.f** — tail-probability disclosure for max-multiplier games
- **eCOGRA Generic Slots Audit** — closed-form variance + tail enables exact PAR sheet
- Industry use: Sweet Bonanza, Sugar Rush, Wanted Dead or a Wild cascade-multiplier games