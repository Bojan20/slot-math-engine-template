# MUST_HIT_BY_JACKPOT — Mystery Progressive Acceptance

Generated: `2026-05-16T04:15:52.933Z`

## Headline

**6/6 configs PASS** at 5000 cycles each.

Closes Faza 12 scenario: ⚠️→✅ "Must-Hit-By Jackpot" (Wave 71).

## Method

Closed-form: U ∼ Uniform[seed, cap]; spins-to-trigger N* = (U − seed)/c.
  - E[N*] = span / (2c)
  - Var[N*] = span² / (12 c²)
  - E[pool at trigger] = (seed + cap) / 2
  - Effective RTP per spin = c · (seed + cap) / (cap − seed)

MC: 5000 trigger cycles per config; deterministic mulberry32 PRNG.

## Configs

| Config | Pass | E[N*]_CF | E[N*]_MC | pool_CF | pool_MC | RTP_CF | RTP_MC |
|---|---|---|---|---|---|---|---|
| A_classic_500_5000 | ✅ | 225000 | 226322 | 2750.00 | 2763.21 | 0.012222 | 0.012209 |
| B_zero_seed | ✅ | 50000 | 50294 | 500.00 | 502.94 | 0.010000 | 0.010000 |
| C_high_seed | ✅ | 250000 | 251468 | 7500.00 | 7514.68 | 0.030000 | 0.029883 |
| D_wide_span | ✅ | 475000 | 477790 | 10500.00 | 10555.78 | 0.022105 | 0.022093 |
| E_narrow_span | ✅ | 1000 | 1006 | 150.00 | 150.29 | 0.150000 | 0.149342 |
| F_micro_contribution | ✅ | 450000 | 452643 | 550.00 | 552.64 | 0.001222 | 0.001221 |

## Compliance context

- **NIGC 25 CFR 542.7(c)** — must-hit-by jackpots: trigger deterministically before reaching cap
- **UKGC RTS 12** — published RTP must include progressive contribution
- Closed-form E[N*] and effective RTP enables exact PAR sheet disclosure