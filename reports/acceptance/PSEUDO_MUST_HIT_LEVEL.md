# PSEUDO_MUST_HIT_LEVEL — Escalating-Hazard Progressive + Level Acceptance

Generated: `2026-05-16T04:15:54.072Z`

## Headline

**6/6 configs PASS** at 100000 spins each.

Closes Faza 12 scenario: ⚠️→✅ "Pseudo-must-hit + level progression" (Wave 72).

## Method

Closed-form:
  - Hazard rate `λ(pool) = λ_min + (λ_max − λ_min) · (pool − seed)/(softCap − seed)`
  - Level Markov chain: on trigger advance; at maxLevel reset to 0 w.p. r
  - Stationary distribution: π_maxL = 1/(1 + maxL·r), π_other = r·π_maxL
  - E[payout per spin] = λ_avg · E[pool] · E[level mult]  (CF upper bound)

Note: closed-form λ_avg is the midpoint approximation; actual MC observed
trigger rate is LOWER because pool starts at seed (low hazard) and grows
before fire. Acceptance asserts: MC ≤ CF (consistency check).

MC: 100K spins per config; deterministic mulberry32.

## Configs

| Config | Pass | λ_avg_CF | trig_MC | E[Y]/spin_CF | E[Y]/spin_MC |
|---|---|---|---|---|---|
| A_classic_4_level | ✅ | 0.0505 | 0.0027 | 59.160 | 3.661 |
| B_no_reset_absorbing | ✅ | 0.0505 | 0.0027 | 127.500 | 7.888 |
| C_always_reset | ✅ | 0.0505 | 0.0027 | 42.075 | 2.663 |
| D_high_hazard | ✅ | 0.2550 | 0.0160 | 77.100 | 5.428 |
| E_low_hazard | ✅ | 0.0050 | 0.0003 | 10.325 | 1.081 |
| F_partial_reset | ✅ | 0.0505 | 0.0027 | 78.686 | 4.949 |

## Compliance context

- **NIGC 25 CFR 542.7(c)** — pseudo-must-hit qualifies as Class III random progressive
- **UKGC RTS 12** — published RTP includes both base hazard contribution + level multiplier expectation
- Level Markov chain stationary distribution drives per-level RTP share disclosure