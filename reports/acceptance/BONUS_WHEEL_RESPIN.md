# BONUS_WHEEL_RESPIN — Wheel + Respin Markov Acceptance

Generated: `2026-05-16T06:13:21.624Z`

## Headline

**6/6 configs PASS** at 100000 episodes each = 600K total MC.

Closes Faza 4.6 extension: ✅ "Bonus Wheel + Respin Markov" (Wave 105).

## Method

Closed-form shifted-geometric + conditional segment distribution:
  - N ~ shifted-geometric: E[N]=1/(1-p_respin), Var[N]=p_respin/(1-p_respin)²
  - Conditional payout V (given terminate):
    - P(V=v_i) = p_i / (1-p_respin)
    - μ_V = Σ p_i·v_i / (1-p_respin)
    - σ²_V = E[V²] − μ²_V
  - Tail: P(N≥k) = p_respin^(k-1)

MC: 100K episodes per config, deterministic mulberry32 PRNG.

## Configs

| Config | Pass | E[V]_CF | E[V]_MC | rel | E[N]_CF | E[N]_MC | rel |
|---|---|---|---|---|---|---|---|
| A_netent_4tier_p30_respin | ✅ | 96.786 | 95.931 | 0.88% | 1.429 | 1.432 | 0.22% |
| B_pragmatic_low_respin | ✅ | 37.222 | 37.187 | 0.09% | 1.111 | 1.112 | 0.11% |
| C_high_respin_60pct | ✅ | 32.500 | 32.432 | 0.21% | 2.500 | 2.507 | 0.28% |
| D_p_respin_0_no_loop | ✅ | 28.500 | 28.451 | 0.17% | 1.000 | 1.000 | 0.00% |
| E_balanced_5tier_p25 | ✅ | 53.333 | 52.738 | 1.12% | 1.333 | 1.334 | 0.08% |
| F_extreme_long_tail_p75 | ✅ | 204.000 | 201.911 | 1.02% | 4.000 | 4.010 | 0.24% |

## Tail metrics (per config)

| Config | max V | P(hit max) | P(N≥2) | P(N≥5) | P(N≥10) |
|---|---|---|---|---|---|
| A_netent_4tier_p30_respin | 1000 | 7.143% | 30.00% | 0.8100% | 0.001968% |
| B_pragmatic_low_respin | 500 | 5.556% | 10.00% | 0.0100% | 0.000000% |
| C_high_respin_60pct | 100 | 25.000% | 60.00% | 12.9600% | 1.007770% |
| D_p_respin_0_no_loop | 100 | 20.000% | 0.00% | 0.0000% | 0.000000% |
| E_balanced_5tier_p25 | 500 | 6.667% | 25.00% | 0.3906% | 0.000381% |
| F_extreme_long_tail_p75 | 1000 | 20.000% | 75.00% | 31.6406% | 7.508469% |

## Compliance context

- **UKGC RTS 14** — variance disclosure for wheel features
- **MGA PPD §11.f** — max-payout tail-probability disclosure
- **eCOGRA Generic Slots Audit** — shifted-geometric chain auditor-verifiable
- Industry use: NetEnt wheel bonuses, Pragmatic Money Wheel, IGT Wheel of Fortune