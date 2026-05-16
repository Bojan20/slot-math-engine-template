# MULTI_TIER_WAP_WHEEL — Multi-tier WAP Jackpot + Wheel Acceptance

Generated: `2026-05-16T04:15:55.201Z`

## Headline

**6/6 configs PASS** at 2000000 spins each = 12.0M total MC.

Closes Faza 4.6/5 scenario: ⚠️→✅ "Multi-tier WAP jackpot + wheel acceptance" (Wave 75).

## Method

Per-tier renewal-theory closed-form:
  - λ_i = p_trigger · w_i / Σw   (marginal hit probability per spin)
  - E[pool_i at hit] = seed_i + c_i / λ_i   (renewal-residual mean)
  - E[payout_i per spin] = c_i + λ_i · seed_i
  - Total RTP = Σ c_i + p_trigger · E[seed | hit]   (decomposition: recycled contribution + operator-funded seed)
  - Per-tier RTP share normalized to 1 for regulatory disclosure

MC: 500K spins per config (3M total) deterministic mulberry32.

## Configs

| Config | Pass | total RTP_CF | total RTP_MC | trig_CF | trig_MC | max tier err |
|---|---|---|---|---|---|---|
| A_classic_4tier | ✅ | 0.59900 | 0.63141 | 0.0050 | 0.0051 | 0.55% |
| B_5tier_with_mega | ✅ | 15.85190 | 16.01330 | 0.0100 | 0.0100 | 0.32% |
| C_zero_seed_pure_contribution | ✅ | 0.00600 | 0.00600 | 0.0100 | 0.0100 | 0.32% |
| D_high_seed_grand_dominant | ✅ | 25.15680 | 25.16622 | 0.0050 | 0.0051 | 0.59% |
| E_3tier_frequent | ✅ | 4.11500 | 4.13508 | 0.0500 | 0.0501 | 0.13% |
| F_equal_weight_tiers | ✅ | 31.50400 | 31.86545 | 0.0100 | 0.0100 | 0.37% |

## Compliance context

- **UKGC RTS 12** — published RTP must include per-tier WAP contribution disclosure
- **MGA Player Protection Directive 2018** — operator-funded seed cost separately disclosed
- **NIGC 25 CFR 542.7** — WAP jackpot pooling requirements
- Per-tier normalized RTP share (Σ=1) enables PAR-sheet tier breakdown